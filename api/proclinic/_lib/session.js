// ─── ProClinic Session Manager ─────────────────────────────────────────────
// Strategy:
//   1. Load cached cookies from Firestore → use immediately (no test request)
//   2. If no cache → performLogin → save cookies
//   3. fetchText auto-detects login page → re-login + retry transparently

import { extractCSRF } from './scraper.js';
import { parseRetryAfterMs } from './retry.js';

// Custom error class for session expiry detection (fallback when re-login also fails)
export class SessionExpiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionExpiredError';
    this.sessionExpired = true;
  }
}

// HTTP-status-carrying error — thrown only when callers opt into `strictHttp`.
// withRetry() inspects `.status` + `.retryAfterMs` to decide retry behavior.
export class HttpStatusError extends Error {
  constructor(status, statusText, url, retryAfterMs) {
    super(`HTTP ${status} ${statusText || ''}${url ? ` — ${url}` : ''}`.trim());
    this.name = 'HttpStatusError';
    this.status = status;
    this.statusText = statusText || '';
    this.url = url || '';
    if (retryAfterMs != null) this.retryAfterMs = retryAfterMs;
  }
}

// A7: AbortController-based fetch timeout. `timeoutMs=0` = no timeout (default).
// Emits an Error with `.timeout=true` on abort — withRetry treats that as
// retriable (no `.status` set, not sessionExpired).
async function fetchWithTimeout(url, options = {}, timeoutMs = 0) {
  if (!timeoutMs || timeoutMs <= 0) return fetch(url, options);

  // Merge caller's signal with our timeout signal. If the caller aborts, we
  // abort too; if we time out, we don't fight the caller's abort either.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const callerSignal = options.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
      err.timeout = true;
      err.cause = e;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const SESSION_DOC_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/proclinic_session`;

// A4: gate verbose session logs behind an opt-in flag so we don't spam
// Vercel function logs with session-state breadcrumbs in production.
// Errors still log unconditionally (console.error below). Set
// PROCLINIC_DEBUG=1 in env to re-enable the breadcrumbs while debugging.
const DEBUG = process.env.PROCLINIC_DEBUG === '1';
function dbg(...args) { if (DEBUG) console.log(...args); }
const SESSION_TRIAL_DOC_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/proclinic_session_trial`;

// ─── Cookie helpers ─────────────────────────────────────────────────────────

function parseSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  if (!raw) return [];
  return raw.split(/,(?=\s*[a-zA-Z_][a-zA-Z0-9_]*=)/).map(s => s.trim());
}

function cookiesToHeader(cookieStrings) {
  return cookieStrings
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function mergeCookies(existing, incoming) {
  const map = new Map();
  for (const c of existing) {
    const name = c.split('=')[0].trim();
    if (name) map.set(name, c);
  }
  for (const c of incoming) {
    const name = c.split('=')[0].trim();
    if (name) map.set(name, c);
  }
  return [...map.values()];
}

// ─── Firestore cookie cache (via REST API — no firebase-admin needed) ─────

async function loadCachedCookies(origin, docPath = SESSION_DOC_PATH) {
  try {
    const res = await fetch(`${FIRESTORE_BASE}/${docPath}`);
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc.fields) return null;

    // Compare by base hostname, not full URL — allows trial.proclinicth.com ↔ proclinicth.com
    // Doc path (SESSION_DOC_PATH vs SESSION_TRIAL_DOC_PATH) is already the discriminator
    const docOrigin = doc.fields.origin?.stringValue || '';
    try {
      const docHost = new URL(docOrigin).hostname.replace(/^(www\.|trial\.)/, '');
      const curHost = new URL(origin).hostname.replace(/^(www\.|trial\.)/, '');
      if (docHost !== curHost) {
        dbg('[session] cookie domain mismatch, invalidating:', docHost, 'vs', curHost);
        return null;
      }
    } catch {
      // URL parse failed → fallback to exact match
      if (docOrigin !== origin) return null;
    }

    // Extract cookie strings from Firestore array format
    const cookieValues = doc.fields.cookies?.arrayValue?.values;
    if (!cookieValues || cookieValues.length === 0) return null;
    return cookieValues.map(v => v.stringValue).filter(Boolean);
  } catch (e) {
    console.error('[session] loadCachedCookies error:', e.message);
    return null;
  }
}

