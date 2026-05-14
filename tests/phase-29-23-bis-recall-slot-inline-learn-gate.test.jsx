/**
 * Phase 29.23-bis — RecallSlotCard inline-learn checkbox gate.
 *
 * User report (verbatim, 2026-05-14): "ใน modal ตั้ง Recall ใหม่ ทำไมกูเลือก
 * เหตุผล ที่มีอยู่แล้วใน dropdown มา แล้วมึงยังมีช่อง บันทึกเป็นเคส Recall
 * โผล่มาให้ติ๊กอีกวะ มันก็บันทึกซ้ำซ้อนอะดิ".
 *
 * Pre-fix: showInlineLearn = enabled && !masterDataSuggestion && date && reason
 * → checkbox showed whenever admin had typed/picked a reason.
 *
 * Post-fix: also require reason NOT to match an existing case in recallCases.
 * When admin picks "ทดลองติดตาม Filler 6 เดือน" from typeahead and that case
 * already lives in be_recall_cases → no checkbox (would just create a duplicate).
 * When admin types a NEW reason that doesn't match any case → checkbox shows
 * (so admin can opt to persist it).
 *
 * Test bank uses ISOLATED logic — no need to drive the typeahead dropdown
 * (jsdom portal limitations from Phase 29.22 round-1 are well-known); we
 * just set `value.reason` directly via props and check checkbox presence.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Stable today
vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return { ...actual, thaiTodayISO: () => '2026-05-14' };
});

// Mock RecallCaseSelectField — Phase 29.23-bis inline-learn gate is logic
// at the RecallSlotCard layer; we test that logic in isolation. The real
// typeahead component is separately tested by phase-29-22-recall-case-select-field.
vi.mock('../src/components/backend/recall/RecallCaseSelectField.jsx', () => ({
  RecallCaseSelectField: ({ value }) => (
    <input data-testid="mock-rcsf-input" value={value || ''} readOnly />
  ),
}));

import { RecallSlotCard } from '../src/components/backend/recall/RecallSlotCard.jsx';

const CASES = [
  { caseId: 'CASE-1', caseName: 'โทรติดตามอาการ 1 วัน', defaultDays: 1 },
  { caseId: 'CASE-2', caseName: 'ทดลองติดตาม Filler 6 เดือน', defaultDays: 180 },
];

function baseValue(overrides = {}) {
  return {
    enabled: true,
    recallDate: '2026-05-21',
    reason: '',
    saveToMaster: false,
    ...overrides,
  };
}

describe('Phase 29.23-bis IL1 — inline-learn checkbox gate against existing cases', () => {
  it('IL1.1 — hides checkbox when reason matches an EXISTING case (exact)', () => {
    render(
      <RecallSlotCard
        slotType="revisit"
        value={baseValue({ reason: 'ทดลองติดตาม Filler 6 เดือน' })}
        onChange={() => {}}
        todayISO="2026-05-14"
        recallCases={CASES}
      />
    );
    expect(screen.queryByTestId('recall-slot-revisit-save-master')).toBeNull();
  });

  it('IL1.2 — shows checkbox when reason is NEW (no match in cases)', () => {
    render(
      <RecallSlotCard
        slotType="revisit"
        value={baseValue({ reason: 'เคสใหม่ที่ไม่เคยมี' })}
        onChange={() => {}}
        todayISO="2026-05-14"
        recallCases={CASES}
      />
    );
    expect(screen.getByTestId('recall-slot-revisit-save-master')).toBeInTheDocument();
  });

  it('IL1.3 — hides checkbox when reason matches CASE-1 (different case)', () => {
    render(
      <RecallSlotCard
        slotType="aftercare"
        value={baseValue({ reason: 'โทรติดตามอาการ 1 วัน' })}
        onChange={() => {}}
        todayISO="2026-05-14"
        recallCases={CASES}
      />
    );
    expect(screen.queryByTestId('recall-slot-aftercare-save-master')).toBeNull();
  });

  it('IL1.4 — match is whitespace-tolerant (trims both sides)', () => {
    render(
      <RecallSlotCard
        slotType="revisit"
        value={baseValue({ reason: '  ทดลองติดตาม Filler 6 เดือน  ' })}
        onChange={() => {}}
        todayISO="2026-05-14"
        recallCases={CASES}
      />
    );
    expect(screen.queryByTestId('recall-slot-revisit-save-master')).toBeNull();
  });

  it('IL1.5 — match is case-sensitive (typed-different-case → still shows checkbox)', () => {
    // Thai has no case; this guard mainly applies to English fragments. CASE-2's
    // "Filler" with capital F is the canonical; if admin types "filler" lowercase,
    // they typed a new variant → checkbox shows (legitimate inline-learn opportunity).
    render(
      <RecallSlotCard
        slotType="revisit"
        value={baseValue({ reason: 'ทดลองติดตาม filler 6 เดือน' })}
        onChange={() => {}}
        todayISO="2026-05-14"
        recallCases={CASES}
      />
    );
    expect(screen.getByTestId('recall-slot-revisit-save-master')).toBeInTheDocument();
  });

  it('IL1.6 — empty recallCases array → checkbox shows for any non-empty reason', () => {
    render(
      <RecallSlotCard
        slotType="aftercare"
        value={baseValue({ reason: 'อะไรก็ได้' })}
        onChange={() => {}}
        todayISO="2026-05-14"
        recallCases={[]}
      />
    );
    expect(screen.getByTestId('recall-slot-aftercare-save-master')).toBeInTheDocument();
  });

  it('IL1.7 — slot disabled → no checkbox even when reason matches/mismatches', () => {
    render(
      <RecallSlotCard
        slotType="revisit"
        value={baseValue({ enabled: false, reason: 'เคสใหม่' })}
        onChange={() => {}}
        todayISO="2026-05-14"
        recallCases={CASES}
      />
    );
    expect(screen.queryByTestId('recall-slot-revisit-save-master')).toBeNull();
  });

  it('IL1.8 — empty reason → no checkbox (independent of cases array)', () => {
    render(
      <RecallSlotCard
        slotType="revisit"
        value={baseValue({ reason: '' })}
        onChange={() => {}}
        todayISO="2026-05-14"
        recallCases={CASES}
      />
    );
    expect(screen.queryByTestId('recall-slot-revisit-save-master')).toBeNull();
  });

  it('IL1.9 — undefined/non-array recallCases handled gracefully (no crash)', () => {
    // Defensive: recallCases prop could be undefined during initial mount or
    // bad data. Should NOT throw + should fall back to "show checkbox" (no
    // case-list means we can't dedup, so admin's intent wins).
    expect(() => render(
      <RecallSlotCard
        slotType="revisit"
        value={baseValue({ reason: 'อะไรก็ได้' })}
        onChange={() => {}}
        todayISO="2026-05-14"
        recallCases={undefined}
      />
    )).not.toThrow();
  });
});
