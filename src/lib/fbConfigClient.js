// src/lib/fbConfigClient.js
// V75 Item 3 — Per-branch FB Page configuration (parallel to lineConfigClient).
// Each branch has its own Page + webhook config stored at:
//   artifacts/{appId}/public/data/be_fb_configs/{branchId}
//
// User directive 2026-05-16: "แต่ละสาขาจะมี LineOA และ FB page แยกจากกัน
// อย่างสิ้นเชิง". Webhook routes incoming events by entry[].id (FB Page ID)
// → matches a config doc → resolves branchId → uses that config's tokens
// for signature verification + reply.
//
// Read/write contract:
//   - getFbConfig(branchId) → single be_fb_configs doc, null if not configured
//   - saveFbConfig(branchId, data) → setDoc({merge:true})
//   - listenToFbConfig(branchId, onChange, onError) → onSnapshot
//   - findFbConfigByPageId(pageId) → for webhook routing

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db, appId } from '../firebase.js';

export const DEFAULT_FB_CONFIG = Object.freeze({
  pageId: '',
  pageAccessToken: '',
  appSecret: '',
  verifyToken: '',
  displayName: '',
  enabled: false,
});

function fbConfigDocRef(branchId) {
  if (!branchId || typeof branchId !== 'string') {
    throw new Error('fbConfigClient: branchId required (got: ' + String(branchId) + ')');
  }
  return doc(db, 'artifacts', appId, 'public', 'data', 'be_fb_configs', branchId);
}

function fbConfigsColRef() {
  return collection(db, 'artifacts', appId, 'public', 'data', 'be_fb_configs');
}


export function mergeFbConfigDefaults(raw) {
  return { ...DEFAULT_FB_CONFIG, ...(raw || {}) };
}

export function normalizeFbConfigForWrite(input) {
  const r = input || {};
  return {
    pageId: String(r.pageId || '').trim(),
    pageAccessToken: String(r.pageAccessToken || '').trim(),
    appSecret: String(r.appSecret || '').trim(),
    verifyToken: String(r.verifyToken || '').trim(),
    displayName: String(r.displayName || '').trim(),
    enabled: !!r.enabled,
    updatedAt: r.updatedAt || new Date().toISOString(),
  };
}

export function validateFbConfig(cfg) {
  const errors = [];
  const c = cfg || {};
  if (c.enabled && (!c.pageId || !c.pageAccessToken)) {
    errors.push('เปิดใช้งาน FB Page ต้องกรอก Page ID + Page Access Token');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Read a branch's FB config from be_fb_configs. Returns null when the branch
 * has no per-branch config doc yet (admin configures it via FbSettingsTab).
 * (2026-06-13 AV195 — the legacy auto-seed from the secret-bearing
 * clinic_settings doc was removed; that client read is rule-denied by C2-bis.)
 */
export async function getFbConfig(branchId) {
  if (!branchId) return null;
  try {
    const snap = await getDoc(fbConfigDocRef(branchId));
    if (snap.exists()) {
      return mergeFbConfigDefaults(snap.data() || {});
    }
    // 2026-06-13 cleanup (AV195) — the legacy auto-seed from
    // clinic_settings/chat_config was REMOVED. That client-SDK read is denied
    // by WS1-C2-bis (chat_config holds LINE/FB SECRETS — staff-admin-SDK only),
    // so it only ever returned null + a console permission-denied. Worse,
    // chat_config holds the OLD secrets that are being rotated, so pre-filling
    // from it would seed stale/compromised values. Admin enters FB config per
    // branch via FbSettingsTab (manual inputs already present).
    return null;
  } catch {
    return null;
  }
}

export function listenToFbConfig(branchId, onChange, onError) {
  if (!branchId) {
    if (typeof onChange === 'function') onChange(null);
    return () => {};
  }
  try {
    const unsub = onSnapshot(
      fbConfigDocRef(branchId),
      (snap) => {
        if (!snap.exists()) {
          if (typeof onChange === 'function') onChange(null);
          return;
        }
        if (typeof onChange === 'function') {
          onChange(mergeFbConfigDefaults(snap.data() || {}));
        }
      },
      (err) => {
        if (typeof onError === 'function') onError(err);
      }
    );
    return unsub;
  } catch (err) {
    if (typeof onError === 'function') onError(err);
    return () => {};
  }
}

export async function saveFbConfig(branchId, data) {
  if (!branchId || typeof branchId !== 'string' || !branchId.trim()) {
    throw new Error('saveFbConfig: branchId required');
  }
  const validation = validateFbConfig(data);
  if (!validation.valid) {
    throw new Error('saveFbConfig: ' + validation.errors.join('; '));
  }
  const payload = normalizeFbConfigForWrite({ ...(data || {}), branchId });
  await setDoc(fbConfigDocRef(branchId), payload, { merge: true });
  return { branchId, ...payload };
}

/**
 * Find the fb config that matches a given FB Page ID. Used by the webhook
 * to route incoming events to the correct branch. Returns
 * { config, branchId } or null.
 */
export async function findFbConfigByPageId(pageId) {
  if (!pageId || typeof pageId !== 'string') return null;
  try {
    const q = query(fbConfigsColRef(), where('pageId', '==', String(pageId)), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { branchId: d.id, config: mergeFbConfigDefaults(d.data() || {}) };
  } catch {
    return null;
  }
}
