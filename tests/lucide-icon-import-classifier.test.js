// Lucide-icon import classifier (2026-07-19) — V163-class tripwire at the JSX
// boundary. Found live by the extended-test un-quarantine sweep:
// PermissionGroupsTab rendered <Loader2/> at the delete-busy branch without
// importing it — build-invisible (undeclared identifier → global lookup) →
// runtime ReferenceError the moment a delete was in-flight → React unmounted
// the tab (black screen on permission-group delete; V80/V163 family).
//
// Invariant: every JSX render of a lucide icon name must be imported (from
// lucide-react or any module) or locally defined IN THAT FILE. The vocabulary
// is derived from the project's own lucide imports, so new icons auto-enroll.
// Comments and strings are stripped before scanning (JSDoc "<X>" false-positive
// lesson from the initial sweep).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(jsx|js)$/.test(e)) files.push(p);
  }
})(ROOT);

// single-pass comment strip (the V67 STRIPPED-helper lesson: one alternation,
// never sequential passes that mis-pair // inside strings with /* openers)
const strip = (src) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');

describe('LIC — lucide icon JSX usage is always imported', () => {
  it('LIC.1 no file renders a lucide icon it never imported', () => {
    const lucideVocab = new Set();
    const parsed = files.map((f) => {
      const raw = readFileSync(f, 'utf8');
      const src = strip(raw);
      for (const m of src.matchAll(/import \{([^}]*)\} from ['"]lucide-react['"]/g)) {
        for (const piece of m[1].split(',')) {
          const name = piece.trim().split(/\s+as\s+/).pop().trim();
          if (/^[A-Za-z0-9_$]+$/.test(name)) lucideVocab.add(name);
        }
      }
      return { f, src };
    });

    const violations = [];
    for (const { f, src } of parsed) {
      const imported = new Set();
      for (const m of src.matchAll(/import\s+(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
        if (m[1]) imported.add(m[1]);
        if (m[2]) for (const piece of m[2].split(',')) {
          const name = piece.trim().split(/\s+as\s+/).pop().trim();
          if (/^[A-Za-z0-9_$]+$/.test(name)) imported.add(name);
        }
      }
      const localDefs = new Set();
      for (const m of src.matchAll(/(?:function|const|class|let|var)\s+([A-Z][A-Za-z0-9_$]*)/g)) localDefs.add(m[1]);
      for (const m of src.matchAll(/<([A-Z][A-Za-z0-9_$]*)[\s/>]/g)) {
        const name = m[1];
        if (!lucideVocab.has(name)) continue;
        if (imported.has(name) || localDefs.has(name)) continue;
        violations.push(`${path.relative(process.cwd(), f)} <${name}> rendered but never imported`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('LIC.2 the PermissionGroupsTab regression stays fixed (Loader2 imported)', () => {
    const src = readFileSync(path.resolve(process.cwd(), 'src/components/backend/PermissionGroupsTab.jsx'), 'utf8');
    expect(src).toMatch(/import \{[^}]*Loader2[^}]*\} from 'lucide-react'/);
  });
});
