// ─── /api/admin/users — Firebase Auth user management ──────────────────────
// Privileged endpoint used by backend UI (StaffCRUDTab, DoctorCRUDTab in
// Phase 12.1+) to create/update/delete Firebase Auth users backing our
// be_staff + be_doctors records.
//
// Security posture:
//   1. Bearer ID token required in Authorization header
//   2. Caller verified via Admin SDK `verifyIdToken(token, true)` (rejects
//      revoked + expired tokens)
//   3. Caller must be admin (bootstrap UID env OR `admin:true` custom claim)
//   4. Self-protection: cannot delete own account, cannot revoke own admin
//      claim unless another admin exists (prevents lockout)
//   5. Input validation: email format, password length, required fields
//
// Dispatch: POST body `{ action, ...params }`. Mirrors api/proclinic/master.js
// pattern so frontend wiring stays consistent.

import { getAdminAuth, verifyAdminToken, isBootstrapAdmin } from './_lib/adminAuth.js';
import { getFirestore } from 'firebase-admin/firestore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;
const APP_ID = 'loverclinic-opd-4c39b';

// V28-tris (2026-04-26) — Firestore Admin SDK accessor for group lookup
// in setPermission. Reuses the firebase-admin app initialized by adminAuth.js.
let cachedFirestore = null;
function getAdminFirestore() {
  if (cachedFirestore) return cachedFirestore;
  // Trigger app init if not already (getAdminAuth handles app initialization)
  getAdminAuth();
  cachedFirestore = getFirestore();
  return cachedFirestore;
}

function bad(res, status, error) {
  res.status(status).json({ success: false, error });
  return null;
}

function serializeUser(userRecord) {
  if (!userRecord) return null;
  return {
    uid: userRecord.uid,
    email: userRecord.email || '',
    displayName: userRecord.displayName || '',
    disabled: !!userRecord.disabled,
    emailVerified: !!userRecord.emailVerified,
    isAdmin: userRecord.customClaims?.admin === true,
    // Phase 13.5.4 — hard-gate custom claims surfaced for client visibility
    isClinicStaff: userRecord.customClaims?.isClinicStaff === true,
    permissionGroupId: userRecord.customClaims?.permissionGroupId || '',
    createdAt: userRecord.metadata?.creationTime || '',
    lastSignInAt: userRecord.metadata?.lastSignInTime || '',
  };
}

async function handleList(auth, params) {
  const maxResults = Math.min(Math.max(Number(params.maxResults) || 100, 1), 1000);
  const pageToken = params.pageToken || undefined;
  const page = await auth.listUsers(maxResults, pageToken);
  return {
    users: page.users.map(serializeUser),
    pageToken: page.pageToken || null,
  };
}

async function handleGet(auth, params) {
  const uid = String(params.uid || '').trim();
  if (!uid) throw new Error('uid required');
  const user = await auth.getUser(uid);
  return serializeUser(user);
}

async function handleCreate(auth, params) {
  const email = String(params.email || '').trim();
  const password = String(params.password || '');
  const displayName = params.displayName ? String(params.displayName).trim() : undefined;
  const disabled = !!params.disabled;

  if (!EMAIL_RE.test(email)) throw new Error('invalid email format');
  if (password.length < MIN_PASSWORD) throw new Error(`password must be at least ${MIN_PASSWORD} characters`);

  const user = await auth.createUser({ email, password, displayName, disabled });

  if (params.makeAdmin === true) {
    await auth.setCustomUserClaims(user.uid, { admin: true });
    return serializeUser(await auth.getUser(user.uid));
  }
  return serializeUser(user);
}

async function handleUpdate(auth, params) {
  const uid = String(params.uid || '').trim();
  if (!uid) throw new Error('uid required');

  const update = {};
  if (params.email !== undefined) {
    const email = String(params.email).trim();
    if (!EMAIL_RE.test(email)) throw new Error('invalid email format');
    update.email = email;
  }
  if (params.password !== undefined) {
    const password = String(params.password);
    if (password.length < MIN_PASSWORD) throw new Error(`password must be at least ${MIN_PASSWORD} characters`);
    update.password = password;
  }
  if (params.displayName !== undefined) update.displayName = String(params.displayName).trim();
  if (params.disabled !== undefined) update.disabled = !!params.disabled;

  if (Object.keys(update).length === 0) throw new Error('no update fields provided — at least one field required');

  const user = await auth.updateUser(uid, update);
  return serializeUser(user);
}

async function handleDelete(auth, params, caller) {
  const uid = String(params.uid || '').trim();
  if (!uid) throw new Error('uid required');
  if (uid === caller.uid) throw new Error('cannot delete own account');
  await auth.deleteUser(uid);
  return { uid, deleted: true };
}

async function handleGrantAdmin(auth, params) {
  const uid = String(params.uid || '').trim();
  if (!uid) throw new Error('uid required');
  const existing = await auth.getUser(uid);
  const claims = { ...(existing.customClaims || {}), admin: true };
  await auth.setCustomUserClaims(uid, claims);
  return serializeUser(await auth.getUser(uid));
}

async function handleRevokeAdmin(auth, params, caller) {
  const uid = String(params.uid || '').trim();
  if (!uid) throw new Error('uid required');

  // Self-protection: caller cannot revoke own admin unless they're in the
  // bootstrap UID list (so env-granted root admins can't be locked out).
  if (uid === caller.uid && !isBootstrapAdmin(caller.uid)) {
    throw new Error('cannot revoke own admin claim (use bootstrap UID env to recover)');
  }

  const existing = await auth.getUser(uid);
  const claims = { ...(existing.customClaims || {}) };
  delete claims.admin;
  await auth.setCustomUserClaims(uid, claims);
  return serializeUser(await auth.getUser(uid));
}

