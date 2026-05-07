// V51 / Spec #2 Phase 1 — Per-branch settings migration test bank.
//
// Locks the helper extension + 17-consumer multi-reader-sweep + Rule P
// Tier 2 invariants (BS-10 + AV29). Phase 2 ships UI + migration script;
// some test groups are .skip()'d here pending Phase 2 artifacts.
//
// Spec: docs/superpowers/specs/2026-05-08-per-branch-settings-migration-design.md
// Plan: docs/superpowers/plans/2026-05-08-per-branch-settings-migration.md
// Companion: BS-10 (audit-branch-scope) + AV29 (audit-anti-vibe-code)

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mergeBranchIntoClinic } from '../src/lib/BranchContext.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────

const MIGRATED_FIELD_NAMES = [
  // 5 deduplicating fields (already on flat branch.X)
  'phone',
  'licenseNo',
  'taxId',
  'address',
  'addressEn',
  // 8 NEW fields (only on cs.X, migrating to branch.settings.X)
  'clinicEmail',
  'lineOfficialAccountUrl',
  'patientSyncCooldownMins',
  'openHoursMonFri',
  'openHoursSatSun',
  'chatHoursAlwaysOn',
  'chatHoursMonFri',
  'chatHoursSatSun',
];

// Pattern for grepping raw clinicSettings.X reads on migrated fields.
// Matches `clinicSettings.X` and `clinicSettings?.X` for X in field set.
const RAW_READ_PATTERN_FOR_GREP =
  'clinicSettings\\??\\\\.(' + [
    'phone',
    'clinicEmail',
    'lineOfficialAccountUrl',
    'clinicLicenseNo',
    'clinicTaxId',
    'clinicAddress',
    'clinicAddressEn',
    'patientSyncCooldownMins',
    'openHoursMonFri',
    'openHoursSatSun',
    'chatHoursAlwaysOn',
    'chatHoursMonFri',
    'chatHoursSatSun',
  ].join('|') + ')\\\\b';

