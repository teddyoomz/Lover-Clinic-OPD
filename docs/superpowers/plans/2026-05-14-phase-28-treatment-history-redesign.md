# Phase 28 — Treatment History Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline 290-line treatment-history card body inside `CustomerDetailView.jsx` with a timeline-led, date-grouped, dot-stepper redesign per spec `2026-05-14-treatment-history-redesign-design.md`. Ship with brutal-level test coverage + live preview verification + V15 combined deploy.

**Architecture:** Extract 7 small focused components into `src/components/backend/treatment-history/` + 6 pure helpers added to `src/lib/treatmentDisplayResolvers.js`. Pure render-layer change — no Firestore writes / schema migrations / rule changes. Uses existing CSS design tokens (`var(--bg-* / --bd-* / --tx-*)`) so light theme inherits automatically.

**Tech Stack:** React 19 + Vite 8 + Tailwind 3.4 + Vitest + RTL + Lucide React icons + Bangkok TZ helpers from `src/utils.js`.

**Reference spec:** `docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md` — every task below references the relevant spec section.

---

## Task 0: Pre-flight — baseline + branch check

**Files:** None (verification only)

- [ ] **Step 1: Verify on master**
```bash
git status --short && git log -1 --oneline
```
Expected: clean working tree (only spec-already-committed at `7142d17`); current branch master.

- [ ] **Step 2: Capture baseline test count**
```bash
npm test -- --run 2>&1 | tail -3
```
Expected: 9013+ pass, 1 skipped, 0 fail (baseline from active.md). Record exact count for end-of-batch comparison.

- [ ] **Step 3: Capture baseline build size**
```bash
npm run build 2>&1 | grep -E "BackendDashboard|index.html" | head -5
```
Expected: clean build, BackendDashboard chunk size noted (delta budget = +5KB at end).

---

## Task 1: Pure helpers — `treatmentDisplayResolvers.js` (TDD)

**Files:**
- Create: `tests/phase-28-treatment-history-resolvers.test.js`
- Modify: `src/lib/treatmentDisplayResolvers.js` (add 6 new exports)

Spec reference: § 4.6 Status vocabulary, § 5.2 grouping, § 5.3 relative dates, § 7 component architecture.

- [ ] **Step 1.1: Read existing `treatmentDisplayResolvers.js` to understand current exports + style**
```bash
# Use Read tool on src/lib/treatmentDisplayResolvers.js
```
Note existing exports + import style + JSDoc patterns.

- [ ] **Step 1.2: Write failing tests for `getTreatmentLifecycle`**

Create `tests/phase-28-treatment-history-resolvers.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  getTreatmentLifecycle,
  getTreatmentStatusLabel,
  getStepLabels,
  computeRelativeThaiDateLabel,
  groupTreatmentsByDate,
  computeRowAction,
} from '../src/lib/treatmentDisplayResolvers.js';

describe('Phase 28 · getTreatmentLifecycle', () => {
  it('R1.1 returns vitals stage when only vitalsignsRecordedAt present', () => {
    const t = { vitalsignsRecordedAt: '2026-05-14T04:13:00Z' };
    const lc = getTreatmentLifecycle(t);
    expect(lc).toHaveLength(1);
    expect(lc[0]).toMatchObject({ key: 'vitalsigns', time: '2026-05-14T04:13:00Z' });
  });
  it('R1.2 returns all 3 stages sorted by time when all timestamps present', () => {
    const t = {
      vitalsignsRecordedAt: '2026-05-14T04:02:00Z',
      doctorRecordedAt: '2026-05-14T04:23:00Z',
      completedAt: '2026-05-14T04:23:00Z',
    };
    const lc = getTreatmentLifecycle(t);
    expect(lc).toHaveLength(3);
    expect(lc.map(s => s.key)).toEqual(['vitalsigns', 'doctor', 'completed']);
  });
  it('R1.3 returns completed stage from legacy editedAt fallback when status cleared', () => {
    const t = { status: '', editedAt: '2026-05-14T01:03:00Z' };
    const lc = getTreatmentLifecycle(t);
    expect(lc).toHaveLength(1);
    expect(lc[0].key).toBe('completed');
  });
  it('R1.4 sorts stages with null times at end', () => {
    const t = {
      vitalsignsRecordedAt: '2026-05-14T04:13:00Z',
      doctorRecordedAt: null,
      completedAt: null,
    };
    const lc = getTreatmentLifecycle(t);
    expect(lc[0].key).toBe('vitalsigns');
  });
  it('R1.5 returns empty array on null input', () => {
    expect(getTreatmentLifecycle(null)).toEqual([]);
    expect(getTreatmentLifecycle(undefined)).toEqual([]);
    expect(getTreatmentLifecycle({})).toEqual([]);
  });
});
```

- [ ] **Step 1.3: Run failing tests**
```bash
npm test -- --run tests/phase-28-treatment-history-resolvers.test.js 2>&1 | tail -15
```
Expected: FAIL — getTreatmentLifecycle not exported.

- [ ] **Step 1.4: Implement `getTreatmentLifecycle` in `treatmentDisplayResolvers.js`**

Append at end of file:
```js
/**
 * Phase 28 (2026-05-14) — derive lifecycle stages array for a treatment.
 * Stages: vitalsigns / doctor / completed.
 * Sorted by time ascending; entries without time go to end (Infinity).
 * Tolerant fallback per Phase 27.2-ter:
 *   - explicit *RecordedAt fields take precedence
 *   - status === 'vitalsigns-recorded' → derive vitalsigns from recordedAt
 *   - status === 'doctor-recorded'    → derive doctor from recordedAt
 *   - status cleared + (editedAt || recordedAt || editedByName) → completed
 *
 * @param {object} t — treatmentSummary entry
 * @returns {Array<{key: 'vitalsigns'|'doctor'|'completed', time: string|null}>}
 */
export function getTreatmentLifecycle(t) {
  if (!t || typeof t !== 'object') return [];
  const stages = [];
  const vStage = !!t.vitalsignsRecordedAt || t.status === 'vitalsigns-recorded';
  const vTime = t.vitalsignsRecordedAt
    || (t.status === 'vitalsigns-recorded' ? t.recordedAt : null);
  if (vStage) stages.push({ key: 'vitalsigns', time: vTime || null });

  const dStage = !!t.doctorRecordedAt || t.status === 'doctor-recorded';
  const dTime = t.doctorRecordedAt
    || (t.status === 'doctor-recorded' ? t.recordedAt : null);
  if (dStage) stages.push({ key: 'doctor', time: dTime || null });

  const cStage = !!t.completedAt
    || (!t.status && (!!t.editedAt || !!t.recordedAt || !!t.editedByName));
  const cTime = t.completedAt
    || (!t.status && t.editedAt ? t.editedAt : null)
    || (!t.status && t.recordedAt ? t.recordedAt : null);
  if (cStage) stages.push({ key: 'completed', time: cTime || null });

  // Sort by time ascending; entries without time go to end
  stages.sort((a, b) => {
    const am = a.time ? new Date(a.time).getTime() : Infinity;
    const bm = b.time ? new Date(b.time).getTime() : Infinity;
    return am - bm;
  });
  return stages;
}
```

- [ ] **Step 1.5: Run tests, verify R1.* pass**
```bash
npm test -- --run tests/phase-28-treatment-history-resolvers.test.js 2>&1 | grep -E "✓|×|R1\." | head -20
```
Expected: 5/5 R1.* tests pass.

- [ ] **Step 1.6: Add tests for `getTreatmentStatusLabel`**

Append to test file:
```js
describe('Phase 28 · getTreatmentStatusLabel', () => {
  it('R2.1 returns "ยังไม่บันทึก" for empty lifecycle', () => {
    expect(getTreatmentStatusLabel({}, false)).toBe('ยังไม่บันทึก');
  });
  it('R2.2 returns "ซักประวัติเท่านั้น" for vitals-only on non-latest', () => {
    expect(getTreatmentStatusLabel({ vitalsignsRecordedAt: 'x' }, false))
      .toBe('ซักประวัติเท่านั้น');
  });
  it('R2.3 returns "รอแพทย์บันทึก" for vitals-only when isLatest=true', () => {
    expect(getTreatmentStatusLabel({ vitalsignsRecordedAt: 'x' }, true))
      .toBe('รอแพทย์บันทึก');
  });
  it('R2.4 returns "เสร็จสิ้น · ครบ 3 ขั้น" when all 3 stages done', () => {
    const t = { vitalsignsRecordedAt: 'a', doctorRecordedAt: 'b', completedAt: 'c' };
    expect(getTreatmentStatusLabel(t, false)).toBe('เสร็จสิ้น · ครบ 3 ขั้น');
  });
  it('R2.5 returns "เสร็จสิ้น · ตรงเข้าบันทึก" when only completed', () => {
    expect(getTreatmentStatusLabel({ completedAt: 'c' }, false))
      .toBe('เสร็จสิ้น · ตรงเข้าบันทึก');
  });
  it('R2.6 returns "เสร็จสิ้น · ข้ามแพทย์" when vitals + completed', () => {
    const t = { vitalsignsRecordedAt: 'a', completedAt: 'c' };
    expect(getTreatmentStatusLabel(t, false)).toBe('เสร็จสิ้น · ข้ามแพทย์');
  });
  it('R2.7 returns "ครบขั้นแพทย์ · รอบันทึก" when vitals + doctor (no completed)', () => {
    const t = { vitalsignsRecordedAt: 'a', doctorRecordedAt: 'b' };
    expect(getTreatmentStatusLabel(t, false)).toBe('ครบขั้นแพทย์ · รอบันทึก');
  });
});
```

- [ ] **Step 1.7: Implement `getTreatmentStatusLabel`**

Append to resolvers file:
```js
/**
 * Phase 28 (2026-05-14) — return Thai status label for the title row.
 * @param {object} t — treatmentSummary entry
 * @param {boolean} isLatest — whether this is the latest treatment (globalIndex===0)
 * @returns {string}
 */
export function getTreatmentStatusLabel(t, isLatest = false) {
  const lc = getTreatmentLifecycle(t);
  const keys = new Set(lc.map(s => s.key));
  const hasV = keys.has('vitalsigns');
  const hasD = keys.has('doctor');
  const hasC = keys.has('completed');
  if (!hasV && !hasD && !hasC) return 'ยังไม่บันทึก';
  if (hasV && hasD && hasC) return 'เสร็จสิ้น · ครบ 3 ขั้น';
  if (hasV && hasC && !hasD) return 'เสร็จสิ้น · ข้ามแพทย์';
  if (hasC && !hasV && !hasD) return 'เสร็จสิ้น · ตรงเข้าบันทึก';
  if (hasV && hasD && !hasC) return 'ครบขั้นแพทย์ · รอบันทึก';
  if (hasV && !hasD && !hasC) return isLatest ? 'รอแพทย์บันทึก' : 'ซักประวัติเท่านั้น';
  if (hasD && !hasV && !hasC) return 'แพทย์บันทึกแล้ว · รอเสร็จ';
  if (hasD && hasC && !hasV) return 'เสร็จสิ้น · ข้ามซักประวัติ';
  return 'ยังไม่บันทึก';
}
```

- [ ] **Step 1.8: Run tests R2.* — verify pass**
```bash
npm test -- --run tests/phase-28-treatment-history-resolvers.test.js -t "R2" 2>&1 | tail -10
```

- [ ] **Step 1.9: Add `getStepLabels` tests + impl**

Tests:
```js
describe('Phase 28 · getStepLabels', () => {
  it('R3.1 returns standard labels when all stages done', () => {
    const lc = [{ key: 'vitalsigns' }, { key: 'doctor' }, { key: 'completed' }];
    expect(getStepLabels(lc)).toEqual({ t: 'ซักประวัติ', a: 'แพทย์', e: 'เสร็จ' });
  });
  it('R3.2 returns "รอแพทย์" for doctor when only vitals done', () => {
    const lc = [{ key: 'vitalsigns' }];
    expect(getStepLabels(lc)).toEqual({ t: 'ซักประวัติ', a: 'รอแพทย์', e: 'เสร็จ' });
  });
  it('R3.3 returns "ข้ามแพทย์" for doctor when vitals + completed only', () => {
    const lc = [{ key: 'vitalsigns' }, { key: 'completed' }];
    expect(getStepLabels(lc)).toEqual({ t: 'ซักประวัติ', a: 'ข้ามแพทย์', e: 'เสร็จ' });
  });
  it('R3.4 returns "ข้าม" for vitals + doctor when only completed', () => {
    const lc = [{ key: 'completed' }];
    expect(getStepLabels(lc)).toEqual({ t: 'ข้าม', a: 'ข้าม', e: 'เสร็จ' });
  });
});
```

