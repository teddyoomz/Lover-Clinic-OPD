// Task C1 — Rule I full-flow simulate for the recall fixes (Part B).
//   enrich name (kiosk-shape) → render row + modal header → date chip → nuke.
import { describe, it, expect } from 'vitest';
import { overlayRecallNames } from '../src/lib/recallCustomerName.js';
import { isJunkRecallId } from '../scripts/nuke-test-recall-cases.mjs';

// Mirror of RecallRow.recallDateChip (items 6/7) — kept in lockstep with the
// component (source-grep test locks the component shape separately).
function recallDateChip(recall) {
  const until = recall.snoozedUntil;
  if (!until) return null;
  const m = String(until).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const text = `${m[3]}/${m[2]}/${Number(m[1]) + 543}`;
  if (recall.status === 'no-answer') return { icon: '📞', label: 'โทรอีกครั้ง', text };
  if (recall.outcome === 'reschedule') return { icon: '📅', label: 'เลื่อนนัด', text };
  if (recall.status === 'pending') return { icon: '📅', label: 'เลื่อนถึง', text };
  return null;
}

describe('C1 recall name enrich → render (Rule I)', () => {
  const kioskCustomer = { patientData: { prefix: 'นางสาว', firstNameTh: 'แพรพร', lastNameTh: 'พรแพร' }, firstname: '', lastname: '' };

  it('the "—" recall row resolves to the real name once the customer loads', () => {
    // BEFORE: recall snapshot empty (the bug)
    const raw = [{ id: 'R1', customerId: 'LC-1', customerName: '', customerPhone: '0970794444', status: 'no-answer' }];
    const before = overlayRecallNames(raw, {});       // customer not loaded yet
    expect(before[0].customerName).toBe('');           // stays empty (no fetch)
    const after = overlayRecallNames(raw, { 'LC-1': kioskCustomer }); // loaded
    expect(after[0].customerName).toBe('นางสาว แพรพร พรแพร'); // resolved
  });

  it('the enriched recall flows to a modal header (same object → header shows name)', () => {
    const raw = [{ id: 'R1', customerId: 'LC-1', customerName: '' }];
    const enriched = overlayRecallNames(raw, { 'LC-1': kioskCustomer });
    // a modal opened via findRecall gets the enriched recall → header reads customerName
    const modalHeader = `📞 บันทึกผลการ Recall · ${enriched[0].customerName || '—'}`;
    expect(modalHeader).toBe('📞 บันทึกผลการ Recall · นางสาว แพรพร พรแพร');
  });
});

describe('C1 recall date chip (items 6/7)', () => {
  it('no-answer + snoozed → 📞 โทรอีกครั้ง dd/mm/yyyy พ.ศ.', () => {
    expect(recallDateChip({ status: 'no-answer', snoozedUntil: '2026-06-18' }))
      .toEqual({ icon: '📞', label: 'โทรอีกครั้ง', text: '18/06/2569' });
  });
  it('reschedule + snoozed → 📅 เลื่อนนัด dd/mm/yyyy พ.ศ.', () => {
    expect(recallDateChip({ status: 'pending', outcome: 'reschedule', snoozedUntil: '2026-06-25' }))
      .toEqual({ icon: '📅', label: 'เลื่อนนัด', text: '25/06/2569' });
  });
  it('plain pending + snoozed → 📅 เลื่อนถึง', () => {
    expect(recallDateChip({ status: 'pending', snoozedUntil: '2026-07-01' }))
      .toEqual({ icon: '📅', label: 'เลื่อนถึง', text: '01/07/2569' });
  });
  it('no snoozedUntil → no chip', () => {
    expect(recallDateChip({ status: 'pending' })).toBeNull();
    expect(recallDateChip({ status: 'done', snoozedUntil: '2026-06-18' })).toBeNull(); // done isn't pending/no-answer
  });
});

describe('C1 nuke TEST junk classifier', () => {
  it('be_recall_cases: junk is identified by caseName (real doc-id is CASE-{ts}-{hex})', () => {
    // The user-reported junk: doc-id CASE-…, caseName "TEST-CASE-PHASE2922-…"
    expect(isJunkRecallId('be_recall_cases', 'CASE-1778751254993-0397', { caseName: 'TEST-CASE-PHASE2922-RB1-PRP-7d' })).toBe(true);
    expect(isJunkRecallId('be_recall_cases', 'CASE-1778751270649-9068', { caseName: 'TEST-CASE-PHASE2922-RB3-Acne-21d' })).toBe(true);
    // real presets — NOT junk
    expect(isJunkRecallId('be_recall_cases', 'CASE-1778759961894-5252', { caseName: 'โทรติดตามอาการ 1 วัน' })).toBe(false);
    expect(isJunkRecallId('be_recall_cases', 'CASE-1781430859094-e395', { caseName: 'ติดตามอาการหลังทานยา 1 เดือน' })).toBe(false);
    // defensive: a TEST-/E2E- doc-id is also junk
    expect(isJunkRecallId('be_recall_cases', 'E2E-CASE-x', {})).toBe(true);
  });
  it('be_recalls: TEST-* / E2E- doc-id junk; RECALL-* is NOT', () => {
    expect(isJunkRecallId('be_recalls', 'TEST-R-1')).toBe(true);
    expect(isJunkRecallId('be_recalls', 'E2E-R-1')).toBe(true);
    expect(isJunkRecallId('be_recalls', 'RECALL-1781-abcd')).toBe(false);
  });
});
