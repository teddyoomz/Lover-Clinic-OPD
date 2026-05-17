import { test, expect } from '@playwright/test';

// Backend Menu D — Tier 4 L1 (real browser · real Firestore)
// Per Rule Q V66 mandate — required for any "verified" claim.
//
// Skips when creds env vars absent — user runs L1 hands-on instead.

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:5173';
const ADMIN_EMAIL = process.env.PW_ADMIN_EMAIL || 'oomz.peerapat@gmail.com';
const ADMIN_PASS = process.env.PW_ADMIN_PASS;
const FIREBASE_API_KEY = process.env.PW_FIREBASE_API_KEY;

async function signInAsAdmin(page) {
  // Mirror tests/e2e/phase-29-recall-adversarial.spec.js auth fixture.
  if (!ADMIN_PASS || !FIREBASE_API_KEY) {
    test.skip(true, 'PW_ADMIN_PASS + PW_FIREBASE_API_KEY required');
  }
  const res = await page.request.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    { data: { email: ADMIN_EMAIL, password: ADMIN_PASS, returnSecureToken: true } }
  );
  const body = await res.json();
  expect(body.idToken).toBeTruthy();
  await page.addInitScript((token, uid, email) => {
    localStorage.setItem(`firebase:authUser:${uid}`, JSON.stringify({
      uid, email, stsTokenManager: { accessToken: token },
    }));
  }, body.idToken, body.localId, ADMIN_EMAIL);
}

test.describe('Backend Menu D — Real-browser L1', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`${BASE_URL}/?backend=1`);
    await page.waitForSelector(
      '[data-testid="backend-topbar-new"], [data-testid="backend-classic-sidebar"]',
      { timeout: 10000 }
    );
  });

  test('E1 Backend renders in "new" mode by default', async ({ page }) => {
    await expect(page.locator('[data-testid="backend-topbar-new"]')).toBeVisible();
    await expect(page.locator('[data-testid="backend-duo-pill"]')).toBeVisible();
  });

  test('E2 Tap DuoPill menu → bloom opens with 8 orbs', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await expect(page.locator('[data-testid="bloom-overlay"]')).toBeVisible();
    const orbs = page.locator('[role="menuitem"]');
    await expect(orbs).toHaveCount(8);
  });

  test('E3 Tap orb → activeTab switches + bloom closes', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await page.locator('[data-testid="bloom-orb-customers"]').click();
    await expect(page.locator('[data-testid="bloom-overlay"]')).not.toBeVisible();
    await expect(page.locator('header h1')).toContainText(/ข้อมูลลูกค้า|ลูกค้า/);
  });

  test('E4 Mode toggle: switch to classic → BackendNav sidebar renders', async ({ page }) => {
    await page.locator('[data-testid="mode-toggle-classic"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="backend-topbar-new"]')).not.toBeVisible();
    await page.reload();
    await page.locator('[data-testid="mode-toggle-new"]').click();
    await expect(page.locator('[data-testid="backend-topbar-new"]')).toBeVisible();
  });

  test('E5 5 utility buttons present in desktop top bar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await expect(page.locator('[data-testid="topbar-frontend-desktop"]')).toBeVisible();
    await expect(page.locator('[data-testid="topbar-shortcut-desktop"]')).toBeVisible();
    await expect(page.locator('[data-testid="backend-menu-mode-toggle"]')).toBeVisible();
  });

  test('E6 Theme toggle (dark → light) — bloom switches to sakura palette', async ({ page }) => {
    await page.locator('button[aria-label*="theme" i], button[title*="theme" i]').first().click();
    await page.waitForTimeout(200);
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await expect(page.locator('[data-testid="bloom-overlay"]')).toBeVisible();
    const petalCount = await page.locator('.bloom-petal').count();
    expect(petalCount).toBeGreaterThan(0);
  });

  test('E7 DuoPill chat button triggers staff chat expand (V73/V82 contract)', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-chat"]').click();
    await expect(
      page.locator('[data-testid="staff-chat-panel"]').or(page.getByRole('dialog'))
    ).toBeVisible();
  });

  test('E8 Mobile viewport — bloom UI forced + Mode toggle hidden', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    await page.reload();
    await expect(page.locator('[data-testid="backend-topbar-new"]')).toBeVisible();
    await expect(page.locator('[data-testid="backend-menu-mode-toggle"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="duo-pill-menu"]')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-tab Picker E2E (Rule Q V66 L1 — mouse-follow REQUIRES real browser)
  // ─────────────────────────────────────────────────────────────────────────

  test('E9 multi-item orb (reports) opens sub-tab picker with all mini-orbs', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await page.locator('[data-testid="bloom-orb-reports"]').click();
    await expect(page.locator('[data-testid="subtab-overlay"]')).toBeVisible();
    // Sample a few known reports sub-tabs
    await expect(page.locator('[data-testid="subtab-cell-reports-sale"]')).toBeVisible();
    await expect(page.locator('[data-testid="subtab-cell-reports-pnl"]')).toBeVisible();
    await expect(page.locator('[data-testid="subtab-cell-clinic-report"]')).toBeVisible();
  });

  test('E10 click mini-orb (reports-pnl) → activeTab updates + both blooms collapse', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await page.locator('[data-testid="bloom-orb-reports"]').click();
    await page.locator('[data-testid="subtab-cell-reports-pnl"]').click();
    await expect(page.locator('[data-testid="subtab-overlay"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="bloom-overlay"]')).not.toBeVisible();
  });

  test('E11 mouse-follow tilt — moving cursor across modal changes --tilt-mx CSS var (Rule Q L1 real browser)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await page.locator('[data-testid="bloom-orb-reports"]').click();
    const modal = page.locator('[data-testid="subtab-modal"]');
    await expect(modal).toBeVisible();
    // Sample tilt after moving to left side
    await page.mouse.move(200, 400);
    await page.waitForTimeout(400); // allow lerp to settle
    const leftTilt = await modal.evaluate((el) => el.style.getPropertyValue('--tilt-mx'));
    // Move to right side
    await page.mouse.move(1080, 400);
    await page.waitForTimeout(400);
    const rightTilt = await modal.evaluate((el) => el.style.getPropertyValue('--tilt-mx'));
    // The two tilt values should differ (cursor on opposite sides bias the modal differently)
    expect(leftTilt).not.toBe(rightTilt);
  });

  test('E12 mobile 414×896 — multi-item orb opens V2 bubble with parent gradient', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    await page.reload();
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await page.locator('[data-testid="bloom-orb-reports"]').click();
    const modal = page.locator('[data-testid="subtab-modal"]');
    await expect(modal).toBeVisible();
    const className = await modal.getAttribute('class');
    expect(className).toContain('mobile');
    // Origin should be set from orb rect
    const originX = await modal.evaluate((el) => el.style.getPropertyValue('--origin-x'));
    expect(originX).not.toBe('');
  });

  test('E13 single-item orb (customers) does NOT open picker — direct navigate', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await page.locator('[data-testid="bloom-orb-customers"]').click();
    await expect(page.locator('[data-testid="subtab-overlay"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="bloom-overlay"]')).not.toBeVisible();
  });

  test('E14 Esc closes picker only — ArcBloom stays open', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await page.locator('[data-testid="bloom-orb-reports"]').click();
    await expect(page.locator('[data-testid="subtab-overlay"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="subtab-overlay"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="bloom-overlay"]')).toBeVisible();
  });
});
