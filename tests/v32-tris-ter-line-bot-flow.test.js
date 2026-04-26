// V32-tris-ter (2026-04-26) — LINE bot Q&A + customer linking flow
//
// User chain across session 11:
//   "ทำหน้า setting line ต่างหากมาใน backend ด้วยนะ ... รองรับทุกสถานการณ์"
//   "ทำแล้ว test มาทุกแบบเท่าที่จะแน่ใจว่า flow ถูก wiring ถูก logic ถูก"
//   "พยายามจั๊บบั๊คให้ได้ก่อนที่ผมจะจับได้ในฐานะ user จริง"
//
// Adversarial tests for the LINE bot Q&A + QR linking flow. Covers:
//   - lineBotResponder pure helpers (intent detection, formatters, token gen)
//   - api/admin/customer-link endpoint shape (admin gate, validation)
//   - api/webhook/line bot reply integration (LINK consumer, courses, appts)
//   - LineSettingsTab + LinkLineQrModal source-grep regression guards
//   - firestore.rules be_customer_link_tokens lockdown

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  interpretCustomerMessage,
  formatCoursesReply,
  formatAppointmentsReply,
  formatHelpReply,
  formatLinkSuccessReply,
  formatLinkFailureReply,
  formatNotLinkedReply,
  formatThaiDate,
  generateLinkToken,
} from '../src/lib/lineBotResponder.js';

const RESPONDER_SRC = readFileSync('src/lib/lineBotResponder.js', 'utf8');
const ADMIN_LINK_SRC = readFileSync('api/admin/customer-link.js', 'utf8');
const WEBHOOK_SRC = readFileSync('api/webhook/line.js', 'utf8');
const SETTINGS_SRC = readFileSync('src/components/backend/LineSettingsTab.jsx', 'utf8');
const QR_MODAL_SRC = readFileSync('src/components/backend/LinkLineQrModal.jsx', 'utf8');
const RULES_SRC = readFileSync('firestore.rules', 'utf8');
const NAV_SRC = readFileSync('src/components/backend/nav/navConfig.js', 'utf8');
const DASH_SRC = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');

// ─── L1 — interpretCustomerMessage ───────────────────────────────────────
describe('L1 interpretCustomerMessage — intent routing', () => {
  test('L1.1 empty / whitespace → help', () => {
    expect(interpretCustomerMessage('').intent).toBe('help');
    expect(interpretCustomerMessage('   ').intent).toBe('help');
    expect(interpretCustomerMessage(null).intent).toBe('help');
    expect(interpretCustomerMessage(undefined).intent).toBe('help');
  });
  test('L1.2 LINK-<token> uppercase prefix matches', () => {
    const r = interpretCustomerMessage('LINK-ABC123XYZ7');
    expect(r.intent).toBe('link');
    expect(r.payload.token).toBe('ABC123XYZ7');
  });
  test('L1.3 case-insensitive prefix', () => {
    expect(interpretCustomerMessage('link-ABC123XYZ7').intent).toBe('link');
    expect(interpretCustomerMessage('Link-ABC123XYZ7').intent).toBe('link');
  });
  test('L1.4 LINK token tolerates surrounding text', () => {
    const r = interpretCustomerMessage('สวัสดี LINK-ABC123XYZ7 ขอบคุณ');
    expect(r.intent).toBe('link');
    expect(r.payload.token).toBe('ABC123XYZ7');
  });
  test('L1.5 LINK with too-short token does NOT match (anti false-positive)', () => {
    expect(interpretCustomerMessage('LINK-ABC').intent).toBe('help');
    expect(interpretCustomerMessage('LINK-12345').intent).toBe('help');
  });
  test('L1.6 LINK with invalid characters does NOT match', () => {
    expect(interpretCustomerMessage('LINK-!@#$%^&*()').intent).toBe('help');
    // Spaces in token = stops at first space
    const r = interpretCustomerMessage('LINK-ABC 123XYZ7');
    expect(r.intent).toBe('help');
  });
  test('L1.7 Thai keyword "คอร์ส" → courses', () => {
    expect(interpretCustomerMessage('คอร์ส').intent).toBe('courses');
    expect(interpretCustomerMessage('ขอดูคอร์สหน่อย').intent).toBe('courses');
  });
  test('L1.8 English keyword variations → courses', () => {
    expect(interpretCustomerMessage('courses please').intent).toBe('courses');
    expect(interpretCustomerMessage('how many course').intent).toBe('courses');
    expect(interpretCustomerMessage('course remaining').intent).toBe('courses');
    expect(interpretCustomerMessage('REMAINING').intent).toBe('courses');
  });
  test('L1.9 Thai/English appointment keywords → appointments', () => {
    expect(interpretCustomerMessage('นัด').intent).toBe('appointments');
    expect(interpretCustomerMessage('วันนัดหมาย').intent).toBe('appointments');
    expect(interpretCustomerMessage('appointment').intent).toBe('appointments');
    expect(interpretCustomerMessage('appt time?').intent).toBe('appointments');
  });
  test('L1.10 random message → help', () => {
    expect(interpretCustomerMessage('สวัสดีครับ').intent).toBe('help');
    expect(interpretCustomerMessage('hello').intent).toBe('help');
  });
  test('L1.11 LINK takes priority over keyword in same message', () => {
    expect(interpretCustomerMessage('LINK-ABC123XYZ7 คอร์ส').intent).toBe('link');
  });
  test('L1.12 emoji-only / sticker text returns help', () => {
    expect(interpretCustomerMessage('🙂').intent).toBe('help');
  });
});

