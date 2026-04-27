// V33.9 — Orphan QR-token plumbing cleanup (2026-04-27).
//
// Strips the pre-V33.4 customer-link QR-token system that was deprecated by
// V33.4 directive #2 (admin-mediated id-link request flow). Token plumbing
// was kept on grace period through V33.5/V33.6/V33.7/V33.8; user authorized
// removal 2026-04-27 ("เก็บให้หมดเตรียมไป 15 เลย").
//
// Removed surfaces:
//   - api/admin/customer-link.js (token mint endpoint)        — DELETED
//   - src/lib/customerLinkClient.js (token mint client)       — DELETED
//   - generateLinkToken() in lineBotResponder.js              — REMOVED
//   - consumeLinkToken() in api/webhook/line.js               — REMOVED
//   - LINK-<token> regex in interpretCustomerMessage          — REMOVED
//   - intent === 'link' branch in maybeEmitBotReply           — REMOVED
//   - formatLinkSuccessReply / formatLinkFailureReply         — REMOVED
//   - LINK_SUCCESS / LINK_FAIL_* messages (TH + EN)           — REMOVED
//   - be_customer_link_tokens block in firestore.rules        — REMOVED
//   - be_customer_link_tokens entry in COLLECTION_MATRIX      — REMOVED
//
// Surviving (V33.4 admin-mediated):
//   - id-link-request intent + payload (national-id / passport)
//   - be_link_requests collection + admin queue UI
//   - formatLinkRequestApprovedReply / formatLinkRequestRejectedReply
//   - LinkLineInstructionsModal (admin instructions, no QR)
//   - LinkRequestsTab "ผูกแล้ว" management

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import * as responder from '../src/lib/lineBotResponder.js';

const RESPONDER_SRC = readFileSync('src/lib/lineBotResponder.js', 'utf8');
const WEBHOOK_SRC = readFileSync('api/webhook/line.js', 'utf8');
const RULES_SRC = readFileSync('firestore.rules', 'utf8');

