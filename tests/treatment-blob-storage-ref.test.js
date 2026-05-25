// 2026-05-25 — Treatment-blob Storage-ref migration (Rule P class-of-bug fix).
// be_treatments stored Before/After/Other photos + lab images + lab/treatment PDFs
// as INLINE base64 → 1 MiB doc cap → intermittent save failure + upload jank.
// All blobs now upload to Firebase Storage (mirror the 2026-05-22 chart fix).
// AV129 locks the contract. Chart cap also raised 2 → 10 here.
import { describe, it, expect, vi, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGINAL_FETCH = global.fetch;
afterAll(() => { if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH; });

// Mock firebase so chartImageStorage imports cleanly (mirror tablet-chart-more-tools).
vi.mock('../src/firebase.js', () => ({ storage: {}, db: {}, auth: {}, appId: 'test' }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s, p) => ({ __path: p })),
  uploadString: vi.fn(async () => {}),
  getDownloadURL: vi.fn(async (r) => `https://dl.example/${encodeURIComponent(r.__path)}?alt=media&token=t`),
  deleteObject: vi.fn(async () => {}),
}));

import { uploadTreatmentBlob, uploadChartImage, deleteTreatmentBlob, deleteChartImage } from '../src/lib/chartImageStorage.js';
import { computeResizeDims } from '../src/lib/treatmentImageUpload.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const TFP = read('src/components/TreatmentFormPage.jsx');
const STORE = read('src/lib/chartImageStorage.js');
const UPLOAD = read('src/lib/treatmentImageUpload.js');
const BC = read('src/lib/backendClient.js');
const CHART_SECTION = read('src/components/ChartSection.jsx');

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgo=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQ=';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQ=';

// ───────────────────────────── A — Storage helper ─────────────────────────────
describe('A — uploadTreatmentBlob / uploadChartImage / deleteTreatmentBlob', () => {
  it('A1 rejects missing or non-image/non-pdf data URL', async () => {
    await expect(uploadTreatmentBlob({ customerId: 'c', dataUrl: '' })).rejects.toThrow();
    await expect(uploadTreatmentBlob({ customerId: 'c', dataUrl: 'data:text/plain;base64,aGk=' })).rejects.toThrow();
    await expect(uploadTreatmentBlob({ customerId: 'c', dataUrl: 'https://x/y.png' })).rejects.toThrow();
  });
  it('A2 image/jpeg → ext jpg + path uploads/be_treatments/{docId}/{kind}-...', async () => {
    const { url, storagePath } = await uploadTreatmentBlob({ customerId: 'LC-26000106', dataUrl: JPG, kind: 'photo' });
    expect(storagePath).toMatch(/^uploads\/be_treatments\/LC-26000106\/photo-\d+-[0-9a-f]+\.jpg$/);
    expect(url).toContain('https://dl.example/');
  });
  it('A3 image/png → ext png', async () => {
    const { storagePath } = await uploadTreatmentBlob({ customerId: 'c', dataUrl: PNG_1PX, kind: 'chart' });
    expect(storagePath).toMatch(/\/chart-\d+-[0-9a-f]+\.png$/);
  });
  it('A4 application/pdf accepted → ext pdf', async () => {
    const { storagePath } = await uploadTreatmentBlob({ customerId: 'c', dataUrl: PDF, kind: 'labpdf' });
    expect(storagePath).toMatch(/\/labpdf-\d+-[0-9a-f]+\.pdf$/);
  });
  it('A5 sanitizes unsafe chars in customerId', async () => {
    const { storagePath } = await uploadTreatmentBlob({ customerId: 'a/b c#1', dataUrl: JPG, kind: 'tfile' });
    expect(storagePath).toContain('/be_treatments/a_b_c_1/');
  });
  it('A6 uploadChartImage delegates (kind=chart) + rejects non-image', async () => {
    const { storagePath } = await uploadChartImage({ customerId: 'c', dataUrl: PNG_1PX });
    expect(storagePath).toContain('/chart-');
    await expect(uploadChartImage({ customerId: 'c', dataUrl: PDF })).rejects.toThrow();
  });
  it('A7 deleteTreatmentBlob is the deleteChartImage alias', () => {
    expect(deleteTreatmentBlob).toBe(deleteChartImage);
  });
});

