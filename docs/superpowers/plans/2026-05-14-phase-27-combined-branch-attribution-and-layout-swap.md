# Phase 27 Combined Implementation Plan — branchId resolution (27.0) + TFP layout swap (27.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 27.0 (treatment doc gets branchId stamped + doctor/assistant/branch names live-resolved at render — never raw `DOC-...` ID leak) AND Phase 27.1 (TFP split-screen layout swap with localStorage persistence) in ONE coherent commit batch + combined V15 deploy.

**Architecture:**
- **27.0**: 3-layer fix — TFP submit stamps `branchId` from `useSelectedBranch` + NEW pure JS `treatmentDisplayResolvers.js` (live `be_doctors`/`be_staff`/`be_branches` Map lookup → cache → empty, never raw ID — mirror of Rule O for productName) + audit invariant AV42 + Rule M migration script using `customer.branchId` heuristic.
- **27.1**: Reusable `useLayoutPreference(key)` hook + floating `LayoutSwapButton` (44px target, click-through wrapper) + 3-line TFP integration applying `lg:flex-row-reverse` for CSS-only visual swap that preserves DOM tab order.

**Tech Stack:** React 19 + Vite 8 + Tailwind 3.4 + Vitest 4.1 + `@fast-check/vitest@0.4` + firebase-admin SDK (for migration).

**Specs:**
- [Phase 27.0](docs/superpowers/specs/2026-05-14-treatment-branch-id-and-name-resolution-design.md)
- [Phase 27.1](docs/superpowers/specs/2026-05-14-tfp-layout-swap-design.md)

---

## File Structure

### NEW files
- `src/lib/treatmentDisplayResolvers.js` — pure JS resolvers (~80 LOC) — Phase 27.0
- `src/hooks/useLayoutPreference.js` — reusable React hook (~50 LOC) — Phase 27.1
- `src/components/LayoutSwapButton.jsx` — floating swap button (~50 LOC) — Phase 27.1
- `scripts/phase-27-0-backfill-treatment-branch-id.mjs` — Rule M migration — Phase 27.0
- `scripts/e2e-phase-27-0-treatment-branch-resolution.mjs` — live e2e — Phase 27.0
- 8 NEW test files (V55 methodology across both phases)

### MODIFIED files
- `src/components/TreatmentFormPage.jsx` — write-side branchId stamping (Phase 27.0) + layout-swap integration (Phase 27.1)
- `src/components/backend/TreatmentReadOnlyMirror.jsx` — resolver migration (Phase 27.0)
- `src/components/backend/TreatmentReadOnlyPanel.jsx` — resolver migration (Phase 27.0)
- `src/components/backend/EditAttributionModal.jsx` — add branchId field (Phase 27.0)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV42 entry (Phase 27.0)

---

# PHASE 27.0 TASKS (Tier 1: write-time + read-time + audit + migration)

## Task 1: Create treatmentDisplayResolvers helper module (TDD)

**Files:**
- Test: `tests/phase-27-0-treatment-display-resolvers.test.js`
- Create: `src/lib/treatmentDisplayResolvers.js`

- [ ] **Step 1.1: Write failing tests**

`tests/phase-27-0-treatment-display-resolvers.test.js`:

```js
// V27.0 unit — treatmentDisplayResolvers
// Tests: 4 helpers × fallback chain × adversarial inputs

import { describe, it, expect } from 'vitest';
import {
  resolveDoctorDisplayName,
  resolveAssistantDisplayName,
  resolveBranchDisplayName,
  resolveAssistantsDisplay,
} from '../src/lib/treatmentDisplayResolvers.js';

describe('R1 — resolveDoctorDisplayName', () => {
  it('R1.1 returns live name when doctorMap has id', () => {
    const map = new Map([['DOC-1', { name: 'Dr. Foo' }]]);
    expect(resolveDoctorDisplayName('DOC-1', map, 'cached')).toBe('Dr. Foo');
  });
  it('R1.2 falls back to cachedName when map missing entry', () => {
    const map = new Map();
    expect(resolveDoctorDisplayName('DOC-1', map, 'cached')).toBe('cached');
  });
  it('R1.3 falls back to cachedName when map is null', () => {
    expect(resolveDoctorDisplayName('DOC-1', null, 'cached')).toBe('cached');
  });
  it('R1.4 returns empty when map missing AND cachedName empty', () => {
    expect(resolveDoctorDisplayName('DOC-1', new Map(), '')).toBe('');
  });
  it('R1.5 NEVER returns the raw doctorId (Rule O class mirror)', () => {
    expect(resolveDoctorDisplayName('DOC-mov2p9c0', new Map(), '')).not.toContain('DOC-');
    expect(resolveDoctorDisplayName('DOC-mov2p9c0', new Map(), '')).toBe('');
  });
  it('R1.6 trims live name + cached name', () => {
    const map = new Map([['DOC-1', { name: '  Dr. Foo  ' }]]);
    expect(resolveDoctorDisplayName('DOC-1', map, '')).toBe('Dr. Foo');
    expect(resolveDoctorDisplayName('DOC-2', new Map(), '  cached  ')).toBe('cached');
  });
  it('R1.7 handles whitespace-only live name → falls through to cached', () => {
    const map = new Map([['DOC-1', { name: '   ' }]]);
    expect(resolveDoctorDisplayName('DOC-1', map, 'cached-fallback')).toBe('cached-fallback');
  });
  it('R1.8 handles non-string cached name → returns empty', () => {
    expect(resolveDoctorDisplayName('DOC-1', new Map(), 123)).toBe('');
    expect(resolveDoctorDisplayName('DOC-1', new Map(), null)).toBe('');
    expect(resolveDoctorDisplayName('DOC-1', new Map(), { name: 'x' })).toBe('');
  });
});

describe('R2 — resolveAssistantDisplayName', () => {
  it('R2.1 resolves entry={id} via doctorMap first', () => {
    const doctorMap = new Map([['DOC-1', { name: 'Dr. Foo' }]]);
    const staffMap = new Map([['DOC-1', { name: 'WRONG' }]]);
    expect(resolveAssistantDisplayName({ id: 'DOC-1' }, doctorMap, staffMap)).toBe('Dr. Foo');
  });
  it('R2.2 falls back to staffMap when doctorMap missing', () => {
    const staffMap = new Map([['STAFF-1', { name: 'Asst. Bar' }]]);
    expect(resolveAssistantDisplayName({ id: 'STAFF-1' }, new Map(), staffMap)).toBe('Asst. Bar');
  });
  it('R2.3 falls back to entry.name cache when both maps miss', () => {
    expect(resolveAssistantDisplayName({ id: 'X', name: 'cached' }, new Map(), new Map())).toBe('cached');
  });
  it('R2.4 returns empty when entry is just a string id with no map hit', () => {
    expect(resolveAssistantDisplayName('STAFF-1', new Map(), new Map())).toBe('');
  });
  it('R2.5 returns empty for null/undefined entry', () => {
    expect(resolveAssistantDisplayName(null, new Map(), new Map())).toBe('');
    expect(resolveAssistantDisplayName(undefined, new Map(), new Map())).toBe('');
  });
  it('R2.6 NEVER returns raw id string', () => {
    expect(resolveAssistantDisplayName({ id: 'STAFF-XYZ' }, new Map(), new Map())).not.toContain('STAFF-');
    expect(resolveAssistantDisplayName({ id: 'STAFF-XYZ' }, new Map(), new Map())).toBe('');
  });
});

describe('R3 — resolveBranchDisplayName', () => {
  it('R3.1 returns live name from branchMap', () => {
    const map = new Map([['BR-1', { name: 'นครราชสีมา' }]]);
    expect(resolveBranchDisplayName('BR-1', map, 'cache')).toBe('นครราชสีมา');
  });
  it('R3.2 falls back to cached name', () => {
    expect(resolveBranchDisplayName('BR-1', new Map(), 'cache')).toBe('cache');
  });
  it('R3.3 returns empty when nothing resolves', () => {
    expect(resolveBranchDisplayName('BR-1', new Map(), '')).toBe('');
  });
  it('R3.4 NEVER returns raw branchId', () => {
    expect(resolveBranchDisplayName('BR-1777873556815-26df6480', new Map(), '')).not.toContain('BR-');
  });
});

describe('R4 — resolveAssistantsDisplay (composer)', () => {
  it('R4.1 joins resolved names with ", "', () => {
    const dm = new Map([['DOC-1', { name: 'A' }], ['DOC-2', { name: 'B' }]]);
    expect(resolveAssistantsDisplay([{ id: 'DOC-1' }, { id: 'DOC-2' }], dm, new Map())).toBe('A, B');
  });
  it('R4.2 filters out empty resolution results', () => {
    const dm = new Map([['DOC-1', { name: 'A' }]]);
    expect(resolveAssistantsDisplay([{ id: 'DOC-1' }, { id: 'X' }], dm, new Map())).toBe('A');
  });
  it('R4.3 returns empty string for empty / null array', () => {
    expect(resolveAssistantsDisplay([], new Map(), new Map())).toBe('');
    expect(resolveAssistantsDisplay(null, new Map(), new Map())).toBe('');
    expect(resolveAssistantsDisplay(undefined, new Map(), new Map())).toBe('');
  });
});
```

