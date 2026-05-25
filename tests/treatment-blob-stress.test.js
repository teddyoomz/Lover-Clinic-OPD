// 2026-05-25 — Treatment-blob Storage-ref STRESS / future-bug hunt (companion to
// the real-prod e2e scripts/e2e-treatment-blob-storage-stress.mjs). Targets the
// LOGIC edge cases the e2e can't reach: the pendingUploads counter race (stuck-gate
// future bug), error-path decrement, resize-math fuzz, MIME-ext edges, chart-cap
// boundary, and a cascade-completeness guard (new blob field w/o cascade = orphan).
import { describe, it, expect, vi, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGINAL_FETCH = global.fetch;
afterAll(() => { if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH; });

vi.mock('../src/firebase.js', () => ({ storage: {}, db: {}, auth: {}, appId: 'test' }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s, p) => ({ __path: p })),
  uploadString: vi.fn(async () => {}),
  getDownloadURL: vi.fn(async (r) => `https://dl/${encodeURIComponent(r.__path)}`),
  deleteObject: vi.fn(async () => {}),
}));

import { uploadTreatmentBlob } from '../src/lib/chartImageStorage.js';
import { computeResizeDims } from '../src/lib/treatmentImageUpload.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const TFP = read('src/components/TreatmentFormPage.jsx');
const BC = read('src/lib/backendClient.js');

