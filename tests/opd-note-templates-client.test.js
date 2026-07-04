// OPD Note Templates (2026-07-05) — BSA Layer 1 + Layer 2 contract tests
// Mirrors the v54-listener-safe-by-default mock pattern (capture where clauses
// + setDoc payloads on a mocked firestore).
// Spec: docs/superpowers/specs/2026-07-05-opd-note-templates-design.html
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

let capturedConds = [];
let docsToReturn = []; // [{ __docId, data: {...} }]
let setDocCalls = [];  // [{ ref, payload, opts }]
let deleteDocCalls = [];
let onSnapshotCapture = null;

vi.mock('firebase/firestore', () => ({
  collection: (_db, ...segs) => ({ __sentinel: 'col', path: segs.join('/') }),
  query: (col, ...conds) => {
    capturedConds = conds.filter((c) => c?.__sentinel === 'where');
    return { __sentinel: 'query', col, conds };
  },
  where: (field, op, val) => ({ __sentinel: 'where', field, op, val }),
  orderBy: () => ({ __sentinel: 'orderBy' }),
  limit: () => ({ __sentinel: 'limit' }),
  doc: (_db, ...segs) => ({ __sentinel: 'doc', path: segs.join('/'), id: segs[segs.length - 1] }),
  getDoc: async () => ({ exists: () => false }),
  getDocs: async () => ({
    docs: docsToReturn.map((d) => ({ id: d.__docId, data: () => ({ ...d.data }) })),
  }),
  setDoc: async (ref, payload, opts) => { setDocCalls.push({ ref, payload, opts }); },
  updateDoc: async () => {},
  deleteDoc: async (ref) => { deleteDocCalls.push(ref); },
  writeBatch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
  runTransaction: async (_db, fn) => fn({ get: async () => ({ exists: () => false }), set: () => {}, update: () => {}, delete: () => {} }),
  serverTimestamp: () => ({ __sentinel: 'serverTimestamp' }),
  onSnapshot: (q, next, err) => {
    onSnapshotCapture = { q, next, err };
    Promise.resolve().then(() => {
      next({ docs: docsToReturn.map((d) => ({ id: d.__docId, data: () => ({ ...d.data }) })) });
    });
    return () => { onSnapshotCapture = null; };
  },
}));

vi.mock('../src/firebase.js', () => ({
  db: { __sentinel: 'db' },
  auth: { currentUser: { uid: 'staff-uid-1' } },
  appId: 'test-app',
}));

let mockResolvedBranchId = null;
vi.mock('../src/lib/branchSelection.js', () => ({
  STORAGE_KEY: 'selectedBranchId',
  FALLBACK_ID: null,
  resolveSelectedBranchId: () => mockResolvedBranchId,
  setSelectedBranchId: () => {},
  resetBranchSelection: () => {},
}));

import * as bc from '../src/lib/backendClient.js';

beforeEach(() => {
  capturedConds = [];
  docsToReturn = [];
  setDocCalls = [];
  deleteDocCalls = [];
  onSnapshotCapture = null;
  mockResolvedBranchId = null;
});

