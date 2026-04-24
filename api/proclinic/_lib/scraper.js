// ─── ProClinic HTML Scraper ─────────────────────────────────────────────────
// Cheerio-based extraction of data from ProClinic HTML pages.
// Mirrors the DOM scraping logic from broker-extension/background.js.
//
// @dev-only — STRIP BEFORE PRODUCTION RELEASE (rule H-bis)
// This module only exists to seed master_data/* from the trial ProClinic
// server during development. Real production has no ProClinic dependency.

import * as cheerio from 'cheerio';

// ─── Generic list-page extractor (Phase 11.8c) ──────────────────────────────
// Used by handlers for simple table-based list pages where each row has an
// edit/delete button that embeds the entity id in its URL. Extracts id +
// the first N table cells as named fields. Tolerant of missing rows/cells.
//
// Config shape: { idPattern: RegExp, fieldMap: { fieldName: cellIndex } }
//   idPattern  — capture group 1 = id (e.g. /\/admin\/product-group\/(\d+)/)
//   fieldMap   — map cell 0..N → field name on the emitted item

export function extractGenericListPage(html, { idPattern, fieldMap = {} }) {
  const $ = cheerio.load(html);
  const rows = [];
  $('table tbody tr').each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.find('td');
    if (cells.length === 0) return;

    // Find id from any anchor/button URL in the row that matches idPattern.
    let id = null;
    $tr.find('a[href], button[data-url], a[data-url]').each((_, el) => {
      if (id) return;
      const href = $(el).attr('href') || $(el).attr('data-url') || '';
      const m = href.match(idPattern);
      if (m && m[1]) id = m[1];
    });
    if (!id) return;

    const row = { id };
    for (const [fieldName, cellIdx] of Object.entries(fieldMap)) {
      row[fieldName] = cells.eq(cellIdx).text().trim();
    }
    // Keep last-cell badge status if present.
    const statusBadge = $tr.find('.badge').last().text().trim();
    if (statusBadge && !row.status) row.status = statusBadge;
    rows.push(row);
  });
  return rows;
}

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

    let name = null, phone = null, hn = null;
    if (row.length) {
      const text = row.text();

      // Try name from link to customer page first
      const nameLink = row.find(`a[href*="/customer/${id}"]`).first().text().trim();
      if (nameLink && nameLink.length > 1) {
        name = nameLink.replace(/\s+/g, ' ').trim();
      }
      // Fallback: Thai prefix name pattern
      if (!name) {
        const prefixRx = /(?:นาย|นาง(?:สาว)?|ด\.(?:ช|ญ)\.|Mr\.|Ms\.|Mrs\.|Miss|ดร\.|คุณ)\s+[\u0E00-\u0E7Fa-zA-Z0-9]+(?:\s+[\u0E00-\u0E7Fa-zA-Z0-9]+)*/;
        const nm = text.match(prefixRx);
        if (nm) name = nm[0].replace(/\s+/g, ' ').trim();
      }

      // Phone pattern
      const ph = text.match(/0\d{8,9}/);
      if (ph) phone = ph[0];

      // HN pattern (e.g. MC-69001234, HN12345, HN68000229)
      const hnMatch = text.match(/HN[\s-]?\d+|MC-?\d+/i);
      if (hnMatch) hn = hnMatch[0].trim();
    }

    customers.push({ id, name, phone, hn });
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

// ─── Master Data: DF groups extraction (Phase 14.x) ────────────────────────
// ProClinic's /admin/df/df-group page shows ONE group's rate matrix at a
// time via query param `?df_group_id=X`. The list of groups lives in the
// tab strip (anchor links with href pattern `?df_group_id=\d+`). Rates for
// the currently-selected group are rendered as ~600 form inputs named
// `df_group_{groupId}_df_course_{courseId}` (the value input) plus
// `..._type` radios (labels "%" / "บาท").
//
// Two extractors so the master.js handler can orchestrate: fetch list
// page once → extract {id, name} for every group → fetch each group's
// own page → extract rates[] → combine.

/**
 * Extract the list of DF groups from any /admin/df/df-group* page by
 * walking the tab anchor links. Each group has a link like
 *   <a href=".../admin/df/df-group?df_group_id=28">ตัดไหม...</a>
 * The currently-active tab's anchor also matches; the "คัดลอกค่ามือ"
 * copy-button text often trails the group name — we strip anything
 * after the first newline.
 *
 * @returns {Array<{id: string, name: string}>}
 */
export function extractDfGroupList(html) {
  const $ = cheerio.load(html);
  const byId = new Map();
  $('a[href*="df_group_id="]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/df_group_id=(\d+)/);
    if (!m) return;
    const id = m[1];
    if (byId.has(id)) return;
    // Anchor text often contains "ชื่อกลุ่ม\n\t\t\tคัดลอกค่ามือ" — first
    // non-empty line is the real name.
    const raw = $(a).text() || '';
    const name = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || id;
    byId.set(id, { id, name });
  });
  return Array.from(byId.values());
}

