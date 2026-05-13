// tests/phase-28-treatment-history-resolvers.test.js
//
// Phase 28 (2026-05-14) — TDD red-phase coverage for 6 new pure helpers
// added to src/lib/treatmentDisplayResolvers.js (Phase 28 Task 1).
//
// Helpers under test:
//   - getTreatmentLifecycle(t)
//   - getTreatmentStatusLabel(t, isLatest)
//   - getStepLabels(lifecycle)
//   - computeRelativeThaiDateLabel(dateISO, todayISO)
//   - groupTreatmentsByDate(rows)
//   - computeRowAction(lifecycle)
//
// Discipline: Rule N targeted-only run during iteration. Final batch will
// run full suite separately (later task in this plan).

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
  it('R1.5 returns empty array on null/undefined/empty input', () => {
    expect(getTreatmentLifecycle(null)).toEqual([]);
    expect(getTreatmentLifecycle(undefined)).toEqual([]);
    expect(getTreatmentLifecycle({})).toEqual([]);
  });
});

describe('Phase 28 · getTreatmentStatusLabel', () => {
  it('R2.1 returns "ยังไม่บันทึก" for empty lifecycle', () => {
    expect(getTreatmentStatusLabel({})).toBe('ยังไม่บันทึก');
    expect(getTreatmentStatusLabel(null)).toBe('ยังไม่บันทึก');
  });
  it('R2.2 returns "รอแพทย์บันทึก" for vitals-only when isLatest=true', () => {
    const t = { vitalsignsRecordedAt: '2026-05-14T04:00:00Z' };
    expect(getTreatmentStatusLabel(t, true)).toBe('รอแพทย์บันทึก');
  });
  it('R2.3 returns "ซักประวัติเท่านั้น" for vitals-only when isLatest=false', () => {
    const t = { vitalsignsRecordedAt: '2026-05-14T04:00:00Z' };
    expect(getTreatmentStatusLabel(t, false)).toBe('ซักประวัติเท่านั้น');
  });
  it('R2.4 returns "เสร็จสิ้น · ตรงเข้าบันทึก" for completed-only', () => {
    const t = { completedAt: '2026-05-14T04:23:00Z' };
    expect(getTreatmentStatusLabel(t)).toBe('เสร็จสิ้น · ตรงเข้าบันทึก');
  });
  it('R2.5 returns "เสร็จสิ้น · ข้ามแพทย์" for vitals + completed (no doctor)', () => {
    const t = {
      vitalsignsRecordedAt: '2026-05-14T04:00:00Z',
      completedAt: '2026-05-14T04:23:00Z',
    };
    expect(getTreatmentStatusLabel(t)).toBe('เสร็จสิ้น · ข้ามแพทย์');
  });
  it('R2.6 returns "ครบขั้นแพทย์ · รอบันทึก" for vitals + doctor (no completed)', () => {
    const t = {
      vitalsignsRecordedAt: '2026-05-14T04:00:00Z',
      doctorRecordedAt: '2026-05-14T04:10:00Z',
    };
    expect(getTreatmentStatusLabel(t)).toBe('ครบขั้นแพทย์ · รอบันทึก');
  });
  it('R2.7 returns "เสร็จสิ้น · ครบ 3 ขั้น" for all 3 stages', () => {
    const t = {
      vitalsignsRecordedAt: '2026-05-14T04:00:00Z',
      doctorRecordedAt: '2026-05-14T04:10:00Z',
      completedAt: '2026-05-14T04:23:00Z',
    };
    expect(getTreatmentStatusLabel(t)).toBe('เสร็จสิ้น · ครบ 3 ขั้น');
  });
  it('R2.8 returns "แพทย์บันทึกแล้ว · รอเสร็จ" for doctor-only', () => {
    const t = { doctorRecordedAt: '2026-05-14T04:10:00Z' };
    expect(getTreatmentStatusLabel(t)).toBe('แพทย์บันทึกแล้ว · รอเสร็จ');
  });
  it('R2.9 returns "เสร็จสิ้น · ข้ามซักประวัติ" for doctor + completed (no vitals)', () => {
    const t = {
      doctorRecordedAt: '2026-05-14T04:10:00Z',
      completedAt: '2026-05-14T04:23:00Z',
    };
    expect(getTreatmentStatusLabel(t)).toBe('เสร็จสิ้น · ข้ามซักประวัติ');
  });
});

