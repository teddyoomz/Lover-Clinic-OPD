// TFP image thumbnails (2026-07-05, Q3=B) — upload chokepoint + readers sweep
// + delete cascade + Rule I flow chain.
// User pain: "หน้า TFP ที่มีการลงรูปไว้เยอะๆจะโหลดนานมาก" → grids render ~320px
// thumbs; the FULL image loads only on zoom.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─── U1-U2: upload chokepoint contract (mocked blob uploader + canvas-free) ──
const uploadCalls = [];
vi.mock('../src/lib/chartImageStorage.js', () => ({
  uploadTreatmentBlob: vi.fn(async ({ customerId, dataUrl, kind }) => {
    uploadCalls.push({ customerId, dataUrl, kind });
    if (globalThis.__thumbUploadShouldFail && String(kind).endsWith('thumb')) {
      throw new Error('THUMB_UPLOAD_BOOM');
    }
    return { url: `https://storage/${kind}-url`, storagePath: `uploads/be_treatments/C1/${kind}-1.jpg` };
  }),
  deleteTreatmentBlob: vi.fn(async () => true),
}));

import { processAndUploadTreatmentImage, TREATMENT_THUMB_MAX_DIM, TREATMENT_THUMB_QUALITY } from '../src/lib/treatmentImageUpload.js';
import * as tiu from '../src/lib/treatmentImageUpload.js';

// jsdom has no real canvas/Image decode — stub the resize step (pure passthrough
// tagging) so we test the ORCHESTRATION contract (what uploads, what shape returns).
const stubResize = () => vi.spyOn(tiu, 'resizeImageDataUrl');

const FILE = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  uploadCalls.length = 0;
  globalThis.__thumbUploadShouldFail = false;
});

describe('U1 — processAndUploadTreatmentImage uploads FULL + THUMB คู่กัน', () => {
  // jsdom can't decode images — intercept the module's own resize via a
  // FileReader+Image stub: instead we monkeypatch globals used inside.
  const origImage = globalThis.Image;
  const origFileReader = globalThis.FileReader;

  beforeEach(() => {
    // FileReader → fixed data URL
    globalThis.FileReader = class {
      readAsDataURL() { setTimeout(() => this.onload?.({ target: { result: 'data:image/jpeg;base64,AAA' } }), 0); }
    };
    // Image decode → 100×80 fixed; canvas.toDataURL → tagged output
    globalThis.Image = class {
      set src(_v) { setTimeout(() => { this.width = 100; this.height = 80; this.onload?.(); }, 0); }
    };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          set width(_w) {}, set height(_h) {},
          getContext: () => ({ drawImage: () => {}, imageSmoothingEnabled: true, imageSmoothingQuality: 'high' }),
          toDataURL: (mime, q) => `data:image/jpeg;base64,RESIZED-q${q}`,
        };
      }
      return origCreate(tag);
    });
  });

  afterEach?.(() => {
    globalThis.Image = origImage;
    globalThis.FileReader = origFileReader;
    vi.restoreAllMocks();
  });

  it('U1.1 อัพโหลด 2 ครั้ง: kind เดิม + `${kind}thumb`; return ครบ 5 fields ไม่มี undefined (V14)', async () => {
    const entry = await processAndUploadTreatmentImage({ file: FILE, customerId: 'C1', kind: 'photo' });
    expect(uploadCalls).toHaveLength(2);
    expect(uploadCalls[0].kind).toBe('photo');
    expect(uploadCalls[1].kind).toBe('photothumb');
    expect(entry).toEqual({
      dataUrl: 'https://storage/photo-url',
      storagePath: 'uploads/be_treatments/C1/photo-1.jpg',
      thumbUrl: 'https://storage/photothumb-url',
      thumbStoragePath: 'uploads/be_treatments/C1/photothumb-1.jpg',
      id: '',
    });
    Object.values(entry).forEach(v => expect(v).not.toBeUndefined());
  });

  it('U1.2 thumb upload ล้มเหลว → NON-FATAL: รูปเต็มรอด + thumb fields = "" (grid fallback)', async () => {
    globalThis.__thumbUploadShouldFail = true;
    const entry = await processAndUploadTreatmentImage({ file: FILE, customerId: 'C1', kind: 'labimg' });
    expect(entry.dataUrl).toBe('https://storage/labimg-url');
    expect(entry.thumbUrl).toBe('');
    expect(entry.thumbStoragePath).toBe('');
  });

  it('U1.3 ค่าคงที่ thumb ตาม spec (~320px / q0.7)', () => {
    expect(TREATMENT_THUMB_MAX_DIM).toBe(320);
    expect(TREATMENT_THUMB_QUALITY).toBe(0.7);
  });
});