// ────────────────────────────────────────────────────────────────────────
// V33.9.A — Files deleted
// ────────────────────────────────────────────────────────────────────────
describe('V33.9.A — orphan files deleted', () => {
  it('A1 — api/admin/customer-link.js no longer exists', () => {
    expect(existsSync('api/admin/customer-link.js')).toBe(false);
  });
  it('A2 — src/lib/customerLinkClient.js no longer exists', () => {
    expect(existsSync('src/lib/customerLinkClient.js')).toBe(false);
  });
  it('A3 — surviving customer-LINE-link client (V33.4) IS still present', () => {
    expect(existsSync('src/lib/customerLineLinkClient.js')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.9.B — Removed exports / functions
// ────────────────────────────────────────────────────────────────────────
describe('V33.9.B — removed exports', () => {
  it('B1 — generateLinkToken NOT exported', () => {
    expect(responder.generateLinkToken).toBeUndefined();
  });
  it('B2 — formatLinkSuccessReply NOT exported', () => {
    expect(responder.formatLinkSuccessReply).toBeUndefined();
  });
  it('B3 — formatLinkFailureReply NOT exported', () => {
    expect(responder.formatLinkFailureReply).toBeUndefined();
  });
  it('B4 — V33.4 admin-mediated reply functions ARE still exported (regression guard)', () => {
    expect(typeof responder.formatLinkRequestApprovedReply).toBe('function');
    expect(typeof responder.formatLinkRequestRejectedReply).toBe('function');
    expect(typeof responder.formatNotLinkedReply).toBe('function');
    expect(typeof responder.formatIdRequestAck).toBe('function');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.9.C — Intent routing: LINK-<token> → 'unknown'
// ────────────────────────────────────────────────────────────────────────
describe('V33.9.C — LINK-<token> messages no longer match intent="link"', () => {
  const { interpretCustomerMessage } = responder;

  it('C1 — uppercase LINK-XXXX → unknown (was: link)', () => {
    expect(interpretCustomerMessage('LINK-ABC123XYZ7').intent).toBe('unknown');
  });
  it('C2 — lowercase link-XXXX → unknown', () => {
    expect(interpretCustomerMessage('link-ABC123XYZ7').intent).toBe('unknown');
  });
  it('C3 — Mixed-case Link-XXXX → unknown', () => {
    expect(interpretCustomerMessage('Link-ABC123XYZ7').intent).toBe('unknown');
  });
  it('C4 — surrounding text + token → unknown (priority gone)', () => {
    expect(interpretCustomerMessage('สวัสดี LINK-ABC123XYZ7 ขอบคุณ').intent).toBe('unknown');
  });
  it('C5 — V33.4 admin-mediated id-link-request STILL works (regression guard)', () => {
    const r = interpretCustomerMessage('1234567890123');
    expect(r.intent).toBe('id-link-request');
    expect(r.payload?.idType).toBe('national-id');
    expect(r.payload?.wasBarePrefix).toBe(true);
  });
  it('C6 — interpretCustomerMessage return type comment no longer lists "link"', () => {
    // Source-grep — the JSDoc @returns enumerates intent values.
    const fn = RESPONDER_SRC.match(/\* @returns [\s\S]*?\*\/[\s\S]*?export function interpretCustomerMessage/m)?.[0] || '';
    expect(fn).not.toMatch(/'link'/);
    expect(fn).toMatch(/'id-link-request'/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.9.D — Webhook: consumeLinkToken removed + intent='link' branch gone
// ────────────────────────────────────────────────────────────────────────
describe('V33.9.D — webhook QR-token consumer fully stripped', () => {
  it('D1 — async function consumeLinkToken absent', () => {
    expect(WEBHOOK_SRC).not.toMatch(/^async function consumeLinkToken/m);
  });
  it('D2 — intent === "link" branch absent', () => {
    expect(WEBHOOK_SRC).not.toMatch(/intent\.intent === ['"]link['"]/);
  });
  it('D3 — formatLinkSuccessReply / formatLinkFailureReply NOT in import block', () => {
    const importBlock = WEBHOOK_SRC.match(/import \{[\s\S]*?\} from ['"]\.\.\/\.\.\/src\/lib\/lineBotResponder\.js['"];/)?.[0] || '';
    expect(importBlock).not.toMatch(/^\s*formatLinkSuccessReply,/m);
    expect(importBlock).not.toMatch(/^\s*formatLinkFailureReply,/m);
  });
  it('D4 — be_customer_link_tokens NOT referenced in webhook code (comments OK)', () => {
    const stripped = WEBHOOK_SRC.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped).not.toMatch(/be_customer_link_tokens/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.9.E — firestore.rules: be_customer_link_tokens block gone
// ────────────────────────────────────────────────────────────────────────
describe('V33.9.E — firestore.rules be_customer_link_tokens block removed', () => {
  it('E1 — no match block for be_customer_link_tokens', () => {
    expect(RULES_SRC).not.toMatch(/match \/be_customer_link_tokens/);
  });
  it('E2 — V33.9 marker comment present (institutional memory)', () => {
    expect(RULES_SRC).toMatch(/V33\.9.*be_customer_link_tokens.*REMOVED/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.9.F — V33.4 admin-mediated id-link flow STILL functional (regression)
// ────────────────────────────────────────────────────────────────────────
describe('V33.9.F — V33.4 admin-mediated linking still works', () => {
  it('F1 — be_link_requests rule still locked client-side', () => {
    expect(RULES_SRC).toMatch(/match \/be_link_requests\/\{requestId\}\s*\{[\s\S]*?allow read,\s*write:\s+if false/);
  });
  it('F2 — be_link_attempts rule still locked client-side', () => {
    expect(RULES_SRC).toMatch(/match \/be_link_attempts\/\{lineUserId\}\s*\{[\s\S]*?allow read,\s*write:\s+if false/);
  });
  it('F3 — webhook still has id-link-request intent branch', () => {
    expect(WEBHOOK_SRC).toMatch(/intent\.intent === ['"]id-link-request['"]/);
  });
  it('F4 — webhook still imports formatIdRequestAck', () => {
    expect(WEBHOOK_SRC).toMatch(/formatIdRequestAck/);
  });
  it('F5 — admin-mediated approval push functions still exported', () => {
    expect(typeof responder.formatLinkRequestApprovedReply).toBe('function');
    expect(typeof responder.formatLinkRequestRejectedReply).toBe('function');
  });
});

// ────────────────────────────────────────────────────────────────────────
// V33.9.G — V33.9 marker comments (institutional memory grep)
// ────────────────────────────────────────────────────────────────────────
describe('V33.9.G — V33.9 institutional memory markers', () => {
  it('G1 — lineBotResponder.js mentions V33.9 cleanup', () => {
    expect(RESPONDER_SRC).toMatch(/V33\.9/);
  });
  it('G2 — webhook mentions V33.9 cleanup', () => {
    expect(WEBHOOK_SRC).toMatch(/V33\.9/);
  });
});
