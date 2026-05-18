// ─── V95 — TZ1 iter-3 validity-date fix (2026-05-18 EOD+11 LATE) ────────────
//
// audit-all iter-2 caught 2 sites with TZ1 family pattern that V93 missed
// (because V93 grep regex was `slice(0,N)`-specific, not split('T')[0]):
//
//   1. src/lib/backendClient.js:1523 — assignCourseToCustomer expiry calc
//      OLD: new Date(Date.now() + validityDays * 86400000).toISOString().split('T')[0]
//      NEW: thaiDateNDaysFromNow(validityDays)
//
//   2. src/lib/courseExchange.js:81 — exchange-flow expiry calc (same pattern)
//
// Class-of-bug: V12-family TZ off-by-one at the FORWARD-DATE-ARITHMETIC
// boundary. Course/coupon/membership expiry created at Bangkok 00:00-07:00
// would expire 1 day early because UTC of that moment is still previous-day.
//
// AV85 invariant in audit-anti-vibe-code SKILL.md updated to cover the
// `new Date(Date.now() + N*86400000).toISOString().split('T')[0]` pattern.
//
// Companion to V93 (TZ1 batch) + V93.L/M (iter-2 fix).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { thaiDateNDaysFromNow, thaiTodayISO } from '../src/utils.js';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ═══════════════════════════════════════════════════════════════════════
// V95.A — thaiDateNDaysFromNow helper (canonical Bangkok-anchored arith)
// ═══════════════════════════════════════════════════════════════════════

