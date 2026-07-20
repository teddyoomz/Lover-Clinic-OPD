// LINE Friend Picker (2026-07-20) — Rule Q L1 real browser + real prod Firestore.
//
// The REAL-TIME acceptance criterion, driven end-to-end: with the picker modal
// OPEN, an admin-SDK seed of a TEST chat conversation (ทักปุ๊ป) appears in the
// list WITHOUT any reload — the chat_conversations listener leg (readable by
// staff under the CURRENT deployed rules, so this runs pre-deploy). The
// be_line_friends listener leg (แอดปุ๊ป) is gated on the rules deploy —
// E2E_LF_RULES_LIVE=1 enables it post-deploy (its realtime delivery is already
// L2-proven at the admin layer + client-permission proven by --full L2).
//
// Then: pick the row → the infra-health lineTargets inputs fill (userId +
// label from displayName). Screenshots for Q-vis.
import { test, expect } from '@playwright/test';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(path.resolve(__dirname, '../../.env.local.prod'), 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5'; // ทดลอง 1
const TS = Date.now();
const CHAT_U = `TEST-U-LFPICK-CHAT-${TS}`;
const FRIEND_U = `TEST-U-LFPICK-FRIEND-${TS}`;
const RULES_LIVE = process.env.E2E_LF_RULES_LIVE === '1';

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
      }),
    });
  }
  return getFirestore();
}

async function getFirebaseTokens() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${data.error?.message || 'Unknown'}`);
  return data;
}

async function injectAuthAndBranch(page, tokens) {
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
  await page.addInitScript(
    ({ authKey, authValue, branchKey, branchValue, legacyKey, menuKey }) => {
      try {
        if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
          indexedDB.databases().then((dbs) => {
            for (const d of dbs) {
              if (d.name && d.name.startsWith('firestore/')) indexedDB.deleteDatabase(d.name);
            }
          }).catch(() => {});
        }
      } catch {}
      localStorage.setItem(authKey, authValue);
      localStorage.setItem(branchKey, branchValue);
      localStorage.setItem(legacyKey, branchValue);
      localStorage.setItem(menuKey, 'classic');
    },
    {
      authKey, authValue,
      branchKey: `selectedBranchId:${tokens.localId}`,
      branchValue: TEST_BRANCH_ID,
      legacyKey: 'selectedBranchId',
      menuKey: 'lover.backendMenuMode',
    },
  );
}

let tokens;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  tokens = await getFirebaseTokens();
});

test.afterAll(async () => {
  const db = getDb();
  for (const p of [
    `${BASE}/chat_conversations/line_${CHAT_U}`,
    `${BASE}/be_line_friends/${TEST_BRANCH_ID}_${FRIEND_U}`,
  ]) await db.doc(p).delete().catch(() => {});
});

test.describe('LINE Friend Picker — Rule Q L1 real browser', () => {
  test('L1 — open picker in การ์ดสุขภาพระบบ → live row appears mid-open → pick fills the target row', async ({ page }) => {
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await injectAuthAndBranch(page, tokens);
    await page.goto('/?backend=1&tab=system-settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // การ์ดสุขภาพระบบ → ALWAYS add a FRESH lineTargets row (row 0 may carry the
    // user's REAL config — first run found "OoMz/เจ้าของ @นครราชสีมา" already
    // there; a fresh row also proves the empty-label auto-fill). Draft only —
    // the spec never clicks บันทึก, so nothing persists.
    const addBtn = page.getByTestId('infra-add-line-target');
    await addBtn.scrollIntoViewIfNeeded();
    await expect(addBtn).toBeVisible({ timeout: 30000 });
    const rowIdx = await page.locator('div[data-testid^="infra-line-target-"]').count();
    await addBtn.click();
    const targetRowId = `infra-line-target-${rowIdx}`;
    await expect(page.getByTestId(targetRowId)).toBeVisible({ timeout: 8000 });

    // Open the picker for the fresh row + force the modal's branch dropdown to
    // ทดลอง 1 (deterministic + exercises the live branch-switch resubscribe)
    await page.getByTestId(`infra-line-target-pick-${rowIdx}`).click();
    await expect(page.getByTestId('line-friend-picker-modal')).toBeVisible({ timeout: 8000 });
    await page.getByTestId('lf-branch-select').selectOption(TEST_BRANCH_ID);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/lf-picker-open.png', fullPage: false });

    // ── REAL-TIME (ทักปุ๊ป): seed a TEST chat conversation WHILE the modal is
    //    open → the row must appear with NO reload (chat listener leg)
    await getDb().doc(`${BASE}/chat_conversations/line_${CHAT_U}`).set({
      platform: 'line',
      displayName: 'TEST ลูกค้าทักสด',
      pictureUrl: '',
      lastMessage: 'สวัสดีค่ะ',
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
      branchId: TEST_BRANCH_ID,
      branchIdSource: 'webhook-line',
      createdAt: new Date().toISOString(),
      isTestFixture: true,
    });
    const liveRow = page.getByTestId(`lf-row-${CHAT_U}`);
    await expect(liveRow, 'ทักปุ๊ป → โผล่ในลิสต์ทันที ไม่ต้อง refresh').toBeVisible({ timeout: 10000 });
    expect(await liveRow.textContent()).toContain('TEST ลูกค้าทักสด');
    expect(await liveRow.textContent()).toContain('เคยทัก');
    await page.screenshot({ path: 'test-results/lf-picker-live-row.png', fullPage: false });

    // ── REAL-TIME (แอดปุ๊ป — be_line_friends leg): post-rules-deploy only ──
    if (RULES_LIVE) {
      await getDb().doc(`${BASE}/be_line_friends/${TEST_BRANCH_ID}_${FRIEND_U}`).set({
        lineUserId: FRIEND_U,
        displayName: 'TEST เพื่อนแอดสด',
        pictureUrl: '',
        branchId: TEST_BRANCH_ID,
        branchIdSource: 'webhook-line',
        source: 'follow',
        followedAt: new Date().toISOString(),
        unfollowedAt: null,
        updatedAt: new Date().toISOString(),
      });
      const friendRow = page.getByTestId(`lf-row-${FRIEND_U}`);
      await expect(friendRow, 'แอดปุ๊ป → โผล่ในลิสต์ทันที').toBeVisible({ timeout: 10000 });
      expect(await friendRow.textContent()).toContain('เพื่อนใหม่');
      await page.screenshot({ path: 'test-results/lf-picker-friend-live.png', fullPage: false });
    }

    // ── search narrows the list ────────────────────────────────────────────
    await page.getByTestId('lf-search').fill('ทักสด');
    await expect(page.getByTestId(`lf-row-${CHAT_U}`)).toBeVisible({ timeout: 4000 });

    // ── pick → the FRESH lineTargets row fills (userId + label from name) ──
    await page.getByTestId(`lf-pick-${CHAT_U}`).click();
    await expect(page.getByTestId('line-friend-picker-modal')).toHaveCount(0, { timeout: 4000 });
    const targetRow = page.getByTestId(targetRowId);
    const userIdInput = targetRow.locator('input').nth(0);
    const labelInput = targetRow.locator('input').nth(1);
    await expect(userIdInput).toHaveValue(CHAT_U);
    await expect(labelInput).toHaveValue('TEST ลูกค้าทักสด');
    await page.screenshot({ path: 'test-results/lf-picker-filled.png', fullPage: false });

    // NOTE: intentionally NOT clicking save — the config write path is the
    // pre-existing audited save rail (AV211 bank); this spec proves the
    // picker → fill contract. No TEST data persists in system_config.
  });
});
