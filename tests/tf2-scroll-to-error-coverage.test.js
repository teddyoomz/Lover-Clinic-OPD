// TF2 audit (2026-05-04) — TreatmentFormPage scrollToError data-field coverage
//
// Audit finding (HIGH): scrollToError fires alert + does
// document.querySelector('[data-field="<key>"]') and silently no-ops when
// the field has no matching node. Production-affecting because alert says
// "กรุณาเลือกแพทย์" but the page never scrolls to it. CLAUDE.md historical
// bug #8 was the original (seller/payment); this audit re-discovered it
// across the whole form.
//
// This test bank source-greps TFP for both:
//   (1) every error key that scrollToError() is currently called with, AND
//   (2) every per-row group that future validators might target
// to assert each has a matching `data-field=` attribute. If a developer
// adds a new scrollToError('xyz', ...) call and forgets the JSX anchor,
// the corresponding coverage assertion below WILL fail at build time.
//
// Pair with: src/lib/scrollToFieldError.js (canonical resolver) and the
// data-field tag registry comment block at the top of TreatmentFormPage.jsx.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TFP_PATH = resolve(__dirname, '..', 'src', 'components', 'TreatmentFormPage.jsx');
const RESOLVER_PATH = resolve(__dirname, '..', 'src', 'lib', 'scrollToFieldError.js');

const tfpSrc = readFileSync(TFP_PATH, 'utf8');
const resolverSrc = readFileSync(RESOLVER_PATH, 'utf8');

// Extract every `scrollToError('<key>', ...)` literal-key call from TFP. The
// dynamic call `scrollToError(fillLaterMissing.id, ...)` is excluded — that
// targets a per-treatment-item rowId already wired via `data-field={item.id}`
// (line ~3970).
function extractScrollToErrorLiteralKeys(src) {
  const re = /scrollToError\(\s*['"]([^'"]+)['"]/g;
  const out = new Set();
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

// Grep helper: assert a `data-field=` containing the given literal key text
// appears in the JSX. Handles both `data-field="key"` (string-literal) and
// `data-field={`tpl-${i}`}` (template). Caller passes the literal substring
// the rendered DOM should contain (e.g. `paymentChannels[`).
function assertHasDataField(literal) {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`data-field=(?:"${escaped}|\\{\`?[^}]*${escaped})`);
  expect(tfpSrc).toMatch(re);
}

describe('TF2 — scrollToError data-field coverage', () => {
  describe('Resolver contract', () => {
    it('TF2.A.1 resolver looks up by data-field OR name', () => {
      // Documents the contract these JSX assertions rely on.
      expect(resolverSrc).toMatch(/\[data-field="\$\{safe\}"\], \[name="\$\{safe\}"\]/);
    });
  });

  describe('Active validator keys → JSX anchors', () => {
    const activeKeys = extractScrollToErrorLiteralKeys(tfpSrc);

    it('TF2.B.1 every literal scrollToError key has a data-field anchor', () => {
      const missing = [];
      for (const key of activeKeys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`data-field=(?:"${escaped}"|\\{\`?${escaped})`);
        if (!re.test(tfpSrc)) missing.push(key);
      }
      expect(missing).toEqual([]);
    });

    it('TF2.B.2 doctor anchor present', () => assertHasDataField('doctor'));
    it('TF2.B.3 treatmentDate anchor present', () => assertHasDataField('treatmentDate'));
    it('TF2.B.4 sellers section wrapper anchor present', () => assertHasDataField('sellers'));
    it('TF2.B.5 paymentChannels section wrapper anchor present', () => assertHasDataField('paymentChannels'));
    it('TF2.B.6 courseSection anchor present', () => assertHasDataField('courseSection'));
  });

  describe('Per-row anchors (forward-looking — drift catcher)', () => {
    it('TF2.C.1 sellers per-row anchor exists', () => assertHasDataField('sellers['));
    it('TF2.C.2 paymentChannels per-row anchor exists', () => assertHasDataField('paymentChannels['));
    it('TF2.C.3 medications per-row anchor exists', () => assertHasDataField('medications['));
    it('TF2.C.4 consumables per-row anchor exists', () => assertHasDataField('consumables['));
    it('TF2.C.5 purchasedItems per-row anchor exists', () => assertHasDataField('purchasedItems['));
    it('TF2.C.6 paymentDate anchor exists', () => assertHasDataField('paymentDate'));
    it('TF2.C.7 treatment item rows use data-field={item.id}', () => {
      // The fill-later qty validator throws scrollToError(fillLaterMissing.id, ...)
      // which depends on every treatmentItem row carrying data-field={item.id}.
      expect(tfpSrc).toMatch(/data-field=\{item\.id\}/);
    });
  });

  describe('Vital-sign per-field anchors', () => {
    it('TF2.D.1 vitals.<key> template anchor exists', () => {
      // Two vitals grids both use `data-field={`vitals.${key}`}`.
      expect(tfpSrc).toMatch(/data-field=\{`vitals\.\$\{key\}`\}/);
    });
    it('TF2.D.2 vitals.oxygenSaturation literal anchor exists', () => {
      expect(tfpSrc).toMatch(/data-field="vitals\.oxygenSaturation"/);
    });
  });

  describe('Documentation lock', () => {
    it('TF2.E.1 data-field tag registry comment block present', () => {
      expect(tfpSrc).toMatch(/data-field tag registry \(TF2 audit/);
    });
    it('TF2.E.2 registry mentions every per-row anchor family', () => {
      const families = [
        'purchasedItems[<idx>]',
        'medications[<idx>]',
        'consumables[<idx>]',
        'sellers[<idx>]',
        'paymentChannels[<idx>]',
      ];
      for (const f of families) expect(tfpSrc).toContain(f);
    });
  });

  describe('Anti-regression: no scrollToError without anchor', () => {
    it('TF2.F.1 no orphaned scrollToError(\'<lit>\', ...) without JSX anchor', () => {
      // Repeat of TF2.B.1 phrased as the anti-regression check the audit
      // wants: any new scrollToError literal-key call must add the anchor.
      const keys = [...extractScrollToErrorLiteralKeys(tfpSrc)];
      const orphans = keys.filter(k => {
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return !new RegExp(`data-field=(?:"${escaped}"|\\{\`?${escaped})`).test(tfpSrc);
      });
      expect({ orphans, total: keys.length }).toEqual({ orphans: [], total: keys.length });
    });
  });
});
