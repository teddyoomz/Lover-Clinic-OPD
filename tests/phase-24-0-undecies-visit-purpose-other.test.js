// ─── Phase 24.0-undecies — visitPurpose "อื่นๆ" + free-text detail ──
//
// User report 2026-05-06: "ฝากเพื่อให้ column มัดจำเพื่อ แสดงละเอียดกว่านี้
// อย่างคนล่าสุดที่กดมัดจำจาก frontend ไป ใน column นี้มันขึ้นแค่ อื่นๆ
// แต่จริงๆเค้าเป็น อื่นๆ: ผ่ามุก ช่วยแสดงให้ครบด้วย"
//
// Bug: kiosk modals (deposit + no-deposit) had a chip-list visitPurpose
// without a free-text input for "อื่นๆ" detail. When admin picked "อื่นๆ"
// the saved purpose was bare "อื่นๆ" — no detail. The DepositPanel
// "มัดจำสำหรับ" column showed only "อื่นๆ".
//
// Fix:
//  - NEW src/lib/visitPurposeUtils.js with buildVisitPurposeText +
//    parseVisitPurposeText (pure helpers, exported for testing)
//  - Kiosk modals gain visitPurposeOther state + conditional text input
//    visible when 'อื่นๆ' is in the chip array
//  - 3 write sites use buildVisitPurposeText to interpolate "อื่นๆ: <X>"
//    into the joined string stored at appointment.purpose / appointmentTo
//  - Edit-mode load uses parseVisitPurposeText to restore both chips +
//    detail input
//  - DepositPanel column drops truncate / max-w-200 → wraps via
//    whitespace-normal break-words

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildVisitPurposeText,
  parseVisitPurposeText,
} from '../src/lib/visitPurposeUtils.js';

const ROOT = path.join(__dirname, '..');
const ADMIN_DASHBOARD = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');
const DEPOSIT_PANEL = fs.readFileSync(path.join(ROOT, 'src/components/backend/DepositPanel.jsx'), 'utf8');
const VISIT_UTILS = fs.readFileSync(path.join(ROOT, 'src/lib/visitPurposeUtils.js'), 'utf8');

describe('Phase 24.0-undecies — buildVisitPurposeText (helper)', () => {
  it('VPO.A.1 — empty array + empty other → empty string', () => {
    expect(buildVisitPurposeText([], '')).toBe('');
  });

  it('VPO.A.2 — null inputs → empty string', () => {
    expect(buildVisitPurposeText(null, null)).toBe('');
    expect(buildVisitPurposeText(undefined, undefined)).toBe('');
  });

  it('VPO.A.3 — single non-other chip → bare label', () => {
    expect(buildVisitPurposeText(['สมรรถภาพทางเพศ'], '')).toBe('สมรรถภาพทางเพศ');
  });

  it('VPO.A.4 — multiple non-other chips → comma-joined', () => {
    expect(buildVisitPurposeText(['สมรรถภาพทางเพศ', 'ขลิบ'], '')).toBe('สมรรถภาพทางเพศ, ขลิบ');
  });

  it('VPO.A.5 — bare "อื่นๆ" with no detail → bare label (no colon)', () => {
    expect(buildVisitPurposeText(['อื่นๆ'], '')).toBe('อื่นๆ');
  });

  it('VPO.A.6 — "อื่นๆ" with detail → interpolated as "อื่นๆ: <X>"', () => {
    expect(buildVisitPurposeText(['อื่นๆ'], 'ผ่ามุก')).toBe('อื่นๆ: ผ่ามุก');
  });

  it('VPO.A.7 — mixed chips with "อื่นๆ" + detail → preserves order + interpolation', () => {
    expect(buildVisitPurposeText(['สมรรถภาพทางเพศ', 'อื่นๆ'], 'ผ่ามุก'))
      .toBe('สมรรถภาพทางเพศ, อื่นๆ: ผ่ามุก');
  });

  it('VPO.A.8 — "อื่นๆ" first then other chip → preserves position', () => {
    expect(buildVisitPurposeText(['อื่นๆ', 'ขลิบ'], 'ผ่ามุก'))
      .toBe('อื่นๆ: ผ่ามุก, ขลิบ');
  });

  it('VPO.A.9 — whitespace-only detail is stripped → no colon emitted', () => {
    expect(buildVisitPurposeText(['อื่นๆ'], '   ')).toBe('อื่นๆ');
    expect(buildVisitPurposeText(['อื่นๆ'], '\t\n')).toBe('อื่นๆ');
  });

  it('VPO.A.10 — leading/trailing whitespace in detail trimmed', () => {
    expect(buildVisitPurposeText(['อื่นๆ'], '  ผ่ามุก  ')).toBe('อื่นๆ: ผ่ามุก');
  });

  it('VPO.A.11 — detail without "อื่นๆ" chip → detail discarded', () => {
    expect(buildVisitPurposeText(['สมรรถภาพทางเพศ'], 'ผ่ามุก')).toBe('สมรรถภาพทางเพศ');
  });

  it('VPO.A.12 — falsy entries in chip array filtered out', () => {
    expect(buildVisitPurposeText(['สมรรถภาพทางเพศ', '', null, 'อื่นๆ'], 'ผ่ามุก'))
      .toBe('สมรรถภาพทางเพศ, อื่นๆ: ผ่ามุก');
  });

  it('VPO.A.13 — non-array purposes input → empty string (defensive)', () => {
    expect(buildVisitPurposeText('not-an-array', 'detail')).toBe('');
    expect(buildVisitPurposeText({}, 'detail')).toBe('');
    expect(buildVisitPurposeText(123, 'detail')).toBe('');
  });

  it('VPO.A.14 — Thai text in detail with comma is preserved (not split)', () => {
    expect(buildVisitPurposeText(['อื่นๆ'], 'ผ่ามุก, ตรวจสุขภาพ'))
      .toBe('อื่นๆ: ผ่ามุก, ตรวจสุขภาพ');
  });

  it('VPO.A.15 — emoji + special chars in detail preserved', () => {
    expect(buildVisitPurposeText(['อื่นๆ'], '🩺 ตรวจ STD')).toBe('อื่นๆ: 🩺 ตรวจ STD');
  });
});

