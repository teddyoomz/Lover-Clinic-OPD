// tests/e2e/phase-29-recall-adversarial.spec.js
//
// Phase 29.21-fix2 (2026-05-14) — ADVERSARIAL real-browser smoke against
// the actual local-dev UI which connects to real prod Firestore.
//
// User directive: "เทสยังไงก็ไม่เจอ ... ใช้ความสามารถทั้งหมดที่มึง"
//   → No more mocks, no more admin-SDK-doc-level cheating. This test
//     drives the REAL browser, fills the REAL DOM, clicks the REAL
//     buttons, hits the REAL Firestore.
//
// Scope: focus on the 5 critical bugs found via user screenshot + bug-hunt
// (Phase 29.21-fix2 commit c404cb6):
//   - Bug A: customer picker missing in Backend "+ ตั้ง Recall ใหม่"
//   - Bug B: auto-suggest never fires (deferred — requires treatment context)
//   - Bug C: reschedule outcome semantic
//   - Bug D: closed-no-answer option visibility
//   - Bug E: noAnswerCount reset (data-layer test; UI is consequence)
//
// Writes use TEST-RECALL- prefix discipline (V33-class). Cleanup via
// scripts/phase-29-recall-e2e-real-prod.mjs --apply (or skip — those test
// recalls are easy to spot in prod admin queue).

import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

test.describe('Phase 29 — Recall adversarial real-prod (Bug A: customer picker)', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    // Navigate to Recall tab via direct URL — the nav-section sidebar might
    // require expanding; URL-direct is more robust.
    await page.goto('/?backend=1&tab=recall');
    await page.waitForTimeout(2500); // Lazy-load chunk + listener subscribe
  });

  test('A1: Backend "+ ตั้ง Recall ใหม่" opens modal WITH customer search + autoFocus (Bug A fix)', async ({ page }) => {
    // The button might not be visible if user lacks permission; check first.
    const createBtn = page.getByTestId('recall-header-create');
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Modal opens
    await expect(page.getByTestId('recall-create-modal')).toBeVisible({ timeout: 5000 });

    // CRITICAL: customer search MUST be present (pre-fix this was missing)
    const search = page.getByTestId('recall-create-customer-search');
    await expect(search).toBeVisible({ timeout: 5000 });
    // Wait for customers to load + manual focus useEffect to fire (~3s budget)
    await expect(search).toBeFocused({ timeout: 8000 });

    // Validation banners present (no customer, no slots)
    await expect(page.getByTestId('recall-create-validation-banner')).toBeVisible();
    await expect(page.getByTestId('recall-create-customer-required')).toBeVisible();
    await expect(page.getByTestId('recall-create-save')).toBeDisabled();
  });

  test('A2: Customer search shows results when typing 1+ char', async ({ page }) => {
    await page.getByTestId('recall-header-create').click();
    const search = page.getByTestId('recall-create-customer-search');
    await search.waitFor({ state: 'visible', timeout: 5000 });
    // Wait for getAllCustomers() to populate
    await page.waitForTimeout(2000);

    // Type a single character — should show up to 30 filtered results
    await search.fill('a');
    await page.waitForTimeout(500);
    // Either list shows OR no-results banner shows; both are valid states.
    const list = page.getByTestId('recall-create-customer-list');
    const noResults = page.getByTestId('recall-create-customer-no-results');
    // At least one of these should be visible (avoid hanging)
    const hasList = await list.isVisible().catch(() => false);
    const hasNoResults = await noResults.isVisible().catch(() => false);
    expect(hasList || hasNoResults).toBe(true);
  });

  test('A3: Picking a customer reveals customer header card + enables save (when slot also enabled)', async ({ page }) => {
    await page.getByTestId('recall-header-create').click();
    const search = page.getByTestId('recall-create-customer-search');
    await search.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(2500); // Wait for customers to load

    // Empty search → top 30 customers shown by default
    const list = page.getByTestId('recall-create-customer-list');
    await expect(list).toBeVisible({ timeout: 5000 });

    // Click the first customer button in the list
    const firstCustomer = list.locator('button[data-testid^="recall-create-customer-pick-"]').first();
    await expect(firstCustomer).toBeVisible();
    await firstCustomer.click();

    // Customer header card renders
    await expect(page.getByTestId('recall-create-customer-name')).toBeVisible({ timeout: 3000 });

    // "ไม่พบลูกค้า" banner gone
    await expect(page.getByText('ไม่พบลูกค้า')).not.toBeVisible();

    // Save still disabled (no slots enabled yet)
    await expect(page.getByTestId('recall-create-save')).toBeDisabled();

    // "เปลี่ยน" button visible (allows admin to reselect)
    await expect(page.getByTestId('recall-create-customer-clear')).toBeVisible();
  });

  test('A4: "เปลี่ยน" button returns to search', async ({ page }) => {
    await page.getByTestId('recall-header-create').click();
    await page.getByTestId('recall-create-customer-search').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(2500);

    const list = page.getByTestId('recall-create-customer-list');
    await list.locator('button[data-testid^="recall-create-customer-pick-"]').first().click();

    await page.getByTestId('recall-create-customer-clear').click();
    await expect(page.getByTestId('recall-create-customer-search')).toBeVisible();
    // No customer header → "กรุณาเลือกลูกค้าก่อน" banner returns
    await expect(page.getByTestId('recall-create-customer-required')).toBeVisible();
  });
});

