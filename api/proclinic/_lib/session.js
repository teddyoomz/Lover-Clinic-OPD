// ─── ProClinic Session Manager ─────────────────────────────────────────────
// Strategy:
//   1. Try cached cookies from Firestore (saved by Extension or previous API login)
//   2. If expired → try server-side login (may fail if reCAPTCHA enforced)
//   3. If reCAPTCHA blocks → return clear error asking user to use Extension mode

import { extractCSRF } from './scraper.js';

// Custom error class for session expiry detection
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

    // Check if cookies are not too old (max 4 hours)
    const updatedAt = doc.fields.updatedAt?.stringValue;
    if (updatedAt) {
      const age = Date.now() - new Date(updatedAt).getTime();
      if (age > 4 * 60 * 60 * 1000) return null;
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

// ─── Login flow (may fail due to reCAPTCHA v3) ──────────────────────────────

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

  // Check for reCAPTCHA v3 (form-token field)
  const hasRecaptcha = loginHtml.includes('grecaptcha') || loginHtml.includes('g-recaptcha') || loginHtml.includes('form-token');

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
    await saveCookies(origin, cookies);
    return { success: true, cookies };
  }

  // Failed — likely reCAPTCHA
  if (hasRecaptcha) {
    throw new Error('ProClinic ใช้ reCAPTCHA v3 — ต้องใช้ Extension login ก่อน แล้วระบบจะใช้ session ต่อได้');
  }
  throw new Error('Login ไม่สำเร็จ — ตรวจสอบ email/password');
}

// ─── Create session (login once, reuse for multiple requests) ────────────────

export async function createSession(origin, email, password) {
  // Try cached cookies first
  let cookies = await loadCachedCookies(origin);

  if (!cookies) {
    // No cache — try login (may fail with reCAPTCHA)
    try {
      const result = await performLogin(origin, email, password);
      cookies = result.cookies;
    } catch (e) {
      throw new SessionExpiredError(`ไม่พบ session — ${e.message}`);
    }
  }

  // Test if cached session is still valid
  const testRes = await fetch(`${origin}/admin/api/stat`, {
    headers: {
      'Cookie': cookiesToHeader(cookies),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'manual',
  });

  if (testRes.status >= 300 || testRes.status === 401) {
    // Session expired — try login
    try {
      const result = await performLogin(origin, email, password);
      cookies = result.cookies;
    } catch (e) {
      throw new SessionExpiredError(`Session หมดอายุ — กรุณาให้ Extension แชร์ cookies ใหม่`);
    }
  } else {
    // Session valid — update cookies from response
    const newCookies = parseSetCookies(testRes);
    if (newCookies.length) {
      cookies = mergeCookies(cookies, newCookies);
      await saveCookies(origin, cookies);
    }
  }

  // Return session object
  return {
    cookies,
    fetch: async (url, options = {}) => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers,
        'Cookie': cookiesToHeader(cookies),
      };
      const res = await fetch(url, { ...options, headers, redirect: options.redirect || 'manual' });
      const newC = parseSetCookies(res);
      if (newC.length) {
        for (const c of newC) {
          const name = c.split('=')[0].trim();
          const idx = cookies.findIndex(x => x.split('=')[0].trim() === name);
          if (idx >= 0) cookies[idx] = c; else cookies.push(c);
        }
      }
      return res;
    },
    fetchText: async (url, options = {}) => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers,
        'Cookie': cookiesToHeader(cookies),
      };
      const res = await fetch(url, { ...options, headers, redirect: options.redirect || 'follow' });
      const newC = parseSetCookies(res);
      if (newC.length) {
        for (const c of newC) {
          const name = c.split('=')[0].trim();
          const idx = cookies.findIndex(x => x.split('=')[0].trim() === name);
          if (idx >= 0) cookies[idx] = c; else cookies.push(c);
        }
      }
      const text = await res.text();
      if (text.includes('name="email"') && text.includes('name="password"') && text.includes('<form')) {
        throw new SessionExpiredError('Session หมดอายุ — กรุณาให้ Extension แชร์ cookies ใหม่');
      }
      return text;
    },
  };
}

// ─── CORS helper ────────────────────────────────────────────────────────────

export function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
