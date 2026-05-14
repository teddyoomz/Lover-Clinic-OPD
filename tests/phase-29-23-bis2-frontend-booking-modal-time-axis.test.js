/**
 * Phase 29.23-bis2 (2026-05-14) — source-grep regression locks for the
 * Frontend booking-modal time-axis per-branch open-hours filter.
 *
 * User report (verbatim): "Modal สร้างนัดหมายของทั้งหน้าจองมัดจำและจองไม่มัดจำ
 * ยังไม่ดึงเวลาเปิด-ปิด ของสาขานั้นๆ ยังขึ้นตั้งแต่ 8.15 อยู่เลย".
 *
 * Root cause: V53 BS-12 audit only scanned src/components/** and missed
 * src/pages/AdminDashboard.jsx which imported `TIME_SLOTS as CANONICAL_TIME_SLOTS`
 * (BS-12 fileMapsTimeSlots grep `TIME_SLOTS\.map` DID match CANONICAL_TIME_SLOTS.map
 * because of substring overlap, but file was outside scan scope).
 *
 * Fix:
 *   - audit-branch-scope.test.js BS-12 scope expanded to src/pages/
 *   - AdminDashboard.jsx adds getVisibleTimeSlotsForDate import + 3 useMemo's
 *     for the 3 modal time pickers
 *   - Each <select> wired to visible slots + legacy-value preservation
 *
 * This file locks the 3 modal patterns at the source-grep layer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

describe('Phase 29.23-bis2 FT — Frontend booking-modal time-axis per-branch hours', () => {
  it('FT.1 — getVisibleTimeSlotsForDate imported from scheduleFilterUtils', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*\bgetVisibleTimeSlotsForDate\b[^}]*\}\s*from\s+['"][^'"]*scheduleFilterUtils\.js['"]/
    );
  });

  it('FT.2 — 3 useMemo helpers exist (edit + create-deposit + create-no-deposit)', () => {
    expect(SRC).toMatch(/const\s+editDepositVisibleSlots\s*=\s*useMemo/);
    expect(SRC).toMatch(/const\s+depositFormVisibleSlots\s*=\s*useMemo/);
    expect(SRC).toMatch(/const\s+noDepositFormVisibleSlots\s*=\s*useMemo/);
  });

  it('FT.3 — each useMemo includes cs.openHours* deps for branch-switch recompute', () => {
    // Each memo's deps array must contain openHoursMonFri + openHoursSatSun.
    // Match each useMemo through its closing `]` deps array.
    const editMemo = SRC.match(/editDepositVisibleSlots\s*=\s*useMemo\([\s\S]+?\}\s*,\s*\[[^\]]+\]\)/);
    expect(editMemo).toBeTruthy();
    expect(editMemo[0]).toMatch(/openHoursMonFri/);
    expect(editMemo[0]).toMatch(/openHoursSatSun/);

    const depositMemo = SRC.match(/depositFormVisibleSlots\s*=\s*useMemo\([\s\S]+?\}\s*,\s*\[[^\]]+\]\)/);
    expect(depositMemo).toBeTruthy();
    expect(depositMemo[0]).toMatch(/openHoursMonFri/);
    expect(depositMemo[0]).toMatch(/openHoursSatSun/);

    const noDepositMemo = SRC.match(/noDepositFormVisibleSlots\s*=\s*useMemo\([\s\S]+?\}\s*,\s*\[[^\]]+\]\)/);
    expect(noDepositMemo).toBeTruthy();
    expect(noDepositMemo[0]).toMatch(/openHoursMonFri/);
    expect(noDepositMemo[0]).toMatch(/openHoursSatSun/);
  });

  it('FT.4 — each useMemo includes its modal\'s appointmentDate in deps', () => {
    const editMemo = SRC.match(/editDepositVisibleSlots\s*=\s*useMemo\([\s\S]+?\}\s*,\s*\[[^\]]+\]\)/);
    expect(editMemo[0]).toMatch(/editingDepositData\??\.appointmentDate/);

    const depositMemo = SRC.match(/depositFormVisibleSlots\s*=\s*useMemo\([\s\S]+?\}\s*,\s*\[[^\]]+\]\)/);
    expect(depositMemo[0]).toMatch(/depositFormData\??\.appointmentDate/);

    const noDepositMemo = SRC.match(/noDepositFormVisibleSlots\s*=\s*useMemo\([\s\S]+?\}\s*,\s*\[[^\]]+\]\)/);
    expect(noDepositMemo[0]).toMatch(/noDepositFormData\??\.appointmentDate/);
  });

  it('FT.5 — 3 modals consume visibleSlots arrays (NOT depositOptions.appointment*Times)', () => {
    // visibleSlots.map(t => <option key={t} value={t}>{t}</option>) — appears 6 times
    // (3 modals × 2 selects each)
    const editSelectsCount = (SRC.match(/editDepositVisibleSlots\.map\(t/g) || []).length;
    expect(editSelectsCount).toBeGreaterThanOrEqual(2);

    const depositSelectsCount = (SRC.match(/depositFormVisibleSlots\.map\(t/g) || []).length;
    expect(depositSelectsCount).toBeGreaterThanOrEqual(2);

    const noDepositSelectsCount = (SRC.match(/noDepositFormVisibleSlots\.map\(t/g) || []).length;
    expect(noDepositSelectsCount).toBeGreaterThanOrEqual(2);
  });

  it('FT.6 — legacy-value preservation (out-of-hours values kept readable in edit mode)', () => {
    // Each <select> has a guard: if existing value is NOT in visibleSlots,
    // render it as an extra <option ...>(นอกเวลา)</option> first.
    // This matters for edit modal where an existing appt might be at a time
    // that became invisible after branch hours were narrowed.
    const noTimePattern = /\(นอกเวลา\)<\/option>/g;
    const matches = SRC.match(noTimePattern) || [];
    // 6 selects × 1 legacy guard each = 6 occurrences expected
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });

  it('FT.7 — Phase 29.23-bis2 marker comment present (institutional memory)', () => {
    expect(SRC).toMatch(/29\.23-bis2.*V53 BS-12/);
  });

  it('FT.8 — anti-regression: depositOptions.appointment*Times maps NO longer in <select>', () => {
    // Pre-fix used `(depositOptions?.appointmentStartTimes || []).map(o => <option ...>)`.
    // Post-fix should have ZERO such usages — the data still exists on
    // depositOptions for backward-compat but renders are decoupled.
    expect(SRC).not.toMatch(/depositOptions\?\.appointmentStartTimes\s*\|\|\s*\[\]\)\.map/);
    expect(SRC).not.toMatch(/depositOptions\?\.appointmentEndTimes\s*\|\|\s*\[\]\)\.map/);
  });

  it('FT.9 — useEffectiveClinicSettings is still in use (V55 BS-14 invariant preserved)', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*\buseEffectiveClinicSettings\b/);
    expect(SRC).toMatch(/const\s+cs\s*=\s*useEffectiveClinicSettings/);
  });
});