// ─── SG: source-grep locks (readers + persist + cascade + backfill) ─────────
describe('SG — readers ทุก surface ใช้ thumb-first + lazy; zoom = FULL', () => {
  const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');

  it('SG1 TFP grids + lab: thumbUrl || dataUrl + loading="lazy"; Lightbox ใช้ dataUrl เต็ม', () => {
    const tfp = read('src/components/TreatmentFormPage.jsx');
    const gridImgs = tfp.match(/<img src=\{img\.thumbUrl \|\| img\.dataUrl\} alt="" loading="lazy"/g) || [];
    expect(gridImgs.length).toBe(2); // photo grid + lab grid
    expect(tfp).toMatch(/setImageLightboxSrc\(img\.dataUrl\)/); // zoom = full
    expect(tfp).not.toMatch(/setImageLightboxSrc\(img\.thumbUrl/);
  });

  it('SG2 TFP persist: entries เก็บ thumbUrl + thumbStoragePath ครบ 4 arrays (V14 ไม่มี undefined)', () => {
    const tfp = read('src/components/TreatmentFormPage.jsx');
    const persists = tfp.match(/thumbUrl: i\.thumbUrl \|\| '', thumbStoragePath: i\.thumbStoragePath \|\| ''/g) || [];
    expect(persists.length).toBe(4); // before/after/other + lab images
  });

  it('SG3 ReadOnlyPanel: imageThumbUrl helper + ใช้ในทั้ง 3 จุด (single/carousel/strip); onZoom ยังส่ง full', () => {
    const p = read('src/components/backend/TreatmentReadOnlyPanel.jsx');
    expect(p).toMatch(/function imageThumbUrl\(img\)/);
    expect((p.match(/imageThumbUrl\(/g) || []).length).toBeGreaterThanOrEqual(4); // def + 3 uses
    expect(p).toMatch(/onZoom\?\.\(src, label\)/);
  });

  it('SG4 ReadOnlyMirror: object-aware imageUrl + thumb-first grid + zoom full', () => {
    const m = read('src/components/backend/TreatmentReadOnlyMirror.jsx');
    expect(m).toMatch(/return img\.dataUrl \|\| img\.url \|\| null;/); // object-aware (latent fix)
    expect(m).toMatch(/src=\{imageThumbUrl\(src\)\}/);
    expect(m).toMatch(/onZoom\?\.\(imageUrl\(src\)/);
  });

  it('SG5 history ImageRow: img = thumb, href = full', () => {
    const h = read('src/components/backend/treatment-history/TreatmentDetailComponents.jsx');
    expect(h).toMatch(/img\?\.thumbUrl\) \? img\.thumbUrl : src/);
    expect(h).toMatch(/<a key=\{i\} href=\{src\}/);
  });

  it('SG6 delete cascade: thumbStoragePath ตายคู่กับรูปเต็ม (backendClient + TFP remove)', () => {
    const bc = read('src/lib/backendClient.js');
    expect(bc).toMatch(/if \(x\?\.thumbStoragePath\) paths\.push\(x\.thumbStoragePath\);/);
    const tfp = read('src/components/TreatmentFormPage.jsx');
    expect(tfp).toMatch(/removeTreatmentBlob\(img\?\.storagePath, img\?\.thumbStoragePath\)/);
    expect(tfp).toMatch(/removeTreatmentBlob\(removed\?\.storagePath, removed\?\.thumbStoragePath\)/);
  });

  it('SG7 backfill script: two-phase + idempotent skip + audit + forensic stamp', () => {
    const s = read('scripts/backfill-treatment-image-thumbs.mjs');
    expect(s).toMatch(/process\.argv\.includes\('--apply'\)/);
    expect(s).toMatch(/img\?\.storagePath && !img\?\.thumbUrl/); // idempotent candidate filter
    expect(s).toMatch(/_thumbBackfilledAt/);
    expect(s).toMatch(/be_admin_audit/);
    expect(s).toMatch(/fileURLToPath\(import\.meta\.url\)/); // invocation guard
  });
});

// ─── F: Rule I flow chain (pure mirrors ของ entry lifecycle) ────────────────
describe('F — flow: upload → entry → persist → re-load → render src decision', () => {
  const persistEntry = (i) => ({ dataUrl: i.dataUrl, id: i.id || '', storagePath: i.storagePath || '', thumbUrl: i.thumbUrl || '', thumbStoragePath: i.thumbStoragePath || '' });
  const renderSrc = (img) => img.thumbUrl || img.dataUrl; // mirror ของ grid
  const zoomSrc = (img) => img.dataUrl;                    // mirror ของ lightbox

  it('F1 รูปใหม่ (มี thumb): grid ใช้ thumb, zoom ใช้ full, persist ครบ round-trip', () => {
    const uploaded = { dataUrl: 'https://s/full.jpg', storagePath: 'p/full.jpg', thumbUrl: 'https://s/t.jpg', thumbStoragePath: 'p/t.jpg', id: '' };
    const persisted = persistEntry(uploaded);
    expect(renderSrc(persisted)).toBe('https://s/t.jpg');
    expect(zoomSrc(persisted)).toBe('https://s/full.jpg');
    // edit-load restore (setBeforeImages(t.beforeImages) — whole objects) → fields survive
    const reloaded = { ...persisted };
    expect(renderSrc(reloaded)).toBe('https://s/t.jpg');
  });

  it('F2 รูป legacy (ไม่มี thumb): fallback full + persist ไม่มี undefined (V14)', () => {
    const legacy = { dataUrl: 'https://s/old.jpg', storagePath: 'p/old.jpg', id: 'x' };
    const persisted = persistEntry(legacy);
    expect(renderSrc(persisted)).toBe('https://s/old.jpg');
    Object.values(persisted).forEach(v => expect(v).not.toBeUndefined());
  });

  it('F3 legacy inline base64 (ไม่มี storagePath): แสดงได้เหมือนเดิม + backfill ข้าม', () => {
    const inline = { dataUrl: 'data:image/jpeg;base64,AAA', id: 'y' };
    const persisted = persistEntry(inline);
    expect(renderSrc(persisted)).toBe('data:image/jpeg;base64,AAA');
    const isBackfillCandidate = !!(persisted.storagePath && !persisted.thumbUrl);
    expect(isBackfillCandidate).toBe(false);
  });
});
