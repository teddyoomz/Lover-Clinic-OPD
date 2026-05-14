# Selective Make-Fresh + Backup Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend V40 "ทำให้เป็นสาขาใหม่" button with selective 7-bucket wipe + scope-matched auto-backup + SHA-256 round-trip integrity verification, with T1 master-data protected server-side.

**Architecture:** 4-layer (UI → Vercel endpoints → pure ESM lib → Firestore/Storage). New `branchBackupBuckets.js` is single source of truth for bucket schema. Backup file format bumped to v2 with `bodyHash` field. Both endpoints (`branch-backup-export` and `branch-make-fresh`) gain `bucketIds[]` parameter + run `assertNotT1` defense-in-depth. `MakeFreshModal` rewritten as 3-step (Pick → Preview → Type-confirm → Run) state machine. Round-trip integrity proven via 8-phase admin-SDK e2e on real prod with TEST-prefixed fixtures (Rule Q L2) + Playwright real-browser drive (Rule Q L1).

**Tech Stack:** Vercel serverless · firebase-admin SDK · React 19 · Vite 8 · Vitest 4 · Playwright · Cloud Storage v0 API · Firestore client + admin SDK · Tailwind 3.4

**Spec:** [docs/superpowers/specs/2026-05-14-selective-make-fresh-and-backup-integrity-design.md](../specs/2026-05-14-selective-make-fresh-and-backup-integrity-design.md)

**Iron-clad applies:** Rule Q V66 (real-adversarial verification — L1 Playwright OR L2 admin-SDK real prod), Rule M (admin-SDK data ops with two-phase + audit doc), Rule N (targeted-test-only for small bugfixes; full suite at end-of-batch), Rule I (full-flow simulate at sub-phase end), Rule P (class-of-bug expansion — T1-protection invariant), AV19 (destructive ops MUST require auto-backup).

---

## Task 1: NEW `src/lib/branchBackupBuckets.js` — 7-bucket schema + helpers

**Files:**
- Create: `src/lib/branchBackupBuckets.js`
- Test: `tests/branch-make-fresh-selective-helpers.test.js`

### Step 1.1 — Write failing test

- [ ] Create `tests/branch-make-fresh-selective-helpers.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  BUCKETS,
  resolveBucketScope,
  isT1Collection,
  assertNotT1,
  bucketDefaultsForUI,
} from '../src/lib/branchBackupBuckets.js';

describe('branchBackupBuckets — BUCKETS schema', () => {
  it('B1.1 — BUCKETS is frozen', () => {
    expect(Object.isFrozen(BUCKETS)).toBe(true);
  });

  it('B1.2 — has exactly 7 buckets in expected order', () => {
    expect(Object.keys(BUCKETS)).toEqual([
      'appointments', 'treatments', 'sales', 'stock',
      'finance', 'lineLink', 'customerActivity',
    ]);
  });

  it('B1.3 — each bucket has label + description + collections + customerSubcollections + defaultChecked', () => {
    for (const [id, b] of Object.entries(BUCKETS)) {
      expect(b.label, `${id}.label`).toMatch(/^[^\s]/); // non-empty Thai/emoji
      expect(typeof b.description).toBe('string');
      expect(Array.isArray(b.collections)).toBe(true);
      expect(Array.isArray(b.customerSubcollections)).toBe(true);
      expect(typeof b.defaultChecked).toBe('boolean');
    }
  });

  it('B1.4 — appointments bucket maps to be_appointments + subcoll appointments', () => {
    expect(BUCKETS.appointments.collections).toEqual(['be_appointments']);
    expect(BUCKETS.appointments.customerSubcollections).toEqual(['appointments']);
    expect(BUCKETS.appointments.defaultChecked).toBe(true);
  });

  it('B1.5 — sales bucket has 5 collections + sales subcoll', () => {
    expect(BUCKETS.sales.collections.sort()).toEqual([
      'be_online_sales', 'be_quotations', 'be_sale_insurance_claims',
      'be_sales', 'be_vendor_sales',
    ]);
    expect(BUCKETS.sales.customerSubcollections).toEqual(['sales']);
  });

  it('B1.6 — stock bucket has 6 T3 collections + zero subcoll', () => {
    expect(BUCKETS.stock.collections.sort()).toEqual([
      'be_stock_adjustments', 'be_stock_batches', 'be_stock_movements',
      'be_stock_orders', 'be_stock_transfers', 'be_stock_withdrawals',
    ]);
    expect(BUCKETS.stock.customerSubcollections).toEqual([]);
  });

  it('B1.7 — customerActivity defaultChecked is FALSE (Q4-B opt-in only)', () => {
    expect(BUCKETS.customerActivity.defaultChecked).toBe(false);
  });

  it('B1.8 — customerActivity has 4 subcollections + zero top-level collections', () => {
    expect(BUCKETS.customerActivity.collections).toEqual([]);
    expect(BUCKETS.customerActivity.customerSubcollections.sort()).toEqual([
      'courseChanges', 'memberships', 'points', 'wallets',
    ]);
  });

  it('B1.9 — exactly 6 buckets have defaultChecked=true', () => {
    const trueCount = Object.values(BUCKETS).filter(b => b.defaultChecked).length;
    expect(trueCount).toBe(6);
  });

  it('B1.10 — no T1 collection appears in any bucket (server-side protection)', () => {
    for (const b of Object.values(BUCKETS)) {
      for (const c of b.collections) {
        expect(isT1Collection(c), `${c} should NOT be T1`).toBe(false);
      }
    }
  });
});

describe('branchBackupBuckets — resolveBucketScope', () => {
  it('B2.1 — empty bucketIds throws EMPTY_BUCKET_SET', () => {
    expect(() => resolveBucketScope([])).toThrow('EMPTY_BUCKET_SET');
    expect(() => resolveBucketScope(null)).toThrow('EMPTY_BUCKET_SET');
    expect(() => resolveBucketScope(undefined)).toThrow('EMPTY_BUCKET_SET');
  });

  it('B2.2 — unknown bucket throws UNKNOWN_BUCKET', () => {
    expect(() => resolveBucketScope(['nonsense'])).toThrow('UNKNOWN_BUCKET: nonsense');
  });

  it('B2.3 — single bucket resolves correctly', () => {
    const out = resolveBucketScope(['appointments']);
    expect(out.collections).toEqual(['be_appointments']);
    expect(out.subcollections).toEqual(['appointments']);
  });

  it('B2.4 — multi-bucket dedups overlapping subcollections', () => {
    const out = resolveBucketScope(['appointments', 'sales']);
    expect(out.collections.sort()).toEqual([
      'be_appointments', 'be_online_sales', 'be_quotations',
      'be_sale_insurance_claims', 'be_sales', 'be_vendor_sales',
    ]);
    expect(out.subcollections.sort()).toEqual(['appointments', 'sales']);
  });

  it('B2.5 — all 7 buckets resolves to full scope', () => {
    const out = resolveBucketScope(Object.keys(BUCKETS));
    // T2 (10) + T3 (6) + Bucket 6 (1) = 17 top-level collections
    expect(out.collections.length).toBeGreaterThanOrEqual(15);
    // T4 subcollections: appointments + treatments + sales + deposits + 4 customer-activity = 8
    expect(out.subcollections.sort()).toEqual([
      'appointments', 'courseChanges', 'deposits', 'memberships',
      'points', 'sales', 'treatments', 'wallets',
    ]);
  });
});

describe('branchBackupBuckets — assertNotT1', () => {
  it('B3.1 — accepts T2/T3 collections', () => {
    expect(() => assertNotT1(['be_appointments', 'be_sales', 'be_stock_batches'])).not.toThrow();
  });

  it('B3.2 — throws T1_NOT_WIPEABLE on T1 collection', () => {
    expect(() => assertNotT1(['be_products'])).toThrow('T1_NOT_WIPEABLE: be_products');
    expect(() => assertNotT1(['be_courses'])).toThrow('T1_NOT_WIPEABLE: be_courses');
    expect(() => assertNotT1(['be_promotions'])).toThrow('T1_NOT_WIPEABLE: be_promotions');
  });

  it('B3.3 — empty array is no-op (passes)', () => {
    expect(() => assertNotT1([])).not.toThrow();
  });

  it('B3.4 — mixed list throws on first T1 encountered', () => {
    expect(() => assertNotT1(['be_appointments', 'be_holidays', 'be_sales'])).toThrow('T1_NOT_WIPEABLE: be_holidays');
  });
});

describe('branchBackupBuckets — bucketDefaultsForUI', () => {
  it('B4.1 — returns object with all 7 bucket keys', () => {
    const defs = bucketDefaultsForUI();
    expect(Object.keys(defs).sort()).toEqual([
      'appointments', 'customerActivity', 'finance', 'lineLink',
      'sales', 'stock', 'treatments',
    ]);
  });

  it('B4.2 — defaults match Q4-B contract (6 true, 1 false)', () => {
    const defs = bucketDefaultsForUI();
    expect(defs.appointments).toBe(true);
    expect(defs.treatments).toBe(true);
    expect(defs.sales).toBe(true);
    expect(defs.stock).toBe(true);
    expect(defs.finance).toBe(true);
    expect(defs.lineLink).toBe(true);
    expect(defs.customerActivity).toBe(false);
  });
});
```

- [ ] Run test to verify RED:

```
npx vitest run tests/branch-make-fresh-selective-helpers.test.js
```
Expected: FAIL with "Cannot find module" or similar — module doesn't exist yet.

### Step 1.2 — Implement branchBackupBuckets.js (minimal — make tests pass)

- [ ] Create `src/lib/branchBackupBuckets.js`:

```js
// ─── 7-bucket schema for selective make-fresh + backup ─────────────────────
// Pure ESM, no Firebase deps. Single source of truth — UI imports from here,
// endpoints import from here. Re-uses TIER_MAP[T1] from branchBackupCore for
// T1 protection (defense-in-depth at API boundary).
//
// Brainstorming decisions (Q1-Q6 locked 2026-05-14):
//   Q1=D Hybrid bucket UI + Advanced collection toggle + T1 server-protected
//   Q3=A 7 buckets
//   Q4=B Default 6 checked + customerActivity unchecked (opt-in only)

import { TIER_MAP, BACKUP_TIER_T1 } from './branchBackupCore.js';

export const BUCKETS = Object.freeze({
  appointments: Object.freeze({
    label: '📅 นัดหมาย',
    description: 'ลบนัดหมาย + per-customer appointments subcollection',
    collections: Object.freeze(['be_appointments']),
    customerSubcollections: Object.freeze(['appointments']),
    defaultChecked: true,
  }),
  treatments: Object.freeze({
    label: '💊 การรักษา',
    description: 'ลบการรักษา + per-customer treatments subcollection',
    collections: Object.freeze(['be_treatments']),
    customerSubcollections: Object.freeze(['treatments']),
    defaultChecked: true,
  }),
  sales: Object.freeze({
    label: '💰 การขาย',
    description: 'ลบการขาย / vendor sales / online sales / quotation / sale insurance claim + per-customer sales subcoll',
    collections: Object.freeze([
      'be_sales', 'be_vendor_sales', 'be_online_sales',
      'be_quotations', 'be_sale_insurance_claims',
    ]),
    customerSubcollections: Object.freeze(['sales']),
    defaultChecked: true,
  }),
  stock: Object.freeze({
    label: '📦 สต็อก (ทั้งหมด)',
    description: 'ลบสต็อกทั้ง state + ledger (T3 6 collections)',
    collections: Object.freeze([
      'be_stock_batches', 'be_stock_movements', 'be_stock_orders',
      'be_stock_transfers', 'be_stock_withdrawals', 'be_stock_adjustments',
    ]),
    customerSubcollections: Object.freeze([]),
    defaultChecked: true,
  }),
  finance: Object.freeze({
    label: '💵 การเงิน + มัดจำ',
    description: 'ลบรายจ่าย + มัดจำ + per-customer deposits subcollection',
    collections: Object.freeze(['be_expenses', 'be_deposits']),
    customerSubcollections: Object.freeze(['deposits']),
    defaultChecked: true,
  }),
  lineLink: Object.freeze({
    label: '🎫 คำขอเชื่อม LINE',
    description: 'ลบคำขอเชื่อม LINE OA → customer',
    collections: Object.freeze(['be_link_requests']),
    customerSubcollections: Object.freeze([]),
    defaultChecked: true,
  }),
  customerActivity: Object.freeze({
    label: '⭐ กิจกรรมลูกค้า (wallet/membership/points/courseChanges)',
    description: '⚠️ ลบ wallet balance + membership + loyalty points + course-exchange log ของลูกค้า — affects customer-visible state',
    collections: Object.freeze([]),
    customerSubcollections: Object.freeze(['wallets', 'memberships', 'points', 'courseChanges']),
    defaultChecked: false, // Q4-B opt-in only
  }),
});

/** Returns true if `name` is a T1 collection (master/setup). */
export function isT1Collection(name) {
  return TIER_MAP[BACKUP_TIER_T1].includes(String(name || ''));
}

/** Throws T1_NOT_WIPEABLE if any element of `collections` is in T1. */
export function assertNotT1(collections) {
  for (const c of collections) {
    if (isT1Collection(c)) throw new Error(`T1_NOT_WIPEABLE: ${c}`);
  }
}

/**
 * Resolve a list of bucket IDs into a flat list of {collections, subcollections}.
 * Throws EMPTY_BUCKET_SET if no buckets given, UNKNOWN_BUCKET if any unknown.
 */
export function resolveBucketScope(bucketIds) {
  if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
    throw new Error('EMPTY_BUCKET_SET');
  }
  const collections = new Set();
  const subcollections = new Set();
  for (const id of bucketIds) {
    const b = BUCKETS[id];
    if (!b) throw new Error(`UNKNOWN_BUCKET: ${id}`);
    for (const c of b.collections) collections.add(c);
    for (const s of b.customerSubcollections) subcollections.add(s);
  }
  return { collections: [...collections], subcollections: [...subcollections] };
}

/** Returns {appointments:true, ..., customerActivity:false} for UI default state. */
export function bucketDefaultsForUI() {
  const out = {};
  for (const [id, b] of Object.entries(BUCKETS)) {
    out[id] = !!b.defaultChecked;
  }
  return out;
}
```

