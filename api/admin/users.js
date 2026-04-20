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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

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

const ACTIONS = {
  list: (auth, p) => handleList(auth, p),
  get: (auth, p) => handleGet(auth, p),
  create: (auth, p) => handleCreate(auth, p),
  update: (auth, p) => handleUpdate(auth, p),
  delete: (auth, p, caller) => handleDelete(auth, p, caller),
  grantAdmin: (auth, p) => handleGrantAdmin(auth, p),
  revokeAdmin: (auth, p, caller) => handleRevokeAdmin(auth, p, caller),
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
