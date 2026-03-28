import { createSession, handleCors } from './_lib/session.js';
import { extractSelectOptions } from './_lib/scraper.js';
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    const session = await createSession();
    const html = await session.fetchText(`${session.origin}/admin/customer/create`);
    const countries = extractSelectOptions(html, 'country');
    return res.status(200).json({ success: true, count: countries.length, countries });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
