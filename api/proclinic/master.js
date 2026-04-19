// ─── Master Data Sync API ────────────────────────────────────────────────────
// Actions: syncProducts, syncDoctors, syncStaff, syncCourses, syncCoupons, syncVouchers
// Scrapes ProClinic list pages and returns structured JSON for caching.

import { createSession, getSession, handleCors } from './_lib/session.js';
import {
  extractProductList, extractDoctorList, extractStaffList, extractCourseList,
  extractListPagination
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

async function handleSyncProducts(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const { items, totalPages } = await scrapePaginated(
    session, `${base}/admin/product`, extractProductList
  );
  return res.status(200).json({
    success: true,
    type: 'products',
    count: items.length,
    totalPages,
    items
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

async function handleSyncCourses(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;

  // Use /admin/api/item/course endpoint (same as listItems in treatment.js)
  // This returns product-level qty that HTML scraper misses
  const allItems = [];
  for (let p = 1; ; p++) {
    const apiUrl = `${base}/admin/api/item/course?page=${p}`;
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
    if (p >= (data.last_page || 1) || p >= 30) break;
  }

  const normalized = allItems.map(item => ({
    id: item.id,
    code: item.course_code || '',
    name: item.course_name || '',
    price: item.sale_price || item.full_price || '0',
    category: item.course_category_name || '',
    courseType: item.course_type_name || '',
    status: 'ใช้งาน',
    products: (item.course_products || item.products || []).map(p => ({
      id: p.id || p.product_id,
      name: p.product_name || p.name,
      qty: p.qty || p.pivot?.qty || p.amount || 1,
      unit: p.unit_name || p.unit || '',
    })),
  }));

  return res.status(200).json({
    success: true,
    type: 'courses',
    count: normalized.length,
    totalPages: 1,
    items: normalized,
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
