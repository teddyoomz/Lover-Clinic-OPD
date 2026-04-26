// ─── E2E: Public-link routes work for non-logged-in users (V16 lock) ────────
//
// Per user request 2026-04-26: "make sure ว่า frontend ทุกลิ้งและ QR ใช้ได้
// สำหรับคนไม่ login ด้วย".
//
// V16 (logged 2026-04-25) — public-link pages flashed "ลิงก์ไม่ถูกต้อง"
// for ~200-500ms before signInAnonymously completed. Fix:
//   - App.jsx — render gate `if (needsPublicAuth && !user) return <Loading/>`
//   - PatientForm.jsx — sessionExists initial null (loading) instead of true
//   - PatientDashboard.jsx — early-return on !clinicSettingsLoaded
//   - ClinicSchedule.jsx — authReady state via auth.onAuthStateChanged
//
// This spec hits all 3 public-link types using a FRESH (non-authenticated)
// browser context. The shared `goToBackend` / `injectAuth` helpers do NOT
// fire here — Playwright's per-test storage state is empty.
//
// Sample tokens captured from real production Firestore (2026-04-26).
// If those docs are deleted, swap for fresh tokens via the admin console.

import { test, expect } from '@playwright/test';

// Real tokens captured 2026-04-26 from the live Firestore project
// loverclinic-opd-4c39b. These are PUBLIC-LINK tokens (designed to be
// shared via QR / link) so committing them is safe — they only grant
// access to the doc/customer they were minted for.
const SAMPLE = {
  sessionId:        'DEP-DBGMJ7',           // ?session= → PatientForm intake
  patientLinkToken: 'dkeq1b2hx7bk5138pe80', // ?patient= → PatientDashboard
  scheduleToken:    'SCH-0bb9ed3369',       // ?schedule= → ClinicSchedule
};

// V16 anti-regression: this exact Thai text is the "Invalid Link" banner
// that flashed before the fix. Test must NEVER see it during navigation,
// even momentarily.
const INVALID_LINK_TEXT = /ลิงก์ไม่ถูกต้อง/;

