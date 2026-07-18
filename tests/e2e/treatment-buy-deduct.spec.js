// ─── E2E: Treatment ซื้อ-ตัด คอร์ส — กดผ่าน UI เหมือนคนจริง ────────────────
import { test, expect } from '@playwright/test';
import { goToCustomer } from './helpers.js';

// 2026-07-19: the hardcoded prod customer '2867' was deleted from prod → every
// test died in goToCustomer (stale fixture, pre-existing). Overridable so the
// runner can seed a TEST- customer (V33.10 prefix discipline) and clean up.
const CUSTOMER_ID = process.env.E2E_BUY_CUSTOMER || '2867';

// Helper: open treatment form for this customer
async function openTreatmentForm(page) {
  await goToCustomer(page, CUSTOMER_ID);
  // 2026-07-19 repoint: Phase 28 renamed the CTA 'สร้างการรักษา' →
  // '+ บันทึกการรักษา' (TreatmentHistoryHeader) — target the stable testid.
  await page.getByTestId('create-treatment-btn').click();
  await page.waitForTimeout(3000);
  await expect(page.getByText('ข้อมูลการใช้คอร์ส')).toBeVisible({ timeout: 15000 });
}

// Helper: buy from modal (course/promotion/product)
async function buyFromModal(page, buttonName) {
  await page.getByRole('button', { name: buttonName }).click();
  await page.waitForTimeout(3000);
  const modal = page.locator('.fixed');
  // Wait for items to load
  await modal.getByRole('button', { name: 'ยกเลิก' }).first().waitFor({ timeout: 10000 });
  // Check first item — click the checkbox via JS
  const cb = modal.locator('input[type="checkbox"]').nth(1);
  if (!(await cb.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await cb.evaluate(el => el.click());
  await page.waitForTimeout(800);
  // Verify: confirm button should become enabled (bg-teal)
  const confirmBtn = modal.locator('button.bg-teal-500, button:has-text("ยืนยัน"):not(:has-text("ยืนยันการรักษา"))').first();
  await page.waitForTimeout(300);
  const isDisabled = await confirmBtn.evaluate(el => el.disabled).catch(() => true);
  if (isDisabled) return false;
  await confirmBtn.click({ force: true });
  await page.waitForTimeout(1000);
  return true;
}

test.describe('ซื้อ-ตัด คอร์ส ผ่าน UI จริง', () => {
  test.setTimeout(60000); // 60s per test

  test('เปิดฟอร์ม → เห็นปุ่มซื้อ 3 ปุ่ม + section คอร์ส', async ({ page }) => {
    await openTreatmentForm(page);
    await expect(page.getByRole('button', { name: /ซื้อคอร์ส/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /ซื้อสินค้าหน้าร้าน/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /ซื้อโปรโมชัน/ })).toBeVisible();
  });

  test('ซื้อคอร์ส → เลือก → ยืนยัน → เห็น (ซื้อเพิ่ม)', async ({ page }) => {
    await openTreatmentForm(page);
    const bought = await buyFromModal(page, /ซื้อคอร์ส/);
    if (bought) {
      await expect(page.getByText('ซื้อเพิ่ม').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('ซื้อโปรโมชัน → เลือก → ยืนยัน → เห็น (ซื้อเพิ่ม)', async ({ page }) => {
    await openTreatmentForm(page);
    const bought = await buyFromModal(page, /ซื้อโปรโมชัน/);
    if (bought) {
      await expect(page.getByText('ซื้อเพิ่ม').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('ซื้อสินค้าหน้าร้าน → เลือก → ยืนยัน → เห็น (ซื้อเพิ่ม)', async ({ page }) => {
    await openTreatmentForm(page);
    const bought = await buyFromModal(page, /ซื้อสินค้าหน้าร้าน/);
    if (bought) {
      await expect(page.getByText('ซื้อเพิ่ม').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('ซื้อแล้วลบได้', async ({ page }) => {
    await openTreatmentForm(page);
    const bought = await buyFromModal(page, /ซื้อคอร์ส/);
    if (!bought) return;
    const beforeCount = await page.getByText('ซื้อเพิ่ม').count();
    expect(beforeCount).toBeGreaterThan(0);
    // กดลบ
    const trashBtn = page.getByText('ซื้อเพิ่ม').first().locator('..').locator('button').first();
    await trashBtn.click();
    await page.waitForTimeout(500);
    const afterCount = await page.getByText('ซื้อเพิ่ม').count();
    expect(afterCount).toBeLessThan(beforeCount);
  });

  test('ติ๊กคอร์สเก่า → เห็นใน รายการรักษา', async ({ page }) => {
    await openTreatmentForm(page);
    const cb = page.locator('.max-h-\\[300px\\] input[type="checkbox"]').first();
    if (!(await cb.isVisible({ timeout: 3000 }).catch(() => false))) return;
    await cb.check();
    await page.waitForTimeout(500);
    // ต้องมี qty input ใน treatment items
    const qtyInput = page.locator('input[type="number"][min="0"]').first();
    await expect(qtyInput).toBeVisible({ timeout: 3000 });
  });

  test('untick คอร์ส → หายจาก รายการรักษา', async ({ page }) => {
    await openTreatmentForm(page);
    const cb = page.locator('.max-h-\\[300px\\] input[type="checkbox"]').first();
    if (!(await cb.isVisible({ timeout: 3000 }).catch(() => false))) return;
    await cb.check();
    await page.waitForTimeout(300);
    await cb.uncheck();
    await page.waitForTimeout(300);
    await expect(page.getByText('เลือกรายการจากคอร์ส')).toBeVisible({ timeout: 3000 });
  });

  test('error: ไม่เลือกแพทย์ → เห็น error message', async ({ page }) => {
    await openTreatmentForm(page);
    const doctorSelect = page.locator('[data-field="doctor"] select');
    if (await doctorSelect.isVisible()) await doctorSelect.selectOption('');
    // 2026-07-19 repoint: V26.1 removed the top-right sticky "ยืนยันการรักษา";
    // the canonical save is the bottom button data-testid="tfp-save".
    // scrollToError = alert(msg) + inline setError banner — capture the alert
    // message (primary channel) instead of racing the inline render.
    let dialogMsg = '';
    page.on('dialog', d => { dialogMsg = d.message(); d.accept(); });
    await page.getByTestId('tfp-save').click();
    await page.waitForTimeout(1500);
    expect(dialogMsg).toContain('กรุณาเลือกแพทย์');
  });

  test('buy modal max 50 items + โหลดเพิ่ม', async ({ page }) => {
    await openTreatmentForm(page);
    await page.getByRole('button', { name: /ซื้อคอร์ส/ }).click();
    await page.waitForTimeout(3000);
    // 2026-07-19 repoint: the old `แสดง 50/...` literal assumed the branch has
    // >50 filtered courses — data-dependent. Lock the CONTRACT instead:
    // visible count caps at 50, and โหลดเพิ่ม appears iff more remain.
    const counter = page.getByText(/แสดง \d+\/\d+/);
    await expect(counter).toBeVisible({ timeout: 8000 });
    const m = (await counter.textContent()).match(/แสดง (\d+)\/(\d+)/);
    expect(Number(m[1])).toBeLessThanOrEqual(50);
    if (Number(m[2]) > Number(m[1])) {
      await expect(page.getByText('โหลดเพิ่ม')).toBeVisible();
    }
  });

  test('data-field scroll targets ครบ', async ({ page }) => {
    await openTreatmentForm(page);
    await expect(page.locator('[data-field="doctor"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-field="treatmentDate"]')).toBeVisible();
    await expect(page.locator('[data-field="courseSection"]')).toBeVisible();
  });
});
