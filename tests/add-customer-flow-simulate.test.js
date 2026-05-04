// V33-customer-create — addCustomer orchestrator full-flow simulate (Rule I).
// Mocks Firestore + Storage; asserts the complete payload that would be written
// to be_customers when a real admin uses the modal.

import { describe, it, expect, vi, beforeEach } from 'vitest';

let counterStore = null;
let writtenDoc = null;
let writtenDocPath = null;
let uploadFileCalls = null;
let runTxCalls = 0;

vi.mock('../src/firebase.js', () => ({
  db: { __mock: true },
  appId: 'test-app',
}));

vi.mock('firebase/firestore', () => ({
  doc: (db, ...path) => ({ __doc: path.join('/') }),
  collection: (db, ...path) => ({ __col: path.join('/') }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(async (ref, data) => {
    writtenDocPath = ref.__doc;
    writtenDoc = data;
  }),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) })),
  runTransaction: vi.fn(async (db, fn) => {
    runTxCalls += 1;
    return fn({
      get: async (ref) => {
        if (counterStore == null) return { exists: () => false, data: () => undefined };
        return { exists: () => true, data: () => counterStore };
      },
      set: (ref, data) => { counterStore = data; },
    });
  }),
  onSnapshot: vi.fn(),
}));

vi.mock('../src/lib/storageClient.js', () => ({
  uploadFile: vi.fn(async (file, path) => {
    uploadFileCalls.push({ name: file.name, path });
    return { url: `https://storage.test/${path}`, storagePath: path };
  }),
  buildStoragePath: (col, id, field, name) => `uploads/${col}/${id}/${field}_${Date.now()}.jpg`,
  compressImage: vi.fn(async (f) => f),
  deleteFile: vi.fn(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  counterStore = null;
  writtenDoc = null;
  writtenDocPath = null;
  uploadFileCalls = [];
  runTxCalls = 0;
  vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
});

describe('V33.L — addCustomer minimal happy path', () => {
  it('L1 — minimal form (firstname only) writes a complete doc', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    const result = await addCustomer({ firstname: 'จอห์น' });
    expect(result.id).toBe('LC-26000001');
    expect(result.hn).toBe('LC-26000001');
    expect(writtenDocPath).toContain('be_customers/LC-26000001');
  });
  it('L2 — written doc has every required root key', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer({ firstname: 'จอห์น' });
    // Phase BS (2026-05-06) — when no branchId opt is passed, addCustomer
    // falls back to resolveSelectedBranchId() which returns FALLBACK_ID
    // 'main' in jsdom (no localStorage prepopulated). Pre-Phase-BS the
    // default was `branchId: branchId || null`. The contract still ensures
    // a string (or null) is written; just verify it's set.
    expect(writtenDoc).toMatchObject({
      hn_no: 'LC-26000001',
      proClinicId: null,
      proClinicHN: null,
      isManualEntry: true,
      treatmentCount: 0,
      created_year: 2026,
    });
    // branchId always present (Phase BS) — falls back to FALLBACK_ID 'main'
    // when neither opts.branchId nor localStorage has a value.
    expect(writtenDoc).toHaveProperty('branchId');
    expect(typeof writtenDoc.branchId === 'string' || writtenDoc.branchId === null).toBe(true);
    expect(writtenDoc.courses).toEqual([]);
    expect(writtenDoc.appointments).toEqual([]);
    expect(writtenDoc.treatmentSummary).toEqual([]);
    expect(typeof writtenDoc.createdAt).toBe('string');
    expect(typeof writtenDoc.lastUpdatedAt).toBe('string');
    expect(typeof writtenDoc.clonedAt).toBe('string');  // sort-key compat
  });
  it('L3 — caller-supplied hn_no IS overridden by counter', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer({ firstname: 'A', hn_no: 'EVIL-123' });
    expect(writtenDoc.hn_no).toBe('LC-26000001');  // counter wins
  });
  it('L4 — branchId injected from opts', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer({ firstname: 'A' }, { branchId: 'BR-test' });
    expect(writtenDoc.branchId).toBe('BR-test');
  });
  it('L5 — createdBy injected from opts', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer({ firstname: 'A' }, { createdBy: 'admin-uid-123' });
    expect(writtenDoc.createdBy).toBe('admin-uid-123');
  });
});

describe('V33.M — addCustomer validation gating', () => {
  it('M1 — empty firstname throws with field marker', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await expect(addCustomer({ firstname: '' })).rejects.toMatchObject({
      message: 'กรุณากรอกชื่อ',
      field: 'firstname',
    });
    expect(writtenDoc).toBeNull();   // no Firestore write on validation fail
  });
  it('M2 — whitespace-only firstname rejected', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await expect(addCustomer({ firstname: '   ' })).rejects.toMatchObject({
      field: 'firstname',
    });
  });
  it('M3 — invalid email rejected (soft-validate)', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await expect(addCustomer({ firstname: 'A', email: 'not-an-email' })).rejects.toMatchObject({
      field: 'email',
    });
  });
  it('M4 — invalid facebook_link rejected', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await expect(addCustomer({ firstname: 'A', facebook_link: 'https://twitter.com/x' })).rejects.toMatchObject({
      field: 'facebook_link',
    });
  });
});

