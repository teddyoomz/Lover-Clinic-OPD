# Phase 29 — Recall System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Recall System (Phase 29) per spec `2026-05-14-recall-system-design.md` — 3 surfaces (Backend tab + Frontend sub-tab + CDV card), 2-slot recall pairing per treatment, LINE template send, real-time multi-surface refresh without flicker, master-data inline-learn pattern.

**Architecture:** New `be_recalls` collection (branch-scoped per BSA Rule L) + master-data extension on `be_products` + `be_courses` (4 new optional fields). 12 new components in `src/components/backend/recall/` + 1 in `src/components/backend/customer-recall/` + 3 helpers in `src/lib/` + 1 hook in `src/hooks/` + 1 server endpoint in `api/admin/`. Auto-suggest is **modal pre-fill only** (no daemon, no draft queue). Real-time refresh via Firestore onSnapshot listener + stable React keys + optimistic local mutation.

**Tech Stack:** React 19 + Vite 8 + Vitest 4 + RTL + Tailwind 3.4 + Lucide React + Firestore (firebase v12) + fast-check (property-based) + firebase-admin (server endpoint).

**Reference spec:** `docs/superpowers/specs/2026-05-14-recall-system-design.md` — every task below references the relevant spec section.

---

## Task 0: Pre-flight — baseline + branch check

**Files:** None (verification only)

- [ ] **Step 1: Verify on master + capture current state**
```bash
git status --short && git log -1 --oneline
```
Expected: clean working tree (only Phase 29 spec already committed); current branch master.

- [ ] **Step 2: Capture baseline test count**
```bash
npm test -- --run 2>&1 | tail -3
```
Expected: 9176+ pass, 1 skipped, 0 fail (baseline from Phase 28 deploy). Record exact count for end-of-batch comparison.

- [ ] **Step 3: Capture baseline build size**
```bash
npm run build 2>&1 | grep -E "BackendDashboard|index.html" | head -5
```
Expected: clean build, BackendDashboard chunk size noted (delta budget = +20KB at end given 16 new components).

---

## Task 1: Pure helpers — `recallResolvers.js` + `recallValidation.js` + `lineTemplateRenderer.js` (TDD)

**Files:**
- Create: `src/lib/recallResolvers.js`
- Create: `src/lib/recallValidation.js`
- Create: `src/lib/lineTemplateRenderer.js`
- Create: `tests/phase-29-recall-resolvers.test.js`
- Create: `tests/phase-29-recall-validation.test.js`
- Create: `tests/phase-29-line-template-renderer.test.js`

Spec reference: § 5 behavior, § 6 data model, § 7 helpers, § 9 Layer 1.

- [ ] **Step 1.1: Read existing canonical helper patterns**

```bash
# Read for reference (do NOT modify):
# - src/lib/treatmentDisplayResolvers.js (Phase 28 pattern with Bangkok TZ midday-UTC)
# - src/lib/formatBadgeTime.js
# - src/utils.js (formatThaiDateFull, thaiTodayISO)
```

Note JSDoc style + export pattern + `_parseISOMiddayUTC` Bangkok TZ helper.

- [ ] **Step 1.2: Write failing tests for `recallResolvers.js`**

Create `tests/phase-29-recall-resolvers.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  groupRecallsByTimeBucket,
  getRecallStatusLabel,
  getRecallStatusColor,
  getEffectiveRecallDate,
  computeDaysFromToday,
  formatDaysFromTodayLabel,
  formatPairBadge,
  shouldShowAutoSnooze,
  computeAutoSnoozeUntil,
  shouldFlagManualReview,
  isOverdue,
} from '../src/lib/recallResolvers.js';

const TODAY = '2026-05-14';

describe('Phase 29 · groupRecallsByTimeBucket', () => {
  it('R1.1 groups by 5 buckets correctly', () => {
    const recalls = [
      { id: 'R1', recallDate: '2026-05-12', status: 'pending' }, // overdue
      { id: 'R2', recallDate: '2026-05-14', status: 'pending' }, // today
      { id: 'R3', recallDate: '2026-05-15', status: 'pending' }, // tomorrow
      { id: 'R4', recallDate: '2026-05-18', status: 'pending' }, // thisWeek
      { id: 'R5', recallDate: '2026-06-14', status: 'pending' }, // later
    ];
    const buckets = groupRecallsByTimeBucket(recalls, TODAY);
    expect(buckets.overdue).toHaveLength(1);
    expect(buckets.today).toHaveLength(1);
    expect(buckets.tomorrow).toHaveLength(1);
    expect(buckets.thisWeek).toHaveLength(1);
    expect(buckets.later).toHaveLength(1);
  });
  it('R1.2 snoozedUntil overrides recallDate for bucket assignment', () => {
    const recalls = [
      { id: 'R1', recallDate: '2026-05-10', status: 'pending', snoozedUntil: '2026-05-14' },
    ];
    const buckets = groupRecallsByTimeBucket(recalls, TODAY);
    expect(buckets.today).toHaveLength(1);
    expect(buckets.overdue).toHaveLength(0);
  });
  it('R1.3 done status NOT shown as overdue', () => {
    const recalls = [{ id: 'R1', recallDate: '2026-05-12', status: 'done' }];
    const buckets = groupRecallsByTimeBucket(recalls, TODAY);
    expect(buckets.overdue).toHaveLength(0);
  });
  it('R1.4 empty input → empty buckets', () => {
    const buckets = groupRecallsByTimeBucket([], TODAY);
    expect(buckets.overdue).toEqual([]);
    expect(buckets.today).toEqual([]);
    expect(buckets.tomorrow).toEqual([]);
    expect(buckets.thisWeek).toEqual([]);
    expect(buckets.later).toEqual([]);
  });
  it('R1.5 null/undefined input safe (returns empty buckets)', () => {
    expect(() => groupRecallsByTimeBucket(null, TODAY)).not.toThrow();
    expect(() => groupRecallsByTimeBucket(undefined, TODAY)).not.toThrow();
  });
});

describe('Phase 29 · getRecallStatusLabel', () => {
  it('R2.1-6 returns Thai labels for each status', () => {
    expect(getRecallStatusLabel({ status: 'pending' })).toBe('รอโทร');
    expect(getRecallStatusLabel({ status: 'done' })).toBe('เสร็จแล้ว');
    expect(getRecallStatusLabel({ status: 'no-answer', noAnswerCount: 2 })).toBe('ติดต่อไม่ได้ครั้งที่ 2');
    expect(getRecallStatusLabel({ status: 'closed-no-answer' })).toBe('ปิด (ติดต่อไม่ได้)');
    expect(getRecallStatusLabel({ status: 'pending', snoozedUntil: '2026-05-20' })).toBe('เลื่อนไป 20 พ.ค.');
    expect(getRecallStatusLabel({ status: 'pending', recallDate: '2026-05-12' }, TODAY)).toBe('เกินกำหนด 2 วัน');
  });
});

describe('Phase 29 · computeDaysFromToday', () => {
  it('R4.1-4 returns correct day delta (Bangkok TZ)', () => {
    expect(computeDaysFromToday('2026-05-14', TODAY)).toBe(0);
    expect(computeDaysFromToday('2026-05-15', TODAY)).toBe(1);
    expect(computeDaysFromToday('2026-05-12', TODAY)).toBe(-2);
    expect(computeDaysFromToday('2026-11-14', TODAY)).toBe(184);
  });
  it('R4.5 invalid date returns null', () => {
    expect(computeDaysFromToday('', TODAY)).toBeNull();
    expect(computeDaysFromToday(null, TODAY)).toBeNull();
  });
});

describe('Phase 29 · formatDaysFromTodayLabel', () => {
  it('R5.1-6 returns Thai labels per range', () => {
    expect(formatDaysFromTodayLabel(0)).toBe('วันนี้');
    expect(formatDaysFromTodayLabel(1)).toBe('พรุ่งนี้');
    expect(formatDaysFromTodayLabel(-2)).toBe('เกินกำหนด 2 วัน');
    expect(formatDaysFromTodayLabel(90)).toBe('90 วัน (3 เดือน)');
    expect(formatDaysFromTodayLabel(184)).toBe('184 วัน (~6 เดือน)');
    expect(formatDaysFromTodayLabel(400)).toBe('1 ปี');
  });
});

describe('Phase 29 · formatPairBadge', () => {
  it('R6.1 pending paired recall', () => {
    const paired = { id: 'R2', slotType: 'revisit', reason: 'ฟิลเลอร์ครบ 6 เดือน', recallDate: '2026-11-14', status: 'pending' };
    const out = formatPairBadge(paired, TODAY);
    expect(out.icon).toBe('📅');
    expect(out.reason).toBe('ฟิลเลอร์ครบ 6 เดือน');
    expect(out.date).toBe('14 พ.ย.');
    expect(out.statusSuffix).toBe('รอ Recall');
  });
  it('R6.2 done paired recall', () => {
    const paired = { id: 'R1', slotType: 'aftercare', reason: 'ติดตามอาการหลังฉีดฟิลเลอร์', recallDate: '2026-05-15', status: 'done' };
    const out = formatPairBadge(paired, TODAY);
    expect(out.icon).toBe('🩹');
    expect(out.statusSuffix).toBe('เสร็จแล้ว');
  });
  it('R6.3 no-answer with count', () => {
    const paired = { id: 'R2', slotType: 'revisit', reason: 'ตรวจติดตาม', recallDate: '2026-01-22', status: 'no-answer', noAnswerCount: 2 };
    const out = formatPairBadge(paired, TODAY);
    expect(out.statusSuffix).toBe('ติดต่อไม่ได้ครั้งที่ 2');
  });
  it('R6.4 snoozed suffix', () => {
    const paired = { id: 'R3', slotType: 'aftercare', reason: 'ติดตาม', recallDate: '2026-05-15', status: 'pending', snoozedUntil: '2026-05-20' };
    const out = formatPairBadge(paired, TODAY);
    expect(out.statusSuffix).toBe('เลื่อนไป 20 พ.ค.');
  });
  it('R6.5 overdue suffix', () => {
    const paired = { id: 'R4', slotType: 'revisit', reason: 'ฟิลเลอร์ครบรอบ', recallDate: '2026-05-12', status: 'pending' };
    const out = formatPairBadge(paired, TODAY);
    expect(out.statusSuffix).toBe('เกินกำหนด 2 วัน');
  });
});

describe('Phase 29 · auto-snooze + manual review', () => {
  it('R8.1 shouldShowAutoSnooze for no-answer', () => {
    expect(shouldShowAutoSnooze('no-answer')).toBe(true);
    expect(shouldShowAutoSnooze('will-come')).toBe(false);
  });
  it('R8.2 computeAutoSnoozeUntil returns now+3d', () => {
    expect(computeAutoSnoozeUntil('2026-05-14', 3)).toBe('2026-05-17');
    expect(computeAutoSnoozeUntil('2026-05-14')).toBe('2026-05-17'); // default 3
  });
  it('R8.3 shouldFlagManualReview at threshold 3', () => {
    expect(shouldFlagManualReview(2)).toBe(false);
    expect(shouldFlagManualReview(3)).toBe(true);
    expect(shouldFlagManualReview(5)).toBe(true);
  });
});

describe('Phase 29 · isOverdue', () => {
  it('R9.1 overdue when recallDate before today AND not done', () => {
    expect(isOverdue({ recallDate: '2026-05-12', status: 'pending' }, TODAY)).toBe(true);
    expect(isOverdue({ recallDate: '2026-05-12', status: 'done' }, TODAY)).toBe(false);
    expect(isOverdue({ recallDate: '2026-05-14', status: 'pending' }, TODAY)).toBe(false);
  });
  it('R9.2 snoozed not overdue if snoozedUntil >= today', () => {
    expect(isOverdue({ recallDate: '2026-05-10', status: 'pending', snoozedUntil: '2026-05-15' }, TODAY)).toBe(false);
  });
});
```

