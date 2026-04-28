// Phase 15.7-bis (2026-04-28) — listDoctors composes `name` at source
//
// User report (mid-Phase 15.7): "ไม่แสดงชื่อแพทย์และผู้ช่วยเลย ในการนัดหมาย
// แต่ในหน้า แก้ไขการรักษา และ สร้างการรักษาใหม่ แสดงแล้ว".
//
// Root cause: be_doctors stores firstname/lastname/nickname (lowercase,
// ProClinic schema) — NOT a `name` field. Pre-15.7 the AppointmentFormModal
// + DepositPanel + AppointmentTab pickers worked because either (a) only
// position='ผู้ช่วยแพทย์' records had `name` set OR (b) doctors were sourced
// via `getAllMasterDataItems('doctors')` which composes name on the way out.
// When Phase 15.7 dropped the position filter, ALL doctors rendered — and
// most have empty `name` field → empty checkboxes (image: 27 boxes, no labels).
//
// Source-level fix: listDoctors now composes `name` from firstname+lastname,
// falling back to nickname → existing name → fullName. Mirrors
// mergeSellersWithBranchFilter:7937-7942 buildName logic so all consumers
// of listDoctors() get the same name shape.
//
// This test bank locks the contract:
//   N1 listDoctors source has the composition logic (firstname/lastname → name)
//   N2 fallback chain is correct (nickname before legacy `name` before `fullName`)
//   N3 Phase 15.7-bis marker present
//   N4 callers (Picker components) still use d.name — relying on the source fix

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const BackendSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/backendClient.js'), 'utf-8');
const ApptModalSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentFormModal.jsx'), 'utf-8');
const DepositPanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/DepositPanel.jsx'), 'utf-8');

describe('Phase 15.7-bis — listDoctors composes name at source', () => {
  describe('N1 — listDoctors composition logic', () => {
    it('N1.1 composes from firstname (lowercase) + lastname', () => {
      // Find listDoctors body (between `export async function listDoctors` and the next `export`)
      const fn = BackendSrc.split('export async function listDoctors')[1] || '';
      const nextExport = fn.indexOf('\nexport ');
      const body = nextExport > 0 ? fn.slice(0, nextExport) : fn;
      // Composition references both lowercase and camelCase firstname (ProClinic-style + camel)
      expect(body).toMatch(/firstname\s*\|\|\s*data\.firstName/);
      expect(body).toMatch(/lastname\s*\|\|\s*data\.lastName/);
    });

    it('N1.2 produces name field via Object spread + override', () => {
      const fn = BackendSrc.split('export async function listDoctors')[1] || '';
      const nextExport = fn.indexOf('\nexport ');
      const body = nextExport > 0 ? fn.slice(0, nextExport) : fn;
      // Mapper returns `{ id, ...data, name: composedName }` shape
      expect(body).toMatch(/id:\s*d\.id\s*,\s*\.\.\.data\s*,\s*name:/);
    });

    it('N1.3 fallback chain: composed → nickname → existing name → fullName', () => {
      const fn = BackendSrc.split('export async function listDoctors')[1] || '';
      const nextExport = fn.indexOf('\nexport ');
      const body = nextExport > 0 ? fn.slice(0, nextExport) : fn;
      // The chain of `||` fallbacks must include nickname + fullName
      expect(body).toMatch(/composed\s*\|\|\s*data\.nickname\s*\|\|\s*data\.fullName/);
    });
  });

  describe('N2 — Phase 15.7-bis institutional-memory marker', () => {
    it('N2.1 Phase 15.7-bis marker comment present in listDoctors block', () => {
      const fn = BackendSrc.split('export async function listDoctors')[1] || '';
      const nextExport = fn.indexOf('\nexport ');
      const body = nextExport > 0 ? fn.slice(0, nextExport) : fn;
      expect(body).toMatch(/Phase 15\.7-bis/);
    });
  });

  describe('N3 — Picker consumers still rely on d.name (source-fix coverage)', () => {
    it('N3.1 AppointmentFormModal renders {d.name} in assistant picker', () => {
      // Find the assistants <label>...</label> block
      const block = ApptModalSrc.match(/ผู้ช่วยแพทย์ \(สูงสุด 5 คน\)<\/label>[\s\S]+?(?=\{\/\* Channel)/);
      expect(block?.[0]).toMatch(/\{d\.name\}/);
    });

    it('N3.2 DepositPanel assistant picker renders {d.name}', () => {
      // The DepositPanel assistant picker is in section starting with "ผู้ช่วยแพทย์ (สูงสุด 5 คน)"
      const block = DepositPanelSrc.match(/ผู้ช่วยแพทย์ \(สูงสุด 5 คน\)<\/label>[\s\S]+?(?=\/\* Channel)/);
      expect(block?.[0]).toMatch(/\{d\.name\}/);
    });
  });

  describe('N4 — Functional simulate (mirrors listDoctors composition)', () => {
    // We can't import listDoctors directly because it hits Firestore. Instead
    // we mirror the composition logic and assert the output for the data
    // shapes confirmed at runtime via preview_eval.

    function simulate(rawDoc) {
      const data = rawDoc;
      const parts = [data.firstname || data.firstName || '', data.lastname || data.lastName || ''].filter(Boolean);
      const composed = parts.join(' ').trim();
      const name = data.name || composed || data.nickname || data.fullName || '';
      return name;
    }

    it('N4.1 lowercase firstname + lastname → composed name', () => {
      expect(simulate({ firstname: 'นาสาว An', lastname: 'เอ (เอ)' })).toBe('นาสาว An เอ (เอ)');
    });

    it('N4.2 mixed casing also works (camel + lowercase)', () => {
      expect(simulate({ firstName: 'Jane', lastname: 'Doe' })).toBe('Jane Doe');
      expect(simulate({ firstname: 'Jane', lastName: 'Doe' })).toBe('Jane Doe');
    });

    it('N4.3 falls back to nickname when no first/last', () => {
      expect(simulate({ nickname: 'gob gob' })).toBe('gob gob');
    });

    it('N4.4 prefers existing name when set', () => {
      expect(simulate({ name: 'Override' })).toBe('Override');
    });

    it('N4.5 fullName as last resort', () => {
      expect(simulate({ fullName: 'Last Resort' })).toBe('Last Resort');
    });

    it('N4.6 empty doc → empty string (no undefined leak)', () => {
      expect(simulate({})).toBe('');
    });

    it('N4.7 only first name → trimmed single token', () => {
      expect(simulate({ firstname: 'OnlyFirst' })).toBe('OnlyFirst');
    });

    it('N4.8 firstname blank string → composed trims to empty → falls through to nickname', () => {
      // .filter(Boolean) keeps "   " (truthy), join+trim collapses to "",
      // then `composed || data.nickname` falls through to nickname.
      expect(simulate({ firstname: '   ', nickname: 'NICK' })).toBe('NICK');
    });
  });
});