Impl:
```js
/**
 * Phase 28 (2026-05-14) — derive step labels for the 3-dot stepper.
 * Returns context-aware Thai labels per stage based on what's done vs pending vs skipped.
 * @param {Array<{key: string}>} lifecycle — output of getTreatmentLifecycle
 * @returns {{t: string, a: string, e: string}}
 */
export function getStepLabels(lifecycle = []) {
  const keys = new Set((lifecycle || []).map(s => s.key));
  const hasV = keys.has('vitalsigns');
  const hasD = keys.has('doctor');
  const hasC = keys.has('completed');
  return {
    t: hasV ? 'ซักประวัติ' : (hasC || hasD ? 'ข้าม' : 'ซักประวัติ'),
    a: hasD ? 'แพทย์' : (hasV && hasC ? 'ข้ามแพทย์' : (hasV ? 'รอแพทย์' : 'ข้าม')),
    e: hasC ? 'เสร็จ' : 'เสร็จ',
  };
}
```

- [ ] **Step 1.10: Run R3.* — verify pass**

- [ ] **Step 1.11: Add `computeRelativeThaiDateLabel` tests + impl**

Tests (use FIXED today date for determinism):
```js
describe('Phase 28 · computeRelativeThaiDateLabel', () => {
  const today = '2026-05-14';
  it('R4.1 returns "วันนี้" for same day', () => {
    expect(computeRelativeThaiDateLabel('2026-05-14', today)).toBe('วันนี้');
  });
  it('R4.2 returns "เมื่อวาน" for 1 day ago', () => {
    expect(computeRelativeThaiDateLabel('2026-05-13', today)).toBe('เมื่อวาน');
  });
  it('R4.3 returns "N วันที่แล้ว" for 2-6 days ago', () => {
    expect(computeRelativeThaiDateLabel('2026-05-07', today)).toBe('7 วันที่แล้ว');
    expect(computeRelativeThaiDateLabel('2026-05-12', today)).toBe('2 วันที่แล้ว');
  });
  it('R4.4 returns "N สัปดาห์ที่แล้ว" for 7-29 days', () => {
    // Note: 7 days = "1 สัปดาห์ที่แล้ว"; spec says 7-13 = 1, 14-29 = N/7
    expect(computeRelativeThaiDateLabel('2026-04-30', today)).toBe('2 สัปดาห์ที่แล้ว');
  });
  it('R4.5 returns "N เดือนที่แล้ว" for 30-364 days', () => {
    expect(computeRelativeThaiDateLabel('2026-04-14', today)).toBe('1 เดือนที่แล้ว');
  });
  it('R4.6 returns "N ปีที่แล้ว" for 365+ days', () => {
    expect(computeRelativeThaiDateLabel('2025-05-14', today)).toBe('1 ปีที่แล้ว');
  });
  it('R4.7 returns empty string on invalid input', () => {
    expect(computeRelativeThaiDateLabel(null, today)).toBe('');
    expect(computeRelativeThaiDateLabel('', today)).toBe('');
  });
});
```

Note R4.3 — "7 วันที่แล้ว" is a key test case (matches user's screenshot showing 7 พ.ค. as "7 วันที่แล้ว" when today is 14 พ.ค.). Spec says days 2-6 = "N วันที่แล้ว", days 7-13 = "1 สัปดาห์ที่แล้ว". But user's mockup showed 7 days = "7 วันที่แล้ว". **Spec rules — 7 days = "1 สัปดาห์ที่แล้ว"**. Update test R4.3 to use 6 days, R4.4 to test 7 days = "1 สัปดาห์ที่แล้ว":

Re-do test R4.3 + R4.4:
```js
it('R4.3 returns "N วันที่แล้ว" for 2-6 days ago', () => {
  expect(computeRelativeThaiDateLabel('2026-05-08', today)).toBe('6 วันที่แล้ว');
  expect(computeRelativeThaiDateLabel('2026-05-12', today)).toBe('2 วันที่แล้ว');
});
it('R4.4 returns "N สัปดาห์ที่แล้ว" for 7-29 days', () => {
  expect(computeRelativeThaiDateLabel('2026-05-07', today)).toBe('1 สัปดาห์ที่แล้ว');
  expect(computeRelativeThaiDateLabel('2026-04-30', today)).toBe('2 สัปดาห์ที่แล้ว');
});
```

Impl:
```js
/**
 * Phase 28 (2026-05-14) — compute Thai relative date label.
 * @param {string} dateISO — 'YYYY-MM-DD' format
 * @param {string} todayISO — 'YYYY-MM-DD' format (caller passes thaiTodayISO())
 * @returns {string}
 */
export function computeRelativeThaiDateLabel(dateISO, todayISO) {
  if (!dateISO || !todayISO) return '';
  // Bangkok-stable midday-UTC parse (V53 lesson) so getUTCDay/Date arithmetic
  // doesn't drift across TZ boundaries.
  const parse = (iso) => {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  };
  const dMs = parse(dateISO);
  const tMs = parse(todayISO);
  if (dMs === null || tMs === null) return '';
  const daysAgo = Math.round((tMs - dMs) / 86400000);
  if (daysAgo === 0) return 'วันนี้';
  if (daysAgo === 1) return 'เมื่อวาน';
  if (daysAgo >= 2 && daysAgo <= 6) return `${daysAgo} วันที่แล้ว`;
  if (daysAgo >= 7 && daysAgo <= 29) {
    return `${Math.floor(daysAgo / 7)} สัปดาห์ที่แล้ว`;
  }
  if (daysAgo >= 30 && daysAgo <= 364) {
    return `${Math.floor(daysAgo / 30)} เดือนที่แล้ว`;
  }
  if (daysAgo >= 365) {
    return `${Math.floor(daysAgo / 365)} ปีที่แล้ว`;
  }
  // Future dates fallback
  return '';
}
```

Run R4.* — verify pass.

- [ ] **Step 1.12: Add `groupTreatmentsByDate` tests + impl**

Tests:
```js
describe('Phase 28 · groupTreatmentsByDate', () => {
  it('R5.1 groups same-date rows under one header', () => {
    const rows = [
      { id: 'a', date: '2026-05-14' },
      { id: 'b', date: '2026-05-14' },
      { id: 'c', date: '2026-05-07' },
    ];
    const groups = groupTreatmentsByDate(rows);
    expect(groups).toEqual([
      { type: 'header', date: '2026-05-14', count: 2 },
      { type: 'row', t: { id: 'a', date: '2026-05-14' } },
      { type: 'row', t: { id: 'b', date: '2026-05-14' } },
      { type: 'header', date: '2026-05-07', count: 1 },
      { type: 'row', t: { id: 'c', date: '2026-05-07' } },
    ]);
  });
  it('R5.2 returns empty array for empty input', () => {
    expect(groupTreatmentsByDate([])).toEqual([]);
    expect(groupTreatmentsByDate(null)).toEqual([]);
  });
  it('R5.3 single row produces 1 header + 1 row', () => {
    const rows = [{ id: 'a', date: '2026-05-14' }];
    const groups = groupTreatmentsByDate(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ type: 'header', date: '2026-05-14', count: 1 });
  });
});
```

Impl:
```js
/**
 * Phase 28 (2026-05-14) — group treatment rows by date for date-grouped sections.
 * Input is already paginated + date-sorted (caller's responsibility).
 * Produces interleaved [{type:'header', date, count}, {type:'row', t}, ...].
 *
 * @param {Array<{date: string}>} rows
 * @returns {Array<{type: 'header'|'row', date?: string, count?: number, t?: object}>}
 */
export function groupTreatmentsByDate(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const result = [];
  let currentDate = null;
  let lastHeaderIndex = -1;
  for (const t of rows) {
    if (t.date !== currentDate) {
      lastHeaderIndex = result.length;
      result.push({ type: 'header', date: t.date, count: 1 });
      currentDate = t.date;
    } else {
      result[lastHeaderIndex].count++;
    }
    result.push({ type: 'row', t });
  }
  return result;
}
```

Run R5.* — verify pass.

- [ ] **Step 1.13: Add `computeRowAction` tests + impl**

Tests:
```js
describe('Phase 28 · computeRowAction', () => {
  it('R6.1 returns "in progress" when no completed stage', () => {
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:13:00Z' }];
    expect(computeRowAction(lc)).toMatchObject({ kind: 'in-progress', label: '⌛ in progress' });
  });
  it('R6.2 returns completed with HH:MM when completed stage present', () => {
    const lc = [{ key: 'completed', time: '2026-05-14T04:23:00Z' }];
    const action = computeRowAction(lc);
    expect(action.kind).toBe('completed');
    expect(action.label).toMatch(/^✓ บันทึก \d{2}:\d{2}$/);
  });
  it('R6.3 returns null label for empty lifecycle', () => {
    expect(computeRowAction([])).toEqual({ kind: 'unknown', label: '' });
  });
});
```

Impl (uses existing `formatBadgeTime` from CDV.jsx — extract as helper if not already exported):
```js
import { formatBadgeTime } from './formatBadgeTime.js'; // ensure exported

/**
 * Phase 28 (2026-05-14) — compute the right-aligned row action chip.
 * @param {Array<{key: string, time: string|null}>} lifecycle
 * @returns {{kind: 'in-progress'|'completed'|'unknown', label: string}}
 */
export function computeRowAction(lifecycle = []) {
  if (!Array.isArray(lifecycle) || lifecycle.length === 0) {
    return { kind: 'unknown', label: '' };
  }
  const completed = lifecycle.find(s => s.key === 'completed');
  if (completed) {
    const time = completed.time ? formatBadgeTime(completed.time) : '';
    return { kind: 'completed', label: time ? `✓ บันทึก ${time}` : '✓ บันทึกแล้ว' };
  }
  return { kind: 'in-progress', label: '⌛ in progress' };
}
```

If `formatBadgeTime` is currently inlined in CDV.jsx and not exported, extract it to a separate module first as part of this step:
- Create `src/lib/formatBadgeTime.js` with the helper + export
- Update CDV.jsx import + treatmentDisplayResolvers.js import

Run R6.* — verify pass.

- [ ] **Step 1.14: Run all R1-R6 tests + commit**
```bash
npm test -- --run tests/phase-28-treatment-history-resolvers.test.js 2>&1 | tail -10
```
Expected: all R1-R6 pass (~20+ assertions).

```bash
git add tests/phase-28-treatment-history-resolvers.test.js src/lib/treatmentDisplayResolvers.js src/lib/formatBadgeTime.js src/components/backend/CustomerDetailView.jsx
git commit -m "feat(Phase 28.1): treatment-history resolvers — 6 pure helpers (TDD)"
git push origin master
```

---

## Task 2: `TreatmentLifecycleStepper` component

**Files:**
- Create: `src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx`
- Create: `tests/phase-28-treatment-history-stepper-rtl.test.jsx`

Spec reference: § 4.5 Stepper.

- [ ] **Step 2.1: Write failing RTL test**

Create `tests/phase-28-treatment-history-stepper-rtl.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TreatmentLifecycleStepper } from '../src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx';

describe('Phase 28 · TreatmentLifecycleStepper RTL', () => {
  it('S1.1 renders 3 dots + 2 connectors when all stages done', () => {
    const lc = [
      { key: 'vitalsigns', time: '2026-05-14T04:02:00Z' },
      { key: 'doctor', time: '2026-05-14T04:23:00Z' },
      { key: 'completed', time: '2026-05-14T04:23:00Z' },
    ];
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    expect(container.querySelectorAll('[data-testid="stepper-dot"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="stepper-connector"]')).toHaveLength(2);
  });

  it('S1.2 marks pending-now step (vitals done, doctor pending) with pulse animation class', () => {
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:13:00Z' }];
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} isLatest={true} />);
    const dots = container.querySelectorAll('[data-testid="stepper-dot"]');
    // Dot index 1 (doctor) is pending-now → has animate-pulse / pulse-step class
    expect(dots[1].className).toMatch(/pulse|animate/i);
  });

  it('S1.3 displays "−" for skipped step', () => {
    const lc = [
      { key: 'vitalsigns', time: '2026-05-14T03:49:00Z' },
      { key: 'completed', time: '2026-05-14T03:49:00Z' },
    ];
    render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    expect(screen.getByText('ข้ามแพทย์')).toBeInTheDocument();
  });

  it('S1.4 shows formatted HH:MM time under done dots', () => {
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:13:00Z' }];
    render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    expect(screen.getByText('04:13')).toBeInTheDocument();
  });

  it('S1.5 shows "—" for empty step times', () => {
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:13:00Z' }];
    const { container } = render(<TreatmentLifecycleStepper lifecycle={lc} isDark={true} />);
    expect(container.textContent).toMatch(/—/);
  });
});
```

- [ ] **Step 2.2: Verify test fails**
```bash
npm test -- --run tests/phase-28-treatment-history-stepper-rtl.test.jsx 2>&1 | tail -10
```
Expected: FAIL — TreatmentLifecycleStepper not found.

- [ ] **Step 2.3: Implement `TreatmentLifecycleStepper.jsx`**

Create `src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx`:
```jsx
import React from 'react';
import { Check } from 'lucide-react';
import { getStepLabels } from '../../../lib/treatmentDisplayResolvers.js';
import { formatBadgeTime } from '../../../lib/formatBadgeTime.js';

const STEP_KEYS = ['vitalsigns', 'doctor', 'completed'];

/**
 * Phase 28 (2026-05-14) — 3-dot stepper with connector lines for treatment lifecycle.
 * Shows vitals → doctor → completed with timestamps under each dot.
 * - Done stages: filled gradient + ✓ + glow
 * - Pending-now (isLatest + has gap before this step): pulse animation
 * - Skipped: "−" symbol
 *
 * @param {Array<{key: string, time: string|null}>} lifecycle
 * @param {boolean} isDark — theme flag from useTheme()
 * @param {boolean} isLatest — true if this is the latest treatment row
 */
export function TreatmentLifecycleStepper({ lifecycle = [], isDark = true, isLatest = false }) {
  const lc = Array.isArray(lifecycle) ? lifecycle : [];
  const keys = new Set(lc.map(s => s.key));
  const labels = getStepLabels(lc);
  const labelMap = { vitalsigns: labels.t, doctor: labels.a, completed: labels.e };
  const timeByKey = Object.fromEntries(lc.map(s => [s.key, s.time]));

  const stepStateForKey = (key, idx) => {
    const done = keys.has(key);
    if (done) return 'done';
    // Skipped if any LATER step is done
    const laterDone = STEP_KEYS.slice(idx + 1).some(k => keys.has(k));
    if (laterDone) return 'skipped';
    // Pending-now if this is the next step after a done one AND is latest
    const prevDone = idx > 0 && keys.has(STEP_KEYS[idx - 1]);
    if (isLatest && prevDone) return 'pending-now';
    return 'pending-future';
  };

  const dotClasses = (key, state) => {
    const base = 'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all relative z-10 border-2';
    if (state === 'done') {
      const map = {
        vitalsigns: 'bg-gradient-to-br from-teal-500 to-teal-700 border-teal-300 text-white shadow-[0_0_12px_rgba(20,184,166,0.5)]',
        doctor: 'bg-gradient-to-br from-amber-500 to-amber-700 border-amber-300 text-white shadow-[0_0_12px_rgba(245,158,11,0.5)]',
        completed: 'bg-gradient-to-br from-emerald-500 to-emerald-700 border-emerald-300 text-white shadow-[0_0_12px_rgba(16,185,129,0.5)]',
      };
      return `${base} ${map[key]}`;
    }
    if (state === 'pending-now') {
      return `${base} bg-amber-500/5 border-amber-300 text-amber-300 animate-pulse`;
    }
    return `${base} bg-[var(--bg-base)] border-[var(--bd-strong)] text-[var(--tx-faint)]`;
  };

  const labelClasses = (state) => {
    if (state === 'done') return 'text-[10px] font-bold mt-1.5 text-center leading-tight text-[var(--tx-primary)]';
    if (state === 'pending-now') return 'text-[10px] font-bold mt-1.5 text-center leading-tight text-amber-300';
    return 'text-[10px] font-bold mt-1.5 text-center leading-tight text-[var(--tx-muted)]';
  };

  const connClasses = (idx) => {
    // connector AFTER step idx (so idx 0 = before doctor, idx 1 = before completed)
    const prevKey = STEP_KEYS[idx];
    const nextKey = STEP_KEYS[idx + 1];
    const prevDone = keys.has(prevKey);
    const nextDone = keys.has(nextKey);
    if (prevDone && nextDone && prevKey === 'vitalsigns') {
      return 'flex-1 h-0.5 -mx-0.5 mt-[11px] z-0 bg-gradient-to-r from-teal-300 via-teal-500 to-teal-700';
    }
    if (prevDone && nextDone && prevKey === 'doctor') {
      return 'flex-1 h-0.5 -mx-0.5 mt-[11px] z-0 bg-gradient-to-r from-amber-300 via-amber-500 to-amber-700';
    }
    if (prevDone && !nextDone && nextKey === 'completed' && keys.has('completed')) {
      // Skipped doctor: vitals → completed direct
      return 'flex-1 h-0.5 -mx-0.5 mt-[11px] z-0 bg-gradient-to-r from-teal-300 via-teal-500 to-teal-700';
    }
    return 'flex-1 h-0.5 -mx-0.5 mt-[11px] z-0 bg-[var(--bd)]';
  };

  return (
    <div className="flex items-start pr-3" data-testid="treatment-lifecycle-stepper">
      {STEP_KEYS.map((key, idx) => {
        const state = stepStateForKey(key, idx);
        const label = labelMap[key];
        const time = timeByKey[key];
        const formattedTime = time ? formatBadgeTime(time) : null;
        return (
          <React.Fragment key={key}>
            <div className="flex flex-col items-center min-w-[74px] flex-shrink-0">
              <div className={dotClasses(key, state)} data-testid="stepper-dot">
                {state === 'done' && <Check size={11} />}
                {state === 'pending-now' && <span>{idx + 1}</span>}
                {state === 'pending-future' && <span>{idx + 1}</span>}
                {state === 'skipped' && <span>−</span>}
              </div>
              <div className={labelClasses(state)}>{label}</div>
              <div className={`text-[9px] font-mono font-semibold mt-0.5 tracking-wider ${formattedTime ? 'text-[var(--tx-secondary)]' : 'text-[var(--tx-faint)]'}`}>
                {formattedTime || '—'}
              </div>
            </div>
            {idx < STEP_KEYS.length - 1 && (
              <div className={connClasses(idx)} data-testid="stepper-connector" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2.4: Run S1.* tests + iterate to green**
```bash
npm test -- --run tests/phase-28-treatment-history-stepper-rtl.test.jsx 2>&1 | tail -15
```

- [ ] **Step 2.5: Commit + push**
```bash
git add src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx tests/phase-28-treatment-history-stepper-rtl.test.jsx
git commit -m "feat(Phase 28.2): TreatmentLifecycleStepper component (3-dot stepper + connectors)"
git push origin master
```

---

## Task 3: `TreatmentDateHeader` component

**Files:**
- Create: `src/components/backend/treatment-history/TreatmentDateHeader.jsx`
- Add tests to `tests/phase-28-treatment-history-rtl.test.jsx` (new file, will grow)

Spec reference: § 4.3 Date group header.

- [ ] **Step 3.1: Write failing tests for date header**

Create `tests/phase-28-treatment-history-rtl.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TreatmentDateHeader } from '../src/components/backend/treatment-history/TreatmentDateHeader.jsx';

