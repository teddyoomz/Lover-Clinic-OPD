// ─── Reports-home wire-up L1 (2026-07-08) — Rule Q real-browser on the reports ─
// landing page + a NEW tab, against REAL prod Firestore via the dev server +
// real staff auth. READ-ONLY (no save/mutate). Single ArcBloom navigation, then
// in-place card clicks (onNavigate) — the card click IS the wiring under test.
import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

test.describe('reports-home wire-up (real prod)', () => {
  test('RH1: home grid has zero dead cards + a card opens its real tab', async ({ page }) => {
    test.setTimeout(120000);
    // pageerror = uncaught JS exception (a real crash). Network resource 404s
    // (favicon / version.json / source-maps) surface as console 'error' but are
    // NOT feature failures — the functional assertions below prove the render.
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(String(e?.message || e)));

    await goToBackend(page);

    // ArcBloom new-menu: รายงาน → หน้ารายงาน (force:true — orbs float, never "stable").
    await page.locator('text=รายงาน >> visible=true').first().click({ force: true });
    await page.waitForTimeout(800);
    await page.locator('text=หน้ารายงาน >> visible=true').first().click({ force: true });
    await expect(page.locator('[data-testid="reports-home"]')).toBeVisible({ timeout: 20000 });

    // (a) NO dead cards — every button in the reports-home grid is enabled, and
    //     no "เร็วๆนี้" badge remains (the whole point of the wire-up).
    expect(await page.locator('[data-testid="reports-home"] button[disabled]').count()).toBe(0);
    await expect(page.locator('[data-testid="reports-home"] >> text=เร็วๆนี้')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/rh1-home-grid.png', fullPage: true });

    // branch with real stock (matches the L2 scan) so the new tab shows data.
    await page.locator('select >> visible=true').first().selectOption({ label: 'นครราชสีมา' }).catch(() => {});

    // (b) click the NEW "ล็อตสินค้าใกล้หมดอายุ" card → stock-alert tab renders in
    //     place with real data (a section table) OR the legit empty state — no crash.
    await page.locator('[data-testid="reports-home"] >> text=ล็อตสินค้าใกล้หมดอายุ').first().click();
    await expect(page.locator('h2 >> text=แจ้งเตือนสต็อค')).toBeVisible({ timeout: 30000 });
    await expect(
      page.locator('[data-testid^="stock-alert-"]').or(page.locator('[data-testid="report-empty"]')).first()
    ).toBeVisible({ timeout: 30000 });
    await page.screenshot({ path: 'test-results/rh1-stock-alert.png', fullPage: false });

    // no uncaught JS exceptions across the whole flow (real crash signal)
    expect(jsErrors, `uncaught JS errors:\n${jsErrors.join('\n')}`).toHaveLength(0);
  });
});
