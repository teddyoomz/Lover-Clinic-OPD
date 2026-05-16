// tests/e2e/v76-chat-branch-isolation.spec.js
// V76 + V77 Rule Q L1 — real-browser Playwright verification that chat tab
// (both LIVE conversations + HISTORY view) filters per branch.
//
// Pre-conditions:
//   1. V76 + V77 frontend code merged to master (committed; needs deploy
//      OR dev server runs against master via `npm run dev`)
//   2. chat_history docs backfilled (3,281 → นครราชสีมา branchId) via
//      `node scripts/v76-backfill-chat-history-branchid.mjs --apply`
//      (audit: be_admin_audit/v76-chat-history-branch-backfill-1778932587641-d3a16bf4)
//
// Test matrix:
//   A. นครราชสีมา branch + history view → SHOULD show chats
//   B. ทดลอง 1 branch + history view → SHOULD show empty/zero history
//   C. พระราม 3 branch + history view → SHOULD show empty/zero history
//   D. Live chat list (non-history) — same per-branch filter applies
//   E. Branch switch round-trip — filter updates without F5
//   F. Empty-state CTA points to Backend tabs (V77a — NO ⚙ Settings button)

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TOKEN_CACHE = path.join(import.meta.dirname, '../../.auth/tokens.json');

// Branch IDs (from real prod diag — be_branches collection)
const NAKHON_BR = 'BR-1777873556815-26df6480';
const PRAM3_BR = 'BR-1777885958735-38afbdeb';
const TEST1_BR = 'BR-1778136097138-98199ef5';

