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
 * Expand every collapsible nav section so leaf tab buttons (under
 * "ลูกค้า", "การขาย", "การตลาด", "รายงาน", "ข้อมูลพื้นฐาน") are
 * visible + clickable. Idempotent — clicking an already-expanded
 * section just toggles the chevron back; we re-click as needed.
 *
 * Used by audit 2026-04-26 design-pass smoke specs which must reach
 * all 41 tabs.
 */
export async function expandAllNavSections(page) {
  // Includes "คลังสินค้า" + "การเงิน" — sections with single leaves where
  // the section header is also a clickable container.
  const SECTION_LABELS = ['ลูกค้า', 'การขาย', 'คลังสินค้า', 'การเงิน', 'การตลาด', 'รายงาน', 'ข้อมูลพื้นฐาน'];
  for (const label of SECTION_LABELS) {
    // Section header buttons HAVE aria-expanded; leaves do NOT. Filter
    // by attribute to disambiguate when section + leaf share a name.
    const btn = page.locator(`nav button[aria-expanded]:has-text("${label}")`).first();
    const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
    if (!visible) continue;
    const ariaExp = await btn.getAttribute('aria-expanded').catch(() => null);
    if (ariaExp === 'false') {
      await btn.click();
      await page.waitForTimeout(250);
    }
  }
}

/**
 * Click a LEAF tab button (one without aria-expanded). Disambiguates
 * from section headers that share a name (e.g. "การเงิน" leaf vs
 * "การเงิน" section header). Used by the smoke spec to click each
 * leaf reliably regardless of sidebar state.
 */
export async function clickLeafTab(page, label) {
  // CSS :not([aria-expanded]) excludes section headers
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const leaf = page.locator('nav button:not([aria-expanded])')
    .filter({ hasText: new RegExp(`^${escaped}$`) })
    .first();
  await leaf.click();
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

/**
 * Navigate to backend and switch to a specific tab.
 * @param {import('@playwright/test').Page} page
 * @param {'clone'|'customers'|'masterdata'|'appointments'|'sales'} tab
 */
export async function goToTab(page, tab) {
  await goToBackend(page);
  const tabMap = {
    clone: null, // default tab — no click needed
    customers: 'ข้อมูลลูกค้า',
    masterdata: 'ข้อมูลพื้นฐาน',
    appointments: 'นัดหมาย',
    sales: /ขาย/,
  };
  const name = tabMap[tab];
  if (name) {
    // Backend tabs now use role="tab" (added in audit fix b15109b)
    await page.getByRole('tab', { name }).click();
    await page.waitForTimeout(1500);
  }
}
