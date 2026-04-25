// ─── Phase 14.7.H follow-up G — JSDoc guard for TFP:1694 hook-order TDZ ──
//
// Background: TreatmentFormPage.jsx has a useEffect (the "dfEntry auto-
// populate" hook, ~line 1714) that consumes two upstream useMemo values
// (`treatmentCoursesForDf` ~1619 + `treatmentPeopleForDf` ~1683). The
// useMemo declarations MUST come BEFORE the useEffect or React's render
// pass throws TDZ ReferenceError ("Cannot access '<memo>' before
// initialization") → blank screen on every load (create + edit).
//
// There is NO eslint rule that catches this pattern — react-hooks/
// exhaustive-deps only validates dep ARRAY shape, not declaration order.
// The bug only surfaces at render time.
//
// This file source-greps the JSDoc guard added 2026-04-26 to lock the
// invariant. If a future refactor (a) moves the useEffect above either
// memo, or (b) strips the JSDoc warning block, these tests fail.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = READ('src/components/TreatmentFormPage.jsx');

describe('TFP-HG1: JSDoc guard block exists at the dfEntry auto-populate hook', () => {
  it('TFP-HG1.1: warning header "HOOK-ORDER INVARIANT" present', () => {
    expect(SRC).toMatch(/HOOK-ORDER INVARIANT/);
  });

  it('TFP-HG1.2: warning explicitly names DO NOT MOVE', () => {
    expect(SRC).toMatch(/DO NOT MOVE/);
  });

  it('TFP-HG1.3: warning lists both upstream memos by name', () => {
    expect(SRC).toMatch(/treatmentCoursesForDf/);
    expect(SRC).toMatch(/treatmentPeopleForDf/);
  });

  it('TFP-HG1.4: warning explains the TDZ failure mode', () => {
    expect(SRC).toMatch(/Temporal Dead Zone/);
    expect(SRC).toMatch(/TDZ/);
    expect(SRC).toMatch(/Cannot access[\s\S]{0,40}before initialization/);
  });

  it('TFP-HG1.5: warning explains symptom (BLANK SCREEN)', () => {
    expect(SRC).toMatch(/BLANK SCREEN/);
  });

  it('TFP-HG1.6: warning warns no ESLint rule catches this', () => {
    expect(SRC).toMatch(/react-hooks\/exhaustive-deps/);
    expect(SRC).toMatch(/NO ESLint/);
  });

  it('TFP-HG1.7: JSDoc block uses /** … */ form (so IDEs surface it on hover)', () => {
    // Match the opening of the JSDoc that precedes the useEffect.
    expect(SRC).toMatch(/\/\*\*\s*\n\s*\*\s*!!! HOOK-ORDER INVARIANT/);
  });
});

