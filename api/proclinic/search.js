// POST /api/proclinic/search — Search ProClinic customers
import { createSession, handleCors } from './_lib/session.js';
import { extractSearchResults } from './_lib/scraper.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { origin, email, password, query } = req.body;
    if (!origin || !query) {
      return res.status(400).json({ success: false, error: 'Missing origin or query' });
    }

    const session = await createSession(origin, email, password);
    const html = await session.fetchText(`${origin}/admin/customer?q=${encodeURIComponent(query)}`);
    const customers = extractSearchResults(html);

    return res.status(200).json({ success: true, customers });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    return res.status(200).json(resp);
  }
}
