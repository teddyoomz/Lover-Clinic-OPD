// V33.14 (2026-05-06) — drift catcher for TEST-DEPOSIT-/E2E-DEPOSIT- prefix
// enforcement helper. Mirrors V33.10 + V33.11 + V33.12 + V33.13.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTestDepositId,
  isTestDepositId,
  getTestDepositPrefix,
  TEST_DEPOSIT_PREFIXES,
} from './helpers/testDeposit.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('V33.14 E1 — testDeposit.js helper file present + frozen prefixes', () => {
  it('E1.1 — helper file exists', () => {
    const stat = fs.statSync(path.join(ROOT, 'tests/helpers/testDeposit.js'));
    expect(stat.isFile()).toBe(true);
  });

  it('E1.2 — TEST_DEPOSIT_PREFIXES is frozen', () => {
    expect(Object.isFrozen(TEST_DEPOSIT_PREFIXES)).toBe(true);
    expect(TEST_DEPOSIT_PREFIXES).toEqual(['TEST', 'E2E']);
  });
});

describe('V33.14 E2 — createTestDepositId', () => {
  it('E2.1 — default prefix TEST', () => {
    const id = createTestDepositId({ timestamp: 1777000000000 });
    expect(id).toBe('TEST-DEPOSIT-1777000000000');
  });

  it('E2.2 — E2E prefix', () => {
    const id = createTestDepositId({ prefix: 'E2E', timestamp: 1777000000000 });
    expect(id).toBe('E2E-DEPOSIT-1777000000000');
  });

  it('E2.3 — suffix appended', () => {
    const id = createTestDepositId({ suffix: 'multi', timestamp: 1777000000000 });
    expect(id).toBe('TEST-DEPOSIT-1777000000000-multi');
  });

  it('E2.4 — invalid prefix rejected', () => {
    expect(() => createTestDepositId({ prefix: 'PROD' })).toThrow(/prefix must be one of/);
  });

  it('E2.5 — invalid suffix rejected (special chars)', () => {
    expect(() => createTestDepositId({ suffix: 'has space' })).toThrow(/suffix must match/);
  });

  it('E2.6 — uses Date.now() when timestamp omitted', () => {
    const t0 = Date.now();
    const id = createTestDepositId();
    const m = id.match(/^TEST-DEPOSIT-(\d+)$/);
    expect(m).not.toBeNull();
    const ts = Number(m[1]);
    expect(ts).toBeGreaterThanOrEqual(t0 - 1000);
    expect(ts).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('V33.14 E3 — isTestDepositId', () => {
  it.each([
    ['TEST-DEPOSIT-1777123845203', true],
    ['TEST-DEPOSIT-1777123845203-multi', true],
    ['E2E-DEPOSIT-1777000', true],
    ['E2E-DEPOSIT-1777000-x', true],
    ['DEP-1777000000000', false],     // production deposit ID format
    ['DEPOSIT-2026-001', false],
    ['', false],
    [null, false],
    [undefined, false],
    [123, false],
  ])('isTestDepositId(%j) === %s', (id, expected) => {
    expect(isTestDepositId(id)).toBe(expected);
  });
});

describe('V33.14 E4 — getTestDepositPrefix', () => {
  it('E4.1 — TEST id returns "TEST"', () => {
    expect(getTestDepositPrefix('TEST-DEPOSIT-1234')).toBe('TEST');
  });

  it('E4.2 — E2E id returns "E2E"', () => {
    expect(getTestDepositPrefix('E2E-DEPOSIT-5678')).toBe('E2E');
  });

  it('E4.3 — non-test id returns null', () => {
    expect(getTestDepositPrefix('DEP-1')).toBeNull();
    expect(getTestDepositPrefix('')).toBeNull();
    expect(getTestDepositPrefix(null)).toBeNull();
  });
});

describe('V33.14 E5 — Rule 02 workflow.md documents the V33.14 convention', () => {
  const workflowDoc = read('.claude/rules/02-workflow.md');

  it('E5.1 — V33.14 marker present in workflow rules', () => {
    expect(workflowDoc).toMatch(/V33\.14/);
  });

  it('E5.2 — testDeposit.js helper referenced', () => {
    expect(workflowDoc).toMatch(/testDeposit\.js/);
  });
});