// ─── L2 — formatThaiDate ─────────────────────────────────────────────────
describe('L2 formatThaiDate', () => {
  test('L2.1 valid ISO → dd/mm/พ.ศ.', () => {
    expect(formatThaiDate('2026-04-26')).toBe('26/04/2569');
    expect(formatThaiDate('2026-12-31')).toBe('31/12/2569');
  });
  test('L2.2 invalid / empty / non-string → "-"', () => {
    expect(formatThaiDate('')).toBe('-');
    expect(formatThaiDate(null)).toBe('-');
    expect(formatThaiDate('not-a-date')).toBe('-');
    expect(formatThaiDate('2026/04/26')).toBe('-');
    expect(formatThaiDate(123)).toBe('-');
  });
  test('L2.3 longer string truncated to YYYY-MM-DD prefix', () => {
    expect(formatThaiDate('2026-04-26T12:00:00.000Z')).toBe('26/04/2569');
  });
});

// ─── L3 — formatCoursesReply ─────────────────────────────────────────────
describe('L3 formatCoursesReply', () => {
  test('L3.1 empty / non-array → "ยังไม่มีคอร์ส"', () => {
    expect(formatCoursesReply([])).toMatch(/ยังไม่มีคอร์ส/);
    expect(formatCoursesReply(null)).toMatch(/ยังไม่มีคอร์ส/);
    expect(formatCoursesReply('not-array')).toMatch(/ยังไม่มีคอร์ส/);
  });
  test('L3.2 only refunded/cancelled → "ไม่พบคอร์สที่ยังใช้ได้"', () => {
    const out = formatCoursesReply([
      { name: 'A', status: 'คืนเงิน' },
      { name: 'B', status: 'ใช้หมดแล้ว' },
      { name: 'C', status: 'ยกเลิก' },
    ]);
    expect(out).toMatch(/ไม่พบคอร์ส/);
  });
  test('L3.3 active courses listed with name + qty + expiry', () => {
    const out = formatCoursesReply([
      { name: 'Course A', status: 'กำลังใช้งาน', qty: '5/10', expiry: '2026-12-31' },
    ]);
    expect(out).toMatch(/Course A/);
    expect(out).toMatch(/5\/10/);
    expect(out).toMatch(/31\/12\/2569/);
  });
  test('L3.4 truncates at 20 + shows "และอีก N รายการ"', () => {
    const courses = Array.from({ length: 25 }, (_, i) => ({ name: `C${i}`, status: 'กำลังใช้งาน' }));
    const out = formatCoursesReply(courses);
    expect(out).toMatch(/และอีก 5 รายการ/);
  });
  test('L3.5 missing name → "(ไม่ระบุ)"', () => {
    const out = formatCoursesReply([{ status: 'กำลังใช้งาน' }]);
    expect(out).toMatch(/ไม่ระบุ/);
  });
  test('L3.6 default status (empty/active) treated as active', () => {
    expect(formatCoursesReply([{ name: 'X', status: '' }])).toMatch(/X/);
    expect(formatCoursesReply([{ name: 'Y', status: 'active' }])).toMatch(/Y/);
  });
});

