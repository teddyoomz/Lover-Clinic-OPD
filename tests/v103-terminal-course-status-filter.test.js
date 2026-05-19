// V103 (2026-05-19 LATE+2) — terminal-status filter regression bank.
//
// Class-of-bug: V12 multi-reader-sweep — refundCustomerCourse +
// cancelCustomerCourse soft-mark customer.courses[i].status='คืนเงิน'/'ยกเลิก'
// per design (audit-trail integrity). Display readers MUST filter these
// from active surfaces. lineBotResponder.active filtered correctly;
// CDV.activeCourses + mapRawCoursesToForm did NOT.
//
// Real-prod confirmed (วันเพ็ญ LC-26000078): 6/6 entries status='คืนเงิน'
// still rendering as active in "คอร์สของฉัน" tab + TFP picker.
//
// AV90 invariant locks the 3 sanctioned consumers + drift catcher.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  isTerminalCourseStatus,
  isCourseUsableInTreatment,
  mapRawCoursesToForm,
} from '../src/lib/treatmentBuyHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── A. Canonical helper unit ─────────────────────────────────────
describe('V103.A — isTerminalCourseStatus canonical helper', () => {
  it('A1: returns true for status="คืนเงิน"', () => {
    expect(isTerminalCourseStatus({ status: 'คืนเงิน' })).toBe(true);
  });
  it('A2: returns true for status="ยกเลิก"', () => {
    expect(isTerminalCourseStatus({ status: 'ยกเลิก' })).toBe(true);
  });
  it('A3: returns false for status="" (active)', () => {
    expect(isTerminalCourseStatus({ status: '' })).toBe(false);
  });
  it('A4: returns false for status="กำลังใช้งาน"', () => {
    expect(isTerminalCourseStatus({ status: 'กำลังใช้งาน' })).toBe(false);
  });
  it('A5: returns false for status missing', () => {
    expect(isTerminalCourseStatus({})).toBe(false);
  });
  it('A6: returns false for null/undefined input (defensive)', () => {
    expect(isTerminalCourseStatus(null)).toBe(false);
    expect(isTerminalCourseStatus(undefined)).toBe(false);
  });
  it('A7: trims whitespace before compare', () => {
    expect(isTerminalCourseStatus({ status: '  คืนเงิน  ' })).toBe(true);
  });
});

// ─── B. isCourseUsableInTreatment terminal-status gate ────────────
describe('V103.B — isCourseUsableInTreatment rejects terminal status', () => {
  it('B1: refunded buffet (would be active by buffet branch) → false', () => {
    expect(isCourseUsableInTreatment({ courseType: 'บุฟเฟต์', status: 'คืนเงิน' })).toBe(false);
  });
  it('B2: cancelled fill-later → false', () => {
    expect(isCourseUsableInTreatment({ courseType: 'เหมาตามจริง', status: 'ยกเลิก' })).toBe(false);
  });
  it('B3: cancelled standard with remaining > 0 → false', () => {
    expect(isCourseUsableInTreatment({ qty: '5 / 10 ครั้ง', status: 'ยกเลิก' })).toBe(false);
  });
  it('B4: active standard with remaining > 0 → true (regression — V103 must not break healthy path)', () => {
    expect(isCourseUsableInTreatment({ qty: '5 / 10 ครั้ง' })).toBe(true);
  });
  it('B5: active buffet → true', () => {
    expect(isCourseUsableInTreatment({ courseType: 'บุฟเฟต์' })).toBe(true);
  });
});

