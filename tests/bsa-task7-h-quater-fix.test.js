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
    const out = execSync(
      'git grep -lE "getAllMasterDataItems\\(" -- "src/**" 2>/dev/null || true',
      { encoding: 'utf8', cwd: process.cwd() }
    ).split('\n').filter(Boolean);
    const violations = out.filter((f) => {
      // Allowed: MasterDataTab (sanctioned dev-only sync UI)
      if (f.endsWith('MasterDataTab.jsx')) return false;
      // Allowed: backendClient.js DEFINES the function (not a call site)
      if (f.endsWith('backendClient.js')) return false;
      // Allowed: scopedDataLayer.js re-exports the function (not a call site)
      if (f.endsWith('scopedDataLayer.js')) return false;
      return true;
    });
    expect(violations, `H-quater violations: ${violations.join(', ')}`).toEqual([]);
  });
});