- [ ] **Step 1.3: Run failing tests**

```bash
npm test -- --run tests/phase-29-recall-resolvers.test.js 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 1.4: Implement `src/lib/recallResolvers.js`**

```js
/**
 * Phase 29 (2026-05-14) — recall display + bucket resolvers.
 * Pure JS. Branch-blind. Bangkok-stable midday-UTC date parsing per V53 lesson.
 */

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function _parseISOMiddayUTC(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function _formatThaiShortDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const day = Number(m[3]);
  const monthIdx = Number(m[2]) - 1;
  return `${day} ${THAI_MONTHS_SHORT[monthIdx] || ''}`;
}

/**
 * Phase 29 — derive effective recall date (snoozedUntil overrides recallDate).
 */
export function getEffectiveRecallDate(r) {
  if (!r) return null;
  return r.snoozedUntil || r.recallDate || null;
}

/**
 * Phase 29 — compute days from today (Bangkok TZ). Negative = past.
 */
export function computeDaysFromToday(targetISO, todayISO) {
  const t = _parseISOMiddayUTC(targetISO);
  const today = _parseISOMiddayUTC(todayISO);
  if (t === null || today === null) return null;
  return Math.round((t - today) / 86400000);
}

/**
 * Phase 29 — Thai-friendly days-from-today label.
 */
export function formatDaysFromTodayLabel(days) {
  if (days === 0) return 'วันนี้';
  if (days === 1) return 'พรุ่งนี้';
  if (days < 0) return `เกินกำหนด ${Math.abs(days)} วัน`;
  if (days <= 7) return `${days} วัน`;
  if (days < 30) return `${days} วัน (${Math.floor(days / 7)} สัปดาห์)`;
  if (days < 60) return `${days} วัน (~${Math.round(days / 30)} เดือน)`;
  if (days < 365) return `${days} วัน (~${Math.round(days / 30)} เดือน)`;
  return `${Math.floor(days / 365)} ปี`;
}

/**
 * Phase 29 — group recalls into 5 time buckets.
 */
export function groupRecallsByTimeBucket(recalls, todayISO) {
  const empty = { overdue: [], today: [], tomorrow: [], thisWeek: [], later: [] };
  if (!Array.isArray(recalls) || recalls.length === 0) return empty;
  const buckets = { ...empty, overdue: [], today: [], tomorrow: [], thisWeek: [], later: [] };
  const todayMs = _parseISOMiddayUTC(todayISO);
  if (todayMs === null) return empty;

  for (const r of recalls) {
    if (!r) continue;
    const effDate = getEffectiveRecallDate(r);
    const effMs = _parseISOMiddayUTC(effDate);
    if (effMs === null) continue;
    const days = Math.round((effMs - todayMs) / 86400000);
    if (days < 0 && r.status !== 'done' && r.status !== 'closed-no-answer') {
      buckets.overdue.push(r);
    } else if (days === 0) {
      buckets.today.push(r);
    } else if (days === 1) {
      buckets.tomorrow.push(r);
    } else if (days >= 2 && days <= 7) {
      buckets.thisWeek.push(r);
    } else if (days > 7) {
      buckets.later.push(r);
    } else {
      // days < 0 but status done/closed → bury in "later" (historical)
      buckets.later.push(r);
    }
  }
  return buckets;
}

/**
 * Phase 29 — Thai status label per recall.
 */
export function getRecallStatusLabel(r, todayISO) {
  if (!r) return '';
  if (r.snoozedUntil && r.status === 'pending') {
    return `เลื่อนไป ${_formatThaiShortDate(r.snoozedUntil)}`;
  }
  if (r.status === 'pending' && todayISO && r.recallDate) {
    const days = computeDaysFromToday(r.recallDate, todayISO);
    if (days !== null && days < 0) return `เกินกำหนด ${Math.abs(days)} วัน`;
  }
  if (r.status === 'pending') return 'รอโทร';
  if (r.status === 'done') return 'เสร็จแล้ว';
  if (r.status === 'no-answer') return `ติดต่อไม่ได้ครั้งที่ ${r.noAnswerCount || 1}`;
  if (r.status === 'closed-no-answer') return 'ปิด (ติดต่อไม่ได้)';
  return '';
}

/**
 * Phase 29 — Thai status color tokens per status.
 */
export function getRecallStatusColor(r) {
  if (!r) return { bg: 'transparent', border: 'transparent', text: 'inherit' };
  if (r.status === 'done') return { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.35)', text: '#6ee7b7' };
  if (r.status === 'no-answer') return { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.35)', text: '#fca5a5' };
  if (r.status === 'closed-no-answer') return { bg: 'rgba(75,85,99,0.10)', border: 'rgba(75,85,99,0.35)', text: '#9ca3af' };
  if (r.snoozedUntil) return { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.35)', text: '#a5b4fc' };
  return { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)', text: '#fcd34d' };
}

/**
 * Phase 29 — pair badge data (icon + reason + date + status suffix).
 */
export function formatPairBadge(paired, todayISO) {
  if (!paired) return null;
  const icon = paired.slotType === 'aftercare' ? '🩹' : '📅';
  const date = _formatThaiShortDate(paired.recallDate);
  let statusSuffix;
  if (paired.status === 'done') {
    statusSuffix = 'เสร็จแล้ว';
  } else if (paired.status === 'no-answer') {
    statusSuffix = `ติดต่อไม่ได้ครั้งที่ ${paired.noAnswerCount || 1}`;
  } else if (paired.snoozedUntil) {
    statusSuffix = `เลื่อนไป ${_formatThaiShortDate(paired.snoozedUntil)}`;
  } else if (todayISO) {
    const days = computeDaysFromToday(paired.recallDate, todayISO);
    if (days !== null && days < 0) {
      statusSuffix = `เกินกำหนด ${Math.abs(days)} วัน`;
    } else {
      statusSuffix = 'รอ Recall';
    }
  } else {
    statusSuffix = 'รอ Recall';
  }
  return { icon, reason: paired.reason || '', date, statusSuffix };
}

export function shouldShowAutoSnooze(outcome) {
  return outcome === 'no-answer';
}

export function computeAutoSnoozeUntil(fromISO, days = 3) {
  const fromMs = _parseISOMiddayUTC(fromISO);
  if (fromMs === null) return null;
  const future = new Date(fromMs + days * 86400000);
  const y = future.getUTCFullYear();
  const mo = String(future.getUTCMonth() + 1).padStart(2, '0');
  const d = String(future.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function shouldFlagManualReview(noAnswerCount, threshold = 3) {
  return (noAnswerCount || 0) >= threshold;
}

export function isOverdue(r, todayISO) {
  if (!r || r.status === 'done' || r.status === 'closed-no-answer') return false;
  const effDate = getEffectiveRecallDate(r);
  const days = computeDaysFromToday(effDate, todayISO);
  return days !== null && days < 0;
}
```

- [ ] **Step 1.5: Run tests + verify green**

```bash
npm test -- --run tests/phase-29-recall-resolvers.test.js 2>&1 | tail -10
```
Expected: all R1-R9 pass.

- [ ] **Step 1.6: Write tests + implement `recallValidation.js`**

Create `tests/phase-29-recall-validation.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateRecallSlot, validateRecallCreate, normalizeRecallSlot } from '../src/lib/recallValidation.js';

describe('Phase 29 · validateRecallSlot', () => {
  it('V1.1 valid slot passes', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: 'ติดตามอาการ' });
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
  });
  it('V1.2 missing date fails', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '', reason: 'x' });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('date-required');
  });
  it('V1.3 missing reason fails', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: '' });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('reason-required');
  });
  it('V1.4 disabled slot ignored (always ok)', () => {
    const out = validateRecallSlot({ enabled: false, recallDate: '', reason: '' });
    expect(out.ok).toBe(true);
  });
});

describe('Phase 29 · validateRecallCreate', () => {
  it('V2.1 both slots off → fails (must enable ≥1)', () => {
    const out = validateRecallCreate({
      customerId: 'LC-1',
      slot1: { enabled: false },
      slot2: { enabled: false },
    });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('at-least-one-slot-required');
  });
  it('V2.2 only slot 1 enabled → ok if slot 1 valid', () => {
    const out = validateRecallCreate({
      customerId: 'LC-1',
      slot1: { enabled: true, recallDate: '2026-05-15', reason: 'x' },
      slot2: { enabled: false },
    });
    expect(out.ok).toBe(true);
  });
  it('V2.3 both enabled but customerId missing → fails', () => {
    const out = validateRecallCreate({
      customerId: '',
      slot1: { enabled: true, recallDate: '2026-05-15', reason: 'x' },
      slot2: { enabled: true, recallDate: '2026-11-14', reason: 'y' },
    });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('customer-required');
  });
});

describe('Phase 29 · normalizeRecallSlot', () => {
  it('V3.1 strips whitespace on reason', () => {
    expect(normalizeRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: '  ติดตาม  ' }).reason).toBe('ติดตาม');
  });
});
```

Run failing, then implement `src/lib/recallValidation.js`:
```js
/** Phase 29 (2026-05-14) — recall create/edit validation. */

