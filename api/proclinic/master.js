// ─── Master Data Sync API ────────────────────────────────────────────────────
// Actions: syncProducts, syncDoctors, syncStaff, syncCourses
// Scrapes ProClinic list pages and returns structured JSON for caching.

import { createSession, getSession, handleCors } from './_lib/session.js';
import {
  extractProductList, extractDoctorList, extractStaffList, extractCourseList,
  extractListPagination
} from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';

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

// ─── Action: syncCourses ────────────────────────────────────────────────────

async function handleSyncCourses(req, res) {
  const session = await getSession(req.body);
  const base = session.origin;
  const { items, totalPages } = await scrapePaginated(
    session, `${base}/admin/course`, extractCourseList
  );
  return res.status(200).json({
    success: true,
    type: 'courses',
    count: items.length,
    totalPages,
    items
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
      case 'syncProducts': return await handleSyncProducts(req, res);
      case 'syncDoctors':  return await handleSyncDoctors(req, res);
      case 'syncStaff':    return await handleSyncStaff(req, res);
      case 'syncCourses':  return await handleSyncCourses(req, res);
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
