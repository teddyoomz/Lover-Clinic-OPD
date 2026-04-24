// ─── Master Data Sync API ────────────────────────────────────────────────────
// Actions: syncProducts, syncDoctors, syncStaff, syncCourses, syncCoupons,
//   syncVouchers, syncProductGroups, syncProductUnits, syncMedicalInstruments,
//   syncHolidays, syncBranches, syncPermissionGroups (11.8c).
// Scrapes ProClinic list pages and returns structured JSON for caching.
//
// @dev-only — STRIP BEFORE PRODUCTION RELEASE (rule H-bis)
// Dev scaffolding to seed master_data/*. Production does NOT ship this
// handler or any /api/proclinic/* sync path; be_* CRUD tabs are the
// user-facing master-data surface.

import { createSession, getSession, handleCors } from './_lib/session.js';
import {
  extractProductList, extractDoctorList, extractStaffList, extractCourseList,
  extractListPagination, extractGenericListPage,
  extractDfGroupList, extractDfGroupRates,
  extractDfStaffList, extractDfStaffRates,
  extractMedicineLabelList,
} from './_lib/scraper.js';
import { withRetry } from './_lib/retry.js';
import { verifyAuth } from './_lib/auth.js';
import * as cheerio from 'cheerio';

// A3/A7: centralized retry + timeout budget for all sync scrapes.
// Each fetch hard-capped at 20s; up to 3 retries with exp backoff on
// 429/5xx/timeout/network errors. Total worst-case per URL: 20s + 0.5s +
// 20s + 1s + 20s + 2s + 20s ≈ 84s, which exceeds Vercel 60s — so we choose
// conservative values and trust that the first retry usually succeeds.
const FETCH_OPTS = { timeoutMs: 20000, strictHttp: true };
const RETRY_OPTS = { retries: 3, baseMs: 500, maxMs: 8000 };

// ─── Parallel paginated scraping ────────────────────────────────────────────
// Fetches page 1, detects max page, then fetches remaining pages in parallel.

async function scrapePaginated(session, baseUrl, extractFn, maxPages = 50) {
  // Fetch page 1 (retryable + timeout per A3/A7)
  const page1Html = await withRetry(() => session.fetchText(baseUrl, FETCH_OPTS), RETRY_OPTS);
  const page1Items = extractFn(page1Html);
  const { maxPage } = extractListPagination(page1Html);
  const totalPages = Math.min(maxPage, maxPages);

  if (totalPages <= 1) return { items: page1Items, totalPages: 1 };

  // Fetch remaining pages in parallel (batches of 5 to avoid overwhelming)
  const allItems = [...page1Items];
  const BATCH_SIZE = 5;

  for (let batch = 2; batch <= totalPages; batch += BATCH_SIZE) {
    const end = Math.min(batch + BATCH_SIZE - 1, totalPages);
    const promises = [];
    for (let p = batch; p <= end; p++) {
      const sep = baseUrl.includes('?') ? '&' : '?';
      const pageUrl = `${baseUrl}${sep}page=${p}`;
      promises.push(
        withRetry(() => session.fetchText(pageUrl, FETCH_OPTS), RETRY_OPTS)
          .then(html => extractFn(html))
          .catch(() => []) // skip failed pages after retries exhausted
      );
    }
    const results = await Promise.all(promises);
    results.forEach(items => allItems.push(...items));
  }

  return { items: allItems, totalPages };
}

// ─── Action: syncProducts ───────────────────────────────────────────────────

