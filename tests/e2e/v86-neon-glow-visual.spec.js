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

    // V86-followup-2 (2026-05-18 EOD+10) — B1-B4 rewritten: assert universal RED
    // (c1=rgb(220,38,38) border + c2=rgb(239,68,68) halo) instead of per-section
    // colors. Per-section [data-section] CSS-vars blocks dropped; all sections
    // now inherit :root universal red. data-section attr still present on
    // wrappers (cosmetic, future-proof) but doesn't drive distinct colors.
    test('B1 — backend customers tab shows UNIVERSAL RED glow (V86-followup-2)', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1&tab=customer-list`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="backend-content"]', { timeout: 10000 });

      const card = page.locator('[data-testid="backend-content"] [class*="rounded-2xl"], [data-testid="backend-content"] [class*="rounded-xl"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
      const boxShadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);

      // V86-followup-2: c1 = rgb(220, 38, 38) red-600 border, c2 = rgb(239, 68, 68) red-500 halo
      expect(border).toMatch(/rgba?\(220,\s*38,\s*38/);
      expect(boxShadow).toMatch(/rgba?\(239,\s*68,\s*68/);
    });

    test('B2 — backend products (stock) tab shows UNIVERSAL RED glow (V86-followup-2)', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1&tab=stock`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="backend-content"]', { timeout: 10000 });

      const card = page.locator('[data-testid="backend-content"] [class*="rounded-2xl"], [data-testid="backend-content"] [class*="rounded-xl"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
      const boxShadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);

      // V86-followup-2: universal red (NOT amber any more)
      expect(border).toMatch(/rgba?\(220,\s*38,\s*38/);
      expect(boxShadow).toMatch(/rgba?\(239,\s*68,\s*68/);
    });

    test('B3 — backend appointments tab shows UNIVERSAL RED glow (V86-followup-2)', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1&tab=appointment-all`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="backend-content"]', { timeout: 10000 });

      const card = page.locator('[data-testid="backend-content"] [class*="rounded-2xl"], [data-testid="backend-content"] [class*="rounded-xl"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
      // V86-followup-2: universal red (NOT blue any more)
      expect(border).toMatch(/rgba?\(220,\s*38,\s*38/);
    });

    test('B4 — admin frontend zone shows UNIVERSAL RED glow (V86-followup-2)', async ({ page }) => {
      await page.goto(`${APP_URL}/`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('.admin-frontend-zone', { timeout: 10000 });

      // Pick a card OUTSIDE the menu (admin-top-menu + descendants + .menu-* excluded
      // by V86-followup-2 :not() chain). The first non-menu rounded card.
      const card = page.locator('.admin-frontend-zone [class*="rounded-xl"]:not([data-testid="admin-top-menu"]):not([data-testid="admin-top-menu"] *):not([class*="menu-"]), .admin-frontend-zone [class*="rounded-2xl"]:not([data-testid="admin-top-menu"]):not([data-testid="admin-top-menu"] *):not([class*="menu-"])').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });
      const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
      // V86-followup-2: universal red (NOT blue any more)
      expect(border).toMatch(/rgba?\(220,\s*38,\s*38/);
    });

    test('B5 — hover boost: card lift + halo intensifies on hover', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1&tab=customer-list`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-testid="backend-content"]', { timeout: 10000 });

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
      await page.waitForSelector('[data-testid="backend-content"]', { timeout: 10000 });

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

    test('B7 — AV81 menu untouched: bloom orb + duo-pill styles contain ZERO V86 RED RGB (V86-followup-2)', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1`);
      await page.waitForLoadState('networkidle');
      // Open the bloom menu via DuoPill
      await page.locator('[data-testid="duo-pill-menu"]').click();
      await page.waitForSelector('[data-testid^="bloom-orb-"]', { timeout: 5000 });

      const orb = page.locator('[data-testid^="bloom-orb-"]').first();
      const orbBoxShadow = await orb.evaluate((el) => getComputedStyle(el).boxShadow);

      // V86-followup-2 RED RGB should NOT appear in orb shadow (menu uses its own gold-orange halo)
      expect(orbBoxShadow).not.toMatch(/rgba?\(220,\s*38,\s*38/);   // red-600 c1
      expect(orbBoxShadow).not.toMatch(/rgba?\(239,\s*68,\s*68/);   // red-500 c2

      const duoPill = page.locator('[data-testid="backend-duo-pill"]');
      const duoPillShadow = await duoPill.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(duoPillShadow).not.toMatch(/rgba?\(220,\s*38,\s*38/);
      expect(duoPillShadow).not.toMatch(/rgba?\(239,\s*68,\s*68/);
    });

    test('B8 — Settings UI live slider updates --neon-intensity CSS var (V86-followup-2)', async ({ page }) => {
      await page.goto(`${APP_URL}/?backend=1&tab=system-settings`);
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('[data-field="v86GlowIntensity"]', { timeout: 10000 });

      // Initial intensity (could be saved value or default 0.45)
      const before = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--neon-intensity').trim()
      );

      // Drag slider to 80%
      const slider = page.locator('[data-field="v86GlowIntensity"]');
      await slider.fill('80');
      await page.waitForTimeout(250);

      const after = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--neon-intensity').trim()
      );

      expect(after).toBe('0.8');
      expect(after).not.toBe(before);
    });
  }
);
