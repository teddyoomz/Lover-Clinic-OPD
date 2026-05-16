// tests/v77-fix2-v38-spread-order-regression.test.js
//
// V77-fix2 + V77-fix3 (2026-05-16 NIGHT — S-4 audit-invariant extension).
//
// V38 (2026-05-07) mass-swept 85+ callsites across 15 files to the safe
// `{ ...d.data(), id: d.id }` order. V77 (2026-05-16) regressed by adding
// 6 NEW callsites with the broken `{ id: d.id, ...d.data() }` pattern across
// the whole-fleet backup + restore flow + 4 CLI scripts.
//
// AV17 grep WAS documented but the workflow didn't run it before the V77
// merge. This test bank locks the safe pattern at all V77 callsites + adds
// a project-wide negative-regression sweep so the V77-class re-introduction
// fails the build before it ships.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_FILE = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// V77 fix2/fix3 audit surface — every site that V77 touched MUST use the
// safe spread order. Adding a 7th site without updating this list means a
// review was skipped.
const V77_AUDITED_SITES = [
  'api/admin/whole-fleet-customer-backup-export.js',
  'api/admin/whole-fleet-customer-restore.js',
  'scripts/customer-backup-export.mjs',
  'scripts/whole-fleet-customer-restore.mjs',
  'scripts/customer-restore.mjs',
  'scripts/customer-delete-with-backup.mjs',
];

// Broken pattern variants — ARRAY MAP / FILTER callsite context only.
// Single-doc getDoc patterns (`{ id: snap.id, ...snap.data() }` in backendClient.js
// canonical `await getDoc(...)` reads) are a SEPARATE class — deferred to a
// follow-up sweep + AV17-extension. This regex specifically targets multi-
// doc readers where stray `data.id` legacy fields are the documented V38
// risk.
const BROKEN_PATTERNS = [
  // .docs.map(d => ({ id: d.id, ...d.data() }))
  /\.docs\.map\(\s*(?:\(\s*)?d\s*(?:\)\s*)?=>\s*\(?\s*\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}/,
  /\.docs\.map\(\s*(?:\(\s*)?doc\s*(?:\)\s*)?=>\s*\(?\s*\{\s*id:\s*doc\.id,\s*\.\.\.doc\.data\(\)\s*\}/,
  // .docs.filter(d => ... { id: d.id, ...d.data() })
  /\.docs\.filter\(\s*(?:\(\s*)?d\s*(?:\)\s*)?=>[^\n]*\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}/,
];

// Safe pattern variants (...d.data() first, id last).
const SAFE_PATTERNS = [
  /\{\s*\.\.\.d\.data\(\),\s*id:\s*d\.id\s*\}/,
  /\{\s*\.\.\.doc\.data\(\),\s*id:\s*doc\.id\s*\}/,
];

describe('V77-fix2 + V77-fix3 — V38 spread-order regression locks', () => {
  describe('R1: V77 audited sites use SAFE spread order', () => {
    for (const rel of V77_AUDITED_SITES) {
      it(`R1.${rel}: contains the safe pattern at every \`.docs.map\` call`, () => {
        const src = SRC_FILE(rel);
        // At least one safe spread present (each site reads >=1 collection)
        const hasSafe = SAFE_PATTERNS.some((p) => p.test(src));
        expect(hasSafe).toBe(true);
      });
      it(`R1.${rel}: contains NO broken patterns (V38/V77 lock)`, () => {
        const src = SRC_FILE(rel);
        for (const pat of BROKEN_PATTERNS) {
          expect(src).not.toMatch(pat);
        }
      });
    }
  });

  describe('R2: V77 fix markers present (institutional memory)', () => {
    it('R2.1: whole-fleet-customer-backup-export.js mentions V77-fix2/3 + V38 lesson', () => {
      const src = SRC_FILE('api/admin/whole-fleet-customer-backup-export.js');
      expect(src).toMatch(/V77-fix2.*P1-1.*V38|V38 spread-order/);
    });
    it('R2.2: whole-fleet-customer-restore.js mentions V77-fix2 + V38 lesson', () => {
      const src = SRC_FILE('api/admin/whole-fleet-customer-restore.js');
      expect(src).toMatch(/V77-fix2.*P1-1.*V38|V77-fix2.*spread/);
    });
    it('R2.3: customer-backup-export.mjs CLI mirror', () => {
      const src = SRC_FILE('scripts/customer-backup-export.mjs');
      expect(SAFE_PATTERNS.some((p) => p.test(src))).toBe(true);
    });
    it('R2.4: whole-fleet-customer-restore.mjs CLI mirror', () => {
      const src = SRC_FILE('scripts/whole-fleet-customer-restore.mjs');
      expect(src).toMatch(/V77-fix2.*spread|V38 lesson/);
    });
  });

  describe('R3: project-wide sweep — V77-class drift catcher', () => {
    // Glob all api/admin/ + src/lib/ + src/components/ + src/pages/ +
    // src/hooks/ — these are the production-runtime surfaces. diag-* /
    // e2e-* / phase-* scripts are excluded (one-shot diagnostic scripts,
    // not runtime; lower-priority sweep separately).
    const RUNTIME_GLOBS = [
      'api/admin',
      'src/lib',
      'src/components',
      'src/pages',
      'src/hooks',
    ];

    function* walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) yield full;
      }
    }

    it('R3.1: NO broken-spread pattern in any runtime file', () => {
      const offenders = [];
      for (const baseDir of RUNTIME_GLOBS) {
        const abs = path.join(ROOT, baseDir);
        for (const filePath of walk(abs)) {
          const src = fs.readFileSync(filePath, 'utf8');
          for (const pat of BROKEN_PATTERNS) {
            if (pat.test(src)) {
              offenders.push({ file: path.relative(ROOT, filePath), pat: pat.source });
              break;
            }
          }
        }
      }
      if (offenders.length > 0) {
        // Print the offenders inline so failure message tells you where.
        const msg = offenders.map((o) => `${o.file}: ${o.pat}`).join('\n');
        throw new Error(
          `V77-fix3 (S-4): broken-spread pattern found in runtime files.\n${msg}\n` +
            'Fix: change `{id: d.id, ...d.data()}` → `{...d.data(), id: d.id}` ' +
            'per V38 lesson (docId always wins over stray data.id).'
        );
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('R4: AV17 SKILL.md entry references V77 regression class', () => {
    it('R4.1: AV17 still active in audit-anti-vibe-code/SKILL.md', () => {
      const src = SRC_FILE('.agents/skills/audit-anti-vibe-code/SKILL.md');
      expect(src).toMatch(/### AV17 — `snap\.docs\.map` spread order/);
    });
  });
});