// Phase 11.9 fix (2026-04-21): switched from HTML scrape → JSON API
// `/admin/api/v2/product`. HTML scrape only pulled name+unit+price+category
// +type (from cell-index guessing — often miscoded). JSON API gives every
// canonical field incl. product_label (medication labeling), service_type,
// alert thresholds. User directive: "เอามาให้ครบนะ ราคา หน่วย บลาๆๆ ทุกไส้ใน".
async function handleSyncProducts(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const allItems = [];
  for (let p = 1; ; p++) {
    const data = await withRetry(async () => {
      const resp = await session.fetch(`${base}/admin/api/v2/product?page=${p}&per_page=200`, {
        headers: { 'Accept': 'application/json' },
        timeoutMs: FETCH_OPTS.timeoutMs,
      });
      if (!resp.ok) {
        const err = new Error(`Product API error: ${resp.status}`);
        err.status = resp.status;
        throw err;
      }
      return resp.json();
    }, RETRY_OPTS);
    const items = data.data || [];
    allItems.push(...items);
    if (p >= (data.last_page || 1) || p >= 100) break;
  }

  const normalized = allItems.map(item => {
    const label = item.product_label || {};
    const cat = item.product_category || {};
    const subCat = item.product_sub_category || {};
    // administration_times arrives as comma-separated string in ProClinic
    const adminTimesStr = label.administration_times || '';
    const adminTimesArr = adminTimesStr
      ? String(adminTimesStr).split(/[,،]\s*/).map(s => s.trim()).filter(Boolean)
      : [];
    return {
      id: item.id,
      product_name: item.product_name || '',
      product_code: item.product_code || '',
      product_type: item.product_type || 'ยา',
      service_type: item.service_type || '',
      category_name: cat.category_name || '',
      sub_category_name: subCat.category_name || '',
      unit_name: item.unit_name || '',
      price: item.price != null ? Number(item.price) : null,
      price_incl_vat: item.price_incl_vat != null ? Number(item.price_incl_vat) : null,
      is_vat_included: !!(item.is_vat_included || item.is_including_vat),
      is_claim_drug_discount: !!item.is_claim_drug_discount,
      is_takeaway_product: !!item.is_takeaway_product,
      alert_day_before_expire: item.alert_day_before_expire,
      alert_qty_before_out_of_stock: item.alert_qty_before_out_of_stock,
      alert_qty_before_max_stock: item.alert_qty_before_max_stock,
      stock_location: item.stock_location || '',
      // Medication labeling (nested in ProClinic, flattened for master_data consumers)
      generic_name: label.generic_name || '',
      dosage_amount: label.dosage_amount || '',
      dosage_unit: label.dosage_unit || '',
      times_per_day: label.times_per_day != null ? Number(label.times_per_day) : null,
      administration_method: label.administration_method || '',
      administration_method_hour: label.administration_method_hour || '',
      administration_times: adminTimesArr,
      indications: label.indications || '',
      instructions: label.instructions || '',
      storage_instructions: label.storage_instructions || '',
      status: item.deleted_at || item.status === 0 ? 'พักใช้งาน' : 'ใช้งาน',
      _source: 'proclinic',
    };
  });

  return res.status(200).json({
    success: true,
    type: 'products',
    count: normalized.length,
    totalPages: 1,
    items: normalized,
  });
}

// ─── Action: syncDoctors ────────────────────────────────────────────────────

async function handleSyncDoctors(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const { items, totalPages } = await scrapePaginated(
    session, `${base}/admin/doctor`, extractDoctorList
  );
  return res.status(200).json({
    success: true,
    type: 'doctors',
    count: items.length,
    totalPages,
    items
  });
}

// ─── Action: syncStaff ──────────────────────────────────────────────────────

async function handleSyncStaff(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const { items, totalPages } = await scrapePaginated(
    session, `${base}/admin/user`, extractStaffList
  );
  return res.status(200).json({
    success: true,
    type: 'staff',
    count: items.length,
    totalPages,
    items
  });
}

// ─── Action: syncWalletTypes — uses /admin/api/wallet JSON endpoint ─────────

