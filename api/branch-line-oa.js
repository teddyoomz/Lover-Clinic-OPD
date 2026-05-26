// ─── /api/branch-line-oa — PUBLIC per-branch LINE OA add-friend URL (anon) ───
// The PatientForm success screen (anon, no login) shows an "Add LINE OA" button
// for the SESSION's branch. The branch's LINE add-URL lives at
// be_branches/{branchId}.settings.lineOaUrl (admin-set in BranchesTab, a public
// lin.ee link) — but be_branches is clinic-staff-only (firestore.rules:244), so
// anon CANNOT read it client-side. THIS endpoint is the secure path: admin SDK
// reads ONLY the public lin.ee add-URL and returns nothing else (no license #,
// tax id, address, or other branch fields leak). Mirrors api/patient-view.js.
//
// AV139 (anon-safety): return ONLY lineAddUrl. NEVER widen the response with
// other be_branches fields. be_branches rules MUST stay isClinicStaff.
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

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
const dataCol = (db, c) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(c);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const branchId = String(req.query.branchId || '');
  // branchId format = BR-<ts>-<hex>; validate to avoid arbitrary doc lookups.
  if (!branchId || !/^[A-Za-z0-9_-]{6,64}$/.test(branchId)) {
    return res.status(400).json({ ok: false, error: 'BAD_BRANCH_ID', lineAddUrl: '' });
  }

  try {
    const db = getDb();
    const snap = await dataCol(db, 'be_branches').doc(branchId).get();
    const raw = snap.exists ? (snap.data()?.settings?.lineOaUrl || '') : '';
    // Only emit an https:// lin.ee/line.me-style add-URL; anything else → empty.
    const lineAddUrl = (typeof raw === 'string' && /^https:\/\//i.test(raw.trim())) ? raw.trim() : '';
    return res.status(200).json({ ok: true, lineAddUrl });
  } catch (e) {
    console.error('[branch-line-oa]', e?.message);
    // Fail-soft: hide the card, never break the success screen.
    return res.status(200).json({ ok: true, lineAddUrl: '' });
  }
}
