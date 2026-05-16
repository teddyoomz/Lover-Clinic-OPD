// api/admin/_lib/fbConfigAdmin.js
// V78 (2026-05-16 NIGHT — BUG-CHAT-1/2/4) — server-side per-branch FB config
// resolver. Mirrors lineConfigAdmin.js shape so send.js + saved-replies.js +
// (future) fb-test.js consume the same precedence:
//   1. branchId arg → be_fb_configs/{branchId}
//   2. legacy clinic_settings/chat_config.facebook fallback (V75 auto-seed era)
//
// Class-of-bug: V12 multi-reader-sweep at API-layer boundary. V75 wired the
// UI (ChatPanel listener + admin tabs) for per-branch but the 3 webhook
// endpoints (send / saved-replies / fb-test) were not migrated together. The
// adversarial Round 1 audit (BUG-CHAT-1) caught this — admin in พระราม 3 was
// sending FROM นครราชสีมา's FB Page tokens.

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';

function configCol(db) {
  return db.collection(`artifacts/${APP_ID}/public/data/be_fb_configs`);
}

function chatConfigDoc(db) {
  return db.doc(`artifacts/${APP_ID}/public/data/clinic_settings/chat_config`);
}

/**
 * Read a branch's FB config from be_fb_configs/{branchId}.
 * Returns null if the doc doesn't exist or read fails.
 */
export async function getFbConfigForBranch(db, branchId) {
  if (!db || !branchId) return null;
  try {
    const snap = await configCol(db).doc(String(branchId)).get();
    if (!snap.exists) return null;
    return { branchId: String(branchId), ...(snap.data() || {}) };
  } catch {
    return null;
  }
}

/**
 * Read legacy chat_config.facebook fallback for V75-transition compat.
 * Returns null when doc/field missing.
 */
export async function getLegacyChatConfigFb(db) {
  if (!db) return null;
  try {
    const snap = await chatConfigDoc(db).get();
    if (!snap.exists) return null;
    const fb = snap.data()?.facebook || null;
    if (!fb) return null;
    return {
      branchId: null,
      source: 'chat_config',
      ...fb,
    };
  } catch {
    return null;
  }
}

/**
 * Resolver for admin endpoints (send, saved-replies, fb-test).
 * Caller passes branchId when known (from conv.branchId / request body).
 *
 * Returns { config, branchId, source } | null.
 */
export async function resolveFbConfigForAdmin(db, { branchId } = {}) {
  if (!db) return null;
  if (branchId) {
    const cfg = await getFbConfigForBranch(db, branchId);
    if (cfg && cfg.pageAccessToken) {
      return { config: cfg, branchId: cfg.branchId, source: 'be_fb_configs' };
    }
  }
  const legacy = await getLegacyChatConfigFb(db);
  if (legacy && legacy.pageAccessToken) {
    return { config: legacy, branchId: null, source: 'chat_config' };
  }
  return null;
}