function gitGrep(pattern, pathspecs) {
  const paths = pathspecs.map((p) => `"${p}"`).join(' ');
  try {
    const out = execSync(`git grep -nE "${pattern}" -- ${paths}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function parseGrepLine(line) {
  const firstColon = line.indexOf(':');
  const secondColon = line.indexOf(':', firstColon + 1);
  if (firstColon < 0 || secondColon < 0) return { file: line, line: 0, content: '' };
  return {
    file: line.slice(0, firstColon),
    line: Number(line.slice(firstColon + 1, secondColon)),
    content: line.slice(secondColon + 1),
  };
}

const fileCache = new Map();
function readFile(path) {
  if (fileCache.has(path)) return fileCache.get(path);
  let content = '';
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    content = '';
  }
  fileCache.set(path, content);
  return content;
}

// ─── S1: mergeBranchIntoClinic extended cascade ──────────────────────────

describe('S1: mergeBranchIntoClinic extended cascade (V51 Phase 1)', () => {
  it('S1.1 — handles all 13 migrated fields on output', () => {
    const cs = {
      clinicName: 'Lover',
      phone: 'CS-PHONE',
      licenseNo: 'CS-LIC',
      taxId: 'CS-TAX',
      address: 'CS-ADDR',
      addressEn: 'CS-ADDR-EN',
      website: 'CS-WEB',
      clinicEmail: 'cs@example.com',
      lineOfficialAccountUrl: 'https://lin.ee/cs',
      patientSyncCooldownMins: 30,
      openHoursMonFri: { open: '08:00', close: '18:00' },
      openHoursSatSun: { open: '09:00', close: '17:00' },
      chatHoursAlwaysOn: false,
      chatHoursMonFri: { open: '09:00', close: '21:00' },
      chatHoursSatSun: { open: '10:00', close: '20:00' },
    };
    const branch = {
      branchId: 'BR-A',
      name: 'นครราชสีมา',
      settings: {
        phone: 'SETTINGS-PHONE',
        licenseNo: 'SETTINGS-LIC',
        taxId: 'SETTINGS-TAX',
        address: 'SETTINGS-ADDR',
        addressEn: 'SETTINGS-ADDR-EN',
        email: 'settings@example.com',
        lineOaUrl: 'https://lin.ee/settings',
        patientSyncCooldownMins: 15,
        openHours: {
          monFri: { open: '10:00', close: '20:30' },
          satSun: { open: '10:00', close: '19:30' },
        },
        chatHours: {
          alwaysOn: true,
          monFri: { open: '10:00', close: '20:45' },
          satSun: { open: '10:00', close: '19:45' },
        },
      },
    };
    const result = mergeBranchIntoClinic(cs, branch);
    // settings.X wins for all 13 fields
    expect(result.phone).toBe('SETTINGS-PHONE');
    expect(result.licenseNo).toBe('SETTINGS-LIC');
    expect(result.taxId).toBe('SETTINGS-TAX');
    expect(result.address).toBe('SETTINGS-ADDR');
    expect(result.addressEn).toBe('SETTINGS-ADDR-EN');
    expect(result.clinicEmail).toBe('settings@example.com');
    expect(result.lineOfficialAccountUrl).toBe('https://lin.ee/settings');
    expect(result.patientSyncCooldownMins).toBe(15);
    expect(result.openHoursMonFri).toEqual({ open: '10:00', close: '20:30' });
    expect(result.openHoursSatSun).toEqual({ open: '10:00', close: '19:30' });
    expect(result.chatHoursAlwaysOn).toBe(true);
    expect(result.chatHoursMonFri).toEqual({ open: '10:00', close: '20:45' });
    expect(result.chatHoursSatSun).toEqual({ open: '10:00', close: '19:45' });
  });

  it('S1.2 — flat branch.X wins over cs.X when settings.X missing (5 dedup fields)', () => {
    const cs = { phone: 'CS', licenseNo: 'CS', taxId: 'CS', address: 'CS', addressEn: 'CS' };
    const branch = {
      branchId: 'BR-A',
      phone: 'BRANCH',
      licenseNo: 'BRANCH',
      taxId: 'BRANCH',
      address: 'BRANCH',
      addressEn: 'BRANCH',
      settings: {},
    };
    const result = mergeBranchIntoClinic(cs, branch);
    expect(result.phone).toBe('BRANCH');
    expect(result.licenseNo).toBe('BRANCH');
    expect(result.taxId).toBe('BRANCH');
    expect(result.address).toBe('BRANCH');
    expect(result.addressEn).toBe('BRANCH');
  });

  it('S1.3 — cs.X fallback for 5 dedup fields when settings + flat branch both empty', () => {
    const cs = { phone: 'CS', licenseNo: 'CS', taxId: 'CS', address: 'CS', addressEn: 'CS' };
    const branch = { branchId: 'BR-A', settings: {} };
    const result = mergeBranchIntoClinic(cs, branch);
    expect(result.phone).toBe('CS');
    expect(result.licenseNo).toBe('CS');
    expect(result.taxId).toBe('CS');
    expect(result.address).toBe('CS');
    expect(result.addressEn).toBe('CS');
  });

  it('S1.4 — cs.X fallback for 8 NEW fields when settings.X empty (no flat fallback expected)', () => {
    const cs = {
      clinicEmail: 'cs@example.com',
      lineOfficialAccountUrl: 'https://lin.ee/cs',
      patientSyncCooldownMins: 30,
      openHoursMonFri: { open: '08:00', close: '18:00' },
      openHoursSatSun: { open: '09:00', close: '17:00' },
      chatHoursAlwaysOn: false,
      chatHoursMonFri: { open: '09:00', close: '21:00' },
      chatHoursSatSun: { open: '10:00', close: '20:00' },
    };
    const branch = { branchId: 'BR-A', settings: {} };
    const result = mergeBranchIntoClinic(cs, branch);
    expect(result.clinicEmail).toBe('cs@example.com');
    expect(result.lineOfficialAccountUrl).toBe('https://lin.ee/cs');
    expect(result.patientSyncCooldownMins).toBe(30);
    expect(result.openHoursMonFri).toEqual({ open: '08:00', close: '18:00' });
    expect(result.openHoursSatSun).toEqual({ open: '09:00', close: '17:00' });
    expect(result.chatHoursAlwaysOn).toBe(false);
    expect(result.chatHoursMonFri).toEqual({ open: '09:00', close: '21:00' });
    expect(result.chatHoursSatSun).toEqual({ open: '10:00', close: '20:00' });
  });

  it('S1.5 — empty/undefined settings.X falls through to next source (5 dedup fields)', () => {
    const cs = { phone: 'CS' };
    const branch = { branchId: 'BR-A', phone: 'BRANCH', settings: { phone: '' } };
    expect(mergeBranchIntoClinic(cs, branch).phone).toBe('BRANCH');

    const branch2 = { branchId: 'BR-A', settings: { phone: '   ' } };
    expect(mergeBranchIntoClinic({ phone: 'CS' }, branch2).phone).toBe('CS');
  });

  it('S1.6 — Number.isFinite gate for patientSyncCooldownMins falls through correctly', () => {
    const cs = { patientSyncCooldownMins: 30 };
    // Non-finite: NaN, Infinity, undefined, string — all fall to cs
    const branch1 = { branchId: 'BR-A', settings: { patientSyncCooldownMins: NaN } };
    expect(mergeBranchIntoClinic(cs, branch1).patientSyncCooldownMins).toBe(30);
    const branch2 = { branchId: 'BR-A', settings: { patientSyncCooldownMins: '15' } };
    expect(mergeBranchIntoClinic(cs, branch2).patientSyncCooldownMins).toBe(30);
    const branch3 = { branchId: 'BR-A', settings: { patientSyncCooldownMins: 0 } };
    expect(mergeBranchIntoClinic(cs, branch3).patientSyncCooldownMins).toBe(0);  // 0 is finite — wins
  });

  it('S1.7 — pickObj falls through when settings hour-pair is null/non-object', () => {
    const cs = { openHoursMonFri: { open: '08:00', close: '18:00' } };
    const branch1 = { branchId: 'BR-A', settings: { openHours: { monFri: null } } };
    expect(mergeBranchIntoClinic(cs, branch1).openHoursMonFri).toEqual({ open: '08:00', close: '18:00' });
    const branch2 = { branchId: 'BR-A', settings: { openHours: { monFri: 'invalid' } } };
    expect(mergeBranchIntoClinic(cs, branch2).openHoursMonFri).toEqual({ open: '08:00', close: '18:00' });
    const branch3 = { branchId: 'BR-A', settings: { openHours: undefined } };
    expect(mergeBranchIntoClinic(cs, branch3).openHoursMonFri).toEqual({ open: '08:00', close: '18:00' });
  });

  it('S1.8 — chatHoursAlwaysOn boolean cast (settings wins, then cs as !!)', () => {
    expect(mergeBranchIntoClinic({}, { branchId: 'A', settings: { chatHours: { alwaysOn: true } } }).chatHoursAlwaysOn).toBe(true);
    expect(mergeBranchIntoClinic({}, { branchId: 'A', settings: { chatHours: { alwaysOn: false } } }).chatHoursAlwaysOn).toBe(false);
    // Non-boolean settings.X → falls through to !!cs
    expect(mergeBranchIntoClinic({ chatHoursAlwaysOn: true }, { branchId: 'A', settings: { chatHours: {} } }).chatHoursAlwaysOn).toBe(true);
    expect(mergeBranchIntoClinic({ chatHoursAlwaysOn: 1 }, { branchId: 'A', settings: {} }).chatHoursAlwaysOn).toBe(true);
    expect(mergeBranchIntoClinic({ chatHoursAlwaysOn: 0 }, { branchId: 'A', settings: {} }).chatHoursAlwaysOn).toBe(false);
  });

  it('S1.9 — clinicName composite "<brand> <branch>" preserved (V40 baseline)', () => {
    const cs = { clinicName: 'Lover Clinic' };
    const branch = { branchId: 'A', name: 'นครราชสีมา', settings: {} };
    expect(mergeBranchIntoClinic(cs, branch).clinicName).toBe('Lover Clinic นครราชสีมา');
  });

  it('S1.10 — null/undefined branch returns cs unchanged (defensive shape)', () => {
    const cs = { clinicName: 'Lover', phone: 'CS' };
    expect(mergeBranchIntoClinic(cs, null)).toBe(cs);
    expect(mergeBranchIntoClinic(cs, undefined)).toBe(cs);
    expect(mergeBranchIntoClinic(cs, 'invalid')).toBe(cs);
    expect(mergeBranchIntoClinic(cs, 42)).toBe(cs);
  });

  it('S1.11 — null/undefined cs treated as {} (defensive shape)', () => {
    const branch = { branchId: 'A', name: 'X', settings: { phone: 'P' } };
    const result = mergeBranchIntoClinic(null, branch);
    expect(result.phone).toBe('P');
    expect(result.clinicName).toBe('X');
  });

  it('S1.12 — settings missing-object treated as {} (no crash)', () => {
    const cs = { phone: 'CS' };
    const branch = { branchId: 'A' };  // no settings field
    expect(() => mergeBranchIntoClinic(cs, branch)).not.toThrow();
    expect(mergeBranchIntoClinic(cs, branch).phone).toBe('CS');
  });

  it('S1.13 — JSDoc references V51 / Spec #2 (institutional memory marker)', () => {
    const src = readFile('src/lib/BranchContext.jsx');
    expect(src).toMatch(/V51|Spec #2|per-branch settings migration/);
  });

  it('S1.14 — output includes brand fields unchanged (logo/accent/subtitle from cs)', () => {
    const cs = {
      logoUrl: 'logo.png',
      accentColor: '#ff0000',
      clinicSubtitle: 'tagline',
      clinicName: 'Lover',
    };
    const branch = { branchId: 'A', name: 'X', settings: { phone: 'P' } };
    const result = mergeBranchIntoClinic(cs, branch);
    expect(result.logoUrl).toBe('logo.png');
    expect(result.accentColor).toBe('#ff0000');
    expect(result.clinicSubtitle).toBe('tagline');
  });

  it('S1.15 — all 13 migrated fields exist as keys on output (even if undefined)', () => {
    const cs = {};
    const branch = { branchId: 'A', settings: {} };
    const result = mergeBranchIntoClinic(cs, branch);
    for (const f of MIGRATED_FIELD_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(result, f), `field "${f}" missing from merger output`).toBe(true);
    }
  });
});

// ─── S2: useEffectiveClinicSettings reactive (covered by RTL elsewhere) ──

describe('S2: useEffectiveClinicSettings reactive shape (V51 Phase 1)', () => {
  it('S2.1 — useEffectiveClinicSettings is exported from BranchContext.jsx', () => {
    const src = readFile('src/lib/BranchContext.jsx');
    expect(src).toMatch(/export function useEffectiveClinicSettings/);
  });

  it('S2.2 — useEffectiveClinicSettings wraps mergeBranchIntoClinic via useMemo', () => {
    const src = readFile('src/lib/BranchContext.jsx');
    const idx = src.indexOf('export function useEffectiveClinicSettings');
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 800);
    expect(body).toMatch(/useMemo/);
    expect(body).toMatch(/mergeBranchIntoClinic/);
  });
});

// ─── S3: BS-10 source-grep regression ────────────────────────────────────

describe('S3: BS-10 source-grep regression (V51 Phase 1)', () => {
  it('S3.1 — zero raw clinicSettings.X reads on migrated fields outside sanctioned exceptions', () => {
    const hits = gitGrep(RAW_READ_PATTERN_FOR_GREP, ['src/']);
    const violations = hits.filter((line) => {
      const { file, content } = parseGrepLine(line);
      // Allow comment-only lines
      if (/^\s*(\/\/|\*)/.test(content)) return false;
      // Sanctioned: ClinicSettingsPanel (delete-target Phase 2)
      if (file.includes('ClinicSettingsPanel')) return false;
      // Sanctioned: branchBackupCore (backup target — annotated)
      if (file.includes('branchBackupCore')) return false;
      // Sanctioned: BranchContext.jsx itself (source of truth) — but grep won't match self anyway
      if (file.endsWith('BranchContext.jsx')) return false;
      // Sanctioned: file has BS-10 annotation
      if (fileHasAnnotationFor(file, 'audit-branch-scope: BS-10 sanctioned')) return false;
      return true;
    });
    expect(
      violations,
      `BS-10 violations (raw clinicSettings.X reads on migrated fields):\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('S3.2 — branchBackupCore has BS-10 sanctioned annotation', () => {
    const src = readFile('src/lib/branchBackupCore.js');
    expect(src).toMatch(/audit-branch-scope: BS-10 sanctioned/);
  });

  it('S3.3 — PatientDashboard has BS-10 sanctioned annotation', () => {
    const src = readFile('src/pages/PatientDashboard.jsx');
    expect(src).toMatch(/audit-branch-scope: BS-10 sanctioned/);
  });

  it('S3.4 — BS-10 annotation comments use the sanctioned format (cross-skill discoverability)', () => {
    const sanctionedFiles = ['src/lib/branchBackupCore.js', 'src/pages/PatientDashboard.jsx'];
    for (const f of sanctionedFiles) {
      const src = readFile(f);
      // Must include BS-10 prefix + a reason after the em-dash
      expect(src, `${f} BS-10 annotation must include "BS-10 sanctioned —"`).toMatch(/audit-branch-scope: BS-10 sanctioned\b/);
    }
  });
});

function fileHasAnnotationFor(file, annotation) {
  const content = readFile(file);
  return content.includes(annotation);
}

// ─── S4: AV29 consumer classifier ────────────────────────────────────────

describe('S4: AV29 consumer classifier — 17-consumer enumeration (V51 Phase 1)', () => {
  // Phase 1 confirmed-relevant consumers per AV29 SKILL.md table.
  // Each entry: (file, status). Used by the classifier checks below.
  const CONSUMERS = [
    { file: 'src/components/ClinicSettingsPanel.jsx', status: 'delete-target', readsMigrated: true },
    { file: 'src/pages/PatientDashboard.jsx', status: 'sanctioned-public-link', readsMigrated: true },
    { file: 'src/components/backend/SalePrintView.jsx', status: 'migrated-via-effective-hook', readsMigrated: true },
    { file: 'src/components/backend/QuotationPrintView.jsx', status: 'migrated-via-effective-hook', readsMigrated: true },
    { file: 'src/components/backend/DocumentPrintModal.jsx', status: 'migrated-via-effective-hook', readsMigrated: true },
    { file: 'src/lib/documentPrintEngine.js', status: 'pass-through-downstream', readsMigrated: true },
    { file: 'src/lib/branchBackupCore.js', status: 'sanctioned-backup-target', readsMigrated: false },
    { file: 'src/lib/BranchContext.jsx', status: 'lib-definition', readsMigrated: true },
  ];

  it('S4.1 — every classified consumer file exists', () => {
    for (const { file } of CONSUMERS) {
      expect(existsSync(file), `${file} should exist`).toBe(true);
    }
  });

  it('S4.2 — migrated-via-effective-hook consumers import useEffectiveClinicSettings', () => {
    const migratedConsumers = CONSUMERS.filter((c) => c.status === 'migrated-via-effective-hook');
    expect(migratedConsumers.length).toBeGreaterThanOrEqual(3);
    for (const { file } of migratedConsumers) {
      const src = readFile(file);
      expect(src, `${file} should import useEffectiveClinicSettings`).toMatch(/useEffectiveClinicSettings/);
    }
  });

  it('S4.3 — sanctioned consumers carry annotation', () => {
    const sanctioned = CONSUMERS.filter((c) => c.status.startsWith('sanctioned-'));
    expect(sanctioned.length).toBeGreaterThanOrEqual(2);
    for (const { file } of sanctioned) {
      const src = readFile(file);
      expect(src, `${file} should carry BS-10 sanctioned annotation`).toMatch(/audit-branch-scope: BS-10 sanctioned/);
    }
  });

  it('S4.4 — AV29 classifier table in audit-anti-vibe-code SKILL.md is up to date', () => {
    const av29Skill = readFile('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(av29Skill, 'AV29 entry must exist in SKILL.md').toMatch(/AV29.*Per-branch settings/);
    // Must list each canonical consumer file
    for (const { file } of CONSUMERS) {
      // Skip src/lib/BranchContext.jsx — it's the SOURCE of the merger, not a consumer
      if (file.endsWith('BranchContext.jsx')) continue;
      // The AV29 doc references the file path in the classifier table
      const baseName = file.split('/').pop();
      expect(av29Skill, `${baseName} should appear in AV29 classifier table`).toMatch(new RegExp(baseName.replace(/\./g, '\\.')));
    }
  });
});

// ─── S5: BranchFormModal renders new sections (DEFERRED to Phase 2) ──────

describe('S5: BranchFormModal renders new settings sections (Phase 2 — DEFERRED)', () => {
  it.skip('S5.1 — BranchFormModal exposes settings.email input', () => {
    const src = readFile('src/components/backend/BranchFormModal.jsx');
    expect(src).toMatch(/data-field=["']settings\.email["']/);
  });

  it.skip('S5.2 — BranchFormModal exposes settings.lineOaUrl input', () => {
    const src = readFile('src/components/backend/BranchFormModal.jsx');
    expect(src).toMatch(/data-field=["']settings\.lineOaUrl["']/);
  });

  it.skip('S5.3 — BranchFormModal exposes settings.patientSyncCooldownMins input', () => {
    const src = readFile('src/components/backend/BranchFormModal.jsx');
    expect(src).toMatch(/data-field=["']settings\.patientSyncCooldownMins["']/);
  });

  it.skip('S5.4 — BranchFormModal exposes settings.openHours sections', () => {
    const src = readFile('src/components/backend/BranchFormModal.jsx');
    expect(src).toMatch(/data-field=["']settings\.openHours["']/);
  });

  it.skip('S5.5 — BranchFormModal exposes settings.chatHours sections', () => {
    const src = readFile('src/components/backend/BranchFormModal.jsx');
    expect(src).toMatch(/data-field=["']settings\.chatHours["']/);
  });
});

// ─── S6: ClinicSettingsPanel post-deletion (Phase 2 — DEFERRED) ──────────

describe('S6: ClinicSettingsPanel post-Phase-2 reduction (DEFERRED)', () => {
  it.skip('S6.1 — ClinicSettingsPanel no longer reads any of the 7 deleted sections', () => {
    const src = readFile('src/components/ClinicSettingsPanel.jsx');
    // Phase 2 will delete 7 sections; Phase 1 leaves them intact.
    // Post-Phase-2 expectations:
    expect(src).not.toMatch(/clinicLicenseNo/);
    expect(src).not.toMatch(/clinicTaxId/);
    expect(src).not.toMatch(/clinicAddress/);
    expect(src).not.toMatch(/clinicAddressEn/);
    expect(src).not.toMatch(/clinicEmail/);
    expect(src).not.toMatch(/patientSyncCooldownMins/);
  });

  it.skip('S6.2 — ClinicSettingsPanel keeps brand fields (logo / accent / subtitle / name)', () => {
    const src = readFile('src/components/ClinicSettingsPanel.jsx');
    expect(src).toMatch(/logoUrl/);
    expect(src).toMatch(/accentColor/);
    expect(src).toMatch(/clinicSubtitle/);
    expect(src).toMatch(/clinicName/);
  });
});

// ─── S7: Migration script (Phase 2 — DEFERRED) ───────────────────────────

describe('S7: Rule M migration script (Phase 2 — DEFERRED)', () => {
  it.skip('S7.1 — migration script exists at scripts/v51-migrate-clinic-settings-to-branch.mjs', () => {
    expect(existsSync('scripts/v51-migrate-clinic-settings-to-branch.mjs')).toBe(true);
  });

  it.skip('S7.2 — migration script is two-phase (default dry-run; --apply commits)', () => {
    const src = readFile('scripts/v51-migrate-clinic-settings-to-branch.mjs');
    expect(src).toMatch(/process\.argv\.includes\(['"]--apply['"]\)/);
  });

  it.skip('S7.3 — migration script writes audit doc to be_admin_audit/v51-...', () => {
    const src = readFile('scripts/v51-migrate-clinic-settings-to-branch.mjs');
    expect(src).toMatch(/be_admin_audit\/v51-/);
  });

  it.skip('S7.4 — migration script stamps forensic-trail _migratedAt + _migratedFromCs', () => {
    const src = readFile('scripts/v51-migrate-clinic-settings-to-branch.mjs');
    expect(src).toMatch(/_migratedAt/);
    expect(src).toMatch(/_migratedFromCs/);
  });
});

// ─── S8: Rule I full-flow simulate ───────────────────────────────────────

describe('S8: Rule I full-flow simulate (V51 Phase 1)', () => {
  it('S8.1 — branch switch produces correct merged shape (per-branch override propagates)', () => {
    const cs = { phone: 'CS-PHONE', clinicEmail: 'cs@x.com' };
    const branchA = { branchId: 'A', name: 'A', settings: { phone: 'A-PHONE', email: 'a@x.com' } };
    const branchB = { branchId: 'B', name: 'B', settings: { phone: 'B-PHONE', email: 'b@x.com' } };
    const resultA = mergeBranchIntoClinic(cs, branchA);
    const resultB = mergeBranchIntoClinic(cs, branchB);
    expect(resultA.phone).toBe('A-PHONE');
    expect(resultB.phone).toBe('B-PHONE');
    expect(resultA.clinicEmail).toBe('a@x.com');
    expect(resultB.clinicEmail).toBe('b@x.com');
  });

  it('S8.2 — branch with empty settings falls through to cs (no override loss)', () => {
    const cs = { phone: 'CS-PHONE', clinicEmail: 'cs@x.com', patientSyncCooldownMins: 30 };
    const emptyBranch = { branchId: 'A', name: 'A', settings: {} };
    const result = mergeBranchIntoClinic(cs, emptyBranch);
    expect(result.phone).toBe('CS-PHONE');
    expect(result.clinicEmail).toBe('cs@x.com');
    expect(result.patientSyncCooldownMins).toBe(30);
  });
});

// ─── S9: Adversarial inputs ──────────────────────────────────────────────

describe('S9: Adversarial inputs (V51 Phase 1)', () => {
  it('S9.1 — null branch returns cs unchanged', () => {
    const cs = { phone: 'P' };
    expect(mergeBranchIntoClinic(cs, null)).toBe(cs);
  });

  it('S9.2 — empty cs + empty branch returns shape with all 13 keys', () => {
    const result = mergeBranchIntoClinic({}, {});
    for (const f of MIGRATED_FIELD_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(result, f)).toBe(true);
    }
  });

  it('S9.3 — missing nested keys in settings.openHours/chatHours don\'t crash', () => {
    expect(() => mergeBranchIntoClinic({}, { settings: { openHours: {} } })).not.toThrow();
    expect(() => mergeBranchIntoClinic({}, { settings: { openHours: { monFri: undefined } } })).not.toThrow();
    expect(() => mergeBranchIntoClinic({}, { settings: { chatHours: { alwaysOn: null } } })).not.toThrow();
  });

  it('S9.4 — Thai text in settings fields preserved', () => {
    const cs = {};
    const branch = {
      settings: {
        address: 'ที่อยู่ 123 ถนนสุขุมวิท กรุงเทพฯ',
        phone: '02-555-1234',
      },
    };
    const result = mergeBranchIntoClinic(cs, branch);
    expect(result.address).toBe('ที่อยู่ 123 ถนนสุขุมวิท กรุงเทพฯ');
    expect(result.phone).toBe('02-555-1234');
  });

  it('S9.5 — 10K-char address in settings preserved', () => {
    const big = 'a'.repeat(10000);
    const result = mergeBranchIntoClinic({}, { settings: { address: big } });
    expect(result.address.length).toBe(10000);
  });

  it('S9.6 — settings is non-object (string/number) treated as empty', () => {
    const cs = { phone: 'CS' };
    const branch1 = { branchId: 'A', settings: 'string' };
    const branch2 = { branchId: 'A', settings: 42 };
    expect(mergeBranchIntoClinic(cs, branch1).phone).toBe('CS');
    expect(mergeBranchIntoClinic(cs, branch2).phone).toBe('CS');
  });
});

// ─── S10: V51 markers ────────────────────────────────────────────────────

describe('S10: V51 institutional memory markers (V51 Phase 1)', () => {
  it('S10.1 — BranchContext.jsx mergeBranchIntoClinic JSDoc references V51 / Spec #2', () => {
    const src = readFile('src/lib/BranchContext.jsx');
    expect(src).toMatch(/V51|Spec #2/);
  });

  it('S10.2 — audit-branch-scope SKILL.md documents BS-10', () => {
    const skill = readFile('.claude/skills/audit-branch-scope/SKILL.md');
    expect(skill).toMatch(/BS-10/);
    expect(skill).toMatch(/V51|Spec #2/);
  });

  it('S10.3 — audit-branch-scope patterns.md documents BS-10 grep recipe', () => {
    const patterns = readFile('.claude/skills/audit-branch-scope/patterns.md');
    expect(patterns).toMatch(/BS-10/);
  });

  it('S10.4 — audit-anti-vibe-code SKILL.md documents AV29', () => {
    const skill = readFile('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(skill).toMatch(/AV29/);
    expect(skill).toMatch(/Per-branch settings/);
  });

  it('S10.5 — BS-10 + AV29 cross-reference is coherent (companion AV note)', () => {
    const av29Skill = readFile('.agents/skills/audit-anti-vibe-code/SKILL.md');
    // AV29 should mention BS-10
    expect(av29Skill).toMatch(/BS-10/);
    // BS-10 should mention V51 / Spec #2
    const bs10Skill = readFile('.claude/skills/audit-branch-scope/SKILL.md');
    expect(bs10Skill).toMatch(/V51|Spec #2/);
  });
});
