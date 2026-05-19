#!/usr/bin/env node
// READ-ONLY — scan be_customers.courses[] for filler entries + report unit
// Plus look up branch names for the IDs found earlier.
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }) });
}
const db = getFirestore();
const FILLER_RE = /\b(neuramis|restylane|juvederm|juvéderm|belotero|stylage|teosyal|princess|yvoire|croma|aliaxin|saypha|vivacy|profhilo|sculptra|radiesse)\b/i;

async function main() {
  // Branch names
  console.log('═══ BRANCH NAMES ═══');
  const branchesSnap = await db.collection(`${BASE}/be_branches`).get();
  branchesSnap.forEach(d => console.log(`  ${d.id}  =  "${d.data().name || '(unnamed)'}"`));

  // Customer.courses[] filler scan
  console.log('\n═══ be_customers.courses[] filler scan ═══');
  const customersSnap = await db.collection(`${BASE}/be_customers`).get();
  const matches = [];
  customersSnap.forEach(doc => {
    const d = doc.data();
    const courses = Array.isArray(d.courses) ? d.courses : [];
    courses.forEach((c, idx) => {
      const name = c.name || c.courseName || '';
      const product = c.product || c.productName || '';
      if (FILLER_RE.test(name) || FILLER_RE.test(product)) {
        const qty = c.qty || '';
        const m = qty.match(/^(\d+)\/(\d+)\s+(.+)$/);
        const unit = m ? m[3] : '(no-unit-in-qty)';
        matches.push({
          customerId: doc.id,
          customerName: `${d.firstname || ''} ${d.lastname || ''}`.trim() || '(no-name)',
          customerHN: d.proClinicHN || d.hn || '',
          branchId: d.branchId || '(none)',
          courseIdx: idx,
          courseName: name,
          product,
          qty,
          unit,
          expiry: c.expiry || '',
          status: c.status || '',
        });
      }
    });
  });
  console.log(`Total customers scanned: ${customersSnap.size}`);
  console.log(`Filler entries found in customer.courses[]: ${matches.length}\n`);

  // Group by unit
  const byUnit = {};
  for (const m of matches) {
    if (!byUnit[m.unit]) byUnit[m.unit] = [];
    byUnit[m.unit].push(m);
  }
  for (const [unit, items] of Object.entries(byUnit).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n── unit="${unit}" — ${items.length} customer.courses[] entries ──`);
    items.slice(0, 50).forEach(m => {
      console.log(`  • "${m.courseName}" / product="${m.product}" qty=${m.qty} status=${m.status} expiry=${m.expiry}`);
      console.log(`      customer=${m.customerName} (HN=${m.customerHN}, id=${m.customerId}, branch=${m.branchId})`);
    });
    if (items.length > 50) console.log(`  ... and ${items.length - 50} more`);
  }

  // Specifically search for "วันเพ็ญ"
  console.log('\n═══ Customer "วันเพ็ญ" lookup ═══');
  customersSnap.forEach(doc => {
    const d = doc.data();
    const full = `${d.firstname || ''} ${d.lastname || ''} ${d.patientData?.firstName || ''} ${d.patientData?.lastName || ''}`.toLowerCase();
    if (full.includes('วันเพ็ญ') || full.includes('เดือนสิบสอง')) {
      console.log(`  ✓ Found: ${d.firstname} ${d.lastname}  (id=${doc.id}, HN=${d.proClinicHN || d.hn || ''}, branch=${d.branchId || '(none)'})`);
      const courses = Array.isArray(d.courses) ? d.courses : [];
      courses.forEach((c, idx) => {
        const name = c.name || c.courseName || '';
        if (FILLER_RE.test(name) || FILLER_RE.test(c.product || '')) {
          console.log(`     [${idx}] "${name}"  product="${c.product}"  qty=${c.qty}  status=${c.status}`);
        }
      });
    }
  });

  process.exit(0);
}
main().catch(e => { console.error('💥', e); process.exit(1); });