describe('Phase 24.0-undecies — parseVisitPurposeText (inverse)', () => {
  it('VPO.B.1 — empty array → empty purposes + fallback other', () => {
    expect(parseVisitPurposeText([], 'fallback')).toEqual({
      purposes: [],
      other: 'fallback',
    });
  });

  it('VPO.B.2 — array with bare chips → chips passed through, fallback other', () => {
    expect(parseVisitPurposeText(['สมรรถภาพทางเพศ', 'ขลิบ'], 'fb')).toEqual({
      purposes: ['สมรรถภาพทางเพศ', 'ขลิบ'],
      other: 'fb',
    });
  });

  it('VPO.B.3 — array with "อื่นๆ" + sibling other field → preserved', () => {
    expect(parseVisitPurposeText(['อื่นๆ'], 'ผ่ามุก')).toEqual({
      purposes: ['อื่นๆ'],
      other: 'ผ่ามุก',
    });
  });

  it('VPO.B.4 — array with mixed legacy "อื่นๆ: X" entry → normalized', () => {
    // Legacy migration could produce array like ['สมรรถภาพ', 'อื่นๆ: ผ่ามุก'].
    // parseVisitPurposeText normalizes this to clean chip array + extracted detail.
    expect(parseVisitPurposeText(['สมรรถภาพทางเพศ', 'อื่นๆ: ผ่ามุก'], '')).toEqual({
      purposes: ['สมรรถภาพทางเพศ', 'อื่นๆ'],
      other: 'ผ่ามุก',
    });
  });

  it('VPO.B.5 — empty string input → empty purposes', () => {
    expect(parseVisitPurposeText('', '')).toEqual({ purposes: [], other: '' });
  });

  it('VPO.B.6 — joined string round-trip: build → parse', () => {
    const joined = buildVisitPurposeText(['สมรรถภาพทางเพศ', 'อื่นๆ'], 'ผ่ามุก');
    const parsed = parseVisitPurposeText(joined);
    expect(parsed).toEqual({
      purposes: ['สมรรถภาพทางเพศ', 'อื่นๆ'],
      other: 'ผ่ามุก',
    });
  });

  it('VPO.B.7 — joined string with bare "อื่นๆ" → no detail extracted', () => {
    expect(parseVisitPurposeText('สมรรถภาพทางเพศ, อื่นๆ', '')).toEqual({
      purposes: ['สมรรถภาพทางเพศ', 'อื่นๆ'],
      other: '',
    });
  });

  it('VPO.B.8 — fallback other respected when array shape has no detail', () => {
    expect(parseVisitPurposeText(['อื่นๆ'], 'fromSiblingField')).toEqual({
      purposes: ['อื่นๆ'],
      other: 'fromSiblingField',
    });
  });

  it('VPO.B.9 — legacy array detail wins over fallback', () => {
    // If the array entry IS "อื่นๆ: X", that detail wins over fallback.
    expect(parseVisitPurposeText(['อื่นๆ: ผ่ามุก'], 'fallback-ignored')).toEqual({
      purposes: ['อื่นๆ'],
      other: 'ผ่ามุก',
    });
  });

  it('VPO.B.10 — null/undefined → empty + fallback', () => {
    expect(parseVisitPurposeText(null, '')).toEqual({ purposes: [], other: '' });
    expect(parseVisitPurposeText(undefined, 'X')).toEqual({ purposes: [], other: 'X' });
  });

  it('VPO.B.11 — round-trip preserves single non-other chip', () => {
    const joined = buildVisitPurposeText(['สมรรถภาพทางเพศ'], '');
    expect(parseVisitPurposeText(joined)).toEqual({
      purposes: ['สมรรถภาพทางเพศ'],
      other: '',
    });
  });
});