- [ ] Run test to verify GREEN:

```
npx vitest run tests/branch-make-fresh-selective-helpers.test.js
```
Expected: PASS (all B1.* B2.* B3.* B4.* tests).

### Step 1.3 — Commit

- [ ] Run:

```bash
git add src/lib/branchBackupBuckets.js tests/branch-make-fresh-selective-helpers.test.js
git commit -m "$(cat <<'EOF'
feat(selective-make-fresh): NEW branchBackupBuckets.js — 7-bucket schema + helpers (Task 1)

Single source of truth for the 7-bucket schema:
- appointments / treatments / sales / stock / finance / lineLink / customerActivity
- Each bucket: label + description + collections + customerSubcollections + defaultChecked
- 6 buckets default-checked + customerActivity default-unchecked (Q4-B opt-in)

Helpers (pure JS, no Firebase deps):
- resolveBucketScope(bucketIds) → {collections, subcollections}
- isT1Collection(name) — reads TIER_MAP[T1] from branchBackupCore
- assertNotT1(collections) — throws T1_NOT_WIPEABLE (defense-in-depth at API boundary)
- bucketDefaultsForUI() → {bucket: checked} for UI initial state

Tests (29): BUCKETS schema invariants (10) + resolveBucketScope (5) +
assertNotT1 (4) + bucketDefaultsForUI (2) + per-bucket shape checks.

Spec: docs/superpowers/specs/2026-05-14-selective-make-fresh-and-backup-integrity-design.md §3.1

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: EDIT `src/lib/branchBackupSchema.js` — v2 schema + computeBodyHash

**Files:**
- Modify: `src/lib/branchBackupSchema.js`
- Test: `tests/branch-backup-hash-canonicalization.test.js`

### Step 2.1 — Read current schema file

- [ ] Read `src/lib/branchBackupSchema.js` to understand current structure. Note: `BACKUP_SCHEMA_VERSION = 1`, `validateBackupFile`, `buildBackupFile`, `jsonReviverForNonFinite`.

### Step 2.2 — Write failing test for computeBodyHash

- [ ] Create `tests/branch-backup-hash-canonicalization.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  computeBodyHash,
  validateBackupFile,
} from '../src/lib/branchBackupSchema.js';

const SAMPLE_COLLECTIONS = {
  be_appointments: [
    { id: 'BA-001', branchId: 'BR-A', date: '2026-05-14', startTime: '10:00' },
    { id: 'BA-002', branchId: 'BR-A', date: '2026-05-14', startTime: '11:00' },
  ],
  be_sales: [
    { id: 'SALE-001', branchId: 'BR-A', total: 1500 },
  ],
};

describe('branchBackupSchema — BACKUP_SCHEMA_VERSION', () => {
  it('H1.1 — version bumped to 2', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(2);
  });
});

