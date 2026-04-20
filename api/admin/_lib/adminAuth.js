// ─── Firebase Admin SDK bootstrap + ID-token admin gate ─────────────────────
// Purpose: production-grade Firebase Auth admin operations for LoverClinic
// backend (create/delete/disable staff + doctor accounts, custom claims).
//
// Admin gate = caller's UID is in `FIREBASE_ADMIN_BOOTSTRAP_UIDS` env (root
// admins) OR decoded token has `admin === true` custom claim. Bootstrap list
// exists so first-deploy can grant admin without chicken-and-egg.
//
// NOT @dev-only (rule H-bis): api/admin/* is production infrastructure.
// Rule E exception: backend UI may call /api/admin/* — restriction is on
// /api/proclinic/* (ProClinic write-back). See .claude/rules/03-stack.md.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const DEFAULT_PROJECT_ID = 'loverclinic-opd-4c39b';

let cachedAuth = null;
let initError = null;

function resolveApp() {
  if (getApps().length > 0) return getApp();

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error('firebase-admin not configured: FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY required');
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || DEFAULT_PROJECT_ID,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, '\n'),
    }),
  });
}

export function getAdminAuth() {
  if (cachedAuth) return cachedAuth;
  if (initError) throw initError;
  try {
    cachedAuth = getAuth(resolveApp());
    return cachedAuth;
  } catch (err) {
    initError = err;
    throw err;
  }
}

function parseBootstrapUids() {
  const raw = process.env.FIREBASE_ADMIN_BOOTSTRAP_UIDS || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function isBootstrapAdmin(uid) {
  if (!uid) return false;
  return parseBootstrapUids().includes(uid);
}

// verifyAdminToken(req) — returns { uid, email, isAdmin, decoded } or null.
// Writes 401/403 to res and returns null on failure. checkRevoked=true so
// disabled/revoked tokens get rejected instantly.
export async function verifyAdminToken(req, res) {
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized: missing Bearer token' });
    return null;
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch (err) {
    res.status(401).json({ success: false, error: `Unauthorized: ${err?.code || 'invalid-token'}` });
    return null;
  }

  const isAdmin = decoded.admin === true || isBootstrapAdmin(decoded.uid);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: 'Forbidden: admin privilege required' });
    return null;
  }

  return { uid: decoded.uid, email: decoded.email || '', isAdmin: true, decoded };
}

// Reset module state — test-only helper.
export function __resetAdminAuthForTests() {
  cachedAuth = null;
  initError = null;
}