- [ ] **Step 1.2: Run tests to verify they FAIL**

```
npm test -- --run tests/phase-27-0-treatment-display-resolvers.test.js 2>&1 | tail -10
```
Expected: FAIL with module-not-found error on `treatmentDisplayResolvers.js`

- [ ] **Step 1.3: Create the resolver module**

`src/lib/treatmentDisplayResolvers.js`:

```js
// src/lib/treatmentDisplayResolvers.js
//
// Phase 27.0 (2026-05-14) — live-resolve doctor/assistant/branch display
// names for treatment doc readers. Mirrors Rule O productName live-resolve
// pattern (V46/AV24) — fallback chain LIVE map → cached name → empty.
// NEVER returns a raw doc ID (DOC-/STAFF-/BR- prefix).
//
// Pure JS. Branch-blind. No Firestore deps — caller passes pre-built Maps.
//
// Audit: AV42 (audit-anti-vibe-code) — every component displaying treatment
// doctorId / assistants[].id / branchId MUST use these helpers. Direct reads
// (detail.doctorId || /'name || a.id) outside this module are forbidden.

function _trimmedString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Live-resolve a doctor display name.
 *
 * Fallback chain:
 *   1. doctorMap.get(doctorId).name (LIVE — from listDoctors({includeHidden:true}))
 *   2. cachedName (denormalized snapshot from save time)
 *   3. ''  — caller renders '—' or placeholder
 *
 * NEVER returns the raw doctorId. NEVER returns object/undefined/null.
 */
export function resolveDoctorDisplayName(doctorId, doctorMap, cachedName) {
  if (doctorId && doctorMap && typeof doctorMap.get === 'function') {
    const live = _trimmedString(doctorMap.get(String(doctorId))?.name);
    if (live) return live;
  }
  return _trimmedString(cachedName);
}

/**
 * Live-resolve a single assistant entry. Cross-collection lookup: try
 * doctorMap first (doctors CAN be assistants), then staffMap, then cache.
 *
 * Accepts entry as either string id or {id, name?}.
 */
export function resolveAssistantDisplayName(entry, doctorMap, staffMap) {
  if (!entry) return '';
  const id = typeof entry === 'string' ? entry : entry?.id;
  if (id) {
    if (doctorMap && typeof doctorMap.get === 'function') {
      const live = _trimmedString(doctorMap.get(String(id))?.name);
      if (live) return live;
    }
    if (staffMap && typeof staffMap.get === 'function') {
      const live = _trimmedString(staffMap.get(String(id))?.name);
      if (live) return live;
    }
  }
  if (entry && typeof entry === 'object') {
    return _trimmedString(entry.name);
  }
  return '';
}

/**
 * Live-resolve a branch display name.
 */
export function resolveBranchDisplayName(branchId, branchMap, cachedName) {
  if (branchId && branchMap && typeof branchMap.get === 'function') {
    const live = _trimmedString(branchMap.get(String(branchId))?.name);
    if (live) return live;
  }
  return _trimmedString(cachedName);
}

/**
 * Compose a comma-joined display string for assistant list.
 * Empty resolutions filtered out.
 */
export function resolveAssistantsDisplay(assistants, doctorMap, staffMap) {
  if (!Array.isArray(assistants)) return '';
  return assistants
    .map((a) => resolveAssistantDisplayName(a, doctorMap, staffMap))
    .filter(Boolean)
    .join(', ');
}
```

- [ ] **Step 1.4: Run tests to verify they PASS**

```
npm test -- --run tests/phase-27-0-treatment-display-resolvers.test.js 2>&1 | tail -10
```
Expected: 23+ tests pass (R1.x + R2.x + R3.x + R4.x)

- [ ] **Step 1.5: Commit**

```bash
git add tests/phase-27-0-treatment-display-resolvers.test.js src/lib/treatmentDisplayResolvers.js
git commit -m "feat(Phase 27.0 Task 1): treatmentDisplayResolvers TDD — live-resolve > cache > never raw ID"
```

---

## Task 2: Property-based + adversarial tests for resolvers (V55 methodology)

**Files:**
- Test: `tests/phase-27-0-resolver-helpers-property-based.test.js`

- [ ] **Step 2.1: Write property-based tests using fast-check**

`tests/phase-27-0-resolver-helpers-property-based.test.js`:

```js
// V27.0 property-based + adversarial — applies V55 methodology
import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  resolveDoctorDisplayName,
  resolveAssistantDisplayName,
  resolveBranchDisplayName,
  resolveAssistantsDisplay,
} from '../src/lib/treatmentDisplayResolvers.js';
import { ADVERSARIAL_STRINGS, ADVERSARIAL_NON_STRINGS } from './helpers/adversarialFixtures.js';

const RUNS = { numRuns: 200 };

describe('PB1 — resolveDoctorDisplayName invariants', () => {
  test.prop([fc.string(), fc.string(), fc.string()], RUNS)(
    'PB1.1 never throws, always returns string',
    (id, mapName, cachedName) => {
      const map = new Map([[id, { name: mapName }]]);
      const out = resolveDoctorDisplayName(id, map, cachedName);
      return typeof out === 'string';
    }
  );
  test.prop([fc.string({ minLength: 1 }), fc.string()], RUNS)(
    'PB1.2 NEVER returns the raw doctorId verbatim when map+cache both empty',
    (id, cachedNoise) => {
      const out = resolveDoctorDisplayName(id, new Map(), '');
      return out !== id;
    }
  );
  test.prop([fc.string(), fc.string({ minLength: 1 })], RUNS)(
    'PB1.3 idempotent — calling twice yields same result',
    (id, name) => {
      const map = new Map([[id, { name }]]);
      return resolveDoctorDisplayName(id, map, 'cache') ===
             resolveDoctorDisplayName(id, map, 'cache');
    }
  );
});

describe('PB2 — resolveAssistantsDisplay shape', () => {
  test.prop([
    fc.array(fc.record({ id: fc.string(), name: fc.string() }), { maxLength: 8 }),
  ], RUNS)(
    'PB2.1 output never contains undefined/null literal',
    (entries) => {
      const out = resolveAssistantsDisplay(entries, new Map(), new Map());
      return !out.includes('undefined') && !out.includes('null');
    }
  );
  test.prop([fc.array(fc.constantFrom(null, undefined, {}, ''))], RUNS)(
    'PB2.2 falsy entries skipped, output may be ""',
    (entries) => {
      const out = resolveAssistantsDisplay(entries, new Map(), new Map());
      return typeof out === 'string' && out === '';
    }
  );
});

describe('AD1 — adversarial inputs', () => {
  for (const s of ADVERSARIAL_STRINGS) {
    it(`AD1.${s.length}: adversarial cachedName "${s.slice(0, 12)}..." returns trimmed or empty`, () => {
      const out = resolveDoctorDisplayName('X', new Map(), s);
      expect(typeof out).toBe('string');
      expect(out).toBe(s.trim());
    });
  }
  for (const v of ADVERSARIAL_NON_STRINGS) {
    it(`AD1.non-string ${typeof v} cachedName → empty`, () => {
      expect(resolveDoctorDisplayName('X', new Map(), v)).toBe('');
    });
  }
});

describe('AD2 — prototype pollution probe', () => {
  it('AD2.1 doctorMap from Object.prototype is rejected (Map.get only)', () => {
    Object.prototype.evilDoctor = { name: 'leak' };
    try {
      // Passing a plain object instead of Map — get() should not exist → fallback
      const fakeMap = {};
      expect(resolveDoctorDisplayName('evilDoctor', fakeMap, '')).toBe('');
    } finally {
      delete Object.prototype.evilDoctor;
    }
  });
});
```

