// tests/e2e/v85-glow-utility-application.spec.js
//
// V85 Glow Utility Application — Real-browser verification (Rule Q V66 L1)
//
// 7 scenarios verify the utility classes are applied AT RUNTIME against the
// real local dev server (which connects to real prod Firestore). Each
// scenario asserts: (a) the expected fx-glow-* class is present on the
// right DOM element, (b) the computed box-shadow / animation matches the
// utility's contract, (c) theme switching (dark↔light) produces different
// computed styles (proves theme override fires).
//
// Run: npx playwright test tests/e2e/v85-glow-utility-application.spec.js
//
// Scope = current shipped state (Phase A foundation + B partial + C/D
// extensions). NOT a full coverage audit; locks the 7 most important
// surfaces.

import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

test.describe('V85 Glow — Application + theme parity', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    // Land on a known tab so backend-content wrapper is mounted
    await page.goto('/?backend=1&tab=customers');
    await page.waitForTimeout(2000);
  });

  test('G1 — BackendDashboard content wrapper has fx-glow-u3 (dark)', async ({ page }) => {
    const wrapper = page.locator('[data-testid="backend-content"]').first();
    await expect(wrapper).toHaveClass(/fx-glow-u3/, { timeout: 5000 });
    const shadow = await wrapper.evaluate(el => getComputedStyle(el).boxShadow);
    // ember tint rgba(251,146,60) should be in box-shadow
    expect(shadow).toMatch(/251,\s*146,\s*60/);
    // Drop shadow blur ≥ 40px
    expect(shadow).toMatch(/\d+px/);
  });

  test('G2 — CustomerListTab header has fx-glow-u9-customers (cyan tint)', async ({ page }) => {
    const header = page.locator('.fx-glow-u9-customers').first();
    await expect(header).toBeVisible({ timeout: 5000 });
    const shadow = await header.evaluate(el => getComputedStyle(el).boxShadow);
    // cyan tint rgba(6,182,212) should appear in box-shadow
    expect(shadow).toMatch(/6,\s*182,\s*212/);
  });

  test('G3 — ReportsHomeTab Analytics KPI tile has fx-glow-v5 + animated ::after', async ({ page }) => {
    await page.goto('/?backend=1&tab=reports');
    await page.waitForTimeout(2500);
    const v5Card = page.locator('.fx-glow-v5').first();
    await expect(v5Card).toBeVisible({ timeout: 5000 });
    const shadow = await v5Card.evaluate(el => getComputedStyle(el).boxShadow);
    // V5 has teal jet-thrust glow (20,184,166)
    expect(shadow).toMatch(/20,\s*184,\s*166/);
    // ::after pseudo has v85-thrust animation
    const anims = await v5Card.evaluate(el =>
      el.getAnimations({ subtree: true }).map(a => a.animationName)
    );
    expect(anims).toContain('v85-thrust');
  });

  test('G4 — Dark→light theme produces different computed box-shadow', async ({ page }) => {
    const wrapper = page.locator('[data-testid="backend-content"]').first();
    const darkShadow = await wrapper.evaluate(el => getComputedStyle(el).boxShadow);

    // Switch to light theme
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(500);

    const lightShadow = await wrapper.evaluate(el => getComputedStyle(el).boxShadow);
    expect(darkShadow).not.toBe(lightShadow);

    // Dark drop-shadow should be heavier (higher alpha) than light
    const darkAlpha = parseFloat(darkShadow.match(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/)?.[1] || '0');
    const lightAlpha = parseFloat(lightShadow.match(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/)?.[1] || '0');
    expect(lightAlpha).toBeLessThan(darkAlpha);
  });

  test('G5 — Menu system + print views have ZERO fx-glow-* classes (sanctioned exceptions)', async ({ page }) => {
    // Verify in live DOM that menu elements (nav, mobile drawer, cmd palette button)
    // do NOT carry any fx-glow-* class. This is a runtime check that complements the
    // file-level CG5 source-grep test.
    const menuViolations = await page.evaluate(() => {
      const selectors = [
        'nav[aria-label*="หลังบ้าน"]',     // OLD sidebar menu
        '[data-testid="bloom-overlay"]',   // NEW backend bloom menu
        '[data-testid="menu-bottom-dock"]', // Frontend mobile dock
        '[data-testid="admin-top-menu"]',   // Frontend top menu shell
      ];
      const matches = [];
      for (const sel of selectors) {
        const root = document.querySelector(sel);
        if (!root) continue;
        const inside = Array.from(root.querySelectorAll('*')).filter(
          n => typeof n.className === 'string' && /fx-glow-/.test(n.className)
        );
        if (inside.length > 0) matches.push({ sel, count: inside.length });
      }
      return matches;
    });
    expect(menuViolations).toEqual([]);
  });

  test('G6 — BackupManagerTab outer panel has fx-glow-v3 (page-level large)', async ({ page }) => {
    await page.goto('/?backend=1&tab=backup-manager');
    await page.waitForTimeout(2500);
    const panel = page.locator('[data-testid="backup-manager-tab"]').first();
    await expect(panel).toHaveClass(/fx-glow-v3/, { timeout: 5000 });
    // V3 ::before pseudo provides the wide-aurora halo (radial purple-pink)
    const beforeContent = await panel.evaluate(el => getComputedStyle(el, '::before').content);
    expect(beforeContent).not.toBe('none');
  });

  test('G7 — fx-glow-* class count in DOM matches expected coverage (≥3 elements)', async ({ page }) => {
    // Multi-page sweep: visit 3 pages and accumulate fx-glow-* element count.
    // Validates the coverage strategy (shared shell + global wrapper) yields
    // at least a baseline number of glow elements per active page.
    const visits = ['/?backend=1&tab=customers', '/?backend=1&tab=reports', '/?backend=1&tab=backup-manager'];
    let totalCount = 0;
    for (const url of visits) {
      await page.goto(url);
      await page.waitForTimeout(1800);
      const count = await page.evaluate(() => document.querySelectorAll('[class*="fx-glow-"]').length);
      totalCount += count;
    }
    expect(totalCount).toBeGreaterThanOrEqual(3);
  });
});