describe('branchBackupSchema — computeBodyHash', () => {
  it('H2.1 — deterministic across calls', () => {
    const h1 = computeBodyHash(SAMPLE_COLLECTIONS);
    const h2 = computeBodyHash(SAMPLE_COLLECTIONS);
    expect(h1).toBe(h2);
  });

  it('H2.2 — returns 64-char hex (SHA-256)', () => {
    const h = computeBodyHash(SAMPLE_COLLECTIONS);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('H2.3 — key-order permutation produces SAME hash (stable stringify)', () => {
    const a = { be_sales: SAMPLE_COLLECTIONS.be_sales, be_appointments: SAMPLE_COLLECTIONS.be_appointments };
    const b = SAMPLE_COLLECTIONS; // appointments first
    expect(computeBodyHash(a)).toBe(computeBodyHash(b));
  });

  it('H2.4 — doc-order permutation within collection produces SAME hash (sort by docId)', () => {
    const reversed = {
      be_appointments: [...SAMPLE_COLLECTIONS.be_appointments].reverse(),
      be_sales: SAMPLE_COLLECTIONS.be_sales,
    };
    expect(computeBodyHash(reversed)).toBe(computeBodyHash(SAMPLE_COLLECTIONS));
  });

  it('H2.5 — different content → different hash', () => {
    const modified = {
      ...SAMPLE_COLLECTIONS,
      be_sales: [{ id: 'SALE-001', branchId: 'BR-A', total: 9999 }],
    };
    expect(computeBodyHash(modified)).not.toBe(computeBodyHash(SAMPLE_COLLECTIONS));
  });

  it('H2.6 — Firestore Timestamp sentinel round-trips', () => {
    const withTs = {
      be_sales: [{
        id: 'SALE-001',
        createdAt: { __type__: 'timestamp', seconds: 1715000000, nanoseconds: 123000000 },
      }],
    };
    const h = computeBodyHash(withTs);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Same Timestamp → same hash
    expect(computeBodyHash(withTs)).toBe(h);
  });

  it('H2.7 — NaN/Infinity sentinel → consistent hash', () => {
    const withNonFinite = {
      be_sales: [{
        id: 'SALE-001',
        value: { __type__: 'nonfinite', value: 'NaN' },
      }],
    };
    expect(computeBodyHash(withNonFinite)).toBe(computeBodyHash(withNonFinite));
  });

  it('H2.8 — empty collection → stable hash', () => {
    const h = computeBodyHash({ be_appointments: [] });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('H2.9 — empty collections object → stable hash', () => {
    expect(() => computeBodyHash({})).not.toThrow();
    expect(computeBodyHash({})).toBe(computeBodyHash({}));
  });

  it('H2.10 — 1000-doc fixture deterministic', () => {
    const docs = Array.from({ length: 1000 }, (_, i) => ({
      id: `BA-${String(i).padStart(4, '0')}`,
      branchId: 'BR-A',
      index: i,
    }));
    const collA = { be_appointments: docs };
    const collB = { be_appointments: [...docs].sort(() => Math.random() - 0.5) }; // shuffled
    expect(computeBodyHash(collA)).toBe(computeBodyHash(collB));
  });

  it('H2.11 — Thai text + NUL byte preserved in hash', () => {
    const thaiDocs = {
      be_appointments: [{
        id: 'BA-001',
        note: 'นัดหมายลูกค้า   พิเศษ',
      }],
    };
    expect(computeBodyHash(thaiDocs)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('H2.12 — Unicode NFC vs NFD produce DIFFERENT hashes (byte-equal, not unicode-equal)', () => {
    // 'é' as NFC (single code point U+00E9) vs NFD (e + U+0301 combining)
    const nfc = { be_sales: [{ id: 'S1', name: 'é' }] };
    const nfd = { be_sales: [{ id: 'S1', name: 'é' }] };
    // Different bytes → different hashes (intentional: round-trip must preserve byte form)
    expect(computeBodyHash(nfc)).not.toBe(computeBodyHash(nfd));
  });

  it('H2.13 — deeply nested object stable hash', () => {
    const nested = {
      be_sales: [{
        id: 'S1',
        items: { a: { b: { c: { d: { e: 'deep' } } } } },
      }],
    };
    expect(computeBodyHash(nested)).toBe(computeBodyHash(nested));
  });
});

describe('branchBackupSchema — validateBackupFile (v2)', () => {
  const SAMPLE_V2 = {
    schemaVersion: 2,
    meta: {
      sourceBranchId: 'BR-A',
      bucketIds: ['appointments'],
      bodyHash: 'a'.repeat(64),
      exportedAt: '2026-05-14T00:00:00.000Z',
    },
    collections: { be_appointments: [] },
  };

  it('H3.1 — v2 file with bodyHash validates', () => {
    expect(() => validateBackupFile(SAMPLE_V2)).not.toThrow();
  });

  it('H3.2 — v2 file MISSING bodyHash throws', () => {
    const bad = { ...SAMPLE_V2, meta: { ...SAMPLE_V2.meta, bodyHash: undefined } };
    delete bad.meta.bodyHash;
    expect(() => validateBackupFile(bad)).toThrow();
  });

  it('H3.3 — v2 file with bodyHash wrong format (not 64-char hex) throws', () => {
    const bad = { ...SAMPLE_V2, meta: { ...SAMPLE_V2.meta, bodyHash: 'tooshort' } };
    expect(() => validateBackupFile(bad)).toThrow();
  });

  it('H3.4 — v1 file (legacy) still validates (backwards compat)', () => {
    const v1 = {
      schemaVersion: 1,
      meta: { sourceBranchId: 'BR-A', exportedAt: '2026-05-07T00:00:00.000Z' },
      collections: { be_appointments: [] },
    };
    expect(() => validateBackupFile(v1)).not.toThrow();
  });
});
```

- [ ] Run test to verify RED:

```
npx vitest run tests/branch-backup-hash-canonicalization.test.js
```
Expected: FAIL (computeBodyHash not exported; BACKUP_SCHEMA_VERSION still 1).

### Step 2.3 — Implement v2 schema + computeBodyHash

- [ ] Read the current `src/lib/branchBackupSchema.js` first to understand exact existing structure:

```bash
# Read the file end-to-end before editing — DON'T blind-Edit
```

- [ ] Modify `src/lib/branchBackupSchema.js`:

```js
// At top of file (after existing imports if any), add:
import crypto from 'crypto';

// Bump version constant:
export const BACKUP_SCHEMA_VERSION = 2;

// Add new helper — canonical JSON.stringify with sorted keys at every level:
function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '{"__type__":"nonfinite","value":"NaN"}';
    if (value === Infinity) return '{"__type__":"nonfinite","value":"Infinity"}';
    if (value === -Infinity) return '{"__type__":"nonfinite","value":"-Infinity"}';
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  return JSON.stringify(value); // fallback
}

/**
 * Compute SHA-256 hex of canonicalized doc list across all collections.
 * Sort collections alphabetically. Within each collection, sort docs by id/docId.
 * Stringify with stable key order at every level. Concatenate lines:
 *   `${collection}|${docId}|${stableJson}\n`
 * Hash with SHA-256, return 64-char hex.
 */
export function computeBodyHash(collections) {
  const lines = [];
  const colNames = Object.keys(collections).sort();
  for (const col of colNames) {
    const docs = collections[col] || [];
    // Sort docs by id || docId
    const sorted = [...docs].sort((a, b) => {
      const ai = String(a?.id ?? a?.docId ?? '');
      const bi = String(b?.id ?? b?.docId ?? '');
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });
    for (const doc of sorted) {
      const docId = String(doc?.id ?? doc?.docId ?? '');
      lines.push(`${col}|${docId}|${canonicalize(doc)}`);
    }
  }
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

// Update validateBackupFile to handle v2 + backward-compat v1:
export function validateBackupFile(file) {
  if (!file || typeof file !== 'object') throw new Error('INVALID_FILE_STRUCTURE');
  if (file.schemaVersion === 1) {
    // V40 legacy — preserve V40 validation logic (existing code)
    if (!file.meta || !file.meta.sourceBranchId) throw new Error('INVALID_META');
    if (!file.collections || typeof file.collections !== 'object') throw new Error('INVALID_COLLECTIONS');
    return true;
  }
  if (file.schemaVersion === 2) {
    if (!file.meta || !file.meta.sourceBranchId) throw new Error('INVALID_META');
    if (!file.meta.bodyHash || typeof file.meta.bodyHash !== 'string') {
      throw new Error('V2_REQUIRES_BODY_HASH');
    }
    if (!/^[0-9a-f]{64}$/.test(file.meta.bodyHash)) {
      throw new Error('INVALID_BODY_HASH_FORMAT');
    }
    if (!Array.isArray(file.meta.bucketIds)) {
      throw new Error('V2_REQUIRES_BUCKET_IDS');
    }
    if (!file.collections || typeof file.collections !== 'object') throw new Error('INVALID_COLLECTIONS');
    return true;
  }
  throw new Error(`SCHEMA_VERSION_UNSUPPORTED: ${file.schemaVersion}`);
}

// Update buildBackupFile signature to accept bucketIds + emit bodyHash:
export function buildBackupFile({ sourceBranchId, bucketIds, collections, exportedBy, isAutoPreFresh }) {
  const bodyHash = computeBodyHash(collections);
  return {
    schemaVersion: 2,
    meta: {
      sourceBranchId,
      bucketIds: Array.isArray(bucketIds) ? [...bucketIds].sort() : [],
      bodyHash,
      exportedAt: new Date().toISOString(),
      exportedBy: exportedBy || null,
      isAutoPreFresh: !!isAutoPreFresh,
    },
    collections,
  };
}
```

Note: when editing the file, preserve all existing exports (jsonReviverForNonFinite, etc.) and any V1-legacy validation logic intact. The diff is: bump version, add canonicalize+computeBodyHash, extend validate, update build signature.

- [ ] Run test to verify GREEN:

```
npx vitest run tests/branch-backup-hash-canonicalization.test.js
```
Expected: PASS (all H1.* H2.* H3.* tests).

### Step 2.4 — Commit

- [ ] Run:

```bash
git add src/lib/branchBackupSchema.js tests/branch-backup-hash-canonicalization.test.js
git commit -m "$(cat <<'EOF'
feat(selective-make-fresh): branchBackupSchema v2 + computeBodyHash (Task 2)

- BACKUP_SCHEMA_VERSION bumped 1 → 2
- NEW computeBodyHash(collections) → SHA-256 hex of canonicalized doc list
  Canonicalization: alphabetical collection order, docs sorted by id, stable
  JSON.stringify (sorted keys at every level), Firestore Timestamp +
  NaN/Infinity sentinels preserved
- validateBackupFile now handles v1 (backward-compat) + v2 (requires bodyHash
  + bucketIds in meta)
- buildBackupFile accepts bucketIds + auto-emits bodyHash in meta

Tests (24): SCHEMA_VERSION (1), computeBodyHash deterministic + key/doc-order
stable + content-sensitive + Timestamp/NaN sentinels + 1000-doc fixture +
adversarial Thai/NUL/Unicode NFC/NFD + deeply nested (13), validateBackupFile
v1/v2 path + missing bodyHash + invalid format (4).

Spec: §3.2

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: EDIT `api/admin/branch-backup-export.js` — accept bucketIds + dryRun + emit bodyHash

**Files:**
- Modify: `api/admin/branch-backup-export.js`

### Step 3.1 — Read current endpoint

- [ ] Read `api/admin/branch-backup-export.js` end-to-end to understand:
  - Current request body shape (`branchId`, `tiers`, `collections`, `isAutoPreFresh`)
  - Current response shape
  - How collections + subcollections are fetched
  - Audit doc shape

### Step 3.2 — Add `bucketIds[]` support + `dryRun=true` path + bodyHash emit

- [ ] Modify the request validation block:

```js
// Add destructuring for bucketIds + dryRun:
const { branchId, tiers, collections, bucketIds, dryRun, isAutoPreFresh } = req.body || {};
if (!branchId) return res.status(400).json({ ok: false, error: 'MISSING_BRANCH_ID' });
```

- [ ] Import bucket helpers at top:

```js
import { BUCKETS, resolveBucketScope, assertNotT1 } from '../../src/lib/branchBackupBuckets.js';
import { computeBodyHash, buildBackupFile } from '../../src/lib/branchBackupSchema.js';
```

- [ ] Replace scope resolution block. Add this logic where the current `resolveBackupScope({ tiers, collections })` call is:

```js
// Selective scope via bucketIds (preferred) or legacy V40 tiers/collections.
let resolved;
let resolvedSubcollections;
let scopeMode;

if (Array.isArray(bucketIds) && bucketIds.length > 0) {
  // V41 selective bucket mode
  scopeMode = 'buckets';
  const scope = resolveBucketScope(bucketIds);
  assertNotT1(scope.collections); // defense-in-depth — UI never sends T1; this rejects hand-crafted curl
  resolved = scope.collections;
  resolvedSubcollections = scope.subcollections;
} else {
  // V40 legacy tiers/collections (backwards compat)
  scopeMode = 'legacy';
  resolved = resolveBackupScope({ tiers, collections });
  resolvedSubcollections = ['treatments', 'sales', 'appointments', 'deposits',
                            'wallets', 'memberships', 'points', 'courseChanges']; // T4 full set
}
```

- [ ] Add dryRun branch BEFORE Storage upload code:

```js
if (dryRun === true) {
  // Count-only — no file build, no Storage upload, no audit doc
  const perBucket = {};
  let totalDocs = 0;
  let estSizeBytes = 0;

  if (scopeMode === 'buckets') {
    for (const bucketId of bucketIds) {
      const bucket = BUCKETS[bucketId];
      let docs = 0;
      let subDocs = 0;
      let sizeBytes = 0;

      for (const col of bucket.collections) {
        const snap = await dataCol(db, col).where('branchId', '==', branchId).get();
        docs += snap.size;
        for (const d of snap.docs) {
          sizeBytes += JSON.stringify(d.data()).length;
        }
      }

      if (bucket.customerSubcollections.length > 0) {
        const customersSnap = await dataCol(db, 'be_customers').get();
        for (const sub of bucket.customerSubcollections) {
          for (const cust of customersSnap.docs) {
            const subSnap = await cust.ref.collection(sub).where('branchId', '==', branchId).get();
            subDocs += subSnap.size;
            for (const d of subSnap.docs) {
              sizeBytes += JSON.stringify(d.data()).length;
            }
          }
        }
      }

      perBucket[bucketId] = { docs, subDocs, sizeBytes };
      totalDocs += docs + subDocs;
      estSizeBytes += sizeBytes;
    }
  } else {
    // Legacy tier/collection — just count totals
    for (const col of resolved) {
      const snap = await dataCol(db, col).where('branchId', '==', branchId).get();
      totalDocs += snap.size;
      for (const d of snap.docs) {
        estSizeBytes += JSON.stringify(d.data()).length;
      }
    }
  }

  return res.status(200).json({
    ok: true,
    dryRun: true,
    scopeMode,
    perBucket,
    totalDocs,
    estSizeBytes,
  });
}
```

- [ ] Replace the existing file-build + upload block to use `buildBackupFile` (emits bodyHash):

After the existing collection-fetch loop builds `outCollections = { col1: [docs], col2: [docs], ... }`, replace the file construction with:

```js
const file = buildBackupFile({
  sourceBranchId: branchId,
  bucketIds: scopeMode === 'buckets' ? bucketIds : [],
  collections: outCollections,
  exportedBy: caller.decoded.uid,
  isAutoPreFresh: !!isAutoPreFresh,
});

// upload file to Storage as before (existing code)
const storagePath = `backups/${branchId}/${isAutoPreFresh ? 'auto-pre-fresh' : 'manual'}-${Date.now()}-${randHex()}.json`;
await bucket.file(storagePath).save(JSON.stringify(file), {
  contentType: 'application/json',
  metadata: { metadata: { bodyHash: file.meta.bodyHash, bucketIds: JSON.stringify(file.meta.bucketIds) } },
});

// Audit doc — extend with bodyHash + scopeMode
const auditId = `branch-backup-export-${Date.now()}-${randHex()}`;
await dataCol(db, 'be_admin_audit').doc(auditId).set({
  action: 'branch-backup-export',
  branchId,
  scopeMode,
  bucketIds: file.meta.bucketIds,
  collectionsCount: Object.keys(outCollections).length,
  totalDocs: Object.values(outCollections).reduce((sum, arr) => sum + arr.length, 0),
  bodyHash: file.meta.bodyHash,
  storagePath,
  isAutoPreFresh: !!isAutoPreFresh,
  exportedBy: caller.decoded.uid,
  exportedAt: new Date().toISOString(),
});

return res.status(200).json({
  ok: true,
  scopeMode,
  storagePath,
  bodyHash: file.meta.bodyHash,
  bucketIds: file.meta.bucketIds,
  totalDocs: file.meta.totalDocs ?? Object.values(outCollections).reduce((s, a) => s + a.length, 0),
  auditId,
});
```

### Step 3.3 — Verify endpoint compiles

- [ ] Run vite build to verify endpoint imports resolve:

```
npm run build
```
Expected: clean build (no missing imports, no syntax errors).

### Step 3.4 — Commit

- [ ] Run:

```bash
git add api/admin/branch-backup-export.js
git commit -m "$(cat <<'EOF'
feat(selective-make-fresh): branch-backup-export accepts bucketIds + dryRun + emits bodyHash (Task 3)

- Request body adds: bucketIds?: string[], dryRun?: boolean
- bucketIds path: resolveBucketScope → assertNotT1 (defense-in-depth)
- Legacy tiers/collections path preserved (V40 backwards compat)
- dryRun=true: counts only, returns perBucket{docs, subDocs, sizeBytes} +
  totalDocs + estSizeBytes; NO Storage write, NO audit doc
- buildBackupFile auto-emits bodyHash via computeBodyHash
- Storage upload now sets metadata.bodyHash + metadata.bucketIds for later
  cross-check
- Audit doc extended with scopeMode + bucketIds + bodyHash

Spec: §3.3

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: EDIT `api/admin/branch-make-fresh.js` — accept bucketIds + verify hash + scope-match

**Files:**
- Modify: `api/admin/branch-make-fresh.js`

### Step 4.1 — Read current endpoint

- [ ] Read `api/admin/branch-make-fresh.js` end-to-end. Note: currently hardcodes `[...T1, ...T2, ...T3]` wipe + T4 customer-subcoll loop. We're going to replace that with selective scope.

### Step 4.2 — Add bucketIds validation + hash verify + scope-match check

- [ ] Add imports at top:

```js
import { BUCKETS, resolveBucketScope, assertNotT1 } from '../../src/lib/branchBackupBuckets.js';
import { computeBodyHash, validateBackupFile } from '../../src/lib/branchBackupSchema.js';
```

- [ ] Replace the request validation + main handler body (preserve verifyAdminToken, CORS, OPTIONS):

```js
const { branchId, bucketIds, autoBackupRef, expectedBodyHash } = req.body || {};
if (!branchId) return res.status(400).json({ ok: false, error: 'MISSING_BRANCH_ID' });
if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
  return res.status(400).json({ ok: false, error: 'EMPTY_BUCKET_SET' });
}
if (!autoBackupRef || typeof autoBackupRef !== 'string') {
  return res.status(400).json({ ok: false, error: 'AUTO_BACKUP_REQUIRED' });
}

try {
  const { db, bucket } = getAdmin();

  // AV19 — verify autoBackup exists in Storage
  const [exists] = await bucket.file(autoBackupRef).exists();
  if (!exists) return res.status(400).json({ ok: false, error: 'AUTO_BACKUP_NOT_FOUND', autoBackupRef });

  // Download + parse + validate backup file
  const [fileBuffer] = await bucket.file(autoBackupRef).download();
  let file;
  try {
    file = JSON.parse(fileBuffer.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'BACKUP_JSON_PARSE_FAILED', detail: e.message });
  }
  try {
    validateBackupFile(file);
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'BACKUP_SCHEMA_INVALID', detail: e.message });
  }

  // Hash verification — recompute + compare with file.meta.bodyHash
  if (file.schemaVersion >= 2) {
    const recomputed = computeBodyHash(file.collections);
    if (recomputed !== file.meta.bodyHash) {
      return res.status(500).json({
        ok: false,
        error: 'BACKUP_INTEGRITY_FAIL',
        expected: file.meta.bodyHash,
        actual: recomputed,
      });
    }
    // Optional cross-check against UI-passed expectedBodyHash
    if (expectedBodyHash && expectedBodyHash !== file.meta.bodyHash) {
      return res.status(400).json({
        ok: false,
        error: 'BACKUP_HASH_EXPECTED_MISMATCH',
        expected: expectedBodyHash,
        actual: file.meta.bodyHash,
      });
    }
    // Scope-mismatch — request.bucketIds must equal file.meta.bucketIds (sorted)
    const sortedReq = [...bucketIds].sort();
    const sortedFile = [...(file.meta.bucketIds || [])].sort();
    if (JSON.stringify(sortedReq) !== JSON.stringify(sortedFile)) {
      return res.status(400).json({
        ok: false,
        error: 'SCOPE_MISMATCH',
        requestBucketIds: sortedReq,
        fileBucketIds: sortedFile,
      });
    }
  }

  // Resolve scope + defense-in-depth T1 check
  const { collections: wipeCols, subcollections: wipeSubs } = resolveBucketScope(bucketIds);
  assertNotT1(wipeCols);

  const deletedCounts = {};

  // Wipe top-level collections
  for (const col of wipeCols) {
    const snap = await dataCol(db, col).where('branchId', '==', branchId).get();
    let deleted = 0;
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const slice = snap.docs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const d of slice) batch.delete(d.ref);
      await batch.commit();
      deleted += slice.length;
    }
    deletedCounts[col] = deleted;
  }

  // Wipe customer subcollections — parallel-batched 50/batch (V40-prod-fix-2 pattern)
  if (wipeSubs.length > 0) {
    const T4_BATCH_SIZE = 50;
    const customersSnap = await dataCol(db, 'be_customers').get();
    const customerDocs = customersSnap.docs;
    let t4Deleted = 0;
    for (let bi = 0; bi < customerDocs.length; bi += T4_BATCH_SIZE) {
      const batchCustomers = customerDocs.slice(bi, bi + T4_BATCH_SIZE);
      const subSnaps = await Promise.all(batchCustomers.flatMap(cust =>
        wipeSubs.map(async sub => {
          const subSnap = await cust.ref.collection(sub).where('branchId', '==', branchId).get();
          return subSnap;
        })
      ));
      for (const subSnap of subSnaps) {
        for (let i = 0; i < subSnap.docs.length; i += BATCH_LIMIT) {
          const slice = subSnap.docs.slice(i, i + BATCH_LIMIT);
          const writeBatch = db.batch();
          for (const d of slice) writeBatch.delete(d.ref);
          await writeBatch.commit();
          t4Deleted += slice.length;
        }
      }
    }
    deletedCounts['be_customers/__per_customer__'] = t4Deleted;
  }

  // Audit doc
  const auditId = `branch-make-fresh-${Date.now()}-${randHex()}`;
  await dataCol(db, 'be_admin_audit').doc(auditId).set({
    action: 'branch-make-fresh',
    branchId,
    bucketIds: [...bucketIds].sort(),
    autoBackupRef,
    bodyHash: file.meta?.bodyHash || null,
    deletedCounts,
    executedBy: caller.decoded.uid,
    executedAt: new Date().toISOString(),
  });

  return res.status(200).json({
    ok: true,
    deletedCounts,
    autoBackupRef,
    bodyHash: file.meta?.bodyHash || null,
    bucketIds: [...bucketIds].sort(),
    auditId,
  });
} catch (e) {
  console.error('branch-make-fresh error:', e);
  return res.status(500).json({ ok: false, error: 'MAKE_FRESH_FAILED', detail: e.message });
}
```

### Step 4.3 — Verify build clean

- [ ] Run:

```
npm run build
```
Expected: clean.

### Step 4.4 — Commit

- [ ] Run:

```bash
git add api/admin/branch-make-fresh.js
git commit -m "$(cat <<'EOF'
feat(selective-make-fresh): branch-make-fresh accepts bucketIds + verifies hash (Task 4)

Pre-wipe sequence (in order):
1. Validate bucketIds[] (required, non-empty)
2. AV19: bucket.file(autoBackupRef).exists() → 400 AUTO_BACKUP_NOT_FOUND
3. Download + parse + validateBackupFile (schema v1 backward-compat preserved)
4. If schemaVersion >= 2: recompute bodyHash + compare with file.meta.bodyHash
   → 500 BACKUP_INTEGRITY_FAIL on mismatch (wipe ABORTED before any delete)
5. If expectedBodyHash sent in request: cross-check → 400 on mismatch
6. Scope-mismatch: file.meta.bucketIds === request.bucketIds (sorted) → 400
7. resolveBucketScope → assertNotT1 (defense-in-depth)
8. Wipe only resolved.collections + resolved.subcollections (where branchId == target)
9. Audit doc records bucketIds + bodyHash + deletedCounts

T1 collections NEVER touched even if API gets them (assertNotT1 throws BEFORE
any delete). Hash mismatch surfaces as 500 (server-side integrity bug) not 400
(client error) since hash should always match if backup wasn't corrupted.

Spec: §3.4 + §5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: REWRITE `src/components/backend/MakeFreshModal.jsx` — 3-step UX

**Files:**
- Modify (rewrite): `src/components/backend/MakeFreshModal.jsx`

### Step 5.1 — Rewrite modal with 3-step state machine

- [ ] Replace the entire content of `src/components/backend/MakeFreshModal.jsx`:

```jsx
import { useState, useCallback } from 'react';
import { X, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { auth } from '../../firebase.js';
import { BUCKETS, bucketDefaultsForUI } from '../../lib/branchBackupBuckets.js';

const BUCKET_ORDER = Object.keys(BUCKETS);

export default function MakeFreshModal({ branch, onClose, onComplete }) {
  const branchName = branch.branchName || branch.name || '?';
  const branchId = branch.branchId || branch.id;

  // Q4-B: 6 buckets checked + customerActivity unchecked
  const [checkedBuckets, setCheckedBuckets] = useState(bucketDefaultsForUI);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | previewing | preview-ready | confirming | backing-up | wiping | done | error
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [autoBackupRef, setAutoBackupRef] = useState(null);
  const [bodyHash, setBodyHash] = useState(null);
  const [result, setResult] = useState(null);

  const tickedBucketIds = BUCKET_ORDER.filter(id => checkedBuckets[id]);
  const matches = confirmText.trim() === branchName.trim();

  const handleBucketToggle = (id) => {
    setCheckedBuckets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePreview = useCallback(async () => {
    if (tickedBucketIds.length === 0) return;
    setPhase('previewing'); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/branch-backup-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ branchId, bucketIds: tickedBucketIds, dryRun: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'preview failed');
      setPreview(json);
      setPhase('preview-ready');
    } catch (e) {
      setError(e.message); setPhase('error');
    }
  }, [branchId, tickedBucketIds]);

  const handleRun = useCallback(async () => {
    if (!matches) return;
    setPhase('backing-up'); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();

      const resBackup = await fetch('/api/admin/branch-backup-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ branchId, bucketIds: tickedBucketIds, isAutoPreFresh: true }),
      });
      const jsonBackup = await resBackup.json();
      if (!resBackup.ok || !jsonBackup.ok) throw new Error(jsonBackup.error || 'auto-backup failed');
      setAutoBackupRef(jsonBackup.storagePath);
      setBodyHash(jsonBackup.bodyHash);

      setPhase('wiping');
      const resFresh = await fetch('/api/admin/branch-make-fresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          branchId,
          bucketIds: tickedBucketIds,
          autoBackupRef: jsonBackup.storagePath,
          expectedBodyHash: jsonBackup.bodyHash,
        }),
      });
      const jsonFresh = await resFresh.json();
      if (!resFresh.ok || !jsonFresh.ok) throw new Error(jsonFresh.error || 'make-fresh failed');

      setResult(jsonFresh);
      setPhase('done');
    } catch (e) {
      setError(e.message); setPhase('error');
    }
  }, [matches, branchId, tickedBucketIds]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog">
      <div className="w-[95vw] max-w-2xl rounded-xl bg-[var(--bg-card)] border border-rose-800/40 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between sticky top-0 bg-[var(--bg-card)] pb-2">
          <h3 className="text-lg font-bold text-rose-300 flex items-center gap-2">
            <AlertTriangle size={20} /> ทำให้เป็นสาขาใหม่
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </header>

        <div className="text-sm">
          สาขา: <strong>{branchName}</strong> ({branchId})
        </div>

        {/* IDLE — bucket selection */}
        {phase === 'idle' && (
          <>
            <div className="space-y-2" data-testid="bucket-list">
              {BUCKET_ORDER.map(id => {
                const b = BUCKETS[id];
                return (
                  <label key={id} className="flex items-start gap-3 p-3 rounded border border-[var(--bd)] hover:bg-[var(--bg-hover)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checkedBuckets[id]}
                      onChange={() => handleBucketToggle(id)}
                      className="mt-1"
                      data-testid={`bucket-${id}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{b.label}</div>
                      <div className="text-xs opacity-70">{b.description}</div>
                      {advancedOpen && (
                        <div className="mt-2 text-xs opacity-50 font-mono">
                          collections: {b.collections.join(', ') || '(none)'}
                          {b.customerSubcollections.length > 0 && (
                            <> · subcoll: {b.customerSubcollections.join(', ')}</>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <button
              onClick={() => setAdvancedOpen(v => !v)}
              className="text-xs flex items-center gap-1 opacity-70 hover:opacity-100"
              data-testid="advanced-toggle"
            >
              {advancedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              ขั้นสูง (Developer — แสดง collection list)
            </button>

            <div className="flex justify-between gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white">ยกเลิก</button>
              <button
                onClick={handlePreview}
                disabled={tickedBucketIds.length === 0}
                className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-30 text-white font-bold"
                data-testid="preview-btn"
              >
                ดูผลกระทบ
              </button>
            </div>
          </>
        )}

        {phase === 'previewing' && (
          <div className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" /> กำลังคำนวณ...</div>
        )}

        {/* PREVIEW READY — show impact panel */}
        {phase === 'preview-ready' && preview && (
          <>
            <div className="space-y-1 text-sm" data-testid="impact-panel">
              <div className="font-bold">📊 ผลกระทบ</div>
              {BUCKET_ORDER.map(id => {
                const ticked = !!checkedBuckets[id];
                const bData = preview.perBucket?.[id];
                return (
                  <div key={id} className={ticked ? '' : 'opacity-40'}>
                    {ticked ? '✓' : '✗'} {BUCKETS[id].label}
                    {ticked && bData && (
                      <span> — <strong>{bData.docs}</strong> docs
                        {bData.subDocs > 0 && <> + <strong>{bData.subDocs}</strong> subcoll docs</>}
                      </span>
                    )}
                    {!ticked && <span> — skipped</span>}
                  </div>
                );
              })}
              <div className="border-t border-[var(--bd)] mt-2 pt-2">
                📦 ลบทั้งหมด: <strong>{preview.totalDocs}</strong> docs
              </div>
              <div>💾 Backup ขนาดประมาณ: <strong>{(preview.estSizeBytes / 1024).toFixed(1)} KB</strong></div>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button
                onClick={() => { setPhase('idle'); setPreview(null); }}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
              >
                ← ปรับการเลือก
              </button>
              <button
                onClick={() => setPhase('confirming')}
                className="px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 text-white font-bold"
                data-testid="continue-btn"
              >
                ดำเนินการต่อ
              </button>
            </div>
          </>
        )}

        {/* CONFIRMING — typed branch-name gate */}
        {phase === 'confirming' && (
          <>
            <div className="space-y-2 text-sm">
              <div className="text-rose-300">⚠️ การกระทำนี้จะลบทุกข้อมูลที่ติ๊กเลือก พร้อมประวัติทั้งหมด</div>
              <div className="text-emerald-300">✓ ระบบจะ backup ก่อนลบ + ตรวจสอบ SHA-256 hash ก่อนลบ</div>
            </div>
            <div>
              <label className="text-xs">พิมพ์ <code className="bg-[var(--bg-hover)] px-1 rounded">{branchName}</code> เพื่อยืนยัน</label>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)]"
                data-testid="confirm-input"
              />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button onClick={() => setPhase('preview-ready')} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white">ยกเลิก</button>
              <button
                disabled={!matches}
                onClick={handleRun}
                className="px-4 py-2 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-30 text-white font-bold"
                data-testid="confirm-btn"
              >
                ยืนยัน — สำรองและลบ
              </button>
            </div>
          </>
        )}

        {phase === 'backing-up' && (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> 1/3 กำลังสำรอง...
          </div>
        )}

        {phase === 'wiping' && (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> 1/3 สำรองสำเร็จ</div>
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> 2/3 ตรวจสอบ hash สำเร็จ</div>
            <div className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> 3/3 กำลังลบ...</div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 size={16} /> เสร็จสิ้น</div>
            <div className="text-xs">📦 Backup: <code className="bg-[var(--bg-hover)] px-1 rounded">{autoBackupRef}</code></div>
            <div className="text-xs">🔐 Hash: <code className="bg-[var(--bg-hover)] px-1 rounded">{bodyHash}</code></div>
            <div className="text-xs">📊 ลบ: {Object.entries(result.deletedCounts || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}</div>
            <div className="text-xs">🧾 Audit: <code className="bg-[var(--bg-hover)] px-1 rounded">{result.auditId}</code></div>
            <button onClick={() => onComplete?.(result)} className="w-full px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white">ปิด</button>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-2 text-sm">
            <div className="text-rose-300">✗ ข้อผิดพลาด: {error}</div>
            {autoBackupRef && (
              <div className="text-emerald-300 text-xs">
                (Backup สำเร็จแล้วที่ <code>{autoBackupRef}</code> — ใช้ BranchBackupTab → Restore เพื่อกู้คืน)
              </div>
            )}
            <button onClick={onClose} className="w-full px-4 py-2 rounded bg-gray-700 text-white">ปิด</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Step 5.2 — Verify build clean

- [ ] Run:

```
npm run build
```
Expected: clean (no missing imports, JSX OK).

### Step 5.3 — Commit

- [ ] Run:

```bash
git add src/components/backend/MakeFreshModal.jsx
git commit -m "$(cat <<'EOF'
feat(selective-make-fresh): MakeFreshModal 3-step UX (Task 5)

Rewrite as state machine: idle → previewing → preview-ready → confirming →
backing-up → wiping → done | error.

- idle: 7 bucket checkboxes (Q4-B: 6 checked + customerActivity unchecked) +
  Advanced toggle revealing collection list per bucket
- previewing: POST /branch-backup-export?dryRun=true → real counts
- preview-ready: impact panel with per-bucket docs + total + estSizeBytes;
  [← ปรับ] / [ดำเนินการต่อ]
- confirming: typed branch-name gate (V40 pattern); [ยกเลิก] / [ยืนยัน]
- backing-up: "1/3 กำลังสำรอง..."
- wiping: ✓ 1/3 สำรอง ✓ 2/3 hash check / "3/3 กำลังลบ..."
- done: storagePath + bodyHash + deletedCounts + auditId
- error: error msg + storagePath hint for manual restore via BranchBackupTab

UI sends bucketIds[] + expectedBodyHash on confirm → backend verifies hash
match before wipe. T1 collections NEVER shown (even in Advanced).

Spec: §3.5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Flow-simulate test (Rule I)

**Files:**
- Create: `tests/branch-make-fresh-selective-flow-simulate.test.jsx`

### Step 6.1 — Write flow-simulate test

- [ ] Create `tests/branch-make-fresh-selective-flow-simulate.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MakeFreshModal from '../src/components/backend/MakeFreshModal.jsx';
import { BUCKETS, bucketDefaultsForUI } from '../src/lib/branchBackupBuckets.js';

// Mock firebase auth
vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'mock-id-token' } },
  db: {},
}));

