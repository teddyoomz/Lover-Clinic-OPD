#!/usr/bin/env node
// Rule R diag (READ-ONLY) — confirm how REAL prod be_sales store the actual-paid
// amount, to lock resolveSalePaidAmount's fallback order (spec 2026-05-31, Q1=A).
// Candidate formula (inline here; will become src/lib/financeUtils.resolveSalePaidAmount):
//   paid = Σ payment.channels[].amount  (round 2dp)  ||  totalPaidAmount  ||  0
// Reports: channels presence/sum vs netTotal vs totalPaidAmount + payment.status +
// source, so we can see paid/unpaid/split/OPD/exchange/legacy shapes for real.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveSalePaidAmount } from '../src/lib/financeUtils.js'; // SHIPPED helper (Rule Q L2)

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a;
}, {});
if (getApps().length === 0) initializeApp({ credential: cert({
  projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
}), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const LIMIT = Number(process.argv[2] || 30);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function channelsSum(sale) {
  const ch = sale?.payment?.channels;
  if (!Array.isArray(ch) || ch.length === 0) return null; // null = no channels array
  return round2(ch.reduce((s, c) => s + (parseFloat(c?.amount) || 0), 0));
}

async function main() {
  console.log(`\n===== DIAG: be_sales actual-paid shape on ${LIMIT} recent sales =====\n`);
  let snap;
  try { snap = await db.collection(`${BASE}/be_sales`).orderBy('createdAt', 'desc').limit(LIMIT).get(); }
  catch (e) { console.log(`(orderBy createdAt failed: ${e.message}; unordered)`); snap = await db.collection(`${BASE}/be_sales`).limit(LIMIT).get(); }

  let hasCh = 0, noCh = 0, hasTPA = 0, chMatchTPA = 0, chMismatchTPA = 0, fallbackUsed = 0, neitherField = 0, helperMismatch = 0;
  const sources = {};
  for (const d of snap.docs) {
    const s = d.data();
    const net = round2(s.billing?.netTotal ?? s.netTotal);
    const cs = channelsSum(s);                          // null if no channels
    const tpa = (s.totalPaidAmount != null && Number.isFinite(Number(s.totalPaidAmount))) ? round2(s.totalPaidAmount) : null;
    const paid = cs != null ? cs : (tpa != null ? tpa : 0);   // inline candidate
    const helperPaid = resolveSalePaidAmount(s);              // SHIPPED helper
    if (Math.abs(helperPaid - paid) >= 0.01) helperMismatch++;
    if (cs != null) hasCh++; else noCh++;
    if (tpa != null) hasTPA++;
    if (cs != null && tpa != null) { if (Math.abs(cs - tpa) < 0.01) chMatchTPA++; else chMismatchTPA++; }
    if (cs == null && tpa != null) fallbackUsed++;
    if (cs == null && tpa == null) neitherField++;
    sources[s.source || 'form'] = (sources[s.source || 'form'] || 0) + 1;
    const cls = paid + 0.01 >= net ? 'FULL ' : (paid > 0 ? 'PART ' : 'ZERO ');
    const flag = (cs != null && tpa != null && Math.abs(cs - tpa) >= 0.01) ? '  ⚠CH≠TPA' : (cs == null && tpa != null ? '  ←fallbackTPA' : (cs == null && tpa == null && net > 0 ? '  ⚠no-paid-field' : ''));
    console.log(`  ${(s.saleId||d.id).padEnd(20)} ${cls} net=${String(net).padStart(9)} paid=${String(paid).padStart(9)}  ch=${cs==null?'—':String(cs).padStart(9)} tpa=${tpa==null?'—':String(tpa).padStart(9)}  payStatus=${(s.payment?.status||'-').padEnd(7)} src=${s.source||'form'}${flag}`);
  }
  console.log(`\n── of ${snap.size}: hasChannels=${hasCh}  noChannels=${noCh}  hasTotalPaidAmount=${hasTPA}`);
  console.log(`── channels vs totalPaidAmount (both present): match=${chMatchTPA}  MISMATCH=${chMismatchTPA}`);
  console.log(`── fallback-to-TPA used (no channels but TPA present)=${fallbackUsed}  ⚠neither-field(net>0 → would show 0)=${neitherField}`);
  console.log(`── Rule Q L2: SHIPPED resolveSalePaidAmount vs real-prod inline → mismatch=${helperMismatch}  (0 = helper == real paid)`);
  console.log(`── sources:`, sources);
  console.log('\n===== END =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