- [ ] **Step 2.2: Run tests to verify PASS**

```
npm test -- --run tests/phase-27-0-resolver-helpers-property-based.test.js 2>&1 | tail -10
```
Expected: ~50+ tests pass (PB1.x + PB2.x + AD1.x + AD2.x)

- [ ] **Step 2.3: Commit**

```bash
git add tests/phase-27-0-resolver-helpers-property-based.test.js
git commit -m "test(Phase 27.0 Task 2): property-based + adversarial for resolvers (V55 methodology)"
```

---

## Task 3: Migrate TreatmentReadOnlyMirror to use resolvers

**Files:**
- Modify: `src/components/backend/TreatmentReadOnlyMirror.jsx` lines 355-380 + add Map subscriptions

- [ ] **Step 3.1: Read the file's existing import block**

```
Read F:\LoverClinic-app\src\components\backend\TreatmentReadOnlyMirror.jsx limit=30
```

- [ ] **Step 3.2: Add new imports + Map subscription state**

Add to imports (after existing scopedDataLayer imports if any, else near top):
```js
import { useEffect, useState } from 'react';  // ensure useEffect imported
import {
  resolveDoctorDisplayName,
  resolveAssistantsDisplay,
  resolveBranchDisplayName,
} from '../../lib/treatmentDisplayResolvers.js';
import { listDoctors, listStaff, listBranches } from '../../lib/scopedDataLayer.js';
```

Inside the component body (top, before existing logic):
```js
// Phase 27.0 (2026-05-14) — live-resolve doctor/assistant/branch names.
// listDoctors/listStaff/listBranches with includeHidden:true so hidden
// people's past records still display their name (V41 lookup-map pattern).
const [doctorMap, setDoctorMap] = useState(() => new Map());
const [staffMap, setStaffMap] = useState(() => new Map());
const [branchMap, setBranchMap] = useState(() => new Map());

useEffect(() => {
  let cancelled = false;
  Promise.all([
    listDoctors({ includeHidden: true }).catch(() => []),
    listStaff({ includeHidden: true }).catch(() => []),
    listBranches({ allBranches: true }).catch(() => []),
  ]).then(([doctors, staff, branches]) => {
    if (cancelled) return;
    setDoctorMap(new Map(doctors.map((d) => [String(d.id), d])));
    setStaffMap(new Map(staff.map((s) => [String(s.id), s])));
    setBranchMap(new Map(branches.map((b) => [String(b.branchId || b.id), b])));
  });
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 3.3: Replace lines 360-374 with resolver calls**

Find the block:
```js
const doctorId = detail.doctorId || '';
const doctorName = detail.doctorName || doctorId || '—';
const branchName = detail.branchName || detail.branchId || '—';
```
And:
```js
const assistants = detail.assistants || [];
const assistantsDisplay = assistants.map(a => (a.name || a.id || a)).filter(Boolean).join(', ');
```

Replace with:
```js
// Phase 27.0 (2026-05-14) — resolver migration. NEVER fall back to raw ID.
const doctorId = detail.doctorId || '';
const resolvedDoctor = resolveDoctorDisplayName(doctorId, doctorMap, detail.doctorName);
const doctorName = resolvedDoctor || '—';  // '—' placeholder for empty
const branchId = detail.branchId || '';
const resolvedBranch = resolveBranchDisplayName(branchId, branchMap, detail.branchName);
const branchName = resolvedBranch || '—';
const assistants = detail.assistants || [];
const resolvedAssistants = resolveAssistantsDisplay(assistants, doctorMap, staffMap);
const assistantsDisplay = resolvedAssistants || '—';
```

- [ ] **Step 3.4: Verify component still compiles**

```
npm run build 2>&1 | tail -5
```
Expected: clean build (no errors)

- [ ] **Step 3.5: Run pre-existing TreatmentReadOnlyMirror tests**

```
npm test -- --run tests/phase-26-2f-mirror-rtl.test.jsx tests/phase-26-2f-mirror-source-grep.test.js 2>&1 | tail -10
```
Expected: still PASS (the resolver-based output reduces to same `doctorName` when caches are correct; degradation case shows `—` instead of raw ID, which is the desired fix)

- [ ] **Step 3.6: Commit**

```bash
git add src/components/backend/TreatmentReadOnlyMirror.jsx
git commit -m "feat(Phase 27.0 Task 3): TreatmentReadOnlyMirror live-resolves doctor/assistant/branch via AV42 helpers"
```

---

## Task 4: Migrate TreatmentReadOnlyPanel to use resolvers

**Files:**
- Modify: `src/components/backend/TreatmentReadOnlyPanel.jsx`

- [ ] **Step 4.1: Apply same migration pattern as Task 3**

Read the file first to find the equivalent display logic:
```
Grep "detail.doctorId\|detail.doctorName\|detail.branchId\|detail.branchName\|assistants.map" path=src/components/backend/TreatmentReadOnlyPanel.jsx
```

Apply the same 3 imports + Map subscription + resolver replacement.

- [ ] **Step 4.2: Verify build + existing tests still pass**

```
npm run build 2>&1 | tail -5
npm test -- --run tests/customer-treatment-timeline-flow.test.js 2>&1 | tail -10
```

- [ ] **Step 4.3: Commit**

```bash
git add src/components/backend/TreatmentReadOnlyPanel.jsx
git commit -m "feat(Phase 27.0 Task 4): TreatmentReadOnlyPanel live-resolves via AV42 helpers (Rule O class mirror)"
```

---

## Task 5: TFP write-side branchId stamping

**Files:**
- Test: `tests/phase-27-0-tfp-write-branch-id.test.js`
- Modify: `src/components/TreatmentFormPage.jsx` around line 2254

- [ ] **Step 5.1: Write source-grep test for write-side**

`tests/phase-27-0-tfp-write-branch-id.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const TFP_SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');

