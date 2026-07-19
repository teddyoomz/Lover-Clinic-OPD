// ─── Wheel guard L1 (2026-07-19, user directive) — TRUSTED mouse wheel ───────
// Playwright `page.mouse.wheel` = CDP trusted wheel events (the AV205 lesson:
// this is the ONLY harness tool that faithfully reproduces a real wheel —
// Chrome-MCP `scroll` synthesizes a scroll GESTURE that emits zero `wheel`
// DOM events, and synthetic dispatchEvent can't trigger native number-spin).
//
// Contract under test (src/lib/wheelGuard.js, installed in App.jsx):
//   - MONEY (untagged) number input: wheel over the FOCUSED field must NOT
//     change the typed value (guard blurs; native spin never fires).
//   - data-wheelable qty input: wheel steps EXACTLY ±1 (never step="0.01").
// NOTHING is saved — modals are cancelled.
import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

// goToTab's legacy tabMap predates the products/courses tabs — deep-link
// directly (the ?backend=1&tab=X whitelist ships since the ArcBloom menu).
async function goDeep(page, tab) {
  await goToBackend(page);
  await page.goto(`/?backend=1&tab=${tab}`);
  // Fresh Playwright profile defaults to a branch with zero catalog rows —
  // products/courses are branch-scoped; pick the real data branch first.
  await page.getByRole('combobox', { name: 'เลือกสาขา' }).selectOption({ label: 'นครราชสีมา' });
  await page.getByRole('button', { name: /แก้ไข/ }).first().waitFor({ state: 'visible', timeout: 20000 });
}

async function wheelOver(page, locator, deltaY) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(150);
}

test('W1 money field (ProductFormModal ราคา): trusted wheel changes NOTHING', async ({ page }) => {
  await goDeep(page, 'products');
  await page.getByRole('button', { name: /แก้ไข/ }).first().click();
  const modal = page.locator('div.fixed').filter({ hasText: 'แก้ไขสินค้า' }).last();
  const price = modal.locator('input[type="number"]').first(); // ราคา
  await expect(price).toBeVisible();
  await price.fill('1500');
  await price.focus();
  await wheelOver(page, price, 120);   // wheel down over the focused money field
  await expect(price).toHaveValue('1500');
  await wheelOver(page, price, -120);  // wheel up too
  await expect(price).toHaveValue('1500');
  await modal.getByRole('button', { name: 'ยกเลิก' }).click(); // never save
});

test('W2 qty field (CourseFormModal จำนวน, data-wheelable): trusted wheel steps EXACTLY ±1 despite step="0.01"', async ({ page }) => {
  await goDeep(page, 'courses');
  await page.getByRole('button', { name: /แก้ไข/ }).first().click();
  const modal = page.locator('div.fixed').filter({ hasText: 'แก้ไขคอร์ส' }).last();
  const qty = modal.locator('input[type="number"][data-wheelable]').first(); // สินค้าหลัก จำนวน
  await qty.scrollIntoViewIfNeeded();
  await qty.fill('1');
  await qty.focus();
  await wheelOver(page, qty, -120);    // wheel up = +1
  await expect(qty).toHaveValue('2');
  await wheelOver(page, qty, 120);     // wheel down = -1
  await expect(qty).toHaveValue('1');
  await wheelOver(page, qty, 120);     // min="0" clamp path: 1 -> 0
  await expect(qty).toHaveValue('0');
  await modal.getByRole('button', { name: 'ยกเลิก' }).click(); // never save
});