/**
 * Extract rates[] for the currently-selected group on a DF group detail
 * page. Walks every input named `df_group_{G}_df_course_{C}` (without the
 * `_type` suffix) and pairs it with the corresponding `_type` radio's
 * checked value to classify baht vs percent.
 *
 * ProClinic renders two `_type` radios per course — label "%" and "บาท" —
 * with `checked="checked"` on whichever is active. We treat any non-
 * percent label as baht since the UI only offers those two types.
 *
 * @param {string} html            - page HTML
 * @param {string} [expectedGroupId] - if provided, filter to rows for this
 *                                     group (defensive against stray fields)
 * @returns {Array<{courseId: string, value: number, type: 'baht'|'percent'}>}
 */
export function extractDfGroupRates(html, expectedGroupId = '') {
  const $ = cheerio.load(html);
  const valueByField = new Map();   // field name → numeric value
  const typeByField = new Map();    // "df_group_X_df_course_Y" → 'baht'|'percent'

  $('input[name^="df_group_"][name*="_df_course_"]').each((_, el) => {
    const name = $(el).attr('name') || '';
    const type = ($(el).attr('type') || '').toLowerCase();
    const m = name.match(/^df_group_(\d+)_df_course_(\d+)(_type)?$/);
    if (!m) return;
    const [, gId, cId, isType] = m;
    if (expectedGroupId && String(expectedGroupId) !== gId) return;
    const fieldKey = `df_group_${gId}_df_course_${cId}`;
    if (isType) {
      // Type radio — only record when checked.
      if (type !== 'radio') return;
      const isChecked = $(el).attr('checked') != null || $(el).is(':checked');
      if (!isChecked) return;
      // ProClinic convention: label "%" = percent, anything else = baht.
      const label = ($(el).attr('aria-label') || $(el).next().text() || '').trim();
      // Fallback: read the value attr — ProClinic sets value="%" or value="bath"
      const valAttr = ($(el).attr('value') || '').trim();
      const marker = (label + ' ' + valAttr).toLowerCase();
      typeByField.set(fieldKey, marker.includes('%') || marker.includes('percent') ? 'percent' : 'baht');
    } else {
      if (type !== 'number') return;
      const raw = $(el).attr('value');
      const def = $(el).attr('defaultValue');
      const v = Number(raw ?? def ?? 0);
      valueByField.set(fieldKey, Number.isFinite(v) ? v : 0);
    }
  });

  const rates = [];
  for (const [fieldKey, value] of valueByField.entries()) {
    const m = fieldKey.match(/^df_group_(\d+)_df_course_(\d+)$/);
    if (!m) continue;
    const courseId = m[2];
    rates.push({
      courseId,
      value,
      type: typeByField.get(fieldKey) || 'baht',
    });
  }
  return rates;
}

// ─── Master Data: DF per-staff rate overrides (Phase 14.x) ────────────────
// Mirrors the extractDfGroup* pair above, but for the doctor-level
// (/admin/df/doctor) and assistant-level (/admin/df/assistance) pages.
// ProClinic names these inputs `user_{staffId}_df_course_{courseId}` —
// distinct from df-group's `df_group_` prefix. Same checked-radio
// semantics for the type selector.

/**
 * Extract the list of staff (doctor or assistant) from any DF rate page
 * via `?user_id=X` anchor links. Used for both `/admin/df/doctor` and
 * `/admin/df/assistance?position=ผู้ช่วยแพทย์`.
 *
 * @returns {Array<{id: string, name: string}>}
 */
export function extractDfStaffList(html) {
  const $ = cheerio.load(html);
  const byId = new Map();
  $('a[href*="user_id="]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/user_id=(\d+)/);
    if (!m) return;
    const id = m[1];
    if (byId.has(id)) return;
    const raw = $(a).text() || '';
    const name = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || id;
    byId.set(id, { id, name });
  });
  return Array.from(byId.values());
}

/**
 * Extract rates[] for one staff member from their DF rate page. Walks
 * every `user_{S}_df_course_{C}` input + paired `_type` radio.
 *
 * @param {string} html
 * @param {string} [expectedStaffId]
 * @returns {Array<{courseId: string, value: number, type: 'baht'|'percent'}>}
 */