describe('W1 — TFP write-side branchId stamping (Phase 27.0)', () => {
  it('W1.1 imports useSelectedBranch', () => {
    expect(TFP_SRC).toMatch(/import.*useSelectedBranch.*from.*BranchContext/);
  });
  it('W1.2 destructures branchId from useSelectedBranch', () => {
    // const { branchId: selectedBranchId } = useSelectedBranch();
    expect(TFP_SRC).toMatch(/useSelectedBranch\(\)/);
    expect(TFP_SRC).toMatch(/selectedBranchId/);
  });
  it('W1.3 backendDetail block stamps branchId', () => {
    // Look for the backendDetail construction window
    const idx = TFP_SRC.indexOf('const backendDetail = clean({');
    expect(idx).toBeGreaterThan(0);
    const window = TFP_SRC.slice(idx, idx + 3000);
    expect(window).toMatch(/branchId:\s*selectedBranchId/);
  });
  it('W1.4 backendDetail also stamps branchName (cache)', () => {
    const idx = TFP_SRC.indexOf('const backendDetail = clean({');
    const window = TFP_SRC.slice(idx, idx + 3000);
    expect(window).toMatch(/branchName/);
  });
  it('W1.5 V27.0 marker comment present', () => {
    expect(TFP_SRC).toMatch(/Phase 27\.0.*branchId/);
  });
});
```

- [ ] **Step 5.2: Run test to verify FAIL**

```
npm test -- --run tests/phase-27-0-tfp-write-branch-id.test.js 2>&1 | tail -10
```
Expected: FAIL on W1.3 (branchId not yet stamped)

- [ ] **Step 5.3: Apply TFP edits**

Read TFP imports first (`src/components/TreatmentFormPage.jsx` head 50 lines). Verify `useSelectedBranch` already imported from BranchContext (it is — used by SELECTED_BRANCH_ID at line ~3141).

Inside the component body, ensure `selectedBranchId` is destructured (likely already done — confirm via grep). If not:
```js
const { branchId: selectedBranchId } = useSelectedBranch();
```

Read lines 2250-2280 to find the `backendDetail = clean({...})` block. After `assistants:` block, add:

```js
// Phase 27.0 (2026-05-14) — stamp branchId from BranchSelector context.
// branchName denormalized for cache; render-side live-resolves via
// treatmentDisplayResolvers.resolveBranchDisplayName (AV42).
branchId: selectedBranchId || '',
branchName: (allBranches || []).find((b) => String(b.branchId || b.id) === String(selectedBranchId))?.name || '',
```

Note: `allBranches` must be in scope. If not, add a `useState` + `listBranches({allBranches:true})` fetch in TFP, OR import from BranchContext.

Inspect TFP for existing `allBranches` reference — if not present, the simpler fix is to look up via BranchContext's already-loaded list:

```js
const { branchId: selectedBranchId, allBranches: ctxBranches } = useSelectedBranch();
```

(Confirm `useSelectedBranch` exposes `allBranches` — check `src/lib/BranchContext.jsx`. If not, fall back to denormalizing only the id and let the resolver handle the name at render.)

**Defensive fallback**: if `allBranches` lookup isn't easily available, write only `branchId: selectedBranchId || ''` and let `resolveBranchDisplayName` produce the live name at render time. This is fine — branchName cache is purely an optimization, not a correctness requirement.

- [ ] **Step 5.4: Run test to verify PASS**

```
npm test -- --run tests/phase-27-0-tfp-write-branch-id.test.js 2>&1 | tail -10
```
Expected: 5/5 PASS

- [ ] **Step 5.5: Commit**

```bash
git add tests/phase-27-0-tfp-write-branch-id.test.js src/components/TreatmentFormPage.jsx
git commit -m "feat(Phase 27.0 Task 5): TFP stamps branchId from useSelectedBranch at treatment save"
```

---

## Task 6: EditAttributionModal — add branchId picker field

**Files:**
- Test: `tests/phase-27-0-edit-attribution-branch-rtl.test.jsx`
- Modify: `src/components/backend/EditAttributionModal.jsx`

- [ ] **Step 6.1: Read EditAttributionModal current shape**

```
Read F:\LoverClinic-app\src\components\backend\EditAttributionModal.jsx limit=60
```

- [ ] **Step 6.2: Write RTL test**

`tests/phase-27-0-edit-attribution-branch-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listBranches: vi.fn(() => Promise.resolve([
    { branchId: 'BR-A', name: 'นครราชสีมา' },
    { branchId: 'BR-B', name: 'พระราม 3' },
  ])),
  listDoctors: vi.fn(() => Promise.resolve([])),
  listStaff: vi.fn(() => Promise.resolve([])),
  updateBackendTreatment: vi.fn(() => Promise.resolve()),
}));

import EditAttributionModal from '../src/components/backend/EditAttributionModal.jsx';

const ORIGINAL_FETCH = global.fetch;
afterEach(() => { vi.clearAllMocks(); });
afterAll(() => {
  if (ORIGINAL_FETCH === undefined) delete global.fetch;
  else global.fetch = ORIGINAL_FETCH;
});

