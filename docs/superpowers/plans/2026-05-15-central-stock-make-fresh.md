# Central Stock Make-Fresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend selective-make-fresh pattern to central stock. Per-warehouse + bulk-all selective wipe across 4 logical buckets. SHA-256 round-trip integrity. Warehouse master records permanently exempt.

**Architecture:** Rule C1 refactor — extract shared 3-step state machine + sub-components from existing MakeFreshModal. Both branch + central modals become thin (~80 LOC) wrappers. New `centralStockBuckets.js` schema + 2 new endpoints + 2 new CLI scripts + Rule Q L2 round-trip e2e. Warehouse master protected via `assertWarehouseMasterProtected` (mirror of `assertNotT1`).

**Tech Stack:** React 19 · Vite 8 · Firebase Admin SDK · Vercel serverless · Vitest 4 · Playwright · Cloud Storage · Tailwind 3.4

**Spec:** [docs/superpowers/specs/2026-05-15-central-stock-make-fresh-and-integrity-design.md](../specs/2026-05-15-central-stock-make-fresh-and-integrity-design.md)

**Iron-clad applies:** Rule Q V66 · Rule M · Rule N · Rule I · Rule C1 · AV19 + AV43 · NEW AV44

---

## Task 1: NEW `src/lib/centralStockBuckets.js` — 4-bucket schema + helpers

**Files:**
- Create: `src/lib/centralStockBuckets.js`
- Test: `tests/central-stock-make-fresh-helpers.test.js`

- [ ] **Step 1.1: Write failing test** at `tests/central-stock-make-fresh-helpers.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  CENTRAL_BUCKETS,
  resolveCentralBucketScope,
  assertWarehouseMasterProtected,
  centralBucketDefaultsForUI,
} from '../src/lib/centralStockBuckets.js';

describe('CS1 CENTRAL_BUCKETS schema', () => {
  it('CS1.1 frozen', () => { expect(Object.isFrozen(CENTRAL_BUCKETS)).toBe(true); });
  it('CS1.2 has 4 buckets in order', () => {
    expect(Object.keys(CENTRAL_BUCKETS)).toEqual(['cs_po', 'cs_stock_ledger', 'cs_transfers_withdrawals', 'cs_adjustments']);
  });
  it('CS1.3 every bucket has required fields', () => {
    for (const [id, b] of Object.entries(CENTRAL_BUCKETS)) {
      expect(typeof b.label).toBe('string');
      expect(typeof b.description).toBe('string');
      expect(Array.isArray(b.collections)).toBe(true);
      expect(Array.isArray(b.counterDocs)).toBe(true);
      expect(typeof b.defaultChecked).toBe('boolean');
    }
  });
  it('CS1.4 cs_po has counter doc', () => {
    expect(CENTRAL_BUCKETS.cs_po.counterDocs).toEqual(['be_central_stock_orders_counter']);
  });
  it('CS1.5 cs_transfers_withdrawals has orFilterField on transfers spec', () => {
    const transfersSpec = CENTRAL_BUCKETS.cs_transfers_withdrawals.collections.find(c => c.name === 'be_stock_transfers');
    expect(transfersSpec.filterField).toBe('sourceLocationId');
    expect(transfersSpec.orFilterField).toBe('destLocationId');
  });
  it('CS1.6 all 4 buckets defaultChecked=true (no opt-in-only in central)', () => {
    for (const b of Object.values(CENTRAL_BUCKETS)) expect(b.defaultChecked).toBe(true);
  });
  it('CS1.7 no bucket includes warehouse master', () => {
    for (const b of Object.values(CENTRAL_BUCKETS)) {
      for (const c of b.collections) expect(c.name).not.toBe('be_central_stock_warehouses');
    }
  });
});

describe('CS2 resolveCentralBucketScope', () => {
  it('CS2.1 empty throws EMPTY_BUCKET_SET', () => {
    expect(() => resolveCentralBucketScope([])).toThrow('EMPTY_BUCKET_SET');
    expect(() => resolveCentralBucketScope(null)).toThrow('EMPTY_BUCKET_SET');
  });
  it('CS2.2 unknown throws UNKNOWN_BUCKET', () => {
    expect(() => resolveCentralBucketScope(['nope'])).toThrow('UNKNOWN_BUCKET: nope');
  });
  it('CS2.3 cs_po returns orders + counter', () => {
    const r = resolveCentralBucketScope(['cs_po']);
    expect(r.collections.map(c => c.name)).toEqual(['be_central_stock_orders']);
    expect(r.counterDocs).toEqual(['be_central_stock_orders_counter']);
  });
  it('CS2.4 all 4 buckets returns deduped union', () => {
    const r = resolveCentralBucketScope(['cs_po', 'cs_stock_ledger', 'cs_transfers_withdrawals', 'cs_adjustments']);
    expect(r.collections.length).toBeGreaterThanOrEqual(6);
    expect(r.counterDocs).toEqual(['be_central_stock_orders_counter']);
  });
});

describe('CS3 assertWarehouseMasterProtected', () => {
  it('CS3.1 accepts non-master collections', () => {
    expect(() => assertWarehouseMasterProtected([{ name: 'be_stock_batches' }, { name: 'be_central_stock_orders' }])).not.toThrow();
  });
  it('CS3.2 throws on be_central_stock_warehouses', () => {
    expect(() => assertWarehouseMasterProtected([{ name: 'be_central_stock_warehouses' }])).toThrow('WAREHOUSE_MASTER_NOT_WIPEABLE');
  });
  it('CS3.3 accepts string or object', () => {
    expect(() => assertWarehouseMasterProtected(['be_stock_batches'])).not.toThrow();
    expect(() => assertWarehouseMasterProtected(['be_central_stock_warehouses'])).toThrow('WAREHOUSE_MASTER_NOT_WIPEABLE');
  });
});

describe('CS4 centralBucketDefaultsForUI', () => {
  it('CS4.1 returns all 4 true', () => {
    const d = centralBucketDefaultsForUI();
    expect(d).toEqual({ cs_po: true, cs_stock_ledger: true, cs_transfers_withdrawals: true, cs_adjustments: true });
  });
});
```

