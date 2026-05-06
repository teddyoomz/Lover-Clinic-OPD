// RP1 regression guard (2026-04-30) — IIFE-in-JSX is a Vite-OXC parser bomb.
//
// Pattern banned per CLAUDE.md `.claude/rules/03-stack.md` § Vite OXC:
//   ห้าม IIFE `{(() => {...})()}` ใน JSX → parser crash.
//   ใช้ pre-computed variable หรือ extract เป็น component.
//
// Currently passing build because Rolldown is tolerant of the OXC ban,
// but the next Vite/Rolldown upgrade can flip latent → hard-crash. The
// audit-react-patterns RP1 invariant flagged 28 sites across 9 files
// before the 2026-04-30 sweep. After the sweep, every check below MUST
// return zero matches.
//
// This test reads each previously-affected file and asserts:
//   1. zero `})()}` close-brace IIFE-in-JSX
//   2. zero `})() : (` ternary IIFE-in-JSX
//   3. zero `})() : null` ternary IIFE-in-JSX (alt form)
//   4. NEGATIVE form `(() => {` followed by closing `})()` within a
//      JSX expression bracket `{...}` — covers inline one-liner IIFEs.
//
// Plus a directory-wide sweep on `src/**/*.jsx` to catch any
// regression introduced by future PRs.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(process.cwd());

// Files that had IIFE-in-JSX before the 2026-04-30 sweep. Each MUST be
// IIFE-in-JSX-free post-sweep.
const SWEPT_FILES = Object.freeze([
  'src/pages/AdminDashboard.jsx',
  'src/components/backend/AppointmentCalendarView.jsx',
  'src/components/backend/SalePrintView.jsx',
  'src/components/backend/QuotationPrintView.jsx',
  'src/components/ClinicSettingsPanel.jsx',
  'src/components/backend/CustomerDetailView.jsx',
  'src/components/backend/SaleTab.jsx',
  'src/components/backend/DfEntryModal.jsx',
  'src/components/PrintTemplates.jsx',
]);

const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');

function listSourceFiles(dirRel) {
  const root = resolve(REPO, dirRel);
  const out = [];
  const walk = (absDir, relDir) => {
    for (const entry of readdirSync(absDir)) {
      const abs = resolve(absDir, entry);
      const rel = relDir ? `${relDir}/${entry}` : entry;
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        walk(abs, rel);
      } else if (/\.(js|jsx)$/.test(entry)) {
        out.push(`${dirRel}/${rel}`.replace(/\\/g, '/'));
      }
    }
  };
  walk(root, '');
  return out;
}

/**
 * Strip JS comments so the IIFE-in-JSX literal can be discussed in
 * doc-strings without false-positive matches. We strip block comments
 * `/* ... *\/` and line comments `// ...` greedily; this is safe for
 * the LoverClinic codebase (no `//` substrings appear inside string
 * literals on the affected files). Side benefit: the test file's own
 * regex literals are inside a block comment-free section, so they
 * survive stripping.
 */
function stripJsComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/\/\/[^\n]*/g, '');
  return out;
}

/**
 * Count occurrences of the canonical IIFE-in-JSX close pattern in `src`.
 * Specifically `})()}`  — close-brace + close-paren + invocation + JSX-close.
 */
function countIifeInJsxClose(src) {
  return (stripJsComments(src).match(/\}\)\(\)\}/g) || []).length;
}

/**
 * Count ternary IIFE-in-JSX `})() : (` and `})() : null` patterns.
 */
function countIifeInJsxTernary(src) {
  const stripped = stripJsComments(src);
  const a = (stripped.match(/\}\)\(\) : \(/g) || []).length;
  const b = (stripped.match(/\}\)\(\) : null/g) || []).length;
  return a + b;
}

/**
 * Count inline one-liner IIFEs that reside inside a JSX expression. We
 * approximate by matching `\{[^{}]*\(\(\) => \{[^{}]*?\}\)\(\)`. Limited
 * lookbehind so we may have false negatives across multi-line spans, but
 * good enough for the canonical inline pattern.
 */
function countIifeInJsxInline(src) {
  const re = /\{[^{}]*?\(\(\)\s*=>\s*\{[^{}]*?\}\)\(\)/g;
  return (stripJsComments(src).match(re) || []).length;
}

describe('RP1 — no IIFE-in-JSX in previously-affected files', () => {
  for (const rel of SWEPT_FILES) {
    test(`${rel} has zero \`})()}\` IIFE-in-JSX close`, () => {
      const src = read(rel);
      expect(countIifeInJsxClose(src)).toBe(0);
    });

    test(`${rel} has zero ternary IIFE-in-JSX (\`})() : (\` / \`})() : null\`)`, () => {
      const src = read(rel);
      expect(countIifeInJsxTernary(src)).toBe(0);
    });

    test(`${rel} has zero inline one-liner IIFE-in-JSX`, () => {
      const src = read(rel);
      expect(countIifeInJsxInline(src)).toBe(0);
    });
  }
});

describe('RP1 — directory-wide sweep against future regressions', () => {
  test('no `})()}` IIFE-in-JSX close anywhere under src/', () => {
    const files = listSourceFiles('src');
    const violations = [];
    for (const rel of files) {
      try {
        const src = read(rel);
        const count = countIifeInJsxClose(src);
        if (count > 0) violations.push(`${rel}: ${count}`);
      } catch {
        // Skip unreadable files.
      }
    }
    expect(violations, `IIFE-in-JSX close pattern found in:\n${violations.join('\n')}`).toEqual([]);
  });

  test('no ternary IIFE-in-JSX (`})() : (` / `})() : null`) anywhere under src/', () => {
    const files = listSourceFiles('src');
    const violations = [];
    for (const rel of files) {
      try {
        const src = read(rel);
        const count = countIifeInJsxTernary(src);
        if (count > 0) violations.push(`${rel}: ${count}`);
      } catch {
        // Skip unreadable files.
      }
    }
    expect(violations, `Ternary IIFE-in-JSX pattern found in:\n${violations.join('\n')}`).toEqual([]);
  });
});

describe('RP1 — tests file itself uses literal pattern strings (self-test)', () => {
  test('test file has the exact regex literals it claims to enforce', () => {
    // This guards against an accidental regex edit that turns the test
    // into a no-op (false-green). Read the test file and assert the
    // critical regex strings still appear.
    const self = read('tests/rp1-no-iife-in-jsx.test.js');
    expect(self).toContain('\\}\\)\\(\\)\\}');
    expect(self).toContain('\\}\\)\\(\\) : \\(');
    expect(self).toContain('\\}\\)\\(\\) : null');
  });
});