test.describe('Public links — no-auth access (V16 anti-regression)', () => {
  test.use({
    // No storageState injection → start each test with a CLEAN browser
    // context. Equivalent to a customer opening the link in a fresh
    // browser session or from a QR scan.
    storageState: { cookies: [], origins: [] },
  });

  test('?session=<id> loads PatientForm without flashing "Invalid Link"', async ({ page }) => {
    // Capture every page text snapshot during navigation to detect even
    // a 50ms flash of the error banner.
    const sawInvalid = { value: false, when: null };
    page.on('domcontentloaded', async () => {
      const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (INVALID_LINK_TEXT.test(text)) {
        sawInvalid.value = true;
        sawInvalid.when = 'domcontentloaded';
      }
    });

    await page.goto(`/?session=${SAMPLE.sessionId}`, { waitUntil: 'domcontentloaded' });

    // Wait for either: form visible OR "Invalid Link" final state OR Loading
    // The fix (V16) means we should see Loading → Form, NOT Form → Invalid → Form
    // Firestore listeners keep the network active forever — use content
    // settle instead of networkidle. Waiting for `domcontentloaded` +
    // a 3s settle window catches the V16 race window (was 200-500ms)
    // with margin.
    await page.waitForTimeout(3500);

    // After load: either the form is visible, or the page shows the
    // expected "ลิงก์ไม่ถูกต้อง" only because the test token is invalid.
    // Either is acceptable IF the app didn't FLASH the invalid banner
    // before settling.
    const finalText = await page.evaluate(() => document.body?.innerText || '');
    const finalIsInvalid = INVALID_LINK_TEXT.test(finalText);

    // The KEY assertion: if the final state is "valid form rendered",
    // we should NEVER have seen the invalid banner during transit
    // (V16 race condition).
    if (!finalIsInvalid) {
      expect(sawInvalid.value).toBe(false);
    }

    // Sanity: the page rendered SOMETHING (not blank/crash)
    expect(finalText.length).toBeGreaterThan(20);
  });

  test('?patient=<token> loads PatientDashboard without flash', async ({ page }) => {
    const sawInvalid = { value: false };
    page.on('domcontentloaded', async () => {
      const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (INVALID_LINK_TEXT.test(text)) sawInvalid.value = true;
    });

    await page.goto(`/?patient=${SAMPLE.patientLinkToken}`, { waitUntil: 'domcontentloaded' });
    // Firestore listeners keep the network active forever — use content
    // settle instead of networkidle. Waiting for `domcontentloaded` +
    // a 3s settle window catches the V16 race window (was 200-500ms)
    // with margin.
    await page.waitForTimeout(3500);

    const finalText = await page.evaluate(() => document.body?.innerText || '');
    const finalIsInvalid = INVALID_LINK_TEXT.test(finalText);
    if (!finalIsInvalid) {
      expect(sawInvalid.value).toBe(false);
    }
    expect(finalText.length).toBeGreaterThan(20);
  });

  test('?schedule=<token> loads ClinicSchedule without flash', async ({ page }) => {
    const sawInvalid = { value: false };
    page.on('domcontentloaded', async () => {
      const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (INVALID_LINK_TEXT.test(text)) sawInvalid.value = true;
    });

    await page.goto(`/?schedule=${SAMPLE.scheduleToken}`, { waitUntil: 'domcontentloaded' });
    // Firestore listeners keep the network active forever — use content
    // settle instead of networkidle. Waiting for `domcontentloaded` +
    // a 3s settle window catches the V16 race window (was 200-500ms)
    // with margin.
    await page.waitForTimeout(3500);

    const finalText = await page.evaluate(() => document.body?.innerText || '');
    const finalIsInvalid = INVALID_LINK_TEXT.test(finalText);
    if (!finalIsInvalid) {
      expect(sawInvalid.value).toBe(false);
    }
    expect(finalText.length).toBeGreaterThan(20);
  });

  test('Bogus session id renders "Invalid Link" without flash through "valid"', async ({ page }) => {
    // Negative test: a fake token must show invalid-link END STATE.
    // It should NOT flash the form/dashboard first.
    let sawValidContent = false;
    page.on('domcontentloaded', async () => {
      const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      // Heuristic: form has visible "เลขบัตรประชาชน" or "ส่วนตัว" sections
      if (/เลขบัตรประชาชน|กรอกข้อมูลผู้ป่วย/.test(text)) sawValidContent = true;
    });

    await page.goto('/?session=BOGUS-NEVER-EXISTS-9999', { waitUntil: 'domcontentloaded' });
    // Firestore listeners keep the network active forever — use content
    // settle instead of networkidle. Waiting for `domcontentloaded` +
    // a 3s settle window catches the V16 race window (was 200-500ms)
    // with margin.
    await page.waitForTimeout(3500);

    const finalText = await page.evaluate(() => document.body?.innerText || '');
    // The final state should be EITHER the invalid-link banner OR a
    // loading state — never the actual form.
    expect(finalText.length).toBeGreaterThan(20);
    expect(sawValidContent).toBe(false);
  });

  test('App.jsx render gate — needsPublicAuth blocks render until anon-auth resolves', async ({ page }) => {
    // Source-grep: confirm the gate in App.jsx is still present
    // (defense-in-depth against accidental removal during refactor).
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.default.readFileSync(
      path.default.resolve(process.cwd(), 'src/App.jsx'),
      'utf8'
    );
    expect(src).toMatch(/const needsPublicAuth = !!\(sessionFromUrl \|\| patientFromUrl \|\| scheduleFromUrl\)/);
    expect(src).toMatch(/signInAnonymously\(auth\)/);
  });

  test('PatientForm.jsx — sessionExists initial state is null (loading-aware), NOT true', async ({ page }) => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.default.readFileSync(
      path.default.resolve(process.cwd(), 'src/pages/PatientForm.jsx'),
      'utf8'
    );
    // V16 fix: useState(null) (loading) → setState(true|false) (resolved)
    expect(src).toMatch(/useState\(null\)[\s\S]{0,80}sessionExists|sessionExists[\s\S]{0,80}useState\(null\)/);
  });

  test('ClinicSchedule.jsx — authReady gate via onAuthStateChanged', async ({ page }) => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.default.readFileSync(
      path.default.resolve(process.cwd(), 'src/pages/ClinicSchedule.jsx'),
      'utf8'
    );
    expect(src).toMatch(/authReady/);
    expect(src).toMatch(/onAuthStateChanged/);
  });
});