export function extractDfStaffRates(html, expectedStaffId = '') {
  const $ = cheerio.load(html);
  const valueByField = new Map();
  const typeByField = new Map();

  $('input[name^="user_"][name*="_df_course_"]').each((_, el) => {
    const name = $(el).attr('name') || '';
    const inputType = ($(el).attr('type') || '').toLowerCase();
    const m = name.match(/^user_(\d+)_df_course_(\d+)(_type)?$/);
    if (!m) return;
    const [, sId, cId, isType] = m;
    if (expectedStaffId && String(expectedStaffId) !== sId) return;
    const fieldKey = `user_${sId}_df_course_${cId}`;
    if (isType) {
      if (inputType !== 'radio') return;
      const isChecked = $(el).attr('checked') != null || $(el).is(':checked');
      if (!isChecked) return;
      const label = ($(el).attr('aria-label') || $(el).next().text() || '').trim();
      const valAttr = ($(el).attr('value') || '').trim();
      const marker = (label + ' ' + valAttr).toLowerCase();
      typeByField.set(fieldKey, marker.includes('%') || marker.includes('percent') ? 'percent' : 'baht');
    } else {
      if (inputType !== 'number') return;
      const raw = $(el).attr('value');
      const def = $(el).attr('defaultValue');
      const v = Number(raw ?? def ?? 0);
      valueByField.set(fieldKey, Number.isFinite(v) ? v : 0);
    }
  });

  const rates = [];
  for (const [fieldKey, value] of valueByField.entries()) {
    const m = fieldKey.match(/^user_(\d+)_df_course_(\d+)$/);
    if (!m) continue;
    rates.push({
      courseId: m[2],
      value,
      type: typeByField.get(fieldKey) || 'baht',
    });
  }
  return rates;
}

// ─── Master Data: Products extraction ───────────────────────────────────────
// Scrapes /admin/product list page — returns array of product objects

export function extractProductList(html) {
  const $ = cheerio.load(html);
  const products = [];

  // ProClinic uses a table or card-based list — find rows in table tbody
  $('table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 5) return;

    // Extract product ID from edit/delete button data-url
    let id = null;
    const editLink = $(tr).find('a[href*="/product/"]').first();
    if (editLink.length) {
      const m = editLink.attr('href')?.match(/\/product\/(\d+)/);
      if (m) id = m[1];
    }
    if (!id) {
      const delBtn = $(tr).find('button[data-url*="/product/"]').first();
      if (delBtn.length) {
        const m = delBtn.attr('data-url')?.match(/\/product\/(\d+)/);
        if (m) id = m[1];
      }
    }

    const name = cells.eq(0).text().trim();
    const unit = cells.eq(1).text().trim();
    const priceText = cells.eq(2).text().trim().replace(/[^\d.]/g, '');
    const price = priceText ? parseFloat(priceText) : 0;
    const category = cells.eq(3).text().trim();
    const type = cells.eq(4).text().trim();
    const status = $(tr).find('.badge').last().text().trim() || 'ใช้งาน';

    if (name) {
      products.push({ id, name, unit, price, category, type, status });
    }
  });

  return products;
}

// ─── Master Data: Doctors/Assistants extraction ─────────────────────────────
// Scrapes /admin/doctor list page

export function extractDoctorList(html) {
  const $ = cheerio.load(html);
  const doctors = [];

  $('table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 5) return;

    let id = null;
    const editLink = $(tr).find('a[href*="/doctor/"]').first();
    if (editLink.length) {
      const m = editLink.attr('href')?.match(/\/doctor\/(\d+)/);
      if (m) id = m[1];
    }
    if (!id) {
      const delBtn = $(tr).find('button[data-url*="/doctor/"]').first();
      if (delBtn.length) {
        const m = delBtn.attr('data-url')?.match(/\/doctor\/(\d+)/);
        if (m) id = m[1];
      }
    }

    // Name is the first text node inside the <p> tag (before <span>, <br>, <a>)
    const nameCell = cells.eq(0);
    const pTag = nameCell.find('p').first();
    let name = '';
    if (pTag.length) {
      // Get only the first text node (the name) — before any child elements
      name = pTag.contents().filter(function() { return this.type === 'text'; }).first().text().trim();
    }
    if (!name) name = nameCell.find('strong, b').first().text().trim() || nameCell.contents().first().text().trim();
    name = name.split('\n')[0].trim();
    const email = nameCell.find('.__cf_email__').first().attr('data-cfemail') ? '[cf-protected]' : (nameCell.find('small, .text-muted').first().text().trim().replace(/\s+/g, '') || '');

    const color = cells.eq(1).text().trim();
    const hourlyRate = cells.eq(2).text().trim().replace(/[^\d.]/g, '');
    const position = cells.eq(3).text().trim(); // แพทย์ or ผู้ช่วยแพทย์
    const branches = cells.eq(4).text().trim();
    const status = $(tr).find('.badge').last().text().trim() || 'ใช้งาน';

    if (name) {
      doctors.push({
        id, name, email, color,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : 0,
        position, branches, status
      });
    }
  });

  return doctors;
}

// ─── Master Data: Staff extraction ──────────────────────────────────────────
// Scrapes /admin/user list page