describe('EA1 — Phase 27.0 branchId field in EditAttributionModal', () => {
  it('EA1.1 renders branchId picker with current value selected', async () => {
    const treatment = {
      id: 'T1', detail: { branchId: 'BR-A', treatmentDate: '2026-05-07', doctorId: 'D1' },
    };
    render(<EditAttributionModal treatment={treatment} onClose={() => {}} onSaved={() => {}} />);
    const select = await screen.findByLabelText(/สาขา/i);
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('BR-A');
  });

  it('EA1.2 changing branchId fires save with new value', async () => {
    const onSaved = vi.fn();
    const treatment = { id: 'T1', detail: { branchId: 'BR-A' } };
    render(<EditAttributionModal treatment={treatment} onClose={() => {}} onSaved={onSaved} />);
    const select = await screen.findByLabelText(/สาขา/i);
    fireEvent.change(select, { target: { value: 'BR-B' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('EA1.3 branchId empty when treatment has no branchId yet', async () => {
    const treatment = { id: 'T1', detail: {} };
    render(<EditAttributionModal treatment={treatment} onClose={() => {}} onSaved={() => {}} />);
    const select = await screen.findByLabelText(/สาขา/i);
    expect(select).toHaveValue('');
  });
});
```

- [ ] **Step 6.3: Run test to verify FAIL**

```
npm test -- --run tests/phase-27-0-edit-attribution-branch-rtl.test.jsx 2>&1 | tail -10
```
Expected: FAIL (no `aria-label /สาขา/i` field exists)

- [ ] **Step 6.4: Add branchId field to EditAttributionModal**

Inside the modal's form section, after the existing doctorId/date fields, add:

```jsx
{/* Phase 27.0 (2026-05-14) — branchId historical override */}
<label className="block">
  <span className="text-sm font-medium">สาขาที่รักษา</span>
  <select
    value={editedBranchId}
    onChange={(e) => setEditedBranchId(e.target.value)}
    aria-label="สาขาที่รักษา"
    className="w-full mt-1 rounded border px-2 py-1 bg-[var(--bg-input)] border-[var(--bd)]"
  >
    <option value="">— เลือกสาขา —</option>
    {branches.map((b) => (
      <option key={b.branchId} value={b.branchId}>{b.name}</option>
    ))}
  </select>
</label>
```

Add state + branches fetch at top of component:
```jsx
const [editedBranchId, setEditedBranchId] = useState(treatment?.detail?.branchId || '');
const [branches, setBranches] = useState([]);
useEffect(() => {
  let cancelled = false;
  listBranches({ allBranches: true }).then((bs) => {
    if (!cancelled) setBranches(bs);
  });
  return () => { cancelled = true; };
}, []);
```

In save handler, include in payload:
```js
const payload = {
  ...existingPayload,
  'detail.branchId': editedBranchId,
  'detail.branchName': branches.find((b) => b.branchId === editedBranchId)?.name || '',
  '_attributionEditedAt': serverTimestamp(),
  '_attributionEditedBy': auth.currentUser?.uid || '',
};
```

(Adjust field names to match the modal's existing save handler shape — read it first.)

- [ ] **Step 6.5: Run test to verify PASS**

```
npm test -- --run tests/phase-27-0-edit-attribution-branch-rtl.test.jsx 2>&1 | tail -10
```
Expected: 3/3 PASS

- [ ] **Step 6.6: Commit**

```bash
git add tests/phase-27-0-edit-attribution-branch-rtl.test.jsx src/components/backend/EditAttributionModal.jsx
git commit -m "feat(Phase 27.0 Task 6): EditAttributionModal — branchId picker for historical corrections"
```

---

## Task 7: AV42 audit invariant + Rule I flow-simulate

**Files:**
- Test: `tests/phase-27-0-av42-source-grep.test.js`
- Test: `tests/phase-27-0-treatment-branch-flow-simulate.test.js`
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`

- [ ] **Step 7.1: Write AV42 source-grep regression**

`tests/phase-27-0-av42-source-grep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir, results = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git'
        || e.name === 'graphify-out' || e.name === '.agents' || e.name === 'docs'
        || e.name === '.claude' || e.name === '.stryker-tmp' || e.name === '.tmp_scan'
        || e.name === 'tests') continue;
      walk(p, results);
    } else if (/\.(js|jsx)$/.test(e.name)) {
      results.push(p);
    }
  }
  return results;
}

describe('AV42 — treatment display resolver discipline', () => {
  const files = walk(process.cwd());
  const SANCTIONED = new Set([
    'src/lib/treatmentDisplayResolvers.js',
    // Components are sanctioned because they consume the helpers
    'src/components/backend/TreatmentReadOnlyMirror.jsx',
    'src/components/backend/TreatmentReadOnlyPanel.jsx',
    'src/components/backend/EditAttributionModal.jsx',
    'src/components/TreatmentFormPage.jsx',
  ]);

  it('AV42.1 no component outside sanctioned reads detail.doctorId || doctorId fallback chain', () => {
    const violators = files.filter((f) => {
      const rel = f.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '').replace(/\\/g, '/');
      if (SANCTIONED.has(rel)) return false;
      const txt = readFileSync(f, 'utf-8');
      // Forbid the raw-ID-leak pattern OUTSIDE resolver consumers
      return /detail\.doctorId\s*\|\|\s*['"]/.test(txt) || /\|\|\s*doctorId\s*\|\|/.test(txt);
    });
    expect(violators).toEqual([]);
  });

  it('AV42.2 no component outside sanctioned uses (a.name || a.id) raw-ID-leak pattern', () => {
    const violators = files.filter((f) => {
      const rel = f.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '').replace(/\\/g, '/');
      if (SANCTIONED.has(rel)) return false;
      const txt = readFileSync(f, 'utf-8');
      return /a\.name\s*\|\|\s*a\.id/.test(txt);
    });
    expect(violators).toEqual([]);
  });

  it('AV42.3 resolver module exports all 4 canonical helpers', () => {
    const src = readFileSync('src/lib/treatmentDisplayResolvers.js', 'utf-8');
    expect(src).toMatch(/export function resolveDoctorDisplayName/);
    expect(src).toMatch(/export function resolveAssistantDisplayName/);
    expect(src).toMatch(/export function resolveBranchDisplayName/);
    expect(src).toMatch(/export function resolveAssistantsDisplay/);
  });
});
```

- [ ] **Step 7.2: Write flow-simulate test**

`tests/phase-27-0-treatment-branch-flow-simulate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  resolveDoctorDisplayName,
  resolveAssistantsDisplay,
  resolveBranchDisplayName,
} from '../src/lib/treatmentDisplayResolvers.js';

describe('FB — Rule I full-flow chain (Phase 27.0)', () => {
  it('FB1 USER FIXTURE — treatment with cached doctorName empty + live map has doctor', () => {
    // Simulates the screenshot fixture: detail.doctorId='DOC-mov2p9c0', cached doctorName=''
    const detail = {
      doctorId: 'DOC-mov2p9c0',
      doctorName: '',
      branchId: '',
      branchName: '',
      assistants: [{ id: 'DOC-mov2p9c0', name: '' }],
    };
    const doctorMap = new Map([['DOC-mov2p9c0', { name: 'หมอจอห์น' }]]);
    const staffMap = new Map();
    const branchMap = new Map();

    const doctor = resolveDoctorDisplayName(detail.doctorId, doctorMap, detail.doctorName);
    const assistants = resolveAssistantsDisplay(detail.assistants, doctorMap, staffMap);
    const branch = resolveBranchDisplayName(detail.branchId, branchMap, detail.branchName);

    expect(doctor).toBe('หมอจอห์น');           // live-resolved (was '')
    expect(assistants).toBe('หมอจอห์น');       // cross-collection
    expect(branch).toBe('');                    // no branchId yet (pre-Task 5)
    expect(doctor).not.toContain('DOC-');       // NEVER raw ID
  });

  it('FB2 POST-MIGRATION fixture — treatment has branchId stamped, live map empty (deleted branch)', () => {
    const detail = {
      doctorId: 'DOC-2',
      doctorName: 'หมอบี (cached)',
      branchId: 'BR-A',
      branchName: 'นครราชสีมา (cached)',
      assistants: [],
    };
    const doctorMap = new Map();  // doctor doc deleted post-treatment
    const branchMap = new Map();  // branch doc deleted post-treatment

    expect(resolveDoctorDisplayName(detail.doctorId, doctorMap, detail.doctorName)).toBe('หมอบี (cached)');
    expect(resolveBranchDisplayName(detail.branchId, branchMap, detail.branchName)).toBe('นครราชสีมา (cached)');
  });

  it('FB3 WORST-CASE — both map empty + cached empty → empty (caller renders —)', () => {
    expect(resolveDoctorDisplayName('DOC-X', new Map(), '')).toBe('');
    expect(resolveBranchDisplayName('BR-X', new Map(), '')).toBe('');
  });

  it('FB4 multi-assistant cross-collection mix', () => {
    const doctorMap = new Map([['DOC-1', { name: 'Dr A' }]]);
    const staffMap = new Map([['STAFF-1', { name: 'Asst B' }]]);
    const assts = [{ id: 'DOC-1' }, { id: 'STAFF-1' }, { id: 'UNKNOWN' }];
    expect(resolveAssistantsDisplay(assts, doctorMap, staffMap)).toBe('Dr A, Asst B');
  });
});
```

- [ ] **Step 7.3: Run AV42 + flow-simulate tests**

```
npm test -- --run tests/phase-27-0-av42-source-grep.test.js tests/phase-27-0-treatment-branch-flow-simulate.test.js 2>&1 | tail -15
```
Expected: all PASS

- [ ] **Step 7.4: Add AV42 entry to `audit-anti-vibe-code/SKILL.md`**

Append to the SKILL.md (find AV41 section, add after):

```markdown
### AV42 — Treatment doctor/assistant/branch display MUST live-resolve, never raw ID (Phase 27.0, 2026-05-14)

Mirrors Rule O productName live-resolve pattern (V46/AV24) at the treatment
doc identity-display layer. Every component displaying detail.doctorId /
detail.assistants[].id / detail.branchId MUST route through
`src/lib/treatmentDisplayResolvers.js` helpers. Direct fallback chains like
`detail.doctorName || detail.doctorId || '—'` or `a.name || a.id` are
forbidden — they leak raw doc IDs into the UI when the denormalized cache
is empty (e.g. doctor renamed/deleted post-save).

**Sanctioned exception list (closed)**:
- `src/lib/treatmentDisplayResolvers.js` — the helpers themselves
- `src/components/backend/TreatmentReadOnlyMirror.jsx` — consumes helpers
- `src/components/backend/TreatmentReadOnlyPanel.jsx` — consumes helpers
- `src/components/backend/EditAttributionModal.jsx` — historical edit path
- `src/components/TreatmentFormPage.jsx` — write-side stamping + edit hydrate

**Grep anchors** (audit test `tests/phase-27-0-av42-source-grep.test.js`):
- Forbid `detail\.doctorId \|\| ['"]` outside sanctioned list
- Forbid `a\.name \|\| a\.id` outside sanctioned list
- Require all 4 resolver exports in `treatmentDisplayResolvers.js`
```

- [ ] **Step 7.5: Commit**

```bash
git add tests/phase-27-0-av42-source-grep.test.js tests/phase-27-0-treatment-branch-flow-simulate.test.js .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "feat(Phase 27.0 Task 7): AV42 audit invariant + Rule I flow-simulate (Rule O class extension)"
```

---

## Task 8: Migration script (Rule M two-phase backfill)

**Files:**
- Create: `scripts/phase-27-0-backfill-treatment-branch-id.mjs`
- Test: `tests/phase-27-0-migration-helper.test.js`

- [ ] **Step 8.1: Write helper unit test**

`tests/phase-27-0-migration-helper.test.js`:

```js
import { describe, it, expect } from 'vitest';
// Import the pure helpers from the script (export them for testability)
import { decideBackfillAction, buildBackfillPatch } from '../scripts/phase-27-0-backfill-treatment-branch-id.mjs';

describe('M1 — migration decision logic', () => {
  it('M1.1 already has branchId → SKIP', () => {
    expect(decideBackfillAction({ detail: { branchId: 'BR-A' } }, { branchId: 'BR-X' })).toBe('skip-already-set');
  });
  it('M1.2 missing branchId + customer has branchId → BACKFILL', () => {
    expect(decideBackfillAction({ detail: {} }, { branchId: 'BR-A' })).toBe('backfill');
  });
  it('M1.3 missing branchId + customer also empty → SKIP-NO-HEURISTIC', () => {
    expect(decideBackfillAction({ detail: {} }, { branchId: '' })).toBe('skip-no-heuristic');
  });
  it('M1.4 missing branchId + customer null → SKIP-NO-HEURISTIC', () => {
    expect(decideBackfillAction({ detail: {} }, null)).toBe('skip-no-heuristic');
  });

  it('M1.5 patch shape includes forensic-trail fields', () => {
    const patch = buildBackfillPatch({
      newBranchId: 'BR-A',
      newBranchName: 'นครราชสีมา',
      prevBranchId: undefined,
    });
    expect(patch['detail.branchId']).toBe('BR-A');
    expect(patch['detail.branchName']).toBe('นครราชสีมา');
    expect(patch['detail._branchIdBackfilledFrom']).toBe('customer.branchId');
    expect(patch['detail._branchIdBackfilledLegacyValue']).toBe(null);  // was missing
    expect(patch).toHaveProperty('detail._branchIdBackfilledAt');
  });
});
```

- [ ] **Step 8.2: Run test to verify FAIL (script doesn't exist)**

```
npm test -- --run tests/phase-27-0-migration-helper.test.js 2>&1 | tail -10
```
Expected: FAIL (module not found)

- [ ] **Step 8.3: Create migration script**

`scripts/phase-27-0-backfill-treatment-branch-id.mjs`:

```js
// Phase 27.0 (2026-05-14) — backfill detail.branchId on existing be_treatments
// using customer.branchId as heuristic. Rule M canonical pattern.
//
// Two-phase: dry-run by default; --apply commits writes.
// Idempotent: re-run with --apply yields 0 writes.

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const APPLY = process.argv.includes('--apply');

// ─── Pure helpers (exported for tests) ─────────────────────────────────────

export function decideBackfillAction(treatment, customer) {
  const existingBranchId = treatment?.detail?.branchId;
  if (existingBranchId && String(existingBranchId).trim()) return 'skip-already-set';
  const customerBranchId = customer?.branchId;
  if (customerBranchId && String(customerBranchId).trim()) return 'backfill';
  return 'skip-no-heuristic';
}

export function buildBackfillPatch({ newBranchId, newBranchName, prevBranchId }) {
  return {
    'detail.branchId': newBranchId,
    'detail.branchName': newBranchName || '',
    'detail._branchIdBackfilledAt': FieldValue.serverTimestamp(),
    'detail._branchIdBackfilledFrom': 'customer.branchId',
    'detail._branchIdBackfilledLegacyValue': prevBranchId === undefined ? null : prevBranchId,
  };
}

// ─── Main migration ────────────────────────────────────────────────────────

async function main() {
  const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: key,
    }),
  });
  const db = getFirestore();

  console.log(`Phase 27.0 backfill — mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  // Build customerId → branchId Map for fast lookup
  const customerSnap = await db.collection(`${PREFIX}/be_customers`).get();
  const customerBranchMap = new Map();
  customerSnap.forEach((d) => {
    const data = d.data();
    customerBranchMap.set(d.id, { branchId: data.branchId || '' });
  });
  console.log(`Loaded ${customerBranchMap.size} customers.`);

  // Build branchId → branchName Map
  const branchSnap = await db.collection(`${PREFIX}/be_branches`).get();
  const branchNameMap = new Map();
  branchSnap.forEach((d) => branchNameMap.set(d.id, d.data().name || ''));
  console.log(`Loaded ${branchNameMap.size} branches.`);

  // Scan all be_treatments
  const treatmentSnap = await db.collection(`${PREFIX}/be_treatments`).get();
  console.log(`Scanning ${treatmentSnap.size} treatments...`);

  const stats = { scanned: 0, backfill: 0, skipAlreadySet: 0, skipNoHeuristic: 0 };
  const writes = [];

  treatmentSnap.forEach((doc) => {
    stats.scanned += 1;
    const data = doc.data();
    const customerId = data.customerId;
    const customer = customerBranchMap.get(customerId);
    const action = decideBackfillAction(data, customer);

    if (action === 'skip-already-set') stats.skipAlreadySet += 1;
    else if (action === 'skip-no-heuristic') stats.skipNoHeuristic += 1;
    else if (action === 'backfill') {
      stats.backfill += 1;
      const newBranchId = customer.branchId;
      const newBranchName = branchNameMap.get(newBranchId) || '';
      const patch = buildBackfillPatch({
        newBranchId,
        newBranchName,
        prevBranchId: data?.detail?.branchId,
      });
      writes.push({ ref: doc.ref, patch });
    }
  });

  console.log(`Stats: ${JSON.stringify(stats, null, 2)}`);

  if (!APPLY) {
    console.log(`DRY-RUN done. Pass --apply to commit ${writes.length} writes.`);
    return;
  }

  // Apply in batches of 200
  const BATCH = 200;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const { ref, patch } of writes.slice(i, i + BATCH)) {
      batch.update(ref, patch);
    }
    await batch.commit();
    console.log(`Committed batch ${Math.floor(i / BATCH) + 1} (${Math.min(i + BATCH, writes.length)}/${writes.length})`);
  }

  // Audit doc
  const auditId = `phase-27-0-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    phase: 'Phase 27.0 backfill treatment branchId',
    appliedAt: Timestamp.now(),
    scanned: stats.scanned,
    backfilled: stats.backfill,
    skipped: stats.skipAlreadySet + stats.skipNoHeuristic,
    skipBreakdown: { alreadySet: stats.skipAlreadySet, noHeuristic: stats.skipNoHeuristic },
  });
  console.log(`Audit doc: ${PREFIX}/be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 8.4: Run helper test to verify PASS**

```
npm test -- --run tests/phase-27-0-migration-helper.test.js 2>&1 | tail -10
```
Expected: 5/5 PASS

- [ ] **Step 8.5: Run dry-run on real prod (Rule M)**

```
node scripts/phase-27-0-backfill-treatment-branch-id.mjs 2>&1 | tail -20
```
Expected: dry-run output with stats. NO writes committed.

- [ ] **Step 8.6: Commit (without --apply yet — user authorizes)**

```bash
git add scripts/phase-27-0-backfill-treatment-branch-id.mjs tests/phase-27-0-migration-helper.test.js
git commit -m "feat(Phase 27.0 Task 8): Rule M migration script — backfill branchId from customer.branchId"
```

---

# PHASE 27.1 TASKS (Tier 2: layout swap)

## Task 9: useLayoutPreference hook (TDD)

**Files:**
- Test: `tests/phase-27-1-use-layout-preference.test.js`
- Create: `src/hooks/useLayoutPreference.js`

- [ ] **Step 9.1: Write failing test**

`tests/phase-27-1-use-layout-preference.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutPreference } from '../src/hooks/useLayoutPreference.js';

describe('U1 — useLayoutPreference', () => {
  beforeEach(() => { localStorage.clear(); });

  it('U1.1 default returns "left"', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    expect(result.current.position).toBe('left');
    expect(result.current.isPrimaryLeft).toBe(true);
  });

  it('U1.2 custom default "right"', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key', 'right'));
    expect(result.current.position).toBe('right');
    expect(result.current.isPrimaryLeft).toBe(false);
  });

  it('U1.3 swap() flips position', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    act(() => result.current.swap());
    expect(result.current.position).toBe('right');
    act(() => result.current.swap());
    expect(result.current.position).toBe('left');
  });

  it('U1.4 writes to localStorage on swap', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    act(() => result.current.swap());
    expect(localStorage.getItem('layout_pref:test-key')).toBe('right');
  });

  it('U1.5 reads from localStorage on mount', () => {
    localStorage.setItem('layout_pref:test-key', 'right');
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    expect(result.current.position).toBe('right');
  });

  it('U1.6 rejects invalid stored values (falls back to default)', () => {
    localStorage.setItem('layout_pref:test-key', 'middle');
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    expect(result.current.position).toBe('left');
  });

  it('U1.7 setPosition validates input', () => {
    const { result } = renderHook(() => useLayoutPreference('test-key'));
    act(() => result.current.setPosition('right'));
    expect(result.current.position).toBe('right');
    act(() => result.current.setPosition('invalid'));
    expect(result.current.position).toBe('right');  // unchanged
  });
});
```

- [ ] **Step 9.2: Run test to verify FAIL**

```
npm test -- --run tests/phase-27-1-use-layout-preference.test.js 2>&1 | tail -10
```

- [ ] **Step 9.3: Create the hook**

`src/hooks/useLayoutPreference.js`:

```js
// src/hooks/useLayoutPreference.js
//
// Phase 27.1 (2026-05-14) — device-persistent split-screen layout preference.
// Reusable: each consumer passes a unique `key` (e.g. 'tfp').
// Persists to localStorage under `layout_pref:<key>`. Safe-no-op when storage
// unavailable (SSR / private browsing).

