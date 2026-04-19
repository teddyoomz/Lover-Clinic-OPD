// ─── Master Data Sync API ────────────────────────────────────────────────────
// Actions: syncProducts, syncDoctors, syncStaff, syncCourses, syncCoupons, syncVouchers
// Scrapes ProClinic list pages and returns structured JSON for caching.

import { createSession, getSession, handleCors } from './_lib/session.js';
import {
  extractProductList, extractDoctorList, extractStaffList, extractCourseList,
  extractListPagination
} from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';
import * as cheerio from 'cheerio';

// ─── Parallel paginated scraping ────────────────────────────────────────────
// Fetches page 1, detects max page, then fetches remaining pages in parallel.

async function scrapePaginated(session, baseUrl, extractFn, maxPages = 50) {
  // Fetch page 1
  const page1Html = await session.fetchText(baseUrl);
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
      promises.push(
        session.fetchText(`${baseUrl}${sep}page=${p}`)
          .then(html => extractFn(html))
          .catch(() => []) // skip failed pages
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
    const resp = await session.fetch(`${base}/admin/api/wallet?page=${p}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) throw new Error(`Wallet API error: ${resp.status}`);
    const data = await resp.json();
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

// ─── Action: syncMembershipTypes — uses /admin/api/membership JSON endpoint ─

async function handleSyncMembershipTypes(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const allItems = [];
  for (let p = 1; ; p++) {
    const resp = await session.fetch(`${base}/admin/api/membership?page=${p}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) throw new Error(`Membership API error: ${resp.status}`);
    const data = await resp.json();
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
    const resp = await session.fetch(apiUrl, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`Course API error: ${resp.status}`);
    const data = await resp.json();
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