export function extractStaffList(html) {
  const $ = cheerio.load(html);
  const staff = [];

  $('table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 5) return;

    let id = null;
    const editLink = $(tr).find('a[href*="/user/"]').first();
    if (editLink.length) {
      const m = editLink.attr('href')?.match(/\/user\/(\d+)/);
      if (m) id = m[1];
    }
    if (!id) {
      const delBtn = $(tr).find('button[data-url*="/user/"]').first();
      if (delBtn.length) {
        const m = delBtn.attr('data-url')?.match(/\/user\/(\d+)/);
        if (m) id = m[1];
      }
    }

    const nameCell = cells.eq(0);
    const pTag = nameCell.find('p').first();
    let name = '';
    if (pTag.length) {
      name = pTag.contents().filter(function() { return this.type === 'text'; }).first().text().trim();
    }
    if (!name) name = nameCell.find('strong, b').first().text().trim() || nameCell.contents().first().text().trim();
    name = name.split('\n')[0].trim();
    const email = nameCell.find('.__cf_email__').first().attr('data-cfemail') ? '[cf-protected]' : (nameCell.find('small, .text-muted').first().text().trim().replace(/\s+/g, '') || '');
    const color = cells.eq(1).text().trim();
    const position = cells.eq(2).text().trim();
    const branches = cells.eq(3).text().trim();
    const status = $(tr).find('.badge').last().text().trim() || 'ใช้งาน';

    if (name) {
      staff.push({ id, name, email, color, position, branches, status });
    }
  });

  return staff;
}

// ─── Master Data: Course list extraction ────────────────────────────────────
// Scrapes /admin/course list page

export function extractCourseList(html) {
  const $ = cheerio.load(html);
  const courses = [];

  $('table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 5) return;

    let id = null;
    const editLink = $(tr).find('a[href*="/course/"]').first();
    if (editLink.length) {
      const m = editLink.attr('href')?.match(/\/course\/(\d+)/);
      if (m) id = m[1];
    }
    if (!id) {
      const delBtn = $(tr).find('button[data-url*="/course/"]').first();
      if (delBtn.length) {
        const m = delBtn.attr('data-url')?.match(/\/course\/(\d+)/);
        if (m) id = m[1];
      }
    }

    const code = cells.eq(0).text().trim();
    const nameCell = cells.eq(1);
    const name = nameCell.contents().first().text().trim() || nameCell.text().split('\n')[0].trim();
    const courseType = nameCell.find('.badge, small').first().text().trim(); // ระบุสินค้า/บุฟเฟต์/เหมา

    // Products in course — may have sub-list
    const productsCell = cells.eq(2);
    const productTexts = [];
    productsCell.find('li, div, span').each((_, el) => {
      const t = $(el).text().trim();
      if (t && t.length < 100) productTexts.push(t);
    });
    const products = productTexts.length ? productTexts.join('; ') : productsCell.text().trim().substring(0, 200);

    const category = cells.eq(3).text().trim();
    const priceText = cells.eq(4).text().trim().replace(/[^\d.]/g, '');
    const price = priceText ? parseFloat(priceText) : 0;
    const status = $(tr).find('.badge').last().text().trim() || 'ใช้งาน';

    if (name) {
      courses.push({ id, code, name, courseType, products, category, price, status });
    }
  });

  return courses;
}

// ─── Generic pagination for list pages ──────────────────────────────────────

export function extractListPagination(html) {
  const $ = cheerio.load(html);
  const pag = $('ul.pagination, .pagination').first();
  if (!pag.length) return { maxPage: 1 };

  let maxPage = 1;
  pag.find('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/[?&]page=(\d+)/i);
    if (m) maxPage = Math.max(maxPage, parseInt(m[2] || m[1]));
    // Also try matching just numbers in the link text
    const text = $(a).text().trim();
    const num = parseInt(text);
    if (!isNaN(num) && num > maxPage) maxPage = num;
  });

  return { maxPage };
}

// ─── Treatment List: Extract from customer detail page ─────────────────────
// Scrapes /admin/customer/{id}?treatment_page=N center column
// Structure: .card.mb-4 > .card-body > .timeline > div (each = 1 record)