export function validateRecallSlot(slot) {
  if (!slot || !slot.enabled) return { ok: true, errors: [] };
  const errors = [];
  if (!slot.recallDate || typeof slot.recallDate !== 'string') errors.push('date-required');
  if (!slot.reason || (typeof slot.reason === 'string' && slot.reason.trim() === '')) errors.push('reason-required');
  return { ok: errors.length === 0, errors };
}

export function validateRecallCreate(payload) {
  const errors = [];
  if (!payload?.customerId) errors.push('customer-required');
  const s1 = payload?.slot1 || { enabled: false };
  const s2 = payload?.slot2 || { enabled: false };
  if (!s1.enabled && !s2.enabled) errors.push('at-least-one-slot-required');
  if (s1.enabled) {
    const r = validateRecallSlot(s1);
    if (!r.ok) errors.push(...r.errors.map(e => `slot1-${e}`));
  }
  if (s2.enabled) {
    const r = validateRecallSlot(s2);
    if (!r.ok) errors.push(...r.errors.map(e => `slot2-${e}`));
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeRecallSlot(slot) {
  if (!slot) return { enabled: false };
  return {
    enabled: !!slot.enabled,
    recallDate: slot.recallDate || '',
    reason: typeof slot.reason === 'string' ? slot.reason.trim() : '',
    saveToMaster: !!slot.saveToMaster,
  };
}
```

Run tests → verify green.

- [ ] **Step 1.7: Write tests + implement `lineTemplateRenderer.js`**

Create `tests/phase-29-line-template-renderer.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { renderTemplate, getRecallTemplateVariables, DEFAULT_RECALL_TEMPLATES } from '../src/lib/lineTemplateRenderer.js';

describe('Phase 29 · renderTemplate', () => {
  it('L1.1 substitutes single variable', () => {
    expect(renderTemplate('สวัสดีคุณ {ชื่อ}', { 'ชื่อ': 'นาย Eee' })).toBe('สวัสดีคุณ นาย Eee');
  });
  it('L1.2 multi-variable', () => {
    expect(renderTemplate('คุณ {ชื่อ} ครบ {N เดือน}', { 'ชื่อ': 'X', 'N เดือน': '6' })).toBe('คุณ X ครบ 6');
  });
  it('L1.3 missing variable replaced with empty', () => {
    expect(renderTemplate('คุณ {ชื่อ}', {})).toBe('คุณ ');
  });
});

describe('Phase 29 · DEFAULT_RECALL_TEMPLATES', () => {
  it('L2.1 has 3 templates', () => {
    expect(DEFAULT_RECALL_TEMPLATES).toHaveLength(3);
    expect(DEFAULT_RECALL_TEMPLATES.map(t => t.id)).toEqual(['recall-default', 'aftercare-followup', 'custom']);
  });
  it('L2.2 default template contains required vars', () => {
    const tpl = DEFAULT_RECALL_TEMPLATES[0];
    expect(tpl.text).toMatch(/\{ชื่อ\}/);
    expect(tpl.text).toMatch(/\{เรื่อง\}/);
  });
});

describe('Phase 29 · getRecallTemplateVariables', () => {
  it('L3.1 extracts vars from recall + customer', () => {
    const recall = { reason: 'ฟิลเลอร์ครบ 6 เดือน', recallDate: '2026-11-14' };
    const customer = { displayName: 'นาย Eee', firstName: 'Eee' };
    const vars = getRecallTemplateVariables(recall, customer);
    expect(vars['ชื่อ']).toBe('นาย Eee');
    expect(vars['เรื่อง']).toBe('ฟิลเลอร์ครบ 6 เดือน');
  });
});
```

Run failing, then implement `src/lib/lineTemplateRenderer.js`:
```js
/** Phase 29 (2026-05-14) — LINE template rendering for recall messages. */

export const DEFAULT_RECALL_TEMPLATES = Object.freeze([
  {
    id: 'recall-default',
    label: '📅 แจ้งครบรอบ recall',
    text: 'คุณ {ชื่อ} สวัสดีค่ะ คลินิก Lover แจ้งให้ทราบว่าครบรอบบริการ {เรื่อง} ของคุณแล้วค่ะ หากสะดวกเข้ามารับบริการต่อ ทักหรือโทรกลับมาได้เลยนะคะ 😊',
  },
  {
    id: 'aftercare-followup',
    label: '💉 ติดตามผลฟิลเลอร์/botox',
    text: 'คุณ {ชื่อ} สวัสดีค่ะ ครบกำหนดติดตามอาการหลัง {เรื่อง} ของคุณแล้วค่ะ ผลและความรู้สึกหลังการรักษาเป็นอย่างไรบ้างคะ?',
  },
  {
    id: 'custom',
    label: '✏️ ข้อความ custom',
    text: '',
  },
]);

export function renderTemplate(templateText, vars) {
  if (!templateText || typeof templateText !== 'string') return '';
  let out = templateText;
  const v = vars && typeof vars === 'object' ? vars : {};
  out = out.replace(/\{([^}]+)\}/g, (_, key) => v[key] !== undefined ? String(v[key]) : '');
  return out;
}

export function getRecallTemplateVariables(recall, customer) {
  return {
    'ชื่อ': customer?.displayName || customer?.firstName || '',
    'เรื่อง': recall?.reason || '',
    'วันที่': recall?.recallDate || '',
    'N เดือน': '', // computed by caller if needed
    'คลินิก': 'Lover Clinic',
  };
}
```

Run tests → verify green.

- [ ] **Step 1.8: Commit + push**

```bash
git add src/lib/recallResolvers.js src/lib/recallValidation.js src/lib/lineTemplateRenderer.js \
        tests/phase-29-recall-resolvers.test.js tests/phase-29-recall-validation.test.js tests/phase-29-line-template-renderer.test.js
git commit -m "feat(Phase 29.1): pure helpers — resolvers / validation / line template renderer (TDD)"
git push origin master
```

---

## Task 2: backendClient extensions + scopedDataLayer + useRecallListener hook + firestore.rules + indexes

**Files:**
- Modify: `src/lib/backendClient.js` (+ ~10 functions)
- Modify: `src/lib/scopedDataLayer.js` (re-export with BSA auto-inject)
- Create: `src/hooks/useRecallListener.js`
- Modify: `firestore.rules` (add `be_recalls`)
- Modify: `firestore.indexes.json` (4 composite indexes)
- Create: `tests/phase-29-recall-backend-client.test.js`

Spec reference: § 5.6 real-time refresh, § 6 data model, § 7 backendClient extensions, § 12 migration.

- [ ] **Step 2.1: Write helper-level tests for backendClient new functions**

Create `tests/phase-29-recall-backend-client.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
// NOTE: Full integration tests use mock Firestore.
// We test the function exists + correct query shape via mock.

vi.mock('../src/firebase.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'TEST-UID' } },
}));
vi.mock('firebase/firestore', async () => {
  return {
    collection: vi.fn(() => 'mock-collection'),
    query: vi.fn((c, ...args) => ({ _coll: c, _filters: args })),
    where: vi.fn((field, op, val) => ({ where: { field, op, val } })),
    orderBy: vi.fn((field, dir) => ({ orderBy: { field, dir } })),
    onSnapshot: vi.fn((q, onNext, onErr) => () => {}),
    getDocs: vi.fn(async () => ({ docs: [] })),
    setDoc: vi.fn(async () => {}),
    updateDoc: vi.fn(async () => {}),
    doc: vi.fn((db, path, id) => ({ _path: path, _id: id })),
    serverTimestamp: vi.fn(() => 'SERVER-TS'),
    writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn(async () => {}) })),
    Timestamp: { fromDate: vi.fn(d => ({ _d: d })) },
  };
});

import {
  listRecalls, listRecallsForCustomer,
  listenToRecalls, listenToRecallsForCustomer,
  createRecall, createRecallPair,
  updateRecall, recordRecallOutcome, recordRecallLineSend, snoozeRecall,
} from '../src/lib/backendClient.js';

describe('Phase 29 · backendClient recall functions', () => {
  it('B1.1 listRecalls accepts {branchId} filter', async () => {
    const out = await listRecalls({ branchId: 'BR-1' });
    expect(Array.isArray(out)).toBe(true);
  });
  it('B1.2 listRecallsForCustomer accepts customerId', async () => {
    const out = await listRecallsForCustomer('LC-1');
    expect(Array.isArray(out)).toBe(true);
  });
  it('B1.3 listenToRecalls returns unsubscribe function', () => {
    const unsub = listenToRecalls({ branchId: 'BR-1' }, () => {}, () => {});
    expect(typeof unsub).toBe('function');
  });
  it('B1.4 listenToRecallsForCustomer returns unsubscribe', () => {
    const unsub = listenToRecallsForCustomer('LC-1', () => {}, () => {});
    expect(typeof unsub).toBe('function');
  });
  it('B1.5 createRecall returns {id}', async () => {
    const out = await createRecall({
      branchId: 'BR-1', customerId: 'LC-1', customerName: 'X',
      slotType: 'aftercare', recallDate: '2026-05-15', reason: 'x',
    });
    expect(out.id).toMatch(/^RECALL-/);
  });
  it('B1.6 createRecallPair returns {id1, id2}', async () => {
    const out = await createRecallPair({
      branchId: 'BR-1', customerId: 'LC-1', customerName: 'X',
      slot1: { recallDate: '2026-05-15', reason: 'x' },
      slot2: { recallDate: '2026-11-14', reason: 'y' },
    });
    expect(out.id1).toMatch(/^RECALL-/);
    expect(out.id2).toMatch(/^RECALL-/);
    expect(out.id1).not.toBe(out.id2);
  });
});
```

- [ ] **Step 2.2: Run failing tests**

```bash
npm test -- --run tests/phase-29-recall-backend-client.test.js 2>&1 | tail -10
```
Expected: FAIL — functions not exported.

- [ ] **Step 2.3: Implement backendClient functions**

Append to `src/lib/backendClient.js` (find an appropriate location — search for existing collection helpers like `listenToAppointmentsByDate` to follow the pattern):

```js
// Phase 29 (2026-05-14) — Recall System
// be_recalls is branch-scoped per BSA Rule L.

