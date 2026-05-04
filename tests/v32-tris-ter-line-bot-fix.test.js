// V32-tris-ter-fix (2026-04-26) — production-test bug fixes
//
// User report after V15 deploy of 68936bb:
//   1. "ทดสอบการเชื่อมต่อ" → Failed to fetch (browser CORS block on LINE API)
//   2. "พิมพ์ token ที่เพิ่งสร้าง... ขึ้นข้อความตอบกลับมาว่า ไม่พบรหัสผูก
//      บัญชีนี้ในระบบ" (every freshly-minted LINK-token rejected as invalid)
//
// Root cause for both: server-side ops (browser fetch + webhook REST) were
// blocked by CORS / firestore.rules. Fix: route through admin-gated proxy
// + switch webhook to firebase-admin SDK for be_* paths.
//
// Adversarial guards lock the fix shape so the bugs can't recur.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const WEBHOOK_SRC = readFileSync('api/webhook/line.js', 'utf8');
const ADMIN_TEST_SRC = readFileSync('api/admin/line-test.js', 'utf8');
const CLIENT_SRC = readFileSync('src/lib/lineTestClient.js', 'utf8');
const TAB_SRC = readFileSync('src/components/backend/LineSettingsTab.jsx', 'utf8');

// ─── F1 — Webhook switched to firebase-admin SDK for be_* ops ──────────
describe('F1 webhook uses firebase-admin SDK (not unauth REST) for be_* paths', () => {
  test('F1.1 imports firebase-admin/app + firebase-admin/firestore', () => {
    expect(WEBHOOK_SRC).toMatch(/from\s+['"]firebase-admin\/app['"]/);
    expect(WEBHOOK_SRC).toMatch(/from\s+['"]firebase-admin\/firestore['"]/);
    expect(WEBHOOK_SRC).toMatch(/initializeApp/);
    expect(WEBHOOK_SRC).toMatch(/getFirestore/);
  });

  test('F1.2 declares getAdminFirestore() helper with cache + env-var fallback', () => {
    expect(WEBHOOK_SRC).toMatch(/function getAdminFirestore/);
    expect(WEBHOOK_SRC).toMatch(/cachedAdminDb/);
    expect(WEBHOOK_SRC).toMatch(/FIREBASE_ADMIN_CLIENT_EMAIL/);
    expect(WEBHOOK_SRC).toMatch(/FIREBASE_ADMIN_PRIVATE_KEY/);
  });

  test('F1.3 reuses existing admin app via getApps() check (no double-init)', () => {
    expect(WEBHOOK_SRC).toMatch(/if \(getApps\(\)\.length > 0\)\s*\{[\s\S]{0,80}getApp\(\)/);
  });

  // V33.9 — F1.4-F1.8 (consumeLinkToken assertions) REMOVED. Function deleted
  // along with the pre-V33.4 QR-token consumption flow. The admin-SDK-only-
  // for-be_* contract is still preserved by F1.9 + F1.10 below.
  test('F1.4 V33.9: consumeLinkToken function REMOVED from webhook', () => {
    expect(WEBHOOK_SRC).not.toMatch(/^async function consumeLinkToken/m);
  });

  test('F1.9 findCustomerByLineUserId uses admin SDK collection().where()', () => {
    const fn = WEBHOOK_SRC.match(/async function findCustomerByLineUserId[\s\S]*?^\}/m)?.[0] || '';
    expect(fn).toMatch(/getAdminFirestore/);
    expect(fn).toMatch(/\.collection\([^)]*be_customers/);
    expect(fn).toMatch(/\.where\(['"]lineUserId['"]/);
    expect(fn).toMatch(/\.limit\(1\)/);
    expect(fn).not.toMatch(/runQuery/);
  });

  test('F1.10 findUpcomingAppointmentsForCustomer uses admin SDK collection().where()', () => {
    const fn = WEBHOOK_SRC.match(/async function findUpcomingAppointmentsForCustomer[\s\S]*?^\}/m)?.[0] || '';
    expect(fn).toMatch(/getAdminFirestore/);
    expect(fn).toMatch(/\.collection\([^)]*be_appointments/);
    expect(fn).toMatch(/\.where\(['"]customerId['"]/);
    expect(fn).not.toMatch(/runQuery/);
  });

  test('F1.11 dead REST helpers removed (runQuery, unwrapDoc, unwrapValue, firestoreDelete)', () => {
    // These were used only by the be_* paths now on admin SDK. Removing
    // them prevents future regressions where someone re-introduces
    // unauth REST for rule-blocked paths.
    expect(WEBHOOK_SRC).not.toMatch(/^async function runQuery/m);
    expect(WEBHOOK_SRC).not.toMatch(/^function unwrapDoc/m);
    expect(WEBHOOK_SRC).not.toMatch(/^function unwrapValue/m);
    expect(WEBHOOK_SRC).not.toMatch(/^async function firestoreDelete/m);
  });

  test('F1.12 firestoreGet retained (used for chat_conversations existence check — public-read rule)', () => {
    // chat_config is read by getChatConfig (REST) which DOES go through
    // firestoreGet alternative. chat_conversations existence check uses
    // firestoreGet — the rule allows webhook unauth read.
    expect(WEBHOOK_SRC).toMatch(/async function firestoreGet/);
    // Used for convPath (chat_conversations) only — NOT for be_*.
    const usages = WEBHOOK_SRC.match(/firestoreGet\(([^)]+)\)/g) || [];
    for (const u of usages) {
      // None of the surviving usages target be_* paths.
      expect(u).not.toMatch(/be_customer/);
      expect(u).not.toMatch(/be_appointments/);
    }
  });

  test('F1.13 V32-tris-ter-fix marker comment present (institutional memory)', () => {
    expect(WEBHOOK_SRC).toMatch(/V32-tris-ter-fix/);
  });
});

// ─── F2 — admin/line-test.js endpoint shape ─────────────────────────────
describe('F2 admin/line-test.js LINE bot/info proxy', () => {
  test('F2.1 verifyAdminToken gate present', () => {
    expect(ADMIN_TEST_SRC).toMatch(/import\s+\{\s*verifyAdminToken\s*\}\s+from/);
    expect(ADMIN_TEST_SRC).toMatch(/await verifyAdminToken\(req,\s*res\)/);
  });

  test('F2.2 imports firebase-admin Firestore (reads chat_config server-side)', () => {
    expect(ADMIN_TEST_SRC).toMatch(/from\s+['"]firebase-admin\/app['"]/);
    expect(ADMIN_TEST_SRC).toMatch(/from\s+['"]firebase-admin\/firestore['"]/);
  });

  test('F2.3 reads token from clinic_settings/chat_config.line.channelAccessToken', () => {
    expect(ADMIN_TEST_SRC).toMatch(/clinic_settings\/chat_config/);
    expect(ADMIN_TEST_SRC).toMatch(/channelAccessToken/);
  });

  test('F2.4 calls api.line.me/v2/bot/info with Bearer token', () => {
    expect(ADMIN_TEST_SRC).toMatch(/api\.line\.me\/v2\/bot\/info/);
    expect(ADMIN_TEST_SRC).toMatch(/Bearer \$\{token\}/);
  });

  test('F2.5 returns 503 + code:CONFIG_MISSING when token absent', () => {
    expect(ADMIN_TEST_SRC).toMatch(/code:\s*['"]CONFIG_MISSING['"]/);
    expect(ADMIN_TEST_SRC).toMatch(/status\(503\)/);
  });

  test('F2.6 returns 503 + code:TOKEN_INVALID on LINE 401/403', () => {
    expect(ADMIN_TEST_SRC).toMatch(/lineRes\.status === 401\s*\|\|\s*lineRes\.status === 403/);
    expect(ADMIN_TEST_SRC).toMatch(/code:\s*['"]TOKEN_INVALID['"]/);
  });

  test('F2.7 returns 200 with displayName + basicId on success', () => {
    expect(ADMIN_TEST_SRC).toMatch(/ok:\s*true/);
    expect(ADMIN_TEST_SRC).toMatch(/displayName:/);
    expect(ADMIN_TEST_SRC).toMatch(/basicId:/);
  });

  test('F2.8 validates action === "test"', () => {
    expect(ADMIN_TEST_SRC).toMatch(/action\s*!==\s*['"]test['"]/);
  });

  test('F2.9 method gate: POST only (with OPTIONS preflight)', () => {
    expect(ADMIN_TEST_SRC).toMatch(/req\.method === ['"]OPTIONS['"]/);
    expect(ADMIN_TEST_SRC).toMatch(/req\.method !== ['"]POST['"]/);
  });

  test('F2.10 CORS headers set (admin-domain calls)', () => {
    expect(ADMIN_TEST_SRC).toMatch(/Access-Control-Allow-Origin/);
    expect(ADMIN_TEST_SRC).toMatch(/Access-Control-Allow-Headers.*Authorization/);
  });
});

// ─── F3 — lineTestClient.js ────────────────────────────────────────────
describe('F3 lineTestClient', () => {
  test('F3.1 ENDPOINT points to /api/admin/line-test', () => {
    expect(CLIENT_SRC).toMatch(/['"]\/api\/admin\/line-test['"]/);
  });

  test('F3.2 getIdToken via Firebase auth.currentUser', () => {
    expect(CLIENT_SRC).toMatch(/auth\?\.currentUser/);
    expect(CLIENT_SRC).toMatch(/u\.getIdToken/);
  });

  test('F3.3 testLineConnection returns { ok, message, code? } shape', () => {
    expect(CLIENT_SRC).toMatch(/return \{\s*ok:\s*true,\s*message:/);
    expect(CLIENT_SRC).toMatch(/return \{\s*ok:\s*false,\s*message[\s\S]{0,80}code/);
  });

  test('F3.4 sends Bearer token + JSON body { action: "test" }', () => {
    expect(CLIENT_SRC).toMatch(/Authorization.*Bearer/);
    expect(CLIENT_SRC).toMatch(/action:\s*['"]test['"]/);
  });
});

// ─── F4 — LineSettingsTab uses backend proxy (not direct LINE fetch) ───
describe('F4 LineSettingsTab proxy wiring', () => {
  test('F4.1 imports testLineConnection from lineTestClient', () => {
    expect(TAB_SRC).toMatch(/import\s+\{\s*testLineConnection\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/lineTestClient\.js['"]/);
  });

  test('F4.2 handleTestConnection calls testLineConnection() proxy', () => {
    const fn = TAB_SRC.match(/const handleTestConnection[\s\S]*?^\s*\};/m)?.[0] || '';
    // Phase BS V3 (2026-05-04) — testLineConnection now takes {branchId}.
    expect(fn).toMatch(/await testLineConnection\(\s*\{\s*branchId\s*\}\s*\)/);
  });

  test('F4.3 NO direct browser fetch to api.line.me (CORS would fail)', () => {
    const fn = TAB_SRC.match(/const handleTestConnection[\s\S]*?^\s*\};/m)?.[0] || '';
    expect(fn).not.toMatch(/fetch\(['"]https:\/\/api\.line\.me/);
  });

  test('F4.4 unsaved-state hint shown before proxy call (UX clarity)', () => {
    expect(TAB_SRC).toMatch(/บันทึกก่อนทดสอบ|กดบันทึก/);
  });
});

// ─── F5 — full-flow simulators (Rule I) ────────────────────────────────
describe('F5 logical correctness (no live network)', () => {
  test('F5.1 webhook bot flow: maybeEmitBotReply ordering — text only, helper-bypass for non-text', () => {
    const fn = WEBHOOK_SRC.match(/async function maybeEmitBotReply[\s\S]*?^\}/m)?.[0] || '';
    // type !== 'text' → returns false early (no LINE push waste)
    expect(fn).toMatch(/event\.message\?\.type\s*!==?\s*['"]text['"]/);
    // Help fallback gated on length >= 2 (anti-spam from emoji-only)
    expect(fn).toMatch(/text\.trim\(\)\.length\s*>=?\s*2/);
  });

  // V33.9 — F5.2 + F5.4 (consumeLinkToken inspection) REMOVED. Function
  // deleted. Customer-doc-write anti-clobber contract is preserved by
  // V32-tris-quater link-requests approval flow which uses .update() too;
  // tested in v32-tris-quater-id-link-request.test.jsx.

  test('F5.3 try/catch swallow ensures bot errors never break the webhook', () => {
    expect(WEBHOOK_SRC).toMatch(/try\s*\{[\s\S]{0,200}maybeEmitBotReply[\s\S]{0,200}\}\s*catch/);
    expect(WEBHOOK_SRC).toMatch(/console\.warn.*\[line-webhook\] bot reply failed/);
  });

  test('F5.5 admin endpoint Firestore path resolves via lineConfigAdmin helper', () => {
    // Phase BS V3 (2026-05-04) — line-test endpoint no longer reads
    // clinic_settings/chat_config directly. It delegates to
    // resolveLineConfigForAdmin which checks be_line_configs/{branchId}
    // first then falls back to the legacy chat_config path.
    expect(ADMIN_TEST_SRC).toMatch(/resolveLineConfigForAdmin/);
    expect(ADMIN_TEST_SRC).toMatch(/from\s+['"]\.\/_lib\/lineConfigAdmin\.js['"]/);
    // The legacy path itself still lives in lineConfigAdmin (transition
    // fallback); confirm the helper still references it as a safety net.
    const HELPER_SRC = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'api/admin/_lib/lineConfigAdmin.js'),
      'utf8'
    );
    expect(HELPER_SRC).toMatch(/clinic_settings\/chat_config/);
  });
});