async function handleSyncWalletTypes(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const allItems = [];
  for (let p = 1; ; p++) {
    const data = await withRetry(async () => {
      const resp = await session.fetch(`${base}/admin/api/wallet?page=${p}`, {
        headers: { 'Accept': 'application/json' },
        timeoutMs: FETCH_OPTS.timeoutMs,
      });
      if (!resp.ok) {
        const err = new Error(`Wallet API error: ${resp.status}`);
        err.status = resp.status;
        throw err;
      }
      return resp.json();
    }, RETRY_OPTS);
    const items = data.data || [];
    allItems.push(...items);
    if (p >= (data.last_page || 1) || p >= 20) break;
  }
  const normalized = allItems.map(item => ({
    id: item.id,
    name: item.wallet_name || '',
    description: item.description || '',
    status: item.deleted_at ? 'พักใช้งาน' : 'ใช้งาน',
    _source: 'proclinic',
  }));
  return res.status(200).json({
    success: true,
    type: 'wallet_types',
    count: normalized.length,
    totalPages: 1,
    items: normalized,
  });
}

// ─── Action: syncCoupons / syncVouchers — scrape list-page HTML rows ────────
//
// ProClinic has no JSON API for coupons/vouchers (/admin/api/coupon 404,
// /admin/api/item/coupon 404). The HTML list is rendered partly server-side
// in a table; each row has actions with `/admin/{entity}/{id}` links we can
// regex out + sibling text for the visible fields.
//
// This is a best-effort scrape — shape is minimal (id, name, optional
// discount/price/code). Manual CRUD in backend fills in the full schema.

export function extractCouponLikeRows(html, entity /* 'coupon' | 'voucher' */) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();
  const idRe = new RegExp(`/admin/${entity}/(\\d+)`);

  // Pattern 1: delete/edit button with data-url / data-*-url
  $('button[data-url], a[data-url], button[data-id], [data-delete-url], [data-edit-url]').each((_, el) => {
    const attrs = el.attribs || {};
    const candidateUrls = [
      attrs['data-url'], attrs['data-delete-url'], attrs['data-edit-url'],
      attrs['href'],
    ].filter(Boolean);
    for (const u of candidateUrls) {
      const m = u.match(idRe);
      if (m && !seen.has(m[1])) {
        const id = m[1];
        seen.add(id);
        let row = $(el).parent();
        for (let i = 0; i < 12; i++) {
          if (!row.length) break;
          if (row.prop('tagName')?.toLowerCase() === 'tr') break;
          row = row.parent();
        }
        const text = row.length ? row.text().replace(/\s+/g, ' ').trim() : '';
        items.push({ id, _rowText: text });
        break;
      }
    }
  });

  // Pattern 2: anchor links to edit page
  $(`a[href*="/admin/${entity}/"]`).each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(idRe);
    if (m && !seen.has(m[1])) {
      const id = m[1];
      seen.add(id);
      const text = $(el).text().trim() || $(el).closest('tr').text().replace(/\s+/g, ' ').trim();
      items.push({ id, _rowText: text });
    }
  });

  return items;
}

async function handleSyncCoupons(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const allItems = [];
  for (let p = 1; p <= 20; p++) {
    const url = p === 1 ? `${base}/admin/coupon` : `${base}/admin/coupon?page=${p}`;
    // A3/A7: retry on 429/5xx/timeout with exp backoff; each fetch capped at 20s.
    const html = await withRetry(() => session.fetchText(url, FETCH_OPTS), RETRY_OPTS);
    const rows = extractCouponLikeRows(html, 'coupon');
    if (rows.length === 0) break;
    for (const r of rows) {
      const text = r._rowText || '';
      const codeMatch = text.match(/\b([A-Z][A-Z0-9_-]{2,})\b/);
      const discMatch = text.match(/(\d+(?:\.\d+)?)\s*(%|บาท)/);
      allItems.push({
        id: r.id,
        name: (text.split(/[\u200b\s]{2,}/)[0] || '').trim().slice(0, 80),
        coupon_code: codeMatch ? codeMatch[1] : '',
        discount: discMatch ? Number(discMatch[1]) : 0,
        discount_type: discMatch && discMatch[2] === 'บาท' ? 'baht' : 'percent',
      });
    }
    const $ = cheerio.load(html);
    const hasNext = $(`a[href*="?page=${p + 1}"]`).length > 0;
    if (!hasNext) break;
  }
  return res.status(200).json({
    success: true, type: 'coupons', count: allItems.length, totalPages: 1, items: allItems,
  });
}

