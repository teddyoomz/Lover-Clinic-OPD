export const SESSION_STATUS = Object.freeze({ REQUESTED: 'requested', ACTIVE: 'active', SAVED: 'saved', CANCELLED: 'cancelled' });
export const CANCELLED_BY = Object.freeze({ PC: 'pc', TABLET: 'tablet', TIMEOUT: 'timeout' });
export const HEARTBEAT_INTERVAL_MS = 10000;
export const HEARTBEAT_STALE_MS = 30000;
export const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1h orphan cap (cron sweep, Task 10)

const TERMINAL = new Set([SESSION_STATUS.SAVED, SESSION_STATUS.CANCELLED]);
export function isTerminal(status) { return TERMINAL.has(status); }

// V81-fix1: tolerate every Firestore Timestamp serialization shape + JS primitives.
export function toMillis(ts) {
  if (ts == null) return 0;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'string') { const n = Date.parse(ts); return Number.isNaN(n) ? 0 : n; }
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  if (typeof ts._seconds === 'number') return ts._seconds * 1000 + Math.floor((ts._nanoseconds || 0) / 1e6);
  return 0;
}

export function isHeartbeatStale(lastMs, nowMs, staleMs = HEARTBEAT_STALE_MS) {
  return (nowMs - toMillis(lastMs)) > staleMs;
}
export function isPresenceReady(presence, nowMs) {
  if (!presence || presence.status !== 'idle') return false;
  return !isHeartbeatStale(presence.lastHeartbeatAt, nowMs);
}

const EDGES = {
  requested: new Set(['active', 'cancelled']),
  active: new Set(['saved', 'cancelled']),
  saved: new Set(), cancelled: new Set(),
};
export function canTransition(from, to) { return !!EDGES[from] && EDGES[from].has(to); }

export function buildPresenceUpsert({ deviceId, deviceName, branchId, uid, byName, status = 'idle', nowMs = Date.now() }) {
  return { deviceId, deviceName: deviceName || '', branchId: branchId || '', status, byUid: uid || '', byName: byName || '', lastHeartbeatAt: nowMs, updatedAt: nowMs };
}
export function buildSessionCreate({ sessionId, branchId, pcDeviceId, pcUid, tabletDeviceId, tabletName, template, patientLabel, nowMs = Date.now() }) {
  return {
    sessionId, branchId: branchId || '', pcDeviceId, pcUid: pcUid || '', tabletDeviceId, tabletName: tabletName || '',
    status: SESSION_STATUS.REQUESTED, cancelledBy: null,
    template: { id: template?.id || '', name: template?.name || '', category: template?.category || '' },
    patientLabel: patientLabel || '', templateImageUrl: null, editFabricJsonUrl: null, resultImageUrl: null, resultFabricJsonUrl: null,
    pcHeartbeatAt: nowMs, tabletHeartbeatAt: null,
    createdAt: nowMs, updatedAt: nowMs, expiresAt: nowMs + SESSION_MAX_AGE_MS,
  };
}

// Orphan-sweep decision (cron, Task 10). Non-terminal: reap when either side's
// heartbeat is stale OR the session is older than the 1h cap. Terminal: GC when
// older than the cap (the client deletes on success; this catches crashed clients).
export function shouldReap(session, nowMs) {
  if (!session) return false;
  if (isTerminal(session.status)) return (nowMs - toMillis(session.updatedAt)) > SESSION_MAX_AGE_MS;
  const pcStale = isHeartbeatStale(session.pcHeartbeatAt, nowMs);
  const tbStale = session.tabletHeartbeatAt != null && isHeartbeatStale(session.tabletHeartbeatAt, nowMs);
  return pcStale || tbStale || (nowMs - toMillis(session.createdAt)) > SESSION_MAX_AGE_MS;
}