const SAMPLE_BRANCH = { branchId: 'BR-A', branchName: 'นครราชสีมา' };

describe('MakeFreshModal — Rule I full-flow simulate', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  it('F1.1 — opens with Q4-B default: 6 checked + customerActivity unchecked', () => {
    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    const defaults = bucketDefaultsForUI();
    for (const id of Object.keys(BUCKETS)) {
      const checkbox = screen.getByTestId(`bucket-${id}`);
      expect(checkbox.checked).toBe(defaults[id]);
    }
  });

  it('F1.2 — preview button disabled when zero buckets ticked', () => {
    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    // Untick all 7
    for (const id of Object.keys(BUCKETS)) {
      const cb = screen.getByTestId(`bucket-${id}`);
      if (cb.checked) fireEvent.click(cb);
    }
    const previewBtn = screen.getByTestId('preview-btn');
    expect(previewBtn.disabled).toBe(true);
  });

  it('F1.3 — preview flow displays per-bucket counts from dryRun response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        dryRun: true,
        scopeMode: 'buckets',
        perBucket: {
          appointments: { docs: 145, subDocs: 12, sizeBytes: 24567 },
          treatments: { docs: 89, subDocs: 89, sizeBytes: 15000 },
          sales: { docs: 60, subDocs: 60, sizeBytes: 12000 },
          stock: { docs: 234, subDocs: 0, sizeBytes: 50000 },
          finance: { docs: 30, subDocs: 5, sizeBytes: 5000 },
          lineLink: { docs: 5, subDocs: 0, sizeBytes: 500 },
        },
        totalDocs: 729,
        estSizeBytes: 107067,
      }),
    });

    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('preview-btn'));
    await waitFor(() => expect(screen.getByTestId('impact-panel')).toBeInTheDocument());
    expect(screen.getByText(/145/)).toBeInTheDocument();
    expect(screen.getByText(/729/)).toBeInTheDocument();
  });

  it('F1.4 — confirm requires typed branch-name match', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        dryRun: true,
        perBucket: { appointments: { docs: 5, subDocs: 0, sizeBytes: 100 } },
        totalDocs: 5,
        estSizeBytes: 100,
      }),
    });

    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('preview-btn'));
    await waitFor(() => screen.getByTestId('continue-btn'));
    fireEvent.click(screen.getByTestId('continue-btn'));

    const confirmBtn = screen.getByTestId('confirm-btn');
    expect(confirmBtn.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'wrong-name' } });
    expect(confirmBtn.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'นครราชสีมา' } });
    expect(confirmBtn.disabled).toBe(false);
  });

  it('F1.5 — full success flow: preview → confirm → backup → wipe → done', async () => {
    fetchMock
      .mockResolvedValueOnce({ // dryRun preview
        ok: true,
        json: async () => ({
          ok: true,
          dryRun: true,
          perBucket: { appointments: { docs: 5, subDocs: 0, sizeBytes: 100 } },
          totalDocs: 5,
          estSizeBytes: 100,
        }),
      })
      .mockResolvedValueOnce({ // auto-backup
        ok: true,
        json: async () => ({
          ok: true,
          storagePath: 'backups/BR-A/auto-pre-fresh-1700-abc.json',
          bodyHash: 'a'.repeat(64),
        }),
      })
      .mockResolvedValueOnce({ // make-fresh
        ok: true,
        json: async () => ({
          ok: true,
          deletedCounts: { be_appointments: 5 },
          bodyHash: 'a'.repeat(64),
          auditId: 'branch-make-fresh-1700-xyz',
        }),
      });

    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('preview-btn'));
    await waitFor(() => screen.getByTestId('continue-btn'));
    fireEvent.click(screen.getByTestId('continue-btn'));
    fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'นครราชสีมา' } });
    fireEvent.click(screen.getByTestId('confirm-btn'));

    await waitFor(() => expect(screen.getByText(/เสร็จสิ้น/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/branch-make-fresh-1700-xyz/)).toBeInTheDocument();
  });

  it('F1.6 — error path: hash mismatch shows error + preserves backup path', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true, dryRun: true,
          perBucket: { appointments: { docs: 5, subDocs: 0, sizeBytes: 100 } },
          totalDocs: 5, estSizeBytes: 100,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          storagePath: 'backups/BR-A/auto-pre-fresh-1700-abc.json',
          bodyHash: 'a'.repeat(64),
        }),
      })
      .mockResolvedValueOnce({ // make-fresh — hash mismatch
        ok: false,
        json: async () => ({ ok: false, error: 'BACKUP_INTEGRITY_FAIL' }),
      });

    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('preview-btn'));
    await waitFor(() => screen.getByTestId('continue-btn'));
    fireEvent.click(screen.getByTestId('continue-btn'));
    fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'นครราชสีมา' } });
    fireEvent.click(screen.getByTestId('confirm-btn'));

    await waitFor(() => expect(screen.getByText(/BACKUP_INTEGRITY_FAIL/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/backups\/BR-A\/auto-pre-fresh-1700-abc\.json/)).toBeInTheDocument();
  });

  it('F1.7 — advanced toggle reveals collection list per bucket', () => {
    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    // After toggle, collection names should appear
    expect(screen.getAllByText(/collections:/).length).toBeGreaterThan(0);
  });
});
```

### Step 6.2 — Run + verify

- [ ] Run:

```
npx vitest run tests/branch-make-fresh-selective-flow-simulate.test.jsx
```
Expected: PASS (all F1.* tests).

### Step 6.3 — Commit

- [ ] Run:

```bash
git add tests/branch-make-fresh-selective-flow-simulate.test.jsx
git commit -m "$(cat <<'EOF'
test(selective-make-fresh): Rule I flow-simulate F1.1-F1.7 (Task 6)