async function handleSyncVouchers(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const allItems = [];
  for (let p = 1; p <= 20; p++) {
    const url = p === 1 ? `${base}/admin/voucher` : `${base}/admin/voucher?page=${p}`;
    // A3/A7: retry on 429/5xx/timeout with exp backoff; each fetch capped at 20s.
    const html = await withRetry(() => session.fetchText(url, FETCH_OPTS), RETRY_OPTS);
    const rows = extractCouponLikeRows(html, 'voucher');
    if (rows.length === 0) break;
    for (const r of rows) {
      const text = r._rowText || '';
      const priceMatch = text.match(/(\d+(?:[,\d]*)(?:\.\d+)?)\s*(บาท|฿)/);
      allItems.push({
        id: r.id,
        name: (text.split(/[\u200b\s]{2,}/)[0] || '').trim().slice(0, 80),
        price: priceMatch ? Number(String(priceMatch[1]).replace(/,/g, '')) : 0,
        platform: '',
      });
    }
    const $ = cheerio.load(html);
    const hasNext = $(`a[href*="?page=${p + 1}"]`).length > 0;
    if (!hasNext) break;
  }
  return res.status(200).json({
    success: true, type: 'vouchers', count: allItems.length, totalPages: 1, items: allItems,
  });
}

// ─── Action: syncMembershipTypes — uses /admin/api/membership JSON endpoint ─

async function handleSyncMembershipTypes(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const allItems = [];
  for (let p = 1; ; p++) {
    const data = await withRetry(async () => {
      const resp = await session.fetch(`${base}/admin/api/membership?page=${p}`, {
        headers: { 'Accept': 'application/json' },
        timeoutMs: FETCH_OPTS.timeoutMs,
      });
      if (!resp.ok) {
        const err = new Error(`Membership API error: ${resp.status}`);
        err.status = resp.status;
        throw err;
      }
      return resp.json();
    }, RETRY_OPTS);
    const items = data.data || [];
    allItems.push(...items);
    if (p >= (data.last_page || 1) || p >= 20) break;
  }
  const normalized = allItems.map(item => ({
    id: item.id,
    name: item.membership_name || '',
    colorName: item.color || '',
    credit: Number(item.credit) || 0,
    price: Number(item.price) || 0,
    point: Number(item.point) || 0,
    bahtPerPoint: Number(item.baht_per_point) || 0,
    discountPercent: Number(item.discount_percent) || 0,
    expiredInDays: Number(item.expired_in) || 365,
    // ProClinic membership JSON doesn't include walletTypeId — clinic must set which wallet
    // credits flow into via the manual edit form. Leave blank on sync; backend edit can attach.
    walletTypeId: '',
    walletTypeName: '',
    status: Number(item.status) === 1 ? 'ใช้งาน' : 'พักใช้งาน',
    _source: 'proclinic',
  }));
  return res.status(200).json({
    success: true,
    type: 'membership_types',
    count: normalized.length,
    totalPages: 1,
    items: normalized,
  });
}

// ─── Action: syncCourses — uses API (not HTML scraper) to get product qty ───