import { useState, useEffect, useCallback } from 'react';

const STORAGE_PREFIX = 'layout_pref:';

function _readStored(key, fallback) {
  try {
    const v = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (v === 'left' || v === 'right') return v;
  } catch {
    /* localStorage unavailable */
  }
  return fallback === 'right' ? 'right' : 'left';
}

export function useLayoutPreference(key, defaultValue = 'left') {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const [position, setPositionState] = useState(() => _readStored(key, defaultValue));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, position);
    } catch {
      /* write failed */
    }
  }, [storageKey, position]);

  const swap = useCallback(() => {
    setPositionState((p) => (p === 'left' ? 'right' : 'left'));
  }, []);

  const setPosition = useCallback((p) => {
    if (p === 'left' || p === 'right') setPositionState(p);
  }, []);

  return {
    position,
    isPrimaryLeft: position === 'left',
    swap,
    setPosition,
  };
}
```

- [ ] **Step 9.4: Run test to verify PASS**

```
npm test -- --run tests/phase-27-1-use-layout-preference.test.js 2>&1 | tail -10
```
Expected: 7/7 PASS

- [ ] **Step 9.5: Commit**

```bash
git add tests/phase-27-1-use-layout-preference.test.js src/hooks/useLayoutPreference.js
git commit -m "feat(Phase 27.1 Task 9): useLayoutPreference hook (reusable, localStorage-backed)"
```

---

## Task 10: Property-based test for hook (V55 methodology)

**Files:**
- Test: `tests/phase-27-1-layout-preference-property-based.test.js`

- [ ] **Step 10.1: Write property-based tests**

```js
import { describe } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutPreference } from '../src/hooks/useLayoutPreference.js';

