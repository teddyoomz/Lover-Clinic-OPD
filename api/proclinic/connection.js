// ─── Connection API (consolidated) ───────────────────────────────────────────
// Actions: login, credentials, clear
import { createSession, handleCors } from './_lib/session.js';
import { verifyAuth } from './_lib/auth.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const SESSION_DOC_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/proclinic_session`;

// ─── Action: login (test connection) ────────────────────────────────────────

async function handleLogin(req, res) {
  await createSession();
  return res.status(200).json({ success: true });
}

// ─── Action: credentials ────────────────────────────────────────────────────

async function handleCredentials(req, res) {
  const origin = process.env.PROCLINIC_ORIGIN || '';
  const email = process.env.PROCLINIC_EMAIL || '';
  const password = process.env.PROCLINIC_PASSWORD || '';

  if (!origin || !email || !password) {
    return res.status(200).json({ success: false, error: 'ProClinic credentials not configured in Vercel' });
  }

  return res.status(200).json({ success: true, origin, email, password });
}

// ─── Action: clear (clear session cache) ────────────────────────────────────

async function handleClear(req, res) {
  const deleteRes = await fetch(`${FIRESTORE_BASE}/${SESSION_DOC_PATH}`, {
    method: 'DELETE',
  });

  if (deleteRes.ok || deleteRes.status === 404) {
    return res.status(200).json({
      success: true,
      message: 'ล้าง session cache สำเร็จ — การเชื่อมต่อ ProClinic ครั้งถัดไปจะ login ใหม่ด้วย credentials ปัจจุบัน',
    });
  }

  return res.status(500).json({
    success: false,
    error: `ลบ session cache ไม่สำเร็จ (status ${deleteRes.status})`,
  });
}

// ─── Router ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { action } = req.body || {};
    if (action === 'login') return await handleLogin(req, res);
    if (action === 'credentials') return await handleCredentials(req, res);
    if (action === 'clear') return await handleClear(req, res);
    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    if (err.debug) resp.debug = err.debug;
    return res.status(200).json(resp);
  }
}
