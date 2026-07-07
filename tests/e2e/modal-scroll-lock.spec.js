// ─── AV205 — Rule Q L1: universal modal scroll lock (trusted wheel) ─────────
// page.mouse.wheel() dispatches TRUSTED events via CDP → real native scrolling
// (synthetic dispatchEvent wheel can't scroll — the V66 lesson). Verifies:
//   L1-1  modal open → html[data-modal-open] + computed lock + wheel on the
//         backdrop leaves EVERY background scroller + window frozen
//   L1-2  wheel over the modal's own scrollable content scrolls IT
//   L1-3  close → unlock (attr gone, overflow restored, page scrolls again)
//   L1-4  a group-1 form modal (WholeSystemBackupModal) locks the same way
// Runs against the local vite dev server (playwright webServer) with real auth.
import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

// Snapshot of every BACKGROUND scroller (outside fixed overlays) + window.
async function scrollState(page) {
  return page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      return el.scrollHeight > el.clientHeight + 4
        && /(auto|scroll)/.test(cs.overflowY)
        && !el.closest('.fixed');
    });
    return {
      win: window.scrollY,
      count: scrollers.length,
      tops: scrollers.slice(0, 8).map((el) => el.scrollTop),
    };
  });
}

test.beforeEach(async ({ page }) => {
  // Short viewport → the backend content overflows → background IS scrollable,
  // so a frozen background is a real assertion, not a vacuous one.
  await page.setViewportSize({ width: 1280, height: 540 });
});

test('L1-1: cmd palette locks html + wheel on backdrop leaves background frozen', async ({ page }) => {
  await goToBackend(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('html[data-modal-open]')).toHaveCount(1);

  const mech = await page.evaluate(() => ({
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    bodyTouch: getComputedStyle(document.body).touchAction,
  }));
  expect(mech.htmlOverflow).toBe('hidden');
  expect(mech.bodyTouch).toBe('none');

  const before = await scrollState(page);
  await page.mouse.move(30, 400);       // backdrop area (palette is centered)
  await page.mouse.wheel(0, 900);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(350);
  const after = await scrollState(page);
  expect(after.win).toBe(before.win);
  expect(after.tops).toEqual(before.tops);
  await page.screenshot({ path: 'test-results/av205-l1-palette-open.png' }); // Q-vis
});

test('L1-2: wheel over the palette list scrolls the MODAL content', async ({ page }) => {
  await goToBackend(page);
  await page.keyboard.press('Control+k');
  const list = page.locator('[cmdk-list]');
  await expect(list).toBeVisible();
  const box = await list.boundingBox();
  const beforeTop = await list.evaluate((el) => el.scrollTop);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(300);
  const afterTop = await list.evaluate((el) => el.scrollTop);
  expect(afterTop).toBeGreaterThan(beforeTop);
});

test('L1-3: closing the modal unlocks the page', async ({ page }) => {
  await goToBackend(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('html[data-modal-open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('html[data-modal-open]')).toHaveCount(0);
  const overflow = await page.evaluate(
    () => getComputedStyle(document.documentElement).overflow);
  expect(overflow).not.toBe('hidden');

  // page scrolls again — wheel over the main content moves a background scroller
  const before = await scrollState(page);
  if (before.count > 0) {
    await page.mouse.move(640, 300);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(350);
    const after = await scrollState(page);
    const moved = after.win !== before.win
      || after.tops.some((t, i) => t !== before.tops[i]);
    expect(moved).toBe(true);
  }
});

test('L1-4: group-1 form modal (WholeSystemBackupModal) locks + backdrop wheel frozen', async ({ page }) => {
  await goToBackend(page);
  await page.goto('/?backend=1&tab=backup-manager');
  const trigger = page.locator('[data-testid="whole-system-backup-trigger"]');
  await trigger.waitFor({ state: 'visible', timeout: 20000 });
  // The ArcBloom menu overlay opens over the tab on entry — dismiss it first.
  const bloom = page.locator('[data-testid="bloom-overlay"][data-open="true"]');
  if (await bloom.count()) {
    await page.keyboard.press('Escape');
    await bloom.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  await trigger.click();
  await expect(page.locator('html[data-modal-open]')).toHaveCount(1);

  const before = await scrollState(page);
  await page.mouse.move(30, 400);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(350);
  const after = await scrollState(page);
  expect(after.win).toBe(before.win);
  expect(after.tops).toEqual(before.tops);
  await page.screenshot({ path: 'test-results/av205-l1-backup-modal-open.png' }); // Q-vis
});
