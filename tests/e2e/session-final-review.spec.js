// ─── Session final review L1 (2026-07-07) — Rule Q real-browser on the two ──
// NEW user-visible surfaces shipped this session, against REAL prod Firestore
// via the dev server + real staff auth. READ-ONLY: no save clicked anywhere.
//   1. reports-reconciliation tab — scans real sales, renders verdict table
//   2. CentralStockTab — ปรับ row button opens the IN-PLACE modal (no bounce)
import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

test.describe('final-review — reconciliation tab (real prod scan)', () => {
  test('FR1: tab renders + real scan completes with table or all-clear (no error)', async ({ page }) => {
    test.setTimeout(150000); // real-prod scan of ~17 sales × evidence queries
    await goToBackend(page);
    // ArcBloom new-menu mode: tab= deep links land on the launcher home (pre-
    // existing behavior for ALL tabs) → navigate like a real user instead:
    // bloom card รายงาน → sub-card ตรวจความครบธุรกรรม (from navConfig).
    // force:true — the bloom orbs FLOAT (continuous animation) so Playwright's
    // "stable" actionability check never settles (observed 262 retries).
    await page.locator('text=รายงาน >> visible=true').first().click({ force: true });
    await page.waitForTimeout(800); // sub-bloom open animation
    await page.locator('text=ตรวจความครบธุรกรรม >> visible=true').first().click({ force: true });
    await expect(page.locator('text=ตรวจความครบธุรกรรม >> visible=true').first()).toBeVisible({ timeout: 20000 });
    // switch to นครราชสีมา (the branch with real sales) so the TABLE path renders —
    // also proves the BS-11 branch-switch re-scan fires. STRICT: this branch has
    // sales in the last-7 window (L2 2026-07-07 measured 17), so the table MUST
    // appear; a silent fallback to empty-state would hide a real regression.
    const branchSelect = page.locator('select >> visible=true').first();
    await branchSelect.selectOption({ label: 'นครราชสีมา' });
    await expect(page.locator('[data-testid="recon-table"]')).toBeVisible({ timeout: 90000 });
    const realRows = page.locator('[data-testid^="recon-row-"]');
    expect(await realRows.count()).toBeGreaterThan(0);
    await realRows.first().click();
    await expect(page.locator('text=movement >> visible=true').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'test-results/fr1-recon-table-proof.png', fullPage: false });
    // real scan over last-7-days sales (L2 measured ~17 sales) — allow 90s
    const table = page.locator('[data-testid="recon-table"]');
    const clear = page.locator('[data-testid="recon-all-clear"]');
    const empty = page.locator('text=ไม่มีใบขายในช่วงที่เลือก >> visible=true');
    await expect(table.or(clear).or(empty).first()).toBeVisible({ timeout: 90000 });
    // no error banner (the strict table-path asserts above already covered
    // rows + drill-down; a second row-click here would TOGGLE the drill-down
    // closed — openId toggle — so no duplicate click block)
    await expect(page.locator('text=ตรวจสอบล้มเหลว')).toHaveCount(0);
  });
});

test.describe('final-review — CentralStockTab in-place modal (V144-followup)', () => {
  test('FR2: ปรับ on a central balance row opens the modal IN-PLACE (no sub-tab bounce), กลับ closes', async ({ page }) => {
    test.setTimeout(90000);
    await goToBackend(page);
    // ArcBloom navigation (same rationale as FR1): คลังสินค้า → คลังกลาง
    // force:true — floating orbs never pass the "stable" actionability check.
    await page.locator('text=คลังสินค้า >> visible=true').first().click({ force: true });
    await page.waitForTimeout(800); // sub-bloom open animation
    await page.locator('text=คลังกลาง >> visible=true').first().click({ force: true });
    // the central tab itself must render (sub-tab bar = proof of navigation)
    await expect(page.locator('[data-subtab="balance"]')).toBeVisible({ timeout: 30000 });
    // central balance loads — a row's ปรับ button, or a legitimate empty state
    // (no warehouse / warehouse has no stock yet) → then skip the modal click
    // gracefully. Modal EXECUTION is covered by tests/central-stock-action-
    // modal-smoke (CSM.1-3 mount the real component); this click needs real
    // central stock rows, which this prod doesn't have yet (Rule Q-honest).
    const adjustBtn = page.locator('button[title="ปรับสต็อก (+/-)"]').first();
    const zeroState = page.locator('text=ยังไม่มีคลังกลาง >> visible=true')
      .or(page.locator('text=ยังไม่มีสต็อก >> visible=true'));
    await expect(adjustBtn.or(zeroState.first()).first()).toBeVisible({ timeout: 30000 });
    if (await zeroState.first().isVisible().catch(() => false)) {
      test.skip(true, 'central warehouse has no stock rows on this environment — modal-open click pending user L1 / stock arrival');
      return;
    }
    await adjustBtn.click();
    const modal = page.locator('[data-testid="central-stock-action-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal).toHaveAttribute('data-mode', 'adjust');
    // still on ยอดคงเหลือ underneath (no navigation happened) — the balance
    // sub-tab button is still the active one
    await expect(page.locator('[data-subtab="balance"]')).toBeVisible();
    // the adjust form rendered inside (ผู้ทำรายการ picker is part of AdjustCreateForm)
    await expect(modal.locator('text=ปรับสต็อก').first()).toBeVisible({ timeout: 15000 });
    // close via the form's กลับ (AV78 — backdrop must NOT close)
    await modal.locator('button:has-text("กลับ")').first().click();
    await expect(modal).toHaveCount(0);
  });
});
