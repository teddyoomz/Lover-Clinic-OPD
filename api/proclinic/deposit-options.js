// ─── Deposit Form Options ────────────────────────────────────────────────────
// Fetch select options from ProClinic's deposit form for admin dropdowns
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF } from './_lib/scraper.js';
import * as cheerio from 'cheerio';

function extractAllSelectOptions($, selectName) {
  const options = [];
  $(`select[name="${selectName}"] option`).each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val) options.push({ value: val, label: text });
  });
  return options;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const session = await createSession();
    const base = session.origin;

    const html = await session.fetchText(`${base}/admin/deposit`);
    const $ = cheerio.load(html);

    const options = {
      sellers: extractAllSelectOptions($, 'seller_1_id'),
      advisors: extractAllSelectOptions($, 'advisor_id'),
      doctors: extractAllSelectOptions($, 'doctor_id'),
      assistants: extractAllSelectOptions($, 'doctor_assistant_id[]'),
      rooms: extractAllSelectOptions($, 'examination_room_id'),
      appointmentChannels: extractAllSelectOptions($, 'source'),
      appointmentStartTimes: extractAllSelectOptions($, 'appointment_start_time'),
      appointmentEndTimes: extractAllSelectOptions($, 'appointment_end_time'),
      customerSources: extractAllSelectOptions($, 'customer_source'),
    };

    return res.status(200).json({ success: true, options });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    return res.status(200).json(resp);
  }
}
