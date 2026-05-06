// ─── Phase 24.0-vicies-quater — paymentAmount wheel-scroll bug fix ──────
//
// User report 2026-05-06: "บั๊คการแสดงผลการจองมัดจำใน front end กรอก 2000
// แสดง 1999 บางทีกรอก 1000 แสดง 998 แก้ให้ไม่เป็นอีก".
//
// Root cause: <input type="number"> reacts to mouse-wheel scroll + arrow
// keys with browser-default step (1). Admin types 2000, accidental wheel-
// scroll over the focused input → 1999. Multi-keystroke arrow-down on
// 1000 → 998. The input was unprotected against either trigger.
//
// Fix: switch all paymentAmount inputs from type="number" to:
//   type="text" + inputMode="numeric" + pattern="[0-9]*" — provides
//     numeric keyboard on mobile but no wheel/arrow side-effects
//   onChange sanitizer: String(e.target.value).replace(/[^\d.]/g, '') —
//     defends against locale autofill (e.g. "2,000.00") + arbitrary
//     paste content
//   onWheel={e => e.target.blur()} — defense-in-depth in case any future
//     revert reintroduces type="number"
//
// Three inputs fixed (all that bind to a deposit amount):
//   1. AdminDashboard kiosk create form depositFormData.paymentAmount
//   2. AdminDashboard editing-deposit form (OPD detail panel)
//   3. DepositPanel create-deposit form (Finance.มัดจำ tab)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const DEPOSIT_PANEL = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/DepositPanel.jsx'),
  'utf8',
);

describe('Phase 24.0-vicies-quater — kiosk create-form paymentAmount input', () => {
  it('VQT.A.1 — input is type="text" with inputMode="numeric" (not type="number")', () => {
    // Find the kiosk create form input by its bound state name.
    const inputBlock = ADMIN.match(
      /<input[\s\S]{0,500}?value=\{depositFormData\.paymentAmount\}[\s\S]{0,800}?\/>/,
    );
    expect(inputBlock).toBeTruthy();
    expect(inputBlock[0]).toMatch(/type="text"/);
    expect(inputBlock[0]).toMatch(/inputMode="numeric"/);
    expect(inputBlock[0]).not.toMatch(/type="number"/);
  });

  it('VQT.A.2 — onChange sanitizes to digits + decimal point', () => {
    const inputBlock = ADMIN.match(
      /<input[\s\S]{0,500}?value=\{depositFormData\.paymentAmount\}[\s\S]{0,800}?\/>/,
    );
    expect(inputBlock[0]).toMatch(/replace\(\/\[\^\\d\.\]\/g,\s*''\)/);
  });

  it('VQT.A.3 — onWheel blurs (defense-in-depth)', () => {
    const inputBlock = ADMIN.match(
      /<input[\s\S]{0,500}?value=\{depositFormData\.paymentAmount\}[\s\S]{0,800}?\/>/,
    );
    expect(inputBlock[0]).toMatch(/onWheel=\{e\s*=>\s*e\.target\.blur\(\)\}/);
  });

  it('VQT.A.4 — pattern="[0-9]*" present (mobile keyboard hint)', () => {
    const inputBlock = ADMIN.match(
      /<input[\s\S]{0,500}?value=\{depositFormData\.paymentAmount\}[\s\S]{0,800}?\/>/,
    );
    expect(inputBlock[0]).toMatch(/pattern="\[0-9\]\*"/);
  });
});