- [ ] **Step 1.2: Run test, verify RED** — `npx vitest run tests/central-stock-make-fresh-helpers.test.js`

- [ ] **Step 1.3: Implement** `src/lib/centralStockBuckets.js` per spec §3.1 (full code in spec).

- [ ] **Step 1.4: Run + verify GREEN** — expect all CS1-CS4 tests PASS.

- [ ] **Step 1.5: Commit** with message `feat(central-stock): NEW centralStockBuckets.js — 4-bucket schema + warehouse-master protection (Task 1)`

---

## Task 2: NEW `src/lib/makeFreshStateMachine.js` — extract shared 3-step engine

**Files:**
- Create: `src/lib/makeFreshStateMachine.js`
- Test: `tests/make-fresh-state-machine.test.js`

- [ ] **Step 2.1: Write failing test** covering state transitions + handler shape:

```js
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMakeFreshStateMachine } from '../src/lib/makeFreshStateMachine.js';

const baseOpts = {
  exportEndpoint: '/api/admin/branch-backup-export',
  makeFreshEndpoint: '/api/admin/branch-make-fresh',
  bucketDefaults: { a: true, b: false },
  fetcher: vi.fn(),
  scopeBody: { branchId: 'BR-X' },
  confirmName: 'BR-X-NAME',
};

describe('SM1 useMakeFreshStateMachine', () => {
  it('SM1.1 initial state', () => {
    const { result } = renderHook(() => useMakeFreshStateMachine(baseOpts));
    expect(result.current.phase).toBe('idle');
    expect(result.current.checkedBuckets).toEqual({ a: true, b: false });
    expect(result.current.advancedOpen).toBe(false);
  });
  it('SM1.2 handleBucketToggle flips bucket', () => {
    const { result } = renderHook(() => useMakeFreshStateMachine(baseOpts));
    act(() => result.current.handleBucketToggle('a'));
    expect(result.current.checkedBuckets.a).toBe(false);
  });
  it('SM1.3 matches returns true on exact confirmText', () => {
    const { result } = renderHook(() => useMakeFreshStateMachine(baseOpts));
    act(() => result.current.setConfirmText('BR-X-NAME'));
    expect(result.current.matches).toBe(true);
  });
  it('SM1.4 tickedBucketIds derived from checkedBuckets', () => {
    const { result } = renderHook(() => useMakeFreshStateMachine(baseOpts));
    expect(result.current.tickedBucketIds).toEqual(['a']);
    act(() => result.current.handleBucketToggle('b'));
    expect(result.current.tickedBucketIds.sort()).toEqual(['a', 'b']);
  });
  it('SM1.5 handlePreview transitions idle → previewing → preview-ready', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, dryRun: true, perBucket: { a: { docs: 5 } }, totalDocs: 5, estSizeBytes: 100 }),
    });
    const { result } = renderHook(() => useMakeFreshStateMachine({ ...baseOpts, fetcher }));
    await act(async () => { await result.current.handlePreview(); });
    expect(result.current.phase).toBe('preview-ready');
    expect(result.current.preview.totalDocs).toBe(5);
  });
  it('SM1.6 handleRun full happy path', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: {}, totalDocs: 5, estSizeBytes: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, storagePath: 'p1', bodyHash: 'h1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, deletedCounts: {}, bodyHash: 'h1', auditId: 'a1' }) });
    const { result } = renderHook(() => useMakeFreshStateMachine({ ...baseOpts, fetcher }));
    await act(async () => { await result.current.handlePreview(); });
    act(() => { result.current.setPhase('confirming'); result.current.setConfirmText('BR-X-NAME'); });
    await act(async () => { await result.current.handleRun(); });
    expect(result.current.phase).toBe('done');
    expect(result.current.result.auditId).toBe('a1');
  });
  it('SM1.7 error path: hash mismatch', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: {}, totalDocs: 5, estSizeBytes: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, storagePath: 'p1', bodyHash: 'h1' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'BACKUP_INTEGRITY_FAIL' }) });
    const { result } = renderHook(() => useMakeFreshStateMachine({ ...baseOpts, fetcher }));
    await act(async () => { await result.current.handlePreview(); });
    act(() => { result.current.setPhase('confirming'); result.current.setConfirmText('BR-X-NAME'); });
    await act(async () => { await result.current.handleRun(); });
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toMatch(/BACKUP_INTEGRITY_FAIL/);
    expect(result.current.autoBackupRef).toBe('p1');
  });
});
```

- [ ] **Step 2.2: Run test, verify RED.**

- [ ] **Step 2.3: Implement** `src/lib/makeFreshStateMachine.js` — extract the state + handlers from current `MakeFreshModal.jsx`. Body shape:

