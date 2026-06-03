// tests/v73-bs1-status-badge-state-machine.test.js
// V73-BS1 (2026-05-18) — RowCard status badge state machine.
//
// User spec:
//   pending             → "รอยืนยัน"
//   confirmed (not done) → "ยืนยันแล้ว · รอการรักษา"  (NEW expanded label)
//   done                 → "เสร็จแล้ว"  (driven by serviceCompletedAt, NOT hasTreatmentForDay)
//   cancelled            → "ยกเลิก"
//
// Pre-fix bug: `effectiveStatus = hasTreatmentForDay ? 'done' : rawStatus`
// conflated "treatment recorded" with "service complete". After admin
// clicked "↩ กลับไปคิวรอ" (un-mark service complete), serviceCompletedAt
// cleared but hasTreatmentForDay stayed true → badge stuck on "เสร็จแล้ว"
// even though customer is back in waiting queue.
//
// Fix: effectiveStatus driven by serviceCompletedAt. Un-mark reverts badge.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const rowCard = fs.readFileSync(path.join(ROOT, 'src/components/admin/AppointmentHubRowCard.jsx'), 'utf8');

describe('V73-BS1 — STATUS_LABELS expanded confirmed label', () => {
  it('BS1.1 confirmed: "ยืนยันแล้ว · รอการรักษา" (NEW expanded)', () => {
    expect(rowCard).toMatch(/confirmed:\s*['"]ยืนยันแล้ว · รอการรักษา['"]/);
  });

  it('BS1.2 pending: "รอยืนยัน" (preserved)', () => {
    expect(rowCard).toMatch(/pending:\s*['"]รอยืนยัน['"]/);
  });

  it('BS1.3 done: "เสร็จแล้ว" (preserved)', () => {
    expect(rowCard).toMatch(/done:\s*['"]เสร็จแล้ว['"]/);
  });

  it('BS1.4 pre-fix bare "ยืนยันแล้ว" no longer the confirmed value', () => {
    // Anti-regression — confirmed must NOT revert to bare "ยืนยันแล้ว"
    expect(rowCard).not.toMatch(/confirmed:\s*['"]ยืนยันแล้ว['"]\s*,/);
  });
});

describe('V73-BS1 — effectiveStatus driven by serviceCompletedAt', () => {
  it('BS1.5 effectiveStatus = serviceCompletedAt ? "done" : rawStatus, but CANCELLED wins (R8)', () => {
    // R8 — a 'cancelled' rawStatus takes precedence over a stale serviceCompletedAt
    // (the deposit-cancel path bypasses the V139 sync, leaving serviceCompletedAt set).
    expect(rowCard).toMatch(/const effectiveStatus = rawStatus === 'cancelled' \? 'cancelled' : \(appt\.serviceCompletedAt \? 'done' : rawStatus\);/);
  });

  it('BS1.6 pre-fix shape REMOVED — no longer `hasTreatmentForDay ? "done"`', () => {
    expect(rowCard).not.toMatch(/effectiveStatus = hasTreatmentForDay \? ['"]done['"]/);
  });

  it('BS1.7 V73-BS1 comment marker present (institutional memory)', () => {
    expect(rowCard).toMatch(/V73-BS1/);
  });
});

describe('V73-BS1 — state-machine simulator (truth table)', () => {
  // Mirror RowCard's badge resolution
  const STATUS_LABELS = {
    pending: 'รอยืนยัน',
    confirmed: 'ยืนยันแล้ว · รอการรักษา',
    done: 'เสร็จแล้ว',
    cancelled: 'ยกเลิก',
  };
  function resolveBadge({ rawStatus, serviceCompletedAt }) {
    const effectiveStatus = serviceCompletedAt ? 'done' : rawStatus;
    return STATUS_LABELS[effectiveStatus] || effectiveStatus;
  }

  it('BS1.8 pending + not completed → "รอยืนยัน"', () => {
    expect(resolveBadge({ rawStatus: 'pending', serviceCompletedAt: null })).toBe('รอยืนยัน');
  });

  it('BS1.9 confirmed + not completed → "ยืนยันแล้ว · รอการรักษา"', () => {
    expect(resolveBadge({ rawStatus: 'confirmed', serviceCompletedAt: null })).toBe('ยืนยันแล้ว · รอการรักษา');
  });

  it('BS1.10 confirmed + service completed → "เสร็จแล้ว" (overrides confirmed)', () => {
    expect(resolveBadge({ rawStatus: 'confirmed', serviceCompletedAt: 'TS-2026-05-18' })).toBe('เสร็จแล้ว');
  });

  it('BS1.11 confirmed → completed → UN-MARKED → reverts to "ยืนยันแล้ว · รอการรักษา"', () => {
    // The exact scenario user reported as broken pre-fix
    let appt = { rawStatus: 'confirmed', serviceCompletedAt: null };
    expect(resolveBadge(appt)).toBe('ยืนยันแล้ว · รอการรักษา');
    appt = { ...appt, serviceCompletedAt: 'TS-1' };
    expect(resolveBadge(appt)).toBe('เสร็จแล้ว');
    appt = { ...appt, serviceCompletedAt: null };
    expect(resolveBadge(appt)).toBe('ยืนยันแล้ว · รอการรักษา');  // FIX — was stuck on "เสร็จแล้ว" pre-fix
  });

  it('BS1.12 cancelled stays cancelled (terminal)', () => {
    expect(resolveBadge({ rawStatus: 'cancelled', serviceCompletedAt: null })).toBe('ยกเลิก');
  });

  it('BS1.13 done rawStatus + serviceCompletedAt truthy → "เสร็จแล้ว"', () => {
    expect(resolveBadge({ rawStatus: 'done', serviceCompletedAt: 'TS-1' })).toBe('เสร็จแล้ว');
  });
});
