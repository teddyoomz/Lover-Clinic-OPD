#!/usr/bin/env node
// ─── Phase 24.0-vicies-novies-decies — backfill zombie branchId (V39) ──────
//
// User report 2026-05-07: "นำเข้าสินค้า, คอร์ส, โปรโมชั่น จากหน้า tab=masterdata
// เข้าสาขาพระราม 3 ไม่ได้ แต่ใน ui ขึ้นว่าสำเร็จตามภาพ".
//
// Diag (scripts/diag-migrate-branch-stamping.mjs) found:
//   • be_promotions:    2 zombies (no branchId)  ← user's "นำเข้า 2 รายการ"
//   • be_products:    303 zombies                 ← user's "นำเข้า 303 รายการ"
//   • be_courses:     174 zombies                 ← user's "นำเข้า 174 รายการ"
//   • be_coupons / be_vouchers / be_df_staff_rates: 0 (preventive coverage)
//
// All zombies have updatedAt = 2026-05-06T20:57:xx (PRE-octies + PRE-V39)
// → product of pre-fix migrate runs that didn't stamp branchId.
//
// V39 PART A patched the migrate fns going forward; THIS script backfills
// the existing zombies with branchId = TARGET (default พระราม 3 per user
// IMPORT_TARGET_BRANCH_ID + current selected-branch).
//
// Safety: skip-already-canonical (any doc with non-empty branchId), no
// auto-overwrite. Idempotent + audit doc + forensic-trail.
//
// Two-phase: dry-run by default, --apply commits.
//
// Run via:
//   node scripts/phase-24-0-vicies-novies-decies-backfill-zombie-branchid.mjs           (dry-run)
//   node scripts/phase-24-0-vicies-novies-decies-backfill-zombie-branchid.mjs --apply   (commit)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const envText = readFileSync(envFile, 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const AUDIT_COLLECTION = `${BASE_PATH}/be_admin_audit`;

// Branch-scoped collections per BSA + V39 audit. Matches dryrun report.
const TARGETS = Object.freeze([
  'be_promotions',
  'be_coupons',
  'be_vouchers',
  'be_products',
  'be_courses',
  'be_product_groups',
  'be_product_units',     // = be_product_unit_groups in some accessors; we track via canonical name
  'be_medical_instruments',
  'be_holidays',
  'be_df_groups',
  'be_df_staff_rates',
]);