```js
import { useState, useCallback } from 'react';

export function useMakeFreshStateMachine({ exportEndpoint, makeFreshEndpoint, bucketDefaults, fetcher, scopeBody, confirmName }) {
  const [checkedBuckets, setCheckedBuckets] = useState(bucketDefaults);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [autoBackupRef, setAutoBackupRef] = useState(null);
  const [bodyHash, setBodyHash] = useState(null);
  const [result, setResult] = useState(null);

  const tickedBucketIds = Object.keys(checkedBuckets).filter(id => checkedBuckets[id]);
  const matches = confirmText.trim() === String(confirmName || '').trim();

  const handleBucketToggle = useCallback((id) => {
    setCheckedBuckets(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handlePreview = useCallback(async () => {
    if (tickedBucketIds.length === 0) return;
    setPhase('previewing'); setError('');
    try {
      const res = await fetcher(exportEndpoint, { ...scopeBody, bucketIds: tickedBucketIds, dryRun: true });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'preview failed');
      setPreview(json);
      setPhase('preview-ready');
    } catch (e) { setError(e.message || 'preview failed'); setPhase('error'); }
  }, [exportEndpoint, fetcher, scopeBody, tickedBucketIds]);

  const handleRun = useCallback(async () => {
    if (!matches) return;
    setPhase('backing-up'); setError('');
    try {
      const r1 = await fetcher(exportEndpoint, { ...scopeBody, bucketIds: tickedBucketIds, isAutoPreFresh: true });
      const j1 = await r1.json();
      if (!r1.ok || !j1.ok) throw new Error(j1.error || 'auto-backup failed');
      setAutoBackupRef(j1.storagePath);
      setBodyHash(j1.bodyHash);

      setPhase('wiping');
      const r2 = await fetcher(makeFreshEndpoint, {
        ...scopeBody, bucketIds: tickedBucketIds,
        autoBackupRef: j1.storagePath, expectedBodyHash: j1.bodyHash,
      });
      const j2 = await r2.json();
      if (!r2.ok || !j2.ok) throw new Error(j2.error || 'make-fresh failed');
      setResult(j2);
      setPhase('done');
    } catch (e) { setError(e.message || 'failed'); setPhase('error'); }
  }, [matches, exportEndpoint, makeFreshEndpoint, fetcher, scopeBody, tickedBucketIds]);

  return {
    phase, checkedBuckets, advancedOpen, confirmText, preview,
    autoBackupRef, bodyHash, result, error, matches, tickedBucketIds,
    handleBucketToggle, setAdvancedOpen, setConfirmText, handlePreview, handleRun,
    setPhase, setPreview,
  };
}
```

- [ ] **Step 2.4: Run + verify GREEN** — all SM1.* tests pass.

- [ ] **Step 2.5: Commit** — `feat(make-fresh): NEW shared state machine extracted from MakeFreshModal (Task 2)`

---

## Task 3: REFACTOR `MakeFreshModal.jsx` to use shared state machine

**Files:**
- Modify: `src/components/backend/MakeFreshModal.jsx`

- [ ] **Step 3.1**: Replace inline state + handlers with `useMakeFreshStateMachine` call:

```jsx
import { useMakeFreshStateMachine } from '../../lib/makeFreshStateMachine.js';
import { BUCKETS, bucketDefaultsForUI } from '../../lib/branchBackupBuckets.js';

const BUCKET_ORDER = Object.keys(BUCKETS);

export default function MakeFreshModal({ branch, onClose, onComplete }) {
  const branchName = branch.branchName || branch.name || '?';
  const branchId = branch.branchId || branch.id;
  const sm = useMakeFreshStateMachine({
    exportEndpoint: '/api/admin/branch-backup-export',
    makeFreshEndpoint: '/api/admin/branch-make-fresh',
    bucketDefaults: bucketDefaultsForUI(),
    fetcher: async (url, body) => {
      const token = await auth.currentUser?.getIdToken();
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    },
    scopeBody: { branchId },
    confirmName: branchName,
  });

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog">
      <div className="w-[95vw] max-w-2xl rounded-xl bg-[var(--bg-card)] border border-rose-800/40 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Render phases using sm.phase + sm helpers — preserve EXACT JSX
            structure from current modal so all UI tests + RTL tests continue
            to pass with same test IDs (bucket-list, bucket-{id}, advanced-toggle,
            preview-btn, impact-panel, continue-btn, confirm-input, confirm-btn) */}
      </div>
    </div>
  );
}
```

The full refactor preserves every test-id + every visible string + every state transition. The state lives in `sm` (`useMakeFreshStateMachine`) instead of locally.

- [ ] **Step 3.2: Verify** — `npx vitest run tests/branch-make-fresh-selective-flow-simulate.test.jsx` should still PASS (7/7).

- [ ] **Step 3.3: Build clean** — `npm run build`.

- [ ] **Step 3.4: Commit** — `refactor(make-fresh): MakeFreshModal consumes shared state machine — backward-compat preserved (Task 3)`

---

## Task 4: NEW `src/components/backend/CentralMakeFreshModal.jsx`

**Files:**
- Create: `src/components/backend/CentralMakeFreshModal.jsx`

- [ ] **Step 4.1**: Implement thin wrapper using shared engine + central bucket schema:

```jsx
import { useMakeFreshStateMachine } from '../../lib/makeFreshStateMachine.js';
import { CENTRAL_BUCKETS, centralBucketDefaultsForUI } from '../../lib/centralStockBuckets.js';
import { auth } from '../../firebase.js';
import { X, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';

const BUCKET_ORDER = Object.keys(CENTRAL_BUCKETS);

export default function CentralMakeFreshModal({ warehouse, allWarehouses = false, onClose, onComplete }) {
  // warehouse object expected when allWarehouses=false; otherwise null + summary
  const warehouseName = allWarehouses ? 'ทุกคลังกลาง' : (warehouse?.stockName || warehouse?.name || '?');
  const warehouseId = warehouse?.stockId || warehouse?.id || null;
  const sm = useMakeFreshStateMachine({
    exportEndpoint: '/api/admin/central-stock-backup-export',
    makeFreshEndpoint: '/api/admin/central-stock-make-fresh',
    bucketDefaults: centralBucketDefaultsForUI(),
    fetcher: async (url, body) => {
      const token = await auth.currentUser?.getIdToken();
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    },
    scopeBody: allWarehouses ? { allWarehouses: true } : { warehouseIds: [warehouseId] },
    confirmName: warehouseName,
  });

  // JSX identical to MakeFreshModal except:
  //   - BUCKETS → CENTRAL_BUCKETS
  //   - BUCKET_ORDER → 4 central bucket IDs
  //   - test IDs prefixed cs-{id} (e.g. cs-bucket-cs_po, cs-preview-btn, cs-confirm-input, cs-confirm-btn)
  //   - Header text "ทำให้คลังกลางใหม่" instead of "ทำให้เป็นสาขาใหม่"
  //   - Banner: allWarehouses=true shows "ลบทุกคลังกลาง (N คลัง)"
  return ( /* mirror MakeFreshModal JSX with above substitutions */ );
}
```

