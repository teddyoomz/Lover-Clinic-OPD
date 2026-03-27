// POST /api/proclinic/login — Test ProClinic credentials
import { performLogin, handleCors } from './_lib/session.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { origin, email, password } = req.body;
    if (!origin || !email || !password) {
      return res.status(400).json({ success: false, error: 'Missing origin, email, or password' });
    }

    await performLogin(origin, email, password);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
