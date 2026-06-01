// Rule Q L1 — real-browser e2e of the ScheduledTasksTab user-flow against the
// dev server (which talks to REAL prod Firebase). Proves: render → toggle →
// safety-critical confirm → param tune → Save (real prod write via client SDK) →
// reload shows it PERSISTED (real round-trip) → restore → run-now wiring fires.
//
// Self-auths (the shared goToBackend helper waits for stale "ระบบหลังบ้าน" text).
// After each navigation it dismisses the backend nav "bloom" overlay, which opens
// over the content and intercepts pointer events. The runner deletes
// system_config.scheduledTasks afterwards to restore the pristine (absent) state.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TOKEN_CACHE = path.join(import.meta.dirname, '../../.auth/tokens.json');

async function getTokens() {
  try { const c = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8')); if (c.expiresAt > Date.now()) return c; } catch {}
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const d = await res.json();
  if (!d.idToken) throw new Error('auth failed: ' + (d.error?.message || '?'));
  const t = { ...d, expiresAt: Date.now() + 50 * 60 * 1000 };
  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(t));
  return t;
}

const TASK_IDS = [
  'lineReminderFire', 'lineReminderRetry', 'wholeSystemBackup', 'chatHistoryRetention',
  'staffChatRetention', 'stockMovementRetention', 'stockLotCleanup', 'patientLinkCleanup',
  'chartEditSessionSweep', 'opdSessionCleanup',
];

async function injectAuth(page) {
  const t = await getTokens();
  const authValue = JSON.stringify({
    uid: t.localId, email: t.email, emailVerified: false, isAnonymous: false,
    providerData: [{ providerId: 'password', uid: t.email, email: t.email }],
    stsTokenManager: { refreshToken: t.refreshToken, accessToken: t.idToken, expirationTime: Date.now() + 3600000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey: KEY, appName: '[DEFAULT]',
  });
  await page.addInitScript(({ k, v }) => localStorage.setItem(k, v), { k: `firebase:authUser:${KEY}:[DEFAULT]`, v: authValue });
}

// Navigate to the tab + dismiss the backend nav "bloom" overlay (it intercepts clicks).
async function gotoTab(page) {
  await page.goto('/?backend=1&tab=scheduled-tasks');
  await page.waitForSelector('[data-testid="scheduled-tasks-tab"]', { timeout: 25000 });
  // dismiss the nav overlay if open (up to a few tries — Escape closes it)
  for (let i = 0; i < 4; i++) {
    const open = await page.locator('[data-testid="bloom-overlay"][data-open="true"]').count();
    if (!open) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => {
    const o = document.querySelector('[data-testid="bloom-overlay"]');
    return !o || o.getAttribute('data-open') !== 'true';
  }, { timeout: 6000 }).catch(() => {});
}

test('Scheduled Tasks tab — full user flow (render/toggle/confirm/param/save/persist/restore/run-now)', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('dialog', (d) => d.accept()); // safety-critical-disable + destructive run-now confirms

  await injectAuth(page);
  await gotoTab(page);

  // 1) all 10 tasks render + read-only schedule + source badges
  for (const id of TASK_IDS) await expect(page.getByTestId(`task-${id}`)).toBeVisible();
  await expect(page.getByText('อ่านอย่างเดียว').first()).toBeVisible();

  // 2) toggle a NON-critical task off (no confirm)
  const staff = page.getByTestId('toggle-staffChatRetention');
  await expect(staff).toHaveAttribute('aria-checked', 'true');
  await staff.click();
  await expect(staff).toHaveAttribute('aria-checked', 'false');

  // 3) toggle a SAFETY-CRITICAL task off (confirm auto-accepted)
  const chat = page.getByTestId('toggle-chatHistoryRetention');
  await chat.click();
  await expect(chat).toHaveAttribute('aria-checked', 'false');

  // 4) tune a param (24 → 48)
  const param = page.getByTestId('param-chatHistoryRetention-retentionHours');
  await param.fill('48');
  await expect(param).toHaveValue('48');

  // 5) Save → success (writes REAL prod system_config.scheduledTasks via client SDK)
  await page.getByRole('button', { name: /^บันทึก/ }).click();
  await expect(page.getByText('บันทึกการตั้งค่าเรียบร้อย')).toBeVisible({ timeout: 20000 });

  // 6) reload → the saved config PERSISTED (real prod round-trip)
  await gotoTab(page);
  await expect(page.getByTestId('toggle-staffChatRetention')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('toggle-chatHistoryRetention')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('param-chatHistoryRetention-retentionHours')).toHaveValue('48');

  // 7) restore via the UI + save
  await page.getByTestId('toggle-staffChatRetention').click();
  await page.getByTestId('toggle-chatHistoryRetention').click(); // enabling → no confirm
  await page.getByTestId('param-chatHistoryRetention-retentionHours').fill('24');
  await page.getByRole('button', { name: /^บันทึก/ }).click();
  await expect(page.getByText('บันทึกการตั้งค่าเรียบร้อย')).toBeVisible({ timeout: 20000 });

  // 8) reload → restored
  await gotoTab(page);
  await expect(page.getByTestId('toggle-staffChatRetention')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('toggle-chatHistoryRetention')).toHaveAttribute('aria-checked', 'true');

  // 9) run-now wiring fires (vite dev doesn't serve /api → graceful banner; the real
  //    dispatch is unit-tested + verified on the live endpoint post-deploy)
  await page.getByTestId('run-stockLotCleanup').click();
  // run-now banner is uniquely "...ไม่สำเร็จ: <err>" (vite 404) or "...ดูผลที่สถานะ" (success)
  await expect(page.getByText(/ไม่สำเร็จ: |ดูผลที่สถานะ/)).toBeVisible({ timeout: 15000 });
});