const RECALLS_PATH = `artifacts/${APP_ID}/public/data/be_recalls`;
function recallsCol() { return collection(db, RECALLS_PATH); }
function recallDoc(id) { return doc(db, RECALLS_PATH, id); }
function _newRecallId() {
  return `RECALL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Phase 29 — list recalls (branch-scoped, with optional filters).
 * Safe-by-default per BS-13: when branchId is falsy AND !allBranches → returns [].
 */
export async function listRecalls({ branchId = '', allBranches = false, status, dateBefore } = {}) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) return [];

  let q = recallsCol();
  const clauses = [];
  if (!allBranches && effectiveBranchId) clauses.push(where('branchId', '==', String(effectiveBranchId)));
  if (status) clauses.push(where('status', '==', status));
  if (dateBefore) clauses.push(where('recallDate', '<=', dateBefore));
  clauses.push(orderBy('recallDate', 'asc'));
  q = query(q, ...clauses);

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

/**
 * Phase 29 — list recalls for a specific customer (universal — not branch-scoped per BSA exception SG10).
 */
export async function listRecallsForCustomer(customerId) {
  if (!customerId) return [];
  const q = query(recallsCol(), where('customerId', '==', String(customerId)), orderBy('recallDate', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

/**
 * Phase 29 — real-time listener for branch-scoped recall list.
 * Safe-by-default per BS-13.
 */
export function listenToRecalls({ branchId = '', allBranches = false, status, dateBefore } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) {
    setTimeout(() => onChange?.([]), 0);
    return () => {};
  }

  let q = recallsCol();
  const clauses = [];
  if (!allBranches && effectiveBranchId) clauses.push(where('branchId', '==', String(effectiveBranchId)));
  if (status) clauses.push(where('status', '==', status));
  if (dateBefore) clauses.push(where('recallDate', '<=', dateBefore));
  clauses.push(orderBy('recallDate', 'asc'));
  q = query(q, ...clauses);

  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    onChange?.(items);
  }, onError);
}
listenToRecallsForCustomer.__universal__ = true; // see hook
listenToRecalls.__universal__ = false;

/**
 * Phase 29 — real-time listener per customer (universal, sanctioned exception SG10).
 */
export function listenToRecallsForCustomer(customerId, onChange, onError) {
  if (!customerId) {
    setTimeout(() => onChange?.([]), 0);
    return () => {};
  }
  const q = query(recallsCol(), where('customerId', '==', String(customerId)), orderBy('recallDate', 'asc'));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    onChange?.(items);
  }, onError);
}
listenToRecallsForCustomer.__universal__ = true;

/**
 * Phase 29 — create a single recall doc.
 */
export async function createRecall(payload) {
  const id = _newRecallId();
  const now = serverTimestamp();
  const branchId = await _resolveBranchIdForWrite(payload.branchId);
  const me = await _resolveAuthAttribution();
  await setDoc(recallDoc(id), {
    id, branchId,
    customerId: payload.customerId,
    customerName: payload.customerName || '',
    customerPhone: payload.customerPhone || '',
    customerLineUserId: payload.customerLineUserId || null,
    customerHN: payload.customerHN || null,
    slotType: payload.slotType,
    source: payload.source || 'manual',
    sourceTreatmentId: payload.sourceTreatmentId || null,
    sourceProductId: payload.sourceProductId || null,
    sourceProductName: payload.sourceProductName || null,
    sourceCourseId: payload.sourceCourseId || null,
    sourceCourseName: payload.sourceCourseName || null,
    recallDate: payload.recallDate,
    reason: payload.reason || '',
    snoozedUntil: null,
    pairedRecallId: payload.pairedRecallId || null,
    status: 'pending',
    outcome: null, outcomeNote: null, outcomeAt: null, outcomeBy: null,
    noAnswerCount: 0, requiresManualReview: false,
    lineMessageSent: false, lineMessageSentAt: null, lineMessageTemplate: null, lineMessageText: null, lineMessageBy: null,
    createdAt: now, createdBy: me, updatedAt: now, updatedBy: me,
  });
  return { id };
}

/**
 * Phase 29 — atomic batch create of 2 paired recalls.
 */
export async function createRecallPair({ branchId, customerId, customerName, customerPhone, customerLineUserId, customerHN,
                                          source, sourceTreatmentId, sourceProductId, sourceProductName, sourceCourseId, sourceCourseName,
                                          slot1, slot2 }) {
  const id1 = _newRecallId();
  const id2 = _newRecallId();
  const now = serverTimestamp();
  const resolvedBranchId = await _resolveBranchIdForWrite(branchId);
  const me = await _resolveAuthAttribution();
  const batch = writeBatch(db);
  const baseFields = {
    branchId: resolvedBranchId, customerId, customerName: customerName || '',
    customerPhone: customerPhone || '', customerLineUserId: customerLineUserId || null,
    customerHN: customerHN || null,
    source: source || 'manual', sourceTreatmentId: sourceTreatmentId || null,
    sourceProductId: sourceProductId || null, sourceProductName: sourceProductName || null,
    sourceCourseId: sourceCourseId || null, sourceCourseName: sourceCourseName || null,
    snoozedUntil: null, status: 'pending',
    outcome: null, outcomeNote: null, outcomeAt: null, outcomeBy: null,
    noAnswerCount: 0, requiresManualReview: false,
    lineMessageSent: false, lineMessageSentAt: null, lineMessageTemplate: null, lineMessageText: null, lineMessageBy: null,
    createdAt: now, createdBy: me, updatedAt: now, updatedBy: me,
  };
  batch.set(recallDoc(id1), { id: id1, slotType: 'aftercare', recallDate: slot1.recallDate, reason: slot1.reason || '', pairedRecallId: id2, ...baseFields });
  batch.set(recallDoc(id2), { id: id2, slotType: 'revisit', recallDate: slot2.recallDate, reason: slot2.reason || '', pairedRecallId: id1, ...baseFields });
  await batch.commit();
  return { id1, id2 };
}

/**
 * Phase 29 — generic update.
 */
export async function updateRecall(id, patch) {
  const me = await _resolveAuthAttribution();
  await updateDoc(recallDoc(id), { ...patch, updatedAt: serverTimestamp(), updatedBy: me });
}

/**
 * Phase 29 — record outcome + auto-snooze on no-answer.
 */
export async function recordRecallOutcome(id, { outcome, outcomeNote, currentNoAnswerCount = 0 }) {
  const me = await _resolveAuthAttribution();
  const patch = {
    outcome, outcomeNote: outcomeNote || '',
    outcomeAt: serverTimestamp(), outcomeBy: me,
    updatedAt: serverTimestamp(), updatedBy: me,
  };
  if (outcome === 'no-answer') {
    const newCount = (currentNoAnswerCount || 0) + 1;
    patch.status = 'no-answer';
    patch.noAnswerCount = newCount;
    patch.requiresManualReview = newCount >= 3;
    const todayMs = Date.now();
    const snoozeMs = todayMs + 3 * 86400000;
    const sd = new Date(snoozeMs);
    patch.snoozedUntil = `${sd.getUTCFullYear()}-${String(sd.getUTCMonth() + 1).padStart(2, '0')}-${String(sd.getUTCDate()).padStart(2, '0')}`;
  } else {
    patch.status = 'done';
  }
  await updateDoc(recallDoc(id), patch);
}

export async function recordRecallLineSend(id, { templateId, messageText }) {
  const me = await _resolveAuthAttribution();
  await updateDoc(recallDoc(id), {
    lineMessageSent: true,
    lineMessageSentAt: serverTimestamp(),
    lineMessageTemplate: templateId,
    lineMessageText: messageText,
    lineMessageBy: me,
    updatedAt: serverTimestamp(), updatedBy: me,
  });
}

export async function snoozeRecall(id, untilDate) {
  const me = await _resolveAuthAttribution();
  await updateDoc(recallDoc(id), { snoozedUntil: untilDate, updatedAt: serverTimestamp(), updatedBy: me });
}
```

Where `resolveSelectedBranchId`, `_resolveBranchIdForWrite`, `_resolveAuthAttribution` already exist (used by other recall-like writers — search backendClient.js to confirm names; adjust import or use existing patterns).

- [ ] **Step 2.4: Re-export in scopedDataLayer.js**

Modify `src/lib/scopedDataLayer.js` — add Recall exports (mirror existing pattern):

```js
// Phase 29 — Recall System BSA wrapping
export const listRecalls = (...args) => raw.listRecalls(...args);
export const listenToRecalls = (...args) => raw.listenToRecalls(...args);
// listRecallsForCustomer + listenToRecallsForCustomer are UNIVERSAL — passthrough
export const listRecallsForCustomer = (...args) => raw.listRecallsForCustomer(...args);
listRecallsForCustomer.__universal__ = true;
export const listenToRecallsForCustomer = (...args) => raw.listenToRecallsForCustomer(...args);
listenToRecallsForCustomer.__universal__ = true;
export const createRecall = (...args) => raw.createRecall(...args);
export const createRecallPair = (...args) => raw.createRecallPair(...args);
export const updateRecall = (...args) => raw.updateRecall(...args);
export const recordRecallOutcome = (...args) => raw.recordRecallOutcome(...args);
export const recordRecallLineSend = (...args) => raw.recordRecallLineSend(...args);
export const snoozeRecall = (...args) => raw.snoozeRecall(...args);
```

- [ ] **Step 2.5: Create `useRecallListener.js` hook**

Create `src/hooks/useRecallListener.js`:
```jsx
import { useEffect, useState } from 'react';
import { useSelectedBranch } from '../lib/BranchContext.jsx';
import { listenToRecalls, listenToRecallsForCustomer } from '../lib/scopedDataLayer.js';

/**
 * Phase 29 (2026-05-14) — recall listener hook.
 * Auto-resubscribes on branch switch.
 *
 * Mode 1: branch-scoped (Backend tab / Frontend tab) — pass {filters}, no customerId
 * Mode 2: per-customer (CDV card, universal) — pass customerId
 */
export function useRecallListener({ filters = {}, customerId = null } = {}) {
  const { branchId } = useSelectedBranch();
  const [recalls, setRecalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    let unsub = () => {};
    if (customerId) {
      unsub = listenToRecallsForCustomer(customerId, (data) => {
        setRecalls(data);
        setLoading(false);
      }, (err) => {
        console.error('[useRecallListener] customer listener:', err);
        setError(err?.message || 'โหลด Recall ไม่สำเร็จ');
        setLoading(false);
      });
    } else {
      unsub = listenToRecalls({ branchId, ...filters }, (data) => {
        setRecalls(data);
        setLoading(false);
      }, (err) => {
        console.error('[useRecallListener] branch listener:', err);
        setError(err?.message || 'โหลด Recall ไม่สำเร็จ');
        setLoading(false);
      });
    }
    return () => unsub();
  }, [branchId, customerId, JSON.stringify(filters)]);

  return { recalls, loading, error };
}
```

- [ ] **Step 2.6: Modify firestore.rules**

Edit `firestore.rules` — find the `be_*` collection block, add:
```
match /be_recalls/{recallId} {
  allow read, write: if isClinicStaff();
}
```

- [ ] **Step 2.7: Modify firestore.indexes.json**

Append 4 composite indexes:
```json
{
  "collectionGroup": "be_recalls",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "branchId", "order": "ASCENDING" },
    { "fieldPath": "recallDate", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "be_recalls",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "branchId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "be_recalls",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "customerId", "order": "ASCENDING" },
    { "fieldPath": "recallDate", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "be_recalls",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "branchId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "snoozedUntil", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 2.8: Run tests + verify green**

```bash
npm test -- --run tests/phase-29-recall-backend-client.test.js 2>&1 | tail -10
```

- [ ] **Step 2.9: Commit + push**

```bash
git add src/lib/backendClient.js src/lib/scopedDataLayer.js src/hooks/useRecallListener.js \
        firestore.rules firestore.indexes.json \
        tests/phase-29-recall-backend-client.test.js
git commit -m "feat(Phase 29.2): backendClient + scopedDataLayer + useRecallListener + rules/indexes"
git push origin master
```

---

## Task 3: Master-data extension (be_products + be_courses + ProductFormModal + CourseFormModal)

**Files:**
- Modify: `src/lib/productValidation.js`
- Modify: `src/lib/courseValidation.js`
- Modify: `src/components/backend/ProductFormModal.jsx`
- Modify: `src/components/backend/CourseFormModal.jsx`
- Create: `tests/phase-29-master-data-recall-fields.test.js`

Spec reference: § 6 master-data extension, § 4.4 inline-learn.

- [ ] **Step 3.1: Write tests for new field validation + form rendering**

Create `tests/phase-29-master-data-recall-fields.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateProduct, emptyProductForm } from '../src/lib/productValidation.js';
import { validateCourse, emptyCourseForm } from '../src/lib/courseValidation.js';

