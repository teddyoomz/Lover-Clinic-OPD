#!/usr/bin/env node
// ═══ Rule R READ-ONLY diagnostic ═══
// Two user-reported issues + Rule P class-of-bug sweep:
//   A. Appointment form shows doctor "บริบูรณ์ วังแก้ว" (แพทย์ dropdown + ผู้ช่วยแพทย์)
//      — user renamed the doctor "a long time ago" but old/wrong name still shows.
//      → dump be_doctors + be_staff: current names, duplicates, the
//        loverclinic_dr@loverclinic.com doc, anyone named บริบูรณ์/วังแก้ว.
//   B. Test branches TEST-FEFO18-* still in be_branches (pollute สาขาที่ออกตรวจ).
//      → list all be_branches, flag test ones, count what references each.
//   C. (Rule P) test-pollution across ALL be_* collections — find the full extent.
// NO WRITES. Admin SDK (bypasses rules, reaches everything) per Rule R.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const TEST_RE = /^(TEST|E2E)[-_]/i;
const isTestId = (id) => TEST_RE.test(id) || /FEFO|-BR$|TESTBR/i.test(id);

function pickStr(o) { const out = {}; for (const [k, v] of Object.entries(o || {})) { if (typeof v === 'string' && v.length && v.length < 80) out[k] = v; } return out; }

