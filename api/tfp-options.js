// ─── /api/tfp-options — TFP heavy-lists bundle (AV212 rule 9, 2026-07-20) ───
//
// THE TEN-YEAR LOAD PATH. Firestore's local cache is indexless — every cache
// read unpacks stored docs, so as master data grew (~45MB IDB) the weakest
// clinic machines crossed the cliff where reading their own cache costs more
// than the network (degradation matrix: M6 no-IDB 1.2s vs M12 warm-IDB CPU×20
// 14-35s). This endpoint moves the READ MODEL server-side (the /api/patient-view
// pattern, proven live for the flaky-mobile audience): ONE authed request
// returns the 4 HEAVY TFP lists (products / courses / dfGroups / dfStaffRates,
// branch-filtered, lister-shaped) — ~700KB raw ≈ ~80KB gzip on the wire. The
// client stays DUMB: fetch → JSON.parse → the UNCHANGED applyFormData maps it
// (single mapper, zero V12 drift). Old machines pay O(payload), never O(IDB).
//
//   · lists are byte-shape-identical to backendClient's listProducts /
//     listCourses / listDfGroups / listDfStaffRates output ({...data, id} +
//     the same sort comparators) — applyFormData cannot tell the difference.
//   · doctors/staff/customer are NOT here — tiny reads the client already
//     does through the real listers (name composition / V41 isHidden live in
//     lib code; duplicating them server-side would be V12 drift).
//   · AUTH: staff-only (isClinicStaff/admin custom claims — the same gate
//     firestore.rules puts on these collections). NO edge caching: a shared
//     CDN cache would serve authed master data to anon URL guessers. A
//     module-scope 30s memory cache keeps warm invocations ~free instead.
//   · Firestore stays the source of truth: the client's existing SWR pipeline
//     still runs behind this and re-applies server-confirmed data. The bundle
//     only makes the FIRST full paint machine-independent.
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const CACHE_TTL_MS = 30 * 1000; // freshness ceiling for painted prices/flags

let cachedDb = null;
function getDb() {
  if (cachedDb) return cachedDb;
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
    });
  }
  cachedDb = getFirestore(app);
  return cachedDb;
}

// ── sort comparators — verbatim mirrors of the client listers ───────────────
export function sortProducts(items) {
  items.sort((a, b) => {
    const oa = a.orderBy ?? null;
    const ob = b.orderBy ?? null;
    if (oa !== ob) {
      if (oa == null) return 1;
      if (ob == null) return -1;
      return oa - ob;
    }
    const na = (a.productName || '').toLowerCase();
    const nb = (b.productName || '').toLowerCase();
    return na.localeCompare(nb, 'th');
  });
  return items;
}
export function sortCourses(items) {
  items.sort((a, b) => {
    const oa = a.orderBy ?? null;
    const ob = b.orderBy ?? null;
    if (oa !== ob) {
      if (oa == null) return 1;
      if (ob == null) return -1;
      return oa - ob;
    }
    const na = (a.courseName || '').toLowerCase();
    const nb = (b.courseName || '').toLowerCase();
    return na.localeCompare(nb, 'th');
  });
  return items;
}
export function sortDfGroups(items) {
  items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
  return items;
}

// module-scope warm cache (per serverless instance) — keyed by branchId
const memCache = new Map(); // branchId → { at, payload }

async function readBranchLists(db, branchId) {
  const col = (name) => db.collection(`${PREFIX}/${name}`);
  const byBranch = (name) => col(name).where('branchId', '==', String(branchId)).get();
  const [products, courses, dfGroups, dfRates] = await Promise.all([
    byBranch('be_products'),
    byBranch('be_courses'),
    byBranch('be_df_groups'),
    byBranch('be_df_staff_rates'),
  ]);
  const shape = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  return {
    productItems: sortProducts(shape(products)),
    courseItems: sortCourses(shape(courses)),
    dfGroupItems: sortDfGroups(shape(dfGroups)),
    dfStaffRatesItems: shape(dfRates), // lister has no sort — mirror that
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  // NEVER shared-cacheable: authed master data (prices / DF rates). A CDN hit
  // would bypass the auth check below for anyone who guesses the URL.
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
    getDb(); // ensures the admin app exists before getAuth()
    let decoded;
    // checkRevoked=true (2026-07-21): disabled/offboarded staff are rejected
    // instantly instead of retaining access until the ~1h token expiry —
    // matches api/admin/_lib/adminAuth.js which always passes the flag.
    try { decoded = await getAuth(getApp()).verifyIdToken(token, true); }
    catch { return res.status(401).json({ ok: false, error: 'BAD_TOKEN' }); }
    // same gate firestore.rules isClinicStaff() applies to these collections
    if (decoded.isClinicStaff !== true && decoded.admin !== true) {
      return res.status(403).json({ ok: false, error: 'NOT_STAFF' });
    }

    const branchId = String(req.query.branchId || '');
    if (!branchId) return res.status(400).json({ ok: false, error: 'BRANCH_REQUIRED' });

    const nowMs = Date.now();
    const hit = memCache.get(branchId);
    if (hit && nowMs - hit.at < CACHE_TTL_MS) {
      return res.status(200).json({ ...hit.payload, cached: true });
    }

    const lists = await readBranchLists(getDb(), branchId);
    const payload = { ok: true, v: 1, branchId, generatedAt: new Date(nowMs).toISOString(), ...lists };
    memCache.set(branchId, { at: nowMs, payload });
    return res.status(200).json(payload);
  } catch (e) {
    console.error('[tfp-options] failed:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' }); // never leak internals
  }
}
