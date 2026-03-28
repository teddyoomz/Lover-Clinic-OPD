// ─── Return ProClinic credentials to authenticated admin ─────────────────────
// Used by Cookie Relay extension to auto-login without manual popup config.

import { handleCors } from './_lib/session.js';
import { verifyAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  const origin = process.env.PROCLINIC_ORIGIN || '';
  const email = process.env.PROCLINIC_EMAIL || '';
  const password = process.env.PROCLINIC_PASSWORD || '';

  if (!origin || !email || !password) {
    return res.status(200).json({ success: false, error: 'ProClinic credentials not configured in Vercel' });
  }

  return res.status(200).json({ success: true, origin, email, password });
}
