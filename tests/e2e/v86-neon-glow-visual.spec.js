// Phase B — V86 Neon Glow Playwright L1 (Rule Q V66 — real browser, real Firestore)
// 7 scenarios B1-B7 covering visual contract + interaction + AV81 untouched

import { test, expect } from '@playwright/test';

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const ADMIN_EMAIL = process.env.LOVER_TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.LOVER_TEST_ADMIN_PASSWORD;
const FIREBASE_API_KEY = process.env.LOVER_FIREBASE_API_KEY;

const SKIP_REASON = !ADMIN_EMAIL || !ADMIN_PASSWORD || !FIREBASE_API_KEY
  ? 'Skip: requires LOVER_TEST_ADMIN_EMAIL, LOVER_TEST_ADMIN_PASSWORD, LOVER_FIREBASE_API_KEY env vars'
  : '';

test.describe(
  'V86 Neon Glow — Phase B Playwright L1',
  () => {
    test.skip(!!SKIP_REASON, SKIP_REASON);

    test.beforeEach(async ({ page, context }) => {
      // Sign in via REST → get idToken → inject into localStorage so the app
      // bootstraps already-authenticated. Mirrors Phase 29 recall pattern.
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            returnSecureToken: true,
          }),
        }
      );
      const auth = await res.json();
      await context.addInitScript(
        ({ key, value }) => {
          window.localStorage.setItem(key, value);
        },
        {
          key: `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`,
          value: JSON.stringify({
            uid: auth.localId,
            email: auth.email,
            stsTokenManager: {
              accessToken: auth.idToken,
              refreshToken: auth.refreshToken,
              expirationTime: Date.now() + (parseInt(auth.expiresIn) * 1000),
            },
          }),
        }
      );
    });

    test('B1 — backend customers tab shows teal/green per-section glow', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1&tab=customer-list`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="backend-content"][data-section="customers"]', { timeout: 10000 });

      const card = page.locator('[data-testid="backend-content"] [class*="rounded-2xl"], [data-testid="backend-content"] [class*="rounded-xl"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
      const boxShadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);

      // Border = teal (20, 184, 166) with alpha ~0.40
      expect(border).toMatch(/rgba?\(20,\s*184,\s*166/);
      // Box shadow = green halo (34, 197, 94)
      expect(boxShadow).toMatch(/rgba?\(34,\s*197,\s*94/);
    });

    test('B2 — backend products (stock) tab shows amber/yellow glow', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1&tab=stock`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="backend-content"][data-section="stock"]', { timeout: 10000 });

      const card = page.locator('[data-testid="backend-content"] [class*="rounded-2xl"], [data-testid="backend-content"] [class*="rounded-xl"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
      const boxShadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);

      expect(border).toMatch(/rgba?\(245,\s*158,\s*11/);   // amber
      expect(boxShadow).toMatch(/rgba?\(250,\s*204,\s*21/); // yellow halo
    });

    test('B3 — backend appointments tab shows blue/cyan glow', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1&tab=appointment-all`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="backend-content"][data-section="appointments-section"]', { timeout: 10000 });

      const card = page.locator('[data-testid="backend-content"] [class*="rounded-2xl"], [data-testid="backend-content"] [class*="rounded-xl"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
      expect(border).toMatch(/rgba?\(59,\s*130,\s*246/);  // blue
    });

    test('B4 — admin frontend zone shows appointments tint (blue/cyan)', async ({ page }) => {
      await page.goto(`${APP_URL}/`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('.admin-frontend-zone[data-section="appointments"]', { timeout: 10000 });

      const card = page.locator('.admin-frontend-zone [class*="rounded-xl"], .admin-frontend-zone [class*="rounded-2xl"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
      expect(border).toMatch(/rgba?\(59,\s*130,\s*246/);
    });

    test('B5 — hover boost: card lift + halo intensifies on hover', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1&tab=customer-list`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="backend-content"][data-section="customers"]', { timeout: 10000 });

      const card = page.locator('[data-testid="backend-content"] [class*="rounded-2xl"], [data-testid="backend-content"] [class*="rounded-xl"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const beforeBorder = await card.evaluate((el) => getComputedStyle(el).borderColor);

      await card.hover();
      await page.waitForTimeout(400);

      const afterBorder = await card.evaluate((el) => getComputedStyle(el).borderColor);
      const afterTransform = await card.evaluate((el) => getComputedStyle(el).transform);

      // Transform should be translateY(-3px) → matrix(1, 0, 0, 1, 0, -3)
      expect(afterTransform).toMatch(/matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*-3\)/);

      // Border alpha should have increased (alpha 0.40 → 0.65)
      const extractAlpha = (rgba) => {
        const m = rgba.match(/rgba?\([^)]+,\s*([\d.]+)\)$/);
        return m ? parseFloat(m[1]) : null;
      };
      const beforeA = extractAlpha(beforeBorder);
      const afterA = extractAlpha(afterBorder);
      if (beforeA !== null && afterA !== null) {
        expect(afterA).toBeGreaterThan(beforeA);
      }
    });

    test('B6 — reduced-motion: animation:none + no hover transform', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${APP_URL}/?backend=1&tab=customer-list`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="backend-content"][data-section="customers"]', { timeout: 10000 });

      const card = page.locator('[data-testid="backend-content"] [class*="rounded-2xl"], [data-testid="backend-content"] [class*="rounded-xl"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const animation = await card.evaluate((el) => getComputedStyle(el).animationName);
      expect(animation).toMatch(/none/);

      await card.hover();
      await page.waitForTimeout(300);
      const transform = await card.evaluate((el) => getComputedStyle(el).transform);
      // Transform should be none OR the identity matrix (no translateY)
      expect(transform).toMatch(/none|matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)/);
    });

    test('B7 — AV81 menu untouched: bloom orb + duo-pill styles contain ZERO V86 section RGB', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1`);
      await page.waitForLoadState('networkidle');
      // Open the bloom menu via DuoPill
      await page.locator('[data-testid="duo-pill-menu"]').click();
      await page.waitForSelector('[data-testid^="bloom-orb-"]', { timeout: 5000 });

      const orb = page.locator('[data-testid^="bloom-orb-"]').first();
      const orbBoxShadow = await orb.evaluate((el) => getComputedStyle(el).boxShadow);

      // V86 section RGBs should NOT appear in orb shadow (menu uses its own gold-orange halo)
      expect(orbBoxShadow).not.toMatch(/rgba?\(20,\s*184,\s*166/);  // teal (customers)
      expect(orbBoxShadow).not.toMatch(/rgba?\(34,\s*197,\s*94/);   // green (customers halo)
      expect(orbBoxShadow).not.toMatch(/rgba?\(245,\s*158,\s*11/);  // amber (stock)

      const duoPill = page.locator('[data-testid="backend-duo-pill"]');
      const duoPillShadow = await duoPill.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(duoPillShadow).not.toMatch(/rgba?\(20,\s*184,\s*166/);
      expect(duoPillShadow).not.toMatch(/rgba?\(245,\s*158,\s*11/);
    });
  }
);
