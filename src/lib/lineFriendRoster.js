// ─── LINE Friend Picker (2026-07-20) — pure roster helpers ──────────────────
// Shared by api/webhook/line.js (follow/unfollow capture) AND client UI
// (LineFriendPickerModal merge/search). PURE JS ONLY — no react/firebase
// imports (V36.G.51 class; the webhook imports from src/lib like
// lineBotResponder.js).
//
// be_line_friends doc shape (docId = `${branchId}_${lineUserId}`):
//   { lineUserId, displayName, pictureUrl, branchId, branchIdSource,
//     source: 'follow'|'followers-api', followedAt: ISO|null,
//     unfollowedAt: ISO|null, updatedAt: ISO }
// Writers: webhook follow handler + /api/admin/line-friends backfill (both
// admin SDK — firestore.rules: read isClinicStaff / write false).

/**
 * Decide the merge-set fields for a follow/unfollow webhook event.
 * Returns { fields } — caller does `ref.set({ lineUserId, ...fields }, { merge: true })`.
 * Never emits undefined leaves (V14 — Firestore rejects undefined).
 */
export function decideFollowEventUpdate({
  eventType, userId, existing, profile, branchId, branchIdSource, nowIso,
}) {
  const now = String(nowIso || '');
  if (eventType === 'unfollow') {
    if (existing) {
      // Soft flag only — keep name/pic via merge semantics.
      return { fields: { unfollowedAt: now, updatedAt: now } };
    }
    // Unknown user unfollowed (e.g. followed before this feature deployed) —
    // write a stub so the roster stays honest instead of crashing/orphaning.
    return {
      fields: {
        displayName: String(userId || ''),
        pictureUrl: '',
        branchId: String(branchId || ''),
        branchIdSource: String(branchIdSource || ''),
        source: 'follow',
        followedAt: null,
        unfollowedAt: now,
        updatedAt: now,
      },
    };
  }
  // follow (new / re-follow / duplicate)
  const displayName = String(profile?.displayName || userId || '');
  const pictureUrl = String(profile?.pictureUrl || '');
  // Duplicate follow (already following, never unfollowed) keeps the ORIGINAL
  // followedAt; re-follow after an unfollow — and a followers-api backfill doc
  // (followedAt null) — get a fresh stamp.
  const keepOriginal = !!(existing && existing.followedAt && !existing.unfollowedAt);
  return {
    fields: {
      displayName,
      pictureUrl,
      branchId: String(branchId || ''),
      branchIdSource: String(branchIdSource || ''),
      source: 'follow',
      followedAt: keepOriginal ? existing.followedAt : now,
      unfollowedAt: null,
      updatedAt: now,
    },
  };
}

function parseMs(v) {
  if (!v) return 0;
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Map a chat_conversations doc → roster row. LINE conversations only
 * (docId `line_<userId>`); facebook/other platforms → null.
 */
export function conversationToRosterRow(conv) {
  if (!conv || conv.platform !== 'line') return null;
  const id = String(conv.id || '');
  if (!id.startsWith('line_')) return null;
  return {
    lineUserId: id.slice('line_'.length),
    displayName: String(conv.displayName || ''),
    pictureUrl: String(conv.pictureUrl || ''),
    branchId: String(conv.branchId || ''),
    source: 'chat',
    unfollowed: false,
    sortMs: parseMs(conv.lastMessageAt),
  };
}

/**
 * Merge be_line_friends docs + chat_conversations docs into one deduped
 * roster (key = lineUserId). Chat badge wins; name/pic from the FRESHER
 * source (empty names never clobber non-empty); unfollowed flag carries
 * from the friend doc (honest even for people who chatted then unfollowed).
 * Sorted most-recent-activity first.
 */
export function mergeFriendRoster({ friends, conversations } = {}) {
  const byId = new Map();

  const upsert = (row) => {
    if (!row || !row.lineUserId) return;
    const prev = byId.get(row.lineUserId);
    if (!prev) { byId.set(row.lineUserId, { ...row }); return; }
    const newer = row.sortMs >= prev.sortMs ? row : prev;
    const older = newer === row ? prev : row;
    byId.set(row.lineUserId, {
      lineUserId: row.lineUserId,
      // Fresher non-empty name/pic wins; never clobber with empty.
      displayName: newer.displayName || older.displayName || '',
      pictureUrl: newer.pictureUrl || older.pictureUrl || '',
      branchId: newer.branchId || older.branchId || '',
      // 'chat' badge wins over follow/followers-api (proves a real conversation)
      source: [row.source, prev.source].includes('chat') ? 'chat' : newer.source,
      // unfollowed is friend-doc truth — sticky across merge order
      unfollowed: !!(row.unfollowed || prev.unfollowed),
      sortMs: Math.max(row.sortMs, prev.sortMs),
    });
  };

  for (const f of (Array.isArray(friends) ? friends : [])) {
    if (!f || !f.lineUserId) continue;
    upsert({
      lineUserId: String(f.lineUserId),
      displayName: String(f.displayName || ''),
      pictureUrl: String(f.pictureUrl || ''),
      branchId: String(f.branchId || ''),
      source: f.source === 'followers-api' ? 'followers-api' : 'follow',
      unfollowed: !!f.unfollowedAt,
      sortMs: Math.max(parseMs(f.followedAt), parseMs(f.updatedAt)),
    });
  }
  for (const c of (Array.isArray(conversations) ? conversations : [])) {
    upsert(conversationToRosterRow(c));
  }

  return [...byId.values()].sort(
    (a, b) => (b.sortMs - a.sortMs) || String(a.lineUserId).localeCompare(String(b.lineUserId))
  );
}

/** Case-insensitive substring search over displayName + lineUserId. */
export function searchRoster(rows, q) {
  const query = String(q || '').trim().toLowerCase();
  const list = Array.isArray(rows) ? rows : [];
  if (!query) return list;
  return list.filter(r =>
    String(r?.displayName || '').toLowerCase().includes(query) ||
    String(r?.lineUserId || '').toLowerCase().includes(query)
  );
}