describe('TFP-HG2: ordering invariant verified by line-number positions', () => {
  // The actual structural guard: the upstream memos must appear BEFORE
  // the dfEntry useEffect in the source. We verify this with simple
  // line-number arithmetic so a future refactor that moves things gets
  // caught even if it forgets to update the JSDoc text.

  function findLineOf(needle, src = SRC) {
    const idx = src.indexOf(needle);
    if (idx < 0) return -1;
    return src.slice(0, idx).split('\n').length;
  }

  // Stable anchors — these substrings appear EXACTLY ONCE in the file
  // (verified manually). If they ever appear multiple times, the test
  // becomes ambiguous and should switch to a regex-based finder.
  const COURSES_MEMO_ANCHOR = 'const treatmentCoursesForDf = useMemo(';
  const PEOPLE_MEMO_ANCHOR = 'const treatmentPeopleForDf = useMemo(';
  const HOOK_GUARD_ANCHOR = '!!! HOOK-ORDER INVARIANT';
  const USEEFFECT_ANCHOR_AFTER_GUARD = 'setDfEntries((prev) =>';

  it('TFP-HG2.1: both upstream memos appear in source (anchors not drifted)', () => {
    expect(findLineOf(COURSES_MEMO_ANCHOR)).toBeGreaterThan(0);
    expect(findLineOf(PEOPLE_MEMO_ANCHOR)).toBeGreaterThan(0);
    expect(findLineOf(HOOK_GUARD_ANCHOR)).toBeGreaterThan(0);
    expect(findLineOf(USEEFFECT_ANCHOR_AFTER_GUARD)).toBeGreaterThan(0);
  });

  it('TFP-HG2.2: treatmentCoursesForDf memo is declared BEFORE the JSDoc guard', () => {
    expect(findLineOf(COURSES_MEMO_ANCHOR)).toBeLessThan(findLineOf(HOOK_GUARD_ANCHOR));
  });

  it('TFP-HG2.3: treatmentPeopleForDf memo is declared BEFORE the JSDoc guard', () => {
    expect(findLineOf(PEOPLE_MEMO_ANCHOR)).toBeLessThan(findLineOf(HOOK_GUARD_ANCHOR));
  });

  it('TFP-HG2.4: JSDoc guard is immediately followed by the useEffect (within 50 lines, no other hook between)', () => {
    const guardLine = findLineOf(HOOK_GUARD_ANCHOR);
    const useEffectBodyLine = findLineOf(USEEFFECT_ANCHOR_AFTER_GUARD);
    expect(useEffectBodyLine - guardLine).toBeLessThan(50);
    expect(useEffectBodyLine).toBeGreaterThan(guardLine);
  });

  it('TFP-HG2.5: no useState/useMemo/useEffect declared BETWEEN the JSDoc guard and the useEffect body', () => {
    const guardLine = findLineOf(HOOK_GUARD_ANCHOR);
    const useEffectBodyLine = findLineOf(USEEFFECT_ANCHOR_AFTER_GUARD);
    const between = SRC.split('\n').slice(guardLine, useEffectBodyLine - 1).join('\n');
    // Inside the JSDoc block, "useEffect" appears in prose; that's fine.
    // What we want to catch is a NEW hook *call* (useState/useMemo/useEffect)
    // that lands between the guard and the protected useEffect.
    // Strip the JSDoc body (lines starting with " * ") so prose doesn't trip the test.
    const stripped = between
      .split('\n')
      .filter(line => !/^\s*\*/.test(line) && !/^\s*\/\*\*/.test(line))
      .join('\n');
    expect(stripped).not.toMatch(/useState\(/);
    expect(stripped).not.toMatch(/useMemo\(/);
    // useEffect appears once — that's the guarded one. Not a regression.
    const useEffectCount = (stripped.match(/useEffect\(/g) || []).length;
    expect(useEffectCount).toBeLessThanOrEqual(1);
  });
});

describe('TFP-HG3: behavioural — pure simulate of the TDZ failure mode', () => {
  // We can't actually reproduce a TDZ on a memoised value at module
  // load (the issue is component-render-scoped, requires a React mount).
  // But we CAN demonstrate the contract: a value referenced before its
  // declaration in the same scope throws ReferenceError.
  //
  // This is a documentation-style test that explains the why and chains
  // a tiny reproducer so future readers see the failure mode clearly.

  it('TFP-HG3.1: const referenced before declaration throws ReferenceError (the failure mode)', () => {
    // This mirrors what happens to React render functions when a useEffect
    // tries to read a useMemo value that hasn't been declared yet in the
    // function body. The `let` declaration creates a TDZ; reading inside
    // the declaration window throws.
    expect(() => {
      // eslint-disable-next-line no-unused-vars, no-use-before-define
      const _read = laterDecl + 1;
      // eslint-disable-next-line prefer-const
      let laterDecl = 5;
      return _read;
    }).toThrow(ReferenceError);
  });

  it('TFP-HG3.2: const referenced AFTER declaration works (the working pattern)', () => {
    expect(() => {
      const declaredFirst = 5;
      const _read = declaredFirst + 1;
      return _read;
    }).not.toThrow();
  });
});