describe('Phase 29 · master-data recall fields', () => {
  it('M1.1 productForm has 4 new fields with null defaults', () => {
    const form = emptyProductForm();
    expect(form).toHaveProperty('followUpAfterDays', null);
    expect(form).toHaveProperty('followUpReason', null);
    expect(form).toHaveProperty('recallAfterDays', null);
    expect(form).toHaveProperty('recallReason', null);
  });
  it('M1.2 courseForm has same 4 new fields', () => {
    const form = emptyCourseForm();
    expect(form).toHaveProperty('followUpAfterDays', null);
    expect(form).toHaveProperty('recallAfterDays', null);
  });
  it('M1.3 validation accepts null fields (optional)', () => {
    const product = { ...emptyProductForm(), productName: 'X', mainUnitName: 'ครั้ง' };
    expect(validateProduct(product).ok).toBe(true);
  });
  it('M1.4 validation rejects negative afterDays', () => {
    const product = { ...emptyProductForm(), productName: 'X', mainUnitName: 'ครั้ง', recallAfterDays: -1 };
    const out = validateProduct(product);
    expect(out.ok).toBe(false);
    expect(out.errors.some(e => e.includes('recallAfterDays'))).toBe(true);
  });
});
```

- [ ] **Step 3.2: Run failing tests**

Expected: FAIL.

- [ ] **Step 3.3: Extend `productValidation.js`**

Modify `emptyProductForm` to include 4 new nullable fields. Extend `validateProduct` to assert non-negative number when present.

- [ ] **Step 3.4: Extend `courseValidation.js`** (same pattern)

- [ ] **Step 3.5: Modify `ProductFormModal.jsx`**

Add a new "Recall settings" section near the bottom (before Save buttons). 2 sub-cards:

```jsx
<div className="mt-4 p-3 bg-[var(--bg-elevated)] rounded-lg">
  <div className="text-xs font-bold text-[var(--tx-heading)] mb-2">🔔 Recall settings (optional)</div>

  {/* Slot 1 */}
  <div className="mb-3 p-2 bg-[var(--bg-card)] rounded border-l-2 border-l-amber-500">
    <div className="text-xs font-bold text-amber-300 mb-1">🩹 Recall #1 (ติดตามอาการ)</div>
    <div className="grid grid-cols-2 gap-2">
      <input type="number" min="0" placeholder="กี่วันหลังการรักษา"
        value={form.followUpAfterDays ?? ''}
        onChange={e => setForm({ ...form, followUpAfterDays: e.target.value === '' ? null : Number(e.target.value) })}
        className="px-2 py-1.5 bg-[var(--bg-input)] border border-[var(--bd)] rounded text-xs text-white" />
      <input type="text" placeholder="เรื่อง / เหตุผล default"
        value={form.followUpReason ?? ''}
        onChange={e => setForm({ ...form, followUpReason: e.target.value || null })}
        className="px-2 py-1.5 bg-[var(--bg-input)] border border-[var(--bd)] rounded text-xs text-white" />
    </div>
  </div>

  {/* Slot 2 */}
  <div className="p-2 bg-[var(--bg-card)] rounded border-l-2 border-l-red-500">
    <div className="text-xs font-bold text-red-300 mb-1">📅 Recall #2 (นัดกลับมา)</div>
    <div className="grid grid-cols-2 gap-2">
      <input type="number" min="0" placeholder="กี่วัน (เช่น 180 = 6 เดือน)"
        value={form.recallAfterDays ?? ''}
        onChange={e => setForm({ ...form, recallAfterDays: e.target.value === '' ? null : Number(e.target.value) })}
        className="px-2 py-1.5 bg-[var(--bg-input)] border border-[var(--bd)] rounded text-xs text-white" />
      <input type="text" placeholder="เรื่อง / เหตุผล default"
        value={form.recallReason ?? ''}
        onChange={e => setForm({ ...form, recallReason: e.target.value || null })}
        className="px-2 py-1.5 bg-[var(--bg-input)] border border-[var(--bd)] rounded text-xs text-white" />
    </div>
  </div>
</div>
```

- [ ] **Step 3.6: Modify `CourseFormModal.jsx`** (same pattern)

- [ ] **Step 3.7: Run tests + verify**

- [ ] **Step 3.8: Commit + push**

```bash
git add src/lib/productValidation.js src/lib/courseValidation.js \
        src/components/backend/ProductFormModal.jsx src/components/backend/CourseFormModal.jsx \
        tests/phase-29-master-data-recall-fields.test.js
git commit -m "feat(Phase 29.3): master-data recall fields on be_products + be_courses + form UI"
git push origin master
```

---

## Task 4: `RecallRow` + `RecallPairBadge` (shared atoms)

**Files:**
- Create: `src/components/backend/recall/RecallRow.jsx`
- Create: `src/components/backend/recall/RecallPairBadge.jsx`
- Create: `tests/phase-29-recall-row-rtl.test.jsx`

Spec reference: § 4.1 row design, § 4.7 pair badge.

- [ ] **Step 4.1: Write failing RTL tests for RecallRow (13 cases R-Row.1 to R-Row.13)**

(Full test code per spec § 9 Layer 2 — list of 13 assertions covering name, status chip, LINE button visibility, click → toggle, edit/delete stopPropagation, chevron rotation, expanded styling, etc. Use the same e.stopPropagation pattern as Phase 28 TreatmentHistoryRow.)

Skeleton:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecallRow } from '../src/components/backend/recall/RecallRow.jsx';

const sampleRecall = {
  id: 'R1', branchId: 'BR-1', customerId: 'LC-1', customerName: 'นาย Aaa', customerPhone: '081-x', customerLineUserId: 'U_x',
  slotType: 'aftercare', recallDate: '2026-05-15', reason: 'ติดตามอาการ',
  status: 'pending', noAnswerCount: 0,
};

describe('Phase 29 · RecallRow RTL', () => {
  it('R-Row.1 renders name + reason + status chip', () => {
    render(<RecallRow recall={sampleRecall} todayISO="2026-05-14" />);
    expect(screen.getByText('นาย Aaa')).toBeInTheDocument();
    expect(screen.getByText(/ติดตามอาการ/)).toBeInTheDocument();
  });
  it('R-Row.2 LINE button visible when customerLineUserId present', () => {
    render(<RecallRow recall={sampleRecall} todayISO="2026-05-14" onLineSend={() => {}} />);
    expect(screen.getByTestId(`recall-line-${sampleRecall.id}`)).toBeInTheDocument();
  });
  it('R-Row.3 LINE button hidden when customerLineUserId is null', () => {
    render(<RecallRow recall={{ ...sampleRecall, customerLineUserId: null }} todayISO="2026-05-14" onLineSend={() => {}} />);
    expect(screen.queryByTestId(`recall-line-${sampleRecall.id}`)).not.toBeInTheDocument();
  });
  // ... R-Row.4 to R-Row.13 covering: status chips per status, click action → callbacks fire,
  //     overdue pulse class, snoozed fade, pair badge renders when pairedRecallId, etc.
});
```

(Full assertions in test bank — see spec § 9 Layer 2.)

- [ ] **Step 4.2: Implement RecallPairBadge.jsx**

```jsx
import React from 'react';
import { formatPairBadge } from '../../../lib/recallResolvers.js';

/**
 * Phase 29 (2026-05-14) — pair link badge rendered below recall row meta.
 * Format: "🔗 จับคู่กับ: <icon> <reason> · <date> · <status-suffix>"
 * Clickable — calls onClick(pairedRecallId).
 */
export function RecallPairBadge({ paired, todayISO, onClick }) {
  if (!paired) return null;
  const data = formatPairBadge(paired, todayISO);
  if (!data) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(paired.id); }}
      data-testid={`recall-pair-badge-${paired.id}`}
      className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded
        bg-indigo-500/[0.08] border border-indigo-400/25 border-l-2 border-l-indigo-500
        text-[10px] text-indigo-300 hover:bg-indigo-500/[0.14] hover:border-indigo-400/40
        transition-colors cursor-pointer"
    >
      <span>🔗</span>
      <span className="opacity-85 font-bold">จับคู่กับ:</span>
      <span>{data.icon}</span>
      <span className="text-white font-bold">{data.reason}</span>
      <span className="font-mono text-[9.5px] text-gray-400 font-semibold">· {data.date} · {data.statusSuffix}</span>
    </button>
  );
}
```

- [ ] **Step 4.3: Implement RecallRow.jsx**