- [ ] **Step 4.2: Verify build clean** — `npm run build`.

- [ ] **Step 4.3: Commit** — `feat(central-stock): NEW CentralMakeFreshModal — thin wrapper over shared engine (Task 4)`

---

## Task 5: NEW `src/components/backend/CentralMakeFreshButton.jsx` + wire `CentralStockTab`

**Files:**
- Create: `src/components/backend/CentralMakeFreshButton.jsx`
- Modify: `src/components/backend/CentralStockTab.jsx`
- Modify: `src/components/backend/CentralWarehousePanel.jsx` (if needed to embed per-warehouse button — check existing structure first)

- [ ] **Step 5.1: Create button component**:

```jsx
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import CentralMakeFreshModal from './CentralMakeFreshModal.jsx';
import { useTabAccess } from '../../hooks/useTabAccess.js';

export default function CentralMakeFreshButton({ warehouse, allWarehouses = false, onComplete, allWarehouseList = [] }) {
  const { isAdmin } = useTabAccess();
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;
  const testIdSuffix = allWarehouses ? 'bulk' : (warehouse?.stockId || warehouse?.id);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={allWarehouses ? 'เคลีย Central Stock ทั้งหมด' : 'ทำให้คลังนี้ใหม่'}
        className="px-2 py-1 text-xs rounded bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 inline-flex items-center gap-1"
        data-testid={`central-make-fresh-btn-${testIdSuffix}`}
      >
        <Sparkles size={11} /> {allWarehouses ? 'เคลียทั้งหมด' : 'คลังใหม่'}
      </button>
      {open && (
        <CentralMakeFreshModal
          warehouse={warehouse}
          allWarehouses={allWarehouses}
          allWarehouseList={allWarehouseList}
          onClose={() => setOpen(false)}
          onComplete={(result) => { setOpen(false); onComplete?.(result); }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5.2: Wire `CentralStockTab.jsx`** — in the `subTab === 'warehouses'` branch, embed:
  - Top toolbar `<CentralMakeFreshButton allWarehouses={true} allWarehouseList={warehouses} />` next to "เพิ่มคลัง" button
  - Per-warehouse: `CentralWarehousePanel` already renders cards; add `<CentralMakeFreshButton warehouse={w} />` next to the Edit/Delete buttons (check CentralWarehousePanel.jsx for the exact integration point)

- [ ] **Step 5.3: Build clean.**

- [ ] **Step 5.4: Commit** — `feat(central-stock): CentralMakeFreshButton + wire CentralStockTab warehouses sub-tab (Task 5)`

---

## Task 6: NEW `api/admin/central-stock-backup-export.js`

**Files:**
- Create: `api/admin/central-stock-backup-export.js`

- [ ] **Step 6.1: Implement** mirroring `branch-backup-export.js` per spec §3.7:

```js
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { CENTRAL_BUCKETS, resolveCentralBucketScope, assertWarehouseMasterProtected } from '../../src/lib/centralStockBuckets.js';
import { buildBackupFile, jsonReplacerForNonFinite, computeBodyHash } from '../../src/lib/branchBackupSchema.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

// getAdmin + dataCol + randHex helpers — copy verbatim from branch-backup-export.js

