// ─── E2E Helpers — Navigation with inline auth ──────────────────────────────
// Firebase Auth doesn't hydrate from Playwright's storageState reliably.
// Instead: inject auth tokens directly into localStorage before each navigation.

import fs from 'fs';
import path from 'path';

const TOKEN_CACHE = path.join(import.meta.dirname, '../../.auth/tokens.json');
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';

/** Get Firebase tokens — cached to avoid hitting quota */
async function getTokens() {
  // Check cache (valid for 50 minutes)
  try {
    const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
    if (cached.expiresAt > Date.now()) return cached;
  } catch {}

  // Fetch fresh tokens via REST API
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message || 'Unknown'}`);

  const tokens = { ...data, expiresAt: Date.now() + 50 * 60 * 1000 };
  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tokens));
  return tokens;
}

/** Inject Firebase auth into page localStorage and reload */
async function injectAuth(page) {
  const tokens = await getTokens();
  const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  const authValue = JSON.stringify({
    uid: tokens.localId,
    email: tokens.email,
    emailVerified: false,
    isAnonymous: false,
    providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
    stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
    createdAt: String(Date.now()),
    lastLoginAt: String(Date.now()),
    apiKey: FIREBASE_API_KEY,
    appName: '[DEFAULT]',
  });

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: authKey, value: authValue });
}

/**
 * Navigate to backend dashboard (authenticated).
 */
export async function goToBackend(page) {
  await injectAuth(page);
  await page.goto('/?backend=1');
  await page.waitForSelector('text=ระบบหลังบ้าน', { timeout: 20000 });
}

/**
 * Navigate to a specific customer detail page.
 */
export async function goToCustomer(page, customerId) {
  await injectAuth(page);
  await page.goto(`/?backend=1&customer=${customerId}`);
  // Wait for customer data to load (profile section visible)
  await page.waitForSelector('text=เบอร์โทร', { timeout: 20000 });
}
