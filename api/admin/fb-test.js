// api/admin/fb-test.js
// V75 Item 3 — Test FB Page Access Token + Page ID via FB Graph API /me.
//
// Returns:
//   200 { ok: true, pageId, pageName }       — token valid, pageId matches
//   200 { ok: false, reason }                 — FB returned error OR pageId mismatch
//   400 { error }                             — missing pageId / pageAccessToken
//   401/403                                   — auth (written by verifyAdminToken)
//   405 { error }                             — non-POST
//
// Mirrors api/admin/line-test.js shape (V32-tris-ter-fix server-side proxy
// pattern: browser CORS blocks api.line.me + graph.facebook.com from being
// hit directly with credentials; admin endpoint proxies the test).
//
// Rule E exception: api/admin/* is production infrastructure.

import { verifyAdminToken } from './_lib/adminAuth.js';

const GRAPH_API_VERSION = 'v25.0';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const caller = await verifyAdminToken(req, res);
  if (!caller) return; // 401/403 already written

  const { pageId, pageAccessToken } = req.body || {};
  if (!pageId || !pageAccessToken) {
    return res.status(400).json({ error: 'pageId + pageAccessToken required' });
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(
    pageAccessToken
  )}`;

  let fbResp;
  try {
    fbResp = await fetch(url);
  } catch (e) {
    return res
      .status(200)
      .json({ ok: false, reason: `FB request failed: ${e?.message || 'network error'}` });
  }

  let data;
  try {
    data = await fbResp.json();
  } catch {
    data = {};
  }

  if (!fbResp.ok) {
    const fbErr =
      (data && data.error && (data.error.message || data.error.type)) || `HTTP ${fbResp.status}`;
    return res.status(200).json({ ok: false, reason: fbErr });
  }

  if (String(data.id || '') !== String(pageId)) {
    return res.status(200).json({
      ok: false,
      reason: `pageId mismatch (token returned ${data.id || '∅'}, expected ${pageId})`,
    });
  }

  return res.status(200).json({
    ok: true,
    pageId: String(data.id),
    pageName: String(data.name || ''),
  });
}
