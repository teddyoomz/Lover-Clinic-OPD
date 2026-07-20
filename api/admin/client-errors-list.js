// ─── /api/admin/client-errors-list (2026-07-19) ────────────────────────────
// Admin viewer read path for client_error_log. The collection is DEFAULT-DENY
// in firestore.rules on purpose (no client-SDK access at all — beacon writes +
// admin reads both go through admin-SDK endpoints; zero rules change).
// Consumed by InfraHealthSection.jsx (groups client-side via groupClientErrors).
import { getFirestore } from 'firebase-admin/firestore';
import { verifyAdminOrPermissionToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

export default async function handler(req, res) {
  const auth = await verifyAdminOrPermissionToken(req, res, 'system_config_management');
  if (!auth) return; // 401/403 already written

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const db = getFirestore(); // app already initialized by verify helper
    const snap = await db.collection(`${PREFIX}/client_error_log`)
      .orderBy('createdAtMs', 'desc') // single-field — no composite index needed
      .limit(100)
      .get();
    const rows = snap.docs.map(d => {
      const x = d.data() || {};
      return {
        id: d.id,
        message: x.message || '',
        stack: String(x.stack || '').slice(0, 600), // viewer preview only
        url: x.url || '',
        ua: x.ua || '',
        surface: x.surface || 'unknown',
        hash: x.hash || '',
        kind: x.kind === 'telemetry' ? 'telemetry' : 'error', // AV212 hunt R1: keep the discriminator (viewer can label/filter telemetry vs real errors)
        createdAtMs: Number(x.createdAtMs) || 0,
      };
    });
    return res.status(200).json({ ok: true, rows });
  } catch (e) {
    console.error('[client-errors-list] failed:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
