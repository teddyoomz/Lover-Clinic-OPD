// scripts/e2e-v108-sale-customer-name.mjs
// Rule Q V66 L2 — verifies the V108 createBackendSale chokepoint resolution +
// resolve→write round-trip against REAL prod Firestore, using the SAME resolver
// functions the chokepoint imports (resolveCustomerDisplayName / resolveCustomerHN).
// 1) seeds a TEST customer with a name + empty top-level name fields (the exact
//    shape that produced INV-20260520-0010's "-"), 2) mirrors the chokepoint
//    (empty input name → read doc → resolve → write a TEST sale), 3) reads back
//    + asserts the sale carries the resolved name, 4) asserts the REAL victim
//    LC-26000074 resolves (proving Fix B display + that a backfill would stamp).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { resolveCustomerDisplayName, resolveCustomerHN } from '../src/lib/customerDisplayName.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const txt = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

// Mirror of backendClient._resolveSaleCustomerIdentity (V108) — same resolvers.
async function resolveSaleIdentity(db, data) {
  let customerName = (data && typeof data.customerName === 'string') ? data.customerName.trim() : '';
  let customerHN = (data && typeof data.customerHN === 'string') ? data.customerHN.trim() : '';
  const cid = data && data.customerId;
  if (cid && (!customerName || !customerHN)) {
    const snap = await db.doc(`${PREFIX}/be_customers/${cid}`).get();
    if (snap.exists) {
      const c = snap.data();
      if (!customerName) customerName = resolveCustomerDisplayName(c);
      if (!customerHN) customerHN = resolveCustomerHN(c);
    }
  }
  return { customerName: customerName || '', customerHN: customerHN || '' };
}

async function main() {
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

  const tag = `TEST-V108-${Date.now()}-${randomBytes(2).toString('hex')}`;
  const custId = `${tag}-cust`;
  const saleId = `TEST-SALE-${tag}`;
  try {
    // 1) seed customer with name ONLY in patientData (top-level firstname empty) —
    //    the exact INV-0010 shape: caller-derived name would be empty.
    await db.doc(`${PREFIX}/be_customers/${custId}`).set({
      firstname: '', lastname: '',
      patientData: { firstName: 'นิรุตทดสอบ', lastName: 'ชำนาญปรุ', prefix: 'นาย', hn: custId },
    });
    console.log('Seeded TEST customer', custId);

    // 2) chokepoint mirror: caller passes EMPTY name → resolve from the doc.
    const ident = await resolveSaleIdentity(db, { customerId: custId, customerName: '', customerHN: '' });
    ok(ident.customerName === 'นาย นิรุตทดสอบ ชำนาญปรุ', `resolved name = "${ident.customerName}"`);
    ok(ident.customerHN === custId, `resolved HN = "${ident.customerHN}"`);

    // write the TEST sale with the resolved identity (what createBackendSale does)
    await db.doc(`${PREFIX}/be_sales/${saleId}`).set({
      saleId, customerId: custId, customerName: ident.customerName, customerHN: ident.customerHN,
      status: 'active', createdAt: new Date().toISOString(), note: tag,
    });

    // 3) read back → assert the sale carries the resolved name (no "-")
    const saleSnap = await db.doc(`${PREFIX}/be_sales/${saleId}`).get();
    const s = saleSnap.data();
    ok(s.customerName === 'นาย นิรุตทดสอบ ชำนาญปรุ', `sale.customerName stamped = "${s.customerName}"`);
    ok(!!s.customerName && s.customerName !== '-', 'sale would NOT render "-"');

    // non-empty caller name must be preserved (only trimmed), not overwritten
    const ident2 = await resolveSaleIdentity(db, { customerId: custId, customerName: '  ชื่อที่ส่งมา  ', customerHN: 'HN-X' });
    ok(ident2.customerName === 'ชื่อที่ส่งมา' && ident2.customerHN === 'HN-X', 'non-empty caller value preserved (trimmed), not overwritten');

    // 4) the REAL victim resolves (Fix B display + backfill-able)
    const vSnap = await db.doc(`${PREFIX}/be_customers/LC-26000074`).get();
    if (vSnap.exists) {
      const vn = resolveCustomerDisplayName(vSnap.data());
      ok(!!vn, `real victim LC-26000074 resolves: "${vn}"`);
    } else {
      console.log('  (skip) LC-26000074 not present');
    }
  } finally {
    await db.doc(`${PREFIX}/be_customers/${custId}`).delete().catch(() => {});
    await db.doc(`${PREFIX}/be_sales/${saleId}`).delete().catch(() => {});
    console.log('Cleanup done.');
  }
  console.log(`\nRESULT: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
