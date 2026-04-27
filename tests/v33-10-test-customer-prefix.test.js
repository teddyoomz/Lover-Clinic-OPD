// V33.10 — TEST-/E2E- customer ID prefix enforcement helper.
//
// Codifies the V33.2 directive ("future test customers MUST use TEST- or
// E2E- prefix") as a single helper. Tests cover the helper API + a small
// source-grep guard ensuring tests/helpers/testCustomer.js is the canonical
// place for the convention.

import { describe, it, expect } from 'vitest';
import {
  createTestCustomerId,
  isTestCustomerId,
  getTestCustomerPrefix,
  TEST_CUSTOMER_PREFIXES,
} from './helpers/testCustomer.js';

describe('V33.10.A — createTestCustomerId', () => {
  it('A1 — default prefix "TEST" + ms timestamp', () => {
    const id = createTestCustomerId();
    expect(id).toMatch(/^TEST-\d+$/);
  });
  it('A2 — opts.prefix="E2E"', () => {
    const id = createTestCustomerId({ prefix: 'E2E' });
    expect(id).toMatch(/^E2E-\d+$/);
  });
  it('A3 — invalid prefix throws', () => {
    expect(() => createTestCustomerId({ prefix: 'PROD' })).toThrow(/TEST.*E2E/);
    expect(() => createTestCustomerId({ prefix: '' })).toThrow();
    expect(() => createTestCustomerId({ prefix: 'test' })).toThrow(); // lowercase rejected
  });
  it('A4 — opts.suffix appends slug-only', () => {
    const id = createTestCustomerId({ suffix: 'sale-flow' });
    expect(id).toMatch(/^TEST-\d+-sale-flow$/);
  });
  it('A5 — invalid suffix (non-slug) throws', () => {
    expect(() => createTestCustomerId({ suffix: 'has spaces' })).toThrow(/[a-zA-Z]/);
    expect(() => createTestCustomerId({ suffix: 'thai-ไทย' })).toThrow();
    expect(() => createTestCustomerId({ suffix: '!@#' })).toThrow();
  });
  it('A6 — empty suffix produces no trailing dash', () => {
    const id = createTestCustomerId({ suffix: '' });
    expect(id).not.toMatch(/-$/);
    expect(id).toMatch(/^TEST-\d+$/);
  });
  it('A7 — opts.timestamp deterministic override', () => {
    const id = createTestCustomerId({ timestamp: 1777267123456 });
    expect(id).toBe('TEST-1777267123456');
  });
  it('A8 — combined opts: E2E + suffix + timestamp', () => {
    const id = createTestCustomerId({ prefix: 'E2E', suffix: 'multi-branch', timestamp: 100 });
    expect(id).toBe('E2E-100-multi-branch');
  });
  it('A9 — IDs are unique across rapid calls (timestamp-resolution permits)', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      ids.add(createTestCustomerId({ suffix: `n${i}` }));
    }
    expect(ids.size).toBe(50);
  });
});

describe('V33.10.B — isTestCustomerId', () => {
  it('B1 — TEST- prefix → true', () => {
    expect(isTestCustomerId('TEST-1777267123456')).toBe(true);
    expect(isTestCustomerId('TEST-anything-here')).toBe(true);
  });
  it('B2 — E2E- prefix → true', () => {
    expect(isTestCustomerId('E2E-1777267123456')).toBe(true);
    expect(isTestCustomerId('E2E-multi-branch')).toBe(true);
  });
  it('B3 — production-style IDs (LC-, CUST-) → false', () => {
    expect(isTestCustomerId('LC-26000001')).toBe(false);
    expect(isTestCustomerId('CUST-12345')).toBe(false);
  });
  it('B4 — lowercase prefixes → false (case-sensitive)', () => {
    expect(isTestCustomerId('test-123')).toBe(false);
    expect(isTestCustomerId('e2e-123')).toBe(false);
  });
  it('B5 — empty / null / undefined → false', () => {
    expect(isTestCustomerId('')).toBe(false);
    expect(isTestCustomerId(null)).toBe(false);
    expect(isTestCustomerId(undefined)).toBe(false);
  });
  it('B6 — TEST without dash → false', () => {
    expect(isTestCustomerId('TEST123')).toBe(false);
    expect(isTestCustomerId('TEST')).toBe(false);
  });
});

describe('V33.10.C — getTestCustomerPrefix', () => {
  it('C1 — TEST- ID → "TEST"', () => {
    expect(getTestCustomerPrefix('TEST-1777267123456')).toBe('TEST');
  });
  it('C2 — E2E- ID → "E2E"', () => {
    expect(getTestCustomerPrefix('E2E-1777267123456')).toBe('E2E');
  });
  it('C3 — non-test ID → null', () => {
    expect(getTestCustomerPrefix('LC-26000001')).toBeNull();
    expect(getTestCustomerPrefix('')).toBeNull();
    expect(getTestCustomerPrefix(null)).toBeNull();
  });
});

describe('V33.10.D — TEST_CUSTOMER_PREFIXES export', () => {
  it('D1 — exports both prefixes (frozen)', () => {
    expect(TEST_CUSTOMER_PREFIXES).toEqual(['TEST', 'E2E']);
    expect(Object.isFrozen(TEST_CUSTOMER_PREFIXES)).toBe(true);
  });
});

describe('V33.10.E — workflow rule doc references the convention', () => {
  it('E1 — .claude/rules/02-workflow.md mentions the TEST-/E2E- prefix', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('.claude/rules/02-workflow.md', 'utf-8');
    expect(src).toMatch(/TEST-.*E2E-|E2E-.*TEST-/);
    expect(src).toMatch(/test customer.*prefix|prefix.*test customer/i);
  });
  it('E2 — .claude/rules/02-workflow.md links to the helper file', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('.claude/rules/02-workflow.md', 'utf-8');
    expect(src).toMatch(/tests\/helpers\/testCustomer\.js/);
  });
});