describe('Phase 24.0-vicies-quater — editing-deposit form input (OPD detail panel)', () => {
  it('VQT.B.1 — type="text" + inputMode + sanitizer + onWheel', () => {
    // The editing form binds to setEditingDepositData (not setDepositFormData).
    const inputBlock = ADMIN.match(
      /<input[\s\S]{0,500}?value=\{dep\.paymentAmount\s*\|\|\s*''\}[\s\S]{0,800}?\/>/,
    );
    expect(inputBlock).toBeTruthy();
    expect(inputBlock[0]).toMatch(/type="text"/);
    expect(inputBlock[0]).toMatch(/inputMode="numeric"/);
    expect(inputBlock[0]).toMatch(/replace\(\/\[\^\\d\.\]\/g,\s*''\)/);
    expect(inputBlock[0]).toMatch(/onWheel=\{e\s*=>\s*e\.target\.blur\(\)\}/);
    expect(inputBlock[0]).not.toMatch(/type="number"/);
  });

  it('VQT.B.2 — setEditingDepositData receives sanitized value', () => {
    expect(ADMIN).toMatch(
      /setEditingDepositData\(p\s*=>\s*\(\{\s*\.\.\.p,\s*paymentAmount:\s*sanitized/,
    );
  });
});

describe('Phase 24.0-vicies-quater — DepositPanel Finance create-form input', () => {
  it('VQT.C.1 — DepositPanel deposit-amount input is type="text" + inputMode="numeric"', () => {
    // The DepositPanel create-form binds to setAmount via plain `amount` state.
    const inputBlock = DEPOSIT_PANEL.match(
      /<input[\s\S]{0,500}?value=\{amount\}[\s\S]{0,800}?\/>/,
    );
    expect(inputBlock).toBeTruthy();
    expect(inputBlock[0]).toMatch(/type="text"/);
    expect(inputBlock[0]).toMatch(/inputMode="numeric"/);
    expect(inputBlock[0]).not.toMatch(/type="number"/);
  });

  it('VQT.C.2 — sanitizer + onWheel applied', () => {
    const inputBlock = DEPOSIT_PANEL.match(
      /<input[\s\S]{0,500}?value=\{amount\}[\s\S]{0,800}?\/>/,
    );
    expect(inputBlock[0]).toMatch(/replace\(\/\[\^\\d\.\]\/g,\s*''\)/);
    expect(inputBlock[0]).toMatch(/onWheel=\{e\s*=>\s*e\.target\.blur\(\)\}/);
  });

  it('VQT.C.3 — Phase 24.0-vicies-quater marker present in both files', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-vicies-quater/);
    expect(DEPOSIT_PANEL).toMatch(/Phase 24\.0-vicies-quater/);
  });
});

describe('Phase 24.0-vicies-quater — full-flow simulate (Rule I)', () => {
  it('VQT.F.1 — sanitizer strips non-digits (anti-locale-autofill)', () => {
    // Mirror of the sanitizer.
    const sanitize = (s) => String(s).replace(/[^\d.]/g, '');
    expect(sanitize('2000')).toBe('2000');
    expect(sanitize('2,000')).toBe('2000');     // comma autofill
    expect(sanitize('2,000.00')).toBe('2000.00'); // locale decimal
    expect(sanitize('฿2000')).toBe('2000');       // currency symbol
    expect(sanitize('2000 บาท')).toBe('2000');   // unit suffix
    expect(sanitize('abc 1500 xyz')).toBe('1500'); // arbitrary text
    expect(sanitize('')).toBe('');
  });

  it('VQT.F.2 — toLocaleString round-trip preserves whole numbers', () => {
    // After sanitize, Number(...) → toLocaleString should match the
    // input number for whole values (no precision loss).
    const sanitize = (s) => String(s).replace(/[^\d.]/g, '');
    const cases = [
      { input: '2000', display: '2,000' },
      { input: '1000', display: '1,000' },
      { input: '1999', display: '1,999' },
      { input: '500', display: '500' },
      { input: '12500', display: '12,500' },
    ];
    for (const { input, display } of cases) {
      const sanitized = sanitize(input);
      const num = Number(sanitized);
      const renderText = num.toLocaleString();
      expect(renderText).toBe(display);
    }
  });

  it('VQT.F.3 — pre-fix bug repro: type="number" wheel-scroll decrements (anti-regression)', () => {
    // Pre-fix: type="number" with default step=1 → wheel up/down increments.
    // No fix is testable in jsdom for this (browser-only behavior), but the
    // SOURCE-LEVEL fix (no type="number" anywhere in deposit-amount inputs)
    // is verified by VQT.A.1 / B.1 / C.1.
    const adminTypeNumberAmount = ADMIN.match(
      /<input[^>]{0,500}?type="number"[^>]{0,500}?paymentAmount/,
    );
    expect(adminTypeNumberAmount).toBeFalsy();
    const dpTypeNumberAmount = DEPOSIT_PANEL.match(
      /<input[^>]{0,500}?type="number"[^>]{0,500}?value=\{amount\}/,
    );
    expect(dpTypeNumberAmount).toBeFalsy();
  });

  it('VQT.F.4 — adversarial: empty input + dot-only + multiple dots', () => {
    const sanitize = (s) => String(s).replace(/[^\d.]/g, '');
    expect(sanitize('')).toBe('');
    expect(sanitize('.')).toBe('.');     // dot allowed (Number('.') = NaN, but the input is mid-edit)
    expect(sanitize('1.2.3')).toBe('1.2.3'); // multiple dots passed through; Number() returns NaN
    // Number('') = 0 → toLocaleString = '0' (the gate `dep.paymentAmount &&`
    // handles the empty-string case by NOT rendering the badge).
    expect(Number('')).toBe(0);
  });
});
