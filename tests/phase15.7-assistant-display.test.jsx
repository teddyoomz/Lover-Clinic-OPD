// Phase 15.7 (2026-04-28) — assistant-name display in appointments
//
// User report: "ผู้ช่วยแพทย์และแพทย์ยังไม่ขึ้นชื่อในการนัดหมายที่ต่างๆ".
// Pre-fix shape:
//   - AppointmentFormModal saved assistantIds only (no assistantNames denorm)
//   - AppointmentTab + CustomerDetailView only rendered doctorName, never
//     iterated assistant arrays at all
//   - TreatmentTimeline already-correct via backendClient summary builder
//
// Post-fix:
//   - AppointmentFormModal denormalizes assistantNames at save
//   - DepositPanel mirror denorm at save
//   - AppointmentTab + CustomerDetailView render via shared
//     resolveAssistantNames(appt, doctorMap) — denorm preferred, fallback
//     to ID lookup for legacy appts
//
// Test bank:
//   A1 resolveAssistantNames pure helper — denorm path
//   A2 resolveAssistantNames pure helper — ID lookup fallback
//   A3 resolveAssistantNames pure helper — both paths empty
//   A4 buildDoctorMap pure helper
//   A5 source-grep: AppointmentFormModal denorms at save
//   A6 source-grep: DepositPanel denorms at save
//   A7 source-grep: AppointmentTab uses resolveAssistantNames for render
//   A8 source-grep: CustomerDetailView AppointmentCard uses resolveAssistantNames
//   A9 source-grep: appointmentReportAggregator prefers denorm
//   A10 adversarial: mixed shapes, undefined doctor, blank names

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import { resolveAssistantNames, buildDoctorMap } from '../src/lib/appointmentDisplay.js';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const AppointmentFormModalSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentFormModal.jsx'), 'utf-8');
const DepositPanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/DepositPanel.jsx'), 'utf-8');
const AppointmentTabSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentCalendarView.jsx'), 'utf-8');
const CustomerDetailViewSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/CustomerDetailView.jsx'), 'utf-8');
const ReportAggSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/appointmentReportAggregator.js'), 'utf-8');

