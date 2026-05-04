// TF3 audit (2026-05-04) — TreatmentFormPage a11y coverage
//
// TFP (~4780 LOC) is the most-used backend form in the app. The TF2 audit
// shipped data-field anchors so scrollToError works reliably. TF3 layers
// the SR-equivalent on top: every input that scrollToError targets must
// also gain aria-invalid + aria-describedby pointing at a role="alert"
// FieldError block, mirroring CustomerCreatePage / SaleTab (commit f88f23e).
//
// Source-grep regression bank — locks the wiring shipped in this turn so
// future refactors can't strip it silently. WCAG 2.2 1.3.1 + 4.1.3.
//
// Pair with:
//   - tests/tf2-scroll-to-error-coverage.test.js (data-field anchors)
//   - tests/a11y-aria-coverage.test.jsx (canonical pattern in other forms)

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TFP_PATH = resolve(__dirname, '..', 'src', 'components', 'TreatmentFormPage.jsx');
const TFP = readFileSync(TFP_PATH, 'utf8');

describe('TF3 — TreatmentFormPage a11y wiring', () => {

  // ───── Helpers ─────────────────────────────────────────────────────────────
  describe('TF3.A — Helpers + state plumbing', () => {
    test('TF3.A.1 — declares fieldErrors state alongside `error`', () => {
      expect(TFP).toMatch(/const \[fieldErrors, setFieldErrors\] = useState\(\{\}\)/);
    });

    test('TF3.A.2 — defines ariaErrProps helper that emits aria-invalid + aria-describedby', () => {
      expect(TFP).toMatch(/const ariaErrProps\s*=\s*\(field\)\s*=>/);
      // Must surface BOTH aria-invalid AND aria-describedby keys — mirrors
      // CustomerCreatePage exactly so screen-reader behaviour is consistent.
      expect(TFP).toMatch(/'aria-invalid'/);
      expect(TFP).toMatch(/'aria-describedby'/);
    });

    test('TF3.A.3 — defines FieldError component rendering role="alert" + id="err-{field}"', () => {
      expect(TFP).toMatch(/const FieldError\s*=\s*\(\{\s*field\s*\}\)\s*=>/);
      expect(TFP).toMatch(/role="alert"/);
      expect(TFP).toMatch(/id=\{`err-\$\{field\}`\}/);
    });

    test('TF3.A.4 — defines clearFieldError helper used by per-field setters', () => {
      expect(TFP).toMatch(/const clearFieldError\s*=\s*\(field\)\s*=>/);
      // Must be safe-by-default (no-op when no error already pending).
      expect(TFP).toMatch(/setFieldErrors\(\(prev\)\s*=>\s*\(prev\[field\]/);
    });

    test('TF3.A.5 — scrollToError populates fieldErrors so aria-describedby fires', () => {
      // Drift catcher: if a future refactor splits the visual + SR paths,
      // the SR block goes silent. Lock the population in scrollToError.
      // Wider scan window (800 chars) accommodates the inline TF3 comment block.
      const m = TFP.match(/setError\(msg\);[\s\S]{0,800}?if \(fieldAttr\) setFieldErrors/);
      expect(m).toBeTruthy();
    });

    test('TF3.A.6 — handleSubmit clears fieldErrors at start (re-submit safety)', () => {
      const m = TFP.match(/handleSubmit = async \(\)[\s\S]{0,400}?setFieldErrors\(\{\}\)/);
      expect(m).toBeTruthy();
    });
  });

  // ───── Required-field input wiring ─────────────────────────────────────────
  describe('TF3.B — ariaErrProps spread on each validated input', () => {
    test('TF3.B.1 — at least 8 ariaErrProps spreads across the form', () => {
      const callSites = (TFP.match(/\{\.\.\.ariaErrProps\(/g) || []).length;
      expect(callSites).toBeGreaterThanOrEqual(8);
    });

    test('TF3.B.2 — doctor select wires ariaErrProps + FieldError', () => {
      // doctor select sits inside data-field="doctor". The select itself
      // must spread ariaErrProps('doctor') so SR users know it's invalid.
      // 800-char window accommodates the multi-line select declaration.
      expect(TFP).toMatch(/data-field="doctor"[\s\S]{0,800}?ariaErrProps\('doctor'\)/);
      expect(TFP).toMatch(/<FieldError field="doctor"/);
    });

    test('TF3.B.3 — treatmentDate wrapper wires ariaErrProps + FieldError', () => {
      expect(TFP).toMatch(/data-field="treatmentDate"[\s\S]{0,200}?ariaErrProps\('treatmentDate'\)/);
      expect(TFP).toMatch(/<FieldError field="treatmentDate"/);
    });

    test('TF3.B.4 — sellers section wires ariaErrProps + FieldError', () => {
      expect(TFP).toMatch(/data-field="sellers"[\s\S]{0,200}?ariaErrProps\('sellers'\)/);
      expect(TFP).toMatch(/<FieldError field="sellers"/);
    });

    test('TF3.B.5 — paymentChannels wrapper wires ariaErrProps + FieldError', () => {
      expect(TFP).toMatch(/data-field="paymentChannels"[\s\S]{0,200}?ariaErrProps\('paymentChannels'\)/);
      expect(TFP).toMatch(/<FieldError field="paymentChannels"/);
    });

    test('TF3.B.6 — paymentDate wrapper wires ariaErrProps + FieldError', () => {
      expect(TFP).toMatch(/data-field="paymentDate"[\s\S]{0,200}?ariaErrProps\('paymentDate'\)/);
      expect(TFP).toMatch(/<FieldError field="paymentDate"/);
    });

    test('TF3.B.7 — courseSection wrapper wires ariaErrProps + FieldError', () => {
      expect(TFP).toMatch(/data-field="courseSection"[\s\S]{0,200}?ariaErrProps\('courseSection'\)/);
      expect(TFP).toMatch(/<FieldError field="courseSection"/);
    });

    test('TF3.B.8 — per-row treatmentItem qty input spreads ariaErrProps(item.id)', () => {
      // The fill-later qty validator throws scrollToError(fillLaterMissing.id, ...)
      // → row.id keys both data-field AND fieldErrors. Wire both pathways.
      expect(TFP).toMatch(/aria-label=\{`จำนวน \$\{item\.name\}[^`]*`\}\s*\n?\s*\{\.\.\.ariaErrProps\(item\.id\)\}/);
    });

    test('TF3.B.9 — per-row consumables qty input spreads ariaErrProps(`consumables[${i}]`)', () => {
      expect(TFP).toMatch(/data-field=\{`consumables\[\$\{i\}\]`\}[\s\S]{0,200}?ariaErrProps\(`consumables\[\$\{i\}\]`\)/);
    });

    test('TF3.B.10 — per-row purchasedItems wraps ariaErrProps(`purchasedItems[${idx}]`)', () => {
      expect(TFP).toMatch(/data-field=\{`purchasedItems\[\$\{idx\}\]`\}[\s\S]{0,200}?ariaErrProps\(`purchasedItems\[\$\{idx\}\]`\)/);
    });
  });

  // ───── Per-field clear on edit ──────────────────────────────────────────────
  describe('TF3.C — clearFieldError on per-field setters', () => {
    test('TF3.C.1 — doctor select onChange clears doctor error as user picks', () => {
      // Avoids stale aria-invalid lingering after the user corrects the field.
      expect(TFP).toMatch(/setDoctorId\(e\.target\.value\); clearFieldError\('doctor'\)/);
    });

    test('TF3.C.2 — treatmentDate onChange clears treatmentDate error', () => {
      expect(TFP).toMatch(/setTreatmentDate\(v\); clearFieldError\('treatmentDate'\)/);
    });

    test('TF3.C.3 — paymentDate onChange clears paymentDate error', () => {
      expect(TFP).toMatch(/setPaymentDate\(v\); clearFieldError\('paymentDate'\)/);
    });

    test('TF3.C.4 — at least 5 clearFieldError call sites overall', () => {
      const callSites = (TFP.match(/clearFieldError\(/g) || []).length;
      // 4 explicit sites + helper definition itself = 5+
      expect(callSites).toBeGreaterThanOrEqual(5);
    });
  });

  // ───── Thai aria-label coverage ────────────────────────────────────────────
  describe('TF3.D — Thai aria-label on icon-only / ambiguous controls', () => {
    test('TF3.D.1 — ≥ 25 aria-label="..." attributes total (was ~12 before TF3)', () => {
      // Locks that the audit added at least ~13 new labels on top of the
      // pre-existing per-row buttons that already had labels.
      const matches = (TFP.match(/aria-label=/g) || []);
      expect(matches.length).toBeGreaterThanOrEqual(25);
    });

    test('TF3.D.2 — every static aria-label string is Thai (per task constraint)', () => {
      // Pull every aria-label="..." literal (template strings are also Thai but
      // harder to assert in regex form; static labels cover the Thai-only contract).
      const labels = [...TFP.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
      expect(labels.length).toBeGreaterThanOrEqual(5);
      const thaiRe = /[฀-๿]/;
      const allThai = labels.every((s) => thaiRe.test(s));
      expect(allThai).toBe(true);
    });

    test('TF3.D.3 — sellers row controls have per-row aria-label (เปิดใช้/เลือก/เปอร์เซ็นต์/ยอด)', () => {
      // Four controls per seller row x 3 rows = 12 aria-label expressions
      // (or fewer if templated). Just lock that the Thai labels exist.
      expect(TFP).toMatch(/aria-label=\{`เปิดใช้พนักงานขายแถวที่ \$\{idx \+ 1\}`\}/);
      expect(TFP).toMatch(/aria-label=\{`เลือกพนักงานขายแถวที่ \$\{idx \+ 1\}`\}/);
      expect(TFP).toMatch(/aria-label=\{`เปอร์เซ็นต์คอมมิชชันแถวที่ \$\{idx \+ 1\}`\}/);
    });

    test('TF3.D.4 — paymentChannels row controls have per-row aria-label', () => {
      expect(TFP).toMatch(/aria-label=\{`เปิดใช้ช่องทางชำระแถวที่ \$\{idx \+ 1\}`\}/);
      expect(TFP).toMatch(/aria-label=\{`เลือกช่องทางชำระแถวที่ \$\{idx \+ 1\}`\}/);
      expect(TFP).toMatch(/aria-label=\{`จำนวนเงินที่ชำระแถวที่ \$\{idx \+ 1\}`\}/);
    });

    test('TF3.D.5 — Trash2 / Edit3 row buttons in medications + consumables + purchased + lab carry aria-label', () => {
      // These were icon-only in the pre-TF3 source; SR users heard "button"
      // with no context. Each one now has Thai aria-label including the row name.
      expect(TFP).toMatch(/aria-label=\{`ลบยา \$\{med\.name\}`\}/);
      expect(TFP).toMatch(/aria-label=\{`แก้ไขยา \$\{med\.name\}`\}/);
      expect(TFP).toMatch(/aria-label=\{`ลบสินค้าสิ้นเปลือง \$\{item\.name\}`\}/);
      expect(TFP).toMatch(/aria-label=\{`ลบสินค้า \$\{item\.name\}`\}/);
      expect(TFP).toMatch(/aria-label=\{`ลบรายการ \$\{item\.name\}`\}/);
    });
  });

  // ───── Anti-regression — TF2 anchors must still be present ────────────────
  describe('TF3.E — TF2 data-field anchors preserved', () => {
    // TF3 wiring threads through the SAME data-field keys that TF2 shipped.
    // If a refactor accidentally removes one, both audits catch it but
    // TF3 is more specific because the aria-* relies on the anchor existing.
    const TF2_ANCHORS = [
      'doctor',
      'treatmentDate',
      'sellers',
      'paymentChannels',
      'paymentDate',
      'courseSection',
    ];

    for (const key of TF2_ANCHORS) {
      test(`TF3.E — TF2 anchor "${key}" still present`, () => {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`data-field="${escaped}"`);
        expect(TFP).toMatch(re);
      });
    }

    test('TF3.E.7 — per-row anchors (sellers[/paymentChannels[/medications[/consumables[/purchasedItems[) preserved', () => {
      expect(TFP).toMatch(/data-field=\{`sellers\[/);
      expect(TFP).toMatch(/data-field=\{`paymentChannels\[/);
      expect(TFP).toMatch(/data-field=\{`medications\[/);
      expect(TFP).toMatch(/data-field=\{`consumables\[/);
      expect(TFP).toMatch(/data-field=\{`purchasedItems\[/);
    });

    test('TF3.E.8 — vitals.<key> per-field template anchor still present (TF2 D.1)', () => {
      expect(TFP).toMatch(/data-field=\{`vitals\.\$\{key\}`\}/);
    });

    test('TF3.E.9 — treatment-item rows still use data-field={item.id} (fill-later)', () => {
      expect(TFP).toMatch(/data-field=\{item\.id\}/);
    });
  });

  // ───── No leak / no regression on tests ────────────────────────────────────
  describe('TF3.F — wiring sanity', () => {
    test('TF3.F.1 — no orphan FieldError without ariaErrProps spread on the same key', () => {
      // Every <FieldError field="X" /> implies ariaErrProps('X') exists somewhere.
      const fieldErrorKeys = [...TFP.matchAll(/<FieldError field="([^"]+)"/g)].map((m) => m[1]);
      expect(fieldErrorKeys.length).toBeGreaterThanOrEqual(6);
      const orphans = fieldErrorKeys.filter((k) => {
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return !new RegExp(`ariaErrProps\\('${escaped}'\\)`).test(TFP);
      });
      expect(orphans).toEqual([]);
    });

    test('TF3.F.2 — ariaErrProps + FieldError ride alongside (not in place of) scrollToError', () => {
      // Aria layer is ADDITIVE — must not displace the visual scrollToError
      // contract from TF2. Quick anti-regression: alert() still fires on validation failure.
      expect(TFP).toMatch(/scrollToError\s*=\s*\(fieldAttr,\s*msg\)\s*=>\s*\{\s*alert\(msg\)/);
    });
  });
});