// Phase 11.9 fix (2026-04-21): switched to /admin/api/course (richer fields)
// from /admin/api/item/course (buy-modal minimal). Extracts every field
// mapMasterToCourse expects: salePrice + salePriceInclVat + receiptCourseName
// + courseType + usageType + isVatIncluded + courseProducts with pivot.qty.
// User directive: "เอามาให้ครบนะ ราคา หน่วย บลาๆๆ ทุกไส้ใน".
async function handleSyncCourses(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;

  const allItems = [];
  for (let p = 1; ; p++) {
    const apiUrl = `${base}/admin/api/course?page=${p}&per_page=200`;
    const data = await withRetry(async () => {
      const resp = await session.fetch(apiUrl, {
        headers: { 'Accept': 'application/json' },
        timeoutMs: FETCH_OPTS.timeoutMs,
      });
      if (!resp.ok) {
        const err = new Error(`Course API error: ${resp.status}`);
        err.status = resp.status;
        throw err;
      }
      return resp.json();
    }, RETRY_OPTS);
    const items = data.data || [];
    allItems.push(...items);
    if (p >= (data.last_page || 1) || p >= 100) break;
  }

  const normalized = allItems.map(item => ({
    id: item.id,
    course_code: item.course_code || '',
    course_name: item.course_name || '',
    receipt_course_name: item.receipt_course_name || '',
    course_category: item.course_category_name || '',
    course_type: item.course_type || '',
    usage_type: item.usage_type || '',
    time: item.period != null ? Number(item.period) : null,
    sale_price: item.sale_price != null ? Number(item.sale_price) : null,
    sale_price_incl_vat: item.sale_price_incl_vat != null ? Number(item.sale_price_incl_vat) : null,
    price: item.sale_price != null ? Number(item.sale_price) : (item.full_price != null ? Number(item.full_price) : null),
    full_price: item.full_price != null ? Number(item.full_price) : null,
    is_vat_included: !!(item.is_vat_included || item.is_including_vat),
    days_before_expire: item.days_before_expire,
    main_product_qty: item.main_product_qty != null ? Number(item.main_product_qty) : 0,
    max_chosen_count: item.max_chosen_count != null ? Number(item.max_chosen_count) : null,
    is_df: !!item.is_df,
    is_hidden_for_sale: !!item.is_hidden_for_sale,
    status: item.deleted_at || item.status === 0 ? 'พักใช้งาน' : 'ใช้งาน',
    // Preserve full product + pivot structure so mapMasterToCourse can read
    // courseProducts[].qty (ProClinic pivot.qty) + productName for enrichment.
    courseProducts: (item.products || []).map(p => ({
      productId: String(p.id || p.product_id || ''),
      product_id: String(p.id || p.product_id || ''),
      productName: p.product_name || p.name || '',
      product_name: p.product_name || p.name || '',
      qty: p.pivot?.qty != null ? Number(p.pivot.qty) : (p.qty != null ? Number(p.qty) : 1),
      qty_per_time: p.pivot?.qty_per_time != null ? Number(p.pivot.qty_per_time) : null,
      unit_name: p.unit_name || '',
      price: p.price != null ? Number(p.price) : null,
      is_premium: !!p.pivot?.is_premium,
      is_main_product: !!p.pivot?.is_main_product,
    })),
    _source: 'proclinic',
  }));

  return res.status(200).json({
    success: true,
    type: 'courses',
    count: normalized.length,
    totalPages: 1,
    items: normalized,
  });
}

// ─── Phase 11.8c: sync 6 master-data entities via generic scraper ──────────
// Each handler hits a ProClinic list page, extracts id + basic fields, and
// emits items the migrate-to-be_* functions can map. The migrate mapper is
// lenient (accepts snake_case ProClinic fields OR camelCase), so the scrape
// output can stay close to HTML literals and we don't have to get every
// cell-index right on the first pass.

async function syncGenericList(req, res, { type, path, idPattern, fieldMap }) {
  const session = await getSession(req.body);
  const base = session.origin;
  const extractFn = (html) => extractGenericListPage(html, { idPattern, fieldMap });
  const { items, totalPages } = await scrapePaginated(session, `${base}${path}`, extractFn);
  return res.status(200).json({
    success: true,
    type,
    count: items.length,
    totalPages,
    items,
  });
}

