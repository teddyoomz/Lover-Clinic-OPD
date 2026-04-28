// V33.12 (2026-04-28) — drift catcher for TEST-SALE-/E2E-SALE- prefix
// enforcement helper. Mirrors V33.10 + V33.11.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTestSaleId,
  isTestSaleId,
  getTestSalePrefix,
  TEST_SALE_PREFIXES,
} from './helpers/testSale.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('V33.12 E1 — testSale.js helper file present + frozen prefixes', () => {
  it('E1.1 — helper file exists', () => {
    const stat = fs.statSync(path.join(ROOT, 'tests/helpers/testSale.js'));
    expect(stat.isFile()).toBe(true);
  });

  it('E1.2 — TEST_SALE_PREFIXES is frozen', () => {
    expect(Object.isFrozen(TEST_SALE_PREFIXES)).toBe(true);
    expect(TEST_SALE_PREFIXES).toEqual(['TEST', 'E2E']);
  });
});

describe('V33.12 E2 — createTestSaleId', () => {
  it('E2.1 — default prefix TEST', () => {
    const id = createTestSaleId({ timestamp: 1777000000000 });
    expect(id).toBe('TEST-SALE-1777000000000');
  });

  it('E2.2 — E2E prefix', () => {
    const id = createTestSaleId({ prefix: 'E2E', timestamp: 1777000000000 });
    expect(id).toBe('E2E-SALE-1777000000000');
  });

  it('E2.3 — suffix appended', () => {
    const id = createTestSaleId({ suffix: 'DEFAULT', timestamp: 1777000000000 });
    expect(id).toBe('TEST-SALE-1777000000000-DEFAULT');
  });

  it('E2.4 — invalid prefix rejected', () => {
    expect(() => createTestSaleId({ prefix: 'PROD' })).toThrow(/prefix must be one of/);
  });

  it('E2.5 — invalid suffix rejected (special chars)', () => {
    expect(() => createTestSaleId({ suffix: 'has space' })).toThrow(/suffix must match/);
  });

  it('E2.6 — uses Date.now() when timestamp omitted', () => {
    const t0 = Date.now();
    const id = createTestSaleId();
    const m = id.match(/^TEST-SALE-(\d+)$/);
    expect(m).not.toBeNull();
    const ts = Number(m[1]);
    expect(ts).toBeGreaterThanOrEqual(t0 - 1000);
    expect(ts).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('V33.12 E3 — isTestSaleId', () => {
  it.each([
    ['TEST-SALE-1777123845203', true],
    ['TEST-SALE-1777123845203-DEFAULT', true],
    ['TEST-SALE-DEFAULT-1777123845203', true], // user-named pattern from V20
    ['E2E-SALE-1777000', true],
    ['E2E-SALE-1777000-x', true],
    ['INV-202604280001', false],
    ['SAL-2026-001', false],
    ['', false],
    [null, false],
    [undefined, false],
    [123, false],
  ])('isTestSaleId(%j) === %s', (id, expected) => {
    expect(isTestSaleId(id)).toBe(expected);
  });
});

describe('V33.12 E4 — getTestSalePrefix', () => {
  it('E4.1 — TEST id returns "TEST"', () => {
    expect(getTestSalePrefix('TEST-SALE-1234')).toBe('TEST');
  });

  it('E4.2 — E2E id returns "E2E"', () => {
    expect(getTestSalePrefix('E2E-SALE-5678')).toBe('E2E');
  });

  it('E4.3 — non-test id returns null', () => {
    expect(getTestSalePrefix('INV-1')).toBeNull();
    expect(getTestSalePrefix('')).toBeNull();
    expect(getTestSalePrefix(null)).toBeNull();
  });
});

describe('V33.12 E5 — Rule 02 workflow.md documents the V33.12 convention', () => {
  // Drift catcher: if rule doc rotates, this test surfaces it.
  // Lenient — just ensure SOME mention of testSale.js + V33.12.
  const workflowDoc = read('.claude/rules/02-workflow.md');

  it('E5.1 — V33.12 marker present in workflow rules', () => {
    // Will be added in this same commit
    expect(workflowDoc).toMatch(/V33\.12/);
  });

  it('E5.2 — testSale.js helper referenced', () => {
    expect(workflowDoc).toMatch(/testSale\.js/);
  });
});