describe('V33.N — addCustomer upload pipeline', () => {
  it('N1 — profile file uploaded BEFORE Firestore write', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    const profile = { name: 'me.jpg', size: 1024, type: 'image/jpeg' };
    await addCustomer({ firstname: 'A' }, { files: { profile } });
    expect(uploadFileCalls.length).toBe(1);
    expect(uploadFileCalls[0].path).toContain('uploads/be_customers/LC-26000001/profile');
    expect(writtenDoc.profile_image).toMatch(/^https:\/\/storage\.test\//);
  });
  it('N2 — multiple gallery files all uploaded with unique paths', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    const gallery = [
      { name: '1.jpg', size: 1024, type: 'image/jpeg' },
      { name: '2.jpg', size: 1024, type: 'image/jpeg' },
      { name: '3.jpg', size: 1024, type: 'image/jpeg' },
    ];
    await addCustomer({ firstname: 'A' }, { files: { gallery } });
    expect(uploadFileCalls.length).toBe(3);
    const paths = uploadFileCalls.map(c => c.path);
    expect(new Set(paths).size).toBe(3);  // unique paths
    expect(writtenDoc.gallery_upload.length).toBe(3);
  });
  it('N3 — profile + gallery together both write into payload', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer(
      { firstname: 'A' },
      {
        files: {
          profile: { name: 'p.jpg', size: 100, type: 'image/jpeg' },
          gallery: [{ name: 'g.jpg', size: 100, type: 'image/jpeg' }],
        },
      },
    );
    expect(writtenDoc.profile_image).toBeTruthy();
    expect(writtenDoc.gallery_upload.length).toBe(1);
    expect(uploadFileCalls.length).toBe(2);
  });
  it('N4 — pre-existing gallery_upload URLs in form merge with uploaded ones', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer(
      { firstname: 'A', gallery_upload: ['https://existing.com/1', 'https://existing.com/2'] },
      { files: { gallery: [{ name: 'new.jpg', size: 100, type: 'image/jpeg' }] } },
    );
    expect(writtenDoc.gallery_upload.length).toBe(3);
    expect(writtenDoc.gallery_upload[0]).toBe('https://existing.com/1');
    expect(writtenDoc.gallery_upload[1]).toBe('https://existing.com/2');
  });
});

describe('V33.O — addCustomer normalization through orchestrator', () => {
  it('O1 — passport_id upper-cased before write', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer({ firstname: 'A', passport_id: '  aa1234567  ' });
    expect(writtenDoc.passport_id).toBe('AA1234567');
  });
  it('O2 — gender lower-case "m" → "M"', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer({ firstname: 'A', gender: 'm' });
    expect(writtenDoc.gender).toBe('M');
  });
  it('O3 — citizen_id with dashes stripped', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer({ firstname: 'A', citizen_id: '1-2345-67890-12-3' });
    expect(writtenDoc.citizen_id).toBe('1234567890123');
  });
  it('O4 — consent.imageMarketing default false', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer({ firstname: 'A' });
    expect(writtenDoc.consent).toEqual({
      marketing: false, healthData: false, imageMarketing: false,
    });
  });
  it('O5 — gallery_upload deduped on save', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    await addCustomer({
      firstname: 'A',
      gallery_upload: ['https://x.com/a', 'https://x.com/a', 'https://x.com/b'],
    });
    expect(writtenDoc.gallery_upload).toEqual(['https://x.com/a', 'https://x.com/b']);
  });
});

describe('V33.P — addCustomer sequential counter (no duplicate HN)', () => {
  it('P1 — 5 sequential addCustomer calls produce 5 unique sequential HNs', async () => {
    const { addCustomer } = await import('../src/lib/backendClient.js');
    const hns = [];
    // Sequential — Vitest mock tx doesn't simulate Firestore's real
    // serialization. The K7 test verifies runTransaction is called per HN;
    // real-Firestore concurrent atomicity is documented + relied on.
    for (let i = 0; i < 5; i++) {
      const r = await addCustomer({ firstname: 'A' });
      hns.push(r.hn);
    }
    expect(new Set(hns).size).toBe(5);
    expect(hns).toEqual([
      'LC-26000001', 'LC-26000002', 'LC-26000003', 'LC-26000004', 'LC-26000005',
    ]);
  });
});

describe('V33.Q — source-grep regression guards', () => {
  it('Q1 — addCustomer is exported from backendClient', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf-8');
    expect(src).toMatch(/export async function addCustomer/);
  });
  it('Q2 — addCustomer never POSTs to ProClinic (Rule E)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf-8');
    // Slice the file from `addCustomer` to the next top-level `export ` to
    // get the function body in isolation.
    const start = src.indexOf('export async function addCustomer');
    expect(start).toBeGreaterThanOrEqual(0);
    const after = src.slice(start);
    const nextExportIdx = after.indexOf('\nexport ', 1);  // start at 1 to skip the addCustomer export
    const body = nextExportIdx > 0 ? after.slice(0, nextExportIdx) : after;
    expect(body).not.toMatch(/brokerClient|\/api\/proclinic/);
  });
  it('Q3 — addCustomer writes via setDoc on customerDoc — never to counter directly', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf-8');
    const start = src.indexOf('export async function addCustomer');
    const after = src.slice(start);
    const nextExportIdx = after.indexOf('\nexport ', 1);
    const body = nextExportIdx > 0 ? after.slice(0, nextExportIdx) : after;
    expect(body).toMatch(/setDoc\(customerDoc\(/);
    // Counter write happens inside generateCustomerHN — not directly in addCustomer body.
    expect(body).not.toMatch(/be_customer_counter/);
  });
});