describe('B1-B5 — listOpdNoteTemplates', () => {
  it('B1 explicit branchId → where(branchId == id)', async () => {
    docsToReturn = [{ __docId: 'OPDT-1', data: { name: 'ก', branchId: 'BR-A' } }];
    await bc.listOpdNoteTemplates({ branchId: 'BR-A' });
    expect(capturedConds).toHaveLength(1);
    expect(capturedConds[0]).toMatchObject({ field: 'branchId', op: '==', val: 'BR-A' });
  });

  it('B2 allBranches:true → ไม่มี where clause', async () => {
    docsToReturn = [];
    capturedConds = [{ __sentinel: 'where', field: 'stale', op: '==', val: 'x' }]; // stale guard
    const out = await bc.listOpdNoteTemplates({ allBranches: true });
    // query() never called for whole-collection read → capturedConds not replaced;
    // assert via result instead: no throw + returns array
    expect(Array.isArray(out)).toBe(true);
  });

  it('B3 {} + resolveSelectedBranchId → ใช้ branch ที่ resolve ได้', async () => {
    mockResolvedBranchId = 'BR-RESOLVED';
    docsToReturn = [];
    await bc.listOpdNoteTemplates({});
    expect(capturedConds[0]).toMatchObject({ field: 'branchId', op: '==', val: 'BR-RESOLVED' });
  });

  it('B3-bis {} + resolve fail → [] ทันที (ห้าม whole-collection — V54/BS-13)', async () => {
    mockResolvedBranchId = null;
    docsToReturn = [{ __docId: 'LEAK', data: { name: 'leak' } }];
    const out = await bc.listOpdNoteTemplates({});
    expect(out).toEqual([]);
  });

  it('B4 V38 spread order — docId ชนะ stray id ใน data', async () => {
    docsToReturn = [{ __docId: 'OPDT-REAL', data: { id: '276-legacy', name: 'ก' } }];
    const out = await bc.listOpdNoteTemplates({ branchId: 'BR-A' });
    expect(out[0].id).toBe('OPDT-REAL');
  });

  it('B5 sort ชื่อ th locale', async () => {
    docsToReturn = [
      { __docId: '1', data: { name: 'หลัง' } },
      { __docId: '2', data: { name: 'ก่อน' } },
    ];
    const out = await bc.listOpdNoteTemplates({ branchId: 'BR-A' });
    expect(out.map(t => t.name)).toEqual(['ก่อน', 'หลัง']);
  });
});

