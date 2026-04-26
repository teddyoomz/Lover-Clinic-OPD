// ─── /api/admin/bootstrap-self — One-shot admin bootstrap (V25-bis) ───────
// Genesis-case admin grant for the FIRST @loverclinic.com user.
//
// Background: V25 migration button surfaced "Forbidden: admin privilege
// required" because the bootstrap admin (loverclinic@loverclinic.com) had
// neither `admin: true` claim NOR a UID in FIREBASE_ADMIN_BOOTSTRAP_UIDS
// env. They could see the backend (soft-gate via email), but /api/admin/*
// gate (verifyAdminToken) rejected them.
//
// Chicken-and-egg: setting admin:true requires `grantAdmin` in
// /api/admin/users, which requires admin already. This endpoint breaks the
// loop with strict genesis guards.
//
// Security posture (DO NOT relax these without review):
//   1. Caller's Bearer ID token verified (signature + revoked check)
//   2. Caller email MUST match @loverclinic.com
//   3. Genesis check: NO other user may have admin:true claim. If even one
//      other admin exists, this endpoint refuses with 409 conflict.
//   4. Self-protection: caller's email is logged for audit
//   5. Idempotent on caller: re-running just confirms their admin claim
//
// After successful bootstrap, caller MUST refresh their ID token (call
// `auth.currentUser.getIdToken(true)` on the client) for the new claim
// to take effect.

import { getAdminAuth, verifyAdminToken } from './_lib/adminAuth.js';

const LOVERCLINIC_EMAIL_RE = /@loverclinic\.com$/i;

function bad(res, status, error, extra = {}) {
  res.status(status).json({ success: false, error, ...extra });
  return null;
}

// Returns the first existing admin (other than caller) found in the user
// table, or null. Pages through up to 10 batches of 1000 = 10k users
// before giving up (defensive — prevents perf degradation on huge tables).
async function findExistingAdmin(auth, callerUid) {
  let pageToken = undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await auth.listUsers(1000, pageToken);
    for (const u of result.users) {
      if (u.uid === callerUid) continue;
      if (u.customClaims?.admin === true) {
        return { uid: u.uid, email: u.email || '' };
      }
    }
    if (!result.pageToken) break;
    pageToken = result.pageToken;
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return bad(res, 405, 'method not allowed');

  // We do NOT call verifyAdminToken here (chicken-and-egg). We DO verify
  // the token signature ourselves so we can extract caller's UID + email.
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return bad(res, 401, 'Unauthorized: missing Bearer token');

  let decoded;
  try {
    const auth = getAdminAuth();
    decoded = await auth.verifyIdToken(token, true);
  } catch (err) {
    return bad(res, 401, `Unauthorized: ${err?.code || 'invalid-token'}`);
  }

  const callerUid = decoded.uid;
  const callerEmail = decoded.email || '';

  // Gate 1: caller email must match clinic domain
  if (!LOVERCLINIC_EMAIL_RE.test(callerEmail)) {
    return bad(res, 403, 'Forbidden: caller email must match @loverclinic.com');
  }

  // Gate 2: caller must NOT already be admin via env (use grantAdmin instead)
  if (decoded.admin === true) {
    // Idempotent — they're already admin. Add isClinicStaff if missing.
    const auth = getAdminAuth();
    const existing = await auth.getUser(callerUid);
    const claims = {
      ...(existing.customClaims || {}),
      admin: true,
      isClinicStaff: true,
    };
    await auth.setCustomUserClaims(callerUid, claims);
    return res.status(200).json({
      success: true,
      data: {
        bootstrapped: false,
        alreadyAdmin: true,
        uid: callerUid,
        email: callerEmail,
      },
    });
  }

  // Gate 3: GENESIS CHECK — no other user may have admin:true
  const auth = getAdminAuth();
  const existingAdmin = await findExistingAdmin(auth, callerUid);
  if (existingAdmin) {
    return bad(res, 409, 'Conflict: another admin already exists. Ask them to grant you admin via PermissionGroupsTab.', {
      existingAdmin: { uid: existingAdmin.uid, email: existingAdmin.email },
    });
  }

  // All gates passed → grant genesis admin
  const existing = await auth.getUser(callerUid);
  const claims = {
    ...(existing.customClaims || {}),
    admin: true,
    isClinicStaff: true,
  };
  await auth.setCustomUserClaims(callerUid, claims);

  // eslint-disable-next-line no-console
  console.log(`[bootstrap-self] genesis admin granted: uid=${callerUid} email=${callerEmail}`);

  return res.status(200).json({
    success: true,
    data: {
      bootstrapped: true,
      alreadyAdmin: false,
      uid: callerUid,
      email: callerEmail,
      reminder: 'Refresh ID token client-side via auth.currentUser.getIdToken(true) for the new claim to take effect.',
    },
  });
}