const apply = process.argv.includes('--apply');
const targetBranchOverride = (() => {
  const idx = process.argv.indexOf('--branch-id');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!clientEmail || !privateKey) {
    console.error('Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY in env');
    process.exit(1);
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

export function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

/**
 * Decision helper — pure, exported for tests. Given a doc's stored branchId,
 * decide what to do. Skip-already-canonical preserves existing stamps;
 * skip-mismatch never auto-overwrites cross-branch FK; backfill-empty stamps
 * the target branch.
 */
export function decideZombieBackfill({ storedBranchId, targetBranchId }) {
  if (!targetBranchId || typeof targetBranchId !== 'string') {
    return { action: 'skip', reason: 'invalid-target' };
  }
  const stored = typeof storedBranchId === 'string' ? storedBranchId.trim() : '';
  if (!stored) return { action: 'backfill' };
  if (stored === targetBranchId) return { action: 'skip', reason: 'already-canonical' };
  return { action: 'skip', reason: 'mismatch', stored };
}

async function resolveTargetBranch() {
  if (targetBranchOverride) return { id: targetBranchOverride, name: '(override)' };
  // Default: match IMPORT_TARGET in current backendClient (Phase 24.0-vicies-
  // novies-sexies set to พระราม 3). Resolve by name from be_branches.
  const branchSnap = await db.collection(`${BASE_PATH}/be_branches`).get();
  for (const doc of branchSnap.docs) {
    const data = doc.data();
    const name = data.branchName || data.name || '';
    if (name.includes('พระราม')) return { id: doc.id, name };
  }
  throw new Error('Cannot resolve target branch (no be_branches doc with name "พระราม"). Pass --branch-id explicitly.');
}

async function processCollection(collection, targetBranchId) {
  const snap = await db.collection(`${BASE_PATH}/${collection}`).get();
  const counts = { scanned: snap.size, backfill: 0, skipAlreadyCanonical: 0, skipMismatch: 0, skipInvalid: 0 };
  const targets = [];
  const mismatches = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const decision = decideZombieBackfill({ storedBranchId: data.branchId, targetBranchId });
    if (decision.action === 'backfill') {
      counts.backfill++;
      targets.push({ docId: doc.id, name: data.productName || data.courseName || data.promotion_name || data.coupon_name || data.voucher_name || data.staffName || data.name || '?' });
    } else if (decision.reason === 'already-canonical') {
      counts.skipAlreadyCanonical++;
    } else if (decision.reason === 'mismatch') {
      counts.skipMismatch++;
      mismatches.push({ docId: doc.id, stored: decision.stored });
    } else {
      counts.skipInvalid++;
    }
  }

  if (apply && targets.length > 0) {
    let written = 0;
    for (let i = 0; i < targets.length; i += 400) {
      const slice = targets.slice(i, i + 400);
      const batch = db.batch();
      for (const t of slice) {
        const ref = db.collection(`${BASE_PATH}/${collection}`).doc(t.docId);
        batch.update(ref, {
          branchId: targetBranchId,
          _branchIdBackfilledAt: FieldValue.serverTimestamp(),
          _branchIdBackfilledBy: 'phase-24-0-vicies-novies-decies-V39',
          _branchIdBackfilledFrom: '(empty)',
        });
      }
      await batch.commit();
      written += slice.length;
    }
    counts.written = written;
  }

  return { collection, counts, targets, mismatches };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Phase 24.0-vicies-novies-decies — backfill zombie branchId (V39)');
  console.log(`  Mode: ${apply ? '🔥 APPLY' : '🔍 DRY-RUN'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const target = await resolveTargetBranch();
  console.log(`Target branch: ${target.name} (${target.id})\n`);

  const results = [];
  let totalBackfill = 0;
  let totalWritten = 0;

  for (const col of TARGETS) {
    const result = await processCollection(col, target.id);
    results.push(result);
    totalBackfill += result.counts.backfill;
    totalWritten += (result.counts.written || 0);

    const c = result.counts;
    const mode = apply ? `[wrote ${c.written || 0}]` : '[dry-run]';
    console.log(`▸ ${col.padEnd(28)}  scanned=${c.scanned}  backfill=${c.backfill}  alreadyCanonical=${c.skipAlreadyCanonical}  mismatch=${c.skipMismatch}  ${mode}`);
    if (result.mismatches.length > 0) {
      console.log(`     ⚠ Mismatch (NOT auto-touched): ${result.mismatches.length} docs`);
      for (const m of result.mismatches.slice(0, 5)) {
        console.log(`        docId="${m.docId}" stored=${JSON.stringify(m.stored)}`);
      }
    }
    if (result.targets.length > 0 && result.targets.length <= 10) {
      for (const t of result.targets) {
        console.log(`     • docId="${t.docId}" name="${t.name}"`);
      }
    } else if (result.targets.length > 10) {
      console.log(`     (${result.targets.length} backfill targets — sample 5):`);
      for (const t of result.targets.slice(0, 5)) {
        console.log(`     • docId="${t.docId}" name="${t.name}"`);
      }
    }
  }

  console.log(`\nTotal backfill: ${totalBackfill}${apply ? ` (wrote ${totalWritten})` : ''}`);

  if (apply) {
    const auditId = `phase-24-0-vicies-novies-decies-backfill-zombie-branchid-${Date.now()}-${randHex()}`;
    await db.collection(AUDIT_COLLECTION).doc(auditId).set({
      phase: 'phase-24-0-vicies-novies-decies',
      op: 'backfill-zombie-branchid',
      v39: true,
      targetBranchId: target.id,
      targetBranchName: target.name,
      results: Object.fromEntries(results.map((r) => [r.collection, r.counts])),
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(`\n📝 Audit doc: ${AUDIT_COLLECTION}/${auditId}`);
  }

  console.log(`\n═══ Done — ${apply ? 'APPLIED' : 'DRY-RUN ONLY'} (re-run with --apply) ═══\n`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
}