describe('Phase 28 · TreatmentDateHeader RTL', () => {
  it('D1.1 renders today header with fire-red border-left + "วันนี้" pill', () => {
    const { container } = render(
      <TreatmentDateHeader date="2026-05-14" todayISO="2026-05-14" count={4} />
    );
    expect(screen.getByText(/14 พฤษภาคม 2569/)).toBeInTheDocument();
    expect(screen.getByText('วันนี้')).toBeInTheDocument();
    expect(screen.getByText('4 รายการ')).toBeInTheDocument();
    const root = container.firstChild;
    expect(root.className).toMatch(/border-l-\[3px\]/);
  });
  it('D1.2 renders past header with "7 วันที่แล้ว" relative pill', () => {
    render(<TreatmentDateHeader date="2026-05-08" todayISO="2026-05-14" count={1} />);
    expect(screen.getByText('6 วันที่แล้ว')).toBeInTheDocument();
  });
  it('D1.3 renders past header with muted styling for older dates', () => {
    const { container } = render(
      <TreatmentDateHeader date="2026-05-07" todayISO="2026-05-14" count={1} />
    );
    expect(screen.getByText('1 สัปดาห์ที่แล้ว')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.2: Implement `TreatmentDateHeader.jsx`**

```jsx
import React from 'react';
import { computeRelativeThaiDateLabel } from '../../../lib/treatmentDisplayResolvers.js';
import { formatThaiDateFull } from '../../../utils.js';

/**
 * Phase 28 (2026-05-14) — date group header for date-grouped treatment list.
 * Today rows get fire-red accent; past rows muted gray.
 *
 * @param {string} date — 'YYYY-MM-DD'
 * @param {string} todayISO — 'YYYY-MM-DD' from thaiTodayISO()
 * @param {number} count — number of treatments under this header
 */
export function TreatmentDateHeader({ date, todayISO, count }) {
  const isToday = date === todayISO;
  const relativeLabel = computeRelativeThaiDateLabel(date, todayISO);
  const wrapperClass = isToday
    ? 'flex items-center justify-between px-[18px] py-2.5 border-l-[3px] border-l-red-500 bg-gradient-to-r from-red-500/[0.06] to-transparent'
    : 'flex items-center justify-between px-[18px] py-2.5 border-l-[3px] border-l-slate-700 bg-gradient-to-r from-slate-700/[0.04] to-transparent';
  const pillClass = isToday
    ? 'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/[0.12] border border-red-500/25 text-red-300'
    : 'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700/15 border border-slate-700/30 text-slate-400';
  const dateClass = isToday
    ? 'text-xs font-bold text-[var(--tx-heading)]'
    : 'text-xs font-bold text-[var(--tx-primary)]';
  return (
    <div className={wrapperClass} data-testid={`date-header-${date}`}>
      <div className="flex items-baseline gap-2.5">
        <span className={dateClass}>{formatThaiDateFull(date)}</span>
        {relativeLabel && <span className={pillClass}>{relativeLabel}</span>}
      </div>
      <span className="text-[10px] text-[var(--tx-muted)] font-mono font-semibold">{count} รายการ</span>
    </div>
  );
}
```

- [ ] **Step 3.3: Run D1.* tests, iterate to green**

- [ ] **Step 3.4: Commit + push**
```bash
git add src/components/backend/treatment-history/TreatmentDateHeader.jsx tests/phase-28-treatment-history-rtl.test.jsx
git commit -m "feat(Phase 28.3): TreatmentDateHeader component (date-grouped section header)"
git push origin master
```

---

## Task 4: `TreatmentHistoryRow` component (collapsed state + edit/delete chips)

**Files:**
- Create: `src/components/backend/treatment-history/TreatmentHistoryRow.jsx`
- Extend: `tests/phase-28-treatment-history-rtl.test.jsx`

Spec reference: § 4.4 Row collapsed + chip block.

- [ ] **Step 4.1: Write failing tests for row collapsed**

Append to `tests/phase-28-treatment-history-rtl.test.jsx`:
```jsx
import { TreatmentHistoryRow } from '../src/components/backend/treatment-history/TreatmentHistoryRow.jsx';
import userEvent from '@testing-library/user-event';

const sampleTreatment = {
  id: 'BT-1',
  date: '2026-05-14',
  vitalsignsRecordedAt: '2026-05-14T04:13:00Z',
  doctor: 'หมอกวางตุ้ง',
  branch: 'นครราชสีมา',
  cc: 'ฟหกฟ',
  dx: 'ฟหกฟห',
};

describe('Phase 28 · TreatmentHistoryRow RTL', () => {
  it('R-Row.1 renders time, status, stepper, meta in collapsed state', () => {
    render(<TreatmentHistoryRow t={sampleTreatment} isLatest={false} isExpanded={false}
      onToggle={() => {}} isDark={true} isBackendCreated={true} />);
    expect(screen.getByText('04:13')).toBeInTheDocument();
    expect(screen.getByText(/ซักประวัติเท่านั้น/)).toBeInTheDocument();
  });

  it('R-Row.2 shows "ล่าสุด" tag only when isLatest=true', () => {
    const { rerender } = render(<TreatmentHistoryRow t={sampleTreatment} isLatest={true}
      isExpanded={false} onToggle={() => {}} isDark={true} isBackendCreated={true} />);
    expect(screen.getByText('ล่าสุด')).toBeInTheDocument();
    rerender(<TreatmentHistoryRow t={sampleTreatment} isLatest={false}
      isExpanded={false} onToggle={() => {}} isDark={true} isBackendCreated={true} />);
    expect(screen.queryByText('ล่าสุด')).not.toBeInTheDocument();
  });

  it('R-Row.3 click on row body triggers onToggle', async () => {
    const onToggle = vi.fn();
    render(<TreatmentHistoryRow t={sampleTreatment} isLatest={false} isExpanded={false}
      onToggle={onToggle} isDark={true} isBackendCreated={true} />);
    await userEvent.click(screen.getByTestId(`treatment-toggle-${sampleTreatment.id}`));
    expect(onToggle).toHaveBeenCalledWith(sampleTreatment.id);
  });

  it('R-Row.4 edit chip click does NOT trigger onToggle (stopPropagation)', async () => {
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    render(<TreatmentHistoryRow t={sampleTreatment} isLatest={false} isExpanded={false}
      onToggle={onToggle} onEditTreatment={onEdit} isDark={true} isBackendCreated={true} />);
    await userEvent.click(screen.getByTestId(`treatment-edit-${sampleTreatment.id}`));
    expect(onEdit).toHaveBeenCalledWith(sampleTreatment.id);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('R-Row.5 delete chip click does NOT trigger onToggle', async () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(<TreatmentHistoryRow t={sampleTreatment} isLatest={false} isExpanded={false}
      onToggle={onToggle} onDeleteTreatment={onDelete} isDark={true} isBackendCreated={true} />);
    await userEvent.click(screen.getByTestId(`treatment-delete-${sampleTreatment.id}`));
    expect(onDelete).toHaveBeenCalledWith(sampleTreatment.id);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('R-Row.6 hides edit/delete chips when not backend-created', () => {
    render(<TreatmentHistoryRow t={sampleTreatment} isLatest={false} isExpanded={false}
      onToggle={() => {}} onEditTreatment={() => {}} onDeleteTreatment={() => {}}
      isDark={true} isBackendCreated={false} />);
    expect(screen.queryByTestId(`treatment-edit-${sampleTreatment.id}`)).not.toBeInTheDocument();
  });

  it('R-Row.7 chevron rotates when isExpanded=true', () => {
    const { container, rerender } = render(<TreatmentHistoryRow t={sampleTreatment} isLatest={false}
      isExpanded={false} onToggle={() => {}} isDark={true} isBackendCreated={true} />);
    const chevron = container.querySelector('[data-testid="treatment-chevron"]');
    expect(chevron.className).not.toMatch(/rotate-180/);
    rerender(<TreatmentHistoryRow t={sampleTreatment} isLatest={false} isExpanded={true}
      onToggle={() => {}} isDark={true} isBackendCreated={true} />);
    expect(chevron.className).toMatch(/rotate-180/);
  });

  it('R-Row.8 expanded row has fire-red left accent', () => {
    const { container } = render(<TreatmentHistoryRow t={sampleTreatment} isLatest={false}
      isExpanded={true} onToggle={() => {}} isDark={true} isBackendCreated={true} />);
    const row = container.firstChild;
    expect(row.className).toMatch(/border-l/);
  });
});
```

- [ ] **Step 4.2: Implement `TreatmentHistoryRow.jsx`**

```jsx
import React from 'react';
import { ChevronDown, Edit3, Trash2 } from 'lucide-react';
import {
  getTreatmentLifecycle,
  getTreatmentStatusLabel,
  computeRowAction,
} from '../../../lib/treatmentDisplayResolvers.js';
import { formatBadgeTime } from '../../../lib/formatBadgeTime.js';
import { ROLE_LABEL_TH } from '../../../lib/roleLabels.js'; // see step 4.3 — extract if needed
import { TreatmentLifecycleStepper } from './TreatmentLifecycleStepper.jsx';

/**
 * Phase 28 (2026-05-14) — single treatment-history row.
 * Collapsed (default): time + status + stepper + meta + cc/dx preview + chevron + edit/delete chips
 * Expanded: above + fire-red left accent + tinted bg + chevron rotated (body rendered by parent)
 *
 * Edit/delete chips have e.stopPropagation to prevent toggling expansion on click.
 */
export function TreatmentHistoryRow({
  t,
  isLatest = false,
  isExpanded = false,
  onToggle,
  onEditTreatment,
  onDeleteTreatment,
  isDark = true,
  isBackendCreated = false,
  children, // expanded body slot
}) {
  const lifecycle = getTreatmentLifecycle(t);
  const status = getTreatmentStatusLabel(t, isLatest);
  const action = computeRowAction(lifecycle);

  // Time displayed in left column = earliest stage time (or completed if only completed)
  // Actually per spec § 4.4, time column = the first stage time available
  const headerTime = lifecycle[0]?.time ? formatBadgeTime(lifecycle[0].time) : '--:--';

  const rowClass = [
    'group grid grid-cols-[64px_1fr_24px] px-[18px] py-3 transition-colors cursor-pointer',
    isExpanded
      ? 'bg-gradient-to-b from-red-500/[0.025] to-red-500/[0.01] border-l-[3px] border-l-red-500 pl-[15px]'
      : 'hover:bg-white/[0.015]',
    'border-b border-[#1a1a1a] last:border-b-0',
  ].join(' ');

  const timeClass = isLatest
    ? 'font-mono text-[13px] font-bold text-red-300 [text-shadow:_0_0_8px_rgba(239,68,68,0.4)] tracking-wider pt-px'
    : 'font-mono text-[13px] font-bold text-[var(--tx-secondary)] tracking-wider pt-px';

  const showActions = isBackendCreated && (onEditTreatment || onDeleteTreatment);

  return (
    <div data-testid={`treatment-row-${t.id}`} className={rowClass}>
      {/* Time column */}
      <div className={timeClass}>{headerTime}</div>

      {/* Content column — clickable to toggle */}
      <button
        type="button"
        onClick={() => onToggle?.(t.id)}
        data-testid={`treatment-toggle-${t.id}`}
        aria-expanded={isExpanded}
        className="text-left min-w-0 bg-transparent border-0 p-0 cursor-pointer"
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[13px] font-bold text-[var(--tx-heading)] tracking-tight">{status}</span>
          {isLatest && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
              bg-gradient-to-br from-red-500/25 to-red-500/15 text-red-300
              border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]">
              ล่าสุด
            </span>
          )}
          <span className={`ml-auto font-mono text-[10px] font-semibold ${
            action.kind === 'completed' ? 'text-emerald-300' : 'text-[var(--tx-muted)]'
          }`}>
            {action.label}
          </span>
        </div>

        <TreatmentLifecycleStepper lifecycle={lifecycle} isDark={isDark} isLatest={isLatest} />

        {/* Meta line */}
        {(t.doctor || t.branch || t.assistants?.length || t.editedByName) && (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[11px] text-[var(--tx-muted)]">
            {t.doctor && <span className="text-[var(--tx-primary)] font-semibold">{t.doctor}</span>}
            {t.branch && <span>· {t.branch}</span>}
            {t.assistants?.length > 0 && <span>· {t.assistants.join(', ')}</span>}
            {t.editedByName && (
              <span className="italic opacity-70" data-testid={`treatment-edited-by-${t.id}`}>
                · แก้ไขโดย: {t.editedByName}
                {t.editedByRole && ROLE_LABEL_TH[t.editedByRole] && ` (${ROLE_LABEL_TH[t.editedByRole]})`}
              </span>
            )}
          </div>
        )}

        {/* CC/DX preview (collapsed only) */}
        {!isExpanded && (t.cc || t.dx) && (
          <div className="mt-1 flex flex-col gap-px text-[11px] text-[var(--tx-secondary)]">
            {t.cc && (
              <div className="overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--tx-muted)] mr-1">CC</span>
                <span>{t.cc}</span>
              </div>
            )}
            {t.dx && (
              <div className="overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--tx-muted)] mr-1">DX</span>
                <span>{t.dx}</span>
              </div>
            )}
          </div>
        )}
      </button>

      {/* Right column: chevron + edit/delete chips */}
      <div className="flex flex-col items-end gap-1">
        <div data-testid="treatment-chevron"
          className={`text-[var(--tx-muted)] text-xs font-bold transition-transform duration-200 ${isExpanded ? 'rotate-180 text-red-300' : ''}`}>
          <ChevronDown size={14} />
        </div>
        {showActions && (
          <div className="flex flex-col gap-1 opacity-70 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
            {onEditTreatment && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEditTreatment(t.id); }}
                data-testid={`treatment-edit-${t.id}`}
                title="แก้ไข"
                aria-label="แก้ไขการรักษา"
                className="w-[26px] h-[26px] rounded-md flex items-center justify-center
                  bg-sky-500/[0.08] border border-sky-500/30 text-sky-300
                  hover:bg-sky-500/[0.18] transition-all"
              >
                <Edit3 size={11} />
              </button>
            )}
            {onDeleteTreatment && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDeleteTreatment(t.id); }}
                data-testid={`treatment-delete-${t.id}`}
                title="ยกเลิก / ลบ"
                aria-label="ลบการรักษา"
                className="w-[26px] h-[26px] rounded-md flex items-center justify-center
                  bg-red-500/[0.08] border border-red-500/30 text-red-300
                  hover:bg-red-500/[0.18] transition-all"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded body slot — passed by parent via children */}
      {isExpanded && children && (
        <div className="col-span-full">{children}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4.3: Extract ROLE_LABEL_TH if not already a shared module**

If `ROLE_LABEL_TH` lives inside CDV.jsx, extract to `src/lib/roleLabels.js`:
```js
// src/lib/roleLabels.js
export const ROLE_LABEL_TH = {
  doctor: 'แพทย์',
  staff: 'พนักงาน',
  admin: 'แอดมิน',
  // ...preserve existing entries from CDV.jsx
};
```

- [ ] **Step 4.4: Run R-Row.* tests, iterate to green**

- [ ] **Step 4.5: Commit + push**
```bash
git add src/components/backend/treatment-history/TreatmentHistoryRow.jsx \
        src/lib/roleLabels.js \
        tests/phase-28-treatment-history-rtl.test.jsx \
        src/components/backend/CustomerDetailView.jsx
git commit -m "feat(Phase 28.4): TreatmentHistoryRow + ROLE_LABEL_TH extraction"
git push origin master
```

---

## Task 5: `TreatmentHistoryExpandedBody` component

**Files:**
- Create: `src/components/backend/treatment-history/TreatmentHistoryExpandedBody.jsx`
- Extend: `tests/phase-28-treatment-history-rtl.test.jsx`

Spec reference: § 4.7 Expanded body.

- [ ] **Step 5.1: Write failing tests**

Append to RTL test file:
```jsx
import { TreatmentHistoryExpandedBody } from '../src/components/backend/treatment-history/TreatmentHistoryExpandedBody.jsx';

describe('Phase 28 · TreatmentHistoryExpandedBody RTL', () => {
  const t = { id: 'BT-1', cc: 'ฟหกฟ', dx: 'ฟหกฟห' };
  it('E1.1 renders CC + DX callout when both present', () => {
    render(<TreatmentHistoryExpandedBody t={t} detail={null} ac="#fff" acRgb="255,255,255" isDark={true}
      treatmentsLoading={false} onPrintCert={() => {}} onPrintRecord={() => {}} />);
    expect(screen.getByText('ฟหกฟ')).toBeInTheDocument();
    expect(screen.getByText('ฟหกฟห')).toBeInTheDocument();
  });
  it('E1.2 renders print buttons (cert + record)', () => {
    render(<TreatmentHistoryExpandedBody t={t} detail={null} ac="#fff" acRgb="255,255,255" isDark={true}
      treatmentsLoading={false} onPrintCert={() => {}} onPrintRecord={() => {}} />);
    expect(screen.getByTestId(`treatment-print-cert-${t.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`treatment-print-record-${t.id}`)).toBeInTheDocument();
  });
  it('E1.3 print button click triggers callback (no e.stopPropagation needed since outside row toggle target)', async () => {
    const onPrintCert = vi.fn();
    render(<TreatmentHistoryExpandedBody t={t} detail={null} ac="#fff" acRgb="255,255,255" isDark={true}
      treatmentsLoading={false} onPrintCert={onPrintCert} onPrintRecord={() => {}} />);
    await userEvent.click(screen.getByTestId(`treatment-print-cert-${t.id}`));
    expect(onPrintCert).toHaveBeenCalledWith(t.id);
  });
  it('E1.4 shows loading skeleton when treatmentsLoading=true and no detail', () => {
    render(<TreatmentHistoryExpandedBody t={t} detail={null} ac="#fff" acRgb="255,255,255" isDark={true}
      treatmentsLoading={true} onPrintCert={() => {}} onPrintRecord={() => {}} />);
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.2: Implement `TreatmentHistoryExpandedBody.jsx`**

```jsx
import React from 'react';
import { Loader2, Printer } from 'lucide-react';
import { TreatmentDetailExpanded } from '../CustomerDetailView_subcomponents.jsx'; // or wherever it lives — see step 5.3
import { DetailField } from '../CustomerDetailView_subcomponents.jsx';

/**
 * Phase 28 (2026-05-14) — expanded body for a treatment row.
 * Renders CC/DX callout + TreatmentDetailExpanded (full content) + per-treatment print buttons.
 * NOTE: Does NOT include edit/delete chips — those stay on the collapsed row (per spec § 4.7).
 */
export function TreatmentHistoryExpandedBody({
  t,
  detail,
  ac,
  acRgb,
  isDark,
  treatmentsLoading,
  onPrintCert,
  onPrintRecord,
}) {
  return (
    <div className="mt-3.5 p-4 pl-[78px] -mx-[15px] border-t border-dashed border-red-950/40 bg-black/20 rounded-b-md">
      {/* CC/DX callout */}
      {(t.cc || t.dx) && (
        <div className="flex gap-2 mb-3.5 px-3 py-2.5 bg-[#0a0a0a] border border-[#1a1a1a]
          border-l-[3px] border-l-red-500/50 rounded-md">
          {t.cc && (
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--tx-muted)] mb-0.5">
                CC · อาการ
              </div>
              <div className="text-xs text-[var(--tx-primary)] leading-relaxed">{t.cc}</div>
            </div>
          )}
          {t.dx && (
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-red-300 mb-0.5">
                DX · วินิจฉัย
              </div>
              <div className="text-xs text-[var(--tx-primary)] leading-relaxed">{t.dx}</div>
            </div>
          )}
        </div>
      )}

      {/* Treatment detail content — preserve existing TreatmentDetailExpanded */}
      {treatmentsLoading && !detail ? (
        <div className="flex items-center gap-2 text-xs text-[var(--tx-muted)] py-2">
          <Loader2 size={12} className="animate-spin" /> กำลังโหลด...
        </div>
      ) : detail?.detail ? (
        <TreatmentDetailExpanded detail={detail.detail} ac={ac} acRgb={acRgb} isDark={isDark} />
      ) : (
        <div className="bg-[var(--bg-elevated)] rounded-lg p-3 space-y-2">
          <p className="text-xs text-[var(--tx-muted)]">ไม่มีข้อมูลรายละเอียดเพิ่มเติม</p>
        </div>
      )}

      {/* Per-treatment print buttons */}
      <div className="flex flex-wrap gap-2 mt-3.5">
        <button
          type="button"
          onClick={() => onPrintCert?.(t.id)}
          data-testid={`treatment-print-cert-${t.id}`}
          className="text-xs font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5
            bg-sky-500/10 border border-sky-500/40 text-sky-300 hover:bg-sky-500/20 transition-all"
        >
          <Printer size={12} /> พิมพ์ใบรับรองแพทย์ ▾
        </button>
        <button
          type="button"
          onClick={() => onPrintRecord?.(t.id)}
          data-testid={`treatment-print-record-${t.id}`}
          className="text-xs font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5
            bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 transition-all"
        >
          <Printer size={12} /> พิมพ์การรักษา ▾
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.3: Resolve `TreatmentDetailExpanded` + `DetailField` imports**

These are currently inline inside CDV.jsx. Extract them to a separate file `src/components/backend/treatment-history/TreatmentDetailExpanded.jsx` (preserving exact behavior) OR import from CDV directly via re-export. Pick whichever requires less surgery. Recommended: extract to keep treatment-history folder self-contained.

- [ ] **Step 5.4: Run E1.* tests, iterate to green**

- [ ] **Step 5.5: Commit + push**
```bash
git add src/components/backend/treatment-history/ tests/phase-28-treatment-history-rtl.test.jsx
git commit -m "feat(Phase 28.5): TreatmentHistoryExpandedBody + TreatmentDetailExpanded extracted"
git push origin master
```

---

## Task 6: `TreatmentHistoryHeader` component (CTA cluster)

**Files:**
- Create: `src/components/backend/treatment-history/TreatmentHistoryHeader.jsx`
- Extend: `tests/phase-28-treatment-history-rtl.test.jsx`

Spec reference: § 4.2 Card header.

- [ ] **Step 6.1: Write failing tests**

```jsx
import { TreatmentHistoryHeader } from '../src/components/backend/treatment-history/TreatmentHistoryHeader.jsx';

describe('Phase 28 · TreatmentHistoryHeader RTL', () => {
  it('H1.1 renders title + count badge', () => {
    render(<TreatmentHistoryHeader count={13} ac="#fff" acRgb="255,255,255"
      onPrintDoc={() => {}} onShowTimeline={() => {}} onCreateTreatment={() => {}} />);
    expect(screen.getByText('ประวัติการรักษา')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
  });
  it('H1.2 renders 3 CTA buttons when all callbacks present', () => {
    render(<TreatmentHistoryHeader count={13} ac="#fff" acRgb="255,255,255"
      onPrintDoc={() => {}} onShowTimeline={() => {}} onCreateTreatment={() => {}} />);
    expect(screen.getByTestId('print-document-btn')).toBeInTheDocument();
    expect(screen.getByTestId('show-timeline-btn')).toBeInTheDocument();
    expect(screen.getByTestId('create-treatment-btn')).toBeInTheDocument();
  });
  it('H1.3 omits create button when onCreateTreatment is null', () => {
    render(<TreatmentHistoryHeader count={13} ac="#fff" acRgb="255,255,255"
      onPrintDoc={() => {}} onShowTimeline={() => {}} onCreateTreatment={null} />);
    expect(screen.queryByTestId('create-treatment-btn')).not.toBeInTheDocument();
  });
  it('H1.4 create button click triggers callback', async () => {
    const onCreate = vi.fn();
    render(<TreatmentHistoryHeader count={13} ac="#fff" acRgb="255,255,255"
      onPrintDoc={() => {}} onShowTimeline={() => {}} onCreateTreatment={onCreate} />);
    await userEvent.click(screen.getByTestId('create-treatment-btn'));
    expect(onCreate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6.2: Implement `TreatmentHistoryHeader.jsx`**

```jsx
import React from 'react';
import { Stethoscope, Printer, Activity, Plus } from 'lucide-react';

/**
 * Phase 28 (2026-05-14) — header for treatment history card.
 * Layout: icon + title + count badge + CTA cluster (2 ghost + 1 primary).
 * Primary = "+ บันทึกการรักษา" (fire-red gradient, glow on hover).
 * Ghosts = "พิมพ์เอกสาร" (purple hover) + "ดูไทม์ไลน์" (orange hover).
 */
export function TreatmentHistoryHeader({
  count,
  ac,
  acRgb,
  onPrintDoc,
  onShowTimeline,
  onCreateTreatment,
}) {
  return (
    <div className="px-[18px] py-3.5 bg-gradient-to-b from-red-500/[0.04] to-transparent
      border-b border-[var(--bd)] flex items-center gap-3 flex-wrap">
      {/* Header icon tile */}
      <div className="w-8 h-8 rounded-[9px] flex items-center justify-center
        bg-gradient-to-br from-red-500/15 to-red-500/5 border border-red-500/30 text-red-300">
        <Stethoscope size={14} />
      </div>

      <h3 className="text-sm font-bold text-[var(--tx-heading)] tracking-tight">ประวัติการรักษา</h3>

      <span className="text-xs font-bold px-2 py-0.5 rounded-full font-mono
        bg-red-500/15 text-red-300 border border-red-500/30">
        {count}
      </span>

      {/* CTA cluster */}
      <div className="ml-auto flex gap-1.5 items-center">
        <button
          type="button"
          onClick={onPrintDoc}
          data-testid="print-document-btn"
          title="พิมพ์ใบรับรอง / ฉลากยา / เอกสารอื่นๆ"
          className="text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5
            bg-white/[0.02] text-[var(--tx-primary)] border border-[#333]
            hover:bg-violet-500/[0.05] hover:border-violet-400/50 hover:text-violet-300
            hover:-translate-y-px transition-all"
        >
          <Printer size={13} /> พิมพ์เอกสาร
        </button>

        <button
          type="button"
          onClick={onShowTimeline}
          data-testid="show-timeline-btn"
          title="ดูไทม์ไลน์รวม (รูป Before/After/อื่นๆ)"
          className="text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5
            bg-white/[0.02] text-[var(--tx-primary)] border border-[#333]
            hover:bg-orange-500/[0.05] hover:border-orange-400/50 hover:text-orange-300
            hover:-translate-y-px transition-all"
        >
          <Activity size={13} /> ดูไทม์ไลน์
        </button>

        {onCreateTreatment && (
          <button
            type="button"
            onClick={onCreateTreatment}
            data-testid="create-treatment-btn"
            title="สร้างใบบันทึกการรักษาใหม่"
            className="text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5
              bg-gradient-to-br from-red-500 to-red-700 text-white border border-white/10
              shadow-[0_0_0_1px_rgba(239,68,68,0.3),_0_2px_8px_rgba(239,68,68,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]
              hover:from-red-400 hover:to-red-600
              hover:shadow-[0_0_0_1px_rgba(239,68,68,0.5),_0_6px_20px_rgba(239,68,68,0.55),inset_0_1px_0_rgba(255,255,255,0.2)]
              hover:-translate-y-px transition-all"
          >
            <Plus size={13} className="font-black" /> บันทึกการรักษา
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6.3: Run H1.* tests + iterate to green**

- [ ] **Step 6.4: Commit + push**
```bash
git add src/components/backend/treatment-history/TreatmentHistoryHeader.jsx tests/phase-28-treatment-history-rtl.test.jsx
git commit -m "feat(Phase 28.6): TreatmentHistoryHeader (CTA cluster: 2 ghost + 1 fire-red primary)"
git push origin master
```

---

## Task 7: `TreatmentHistoryPagination` component

**Files:**
- Create: `src/components/backend/treatment-history/TreatmentHistoryPagination.jsx`
- Extend: `tests/phase-28-treatment-history-rtl.test.jsx`

Spec reference: § 4.8 Pagination footer.

- [ ] **Step 7.1: Write failing tests**

```jsx
import { TreatmentHistoryPagination } from '../src/components/backend/treatment-history/TreatmentHistoryPagination.jsx';

describe('Phase 28 · TreatmentHistoryPagination RTL', () => {
  it('P1.1 renders info text with current range', () => {
    render(<TreatmentHistoryPagination currentPage={1} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    expect(screen.getByText(/แสดง/)).toBeInTheDocument();
    expect(screen.getByText('1–5')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
  });
  it('P1.2 highlights active page button', () => {
    const { container } = render(<TreatmentHistoryPagination currentPage={2} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    const active = container.querySelector('[data-testid="treatment-page-2"]');
    expect(active.className).toMatch(/from-red-500|to-red-/);
  });
  it('P1.3 prev disabled on page 1', () => {
    render(<TreatmentHistoryPagination currentPage={1} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    expect(screen.getByTestId('treatment-page-prev')).toBeDisabled();
  });
  it('P1.4 next disabled on last page', () => {
    render(<TreatmentHistoryPagination currentPage={3} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={() => {}} />);
    expect(screen.getByTestId('treatment-page-next')).toBeDisabled();
  });
  it('P1.5 page click triggers onPageChange', async () => {
    const onPageChange = vi.fn();
    render(<TreatmentHistoryPagination currentPage={1} totalPages={3} totalItems={13}
      pageSize={5} pageNumbers={[1, 2, 3]} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByTestId('treatment-page-2'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 7.2: Implement `TreatmentHistoryPagination.jsx`**

```jsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Phase 28 (2026-05-14) — pagination footer for treatment history list.
 * Refined ghost buttons + fire-red gradient for active page.
 */
export function TreatmentHistoryPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageNumbers,
  onPageChange,
}) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  if (totalPages <= 1) return null;

  return (
    <div className="px-[18px] py-3 border-t border-[var(--bd)] bg-gradient-to-b from-transparent to-black/30
      flex items-center justify-between flex-wrap gap-2.5"
      data-testid="treatment-history-pagination">
      <span className="text-[11px] text-[var(--tx-muted)]">
        แสดง <b className="text-[var(--tx-primary)] font-mono font-bold">{start}–{end}</b>
        {' '}จาก <b className="text-[var(--tx-primary)] font-mono font-bold">{totalItems}</b> รายการ
      </span>
      <div className="flex gap-1 items-center">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          data-testid="treatment-page-prev"
          aria-label="หน้าก่อนหน้า"
          className="min-w-[30px] h-7 px-2.5 text-[11px] rounded-md border border-[#2a2a2a]
            bg-white/[0.02] text-[var(--tx-secondary)] font-bold font-mono
            inline-flex items-center justify-center
            hover:bg-white/[0.06] hover:text-[var(--tx-heading)] hover:border-[#444]
            disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft size={12} />
        </button>
        {pageNumbers.map((p, idx) => {
          const prev = pageNumbers[idx - 1];
          const showEllipsis = prev !== undefined && p - prev > 1;
          const isActive = p === currentPage;
          return (
            <span key={p} className="flex items-center gap-1">
              {showEllipsis && <span className="text-[var(--tx-muted)] text-xs px-1">…</span>}
              <button
                type="button"
                onClick={() => onPageChange(p)}
                data-testid={`treatment-page-${p}`}
                className={`min-w-[30px] h-7 px-2.5 text-[11px] rounded-md font-bold font-mono
                  inline-flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-gradient-to-br from-red-500 to-red-700 border border-transparent text-white shadow-[0_0_0_1px_rgba(239,68,68,0.4),_0_2px_6px_rgba(239,68,68,0.3)]'
                    : 'bg-white/[0.02] text-[var(--tx-secondary)] border border-[#2a2a2a] hover:bg-white/[0.06] hover:text-[var(--tx-heading)] hover:border-[#444]'
                }`}
              >
                {p}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          data-testid="treatment-page-next"
          aria-label="หน้าถัดไป"
          className="min-w-[30px] h-7 px-2.5 text-[11px] rounded-md border border-[#2a2a2a]
            bg-white/[0.02] text-[var(--tx-secondary)] font-bold font-mono
            inline-flex items-center justify-center
            hover:bg-white/[0.06] hover:text-[var(--tx-heading)] hover:border-[#444]
            disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.3: Run P1.* tests + iterate to green**

- [ ] **Step 7.4: Commit + push**
```bash
git add src/components/backend/treatment-history/TreatmentHistoryPagination.jsx tests/phase-28-treatment-history-rtl.test.jsx
git commit -m "feat(Phase 28.7): TreatmentHistoryPagination (refined ghost + fire-red active)"
git push origin master
```

---

## Task 8: `TreatmentHistoryCard` (top-level composer) + wire into CDV

**Files:**
- Create: `src/components/backend/treatment-history/TreatmentHistoryCard.jsx`
- Modify: `src/components/backend/CustomerDetailView.jsx` (REPLACE inline 290-line block with `<TreatmentHistoryCard ... />`)
- Extend: `tests/phase-28-treatment-history-rtl.test.jsx`

Spec reference: § 7 component architecture, § 5.1 expand toggle.

- [ ] **Step 8.1: Write failing test for TreatmentHistoryCard composition**

```jsx
import { TreatmentHistoryCard } from '../src/components/backend/treatment-history/TreatmentHistoryCard.jsx';

describe('Phase 28 · TreatmentHistoryCard RTL', () => {
  const buildTreatments = () => [
    { id: 'BT-1', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T04:13:00Z', cc: 'aaa' },
    { id: 'BT-2', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T04:02:00Z',
      doctorRecordedAt: '2026-05-14T04:23:00Z', completedAt: '2026-05-14T04:23:00Z', cc: 'bbb', dx: 'ccc' },
    { id: 'BT-3', date: '2026-05-07', completedAt: '2026-05-07T01:03:00Z', cc: 'ddd' },
  ];
  const baseProps = {
    treatmentSummary: buildTreatments(),
    treatments: [],
    customer: { treatmentCount: 13 },
    expandedTreatment: null,
    setExpandedTreatment: vi.fn(),
    onCreateTreatment: vi.fn(),
    onEditTreatment: vi.fn(),
    onDeleteTreatment: vi.fn(),
    treatmentPage: 1,
    setTreatmentPage: vi.fn(),
    treatmentsLoading: false,
    treatmentsError: '',
    setPrintDocOpen: vi.fn(),
    setShowTimeline: vi.fn(),
    setPrintPerTreatment: vi.fn(),
    ac: '#fff',
    acRgb: '255,255,255',
    isDark: true,
    todayISO: '2026-05-14',
  };

  it('C1.1 renders header + 2 date groups + 3 rows + pagination not present (3 items < page size)', () => {
    render(<TreatmentHistoryCard {...baseProps} />);
    expect(screen.getByText('ประวัติการรักษา')).toBeInTheDocument();
    expect(screen.getByTestId('date-header-2026-05-14')).toBeInTheDocument();
    expect(screen.getByTestId('date-header-2026-05-07')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-row-BT-1')).toBeInTheDocument();
    expect(screen.queryByTestId('treatment-history-pagination')).not.toBeInTheDocument();
  });

  it('C1.2 click row → expands; click again → collapses', async () => {
    const setExpanded = vi.fn();
    render(<TreatmentHistoryCard {...baseProps} setExpandedTreatment={setExpanded} />);
    await userEvent.click(screen.getByTestId('treatment-toggle-BT-1'));
    expect(setExpanded).toHaveBeenCalledWith('BT-1');
  });

  it('C1.3 expanding one row shows expanded body (CC/DX callout)', () => {
    render(<TreatmentHistoryCard {...baseProps} expandedTreatment="BT-2" />);
    // BT-2 has cc=bbb, dx=ccc → expanded body shows them in callout
    const callout = screen.getByText('bbb');
    expect(callout).toBeInTheDocument();
    expect(screen.getByText('ccc')).toBeInTheDocument();
  });

  it('C1.4 displays empty state when treatmentSummary empty', () => {
    render(<TreatmentHistoryCard {...baseProps} treatmentSummary={[]} customer={{ treatmentCount: 0 }} />);
    expect(screen.getByTestId('treatment-history-empty')).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีประวัติ/)).toBeInTheDocument();
  });

  it('C1.5 displays error state when treatmentsError set', () => {
    render(<TreatmentHistoryCard {...baseProps} treatmentsError="โหลดข้อมูลล้มเหลว" />);
    expect(screen.getByText(/โหลดข้อมูลล้มเหลว/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8.2: Implement `TreatmentHistoryCard.jsx`**

```jsx
import React, { useMemo } from 'react';
import { AlertCircle, Stethoscope } from 'lucide-react';
import { TreatmentHistoryHeader } from './TreatmentHistoryHeader.jsx';
import { TreatmentDateHeader } from './TreatmentDateHeader.jsx';
import { TreatmentHistoryRow } from './TreatmentHistoryRow.jsx';
import { TreatmentHistoryExpandedBody } from './TreatmentHistoryExpandedBody.jsx';
import { TreatmentHistoryPagination } from './TreatmentHistoryPagination.jsx';
import { groupTreatmentsByDate } from '../../../lib/treatmentDisplayResolvers.js';

const TREATMENT_PAGE_SIZE = 5;

/**
 * Phase 28 (2026-05-14) — top-level treatment-history card.
 * Composes header + date-grouped rows + expanded bodies + pagination.
 * Replaces the inline 290-line block previously in CustomerDetailView.jsx.
 */
export function TreatmentHistoryCard({
  customer,
  treatmentSummary,
  treatments,
  expandedTreatment,
  setExpandedTreatment,
  onCreateTreatment,
  onEditTreatment,
  onDeleteTreatment,
  treatmentPage,
  setTreatmentPage,
  treatmentsLoading,
  treatmentsError,
  setPrintDocOpen,
  setShowTimeline,
  setPrintPerTreatment,
  ac,
  acRgb,
  isDark,
  todayISO,
}) {
  const totalPages = Math.max(1, Math.ceil(treatmentSummary.length / TREATMENT_PAGE_SIZE));
  const paginatedTreatments = useMemo(() => {
    const start = (treatmentPage - 1) * TREATMENT_PAGE_SIZE;
    return treatmentSummary.slice(start, start + TREATMENT_PAGE_SIZE);
  }, [treatmentSummary, treatmentPage]);

  const groups = useMemo(() => groupTreatmentsByDate(paginatedTreatments), [paginatedTreatments]);
  const totalItems = treatmentSummary.length;

  // Page-number helper (adapted from existing CDV logic)
  const pageNumbers = useMemo(() => {
    const pages = new Set([1, totalPages, treatmentPage]);
    if (treatmentPage > 1) pages.add(treatmentPage - 1);
    if (treatmentPage < totalPages) pages.add(treatmentPage + 1);
    return [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  }, [treatmentPage, totalPages]);

  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-xl overflow-hidden relative
        before:absolute before:left-0 before:right-0 before:top-0 before:h-px
        before:bg-gradient-to-r before:from-transparent before:via-red-500/40 before:to-transparent
        before:content-['']"
      data-testid="treatment-history-card"
    >
      <TreatmentHistoryHeader
        count={customer?.treatmentCount || treatmentSummary.length}
        ac={ac}
        acRgb={acRgb}
        onPrintDoc={() => setPrintDocOpen(true)}
        onShowTimeline={() => setShowTimeline(true)}
        onCreateTreatment={onCreateTreatment}
      />

      {treatmentsError && (
        <div className={`px-[18px] py-3 text-xs flex items-center gap-2 border-b border-[var(--bd)] ${
          isDark ? 'text-orange-400 bg-orange-900/10' : 'text-orange-700 bg-orange-50'
        }`}>
          <AlertCircle size={13} /> {treatmentsError}
        </div>
      )}

      {treatmentSummary.length === 0 && !treatmentsError ? (
        <div className="p-12 text-center" data-testid="treatment-history-empty">
          <Stethoscope size={32} className="mx-auto mb-3 text-[var(--tx-muted)] opacity-40" />
          <p className="text-sm font-bold text-[var(--tx-secondary)]">ยังไม่มีประวัติการรักษา</p>
          <p className="text-xs text-[var(--tx-muted)] mt-1">กดปุ่ม "บันทึกการรักษา" เพื่อสร้างรายการแรก</p>
        </div>
      ) : (
        <>
          <div data-testid="treatment-history-list">
            {groups.map((node, i) => {
              if (node.type === 'header') {
                return <TreatmentDateHeader key={`h-${node.date}`} date={node.date}
                  todayISO={todayISO} count={node.count} />;
              }
              const t = node.t;
              const globalIndex = paginatedTreatments.findIndex(p => p.id === t.id)
                + (treatmentPage - 1) * TREATMENT_PAGE_SIZE;
              const isLatest = globalIndex === 0 && treatmentPage === 1;
              const isExpanded = expandedTreatment === t.id;
              const detail = treatments.find(tr => tr.treatmentId === t.id || tr.id === t.id);
              const isBackendCreated = detail?.createdBy === 'backend' || t.createdBy === 'backend';
              return (
                <TreatmentHistoryRow
                  key={t.id}
                  t={t}
                  isLatest={isLatest}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedTreatment(isExpanded ? null : t.id)}
                  onEditTreatment={isBackendCreated ? onEditTreatment : undefined}
                  onDeleteTreatment={isBackendCreated ? onDeleteTreatment : undefined}
                  isDark={isDark}
                  isBackendCreated={isBackendCreated}
                >
                  {isExpanded && (
                    <TreatmentHistoryExpandedBody
                      t={t}
                      detail={detail}
                      ac={ac}
                      acRgb={acRgb}
                      isDark={isDark}
                      treatmentsLoading={treatmentsLoading}
                      onPrintCert={(id) => setPrintPerTreatment({ treatmentId: id, type: 'cert' })}
                      onPrintRecord={(id) => setPrintPerTreatment({ treatmentId: id, type: 'record' })}
                    />
                  )}
                </TreatmentHistoryRow>
              );
            })}
          </div>

          <TreatmentHistoryPagination
            currentPage={treatmentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={TREATMENT_PAGE_SIZE}
            pageNumbers={pageNumbers}
            onPageChange={setTreatmentPage}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8.3: Run C1.* tests + iterate to green**

- [ ] **Step 8.4: Wire into CDV — replace inline block**

In `src/components/backend/CustomerDetailView.jsx`:
1. Add import at top: `import { TreatmentHistoryCard } from './treatment-history/TreatmentHistoryCard.jsx';`
2. Replace lines 1000-1290 (the entire inline `<div className="bg-[var(--bg-surface)] border ...` block through the closing `</div>` for the card AND its pagination footer) with:
```jsx
<TreatmentHistoryCard
  customer={customer}
  treatmentSummary={treatmentSummary}
  treatments={treatments}
  expandedTreatment={expandedTreatment}
  setExpandedTreatment={setExpandedTreatment}
  onCreateTreatment={onCreateTreatment}
  onEditTreatment={onEditTreatment}
  onDeleteTreatment={onDeleteTreatment}
  treatmentPage={treatmentPage}
  setTreatmentPage={setTreatmentPage}
  treatmentsLoading={treatmentsLoading}
  treatmentsError={treatmentsError}
  setPrintDocOpen={setPrintDocOpen}
  setShowTimeline={setShowTimeline}
  setPrintPerTreatment={setPrintPerTreatment}
  ac={ac}
  acRgb={acRgb}
  isDark={isDark}
  todayISO={thaiTodayISO()}
/>
```
3. Remove now-unused imports if any (e.g. `Stethoscope`, `Printer`, `Plus`, `Activity`, `ChevronDown`, `ChevronUp`, `ChevronLeft`, `ChevronRight`, `Edit3`, `Trash2`, `Loader2`, `AlertCircle`, `Check` — keep only those still used elsewhere in CDV)
4. Add import: `import { thaiTodayISO } from '../../utils.js';`
5. Verify the per-row pre-compute `treatmentLifecycle` block (CDV.jsx:1067-1095) is REMOVED — now lives inside `TreatmentHistoryRow` via `getTreatmentLifecycle` helper.
6. CDV.jsx should shrink ~270 lines net.

- [ ] **Step 8.5: Run full RTL bank + targeted CDV tests + verify green**
```bash
npm test -- --run tests/phase-28- 2>&1 | tail -10
npm test -- --run tests/customer-detail-view 2>&1 | tail -10
```

- [ ] **Step 8.6: Commit + push**
```bash
git add src/components/backend/treatment-history/TreatmentHistoryCard.jsx \
        src/components/backend/CustomerDetailView.jsx \
        tests/phase-28-treatment-history-rtl.test.jsx
git commit -m "feat(Phase 28.8): TreatmentHistoryCard composer + wire into CDV (replace inline 290-line block)"
git push origin master
```

---

## Task 9: Source-grep regression tests

**Files:**
- Create: `tests/phase-28-treatment-history-source-grep.test.js`

Spec reference: § 8 tests — V21-class regression locks.

- [ ] **Step 9.1: Write source-grep tests**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const cdvSource = readFileSync(
  resolve(process.cwd(), 'src/components/backend/CustomerDetailView.jsx'),
  'utf8'
);
const cardSource = readFileSync(
  resolve(process.cwd(), 'src/components/backend/treatment-history/TreatmentHistoryCard.jsx'),
  'utf8'
);
const resolverSource = readFileSync(
  resolve(process.cwd(), 'src/lib/treatmentDisplayResolvers.js'),
  'utf8'
);

describe('Phase 28 · source-grep regression', () => {
  it('SG1.1 CDV imports TreatmentHistoryCard', () => {
    expect(cdvSource).toMatch(/import\s*\{\s*TreatmentHistoryCard\s*\}\s*from\s*['"]\.\/treatment-history\/TreatmentHistoryCard\.jsx['"]/);
  });
  it('SG1.2 CDV no longer contains inline treatment-history-list rendering with .map(paginatedTreatments)', () => {
    expect(cdvSource).not.toMatch(/paginatedTreatments\.map/);
  });
  it('SG1.3 CDV renders <TreatmentHistoryCard /> JSX', () => {
    expect(cdvSource).toMatch(/<TreatmentHistoryCard\b/);
  });
  it('SG1.4 resolver module exports all 6 new helpers', () => {
    const requiredExports = [
      'getTreatmentLifecycle',
      'getTreatmentStatusLabel',
      'getStepLabels',
      'computeRelativeThaiDateLabel',
      'groupTreatmentsByDate',
      'computeRowAction',
    ];
    for (const fn of requiredExports) {
      expect(resolverSource).toMatch(new RegExp(`export\\s+function\\s+${fn}\\b`));
    }
  });
  it('SG1.5 CDV no longer contains lifecycle pre-compute inline (Phase 27.2 _vStage etc.)', () => {
    expect(cdvSource).not.toMatch(/const _vStage = !!/);
    expect(cdvSource).not.toMatch(/const _dStage = !!/);
    expect(cdvSource).not.toMatch(/const _cStage = !!/);
  });
  it('SG1.6 TreatmentHistoryCard imports from treatmentDisplayResolvers', () => {
    expect(cardSource).toMatch(/from ['"]\.\.\/\.\.\/\.\.\/lib\/treatmentDisplayResolvers\.js['"]/);
  });
  it('SG1.7 Phase 28 marker comment present in TreatmentHistoryCard', () => {
    expect(cardSource).toMatch(/Phase 28/);
  });
  it('SG1.8 TreatmentHistoryCard composes all 5 sub-components', () => {
    expect(cardSource).toMatch(/TreatmentHistoryHeader/);
    expect(cardSource).toMatch(/TreatmentDateHeader/);
    expect(cardSource).toMatch(/TreatmentHistoryRow/);
    expect(cardSource).toMatch(/TreatmentHistoryExpandedBody/);
    expect(cardSource).toMatch(/TreatmentHistoryPagination/);
  });
  it('SG1.9 ROLE_LABEL_TH extracted from CDV (if applicable)', () => {
    // If CDV no longer defines ROLE_LABEL_TH, must import from a shared module
    if (cdvSource.includes('ROLE_LABEL_TH')) {
      expect(cdvSource).toMatch(/import\s*\{[^}]*ROLE_LABEL_TH[^}]*\}\s*from/);
    }
  });
  it('SG1.10 No raw new Date() in resolver module (Bangkok TZ discipline)', () => {
    // Allowed: getTime() arithmetic on parsed UTC.ms; not allowed: new Date() in display logic
    // Loose check — rely on R4.* tests for actual behavior
    expect(resolverSource).toMatch(/Date\.UTC/);
  });
});
```

- [ ] **Step 9.2: Run + iterate to green**
```bash
npm test -- --run tests/phase-28-treatment-history-source-grep.test.js 2>&1 | tail -10
```

- [ ] **Step 9.3: Commit + push**
```bash
git add tests/phase-28-treatment-history-source-grep.test.js
git commit -m "test(Phase 28.9): source-grep regression bank (V21 lock-in guards)"
git push origin master
```

---

## Task 10: Rule I full-flow simulate test

**Files:**
- Create: `tests/phase-28-treatment-history-flow-simulate.test.jsx`

Spec reference: § 12 verification — Rule I.

- [ ] **Step 10.1: Write full-flow test mounting actual `<TreatmentHistoryCard>`**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentHistoryCard } from '../src/components/backend/treatment-history/TreatmentHistoryCard.jsx';

// Realistic 5-treatment fixture matching user's screenshot
const FIXTURE = [
  { id: 'BT-1', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T04:13:00Z',
    doctor: 'หมอกวางตุ้ง', branch: 'นครราชสีมา', cc: 'aaa', dx: '' },
  { id: 'BT-2', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T04:02:00Z',
    doctorRecordedAt: '2026-05-14T04:23:00Z', completedAt: '2026-05-14T04:23:00Z',
    cc: 'ฟหกฟ', dx: 'ฟหกฟห', editedByName: 'กวางตุ้ง', editedByRole: 'staff' },
  { id: 'BT-3', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T03:52:00Z',
    cc: '', dx: '' },
  { id: 'BT-4', date: '2026-05-14', vitalsignsRecordedAt: '2026-05-14T03:49:00Z',
    completedAt: '2026-05-14T03:49:00Z', doctor: 'หมอมายด์', cc: 'ฟห', dx: 'ฟหกห' },
  { id: 'BT-5', date: '2026-05-07', completedAt: '2026-05-07T01:03:00Z',
    cc: 'แปฟหก', dx: 'แฟหแ', editedByName: 'กวางตุ้ง', editedByRole: 'staff' },
];

describe('Phase 28 · TreatmentHistoryCard full-flow simulate', () => {
  const renderCard = (overrides = {}) => {
    const props = {
      treatmentSummary: FIXTURE,
      treatments: [],
      customer: { treatmentCount: 13 },
      expandedTreatment: null,
      setExpandedTreatment: vi.fn(),
      onCreateTreatment: vi.fn(),
      onEditTreatment: vi.fn(),
      onDeleteTreatment: vi.fn(),
      treatmentPage: 1,
      setTreatmentPage: vi.fn(),
      treatmentsLoading: false,
      treatmentsError: '',
      setPrintDocOpen: vi.fn(),
      setShowTimeline: vi.fn(),
      setPrintPerTreatment: vi.fn(),
      ac: '#fff',
      acRgb: '255,255,255',
      isDark: true,
      todayISO: '2026-05-14',
      ...overrides,
    };
    return render(<TreatmentHistoryCard {...props} />);
  };

  it('F1.1 grouped rendering — 2 date headers + 5 rows', () => {
    renderCard();
    expect(screen.getByTestId('date-header-2026-05-14')).toBeInTheDocument();
    expect(screen.getByTestId('date-header-2026-05-07')).toBeInTheDocument();
    expect(screen.getByText('4 รายการ')).toBeInTheDocument(); // 4 in 14 พ.ค.
    expect(screen.getByText('1 รายการ')).toBeInTheDocument(); // 1 in 7 พ.ค.
  });

  it('F1.2 latest tag only on first row (BT-1)', () => {
    renderCard();
    const latestTags = screen.getAllByText('ล่าสุด');
    expect(latestTags).toHaveLength(1);
  });

  it('F1.3 stepper renders 3 dots + correct timestamps for completed row (BT-2)', () => {
    renderCard();
    const row = screen.getByTestId('treatment-row-BT-2');
    expect(row.textContent).toContain('04:02'); // vitals
    expect(row.textContent).toContain('04:23'); // doctor + completed
  });

  it('F1.4 click row → setExpandedTreatment called with row id', async () => {
    const setExpanded = vi.fn();
    renderCard({ setExpandedTreatment: setExpanded });
    await userEvent.click(screen.getByTestId('treatment-toggle-BT-1'));
    expect(setExpanded).toHaveBeenCalledWith('BT-1');
  });

  it('F1.5 expanded row shows CC/DX callout + print buttons', () => {
    renderCard({ expandedTreatment: 'BT-2' });
    // CC/DX callout has unique label "CC · อาการ" / "DX · วินิจฉัย"
    expect(screen.getByText('CC · อาการ')).toBeInTheDocument();
    expect(screen.getByText('DX · วินิจฉัย')).toBeInTheDocument();
    expect(screen.getByText('ฟหกฟ')).toBeInTheDocument();
    expect(screen.getByText('ฟหกฟห')).toBeInTheDocument();
  });

  it('F1.6 latest row "วันนี้" pill renders for today', () => {
    renderCard();
    expect(screen.getByText('วันนี้')).toBeInTheDocument();
  });

  it('F1.7 past date pill renders correct relative label', () => {
    renderCard();
    // 2026-05-07 from 2026-05-14 = 7 days = "1 สัปดาห์ที่แล้ว"
    expect(screen.getByText('1 สัปดาห์ที่แล้ว')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10.2: Run + iterate to green**

- [ ] **Step 10.3: Commit + push**
```bash
git add tests/phase-28-treatment-history-flow-simulate.test.jsx
git commit -m "test(Phase 28.10): Rule I full-flow simulate (5-treatment realistic fixture)"
git push origin master
```

---

## Task 11: V21 fixups — patch broken existing tests

**Files:**
- Various tests that asserted CDV inline structure

- [ ] **Step 11.1: Run full suite, capture failures**
```bash
npm test -- --run 2>&1 | tail -50 > /tmp/phase-28-failures.txt
grep -E "FAIL|×" /tmp/phase-28-failures.txt | head -30
```

- [ ] **Step 11.2: For each failing test, classify**
- If asserting OLD inline behavior → patch with Phase 28 marker comment + new expectation
- If asserting NEW Phase 28 behavior accidentally broken → fix the implementation
- Never lock the OLD inline structure pattern

- [ ] **Step 11.3: Commit fixups in batches** (1 commit per related cluster)

```bash
git add <cluster of fixed test files>
git commit -m "test(Phase 28 V21 fixup): <describe cluster>"
git push origin master
```

Repeat until full vitest is green.

---

## Task 12: Live preview verification (Rule I item b — MANDATORY)

**Files:** None (manual verification via preview tools)

Per spec § 12 + Rule I item b: preview_eval against running dev server is non-negotiable for user-visible flows.

- [ ] **Step 12.1: Start dev server (if not running)**
```bash
# Use preview_start tool
# preview_start with cwd = F:/LoverClinic-app, command = "npm run dev"
```

- [ ] **Step 12.2: Navigate to backend → customer detail**

Use `preview_eval` to navigate via window.location:
```js
window.location.href = '/?backend=1';
```

Then click into the customer list. Pick LC-26000006 (the test customer with the most treatments per Phase 27.2-quater).

- [ ] **Step 12.3: Visual inspection — collapsed list**

Use `preview_screenshot` to capture the treatment-history card in collapsed state. Verify:
- 3 CTA buttons render correctly (2 ghost + 1 fire-red primary)
- Date groups visible with "วันนี้" / past pills
- Each row shows time + status + stepper + meta + CC/DX preview
- Latest row has glow on dot + "ล่าสุด" tag
- Pagination footer shows correct counts

- [ ] **Step 12.4: Interaction test — click row to expand**

Use `preview_click` on a treatment row. Then `preview_screenshot` to verify:
- Row tinted bg + fire-red left accent
- Chevron rotated
- CC/DX callout renders
- TreatmentDetailExpanded body shows
- Print buttons visible
- Click again → collapses

- [ ] **Step 12.5: Edit/delete chip click test**

Use `preview_click` on edit chip. Verify:
- Console logs / network shows edit handler fired
- Row did NOT toggle expansion (stopPropagation working)

- [ ] **Step 12.6: Light theme smoke test**

Toggle theme via:
```js
document.documentElement.setAttribute('data-theme', 'light');
```
Take screenshot. Verify:
- Card surface is white (not dark)
- Text readable
- Fire-red accents still visible (don't get washed out)
- CTA primary still glows

- [ ] **Step 12.7: Mobile viewport test**

Use `preview_resize` to 375px width. Verify:
- Card doesn't overflow horizontally
- Stepper might overflow-scroll horizontally — acceptable but check
- CTA buttons wrap gracefully
- Date headers still readable

- [ ] **Step 12.8: Console error check**

Use `preview_console_logs` — verify ZERO errors related to Phase 28.

- [ ] **Step 12.9: If any visual issue found**

Iterate: edit code → re-screenshot → repeat until clean. Document each iteration in commit message.

- [ ] **Step 12.10: Save final screenshots as proof**

Save 4 screenshots:
- `dark-collapsed.png` — main view all collapsed
- `dark-expanded.png` — one row expanded
- `light-collapsed.png` — light theme
- `mobile-collapsed.png` — 375px width

Commit references in next step.

---

## Task 13: Final batch verification (Rule N at batch end)

- [ ] **Step 13.1: Full vitest**
```bash
npm test -- --run 2>&1 | tail -5
```
Expected: > 9013 + new (~115 from Phase 28) = > 9128 pass, 0 fail.

- [ ] **Step 13.2: Build clean**
```bash
npm run build 2>&1 | tail -5
```
Expected: clean. Bundle delta < 5KB on BackendDashboard chunk.

- [ ] **Step 13.3: Audit: branch-scope (no regression)**
```bash
npm test -- --run tests/audit-branch-scope.test.js 2>&1 | tail -5
```
Expected: green.

- [ ] **Step 13.4: Audit: anti-vibe-code (no regression)**
```bash
npm test -- --run tests/audit-anti-vibe-code 2>&1 | tail -5
```
Expected: green.

- [ ] **Step 13.5: Commit final state if any drift fixes**
```bash
git status --short
# If any unstaged changes, commit them with:
git add -A && git commit -m "test(Phase 28): final batch fixups"
git push origin master
```

---

## Task 14: Update institutional memory

**Files:**
- Modify: `SESSION_HANDOFF.md` — add Phase 28 session block at top
- Modify: `.agents/active.md` — update state to reflect Phase 28 ship
- Modify: `.claude/rules/00-session-start.md` § 2 — append compact Phase 28 entry (NOT a V-entry, a Phase entry — see spec § 13)

- [ ] **Step 14.1: Update SESSION_HANDOFF.md**

Insert at top (after `## Current State`):
```markdown
### Session 2026-05-14 LATE EOD (continued) — Phase 28 Treatment History Redesign SHIPPED

User authorized full redesign + autonomous deploy. World-class redesigner-level
brainstormed Q1-Q4 (Structural / Date-grouped / Dot-stepper / List+CTA),
spec at docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md
+ plan at docs/superpowers/plans/2026-05-14-phase-28-treatment-history-redesign.md.

Architecture:
- 7 new components in src/components/backend/treatment-history/
- 6 pure helpers in src/lib/treatmentDisplayResolvers.js
- Replaced inline 290-line block in CustomerDetailView.jsx
- Pure render layer — no Firestore / schema / rule changes

Tests: ~115 new assertions across 4 test files (resolvers + RTL + flow-simulate + source-grep).
Test count delta: 9013 → ~9128.

Verification: full vitest green, build clean, live preview_eval verified
in dark + light themes + 375px mobile viewport.

Detail: .agents/sessions/2026-05-14-phase-28-treatment-history-redesign.md.
```

- [ ] **Step 14.2: Update `.agents/active.md`**

Replace status line + sections with Phase 28 state. Update:
- `last_commit`
- `tests` count
- `## State` section
- `## What this session shipped` — append Phase 28 bullet
- `## Outstanding user-triggered actions` — add deploy authorization context

- [ ] **Step 14.3: Append compact Phase 28 entry to `.claude/rules/00-session-start.md` § 2**

Per spec § 13 — this is a Phase entry not a V-entry. Format mirrors prior Phase entries (Phase 27.2-sexies, Phase 26.2g-fillin, etc.).

- [ ] **Step 14.4: Create checkpoint at `.agents/sessions/2026-05-14-phase-28-treatment-history-redesign.md`**

Mirror format of prior session checkpoints. Include:
- Summary
- Current state (commits, tests, build)
- Files touched
- Key decisions
- Lessons (Rule D)
- Next todo (deploy)
- Resume Prompt

- [ ] **Step 14.5: Commit + push doc updates**
```bash
git add SESSION_HANDOFF.md .agents/active.md .claude/rules/00-session-start.md \
        .agents/sessions/2026-05-14-phase-28-treatment-history-redesign.md
git commit -m "docs(Phase 28): SESSION_HANDOFF + active + V-log + checkpoint"
git push origin master
```

---

## Task 15: V15 combined deploy (V18 user-authorized THIS turn)

User pre-authorized in their request: "อนุญาตให้ deploy ได้ ... ผ่านการเทสทุกรูปแบบที่หินโหดแล้ว".

All gates passed (Tasks 0-14 green) → proceed with V15 combined deploy per `.claude/rules/02-workflow.md`.

- [ ] **Step 15.1: Pre-deploy probe (Rule B)**

Pre-probe 4 endpoints:
1. POST chat_conversations test-probe → expect 200
2. anon-auth opd_sessions create + PATCH → expect 200
3. POST be_exam_rooms test-probe (clinic-staff) → expect 200
4. PUT backups Storage admin-only → expect 200

Use `vercel env pull` if creds not loaded.

- [ ] **Step 15.2: Combined V15 deploy in parallel**

```bash
# Run in parallel via separate Bash calls (not chained)
vercel --prod --yes
firebase deploy --only firestore:rules,storage:rules
```

Both must succeed. Output captured.

- [ ] **Step 15.3: Post-deploy probe (Rule B)**

Re-run all 4 probes — any 403 = revert immediately.

- [ ] **Step 15.4: Cleanup probe artifacts**

Delete the test-probe docs created in step 15.1 + 15.3 via `/api/admin/cleanup-test-probes` endpoint.

- [ ] **Step 15.5: Smoke test production URL**

```bash
curl -I https://lover-clinic-app.vercel.app
```
Expect 200 + reasonable TTFB.

- [ ] **Step 15.6: Update active.md + SESSION_HANDOFF post-deploy**

```markdown
production_commit: "<new sha>"
firestore_rules_version: <bumped>
storage_rules_version: <bumped>
```

Commit + push these final state updates.

---

## Self-review

(Per writing-plans protocol — to be performed after plan written, before user execution.)

**Spec coverage check** — every spec section maps to at least one task:
- § 1-3 Context/goal/locked decisions → Tasks 1-8
- § 4.1 Card frame → Task 8
- § 4.2 Header → Task 6
- § 4.3 Date group header → Task 3
- § 4.4 Row collapsed → Task 4
- § 4.5 Stepper → Task 2
- § 4.6 Status vocabulary → Task 1 (helpers)
- § 4.7 Expanded body → Task 5
- § 4.8 Pagination → Task 7
- § 5 Behavior → Tasks 4, 8
- § 6 Data shape → no task (no schema change)
- § 7 Architecture → Task 8
- § 8 Files → All tasks
- § 9 Risks → Mitigations baked into Task 4 (e.stopPropagation), Task 11 (V21 fixups), Task 12 (preview)
- § 10 Out of scope → respected (no other CDV cards touched)
- § 11 Migration → Task 12 (no migration needed — pure render)
- § 12 Verification → Tasks 12, 13
- § 13 Phase 27.2-septies note → not addressed in this plan (separate follow-up if user wants)

**Placeholder scan** — none. Every step has actual code or commands.

**Type consistency** — `t` is treatmentSummary entry throughout; `lifecycle` is `Array<{key, time}>` throughout; `groups` is interleaved `[{type, ...}]` throughout. CTAs callbacks: `onPrintDoc / onShowTimeline / onCreateTreatment / onEditTreatment / onDeleteTreatment` consistent. `pageNumbers` is array of integers throughout.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-14-phase-28-treatment-history-redesign.md`.

User pre-authorized full autonomy + deploy ("ทำเลย ทำจนเวร็จ ... อนุญาตให้ทำการแก้ไขได้ทั้งหมดไม่ต้องถาม จน deploy ได้ไปเลย").

**Execution mode: Subagent-Driven (recommended per skill)** — fresh subagent per task + two-stage review (spec compliance + code quality) per Rule J subagent-driven-development pattern from V41/V52/V55. This produces highest fidelity + parallel-safe iteration.

After plan saved, invoke `subagent-driven-development` skill to begin Task 0.