describe('PB — useLayoutPreference invariants', () => {
  test.prop([fc.integer({ min: 0, max: 50 })], { numRuns: 50 })(
    'PB.1 swap is involutive (N×swap returns to start when N is even)',
    (n) => {
      localStorage.clear();
      const { result } = renderHook(() => useLayoutPreference(`pb-${Math.random()}`));
      const start = result.current.position;
      act(() => {
        for (let i = 0; i < n; i++) result.current.swap();
      });
      const end = result.current.position;
      return n % 2 === 0 ? end === start : end !== start;
    }
  );

  test.prop([fc.string()], { numRuns: 100 })(
    'PB.2 invalid stored values always reduce to "left"',
    (junk) => {
      if (junk === 'left' || junk === 'right') return true;
      localStorage.clear();
      localStorage.setItem(`layout_pref:test-${Math.random()}`, junk);
      const key = `test-${Math.random()}`;
      const { result } = renderHook(() => useLayoutPreference(key));
      return result.current.position === 'left';
    }
  );

  test.prop([fc.constantFrom('left', 'right')], { numRuns: 20 })(
    'PB.3 setPosition with valid value always wins',
    (target) => {
      localStorage.clear();
      const { result } = renderHook(() => useLayoutPreference(`pb3-${Math.random()}`));
      act(() => result.current.setPosition(target));
      return result.current.position === target;
    }
  );
});
```

- [ ] **Step 10.2: Run + verify PASS**

```
npm test -- --run tests/phase-27-1-layout-preference-property-based.test.js 2>&1 | tail -10
```

- [ ] **Step 10.3: Commit**

```bash
git add tests/phase-27-1-layout-preference-property-based.test.js
git commit -m "test(Phase 27.1 Task 10): property-based invariants for useLayoutPreference"
```

---

## Task 11: LayoutSwapButton component (TDD)

**Files:**
- Test: `tests/phase-27-1-layout-swap-button-rtl.test.jsx`
- Create: `src/components/LayoutSwapButton.jsx`

- [ ] **Step 11.1: Write RTL test**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LayoutSwapButton } from '../src/components/LayoutSwapButton.jsx';

describe('LSB — LayoutSwapButton', () => {
  it('LSB.1 renders with aria-label for left position', () => {
    render(<LayoutSwapButton onSwap={() => {}} position="left" visible={true} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label');
    expect(btn.getAttribute('aria-label')).toContain('ขวา');
  });
  it('LSB.2 aria-label updates for right position', () => {
    render(<LayoutSwapButton onSwap={() => {}} position="right" visible={true} />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('ซ้าย');
  });
  it('LSB.3 click fires onSwap', () => {
    const onSwap = vi.fn();
    render(<LayoutSwapButton onSwap={onSwap} position="left" visible={true} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSwap).toHaveBeenCalledTimes(1);
  });
  it('LSB.4 hidden when visible=false', () => {
    const { container } = render(<LayoutSwapButton onSwap={() => {}} position="left" visible={false} />);
    expect(container.firstChild).toBeNull();
  });
  it('LSB.5 has data-testid for selector', () => {
    render(<LayoutSwapButton onSwap={() => {}} position="left" visible={true} />);
    expect(screen.getByTestId('layout-swap-button')).toBeInTheDocument();
  });
});
```

