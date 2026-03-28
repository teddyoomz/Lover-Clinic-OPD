// ─── ProClinic HTML Scraper ─────────────────────────────────────────────────
// Cheerio-based extraction of data from ProClinic HTML pages.
// Mirrors the DOM scraping logic from broker-extension/background.js.

import * as cheerio from 'cheerio';

// ─── CSRF Token ─────────────────────────────────────────────────────────────

export function extractCSRF(html) {
  const $ = cheerio.load(html);
  return $('meta[name="csrf-token"]').attr('content') || null;
}

// ─── Customer ID from URL ───────────────────────────────────────────────────

export function extractCustomerId(url) {
  if (!url) return null;
  const m = url.match(/\/admin\/customer\/(\d+)/);
  return m ? m[1] : null;
}

// ─── HN from edit page ─────────────────────────────────────────────────────

export function extractHN(html) {
  const $ = cheerio.load(html);
  return $('input[name="hn_no"]').val() || null;
}

// ─── Search results extraction ──────────────────────────────────────────────
// Mirrors extractCustomersFromSearchResults() in background.js

export function extractSearchResults(html) {
  const $ = cheerio.load(html);
  const customers = [];

  $('button.btn-delete[data-url]').each((_, btn) => {
    const dataUrl = $(btn).attr('data-url') || '';
    const m = dataUrl.match(/\/customer\/(\d+)$/);
    if (!m) return;
    const id = m[1];

    // Walk up DOM to find the row container
    let row = $(btn).parent();
    for (let i = 0; i < 12; i++) {
      if (!row.length) break;
      if (row.find('button.btn-delete').length === 1) break;
      row = row.parent();
    }

    let name = null, phone = null;
    if (row.length) {
      const text = row.text();

      // Thai prefix name pattern
      const prefixRx = /(?:นาย|นาง(?:สาว)?|ด\.(?:ช|ญ)\.|Mr\.|Ms\.|Mrs\.|Miss|ดร\.|คุณ)\s+[\u0E00-\u0E7Fa-zA-Z0-9]+(?:\s+[\u0E00-\u0E7Fa-zA-Z0-9]+)*/;
      const nm = text.match(prefixRx);
      if (nm) name = nm[0].replace(/\s+/g, ' ').trim();

      // Phone pattern
      const ph = text.match(/0\d{8,9}/);
      if (ph) phone = ph[0];
    }

    customers.push({ id, name, phone });
  });

  return customers;
}

// ─── Best match from search results ─────────────────────────────────────────
// Mirrors findBestMatch() in background.js

export function findBestMatch(customers, patient) {
  if (!customers || customers.length === 0) return null;
  if (customers.length === 1) return customers[0];

  const normalPhone = (s) => (s || '').replace(/\D/g, '').replace(/^66/, '0');

  const scored = customers.map(c => {
    let score = 0;
    const cp = normalPhone(c.phone);
    const pp = normalPhone(patient.phone);
    if (cp && pp && cp === pp) score += 100;

    const cName = (c.name || '').toLowerCase().replace(/\s+/g, ' ');
    const tokens = [patient.firstName, patient.lastName].filter(Boolean).map(t => t.toLowerCase());
    tokens.forEach(t => { if (cName.includes(t)) score += 10; });

    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0] : customers[0];
}

// ─── Courses extraction ─────────────────────────────────────────────────────
// Mirrors scrapeProClinicCourses() in background.js

export function extractCourses(html, tabSelector) {
  const $ = cheerio.load(html);
  const tab = $(tabSelector);
  if (!tab.length) return [];

  return tab.find('.card').map((_, card) => {
    const body = $(card).find('.card-body').first();
    const container = body.length ? body : $(card);
    const lis = container.find('li');
    const li0 = lis.eq(0);
    const li1 = lis.eq(1);

    const h6 = li0.find('h6').first();
    // Get text node (first child text, not nested elements)
    let name = '';
    if (h6.length) {
      const clone = h6.clone();
      clone.children().remove();
      name = clone.text().trim();
      if (!name) name = h6.text().split('\n')[0].trim();
    }

    const expiry = li0.find('p.small').first().text().trim();
    const value = li0.find('.text-gray-2.small.mt-1').first().text().trim();
    const status = li0.find('.badge').first().text().trim();
    const product = li1.length ? li1.text().trim().split('\n')[0].trim() : '';
    const qty = li1.length ? (li1.find('.float-end').first().text().trim()) : '';

    return { name, expiry, value, status, product, qty };
  }).get().filter(c => c.name);
}

// ─── Pagination detection ───────────────────────────────────────────────────

export function extractPagination(html, tabSelector) {
  const $ = cheerio.load(html);
  const tab = $(tabSelector);
  if (!tab.length) return { param: null, maxPage: 1 };

  // Look for pagination in tab pane or parent
  const pane = tab.closest('.tab-pane').length ? tab.closest('.tab-pane') : tab;
  let pag = pane.find('ul.pagination').first();
  if (!pag.length) pag = pane.parent().find('ul.pagination').first();
  if (!pag.length) return { param: null, maxPage: 1 };

  let param = null, maxPage = 1;
  pag.find('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/[?&]([a-z_]*page)=(\d+)/i);
    if (m) {
      param = param || m[1];
      maxPage = Math.max(maxPage, parseInt(m[2]));
    }
  });

  return { param, maxPage };
}

