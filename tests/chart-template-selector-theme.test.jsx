// ─── ChartTemplateSelector CSS-var migration tests — Polish 2026-04-26 ──
// CT1 group — verifies that hardcoded hex / gray Tailwind colors were
// replaced by `var(--*)` references defined in src/index.css. Teal accent
// is preserved (intentional brand constant).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourcePath = resolve(__dirname, '..', 'src/components/ChartTemplateSelector.jsx');
const source = readFileSync(sourcePath, 'utf-8');

// Strip JS comments so the test regex doesn't false-positive on the
// historical-context comment block at line 123 ("`isDark ? <hex> : <gray>`")
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const codeOnly = stripComments(source);

describe('CT1 — ChartTemplateSelector CSS vars (Polish 2026-04-26)', () => {
  describe('CT1.A — Hardcoded color removal', () => {
    it('CT1.A.1 NO bg-[#...] hex literals (live code)', () => {
      // Expects all hex backgrounds replaced with var(--bg-*)
      expect(codeOnly).not.toMatch(/bg-\[#[0-9a-fA-F]{3,6}\]/);
    });

    it('CT1.A.2 NO border-[#...] hex literals (live code)', () => {
      expect(codeOnly).not.toMatch(/border-\[#[0-9a-fA-F]{3,6}\]/);
    });

    it('CT1.A.3 NO text-gray-{300,400,500,600} (live code)', () => {
      expect(codeOnly).not.toMatch(/text-gray-(300|400|500|600)\b/);
    });

    it('CT1.A.4 NO bg-gray-{50,100,200} (live code)', () => {
      expect(codeOnly).not.toMatch(/bg-gray-(50|100|200)\b/);
    });

    it('CT1.A.5 NO bg-white/5 (replaced with var(--bg-input))', () => {
      expect(codeOnly).not.toMatch(/bg-white\/5\b/);
    });

    it('CT1.A.6 NO `isDark ? ... : ...` ternaries in JSX className', () => {
      // The `isDark` prop is still ACCEPTED by the function signature (back-compat
      // with parent ChartSection that passes it) but should not gate any
      // className branching.
      const ternaryMatches = codeOnly.match(/isDark\s*\?[^}]+:[^}]+/g) || [];
      expect(ternaryMatches).toEqual([]);
    });
  });

  describe('CT1.B — CSS var adoption', () => {
    it('CT1.B.1 uses var(--bg-card) for primary card background', () => {
      expect(codeOnly).toMatch(/bg-\[var\(--bg-card\)\]/);
    });

    it('CT1.B.2 uses var(--bg-elevated) for modal wrapper', () => {
      expect(codeOnly).toMatch(/bg-\[var\(--bg-elevated\)\]/);
    });

    it('CT1.B.3 uses var(--bg-hover) for tab/pill backgrounds', () => {
      expect(codeOnly).toMatch(/bg-\[var\(--bg-hover\)\]/);
    });

    it('CT1.B.4 uses var(--bd) for default borders', () => {
      expect(codeOnly).toMatch(/border-\[var\(--bd\)\]/);
    });

    it('CT1.B.5 uses var(--bd-strong) for strong borders', () => {
      expect(codeOnly).toMatch(/border-\[var\(--bd-strong\)\]/);
    });

    it('CT1.B.6 uses var(--tx-muted) for muted text', () => {
      expect(codeOnly).toMatch(/text-\[var\(--tx-muted\)\]/);
    });
  });

  describe('CT1.C — Brand accent preservation', () => {
    it('CT1.C.1 keeps teal-500 accent (brand color)', () => {
      // Teal is intentional and should survive the migration unchanged.
      expect(codeOnly).toMatch(/teal-500/);
    });

    it('CT1.C.2 keeps teal-400 hover (brand variant)', () => {
      expect(codeOnly).toMatch(/teal-400/);
    });

    it('CT1.C.3 keeps red-500 for delete button (semantic — not a marker)', () => {
      // The "ลบ" button uses red — that's destructive semantic, intentional.
      // Different from the asterisk red issue.
      expect(codeOnly).toMatch(/bg-red-500/);
    });
  });

  describe('CT1.D — isDark prop back-compat', () => {
    it('CT1.D.1 isDark prop still in signature (parent passes it)', () => {
      // Signature kept so existing callers don't break. The prop is
      // accepted but unused by className branching.
      expect(source).toMatch(/function\s+ChartTemplateSelector\s*\(\s*\{[^}]*isDark[^}]*\}/s);
    });
  });
});
