// ─── /api/admin/sync-self — Self-service claim sync (V29) ────────────────
//
// User directive (verbatim): "เอาปุ่ม Bootstrap ตัวเองเป็น admin, Sync ทุก
// staff → Claims, ลบ test-probe ค้าง. ออกให้หมด ไม่ต้องการระบบ manual
// เหล่านี้ ตอนนี้มี id admin แล้ว ต่อไปทุก id จะต้องทำตามสิทธิ์ตัวเองได้
// แบบอัตโนมัติ ไม่ต้องกดปุ่มบ้าๆเหล่านี้ ไม่มีใครเขาทำกัน ทำให้ Perfect
// 100% กับทุก id ทุกสิทธิ์ที่ id นั้นได้รับด้วย".
//
// V29: any signed-in user can self-sync their Firebase Auth custom claims
// based on their own be_staff doc + group's permission. No admin gate
// required — caller can ONLY sync their own UID's claims.
//
// Security model:
//   1. Bearer ID token verified (signature)
//   2. Lookup be_staff WHERE firebaseUid == caller's UID (their own only)
//   3. Set claims for caller's UID (cannot escalate beyond what admin
//      explicitly granted them via the be_staff doc)
//   4. Group lookup determines admin: true claim (gp-owner OR meta-perm)
//
// Flow per login (called from UserPermissionContext useEffect):
//   - Token has admin OR isClinicStaff with matching groupId? Skip
//   - Otherwise: call sync-self → token refresh → claims propagate
//
// Returns synced=false if no be_staff doc (bootstrap-self handles
// owner-account fallback).

import { getAdminAuth } from './_lib/adminAuth.js';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

let cachedFirestore = null;
function getAdminFirestore() {
  if (cachedFirestore) return cachedFirestore;
  getAdminAuth();
  cachedFirestore = getFirestore();
  return cachedFirestore;
}

function bad(res, status, error, extra = {}) {
  res.status(status).json({ success: false, error, ...extra });
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return bad(res, 405, 'method not allowed');

  // Verify Bearer ID token signature (NOT admin gate — self-service)
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return bad(res, 401, 'Bearer ID token required');

  let decoded;
  try {
    const auth = getAdminAuth();
    decoded = await auth.verifyIdToken(token, true);
  } catch (err) {
    return bad(res, 401, `invalid token: ${err?.code || err?.message || 'unknown'}`);
  }

  const callerUid = decoded.uid;
  const callerEmail = decoded.email || '';
  const auth = getAdminAuth();
  const db = getAdminFirestore();

  // Look up be_staff doc by firebaseUid (caller's OWN identity)
  let staffDoc = null;
  let permissionGroupId = '';
  try {
    const staffSnap = await db
      .collection('artifacts').doc(APP_ID)
      .collection('public').doc('data')
      .collection('be_staff')
      .where('firebaseUid', '==', callerUid)
      .limit(1)
      .get();

    if (!staffSnap.empty) {
      staffDoc = staffSnap.docs[0];
      permissionGroupId = staffDoc.data()?.permissionGroupId || '';
    }
  } catch (err) {
    return bad(res, 500, `staff lookup failed: ${err?.message || err}`);
  }

  // No be_staff doc → caller is either bootstrap admin (owner email) or
  // unauthorized random user. Tell client to fall back to bootstrap-self.
  if (!staffDoc) {
    return res.status(200).json({
      success: true,
      data: {
        synced: false,
        reason: 'no be_staff doc — try bootstrap-self for owner accounts',
        uid: callerUid,
        email: callerEmail,
      },
    });
  }

  // Compute new claims based on be_staff + group
  const existing = await auth.getUser(callerUid);
  const newClaims = {
    ...(existing.customClaims || {}),
    isClinicStaff: true,
    permissionGroupId,
  };

  // V28-tris/V29: auto-grant admin if group is gp-owner OR has meta-perm
  let adminGranted = false;
  if (permissionGroupId === 'gp-owner') {
    newClaims.admin = true;
    adminGranted = true;
  } else if (permissionGroupId) {
    try {
      const groupRef = db
        .collection('artifacts').doc(APP_ID)
        .collection('public').doc('data')
        .collection('be_permission_groups').doc(permissionGroupId);
      const groupDoc = await groupRef.get();
      if (groupDoc.exists && groupDoc.data()?.permissions?.permission_group_management === true) {
        newClaims.admin = true;
        adminGranted = true;
      }
    } catch (err) {
      // Non-fatal — claim still set without admin
      // eslint-disable-next-line no-console
      console.warn(`[sync-self] group lookup failed for ${permissionGroupId}: ${err?.message || err}`);
    }
  }

  await auth.setCustomUserClaims(callerUid, newClaims);

  // eslint-disable-next-line no-console
  console.log(`[sync-self] uid=${callerUid} email=${callerEmail} group=${permissionGroupId} admin=${adminGranted}`);

  return res.status(200).json({
    success: true,
    data: {
      synced: true,
      uid: callerUid,
      email: callerEmail,
      permissionGroupId,
      adminGranted,
      reminder: 'Refresh ID token client-side via auth.currentUser.getIdToken(true) for the new claim to take effect.',
    },
  });
}