describe('Phase 24.0-undecies — AdminDashboard wiring (source-grep)', () => {
  it('VPO.C.1 — visitPurposeUtils import landed', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s+\{\s*buildVisitPurposeText\s*,\s*parseVisitPurposeText\s*\}\s+from\s+['"]\.\.\/lib\/visitPurposeUtils\.js['"]/,
    );
  });

  it('VPO.C.2 — depositFormData includes visitPurposeOther in initial state', () => {
    // setDepositFormData initial useState:
    expect(ADMIN_DASHBOARD).toMatch(/depositFormData[\s\S]{0,800}visitPurposeOther:\s*''/);
  });

  it('VPO.C.3 — noDepositFormData includes visitPurposeOther in initial state', () => {
    expect(ADMIN_DASHBOARD).toMatch(/noDepositFormData[\s\S]{0,400}visitPurposeOther:\s*''/);
  });

  it('VPO.C.4 — kiosk pair-write deposit uses buildVisitPurposeText', () => {
    // Pair-write site: createDepositBookingPair caller must use the helper.
    // Helper-call followed by createDepositBookingPair somewhere downstream.
    const m = ADMIN_DASHBOARD.match(/const\s+visitPurposeText\s*=\s*buildVisitPurposeText\([\s\S]{0,200}depositFormData\.visitPurpose/g);
    expect(m).toBeTruthy();
    expect(m.length).toBeGreaterThanOrEqual(1);
  });

  it('VPO.C.5 — noDeposit create + update sites use buildVisitPurposeText with noDepositFormData', () => {
    const occurrences = ADMIN_DASHBOARD.match(/buildVisitPurposeText\(\s*\n?\s*noDepositFormData\.visitPurpose,/g) || [];
    expect(occurrences.length).toBe(2); // create + update
  });

  it('VPO.C.6 — old visitPurpose.join(\', \') pattern fully replaced', () => {
    // Old shape: (formData.visitPurpose || []).join(', ') — must be gone from
    // both confirmCreateDeposit + confirmCreateNoDeposit + confirmUpdateAppointment.
    // We allow it to exist nowhere in AdminDashboard.jsx now.
    const oldPattern = /\(\s*(deposit|noDeposit)FormData\.visitPurpose\s*\|\|\s*\[\]\s*\)\.join\(['"],\s*['"]\)/g;
    const matches = ADMIN_DASHBOARD.match(oldPattern) || [];
    expect(matches.length).toBe(0);
  });

  it('VPO.C.7 — opd_sessions depositData persists visitPurposeOther', () => {
    expect(ADMIN_DASHBOARD).toMatch(/visitPurposeOther:\s*depositFormData\.visitPurposeOther\s*\|\|\s*''/);
  });

  it('VPO.C.8 — opd_sessions appointmentData persists visitPurposeOther', () => {
    // Both create + update appointmentData blocks include the field.
    const occurrences = ADMIN_DASHBOARD.match(/visitPurposeOther:\s*noDepositFormData\.visitPurposeOther\s*\|\|\s*''/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('VPO.C.9 — edit-mode hydration uses parseVisitPurposeText', () => {
    expect(ADMIN_DASHBOARD).toMatch(/parseVisitPurposeText\(\s*a\.visitPurpose\s*\|\|\s*\[\]/);
  });

  it('VPO.C.10 — both modals have the conditional ระบุ input testids', () => {
    expect(ADMIN_DASHBOARD).toContain('data-testid="deposit-visit-purpose-other-input"');
    expect(ADMIN_DASHBOARD).toContain('data-testid="no-deposit-visit-purpose-other-input"');
  });

  it('VPO.C.11 — chip toggle clears visitPurposeOther when "อื่นๆ" deselected', () => {
    // The chip onClick now contains a ternary that clears visitPurposeOther
    // when r === 'อื่นๆ' && already-has (i.e. unchecking).
    const occurrences = ADMIN_DASHBOARD.match(/r === 'อื่นๆ' && has[\s\S]{0,40}\? '' : p\.visitPurposeOther/g) || [];
    expect(occurrences.length).toBe(2); // deposit + no-deposit modals
  });

  it('VPO.C.12 — Card list row 3 chip render shows interpolated label', () => {
    // The row-3 chip render now constructs "อื่นๆ: <detail>" inline.
    expect(ADMIN_DASHBOARD).toMatch(/`อื่นๆ:\s*\$\{otherDetail\}`/);
  });

  it('VPO.C.13 — form-reset paths reset visitPurposeOther to empty', () => {
    // Both setDepositFormData reset + setNoDepositFormData reset include
    // visitPurposeOther: ''.
    const occurrences = ADMIN_DASHBOARD.match(/visitPurposeOther:\s*''/g) || [];
    // 2 initial states + 2 resets + 1 new-create init = 5 minimum.
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
  });

  it('VPO.C.14 — Phase 24.0-undecies marker present', () => {
    expect(ADMIN_DASHBOARD).toMatch(/Phase 24\.0-undecies/);
  });
});

describe('Phase 24.0-undecies — DepositPanel column wrap (source-grep)', () => {
  it('VPO.D.1 — column max-width widened from 200 to ≥240', () => {
    // The <td> for purpose used to have max-w-[200px]; now max-w-[280px] to give
    // multi-purpose strings room to wrap. Regex matches className-before OR
    // -after the data-testid attribute (JSX attribute order is not stable).
    const tdRowMatch = DEPOSIT_PANEL.match(
      /<td\s+[^>]*data-testid="deposit-purpose-cell"[^>]*>|<td\s+[^>]*max-w-\[\d+px\][^>]*data-testid="deposit-purpose-cell"[^>]*>/,
    );
    expect(tdRowMatch).toBeTruthy();
    const widthMatch = tdRowMatch[0].match(/max-w-\[(\d+)px\]/);
    expect(widthMatch).toBeTruthy();
    expect(Number(widthMatch[1])).toBeGreaterThanOrEqual(240);
  });

  it('VPO.D.2 — truncate class removed from purpose badge', () => {
    // The badge inside <td data-testid="deposit-purpose-cell"> must NOT have
    // truncate (which silently hid long values).
    const cellBlock = DEPOSIT_PANEL.match(/data-testid="deposit-purpose-cell"[\s\S]{0,800}<\/td>/);
    expect(cellBlock).toBeTruthy();
    expect(cellBlock[0]).not.toMatch(/\btruncate\b/);
  });

  it('VPO.D.3 — whitespace-normal + break-words classes present for wrapping', () => {
    const cellBlock = DEPOSIT_PANEL.match(/data-testid="deposit-purpose-cell"[\s\S]{0,800}<\/td>/);
    expect(cellBlock[0]).toMatch(/whitespace-normal/);
    expect(cellBlock[0]).toMatch(/break-words/);
  });

  it('VPO.D.4 — title tooltip preserved (a11y)', () => {
    // Even with wrap, keep the tooltip.
    const cellBlock = DEPOSIT_PANEL.match(/data-testid="deposit-purpose-cell"[\s\S]{0,800}<\/td>/);
    expect(cellBlock[0]).toMatch(/title=\{dep\.appointment\.purpose/);
  });

  it('VPO.D.5 — Phase 24.0-undecies marker present', () => {
    expect(DEPOSIT_PANEL).toMatch(/Phase 24\.0-undecies/);
  });
});

describe('Phase 24.0-undecies — visitPurposeUtils marker + exports', () => {
  it('VPO.E.1 — institutional-memory marker preserved', () => {
    expect(VISIT_UTILS).toMatch(/MARKER:\s*phase-24-0-undecies-visit-purpose-other/);
  });

  it('VPO.E.2 — both helpers exported', () => {
    expect(VISIT_UTILS).toMatch(/export\s+function\s+buildVisitPurposeText/);
    expect(VISIT_UTILS).toMatch(/export\s+function\s+parseVisitPurposeText/);
  });

  it('VPO.E.3 — pure module: no React/Firebase imports', () => {
    expect(VISIT_UTILS).not.toMatch(/from\s+['"]react['"]/);
    expect(VISIT_UTILS).not.toMatch(/from\s+['"]firebase/);
  });
});

describe('Phase 24.0-undecies — full-flow simulate (Rule I)', () => {
  it('VPO.F.1 — kiosk write → DepositPanel column read end-to-end', () => {
    // Simulate the full chain:
    //   admin picks chips ['สมรรถภาพทางเพศ', 'อื่นๆ'] + types 'ผ่ามุก'
    //   → buildVisitPurposeText emits 'สมรรถภาพทางเพศ, อื่นๆ: ผ่ามุก'
    //   → stored at appointment.purpose
    //   → DepositPanel column reads dep.appointment.purpose, shows full string
    const purposes = ['สมรรถภาพทางเพศ', 'อื่นๆ'];
    const otherDetail = 'ผ่ามุก';
    const stored = buildVisitPurposeText(purposes, otherDetail);
    expect(stored).toBe('สมรรถภาพทางเพศ, อื่นๆ: ผ่ามุก');

    // Column display logic: dep.appointment.purpose || dep.appointment.appointmentTo.
    const dep = { appointment: { purpose: stored } };
    const display = dep.appointment.purpose || dep.appointment.appointmentTo;
    expect(display).toBe('สมรรถภาพทางเพศ, อื่นๆ: ผ่ามุก');
    expect(display).toContain('ผ่ามุก');
    // The bug user reported: column showed only "อื่นๆ" — must NEVER happen
    // when detail is provided.
    expect(display).not.toBe('อื่นๆ');
  });

  it('VPO.F.2 — edit-mode round-trip preserves chip + detail', () => {
    // Save → reload → edit modal opens → chips + detail input populated.
    const purposes = ['อื่นๆ'];
    const otherDetail = 'ตรวจ STD';
    // Saved on opd_sessions: { visitPurpose: ['อื่นๆ'], visitPurposeOther: 'ตรวจ STD' }
    const stored = { visitPurpose: purposes, visitPurposeOther: otherDetail };
    // Edit-mode hydration:
    const parsed = parseVisitPurposeText(stored.visitPurpose, stored.visitPurposeOther);
    expect(parsed.purposes).toEqual(['อื่นๆ']);
    expect(parsed.other).toBe('ตรวจ STD');
    // Re-save: identical output.
    const reSaved = buildVisitPurposeText(parsed.purposes, parsed.other);
    expect(reSaved).toBe('อื่นๆ: ตรวจ STD');
  });

  it('VPO.F.3 — admin unchecks "อื่นๆ" chip → detail cleared (no orphan text)', () => {
    // Simulate: admin had ['อื่นๆ'] + 'ผ่ามุก'; clicks "อื่นๆ" again to deselect.
    let state = { visitPurpose: ['อื่นๆ'], visitPurposeOther: 'ผ่ามุก' };
    const r = 'อื่นๆ';
    const has = state.visitPurpose.includes(r);
    state = {
      ...state,
      visitPurpose: has ? state.visitPurpose.filter(x => x !== r) : [...state.visitPurpose, r],
      visitPurposeOther: (r === 'อื่นๆ' && has) ? '' : state.visitPurposeOther,
    };
    expect(state.visitPurpose).toEqual([]);
    expect(state.visitPurposeOther).toBe('');
    // No orphan detail text remains.
    expect(buildVisitPurposeText(state.visitPurpose, state.visitPurposeOther)).toBe('');
  });

  it('VPO.F.4 — pre-Phase-24.0-undecies bug repro: bare "อื่นๆ" without detail', () => {
    // Pre-fix shape: visitPurpose=['อื่นๆ'] but no detail captured anywhere.
    // Joined output is the bare label — what the user reported.
    const stored = buildVisitPurposeText(['อื่นๆ'], '');
    expect(stored).toBe('อื่นๆ');
    // After fix: when admin types 'ผ่ามุก' in the new input, joined becomes:
    const fixed = buildVisitPurposeText(['อื่นๆ'], 'ผ่ามุก');
    expect(fixed).toBe('อื่นๆ: ผ่ามุก');
    expect(fixed).not.toBe(stored);
  });
});