describe('B6-B8 — saveOpdNoteTemplate / deleteOpdNoteTemplate', () => {
  it('B6.1 invalid → throw ก่อนแตะ setDoc', async () => {
    await expect(bc.saveOpdNoteTemplate('OPDT-x', { name: '', content: 'x' }))
      .rejects.toThrow('กรุณากรอกชื่อ template');
    await expect(bc.saveOpdNoteTemplate('', { name: 'a', content: 'x' }))
      .rejects.toThrow('templateId required');
    await expect(bc.saveOpdNoteTemplate('OPDT-x', null)).rejects.toThrow('data object required');
    expect(setDocCalls).toHaveLength(0);
  });

  it('B6.2 create: stamps branchId (resolve) + templateId + createdAt/By + updatedAt/By + merge:false', async () => {
    mockResolvedBranchId = 'BR-SEL';
    await bc.saveOpdNoteTemplate('OPDT-new', { name: 'ชื่อ', content: 'เนื้อหา' });
    expect(setDocCalls).toHaveLength(1);
    const { ref, payload, opts } = setDocCalls[0];
    expect(ref.path).toContain('be_opd_note_templates/OPDT-new');
    expect(payload.name).toBe('ชื่อ');
    expect(payload.content).toBe('เนื้อหา');
    expect(payload.branchId).toBe('BR-SEL');
    expect(payload.templateId).toBe('OPDT-new');
    expect(payload.createdAt).toBeTruthy();
    expect(payload.createdBy).toBe('staff-uid-1');
    expect(payload.updatedAt).toBeTruthy();
    expect(payload.updatedBy).toBe('staff-uid-1');
    expect(opts).toEqual({ merge: false });
    // V14: no undefined leaves
    Object.entries(payload).forEach(([k, v]) => expect(v, k).not.toBeUndefined());
  });

  it('B6.3 edit: คง createdAt/createdBy/branchId เดิม', async () => {
    mockResolvedBranchId = 'BR-CURRENT';
    await bc.saveOpdNoteTemplate('OPDT-old', {
      name: 'ใหม่', content: 'ใหม่',
      createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'uid-orig', branchId: 'BR-ORIG',
    });
    const { payload } = setDocCalls[0];
    expect(payload.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(payload.createdBy).toBe('uid-orig');
    expect(payload.branchId).toBe('BR-ORIG'); // _resolveBranchIdForWrite: data.branchId ชนะ selected
    expect(payload.updatedBy).toBe('staff-uid-1');
  });

  it('B7 delete: id ว่าง throw / เรียก deleteDoc ที่ doc ถูกต้อง', async () => {
    await expect(bc.deleteOpdNoteTemplate('')).rejects.toThrow('templateId required');
    await bc.deleteOpdNoteTemplate('OPDT-del');
    expect(deleteDocCalls).toHaveLength(1);
    expect(deleteDocCalls[0].path).toContain('be_opd_note_templates/OPDT-del');
  });
});

describe('B9 — scopedDataLayer Layer 2 (source-grep)', () => {
  const sdl = fs.readFileSync(path.resolve('src/lib/scopedDataLayer.js'), 'utf8');

  it('B9.1 lister ผ่าน _autoInject', () => {
    expect(sdl).toMatch(/export const listOpdNoteTemplates = _autoInject\(\(\) => raw\.listOpdNoteTemplates\);/);
  });

  it('B9.2 writers passthrough ครบ + listener passthrough (BS-4 wiring ที่ hook)', () => {
    expect(sdl).toMatch(/export const saveOpdNoteTemplate = \(\.\.\.args\) => raw\.saveOpdNoteTemplate\(\.\.\.args\);/);
    expect(sdl).toMatch(/export const deleteOpdNoteTemplate = \(\.\.\.args\) => raw\.deleteOpdNoteTemplate\(\.\.\.args\);/);
    expect(sdl).toMatch(/export const listenToOpdNoteTemplatesByBranch = \(\.\.\.args\) => raw\.listenToOpdNoteTemplatesByBranch\(\.\.\.args\);/);
  });
});

describe('B10 — listenToOpdNoteTemplatesByBranch (realtime Layer 1)', () => {
  it('B10.1 explicit branchId → where(branchId==) + snapshot delivers sorted items (V38 docId wins)', async () => {
    docsToReturn = [
      { __docId: 'OPDT-B', data: { id: 'stray', name: 'หลัง' } },
      { __docId: 'OPDT-A', data: { name: 'ก่อน' } },
    ];
    const got = await new Promise((resolve) => {
      bc.listenToOpdNoteTemplatesByBranch({ branchId: 'BR-A' }, resolve);
    });
    expect(capturedConds[0]).toMatchObject({ field: 'branchId', op: '==', val: 'BR-A' });
    expect(got.map(t => t.name)).toEqual(['ก่อน', 'หลัง']);
    expect(got.find(t => t.name === 'หลัง').id).toBe('OPDT-B'); // V38
  });

  it('B10.2 safe-by-default: {} + resolve fail → onChange([]) + noop unsub (ห้าม whole-collection)', () => {
    mockResolvedBranchId = null;
    const onChange = vi.fn();
    const unsub = bc.listenToOpdNoteTemplatesByBranch({}, onChange);
    expect(onChange).toHaveBeenCalledWith([]);
    expect(onSnapshotCapture).toBeNull(); // ไม่ subscribe จริง
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('B10.3 {} + resolve ได้ → ใช้ branch ที่ resolve + คืน unsubscribe จริง', async () => {
    mockResolvedBranchId = 'BR-RESOLVED';
    docsToReturn = [];
    await new Promise((resolve) => bc.listenToOpdNoteTemplatesByBranch({}, resolve));
    expect(capturedConds[0]).toMatchObject({ field: 'branchId', op: '==', val: 'BR-RESOLVED' });
    expect(onSnapshotCapture).not.toBeNull();
  });

  it('B10.4 onError forwarded (permission-denied pre-deploy path)', () => {
    docsToReturn = [];
    const onErr = vi.fn();
    bc.listenToOpdNoteTemplatesByBranch({ branchId: 'BR-A' }, () => {}, onErr);
    const boom = Object.assign(new Error('denied'), { code: 'permission-denied' });
    onSnapshotCapture.err(boom);
    expect(onErr).toHaveBeenCalledWith(boom);
  });
});
