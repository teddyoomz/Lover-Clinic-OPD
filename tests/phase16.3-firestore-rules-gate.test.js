// Phase 16.3 — firestore.rules gate source-grep guards.
//
// Q2-C: write to clinic_settings/system_config requires admin claim OR
// `perm_system_config_management` claim. Read: any clinic-staff.
//
// Q3-A: be_admin_audit gets a narrow CREATE exception for `system-config-*`
// doc-id prefix so the client-side saveSystemConfig writeBatch (system_config
// + audit doc) commits atomically. Other audit doc ids stay client-locked
// (read,write: if false from V35 Phase 15.6).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RULES = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf-8');

describe('Phase 16.3 RG.A — clinic_settings/system_config gate', () => {
  test('A.1 — explicit match for system_config doc (more specific than wildcard)', () => {
    expect(RULES).toMatch(/match \/clinic_settings\/system_config\s*\{/);
  });

  test('A.2 — read: isClinicStaff()', () => {
    expect(RULES).toMatch(/clinic_settings\/system_config[\s\S]{0,400}allow read:\s*if isClinicStaff\(\)/);
  });

  test('A.3 — Q2-C: write requires admin OR perm_system_config_management claim', () => {
    expect(RULES).toMatch(/clinic_settings\/system_config[\s\S]{0,800}allow write:[\s\S]{0,400}admin == true/);
    expect(RULES).toMatch(/clinic_settings\/system_config[\s\S]{0,800}perm_system_config_management/);
  });
});

describe('Phase 16.3 RG.B — be_admin_audit narrow exception', () => {
  test('B.1 — read: isClinicStaff() (was: false; opened so audit panel can render)', () => {
    expect(RULES).toMatch(/be_admin_audit[\s\S]{0,400}allow read:\s*if isClinicStaff\(\)/);
  });

  test('B.2 — Q3-A: create allowed for system-config-* prefix only', () => {
    expect(RULES).toMatch(/be_admin_audit[\s\S]{0,1500}allow create:[\s\S]{0,400}auditId\.matches\(['"]\^system-config-\.\*['"]\)/);
  });

  test('B.3 — admin OR perm_system_config_management can create audit doc', () => {
    expect(RULES).toMatch(/be_admin_audit[\s\S]{0,1500}admin == true/);
    expect(RULES).toMatch(/be_admin_audit[\s\S]{0,1500}perm_system_config_management/);
  });

  test('B.4 — update + delete locked (immutable audit ledger)', () => {
    expect(RULES).toMatch(/be_admin_audit[\s\S]{0,2000}allow update, delete:\s*if false/);
  });
});

describe('Phase 16.3 RG.C — anti-regression', () => {
  test('C.1 — clinic_settings/{settingId} wildcard rule still exists (preserves existing isClinicStaff write path)', () => {
    expect(RULES).toMatch(/match \/clinic_settings\/\{settingId\}\s*\{[\s\S]{0,200}allow write:\s*if isClinicStaff\(\)/);
  });

  test('C.2 — proclinic_session + proclinic_session_trial still open (cookie-relay extension write path)', () => {
    expect(RULES).toMatch(/match \/clinic_settings\/proclinic_session\s*\{[\s\S]{0,150}allow read, write:\s*if true/);
    expect(RULES).toMatch(/match \/clinic_settings\/proclinic_session_trial\s*\{[\s\S]{0,150}allow read, write:\s*if true/);
  });

  test('C.3 — isClinicStaff helper unchanged (V26 admin claim check)', () => {
    // Comment block + body together fit within ~1500 chars; widen window.
    expect(RULES).toMatch(/function isClinicStaff\(\)[\s\S]{0,1500}request\.auth\.token\.isClinicStaff == true[\s\S]{0,400}request\.auth\.token\.admin == true/);
  });

  test('C.4 — Phase 16.3 marker comment present', () => {
    expect(RULES).toMatch(/Phase 16\.3 \(2026-04-29\)/);
  });
});
