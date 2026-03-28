// ─── Clear ProClinic Session Cache ───────────────────────────────────────────
// Clears cached cookies from Firestore so the next API call forces a fresh login
// with current Vercel env vars (PROCLINIC_ORIGIN/EMAIL/PASSWORD).
// Use after changing ProClinic credentials in Vercel dashboard — no redeploy needed.

import { handleCors } from './_lib/session.js';
import { verifyAuth } from './_lib/auth.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const SESSION_DOC_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/proclinic_session`;

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    // Delete the cached session document from Firestore
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
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