// ─── L4 — formatAppointmentsReply ────────────────────────────────────────
describe('L4 formatAppointmentsReply', () => {
  test('L4.1 empty / non-array → friendly message', () => {
    expect(formatAppointmentsReply([])).toMatch(/ไม่พบรายการนัดหมาย/);
    expect(formatAppointmentsReply(null)).toMatch(/ไม่พบรายการนัดหมาย/);
  });
  test('L4.2 filters out past appointments', () => {
    const out = formatAppointmentsReply([
      { appointmentDate: '2020-01-01', status: '' },
      { appointmentDate: '2099-12-31', status: '' },
    ], '2026-04-26');
    // 2099 in CE → 2642 in BE (formatThaiDate adds 543)
    expect(out).toMatch(/2642/);
    // 2020 in CE → 2563 in BE (filtered out anyway since past)
    expect(out).not.toMatch(/2563/);
  });
  test('L4.3 filters cancelled / completed / no-show', () => {
    const out = formatAppointmentsReply([
      { appointmentDate: '2099-01-01', status: 'cancelled' },
      { appointmentDate: '2099-02-01', status: 'completed' },
      { appointmentDate: '2099-03-01', status: 'no-show' },
      { appointmentDate: '2099-04-01', status: 'pending' },
    ], '2026-04-26');
    expect(out).toMatch(/01\/04\/2642/);
    expect(out).not.toMatch(/01\/01/);
    expect(out).not.toMatch(/01\/02/);
    expect(out).not.toMatch(/01\/03/);
  });
  test('L4.4 sorted ascending by date', () => {
    const out = formatAppointmentsReply([
      { appointmentDate: '2099-12-01' },
      { appointmentDate: '2099-06-15' },
      { appointmentDate: '2099-01-20' },
    ], '2026-04-26');
    const idx1 = out.indexOf('20/01');
    const idx2 = out.indexOf('15/06');
    const idx3 = out.indexOf('01/12');
    expect(idx1).toBeGreaterThan(0);
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });
  test('L4.5 truncates at 10 + "และอีก N รายการ"', () => {
    const appts = Array.from({ length: 15 }, (_, i) => ({
      appointmentDate: `2099-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    const out = formatAppointmentsReply(appts, '2026-04-26');
    expect(out).toMatch(/และอีก 5 รายการ/);
  });
  test('L4.6 alternative date field name "date" works', () => {
    const out = formatAppointmentsReply([{ date: '2099-05-15' }], '2026-04-26');
    expect(out).toMatch(/15\/05/);
  });
});

// ─── L5 — formatHelpReply / formatLinkSuccessReply / Failure ─────────────
describe('L5 reply templates', () => {
  test('L5.1 help message includes both intent prompts', () => {
    const h = formatHelpReply();
    expect(h).toMatch(/คอร์ส/);
    expect(h).toMatch(/นัด/);
  });
  test('L5.2 link success includes customer name when given', () => {
    expect(formatLinkSuccessReply('สมชาย')).toMatch(/สมชาย/);
  });
  test('L5.3 link success without name still works', () => {
    expect(formatLinkSuccessReply('')).toMatch(/ผูกบัญชี LINE สำเร็จ/);
    expect(formatLinkSuccessReply(undefined)).toMatch(/ผูกบัญชี LINE สำเร็จ/);
  });
  test('L5.4 link failure has 3 distinct reasons', () => {
    const a = formatLinkFailureReply('invalid');
    const b = formatLinkFailureReply('expired');
    const c = formatLinkFailureReply('already-linked');
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).toMatch(/ไม่พบ|ไม่ถูก/);
    expect(b).toMatch(/หมดอายุ/);
    expect(c).toMatch(/ผูกกับ/);
  });
  test('L5.5 link failure default → invalid', () => {
    expect(formatLinkFailureReply('weird')).toBe(formatLinkFailureReply('invalid'));
    expect(formatLinkFailureReply()).toBe(formatLinkFailureReply('invalid'));
  });
  test('L5.6 not-linked reply present + non-empty', () => {
    expect(formatNotLinkedReply().length).toBeGreaterThan(10);
  });
});

// ─── L6 — generateLinkToken ──────────────────────────────────────────────
describe('L6 generateLinkToken', () => {
  test('L6.1 produces 24-char base32 string', () => {
    const t = generateLinkToken();
    expect(typeof t).toBe('string');
    expect(t).toMatch(/^[A-Z2-7]{24}$/);
  });
  test('L6.2 returns unique tokens across rapid calls (>1000)', () => {
    const set = new Set();
    for (let i = 0; i < 1000; i++) set.add(generateLinkToken());
    expect(set.size).toBe(1000);
  });
  test('L6.3 every char is in the base32 alphabet (RFC4648)', () => {
    const valid = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
    for (let i = 0; i < 50; i++) {
      const t = generateLinkToken();
      for (const c of t) expect(valid.has(c)).toBe(true);
    }
  });
});

// ─── L7 — admin/customer-link.js source-grep ─────────────────────────────
describe('L7 admin/customer-link.js', () => {
  test('L7.1 verifyAdminToken gate', () => {
    expect(ADMIN_LINK_SRC).toMatch(/await verifyAdminToken\(req,\s*res\)/);
  });
  test('L7.2 imports generateLinkToken from shared responder', () => {
    expect(ADMIN_LINK_SRC).toMatch(/generateLinkToken/);
    expect(ADMIN_LINK_SRC).toMatch(/from\s+['"]\.\.\/\.\.\/src\/lib\/lineBotResponder\.js['"]/);
  });
  test('L7.3 validates action === "create"', () => {
    expect(ADMIN_LINK_SRC).toMatch(/action\s*!==\s*['"]create['"]/);
  });
  test('L7.4 validates customerId required (string)', () => {
    expect(ADMIN_LINK_SRC).toMatch(/customerId required/);
  });
  test('L7.5 verifies customer exists via Firestore Admin SDK', () => {
    expect(ADMIN_LINK_SRC).toMatch(/be_customers/);
    expect(ADMIN_LINK_SRC).toMatch(/cSnap\.exists/);
  });
  test('L7.6 token TTL clamped to [1, 7 days]', () => {
    expect(ADMIN_LINK_SRC).toMatch(/Math\.max\(1,\s*Math\.min\(60\s*\*\s*24\s*\*\s*7/);
  });
  test('L7.7 writes be_customer_link_tokens with customerId + expiresAt + createdBy + createdAt', () => {
    const block = ADMIN_LINK_SRC.match(/be_customer_link_tokens[\s\S]{0,400}/)?.[0] || '';
    expect(block).toMatch(/customerId/);
    expect(block).toMatch(/expiresAt/);
    expect(block).toMatch(/createdBy/);
    expect(block).toMatch(/createdAt/);
  });
  test('L7.8 returns deepLink with botBasicId when configured', () => {
    expect(ADMIN_LINK_SRC).toMatch(/line\.me\/R\/oaMessage/);
    expect(ADMIN_LINK_SRC).toMatch(/encodeURIComponent\(botBasicId\)/);
  });
  test('L7.9 falls back to bare LINK-<token> when botBasicId not set', () => {
    expect(ADMIN_LINK_SRC).toMatch(/`LINK-\$\{token\}`/);
  });
});

// ─── L8 — webhook/line.js bot reply integration ──────────────────────────
describe('L8 api/webhook/line.js bot integration', () => {
  test('L8.1 imports interpretCustomerMessage + reply formatters', () => {
    expect(WEBHOOK_SRC).toMatch(/from ['"]\.\.\/\.\.\/src\/lib\/lineBotResponder\.js['"]/);
    expect(WEBHOOK_SRC).toMatch(/interpretCustomerMessage/);
    expect(WEBHOOK_SRC).toMatch(/formatCoursesReply/);
    expect(WEBHOOK_SRC).toMatch(/formatAppointmentsReply/);
    expect(WEBHOOK_SRC).toMatch(/formatHelpReply/);
    expect(WEBHOOK_SRC).toMatch(/formatLinkSuccessReply/);
    expect(WEBHOOK_SRC).toMatch(/formatLinkFailureReply/);
    expect(WEBHOOK_SRC).toMatch(/formatNotLinkedReply/);
  });
  test('L8.2 maybeEmitBotReply ONLY processes text messages', () => {
    expect(WEBHOOK_SRC).toMatch(/event\.message\?\.type\s*!==?\s*['"]text['"]/);
  });
  test('L8.3 processEvent calls maybeEmitBotReply AFTER chat-message storage', () => {
    const proc = WEBHOOK_SRC.match(/async function processEvent[\s\S]*?^\}/m)?.[0] || '';
    const storeIdx = proc.indexOf('firestorePatch(convPath');
    const botIdx = proc.indexOf('maybeEmitBotReply');
    expect(storeIdx).toBeGreaterThan(0);
    expect(botIdx).toBeGreaterThan(storeIdx); // bot AFTER storage
  });
  test('L8.4 bot errors do NOT block webhook (try/catch swallow)', () => {
    expect(WEBHOOK_SRC).toMatch(/maybeEmitBotReply\(event,\s*config\)[\s\S]{0,300}console\.warn/);
  });
  test('L8.5 consumeLinkToken validates expiry + collision', () => {
    expect(WEBHOOK_SRC).toMatch(/expiresAt\s*&&\s*expiresAt\s*<\s*new Date\(\)\.toISOString\(\)/);
    expect(WEBHOOK_SRC).toMatch(/already-linked/);
  });
  test('L8.6 consumeLinkToken writes lineUserId + lineLinkedAt onto customer', () => {
    const fn = WEBHOOK_SRC.match(/async function consumeLinkToken[\s\S]*?^\}/m)?.[0] || '';
    expect(fn).toMatch(/lineUserId/);
    expect(fn).toMatch(/lineLinkedAt/);
  });
  test('L8.7 consumeLinkToken deletes token after success (one-time use)', () => {
    // V32-tris-ter-fix: switched from firestoreDelete REST to admin SDK delete
    expect(WEBHOOK_SRC).toMatch(/tokenRef\.delete\(\)/);
  });
  test('L8.8 webhook unwraps Firestore docs via admin SDK (no manual unwrap helpers)', () => {
    // V32-tris-ter-fix: unwrapDoc/unwrapValue removed; admin SDK returns
    // plain JS objects already (snap.data()).
    expect(WEBHOOK_SRC).toMatch(/\.data\(\)/);
    expect(WEBHOOK_SRC).not.toMatch(/^function unwrapDoc/m);
  });
  test('L8.9 webhook uses admin SDK collection.where (no Firestore REST :runQuery)', () => {
    // V32-tris-ter-fix: be_* queries now use admin SDK; REST :runQuery
    // was rule-blocked. Admin SDK bypasses rules (server-side priv op).
    expect(WEBHOOK_SRC).not.toMatch(/:runQuery/);
    expect(WEBHOOK_SRC).toMatch(/\.collection\([^)]*be_customers/);
    expect(WEBHOOK_SRC).toMatch(/\.where\(['"]lineUserId['"]/);
  });
  test('L8.10 not-linked customer triggers formatNotLinkedReply', () => {
    expect(WEBHOOK_SRC).toMatch(/findCustomerByLineUserId/);
    expect(WEBHOOK_SRC).toMatch(/formatNotLinkedReply\(\)/);
  });
  test('L8.11 help-fallback only fires for messages length >= 2 (anti-spam)', () => {
    expect(WEBHOOK_SRC).toMatch(/text\.trim\(\)\.length\s*>=?\s*2/);
  });
});

// ─── L9 — LineSettingsTab UI source-grep ─────────────────────────────────
describe('L9 LineSettingsTab', () => {
  test('L9.1 root has data-testid', () => {
    expect(SETTINGS_SRC).toMatch(/data-testid=["']line-settings-tab["']/);
  });
  test('L9.2 channel cred fields all present (channelId/Secret/AccessToken/botBasicId/enabled)', () => {
    expect(SETTINGS_SRC).toMatch(/data-field=["']channelId["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']channelSecret["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']channelAccessToken["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']botBasicId["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']enabled["']/);
  });
  test('L9.3 bot Q&A fields present', () => {
    expect(SETTINGS_SRC).toMatch(/data-field=["']botEnabled["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']coursesKeywords["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']appointmentsKeywords["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']maxCoursesInReply["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']maxAppointmentsInReply["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']helpMessage["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']notLinkedMessage["']/);
  });
  test('L9.4 customer-linking fields present', () => {
    expect(SETTINGS_SRC).toMatch(/data-field=["']tokenTtlMinutes["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']alreadyLinkedRule["']/);
    expect(SETTINGS_SRC).toMatch(/data-field=["']welcomeMessage["']/);
  });
  test('L9.5 webhook URL displays + has copy button', () => {
    expect(SETTINGS_SRC).toMatch(/data-testid=["']line-settings-webhook-url["']/);
    expect(SETTINGS_SRC).toMatch(/data-testid=["']line-settings-copy-webhook["']/);
    expect(SETTINGS_SRC).toMatch(/api\/webhook\/line/);
  });
  test('L9.6 test-connection button + result variants', () => {
    expect(SETTINGS_SRC).toMatch(/data-testid=["']line-settings-test-conn["']/);
    // testid is set conditionally via ternary expression — substrings present.
    expect(SETTINGS_SRC).toMatch(/line-settings-test-ok/);
    expect(SETTINGS_SRC).toMatch(/line-settings-test-fail/);
    // V32-tris-ter-fix: api.line.me call moved to backend proxy (CORS).
    // Settings tab now calls testLineConnection() from lineTestClient.
    expect(SETTINGS_SRC).toMatch(/testLineConnection\(\)/);
    expect(SETTINGS_SRC).toMatch(/from\s+['"]\.\.\/\.\.\/lib\/lineTestClient\.js['"]/);
  });
  test('L9.7 save button persists via setDoc with merge:true', () => {
    expect(SETTINGS_SRC).toMatch(/data-testid=["']line-settings-save["']/);
    expect(SETTINGS_SRC).toMatch(/setDoc\([\s\S]{0,200}\{\s*merge:\s*true\s*\}\)/);
  });
  test('L9.8 input clamps maxCoursesInReply / maxAppointmentsInReply / tokenTtlMinutes', () => {
    expect(SETTINGS_SRC).toMatch(/Math\.max\(1,\s*Math\.min\(100,\s*Number\(form\.maxCoursesInReply\)/);
    expect(SETTINGS_SRC).toMatch(/Math\.max\(1,\s*Math\.min\(100,\s*Number\(form\.maxAppointmentsInReply\)/);
    expect(SETTINGS_SRC).toMatch(/Math\.max\(1,\s*Math\.min\(60\s*\*\s*24\s*\*\s*7,\s*Number\(form\.tokenTtlMinutes\)/);
  });
  test('L9.9 botBasicId validation rejects non-@ prefix', () => {
    // Validator runs `/^@/` against form.botBasicId before save.
    expect(SETTINGS_SRC).toMatch(/Bot Basic ID/);
    expect(SETTINGS_SRC).toMatch(/!\/\^@\/\.test\(String\(form\.botBasicId\)/);
  });
  test('L9.10 enabled=true requires creds present (basic safety)', () => {
    expect(SETTINGS_SRC).toMatch(/form\.enabled\s*&&\s*\(!form\.channelSecret\s*\|\|\s*!form\.channelAccessToken\)/);
  });
  test('L9.11 alreadyLinkedRule enum: block | replace', () => {
    expect(SETTINGS_SRC).toMatch(/['"]block['"],\s*['"]replace['"]/);
  });
  test('L9.12 secret + token fields default-hidden (password input toggle)', () => {
    expect(SETTINGS_SRC).toMatch(/showSecret/);
    expect(SETTINGS_SRC).toMatch(/showToken/);
    expect(SETTINGS_SRC).toMatch(/type=\{showSecret\s*\?\s*['"]text['"]\s*:\s*['"]password['"]\s*\}/);
  });
});

// ─── L10 — LinkLineQrModal UI source-grep ────────────────────────────────
describe('L10 LinkLineQrModal', () => {
  test('L10.1 imports createCustomerLinkToken + generateQrDataUrl', () => {
    expect(QR_MODAL_SRC).toMatch(/createCustomerLinkToken/);
    expect(QR_MODAL_SRC).toMatch(/generateQrDataUrl/);
  });
  test('L10.2 root testid + image testid + copy button + regen button + error', () => {
    expect(QR_MODAL_SRC).toMatch(/data-testid=["']link-line-qr-modal["']/);
    expect(QR_MODAL_SRC).toMatch(/data-testid=["']link-line-qr-image["']/);
    expect(QR_MODAL_SRC).toMatch(/data-testid=["']link-line-qr-copy["']/);
    expect(QR_MODAL_SRC).toMatch(/data-testid=["']link-line-qr-regen["']/);
    expect(QR_MODAL_SRC).toMatch(/data-testid=["']link-line-qr-error["']/);
  });
  test('L10.3 cancelRef pattern protects against unmounted setState', () => {
    expect(QR_MODAL_SRC).toMatch(/cancelRef\.current/);
  });
  test('L10.4 default TTL passed = 1440 minutes (24h)', () => {
    expect(QR_MODAL_SRC).toMatch(/ttlMinutes:\s*1440/);
  });
});

// ─── L11 — firestore.rules be_customer_link_tokens lockdown ──────────────
describe('L11 firestore.rules be_customer_link_tokens', () => {
  test('L11.1 collection match block exists', () => {
    expect(RULES_SRC).toMatch(/match \/be_customer_link_tokens\/\{token\}/);
  });
  test('L11.2 client SDK access blocked entirely (read+write deny)', () => {
    const block = RULES_SRC.match(/match \/be_customer_link_tokens\/\{token\}\s*\{[\s\S]*?\}/)?.[0] || '';
    expect(block).toMatch(/allow read,\s*write:\s+if false/);
  });
});

// ─── L12 — Nav + Dashboard wiring ────────────────────────────────────────
describe('L12 nav + dashboard wiring', () => {
  test('L12.1 navConfig has line-settings entry', () => {
    expect(NAV_SRC).toMatch(/id:\s*['"]line-settings['"]/);
    expect(NAV_SRC).toMatch(/ตั้งค่า LINE OA/);
  });
  test('L12.2 BackendDashboard has activeTab === "line-settings" branch', () => {
    expect(DASH_SRC).toMatch(/activeTab === ['"]line-settings['"]/);
    expect(DASH_SRC).toMatch(/<LineSettingsTab/);
  });
  test('L12.3 LineSettingsTab is lazy-loaded (code-split)', () => {
    expect(DASH_SRC).toMatch(/const LineSettingsTab\s*=\s*lazy\(\(\)\s*=>\s*import\(/);
  });
});

// ─── L13 — CustomerDetailView "ผูก LINE" button wiring ──────────────────
describe('L13 CustomerDetailView line-link button', () => {
  const CDV = readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf8');
  test('L13.1 imports LinkLineQrModal', () => {
    expect(CDV).toMatch(/import LinkLineQrModal/);
  });
  test('L13.2 has lineQrOpen state', () => {
    expect(CDV).toMatch(/lineQrOpen/);
    expect(CDV).toMatch(/setLineQrOpen/);
  });
  test('L13.3 button has data-testid + opens modal', () => {
    expect(CDV).toMatch(/data-testid=["']link-line-btn["']/);
    expect(CDV).toMatch(/setLineQrOpen\(true\)/);
  });
  test('L13.4 button label changes when already linked (lineUserId set)', () => {
    expect(CDV).toMatch(/customer\?\.lineUserId\s*\?\s*['"]LINE\s*✓['"]/);
  });
  test('L13.5 modal renders only when open', () => {
    expect(CDV).toMatch(/\{lineQrOpen\s*&&\s*\(\s*<LinkLineQrModal/);
  });
});
