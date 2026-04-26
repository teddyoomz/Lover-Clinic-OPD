// T3.e (2026-04-26) — email + LINE document delivery
//
// Closes the deferred T3.e from session 9. Backend endpoint
// /api/admin/send-document handles email (nodemailer) + LINE (Push API),
// with friendly CONFIG_MISSING errors when SMTP/LINE token isn't set up
// yet. UI: DocumentPrintModal gets "ส่ง Email" + "แจ้ง LINE" buttons.
//
// Test groups:
//   T3E.A — sendDocumentClient pure helper (blobToBase64, payload shape)
//   T3E.B — DocumentPrintModal source-grep regression guards
//   T3E.C — server endpoint source-grep guards (validation, auth, errors)

import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { blobToBase64 } from '../src/lib/sendDocumentClient.js';

const SERVER_SRC = readFileSync('api/admin/send-document.js', 'utf8');
const CLIENT_SRC = readFileSync('src/lib/sendDocumentClient.js', 'utf8');
const MODAL_SRC = readFileSync('src/components/backend/DocumentPrintModal.jsx', 'utf8');

// ─── T3E.A — blobToBase64 helper ─────────────────────────────────────────
describe('T3E.A — blobToBase64', () => {
  test('A.1 throws on non-Blob input', async () => {
    await expect(blobToBase64('string')).rejects.toThrow(/must be Blob/);
    await expect(blobToBase64(null)).rejects.toThrow(/must be Blob/);
    await expect(blobToBase64({})).rejects.toThrow(/must be Blob/);
  });

  test('A.2 strips data: prefix from base64 result', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const b64 = await blobToBase64(blob);
    expect(b64).not.toMatch(/^data:/);
    expect(b64).not.toContain(',');
    // "hello" → base64 "aGVsbG8="
    expect(b64).toBe('aGVsbG8=');
  });

  test('A.3 handles binary content', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF" header
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const b64 = await blobToBase64(blob);
    // base64("%PDF") = "JVBERg=="
    expect(b64).toBe('JVBERg==');
  });

  test('A.4 handles empty blob', async () => {
    const blob = new Blob([], { type: 'application/pdf' });
    const b64 = await blobToBase64(blob);
    expect(b64).toBe('');
  });
});

