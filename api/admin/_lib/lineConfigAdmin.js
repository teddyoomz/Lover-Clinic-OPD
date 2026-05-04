// ─── Line Config (admin SDK) — Phase BS V3 (2026-05-04) ────────────────
// Server-side mirror of src/lib/lineConfigClient.js. Used by the LINE
// webhook + admin endpoints to resolve per-branch LINE OA config from
// be_line_configs/{branchId} via firebase-admin SDK.
//
// Resolution strategy (used by webhook + admin endpoints):
//   1. If caller provides explicit branchId → read be_line_configs/{branchId}
//   2. If incoming webhook event has destination → query be_line_configs
//      where destination==X
//   3. Fallback to legacy clinic_settings/chat_config.line during transition
//      (webhook receives events from a single LINE channel today; once all
//      branches are configured, fallback can be removed)
//
// Returns null on any failure (caller decides how to react — webhook silently
// drops, admin endpoint surfaces a 503 with config-missing).

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';

function configCol(db) {
  return db.collection(`artifacts/${APP_ID}/public/data/be_line_configs`);
}

function chatConfigDoc(db) {
  return db.doc(`artifacts/${APP_ID}/public/data/clinic_settings/chat_config`);
}

/**
 * Read a branch's LINE config from be_line_configs/{branchId}.
 * Returns null if the doc doesn't exist or read fails.
 */
export async function getLineConfigForBranch(db, branchId) {
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
 * Find a config matching an incoming LINE webhook event's destination
 * (the bot's own LINE userId — present on every event payload).
 */
export async function findLineConfigByDestination(db, destination) {
  if (!db || !destination) return null;
  try {
    const snap = await configCol(db)
      .where('destination', '==', String(destination))
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data() || {};
    return { branchId: data.branchId || d.id, ...data };
  } catch {
    return null;
  }
}

/**
 * Read legacy chat_config.line as a fallback during the BS-V3 transition.
 * Returns null when the doc is missing, the line subkey is empty, or
 * the read fails. Includes branchId: null to make consumers explicit.
 */
export async function getLegacyChatConfigLine(db) {
  if (!db) return null;
  try {
    const snap = await chatConfigDoc(db).get();
    if (!snap.exists) return null;
    const line = snap.data()?.line || null;
    if (!line) return null;
    return {
      branchId: null,           // legacy doc — no branch attribution
      source: 'chat_config',
      ...line,
    };
  } catch {
    return null;
  }
}

/**
 * Resolution helper for the LINE webhook. Tries (in order):
 *   1. event.destination → be_line_configs[destination==X]
 *   2. legacy chat_config.line fallback
 *
 * Returns { config, branchId, source } | null. The webhook caller uses
 * config.channelSecret for signature verification + config.channelAccessToken
 * for reply API calls. branchId stamps writes to be_link_requests.
 */
export async function resolveLineConfigForWebhook(db, event) {
  if (!db) return null;
  // Try destination-based routing first
  const dest = event?.destination;
  if (dest) {
    const match = await findLineConfigByDestination(db, dest);
    if (match && match.channelAccessToken && match.channelSecret) {
      return {
        config: match,
        branchId: match.branchId || null,
        source: 'be_line_configs',
      };
    }
  }
  // Fallback to legacy chat_config.line
  const legacy = await getLegacyChatConfigLine(db);
  if (legacy && legacy.channelAccessToken && legacy.channelSecret) {
    return {
      config: legacy,
      branchId: null,
      source: 'chat_config',
    };
  }
  return null;
}

/**
 * Resolution helper for admin endpoints (line-test, send-document,
 * customer-line-link, link-requests). Caller passes branchId when known
 * (e.g. from request body or customer.branchId). Falls back to legacy.
 *
 * Returns { config, branchId, source } | null.
 */
export async function resolveLineConfigForAdmin(db, { branchId } = {}) {
  if (!db) return null;
  if (branchId) {
    const cfg = await getLineConfigForBranch(db, branchId);
    if (cfg && cfg.channelAccessToken) {
      return { config: cfg, branchId: cfg.branchId, source: 'be_line_configs' };
    }
  }
  const legacy = await getLegacyChatConfigLine(db);
  if (legacy && legacy.channelAccessToken) {
    return { config: legacy, branchId: null, source: 'chat_config' };
  }
  return null;
}
