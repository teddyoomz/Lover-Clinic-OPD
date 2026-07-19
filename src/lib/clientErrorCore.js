// ─── Client Error Core (2026-07-19) — pure shared client/server ────────────
//
// One module owns the beacon payload contract end-to-end: the CLIENT sanitizes
// (sanitizeErrorPayload → PHI-safe, truncated), the SERVER re-validates
// (validateClientErrorBody — never trusts the client), and the viewer groups
// (groupClientErrors). Pure JS, no firebase imports — used by
// src/lib/errorBeacon.js, api/client-error.js, InfraHealthSection.jsx, tests.
//
// PRIVACY CONTRACT (non-negotiable): the payload carries error text + the URL
// PATH + query param NAMES only. Query param VALUES are stripped (patient link
// tokens live in ?patient=/?session=/?schedule= values), and no form data /
// PHI is ever read. Rule C2.

export const CLIENT_ERROR_LIMITS = Object.freeze({
  message: 500,
  stack: 4000,
  url: 300,
  ua: 300,
  bodyBytes: 10240, // reject any POST body larger than this
  dailyCap: 500,    // max stored docs per Bangkok day — spam/cost ceiling
});

/** Keep pathname + "?" + param NAMES in original order; drop every value.
 *  "/x?patient=SECRET&tab=1" → "/x?patient=&tab=" */
export function sanitizeUrlForBeacon(href) {
  try {
    const s = String(href || '');
    if (!s) return '';
    // Tolerate both absolute and relative forms without needing an origin.
    const u = new URL(s, 'https://x.invalid');
    const names = [];
    for (const [k] of u.searchParams) names.push(`${k}=`);
    const q = names.length ? `?${names.join('&')}` : '';
    return `${u.pathname}${q}`.slice(0, CLIENT_ERROR_LIMITS.url);
  } catch {
    return '';
  }
}

/** Customer-facing link routes (query-driven SPA routing). Everything else is
 *  the staff app. */
export function deriveSurface(href) {
  const s = String(href || '');
  return /[?&](patient|session|schedule|ed)=/.test(s) ? 'patient' : 'staff';
}

/** djb2 over message + first stack line — deterministic dedupe key, no crypto
 *  dependency, stable across client + viewer grouping. */
export function hashError({ message, stack } = {}) {
  const firstStackLine = String(stack || '').split('\n').find(l => l.trim()) || '';
  const input = `${String(message || '')}|${firstStackLine.trim()}`;
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h * 33) ^ input.charCodeAt(i)) >>> 0; // eslint-disable-line no-bitwise
  }
  return `e${h.toString(36)}`;
}

/** CLIENT side: build the wire payload. Returns null when there is nothing
 *  meaningful to report (empty message). */
export function sanitizeErrorPayload({ message, stack, href, ua, now } = {}) {
  const msg = String(message || '').trim().slice(0, CLIENT_ERROR_LIMITS.message);
  if (!msg) return null;
  return {
    message: msg,
    stack: String(stack || '').slice(0, CLIENT_ERROR_LIMITS.stack),
    url: sanitizeUrlForBeacon(href),
    ua: String(ua || '').slice(0, CLIENT_ERROR_LIMITS.ua),
    surface: deriveSurface(href),
    hash: hashError({ message: msg, stack }),
    clientTs: Number(now) || 0,
  };
}

const ALLOWED_SURFACES = new Set(['staff', 'patient']);

/** SERVER side: strict re-validation + re-truncation of an untrusted body.
 *  Field allowlist only — extra fields are dropped, wrong types rejected. */
export function validateClientErrorBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'BAD_BODY' };
  }
  const msg = typeof body.message === 'string' ? body.message.trim() : '';
  if (!msg) return { ok: false, reason: 'NO_MESSAGE' };
  const surface = ALLOWED_SURFACES.has(body.surface) ? body.surface : 'unknown';
  const doc = {
    message: msg.slice(0, CLIENT_ERROR_LIMITS.message),
    stack: typeof body.stack === 'string' ? body.stack.slice(0, CLIENT_ERROR_LIMITS.stack) : '',
    // Server re-sanitizes the URL — a hand-crafted POST cannot smuggle values in.
    url: sanitizeUrlForBeacon(typeof body.url === 'string' ? body.url : ''),
    ua: typeof body.ua === 'string' ? body.ua.slice(0, CLIENT_ERROR_LIMITS.ua) : '',
    surface,
    hash: typeof body.hash === 'string' && /^e[0-9a-z]{1,13}$/.test(body.hash)
      ? body.hash
      : hashError({ message: msg, stack: body.stack }),
    clientTs: Number.isFinite(Number(body.clientTs)) ? Number(body.clientTs) : 0,
  };
  return { ok: true, doc };
}

/** Viewer grouping: rows (each {hash,message,surface,url,createdAtMs}) →
 *  newest-first groups with counts. */
export function groupClientErrors(rows) {
  const byHash = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue;
    const key = String(r.hash || hashError(r));
    const g = byHash.get(key);
    const ms = Number(r.createdAtMs) || 0;
    if (!g) {
      byHash.set(key, {
        hash: key,
        message: String(r.message || '').slice(0, 200),
        surface: String(r.surface || 'unknown'),
        sampleUrl: String(r.url || ''),
        count: 1,
        lastMs: ms,
      });
    } else {
      g.count += 1;
      if (ms > g.lastMs) { g.lastMs = ms; g.sampleUrl = String(r.url || g.sampleUrl); }
    }
  }
  return [...byHash.values()].sort((a, b) => b.lastMs - a.lastMs);
}
