// a11y-aria-coverage — UC4/UC5/TF3 audit fixes (2026-05-04)
//
// Source-grep regression bank that locks the aria-* coverage shipped this
// turn into the codebase. WCAG 2.2 1.3.1 (Info and Relationships) +
// 4.1.3 (Status Messages) require:
//   - aria-invalid on inputs whose validity changed
//   - aria-describedby pointing at a visible role="alert" element
//   - aria-label on icon-only / context-dependent controls
//
// Drift catcher: any future refactor that strips these wires will fail this
// test. Pair with V21 lesson — locking source-shape can lock-in broken
// behavior, so the assertions here check the AVAILABILITY of the aria-*
// attribute, not specific values, leaving room for label rewordings.
//
// Files audited (priority order from audit report):
//   1. src/components/backend/CustomerCreatePage.jsx (HIGHEST)
//   2. src/components/backend/SaleTab.jsx (HIGH)
//   3. src/components/backend/audience/PredicateRow.jsx (HIGH — Phase 16.1)
//   4. src/components/backend/audience/RuleBuilder.jsx (HIGH — Phase 16.1)

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const CUSTOMER_CREATE = read('src/components/backend/CustomerCreatePage.jsx');
const SALE_TAB         = read('src/components/backend/SaleTab.jsx');
const PREDICATE_ROW    = read('src/components/backend/audience/PredicateRow.jsx');
const RULE_BUILDER     = read('src/components/backend/audience/RuleBuilder.jsx');

