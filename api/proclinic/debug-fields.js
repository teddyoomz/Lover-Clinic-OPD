// GET /api/proclinic/debug-fields — Dump all form fields from ProClinic create page
// TEMPORARY: ใช้ดู field names จริงของ ProClinic แล้วลบทิ้ง
import { createSession, handleCors } from './_lib/session.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const { origin, email, password } = req.body || {};
    const session = await createSession(origin, email, password);
    const base = session.origin;

    const createHtml = await session.fetchText(`${base}/admin/customer/create`);
    const $ = cheerio.load(createHtml);
    const form = $('form').first();

    const fields = [];
    form.find('select').each((_, el) => {
      const name = $(el).attr('name');
      if (!name) return;
      const options = [];
      $(el).find('option').each((_, opt) => {
        options.push({ value: $(opt).val(), text: $(opt).text().trim() });
      });
      const selected = $(el).find('option:selected').val() || '';
      fields.push({ type: 'select', name, selected, options });
    });

    form.find('input[type="radio"]').each((_, el) => {
      const name = $(el).attr('name');
      const id = $(el).attr('id');
      const value = $(el).val();
      const checked = $(el).is(':checked');
      fields.push({ type: 'radio', name, id, value, checked });
    });

    form.find('input[type="text"], input[type="hidden"], input[type="number"], input[type="tel"], input[type="email"], textarea').each((_, el) => {
      const name = $(el).attr('name');
      if (!name) return;
      fields.push({ type: el.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'input', name, value: $(el).val() || '' });
    });

    return res.status(200).json({ success: true, fieldCount: fields.length, fields });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