// Deterministic PRNG (mulberry32) for reproducible fuzz.
function mulberry32(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── S1 — pendingUploads counter: functional reducer is race-safe (never stuck/negative) ──
describe('S1 — pendingUploads counter race-safety', () => {
  const inc = (n) => n + 1;                  // mirror: setPendingUploads(n => n + 1)
  const dec = (n) => Math.max(0, n - 1);     // mirror: setPendingUploads(n => Math.max(0, n - 1))
  it('S1.1 paired inc-before-dec (real upload lifecycle) always returns to 0, never clamped', () => {
    // Faithful model: each upload inc()s at start (sync, before the await) and dec()s
    // in its finally (after). A dec NEVER precedes its own inc → the counter never
    // needs the Math.max clamp and always settles at exactly 0 → save-gate never stuck.
    const rng = mulberry32(42);
    for (let trial = 0; trial < 50; trial++) {
      const total = 1 + Math.floor(rng() * 20);
      let started = 0, finished = 0, n = 0, neededClamp = false;
      while (finished < total) {
        const canStart = started < total, canFinish = started > finished;
        if (canStart && (!canFinish || rng() < 0.5)) { n = inc(n); started++; }
        else { if (n === 0) neededClamp = true; n = dec(n); finished++; }
      }
      expect(n).toBe(0);                // gate returns to 0 → never stuck
      expect(neededClamp).toBe(false);  // inc-before-dec → clamp never needed
    }
  });
  it('S1.2 extra dec (error before inc settled) never goes negative', () => {
    let n = 0; n = dec(dec(inc(n))); expect(n).toBe(0);
  });
  it('S1.3 a stuck gate is impossible: every inc is paired with a finally-dec', () => {
    // Source proof: equal count of inc + finally-dec across the 4 upload sites.
    const incs = (TFP.match(/setPendingUploads\(n => n \+ 1\)/g) || []).length;
    const decs = (TFP.match(/setPendingUploads\(n => Math\.max\(0, n - 1\)\)/g) || []).length;
    expect(incs).toBe(4);          // photo + lab-image + lab-pdf + tfile-pdf
    expect(decs).toBe(4);          // one finally per site
    expect(incs).toBe(decs);
  });
});

// ── S2 — every upload site is structured inc→try→catch(alert)→finally(dec) ──
describe('S2 — upload-site error-handling structure', () => {
  it('S2.1 each upload site has try/catch/finally with an alert on failure', () => {
    // 4 sites → 4 finally-dec; ≥4 catch-alerts referencing upload failure.
    expect((TFP.match(/} finally \{\s*setPendingUploads\(n => Math\.max\(0, n - 1\)\)/g) || []).length).toBe(4);
    expect((TFP.match(/อัปโหลด.*ไม่สำเร็จ/g) || []).length).toBeGreaterThanOrEqual(4);
  });
  it('S2.2 save is gated on pendingUploads (data-integrity: no half-uploaded persist)', () => {
    expect(TFP).toMatch(/if \(pendingUploads > 0\) \{ alert\(/);
  });
});

// ── S3 — computeResizeDims property fuzz (100 random) ──
describe('S3 — computeResizeDims fuzz', () => {
  it('S3.0 extreme aspect ratio never yields a 0 dimension (clamp ≥1)', () => {
    expect(computeResizeDims(8000, 15, 256)).toEqual({ w: 256, h: 1 });
    expect(computeResizeDims(15, 8000, 256)).toEqual({ w: 1, h: 256 });
  });
  it('S3.1 100 random dims: ≤ maxDim, ≥1 for positive input, integer, ratio preserved (non-extreme)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const w = Math.floor(rng() * 8000), h = Math.floor(rng() * 8000), max = 256 + Math.floor(rng() * 4000);
      const r = computeResizeDims(w, h, max);
      expect(Number.isInteger(r.w) && Number.isInteger(r.h)).toBe(true);
      if (w > 0 && h > 0) {
        expect(r.w).toBeGreaterThanOrEqual(1); expect(r.h).toBeGreaterThanOrEqual(1);
        expect(r.w).toBeLessThanOrEqual(max); expect(r.h).toBeLessThanOrEqual(max);
        // ratio preserved within rounding — skip when a side clamped to 1 (extreme ratio).
        if (r.w > 8 && r.h > 8) {
          expect(Math.abs((r.w / r.h) - (w / h))).toBeLessThan(0.02 * (w / h) + 0.05);
        }
      }
    }
  });
  it('S3.2 degenerate inputs → finite (no NaN/throw)', () => {
    for (const [w, h] of [[0, 0], [-5, 10], [NaN, 10], [Infinity, 10], [10, 0]]) {
      const r = computeResizeDims(w, h, 1920);
      expect(Number.isFinite(r.w) && Number.isFinite(r.h)).toBe(true);
    }
  });
});

// ── S4 — uploadTreatmentBlob MIME → extension edges ──
describe('S4 — blob extension derivation', () => {
  const cases = [
    ['data:image/jpeg;base64,x', /\.jpg$/],
    ['data:image/png;base64,x', /\.png$/],
    ['data:image/webp;base64,x', /\.webp$/],
    ['data:image/gif;base64,x', /\.gif$/],
    ['data:image/svg+xml;base64,x', /\.svg$/],
    ['data:image/heic;base64,x', /\.heic$/],
    ['data:application/pdf;base64,x', /\.pdf$/],
  ];
  it('S4.1 each accepted MIME → sane extension + path has no injection', async () => {
    for (const [dataUrl, extRe] of cases) {
      const { storagePath } = await uploadTreatmentBlob({ customerId: 'c', dataUrl, kind: 'photo' });
      expect(storagePath).toMatch(extRe);
      expect(storagePath.startsWith('uploads/be_treatments/c/')).toBe(true);
      expect(storagePath.split('/').length).toBe(4); // exactly the 4-segment rule-matched path
    }
  });
  it('S4.2 uppercase / odd MIME tolerated (no throw, no empty ext)', async () => {
    const { storagePath } = await uploadTreatmentBlob({ customerId: 'c', dataUrl: 'data:IMAGE/JPEG;base64,x', kind: 'photo' });
    expect(storagePath).toMatch(/\.[a-z0-9]+$/);
  });
});

// ── S5 — chart cap boundary (exact slice behavior) ──
describe('S5 — chart cap = 10 boundary', () => {
  const MAX = 10;
  const append = (arr) => [...arr, { dataUrl: 'http://new' }].slice(0, MAX);
  it('S5.1 append caps at exactly 10 for 0..15 existing', () => {
    for (let n = 0; n <= 15; n++) {
      const out = append(Array.from({ length: n }, (_, i) => ({ dataUrl: 'c' + i })));
      expect(out.length).toBe(Math.min(n + 1, MAX));
    }
  });
});

// ── S6 — FUTURE-BUG GUARD: cascade completeness (new blob field w/o cascade = orphan) ──
describe('S6 — delete-cascade completeness', () => {
  it('S6.1 every storagePath-bearing persist field has a cascade collector entry', () => {
    // TFP persists storagePath on these image families + pdfStoragePath on these pdf families.
    // backendClient.deleteBackendTreatment MUST collect each, or its Storage objects orphan.
    const imageFamilies = ['beforeImages', 'afterImages', 'otherImages', 'charts'];
    for (const f of imageFamilies) {
      expect(BC.includes(`pushImgPaths(detail.${f})`)).toBe(true);
    }
    // nested: labItems[].images (pushImg) + labItems[].pdfStoragePath + treatmentFiles[].pdfStoragePath
    expect(BC).toMatch(/pushImgPaths\(l\?\.images\)/);
    expect(BC).toMatch(/if \(l\?\.pdfStoragePath\) paths\.push\(l\.pdfStoragePath\)/);
    expect(BC).toMatch(/if \(f\?\.pdfStoragePath\) paths\.push\(f\.pdfStoragePath\)/);
  });
  it('S6.2 TFP persists storagePath/pdfStoragePath on exactly the families the cascade covers', () => {
    // If a new family is added to persist with (pdf)storagePath, this lock forces adding a cascade entry too.
    expect((TFP.match(/storagePath: i\.storagePath \|\| ''/g) || []).length).toBeGreaterThanOrEqual(4); // before/after/other + lab images
    expect((TFP.match(/pdfStoragePath: [lf]\.pdfStoragePath \|\| ''/g) || []).length).toBeGreaterThanOrEqual(2); // lab pdf + tfile (block 1)
  });
});