describe('V95.A: thaiDateNDaysFromNow helper unit', () => {
  it('A.1: returns "YYYY-MM-DD" Bangkok-anchored shape', () => {
    const out = thaiDateNDaysFromNow(0);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('A.2: days=0 matches thaiTodayISO()', () => {
    expect(thaiDateNDaysFromNow(0)).toBe(thaiTodayISO());
  });

  it('A.3: days=1 is one day after thaiTodayISO()', () => {
    const today = thaiTodayISO();
    const tomorrow = thaiDateNDaysFromNow(1);
    // Difference must be exactly 1 day (assuming no DST — TH has none).
    const [y1, m1, d1] = today.split('-').map(Number);
    const [y2, m2, d2] = tomorrow.split('-').map(Number);
    const todayMs = Date.UTC(y1, m1 - 1, d1);
    const tomorrowMs = Date.UTC(y2, m2 - 1, d2);
    expect((tomorrowMs - todayMs) / 86400000).toBe(1);
  });

  it('A.4: days=30 is 30 days after today', () => {
    const today = thaiTodayISO();
    const future = thaiDateNDaysFromNow(30);
    const [y1, m1, d1] = today.split('-').map(Number);
    const [y2, m2, d2] = future.split('-').map(Number);
    const todayMs = Date.UTC(y1, m1 - 1, d1);
    const futureMs = Date.UTC(y2, m2 - 1, d2);
    expect((futureMs - todayMs) / 86400000).toBe(30);
  });

  it('A.5: days=-1 is one day before today (negative valid)', () => {
    const today = thaiTodayISO();
    const yesterday = thaiDateNDaysFromNow(-1);
    const [y1, m1, d1] = today.split('-').map(Number);
    const [y2, m2, d2] = yesterday.split('-').map(Number);
    const todayMs = Date.UTC(y1, m1 - 1, d1);
    const yesterdayMs = Date.UTC(y2, m2 - 1, d2);
    expect((todayMs - yesterdayMs) / 86400000).toBe(1);
  });

  it('A.6: invalid input returns empty string', () => {
    expect(thaiDateNDaysFromNow(NaN)).toBe('');
    expect(thaiDateNDaysFromNow(undefined)).toBe('');
    expect(thaiDateNDaysFromNow('foo')).toBe('');
  });

  it('A.7: matches semantically "N days from now in Bangkok"', () => {
    // The whole point of this helper: at any time of day in any TZ, the
    // returned date is the SAME ISO string as a Bangkok admin would
    // intuitively expect for "today + N days".
    // We test by verifying internal Bangkok-shift correctness.
    const N = 7;
    const target = new Date(Date.now() + N * 86400000 + 7 * 3600000);
    const expected = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`;
    expect(thaiDateNDaysFromNow(N)).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V95.B — backendClient.js assignCourseToCustomer expiry uses helper
// ═══════════════════════════════════════════════════════════════════════

describe('V95.B: backendClient.js assignCourseToCustomer expiry calc uses helper', () => {
  const SRC = READ('src/lib/backendClient.js');
  const CODE = stripComments(SRC);

  it('B.1: imports thaiDateNDaysFromNow from utils.js', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*\bthaiDateNDaysFromNow\b[^}]*\}\s*from\s*['"]\.\.\/utils\.js['"]/);
  });

  it('B.2: expiry assignment uses thaiDateNDaysFromNow(validityDays)', () => {
    expect(SRC).toMatch(/expiry\s*=\s*validityDays\s*>\s*0\s*\?\s*thaiDateNDaysFromNow\(validityDays\)/);
  });

  it('B.3: NO raw new Date(Date.now() + ...).toISOString().split T 0', () => {
    // Anti-regression: the pre-V95 pattern must NOT exist in code.
    expect(CODE).not.toMatch(/new Date\(Date\.now\(\)\s*\+[^)]*86400000[^)]*\)\.toISOString\(\)\.split\(['"]T['"]\)\[0\]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V95.C — courseExchange.js exchange-flow expiry uses helper
// ═══════════════════════════════════════════════════════════════════════

describe('V95.C: courseExchange.js exchange-flow expiry calc uses helper', () => {
  const SRC = READ('src/lib/courseExchange.js');
  const CODE = stripComments(SRC);

  it('C.1: imports thaiDateNDaysFromNow from utils.js', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiDateNDaysFromNow\s*\}\s*from\s*['"]\.\.\/utils\.js['"]/);
  });

  it('C.2: expiry assignment uses thaiDateNDaysFromNow(validityDays)', () => {
    expect(SRC).toMatch(/expiry\s*=\s*validityDays\s*>\s*0\s*\?\s*thaiDateNDaysFromNow\(validityDays\)/);
  });

  it('C.3: NO raw new Date(Date.now() + ...).toISOString().split T 0', () => {
    expect(CODE).not.toMatch(/new Date\(Date\.now\(\)\s*\+[^)]*86400000[^)]*\)\.toISOString\(\)\.split\(['"]T['"]\)\[0\]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V95.D — AV85 SKILL.md expanded to cover validity-date pattern + 5-entry list
// ═══════════════════════════════════════════════════════════════════════

describe('V95.D: AV85 invariant expanded for iter-3', () => {
  const SKILL = READ('.claude/skills/audit-anti-vibe-code/SKILL.md');

  it('D.1: AV85 grep pattern covers Date.now() + N*86400000 split T 0', () => {
    // Verify the iter-3 grep entry is present (substring checks, not regex).
    expect(SKILL).toContain('Date\\.now\\(\\)');
    expect(SKILL).toContain('86400000');
    expect(SKILL).toContain("split\\(['\"]T['\"]\\)");
    expect(SKILL).toMatch(/future-date arithmetic|validity-end/i);
  });

  it('D.2: lists thaiDateNDaysFromNow as canonical replacement', () => {
    expect(SKILL).toMatch(/thaiDateNDaysFromNow/);
  });

  it('D.3: sanctioned list cites DocumentPrintModal.jsx + documentPrintEngine.js (5 entries)', () => {
    expect(SKILL).toMatch(/DocumentPrintModal\.jsx:231/);
    expect(SKILL).toMatch(/documentPrintEngine\.js:450/);
  });

  it('D.4: V-entry required for 6th sanctioned exception', () => {
    expect(SKILL).toMatch(/6th[\s\S]*?V-entry|V-entry[\s\S]*?6th/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V95.E — V12-class anti-regression: utils.js helper export
// ═══════════════════════════════════════════════════════════════════════

describe('V95.E: utils.js exports thaiDateNDaysFromNow', () => {
  const SRC = READ('src/utils.js');

  it('E.1: function declaration present', () => {
    expect(SRC).toMatch(/export function thaiDateNDaysFromNow\s*\(/);
  });

  it('E.2: shifts UTC by +7h before extracting getUTC* (Bangkok arithmetic)', () => {
    expect(SRC).toMatch(/thaiDateNDaysFromNow[\s\S]*?7\s*\*\s*3600000/);
  });

  it('E.3: padStart for month + day', () => {
    expect(SRC).toMatch(/thaiDateNDaysFromNow[\s\S]*?padStart\(2,\s*['"]0['"]\)/);
  });

  it('E.4: returns "" on invalid input (Firestore-safe — V14)', () => {
    expect(SRC).toMatch(/thaiDateNDaysFromNow[\s\S]*?Number\.isFinite[\s\S]*?return ''/);
  });
});
