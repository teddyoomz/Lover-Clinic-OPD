// Phase 15.7-octies (2026-04-29) — appointment modal advisor source + location lock
//
// Two user directives in one bundle:
//
// 1. "ในระบบการสร้างหรือแก้ไขนัดหมาย ... ส่วนของที่ปรึกษา ตอนนี้บั๊ค
//    ไม่แสดงอะไรเลย ให้แก้ และให้แสดงเป็น พนักงาน และ ผู้ช่วย ในสาขานั้นๆ".
//    → Advisor dropdown is empty (V33 schema: be_staff has firstname/
//      lastname/nickname, not `name`). Fix at source: listStaff composes
//      `name` (mirror of Phase 15.7-bis listDoctors fix). Switch the
//      dropdown source to `listAllSellers({branchId})` which returns
//      merged staff + doctors filtered by current branch with composed
//      names — matches user spec "พนักงาน และ ผู้ช่วย ในสาขานั้นๆ".
//
// 2. "เพิ่มในส่วนของสถานที่นัดใน modal นัดหมายทุกอันให้ล็อคเป็นสาขาที่
//    สร้างหรือแก้ไขนัดนั้นๆเลย".
//    → Lock the freeform "สถานที่นัด" input to display the current
//      branch name (read-only). Saves currentBranchName onto the appt
//      doc's `location` field instead of admin-typed string.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const BackendSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/backendClient.js'), 'utf-8');
const ModalSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentFormModal.jsx'), 'utf-8');

