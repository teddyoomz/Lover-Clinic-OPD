import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

describe('Task 7 — H-quater fix: getAllMasterDataItems removed from feature code', () => {
  const FILES = [
    'src/components/TreatmentFormPage.jsx',
    'src/components/backend/SaleTab.jsx',
    'src/components/backend/AppointmentFormModal.jsx',
    'src/components/backend/CustomerDetailView.jsx',
  ];

  for (const f of FILES) {
    it(`T7.${f.split('/').pop()} does NOT call getAllMasterDataItems(`, () => {
      const src = readFileSync(f, 'utf8');
      // Comments referring to the legacy migration are OK; only the live invocation is forbidden.
      const lines = src.split('\n');
      const live = lines.filter((line) => {
        if (/^\s*\/\//.test(line)) return false; // line comment
        if (/^\s*\*/.test(line)) return false;   // block-comment continuation
        return /getAllMasterDataItems\s*\(/.test(line);
      });
      expect(live, `live getAllMasterDataItems calls in ${f}: ${live.join('\n')}`).toEqual([]);
    });

    it(`T7.${f.split('/').pop()} does NOT read master_data/* path strings`, () => {
      const src = readFileSync(f, 'utf8');
      const lines = src.split('\n');
      const live = lines.filter((line) => {
        if (/^\s*\/\//.test(line)) return false;
        if (/^\s*\*/.test(line)) return false;
        return /master_data\//.test(line);
      });
      expect(live, `live master_data/ string in ${f}: ${live.join('\n')}`).toEqual([]);
    });
  }

  it('T7.import-imports use scopedDataLayer be_* listers', () => {
    const tfp = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(tfp).toMatch(/listProducts/);
    expect(tfp).toMatch(/listCourses/);
    expect(tfp).toMatch(/listStaff/);
    expect(tfp).toMatch(/listDoctors/);
    expect(tfp).toMatch(/scopedDataLayer/);
  });

  it('T7.regression-guard MasterDataTab is the ONLY src file allowed to call getAllMasterDataItems', () => {
    let lines = [];
    try {
      lines = execSync(
        'git grep -nE "getAllMasterDataItems\\(" -- "src/**"',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: process.cwd() }
      ).split('\n').filter(Boolean);
    } catch {
      lines = [];
    }
    // Each line is `path:lineno:content`. Drop sanctioned files + comment-only
    // matches, then collapse to a unique violating-file list.
    const violatingFiles = new Set();
    for (const line of lines) {
      const firstColon = line.indexOf(':');
      const secondColon = line.indexOf(':', firstColon + 1);
      if (firstColon < 0 || secondColon < 0) continue;
      const file = line.slice(0, firstColon);
      const content = line.slice(secondColon + 1);
      // Allowed: MasterDataTab (sanctioned dev-only sync UI)
      if (file.endsWith('MasterDataTab.jsx')) continue;
      // Allowed: backendClient.js DEFINES the function (not a call site)
      if (file.endsWith('backendClient.js')) continue;
      // Allowed: scopedDataLayer.js re-exports the function (not a call site)
      if (file.endsWith('scopedDataLayer.js')) continue;
      // Comment-only matches (line + block comment continuation) are not real callers
      if (/^\s*\/\//.test(content) || /^\s*\*/.test(content)) continue;
      violatingFiles.add(file);
    }
    const violations = [...violatingFiles];
    expect(violations, `H-quater violations: ${violations.join(', ')}`).toEqual([]);
  });
});