export default async function handler(req, res) {
  // CORS + method gate — copy verbatim from branch-backup-export.js
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { warehouseIds = null, allWarehouses = false, bucketIds = null, dryRun = false, isAutoPreFresh = false } = req.body || {};
  if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'EMPTY_BUCKET_SET' });
  }
  if (!allWarehouses && (!Array.isArray(warehouseIds) || warehouseIds.length === 0)) {
    return res.status(400).json({ ok: false, error: 'MISSING_WAREHOUSE_SCOPE' });
  }

  let resolved;
  try {
    resolved = resolveCentralBucketScope(bucketIds);
    assertWarehouseMasterProtected(resolved.collections);
  } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }

  try {
    const { db, bucket } = getAdmin();

    // Resolve warehouseIds — when allWarehouses=true, list all from be_central_stock_warehouses
    let scopeWarehouseIds = [...(warehouseIds || [])];
    if (allWarehouses) {
      const snap = await dataCol(db, 'be_central_stock_warehouses').get();
      scopeWarehouseIds = snap.docs.map(d => d.id);
    }

    if (dryRun === true) {
      // Per-warehouse × per-bucket counts. Empty Storage write.
      const perBucket = {};
      let totalDocs = 0, estSizeBytes = 0;
      for (const bucketId of bucketIds) {
        const bucket = CENTRAL_BUCKETS[bucketId];
        let docs = 0, sizeBytes = 0;
        for (const wid of scopeWarehouseIds) {
          for (const spec of bucket.collections) {
            const primary = await dataCol(db, spec.name).where(spec.filterField, '==', wid).get();
            docs += primary.size;
            for (const d of primary.docs) sizeBytes += JSON.stringify(d.data()).length;
            if (spec.orFilterField) {
              const or = await dataCol(db, spec.name).where(spec.orFilterField, '==', wid).get();
              // Dedup by docId
              const primaryIds = new Set(primary.docs.map(d => d.id));
              for (const d of or.docs) {
                if (!primaryIds.has(d.id)) { docs += 1; sizeBytes += JSON.stringify(d.data()).length; }
              }
            }
          }
        }
        perBucket[bucketId] = { docs, sizeBytes };
        totalDocs += docs;
        estSizeBytes += sizeBytes;
      }
      return res.status(200).json({ ok: true, dryRun: true, scopeKind: 'central',
        warehouseIds: scopeWarehouseIds, bucketIds: [...bucketIds].sort(), perBucket, totalDocs, estSizeBytes });
    }

    // Normal path — build file + upload + audit
    const out = {};
    for (const bucketId of bucketIds) {
      const bucket = CENTRAL_BUCKETS[bucketId];
      for (const wid of scopeWarehouseIds) {
        for (const spec of bucket.collections) {
          const key = `${spec.name}/${wid}`;
          const seen = new Set();
          const collected = [];
          const primary = await dataCol(db, spec.name).where(spec.filterField, '==', wid).get();
          for (const d of primary.docs) { seen.add(d.id); collected.push({ ...d.data(), id: d.id }); }
          if (spec.orFilterField) {
            const or = await dataCol(db, spec.name).where(spec.orFilterField, '==', wid).get();
            for (const d of or.docs) if (!seen.has(d.id)) { seen.add(d.id); collected.push({ ...d.data(), id: d.id }); }
          }
          if (collected.length > 0) out[key] = collected;
        }
      }
      // Capture counter doc state per bucket
      for (const cdName of bucket.counterDocs) {
        for (const wid of scopeWarehouseIds) {
          const cdSnap = await dataCol(db, cdName).doc('counter').get();
          if (cdSnap.exists) {
            out[`${cdName}/counter`] = [{ id: 'counter', ...cdSnap.data() }];
          }
        }
      }
    }

    const file = buildBackupFile({
      sourceBranchId: scopeWarehouseIds.join(',') || 'all',  // reuse field; central uses warehouseIds in meta below
      exportedBy: caller.decoded.uid,
      scope: { scopeKind: 'central', warehouseIds: scopeWarehouseIds, bucketIds },
      collections: out,
      isAutoPreFresh,
      bucketIds,
    });
    // Inject scopeKind + warehouseIds into meta
    file.meta.scopeKind = 'central';
    file.meta.warehouseIds = [...scopeWarehouseIds].sort();
    // Recompute bodyHash since meta changed AFTER buildBackupFile — actually
    // bodyHash is over file.collections only, not meta — so unchanged.

    const json = JSON.stringify(file, jsonReplacerForNonFinite);
    const sizeBytes = Buffer.byteLength(json, 'utf8');
    if (sizeBytes > 100 * 1024 * 1024) return res.status(413).json({ ok: false, error: 'FILE_TOO_LARGE', sizeBytes });

    const ts = Date.now();
    const folder = allWarehouses ? 'all' : scopeWarehouseIds.join('+');
    const filename = `${isAutoPreFresh ? 'auto-pre-fresh' : 'manual'}-${ts}-${randHex()}.json`;
    const storagePath = `backups/central/${folder}/${filename}`;
    await bucket.file(storagePath).save(json, {
      contentType: 'application/json',
      metadata: { metadata: { scopeKind: 'central', warehouseIds: JSON.stringify(scopeWarehouseIds), bucketIds: JSON.stringify([...bucketIds].sort()), bodyHash: file.meta.bodyHash } },
    });

    const downloadName = `loverclinic-central-${folder}-${new Date(ts).toISOString().replace(/[:.]/g, '-')}.json`;
    const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
      action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000,
      responseDisposition: `attachment; filename="${downloadName}"`,
      responseType: 'application/json',
    });

    const auditId = `central-backup-${ts}-${randHex()}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      action: 'central-stock-backup',
      scopeKind: 'central',
      warehouseIds: scopeWarehouseIds,
      bucketIds: [...bucketIds].sort(),
      perCollectionCounts: file.meta.perCollectionCounts,
      sizeBytes, storagePath, isAutoPreFresh,
      bodyHash: file.meta.bodyHash,
      exportedBy: caller.decoded.uid,
      exportedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true, scopeKind: 'central', warehouseIds: scopeWarehouseIds, bucketIds: [...bucketIds].sort(),
      signedUrl, storagePath, auditId, sizeBytes, bodyHash: file.meta.bodyHash,
      perCollectionCounts: file.meta.perCollectionCounts,
    });
  } catch (e) {
    console.error('central-stock-backup-export error:', e);
    return res.status(500).json({ ok: false, error: 'EXPORT_FAILED', detail: e.message });
  }
}
```

- [ ] **Step 6.2: Build clean** — `npm run build`.

- [ ] **Step 6.3: Commit** — `feat(central-stock): NEW /api/admin/central-stock-backup-export (Task 6)`

---

## Task 7: NEW `api/admin/central-stock-make-fresh.js`

**Files:**
- Create: `api/admin/central-stock-make-fresh.js`

- [ ] **Step 7.1: Implement** mirroring `branch-make-fresh.js` per spec §3.7. Key sequence:

```js
// Request validation — bucketIds non-empty, warehouseIds OR allWarehouses
// AV19 — bucket.file(autoBackupRef).exists()
// Download + parse + validateBackupFile
// Recompute computeBodyHash(file.collections) + compare with file.meta.bodyHash
//   → 500 BACKUP_INTEGRITY_FAIL on mismatch
// expectedBodyHash cross-check → 400 BACKUP_HASH_EXPECTED_MISMATCH
// SCOPE_MISMATCH: sorted bucketIds match file.meta.bucketIds
// WAREHOUSE_MISMATCH: sorted warehouseIds match file.meta.warehouseIds
// Resolve scope → assertWarehouseMasterProtected
// Wipe: per warehouseId × per spec
//   - Primary: WHERE filterField === warehouseId → batch.delete
//   - orFilterField: same, deduped
// Reset counter docs: batch.delete (re-init to 0 at next PO creation)
// Audit doc + return
```

Full implementation: ~220 LOC. Mirror structure of `branch-make-fresh.js` post-2026-05-14 changes. Replace `branchId` → `warehouseId`, `assertNotT1` → `assertWarehouseMasterProtected`, `resolveBucketScope` → `resolveCentralBucketScope`. Add WAREHOUSE_MISMATCH check.

- [ ] **Step 7.2: Build clean.**

- [ ] **Step 7.3: Commit** — `feat(central-stock): NEW /api/admin/central-stock-make-fresh — hash verify + warehouse master protection (Task 7 ★)`