// ───────────────────────────── B — computeResizeDims (pure) ─────────────────────────────
describe('B — computeResizeDims', () => {
  it('B1 within maxDim → unchanged (rounded)', () => {
    expect(computeResizeDims(800, 600, 1920)).toEqual({ w: 800, h: 600 });
  });
  it('B2 landscape over cap → width=maxDim, height scaled', () => {
    expect(computeResizeDims(3840, 2160, 1920)).toEqual({ w: 1920, h: 1080 });
  });
  it('B3 portrait over cap → height=maxDim, width scaled', () => {
    expect(computeResizeDims(2160, 3840, 1920)).toEqual({ w: 1080, h: 1920 });
  });
  it('B4 square over cap → both maxDim', () => {
    expect(computeResizeDims(4000, 4000, 1920)).toEqual({ w: 1920, h: 1920 });
  });
  it('B5 zero/invalid → {0,0}', () => {
    expect(computeResizeDims(0, 100)).toEqual({ w: 0, h: 0 });
    expect(computeResizeDims(NaN, NaN)).toEqual({ w: 0, h: 0 });
  });
});

// ───────────────────────────── C — Rule I flow-simulate (pure mirrors) ─────────────────────────────
// Mirror of backendClient.deleteBackendTreatment path collection — locked to the
// real impl by D6 source-grep. Asserts every blob type contributes its storagePath
// + legacy inline (no storagePath) skips.
function collectBlobStoragePaths(detail = {}) {
  const paths = [];
  const pushImg = (arr) => (arr || []).forEach(x => { if (x?.storagePath) paths.push(x.storagePath); });
  pushImg(detail.charts);
  pushImg(detail.beforeImages);
  pushImg(detail.afterImages);
  pushImg(detail.otherImages);
  (detail.labItems || []).forEach(l => { pushImg(l?.images); if (l?.pdfStoragePath) paths.push(l.pdfStoragePath); });
  (detail.treatmentFiles || []).forEach(f => { if (f?.pdfStoragePath) paths.push(f.pdfStoragePath); });
  return paths;
}
// Mirror of the persist map for a treatment-image gallery entry.
const persistImg = (i) => ({ dataUrl: i.dataUrl, id: i.id || '', storagePath: i.storagePath || '' });

describe('C — flow-simulate (persist shape + delete cascade)', () => {
  it('C1 new-upload gallery entry holds a Storage URL + storagePath, NOT inline base64', () => {
    const entry = { dataUrl: 'https://dl.example/uploads%2Fbe_treatments%2Fc%2Fphoto-1-ab.jpg', storagePath: 'uploads/be_treatments/c/photo-1-ab.jpg', id: '' };
    const p = persistImg(entry);
    expect(p.dataUrl.startsWith('data:')).toBe(false);
    expect(p.dataUrl.startsWith('http')).toBe(true);
    expect(p.storagePath).toBeTruthy();
  });
  it('C2 persist map preserves storagePath', () => {
    expect(persistImg({ dataUrl: 'http://x', storagePath: 'p', id: '7' })).toEqual({ dataUrl: 'http://x', id: '7', storagePath: 'p' });
  });
  it('C3 delete cascade collects EVERY blob type', () => {
    const detail = {
      charts: [{ storagePath: 'ch1' }, { storagePath: 'ch2' }],
      beforeImages: [{ storagePath: 'b1' }],
      afterImages: [{ storagePath: 'a1' }],
      otherImages: [{ storagePath: 'o1' }],
      labItems: [{ images: [{ storagePath: 'li1' }, { storagePath: 'li2' }], pdfStoragePath: 'lp1' }],
      treatmentFiles: [{ pdfStoragePath: 'tf1' }, { pdfStoragePath: 'tf2' }],
    };
    expect(collectBlobStoragePaths(detail).sort()).toEqual(['a1', 'b1', 'ch1', 'ch2', 'li1', 'li2', 'lp1', 'o1', 'tf1', 'tf2'].sort());
  });
  it('C4 legacy inline (no storagePath) → skipped, no orphan delete attempt', () => {
    const detail = {
      beforeImages: [{ dataUrl: 'data:image/jpeg;base64,xxx' }],   // legacy inline
      otherImages: [{ dataUrl: 'http://x', storagePath: 'o1' }],   // new Storage
      labItems: [{ pdfBase64: 'data:application/pdf;base64,yy' }], // legacy inline PDF (no pdfStoragePath)
    };
    expect(collectBlobStoragePaths(detail)).toEqual(['o1']);
  });
});

