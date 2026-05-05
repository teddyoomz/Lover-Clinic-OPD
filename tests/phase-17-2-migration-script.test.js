// ─── Phase 17.2 — migration script pure helpers ───────────────────────────
// Tests pickDefaultTarget / chunkOps500 / maybeTruncate / summarizeLegacyDocs
// extracted from scripts/phase-17-2-remove-main-branch.mjs.

import { describe, it, expect } from 'vitest';
import {
  pickDefaultTarget,
  chunkOps500,
  maybeTruncate,
  summarizeLegacyDocs,
} from '../scripts/phase-17-2-remove-main-branch.mjs';

describe('M1 — pickDefaultTarget', () => {
  it('M1.1 picks isDefault=true branch when present', () => {
    const branches = [
      { branchId: 'BR-A', name: 'A', isDefault: false },
      { branchId: 'BR-B', name: 'B', isDefault: true },
    ];
    expect(pickDefaultTarget(branches).branchId).toBe('BR-B');
  });

  it('M1.2 falls back to alphabetical-first when no isDefault=true', () => {
    const branches = [
      { branchId: 'BR-Z', name: 'พระราม 3' },
      { branchId: 'BR-A', name: 'นครราชสีมา' },
    ];
    // Thai locale: นครราชสีมา < พระราม 3
    expect(pickDefaultTarget(branches).branchId).toBe('BR-A');
  });

  it('M1.3 throws on empty branches', () => {
    expect(() => pickDefaultTarget([])).toThrow();
  });

  it('M1.4 throws on null', () => {
    expect(() => pickDefaultTarget(null)).toThrow();
  });
});

describe('M2 — chunkOps500', () => {
  it('M2.1 single-chunk under limit', () => {
    const ops = Array.from({ length: 10 }, (_, i) => ({ i }));
    expect(chunkOps500(ops).length).toBe(1);
  });

  it('M2.2 splits at 500', () => {
    const ops = Array.from({ length: 1234 }, (_, i) => ({ i }));
    const chunks = chunkOps500(ops);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(500);
    expect(chunks[1].length).toBe(500);
    expect(chunks[2].length).toBe(234);
  });

  it('M2.3 empty array → empty chunks', () => {
    expect(chunkOps500([])).toEqual([]);
  });
});

describe('M3 — maybeTruncate', () => {
  it('M3.1 returns full array when ≤ max', () => {
    const r = maybeTruncate([1, 2, 3], 500);
    expect(r.value).toEqual([1, 2, 3]);
    expect(r.truncated).toBe(false);
  });

  it('M3.2 truncates when > max', () => {
    const arr = Array.from({ length: 600 }, (_, i) => `id-${i}`);
    const r = maybeTruncate(arr, 500);
    expect(r.value.length).toBe(10);
    expect(r.truncated).toBe(true);
    expect(r.totalCount).toBe(600);
  });

  it('M3.3 default max=500', () => {
    const arr = Array.from({ length: 600 }, (_, i) => i);
    const r = maybeTruncate(arr);
    expect(r.truncated).toBe(true);
  });
});

describe('M4 — summarizeLegacyDocs', () => {
  it('M4.1 counts + samples first 10', () => {
    const docs = Array.from({ length: 25 }, (_, i) => ({ id: `doc-${i}` }));
    const r = summarizeLegacyDocs(docs, 'branchId');
    expect(r.count).toBe(25);
    expect(r.sampleIds.length).toBe(10);
    expect(r.branchIdField).toBe('branchId');
  });

  it('M4.2 empty docs → count=0', () => {
    expect(summarizeLegacyDocs([], 'branchId').count).toBe(0);
  });
});