async function saveCookies(origin, cookies, docPath = SESSION_DOC_PATH) {
  try {
    await fetch(`${FIRESTORE_BASE}/${docPath}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          origin: { stringValue: origin },
          cookies: { arrayValue: { values: cookies.map(s => ({ stringValue: s })) } },
          updatedAt: { stringValue: new Date().toISOString() },
        },
      }),
    });
  } catch (e) {
    console.error('[session] saveCookies error:', e.message);
  }
}

// ─── Login flow ──────────────────────────────────────────────────────────────

export async function performLogin(origin, email, password, _sessionDocPath) {
  // Step 1: GET /login → CSRF + initial cookies
  const loginPageRes = await fetch(`${origin}/login`, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const loginHtml = await loginPageRes.text();
  const csrf = extractCSRF(loginHtml);
  dbg(`[session] GET /login status=${loginPageRes.status} url=${loginPageRes.url} csrf=${csrf ? 'found' : 'MISSING'} htmlLen=${loginHtml.length}`);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า login');

  let cookies = parseSetCookies(loginPageRes);
  dbg(`[session] cookies from GET: ${cookies.length} items`);

  // Step 2: POST /login
  const body = new URLSearchParams({
    _token: csrf,
    email, password,
    remember: 'on',
  });

  const loginRes = await fetch(`${origin}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookiesToHeader(cookies),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: body.toString(),
    redirect: 'manual',
  });

  const postCookies = parseSetCookies(loginRes);
  cookies = mergeCookies(cookies, postCookies);

  const status = loginRes.status;
  const location = loginRes.headers.get('location') || '';
  dbg(`[session] POST /login status=${status} location=${location} newCookies=${postCookies.length} totalCookies=${cookies.length}`);

  // Success: redirected to dashboard (not back to /login)
  if (status >= 300 && status < 400 && !location.includes('/login')) {
    dbg('[session] performLogin success — saving cookies');
    await saveCookies(origin, cookies, _sessionDocPath);
    return { success: true, cookies };
  }

  // Failed — include debug info
  let hint = `status=${status}, location=${location || 'none'}`;
  let responseSnippet = '';
  try {
    const text = await loginRes.text();
    if (text && (text.includes('captcha') || text.includes('recaptcha') || text.includes('g-recaptcha'))) {
      hint = 'CAPTCHA detected — ProClinic บล็อก automated login ลอง login ผ่าน browser ก่อนเพื่อปลด CAPTCHA';
    }
    responseSnippet = text.substring(0, 300);
  } catch (_) {}
  const err = new Error(`Login ไม่สำเร็จ (${hint})`);
  err.debug = {
    getStatus: loginPageRes.status,
    getUrl: loginPageRes.url,
    csrfFound: !!csrf,
    getCookies: cookies.length,
    postStatus: status,
    postLocation: location,
    postNewCookies: postCookies.length,
    responseSnippet,
  };
  throw err;
}

// ─── Create session (login once, reuse for multiple requests) ────────────────

