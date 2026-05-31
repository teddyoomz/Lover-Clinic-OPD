#!/usr/bin/env node
// V143-quater Rule M — manual/immediate stock LOT cleanup (the cron's on-demand twin).
// Per (product × location): keep live lots + ≤1 zero placeholder, delete redundant
// zero lots so depleted lots can't accumulate. DELETE-ONLY. Two-phase.
//
// DRY-RUN (all branches): node scripts/stock-lot-cleanup.mjs
// DRY-RUN (one branch):   node scripts/stock-lot-cleanup.mjs --branch BR-xxxx
// APPLY:                  node scripts/stock-lot-cleanup.mjs --apply [--branch BR-xxxx]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { planLotCleanup } from '../src/lib/stockLotCleanupCore.js';
const APPLY = process.argv.includes('--apply');
const bIdx = process.argv.indexOf('--branch');
const ONLY_BRANCH = bIdx >= 0 ? process.argv[bIdx + 1] : null;
const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a; }, {});
if (getApps().length === 0) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b', clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n') }), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const col = (c) => db.collection(`${BASE}/${c}`);
async function main() {
  console.log(`\n===== V143-quater stock lot-cleanup — ${APPLY ? '★ APPLY ★' : 'DRY-RUN'}${ONLY_BRANCH ? ` (branch ${ONLY_BRANCH})` : ' (ALL)'} =====\n`);
  const snap = await col('be_stock_batches').get();
  let batches = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  if (ONLY_BRANCH) batches = batches.filter(b => b.branchId === ONLY_BRANCH || b.locationId === ONLY_BRANCH);
  const { deleteIds, perGroup, keptPlaceholders } = planLotCleanup(batches);
  console.log(`scanned batches: ${batches.length}`);
  console.log(`groups to clean: ${Object.keys(perGroup).length} · redundant zero lots to delete: ${deleteIds.length} · placeholders kept: ${keptPlaceholders}\n`);
  for (const [k, g] of Object.entries(perGroup)) console.log(`  ${g.productName} [${k}]: live=${g.live} zero=${g.zero} → delete ${g.deleted}`);
  if (!APPLY) { console.log('\n(DRY-RUN — no writes. Re-run with --apply.)\n===== END =====\n'); return; }
  let delN = 0;
  for (let i = 0; i < deleteIds.length; i += 400) { const wb = db.batch(); for (const id of deleteIds.slice(i, i + 400)) wb.delete(col('be_stock_batches').doc(id)); await wb.commit(); delN += deleteIds.slice(i, i + 400).length; }
  const auditId = `v143-quater-stock-lot-cleanup-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await col('be_admin_audit').doc(auditId).set({ op: 'v143-quater-stock-lot-cleanup', branchFilter: ONLY_BRANCH || 'ALL', scanned: batches.length, groupsCleaned: Object.keys(perGroup).length, lotsDeleted: delN, keptPlaceholders, appliedAt: FieldValue.serverTimestamp() });
  console.log(`\n★ APPLIED: ${delN} redundant zero lots deleted · audit ${auditId}`);
  console.log('===== END (applied) =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
