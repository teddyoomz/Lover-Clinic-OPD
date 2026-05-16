// src/lib/fbTestClient.js
// V75 Item 3 — Test FB Page Access Token + Page ID via /api/admin/fb-test.
// FB Graph API has CORS restrictions for browser-side fetch, so we proxy
// through our serverless endpoint. Mirrors lineTestClient.js shape.

import { auth } from '../firebase.js';

export async function testFbConnection({ pageId, pageAccessToken } = {}) {
  if (!pageId || !pageAccessToken) {
    throw new Error('testFbConnection: pageId + pageAccessToken required');
  }
  if (!auth?.currentUser) throw new Error('testFbConnection: not signed in');
  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/admin/fb-test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pageId, pageAccessToken }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