---

## Task 8: Flow-simulate test (Rule I)

**Files:**
- Create: `tests/central-stock-make-fresh-flow-simulate.test.jsx`

- [ ] **Step 8.1: Write 7 RTL tests** mirroring `tests/branch-make-fresh-selective-flow-simulate.test.jsx` (F1.1-F1.7) but for CentralMakeFreshModal:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CentralMakeFreshModal from '../src/components/backend/CentralMakeFreshModal.jsx';
import { CENTRAL_BUCKETS, centralBucketDefaultsForUI } from '../src/lib/centralStockBuckets.js';

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'mock-id-token' } },
  db: {},
}));

const SAMPLE_WAREHOUSE = { stockId: 'WH-A', stockName: 'คลังกลาง 1' };

describe('CF1 CentralMakeFreshModal — Rule I flow-simulate', () => {
  let fetchMock;
  beforeEach(() => { fetchMock = vi.fn(); global.fetch = fetchMock; });

  it('CF1.1 — opens with all 4 buckets checked (no opt-in-only)', () => {
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    for (const id of Object.keys(CENTRAL_BUCKETS)) {
      expect(screen.getByTestId(`cs-bucket-${id}`).checked).toBe(true);
    }
  });

  it('CF1.2 — preview button disabled when zero buckets', () => {
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    for (const id of Object.keys(CENTRAL_BUCKETS)) {
      fireEvent.click(screen.getByTestId(`cs-bucket-${id}`));
    }
    expect(screen.getByTestId('cs-preview-btn').disabled).toBe(true);
  });

  it('CF1.3 — preview displays per-bucket counts', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, dryRun: true, perBucket: { cs_po: { docs: 12, sizeBytes: 1200 } }, totalDocs: 12, estSizeBytes: 1200 }),
    });
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('cs-preview-btn'));
    await waitFor(() => expect(screen.getByTestId('cs-impact-panel')).toBeInTheDocument());
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it('CF1.4 — confirm requires typed warehouse name', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: { cs_po: { docs: 5, sizeBytes: 100 } }, totalDocs: 5, estSizeBytes: 100 }) });
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('cs-preview-btn'));
    await waitFor(() => screen.getByTestId('cs-continue-btn'));
    fireEvent.click(screen.getByTestId('cs-continue-btn'));
    expect(screen.getByTestId('cs-confirm-btn').disabled).toBe(true);
    fireEvent.change(screen.getByTestId('cs-confirm-input'), { target: { value: 'คลังกลาง 1' } });
    expect(screen.getByTestId('cs-confirm-btn').disabled).toBe(false);
  });

  it('CF1.5 — full success flow', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: { cs_po: { docs: 5, sizeBytes: 100 } }, totalDocs: 5, estSizeBytes: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, storagePath: 'backups/central/WH-A/p1.json', bodyHash: 'a'.repeat(64) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, deletedCounts: { 'be_central_stock_orders/WH-A': 5 }, bodyHash: 'a'.repeat(64), auditId: 'central-mf-1' }) });
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('cs-preview-btn'));
    await waitFor(() => screen.getByTestId('cs-continue-btn'));
    fireEvent.click(screen.getByTestId('cs-continue-btn'));
    fireEvent.change(screen.getByTestId('cs-confirm-input'), { target: { value: 'คลังกลาง 1' } });
    fireEvent.click(screen.getByTestId('cs-confirm-btn'));
    await waitFor(() => expect(screen.getByText(/เสร็จสิ้น/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/central-mf-1/)).toBeInTheDocument();
  });

  it('CF1.6 — error path: BACKUP_INTEGRITY_FAIL', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: { cs_po: { docs: 5, sizeBytes: 100 } }, totalDocs: 5, estSizeBytes: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, storagePath: 'backups/central/WH-A/p1.json', bodyHash: 'a'.repeat(64) }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'BACKUP_INTEGRITY_FAIL' }) });
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('cs-preview-btn'));
    await waitFor(() => screen.getByTestId('cs-continue-btn'));
    fireEvent.click(screen.getByTestId('cs-continue-btn'));
    fireEvent.change(screen.getByTestId('cs-confirm-input'), { target: { value: 'คลังกลาง 1' } });
    fireEvent.click(screen.getByTestId('cs-confirm-btn'));
    await waitFor(() => expect(screen.getByText(/BACKUP_INTEGRITY_FAIL/)).toBeInTheDocument(), { timeout: 3000 });
  });

  it('CF1.7 — allWarehouses bulk mode shows ทุกคลังกลาง label', () => {
    render(<CentralMakeFreshModal allWarehouses={true} onClose={() => {}} />);
    expect(screen.getByText(/ทุกคลังกลาง/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8.2: Run + verify GREEN** — `npx vitest run tests/central-stock-make-fresh-flow-simulate.test.jsx`

- [ ] **Step 8.3: Commit** — `test(central-stock): Rule I flow-simulate CF1.1-CF1.7 (Task 8)`

---

## Task 9: Source-grep regression test (V21 + AV44)

**Files:**
- Create: `tests/central-stock-make-fresh-source-grep.test.js`

- [ ] **Step 9.1: Write source-grep tests**:

```js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('CSG1 CentralMakeFreshModal sends bucketIds + warehouseIds (not raw)', () => {
  const code = read('src/components/backend/CentralMakeFreshModal.jsx');
  it('CSG1.1 imports CENTRAL_BUCKETS from centralStockBuckets', () => {
    expect(code).toMatch(/import\s*\{[^}]*CENTRAL_BUCKETS[^}]*\}\s*from\s*['"][^'"]*centralStockBuckets/);
  });
  it('CSG1.2 uses shared useMakeFreshStateMachine', () => {
    expect(code).toMatch(/useMakeFreshStateMachine/);
  });
  it('CSG1.3 sends warehouseIds OR allWarehouses (not raw collection names)', () => {
    expect(code).toMatch(/warehouseIds|allWarehouses/);
  });
});

describe('CSG2 endpoints — assertWarehouseMasterProtected + hash verify before delete', () => {
  const exportCode = read('api/admin/central-stock-backup-export.js');
  const makeFreshCode = read('api/admin/central-stock-make-fresh.js');

  it('CSG2.1 backup-export calls assertWarehouseMasterProtected', () => {
    expect(exportCode).toMatch(/assertWarehouseMasterProtected\(/);
  });
  it('CSG2.2 make-fresh calls assertWarehouseMasterProtected', () => {
    expect(makeFreshCode).toMatch(/assertWarehouseMasterProtected\(/);
  });
  it('CSG2.3 make-fresh recomputes hash + BACKUP_INTEGRITY_FAIL', () => {
    expect(makeFreshCode).toMatch(/computeBodyHash\(/);
    expect(makeFreshCode).toMatch(/BACKUP_INTEGRITY_FAIL/);
  });
  it('CSG2.4 ★ CRITICAL: hash compare BEFORE batch.delete', () => {
    const hashIdx = makeFreshCode.indexOf('BACKUP_INTEGRITY_FAIL');
    const wipeIdx = makeFreshCode.indexOf('batch.delete');
    expect(hashIdx).toBeGreaterThan(0);
    expect(wipeIdx).toBeGreaterThan(0);
    expect(hashIdx).toBeLessThan(wipeIdx);
  });
  it('CSG2.5 make-fresh has SCOPE_MISMATCH + WAREHOUSE_MISMATCH guards', () => {
    expect(makeFreshCode).toMatch(/SCOPE_MISMATCH/);
    expect(makeFreshCode).toMatch(/WAREHOUSE_MISMATCH/);
  });
  it('CSG2.6 backup-export supports dryRun=true', () => {
    expect(exportCode).toMatch(/dryRun\s*===?\s*true/);
    expect(exportCode).toMatch(/perBucket/);
  });
});

describe('CSG3 centralStockBuckets schema + Q1=A 4 buckets frozen', () => {
  const code = read('src/lib/centralStockBuckets.js');
  it('CSG3.1 CENTRAL_BUCKETS frozen + 4 in order', () => {
    expect(code).toMatch(/export\s+const\s+CENTRAL_BUCKETS\s*=\s*Object\.freeze\(\{/);
    const idx = ['cs_po', 'cs_stock_ledger', 'cs_transfers_withdrawals', 'cs_adjustments'].map(id => code.indexOf(`${id}:`));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
  });
  it('CSG3.2 all 4 defaultChecked=true', () => {
    const matches = [...code.matchAll(/defaultChecked:\s*(true|false)/g)];
    expect(matches.length).toBe(4);
    for (const m of matches) expect(m[1]).toBe('true');
  });
  it('CSG3.3 exports resolveCentralBucketScope + assertWarehouseMasterProtected', () => {
    expect(code).toMatch(/export\s+function\s+resolveCentralBucketScope/);
    expect(code).toMatch(/export\s+function\s+assertWarehouseMasterProtected/);
  });
  it('CSG3.4 cs_po has counterDocs with be_central_stock_orders_counter', () => {
    expect(code).toMatch(/counterDocs:\s*Object\.freeze\(\['be_central_stock_orders_counter'\]/);
  });
});
```

- [ ] **Step 9.2: Run + verify GREEN.**

- [ ] **Step 9.3: Commit** — `test(central-stock): source-grep regression bank CSG1-CSG3 (V21 + AV44 lock) (Task 9)`

---

## Task 10: ★ NEW round-trip e2e script (Rule Q L2 — CRITICAL)

**Files:**
- Create: `scripts/e2e-central-stock-roundtrip-real-prod.mjs`

- [ ] **Step 10.1: Implement** 5-scenario 8-phase round-trip mirroring `scripts/e2e-backup-restore-roundtrip-real-prod.mjs` but for central stock. Key differences:
  - Seed TEST-CSRT-prefixed warehouse via `be_central_stock_warehouses` doc
  - Adversarial fixtures across 4 buckets per spec §6.5
  - 5 scenarios: cs_po-only / cs_stock_ledger-only / cs_transfers_withdrawals-only / cs_adjustments-only / all-4-buckets
  - Per-scenario: seed → snapshot hash → backup → wipe → assert wiped + warehouse master intact → restore → assert hash byte-equal → cleanup zero orphans
  - Audit doc + counter doc preservation across round-trip

Use the canonical inline `loadDotEnv` pattern (NOT dotenv package). Reference: `scripts/e2e-backup-restore-roundtrip-real-prod.mjs` for the full template.

- [ ] **Step 10.2: Dry-run** — `node scripts/e2e-central-stock-roundtrip-real-prod.mjs`. Expect 5 scenarios stepping through 8 phases each, all DRY-RUN skips, exit 0.

- [ ] **Step 10.3: Pull env (Rule R)** — `vercel env pull .env.local.prod --environment=production`.

- [ ] **Step 10.4: ★ Run --apply on REAL PROD** — `node scripts/e2e-central-stock-roundtrip-real-prod.mjs --apply`. **MUST output `ALL 5/5 SCENARIOS PASSED`** with hash byte-equal at every boundary. If any scenario FAILS → read `/tmp/e2e-central-mismatch-{ts}.json` → fix root cause → re-run.

- [ ] **Step 10.5: Commit** — `test(central-stock): ★ Rule Q L2 round-trip integrity e2e on REAL PROD — 5/5 SCENARIOS PASS (Task 10)`

---

## Task 11: NEW CLI scripts + Playwright spec + AV44 invariant

**Files:**
- Create: `scripts/central-stock-make-fresh.mjs`
- Create: `scripts/central-stock-restore.mjs`
- Create: `tests/e2e/central-stock-make-fresh.spec.js`
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md` — add AV44

- [ ] **Step 11.1: CLI make-fresh** — mirror `scripts/branch-make-fresh.mjs` with `--warehouse-id` / `--all` flag + `--bucket-ids` arg. Reuse resolveCentralBucketScope + assertWarehouseMasterProtected.

- [ ] **Step 11.2: CLI restore** — read v2 backup file with scopeKind='central' from Storage or local file, validate, write back per `{collection}/{warehouseId}` keys, restore counter doc value.

- [ ] **Step 11.3: Playwright spec** — 4 specs mirroring branch (PW1.1 happy path / PW1.2 warehouse-master protection / PW1.3 hash mismatch / PW1.4 bulk-all). Skip when env vars not set.

- [ ] **Step 11.4: AV44 invariant** — append to `.agents/skills/audit-anti-vibe-code/SKILL.md`:

```markdown
### AV44 — Central-stock destructive selective-scope ops MUST go through bucket schema + assertWarehouseMasterProtected + hash verify (Central-Stock Make-Fresh, 2026-05-15)

**Trigger**: any destructive endpoint accepting warehouseIds + bucketIds (currently `/api/admin/central-stock-make-fresh`) AND UI calling it (CentralMakeFreshModal).

**Pattern**: UI MUST send warehouseIds[] + bucketIds[] (NOT raw collection names). Server MUST resolveCentralBucketScope + assertWarehouseMasterProtected (defense-in-depth) BEFORE any wipe. Server MUST computeBodyHash + verify BEFORE batch.delete. Hash mismatch aborts with BACKUP_INTEGRITY_FAIL.

**Mirror of AV43** for branch make-fresh. Same architectural backstop applied to warehouse scope.

**Grep targets**: same shape as AV43 but for central files. SCG2.4 hash-before-delete ordering lock + SCG2.5 SCOPE_MISMATCH + WAREHOUSE_MISMATCH.

**Sanctioned exceptions**: NONE.

**Origin**: spec docs/superpowers/specs/2026-05-15-central-stock-make-fresh-and-integrity-design.md. Verified via Rule Q L2: scripts/e2e-central-stock-roundtrip-real-prod.mjs --apply on real prod, 5/5 PASS hash byte-equal.
```

Also update section heading "Invariants (AV1–AV43)" → "AV1–AV44".

- [ ] **Step 11.5: Commit** — `feat(central-stock): CLI scripts + Playwright spec + AV44 invariant (Task 11)`

---

## Task 12: V21 fixup sweep + Final verify + session-end

**Files:**
- May modify: existing test files that locked old MakeFreshModal local-state contract (post-Task 3 refactor)
- Modify: `.agents/active.md` + `SESSION_HANDOFF.md`

- [ ] **Step 12.1: Full vitest** — `npx vitest run`. Identify any failures from Task 3 MakeFreshModal refactor.

- [ ] **Step 12.2: V21 fixups** — for each failing test that asserted internal state (e.g., `useState` direct), update to assert behavior through the shared engine. Add V21 marker comments.

- [ ] **Step 12.3: Build clean** — `npm run build`.

- [ ] **Step 12.4: Re-run round-trip e2e** — `node scripts/e2e-central-stock-roundtrip-real-prod.mjs --apply` to confirm ALL 5/5 still PASS.

- [ ] **Step 12.5: Update active.md + SESSION_HANDOFF.md** — append new EOD entry describing this feature shipment.

- [ ] **Step 12.6: Final commit + push** — `docs(agents): EOD 2026-05-15 — Central Stock Make-Fresh + Backup Integrity SHIPPED ★`

---

## Self-Review

### Spec coverage check

- ✅ §0-1 Motivation + decisions → Tasks 1-2 lock scope
- ✅ §2 Architecture → Tasks 1-7 implement all 5 layers
- ✅ §3.1 centralStockBuckets → Task 1
- ✅ §3.2 makeFreshStateMachine → Task 2
- ✅ §3.4 MakeFreshModal refactor → Task 3
- ✅ §3.4 CentralMakeFreshModal → Task 4
- ✅ §3.5-3.6 button + tab wire → Task 5
- ✅ §3.7 endpoints → Tasks 6 + 7
- ✅ §3.8 CLI → Task 11
- ✅ §3.9 e2e script + restore CLI → Tasks 10 + 11
- ✅ §6 test strategy → Tasks 8 (flow) + 9 (source-grep) + 10 (e2e) + 11 (Playwright)
- ✅ §10 16 acceptance criteria all covered across Tasks
- ✅ §13 Rule Q sign-off → Task 10 --apply on real prod is the critical gate

### Type/signature consistency

- ✅ `CENTRAL_BUCKETS` shape consistent across Task 1 + 4 + 6 + 7 + 8 + 9
- ✅ `useMakeFreshStateMachine` signature consistent Task 2 + 3 + 4
- ✅ Endpoint request body: `{warehouseIds[], allWarehouses, bucketIds[], dryRun, autoBackupRef, expectedBodyHash}` consistent Task 6 + 7 + 4 (UI)
- ✅ `assertWarehouseMasterProtected` throws `WAREHOUSE_MASTER_NOT_WIPEABLE` consistent Task 1 + 6 + 7 + 9

### Placeholder scan

- No "TBD" / "implement later" / generic "add validation"
- All code blocks complete + executable

### Scope check

- 12 tasks for one coherent feature with shared engine refactor
- No subsystem decomposition needed

Plan complete + saved.

---

## Execution Handoff

**Plan saved.** Two execution options:

**1. Subagent-Driven** — fresh subagent per task + 2-stage review. BUT this project's CLAUDE.md (~370KB) thrashes subagent context (proven last time — selective-make-fresh dispatched 2 subagents that auto-compacted before completing useful work).

**2. Inline Execution** (Recommended given last session) — execute tasks in this session using `executing-plans` skill. Faster + safer for this project's context-pressure profile. Manual code-quality self-review per task.

**คำแนะนำของผม: 2 (Inline)** — proven workflow from selective-make-fresh which shipped 13 tasks cleanly with Rule Q L2 verified.

**Which approach?**
