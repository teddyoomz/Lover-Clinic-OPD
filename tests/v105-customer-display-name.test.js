/**
 * V105 (2026-05-19 LATE+3 NIGHT+2) — customer display-name canonical
 * resolution + sale-write canonical wire + display-time fallback regression.
 *
 * Root cause: V12 multi-reader-sweep at customer-name shape boundary.
 * customer LC-26000079 had `patientData.firstName="สุขเกษม"` (camelCase
 * nested) but top-level `firstname` (lowercase) EMPTY. Various creation
 * paths (manual / kiosk / FB / LINE / clone) populate different subsets;
 * any read-site picking ONE shape silently misses the others.
 *
 * Fix:
 *   A. NEW resolveCustomerDisplayName + resolveCustomerHN in
 *      src/lib/customerDisplayName.js — walks ALL variants
 *   B. TFP auto-sale (create + edit) writes via canonical helper
 *   C. SaleTab list display falls back to canonical resolution
 *   D. SaleTab cancel-flow gets atomic-rollback
 *   E. Rule M backfill (v105-backfill-sale-customer-and-rededuct-stock.mjs)
 *   F. AV93 + AV94 invariants
 *
 * Tests in this file:
 *   - U1-U5: unit tests of resolveCustomerDisplayName + resolveCustomerHN
 *   - SG1-SG6: source-grep lockdown
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  resolveCustomerDisplayName,
  resolveCustomerHN,
  resolveCustomerRowLabel,
} from '../src/lib/customerDisplayName.js';

const TFP_SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
const SALETAB_SRC = readFileSync('src/components/backend/SaleTab.jsx', 'utf8');
const HELPER_SRC = readFileSync('src/lib/customerDisplayName.js', 'utf8');
const BACKFILL_SRC = readFileSync('scripts/v105-backfill-sale-customer-and-rededuct-stock.mjs', 'utf8');
const AV_SKILL = readFileSync('.claude/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

describe('V105.U — resolveCustomerDisplayName canonical helper', () => {
  it('U1: patientData.firstNameTh + lastNameTh — highest priority', () => {
    const c = { patientData: {
      prefix: 'นาย',
      firstNameTh: 'สุขเกษม', lastNameTh: 'วิทยชาญวิฑูร',
      firstName: 'Sukasem', lastName: 'Witayachan',  // English variants — should be ignored
    }};
    expect(resolveCustomerDisplayName(c)).toBe('นาย สุขเกษม วิทยชาญวิฑูร');
    expect(resolveCustomerDisplayName(c, { includePrefix: false })).toBe('สุขเกษม วิทยชาญวิฑูร');
  });

  it('U2: patientData.firstName + lastName — Facebook-source path (real bug victim shape)', () => {
    // LC-26000079 exact shape
    const c = { patientData: {
      prefix: 'นาย',
      firstName: 'สุขเกษม', lastName: 'วิทยชาญวิฑูร',
      // No firstNameTh / lastNameTh
    }};
    expect(resolveCustomerDisplayName(c)).toBe('นาย สุขเกษม วิทยชาญวิฑูร');
  });

  it('U3: top-level firstname + lastname (lowercase) — legacy ProClinic-clone path', () => {
    const c = {
      firstname: 'มานี', lastname: 'มาเก่ง',
      patientData: {}, // no nested fields
    };
    expect(resolveCustomerDisplayName(c)).toBe('มานี มาเก่ง');
  });

  it('U4: returns empty when ALL shape variants are empty (sanity check)', () => {
    expect(resolveCustomerDisplayName({})).toBe('');
    expect(resolveCustomerDisplayName({ patientData: {} })).toBe('');
    expect(resolveCustomerDisplayName(null)).toBe('');
    expect(resolveCustomerDisplayName(undefined)).toBe('');
  });

  it('U5: priority order strict — Th wins over camelCase wins over lowercase', () => {
    const c = {
      firstname: 'lowercase', lastname: 'one',
      patientData: {
        firstName: 'CamelCase', lastName: 'Two',
        firstNameTh: 'Thai', lastNameTh: 'Three',
      },
    };
    // firstNameTh wins
    expect(resolveCustomerDisplayName(c, { includePrefix: false })).toBe('Thai Three');
    // Remove firstNameTh — camelCase wins
    delete c.patientData.firstNameTh;
    delete c.patientData.lastNameTh;
    expect(resolveCustomerDisplayName(c, { includePrefix: false })).toBe('CamelCase Two');
    // Remove camelCase — lowercase wins
    delete c.patientData.firstName;
    delete c.patientData.lastName;
    expect(resolveCustomerDisplayName(c, { includePrefix: false })).toBe('lowercase one');
  });
});

describe('V105.U — resolveCustomerHN + resolveCustomerRowLabel', () => {
  it('HN1: priority chain — proClinicHN > patientData.hn > top-level hn', () => {
    expect(resolveCustomerHN({ proClinicHN: '12345' })).toBe('12345');
    expect(resolveCustomerHN({ patientData: { hn: '99999' } })).toBe('99999');
    expect(resolveCustomerHN({ hn_no: '00001' })).toBe('00001');
    expect(resolveCustomerHN({})).toBe('');
  });

  it('Label1: composes name + HN; falls back to id when both missing', () => {
    expect(resolveCustomerRowLabel({ patientData: { firstName: 'สมชาย', lastName: 'ใจดี' }, proClinicHN: 'A1' }, { includePrefix: false })).toBe('สมชาย ใจดี (A1)');
    expect(resolveCustomerRowLabel({ patientData: { firstName: 'สมชาย', lastName: 'ใจดี' } }, { includePrefix: false })).toBe('สมชาย ใจดี');
    expect(resolveCustomerRowLabel({ proClinicHN: 'A1' })).toBe('A1');
    expect(resolveCustomerRowLabel({ id: 'LC-X' })).toBe('ลูกค้า #LC-X');
    expect(resolveCustomerRowLabel({})).toBe('');
  });
});

describe('V105.SG — source-grep lockdown', () => {
  it('SG1: TFP auto-sale (create-mode) uses canonical helper', () => {
    expect(TFP_SRC).toMatch(/_v105ResolvedName\s*=\s*resolveCustomerDisplayName/);
    expect(TFP_SRC).toMatch(/customerName:\s*_v105ResolvedName/);
    expect(TFP_SRC).toMatch(/customerHN:\s*_v105ResolvedHN/);
  });

  it('SG2: TFP auto-sale (edit-mode) uses canonical helper', () => {
    expect(TFP_SRC).toMatch(/_v105EditResolvedName/);
    expect(TFP_SRC).toMatch(/customerName:\s*_v105EditResolvedName/);
  });

  it('SG3: TFP imports canonical helper', () => {
    expect(TFP_SRC).toMatch(/import\s*\{\s*resolveCustomerDisplayName\s*,\s*resolveCustomerHN\s*\}\s*from\s*['"]\.\.\/lib\/customerDisplayName\.js['"]/);
  });

  it('SG4: SaleTab list display has V105 fallback chain (lookup customer + resolve)', () => {
    expect(SALETAB_SRC).toMatch(/_v105LinkedCustomer/);
    expect(SALETAB_SRC).toMatch(/_v105FallbackName/);
    expect(SALETAB_SRC).toMatch(/resolveCustomerDisplayName/);
  });

  it('SG5: SaleTab cancel-flow has V105 atomic-rollback try/catch around cancelBackendSale', () => {
    // The pre-V105 pattern was bare `await cancelBackendSale(...)` after
    // reverseStockForSale; V105 wraps in try/catch + re-deduct rollback.
    expect(SALETAB_SRC).toMatch(/V105 atomic-rollback/);
    expect(SALETAB_SRC).toMatch(/cancelBackendSale\(saleId/);
    // Anchor on the V105 comment that PRECEDES the try block so we get the
    // try/catch + await cancelBackendSale + re-deduct logic in the window.
    const idx = SALETAB_SRC.indexOf('atomic-guarantee on');
    expect(idx).toBeGreaterThan(-1);
    const window = SALETAB_SRC.slice(idx, idx + 2500);
    expect(window).toMatch(/try\s*\{/);
    expect(window).toMatch(/await\s+cancelBackendSale/);
    expect(window).toMatch(/catch\s*\(\s*cancelErr/);
    expect(window).toMatch(/await\s+deductStockForSale/);
  });

  it('SG6: AV93 + AV94 invariants present in audit-anti-vibe-code SKILL.md', () => {
    expect(AV_SKILL).toMatch(/### AV93 — Customer display-name MUST resolve via canonical helper/);
    expect(AV_SKILL).toMatch(/### AV94 — Multi-step destructive flows MUST be atomic/);
  });
});

describe('V105.U — backfill script parity with src/lib helper', () => {
  it('U6: backfill script defines local resolveCustomerDisplayName mirror', () => {
    // The .mjs script can't import the React/Vite module, so it mirrors
    // the canonical helper. We can't directly diff the bodies, but we can
    // verify the script has both helper definitions + uses them.
    expect(BACKFILL_SRC).toMatch(/function resolveCustomerDisplayName/);
    expect(BACKFILL_SRC).toMatch(/function resolveCustomerHN/);
    // Same priority chain markers
    expect(BACKFILL_SRC).toMatch(/firstNameTh/);
    expect(BACKFILL_SRC).toMatch(/customer\.firstname/);
  });

  it('U7: backfill has Part A (name) + Part B (re-deduct) + idempotency flags', () => {
    expect(BACKFILL_SRC).toMatch(/_v105NameBackfilledAt/);
    expect(BACKFILL_SRC).toMatch(/_v105ReDeductedAt/);
    expect(BACKFILL_SRC).toMatch(/_v105ReDeductOf/);
    expect(BACKFILL_SRC).toMatch(/applyMode/);
  });
});
