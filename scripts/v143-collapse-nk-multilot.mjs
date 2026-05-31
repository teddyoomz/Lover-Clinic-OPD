#!/usr/bin/env node
// V143-bis Rule M — collapse นครราชสีมา products that have >1 stock lot/batch to a
// SINGLE lot. After the v143 reset every NK batch is {total:0, remaining:0, active},
// so keeping any one + deleting the rest loses NO stock. User: "เคลียพวกที่มีมากกว่า
// 1 lot ด้วย" (1 product = 1 lot, all at 0). Two-phase (dry-run default; --apply).
//
// Run (DRY-RUN): node scripts/v143-collapse-nk-multilot.mjs
// Run (APPLY):   node scripts/v143-collapse-nk-multilot.mjs --apply
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a; }, {});
if (getApps().length === 0) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b', clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n') }), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const col = (c) => db.collection(`${BASE}/${c}`);
async function main() {
  console.log(`\n===== V143-bis NK collapse multi-lot → 1 lot — ${APPLY ? '★ APPLY ★' : 'DRY-RUN'} =====\n`);
  const branches = await col('be_branches').get();
  const nk = branches.docs.find(d => String(d.data()?.branchName || d.data()?.name || '').includes('นครราชสีมา'));
  if (!nk) { console.log('นครราชสีมา NOT FOUND'); return; }
  const BR = nk.id; console.log(`branch = ${BR}\n`);
  const batchesSnap = await col('be_stock_batches').get();
  const nkBatches = batchesSnap.docs.filter(d => { const v = d.data(); return v.branchId === BR || v.locationId === BR; });
  const byProd = new Map();
  for (const d of nkBatches) { const k = String(d.data()?.productId || ''); if (!byProd.has(k)) byProd.set(k, []); byProd.get(k).push(d); }
  const toDelete = [];
  const multi = [];
  for (const [pid, docs] of byProd) {
    if (docs.length > 1) {
      // keep the first (all are 0/0 active post-reset), delete the rest
      const extras = docs.slice(1);
      multi.push({ pid, name: docs[0].data()?.productName, lots: docs.length, deleting: extras.length });
      toDelete.push(...extras);
    }
  }
  console.log(`NK batches=${nkBatches.length} · products=${byProd.size}`);
  console.log(`products with >1 lot: ${multi.length} → delete ${toDelete.length} extra lots (keep 1 each)\n`);
  for (const m of multi) console.log(`  ${m.name} (pid=${m.pid}): ${m.lots} lots → keep 1, delete ${m.deleting}`);
  console.log(`\nresult after: ${byProd.size} products = ${byProd.size} batches (1 lot each, all 0/0)`);

  if (!APPLY) { console.log('\n(DRY-RUN — no writes. Re-run with --apply.)\n===== END =====\n'); return; }
  let delN = 0;
  for (let i = 0; i < toDelete.length; i += 400) { const wb = db.batch(); for (const d of toDelete.slice(i, i + 400)) wb.delete(d.ref); await wb.commit(); delN += toDelete.slice(i, i + 400).length; }
  const auditId = `v143-bis-nk-collapse-multilot-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await col('be_admin_audit').doc(auditId).set({ phase: 'v143-bis-nk-collapse-multilot', branchId: BR, extraLotsDeleted: delN, multiLotProducts: multi, appliedAt: FieldValue.serverTimestamp() });
  console.log(`\n★ APPLIED: ${delN} extra lots deleted · audit ${auditId}`);
  console.log('===== END (applied) =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