```jsx
import React from 'react';
import { Phone, MessageCircle, Clock, AlertCircle } from 'lucide-react';
import { getRecallStatusLabel, getRecallStatusColor, getEffectiveRecallDate, isOverdue } from '../../../lib/recallResolvers.js';
import { RecallPairBadge } from './RecallPairBadge.jsx';
import { formatBadgeTime } from '../../../lib/formatBadgeTime.js';

/**
 * Phase 29 (2026-05-14) — single recall row.
 * Used by RecallList (Backend) + RecallFrontendList (Frontend) + RecallCard (CDV).
 *
 * Click body → onClick(recall.id) — opens detail/edit modal
 * Click action chips → calls respective callbacks WITH e.stopPropagation
 */
export function RecallRow({
  recall,
  todayISO,
  pairedRecall, // optional — passed by parent if pair exists
  onClick,
  onRecordOutcome,
  onLineSend,
  onSnooze,
  onPairClick,
}) {
  if (!recall) return null;
  const statusColor = getRecallStatusColor(recall);
  const statusLabel = getRecallStatusLabel(recall, todayISO);
  const over = isOverdue(recall, todayISO);
  const snoozed = !!recall.snoozedUntil && recall.status === 'pending';

  const rowClass = [
    'group grid grid-cols-[56px_1fr_auto] gap-2.5 px-3 py-2.5 transition-colors cursor-pointer',
    'border-b border-[#1a1a1a] last:border-b-0',
    snoozed ? 'opacity-65' : '',
    'hover:bg-white/[0.015]',
  ].join(' ');

  return (
    <div
      data-testid={`recall-row-${recall.id}`}
      className={rowClass}
      onClick={() => onClick?.(recall.id)}
    >
      {/* Time column */}
      <div className={`font-mono text-[11px] font-bold ${over ? 'text-red-300' : 'text-gray-400'} pt-0.5`}>
        {recall.recallDate ? recall.recallDate.split('-').slice(1).reverse().join('/') : '--'}
      </div>

      {/* Content */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-bold text-white">{recall.customerName}</span>
          {recall.customerLineUserId && (
            <span className="text-[8px] px-1 py-0 bg-green-500/15 text-green-300 border border-green-500/30 rounded font-bold">L</span>
          )}
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-bold border"
            style={{ background: statusColor.bg, borderColor: statusColor.border, color: statusColor.text }}
          >
            {statusLabel}
          </span>
        </div>
        <div className="text-[10px] text-gray-400 mt-1 line-clamp-1">{recall.reason}</div>
        {recall.sourceProductName && (
          <div className="text-[9px] text-gray-500 mt-0.5">{recall.sourceProductName}</div>
        )}
        {recall.outcomeNote && recall.status === 'done' && (
          <div className="mt-1.5 px-2 py-1 bg-emerald-500/5 border-l-2 border-emerald-500 text-[9.5px] text-emerald-300 italic rounded">
            "{recall.outcomeNote}" — {recall.outcomeBy?.name || ''}
          </div>
        )}
        {pairedRecall && (
          <RecallPairBadge paired={pairedRecall} todayISO={todayISO} onClick={onPairClick} />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1 self-start opacity-70 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        {onRecordOutcome && recall.status !== 'done' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRecordOutcome(recall.id); }}
            data-testid={`recall-record-${recall.id}`}
            className="w-6 h-6 rounded bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 flex items-center justify-center"
            aria-label="บันทึกผลการโทร"
            title="📞 บันทึกผลการโทร"
          >
            <Phone size={11} />
          </button>
        )}
        {onLineSend && recall.customerLineUserId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onLineSend(recall.id); }}
            data-testid={`recall-line-${recall.id}`}
            className="w-6 h-6 rounded bg-green-500/10 border border-green-500/30 text-green-300 hover:bg-green-500/20 flex items-center justify-center"
            aria-label="ส่ง LINE"
            title="💬 ส่ง LINE template"
          >
            <MessageCircle size={11} />
          </button>
        )}
        {onSnooze && recall.status !== 'done' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSnooze(recall.id); }}
            data-testid={`recall-snooze-${recall.id}`}
            className="w-6 h-6 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 flex items-center justify-center"
            aria-label="เลื่อน"
            title="⏰ เลื่อน Recall"
          >
            <Clock size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4.4: Run tests + iterate to green**

- [ ] **Step 4.5: Commit + push**

```bash
git add src/components/backend/recall/RecallRow.jsx src/components/backend/recall/RecallPairBadge.jsx \
        tests/phase-29-recall-row-rtl.test.jsx
git commit -m "feat(Phase 29.4): RecallRow + RecallPairBadge (shared atoms used by all 3 surfaces)"
git push origin master
```

---

## Task 5: `RecallSectionHeader` + `RecallEmptyState` + `RecallList`

**Files:**
- Create: `src/components/backend/recall/RecallSectionHeader.jsx`
- Create: `src/components/backend/recall/RecallEmptyState.jsx`
- Create: `src/components/backend/recall/RecallList.jsx`
- Extend: `tests/phase-29-recall-row-rtl.test.jsx` (add section/list RTL)

Spec reference: § 4.1 sections + buckets, § 5.2 grouping.

- [ ] **Step 5.1: Implement `RecallSectionHeader.jsx`**

Per spec § 4.1 — 5 bucket variants (overdue/today/tomorrow/week/later) with theme color tokens. Mirror Phase 28 `TreatmentDateHeader` pattern.

- [ ] **Step 5.2: Implement `RecallEmptyState.jsx`**

Centered empty card with icon + "ไม่มี Recall · กดปุ่ม + เพื่อเพิ่ม"

- [ ] **Step 5.3: Implement `RecallList.jsx`**

Composes:
1. Group recalls via `groupRecallsByTimeBucket(recalls, todayISO)`
2. Build pairedRecallId → recall lookup map (single pass)
3. Render 5 sections in order; skip empty
4. Pass `pairedRecall={lookupMap.get(r.pairedRecallId)}` to each `RecallRow`
5. Optional `mode='compact'` prop for Frontend tab (hides tomorrow/week/later sections)

- [ ] **Step 5.4: Write RTL tests + iterate to green**

- [ ] **Step 5.5: Commit + push**

```bash
git add src/components/backend/recall/RecallSectionHeader.jsx src/components/backend/recall/RecallEmptyState.jsx src/components/backend/recall/RecallList.jsx \
        tests/phase-29-recall-row-rtl.test.jsx
git commit -m "feat(Phase 29.5): RecallSectionHeader + RecallEmptyState + RecallList composer"
git push origin master
```

---

## Task 6: `RecallSlotCard` + `RecallCreateModal` (2-slot design)

**Files:**
- Create: `src/components/backend/recall/RecallSlotCard.jsx`
- Create: `src/components/backend/recall/RecallCreateModal.jsx`
- Create: `tests/phase-29-recall-create-modal-rtl.test.jsx`

Spec reference: § 4.4, § 5.1 slot toggle behavior, § 5.3 + § 5.4 auto-suggest + inline-learn.

- [ ] **Step 6.1: Write failing RTL tests (M1.1-M11)**

40 assertions per spec § 9 Layer 2. Cover toggle on/off, days-from-now indicator updates, validation (both off), 1-slot vs 2-slot save creates 1 or 2 recalls, auto-suggest hint, inline-learn checkbox, footer summary, ESC + backdrop close, edit-mode pre-fill.

- [ ] **Step 6.2: Implement `RecallSlotCard.jsx`** (per spec § 4.4 + slot variants)

Props: `slotType` ('aftercare' | 'revisit'), `value`, `onChange`, `todayISO`, `masterDataSuggestion`, `autoSuggestFired`. Internal collapse on disabled toggle. DateField from `src/components/DateField.jsx` (dd/mm/yyyy พ.ศ.). Days-from-now badge updated via `computeDaysFromToday`. Auto-suggest hint shown when masterDataSuggestion provided. Inline-learn checkbox shown when no master-data exists.

- [ ] **Step 6.3: Implement `RecallCreateModal.jsx`** (2-slot composer)

Wraps 2 `<RecallSlotCard>` components. Validation via `validateRecallCreate`. Save dispatches `createRecall` or `createRecallPair` depending on enabled count. Footer summary updates live. Customer picker (optional — if not pre-filled). Treatment context shown in customer header card.

- [ ] **Step 6.4: Run tests + iterate to green**

- [ ] **Step 6.5: Commit + push**

```bash
git add src/components/backend/recall/RecallSlotCard.jsx src/components/backend/recall/RecallCreateModal.jsx \
        tests/phase-29-recall-create-modal-rtl.test.jsx
git commit -m "feat(Phase 29.6): RecallSlotCard + RecallCreateModal (2-slot design + auto-suggest + inline-learn)"
git push origin master
```

---

## Task 7: `RecallOutcomeModal` (outcome state machine + auto-snooze)

**Files:**
- Create: `src/components/backend/recall/RecallOutcomeModal.jsx`
- Create: `tests/phase-29-recall-outcome-modal-rtl.test.jsx`

Spec reference: § 4.5, § 5.5 state machine, § 5.7 auto-snooze.

- [ ] **Step 7.1: Write failing RTL tests (O1.x — 25 assertions)**

Per spec § 9 Layer 2 — 4 outcome cards, auto-snooze hint, save dispatches with correct payload, edge cases.

- [ ] **Step 7.2: Implement modal**

4 outcome cards (✓ จะมาตามนัด / ⏰ ขอเลื่อน / 💭 ไม่สนใจ / 📵 ติดต่อไม่ได้). Selected outcome highlights its card. Textarea for `outcomeNote`. Save calls `recordRecallOutcome(id, { outcome, outcomeNote, currentNoAnswerCount })`. If outcome === 'no-answer' → show purple hint card "auto-snooze 3 วัน". If reschedule → opens snooze date picker post-save.

- [ ] **Step 7.3: Run tests + iterate**

- [ ] **Step 7.4: Commit + push**

```bash
git add src/components/backend/recall/RecallOutcomeModal.jsx tests/phase-29-recall-outcome-modal-rtl.test.jsx
git commit -m "feat(Phase 29.7): RecallOutcomeModal (4-category outcome + auto-snooze + manual-review escalation)"
git push origin master
```

---

## Task 8: `RecallLineTemplateModal` + server endpoint `api/admin/line-send-recall.js`

**Files:**
- Create: `src/components/backend/recall/RecallLineTemplateModal.jsx`
- Create: `api/admin/line-send-recall.js`
- Create: `tests/phase-29-recall-line-template-modal-rtl.test.jsx`
- Create: `tests/phase-29-line-send-recall-endpoint.test.js`

Spec reference: § 4.6 LINE template flow, § 5.9.

- [ ] **Step 8.1: Write failing RTL tests for modal (LT1.x — 20 assertions)**

Cover 3 templates render, preview shows with vars substituted, send disabled until template picked, POST shape correct, success/failure paths.

- [ ] **Step 8.2: Write failing tests for server endpoint**

Test admin-token gate + chat_config read + LINE Push API call (mocked) + chat_conversations append.

- [ ] **Step 8.3: Implement modal**

Lists 3 default templates via `DEFAULT_RECALL_TEMPLATES`. Preview area renders `renderTemplate(template.text, getRecallTemplateVariables(recall, customer))`. Send button POSTs to `/api/admin/line-send-recall` with `{ recallId, customerLineUserId, templateId, messageText }`. On success: closes + adds "💬 ส่ง LINE" chip via parent `recordRecallLineSend` callback.

- [ ] **Step 8.4: Implement server endpoint `api/admin/line-send-recall.js`**

Mirror existing `/api/admin/line-test` pattern from V32-tris-ter-fix:
- Verify admin token via `verifyAdminToken` (existing util)
- Read `chat_config` via firebase-admin Firestore SDK
- POST to LINE Push API with bearer token
- Append system message to `chat_conversations/{conversationId}` (find existing conversation or create)
- Return `{ ok: true, messageId, sentAt }`

- [ ] **Step 8.5: Run tests + iterate**

- [ ] **Step 8.6: Commit + push**

```bash
git add src/components/backend/recall/RecallLineTemplateModal.jsx api/admin/line-send-recall.js \
        tests/phase-29-recall-line-template-modal-rtl.test.jsx tests/phase-29-line-send-recall-endpoint.test.js
