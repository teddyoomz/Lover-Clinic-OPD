// tests/v58-doctor-picker-string-id.test.js
// V58 / AV31 (2026-05-08) — Doctor picker string-ID coercion bug.
//
// User report (verbatim, frustrated): "modal สร้างลิ้งค์ตารางเลือกหมอ
// แยกคนไม่ได้ แล้วไม่แน่ใจว่าจะแสดงตารางหมอ ห้องที่เข้าตรวจ สัมพันธ์กับ
// ลิ้งที่ส่งให้ลูกค้าไหม"
// + clarification: "มันเลือกไม่ได้โว้ย กุกดชื่อเหมือนใน dropdown แล้วมัน
// เด้งกลับมาเป็นแพทย์ทุกคน ตลอ"
//
// Root cause: AdminDashboard.jsx:4251 — `<select onChange={e =>
// setSchedSelectedDoctor(e.target.value ? Number(e.target.value) : null)}>`.
// Modern be_doctors IDs are STRINGS ("DOC-mov2p9c0-a79c20370455d9f9");
// `Number("DOC-...")` returns NaN. `<select value={NaN || ''}>` → NaN
// is falsy → value reverts to "" → "-- แพทย์ทุกคน --" displayed.
// Click → state set to NaN → snap back to default.
//
// Class: Legacy ProClinic-era numeric-ID assumption. ProClinic used
// numeric staff IDs ("1234"); be_doctors switched to string IDs (DOC-...
// / ASST-... from generateMarketingId) but the click handler was never
// updated. Bug pre-dated V55 by months.
//
// Fix: drop Number() coercion. setSchedSelectedDoctor(e.target.value || null).
// Single-site bug: the room picker on the immediately-following line (4265)
// already uses bare e.target.value — confirms the doctor picker was the
// stale outlier.
//
// AV31 invariant: ID-picker <select onChange> handlers MUST NOT wrap
// e.target.value in Number() when the option values are string IDs
// (DOC-/ASST-/STAFF-/EXR-/etc prefix). Source-grep regression locks the
// fix at AdminDashboard.jsx:4251 + scans for similar drift across the
// codebase.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const adminDashSrc = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

describe('V58.D1 — schedSelectedDoctor onChange uses bare e.target.value (no Number coercion)', () => {
  it('D1.1 setSchedSelectedDoctor receives e.target.value || null (string ID-safe)', () => {
    // Post-fix pattern: setSchedSelectedDoctor(e.target.value || null)
    expect(adminDashSrc).toMatch(
      /setSchedSelectedDoctor\(\s*e\.target\.value\s*\|\|\s*null\s*\)/,
    );
  });

  it('D1.2 NO Number(e.target.value) anywhere in the schedSelectedDoctor onChange (anti-regression)', () => {
    // Pre-V58 pattern that BROKE: setSchedSelectedDoctor(e.target.value ? Number(e.target.value) : null)
    // The Number() coercion turned string IDs (DOC-...) into NaN.
    expect(adminDashSrc).not.toMatch(
      /setSchedSelectedDoctor\([^)]*Number\(e\.target\.value\)/,
    );
  });

  it('D1.3 schedSelectedRoom picker still uses bare e.target.value (consistent pattern lock)', () => {
    // Reference pattern — never had the Number() bug. Used here as the
    // canonical safe template for ID pickers.
    expect(adminDashSrc).toMatch(
      /setSchedSelectedRoom\(\s*e\.target\.value\s*\|\|\s*null\s*\)/,
    );
  });

  it('D1.4 V58 / AV31 marker comment present at the fix site', () => {
    expect(adminDashSrc).toMatch(/V58\s*\/\s*AV31/);
  });
});

describe('V58.D2 — defensive reset useEffect compares via String coercion (works for both string + number IDs)', () => {
  it('D2.1 schedSelectedDoctor defensive reset uses String() comparison', () => {
    // The reset useEffect already used `String(p.id) === String(schedSelectedDoctor)`
    // — works for both NaN (which would never match) and string IDs (which match
    // exactly). With V58 fix, the comparison is string === string and finds the
    // doctor correctly.
    expect(adminDashSrc).toMatch(
      /livePractitioners\.some\([^)]*String\(p\.id\)\s*===\s*String\(schedSelectedDoctor\)/,
    );
  });

  it('D2.2 schedSelectedRoom defensive reset uses same String() pattern', () => {
    expect(adminDashSrc).toMatch(
      /branchExamRooms\.some\([^)]*String\(r\.id\)\s*===\s*String\(schedSelectedRoom\)/,
    );
  });
});

describe('V58.D3 — class-of-bug expansion: NO other ID-picker has Number() coercion', () => {
  it('D3.1 grep all <select onChange> in AdminDashboard for Number() on string-ID values', () => {
    // Find all `<select ... onChange={... Number(e.target.value) ...` and verify
    // each is for a numeric value (slot duration, advance months, etc.) — NOT
    // for an entity ID. This is a class-of-bug audit: V58 fixes one site;
    // future drift would re-introduce the pattern. The 2 legitimate Number
    // callsites near the schedule modal (schedAdvanceMonths + schedSlotDuration)
    // are slot duration + month-count picks, both numeric.
    const lines = adminDashSrc.split('\n');
    const violations = [];
    lines.forEach((line, idx) => {
      if (!/Number\(e\.target\.value\)/.test(line)) return;
      // Skip lines that are clearly numeric pickers
      const isNumericContext = /(setSchedAdvanceMonths|setSchedSlotDuration|setApptSlotDuration|setSchedEndDay|patientSyncCooldownMins|depositPercent|pointsPerBaht|qty|price|discount|amount)/.test(line);
      if (isNumericContext) return;
      // Skip comments
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      violations.push(`L${idx + 1}: ${line.trim()}`);
    });
    expect(
      violations,
      `AV31 violation — Number() on potentially-string ID picker:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});

describe('V58.D4 — runtime simulation: NaN snap-back is gone post-fix', () => {
  // Pure simulator of the pre/post-fix click-handler behavior.

  function preFixHandler(eTargetValue) {
    // The buggy V55-era code
    return eTargetValue ? Number(eTargetValue) : null;
  }

  function postFixHandler(eTargetValue) {
    // The V58 fix
    return eTargetValue || null;
  }

  it('D4.1 preFix handler returns NaN for string ID (REPRO of bug)', () => {
    const id = 'DOC-mov2p9c0-a79c20370455d9f9';
    const result = preFixHandler(id);
    expect(Number.isNaN(result)).toBe(true);
  });

  it('D4.2 postFix handler returns string ID unchanged', () => {
    const id = 'DOC-mov2p9c0-a79c20370455d9f9';
    expect(postFixHandler(id)).toBe(id);
  });

  it('D4.3 postFix handler returns null for empty string (default option)', () => {
    expect(postFixHandler('')).toBe(null);
  });

  it('D4.4 NaN is falsy → <select value={NaN || ""}> reverts to default option', () => {
    // This is why the snap-back happens — React reads the value prop and
    // defaults to "" when NaN.
    const naN = NaN;
    expect(naN || '').toBe('');
    // Compare to post-fix:
    const stringId = 'DOC-mov2p9c0-a79c20370455d9f9';
    expect(stringId || '').toBe(stringId);
  });
});
