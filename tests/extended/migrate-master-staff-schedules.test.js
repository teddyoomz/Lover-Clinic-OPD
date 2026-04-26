// ─── Phase 13.2.14 — migrateMasterStaffSchedulesToBe tests ────────────────
// MM group — verifies the master_data → be_staff_schedules migrator:
//   - mapMasterToBeStaffSchedule pure mapper
//   - FK resolution via doctor map first then staff map
//   - Orphan reporting (no crash; user runs Doctors/Staff sync first)
//   - Idempotent doc id from proClinicId
//   - Type preservation (recurring vs leave vs override)
//   - Empty source returns zero counts cleanly
//
// Live integration is verified in Phase K (preview_eval against real
// Firestore). MM here covers the pure mapper + source-grep wiring.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mapMasterToBeStaffSchedule } from '../src/lib/backendClient.js';

const clientSrc = readFileSync(
  resolve(__dirname, '..', 'src/lib/backendClient.js'),
  'utf-8'
);
const tabSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/MasterDataTab.jsx'),
  'utf-8'
);

describe('MM — Phase 13.2.14 migrateMasterStaffSchedulesToBe', () => {
  describe('MM.A — mapMasterToBeStaffSchedule pure mapper', () => {
    const NOW = '2026-04-26T00:00:00.000Z';
    const SRC_RECURRING = {
      proClinicId: 'recurring-308-tuesday',
      proClinicStaffId: '308',
      proClinicStaffName: 'นาสาว เอ',
      type: 'recurring',
      dayOfWeek: 2,
      startTime: '08:30',
      endTime: '12:00',
      date: null,
    };
    const MATCH_DOCTOR = { id: '308', name: 'นาสาว An เอ (เอ)', type: 'doctor' };
    const MATCH_STAFF = { id: '102', name: 'ฟิล์ม', type: 'employee' };

    it('MM.A.1 maps recurring entry → be shape with our staffId', () => {
      const out = mapMasterToBeStaffSchedule(SRC_RECURRING, MATCH_DOCTOR, NOW);
      expect(out).toBeTruthy();
      expect(out.id).toBe('recurring-308-tuesday');
      expect(out.scheduleId).toBe('recurring-308-tuesday');
      expect(out.staffId).toBe('308');
      expect(out.staffName).toBe('นาสาว An เอ (เอ)');
      expect(out.type).toBe('recurring');
      expect(out.dayOfWeek).toBe(2);
      expect(out.date).toBe('');
      expect(out.startTime).toBe('08:30');
      expect(out.endTime).toBe('12:00');
    });

    it('MM.A.2 maps leave entry → date set + dayOfWeek null', () => {
      const src = {
        proClinicId: 'leave-308-2026-04-29',
        proClinicStaffId: '308',
        type: 'leave',
        date: '2026-04-29',
        dayOfWeek: null,
      };
      const out = mapMasterToBeStaffSchedule(src, MATCH_DOCTOR, NOW);
      expect(out.type).toBe('leave');
      expect(out.date).toBe('2026-04-29');
      expect(out.dayOfWeek).toBe(null);
    });

    it('MM.A.3 stamps _source = proclinic-sync + _staffType = doctor', () => {
      const out = mapMasterToBeStaffSchedule(SRC_RECURRING, MATCH_DOCTOR, NOW);
      expect(out._source).toBe('proclinic-sync');
      expect(out._staffType).toBe('doctor');
      expect(out._proClinicStaffId).toBe('308');
      expect(out._proClinicStaffName).toBe('นาสาว เอ');
    });

    it('MM.A.4 employee match → _staffType = employee', () => {
      const out = mapMasterToBeStaffSchedule(SRC_RECURRING, MATCH_STAFF, NOW);
      expect(out._staffType).toBe('employee');
      expect(out.staffId).toBe('102');
      expect(out.staffName).toBe('ฟิล์ม');
    });

    it('MM.A.5 null source → null', () => {
      expect(mapMasterToBeStaffSchedule(null, MATCH_DOCTOR, NOW)).toBe(null);
    });

    it('MM.A.6 null match → null (avoid orphans slipping through)', () => {
      expect(mapMasterToBeStaffSchedule(SRC_RECURRING, null, NOW)).toBe(null);
    });

    it('MM.A.7 missing proClinicId AND id → null', () => {
      expect(mapMasterToBeStaffSchedule({ ...SRC_RECURRING, proClinicId: '', id: '' }, MATCH_DOCTOR, NOW)).toBe(null);
    });

    it('MM.A.8 falls back to src.id when proClinicId missing', () => {
      const src = { ...SRC_RECURRING, proClinicId: '', id: 'fallback-id-1' };
      const out = mapMasterToBeStaffSchedule(src, MATCH_DOCTOR, NOW);
      expect(out.id).toBe('fallback-id-1');
    });

    it('MM.A.9 stamps createdAt + updatedAt = now', () => {
      const out = mapMasterToBeStaffSchedule(SRC_RECURRING, MATCH_DOCTOR, NOW);
      expect(out.createdAt).toBe(NOW);
      expect(out.updatedAt).toBe(NOW);
    });

    it('MM.A.10 dayOfWeek "0" string coerced to number 0 (Sunday)', () => {
      const src = { ...SRC_RECURRING, dayOfWeek: '0' };
      const out = mapMasterToBeStaffSchedule(src, MATCH_DOCTOR, NOW);
      expect(out.dayOfWeek).toBe(0);
    });
  });

  describe('MM.B — Source-grep wiring guards', () => {
    it('MM.B.1 backendClient exports migrateMasterStaffSchedulesToBe', () => {
      expect(clientSrc).toMatch(/export\s+async\s+function\s+migrateMasterStaffSchedulesToBe/);
    });

    it('MM.B.2 backendClient exports mapMasterToBeStaffSchedule for tests', () => {
      expect(clientSrc).toMatch(/export\s+function\s+mapMasterToBeStaffSchedule/);
    });

    it('MM.B.3 migrator pre-loads doctorsCol + staffCol in parallel', () => {
      const idx = clientSrc.indexOf('migrateMasterStaffSchedulesToBe');
      const fn = clientSrc.slice(idx, idx + 5000);
      expect(fn).toMatch(/Promise\.all\(\[/);
      expect(fn).toMatch(/getDocs\(doctorsCol\(\)\)/);
      expect(fn).toMatch(/getDocs\(staffCol\(\)\)/);
    });

    it('MM.B.4 migrator tries doctorMap FIRST then staffMap (precedence)', () => {
      const idx = clientSrc.indexOf('migrateMasterStaffSchedulesToBe');
      const fn = clientSrc.slice(idx, idx + 6000);
      // The match resolution: doctorMap.get(proStaffId) || staffMap.get(proStaffId)
      expect(fn).toMatch(/doctorMap\.get\(proStaffId\)\s*\|\|\s*staffMap\.get\(proStaffId\)/);
    });

    it('MM.B.5 migrator returns { imported, skipped, orphans, orphanCount, total }', () => {
      const idx = clientSrc.indexOf('migrateMasterStaffSchedulesToBe');
      const fn = clientSrc.slice(idx, idx + 6000);
      expect(fn).toMatch(/return\s*\{\s*imported,/s);
      expect(fn).toMatch(/orphans/);
      expect(fn).toMatch(/orphanCount/);
      expect(fn).toMatch(/total/);
    });

    it('MM.B.6 orphan record includes proClinicStaffId + name (for UX feedback)', () => {
      const idx = clientSrc.indexOf('orphans.push');
      expect(idx).toBeGreaterThan(0);
      const ctx = clientSrc.slice(idx, idx + 400);
      expect(ctx).toMatch(/proClinicStaffId:/);
      expect(ctx).toMatch(/proClinicStaffName:/);
    });

    it('MM.B.7 dev-only marker on the migrator (rule H-bis)', () => {
      // Look for the section header comment containing @dev-only marker
      // anywhere in the file BEFORE the migrator declaration.
      const fnIdx = clientSrc.indexOf('migrateMasterStaffSchedulesToBe');
      const before = clientSrc.slice(0, fnIdx);
      // Find the last @dev-only marker before the function — must be in the
      // Phase 13.2.14 section header.
      const lastDevOnly = before.lastIndexOf('@dev-only');
      expect(lastDevOnly).toBeGreaterThan(0);
      // Must be within ~3000 chars of the function (i.e. in its section)
      expect(fnIdx - lastDevOnly).toBeLessThan(3000);
      // The Phase 13.2.14 comment must mention this migrator
      const sectionCtx = clientSrc.slice(Math.max(0, lastDevOnly - 800), lastDevOnly + 200);
      expect(sectionCtx).toMatch(/Phase 13\.2\.14|staff_schedules.*be_staff_schedules/);
    });

    it('MM.B.8 MasterDataTab imports + registers the migrator', () => {
      expect(tabSrc).toMatch(/migrateMasterStaffSchedulesToBe/);
      expect(tabSrc).toMatch(/key:\s*['"]staff_schedules['"][^}]*fn:\s*migrateMasterStaffSchedulesToBe/s);
    });

    it('MM.B.9 MasterDataTab migrate label has Thai → be_staff_schedules', () => {
      expect(tabSrc).toMatch(/ตารางหมอ \+ พนักงาน → be_staff_schedules/);
    });

    it('MM.B.10 idempotent: setDoc with merge:false (overwrite same id)', () => {
      const idx = clientSrc.indexOf('migrateMasterStaffSchedulesToBe');
      const fn = clientSrc.slice(idx, idx + 6000);
      expect(fn).toMatch(/setDoc\(staffScheduleDocRef\(payload\.id\),\s*payload,\s*\{\s*merge:\s*false\s*\}\)/);
    });
  });

  describe('MM.C — V21-anti: name resolution NEVER returns numeric ID as visible text', () => {
    it('MM.C.1 mapper falls back to "?" when match.name is empty (NOT staffId)', () => {
      const out = mapMasterToBeStaffSchedule(
        { proClinicId: 'recurring-1-mo', proClinicStaffId: '1', type: 'recurring', dayOfWeek: 1 },
        { id: '1', name: '', type: 'doctor' },
        '2026-04-26T00:00:00.000Z',
      );
      expect(out.staffName).toBe('?');
      expect(out.staffName).not.toMatch(/^\d+$/);
    });

    it('MM.C.2 mapper preserves Thai display name when match has it', () => {
      const out = mapMasterToBeStaffSchedule(
        { proClinicId: 'recurring-1-mo', proClinicStaffId: '1', type: 'recurring', dayOfWeek: 1 },
        { id: '1', name: 'หมอ ฟ้า', type: 'doctor' },
        '2026-04-26T00:00:00.000Z',
      );
      expect(out.staffName).toBe('หมอ ฟ้า');
    });

    it('MM.C.3 staffId is OUR internal id, not proClinicStaffId echo', () => {
      // The match.id may differ from src.proClinicStaffId (e.g. legacy
      // doctor records with renumbered ids). Migrator must use match.id.
      const out = mapMasterToBeStaffSchedule(
        { proClinicId: 'recurring-308-tuesday', proClinicStaffId: '308', type: 'recurring', dayOfWeek: 2 },
        { id: 'OUR-INTERNAL-DR-A', name: 'หมอ A', type: 'doctor' },
        '2026-04-26T00:00:00.000Z',
      );
      expect(out.staffId).toBe('OUR-INTERNAL-DR-A');
      expect(out._proClinicStaffId).toBe('308'); // traceability only
    });
  });
});
