// ─── Connection API (consolidated) ───────────────────────────────────────────
// Actions: login, credentials, clear
import { createSession, handleCors, SessionExpiredError } from './_lib/session.js';
import { verifyAuth } from './_lib/auth.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const SESSION_DOC_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/proclinic_session`;

// ─── Action: login (test connection) ────────────────────────────────────────

async function handleLogin(req, res) {
  const origin = process.env.PROCLINIC_ORIGIN;
  if (!origin) {
    return res.status(200).json({ success: false, error: 'ไม่พบ PROCLINIC_ORIGIN ใน Vercel env vars' });
  }

  // Load cached cookies from Firestore directly (no auto-login)
  let cachedCookies = null;
  try {
    const cacheRes = await fetch(`${FIRESTORE_BASE}/${SESSION_DOC_PATH}`);
    if (cacheRes.ok) {
      const doc = await cacheRes.json();
      const docOrigin = doc.fields?.origin?.stringValue;
      const cookieValues = doc.fields?.cookies?.arrayValue?.values;
      if (docOrigin === origin && cookieValues?.length) {
        cachedCookies = cookieValues.map(v => v.stringValue).filter(Boolean);
      }
    }
  } catch (_) {}

  if (!cachedCookies) {
    // No cookies at all → need login
    const err = new SessionExpiredError('ไม่มี session cache — ต้อง login ใหม่');
    err.extensionNeeded = true;
    throw err;
  }

  // Test cached cookies by fetching a real page — NO auto-recovery
  const cookieHeader = cachedCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  const testRes = await fetch(`${origin}/admin/customer`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': cookieHeader,
    },
    redirect: 'follow',
  });
  const testText = await testRes.text();

  // Check if we got the login page instead of the actual page
  const isLoginPage = testText.includes('action="/login"')
    || (testText.includes('/login') && testText.includes('name="password"') && !testText.includes('admin/customer'));

  if (isLoginPage) {
    const err = new SessionExpiredError('Session หมดอายุ — cookies ใช้งานไม่ได้แล้ว ต้อง login ใหม่');
    err.extensionNeeded = true;
    throw err;
  }

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
