#!/usr/bin/env node
// Rule R diag (READ-ONLY) — นครราชสีมา stock state.
// Serves: (1) the disappearing-product bug (depleted-at-0 batches excluded by
// listStockBatches({status:'active'}) → product vanishes from ยอดคงเหลือ), and
// (2) the dry-run scope for the "reset all to 0" data op.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a; }, {});
if (getApps().length === 0) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b', clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n') }), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const col = (c) => db.collection(`${BASE}/${c}`);
async function main() {
  console.log('\n===== นครราชสีมา stock state (READ-ONLY) =====\n');
  // resolve branch
  const branches = await col('be_branches').get();
  const nk = branches.docs.find(d => String(d.data()?.branchName || '').includes('นครราชสีมา') || String(d.data()?.name || '').includes('นครราชสีมา'));
  if (!nk) { console.log('นครราชสีมา branch NOT FOUND'); console.log('branches:', branches.docs.map(d => `${d.id}=${d.data()?.branchName || d.data()?.name}`)); return; }
  const BR = nk.id;
  console.log(`branch นครราชสีมา = ${BR}\n`);

  // products that were ever keyed into stock (trackStock)
  const products = await col('be_products').get();
  const trackProducts = products.docs.filter(d => d.data()?.stockConfig?.trackStock === true || d.data()?.branchId === BR);
  console.log(`be_products total=${products.docs.length} · trackStock=true OR branchId=NK → ${trackProducts.length}`);

  // batches for this branch
  const batches = await col('be_stock_batches').get();
  const nkBatches = batches.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.branchId === BR || b.locationId === BR);
  console.log(`\nbe_stock_batches for NK: ${nkBatches.length}`);
  // classify per product
  const byProd = new Map();
  for (const b of nkBatches) { const k = String(b.productId || ''); if (!byProd.has(k)) byProd.set(k, { name: b.productName, batches: [] }); byProd.get(k).batches.push(b); }
  let activePos = 0, activeZero = 0, depletedZero = 0, neg = 0, otherStatus = 0;
  const disappearing = [];
  for (const [pid, info] of byProd) {
    const totRem = info.batches.reduce((s, b) => s + (Number(b.qty?.remaining) || 0), 0);
    const statuses = info.batches.map(b => b.status);
    const anyActive = info.batches.some(b => b.status === 'active');
    if (totRem < 0) neg++;
    else if (totRem > 0) activePos++;
    else { // totRem === 0
      if (anyActive) activeZero++;
      else { depletedZero++; disappearing.push({ pid, name: info.name, statuses, rem: totRem }); }
    }
    for (const b of info.batches) {
      const r = Number(b.qty?.remaining) || 0;
      if (b.status === 'active' && r > 0) {} else if (b.status === 'active' && r === 0) {} else if (b.status === 'active' && r < 0) {} else if (b.status === 'depleted') {} else otherStatus++;
    }
  }
  console.log(`  products w/ batches: ${byProd.size}`);
  console.log(`  → active positive (>0): ${activePos}`);
  console.log(`  → active zero (=0, SHOWS): ${activeZero}`);
  console.log(`  → DEPLETED zero (=0, ★HIDDEN from ยอดคงเหลือ★): ${depletedZero}`);
  console.log(`  → negative (<0, shows ติดลบ): ${neg}`);
  if (disappearing.length) { console.log('\n  ★ DISAPPEARING products (all batches depleted/non-active at 0):'); for (const d of disappearing) console.log(`     ${d.name} (pid=${d.pid}) statuses=[${d.statuses.join(',')}]`); }

  // products with trackStock but NO batch at all (fully gone / never imported)
  const batchProductIds = new Set([...byProd.keys()]);
  const trackNoBatch = trackProducts.filter(p => !batchProductIds.has(String(p.id)) && !batchProductIds.has(String(p.data()?.productId)));
  console.log(`\n  trackStock products with NO batch for NK: ${trackNoBatch.length}`);

  // status histogram of NK batches
  const statusHist = {};
  for (const b of nkBatches) { const s = `${b.status}|rem${(Number(b.qty?.remaining) || 0) === 0 ? '=0' : (Number(b.qty?.remaining) || 0) > 0 ? '>0' : '<0'}`; statusHist[s] = (statusHist[s] || 0) + 1; }
  console.log('\n  batch status × remaining-sign histogram:'); for (const [k, v] of Object.entries(statusHist)) console.log(`     ${k}: ${v}`);

  // Request 2 scope: count other stock collections for NK
  console.log('\n  ─── Request 2 dry-run scope (NK stock data to delete) ───');
  for (const c of ['be_stock_movements', 'be_stock_orders', 'be_stock_adjustments', 'be_stock_transfers', 'be_stock_withdrawals']) {
    const snap = await col(c).get();
    const nkDocs = snap.docs.filter(d => { const v = d.data(); return v.branchId === BR || v.locationId === BR || v.fromLocationId === BR || v.toLocationId === BR || v.sourceLocationId === BR || v.destLocationId === BR; });
    const fields = nkDocs.length ? Object.keys(nkDocs[0].data()).filter(k => /branch|location/i.test(k)) : [];
    console.log(`     ${c}: total=${snap.docs.length} · NK=${nkDocs.length} (loc fields: ${fields.join(',') || '—'})`);
  }
  console.log(`\n  be_stock_batches: total=${batches.docs.length} · NK=${nkBatches.length}`);
  console.log('\n===== END =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
