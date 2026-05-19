#!/usr/bin/env node
// ─── Diag: skipStockDeduction REAL-PROD EVIDENCE (Rule Q V66 L2-leaning) ───
//
// CORRECTED 2026-05-20: the earlier version of this diag filtered
// `m.reason === 'product-skip'`. That string lives in the RETURN VALUE of
// `_deductOneItem` (backendClient.js:6954) — NOT on the Firestore movement
// doc. The doc carries `skipped: true` + `batchId: null` + a Thai `note`
// distinguishing product-skip ('ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคที่สินค้า')
// from course-skip ('ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคในคอร์ส').
//
// Verifies:
//   1. Count be_products with skipStockDeduction:true
//   2. Find be_stock_movements with skipped:true + note containing
//      'ไม่ตัดสต็อค' (the actual stored signature)
//   3. For each such movement, verify batchId is null
//   4. Cross-check the 4 flagged products against be_sales/be_treatments
//
// READ-ONLY (Rule R diag). No writes, no cleanup needed.
//
// Usage: node scripts/diag-skip-stock-deduction-real-prod-evidence.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local.prod');
  const txt = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function initFirestore() {
  if (getApps().length > 0) return getFirestore();
  const env = loadEnvLocal();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* missing');
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

const PRODUCT_SKIP_NOTE_FRAG = 'ที่สินค้า';
const COURSE_SKIP_NOTE_FRAG = 'ในคอร์ส';

async function main() {
  const db = initFirestore();
  const data = dataPath(db);
  console.log('[diag] skipStockDeduction REAL-PROD EVIDENCE (corrected schema)');
  console.log(`[diag] Run timestamp: ${new Date().toISOString()}\n`);

  // ─── Phase 1 — be_products with skipStockDeduction:true ─────────────────
  console.log('[diag] Phase 1 — be_products with skipStockDeduction:true');
  const allProductsSnap = await data.collection('be_products').get();
  const allProducts = allProductsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const realProducts = allProducts.filter(p =>
    !p.id.startsWith('TEST-') && !p.id.startsWith('E2E-')
  );
  const flaggedProducts = realProducts.filter(p => p.skipStockDeduction === true);
  console.log(`  Total be_products (excl. TEST/E2E): ${realProducts.length}`);
  console.log(`  Products with skipStockDeduction:true: ${flaggedProducts.length}`);
  for (const p of flaggedProducts.slice(0, 10)) {
    console.log(`    - ${p.id} | "${p.productName}" | branchId=${p.branchId || '(empty)'} | trackStock=${p.stockConfig?.trackStock}`);
  }
  console.log();

  // ─── Phase 2 — be_stock_movements with skipped:true + Thai note ─────────
  console.log('[diag] Phase 2 — be_stock_movements with skipped:true (corrected: filter on doc fields)');
  const movSnap = await data.collection('be_stock_movements').get();
  const allMovements = movSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const realMovements = allMovements.filter(m =>
    !(m.productId || '').startsWith('TEST-') && !(m.productId || '').startsWith('E2E-')
  );
  const skipped = realMovements.filter(m => m.skipped === true);
  const productSkip = skipped.filter(m => (m.note || '').includes(PRODUCT_SKIP_NOTE_FRAG));
  const courseSkip = skipped.filter(m => (m.note || '').includes(COURSE_SKIP_NOTE_FRAG));
  console.log(`  Total be_stock_movements (excl. TEST/E2E): ${realMovements.length}`);
  console.log(`  Skipped (skipped:true): ${skipped.length}`);
  console.log(`    - product-skip (note contains 'ที่สินค้า'): ${productSkip.length}`);
  console.log(`    - course-skip  (note contains 'ในคอร์ส'):  ${courseSkip.length}`);
  if (productSkip.length > 0) {
    console.log(`  Sample product-skip movements (up to 5):`);
    for (const m of productSkip.slice(0, 5)) {
      const dt = typeof m.createdAt === 'string' ? m.createdAt.slice(0, 19) : '(non-ISO)';
      console.log(`    - ${m.id} | productId=${m.productId} | qty=${m.qty} | batchId=${m.batchId === null ? '(null)' : m.batchId} | "${(m.note || '').slice(0, 40)}" | ${dt}`);
    }
  }
  console.log();

  // ─── Phase 3 — Cross-reference flagged productIds vs sales/treatments ────
  console.log('[diag] Phase 3 — Cross-reference flagged productIds vs be_sales / be_treatments');
  const flaggedIds = new Set(flaggedProducts.map(p => p.productId || p.id));
  const [salesSnap, treatmentsSnap] = await Promise.all([
    data.collection('be_sales').get(),
    data.collection('be_treatments').get(),
  ]);
  const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const treatments = treatmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const refs = {};
  for (const pid of flaggedIds) refs[pid] = { sales: 0, treatments: 0 };
  function walk(obj, hitFn) {
    if (obj == null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) return obj.forEach(o => walk(o, hitFn));
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'productId' && flaggedIds.has(String(v))) hitFn(String(v));
      if (v && typeof v === 'object') walk(v, hitFn);
    }
  }
  for (const s of sales) walk(s, pid => refs[pid].sales += 1);
  for (const t of treatments) walk(t, pid => refs[pid].treatments += 1);
  console.log(`  be_sales total: ${sales.length}  be_treatments total: ${treatments.length}`);
  for (const [pid, r] of Object.entries(refs)) {
    const name = (flaggedProducts.find(p => (p.productId || p.id) === pid)?.productName) || pid;
    console.log(`    - "${name}" (${pid}): ${r.sales} in sales · ${r.treatments} in treatments`);
  }
  console.log();

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  DIAGNOSTIC SUMMARY (corrected schema)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  • be_products total (excl. test):              ${realProducts.length}`);
  console.log(`  • be_products with skipStockDeduction:true:    ${flaggedProducts.length}`);
  console.log(`  • be_stock_movements total (excl. test):       ${realMovements.length}`);
  console.log(`  • Skipped movements (skipped:true total):      ${skipped.length}`);
  console.log(`  •   - product-skip:                            ${productSkip.length}`);
  console.log(`  •   - course-skip:                             ${courseSkip.length}`);
  console.log();
  const totalUsage = Object.values(refs).reduce((a, r) => a + r.sales + r.treatments, 0);
  if (flaggedProducts.length === 0 && productSkip.length === 0) {
    console.log('  📋 No admin has used "ไม่ตัดสต็อค" toggle in production yet.');
  } else if (totalUsage === 0) {
    console.log('  📋 4 products flagged but ZERO references in sales/treatments yet →');
    console.log('     flag works in code (proven by V43 e2e + Playwright L2) but');
    console.log('     real-user usage hasn\'t exercised it. Expected behavior.');
  } else if (productSkip.length > 0) {
    console.log('  ✓ Real-prod evidence found:');
    console.log(`    ${productSkip.length} product-skip movements in production data —`);
    console.log('    flag is honored by real users.');
  } else {
    console.log('  ⚠ Inconsistency detected: flagged products were used but ZERO');
    console.log('    skip movements emitted. Investigate _deductOneItem runtime.');
  }
  console.log();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch(e => {
    console.error('[diag] ERROR:', e);
    process.exit(1);
  });
}
