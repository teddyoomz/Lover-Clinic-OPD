// POST /api/proclinic/login — Test ProClinic connection
import { createSession, handleCors } from './_lib/session.js';
import { verifyAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { origin, email, password } = req.body || {};
    await createSession(origin, email, password);
    return res.status(200).json({ success: true });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    return res.status(200).json(resp);
  }
}
