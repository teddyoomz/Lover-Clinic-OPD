// api/cron/patient-link-cleanup-sweep.js
//
// Auto-delete stale customer patient-links. Fires once daily.
//
// A customer's patient-link (be_customers.patientLinkToken) is "empty" when it
// has NO upcoming appointment and NO remaining (usable, non-expired) course.
// Empty-since state machine (Q3=A): stamp patientLinkEmptySince when first seen
// empty → after a 30-day grace, DELETE the link (clear token + disable, Q4=A) →
// clear the stamp if data returns before the grace elapses. Staff regenerate the
// link from CustomerDetailView when a customer needs one again (keeps the
// active-link set from flooding the system).
//
// Decision + "empty" logic shared via src/lib/customerLinkPayloadCore.js (AV135 /
// Rule of 3 — also consumed by api/patient-view.js + scripts/patient-link-cleanup-sweep.mjs).
//
// Cron-only · CRON_SECRET-gated · idempotent (re-run is stable) · admin SDK ·
// canonical artifacts/{APP_ID}/public/data paths (Rule M).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { isCustomerLinkEmpty, decidePatientLinkCleanup } from '../../src/lib/customerLinkPayloadCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const BE_CUSTOMERS_COL = `${PREFIX}/be_customers`;
const BE_APPOINTMENTS_COL = `${PREFIX}/be_appointments`;
const AUDIT_COL = `${PREFIX}/be_admin_audit`;
const SWEEP_LIMIT = 1000;

// Bangkok (UTC+7) 'YYYY-MM-DD' for the given epoch ms.
function bangkokTodayISO(nowMs) {
  const u = new Date(nowMs + 7 * 60 * 60 * 1000);
  return `${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, '0')}-${String(u.getUTCDate()).padStart(2, '0')}`;
}

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

// Shared sweep — used by the cron handler AND scripts/patient-link-cleanup-sweep.mjs.
// `apply=false` = dry-run (no writes).
export async function sweepPatientLinkCleanup({ db, now = Date.now(), limit = SWEEP_LIMIT, apply = true }) {
  let scanned = 0, stamped = 0, cleared = 0, deleted = 0, skipped = 0;
  const todayISO = bangkokTodayISO(now);

  // Only enabled links are eligible. Disabled / no-token customers are skipped
  // server-side (where == true) — cheap, and they're not "active links".
  const snap = await db.collection(BE_CUSTOMERS_COL).where('patientLinkEnabled', '==', true).limit(limit).get();
  scanned = snap.size;

  const writes = []; // { ref, action, patch }
  for (const d of snap.docs) {
    const data = d.data();

    // usable courses are LOCAL to the customer doc (cheap). Only when there is no
    // usable remaining course do we pay for the per-customer appointment query.
    const hasUsableCourse = !isCustomerLinkEmpty({ courses: data.courses, appointments: [], todayISO });
    let isEmpty;
    if (hasUsableCourse) {
      isEmpty = false;
    } else {
      const apptSnap = await db.collection(BE_APPOINTMENTS_COL).where('customerId', '==', String(d.id)).get();
      const appts = apptSnap.docs.map(a => a.data());
      isEmpty = isCustomerLinkEmpty({ courses: data.courses, appointments: appts, todayISO });
    }

    const decision = decidePatientLinkCleanup(data, isEmpty, now);
    if (decision.action === 'skip') { skipped++; continue; }
    writes.push({ ref: d.ref, action: decision.action, patch: decision.patch });
  }

  if (apply && writes.length > 0) {
    const CHUNK = 450;
    for (let i = 0; i < writes.length; i += CHUNK) {
      const batch = db.batch();
      for (const { ref, action, patch } of writes.slice(i, i + CHUNK)) {
        const finalPatch = { ...patch };
        if (action === 'delete') finalPatch.patientLinkAutoDeletedAt = FieldValue.serverTimestamp();
        batch.update(ref, finalPatch);
      }
      await batch.commit();
    }
  }

  for (const { action } of writes) {
    if (action === 'stamp') stamped++;
    else if (action === 'clear') cleared++;
    else if (action === 'delete') deleted++;
  }

  return { scanned, stamped, cleared, deleted, skipped, graceDays: 30, apply };
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-cron-secret'];
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'CRON_SECRET mismatch' });
  }

  initAdmin();
  const db = getFirestore();

  try {
    const result = await sweepPatientLinkCleanup({ db, now: Date.now() });
    const auditId = `patient-link-cleanup-sweep-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(AUDIT_COL).doc(auditId).set({
      op: 'patient-link-cleanup-sweep',
      ...result,
      ranAt: new Date().toISOString(),
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'SWEEP_FAILED', message: e.message });
  }
}
