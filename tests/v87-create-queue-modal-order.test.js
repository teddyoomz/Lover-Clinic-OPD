// V87 (2026-05-18 EOD+11) — "สร้างคิวใหม่" modal order + label regression bank.
//
// User directive (verbatim):
//   "ปุ่ม OPD Intake เปลี่ยนชื่อปุ่มเป็น คิว Walk-in แล้วสลับเอาไปไว้ขวาสุด
//    เอาจองมัดจำมาหน้าสุด เอาจองไม่มัดจำไว้ตรงกลาง"
//
// New order:
//   Pos 1 (leftmost):  จองมัดจำ
//   Pos 2 (middle):    จองไม่มัดจำ
//   Pos 3 (rightmost): คิว Walk-in   ← renamed from "OPD Intake"
//
// Handlers + description copy unchanged (cosmetic reorder + label swap only).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN_DASHBOARD_PATH = path.resolve(__dirname, '../src/pages/AdminDashboard.jsx');
const SOURCE = fs.readFileSync(ADMIN_DASHBOARD_PATH, 'utf8');

describe('V87 — สร้างคิวใหม่ modal: order + rename', () => {
  // Find the grid-cols-3 region inside the modal that follows
  // `<p>เลือกประเภทแบบฟอร์มที่ต้องการ</p>`. Use a slice from that anchor
  // forward to the closing `</div>` so we audit only this modal.
  const MODAL_ANCHOR = 'เลือกประเภทแบบฟอร์มที่ต้องการ';
  const anchorIdx = SOURCE.indexOf(MODAL_ANCHOR);
  // Slice from anchor forward to next `Follow-up — ลิงก์ถาวร` (the section
  // following the 3 primary buttons). Modal body is always between these two.
  const FOLLOWUP_ANCHOR = 'Follow-up — ลิงก์ถาวร';
  const followupIdx = SOURCE.indexOf(FOLLOWUP_ANCHOR);
  const MODAL_SLICE = anchorIdx >= 0 && followupIdx > anchorIdx
    ? SOURCE.slice(anchorIdx, followupIdx)
    : '';

  it('M1.1 — modal slice anchors resolve (sanity)', () => {
    expect(anchorIdx).toBeGreaterThan(0);
    expect(followupIdx).toBeGreaterThan(anchorIdx);
    expect(MODAL_SLICE.length).toBeGreaterThan(500);
  });

  it('M1.2 — first button label is "จองมัดจำ"', () => {
    // Find the FIRST `<span className="block text-[var(--tx-heading)] font-bold text-sm">X</span>`
    // and assert X === 'จองมัดจำ'.
    const labelRe = /<span[^>]*className="[^"]*text-sm[^"]*"[^>]*>([^<]+)<\/span>/g;
    const matches = [...MODAL_SLICE.matchAll(labelRe)];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    const labels = matches.slice(0, 3).map((m) => m[1].trim());
    expect(labels[0]).toBe('จองมัดจำ');
  });

  it('M1.3 — second button label is "จองไม่มัดจำ"', () => {
    const labelRe = /<span[^>]*className="[^"]*text-sm[^"]*"[^>]*>([^<]+)<\/span>/g;
    const matches = [...MODAL_SLICE.matchAll(labelRe)];
    const labels = matches.slice(0, 3).map((m) => m[1].trim());
    expect(labels[1]).toBe('จองไม่มัดจำ');
  });

  it('M1.4 — third button label is "คิว Walk-in" (renamed from "OPD Intake")', () => {
    const labelRe = /<span[^>]*className="[^"]*text-sm[^"]*"[^>]*>([^<]+)<\/span>/g;
    const matches = [...MODAL_SLICE.matchAll(labelRe)];
    const labels = matches.slice(0, 3).map((m) => m[1].trim());
    expect(labels[2]).toBe('คิว Walk-in');
  });

  it('M2.1 — "OPD Intake" no longer appears as a button title in the modal', () => {
    // The string can still appear in comments / file-history references —
    // we only lock that no `<span>` button-title carries it.
    const opdIntakeAsButtonTitle = />OPD Intake</g;
    expect(MODAL_SLICE.match(opdIntakeAsButtonTitle)).toBe(null);
  });

  it('M2.2 — walk-in handler (formType: \'intake\') still wired to the renamed button', () => {
    // The "intake" handler must still exist — only the LABEL changed.
    // The renamed button is the 3rd in the grid; its onClick is openNamePrompt({formType:'intake'}).
    expect(MODAL_SLICE).toMatch(/openNamePrompt\(\{isPermanent:\s*false,\s*formType:\s*['"]intake['"]\}\)/);
  });

  it('M3.1 — V87 reorder marker comment present', () => {
    // Institutional-memory comment locks the rationale for the JSX order.
    expect(MODAL_SLICE).toMatch(/V87[\s\S]{0,200}(reorder|reordered)/i);
  });

  it('M3.2 — handler bindings: each label is on its own <button> with the canonical handler', () => {
    // จองมัดจำ → setShowDepositForm(true)
    expect(MODAL_SLICE).toMatch(/setShowDepositForm\(true\)/);
    // จองไม่มัดจำ → setShowNoDepositForm(true)
    expect(MODAL_SLICE).toMatch(/setShowNoDepositForm\(true\)/);
    // คิว Walk-in → openNamePrompt(formType:'intake')
    expect(MODAL_SLICE).toMatch(/openNamePrompt\(\{isPermanent:\s*false,\s*formType:\s*['"]intake['"]\}\)/);
  });

  it('M4.1 — description copy on Walk-in button preserved (semantically still correct)', () => {
    // "บันทึกผู้ป่วยใหม่ ... หมดอายุ 2 ชม." — applies to walk-in (new patient intake).
    expect(MODAL_SLICE).toMatch(/บันทึกผู้ป่วยใหม่/);
    expect(MODAL_SLICE).toMatch(/หมดอายุ\s*2\s*ชม\./);
  });
});