// ─── T3E.B — DocumentPrintModal source-grep guards ───────────────────────
describe('T3E.B — DocumentPrintModal wiring', () => {
  test('B.1 imports sendDocumentEmail + sendDocumentLine', () => {
    expect(MODAL_SRC).toMatch(/import\s*\{[^}]*sendDocumentEmail[^}]*sendDocumentLine[^}]*\}\s+from\s+['"]\.\.\/\.\.\/lib\/sendDocumentClient\.js['"]/);
  });
  test('B.2 imports Mail + MessageCircle icons', () => {
    expect(MODAL_SRC).toMatch(/import\s*\{[^}]*Mail[^}]*\}\s+from\s+['"]lucide-react['"]/);
    expect(MODAL_SRC).toMatch(/import\s*\{[^}]*MessageCircle[^}]*\}\s+from\s+['"]lucide-react['"]/);
  });
  test('B.3 has document-send-email button + onClick handleSendEmail', () => {
    expect(MODAL_SRC).toMatch(/data-testid=["']document-send-email["']/);
    expect(MODAL_SRC).toMatch(/onClick=\{handleSendEmail\}/);
  });
  test('B.4 has document-send-line button + onClick handleSendLine', () => {
    expect(MODAL_SRC).toMatch(/data-testid=["']document-send-line["']/);
    expect(MODAL_SRC).toMatch(/onClick=\{handleSendLine\}/);
  });
  test('B.5 declares deliveryBusy state for shared spinner gate', () => {
    expect(MODAL_SRC).toMatch(/setDeliveryBusy/);
  });
  test('B.6 buttons disabled while delivering', () => {
    // Both email + line buttons should reference deliveryBusy in disabled prop.
    // Look at the BUTTON BLOCK around the testid (button has disabled BEFORE
    // data-testid in our markup). 600-char window covers full button tag.
    const emailIdx = MODAL_SRC.indexOf('data-testid="document-send-email"');
    expect(emailIdx).toBeGreaterThan(0);
    const emailBtn = MODAL_SRC.slice(emailIdx - 200, emailIdx + 400);
    expect(emailBtn).toMatch(/disabled=\{[^}]*deliveryBusy[^}]*\}/);
    const lineIdx = MODAL_SRC.indexOf('data-testid="document-send-line"');
    expect(lineIdx).toBeGreaterThan(0);
    const lineBtn = MODAL_SRC.slice(lineIdx - 200, lineIdx + 400);
    expect(lineBtn).toMatch(/disabled=\{[^}]*deliveryBusy[^}]*\}/);
  });
  test('B.7 audit log fires for email + line actions', () => {
    expect(MODAL_SRC).toMatch(/action:\s*['"]email['"]/);
    expect(MODAL_SRC).toMatch(/action:\s*['"]line['"]/);
  });
  test('B.8 error banner has document-delivery-error testid', () => {
    expect(MODAL_SRC).toMatch(/data-testid=["']document-delivery-error["']/);
  });
  test('B.9 CONFIG_MISSING error code is handled with Thai friendly message', () => {
    expect(MODAL_SRC).toMatch(/code === ['"]CONFIG_MISSING['"]/);
    expect(MODAL_SRC).toMatch(/ยังไม่ได้ตั้งค่า SMTP/);
    expect(MODAL_SRC).toMatch(/ยังไม่ได้ตั้งค่า LINE/);
  });
  test('B.10 default email/line recipient pulled from customer record', () => {
    expect(MODAL_SRC).toMatch(/customer\?\.email/);
    expect(MODAL_SRC).toMatch(/customer\?\.lineUserId/);
  });
  test('B.11 PDF download click suppression hooks document.createElement', () => {
    // The renderPdfBlob helper must intercept <a>.click() to prevent the
    // engine from triggering an automatic file download during email send.
    expect(MODAL_SRC).toMatch(/document\.createElement = function/);
    expect(MODAL_SRC).toMatch(/swallow download/i);
  });
});

// ─── T3E.C — server endpoint source-grep guards ──────────────────────────
describe('T3E.C — /api/admin/send-document server', () => {
  test('C.1 imports verifyAdminToken (admin-only gate)', () => {
    expect(SERVER_SRC).toMatch(/import\s*\{\s*verifyAdminToken\s*\}\s+from\s+['"]\.\/_lib\/adminAuth\.js['"]/);
  });
  test('C.2 calls verifyAdminToken before processing', () => {
    expect(SERVER_SRC).toMatch(/await verifyAdminToken\(req,\s*res\)/);
  });
  test('C.3 validates type ∈ {email, line}', () => {
    expect(SERVER_SRC).toMatch(/\['email',\s*'line'\]\.includes\(type\)/);
  });
  test('C.4 returns 503 with code:CONFIG_MISSING when SMTP not set up', () => {
    expect(SERVER_SRC).toMatch(/CONFIG_MISSING/);
    expect(SERVER_SRC).toMatch(/code:\s*['"]CONFIG_MISSING['"]/);
  });
  test('C.5 SMTP config requires host AND user AND pass', () => {
    expect(SERVER_SRC).toMatch(/!config\?\.host\s*\|\|\s*!config\?\.user\s*\|\|\s*!config\?\.pass/);
  });
  test('C.6 LINE push uses api.line.me Bearer token (existing pattern)', () => {
    expect(SERVER_SRC).toMatch(/api\.line\.me\/v2\/bot\/message\/push/);
    expect(SERVER_SRC).toMatch(/Bearer \$\{token\}/);
  });
  test('C.7 PDF size cap enforced (10MB)', () => {
    expect(SERVER_SRC).toMatch(/MAX_PDF_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/);
  });
  test('C.8 returns 413 on oversized PDF', () => {
    expect(SERVER_SRC).toMatch(/status\(413\)/);
  });
  test('C.9 nodemailer dynamically imported (Vercel function size)', () => {
    expect(SERVER_SRC).toMatch(/await import\(['"]nodemailer['"]\)/);
  });
  test('C.10 reads email_config from clinic_settings (not env vars)', () => {
    // V32-tris-bis design: SMTP creds in Firestore so admin can configure
    // without redeploy. Env-var fallback would lock admin out of the flow.
    expect(SERVER_SRC).toMatch(/clinic_settings\/email_config/);
  });
  test('C.11 reuses chat_config.line.channelAccessToken (no duplicate env var)', () => {
    // Mirrors api/webhook/send.js LINE token source — single source of truth.
    expect(SERVER_SRC).toMatch(/chat_config/);
    expect(SERVER_SRC).toMatch(/channelAccessToken/);
  });
});