// Phase 11.9: switched from HTML list scrape → JSON API `/admin/api/product-group`.
// HTML scrape only returned name + type (2 fields); JSON API returns full
// `products[]` with `pivot.qty` per group-product. Rule H + user directive
// "ดูดมาครบ" — preserve qty so OUR be_product_groups mirror ProClinic 1:1.
async function handleSyncProductGroups(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const allItems = [];
  for (let p = 1; ; p++) {
    const data = await withRetry(async () => {
      const resp = await session.fetch(`${base}/admin/api/product-group?page=${p}`, {
        headers: { 'Accept': 'application/json' },
        timeoutMs: FETCH_OPTS.timeoutMs,
      });
      if (!resp.ok) {
        const err = new Error(`Product-group API error: ${resp.status}`);
        err.status = resp.status;
        throw err;
      }
      return resp.json();
    }, RETRY_OPTS);
    const items = data.data || [];
    allItems.push(...items);
    if (p >= (data.last_page || 1) || p >= 50) break;
  }
  const normalized = allItems.map(g => ({
    id: g.id,
    groupName: g.group_name || '',
    name: g.group_name || '',
    productType: g.product_type || 'ยากลับบ้าน',
    products: Array.isArray(g.products) ? g.products.map(p => ({
      productId: String(p.id),
      qty: Number(p.pivot?.qty) || 1,
      productName: p.product_name || '',
      unit: p.unit_name || '',
    })) : [],
    status: g.deleted_at ? 'พักใช้งาน' : 'ใช้งาน',
    _source: 'proclinic',
  }));
  return res.status(200).json({
    success: true,
    type: 'product_groups',
    count: normalized.length,
    totalPages: 1,
    items: normalized,
  });
}

async function handleSyncProductUnits(req, res) {
  return syncGenericList(req, res, {
    type: 'product_units',
    path: '/admin/default-product-unit',
    idPattern: /\/default-product-unit\/(\d+)/,
    // ProClinic lists the group name first; per-unit detail needs a visit
    // to each edit page. MVP keeps it as groupName only — migrate mapper
    // will create a single base-unit row when `units[]` is missing.
    fieldMap: { groupName: 0 },
  });
}

async function handleSyncMedicalInstruments(req, res) {
  return syncGenericList(req, res, {
    type: 'medical_instruments',
    path: '/admin/medical-instrument',
    idPattern: /\/medical-instrument\/(\d+)/,
    fieldMap: { name: 0, code: 1, cost_price: 2 },
  });
}

async function handleSyncHolidays(req, res) {
  return syncGenericList(req, res, {
    type: 'holidays',
    path: '/admin/holiday',
    idPattern: /\/holiday\/(\d+)/,
    fieldMap: { holiday_date: 0, holiday_note: 1 },
  });
}

async function handleSyncBranches(req, res) {
  return syncGenericList(req, res, {
    type: 'branches',
    path: '/admin/branch',
    idPattern: /\/branch\/(\d+)/,
    fieldMap: { branch_name: 0, telephone_number: 1, address: 2 },
  });
}

