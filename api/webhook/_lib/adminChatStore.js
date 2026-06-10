// ─── Shared admin-SDK chat store for the FB/LINE webhooks (WS1 H1, 2026-06-10) ───
// BACKGROUND: the webhooks previously wrote chat_conversations + messages via
// UNAUTHENTICATED Firestore REST (firestorePatch), which REQUIRED the firestore.rules
// `chat_conversations create, update: if true` rule — an open write surface any internet
// spammer could hit. These helpers write via the firebase-admin SDK (which bypasses
// rules), so the rule can be tightened to isClinicStaff().
//
// LOW-RISK DIFF: callers keep their EXISTING REST-typed field literals
// (`{ text: { stringValue }, unreadCount: { integerValue } }`) AND their existing
// `existingConv?.fields?.X?.stringValue` reads — these converters translate between the
// REST `{stringValue/integerValue/...}` shape and the plain JS values the admin SDK uses,
// so the webhook handler bodies stay byte-identical except the call name.
//
// (send.js already uses the admin SDK directly — only line.js + facebook.js used REST.)

// REST-typed field object → plain JS values (for admin SDK `.set()`).
export function restFieldsToPlain(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (v == null || typeof v !== 'object') continue;
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
    else if ('nullValue' in v) out[k] = null;
    // (mapValue/arrayValue/timestampValue are not used by chat writes; extend if needed)
  }
  return out;
}

// Plain Firestore doc data → REST-typed `{fields:{...}}` shape (so the existing read code
// `existingConv?.fields?.X?.stringValue` keeps working unchanged).
export function plainToRestFields(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (typeof v === 'string') out[k] = { stringValue: v };
    else if (typeof v === 'boolean') out[k] = { booleanValue: v };
    else if (typeof v === 'number') out[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (v === null || v === undefined) out[k] = { nullValue: null };
    else out[k] = { stringValue: String(v) }; // timestamps / objects → string (read code only reads strings)
  }
  return out;
}

// Read a chat doc via admin SDK; returns the REST-shaped `{ fields: {...} }` the webhook
// read code expects, or null if the doc does not exist. `db` = firebase-admin Firestore.
export async function adminChatGet(db, path) {
  const snap = await db.doc(path).get();
  if (!snap.exists) return null;
  return { fields: plainToRestFields(snap.data()) };
}

// Write a chat doc via admin SDK (merge — same semantics as the prior updateMask REST
// PATCH: only the provided fields change). `restTypedFields` = the caller's existing
// `{ x: { stringValue } }` literal. `db` = firebase-admin Firestore.
export async function adminChatSet(db, path, restTypedFields) {
  await db.doc(path).set(restFieldsToPlain(restTypedFields), { merge: true });
}