git commit -m "feat(Phase 29.8): RecallLineTemplateModal + /api/admin/line-send-recall endpoint"
git push origin master
```

---

## Task 9: `RecallSnoozeMenu` (compact date picker)

**Files:**
- Create: `src/components/backend/recall/RecallSnoozeMenu.jsx`
- Extend tests in row RTL bank

Spec reference: § 5.8 snooze.

- [ ] **Step 9.1: Implement compact date picker popover**

Shortcuts: "+3 วัน" / "+7 วัน" / "+14 วัน" / "เลือกวันที่..." (opens DateField). Save calls `snoozeRecall(id, untilDate)`.

- [ ] **Step 9.2: Test + commit**

```bash
git add src/components/backend/recall/RecallSnoozeMenu.jsx
git commit -m "feat(Phase 29.9): RecallSnoozeMenu (compact snooze picker)"
git push origin master
```

---

## Task 10: `RecallTab` (Backend tab) + nav registration + BackendDashboard wire

**Files:**
- Create: `src/components/backend/recall/RecallTab.jsx`
- Create: `src/components/backend/recall/RecallHeader.jsx`
- Modify: `src/components/backend/nav/navConfig.js` (add `recall` tab)
- Modify: `src/pages/BackendDashboard.jsx` (lazy-import + render case)
- Create: `tests/phase-29-recall-tab-rtl.test.jsx`

Spec reference: § 4.1, § 7 component architecture.

- [ ] **Step 10.1: Modify `navConfig.js`** — add `recall` after `appointment-walk-in`:
```js
{ id: 'recall', label: 'Recall', icon: PhoneCall, color: 'rose', palette: 'recall ติดตาม recall โทรกลับ follow-up phone call' },
```
Import `PhoneCall` from lucide-react at top of file.

- [ ] **Step 10.2: Modify `BackendDashboard.jsx`** — lazy import + render case:
```js
const RecallTab = lazy(() => import('../components/backend/recall/RecallTab.jsx'));
// ... inside renderTabContent switch:
case 'recall':
  return <RecallTab />;
```

- [ ] **Step 10.3: Implement `RecallHeader.jsx`** (icon + title + count + search + filter + create-btn)

- [ ] **Step 10.4: Implement `RecallTab.jsx`**

Uses `useRecallListener({ filters })` for branch-scoped real-time. Composes Header + RecallList (mode='full', all 5 sections). Manages modal state (create/outcome/line/snooze). Filter state (status / date range).

- [ ] **Step 10.5: Tests + commit**

```bash
git add src/components/backend/recall/RecallTab.jsx src/components/backend/recall/RecallHeader.jsx \
        src/components/backend/nav/navConfig.js src/pages/BackendDashboard.jsx \
        tests/phase-29-recall-tab-rtl.test.jsx
git commit -m "feat(Phase 29.10): RecallTab (Backend) + nav registration"
git push origin master
```

---

## Task 11: Frontend Recall sub-tab + AdminDashboard view-toggle 3-state extension

**Files:**
- Modify: `src/pages/AdminDashboard.jsx` (extend view-toggle, render RecallList in recall mode)
- Create: `tests/phase-29-recall-frontend-tab-rtl.test.jsx`

Spec reference: § 4.2 Frontend scope.

- [ ] **Step 11.1: Extend `apptViewMode` state to support 'recall'**

At AdminDashboard.jsx:600 — change initial state if needed. Add 3rd toggle pill at lines 6480-6505 area.

- [ ] **Step 11.2: Add render branch when `apptViewMode === 'recall'`**

```jsx
{apptViewMode === 'recall' ? (
  <RecallList
    mode="compact"
    todayISO={thaiTodayISO()}
    onRecordOutcome={...}
    onLineSend={...}
    onSnooze={...}
    onCreate={() => setShowRecallCreate(true)}
  />
) : ...}
```

Pass mode='compact' to hide tomorrow/week/later sections (only overdue + today).

- [ ] **Step 11.3: Add tab badge with real-time count**

Use `useRecallListener({ filters: { dateBefore: tomorrowISO() } })` to count pending+overdue. Badge updates live.

- [ ] **Step 11.4: Tests + commit**

```bash
git add src/pages/AdminDashboard.jsx tests/phase-29-recall-frontend-tab-rtl.test.jsx
git commit -m "feat(Phase 29.11): Frontend Recall sub-tab + 3-state view-toggle extension"
git push origin master
```

---

## Task 12: `RecallCard` (CDV) + CDV wire + TreatmentHistoryRow "+ Recall" chip

**Files:**
- Create: `src/components/backend/customer-recall/RecallCard.jsx`
- Modify: `src/components/backend/CustomerDetailView.jsx`
- Modify: `src/components/backend/treatment-history/TreatmentHistoryRow.jsx` (add "+ Recall" chip)
- Create: `tests/phase-29-recall-cdv-card-rtl.test.jsx`

Spec reference: § 4.3 CDV card, § 5.3 entry point 4.

- [ ] **Step 12.1: Implement `RecallCard.jsx`**

Mirror the appointment-card pattern (per screenshot reference). Uses `useRecallListener({ customerId })` (universal — not branch-scoped). Renders count + ดูทั้งหมด + เพิ่ม Recall buttons + list of recent rows. Footer hint when historical count > visible.

- [ ] **Step 12.2: Wire into `CustomerDetailView.jsx`**

Render `<RecallCard customerId={customer.id} customer={customer} />` next to the existing appointments card (find the "นัดหมายครั้งถัดไป" card location in CDV.jsx — likely around lines 1300-1400 based on Phase 28 audit).

- [ ] **Step 12.3: Modify `TreatmentHistoryRow.jsx`** — add "+ Recall" chip

In the action chips area (where edit/delete chips live), add a new chip:
```jsx
{onCreateRecall && (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onCreateRecall(t.id); }}
    data-testid={`treatment-recall-${t.id}`}
    title="+ ตั้ง Recall จากการรักษานี้"
    aria-label="ตั้ง Recall จากการรักษานี้"
    className="w-[26px] h-[26px] rounded-md flex items-center justify-center
      bg-rose-500/[0.08] border border-rose-500/30 text-rose-300
      hover:bg-rose-500/[0.18] transition-all"
  >
    <PhoneCall size={11} aria-hidden="true" />
  </button>
)}
```

Pass `onCreateRecall` through from CDV via TreatmentHistoryCard → TreatmentHistoryRow.

- [ ] **Step 12.4: Wire CDV + TreatmentHistoryRow callbacks**

In CDV, define `handleCreateRecallFromTreatment(treatmentId)` that finds the treatment + customer + product, then opens `RecallCreateModal` pre-filled with `sourceTreatmentId`, `sourceProductId`, `customerId`. Auto-suggest fires inside modal based on product master-data.

- [ ] **Step 12.5: Run tests + iterate**

- [ ] **Step 12.6: Commit + push**

```bash
git add src/components/backend/customer-recall/RecallCard.jsx \
        src/components/backend/CustomerDetailView.jsx \
        src/components/backend/treatment-history/TreatmentHistoryRow.jsx \
        tests/phase-29-recall-cdv-card-rtl.test.jsx
