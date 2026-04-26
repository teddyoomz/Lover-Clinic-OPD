// V33.4 — Bot intent detection: bare-ID detection (D3) + EXACT-match keyword whitelist (D9).
// Combines tests for both new behaviors since they share the same function.

import { describe, it, expect } from 'vitest';
import {
  interpretCustomerMessage,
  COURSES_TRIGGERS,
  APPOINTMENTS_TRIGGERS,
  HELP_TRIGGERS,
} from '../src/lib/lineBotResponder.js';

describe('V33.4.D — bare 13-digit ID detection (no "ผูก" prefix needed)', () => {
  it('D1 — bare 13-digit → id-link-request national-id wasBarePrefix=true', () => {
    const r = interpretCustomerMessage('1234567890123');
    expect(r.intent).toBe('id-link-request');
    expect(r.payload.idType).toBe('national-id');
    expect(r.payload.idValue).toBe('1234567890123');
    expect(r.payload.wasBarePrefix).toBe(true);
  });
  it('D2 — bare 13-digit with surrounding whitespace → trimmed match', () => {
    expect(interpretCustomerMessage('  1234567890123  ').intent).toBe('id-link-request');
  });
  it('D3 — 12-digit alone → NOT id-link-request', () => {
    const r = interpretCustomerMessage('123456789012');
    expect(r.intent).not.toBe('id-link-request');
  });
  it('D4 — 14-digit alone → NOT id-link-request', () => {
    const r = interpretCustomerMessage('12345678901234');
    expect(r.intent).not.toBe('id-link-request');
  });
  it('D5 — 13-digit with TEXT around → NOT bare (mixed message)', () => {
    expect(interpretCustomerMessage('id is 1234567890123').intent).not.toBe('id-link-request');
    expect(interpretCustomerMessage('1234567890123 thanks').intent).not.toBe('id-link-request');
  });
  it('D6 — 13-digit with "ผูก" prefix → id-link-request wasBarePrefix=false (legacy)', () => {
    const r = interpretCustomerMessage('ผูก 1234567890123');
    expect(r.intent).toBe('id-link-request');
    expect(r.payload.idType).toBe('national-id');
    expect(r.payload.wasBarePrefix).toBe(false);
  });
});

describe('V33.4.E — bare passport detection', () => {
  it('E1 — bare AA1234567 → id-link-request passport wasBarePrefix=true (uppercased)', () => {
    const r = interpretCustomerMessage('aa1234567');
    expect(r.intent).toBe('id-link-request');
    expect(r.payload.idType).toBe('passport');
    expect(r.payload.idValue).toBe('AA1234567');
    expect(r.payload.wasBarePrefix).toBe(true);
  });
  it('E2 — passport must contain at least one digit', () => {
    expect(interpretCustomerMessage('ABCDEFGH').intent).not.toBe('id-link-request');
  });
  it('E3 — passport must start with letter', () => {
    expect(interpretCustomerMessage('1A234567').intent).not.toBe('id-link-request');
  });
  it('E4 — too short (5 chars) → not passport', () => {
    expect(interpretCustomerMessage('A1234').intent).not.toBe('id-link-request');
  });
  it('E5 — too long (13 chars all alphanumeric) → not passport (limit is 6-12)', () => {
    expect(interpretCustomerMessage('A123456789012').intent).not.toBe('id-link-request');
  });
  it('E6 — passport with "ผูกบัญชี" prefix → wasBarePrefix=false', () => {
    const r = interpretCustomerMessage('ผูกบัญชี aa1234567');
    expect(r.intent).toBe('id-link-request');
    expect(r.payload.wasBarePrefix).toBe(false);
  });
});

