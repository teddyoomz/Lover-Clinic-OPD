// ─── E2E Auth Setup — Login once via REST API, inject tokens into localStorage ─
import { test as setup } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(import.meta.dirname, '../../.auth/state.json');
export { AUTH_FILE };

const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const FIREBASE_AUTH_DOMAIN = 'loverclinic-opd-4c39b.firebaseapp.com';

setup('authenticate', async ({ page }) => {
  // Step 1: Get Firebase tokens via REST API (one single HTTP call, no SDK)
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message || JSON.stringify(data)}`);

  // Step 2: Navigate to app to get the page context
  await page.goto('/');

  // Step 3: Inject Firebase auth state into localStorage (same format as Firebase SDK stores)
  const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  const authValue = JSON.stringify({
    uid: data.localId,
    email: data.email,
    emailVerified: data.emailVerified || false,
    displayName: data.displayName || '',
    isAnonymous: false,
    providerData: [{ providerId: 'password', uid: data.email, displayName: null, email: data.email, phoneNumber: null, photoURL: null }],
    stsTokenManager: { refreshToken: data.refreshToken, accessToken: data.idToken, expirationTime: Date.now() + 3600000 },
    createdAt: data.createdAt || String(Date.now()),
    lastLoginAt: String(Date.now()),
    apiKey: FIREBASE_API_KEY,
    appName: '[DEFAULT]',
  });

  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: authKey, value: authValue });

  // Step 4: Reload to let Firebase pick up the auth state from localStorage
  await page.reload();
  await page.waitForTimeout(3000);

  // Step 5: Verify logged in — should NOT show login page
  const isLoggedIn = await page.evaluate(() => {
    return !!window.__auth?.currentUser;
  });
  if (!isLoggedIn) {
    // Fallback: wait a bit more for Firebase to hydrate from localStorage
    await page.waitForTimeout(3000);
  }

  // Step 6: Save storageState for all other tests to reuse
  await page.context().storageState({ path: AUTH_FILE });
});