async function main() {
  const db = initAdmin();
  const data = base(db);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ISSUE A — be_doctors / be_staff name investigation');
  console.log('═══════════════════════════════════════════════════════════════');

  const docSnap = await data.collection('be_doctors').get();
  console.log(`\nbe_doctors: ${docSnap.size} docs`);
  const byEmail = {};
  for (const d of docSnap.docs) {
    const x = d.data();
    const email = x.email || x.loginEmail || '';
    byEmail[email] = (byEmail[email] || 0) + 1;
    const nm = x.name || `${x.firstName || ''} ${x.lastName || ''}`.trim();
    const flag = (email === 'loverclinic_dr@loverclinic.com' || /บริบูรณ์|วังแก้ว/.test(JSON.stringify(x))) ? '  <<< FLAG' : '';
    console.log(`  [${d.id}] name="${nm}" email="${email}" hidden=${x.isHidden === true} branchIds=${JSON.stringify(x.branchIds || x.branches || null)}${flag}`);
    if (flag) {
      console.log(`        FULL string fields: ${JSON.stringify(pickStr(x))}`);
      console.log(`        updatedAt=${x.updatedAt?.toDate ? x.updatedAt.toDate().toISOString() : x.updatedAt} createdAt=${x.createdAt?.toDate ? x.createdAt.toDate().toISOString() : x.createdAt}`);
      if (x.nameMigratedAt || x._nameMigratedAt) console.log(`        nameMigratedAt present`);
    }
  }
  const dupEmails = Object.entries(byEmail).filter(([e, n]) => e && n > 1);
  console.log(`\n  DUPLICATE emails in be_doctors: ${dupEmails.length ? JSON.stringify(dupEmails) : 'none'}`);

  const staffSnap = await data.collection('be_staff').get();
  console.log(`\nbe_staff: ${staffSnap.size} docs`);
  let staffHits = 0;
  for (const d of staffSnap.docs) {
    const x = d.data();
    const email = x.email || x.loginEmail || '';
    const nm = x.name || `${x.firstName || ''} ${x.lastName || ''}`.trim();
    if (email === 'loverclinic_dr@loverclinic.com' || /บริบูรณ์|วังแก้ว/.test(JSON.stringify(x))) {
      staffHits++;
      console.log(`  <<< [${d.id}] name="${nm}" email="${email}" hidden=${x.isHidden === true} role=${x.role || ''}`);
      console.log(`        FULL string fields: ${JSON.stringify(pickStr(x))}`);
      console.log(`        updatedAt=${x.updatedAt?.toDate ? x.updatedAt.toDate().toISOString() : x.updatedAt}`);
    }
  }
  if (!staffHits) console.log('  (no be_staff doc named บริบูรณ์/วังแก้ว or with loverclinic_dr email)');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ISSUE B — be_branches (find test branches + references)');
  console.log('═══════════════════════════════════════════════════════════════');

  const brSnap = await data.collection('be_branches').get();
  console.log(`\nbe_branches: ${brSnap.size} docs`);
  const testBranches = [];
  for (const d of brSnap.docs) {
    const x = d.data();
    const t = isTestId(d.id) || isTestId(x.name || '');
    console.log(`  ${t ? '🧪' : '  '} [${d.id}] name="${x.name || ''}" status="${x.status || ''}" isDefault=${x.isDefault === true} createdAt=${x.createdAt?.toDate ? x.createdAt.toDate().toISOString() : x.createdAt}`);
    if (t) testBranches.push({ id: d.id, name: x.name || '' });
  }
  console.log(`\n  TEST branches: ${testBranches.length} → ${JSON.stringify(testBranches.map(b => b.id))}`);

  // reference counts for each test branch
  const refCollections = ['be_appointments', 'be_appointment_slots', 'be_customers', 'be_sales', 'be_treatments', 'be_deposits', 'be_stock_batches', 'be_stock_movements', 'be_stock_orders', 'be_quotations'];
  for (const tb of testBranches) {
    console.log(`\n  refs → test branch ${tb.id}:`);
    for (const col of refCollections) {
      let n = 0;
      try { const c = await data.collection(col).where('branchId', '==', tb.id).count().get(); n = c.data().count; } catch { n = -1; }
      let n2 = 0;
      if (col.startsWith('be_stock')) { try { const c2 = await data.collection(col).where('locationId', '==', tb.id).count().get(); n2 = c2.data().count; } catch { n2 = -1; } }
      if (n || n2) console.log(`     ${col}: branchId=${n}${n2 ? ` locationId=${n2}` : ''}`);
    }
    // which doctors/staff carry this branch in branchIds
    const docHas = docSnap.docs.filter(d => (d.data().branchIds || d.data().branches || []).includes?.(tb.id)).map(d => d.id);
    const stfHas = staffSnap.docs.filter(d => (d.data().branchIds || d.data().branches || []).includes?.(tb.id)).map(d => d.id);
    if (docHas.length) console.log(`     be_doctors.branchIds ⊇ this: ${JSON.stringify(docHas)}`);
    if (stfHas.length) console.log(`     be_staff.branchIds ⊇ this: ${JSON.stringify(stfHas)}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RULE P — test-pollution sweep across be_* collections (by doc-id)');
  console.log('═══════════════════════════════════════════════════════════════');
  const sweepCols = [
    'be_branches', 'be_customers', 'be_products', 'be_courses', 'be_doctors', 'be_staff',
    'be_stock_batches', 'be_stock_movements', 'be_stock_orders', 'be_stock_adjustments',
    'be_stock_transfers', 'be_stock_withdrawals', 'be_central_stock_orders',
    'be_sales', 'be_vendor_sales', 'be_online_sales', 'be_appointments', 'be_appointment_slots',
    'be_deposits', 'be_treatments', 'be_quotations', 'be_promotions', 'be_coupons', 'be_vouchers',
    'be_product_groups', 'be_product_units', 'be_medical_instruments', 'be_holidays',
    'be_staff_schedules', 'be_chart_templates',
  ];
  let totalTest = 0;
  for (const col of sweepCols) {
    let refs = [];
    try { refs = await data.collection(col).listDocuments(); } catch { console.log(`  ${col}: (error listing)`); continue; }
    const testIds = refs.map(r => r.id).filter(id => isTestId(id));
    if (testIds.length) {
      totalTest += testIds.length;
      console.log(`  🧪 ${col}: ${testIds.length} test docs (of ${refs.length}) → ${JSON.stringify(testIds.slice(0, 6))}${testIds.length > 6 ? ' …' : ''}`);
    }
  }
  console.log(`\n  TOTAL test-prefixed docs across swept collections: ${totalTest}`);
  console.log('\n═══ DIAGNOSTIC COMPLETE (read-only, no writes) ═══');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('DIAG ERROR:', e); process.exit(1); });
}