describe('V33.4.F — exact-match keyword triggers (no substring)', () => {
  it('F1 — every COURSES_TRIGGERS phrase → courses', () => {
    for (const phrase of COURSES_TRIGGERS) {
      expect(interpretCustomerMessage(phrase).intent, phrase).toBe('courses');
      expect(interpretCustomerMessage(phrase.toUpperCase()).intent, phrase + ' upper').toBe('courses');
    }
  });
  it('F2 — every APPOINTMENTS_TRIGGERS phrase → appointments', () => {
    for (const phrase of APPOINTMENTS_TRIGGERS) {
      expect(interpretCustomerMessage(phrase).intent, phrase).toBe('appointments');
    }
  });
  it('F3 — every HELP_TRIGGERS phrase → help', () => {
    for (const phrase of HELP_TRIGGERS) {
      expect(interpretCustomerMessage(phrase).intent, phrase).toBe('help');
    }
  });
  it('F4 — substring DOES NOT trigger (V33.4 D9 fix)', () => {
    // These previously triggered the bot due to substring match — now silent.
    expect(interpretCustomerMessage('อยากดูคอร์สหน่อย').intent).toBe('unknown');
    expect(interpretCustomerMessage('ผมจะนัดหมอ').intent).toBe('unknown');
    expect(interpretCustomerMessage('I have an appointment tomorrow').intent).toBe('unknown');
    expect(interpretCustomerMessage('คอร์สนี้ดีนะ').intent).toBe('unknown');
    expect(interpretCustomerMessage('สวัสดี').intent).toBe('unknown');
  });
  it('F5 — leading/trailing whitespace trimmed before exact-match', () => {
    expect(interpretCustomerMessage('  คอร์ส  ').intent).toBe('courses');
    expect(interpretCustomerMessage('\tนัด\n').intent).toBe('appointments');
  });
  it('F6 — case-insensitive for English phrases', () => {
    expect(interpretCustomerMessage('Course').intent).toBe('courses');
    expect(interpretCustomerMessage('APPOINTMENTS').intent).toBe('appointments');
    expect(interpretCustomerMessage('Help').intent).toBe('help');
  });
  it('F7 — empty/null/whitespace-only → help (existing behaviour preserved)', () => {
    expect(interpretCustomerMessage('').intent).toBe('help');
    expect(interpretCustomerMessage(null).intent).toBe('help');
    expect(interpretCustomerMessage(undefined).intent).toBe('help');
    expect(interpretCustomerMessage('   ').intent).toBe('help');
  });
  it('F8 — unknown free-text → intent="unknown" (NEW V33.4)', () => {
    expect(interpretCustomerMessage('hello world').intent).toBe('unknown');
    expect(interpretCustomerMessage('thank you').intent).toBe('unknown');
    expect(interpretCustomerMessage('ขอบคุณค่ะ').intent).toBe('unknown');
  });
});

describe('V33.4.G — priority order (LINK > prefix > bare-id > keywords > unknown)', () => {
  it('G1 — LINK token wins over keywords', () => {
    expect(interpretCustomerMessage('LINK-abc12345').intent).toBe('link');
    expect(interpretCustomerMessage('คอร์ส LINK-abc12345').intent).toBe('link');
  });
  it('G2 — "ผูก " prefix wins over bare 13-digit detection', () => {
    // Both formats would match 13-digit, but the prefix path wins (specifies legacy)
    const r = interpretCustomerMessage('ผูก 1234567890123');
    expect(r.payload.wasBarePrefix).toBe(false);
  });
  it('G3 — bare-13-digit wins over courses keyword (id-link-request priority)', () => {
    // 13-digit is not in COURSES_TRIGGERS, but explicit test.
    expect(interpretCustomerMessage('1234567890123').intent).toBe('id-link-request');
  });
  it('G4 — keywords win over unknown', () => {
    expect(interpretCustomerMessage('คอร์ส').intent).toBe('courses');
  });
});

describe('V33.4.H — exported triggers are frozen + non-empty', () => {
  it('H1 — COURSES_TRIGGERS frozen + non-empty', () => {
    expect(Object.isFrozen(COURSES_TRIGGERS)).toBe(true);
    expect(COURSES_TRIGGERS.length).toBeGreaterThan(0);
  });
  it('H2 — APPOINTMENTS_TRIGGERS frozen + non-empty', () => {
    expect(Object.isFrozen(APPOINTMENTS_TRIGGERS)).toBe(true);
    expect(APPOINTMENTS_TRIGGERS.length).toBeGreaterThan(0);
  });
  it('H3 — HELP_TRIGGERS frozen + non-empty', () => {
    expect(Object.isFrozen(HELP_TRIGGERS)).toBe(true);
    expect(HELP_TRIGGERS.length).toBeGreaterThan(0);
  });
});