// ───────────────────────────── D — source-grep regression (Rule P locks) ─────────────────────────────
describe('D — source-grep regression', () => {
  it('D1 treatmentImageUpload.js exports the upload helpers', () => {
    expect(UPLOAD).toMatch(/export function computeResizeDims/);
    expect(UPLOAD).toMatch(/export function readFileAsDataURL/);
    expect(UPLOAD).toMatch(/export function resizeImageDataUrl/);
    expect(UPLOAD).toMatch(/export async function processAndUploadTreatmentImage/);
    expect(UPLOAD).toMatch(/export async function uploadTreatmentPdf/);
  });
  it('D2 chartImageStorage exports uploadTreatmentBlob + deleteTreatmentBlob; chart delegates', () => {
    expect(STORE).toMatch(/export async function uploadTreatmentBlob/);
    expect(STORE).toMatch(/export const deleteTreatmentBlob = deleteChartImage/);
    expect(STORE).toMatch(/return uploadTreatmentBlob\(\{ customerId, dataUrl, kind: 'chart' \}\)/);
  });
  it('D3 TFP upload sites route through the Storage helpers', () => {
    expect(TFP).toMatch(/processAndUploadTreatmentImage\(\{ file, customerId, kind: 'photo' \}\)/);
    expect(TFP).toMatch(/processAndUploadTreatmentImage\(\{ file, customerId, kind: 'labimg' \}\)/);
    expect(TFP).toMatch(/uploadTreatmentPdf\(\{ file, customerId, kind: 'labpdf' \}\)/);
    expect(TFP).toMatch(/uploadTreatmentPdf\(\{ file, customerId, kind: 'tfile' \}\)/);
  });
  it('D3-bis NO inline base64 pipeline remains in TFP (zero readAsDataURL/toDataURL)', () => {
    // The 4 inline FileReader→canvas→toDataURL upload sites are gone; resize lives
    // only in treatmentImageUpload.js. Re-introducing an inline blob fails this lock.
    expect(TFP.includes('readAsDataURL')).toBe(false);
    expect(TFP.includes('toDataURL')).toBe(false);
  });
  it('D4 TFP persist carries storagePath / pdfStoragePath (both save blocks)', () => {
    expect(TFP).toMatch(/beforeImages: beforeImages\.map\(i => \(\{ dataUrl: i\.dataUrl, id: i\.id \|\| '', storagePath: i\.storagePath \|\| '' \}\)\)/);
    expect(TFP).toMatch(/images: \(l\.images \|\| \[\]\)\.map\(i => \(\{ dataUrl: i\.dataUrl, id: i\.id \|\| '', storagePath: i\.storagePath \|\| '' \}\)\)/);
    expect(TFP).toMatch(/pdfBase64: l\.pdfBase64 \|\| '', pdfStoragePath: l\.pdfStoragePath \|\| ''/);
    expect(TFP).toMatch(/pdfBase64: f\.pdfBase64 \|\| '', pdfStoragePath: f\.pdfStoragePath \|\| ''/);
    // doctor-save block
    expect(TFP).toMatch(/pdfBase64: l\.pdfBase64, pdfStoragePath: l\.pdfStoragePath \|\| ''/);
    expect(TFP).toMatch(/pdfBase64: f\.pdfBase64, pdfStoragePath: f\.pdfStoragePath \|\| '', fileName: f\.fileName/);
  });
  it('D5 TFP has upload-pending state + save-gate', () => {
    expect(TFP).toMatch(/const \[pendingUploads, setPendingUploads\] = useState\(0\)/);
    expect(TFP).toMatch(/if \(pendingUploads > 0\) \{ alert\(/);
  });
  it('D6 deleteBackendTreatment cascades all blob types via deleteTreatmentBlob', () => {
    expect(BC).toMatch(/pushImgPaths\(detail\.beforeImages\)/);
    expect(BC).toMatch(/pushImgPaths\(detail\.afterImages\)/);
    expect(BC).toMatch(/pushImgPaths\(detail\.otherImages\)/);
    expect(BC).toMatch(/if \(l\?\.pdfStoragePath\) paths\.push\(l\.pdfStoragePath\)/);
    expect(BC).toMatch(/if \(f\?\.pdfStoragePath\) paths\.push\(f\.pdfStoragePath\)/);
    expect(BC).toMatch(/const \{ deleteTreatmentBlob \} = await import\('\.\/chartImageStorage\.js'\)/);
  });
  it('D7 ChartSection cap raised 2 → 10', () => {
    expect(CHART_SECTION).toMatch(/const MAX_CHARTS = 10/);
    expect(CHART_SECTION).toMatch(/\.slice\(0, MAX_CHARTS\)/);
    expect(CHART_SECTION).toMatch(/charts\.length < MAX_CHARTS/);
    expect(CHART_SECTION.includes('.slice(0, 2)')).toBe(false);
    expect(CHART_SECTION.includes('charts.length < 2')).toBe(false);
  });
});

// ───────────────────────────── E — AV129 invariant present ─────────────────────────────
describe('E — AV129 codified', () => {
  it('E1 audit-anti-vibe-code SKILL.md documents AV129', () => {
    const av = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(av).toMatch(/AV129/);
    expect(av).toMatch(/be_treatments/);
  });
});