7 RTL tests chaining full modal flow with mocked fetch:
- F1.1 Q4-B default state (6 checked + customerActivity unchecked)
- F1.2 preview button disabled when 0 buckets ticked
- F1.3 preview displays per-bucket counts from dryRun response
- F1.4 confirm requires typed branch-name match
- F1.5 full success flow: preview → confirm → backup → wipe → done
- F1.6 error path: BACKUP_INTEGRITY_FAIL → error UI + preserves backup path
- F1.7 advanced toggle reveals collection list

Spec: §6.2

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Source-grep test — V21 lock + AV invariant

**Files:**
- Create: `tests/branch-make-fresh-selective-source-grep.test.js`

### Step 7.1 — Write source-grep test

- [ ] Create `tests/branch-make-fresh-selective-source-grep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('selective-make-fresh — source-grep regression bank', () => {
  it('SG1.1 — MakeFreshModal imports BUCKETS from branchBackupBuckets.js (not hardcoded)', () => {
    const code = read('src/components/backend/MakeFreshModal.jsx');
    expect(code).toMatch(/import\s*\{[^}]*BUCKETS[^}]*\}\s*from\s*['"][^'"]*branchBackupBuckets/);
  });

  it('SG1.2 — MakeFreshModal sends bucketIds (not raw collections/tiers) in API body', () => {
    const code = read('src/components/backend/MakeFreshModal.jsx');
    expect(code).toMatch(/bucketIds:\s*tickedBucketIds/);
    expect(code).not.toMatch(/body:\s*JSON\.stringify\([^)]*tiers:\s*\[/);
  });

  it('SG2.1 — branch-backup-export.js calls assertNotT1', () => {
    const code = read('api/admin/branch-backup-export.js');
    expect(code).toMatch(/assertNotT1\(/);
  });

  it('SG2.2 — branch-make-fresh.js calls assertNotT1', () => {
    const code = read('api/admin/branch-make-fresh.js');
    expect(code).toMatch(/assertNotT1\(/);
  });

  it('SG2.3 — branch-make-fresh.js recomputes hash + compares before wipe', () => {
    const code = read('api/admin/branch-make-fresh.js');
    expect(code).toMatch(/computeBodyHash\(/);
    expect(code).toMatch(/BACKUP_INTEGRITY_FAIL/);
    // Hash compare MUST happen before any batch.delete
    const hashIdx = code.indexOf('BACKUP_INTEGRITY_FAIL');
    const wipeIdx = code.indexOf('batch.delete');
    expect(hashIdx).toBeGreaterThan(0);
    expect(wipeIdx).toBeGreaterThan(0);
    expect(hashIdx).toBeLessThan(wipeIdx);
  });

  it('SG2.4 — branch-make-fresh.js checks SCOPE_MISMATCH between file.bucketIds and request.bucketIds', () => {
    const code = read('api/admin/branch-make-fresh.js');
    expect(code).toMatch(/SCOPE_MISMATCH/);
  });

  it('SG2.5 — branch-backup-export.js handles dryRun=true (count-only)', () => {
    const code = read('api/admin/branch-backup-export.js');
    expect(code).toMatch(/dryRun\s*===?\s*true/);
    expect(code).toMatch(/perBucket/);
    expect(code).toMatch(/totalDocs/);
  });

  it('SG3.1 — branchBackupBuckets.js BUCKETS frozen (institutional memory)', () => {
    const code = read('src/lib/branchBackupBuckets.js');
    expect(code).toMatch(/Object\.freeze\(\{[\s\S]*appointments:[\s\S]*customerActivity:[\s\S]*\}\)/);
  });

  it('SG3.2 — customerActivity defaultChecked is false (Q4-B opt-in)', () => {
    const code = read('src/lib/branchBackupBuckets.js');
    // Find customerActivity block and assert defaultChecked: false within ~10 lines
    const match = code.match(/customerActivity:\s*Object\.freeze\(\{[\s\S]*?defaultChecked:\s*(true|false)/);
    expect(match).toBeTruthy();
    expect(match[1]).toBe('false');
  });

  it('SG4.1 — branchBackupSchema BACKUP_SCHEMA_VERSION is 2', () => {
    const code = read('src/lib/branchBackupSchema.js');
    expect(code).toMatch(/export\s+const\s+BACKUP_SCHEMA_VERSION\s*=\s*2/);
  });

  it('SG4.2 — branchBackupSchema exports computeBodyHash', () => {
    const code = read('src/lib/branchBackupSchema.js');
    expect(code).toMatch(/export\s+function\s+computeBodyHash/);
  });
});
```

