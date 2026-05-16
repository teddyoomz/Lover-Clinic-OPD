// api/webhook/_lib/fbConfig.js
// V75 Item 3 — admin-SDK lookup for be_fb_configs by Page ID.
// Webhook is unauth (FB signature is the gate) so we use firebase-admin SDK
// to bypass Firestore rules. Mirrors api/admin/_lib/lineConfigAdmin pattern.

/**
 * Look up a be_fb_configs doc by Page ID. Returns null on miss or error.
 *
 * @param {object} adminDb — firebase-admin Firestore instance
 * @param {string} appId — Firebase app id (canonical path prefix)
 * @param {string} pageId — FB Page ID to match against be_fb_configs.pageId
 * @returns {Promise<{branchId: string, pageId: string, [extra]}|null>}
 */
export async function getFbConfigByPageId(adminDb, appId, pageId) {
  if (!adminDb || !appId || !pageId) return null;
  try {
    const snap = await adminDb
      .collection(`artifacts/${appId}/public/data/be_fb_configs`)
      .where('pageId', '==', String(pageId))
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { branchId: d.id, ...d.data() };
  } catch {
    return null;
  }
}
