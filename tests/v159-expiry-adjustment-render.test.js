import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('V159 — expiry adjustment renders distinctly', () => {
  it('E1 StockAdjustPanel list handles type expiry (badge + old→new)', () => {
    const src = readFileSync('src/components/backend/StockAdjustPanel.jsx', 'utf8');
    expect(src).toMatch(/a\.type === 'expiry'/);
    expect(src).toMatch(/แก้วันหมดอายุ/);
    expect(src).toMatch(/a\.oldExpiresAt/);
    expect(src).toMatch(/a\.newExpiresAt/);
  });
  it('E2 AdjustDetailModal handles type expiry (badge + old→new)', () => {
    const src = readFileSync('src/components/backend/AdjustDetailModal.jsx', 'utf8');
    expect(src).toMatch(/expiry:\s*\{[\s\S]{0,80}label:/);
    expect(src).toMatch(/amber:/);
    expect(src).toMatch(/data\.oldExpiresAt/);
    expect(src).toMatch(/data\.newExpiresAt/);
  });
});
