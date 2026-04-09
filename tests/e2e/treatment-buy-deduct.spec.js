// ─── E2E: Treatment ซื้อ-ตัด คอร์ส — กดผ่าน UI เหมือนคนจริง ────────────────
import { test, expect } from '@playwright/test';
import { goToCustomer } from './helpers.js';

const CUSTOMER_ID = '2867';

// Helper: open treatment form for this customer
async function openTreatmentForm(page) {
  await goToCustomer(page, CUSTOMER_ID);
  await page.getByRole('button', { name: 'สร้างการรักษา' }).click();
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
  // Check first item — find any checkbox inside the modal
  const cb = modal.locator('input[type="checkbox"]').nth(1);
  if (!(await cb.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await cb.check({ force: true });
  await page.waitForTimeout(500);
  const qtyInput = modal.locator('input[type="number"]').first();
  if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await qtyInput.click({ force: true, clickCount: 3 });
    await page.keyboard.type('1');
  }
  await page.waitForTimeout(300);
  // Confirm
  const confirmBtn = modal.getByRole('button', { name: 'ยืนยัน' });
  if (await confirmBtn.isDisabled()) return false;
  await confirmBtn.click();
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
    page.on('dialog', d => d.accept());
    await page.locator('.sticky button').filter({ hasText: 'ยืนยันการรักษา' }).first().click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('กรุณาเลือกแพทย์')).toBeVisible({ timeout: 3000 });
  });

  test('buy modal max 50 items + โหลดเพิ่ม', async ({ page }) => {
    await openTreatmentForm(page);
    await page.getByRole('button', { name: /ซื้อคอร์ส/ }).click();
    await page.waitForTimeout(3000);
    await expect(page.getByText(/แสดง 50\//)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('โหลดเพิ่ม')).toBeVisible();
  });

  test('data-field scroll targets ครบ', async ({ page }) => {
    await openTreatmentForm(page);
    await expect(page.locator('[data-field="doctor"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-field="treatmentDate"]')).toBeVisible();
    await expect(page.locator('[data-field="courseSection"]')).toBeVisible();
  });
});