// ─── Appointments extraction ────────────────────────────────────────────────

export function extractAppointments(html) {
  const $ = cheerio.load(html);
  const modal = $('#activeAppointmentModal');
  if (!modal.length) return [];

  return modal.find('.card').map((_, card) => {
    const body = $(card).find('.card-body').first();
    const container = body.length ? body : $(card);
    const children = container.children();

    const dateTimeText = children.eq(0).find('strong').first().text().trim();
    const pipe = dateTimeText.indexOf('|');
    if (pipe < 0) return null;

    const date = dateTimeText.slice(0, pipe).trim();
    const time = dateTimeText.slice(pipe + 1).trim();
    const doctor = children.eq(1).text().trim();
    const spans = children.eq(2).find('span');
    const branch = spans.eq(0).text().trim();
    const room = spans.eq(1).text().trim();
    const noteRaw = children.eq(3).text().trim();
    const notes = noteRaw.replace(/^โน๊ต:\s*/u, '').trim();

    return { date, time, doctor, branch, room, notes };
  }).get().filter(a => a && a.date);
}

// ─── Patient name from profile page ─────────────────────────────────────────

export function extractPatientName(html) {
  const $ = cheerio.load(html);
  const rawName = (
    $('h5.mb-0').first().text().trim() ||
    $('.customer-name').first().text().trim() ||
    $('title').text().split('|')[0].trim()
  );
  return (rawName && rawName !== '0') ? rawName : '';
}

// ─── Extract all form fields from edit page ─────────────────────────────────

export function extractFormFields(html) {
  const $ = cheerio.load(html);
  const form = $('form').first();
  if (!form.length) return {};

  const fields = {};
  form.find('input, textarea, select').each((_, el) => {
    const name = $(el).attr('name');
    if (!name) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      fields[name] = $(el).find('option:selected').val() || '';
    } else if (tag === 'input' && $(el).attr('type') === 'checkbox') {
      if ($(el).is(':checked')) fields[name] = $(el).val() || 'on';
    } else if (tag === 'input' && $(el).attr('type') === 'radio') {
      if ($(el).is(':checked')) fields[name] = $(el).val();
    } else {
      fields[name] = $(el).val() || '';
    }
  });

  return fields;
}

// ─── Extract all options from a specific select field ─────────────────────────

export function extractSelectOptions(html, selectName) {
  const $ = cheerio.load(html);
  const options = [];
  $(`select[name="${selectName}"] option`).each((_, opt) => {
    const val = $(opt).val();
    if (val) options.push(val);
  });
  return options;
}

// ─── Extract validation errors ──────────────────────────────────────────────

export function extractValidationErrors(html) {
  const $ = cheerio.load(html);
  const errEl = $('.invalid-feedback').not('[style*="none"]').first();
  if (errEl.length) return errEl.text().trim().substring(0, 200);
  const alert = $('.alert-danger, .text-danger').first();
  if (alert.length) return alert.text().trim().substring(0, 200);
  return null;
}