export function extractTreatmentList(html) {
  const $ = cheerio.load(html);
  const treatments = [];

  // Find the center column card that contains treatment timeline
  const timeline = $('.timeline.mb-2').first();
  if (!timeline.length) return treatments;

  timeline.children('div').each((_, record) => {
    const $r = $(record);
    const t = {};

    // Section 0: header — date + edit link (contains treatment ID)
    const editLink = $r.find('a[href*="/treatment/"][href*="/edit"]').first();
    if (editLink.length) {
      const m = editLink.attr('href')?.match(/treatment\/(\d+)\/edit/);
      t.id = m ? m[1] : null;
    }
    if (!t.id) return; // skip non-treatment entries

    // Cancel link (for detecting cancelled records)
    const cancelLink = $r.find('a.text-danger').first();
    t.canCancel = cancelLink.length > 0;

    // Date
    const dateEl = $r.find('p.d-inline-block.strong, p.strong').first();
    t.date = dateEl.text().trim();

    // Section 1: branch + doctor + assistants
    const infoSection = $r.children('div').eq(1);
    const spans = infoSection.find('span.me-2, span.me-0');
    const parts = [];
    spans.each((_, s) => {
      const text = $(s).text().trim();
      if (text && text !== '-') parts.push(text);
    });
    // First span = branch, second = doctor, rest = assistants
    t.branch = '';
    t.doctor = '';
    t.assistants = [];
    parts.forEach((p, i) => {
      if (p.startsWith('สาขา')) t.branch = p.replace(/^สาขา\s*/, '');
      else if (i === 1 || (!t.doctor && i > 0)) t.doctor = p;
      else if (i > 1 && t.doctor) t.assistants.push(p);
    });

    // Section 2: treatment details — CC, DX, treatment info, plan, consent
    const detailSection = $r.find('.row.g-2.mb-2').first();
    if (detailSection.length) {
      const detailText = detailSection.text().trim();

      // Extract labeled fields
      const ccMatch = detailText.match(/อาการ\s*[:：]\s*(.+?)(?=วินิจฉัยโรค|รายละเอียดการรักษา|แผนการรักษา|หมายเหตุ|$)/s);
      t.cc = ccMatch ? ccMatch[1].trim() : '';

      const dxMatch = detailText.match(/วินิจฉัยโรค\s*[:：]\s*(.+?)(?=รายละเอียดการรักษา|แผนการรักษา|หมายเหตุ|$)/s);
      t.dx = dxMatch ? dxMatch[1].trim() : '';

      const txMatch = detailText.match(/รายละเอียดการรักษา\s*[:：]\s*(.+?)(?=แผนการรักษา|หมายเหตุ|คนไข้เซ็น|ดูเอกสาร|$)/s);
      t.treatmentInfo = txMatch ? txMatch[1].trim() : '';

      const planMatch = detailText.match(/แผนการรักษา\s*[:：]\s*(.+?)(?=หมายเหตุ|$)/s);
      t.plan = planMatch ? planMatch[1].trim() : '';

      // Consent status
      t.hasConsent = detailText.includes('คนไข้เซ็นยินยอม');
    }

    // Section 3: products used + retail items
    const productSection = $r.find('.row.g-2.mb-3').first();
    if (productSection.length) {
      t.productsText = productSection.text().trim().replace(/\s+/g, ' ');
    }

    treatments.push(t);
  });

  return treatments;
}

// ─── Treatment Pagination: customer page uses ?treatment_page=N ─────────────

export function extractTreatmentPagination(html) {
  const $ = cheerio.load(html);
  // Find pagination that uses treatment_page param
  let maxPage = 1;
  $('ul.pagination a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/[?&]treatment_page=(\d+)/);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1]));
  });
  return { maxPage };
}

// ─── Treatment Detail: Extract from edit page ──────────────────────────────
// Scrapes /admin/treatment/{id}/edit — returns full treatment data

