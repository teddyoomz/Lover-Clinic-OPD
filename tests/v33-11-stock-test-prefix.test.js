// V33.11 (2026-04-28) — drift catcher for stock-test prefix discipline.
//
// Asserts:
//   E1: tests/helpers/testStockBranch.js exists with required exports
//   E2: .claude/rules/02-workflow.md references the V33.11 rule
//   E3: helper functions enforce TEST-/E2E- prefix
//   E4: helper-generated IDs match the documented format
//   E5: isTestStockId correctly classifies valid + invalid

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const HELPER_PATH = join(process.cwd(), 'tests', 'helpers', 'testStockBranch.js');
const RULE_PATH = join(process.cwd(), '.claude', 'rules', '02-workflow.md');

describe('V33.11 — stock-test prefix discipline', () => {
  it('E1: tests/helpers/testStockBranch.js exists', () => {
    expect(existsSync(HELPER_PATH)).toBe(true);
  });

  it('E1.b: helper exports the 4 ID generators + 2 classifiers + frozen prefixes', async () => {
    const mod = await import('../tests/helpers/testStockBranch.js');
    expect(typeof mod.createTestStockBranchId).toBe('function');
    expect(typeof mod.createTestCentralWarehouseId).toBe('function');
    expect(typeof mod.createTestStockProductId).toBe('function');
    expect(typeof mod.createTestStockBatchId).toBe('function');
    expect(typeof mod.isTestStockId).toBe('function');
    expect(typeof mod.getTestStockPrefix).toBe('function');
    expect(Array.isArray(mod.TEST_STOCK_PREFIXES)).toBe(true);
    expect(Object.isFrozen(mod.TEST_STOCK_PREFIXES)).toBe(true);
    expect(mod.TEST_STOCK_PREFIXES).toEqual(['TEST', 'E2E']);
  });

  it('E2: .claude/rules/02-workflow.md references V33.11 + helper', () => {
    expect(existsSync(RULE_PATH)).toBe(true);
    const src = readFileSync(RULE_PATH, 'utf-8');
    expect(src).toMatch(/V33\.11/);
    expect(src).toMatch(/testStockBranch\.js/);
    expect(src).toMatch(/createTestStockBranchId/);
    expect(src).toMatch(/createTestCentralWarehouseId/);
  });

  it('E3: helpers reject invalid prefix', async () => {
    const { createTestStockBranchId, createTestCentralWarehouseId } =
      await import('../tests/helpers/testStockBranch.js');
    expect(() => createTestStockBranchId({ prefix: 'BAD' })).toThrow(/prefix must be/);
    expect(() => createTestCentralWarehouseId({ prefix: 'PROD' })).toThrow(/prefix must be/);
  });

  it('E3.b: helpers reject suffix with invalid chars', async () => {
    const { createTestStockBranchId } = await import('../tests/helpers/testStockBranch.js');
    expect(() => createTestStockBranchId({ suffix: 'has space' })).toThrow(/suffix must match/);
    expect(() => createTestStockBranchId({ suffix: 'has/slash' })).toThrow(/suffix must match/);
  });

  it('E4: generated branch ID matches TEST-BR-<ts> format', async () => {
    const { createTestStockBranchId } = await import('../tests/helpers/testStockBranch.js');
    const id = createTestStockBranchId({ timestamp: 1700000000000 });
    expect(id).toBe('TEST-BR-1700000000000');
  });

  it('E4.b: generated warehouse ID matches TEST-WH-<ts>-<suffix> format', async () => {
    const { createTestCentralWarehouseId } = await import('../tests/helpers/testStockBranch.js');
    const id = createTestCentralWarehouseId({ timestamp: 1700000000000, suffix: 'src' });
    expect(id).toBe('TEST-WH-1700000000000-src');
  });

  it('E4.c: E2E prefix supported', async () => {
    const { createTestStockBranchId, createTestStockBatchId } =
      await import('../tests/helpers/testStockBranch.js');
    expect(createTestStockBranchId({ prefix: 'E2E', timestamp: 1700000000000 }))
      .toBe('E2E-BR-1700000000000');
    expect(createTestStockBatchId({ prefix: 'E2E', timestamp: 1700000000000 }))
      .toBe('E2E-BATCH-1700000000000');
  });

  it('E5: isTestStockId classifies correctly', async () => {
    const { isTestStockId } = await import('../tests/helpers/testStockBranch.js');
    expect(isTestStockId('TEST-BR-1700000000000')).toBe(true);
    expect(isTestStockId('TEST-WH-1700000000000-src')).toBe(true);
    expect(isTestStockId('E2E-PROD-1700000000000')).toBe(true);
    expect(isTestStockId('E2E-BATCH-foo-bar')).toBe(true);
    // Production patterns must classify as NOT test
    expect(isTestStockId('main')).toBe(false);
    expect(isTestStockId('WH-1776517066355-4nz4')).toBe(false);
    expect(isTestStockId('BR-1777095572005-ae97f911')).toBe(false);
    expect(isTestStockId('BATCH-1776515502899-fo8s')).toBe(false);
    expect(isTestStockId('')).toBe(false);
    expect(isTestStockId(null)).toBe(false);
    expect(isTestStockId(undefined)).toBe(false);
  });

  it('E5.b: getTestStockPrefix returns TEST | E2E | null', async () => {
    const { getTestStockPrefix } = await import('../tests/helpers/testStockBranch.js');
    expect(getTestStockPrefix('TEST-BR-123')).toBe('TEST');
    expect(getTestStockPrefix('E2E-WH-123')).toBe('E2E');
    expect(getTestStockPrefix('main')).toBe(null);
    expect(getTestStockPrefix('WH-1776517066355-4nz4')).toBe(null);
    expect(getTestStockPrefix(null)).toBe(null);
  });

  it('E6: helpers default timestamp uses Date.now', async () => {
    const { createTestStockBranchId } = await import('../tests/helpers/testStockBranch.js');
    const before = Date.now();
    const id = createTestStockBranchId();
    const after = Date.now();
    const tsMatch = id.match(/^TEST-BR-(\d+)$/);
    expect(tsMatch).toBeTruthy();
    const ts = Number(tsMatch[1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('E7: V34 entry exists in audit-stock-flow checklist S20', () => {
    const path = join(process.cwd(), '.claude', 'skills', 'audit-stock-flow', 'checklist.md');
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, 'utf-8');
    expect(src).toMatch(/S20.*[Tt]est.*[Pp]refix.*[Dd]iscipline/);
    expect(src).toMatch(/V33\.11/);
  });
});
