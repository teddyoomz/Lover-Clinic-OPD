// ─── storageClient unit tests ────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { buildStoragePath } from '../src/lib/storageClient.js';

describe('buildStoragePath', () => {
  it('builds correct path format', () => {
    const path = buildStoragePath('be_sales', 'INV-001', 'paymentEvidence', 'receipt.jpg');
    expect(path).toMatch(/^uploads\/be_sales\/INV-001\/paymentEvidence_\d+\.jpg$/);
  });

  it('extracts extension correctly', () => {
    const path = buildStoragePath('be_sales', 'INV-001', 'cancelEvidence', 'document.pdf');
    expect(path).toMatch(/\.pdf$/);
  });

  it('sanitizes slashes and special chars', () => {
    const path = buildStoragePath('be_sales', 'INV/001#?%', 'field', 'file.png');
    expect(path).not.toMatch(/[#?%]/);
    expect(path).toMatch(/INV_001___/);
  });

  it('handles missing extension', () => {
    const path = buildStoragePath('col', 'doc', 'field', 'noext');
    expect(path).toMatch(/\.noext$/);
  });

  it('handles empty inputs gracefully', () => {
    const path = buildStoragePath('', '', '', '');
    expect(path).toMatch(/^uploads\//);
  });
});
