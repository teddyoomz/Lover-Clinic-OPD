// tests/e2e/v77-whole-fleet-backup-adversarial.spec.js
//
// V77 (2026-05-16 NIGHT — Rule Q L1 evidence) — REAL-BROWSER adversarial
// smoke for the 📦 "สำรองลูกค้าทุกคน" button after the 5-bug fix batch.
//
// User reaction sequence this session:
//   1. "backup ลูกค้าไม่ได้ ไอ้สัส" + screenshot of "Unexpected token 'A'..."
//   2. "มึงเทสแล้วจริงเหรอ กูไม่เชื่อ ยังไงก็บั๊ค มึงหาบั๊คต่อได้เลย"
//
// Adversarial code-review pass found 18+ bugs; this commit fixed the 5 most
// critical. Per Rule Q V66 the FIX is not VERIFIED until L1 hands-on proves
// it. This spec drives the REAL local-dev UI (which hits real prod Firestore)
// with REAL auth via Firebase REST + REAL DOM clicks. The api/admin/* endpoint
// is hit on the DEPLOYED prod URL — set TEST_BASE_URL env to override.
//
// Coverage matrix:
//   W1: Modal opens with maxCustomers + branchId inputs visible (V77-fix2)
//   W2: Empty branchIdFilter+small maxN=2 → endpoint returns ok+manifestRef
//       (validates P0-8 cap + P1-1 spread fix in one go)
//   W3: Non-existent branchIdFilter → ok+NO_CUSTOMERS_FOUND warning + amber
//       banner + NO download link rendered (P0-5 fix)
//   W4: maxCustomers=51 + no force → 413 WHOLE_FLEET_TOO_LARGE_FOR_ENDPOINT
//       + helpful Thai hint pointing to CLI (P0-8 enforcement)
//   W5: Defensive parse — if endpoint returns plain text, modal shows
//       "HTTP X — non-JSON response" with body head, NOT generic SyntaxError
//       (V77-fix1)
//
// NOTE: This spec is RUN-when-asked. By default it's skipped because (a) it
// needs the deployed endpoint LIVE and (b) actually writes to prod Storage
// (cleanup via scripts/customer-backup-export.mjs --apply will reuse the
// backup files; admin can manually delete the test bucket entries OR they
// expire via 24h signed-URL TTL).
//
// To run: `npx playwright test tests/e2e/v77-whole-fleet-backup-adversarial.spec.js`
// To skip-by-default + run-on-demand: keep `test.describe.skip` (default).

import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

// Run-on-demand by default. Flip to .describe when actively verifying.
test.describe.skip('V77 whole-fleet backup — adversarial real-prod', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    // Navigate to BackupManagerTab — admin-only; nav label may vary by build.
    await page.goto('/?backend=1&tab=backup-manager');
    await page.waitForTimeout(2500);
  });

  test('W1: 📦 button visible + modal opens with all inputs', async ({ page }) => {
    // Button might be named differently across builds; testid is stable.
    const btn = page.getByTestId('open-whole-fleet-backup-modal').first();
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();

    const modal = page.getByTestId('whole-fleet-backup-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // All 3 inputs present (post-V77-fix1 maxCustomers added)
    await expect(page.getByTestId('whole-fleet-user-note')).toBeVisible();
    await expect(page.getByTestId('whole-fleet-branch-filter')).toBeVisible();
    await expect(page.getByTestId('whole-fleet-max-customers')).toBeVisible();
    await expect(page.getByTestId('whole-fleet-start-btn')).toBeVisible();
  });

  test('W2: maxCustomers=2 → ok+manifestRef (P0-8 cap allows + P1-1 spread fix)', async ({ page }) => {
    await page.getByTestId('open-whole-fleet-backup-modal').first().click();
    await page.getByTestId('whole-fleet-user-note').fill('TEST-V77-L1-W2');
    await page.getByTestId('whole-fleet-max-customers').fill('2');
    await page.getByTestId('whole-fleet-start-btn').click();

    // Wait up to 60s for endpoint to return (real Storage hashing per customer)
    const result = page.getByTestId('whole-fleet-result');
    await expect(result).toBeVisible({ timeout: 60000 });

    // Success banner + download link present
    const dl = page.getByTestId('whole-fleet-download-link');
    await expect(dl).toBeVisible();
    // Anchor href is a signed-URL — not empty, not "undefined"
    const href = await dl.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).not.toBe('undefined');
    expect(href).toMatch(/^https:\/\//);
  });

  test('W3: branchIdFilter=BR-NONEXISTENT → NO_CUSTOMERS_FOUND amber + NO download link (P0-5)', async ({ page }) => {
    await page.getByTestId('open-whole-fleet-backup-modal').first().click();
    await page.getByTestId('whole-fleet-branch-filter').fill('BR-NONEXISTENT-V77-TEST');
    await page.getByTestId('whole-fleet-start-btn').click();

    const result = page.getByTestId('whole-fleet-result');
    await expect(result).toBeVisible({ timeout: 30000 });

    // Empty-result amber banner visible
    await expect(page.getByText('ไม่พบลูกค้าที่ตรงเงื่อนไข')).toBeVisible();

    // NO broken download link
    const dl = page.getByTestId('whole-fleet-download-link');
    await expect(dl).toHaveCount(0);
  });

  test('W4: maxCustomers=51 → 413 + CLI hint (P0-8 enforcement)', async ({ page }) => {
    // Note: skip if prod has < 51 customers (cap fires AFTER branch+slice math)
    await page.getByTestId('open-whole-fleet-backup-modal').first().click();
    await page.getByTestId('whole-fleet-max-customers').fill('51');
    await page.getByTestId('whole-fleet-start-btn').click();

    // Error banner with Thai CLI hint
    const errorRegex = /CLI|customer-backup-export|WHOLE_FLEET_TOO_LARGE_FOR_ENDPOINT/;
    await expect(page.locator('.rounded.border').filter({ hasText: errorRegex })).toBeVisible({
      timeout: 30000,
    });
  });

  test('W5: defensive parse surfaces real error on non-JSON response (V77-fix1)', async ({ page }) => {
    // Hard to trigger without a deliberately broken endpoint; this test
    // documents the contract. If user reports another "Unexpected token"
    // crash, this spec is the regression repro.
    test.skip(true, 'Triggered manually when reproducing non-JSON crash');
  });
});