describe('Phase 15.7-octies — Advisor dropdown + location lock', () => {
  describe('OC1 — listStaff composes name at source (V33 mirror)', () => {
    it('OC1.1 listStaff body has composition logic (firstname/lastname → name)', () => {
      const fn = BackendSrc.split('export async function listStaff')[1] || '';
      const next = fn.indexOf('\nexport ');
      const body = next > 0 ? fn.slice(0, next) : fn;
      // Same shape as listDoctors fix
      expect(body).toMatch(/firstname\s*\|\|\s*data\.firstName/);
      expect(body).toMatch(/lastname\s*\|\|\s*data\.lastName/);
      expect(body).toMatch(/composed\s*\|\|\s*data\.nickname\s*\|\|\s*data\.fullName/);
    });

    it('OC1.2 listStaff returns spread + name override shape', () => {
      const fn = BackendSrc.split('export async function listStaff')[1] || '';
      const next = fn.indexOf('\nexport ');
      const body = next > 0 ? fn.slice(0, next) : fn;
      expect(body).toMatch(/id:\s*d\.id\s*,\s*\.\.\.data\s*,\s*name:/);
    });

    it('OC1.3 Phase 15.7-octies marker comment in listStaff', () => {
      const fn = BackendSrc.split('export async function listStaff')[1] || '';
      const next = fn.indexOf('\nexport ');
      const body = next > 0 ? fn.slice(0, next) : fn;
      expect(body).toMatch(/Phase 15\.7-octies/);
    });
  });

  describe('OC2 — AppointmentFormModal advisor uses listAllSellers (branch-filtered)', () => {
    it('OC2.1 imports listAllSellers + resolveBranchName', () => {
      expect(ModalSrc).toMatch(/listAllSellers/);
      expect(ModalSrc).toMatch(/resolveBranchName/);
      // Both must appear in import statements
      // BSA Task 6: UI imports backendClient via scopedDataLayer Layer 2
      const importBlock = ModalSrc.match(/import\s*\{[\s\S]+?\}\s*from\s+['"]\.\.\/\.\.\/lib\/scopedDataLayer[^'"]*['"]/);
      expect(importBlock).toBeTruthy();
      expect(importBlock[0]).toMatch(/listAllSellers/);
    });

    it('OC2.2 advisorOptions state replaces staff state', () => {
      expect(ModalSrc).toMatch(/const\s*\[\s*advisorOptions\s*,\s*setAdvisorOptions\s*\]\s*=\s*useState\(\[\]\)/);
      // Anti-regression: pre-fix staff state is gone
      expect(ModalSrc).not.toMatch(/const\s*\[\s*staff\s*,\s*setStaff\s*\]/);
    });

    it('OC2.3 useEffect calls listAllSellers with branchId filter', () => {
      expect(ModalSrc).toMatch(/listAllSellers\(\s*\{\s*branchId:\s*selectedBranchId/);
    });

    it('OC2.4 advisor dropdown maps over advisorOptions (not staff)', () => {
      // Anchor on the JSX <label>...ที่ปรึกษา</label> to skip JSDoc comments.
      const labelIdx = ModalSrc.indexOf('>ที่ปรึกษา</label>');
      expect(labelIdx).toBeGreaterThan(0);
      const block = ModalSrc.slice(labelIdx, labelIdx + 1500);
      expect(block).toMatch(/advisorOptions\.map/);
      expect(block).toMatch(/data-testid="advisor-select"/);
      // Anti-regression: pre-fix `staff.map` is gone from this section
      expect(block).not.toMatch(/staff\.map\(/);
    });

    it('OC2.5 useEffect dep array includes selectedBranchId (re-load when branch changes)', () => {
      // The Phase 14.10-tris loader effect's dep array now has selectedBranchId
      const effectBlock = ModalSrc.match(/listAllSellers[\s\S]+?\}\s*,\s*\[lockedCustomer\s*,\s*selectedBranchId\]/);
      expect(effectBlock).toBeTruthy();
    });
  });

  describe('OC3 — Location field locked to current branch', () => {
    it('OC3.1 useSelectedBranch destructure now also pulls `branches`', () => {
      expect(ModalSrc).toMatch(/const\s*\{\s*branchId:\s*selectedBranchId\s*,\s*branches\s*\}\s*=\s*useSelectedBranch\(\)/);
    });

    it('OC3.2 currentBranchName resolved via resolveBranchName helper', () => {
      expect(ModalSrc).toMatch(/const\s+currentBranchName\s*=\s*resolveBranchName\(selectedBranchId,\s*branches\)/);
    });

    it('OC3.3 location field is read-only div (not <input>)', () => {
      // Find the สถานที่นัด section
      const idx = ModalSrc.indexOf('สถานที่นัด');
      expect(idx).toBeGreaterThan(0);
      const block = ModalSrc.slice(idx, idx + 2000);
      // Should have data-testid="appt-location-locked" + cursor-not-allowed + 🔒 icon
      expect(block).toMatch(/data-testid="appt-location-locked"/);
      expect(block).toMatch(/cursor-not-allowed/);
      expect(block).toMatch(/🔒/);
      // Display the branch name
      expect(block).toMatch(/\{currentBranchName\}/);
      // Anti-regression: pre-fix freeform input is GONE in this section
      expect(block.split('สถานที่นัด')[1]?.slice(0, 1000)).not.toMatch(/<input[^>]*onChange=\{e => update\(\{ location: e\.target\.value/);
    });

    it('OC3.4 payload save uses currentBranchName for location field', () => {
      expect(ModalSrc).toMatch(/location:\s*currentBranchName\s*\|\|\s*formData\.location/);
    });

    it('OC3.5 Phase 15.7-octies marker present in modal', () => {
      expect(ModalSrc).toMatch(/Phase 15\.7-octies/);
    });
  });

  describe('OC4 — Functional simulate', () => {
    function simulateStaffComposeName(rawDoc) {
      const data = rawDoc;
      const parts = [data.firstname || data.firstName || '', data.lastname || data.lastName || ''].filter(Boolean);
      const composed = parts.join(' ').trim();
      return data.name || composed || data.nickname || data.fullName || '';
    }

    it('OC4.1 V33 staff with firstname only → uses firstname', () => {
      expect(simulateStaffComposeName({ firstname: 'Mild' })).toBe('Mild');
    });

    it('OC4.2 V33 staff with firstname+lastname → composed', () => {
      expect(simulateStaffComposeName({ firstname: 'นาง', lastname: 'แดง' })).toBe('นาง แดง');
    });

    it('OC4.3 V33 staff with only nickname → falls through to nickname', () => {
      expect(simulateStaffComposeName({ nickname: 'ดิน' })).toBe('ดิน');
    });

    it('OC4.4 staff with explicit name field → respects override', () => {
      expect(simulateStaffComposeName({ name: 'ManualName', firstname: 'Other' })).toBe('ManualName');
    });

    it('OC4.5 empty staff → empty string (no undefined leak)', () => {
      expect(simulateStaffComposeName({})).toBe('');
    });

    // Sort by Thai locale (matches the modal's loader effect)
    function simulateAdvisorSort(sellers) {
      return (sellers || []).slice().sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'th')
      );
    }

    it('OC4.6 advisor sort: Thai names sorted via localeCompare("th")', () => {
      const input = [
        { id: '1', name: 'นัท' },
        { id: '2', name: 'ดิน' },
        { id: '3', name: 'ฟิล์ม' },
      ];
      const sorted = simulateAdvisorSort(input);
      // Thai locale: ด < น < ฟ
      expect(sorted.map(s => s.name)).toEqual(['ดิน', 'นัท', 'ฟิล์ม']);
    });

    it('OC4.7 — branch resolution: missing branch falls back to id literal', () => {
      // Mimics the resolveBranchName helper's fallback
      function resolve(branchId, branches) {
        if (!branchId) return '';
        const b = (branches || []).find(x => (x.branchId || x.id) === branchId);
        return b?.name || branchId;
      }
      expect(resolve('main', [])).toBe('main');
      expect(resolve('BR-1', [{ branchId: 'BR-1', name: 'นครราชสีมา' }])).toBe('นครราชสีมา');
      expect(resolve('BR-1', [{ id: 'BR-1', name: 'อยุธยา' }])).toBe('อยุธยา'); // id key (legacy)
    });
  });
});
