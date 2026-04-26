// T3.e (2026-04-26) — LINE document delivery (LINE-only — no SMTP)
//
// Closes the deferred T3.e from session 9. User session-11 directive:
// "SMTP ไม่ต้องทำ ไม่ต้องมีระบบรับส่งเมล มีแค่ระบบ line official".
// Email path stripped; nodemailer dropped. Backend endpoint
// /api/admin/send-document handles LINE Push API only.
//
// Test groups:
//   T3E.A — sendDocumentClient (LINE only)
//   T3E.B — DocumentPrintModal source-grep regression guards
//   T3E.C — server endpoint source-grep guards (validation, auth, errors)

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sendDocumentLine } from '../src/lib/sendDocumentClient.js';

const SERVER_SRC = readFileSync('api/admin/send-document.js', 'utf8');
const CLIENT_SRC = readFileSync('src/lib/sendDocumentClient.js', 'utf8');
const MODAL_SRC = readFileSync('src/components/backend/DocumentPrintModal.jsx', 'utf8');

// ─── T3E.A — sendDocumentClient ─────────────────────────────────────────
describe('T3E.A — sendDocumentClient (LINE-only)', () => {
  test('A.1 throws when recipient is missing', async () => {
    await expect(sendDocumentLine({})).rejects.toThrow(/recipient/);
    await expect(sendDocumentLine({ recipient: '' })).rejects.toThrow(/recipient/);
  });

  test('A.2 module exports sendDocumentLine but NOT sendDocumentEmail', () => {
    expect(CLIENT_SRC).toMatch(/export async function sendDocumentLine/);
    expect(CLIENT_SRC).not.toMatch(/export async function sendDocumentEmail/);
    expect(CLIENT_SRC).not.toMatch(/export async function blobToBase64/);
  });

  test('A.3 callSendDocument posts type:"line" payload (no SMTP path)', () => {
    expect(CLIENT_SRC).toMatch(/type:\s*['"]line['"]/);
    expect(CLIENT_SRC).not.toMatch(/type:\s*['"]email['"]/);
    expect(CLIENT_SRC).not.toMatch(/pdfBase64/);
  });

  test('A.4 banner comment documents LINE-only directive (institutional memory)', () => {
    expect(CLIENT_SRC).toMatch(/LINE-?ONLY|LINE-only/i);
  });
});

// ─── T3E.B — DocumentPrintModal source-grep guards ───────────────────────
describe('T3E.B — DocumentPrintModal wiring', () => {
  test('B.1 imports sendDocumentLine ONLY (no sendDocumentEmail)', () => {
    expect(MODAL_SRC).toMatch(/import\s*\{[^}]*\bsendDocumentLine\b[^}]*\}\s+from\s+['"]\.\.\/\.\.\/lib\/sendDocumentClient\.js['"]/);
    expect(MODAL_SRC).not.toMatch(/sendDocumentEmail/);
  });

  test('B.2 imports MessageCircle icon (LINE) but NOT Mail icon', () => {
    expect(MODAL_SRC).toMatch(/import\s*\{[^}]*MessageCircle[^}]*\}\s+from\s+['"]lucide-react['"]/);
    expect(MODAL_SRC).not.toMatch(/import\s*\{[^}]*\bMail\b[^}]*\}\s+from\s+['"]lucide-react['"]/);
  });

  test('B.3 has document-send-line button + onClick handleSendLine', () => {
    expect(MODAL_SRC).toMatch(/data-testid=["']document-send-line["']/);
    expect(MODAL_SRC).toMatch(/onClick=\{handleSendLine\}/);
  });

  test('B.4 NO document-send-email button remains', () => {
    expect(MODAL_SRC).not.toMatch(/document-send-email/);
    expect(MODAL_SRC).not.toMatch(/handleSendEmail/);
  });

  test('B.5 deliveryBusy state retained for spinner gate (LINE-only path)', () => {
    expect(MODAL_SRC).toMatch(/setDeliveryBusy/);
    // LINE-only — busy value is '' or 'line', never 'email'
    const handler = MODAL_SRC.match(/const handleSendLine[\s\S]*?^\s{2}\};/m)?.[0] || '';
    expect(handler).toMatch(/setDeliveryBusy\(['"]line['"]\)/);
  });

  test('B.6 LINE button disabled while delivering or pdfBusy', () => {
    const lineIdx = MODAL_SRC.indexOf('data-testid="document-send-line"');
    expect(lineIdx).toBeGreaterThan(0);
    const lineBtn = MODAL_SRC.slice(lineIdx - 200, lineIdx + 400);
    expect(lineBtn).toMatch(/disabled=\{[^}]*deliveryBusy[^}]*\}/);
  });

  test('B.7 audit log fires for line action (no email action)', () => {
    expect(MODAL_SRC).toMatch(/action:\s*['"]line['"]/);
    expect(MODAL_SRC).not.toMatch(/action:\s*['"]email['"]/);
  });

  test('B.8 error banner has document-delivery-error testid', () => {
    expect(MODAL_SRC).toMatch(/data-testid=["']document-delivery-error["']/);
  });

  test('B.9 CONFIG_MISSING error code is handled with Thai friendly message for LINE only', () => {
    expect(MODAL_SRC).toMatch(/code === ['"]CONFIG_MISSING['"]/);
    expect(MODAL_SRC).toMatch(/ยังไม่ได้ตั้งค่า LINE/);
    expect(MODAL_SRC).not.toMatch(/ยังไม่ได้ตั้งค่า SMTP/);
  });

  test('B.10 default LINE recipient pulled from customer record', () => {
    expect(MODAL_SRC).toMatch(/customer\?\.lineUserId/);
  });
});

// ─── T3E.C — server endpoint source-grep guards ──────────────────────────
describe('T3E.C — /api/admin/send-document server (LINE-only)', () => {
  test('C.1 imports verifyAdminToken (admin-only gate)', () => {
    expect(SERVER_SRC).toMatch(/import\s*\{\s*verifyAdminToken\s*\}\s+from\s+['"]\.\/_lib\/adminAuth\.js['"]/);
  });
  test('C.2 calls verifyAdminToken before processing', () => {
    expect(SERVER_SRC).toMatch(/await verifyAdminToken\(req,\s*res\)/);
  });
  test('C.3 rejects type !== "line" with explicit error message', () => {
    expect(SERVER_SRC).toMatch(/type\s*!==\s*['"]line['"]/);
    expect(SERVER_SRC).toMatch(/SMTP\/email is intentionally not supported|email is intentionally not supported/i);
  });
  test('C.4 returns 503 with code:CONFIG_MISSING when LINE token not set up', () => {
    expect(SERVER_SRC).toMatch(/CONFIG_MISSING/);
    expect(SERVER_SRC).toMatch(/code:\s*['"]CONFIG_MISSING['"]/);
  });
  test('C.5 LINE push uses api.line.me Bearer token (existing pattern)', () => {
    expect(SERVER_SRC).toMatch(/api\.line\.me\/v2\/bot\/message\/push/);
    expect(SERVER_SRC).toMatch(/Bearer \$\{token\}/);
  });
  test('C.6 NO nodemailer import statement (email path removed)', () => {
    // History comments may mention nodemailer; what matters is NO actual
    // import / require / dynamic-import call.
    expect(SERVER_SRC).not.toMatch(/import\s*\(\s*['"]nodemailer['"]\s*\)/);
    expect(SERVER_SRC).not.toMatch(/require\s*\(\s*['"]nodemailer['"]\s*\)/);
    expect(SERVER_SRC).not.toMatch(/from\s+['"]nodemailer['"]/);
  });
  test('C.7 NO email-config Firestore reads + NO sendEmail function', () => {
    expect(SERVER_SRC).not.toMatch(/email_config/);
    expect(SERVER_SRC).not.toMatch(/getEmailConfig/);
    expect(SERVER_SRC).not.toMatch(/async function sendEmail/);
  });
  test('C.8 reuses chat_config.line.channelAccessToken (single source of truth)', () => {
    expect(SERVER_SRC).toMatch(/chat_config/);
    expect(SERVER_SRC).toMatch(/channelAccessToken/);
  });
  test('C.9 banner comment documents LINE-only directive', () => {
    expect(SERVER_SRC).toMatch(/LINE-?ONLY|LINE-only/i);
  });
});
