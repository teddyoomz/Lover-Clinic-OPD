import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  DEFAULT_ID_LINK_KEYWORDS,
  buildIdLinkPrefixRegex,
  validateIdLinkKeywords,
  interpretCustomerMessage,
  formatIdRequestInvalidFormat,
} from '../src/lib/lineBotResponder.js';

// ─── Configurable LINE id-link keywords (2026-07-07) ─────────────────────────
// User directive: "เวลาจะเชื่อมลูกค้าในไลน์แอด ให้พิมพ์คำว่า link [เลขบัตร/พาสปอร์ต]
// ได้ด้วย และให้ setting กำหนดคำได้ ... ได้มากกว่า 1 คำ" — the keyword set that
// triggers the id-link-request intent is now configurable (stored in
// clinic_settings/link_id_keywords; absent → DEFAULT = พฤติกรรมเดิมเป๊ะ).
// Spec: docs/superpowers/specs/2026-07-07-customer-link-header-and-line-keywords-design.html

const ROOT = resolve(__dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const NID = '1234567890123';

describe('A. defaults + backward compatibility (no opts = old behavior exactly)', () => {
  it('A1: DEFAULT_ID_LINK_KEYWORDS is the frozen legacy set', () => {
    expect(DEFAULT_ID_LINK_KEYWORDS).toEqual(['ผูก', 'ผูกบัญชี', 'link']);
    expect(Object.isFrozen(DEFAULT_ID_LINK_KEYWORDS)).toBe(true);
  });
  it('A2: legacy prefixes all still work without opts', () => {
    expect(interpretCustomerMessage(`ผูก ${NID}`)).toEqual({ intent: 'id-link-request', payload: { idType: 'national-id', idValue: NID, wasBarePrefix: false } });
    expect(interpretCustomerMessage('ผูกบัญชี AA1234567').payload).toEqual({ idType: 'passport', idValue: 'AA1234567', wasBarePrefix: false });
    expect(interpretCustomerMessage(`link ${NID}`).intent).toBe('id-link-request');
    expect(interpretCustomerMessage(`LINK ${NID}`).intent).toBe('id-link-request'); // case-insensitive (i flag, as before)
  });
  it('A3: bare-ID path untouched (no keyword needed, wasBarePrefix=true)', () => {
    expect(interpretCustomerMessage(NID).payload.wasBarePrefix).toBe(true);
    expect(interpretCustomerMessage('AA1234567').payload.idType).toBe('passport');
  });
  it('A4: keyword + malformed id → invalid payload (format-hint path preserved)', () => {
    expect(interpretCustomerMessage('ผูก abc').payload.idType).toBe('invalid');
  });
  it('A5: exact-match menu triggers unaffected', () => {
    expect(interpretCustomerMessage('คอร์ส').intent).toBe('courses');
    expect(interpretCustomerMessage('นัด').intent).toBe('appointments');
    expect(interpretCustomerMessage('random chatter').intent).toBe('unknown');
  });
});

describe('B. custom keyword sets', () => {
  it('B1: custom keyword triggers; removed default no longer triggers', () => {
    const opts = { idLinkKeywords: ['เชื่อม'] };
    expect(interpretCustomerMessage(`เชื่อม ${NID}`, opts).intent).toBe('id-link-request');
    expect(interpretCustomerMessage(`ผูก ${NID}`, opts).intent).toBe('unknown');
  });
  it('B2: ASCII keywords match case-insensitively', () => {
    const opts = { idLinkKeywords: ['Connect'] };
    expect(interpretCustomerMessage(`connect ${NID}`, opts).intent).toBe('id-link-request');
    expect(interpretCustomerMessage(`CONNECT AA1234567`, opts).payload.idType).toBe('passport');
  });
  it('B3: longer keyword wins over its own prefix (ผูกบัญชี before ผูก) regardless of list order', () => {
    const opts = { idLinkKeywords: ['ผูก', 'ผูกบัญชี'] };
    const out = interpretCustomerMessage(`ผูกบัญชี ${NID}`, opts);
    expect(out.payload).toEqual({ idType: 'national-id', idValue: NID, wasBarePrefix: false });
  });
  it('B4: regex-special characters in a keyword are escaped (match literal only)', () => {
    const opts = { idLinkKeywords: ['c.link', 'a*b'] };
    expect(interpretCustomerMessage(`c.link ${NID}`, opts).intent).toBe('id-link-request');
    expect(interpretCustomerMessage(`cxlink ${NID}`, opts).intent).toBe('unknown'); // "." must NOT act as wildcard
    expect(interpretCustomerMessage(`a*b ${NID}`, opts).intent).toBe('id-link-request');
    expect(interpretCustomerMessage(`aaab ${NID}`, opts).intent).toBe('unknown');
  });
  it('B5: empty/null/undefined keyword list → DEFAULT set (never a dead bot)', () => {
    for (const bad of [undefined, null, [], ['', '   ']]) {
      expect(interpretCustomerMessage(`ผูก ${NID}`, { idLinkKeywords: bad }).intent).toBe('id-link-request');
    }
  });
  it('B6: stored keywords with stray whitespace still match (trimmed at regex build)', () => {
    expect(interpretCustomerMessage(`เชื่อม ${NID}`, { idLinkKeywords: [' เชื่อม '] }).intent).toBe('id-link-request');
  });
  it('B7: buildIdLinkPrefixRegex captures the remainder after the keyword', () => {
    const re = buildIdLinkPrefixRegex(['เชื่อม']);
    expect(`เชื่อม ${NID}`.match(re)[1]).toBe(NID);
    expect(`เชื่อม${NID}`.match(re)).toBeNull(); // space after keyword still required (same as legacy)
  });
});

describe('C. validateIdLinkKeywords (settings-card gate)', () => {
  it('C1: valid list passes + returns trimmed keywords', () => {
    expect(validateIdLinkKeywords(['ผูก', ' link '])).toEqual({ ok: true, keywords: ['ผูก', 'link'] });
  });
  it('C2: empty / non-array → error', () => {
    expect(validateIdLinkKeywords([]).ok).toBe(false);
    expect(validateIdLinkKeywords('ผูก').ok).toBe(false);
    expect(validateIdLinkKeywords(null).ok).toBe(false);
  });
  it('C3: more than 10 keywords → error', () => {
    expect(validateIdLinkKeywords(Array.from({ length: 11 }, (_, i) => `คำ${i}`)).ok).toBe(false);
    expect(validateIdLinkKeywords(Array.from({ length: 10 }, (_, i) => `คำ${i}`)).ok).toBe(true);
  });
  it('C4: keyword longer than 30 chars OR empty-after-trim → error', () => {
    expect(validateIdLinkKeywords(['x'.repeat(31)]).ok).toBe(false);
    expect(validateIdLinkKeywords(['x'.repeat(30)]).ok).toBe(true);
    expect(validateIdLinkKeywords(['ผูก', '   ']).ok).toBe(false);
  });
  it('C5: whitespace INSIDE a keyword → error (message format is "<คำ> <เลข>")', () => {
    expect(validateIdLinkKeywords(['ผูก บัญชี']).ok).toBe(false);
  });
  it('C6: all-digit keyword → error (collides with the bare-ID path)', () => {
    expect(validateIdLinkKeywords(['123']).ok).toBe(false);
    expect(validateIdLinkKeywords(['a123']).ok).toBe(true);
  });
  it('C7: duplicates (case-insensitive) → error', () => {
    expect(validateIdLinkKeywords(['Link', 'link']).ok).toBe(false);
    expect(validateIdLinkKeywords(['ผูก', 'ผูก']).ok).toBe(false);
  });
  it('C8: every error carries Thai copy', () => {
    for (const bad of [[], ['ผูก บัญชี'], ['123'], ['Link', 'link'], ['x'.repeat(31)]]) {
      const r = validateIdLinkKeywords(bad);
      expect(r.ok).toBe(false);
      expect(typeof r.error).toBe('string');
      expect(r.error.length).toBeGreaterThan(0);
    }
  });
});

describe('D. format hint follows the configured keywords', () => {
  it('D1: TH default output byte-identical to the legacy constant', () => {
    expect(formatIdRequestInvalidFormat('th')).toBe([
      'รูปแบบเลขที่ระบุไม่ถูกต้อง',
      '',
      'โปรดส่งข้อความรูปแบบ:',
      '  ผูก 1234567890123  (เลขบัตรประชาชน 13 หลัก)',
      '  ผูก AA1234567      (เลขพาสปอร์ต)',
    ].join('\n'));
  });
  it('D2: EN default output byte-identical to the legacy constant', () => {
    expect(formatIdRequestInvalidFormat('en')).toBe([
      'Invalid ID format',
      '',
      'Please send a message in this format:',
      '  link 1234567890123  (national ID, 13 digits)',
      '  link AA1234567      (passport number)',
    ].join('\n'));
  });
  it('D3: TH hint uses the FIRST configured keyword', () => {
    const out = formatIdRequestInvalidFormat('th', ['เชื่อม', 'link']);
    expect(out).toContain('เชื่อม 1234567890123');
    expect(out).not.toContain('ผูก 1234567890123');
  });
  it('D4: EN hint prefers the first ASCII keyword; falls back to first keyword when none', () => {
    expect(formatIdRequestInvalidFormat('en', ['เชื่อม', 'connect'])).toContain('connect 1234567890123');
    expect(formatIdRequestInvalidFormat('en', ['เชื่อม'])).toContain('เชื่อม 1234567890123');
  });
});

describe('E. wiring locks (webhook + settings UI)', () => {
  it('E1: webhook fetches keywords with a TTL cache + passes them into interpretCustomerMessage AND the hint', () => {
    const W = read('api/webhook/line.js');
    expect(W).toMatch(/getIdLinkKeywordsCached/);
    expect(W).toMatch(/clinic_settings\/link_id_keywords/);
    expect(W).toMatch(/interpretCustomerMessage\(text, \{ idLinkKeywords \}\)/);
    expect(W).toMatch(/formatIdRequestInvalidFormat\([^)]*idLinkKeywords\)/);
  });
  it('E2: client lib reads/writes clinic_settings/link_id_keywords and validates before save', () => {
    const C = read('src/lib/idLinkKeywordsClient.js');
    expect(C).toMatch(/link_id_keywords/);
    expect(C).toMatch(/validateIdLinkKeywords/);
    expect(C).toMatch(/serverTimestamp\(\)/);
  });
  it('E3: LinkRequestsTab renders the settings card via the client lib', () => {
    const T = read('src/components/backend/LinkRequestsTab.jsx');
    expect(T).toMatch(/idLinkKeywordsClient/);
    expect(T).toMatch(/คำที่ใช้ผูกบัญชี/);
  });
  it('E4: no other interpretCustomerMessage call site was left without consideration (FB webhook must NOT have one)', () => {
    const FB = read('api/webhook/facebook.js');
    expect(FB).not.toMatch(/interpretCustomerMessage/);
  });
});