// ─── C. mapRawCoursesToForm drops terminal-status entries ─────────
describe('V103.C — mapRawCoursesToForm filters refunded/cancelled from TFP picker', () => {
  it('C1: refunded entry dropped from form-shape output', () => {
    const raw = [
      { name: 'A', qty: '5 / 10 ครั้ง', status: 'คืนเงิน' },
      { name: 'B', qty: '3 / 8 ครั้ง', status: '' },
    ];
    const form = mapRawCoursesToForm(raw);
    expect(form).toHaveLength(1);
    expect(form[0].courseName).toBe('B');
  });
  it('C2: cancelled entry dropped', () => {
    const raw = [{ name: 'X', qty: '5 / 10 ครั้ง', status: 'ยกเลิก' }];
    expect(mapRawCoursesToForm(raw)).toHaveLength(0);
  });
  it('C3: all-refunded → empty form (วันเพ็ญ real-prod scenario)', () => {
    const wanphenLike = [
      { name: 'Shock Wave', product: 'Shock wave', qty: '12 / 12 ครั้ง', status: 'คืนเงิน', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
      { name: 'Shock Wave', product: 'ติดตาม', qty: '1 / 1 ครั้ง', status: 'คืนเงิน', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
      { name: 'Shock Wave', product: 'Shock wave', qty: '12 / 12 ครั้ง', status: 'คืนเงิน' },
    ];
    expect(mapRawCoursesToForm(wanphenLike)).toHaveLength(0);
  });
  it('C4: mixed — only active entries pass through', () => {
    const raw = [
      { name: 'A', qty: '10 / 10', status: 'คืนเงิน' },
      { name: 'B', qty: '5 / 5', status: '' },
      { name: 'C', qty: '3 / 8', status: 'ยกเลิก' },
      { name: 'D', qty: '2 / 5', status: 'กำลังใช้งาน' },
    ];
    const form = mapRawCoursesToForm(raw);
    const names = form.map(f => f.courseName);
    expect(names).toEqual(['B', 'D']);
  });
});

// ─── D. CDV.activeCourses source-grep ─────────────────────────────
describe('V103.D — CustomerDetailView source-grep', () => {
  const CDV_PATH = resolve(__dirname, '../src/components/backend/CustomerDetailView.jsx');
  const CDV_SRC = readFileSync(CDV_PATH, 'utf8');

  it('D1: imports isTerminalCourseStatus from treatmentBuyHelpers', () => {
    expect(CDV_SRC).toMatch(/import\s*\{[^}]*isTerminalCourseStatus[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/treatmentBuyHelpers/);
  });

  it('D2: activeCourses filter contains isTerminalCourseStatus guard', () => {
    // Find the activeCourses useMemo block + verify isTerminalCourseStatus check
    const idx = CDV_SRC.indexOf('const activeCourses');
    expect(idx).toBeGreaterThan(-1);
    const block = CDV_SRC.slice(idx, idx + 1500);
    expect(block).toMatch(/isTerminalCourseStatus\s*\(\s*c\s*\)/);
  });

  it('D3: V103 marker present', () => {
    expect(CDV_SRC).toMatch(/V103/);
  });
});

// ─── E. treatmentBuyHelpers source-grep ───────────────────────────
describe('V103.E — treatmentBuyHelpers source-grep', () => {
  const TBH_PATH = resolve(__dirname, '../src/lib/treatmentBuyHelpers.js');
  const TBH_SRC = readFileSync(TBH_PATH, 'utf8');

  it('E1: exports isTerminalCourseStatus', () => {
    expect(TBH_SRC).toMatch(/export\s+function\s+isTerminalCourseStatus/);
  });

  it('E2: isCourseUsableInTreatment calls helper early', () => {
    const idx = TBH_SRC.indexOf('export function isCourseUsableInTreatment');
    expect(idx).toBeGreaterThan(-1);
    const body = TBH_SRC.slice(idx, idx + 500);
    expect(body).toMatch(/isTerminalCourseStatus\s*\(\s*c\s*\)/);
  });

  it('E3: mapRawCoursesToForm calls helper', () => {
    const idx = TBH_SRC.indexOf('export function mapRawCoursesToForm');
    expect(idx).toBeGreaterThan(-1);
    const body = TBH_SRC.slice(idx, idx + 600);
    expect(body).toMatch(/isTerminalCourseStatus\s*\(\s*c\s*\)/);
  });

  it('E4: V103 marker present', () => {
    expect(TBH_SRC).toMatch(/V103/);
  });
});

// ─── F. AV90 cross-link ───────────────────────────────────────────
describe('V103.F — AV90 invariant cross-link', () => {
  it('F1: AV90 entry present in SKILL.md', () => {
    const skill = readFileSync(resolve(__dirname, '../.claude/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');
    expect(skill).toMatch(/### AV90\b/);
    expect(skill).toContain('V103');
    expect(skill).toContain('isTerminalCourseStatus');
  });

  it('F2: AV90 documents the 3 sanctioned consumers', () => {
    const skill = readFileSync(resolve(__dirname, '../.claude/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');
    expect(skill).toMatch(/CustomerDetailView\.activeCourses/);
    expect(skill).toMatch(/mapRawCoursesToForm/);
    expect(skill).toMatch(/isCourseUsableInTreatment/);
  });

  it('F3: AV90 documents sanctioned exceptions (lineBotResponder, writers)', () => {
    const skill = readFileSync(resolve(__dirname, '../.claude/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');
    expect(skill).toMatch(/lineBotResponder/);
    expect(skill).toMatch(/applyCourseRefund/);
  });
});

// ─── G. Real-prod reproduction (วันเพ็ญ scenario) ─────────────────
describe('V103.G — Full reproduction of วันเพ็ญ post-refund scenario', () => {
  // All 6 entries status='คืนเงิน' per real-prod diag 2026-05-19 LATE+2
  const wanphenRefundedAll = [
    { name: 'Shock Wave 12+ติดตาม 1', product: 'Shock wave', qty: '0 / 12 ครั้ง', status: 'คืนเงิน', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    { name: 'Shock Wave 12+ติดตาม 1', product: 'ติดตามอาการกับแพทย์', qty: '0 / 1 ครั้ง', status: 'คืนเงิน', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    { name: 'Shock Wave 12+ติดตาม 1', product: 'Shock wave', qty: '12 / 12 ครั้ง', status: 'คืนเงิน', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    { name: 'Shock Wave 12+ติดตาม 1', product: 'ติดตามอาการกับแพทย์', qty: '2 / 2 ครั้ง', status: 'คืนเงิน', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    { name: 'Shock Wave 12+ติดตาม 1', product: 'Shock wave', qty: '12 / 12 ครั้ง', status: 'คืนเงิน', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    { name: 'Shock Wave 12+ติดตาม 1', product: 'ติดตามอาการกับแพทย์', qty: '2 / 2 ครั้ง', status: 'คืนเงิน', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
  ];

  it('G1: TFP picker (mapRawCoursesToForm) returns empty for all-refunded customer', () => {
    expect(mapRawCoursesToForm(wanphenRefundedAll)).toHaveLength(0);
  });

  it('G2: CDV activeCourses simulator returns empty', () => {
    const activeCoursesSimulator = wanphenRefundedAll.filter(c => {
      if (isTerminalCourseStatus(c)) return false;
      if (c?.needsPickSelection) return true;
      if (String(c?.courseType || '').trim() === 'บุฟเฟต์') return true;
      // remaining > 0 check (simplified)
      const m = (c?.qty || '').match(/^([\d.,]+)/);
      return m ? parseFloat(m[1].replace(/,/g, '')) > 0 : false;
    });
    expect(activeCoursesSimulator).toHaveLength(0);
  });

  it('G3: isCourseUsableInTreatment returns false for every entry', () => {
    wanphenRefundedAll.forEach(c => {
      expect(isCourseUsableInTreatment(c)).toBe(false);
    });
  });

  it('G4: Single active entry passes through alongside refunded ones', () => {
    const mixed = [
      ...wanphenRefundedAll,
      { name: 'Active course', product: 'Real product', qty: '3 / 5 ครั้ง', status: '', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    ];
    const form = mapRawCoursesToForm(mixed);
    expect(form).toHaveLength(1);
    expect(form[0].courseName).toBe('Active course');
  });
});