async function handleSyncDfStaffRates(req, res) {
  // Phase 14.x: sync per-staff DF rate overrides from ProClinic. Two
  // URLs cover the two sub-pages:
  //   /admin/df/doctor                                → position 'แพทย์'
  //   /admin/df/assistance?position=ผู้ช่วยแพทย์     → position 'ผู้ช่วยแพทย์'
  // Each page is tab-stripped per staff with query `?user_id=X`.
  const session = await getSession(req.body);
  const base = session.origin;

  const fetchPage = (url) => withRetry(() => session.fetchText(url, FETCH_OPTS), RETRY_OPTS);

  const SOURCES = [
    { position: 'แพทย์', listUrl: `${base}/admin/df/doctor` },
    { position: 'ผู้ช่วยแพทย์', listUrl: `${base}/admin/df/assistance?position=${encodeURIComponent('ผู้ช่วยแพทย์')}` },
  ];

  const out = [];
  for (const src of SOURCES) {
    let listHtml;
    try { listHtml = await fetchPage(src.listUrl); } catch { continue; }
    const staffList = extractDfStaffList(listHtml);
    if (staffList.length === 0) continue;

    // Harvest rates for the default-selected staff from the list page
    // for free (one less fetch).
    const ratesByStaffId = new Map();
    for (const s of staffList) {
      const rates = extractDfStaffRates(listHtml, s.id);
      if (rates.length > 0) ratesByStaffId.set(String(s.id), rates);
    }

    // Parallel-fetch remaining staff's own page (batch 3).
    const BATCH = 3;
    const remaining = staffList.filter((s) => !ratesByStaffId.has(String(s.id)));
    for (let i = 0; i < remaining.length; i += BATCH) {
      const chunk = remaining.slice(i, i + BATCH);
      const baseUrl = src.listUrl.split('?')[0];
      const results = await Promise.all(chunk.map(async (s) => {
        try {
          const sep = src.listUrl.includes('?') ? '&' : '?';
          // /admin/df/doctor?user_id=X or /admin/df/assistance?position=...&user_id=X
          const url = `${src.listUrl}${sep}user_id=${encodeURIComponent(s.id)}`;
          const html = await fetchPage(url);
          return { id: String(s.id), rates: extractDfStaffRates(html, s.id) };
        } catch {
          return { id: String(s.id), rates: [] };
        }
      }));
      for (const r of results) ratesByStaffId.set(r.id, r.rates);
    }

    for (const s of staffList) {
      out.push({
        id: String(s.id),
        staffId: String(s.id),
        staffName: s.name,
        position: src.position,
        rates: ratesByStaffId.get(String(s.id)) || [],
        status: 'ใช้งาน',
        _source: 'proclinic',
      });
    }
  }

  return res.status(200).json({
    success: true,
    type: 'df_staff_rates',
    count: out.length,
    totalPages: 1,
    items: out,
  });
}

async function handleSyncDfGroups(req, res) {
  // Phase 14.x bug #2: sync DF groups from ProClinic → master_data/df_groups.
  // ProClinic exposes one group's rate matrix per page via
  // `/admin/df/df-group?df_group_id=X`. We first fetch the default page to
  // collect the tab-link list (id + name for every group), then parallel-
  // fetch each group's detail page to extract its rates[].
  //
  // Field parsing: rate value inputs named `df_group_{G}_df_course_{C}`
  // with paired radio `..._type`. See extractDfGroupRates.
  const session = await getSession(req.body);
  const base = session.origin;

  // Step 1 — fetch list page, extract group ids + names
  const listHtml = await withRetry(
    () => session.fetchText(`${base}/admin/df/df-group`, FETCH_OPTS),
    RETRY_OPTS,
  );
  const groups = extractDfGroupList(listHtml);
  if (groups.length === 0) {
    return res.status(200).json({
      success: true,
      type: 'df_groups',
      count: 0,
      totalPages: 1,
      items: [],
    });
  }

  // Step 2 — parse rates for the default-selected group from the list
  // page itself (one free fetch). Record by id so we don't re-fetch below.
  const ratesByGroupId = new Map();
  for (const g of groups) {
    const rates = extractDfGroupRates(listHtml, g.id);
    if (rates.length > 0) ratesByGroupId.set(String(g.id), rates);
  }

  // Step 3 — parallel-fetch each remaining group's detail page.
  // Batch of 3 to avoid hammering ProClinic (Vercel 60s budget allows this
  // comfortably for ≤ 20 groups; real world = 9).
  const BATCH = 3;
  const remaining = groups.filter((g) => !ratesByGroupId.has(String(g.id)));
  for (let i = 0; i < remaining.length; i += BATCH) {
    const chunk = remaining.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map(async (g) => {
      try {
        const html = await withRetry(
          () => session.fetchText(`${base}/admin/df/df-group?df_group_id=${encodeURIComponent(g.id)}`, FETCH_OPTS),
          RETRY_OPTS,
        );
        return { id: String(g.id), rates: extractDfGroupRates(html, g.id) };
      } catch {
        return { id: String(g.id), rates: [] }; // skip on fetch failure
      }
    }));
    for (const r of results) ratesByGroupId.set(r.id, r.rates);
  }

  // Step 4 — emit items in master_data shape. Each item carries
  // id / name / rates — enough for migrate-to-be_df_groups to run
  // without further scraping.
  const items = groups.map((g) => ({
    id: String(g.id),
    name: g.name,
    rates: ratesByGroupId.get(String(g.id)) || [],
    status: 'ใช้งาน',
    _source: 'proclinic',
  }));

  return res.status(200).json({
    success: true,
    type: 'df_groups',
    count: items.length,
    totalPages: 1,
    items,
  });
}