export function extractTreatmentDetail(html) {
  const $ = cheerio.load(html);
  const t = {};

  // Basic fields from hidden inputs and form fields
  t.customerId = $('input[name="customer_id"]').val() || '';
  t.doctorId = $('select[name="doctor_id"]').val() || '';
  t.doctorName = $('select[name="doctor_id"] option:selected').text().trim();
  t.treatmentDate = $('input[name="treatment_date"]').val() || '';

  // Assistants (multi-select)
  t.assistantIds = [];
  $('select[name="doctor_assistant_id[]"] option:selected').each((_, opt) => {
    const val = $(opt).val();
    if (val) t.assistantIds.push(val);
  });

  // OPD Card — textareas
  t.symptoms = $('textarea[name="symptoms"]').val() || '';
  t.physicalExam = $('textarea[name="physical_exam"]').val() || '';
  t.diagnosis = $('textarea[name="diagnosis"]').val() || '';
  t.treatmentInfo = $('textarea[name="treatment_information"]').val() || '';
  t.treatmentPlan = $('textarea[name="treatment_plan"]').val() || '';
  t.treatmentNote = $('textarea[name="treatment_note"]').val() || '';
  t.additionalNote = $('textarea[name="additional_note"]').val() || '';

  // Vital signs
  t.vitals = {
    weight: $('input[name="ht_weight"]').val() || '',
    height: $('input[name="ht_height"]').val() || '',
    temperature: $('input[name="ht_body_temperature"]').val() || '',
    pulseRate: $('input[name="ht_pulse_rate"]').val() || '',
    respiratoryRate: $('input[name="ht_respiratory_rate"]').val() || '',
    systolicBP: $('input[name="ht_systolic_blood_pressure"]').val() || '',
    diastolicBP: $('input[name="ht_diastolic_blood_pressure"]').val() || '',
    oxygenSaturation: $('input[name="ht_oxygen_saturation"]').val() || '',
  };

  // Health info
  t.healthInfo = {
    bloodType: $('input[name="blood_type"]').val() || $('textarea[name="blood_type"]').val() || '',
    congenitalDisease: $('textarea[name="congenital_disease"]').val() || $('input[name="congenital_disease"]').val() || '',
    drugAllergy: $('textarea[name="history_of_drug_allergy"]').val() || $('input[name="history_of_drug_allergy"]').val() || '',
    treatmentHistory: $('textarea[name="ht_treatment_history"]').val() || $('input[name="ht_treatment_history"]').val() || '',
  };

  // Consent image
  t.consentImage = $('input[name="consent_image"]').val() || '';

  // Treatment images (Before/After/Other galleries)
  t.beforeImages = [];
  $('input[name="before_image[]"]').each((i, el) => {
    const dataUrl = $(el).val();
    const id = $('input[name="before_image_id[]"]').eq(i).val() || '';
    if (dataUrl) t.beforeImages.push({ dataUrl, id });
  });
  t.afterImages = [];
  $('input[name="after_image[]"]').each((i, el) => {
    const dataUrl = $(el).val();
    const id = $('input[name="after_image_id[]"]').eq(i).val() || '';
    if (dataUrl) t.afterImages.push({ dataUrl, id });
  });
  t.otherImages = [];
  $('input[name="images[]"]').each((i, el) => {
    const dataUrl = $(el).val();
    const id = $('input[name="image_id[]"]').eq(i).val() || '';
    if (dataUrl) t.otherImages.push({ dataUrl, id });
  });

  // Lab items
  t.labItems = [];
  const labIds = $('input[name="lab_id[]"]').map((_, el) => $(el).val()).get();
  const labProductIds = $('input[name="lab_product_id[]"]').map((_, el) => $(el).val()).get();
  const labQtys = $('input[name="lab_product_qty[]"]').map((_, el) => $(el).val()).get();
  const labPrices = $('input[name="lab_product_price[]"]').map((_, el) => $(el).val()).get();
  const labVats = $('input[name="lab_product_is_vat_included[]"]').map((_, el) => $(el).val()).get();
  const labDiscounts = $('input[name="lab_product_discount[]"]').map((_, el) => $(el).val()).get();
  const labDiscountTypes = $('input[name="lab_product_discount_type[]"]').map((_, el) => $(el).val()).get();
  const labOrigPrices = $('input[name="lab_product_original_price[]"]').map((_, el) => $(el).val()).get();
  const labRowIds = $('input[name="lab_product_rowId[]"]').map((_, el) => $(el).val()).get();
  const labInfos = $('textarea[name="lab_information[]"]').map((_, el) => $(el).val()).get();
  for (let i = 0; i < labProductIds.length; i++) {
    const pid = labProductIds[i];
    if (!pid) continue;
    const images = [];
    $(`input[name="lab_image_${pid}[]"]`).each((j, el) => {
      const dataUrl = $(el).val();
      const imgId = $(`input[name="lab_image_id_${pid}[]"]`).eq(j).val() || '';
      if (dataUrl) images.push({ dataUrl, id: imgId });
    });
    // Get product name from the lab-item heading
    const itemEl = $(`.lab-item[data-product-id="${pid}"]`).eq(0);
    const productName = itemEl.find('h6').first().text().trim() || '';
    // Lab PDF file ID
    const fileId = $(`input[name="lab_file_id_${pid}"]`).val() || '';
    t.labItems.push({
      id: labIds[i] || '', productId: pid, productName,
      qty: labQtys[i] || '1', price: labPrices[i] || '0',
      originalPrice: labOrigPrices[i] || '0', discount: labDiscounts[i] || '0',
      discountType: labDiscountTypes[i] || 'บาท',
      isVatIncluded: labVats[i] === 'true', rowId: labRowIds[i] || '',
      information: labInfos[i] || '', images, fileId,
    });
  }

  // Treatment files (PDF attachments — "ไฟล์" tab, max 2 files)
  t.treatmentFiles = [];
  for (let fi = 1; fi <= 2; fi++) {
    const fileId = $(`input[name="treatment_file_${fi}_id"]`).val() || '';
    if (fileId) t.treatmentFiles.push({ slot: fi, fileId });
  }

  // Medical certificate fields
  t.medCert = {
    isActuallyCome: $('input[name="med_cert_is_actually_come"]').val() === '1',
    isRest: $('input[name="med_cert_is_rest"]').val() === '1',
    period: $('input[name="med_cert_period"]').val() || '',
    isOther: $('input[name="med_cert_is_other"]').val() === '1',
    otherDetail: $('textarea[name="med_cert_other_detail"]').val() || $('input[name="med_cert_other_detail"]').val() || '',
  };

  // Treatment items from tables
  t.treatmentItems = [];
  t.consumables = [];
  t.takeHomeMeds = [];
  t.retailItems = [];

  // Tables: [0] treatment items, [1] consumables, [2] take-home meds, [3+] doctor fees, [5+] DX codes
  const tables = $('table');
  tables.each((i, table) => {
    const headers = $(table).find('th').map((_, th) => $(th).text().trim()).get();
    const headerKey = headers.join('|');
    const rows = [];
    $(table).find('tbody tr').each((_, tr) => {
      const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
      if (cells.length >= 2 && !cells[0].includes('ไม่พบ')) {
        rows.push(cells);
      }
    });

    if (headerKey === 'รายการ|จำนวน') {
      // Could be treatment items, consumables, or take-home meds
      // Distinguish by position
      if (t.treatmentItems.length === 0 && rows.length > 0) {
        t.treatmentItems = rows.map(r => ({ name: r[0], quantity: r[1] }));
      } else if (rows.length > 0) {
        t.consumables = rows.map(r => ({ name: r[0], quantity: r[1] }));
      }
    }
  });

  // Doctor fees table
  $('table').each((_, table) => {
    const headers = $(table).find('th').map((_, th) => $(th).text().trim()).get();
    if (headers.includes('ค่ามือ')) {
      t.doctorFees = [];
      $(table).find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
        if (cells.length >= 3) {
          t.doctorFees.push({ product: cells[1], fee: cells[2] });
        }
      });
    }
  });

  return t;
}