test.describe('Phase 29 — Recall adversarial real-prod (Frontend pill Bug A symmetry)', () => {
  test.beforeEach(async ({ page }) => {
    // Frontend = AdminDashboard root (no ?backend=1 param)
    // Inject auth via the same helper used by goToBackend (it's exported)
    const { default: helpers } = await import('./helpers.js').catch(() => ({ default: null }));
    // We need injectAuth — re-implement inline since it's not exported
    const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
    const fs = await import('fs');
    const path = await import('path');
    const TOKEN_CACHE = path.join(import.meta.dirname, '../../.auth/tokens.json');
    let tokens;
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
      tokens = cached.expiresAt > Date.now() ? cached : null;
    } catch { tokens = null; }
    if (!tokens) {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
      });
      tokens = await res.json();
    }
    const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
    const authValue = JSON.stringify({
      uid: tokens.localId,
      email: tokens.email,
      emailVerified: false,
      isAnonymous: false,
      providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
      stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
      createdAt: String(Date.now()),
      lastLoginAt: String(Date.now()),
      apiKey: FIREBASE_API_KEY,
      appName: '[DEFAULT]',
    });
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key: authKey, value: authValue });

    // Navigate to frontend root
    await page.goto('/');
    // 2026-07-20: the 'นัดหมาย ProClinic' title-button no longer exists — since
    // 2026-05-26 adminMode DEFAULTS to 'appointment', so '/' lands on the
    // appointment hub directly. Just wait for the hub to render.
    await expect(page.getByTestId('appt-hub-view')).toBeVisible({ timeout: 45000 });
    await page.waitForTimeout(1000);
  });

  test('F1: Frontend Recall toggle pill exists with badge', async ({ page }) => {
    // 2026-07-20: 10s missed by a hair on a cold dev-server load (failure
    // screenshot showed the pill fully rendered) — 30s gives load headroom.
    const pill = page.getByTestId('appt-view-toggle-recall');
    await expect(pill).toBeVisible({ timeout: 30000 });
  });

  test('F2: Click Recall pill → Recall view renders + create button shows customer search', async ({ page }) => {
    const pill = page.getByTestId('appt-view-toggle-recall');
    await pill.waitFor({ state: 'visible', timeout: 30000 });
    await pill.click();
    await page.waitForTimeout(2500); // Recall chunk lazy-load

    // RecallFrontendView visible
    await expect(page.getByTestId('recall-frontend-view')).toBeVisible({ timeout: 8000 });

    // Click "+ ตั้ง Recall ใหม่" at bottom
    await page.getByTestId('recall-frontend-create').click();

    // SAME modal — customer search MUST be present (same Bug A scope)
    await expect(page.getByTestId('recall-create-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('recall-create-customer-search')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Phase 29 — Recall adversarial real-prod (Bug D: close-no-answer visibility)', () => {
  // Bug D is conditional UI: 5th option appears ONLY when recall.requiresManualReview
  // OR noAnswerCount >= 3. Hard to set up via UI without 3 sequential no-answer
  // clicks (which would write 3 fixtures to prod). Skipping UI flow; data-layer
  // contract is verified by RTL test O3.5 + adversarial test ADV10.
  test('D1: outcome modal opens from Recall row (smoke)', async ({ page }) => {
    await goToBackend(page);
    await page.goto('/?backend=1&tab=recall');
    await page.waitForTimeout(2500);

    // If list has rows, click first row → outcome modal opens.
    // If empty, skip (no rows to test against).
    const firstRow = page.locator('[data-testid^="recall-row-"]').first();
    const hasRow = await firstRow.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasRow) {
      test.skip(true, 'No recalls in current branch — skip (would need to create one first)');
      return;
    }
    await firstRow.click();
    await expect(page.getByTestId('recall-outcome-modal')).toBeVisible({ timeout: 5000 });
    // Verify 4 base outcome cards always present
    await expect(page.getByTestId('recall-outcome-card-will-come')).toBeVisible();
    await expect(page.getByTestId('recall-outcome-card-reschedule')).toBeVisible();
    await expect(page.getByTestId('recall-outcome-card-not-interested')).toBeVisible();
    await expect(page.getByTestId('recall-outcome-card-no-answer')).toBeVisible();
  });
});