async function handleSyncMedicineLabels(req, res) {
  // Phase 14.x gap audit: /admin/medicine-label presets. 2-column table,
  // per-row id via `data-preset-id` on action buttons (no edit URL).
  const session = await getSession(req.body);
  const base = session.origin;
  const extractFn = (html) => extractMedicineLabelList(html);
  const { items, totalPages } = await scrapePaginated(
    session, `${base}/admin/medicine-label`, extractFn,
  );
  return res.status(200).json({
    success: true,
    type: 'medicine_labels',
    count: items.length,
    totalPages,
    items,
  });
}

async function handleSyncPermissionGroups(req, res) {
  return syncGenericList(req, res, {
    type: 'permission_groups',
    path: '/admin/permission-group',
    idPattern: /\/permission-group\/(\d+)/,
    fieldMap: { permission_group_name: 0 },
  });
}

// ─── Route handler ──────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await verifyAuth(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { action } = req.body || {};

  try {
    switch (action) {
      case 'syncProducts':        return await handleSyncProducts(req, res);
      case 'syncDoctors':         return await handleSyncDoctors(req, res);
      case 'syncStaff':           return await handleSyncStaff(req, res);
      case 'syncCourses':         return await handleSyncCourses(req, res);
      case 'syncWalletTypes':     return await handleSyncWalletTypes(req, res);
      case 'syncMembershipTypes': return await handleSyncMembershipTypes(req, res);
      case 'syncCoupons':         return await handleSyncCoupons(req, res);
      case 'syncVouchers':        return await handleSyncVouchers(req, res);
      // Phase 11.8c: 6 master-data entities via generic scraper
      case 'syncProductGroups':       return await handleSyncProductGroups(req, res);
      case 'syncProductUnits':        return await handleSyncProductUnits(req, res);
      case 'syncMedicalInstruments':  return await handleSyncMedicalInstruments(req, res);
      case 'syncHolidays':            return await handleSyncHolidays(req, res);
      case 'syncBranches':            return await handleSyncBranches(req, res);
      case 'syncPermissionGroups':    return await handleSyncPermissionGroups(req, res);
      // Phase 14.x: DF groups sync (scrapes /admin/df/df-group tabs + rates matrix).
      case 'syncDfGroups':            return await handleSyncDfGroups(req, res);
      // Phase 14.x: per-staff DF rate overrides (doctors + assistants).
      case 'syncDfStaffRates':        return await handleSyncDfStaffRates(req, res);
      // Phase 14.x: medicine label presets (/admin/medicine-label).
      case 'syncMedicineLabels':      return await handleSyncMedicineLabels(req, res);
      default:
        return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    const resp = { success: false, error: err.message || 'Unknown error' };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    return res.status(200).json(resp);
  }
}