describe('Phase 28 · getStepLabels', () => {
  it('R3.1 returns vitals + รอแพทย์ + เสร็จ when only vitals done', () => {
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:00:00Z' }];
    expect(getStepLabels(lc)).toEqual({ t: 'ซักประวัติ', a: 'รอแพทย์', e: 'เสร็จ' });
  });
  it('R3.2 returns full labels when all 3 done', () => {
    const lc = [
      { key: 'vitalsigns', time: 't1' },
      { key: 'doctor', time: 't2' },
      { key: 'completed', time: 't3' },
    ];
    expect(getStepLabels(lc)).toEqual({ t: 'ซักประวัติ', a: 'แพทย์', e: 'เสร็จ' });
  });
  it('R3.3 returns "ข้ามแพทย์" when vitals + completed (no doctor)', () => {
    const lc = [
      { key: 'vitalsigns', time: 't1' },
      { key: 'completed', time: 't3' },
    ];
    expect(getStepLabels(lc)).toEqual({ t: 'ซักประวัติ', a: 'ข้ามแพทย์', e: 'เสร็จ' });
  });
  it('R3.4 returns "ข้าม" for vitals + "แพทย์" for doctor when only doctor done', () => {
    const lc = [{ key: 'doctor', time: 't2' }];
    expect(getStepLabels(lc)).toEqual({ t: 'ข้าม', a: 'แพทย์', e: 'เสร็จ' });
  });
  it('R3.5 returns all default placeholders for empty lifecycle', () => {
    expect(getStepLabels([])).toEqual({ t: 'ซักประวัติ', a: 'ข้าม', e: 'เสร็จ' });
  });
  it('R3.6 returns "ข้าม" for vitals when only completed (direct save)', () => {
    const lc = [{ key: 'completed', time: 't3' }];
    expect(getStepLabels(lc)).toEqual({ t: 'ข้าม', a: 'ข้าม', e: 'เสร็จ' });
  });
  it('R3.7 handles null/undefined input gracefully', () => {
    expect(getStepLabels(null)).toEqual({ t: 'ซักประวัติ', a: 'ข้าม', e: 'เสร็จ' });
    expect(getStepLabels(undefined)).toEqual({ t: 'ซักประวัติ', a: 'ข้าม', e: 'เสร็จ' });
  });
});

describe('Phase 28 · computeRelativeThaiDateLabel', () => {
  it('R4.1 returns "วันนี้" for today', () => {
    expect(computeRelativeThaiDateLabel('2026-05-14', '2026-05-14')).toBe('วันนี้');
  });
  it('R4.2 returns "เมื่อวาน" for 1 day ago', () => {
    expect(computeRelativeThaiDateLabel('2026-05-13', '2026-05-14')).toBe('เมื่อวาน');
  });
  it('R4.3 returns "N วันที่แล้ว" for 2-6 days ago', () => {
    expect(computeRelativeThaiDateLabel('2026-05-08', '2026-05-14')).toBe('6 วันที่แล้ว');
    expect(computeRelativeThaiDateLabel('2026-05-12', '2026-05-14')).toBe('2 วันที่แล้ว');
  });
  it('R4.4 returns "N สัปดาห์ที่แล้ว" for 7-29 days', () => {
    expect(computeRelativeThaiDateLabel('2026-05-07', '2026-05-14')).toBe('1 สัปดาห์ที่แล้ว');
    expect(computeRelativeThaiDateLabel('2026-04-30', '2026-05-14')).toBe('2 สัปดาห์ที่แล้ว');
  });
  it('R4.5 returns "N เดือนที่แล้ว" for 30-364 days', () => {
    expect(computeRelativeThaiDateLabel('2026-04-14', '2026-05-14')).toBe('1 เดือนที่แล้ว');
    expect(computeRelativeThaiDateLabel('2025-11-14', '2026-05-14')).toBe('6 เดือนที่แล้ว');
  });
  it('R4.6 returns "N ปีที่แล้ว" for 365+ days', () => {
    expect(computeRelativeThaiDateLabel('2025-05-14', '2026-05-14')).toBe('1 ปีที่แล้ว');
    expect(computeRelativeThaiDateLabel('2024-05-14', '2026-05-14')).toBe('2 ปีที่แล้ว');
  });
  it('R4.7 returns empty string for invalid input', () => {
    expect(computeRelativeThaiDateLabel('', '2026-05-14')).toBe('');
    expect(computeRelativeThaiDateLabel(null, '2026-05-14')).toBe('');
    expect(computeRelativeThaiDateLabel('2026-05-14', null)).toBe('');
    expect(computeRelativeThaiDateLabel('not-a-date', '2026-05-14')).toBe('');
  });
  it('R4.8 returns empty string for future dates', () => {
    expect(computeRelativeThaiDateLabel('2026-05-15', '2026-05-14')).toBe('');
  });
});

