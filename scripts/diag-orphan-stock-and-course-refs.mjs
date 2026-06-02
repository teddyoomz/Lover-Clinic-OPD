#!/usr/bin/env node
// Rule R diagnostic (READ-ONLY) — quantify the orphan-on-delete bug:
//   • be_stock_batches whose productId has NO be_products doc (= product was
//     hard-deleted, batch lingered → still shows in stock balance with "-").
//   • be_courses (mainProductId / courseProducts[].productId) → orphan refs.
//   • be_treatments / be_sales orphan refs (blast-radius if we ever cascade).
// Tells us: how many orphans, do any have remaining>0, course-ref blast radius.
// No writes.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadDotEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
    let [, k, v] = m; if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));
const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  return getFirestore(initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }) }));
}
const C = (db, name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

async function main() {
  console.log('▶ Rule R diag — orphan stock batches + course refs (READ-ONLY)\n');
  const db = getAdmin();
  const [prodSnap, batchSnap, courseSnap] = await Promise.all([
    C(db, 'be_products').get(), C(db, 'be_stock_batches').get(), C(db, 'be_courses').get(),
  ]);

  // index every product identity (productId field AND doc.id — readers resolve either)
  const prodIds = new Set();
  const prodNameById = new Map();
  for (const d of prodSnap.docs) {
    const data = d.data();
    prodIds.add(d.id);
    if (data.productId) prodIds.add(String(data.productId));
    prodNameById.set(d.id, data.productName || data.name || '');
  }
  console.log(`be_products: ${prodSnap.size} docs (${prodIds.size} distinct ids)`);
  console.log(`be_stock_batches: ${batchSnap.size}, be_courses: ${courseSnap.size}\n`);

  // ── (1) orphan stock batches ──
  console.log('── (1) ORPHAN stock batches (productId not in be_products) ──');
  const orphanByPid = new Map(); // pid -> { name, branch, count, remaining, statuses:Set }
  for (const d of batchSnap.docs) {
    const b = d.data();
    const pid = String(b.productId || '');
    if (!pid || prodIds.has(pid)) continue;
    if (!orphanByPid.has(pid)) orphanByPid.set(pid, { name: b.productName || '(no name)', branch: b.locationId || b.branchId, count: 0, remaining: 0, statuses: new Set() });
    const o = orphanByPid.get(pid);
    o.count++; o.remaining += Number(b.qty?.remaining || 0); o.statuses.add(b.status);
  }
  if (orphanByPid.size === 0) console.log('  (none)');
  let orphanWithStock = 0;
  for (const [pid, o] of orphanByPid) {
    if (o.remaining > 0) orphanWithStock++;
    console.log(`  ${pid} "${o.name}" loc=${o.branch}  batches=${o.count} remaining=${o.remaining} status={${[...o.statuses].join(',')}}  ${o.remaining > 0 ? '⚠ HAS STOCK' : '∅ empty'}`);
  }
  console.log(`  → ${orphanByPid.size} orphan products (${orphanWithStock} with remaining>0)`);

  // ── (2) orphan course refs ──
  console.log('\n── (2) ORPHAN course product-refs (productId not in be_products) ──');
  let courseMainOrphan = 0, courseProdOrphan = 0;
  const courseHits = [];
  for (const d of courseSnap.docs) {
    const cd = d.data();
    const mp = String(cd.mainProductId || '');
    const mainOrphan = mp && !prodIds.has(mp);
    const prods = Array.isArray(cd.courseProducts) ? cd.courseProducts : (Array.isArray(cd.products) ? cd.products : []);
    const orphanProds = prods.filter(p => p && p.productId && !prodIds.has(String(p.productId)));
    if (mainOrphan || orphanProds.length) {
      if (mainOrphan) courseMainOrphan++;
      courseProdOrphan += orphanProds.length;
      courseHits.push(`  course ${d.id} "${cd.courseName || ''}" branch=${cd.branchId}${mainOrphan ? ` mainProductId=${mp}(${cd.mainProductName || '?'}) ORPHAN` : ''}${orphanProds.length ? ` orphanProducts=[${orphanProds.map(p => `${p.productId}(${p.productName || '?'})`).join(', ')}]` : ''}`);
    }
  }
  console.log(courseHits.length ? courseHits.join('\n') : '  (none)');
  console.log(`  → ${courseMainOrphan} courses w/ orphan mainProductId, ${courseProdOrphan} orphan product-line refs`);

  // ── (3) treatment/sale orphan-ref blast radius (informational) ──
  console.log('\n── (3) blast radius — historical refs to orphan productIds (informational) ──');
  const orphanPidSet = new Set(orphanByPid.keys());
  const [txSnap, saleSnap] = await Promise.all([C(db, 'be_treatments').get(), C(db, 'be_sales').get()]);
  let txHits = 0, saleHits = 0;
  for (const d of txSnap.docs) {
    const items = d.data()?.detail?.treatmentItems || [];
    if (Array.isArray(items) && items.some(it => orphanPidSet.has(String(it?.productId || '')))) txHits++;
  }
  for (const d of saleSnap.docs) {
    const s = d.data(); const groups = ['products', 'medications', 'courses', 'promotions'];
    const refs = groups.flatMap(g => Array.isArray(s.items?.[g]) ? s.items[g] : []);
    if (refs.some(it => orphanPidSet.has(String(it?.productId || '')))) saleHits++;
  }
  console.log(`  be_treatments referencing an orphan productId: ${txHits} / ${txSnap.size}`);
  console.log(`  be_sales referencing an orphan productId:      ${saleHits} / ${saleSnap.size}`);
  console.log('  (these are HISTORICAL records — a cascade-delete must NOT touch them; Rule O denormalized names keep them readable)');

  console.log('\n✓ Diag complete (read-only)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
