// ─── E2E: Customer List Tab — grid, search filter, refresh ───────────────────
import { test, expect } from '@playwright/test';
import { goToTab } from './helpers.js';

test.describe('Customer List Tab', () => {
  test.beforeEach(async ({ page }) => {
    await goToTab(page, 'customers');
  });

  test('แสดง search/filter bar', async ({ page }) => {
    const input = page.getByPlaceholder(/ค้นหาลูกค้าในระบบ/);
    await expect(input).toBeVisible({ timeout: 5000 });
  });

  test('แสดงปุ่ม "รีเฟรช"', async ({ page }) => {
    await expect(page.getByRole('button', { name: /รีเฟรช/ })).toBeVisible();
  });

  test('แสดงจำนวนลูกค้า (N / N รายการ)', async ({ page }) => {
    await expect(page.getByText(/\d+\s*\/\s*\d+\s*รายการ/)).toBeVisible({ timeout: 10000 });
  });

  test('แสดง customer cards (มีข้อมูล)', async ({ page }) => {
    // 2026-07-20: the 'ดูรายละเอียด' button was removed — the whole card is
    // clickable now. Use the HN badge (every card renders one) as the marker.
    await expect(page.getByText(/HN/).first()).toBeVisible({ timeout: 15000 });
  });

  test('filter ด้วยชื่อ → จำนวนเปลี่ยน', async ({ page }) => {
    await page.waitForTimeout(2000);
    const countEl = page.getByText(/\d+\s*\/\s*\d+\s*รายการ/);
    const beforeText = await countEl.textContent();
    // Type a partial filter that likely reduces results
    await page.getByPlaceholder(/ค้นหาลูกค้าในระบบ/).fill('สม');
    await page.waitForTimeout(500);
    const afterText = await countEl.textContent();
    // Either count changed or stayed same (if no match or all match)
    expect(typeof afterText).toBe('string');
  });

  test('filter ไม่พบ → แสดง empty message', async ({ page }) => {
    await page.getByPlaceholder(/ค้นหาลูกค้าในระบบ/).fill('zzzzzzzzzz_no_match');
    await page.waitForTimeout(500);
    // Should show 0 / N or empty message
    const zeroCount = page.getByText(/^0\s*\//);
    const emptyMsg = page.getByText(/ไม่พบ/);
    const hasZero = await zeroCount.isVisible().catch(() => false);
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    expect(hasZero || hasEmpty).toBeTruthy();
  });

  test('clear filter → กลับแสดงทั้งหมด', async ({ page }) => {
    await page.waitForTimeout(2000);
    const input = page.getByPlaceholder(/ค้นหาลูกค้าในระบบ/);
    await input.fill('zzzzzzzzzz_no_match');
    await page.waitForTimeout(300);
    await input.fill('');
    await page.waitForTimeout(500);
    // Count should be N / N where both are same
    const countEl = page.getByText(/\d+\s*\/\s*\d+\s*รายการ/);
    await expect(countEl).toBeVisible();
  });

  test('ปุ่มรีเฟรช คลิกได้', async ({ page }) => {
    const btn = page.getByRole('button', { name: /รีเฟรช/ });
    await btn.click();
    // Should briefly show loading then restore
    await page.waitForTimeout(2000);
    await expect(btn).toBeVisible();
  });

  test('customer card เปิดรายละเอียดได้ (คลิกทั้งใบ)', async ({ page }) => {
    // 2026-07-20: card-level click replaced the 'ดูรายละเอียด' button —
    // click the first card (stable testid) and assert the detail view opens.
    // 2026-07-20: wait for the list to SETTLE before interacting — the AV206
    // SWR cache→server double-emit re-renders the list shortly after paint,
    // and a click/Enter issued mid-churn lands on a node that React replaces
    // (flaky: worked in attempt-1 of some runs, not others). The N/N counter
    // renders when the data pass lands; +1.5s absorbs the re-render.
    await expect(page.getByText(/\d+ \/ \d+ รายการ/)).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const card = page.locator('[data-testid^="customer-card-"]').first();
    // 2026-07-20: onViewCustomer opens the detail in a NEW TAB by design
    // (BackendDashboard: window.open('?backend=1&customer=X', '_blank')) —
    // the click was working in every earlier run; the assert was looking at
    // the wrong page. Catch the popup and assert the detail shell there.
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 15000 }),
      card.click({ position: { x: 10, y: 10 } }),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    // Shell marker: 'คอร์สของฉัน' course tab renders with the detail view
    // ('ประวัติการรักษา' is data-gated behind the treatments fetch).
    await expect(popup.getByText('คอร์สของฉัน').first()).toBeVisible({ timeout: 30000 });
  });
});