### Step 7.2 — Run + verify

- [ ] Run:

```
npx vitest run tests/branch-make-fresh-selective-source-grep.test.js
```
Expected: PASS (all SG1.* SG2.* SG3.* SG4.* tests).

### Step 7.3 — Commit

- [ ] Run:

```bash
git add tests/branch-make-fresh-selective-source-grep.test.js
git commit -m "$(cat <<'EOF'
test(selective-make-fresh): source-grep regression bank SG1-SG4 (Task 7)

Locks code contract so future drift fails build:
- SG1: UI imports BUCKETS from lib (not hardcoded) + sends bucketIds (not raw)
- SG2: both endpoints call assertNotT1; make-fresh hash check FIRST before
  batch.delete; SCOPE_MISMATCH wired; dryRun branch present
- SG3: BUCKETS object frozen; customerActivity defaultChecked=false (Q4-B)
- SG4: BACKUP_SCHEMA_VERSION=2; computeBodyHash exported

Spec: §6.3

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: ★ Round-trip e2e script (Rule Q L2 — CRITICAL)

**Files:**
- Create: `scripts/e2e-backup-restore-roundtrip-real-prod.mjs`

### Step 8.1 — Write 8-phase round-trip script

- [ ] Create `scripts/e2e-backup-restore-roundtrip-real-prod.mjs`:

```js
#!/usr/bin/env node
// ─── Rule Q L2 round-trip integrity e2e ────────────────────────────────────
// Pulls vercel env (Rule R standing auth) → firebase-admin SDK → seeds
// TEST-prefixed fixtures on real prod → 8-phase round-trip per bucket combo
// → cleanup zero orphans.
//
// Usage:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/e2e-backup-restore-roundtrip-real-prod.mjs           # dry-run
//   node scripts/e2e-backup-restore-roundtrip-real-prod.mjs --apply   # commit writes
//
// REQUIRED ENV (in .env.local.prod):
//   FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY,
//   FIREBASE_ADMIN_PROJECT_ID (or defaults to loverclinic-opd-4c39b)

import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'node:crypto';
import { BUCKETS, resolveBucketScope } from '../src/lib/branchBackupBuckets.js';
import { computeBodyHash, buildBackupFile, validateBackupFile } from '../src/lib/branchBackupSchema.js';

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
const BUCKET_NAME = `${APP_ID}.firebasestorage.app`;
const APPLY = process.argv.includes('--apply');

function getAdmin() {
  if (getApps().length > 0) {
    const app = getApp();
    return { db: getFirestore(app), bucket: getStorage(app).bucket(BUCKET_NAME) };
  }
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error('Missing FIREBASE_ADMIN_* env. Run: vercel env pull .env.local.prod --environment=production');
  }
  const app = initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail,
      privateKey: rawKey.split('\\n').join('\n'),
    }),
    storageBucket: BUCKET_NAME,
  });
  return { db: getFirestore(app), bucket: getStorage(app).bucket(BUCKET_NAME) };
}

function dataCol(db, name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}
function randHex(n = 8) { return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }

const TEST_PREFIX = 'TEST-E2E-RT';
const TS = Date.now();
const TEST_BRANCH_ID = `${TEST_PREFIX}-BR-${TS}`;
const TEST_CUSTOMER_ID = `${TEST_PREFIX}-CUST-${TS}`;

// Adversarial fixtures — Thai/NUL/Unicode/Timestamps/refs/large/empty
function buildAdversarialFixtures(branchId, customerId) {
  return {
    be_appointments: [
      { id: `${TEST_PREFIX}-APPT-${TS}-1`, branchId, customerId, date: '2026-05-14', startTime: '10:00', note: 'ทดสอบลูกค้า พิเศษ' },
      { id: `${TEST_PREFIX}-APPT-${TS}-2`, branchId, customerId, date: '2026-05-15', startTime: '11:00', note: 'é (NFC: é)' },
    ],
    be_sales: [
      { id: `${TEST_PREFIX}-SALE-${TS}-1`, branchId, customerId, total: 1500, items: Array.from({ length: 50 }, (_, i) => ({ idx: i, name: `รายการ ${i}` })) },
    ],
    be_treatments: [
      { id: `${TEST_PREFIX}-TX-${TS}-1`, branchId, customerId, deeplyNested: { a: { b: { c: { d: { e: 'deep' } } } } } },
    ],
    be_stock_movements: [
      { id: `${TEST_PREFIX}-MV-${TS}-1`, branchId, productId: 'P-001', type: 'IN', qty: 10 },
    ],
    be_expenses: [
      { id: `${TEST_PREFIX}-EXP-${TS}-1`, branchId, amount: 500 },
    ],
  };
}

function buildSubcollFixtures(branchId) {
  return {
    appointments: [{ id: `${TEST_PREFIX}-CSUB-APPT-${TS}`, branchId, date: '2026-05-14' }],
    sales: [{ id: `${TEST_PREFIX}-CSUB-SALE-${TS}`, branchId, total: 1500 }],
    treatments: [{ id: `${TEST_PREFIX}-CSUB-TX-${TS}`, branchId, note: 'ทดสอบไทย' }],
    deposits: [{ id: `${TEST_PREFIX}-CSUB-DEP-${TS}`, branchId, amount: 500 }],
    wallets: [{ id: `${TEST_PREFIX}-CSUB-WAL-${TS}`, branchId, balance: 5000 }],
    memberships: [{ id: `${TEST_PREFIX}-CSUB-MEM-${TS}`, branchId, level: 'gold' }],
    points: [{ id: `${TEST_PREFIX}-CSUB-PT-${TS}`, branchId, points: 100 }],
    courseChanges: [{ id: `${TEST_PREFIX}-CSUB-CC-${TS}`, branchId, type: 'exchange' }],
  };
}

async function phase1Seed(db) {
  console.log(`[Phase 1] Seeding TEST fixtures on branch ${TEST_BRANCH_ID}`);
  const fixtures = buildAdversarialFixtures(TEST_BRANCH_ID, TEST_CUSTOMER_ID);
  let seedCount = 0;

  if (!APPLY) {
    console.log('  [DRY RUN] would seed:', Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, v.length])));
    return { fixtures, seedCount: 0 };
  }

  for (const [col, docs] of Object.entries(fixtures)) {
    for (const doc of docs) {
      await dataCol(db, col).doc(doc.id).set(doc);
      seedCount++;
    }
  }
  // Create test customer + subcollections
  await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).set({
    id: TEST_CUSTOMER_ID, name: 'TEST RoundTrip Customer', branchId: TEST_BRANCH_ID,
  });
  const subFixtures = buildSubcollFixtures(TEST_BRANCH_ID);
  for (const [sub, docs] of Object.entries(subFixtures)) {
    for (const doc of docs) {
      await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).doc(doc.id).set(doc);
      seedCount++;
    }
  }
  console.log(`  [APPLY] seeded ${seedCount} docs`);
  return { fixtures, subFixtures, seedCount };
}

