#!/usr/bin/env node
// Rule R diag (READ-ONLY) — confirm the negative-batch-wrongly-depleted bug in real prod.
//
// Bug signature: a be_stock_batches doc with status='depleted' AND qty.remaining < 0.
// Such a batch is "active debt" that should remain status='active' so it surfaces in
// StockBalancePanel (status:'active' filter) AND is repayable by _repayNegativeBalances
// (status:ACTIVE filter). The createStockAdjustment:6935 `afterRemaining <= 0 ? DEPLETED`
// flip drove ADJUST_ADD-on-negative batches to depleted → they vanish from balance.
//
// Reads ALL branches; prints heal scope (the Rule M heal migration target set).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';

async function main() {
  const all = await db.collection(`${BASE}/be_stock_batches`).get();
  console.log(`Total be_stock_batches: ${all.size}\n`);

  const wronglyDepleted = []; // status='depleted' AND remaining < 0  (THE BUG)
  const negativeActive = [];  // status='active'   AND remaining < 0  (correct state)
  const depletedZero = [];    // status='depleted' AND remaining == 0 (correct state)
  const epqAugmentin = [];    // the two products the user named

  for (const doc of all.docs) {
    const b = doc.data();
    const remaining = Number(b.qty?.remaining);
    const status = b.status || '(none)';
    const name = String(b.productName || '');
    if (status === 'depleted' && remaining < 0) {
      wronglyDepleted.push({ id: doc.id, name, remaining, total: Number(b.qty?.total), branchId: b.branchId, productId: b.productId });
    } else if (status === 'active' && remaining < 0) {
      negativeActive.push({ id: doc.id, name, remaining, branchId: b.branchId });
    } else if (status === 'depleted' && remaining === 0) {
      depletedZero.push(doc.id);
    }
    if (/E\.?P\.?T\.?Q|Augmentin/i.test(name)) {
      epqAugmentin.push({ id: doc.id, name, remaining, total: Number(b.qty?.total), status, branchId: b.branchId, productId: b.productId });
    }
  }

  console.log(`🔴 WRONGLY-DEPLETED-NEGATIVE (the bug — status=depleted AND remaining<0): ${wronglyDepleted.length}`);
  for (const x of wronglyDepleted) {
    console.log(`   ${x.name} — remaining=${x.remaining} total=${x.total} branch=${x.branchId} batch=…${String(x.id).slice(-8)} productId=${x.productId}`);
  }

  console.log(`\n🟢 NEGATIVE-BUT-ACTIVE (correct — visible debt): ${negativeActive.length}`);
  for (const x of negativeActive) {
    console.log(`   ${x.name} — remaining=${x.remaining} branch=${x.branchId} batch=…${String(x.id).slice(-8)}`);
  }

  console.log(`\n⚪ DEPLETED-AT-ZERO (correct): ${depletedZero.length}`);

  console.log(`\n🔎 E.P.T.Q S500 + Augmentin 1 gm batches (user-named):`);
  for (const x of epqAugmentin) {
    const flag = (x.status === 'depleted' && x.remaining < 0) ? '  ⬅️ WRONGLY DEPLETED (should be active, remaining stays negative)' : '';
    console.log(`   ${x.name} — remaining=${x.remaining} total=${x.total} status=${x.status} branch=${x.branchId} batch=…${String(x.id).slice(-8)}${flag}`);
  }

  console.log(`\n=== HEAL SCOPE (Rule M migration target): ${wronglyDepleted.length} batch(es) → flip status to 'active' ===`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