describe('Phase 28 · groupTreatmentsByDate', () => {
  it('R5.1 returns empty array for null/empty input', () => {
    expect(groupTreatmentsByDate(null)).toEqual([]);
    expect(groupTreatmentsByDate(undefined)).toEqual([]);
    expect(groupTreatmentsByDate([])).toEqual([]);
  });
  it('R5.2 produces interleaved header + row entries', () => {
    const rows = [
      { id: 'r1', date: '2026-05-14' },
      { id: 'r2', date: '2026-05-14' },
      { id: 'r3', date: '2026-05-07' },
    ];
    const grouped = groupTreatmentsByDate(rows);
    expect(grouped).toHaveLength(5);
    expect(grouped[0]).toMatchObject({ type: 'header', date: '2026-05-14', count: 2 });
    expect(grouped[1]).toMatchObject({ type: 'row', t: rows[0] });
    expect(grouped[2]).toMatchObject({ type: 'row', t: rows[1] });
    expect(grouped[3]).toMatchObject({ type: 'header', date: '2026-05-07', count: 1 });
    expect(grouped[4]).toMatchObject({ type: 'row', t: rows[2] });
  });
  it('R5.3 preserves caller order (does not re-sort)', () => {
    // Caller pre-sorts; helper just groups consecutive same-date rows
    const rows = [
      { id: 'a', date: '2026-05-14' },
      { id: 'b', date: '2026-05-13' },
      { id: 'c', date: '2026-05-14' }, // breaks back to 05-14 — new group
    ];
    const grouped = groupTreatmentsByDate(rows);
    expect(grouped).toHaveLength(6);
    expect(grouped[0]).toMatchObject({ type: 'header', date: '2026-05-14', count: 1 });
    expect(grouped[2]).toMatchObject({ type: 'header', date: '2026-05-13', count: 1 });
    expect(grouped[4]).toMatchObject({ type: 'header', date: '2026-05-14', count: 1 });
  });
  it('R5.4 handles single row', () => {
    const rows = [{ id: 'only', date: '2026-05-14' }];
    const grouped = groupTreatmentsByDate(rows);
    expect(grouped).toEqual([
      { type: 'header', date: '2026-05-14', count: 1 },
      { type: 'row', t: rows[0] },
    ]);
  });
  it('R5.5 tolerates row missing date field', () => {
    const rows = [{ id: 'no-date' }, { id: 'with-date', date: '2026-05-14' }];
    const grouped = groupTreatmentsByDate(rows);
    // Missing date treated as its own bucket (key '')
    expect(grouped[0]).toMatchObject({ type: 'header' });
    expect(grouped[1]).toMatchObject({ type: 'row', t: rows[0] });
    expect(grouped[2]).toMatchObject({ type: 'header', date: '2026-05-14', count: 1 });
    expect(grouped[3]).toMatchObject({ type: 'row', t: rows[1] });
  });
});

describe('Phase 28 · computeRowAction', () => {
  it('R6.1 returns kind:unknown + empty label for empty lifecycle', () => {
    const action = computeRowAction([]);
    expect(action).toEqual({ kind: 'unknown', label: '' });
  });
  it('R6.2 returns kind:unknown for null/undefined input', () => {
    expect(computeRowAction(null)).toEqual({ kind: 'unknown', label: '' });
    expect(computeRowAction(undefined)).toEqual({ kind: 'unknown', label: '' });
  });
  it('R6.3 returns kind:in-progress + ⌛ label for vitals-only', () => {
    const lc = [{ key: 'vitalsigns', time: '2026-05-14T04:00:00Z' }];
    const action = computeRowAction(lc);
    expect(action.kind).toBe('in-progress');
    expect(action.label).toBe('⌛ in progress');
  });
  it('R6.4 returns kind:in-progress for vitals + doctor (no completed)', () => {
    const lc = [
      { key: 'vitalsigns', time: '2026-05-14T04:00:00Z' },
      { key: 'doctor', time: '2026-05-14T04:10:00Z' },
    ];
    expect(computeRowAction(lc).kind).toBe('in-progress');
  });
  it('R6.5 returns kind:completed + ✓ label with HH:MM time when completedAt present', () => {
    const lc = [
      { key: 'vitalsigns', time: '2026-05-14T04:00:00Z' },
      { key: 'doctor', time: '2026-05-14T04:10:00Z' },
      { key: 'completed', time: '2026-05-14T04:23:00Z' },
    ];
    const action = computeRowAction(lc);
    expect(action.kind).toBe('completed');
    // Bangkok TZ (UTC+7) → 04:23 UTC = 11:23 Bangkok
    expect(action.label).toBe('✓ บันทึก 11:23');
  });
  it('R6.6 returns kind:completed + "✓ บันทึกแล้ว" fallback when completed.time missing', () => {
    const lc = [{ key: 'completed', time: null }];
    const action = computeRowAction(lc);
    expect(action.kind).toBe('completed');
    expect(action.label).toBe('✓ บันทึกแล้ว');
  });
});
