// scripts/diag-appt-phone-display.mjs
// Rule R (READ-ONLY diag) — V127 hover-card "phone shows sometimes" bug.
// Hypothesis: appointment docs never denormalize a LINKED customer's phone
// (only customerPhoneTemp for pick-later/deposit). apptPhoneValue reads
// customerPhone || customerPhoneTemp → linked appts show blank.
// This script CONFIRMS the variance against real prod + nails the exact
// customer phone field name (for the fix) + measures blast radius.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

// Mirror remainingCourseUtils.js:97 + probe extra candidate field names so we
// learn the REAL field the customer phone lives in (V67 field-name trap).
function custPhone(c) {
  if (!c) return { phone: '', field: '' };
  const pd = c.patientData || {};
  const candidates = [
    ['patientData.phone', pd.phone],
    ['patientData.tel', pd.tel],
    ['patientData.mobile', pd.mobile],
    ['patientData.phoneNumber', pd.phoneNumber],
    ['phone', c.phone],
    ['tel', c.tel],
    ['mobile', c.mobile],
    ['customerPhone', c.customerPhone],
  ];
  for (const [field, val] of candidates) {
    const v = String(val || '').trim();
    if (v) return { phone: v, field };
  }
  return { phone: '', field: '' };
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
  const snap = await db.collection(`${PREFIX}/be_appointments`).get();
  const appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`\nTotal be_appointments: ${appts.length}`);

  // Customer cache (dedupe reads by customerId).
  const custCache = new Map();
  async function getCust(id) {
    if (custCache.has(id)) return custCache.get(id);
    const cs = await db.doc(`${PREFIX}/be_customers/${id}`).get();
    const c = cs.exists ? cs.data() : null;
    custCache.set(id, c);
    return c;
  }

  const buckets = {
    showCustomerPhone: 0,      // appt.customerPhone set → shows
    showTemp: 0,               // appt.customerPhoneTemp set → shows
    blankLinkedCustHasPhone: 0, // ★ THE BUG: linked + no phone fields + customer HAS phone
    blankLinkedCustNoPhone: 0, // linked + no phone fields + customer genuinely no phone
    blankUnlinked: 0,          // not linked + no temp → expected blank
    custMissing: 0,            // linked but be_customers doc gone
  };
  const fieldTally = {};       // which field carried the customer's phone
  const bugSamples = [];

  for (const a of appts) {
    const hasPhone = !!String(a.customerPhone || '').trim();
    const hasTemp = !!String(a.customerPhoneTemp || '').trim();
    const linked = !!String(a.customerId || '').trim();

    if (hasPhone) { buckets.showCustomerPhone++; continue; }
    if (hasTemp) { buckets.showTemp++; continue; }
    // blank on the hover card from here down
    if (!linked) { buckets.blankUnlinked++; continue; }
    const c = await getCust(a.customerId);
    if (!c) { buckets.custMissing++; continue; }
    const { phone, field } = custPhone(c);
    if (phone) {
      buckets.blankLinkedCustHasPhone++;
      fieldTally[field] = (fieldTally[field] || 0) + 1;
      if (bugSamples.length < 15) {
        bugSamples.push({
          apptId: a.appointmentId || a.id,
          date: a.date || '?',
          customerId: a.customerId,
          custName: a.customerName || '(no denorm name)',
          phone, field,
        });
      }
    } else {
      buckets.blankLinkedCustNoPhone++;
    }
  }

  console.log('\n=== HOVER-CARD PHONE CLASSIFICATION (all appts) ===');
  console.log(`  shows (appt.customerPhone set)        : ${buckets.showCustomerPhone}`);
  console.log(`  shows (appt.customerPhoneTemp set)    : ${buckets.showTemp}`);
  console.log(`  ★ BLANK but LINKED + customer HAS phone: ${buckets.blankLinkedCustHasPhone}  ← THE BUG`);
  console.log(`  blank, linked, customer truly no phone : ${buckets.blankLinkedCustNoPhone}`);
  console.log(`  blank, not linked (no temp)            : ${buckets.blankUnlinked}`);
  console.log(`  blank, linked, customer doc MISSING    : ${buckets.custMissing}`);

  console.log('\n=== customer phone field name distribution (bug bucket) ===');
  for (const [field, n] of Object.entries(fieldTally)) console.log(`  ${field.padEnd(24)}: ${n}`);

  console.log('\n=== sample BUG appts (linked, hover blank, customer has phone) ===');
  for (const s of bugSamples) {
    console.log(`  ${String(s.apptId).padEnd(18)} ${String(s.date).padEnd(11)} cust=${String(s.customerId).padEnd(14)} ${String(s.custName).slice(0,18).padEnd(18)} → ${s.phone} [${s.field}]`);
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