describe('A11Y — aria-* coverage (UC4/UC5/TF3 fixes)', () => {

  // ───── CustomerCreatePage (HIGHEST priority — most-used backend form) ─────
  describe('A1. CustomerCreatePage — aria-invalid + aria-describedby', () => {
    test('A1.1 — has at least 5 aria-invalid spreads on inputs (UC5 minimum)', () => {
      // ariaErrProps('xxx') call sites — each one drives one aria-invalid + describedby pair.
      const callSites = (CUSTOMER_CREATE.match(/\{\.\.\.ariaErrProps\(/g) || []).length;
      expect(callSites).toBeGreaterThanOrEqual(5);
    });

    test('A1.2 — defines ariaErrProps helper that emits aria-invalid + aria-describedby', () => {
      expect(CUSTOMER_CREATE).toMatch(/const ariaErrProps\s*=/);
      expect(CUSTOMER_CREATE).toMatch(/'aria-invalid'/);
      expect(CUSTOMER_CREATE).toMatch(/'aria-describedby'/);
    });

    test('A1.3 — exposes FieldError component that renders role="alert" with id="err-{field}"', () => {
      expect(CUSTOMER_CREATE).toMatch(/FieldError/);
      expect(CUSTOMER_CREATE).toMatch(/role="alert"/);
      // id must follow "err-${field}" pattern so aria-describedby resolves
      expect(CUSTOMER_CREATE).toMatch(/id=\{`err-\$\{field\}`\}|id="err-/);
    });

    test('A1.4 — wires ariaErrProps onto firstname (the only required text input)', () => {
      // firstname is data-field="firstname" + required + must have ariaErrProps
      const firstnameMatch = CUSTOMER_CREATE.match(/data-field="firstname"[^>]*\{\.\.\.ariaErrProps\('firstname'\)\}/);
      expect(firstnameMatch).toBeTruthy();
    });

    test('A1.5 — wires ariaErrProps on contact + identity inputs (telephone, email, citizen_id)', () => {
      expect(CUSTOMER_CREATE).toMatch(/ariaErrProps\('telephone_number'\)/);
      expect(CUSTOMER_CREATE).toMatch(/ariaErrProps\('email'\)/);
      expect(CUSTOMER_CREATE).toMatch(/ariaErrProps\('citizen_id'\)/);
    });

    test('A1.6 — setField clears the per-field error state on edit (avoids stale alerts)', () => {
      // setFieldErrors(prev => ...) must be called inside setField so user
      // edits dismiss aria-invalid as they correct the input.
      const m = CUSTOMER_CREATE.match(/const setField\s*=\s*\(key,\s*value\)\s*=>\s*\{[\s\S]{0,400}?setFieldErrors/);
      expect(m).toBeTruthy();
    });

    test('A1.7 — handleSubmit catch path populates fieldErrors on validation failure', () => {
      // Failure path must set the per-field error so aria-describedby fires.
      const m = CUSTOMER_CREATE.match(/setFieldErrors\(\(prev\)\s*=>\s*\(\{\s*\.\.\.prev,\s*\[field\]:/);
      expect(m).toBeTruthy();
    });
  });

  // ───── SaleTab (HIGH — main backend form) ─────
  describe('A2. SaleTab — aria-invalid on at least 3 main inputs', () => {
    test('A2.1 — has at least 3 ariaErrFor spreads on main inputs (customer/date/sellers/payment)', () => {
      const callSites = (SALE_TAB.match(/\{\.\.\.ariaErrFor\(/g) || []).length;
      expect(callSites).toBeGreaterThanOrEqual(3);
    });

    test('A2.2 — defines ariaErrFor helper emitting aria-invalid + aria-describedby', () => {
      expect(SALE_TAB).toMatch(/const ariaErrFor\s*=/);
      expect(SALE_TAB).toMatch(/'aria-invalid'/);
      expect(SALE_TAB).toMatch(/'aria-describedby'/);
    });

    test('A2.3 — wires ariaErrFor on each of the 4 validated targets', () => {
      expect(SALE_TAB).toMatch(/ariaErrFor\('saleCustomer'\)/);
      expect(SALE_TAB).toMatch(/ariaErrFor\('saleDate'\)/);
      expect(SALE_TAB).toMatch(/ariaErrFor\('saleSellers'\)/);
      expect(SALE_TAB).toMatch(/ariaErrFor\('salePayment'\)/);
    });

    test('A2.4 — renders role="alert" error message blocks with id="err-{field}"', () => {
      // Each section must have an inline error block that aria-describedby points at.
      expect(SALE_TAB).toMatch(/id="err-saleCustomer"\s+role="alert"/);
      expect(SALE_TAB).toMatch(/id="err-saleDate"\s+role="alert"/);
      expect(SALE_TAB).toMatch(/id="err-saleSellers"\s+role="alert"/);
      expect(SALE_TAB).toMatch(/id="err-salePayment"\s+role="alert"/);
    });

    test('A2.5 — scrollToError sets errorField so aria wiring activates', () => {
      // scrollToError(fieldAttr, msg) must populate errorField, otherwise the
      // ariaErrFor spread emits no attrs and screen readers stay silent.
      const m = SALE_TAB.match(/const scrollToError\s*=\s*\(fieldAttr,\s*msg\)\s*=>\s*\{[\s\S]{0,200}?setErrorField\(fieldAttr\)/);
      expect(m).toBeTruthy();
    });

    test('A2.6 — handleSave reset clears errorField at start (prevents stale aria-invalid)', () => {
      // handleSave's setSaving(true) line must also reset errorField.
      const m = SALE_TAB.match(/setSaving\(true\);\s*setError\(''\);\s*setErrorField\(''\)/);
      expect(m).toBeTruthy();
    });
  });

  // ───── Phase 16.1 — PredicateRow (HIGH per UC4 audit) ─────
  describe('A3. PredicateRow — aria-label on every interactive control', () => {
    test('A3.1 — predicate-type select has aria-label', () => {
      expect(PREDICATE_ROW).toMatch(/data-testid="predicate-type-select"\s*\n?\s*aria-label="/);
    });

    test('A3.2 — gender select has aria-label', () => {
      expect(PREDICATE_ROW).toMatch(/data-testid="param-gender"\s*\n?\s*aria-label="/);
    });

    test('A3.3 — every age-range / spend-bracket / lastvisit number input has aria-label', () => {
      expect(PREDICATE_ROW).toMatch(/data-testid="param-age-min"[\s\S]{0,200}?aria-label="/);
      expect(PREDICATE_ROW).toMatch(/data-testid="param-age-max"[\s\S]{0,200}?aria-label="/);
      expect(PREDICATE_ROW).toMatch(/data-testid="param-spend-min"[\s\S]{0,200}?aria-label="/);
      expect(PREDICATE_ROW).toMatch(/data-testid="param-spend-max"[\s\S]{0,200}?aria-label="/);
      expect(PREDICATE_ROW).toMatch(/data-testid="param-lastvisit-days"[\s\S]{0,200}?aria-label="/);
    });

    test('A3.4 — bought-x dropdowns + month input all have aria-label', () => {
      expect(PREDICATE_ROW).toMatch(/data-testid="param-bought-kind"[\s\S]{0,200}?aria-label="/);
      expect(PREDICATE_ROW).toMatch(/data-testid="param-bought-ref"[\s\S]{0,200}?aria-label=\{?["`]/);
      expect(PREDICATE_ROW).toMatch(/data-testid="param-bought-months"[\s\S]{0,200}?aria-label="/);
    });

    test('A3.5 — labels are in Thai (per task constraint)', () => {
      // Pull every aria-label="..." string and assert at least one Thai char appears in it.
      const labels = [...PREDICATE_ROW.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
      expect(labels.length).toBeGreaterThanOrEqual(8);
      // Thai unicode range ฀-๿
      const thaiRe = /[฀-๿]/;
      const allThai = labels.every((s) => thaiRe.test(s));
      expect(allThai).toBe(true);
    });
  });

  // ───── Phase 16.1 — RuleBuilder (HIGH) ─────
  describe('A4. RuleBuilder — aria-label on op + add buttons', () => {
    test('A4.1 — op (AND/OR) select has aria-label', () => {
      expect(RULE_BUILDER).toMatch(/data-testid=\{`rule-op-depth-\$\{depth\}`\}\s*\n?\s*aria-label="/);
    });

    test('A4.2 — "เพิ่มเงื่อนไข" button has aria-label', () => {
      expect(RULE_BUILDER).toMatch(/data-testid=\{`rule-add-predicate-depth-\$\{depth\}`\}\s*\n?\s*aria-label="/);
    });

    test('A4.3 — "เพิ่มกลุ่ม" button has aria-label', () => {
      expect(RULE_BUILDER).toMatch(/data-testid=\{`rule-add-group-depth-\$\{depth\}`\}\s*\n?\s*aria-label="/);
    });
  });
});