export async function createSession(originArg, emailArg, passwordArg, _sessionDocPath) {
  // Vercel env vars take priority over request body (unless explicitly passed)
  // Trim trailing whitespace — prevents "https://proclinicth.com /admin/..." Headers.append errors
  const origin   = (originArg  || process.env.PROCLINIC_ORIGIN   || '').trim().replace(/\/+$/, '');
  const email    = (emailArg   || process.env.PROCLINIC_EMAIL    || '').trim();
  const password = (passwordArg || process.env.PROCLINIC_PASSWORD || '').trim();
  const docPath  = _sessionDocPath || SESSION_DOC_PATH;
  if (!origin || !email || !password) {
    throw new Error('ไม่พบ ProClinic credentials — ตั้งค่า PROCLINIC_ORIGIN/EMAIL/PASSWORD ใน Vercel Environment Variables');
  }
  // Load cached cookies from Firestore (single source of truth)
  let cookies = await loadCachedCookies(origin, docPath);

  if (!cookies) {
    // No cache → login once, then cache for all future requests
    dbg('[session] no cached cookies — performing login');
    try {
      const result = await performLogin(origin, email, password, docPath);
      cookies = result.cookies;
    } catch (e) {
      const err = new SessionExpiredError(`Login ล้มเหลว — ต้องการ Cookie Relay Extension (ProClinic มี reCAPTCHA)`);
      err.extensionNeeded = true;
      throw err;
    }
  }

  // Shared state for the session — fetchText auto re-logins if expired
  const sessionState = { origin, email, password, cookies };

  async function reLogin() {
    dbg('[session] mid-request re-login triggered');
    const result = await performLogin(origin, email, password, docPath);
    sessionState.cookies = result.cookies;
  }

  // Shared cookie-merge helper for all 3 methods below.
  function mergeResCookies(res) {
    const newC = parseSetCookies(res);
    if (!newC.length) return;
    for (const c of newC) {
      const name = c.split('=')[0].trim();
      const idx = sessionState.cookies.findIndex(x => x.split('=')[0].trim() === name);
      if (idx >= 0) sessionState.cookies[idx] = c; else sessionState.cookies.push(c);
    }
  }

  // Return session object (origin exposed so API routes can build URLs)
  return {
    origin,
    cookies: sessionState.cookies,
    fetch: async (url, options = {}) => {
      const { timeoutMs = 0, ...fetchOpts } = options;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...fetchOpts.headers,
        'Cookie': cookiesToHeader(sessionState.cookies),
      };
      const res = await fetchWithTimeout(url, { ...fetchOpts, headers, redirect: fetchOpts.redirect || 'manual' }, timeoutMs);
      mergeResCookies(res);
      return res;
    },
    fetchText: async (url, options = {}) => {
      // A7: timeoutMs adds AbortController timeout; 0 = off (default).
      // A3 helper: strictHttp=true throws HttpStatusError on non-2xx so
      // withRetry() can retry on 429/5xx.
      const { timeoutMs = 0, strictHttp = false, ...fetchOpts } = options;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...fetchOpts.headers,
        'Cookie': cookiesToHeader(sessionState.cookies),
      };
      const res = await fetchWithTimeout(url, { ...fetchOpts, headers, redirect: fetchOpts.redirect || 'follow' }, timeoutMs);
      mergeResCookies(res);

      if (strictHttp && res.status >= 400) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
        throw new HttpStatusError(res.status, res.statusText, url, retryAfterMs);
      }

      const text = await res.text();

      // Auto re-login if response is the LOGIN page specifically.
      // Detection: login page has action="/login" — customer pages don't.
      const isLoginPage = text.includes('action="/login"') || (text.includes('/login') && text.includes('name="password"') && !text.includes('admin/customer'));
      if (isLoginPage) {
        dbg('[session] fetchText got login page — auto re-login & retry');
        try {
          await reLogin();
          // Retry the original request with new cookies.
          const retryHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...fetchOpts.headers,
            'Cookie': cookiesToHeader(sessionState.cookies),
          };
          const retryRes = await fetchWithTimeout(url, { ...fetchOpts, headers: retryHeaders, redirect: fetchOpts.redirect || 'follow' }, timeoutMs);
          if (strictHttp && retryRes.status >= 400) {
            const retryAfterMs = parseRetryAfterMs(retryRes.headers.get('retry-after'));
            throw new HttpStatusError(retryRes.status, retryRes.statusText, url, retryAfterMs);
          }
          const retryText = await retryRes.text();
          if (retryText.includes('action="/login"') || (retryText.includes('/login') && retryText.includes('name="password"') && !retryText.includes('admin/customer'))) {
            throw new SessionExpiredError('Re-login สำเร็จแต่ session ยังใช้ไม่ได้ — ตรวจสอบ email/password');
          }
          return retryText;
        } catch (e) {
          if (e instanceof SessionExpiredError) throw e;
          if (e instanceof HttpStatusError) throw e; // let withRetry decide
          const err = new SessionExpiredError(`Auto re-login ล้มเหลว: ${e.message}`);
          err.extensionNeeded = true;
          throw err;
        }
      }
      return text;
    },
    fetchJSON: async (url, options = {}) => {
      const { timeoutMs = 0, ...fetchOpts } = options;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...fetchOpts.headers,
        'Cookie': cookiesToHeader(sessionState.cookies),
      };
      const res = await fetchWithTimeout(url, { ...fetchOpts, headers, redirect: fetchOpts.redirect || 'follow' }, timeoutMs);
      mergeResCookies(res);
      // Check if redirected to login page
      if (res.redirected && res.url.includes('/login')) {
        dbg('[session] fetchJSON redirected to login — auto re-login & retry');
        await reLogin();
        const retryHeaders = { ...headers, 'Cookie': cookiesToHeader(sessionState.cookies) };
        const retryRes = await fetchWithTimeout(url, { ...fetchOpts, headers: retryHeaders, redirect: fetchOpts.redirect || 'follow' }, timeoutMs);
        return retryRes.json();
      }
      // Check content-type: if ProClinic returns HTML instead of JSON, session is likely expired
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) {
        const body = await res.text();
        if (body.includes('action="/login"') || body.includes('name="password"')) {
          dbg('[session] fetchJSON got HTML login page — auto re-login & retry');
          await reLogin();
          const retryHeaders = { ...headers, 'Cookie': cookiesToHeader(sessionState.cookies) };
          const retryRes = await fetchWithTimeout(url, { ...fetchOpts, headers: retryHeaders, redirect: fetchOpts.redirect || 'follow' }, timeoutMs);
          return retryRes.json();
        }
        // Not JSON and not login page — try parsing anyway
        try { return JSON.parse(body); } catch { throw new Error(`Expected JSON but got ${ct}: ${body.substring(0, 200)}`); }
      }
      return res.json();
    },
  };
}

// ─── Trial session — uses separate credentials + separate cookie cache ──────

/** Pick session based on request body flag */
export function getSession(body) {
  return body?.useTrialServer ? createTrialSession() : createSession();
}

export async function createTrialSession() {
  const origin   = (process.env.PROCLINIC_TRIAL_ORIGIN   || process.env.PROCLINIC_ORIGIN   || '').trim().replace(/\/+$/, '');
  const email    = (process.env.PROCLINIC_TRIAL_EMAIL     || process.env.PROCLINIC_EMAIL    || '').trim();
  const password = (process.env.PROCLINIC_TRIAL_PASSWORD  || process.env.PROCLINIC_PASSWORD || '').trim();
  return createSession(origin, email, password, SESSION_TRIAL_DOC_PATH);
}

// ─── CORS helper ────────────────────────────────────────────────────────────

export function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