describe('Phase 15.7 — Assistant display', () => {
  describe('A1 — resolveAssistantNames denorm path', () => {
    it('A1.1 returns denormalized assistantNames when present and non-empty', () => {
      const appt = { assistantNames: ['Dr. A', 'Dr. B'], assistantIds: ['1', '2'] };
      expect(resolveAssistantNames(appt, null)).toEqual(['Dr. A', 'Dr. B']);
    });

    it('A1.2 trims and filters empty entries from denorm', () => {
      const appt = { assistantNames: ['Dr. A', '  ', 'Dr. B', null] };
      expect(resolveAssistantNames(appt, null)).toEqual(['Dr. A', 'Dr. B']);
    });

    it('A1.3 falls back to IDs when denorm is empty array', () => {
      const map = new Map([['1', { name: 'Dr. A' }]]);
      const appt = { assistantNames: [], assistantIds: ['1'] };
      expect(resolveAssistantNames(appt, map)).toEqual(['Dr. A']);
    });
  });

  describe('A2 — resolveAssistantNames ID lookup fallback', () => {
    it('A2.1 resolves IDs via Map', () => {
      const map = new Map([
        ['1', { name: 'Dr. A' }],
        ['2', { name: 'Dr. B' }],
      ]);
      const appt = { assistantIds: ['1', '2'] };
      expect(resolveAssistantNames(appt, map)).toEqual(['Dr. A', 'Dr. B']);
    });

    it('A2.2 resolves IDs via plain object', () => {
      const map = { '1': { name: 'Dr. A' }, '2': { name: 'Dr. B' } };
      const appt = { assistantIds: ['1', '2'] };
      expect(resolveAssistantNames(appt, map)).toEqual(['Dr. A', 'Dr. B']);
    });

    it('A2.3 silently skips missing IDs (no "undefined" leak)', () => {
      const map = new Map([['1', { name: 'Dr. A' }]]);
      const appt = { assistantIds: ['1', 'X-NOT-FOUND', '99'] };
      expect(resolveAssistantNames(appt, map)).toEqual(['Dr. A']);
    });

    it('A2.4 coerces ID to string (numeric IDs work)', () => {
      const map = new Map([['1', { name: 'Dr. A' }]]);
      const appt = { assistantIds: [1] };
      expect(resolveAssistantNames(appt, map)).toEqual(['Dr. A']);
    });

    it('A2.5 handles null map', () => {
      const appt = { assistantIds: ['1', '2'] };
      expect(resolveAssistantNames(appt, null)).toEqual([]);
    });
  });

  describe('A3 — empty cases', () => {
    it('A3.1 null appt → []', () => {
      expect(resolveAssistantNames(null, new Map())).toEqual([]);
    });

    it('A3.2 appt without any assistant fields → []', () => {
      expect(resolveAssistantNames({}, new Map())).toEqual([]);
    });

    it('A3.3 empty assistantIds + empty assistantNames → []', () => {
      expect(resolveAssistantNames({ assistantIds: [], assistantNames: [] }, new Map())).toEqual([]);
    });
  });

  describe('A4 — buildDoctorMap', () => {
    it('A4.1 builds Map from array', () => {
      const m = buildDoctorMap([
        { id: '1', name: 'Dr. A' },
        { id: 2, name: 'Dr. B' },  // numeric id coerced
      ]);
      expect(m.get('1')).toEqual({ id: '1', name: 'Dr. A' });
      expect(m.get('2')).toEqual({ id: '2', name: 'Dr. B' });
    });

    it('A4.2 trims doctor name', () => {
      const m = buildDoctorMap([{ id: '1', name: '  Dr. A  ' }]);
      expect(m.get('1').name).toBe('Dr. A');
    });

    it('A4.3 returns empty Map for non-array input', () => {
      expect(buildDoctorMap(null).size).toBe(0);
      expect(buildDoctorMap(undefined).size).toBe(0);
      expect(buildDoctorMap('foo').size).toBe(0);
    });

    it('A4.4 skips entries missing id', () => {
      const m = buildDoctorMap([
        { id: '1', name: 'Dr. A' },
        { name: 'no-id' },
        { id: null, name: 'null-id' },
      ]);
      expect(m.size).toBe(1);
    });
  });

  describe('A5 — AppointmentFormModal denorm at save', () => {
    it('A5.1 build payload includes assistantNames key', () => {
      expect(AppointmentFormModalSrc).toMatch(/assistantNames:\s*assistantNamesForSave/);
    });

    it('A5.2 assistantNamesForSave is built from doctors list lookup', () => {
      expect(AppointmentFormModalSrc).toMatch(/assistantNamesForSave\s*=\s*assistantIdsForSave[\s\S]{0,300}doctors\.find/);
    });

    it('A5.3 picker has NO position filter (drops assistantsByPosition)', () => {
      // The new useMemo returns the full doctors array
      expect(AppointmentFormModalSrc).toMatch(/const\s+assistants\s*=\s*useMemo\(\(\)\s*=>\s*doctors,\s*\[doctors\]\)/);
      // And the old position filter is GONE
      expect(AppointmentFormModalSrc).not.toMatch(/doctors\.filter\(\(d\)\s*=>\s*String\(d\?\.position\s*\|\|\s*''\)\.trim\(\)\s*===\s*'ผู้ช่วยแพทย์'\)/);
    });

    it('A5.4 max-5 GATE-COUNT preserved (slice(0, 5) on add)', () => {
      expect(AppointmentFormModalSrc).toMatch(/\.slice\(0,\s*5\)/);
    });
  });

  describe('A6 — DepositPanel denorm at save', () => {
    it('A6.1 createBackendAppointment payload includes assistantNames', () => {
      expect(DepositPanelSrc).toMatch(/assistantNames:\s*\(apptAssistantIds\s*\|\|\s*\[\]\)/);
    });

    it('A6.2 max-5 GATE-COUNT preserved', () => {
      expect(DepositPanelSrc).toMatch(/\.slice\(0,\s*5\)/);
    });
  });

  describe('A7 — AppointmentTab renders assistants', () => {
    it('A7.1 imports resolveAssistantNames + buildDoctorMap', () => {
      expect(AppointmentTabSrc).toMatch(/resolveAssistantNames[\s\S]{0,200}from\s+['"]\.\.\/\.\.\/lib\/appointmentDisplay/);
      expect(AppointmentTabSrc).toMatch(/buildDoctorMap/);
    });

    it('A7.2 builds doctorMap from doctors state', () => {
      expect(AppointmentTabSrc).toMatch(/const\s+doctorMap\s*=\s*useMemo\(\s*\(\)\s*=>\s*buildDoctorMap\(doctors\)/);
    });

    it('A7.3 invokes resolveAssistantNames inside time-grid render', () => {
      expect(AppointmentTabSrc).toMatch(/resolveAssistantNames\(\s*appt\s*,\s*doctorMap\s*\)/);
    });

    it('A7.4 renders assistants with data-testid="appt-assistants"', () => {
      expect(AppointmentTabSrc).toMatch(/data-testid="appt-assistants"/);
    });
  });

  describe('A8 — CustomerDetailView renders assistants', () => {
    it('A8.1 imports resolveAssistantNames + buildDoctorMap', () => {
      expect(CustomerDetailViewSrc).toMatch(/resolveAssistantNames/);
      expect(CustomerDetailViewSrc).toMatch(/buildDoctorMap/);
    });

    it('A8.2 imports listDoctors', () => {
      expect(CustomerDetailViewSrc).toMatch(/listDoctors/);
    });

    it('A8.3 AppointmentCard accepts doctorMap prop', () => {
      expect(CustomerDetailViewSrc).toMatch(/function\s+AppointmentCard\(\{[^}]*doctorMap[^}]*\}/);
    });

    it('A8.4 AppointmentCard calls resolveAssistantNames', () => {
      expect(CustomerDetailViewSrc).toMatch(/resolveAssistantNames\(\s*appt\s*,\s*doctorMap\s*\)/);
    });

    it('A8.5 AppointmentCard renders assistants with data-testid="customer-appt-assistants"', () => {
      expect(CustomerDetailViewSrc).toMatch(/data-testid="customer-appt-assistants"/);
    });

    it('A8.6 doctorMap threaded to AppointmentListModal call sites', () => {
      // both call sites (next-upcoming card + list modal) should pass doctorMap
      const cardCalls = CustomerDetailViewSrc.match(/<AppointmentCard[\s\S]*?\/>/g) || [];
      expect(cardCalls.length).toBeGreaterThanOrEqual(2);
      for (const call of cardCalls) {
        expect(call).toMatch(/doctorMap=\{doctorMap\}/);
      }
    });
  });

  describe('A9 — appointmentReportAggregator prefers denorm', () => {
    it('A9.1 deriveAssistantNames checks assistantNames before assistantIds', () => {
      expect(ReportAggSrc).toMatch(/Array\.isArray\(\s*appt\?\.assistantNames\s*\)/);
    });

    it('A9.2 falls back to ID lookup for legacy', () => {
      expect(ReportAggSrc).toMatch(/staffIndex\.get/);
    });
  });

  describe('A10 — adversarial inputs', () => {
    it('A10.1 numeric assistantNames coerced to string', () => {
      const appt = { assistantNames: [1, 2] };
      expect(resolveAssistantNames(appt, null)).toEqual(['1', '2']);
    });

    it('A10.2 doctorMap entry missing name → skip', () => {
      const map = new Map([['1', { id: '1' }]]); // no name
      const appt = { assistantIds: ['1'] };
      expect(resolveAssistantNames(appt, map)).toEqual([]);
    });

    it('A10.3 doctorMap with .get throws → caught (no crash)', () => {
      // Map.get can't throw legitimately, but if someone passes a Proxy that throws
      // we still want graceful behavior. Testing the typeof check.
      const fakeMap = { get: undefined };
      const appt = { assistantIds: ['1'] };
      // get is undefined → falls to plain-object branch → returns ''
      expect(resolveAssistantNames(appt, fakeMap)).toEqual([]);
    });

    it('A10.4 assistantNames non-array → falls through to IDs', () => {
      const map = new Map([['1', { name: 'Dr. A' }]]);
      const appt = { assistantNames: 'not-array', assistantIds: ['1'] };
      expect(resolveAssistantNames(appt, map)).toEqual(['Dr. A']);
    });
  });
});
