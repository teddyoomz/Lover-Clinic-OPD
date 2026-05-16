// V75 AV56 — whole-fleet backup integrity (source-grep regression).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('V75 AV56 — whole-fleet customer backup integrity', () => {
  it('AV56.1 — customer-backup-export.mjs has exportWholeFleet function', () => {
    const src = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
    expect(src).toMatch(/async function exportWholeFleet/);
  });

  it('AV56.2 — exportWholeFleet imports wholeFleetBackupCore helpers', () => {
    const src = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
    expect(src).toMatch(/buildWholeFleetManifest/);
    expect(src).toMatch(/computeWholeFleetManifestHash/);
    expect(src).toMatch(/wholeFleetBackupCore/);
  });

  it('AV56.3 — manifestHash computed via shared helper (NOT inline crypto)', () => {
    const src = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
    const start = src.indexOf('async function exportWholeFleet');
    const end = src.indexOf('async function main', start);
    const block = src.slice(start, end);
    expect(block).toMatch(/manifestHash\s*=\s*computeWholeFleetManifestHash/);
  });

  it('AV56.4 — per-customer fileHash + storageManifestHash surfaced from V74 exportSingleCustomer summary', () => {
    const src = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
    // exportSingleCustomer summary now includes both hashes
    expect(src).toMatch(/bodyHash:\s*backupFile\.meta\.bodyHash/);
    expect(src).toMatch(/storageManifestHash:\s*backupFile\.meta\.storageManifestHash/);
  });

  it('AV56.5 — userNote EXCLUDED from manifestHash seed (Q5b=Y precedent)', () => {
    // wholeFleetBackupCore.computeWholeFleetManifestHash already verified
    // in tests/v75-whole-fleet-backup-core.test.js WF1.4. This test
    // re-locks the helper-side guarantee.
    const src = fs.readFileSync('src/lib/wholeFleetBackupCore.js', 'utf8');
    const start = src.indexOf('function computeWholeFleetManifestHash');
    const end = src.indexOf('export function validateWholeFleetManifest');
    const fn = src.slice(start, end);
    expect(fn).not.toMatch(/manifest\.userNote/);
  });

  it('AV56.6 — per-customer failure isolated into failedCustomers[]', () => {
    const src = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
    const start = src.indexOf('async function exportWholeFleet');
    const end = src.indexOf('async function main', start);
    const block = src.slice(start, end);
    expect(block).toMatch(/failedCustomers/);
    expect(block).toMatch(/catch\s*\(.*\)\s*\{[\s\S]*?failedCustomers\.push/);
  });

  it('AV56.7 — audit doc emitted to be_admin_audit/whole-fleet-backup-export-*', () => {
    const src = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
    const start = src.indexOf('async function exportWholeFleet');
    const end = src.indexOf('async function main', start);
    const block = src.slice(start, end);
    expect(block).toMatch(/be_admin_audit/);
    expect(block).toMatch(/whole-fleet-backup-export/);
  });

  it('AV56.8 — AV56 entry present in audit-anti-vibe-code SKILL.md', () => {
    const skill = fs.readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(skill).toMatch(/^### AV56 — Whole-fleet customer backup integrity/m);
  });

  it('AV56.9 — V75 marker comment in customer-backup-export.mjs', () => {
    const src = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
    expect(src).toMatch(/V75 Item 2/);
  });
});