git commit -m "feat(Phase 29.12): RecallCard (CDV) + TreatmentHistoryRow + Recall chip (from-treatment entry point)"
git push origin master
```

---

## Task 13: Source-grep regression bank (Layer 3 — anti-flicker + DRY)

**Files:**
- Create: `tests/phase-29-recall-source-grep.test.js`

Spec reference: § 9 Layer 3.

- [ ] **Step 13.1: Implement 27 source-grep assertions (SG1-SG12)**

Per spec § 9 Layer 3 — DRY enforcement (all surfaces import shared RecallRow), anti-flicker (no `key={index}` / `key={Date.now()}`), BSA compliance, no `draft-suggested` status anywhere (drift-back guard), Phase 29 marker comments.

- [ ] **Step 13.2: Iterate + commit**

```bash
git add tests/phase-29-recall-source-grep.test.js
git commit -m "test(Phase 29.13): source-grep regression bank (anti-flicker + DRY + BSA + anti-drift-back)"
git push origin master
```

---

## Task 14: Rule I full-flow simulate + multi-surface real-time tests (Layers 4 + 5)

**Files:**
- Create: `tests/phase-29-recall-flow-simulate.test.jsx`
- Create: `tests/phase-29-recall-multi-surface-realtime.test.jsx`

Spec reference: § 9 Layer 4 + Layer 5.

- [ ] **Step 14.1: Implement F1.x flow-simulate (30 assertions)**

Use 8-recall realistic fixture per spec. Chain: mount RecallTab → click row → modal opens → record outcome → status flips → bucket re-assigns. Validate pair badge shows correct status suffix per all 5 cases.

- [ ] **Step 14.2: Implement MS1.x multi-surface real-time (25 assertions)**

CRITICAL — mount Backend RecallTab + CDV RecallCard in 1 test → mock Firestore listener event → both update. Verify NO unmount via test render IDs. Anti-flicker discipline tests.

- [ ] **Step 14.3: Iterate + commit**

```bash
git add tests/phase-29-recall-flow-simulate.test.jsx tests/phase-29-recall-multi-surface-realtime.test.jsx
git commit -m "test(Phase 29.14): Rule I flow-simulate + multi-surface real-time integration (Layers 4+5)"
git push origin master
```

---

## Task 15: Adversarial + property-based tests (Layer 6)

**Files:**
- Create: `tests/phase-29-recall-adversarial.test.js`

Spec reference: § 9 Layer 6.

- [ ] **Step 15.1: Implement 30 adversarial assertions (ADV1-ADV15)**

Per spec § 9 Layer 6 — empty/null/missing pair handling, cross-customer pair, TZ edge, property-based via fast-check (mulberry32 seed 42, 100 iterations on `groupRecallsByTimeBucket` invariant: sum-of-buckets === input-size), long Thai names, noAnswerCount overflow, 1000-row stress test, concurrent mutations, stale LINE token, validation drops disabled-slot data.

- [ ] **Step 15.2: Run + iterate + commit**

```bash
git add tests/phase-29-recall-adversarial.test.js
git commit -m "test(Phase 29.15): adversarial + property-based (Layer 6 — 30 assertions)"
git push origin master
```

---

## Task 16: V21 fixups for affected existing tests

**Files:** various (TBD by running full suite)

- [ ] **Step 16.1: Run full vitest, capture failures**

```bash
npm test -- --run 2>&1 | grep -E "FAIL|×" | head -30
```

- [ ] **Step 16.2: Classify each failure**

CDV-affected tests likely break (RecallCard added next to appointments card). TreatmentHistoryRow tests may break ("+ Recall" chip added). Update each with Phase 29 marker comment + new expectation. NEVER lock OLD inline structure.

- [ ] **Step 16.3: Commit V21 fixups in single batch**

```bash
git add tests/<all fixed test files>
git commit -m "test(Phase 29.16 V21 fixup): patch tests broken by RecallCard wire + TreatmentHistoryRow chip"
git push origin master
```

---

## Task 17: Live preview verification (Rule I item b)

**Files:** None (preview tool verification)

Spec reference: § 9 Layer 8.

- [ ] **Step 17.1: Start preview server**

Use `mcp__Claude_Preview__preview_start` with "Vite Dev Server" config.

- [ ] **Step 17.2: Navigate to LC-26000006 backend CDV**

Via preview_eval: navigate to `/?backend=1&customer=LC-26000006`. Verify RecallCard renders next to appointments card.

- [ ] **Step 17.3: Test real-time multi-surface refresh**

Open 2 tabs: Backend RecallTab + CDV RecallCard. Create recall in CDV modal. Verify Backend tab shows new row within 100ms WITHOUT page refresh. Verify chevron states, status chips, pair badges all render correctly.

- [ ] **Step 17.4: Test dark + light theme + mobile**

Toggle `data-theme` + preview_resize mobile 375x812. Verify card frame + accents preserved.

- [ ] **Step 17.5: Console error check**

`preview_console_logs level='error'` — verify 0 NEW Phase 29 errors.

- [ ] **Step 17.6: No commit (verification only — documented in checkpoint Task 20)**

---

## Task 18: Live admin-SDK e2e on real prod

**Files:**
- Create: `scripts/phase-29-recall-e2e-real-prod.mjs`

Spec reference: § 9 Layer 7.

- [ ] **Step 18.1: Implement script**

`vercel env pull .env.local.prod --environment=production` (if not pulled). Use firebase-admin to:
- Create 5 TEST-RECALL- prefixed fixtures
- Verify real-time listener fires for each create/update/delete (use admin SDK onSnapshot)
- Cleanup at end (deletes all TEST- prefixed fixtures)
- Two-phase: dry-run default + `--apply` flag

- [ ] **Step 18.2: Run dry-run on real prod**

```bash
node scripts/phase-29-recall-e2e-real-prod.mjs
```
Expect: 0/0 PASS dry-run summary.

- [ ] **Step 18.3: Run --apply (user-gated)**

Only after user explicitly authorizes:
```bash
node scripts/phase-29-recall-e2e-real-prod.mjs --apply
```
Expect: 5 creates + 5 listener fires + 5 deletes (cleanup) = 15/15 PASS. Audit doc to `be_admin_audit/phase-29-recall-e2e-{ts}-{rand}`.

- [ ] **Step 18.4: Commit script**

```bash
git add scripts/phase-29-recall-e2e-real-prod.mjs
git commit -m "test(Phase 29.18): admin-SDK e2e script (real-prod listener verification, --apply user-gated)"
git push origin master
```

---

## Task 19: Final batch verify (full vitest + build + audits)

**Files:** None (verification only)

- [ ] **Step 19.1: Full vitest**

```bash
npm test -- --run 2>&1 | tail -5
```
Expected: > 9176 + ~362 Phase 29 = > 9538 pass, 0 fail.

- [ ] **Step 19.2: Build clean**

```bash
npm run build 2>&1 | tail -5
```
Expected: clean. BackendDashboard chunk delta < +20 KB.

- [ ] **Step 19.3: Audit branch-scope (no regression)**

```bash
npm test -- --run tests/audit-branch-scope.test.js 2>&1 | tail -5
```
Expected: green (BS-13 + new Phase 29 invariants all pass).

- [ ] **Step 19.4: Commit final state if drift fixes needed**

---

## Task 20: SESSION_HANDOFF + active.md + checkpoint + V-log

**Files:**
- Modify: `SESSION_HANDOFF.md`
- Modify: `.agents/active.md`
- Modify: `.claude/rules/00-session-start.md` § 2 (Phase 29 entry)
- Create: `.agents/sessions/<date>-phase-29-recall-system.md`

Mirror Phase 28 pattern.

- [ ] **Step 20.1: Update SESSION_HANDOFF.md** (insert new session block at top + Resume Prompt)

- [ ] **Step 20.2: Update .agents/active.md** (state + last_commit + tests + "Outstanding: deploy auth")

- [ ] **Step 20.3: Append Phase 29 entry to .claude/rules/00-session-start.md § 2**

- [ ] **Step 20.4: Create checkpoint at .agents/sessions/<date>-phase-29-recall-system.md** (≤ 200 lines per session-end skill)

- [ ] **Step 20.5: Commit + push**

```bash
git add SESSION_HANDOFF.md .agents/active.md .claude/rules/00-session-start.md .agents/sessions/*.md
git commit -m "docs(Phase 29): SESSION_HANDOFF + active + V-log + checkpoint"
git push origin master
```

---

## Task 21: V15 combined deploy (V18 user-authorized THIS turn)

User pre-authorization required THIS turn (per V18 — explicit "deploy" verb). If granted:

- [ ] **Step 21.1: Pre-deploy probe (Rule B — 4 endpoints)**

Run probes 1, 5, 6, 7 per `.claude/rules/01-iron-clad.md` Rule B. ALL must return 200.

- [ ] **Step 21.2: Combined V15 deploy in parallel (2 Bash calls)**

```bash
vercel --prod --yes
firebase deploy --only firestore:rules,firestore:indexes
```

Note: indexes deploy is part of the same firebase deploy command. Indexes auto-build (5-20 min) but rules apply immediately. Listener queries fail until indexes built — handle gracefully (loading state).

- [ ] **Step 21.3: Post-deploy probe (Rule B)**

Re-run all 4 probes. Any 403 → revert immediately.

- [ ] **Step 21.4: Cleanup probe artifacts**

Use `/api/admin/cleanup-test-probes`.

- [ ] **Step 21.5: Smoke test production URL**

```bash
curl -I https://lover-clinic-app.vercel.app
```

- [ ] **Step 21.6: Update active.md + SESSION_HANDOFF post-deploy**

```markdown
production_commit: "<new sha>"
firestore_rules_version: <bumped>
```

Commit + push final state.

---

## Self-review

(Per writing-plans protocol — performed after plan written.)

**Spec coverage check** — every spec section maps to ≥1 task:

| Spec section | Task |
|---|---|
| § 1-3 Context/goal/locked decisions | All tasks |
| § 4.1 Backend tab | Task 10 |
| § 4.2 Frontend sub-tab | Task 11 |
| § 4.3 CDV card | Task 12 |
| § 4.4 RecallCreateModal | Task 6 |
| § 4.5 RecallOutcomeModal | Task 7 |
| § 4.6 RecallLineTemplateModal | Task 8 |
| § 4.7 Pair badge | Task 4 |
| § 4.8 Status colors | Task 1 (helper) + every component (consumer) |
| § 5.1-5.10 Behaviors | Distributed across tasks (modal: 6; outcome: 7; snooze: 9; real-time: 11+12+17; LINE: 8) |
| § 6 Data model + master-data extension | Task 2 + Task 3 |
| § 7 Component architecture | Tasks 4-12 |
| § 8 Files to touch | All tasks |
| § 9 Test strategy (6 layers) | Layer 1: Task 1; Layer 2: Tasks 4-12 (RTL per component); Layer 3: Task 13; Layer 4+5: Task 14; Layer 6: Task 15; Layer 7: Task 18; Layer 8: Task 17 |
| § 10 Risks + mitigations | Covered in respective tasks (anti-flicker tests in Task 13 + 14; pair-deleted in Task 15; etc.) |
| § 11 Out of scope | Not implemented (deferred) |
| § 12 Migration | Pure additive — no migration task |
| § 13 Verification | Tasks 17 + 18 + 19 |

**Placeholder scan**: no TBD/TODO/maybe in plan body. Test file lists name patterns + skeletons; full assertion text lives in spec § 9 — engineer expands from spec.

**Type consistency**:
- `recall.id` used as React key everywhere ✓
- Status enum: `'pending' | 'done' | 'no-answer' | 'closed-no-answer'` — used consistently across helpers + components + tests ✓
- `pairedRecallId` lookup map pattern in Task 5 matches consumer in Task 4 (RecallRow accepts `pairedRecall` prop) ✓
- `useRecallListener` returns `{ recalls, loading, error }` — consumed by RecallTab + RecallCard + AdminDashboard recall mode ✓
- All listeners safe-by-default per BS-13 ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-14-phase-29-recall-system.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review per high-risk task. Mirror Phase 28 success pattern. Recommended given user demanded HEAVY testing emphasis.

**2. Inline Execution** — executing-plans skill, batch with checkpoints. Faster but less rigorous on review.

**User pre-authorized full autonomy + deploy** (per chat: "หรือจะ writing-plans แชทนี้ก่อนแล้วไปทำทั้งหมดแชทใหม่ ?" + "B เลย"). Execution will happen in a NEW chat session — this chat ends after plan commit + session-end.

Recommended approach for new chat: **Subagent-Driven** per Phase 28 precedent.

After plan committed, this chat will:
1. /session-end → emit Resume Prompt
2. New chat: /session-start → invoke `subagent-driven-development` → execute Task 0 onwards