- [ ] **Step 11.2: Run test to verify FAIL**

- [ ] **Step 11.3: Create the component**

`src/components/LayoutSwapButton.jsx`:

```jsx
// src/components/LayoutSwapButton.jsx
//
// Phase 27.1 (2026-05-14) — floating swap button at column divider.
// Click → onSwap(). Visible only when split-screen active (caller passes
// visible=true). Touch target ≥ 44px (WCAG 2.5.5).

import { ArrowLeftRight } from 'lucide-react';

export function LayoutSwapButton({ onSwap, position, visible = true, isDark = true }) {
  if (!visible) return null;
  const label = position === 'left'
    ? 'สลับ — ฟอร์มไปขวา / ประวัติไปซ้าย'
    : 'สลับ — ฟอร์มไปซ้าย / ประวัติไปขวา';
  return (
    <div
      className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
      style={{ pointerEvents: 'none' }}
      data-testid="layout-swap-button-wrapper"
    >
      <button
        type="button"
        onClick={onSwap}
        data-testid="layout-swap-button"
        aria-label={label}
        title={label}
        style={{ pointerEvents: 'auto' }}
        className={`
          flex items-center justify-center
          w-11 h-11 rounded-full
          border-2 ${isDark ? 'border-[#333] bg-[#1a1a1a]' : 'border-gray-200 bg-white'}
          shadow-lg
          hover:scale-110 active:scale-95
          transition-all duration-150
          text-purple-500 hover:bg-purple-500/10
          focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
        `}
      >
        <ArrowLeftRight size={18} />
      </button>
    </div>
  );
}

export default LayoutSwapButton;
```

- [ ] **Step 11.4: Run test to verify PASS**

- [ ] **Step 11.5: Commit**

```bash
git add tests/phase-27-1-layout-swap-button-rtl.test.jsx src/components/LayoutSwapButton.jsx
git commit -m "feat(Phase 27.1 Task 11): LayoutSwapButton component (44px touch target, click-through wrapper)"
```

---

## Task 12: TFP integration — apply useLayoutPreference + render LayoutSwapButton

**Files:**
- Test: `tests/phase-27-1-tfp-swap-integration.test.js`
- Modify: `src/components/TreatmentFormPage.jsx`

- [ ] **Step 12.1: Write source-grep test**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
const SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');

describe('TFP1 — Phase 27.1 layout swap integration', () => {
  it('TFP1.1 imports useLayoutPreference', () => {
    expect(SRC).toMatch(/import.*useLayoutPreference.*from.*useLayoutPreference/);
  });
  it('TFP1.2 imports LayoutSwapButton', () => {
    expect(SRC).toMatch(/import.*LayoutSwapButton.*from/);
  });
  it('TFP1.3 calls useLayoutPreference("tfp", ...)', () => {
    expect(SRC).toMatch(/useLayoutPreference\(\s*['"]tfp['"]/);
  });
  it('TFP1.4 outer container applies lg:flex-row-reverse conditionally', () => {
    expect(SRC).toMatch(/lg:flex-row-reverse/);
  });
  it('TFP1.5 renders LayoutSwapButton inside split-screen condition', () => {
    expect(SRC).toMatch(/<LayoutSwapButton/);
  });
});
```

- [ ] **Step 12.2: Run test to verify FAIL**

- [ ] **Step 12.3: Apply TFP edits**

Add imports near top:
```jsx
import { useLayoutPreference } from '../hooks/useLayoutPreference.js';
import { LayoutSwapButton } from './LayoutSwapButton.jsx';
```

Inside component body (near top, after other useState calls):
```jsx
// Phase 27.1 (2026-05-14) — TFP split-screen layout swap.
const { position: tfpLayout, swap: swapTfpLayout, isPrimaryLeft: isFormLeft } = useLayoutPreference('tfp', 'left');
```

In the two-column layout block (line 3154), modify the outer div className:
```jsx
<div className={selectedHistoryTreatmentId
  ? `relative max-w-[2000px] lg:flex lg:gap-4 mx-auto px-4 py-4 ${isFormLeft ? '' : 'lg:flex-row-reverse'}`
  : 'max-w-6xl mx-auto px-4 py-4'
}>
  {/* Phase 27.1 — floating swap button between panels */}
  {selectedHistoryTreatmentId && (
    <LayoutSwapButton
      onSwap={swapTfpLayout}
      position={tfpLayout}
      visible={true}
      isDark={isDark}
    />
  )}
  {/* ... existing LEFT panel wrapper ... */}
```

- [ ] **Step 12.4: Run source-grep + build**

```
npm test -- --run tests/phase-27-1-tfp-swap-integration.test.js 2>&1 | tail -10
npm run build 2>&1 | tail -5
```
Expected: 5/5 PASS + clean build

- [ ] **Step 12.5: Commit**

```bash
git add tests/phase-27-1-tfp-swap-integration.test.js src/components/TreatmentFormPage.jsx
git commit -m "feat(Phase 27.1 Task 12): TFP integration — lg:flex-row-reverse swap + LayoutSwapButton"
```

---

# COMBINED FINAL VERIFICATION

## Task 13: Full suite verify + build clean

- [ ] **Step 13.1: Run targeted V27 tests**

```
npm test -- --run tests/phase-27-0-*.test.{js,jsx} tests/phase-27-1-*.test.{js,jsx} 2>&1 | tail -15
```
Expected: ALL PASS (~80+ tests across both phases)

- [ ] **Step 13.2: Full suite run**

```
npm test -- --run 2>&1 | tail -15
```
Expected: 0 failures. New tests increase count by ~80-100.

- [ ] **Step 13.3: Build clean**

```
npm run build 2>&1 | tail -10
```
Expected: clean build (~10s).

- [ ] **Step 13.4: Live admin-SDK e2e dry-run (Phase 27.0)**

```
node scripts/phase-27-0-backfill-treatment-branch-id.mjs 2>&1 | tail -20
```
Expected: dry-run produces stats; admin can review before --apply.

- [ ] **Step 13.5: Combined commit + push**

(No new commit needed — Tasks 1-12 already committed. Just push.)

```bash
git push origin master 2>&1 | tail -5
```

- [ ] **Step 13.6: Awaiting user "deploy" authorization (V18)**

Report to user:
- Tasks 1-13 completed
- N tests added (Phase 27.0 + 27.1)
- Build clean, full suite GREEN
- Migration dry-run output captured for user review
- Awaiting explicit "deploy" + "apply migration" before vercel + firebase deploys

---

## Self-review (skill checklist)

**1. Spec coverage**:
- Phase 27.0 spec Layer 1 (write-side) → Task 5 ✅
- Phase 27.0 spec Layer 2 (read-side resolvers) → Tasks 1, 2, 3, 4 ✅
- Phase 27.0 spec Layer 3 (audit AV42) → Task 7 ✅
- Phase 27.0 spec Migration → Task 8 ✅
- Phase 27.0 spec EditAttributionModal branchId → Task 6 ✅
- Phase 27.1 spec hook → Task 9 ✅
- Phase 27.1 spec property-based → Task 10 ✅
- Phase 27.1 spec button → Task 11 ✅
- Phase 27.1 spec TFP integration → Task 12 ✅
- Final verify → Task 13 ✅

**2. Placeholder scan**: No "TBD" / "TODO" / "implement later" / "similar to Task N" patterns. All code blocks shown. ✅

**3. Type consistency**: `resolveDoctorDisplayName(doctorId, doctorMap, cachedName)` used identically in resolver, tests, consumers. `useLayoutPreference(key, defaultValue)` returns `{position, isPrimaryLeft, swap, setPosition}` used identically. ✅

**Plan ready for execution.**