// ─── Treatment Create Form: Extract options ─────────────────────────────────
// Scrapes /admin/treatment/create?customer_id={id} — returns doctors, courses, etc.

export function extractTreatmentCreateOptions(html) {
  const $ = cheerio.load(html);
  const opts = {};

  // CSRF
  opts.csrf = $('meta[name="csrf-token"]').attr('content') || $('input[name="_token"]').val() || '';

  // Doctors
  opts.doctors = [];
  $('select[name="doctor_id"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text && text !== 'เลือกแพทย์ประจำตัว') {
      opts.doctors.push({ id: val, name: text });
    }
  });

  // Assistants
  opts.assistants = [];
  $('select[name="doctor_assistant_id[]"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text) opts.assistants.push({ id: val, name: text });
  });

  // Doctor fee group IDs (df_group_id) — embedded as HTML-encoded JSON in page source
  const dfGroupMap = {};
  const dfGroupRegex = /&quot;id&quot;:(\d+).*?&quot;df_group_id&quot;:(\d+)/g;
  let dfMatch;
  while ((dfMatch = dfGroupRegex.exec(html)) !== null) {
    dfGroupMap[dfMatch[1]] = dfMatch[2];
  }
  opts.doctors.forEach(d => { d.dfGroupId = dfGroupMap[d.id] || ''; });
  opts.assistants.forEach(a => { a.dfGroupId = dfGroupMap[a.id] || ''; });

  // Customer health info (pre-filled)
  opts.healthInfo = {
    doctorId: $('input[name="customer_doctor_id"]').val() || '',
    bloodType: $('select[name="blood_type"]').val() || $('input[name="blood_type"]').val() || '',
    congenitalDisease: $('textarea[name="congenital_disease"]').val() || $('input[name="congenital_disease"]').val() || '',
    drugAllergy: $('textarea[name="history_of_drug_allergy"]').val() || $('input[name="history_of_drug_allergy"]').val() || '',
    treatmentHistory: $('textarea[name="ht_treatment_history"]').val() || $('input[name="ht_treatment_history"]').val() || '',
  };

  // Vitals defaults (pre-filled from customer)
  opts.vitalsDefaults = {
    weight: $('input[name="ht_weight"]').val() || '',
    height: $('input[name="ht_height"]').val() || '',
  };

  // Blood type options
  opts.bloodTypeOptions = [];
  $('select[name="blood_type"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text) opts.bloodTypeOptions.push({ id: val, name: text });
  });

  // Payment channels — ProClinic injects as JS array in <script> tag (same pattern as deposit.js)
  opts.paymentChannels = [];
  $('script').each((_, s) => {
    const text = $(s).html() || '';
    const m = text.match(/paymentMethods\s*=\s*(\[.*?\])/s);
    if (m) {
      try {
        const arr = JSON.parse(m[1]);
        opts.paymentChannels = arr.map(v => ({ id: v, name: v }));
      } catch {}
    }
    // Also try to extract medicine discount percent
    const discMatch = text.match(/medicineDiscountPercent\s*[:=]\s*(\d+(?:\.\d+)?)/);
    if (discMatch) opts.medicineDiscountPercent = parseFloat(discMatch[1]) || 0;
  });
  if (opts.medicineDiscountPercent == null) {
    // Fallback: try hidden input
    const discInput = $('input[name="medicine_discount_percent"]').val();
    opts.medicineDiscountPercent = discInput ? parseFloat(discInput) || 0 : 0;
  }

  // Benefit types (insurance)
  opts.benefitTypes = [];
  $('select[name="benefit_type"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text) opts.benefitTypes.push({ id: val, name: text });
  });

  // Insurance companies
  opts.insuranceCompanies = [];
  $('select[name="insurance_company_id"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text && text !== 'เลือกบริษัทประกัน') opts.insuranceCompanies.push({ id: val, name: text });
  });

  // Sellers (staff who can be assigned sales commission)
  opts.sellers = [];
  $('select[name="seller_1_id"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text) opts.sellers.push({ id: val, name: text });
  });

  // Customer courses — populated by treatment.js via /admin/api/customer/{id}/inventory
  // (JS-rendered, not available in static HTML)
  opts.customerCourses = [];

  // Medication groups (for take-home meds)
  opts.medicationGroups = [];
  $('select[name="takeaway_product_group_id"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text) opts.medicationGroups.push({ id: val, name: text });
  });

  // Consumable product groups
  opts.consumableGroups = [];
  $('select[name="consumable_product_group_id"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text) opts.consumableGroups.push({ id: val, name: text });
  });

  // Remed — past medications from treatment history (pre-loaded in #remedModal)
  opts.remedItems = [];
  $('#remedModal').find('tr').each((_, tr) => {
    const $tr = $(tr);
    const cb = $tr.find('input[type="checkbox"]');
    if (!cb.length) return;
    const productId = cb.val() || '';
    const cells = $tr.find('td');
    // Try to extract product info from cells
    let name = '';
    cells.each((ci, td) => {
      const t = $(td).text().trim();
      if (t && !name && t.length > 1 && !/^\d/.test(t)) name = t;
    });
    const qtyInput = $tr.find('input[name*="qty"], input[type="number"]').first();
    const qty = qtyInput.val() || '1';
    const priceInput = $tr.find('input[name*="price"]').first();
    const price = priceInput.val() || '0';
    if (productId || name) {
      opts.remedItems.push({ productId, name: name || `Product #${productId}`, qty, price });
    }
  });
  // Fallback: also try div/label structure inside remedModal
  if (opts.remedItems.length === 0) {
    $('#remedModal').find('.form-check, .form-group').each((_, el) => {
      const $el = $(el);
      const cb = $el.find('input[type="checkbox"]');
      if (!cb.length) return;
      const productId = cb.val() || '';
      const label = $el.find('label').text().trim() || $el.text().trim().split('\n')[0].trim();
      if (productId || label) {
        opts.remedItems.push({ productId, name: label || `Product #${productId}`, qty: '1', price: '0' });
      }
    });
  }

  // Dosage units (for take-home medications)
  opts.dosageUnits = [];
  $('select[name="dosage_unit"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text) opts.dosageUnits.push({ id: val, name: text });
  });

  // Wallet options — parse balance from text like "กระเป๋าเงินหลัก (500.00 บาท)"
  opts.wallets = [];
  $('select[name="customer_wallet_id"] option').each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val && text) {
      const bm = text.match(/\(([\d,.]+)\s*(?:บาท|baht)\)/i);
      const balance = bm ? parseFloat(bm[1].replace(/,/g, '')) || 0 : 0;
      opts.wallets.push({ id: val, name: text, balance });
    }
  });

  // Deposit balance — try to extract from page text or hidden input
  opts.depositBalance = 0;
  const depInput = $('input[name="deposit_balance"], input[name="customer_deposit"]');
  if (depInput.length) opts.depositBalance = parseFloat(depInput.val()) || 0;
  // Fallback: look for text like "ยอดนัดจำ (500.00 บาท)"
  if (!opts.depositBalance) {
    $('script').each((_, s) => {
      const text = $(s).html() || '';
      const dm = text.match(/(?:deposit|depositBalance)\s*[:=]\s*([\d.]+)/);
      if (dm) opts.depositBalance = parseFloat(dm[1]) || 0;
    });
  }

  return opts;
}

// ─── Extract validation errors ──────────────────────────────────────────────

export function extractValidationErrors(html) {
  const $ = cheerio.load(html);
  // Laravel validation: .invalid-feedback shown next to fields
  const errEl = $('.invalid-feedback').not('[style*="none"]').first();
  if (errEl.length) return errEl.text().trim().substring(0, 200);
  // Bootstrap alert
  const alert = $('.alert-danger, .text-danger').first();
  if (alert.length) return alert.text().trim().substring(0, 200);
  // Legacy: .help-block in .has-error
  const helpBlock = $('.has-error .help-block').first();
  if (helpBlock.length) return helpBlock.text().trim().substring(0, 200);
  // Collect ALL .invalid-feedback (even hidden ones might indicate errors)
  const allErrors = [];
  $('.invalid-feedback').each((_, el) => {
    const t = $(el).text().trim();
    if (t) allErrors.push(t);
  });
  if (allErrors.length) return allErrors.join(', ').substring(0, 300);
  return null;
}
