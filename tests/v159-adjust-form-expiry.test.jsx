import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/backend/StockAdjustPanel.jsx', 'utf8');

describe('V159 — AdjustCreateForm editable expiry + dual-path submit', () => {
  it('D1 imports DateField + updateStockBatchExpiry', () => {
    expect(src).toMatch(/import DateField from '\.\.\/DateField\.jsx'/);
    expect(src).toMatch(/updateStockBatchExpiry/);
  });
  it('D2 has newExpiresAt state + DateField wired in the batch box', () => {
    expect(src).toMatch(/newExpiresAt/);
    expect(src).toMatch(/<DateField[\s\S]{0,120}value=\{newExpiresAt\}/);
  });
  it('D3 canSave allows expiry-only (qty>0 OR expiryChanged)', () => {
    expect(src).toMatch(/expiryChanged/);
    expect(src).toMatch(/Number\(qty\)\s*>\s*0[\s\S]{0,40}\|\|[\s\S]{0,40}expiryChanged/);
  });
  it('D4 handleSave gates createStockAdjustment on qty>0 and calls updateStockBatchExpiry on expiryChanged', () => {
    expect(src).toMatch(/if\s*\(\s*Number\(qty\)\s*>\s*0\s*\)[\s\S]{0,160}createStockAdjustment/);
    expect(src).toMatch(/if\s*\(\s*expiryChanged\s*\)[\s\S]{0,160}updateStockBatchExpiry/);
  });
});