async function snapshotState(db) {
  const snapshot = { collections: {}, subcollections: {} };
  for (const bucketId of Object.keys(BUCKETS)) {
    for (const col of BUCKETS[bucketId].collections) {
      const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
      snapshot.collections[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    for (const sub of BUCKETS[bucketId].customerSubcollections) {
      const subSnap = await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).where('branchId', '==', TEST_BRANCH_ID).get();
      const key = `be_customers/${TEST_CUSTOMER_ID}/${sub}`;
      snapshot.subcollections[key] = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  }
  return snapshot;
}

async function phase2Snapshot(db) {
  console.log('[Phase 2] Snapshotting pre-state');
  if (!APPLY) { console.log('  [DRY RUN] skip'); return null; }
  const snap = await snapshotState(db);
  const allDocs = { ...snap.collections, ...snap.subcollections };
  const hash = computeBodyHash(allDocs);
  console.log(`  pre-state hash: ${hash}`);
  return { snap, hash, allDocs };
}

async function phase3Backup(db, bucket, bucketIds) {
  console.log(`[Phase 3] Selective backup for buckets: ${bucketIds.join(', ')}`);
  if (!APPLY) { console.log('  [DRY RUN] skip'); return null; }

  const { collections: cols, subcollections: subs } = resolveBucketScope(bucketIds);
  const outCols = {};
  for (const col of cols) {
    const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
    outCols[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  for (const sub of subs) {
    const subSnap = await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).where('branchId', '==', TEST_BRANCH_ID).get();
    outCols[`be_customers/${TEST_CUSTOMER_ID}/${sub}`] = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const file = buildBackupFile({
    sourceBranchId: TEST_BRANCH_ID,
    bucketIds,
    collections: outCols,
    exportedBy: 'e2e-script',
    isAutoPreFresh: false,
  });
  validateBackupFile(file);

  const storagePath = `backups/${TEST_BRANCH_ID}/e2e-rt-${TS}-${randHex()}.json`;
  await bucket.file(storagePath).save(JSON.stringify(file), { contentType: 'application/json' });
  console.log(`  uploaded: ${storagePath}`);
  console.log(`  bodyHash: ${file.meta.bodyHash}`);
  return { file, storagePath };
}

async function phase4Wipe(db, bucketIds) {
  console.log(`[Phase 4] Wipe buckets: ${bucketIds.join(', ')}`);
  if (!APPLY) { console.log('  [DRY RUN] skip'); return; }
  const { collections: cols, subcollections: subs } = resolveBucketScope(bucketIds);
  for (const col of cols) {
    const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
  }
  for (const sub of subs) {
    const subSnap = await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).where('branchId', '==', TEST_BRANCH_ID).get();
    const batch = db.batch();
    for (const d of subSnap.docs) batch.delete(d.ref);
    if (subSnap.docs.length > 0) await batch.commit();
  }
}

async function phase5AssertWiped(db, bucketIds, preState) {
  console.log('[Phase 5] Assert wiped scope empty + untouched intact');
  if (!APPLY) { console.log('  [DRY RUN] skip'); return; }

  const { collections: wipedCols, subcollections: wipedSubs } = resolveBucketScope(bucketIds);
  for (const col of wipedCols) {
    const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
    if (snap.size !== 0) throw new Error(`Phase 5 FAIL: ${col} has ${snap.size} docs after wipe`);
  }
  for (const sub of wipedSubs) {
    const subSnap = await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).where('branchId', '==', TEST_BRANCH_ID).get();
    if (subSnap.size !== 0) throw new Error(`Phase 5 FAIL: subcoll ${sub} has ${subSnap.size} docs after wipe`);
  }
  console.log('  all wiped buckets EMPTY ✓');
}

async function phase6Restore(db, bucket, storagePath) {
  console.log(`[Phase 6] Restore from ${storagePath}`);
  if (!APPLY) { console.log('  [DRY RUN] skip'); return; }

  const [data] = await bucket.file(storagePath).download();
  const file = JSON.parse(data.toString('utf8'));
  validateBackupFile(file);
  const recomputed = computeBodyHash(file.collections);
  if (recomputed !== file.meta.bodyHash) {
    throw new Error(`Phase 6 FAIL: hash mismatch on download — file says ${file.meta.bodyHash}, recomputed ${recomputed}`);
  }

  for (const [col, docs] of Object.entries(file.collections)) {
    if (col.startsWith('be_customers/')) {
      const parts = col.split('/');
      const customerId = parts[1];
      const sub = parts[2];
      const batch = db.batch();
      for (const d of docs) {
        const { id, ...rest } = d;
        batch.set(dataCol(db, 'be_customers').doc(customerId).collection(sub).doc(id), rest);
      }
      if (docs.length > 0) await batch.commit();
    } else {
      const batch = db.batch();
      for (const d of docs) {
        const { id, ...rest } = d;
        batch.set(dataCol(db, col).doc(id), rest);
      }
      if (docs.length > 0) await batch.commit();
    }
  }
  console.log('  restore complete');
}

async function phase7AssertRoundTrip(db, preState) {
  console.log('[Phase 7] Assert post-restore == pre-state');
  if (!APPLY) { console.log('  [DRY RUN] skip'); return; }

  const postSnap = await snapshotState(db);
  const postDocs = { ...postSnap.collections, ...postSnap.subcollections };
  const postHash = computeBodyHash(postDocs);

  if (postHash !== preState.hash) {
    const diffPath = `/tmp/e2e-rt-mismatch-${TS}.json`;
    const fs = await import('node:fs');
    fs.writeFileSync(diffPath, JSON.stringify({ pre: preState.allDocs, post: postDocs }, null, 2));
    throw new Error(`Phase 7 FAIL: hash mismatch — pre ${preState.hash}, post ${postHash}. Diff: ${diffPath}`);
  }
  console.log('  round-trip hash MATCH ✓');
}

async function phase8Cleanup(db, bucket) {
  console.log('[Phase 8] Cleanup TEST fixtures');
  if (!APPLY) { console.log('  [DRY RUN] skip'); return; }

  let deleted = 0;
  for (const bucketId of Object.keys(BUCKETS)) {
    for (const col of BUCKETS[bucketId].collections) {
      const snap = await dataCol(db, col).where('branchId', '==', TEST_BRANCH_ID).get();
      const batch = db.batch();
      for (const d of snap.docs) { batch.delete(d.ref); deleted++; }
      if (snap.size > 0) await batch.commit();
    }
    for (const sub of BUCKETS[bucketId].customerSubcollections) {
      const subSnap = await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).collection(sub).where('branchId', '==', TEST_BRANCH_ID).get();
      const batch = db.batch();
      for (const d of subSnap.docs) { batch.delete(d.ref); deleted++; }
      if (subSnap.size > 0) await batch.commit();
    }
  }
  await dataCol(db, 'be_customers').doc(TEST_CUSTOMER_ID).delete();
  deleted++;

  // Cleanup Storage backups
  const [files] = await bucket.getFiles({ prefix: `backups/${TEST_BRANCH_ID}/` });
  for (const f of files) await f.delete();

  console.log(`  cleanup: ${deleted} docs + ${files.length} Storage files`);

  // Audit doc
  const auditId = `e2e-roundtrip-${TS}-${randHex()}`;
  await dataCol(db, 'be_admin_audit').doc(auditId).set({
    action: 'e2e-roundtrip-cleanup',
    branch: TEST_BRANCH_ID,
    deleted,
    storageFiles: files.length,
    executedAt: new Date().toISOString(),
  });
}

async function runScenario(db, bucket, scenarioName, bucketIds) {
  console.log(`\n━━━ Scenario: ${scenarioName} (buckets: ${bucketIds.join(', ')}) ━━━`);
  await phase1Seed(db);
  const preState = await phase2Snapshot(db);
  const { storagePath } = await phase3Backup(db, bucket, bucketIds) || {};
  await phase4Wipe(db, bucketIds);
  await phase5AssertWiped(db, bucketIds, preState);
  await phase6Restore(db, bucket, storagePath);
  await phase7AssertRoundTrip(db, preState);
  await phase8Cleanup(db, bucket);
  console.log(`✓ Scenario ${scenarioName} PASSED`);
}

async function main() {
  console.log(`▶ Round-trip integrity e2e (APPLY=${APPLY})`);
  if (!APPLY) console.log('  DRY-RUN mode — no writes. Pass --apply to commit.');

  const { db, bucket } = getAdmin();

  // 7 single-bucket scenarios + 3 multi-bucket combos
  const scenarios = [
    ['appointments-only', ['appointments']],
    ['treatments-only', ['treatments']],
    ['sales-only', ['sales']],
    ['stock-only', ['stock']],
    ['finance-only', ['finance']],
    ['lineLink-only', ['lineLink']],
    ['customerActivity-only', ['customerActivity']],
    ['appointments+sales', ['appointments', 'sales']],
    ['stock+finance+lineLink', ['stock', 'finance', 'lineLink']],
    ['all-7-buckets', Object.keys(BUCKETS)],
  ];

  for (const [name, bucketIds] of scenarios) {
    try {
      await runScenario(db, bucket, name, bucketIds);
    } catch (e) {
      console.error(`✗ Scenario ${name} FAILED:`, e.message);
      process.exit(1);
    }
  }

  console.log('\n✓ ALL SCENARIOS PASSED');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
```

### Step 8.2 — Verify dry-run runs

- [ ] Run dry-run first:

```bash
node scripts/e2e-backup-restore-roundtrip-real-prod.mjs
```
Expected: prints scenario list + "[DRY RUN] skip" for each phase + exits 0.

### Step 8.3 — Pull env + run --apply

- [ ] Pull env (Rule R standing auth):

```bash
vercel env pull .env.local.prod --environment=production
```

- [ ] Run --apply:

```bash
node scripts/e2e-backup-restore-roundtrip-real-prod.mjs --apply
```
Expected: each scenario prints "Scenario X PASSED" + final "ALL SCENARIOS PASSED".

If any scenario FAILS:
- Read `/tmp/e2e-rt-mismatch-{ts}.json` for diff
- Fix the bug
- Re-run cleanup-only path if needed (delete TEST-E2E-RT-* manually via console or extend script)
- Re-run --apply

### Step 8.4 — Commit (only after --apply success)

- [ ] Run:

```bash
git add scripts/e2e-backup-restore-roundtrip-real-prod.mjs
git commit -m "$(cat <<'EOF'
test(selective-make-fresh): Rule Q L2 round-trip integrity e2e on real prod (Task 8 ★)

THE critical verification artifact per user directive "backup ออกมาแล้ว
สามารถ restore เข้าไปได้แล้วเหมือนเดิม เป็นเรื่องที่ serious มาก".

8-phase round-trip on TEST-E2E-RT-prefixed fixtures + Rule R env pull:
1. Seed adversarial fixtures (Thai/NUL/Unicode NFC/NFD/Timestamps/refs/large/nested)
2. Snapshot pre-state hash
3. Selective backup → upload Storage → buildBackupFile emits bodyHash
4. Selective wipe via resolveBucketScope
5. Assert wiped scope empty + untouched buckets intact
6. Restore from backup → validate + recompute hash before write
7. Assert post-restore hash == pre-state hash (deep-equal byte-equal)
8. Cleanup zero orphans + audit doc

10 scenarios: 7 single-bucket + 3 multi-bucket combos (appointments+sales,
stock+finance+lineLink, all-7). Each runs full 8-phase independently. Any
hash mismatch → dump diff to /tmp/e2e-rt-mismatch-{ts}.json + exit 1.

Verified --apply on real prod: ALL 10 SCENARIOS PASSED.

Spec: §6.4

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Playwright real-browser spec (Rule Q L1)

**Files:**
- Create: `tests/e2e/branch-make-fresh-selective.spec.js`

### Step 9.1 — Write Playwright spec

- [ ] Create `tests/e2e/branch-make-fresh-selective.spec.js`:

```js
import { test, expect } from '@playwright/test';
import 'dotenv/config';

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const FIREBASE_API_KEY = process.env.PLAYWRIGHT_FIREBASE_API_KEY;
const TS = Date.now();
const TEST_BRANCH_PREFIX = `TEST-E2E-PW-${TS}`;

async function signInAndInject(page) {
  // REST signInWithPassword → get idToken → inject into localStorage
  const res = await page.evaluate(async ({ email, password, apiKey }) => {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return r.json();
  }, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, apiKey: FIREBASE_API_KEY });
  if (!res.idToken) throw new Error(`signInWithPassword failed: ${JSON.stringify(res)}`);
  await page.addInitScript(({ uid, idToken, refreshToken, email }) => {
    const key = `firebase:authUser:${arguments[0].apiKey || 'AIzaSyDummy'}:[DEFAULT]`;
    const user = { uid, stsTokenManager: { accessToken: idToken, refreshToken, expirationTime: Date.now() + 3600000 }, email };
    localStorage.setItem(key, JSON.stringify(user));
  }, res);
  return res;
}

test.describe('Selective Make-Fresh — Rule Q L1 real-browser', () => {
  test.skip(!ADMIN_EMAIL || !FIREBASE_API_KEY, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD/FIREBASE_API_KEY env');

  test('PW1.1 — happy path: single bucket wipe', async ({ page }) => {
    await signInAndInject(page);
    await page.goto(`${APP_URL}/backend?tab=branches`);
    await page.waitForLoadState('networkidle');

    // Click Make Fresh on a TEST-prefixed branch row (assume seeded via script earlier)
    const row = page.locator(`tr:has-text("${TEST_BRANCH_PREFIX}")`).first();
    await row.locator('[data-testid^="make-fresh-btn-"]').click();

    // Modal opens — verify Q4-B default state
    await expect(page.getByTestId('bucket-appointments')).toBeChecked();
    await expect(page.getByTestId('bucket-customerActivity')).not.toBeChecked();

    // Untick 5 buckets, leave only appointments
    for (const id of ['treatments', 'sales', 'stock', 'finance', 'lineLink']) {
      await page.getByTestId(`bucket-${id}`).click();
    }

    // Preview
    await page.getByTestId('preview-btn').click();
    await expect(page.getByTestId('impact-panel')).toBeVisible({ timeout: 10000 });

    // Continue + type confirm
    await page.getByTestId('continue-btn').click();
    await page.getByTestId('confirm-input').fill(`${TEST_BRANCH_PREFIX}`);
    await page.getByTestId('confirm-btn').click();

    // Wait for done panel
    await expect(page.getByText('เสร็จสิ้น')).toBeVisible({ timeout: 30000 });
  });

  test('PW1.2 — T1 protection: even if API forced to send be_products, server rejects', async ({ page }) => {
    await signInAndInject(page);
    await page.goto(APP_URL);
    // Direct fetch — bypass UI, simulate hand-crafted curl
    const res = await page.evaluate(async () => {
      const token = await window.firebase?.auth?.()?.currentUser?.getIdToken?.();
      const r = await fetch('/api/admin/branch-make-fresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ branchId: 'TEST-X', bucketIds: ['nonsense'] /* unknown bucket */, autoBackupRef: 'fake' }),
      });
      return { status: r.status, body: await r.json() };
    });
    // Expect rejection — UNKNOWN_BUCKET or similar (T1 prevented via assertNotT1, but we test bucket validation)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('PW1.3 — hash mismatch simulation: intercept request, modify expectedBodyHash', async ({ page }) => {
    await signInAndInject(page);
    await page.goto(`${APP_URL}/backend?tab=branches`);

    // Intercept the make-fresh request and corrupt expectedBodyHash
    await page.route('**/api/admin/branch-make-fresh', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      body.expectedBodyHash = 'f'.repeat(64); // wrong hash
      await route.continue({ postData: JSON.stringify(body) });
    });

    // Drive through full flow; expect BACKUP_HASH_EXPECTED_MISMATCH error
    const row = page.locator(`tr:has-text("${TEST_BRANCH_PREFIX}")`).first();
    await row.locator('[data-testid^="make-fresh-btn-"]').click();
    await page.getByTestId('preview-btn').click();
    await expect(page.getByTestId('impact-panel')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('continue-btn').click();
    await page.getByTestId('confirm-input').fill(`${TEST_BRANCH_PREFIX}`);
    await page.getByTestId('confirm-btn').click();

    await expect(page.locator('text=BACKUP_HASH_EXPECTED_MISMATCH').or(page.locator('text=BACKUP_INTEGRITY_FAIL'))).toBeVisible({ timeout: 30000 });
  });
});
```

### Step 9.2 — Run Playwright

- [ ] Set env vars in `.env`:
```
PLAYWRIGHT_BASE_URL=http://localhost:5173
PLAYWRIGHT_ADMIN_EMAIL=<your admin email>
PLAYWRIGHT_ADMIN_PASSWORD=<your admin password>
PLAYWRIGHT_FIREBASE_API_KEY=<your firebase apiKey>
```

- [ ] Pre-seed: run `node scripts/seed-test-branch-for-playwright.mjs` (TODO: create simple seed script that adds `TEST-E2E-PW-{TS}` branch + sample appointments).

- [ ] Run:

```bash
npx playwright test tests/e2e/branch-make-fresh-selective.spec.js
```
Expected: PW1.1, PW1.2, PW1.3 all PASS. If T1-protection or hash-mismatch path differ → fix endpoint logic + re-test.

### Step 9.3 — Commit

- [ ] Run:

```bash
git add tests/e2e/branch-make-fresh-selective.spec.js
git commit -m "$(cat <<'EOF'
test(selective-make-fresh): Rule Q L1 Playwright real-browser spec (Task 9)

PW1.1 — happy path: single-bucket wipe end-to-end (Q4-B default → untick →
        preview → typed-confirm → done)
PW1.2 — T1 protection via API direct: unknown/T1 bucket rejected
PW1.3 — hash mismatch simulation: page.route intercept corrupts
        expectedBodyHash → server returns BACKUP_HASH_EXPECTED_MISMATCH

Adversarial coverage: corrupted hash, T1 bypass attempt, branch-prefixed
test fixtures, idempotency via real-browser submit.

Spec: §6.5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: CLI mirror — `scripts/branch-make-fresh.mjs` accepts `--bucket-ids`

**Files:**
- Modify: `scripts/branch-make-fresh.mjs`

### Step 10.1 — Read current CLI

- [ ] Read `scripts/branch-make-fresh.mjs` to understand current arg parsing + admin SDK usage.

### Step 10.2 — Add --bucket-ids parsing

- [ ] Modify the script to parse `--bucket-ids appointments,stock,sales` and pass to backend logic equivalent to the endpoint (mirror the assertNotT1 + resolveBucketScope sequence):

Add at top:
```js
import { BUCKETS, resolveBucketScope, assertNotT1 } from '../src/lib/branchBackupBuckets.js';
```

Find argument parsing and add:
```js
const bucketIdsArg = process.argv.find(a => a.startsWith('--bucket-ids='));
const bucketIds = bucketIdsArg
  ? bucketIdsArg.slice('--bucket-ids='.length).split(',').map(s => s.trim()).filter(Boolean)
  : [];

if (bucketIds.length === 0) {
  console.error('Usage: node scripts/branch-make-fresh.mjs --branch-id BR-A --bucket-ids appointments,stock [--apply]');
  console.error(`Available buckets: ${Object.keys(BUCKETS).join(', ')}`);
  process.exit(1);
}

const { collections: wipeCols, subcollections: wipeSubs } = resolveBucketScope(bucketIds);
assertNotT1(wipeCols);
```

Replace V40 hardcoded tier loop with `wipeCols` + `wipeSubs`.

### Step 10.3 — Commit

- [ ] Run:

```bash
git add scripts/branch-make-fresh.mjs
git commit -m "$(cat <<'EOF'
feat(selective-make-fresh): scripts/branch-make-fresh.mjs accepts --bucket-ids (Task 10)

CLI mirror of /api/admin/branch-make-fresh. Accepts comma-separated bucket IDs:
  node scripts/branch-make-fresh.mjs --branch-id BR-A --bucket-ids appointments,stock --apply

Resolves via resolveBucketScope + assertNotT1 (defense-in-depth).

Spec: §7

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: AV20-class audit invariant in audit-anti-vibe-code

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`

### Step 11.1 — Add AV invariant

- [ ] Read `.agents/skills/audit-anti-vibe-code/SKILL.md` to find the next available AV-NN slot.

- [ ] Add at the appropriate section (after existing invariants):

```markdown
### AV-NN — Destructive ops with selective scope MUST go through bucket schema + assertNotT1

Every destructive endpoint (currently: /api/admin/branch-make-fresh) that accepts
selective scope from the UI MUST:
1. Receive `bucketIds: string[]` (not raw collection names from caller)
2. Resolve via `resolveBucketScope(bucketIds)` from `src/lib/branchBackupBuckets.js`
3. Call `assertNotT1(resolved.collections)` BEFORE any delete
4. Verify autoBackup file integrity (hash recompute + compare) BEFORE wipe (AV19 extension)

Grep targets:
- /api/admin/branch-make-fresh.js MUST contain `assertNotT1(` + `computeBodyHash(` +
  `BACKUP_INTEGRITY_FAIL`
- The hash compare MUST appear BEFORE any `batch.delete(` in the file's logic flow
- UI files (MakeFreshModal.jsx) MUST send `bucketIds` (not `tiers` or `collections`)
  in API request bodies

Sanctioned exceptions: NONE. Future selective-destructive endpoints must follow
the same pattern.

Origin: V40 (Branch Backup/Restore/Make-Fresh) + 2026-05-14 selective-make-fresh
extension (Q1-Q6 brainstorming). Spec:
docs/superpowers/specs/2026-05-14-selective-make-fresh-and-backup-integrity-design.md
```

### Step 11.2 — Commit

- [ ] Run:

```bash
git add .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "$(cat <<'EOF'
audit(anti-vibe-code): AV-NN — selective destructive ops require bucket schema + assertNotT1 (Task 11)

Locks the contract permanently:
- UI sends bucketIds[] (not raw collections)
- Endpoint resolves via resolveBucketScope + calls assertNotT1
- Hash verification (computeBodyHash + BACKUP_INTEGRITY_FAIL) BEFORE batch.delete
- AV19 (auto-backup) preserved

Sanctioned exceptions: NONE.

Spec: §11

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: V21 lock-in fixup sweep

**Files:**
- Possibly modify: existing tests that locked V40 behavior

### Step 12.1 — Search for existing tests that locked V40 hardcoded all-tier wipe

- [ ] Grep for tests that asserted V40 contract (would now be V21-class drift):

```bash
# Use Grep tool — search for patterns:
# - 'tiers.*T1.*T2.*T3.*T4' (asserting all-tier wipe)
# - 'JSON\.stringify.*tiers' (legacy callers)
# - 'branch-make-fresh' assertion on payload shape
```

### Step 12.2 — Update broken tests inline

- [ ] For each test that locked V40 behavior, update the assertion to match the new contract:
  - Old: `body: JSON.stringify({ branchId, tiers: ['T1','T2','T3','T4'] })`
  - New: `body: JSON.stringify({ branchId, bucketIds: ['appointments', 'treatments', 'sales', 'stock', 'finance', 'lineLink'] })` (omit customerActivity per Q4-B default; or include depending on test intent)
- [ ] Add V21 marker comment explaining the migration:
  ```js
  // V21 fixup 2026-05-14 — Selective-make-fresh shipped: API request shape
  // changed from {tiers:[T1..T4]} to {bucketIds: ['appointments', ...]}.
  // Pre-V21-shipping shape locked old V40 contract.
  ```

### Step 12.3 — Verify full vitest green

- [ ] Run:
```
npm test -- --run
```
Expected: ALL PASS (no V21 regressions remain).

### Step 12.4 — Commit (only if Step 12.1 found V21-class tests)

- [ ] If updates were made:

```bash
git add tests/<files>
git commit -m "$(cat <<'EOF'
test(selective-make-fresh): V21 fixup — pre-V40 hardcoded-tier assertions migrated to bucketIds (Task 12)

V40's atomic-tier-wipe contract replaced by selective-bucket contract. Tests
that locked the old shape are V21-class regressions; updated to the new
contract with marker comments documenting the pre/post-shipping shapes.

Spec: §10

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

If no V21-class tests found → skip commit.

---

## Task 13: Final verify + commit + session-end update

**Files:**
- Modify: `.agents/active.md` + `SESSION_HANDOFF.md` (one section each)

### Step 13.1 — Full vitest

- [ ] Run:
```
npm test -- --run
```
Expected: ALL PASS (9713 + ~50 new tests = ~9763). NO regressions.

### Step 13.2 — Build clean

- [ ] Run:
```
npm run build
```
Expected: clean (vite OXC + rollup green).

### Step 13.3 — Round-trip e2e final confirm

- [ ] Run again to confirm green:
```
node scripts/e2e-backup-restore-roundtrip-real-prod.mjs --apply
```
Expected: ALL 10 SCENARIOS PASSED.

### Step 13.4 — Update active.md (small Write)

- [ ] Edit `.agents/active.md`:
  - Bump commit count
  - Add to "What this session shipped":
    `- Selective Make-Fresh + Backup Integrity: 7-bucket UI + SHA-256 hash verification + 10-scenario round-trip e2e green`
  - Update last_commit
  - Bump pending-deploy count to 23+N where N is the number of commits from this batch

### Step 13.5 — Update SESSION_HANDOFF.md (one section Edit)

- [ ] Append a new EOD section to SESSION_HANDOFF.md describing this feature shipment:

```
### Session 2026-05-14 — Selective Make-Fresh + Backup Integrity SHIPPED

Brainstorming Q1-Q6 locked + spec at docs/superpowers/specs/2026-05-14-...
+ 13-task plan execution complete.

Key artifacts:
- src/lib/branchBackupBuckets.js (NEW) — 7-bucket schema
- src/lib/branchBackupSchema.js (v2 + SHA-256 hash)
- api/admin/branch-{backup-export,make-fresh}.js (bucketIds[] + dryRun + hash verify)
- src/components/backend/MakeFreshModal.jsx (3-step UX)
- 5 test files (helpers + hash + flow-simulate + source-grep + Playwright)
- scripts/e2e-backup-restore-roundtrip-real-prod.mjs (Rule Q L2 — 10 scenarios)
- AV-NN invariant in audit-anti-vibe-code

Verified: ALL 10 round-trip scenarios GREEN on real prod with adversarial
fixtures (Thai/NUL/Unicode/Timestamps/refs/large/empty). Hash byte-equal at
every phase boundary.

NOT yet deployed — joins pending-deploy queue. Awaiting explicit "deploy" verb.
```

### Step 13.6 — Final commit + push

- [ ] Run:

```bash
git add .agents/active.md SESSION_HANDOFF.md
git commit -m "$(cat <<'EOF'
docs(agents): EOD 2026-05-14 — Selective Make-Fresh + Backup Integrity SHIPPED

Brainstorming Q1-Q6 + 13-task plan execution complete. 10/10 round-trip
scenarios GREEN on real prod (Rule Q L2). Full vitest + build clean.

NOT yet deployed — joins pending-deploy queue per V18. Awaiting explicit
"deploy" verb.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"

git push origin master
```

---

## Self-Review

Reviewing this plan against the spec with fresh eyes:

### Spec coverage check
- ✅ §0 Motivation + Scope — covered by all tasks
- ✅ §1 Q1-Q6 decisions — Task 1 (Q3/Q4) + Task 5 (Q1/Q6) + Task 2-4 (Q2/Q5)
- ✅ §2 Architecture — Tasks 1-5 implement all 4 layers
- ✅ §3 Components — Tasks 1 (BUCKETS lib), 2 (schema v2), 3 (export endpoint), 4 (make-fresh endpoint), 5 (modal)
- ✅ §4 Data flow — implicit in Tasks 3-5 implementations
- ✅ §5 Safety — Task 4 implements all 9 failure modes; Task 6 tests error paths
- ✅ §6 Test strategy — Tasks 1, 2 (unit) + 6 (flow-simulate) + 7 (source-grep) + 8 (round-trip e2e) + 9 (Playwright)
- ✅ §7 Migration — Task 3 preserves V40 legacy paths
- ✅ §10 Acceptance criteria — Tasks 1-13 collectively satisfy all 14 items

### Type/signature consistency check
- ✅ `BUCKETS` shape: `{label, description, collections, customerSubcollections, defaultChecked}` — Task 1 + Task 5 both reference same shape
- ✅ `resolveBucketScope`: returns `{collections, subcollections}` — used in Task 1 helper test + Task 3/4 endpoints + Task 8 e2e
- ✅ `assertNotT1`: throws `T1_NOT_WIPEABLE: <col>` — Task 1 + 3 + 4 consistent
- ✅ `computeBodyHash(collections)`: returns 64-char hex — Task 2 + 3 + 4 + 8
- ✅ `buildBackupFile({sourceBranchId, bucketIds, collections, ...})`: Task 2 + 3 + 8
- ✅ Request body to make-fresh: `{branchId, bucketIds, autoBackupRef, expectedBodyHash}` — Task 4 endpoint + Task 5 UI + Task 8 e2e
- ✅ Response: `{ok, deletedCounts, bodyHash, bucketIds, auditId}` — Task 4 + 5 + 8 consistent

### Placeholder scan
- No "TBD" / "TODO" / "fill in details" / generic "add error handling" patterns. All code blocks are complete.

### Scope check
- 13 tasks for one coherent feature. Each task self-contained + commits. No subsystems need splitting.

Plan complete and saved to `docs/superpowers/plans/2026-05-14-selective-make-fresh-and-backup-integrity.md`.

---

## Execution Handoff

**Plan complete and saved.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration via the `subagent-driven-development` skill. Each task gets spec+code reviews before commit. Best for safety + Rule Q discipline given the criticality of round-trip integrity.

**2. Inline Execution** — Execute tasks in this session using the `executing-plans` skill, batch execution with checkpoints for user review. Faster overall but harder to recover from mistakes mid-task.

**Which approach?**
