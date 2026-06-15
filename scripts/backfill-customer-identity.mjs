// Rule M — seed be_customer_identity claims for existing customers + REPORT the
// existing duplicates the user has been deleting by hand.
//   - For each customer with a national-id/passport, deriveClaimKey() → group.
//   - Per identity: claim → EARLIEST createdAt (canonical owner); the rest →
//     linkedCustomerIds (so the new addCustomer guard detects future dups + the
//     UI dup-report has the full set).
//   - Denormalize _identityClaimKey on every customer with a key.
//   - Idempotent: re-run with --apply yields 0 writes.
// Run AFTER deploying the be_customer_identity firestore.rules (the claim docs
// must be writable + the enforcement live so existing dups are caught going fwd).
// Usage: node scripts/backfill-customer-identity.mjs [--apply]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { deriveClaimKey } from '../src/lib/customerIdentity.js';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const data = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const ms = (v) => { if (!v) return Number.MAX_SAFE_INTEGER; if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t; } if (v.toMillis) return v.toMillis(); if (typeof v === 'number') return v; return Number.MAX_SAFE_INTEGER; };

async function main() {
  console.log(`═══ backfill be_customer_identity — ${APPLY ? 'APPLY' : 'DRY-RUN'} ═══`);
  const snap = await data().collection('be_customers').get();
  // claimKey → [{ id, createdMs }]
  const groups = new Map();
  let withKey = 0, noKey = 0;
  for (const d of snap.docs) {
    const c = d.data();
    const key = deriveClaimKey(c.citizen_id, c.passport_id);
    if (!key) { noKey++; continue; }
    withKey++;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: d.id, createdMs: ms(c.createdAt || c.clonedAt), ref: d.ref, hasDenorm: c._identityClaimKey === key });
  }

  let claimsToWrite = 0, denormToStamp = 0, dupIdentities = 0, dupCustomers = 0, claimsWritten = 0, denormWritten = 0;
  const dupReport = [];
  for (const [key, members] of groups.entries()) {
    members.sort((a, b) => a.createdMs - b.createdMs);
    const owner = members[0].id;
    const linked = members.slice(1).map((m) => m.id);
    if (linked.length > 0) { dupIdentities++; dupCustomers += linked.length; dupReport.push(`${key}  →  owner ${owner}  +  dups [${linked.join(', ')}]`); }

    const claimRef = data().collection('be_customer_identity').doc(key);
    const existing = await claimRef.get();
    const want = { customerId: owner, linkedCustomerIds: linked };
    const have = existing.exists ? { customerId: existing.data().customerId, linkedCustomerIds: existing.data().linkedCustomerIds || [] } : null;
    const claimMatches = have && have.customerId === want.customerId && JSON.stringify([...have.linkedCustomerIds].sort()) === JSON.stringify([...want.linkedCustomerIds].sort());
    if (!claimMatches) {
      claimsToWrite++;
      if (APPLY) {
        await claimRef.set({ customerId: owner, linkedCustomerIds: linked, claimedAt: existing.exists ? (existing.data().claimedAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(), claimedBy: 'backfill', _backfilledAt: FieldValue.serverTimestamp() }, { merge: true });
        claimsWritten++;
      }
    }
    for (const m of members) {
      if (!m.hasDenorm) {
        denormToStamp++;
        if (APPLY) { await m.ref.update({ _identityClaimKey: key }); denormWritten++; }
      }
    }
  }

  console.log(`scanned ${snap.size} | with-identity ${withKey} | walk-in(no-key) ${noKey}`);
  console.log(`distinct identities ${groups.size} | claims to write ${claimsToWrite} | denorm to stamp ${denormToStamp}`);
  console.log(`\n⚠ EXISTING DUPLICATES: ${dupIdentities} identities shared by ${dupIdentities + dupCustomers} customers (${dupCustomers} extra docs to review/merge/delete):`);
  dupReport.slice(0, 50).forEach((s) => console.log('   ', s));
  if (dupReport.length > 50) console.log(`    … and ${dupReport.length - 50} more`);

  if (APPLY) {
    const auditId = `backfill-customer-identity-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await data().collection('be_admin_audit').doc(auditId).set({ op: 'backfill-customer-identity', scanned: snap.size, withKey, noKey, distinctIdentities: groups.size, claimsWritten, denormWritten, dupIdentities, dupCustomers, dupReport, appliedAt: FieldValue.serverTimestamp() });
    console.log('\naudit:', 'be_admin_audit/' + auditId, `| claims written ${claimsWritten} | denorm written ${denormWritten}`);
  } else {
    console.log('\n(dry-run — re-run with --apply to seed claims + stamp denorm)');
  }
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
