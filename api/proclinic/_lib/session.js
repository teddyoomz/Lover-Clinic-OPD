// ─── ProClinic Session Manager ─────────────────────────────────────────────
// Strategy:
//   1. Load cached cookies from Firestore → use immediately (no test request)
//   2. If no cache → performLogin → save cookies
//   3. fetchText auto-detects login page → re-login + retry transparently

import { extractCSRF } from './scraper.js';

// Custom error class for session expiry detection (fallback when re-login also fails)
export class SessionExpiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionExpiredError';
    this.sessionExpired = true;
  }
}

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const SESSION_DOC_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/proclinic_session`;

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

async function loadCachedCookies(origin) {
  try {
    const res = await fetch(`${FIRESTORE_BASE}/${SESSION_DOC_PATH}`);
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc.fields) return null;

    const docOrigin = doc.fields.origin?.stringValue;
    if (docOrigin !== origin) return null;

    // Extract cookie strings from Firestore array format
    const cookieValues = doc.fields.cookies?.arrayValue?.values;
    if (!cookieValues || cookieValues.length === 0) return null;
    return cookieValues.map(v => v.stringValue).filter(Boolean);
  } catch (e) {
    console.error('[session] loadCachedCookies error:', e.message);
    return null;
  }
}

async function saveCookies(origin, cookies) {
  try {
    await fetch(`${FIRESTORE_BASE}/${SESSION_DOC_PATH}`, {
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

export async function performLogin(origin, email, password) {
  // Step 1: GET /login → CSRF + initial cookies
  const loginPageRes = await fetch(`${origin}/login`, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const loginHtml = await loginPageRes.text();
  const csrf = extractCSRF(loginHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า login');

  let cookies = parseSetCookies(loginPageRes);

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

  cookies = mergeCookies(cookies, parseSetCookies(loginRes));

  const status = loginRes.status;
  const location = loginRes.headers.get('location') || '';

  // Success: redirected to dashboard (not back to /login)
  if (status >= 300 && status < 400 && !location.includes('/login')) {
    console.log('[session] performLogin success — saving cookies');
    await saveCookies(origin, cookies);
    return { success: true, cookies };
  }

  // Failed — include debug info
  let hint = `status=${status}, location=${location || 'none'}`;
  try {
    const body = await loginRes.text();
    if (body && (body.includes('captcha') || body.includes('recaptcha') || body.includes('g-recaptcha'))) {
      hint = 'CAPTCHA detected — ProClinic บล็อก automated login ลอง login ผ่าน browser ก่อนเพื่อปลด CAPTCHA';
    }
  } catch (_) {}
  throw new Error(`Login ไม่สำเร็จ (${hint})`);
}

// ─── Create session (login once, reuse for multiple requests) ────────────────

export async function createSession(originArg, emailArg, passwordArg) {
  // Vercel env vars take priority over request body
  const origin   = process.env.PROCLINIC_ORIGIN   || originArg;
  const email    = process.env.PROCLINIC_EMAIL     || emailArg;
  const password = process.env.PROCLINIC_PASSWORD  || passwordArg;
  if (!origin || !email || !password) {
    throw new Error('ไม่พบ ProClinic credentials — ตั้งค่า PROCLINIC_ORIGIN/EMAIL/PASSWORD ใน Vercel Environment Variables');
  }
  // Load cached cookies — use immediately, no test request
  let cookies = await loadCachedCookies(origin);

  if (!cookies) {
    // No cache → login once, then cache for all future requests
    console.log('[session] no cached cookies — performing login');
    try {
      const result = await performLogin(origin, email, password);
      cookies = result.cookies;
    } catch (e) {
      throw new SessionExpiredError(`Login ล้มเหลว: ${e.message}`);
    }
  }

  // Shared state for the session — fetchText auto re-logins if expired
  const sessionState = { origin, email, password, cookies };

  async function reLogin() {
    console.log('[session] mid-request re-login triggered');
    const result = await performLogin(origin, email, password);
    sessionState.cookies = result.cookies;
  }

  // Return session object (origin exposed so API routes can build URLs)
  return {
    origin,
    cookies: sessionState.cookies,
    fetch: async (url, options = {}) => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers,
        'Cookie': cookiesToHeader(sessionState.cookies),
      };
      const res = await fetch(url, { ...options, headers, redirect: options.redirect || 'manual' });
      const newC = parseSetCookies(res);
      if (newC.length) {
        for (const c of newC) {
          const name = c.split('=')[0].trim();
          const idx = sessionState.cookies.findIndex(x => x.split('=')[0].trim() === name);
          if (idx >= 0) sessionState.cookies[idx] = c; else sessionState.cookies.push(c);
        }
      }
      return res;
    },
    fetchText: async (url, options = {}) => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers,
        'Cookie': cookiesToHeader(sessionState.cookies),
      };
      const res = await fetch(url, { ...options, headers, redirect: options.redirect || 'follow' });
      const newC = parseSetCookies(res);
      if (newC.length) {
        for (const c of newC) {
          const name = c.split('=')[0].trim();
          const idx = sessionState.cookies.findIndex(x => x.split('=')[0].trim() === name);
          if (idx >= 0) sessionState.cookies[idx] = c; else sessionState.cookies.push(c);
        }
      }
      const text = await res.text();

      // Auto re-login if response is the LOGIN page specifically
      // Detection: login page has action="/login" — customer pages don't
      const isLoginPage = text.includes('action="/login"') || (text.includes('/login') && text.includes('name="password"') && !text.includes('admin/customer'));
      if (isLoginPage) {
        console.log('[session] fetchText got login page — auto re-login & retry');
        try {
          await reLogin();
          // Retry the original request with new cookies
          const retryHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...options.headers,
            'Cookie': cookiesToHeader(sessionState.cookies),
          };
          const retryRes = await fetch(url, { ...options, headers: retryHeaders, redirect: options.redirect || 'follow' });
          const retryText = await retryRes.text();
          if (retryText.includes('action="/login"') || (retryText.includes('/login') && retryText.includes('name="password"') && !retryText.includes('admin/customer'))) {
            throw new SessionExpiredError('Re-login สำเร็จแต่ session ยังใช้ไม่ได้ — ตรวจสอบ email/password');
          }
          return retryText;
        } catch (e) {
          if (e instanceof SessionExpiredError) throw e;
          throw new SessionExpiredError(`Auto re-login ล้มเหลว: ${e.message}`);
        }
      }
      return text;
    },
  };
}

// ─── CORS helper ────────────────────────────────────────────────────────────

export function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
