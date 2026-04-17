// ─── E2E: File Upload in SaleTab (payment evidence + cancel evidence) ────────
// Tests Firebase Storage integration via FileUploadField component
import { test, expect } from '@playwright/test';
import { goToTab } from './helpers.js';

// Tiny valid 1x1 red PNG (68 bytes)
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

const TEST_FILE = {
  name: 'test-receipt.png',
  mimeType: 'image/png',
  buffer: TINY_PNG_BUFFER,
};

// Open sale create form (same pattern as sale.spec.js)
async function openSaleForm(page) {
  const createBtn = page.locator('button[style*="linear-gradient"]').filter({ hasText: /ขาย/ });
  await createBtn.click();
  await page.waitForTimeout(1500);
}

test.describe('File Upload — Payment Evidence', () => {
  test.beforeEach(async ({ page }) => {
    await goToTab(page, 'sales');
    await openSaleForm(page);
  });

  test('แสดง drop zone "แนบหลักฐานชำระเงิน"', async ({ page }) => {
    await expect(page.getByText('แนบหลักฐานชำระเงิน').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('คลิกเพื่อเลือกไฟล์').first()).toBeVisible();
    await expect(page.getByText(/JPG, PNG, PDF.*10MB/).first()).toBeVisible();
  });

  test('upload PNG → แสดง preview + filename', async ({ page }) => {
    // Find hidden file input (first one on page, for payment evidence)
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_FILE);

    // Wait for upload to complete (uploading → uploaded state)
    await expect(page.locator('img[src*="firebasestorage.googleapis.com"]')).toBeVisible({ timeout: 15000 });

    // Verify filename is displayed
    await expect(page.getByText('test-receipt.png').first()).toBeVisible();
  });

  test('upload → delete → กลับเป็น empty state', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_FILE);
    await expect(page.locator('img[src*="firebasestorage.googleapis.com"]')).toBeVisible({ timeout: 15000 });

    // Click delete button (aria-label="ลบไฟล์")
    await page.getByRole('button', { name: 'ลบไฟล์' }).click();
    await page.waitForTimeout(2500);

    // Empty state should return
    await expect(page.getByText('คลิกเพื่อเลือกไฟล์').first()).toBeVisible();
    await expect(page.locator('img[src*="firebasestorage.googleapis.com"]')).not.toBeVisible();
  });

  test('upload PDF → แสดง FileText icon + filename', async ({ page }) => {
    const pdfFile = {
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      // Minimal valid PDF
      buffer: Buffer.from('%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>%%EOF'),
    };
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(pdfFile);

    // PDF shows FileText icon (no img thumbnail, filename shown)
    await expect(page.getByText('receipt.pdf').first()).toBeVisible({ timeout: 15000 });
  });

  test('upload URL ถูกเก็บเป็น Firebase Storage path', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_FILE);
    await expect(page.locator('img[src*="firebasestorage.googleapis.com"]')).toBeVisible({ timeout: 15000 });

    // Verify the src path contains uploads/be_sales/ (from buildStoragePath)
    const src = await page.locator('img[src*="firebasestorage.googleapis.com"]').getAttribute('src');
    expect(src).toContain('uploads');
    expect(src).toContain('be_sales');
    expect(src).toContain('paymentEvidence');
  });
});
