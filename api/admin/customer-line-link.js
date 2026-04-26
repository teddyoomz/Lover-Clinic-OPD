// ─── /api/admin/customer-line-link — V33.4 + V33.7 (2026-04-27) ──────────
// Admin actions on a customer's LINE link state machine.
//
// Body:
//   { action: 'suspend',  customerId: '<id>' } — bot stops replying to this customer
//   { action: 'resume',   customerId: '<id>' } — bot resumes replies (lineLinkStatus → 'active')
//   { action: 'unlink',   customerId: '<id>' } — clear lineUserId entirely (silent — NO LINE push per user choice)
//   { action: 'list-linked' }                  — list every customer with non-null lineUserId
//   { action: 'update-language', customerId, language: 'th'|'en' }    — V33.7 i18n toggle
//
// Atomic write of {lineLinkStatus, lineLinkStatusChangedAt, lineLinkStatusChangedBy}.
// On unlink: also clears lineUserId + lineLinkedAt + lineLinkStatus (full clear).
// On update-language: writes lineLanguage field; bot picks it up on next DM.
//
// Security: verifyAdminToken (admin: true claim or bootstrap UID).
// Rule lockdown: be_customers `read,write: if isClinicStaff()` — but we use
// firebase-admin SDK here for audit + bypass + parity with link-requests.js.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';

let cachedDb = null;
function getAdminFirestore() {
  if (cachedDb) return cachedDb;
  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
    app = initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
    });
  }
  cachedDb = getFirestore(app);
  return cachedDb;
}

async function handleSuspend({ db, customerId, callerUid }) {
  const cRef = db.doc(`artifacts/${APP_ID}/public/data/be_customers/${customerId}`);
  const cSnap = await cRef.get();
  if (!cSnap.exists) throw new Error('ลูกค้าไม่พบในระบบ');
  if (!cSnap.data()?.lineUserId) throw new Error('ลูกค้าคนนี้ยังไม่ได้ผูก LINE');
  const now = new Date().toISOString();
  await cRef.update({
    lineLinkStatus: 'suspended',
    lineLinkStatusChangedAt: now,
    lineLinkStatusChangedBy: callerUid || null,
  });
  return { customerId, action: 'suspend', lineLinkStatus: 'suspended' };
}

async function handleResume({ db, customerId, callerUid }) {
  const cRef = db.doc(`artifacts/${APP_ID}/public/data/be_customers/${customerId}`);
  const cSnap = await cRef.get();
  if (!cSnap.exists) throw new Error('ลูกค้าไม่พบในระบบ');
  if (!cSnap.data()?.lineUserId) throw new Error('ลูกค้าคนนี้ยังไม่ได้ผูก LINE');
  const now = new Date().toISOString();
  await cRef.update({
    lineLinkStatus: 'active',
    lineLinkStatusChangedAt: now,
    lineLinkStatusChangedBy: callerUid || null,
  });
  return { customerId, action: 'resume', lineLinkStatus: 'active' };
}

async function handleUnlink({ db, customerId, callerUid }) {
  const cRef = db.doc(`artifacts/${APP_ID}/public/data/be_customers/${customerId}`);
  const cSnap = await cRef.get();
  if (!cSnap.exists) throw new Error('ลูกค้าไม่พบในระบบ');
  // V33.4 user choice: NO LINE push to customer on unlink ("ตัดเงียบ").
  const now = new Date().toISOString();
  await cRef.update({
    lineUserId: null,
    lineLinkedAt: null,
    lineLinkStatus: null,
    lineLinkStatusChangedAt: now,
    lineLinkStatusChangedBy: callerUid || null,
  });
  return { customerId, action: 'unlink', lineLinkStatus: null };
}

async function handleUpdateLanguage({ db, customerId, language, callerUid }) {
  // V33.7 — admin toggles a customer's bot reply language.
  if (language !== 'th' && language !== 'en') {
    throw new Error('language ต้องเป็น "th" หรือ "en"');
  }
  const cRef = db.doc(`artifacts/${APP_ID}/public/data/be_customers/${customerId}`);
  const cSnap = await cRef.get();
  if (!cSnap.exists) throw new Error('ลูกค้าไม่พบในระบบ');
  const now = new Date().toISOString();
  await cRef.update({
    lineLanguage: language,
    lineLanguageChangedAt: now,
    lineLanguageChangedBy: callerUid || null,
  });
  return { customerId, action: 'update-language', lineLanguage: language };
}

async function handleListLinked({ db }) {
  // List every customer with a non-null lineUserId — for the "ผูกแล้ว" tab.
  // Firestore can't `where(field, '!=', null)` with sort, so we filter
  // client-side after fetching. At clinic scale (~hundreds of customers)
  // this is fine.
  const snap = await db.collection(`artifacts/${APP_ID}/public/data/be_customers`).get();
  const items = snap.docs
    .map(d => {
      const data = d.data() || {};
      if (!data.lineUserId) return null;
      const pd = data.patientData || {};
      return {
        customerId: d.id,
        customerName: data.customerName
          || `${pd.prefix || ''} ${pd.firstName || pd.firstname || ''} ${pd.lastName || pd.lastname || ''}`.trim()
          || data.proClinicHN
          || d.id,
        customerHN: data.proClinicHN || data.hn_no || data.hn || '',
        lineUserId: data.lineUserId,
        lineLinkedAt: data.lineLinkedAt || null,
        lineLinkStatus: data.lineLinkStatus || 'active',
        lineLinkStatusChangedAt: data.lineLinkStatusChangedAt || null,
        // V33.7 — surface fields needed by per-row language toggle.
        // lineLanguage: explicit override; customer_type: auto-default fallback.
        lineLanguage: data.lineLanguage || null,
        customer_type: data.customer_type || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.lineLinkedAt || '').localeCompare(String(a.lineLinkedAt || '')));
  return { items };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { action, customerId, language } = body;
  const db = getAdminFirestore();

  try {
    if (action === 'list-linked') {
      const result = await handleListLinked({ db });
      return res.status(200).json(result);
    }
    if (!customerId) return res.status(400).json({ error: 'customerId required' });
    if (action === 'suspend') {
      const result = await handleSuspend({ db, customerId, callerUid: caller.uid });
      return res.status(200).json(result);
    }
    if (action === 'resume') {
      const result = await handleResume({ db, customerId, callerUid: caller.uid });
      return res.status(200).json(result);
    }
    if (action === 'unlink') {
      const result = await handleUnlink({ db, customerId, callerUid: caller.uid });
      return res.status(200).json(result);
    }
    if (action === 'update-language') {
      const result = await handleUpdateLanguage({ db, customerId, language, callerUid: caller.uid });
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: 'action must be suspend | resume | unlink | list-linked | update-language' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'request failed' });
  }
}
