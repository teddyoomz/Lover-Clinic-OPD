// api/admin/backup-manager-list.js
// V74 T14 — Unified backup file listing across V40 branch + V15 central-stock + V74 customer.
// Admin-only. Returns metadata-only (no body content); UI uses for list rendering.
//
// Spec § 4.4 + § 5.3

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

let cachedBucket = null;
function getAdminBucket() {
  if (cachedBucket) return cachedBucket;
  let app;
  if (getApps().length > 0) app = getApp();
  else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
      storageBucket: BUCKET,
    });
  }
  cachedBucket = getStorage(app).bucket(BUCKET);
  return cachedBucket;
}

function classifyType(filePath) {
  if (filePath.startsWith('backups/customers/')) return 'customer';
  if (filePath.startsWith('backups/central-stock/')) return 'central-stock';
  if (filePath.startsWith('backups/')) return 'branch';
  return 'unknown';
}

function parseScopeId(type, filePath) {
  // backups/customers/{customerId}/{ts-rand}/backup.json
  // backups/central-stock/{...}/backup.json
  // backups/{branchId}/{ts-rand}.json OR backups/{branchId}/auto-pre-fresh-{ts}.json
  if (type === 'customer') return filePath.split('/')[2];
  if (type === 'central-stock') return filePath.split('/')[2] || '(all)';
  if (type === 'branch') return filePath.split('/')[1] || '(unknown)';
  return '(unknown)';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const types = Array.isArray(req.body?.types) && req.body.types.length > 0
    ? req.body.types
    : ['customer', 'central-stock', 'branch'];
  const from = req.body?.from || null;
  const to = req.body?.to || null;
  const search = String(req.body?.search || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.body?.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.body?.pageSize) || 50));

  try {
    const bucket = getAdminBucket();
    // List all backup.json + *.json files under backups/
    const [files] = await bucket.getFiles({ prefix: 'backups/' });
    const jsonFiles = files.filter(f => f.name.endsWith('.json'));

    // Build metadata records (in parallel; download only meta block of each)
    const items = await Promise.all(jsonFiles.map(async (file) => {
      const type = classifyType(file.name);
      if (!types.includes(type)) return null;
      const scopeId = parseScopeId(type, file.name);
      const [meta] = await file.getMetadata();
      // Lazy-load JSON only when needed (size check first)
      let userNote = '';
      let exportedAt = '';
      let exportedBy = '';
      let bodyHash = '';
      let storageManifestHash = '';
      let isAutoPreFresh = false;
      let customerHN = '';
      let customerName = '';
      try {
        const [buf] = await file.download();
        const parsed = JSON.parse(buf.toString('utf8'));
        userNote = parsed?.meta?.userNote || '';
        exportedAt = parsed?.meta?.exportedAt || '';
        exportedBy = parsed?.meta?.exportedBy || '';
        bodyHash = parsed?.meta?.bodyHash || '';
        storageManifestHash = parsed?.meta?.storageManifestHash || '';
        isAutoPreFresh = !!parsed?.meta?.isAutoPreFresh;
        customerHN = parsed?.meta?.customerHN || '';
        customerName = parsed?.meta?.customerName || '';
      } catch { /* malformed file — skip metadata */ }
      return {
        backupRef: file.name,
        type,
        scopeId,
        scopeName: customerName || scopeId,
        customerHN: type === 'customer' ? customerHN : '',
        userNote,
        exportedAt,
        exportedBy,
        sizeBytes: Number(meta.size || 0),
        hasStorageTree: type === 'customer', // V74 customers have storage tree; V40/V15 may or may not
        isAutoPreFresh,
        bodyHash,
        storageManifestHash,
      };
    }));

    let filtered = items.filter(x => x !== null);

    // Date range filter
    if (from) filtered = filtered.filter(x => x.exportedAt >= from);
    if (to) filtered = filtered.filter(x => x.exportedAt <= to);

    // Search filter
    if (search) {
      filtered = filtered.filter(x =>
        (x.scopeId || '').toLowerCase().includes(search) ||
        (x.scopeName || '').toLowerCase().includes(search) ||
        (x.customerHN || '').toLowerCase().includes(search) ||
        (x.userNote || '').toLowerCase().includes(search)
      );
    }

    // Sort by exportedAt desc
    filtered.sort((a, b) => (b.exportedAt || '').localeCompare(a.exportedAt || ''));

    const total = filtered.length;
    const startIdx = (page - 1) * pageSize;
    const paged = filtered.slice(startIdx, startIdx + pageSize);

    return res.status(200).json({
      ok: true,
      items: paged,
      total,
      page,
      pageSize,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'LIST_FAILED' });
  }
}