async function getTokens() {
  try {
    const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
    if (cached.expiresAt > Date.now()) return cached;
  } catch {}
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message || 'Unknown'}`);
  const tokens = { ...data, expiresAt: Date.now() + 50 * 60 * 1000 };
  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tokens));
  return tokens;
}

async function injectAuth(page) {
  const tokens = await getTokens();
  const authKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  const authValue = JSON.stringify({
    uid: tokens.localId, email: tokens.email, emailVerified: false, isAnonymous: false,
    providerData: [{ providerId: 'password', uid: tokens.email, email: tokens.email }],
    stsTokenManager: { refreshToken: tokens.refreshToken, accessToken: tokens.idToken, expirationTime: Date.now() + 3600000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
    apiKey: FIREBASE_API_KEY, appName: '[DEFAULT]',
  });
  await page.addInitScript(({ key, value }) => { localStorage.setItem(key, value); }, { key: authKey, value: authValue });
}

/**
 * Select a branch via the BranchSelector dropdown on the top-right.
 * BranchSelector renders as native <select> by default.
 */
async function selectBranch(page, branchName) {
  // Find the branch <select> — has options containing nakhonratchasima/พระราม etc
  const select = page.locator('select').filter({ has: page.locator('option:has-text("นครราชสีมา")') }).first();
  await select.waitFor({ state: 'attached', timeout: 5000 });
  await select.selectOption({ label: branchName });
  // Wait for listener re-subscribe + Firestore round-trip
  await page.waitForTimeout(2500);
}

/** Navigate to frontend AdminDashboard + activate chat tab. */
async function goToFrontendChat(page) {
  await injectAuth(page);
  // AdminDashboard is the root path (no ?backend=1)
  await page.goto('/');
  // Wait for DOM (networkidle never settles — Firestore onSnapshot keeps
  // connection open).
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
  // AdminDashboard renders DESKTOP chat tab button (line 5812 — px-4 py-3
  // rounded-lg). The mobile grid version (line 5799 — py-2 rounded-xl) is
  // hidden at default 1280x720 viewport. Filter to VISIBLE.
  const chatBtnAll = page.locator('button:has-text("แชท")');
  // Wait for ANY chat-text button + pick first visible one
  await chatBtnAll.first().waitFor({ state: 'attached', timeout: 15000 });
  const count = await chatBtnAll.count();
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const btn = chatBtnAll.nth(i);
    if (await btn.isVisible()) {
      await btn.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) throw new Error('No visible chat button found');
  await page.waitForTimeout(3000);
}

/** Click the ⏰ history toggle in chat tab. */
async function toggleHistory(page) {
  // History button: lucide-react <History> icon, title="ประวัติแชท"
  const btn = page.locator('button[title="ประวัติแชท"]');
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(2000); // listener fire + filter apply
}

test.describe('V76+V77 — Chat tab branch isolation (real-browser Rule Q L1)', () => {
  test('A. นครราชสีมา branch — history view shows the backfilled 3,281 docs', async ({ page }) => {
    await goToFrontendChat(page);
    await selectBranch(page, 'นครราชสีมา');
    await toggleHistory(page);

    // History list should have items (backfilled to นครราชสีมา)
    // Wait up to 5s for listener to fire + render
    await expect.poll(
      async () => {
        const count = await page.locator('[data-testid^="chat-history-item-"], [class*="chat-history"]').count();
        // Fallback: count any rendered conv-list-item under history
        if (count > 0) return count;
        // Look for resolvedBy text (a stable history marker)
        return await page.locator('text=loverclinic@loverclinic.com').count();
      },
      { timeout: 15000 }
    ).toBeGreaterThan(0);
  });

  test('B. ทดลอง 1 branch — history view is EMPTY (no leak from นครราชสีมา)', async ({ page }) => {
    await goToFrontendChat(page);
    await selectBranch(page, 'ทดลอง 1');
    await toggleHistory(page);

    // After backfill, ทดลอง 1 should have NO chat_history docs
    // (no chats were ever created at ทดลอง 1, AND นครราชสีมา-stamped docs
    // are filtered out by client-side branchId check).
    await page.waitForTimeout(3000); // give listener time to fire
    const historyItems = await page.locator('text=ทักครั้งแรก').count();
    expect(historyItems).toBe(0);
  });

  test('C. พระราม 3 branch — history view is EMPTY (no leak)', async ({ page }) => {
    await goToFrontendChat(page);
    await selectBranch(page, 'พระราม 3');
    await toggleHistory(page);

    await page.waitForTimeout(3000);
    const historyItems = await page.locator('text=ทักครั้งแรก').count();
    expect(historyItems).toBe(0);
  });

  test('D. Live chat list filters per branch (non-history)', async ({ page }) => {
    await goToFrontendChat(page);
    // Live view by default (no history toggle)
    await selectBranch(page, 'ทดลอง 1');
    await page.waitForTimeout(2000);
    // Live chat_conversations is empty in prod (verified via diag)
    // So both branches should show empty / zero conversations
    const liveItems = await page.locator('[data-testid^="chat-conv-"], button:has-text("ทักครั้งแรก")').count();
    expect(liveItems).toBe(0);
  });

  test('E. Branch switch round-trip — chat list updates without F5', async ({ page }) => {
    await goToFrontendChat(page);
    await toggleHistory(page);

    // นครราชสีมา → ทดลอง 1 → นครราชสีมา
    await selectBranch(page, 'นครราชสีมา');
    await page.waitForTimeout(3000);
    const nakhonCount1 = await page.locator('text=loverclinic@loverclinic.com').count();
    expect(nakhonCount1).toBeGreaterThan(0);

    await selectBranch(page, 'ทดลอง 1');
    await page.waitForTimeout(3000);
    const test1Count = await page.locator('text=ทักครั้งแรก').count();
    expect(test1Count).toBe(0);

    await selectBranch(page, 'นครราชสีมา');
    await page.waitForTimeout(3000);
    const nakhonCount2 = await page.locator('text=loverclinic@loverclinic.com').count();
    expect(nakhonCount2).toBeGreaterThan(0);
  });

  test('F. V77a — empty-state CTA points to Backend (NO ⚙ Settings button in chat header)', async ({ page }) => {
    await goToFrontendChat(page);
    // The legacy ⚙ Settings button has been removed (V77a).
    // Check that the chat header has 🔔 + ⏰ icons but NOT the ⚙ Settings icon
    // (which used to open the legacy chat_config sub-view).
    // Heuristic: look for button with title="ตั้งค่าการเชื่อมต่อ" — should be ABSENT.
    const legacySettingsBtn = await page.locator('button[title="ตั้งค่าการเชื่อมต่อ"]').count();
    expect(legacySettingsBtn).toBe(0);

    // ⏰ history button should still exist
    const historyBtn = await page.locator('button[title="ประวัติแชท"]').count();
    expect(historyBtn).toBeGreaterThan(0);
  });

  test('G. V77a — empty-state directs to Backend tabs (per-branch admin)', async ({ page }) => {
    await goToFrontendChat(page);
    // Switch to a branch with NO live chat_conversations + NO history
    await selectBranch(page, 'ทดลอง 1');
    await page.waitForTimeout(3000);

    // Empty state CTA copy points admin to Backend tabs
    const emptyState = await page.locator('text=/หลังบ้าน|ตั้งค่า LINE OA|ตั้งค่า FB Page/').count();
    // At least the empty-state message points to Backend; the legacy "ตั้งค่าการเชื่อมต่อ"
    // CTA inline button is GONE per V77a.
    expect(emptyState).toBeGreaterThan(0);
  });
});