// ─── Phase 13.5.4 — Hard-Gate Custom Claims (MVP) ──────────────────────────
// Set isClinicStaff + permissionGroupId on a Firebase user via setCustomUserClaims.
// Called by StaffFormModal auto-sync on staff save, and by the migration
// button in PermissionGroupsTab to backfill all existing be_staff users.
//
// Rule: claims must be set BEFORE deploying the strict claim-only rules
// change (Phase 13.5.4 Deploy 2). Otherwise existing logged-in users lose
// access. Migration flow:
//   Deploy 1: ship endpoint + auto-sync + migration button (rules unchanged)
//   User: log in to backend → click "Sync ทุก staff" in PermissionGroupsTab
//   Deploy 2: rules-only deploy with claim-only isClinicStaff() check
async function handleSetPermission(auth, params) {
  const uid = String(params.uid || '').trim();
  if (!uid) throw new Error('uid required');
  // permissionGroupId can be empty (unassigned) — claim still gets isClinicStaff=true
  const permissionGroupId = params.permissionGroupId
    ? String(params.permissionGroupId).trim()
    : '';

  const existing = await auth.getUser(uid);
  const claims = {
    ...(existing.customClaims || {}),
    isClinicStaff: true,
    permissionGroupId,
  };

  // ─── V28-tris (2026-04-26) — Auto-grant admin claim ──────────────────────
  // User directive: "ป้องกันอย่าให้เป็นอีกไม่ว่ากับ id ไหน mail ไหน".
  // Without this, admin adds staff to gp-owner group → soft-gate (V28)
  // says they're admin → they see admin sidebar → but hard-gate
  // (verifyAdminToken) rejects them → "Forbidden: admin privilege required"
  // chicken-and-egg loops back. V28-tris closes the loop by setting
  // admin:true claim AT THE TIME of group assignment.
  //
  // Triggers admin:true if EITHER:
  //   1. permissionGroupId === 'gp-owner' (canonical owner group)
  //   2. The group has permissions.permission_group_management === true
  //      (custom admin group with meta-perm — covers user-defined admin
  //      groups not named gp-owner)
  //
  // We do NOT auto-revoke admin if group changes to non-admin — that's
  // a separate explicit operation (revokeAdmin) to prevent accidental
  // lockout when admin temporarily downgrades themselves for testing.
  let grantAdminAuto = false;
  if (permissionGroupId === 'gp-owner') {
    grantAdminAuto = true;
  } else if (permissionGroupId) {
    // Group lookup via Firestore Admin SDK to check meta-perm
    try {
      const db = getAdminFirestore();
      const groupRef = db
        .collection('artifacts').doc(APP_ID)
        .collection('public').doc('data')
        .collection('be_permission_groups').doc(permissionGroupId);
      const groupDoc = await groupRef.get();
      if (groupDoc.exists && groupDoc.data()?.permissions?.permission_group_management === true) {
        grantAdminAuto = true;
      }
    } catch (err) {
      // Non-fatal — claim sync still proceeds without admin grant
      // eslint-disable-next-line no-console
      console.warn(`[setPermission] group lookup failed for ${permissionGroupId}: ${err?.message || err}`);
    }
  }

  if (grantAdminAuto) {
    claims.admin = true;
  }

  await auth.setCustomUserClaims(uid, claims);
  return serializeUser(await auth.getUser(uid));
}

async function handleClearPermission(auth, params, caller) {
  const uid = String(params.uid || '').trim();
  if (!uid) throw new Error('uid required');

  // Self-protection: caller cannot clear own claim unless they're a bootstrap
  // admin (env-granted) — otherwise they'd lock themselves out of the backend.
  if (uid === caller.uid && !isBootstrapAdmin(caller.uid)) {
    throw new Error('cannot clear own permission claim (use bootstrap UID env to recover)');
  }

  const existing = await auth.getUser(uid);
  const claims = { ...(existing.customClaims || {}) };
  delete claims.isClinicStaff;
  delete claims.permissionGroupId;
  await auth.setCustomUserClaims(uid, claims);
  return serializeUser(await auth.getUser(uid));
}

const ACTIONS = {
  list: (auth, p) => handleList(auth, p),
  get: (auth, p) => handleGet(auth, p),
  create: (auth, p) => handleCreate(auth, p),
  update: (auth, p) => handleUpdate(auth, p),
  delete: (auth, p, caller) => handleDelete(auth, p, caller),
  grantAdmin: (auth, p) => handleGrantAdmin(auth, p),
  revokeAdmin: (auth, p, caller) => handleRevokeAdmin(auth, p, caller),
  // Phase 13.5.4
  setPermission: (auth, p) => handleSetPermission(auth, p),
  clearPermission: (auth, p, caller) => handleClearPermission(auth, p, caller),
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    return bad(res, 405, 'method not allowed');
  }

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const body = req.body || {};
  const action = String(body.action || '').trim();
  const actionFn = ACTIONS[action];
  if (!actionFn) return bad(res, 400, `unknown action: ${action || '(empty)'}`);

  try {
    const auth = getAdminAuth();
    const data = await actionFn(auth, body, caller);
    res.status(200).json({ success: true, data });
  } catch (err) {
    const message = err?.message || 'internal error';
    const code = err?.code || '';
    const status = /required|invalid|cannot|unknown|must be/i.test(message) ? 400 : 500;
    res.status(status).json({ success: false, error: message, ...(code ? { code } : {}) });
  }
}
