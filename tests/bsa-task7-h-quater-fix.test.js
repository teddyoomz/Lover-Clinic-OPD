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
    // 2026-06-14 — switched from `execSync('git grep …')` to a deterministic,
    // comment-aware Node-fs scan. The old grep matched the LITERAL text
    // `getAllMasterDataItems()` inside a // comment in TreatmentFormPage.jsx
    // (which documents the Task-7 REMOVAL) → a false positive that depended on
    // git-grep being on PATH + POSIX pathspec behaviour. We now strip comments
    // before matching a real call site.
    const { readdirSync, statSync } = require('node:fs');
    const path = require('node:path');
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const violations = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir)) {
        const full = path.join(dir, f);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(jsx?|tsx?)$/.test(f)) continue;
        const code = stripComments(readFileSync(full, 'utf8'));
        if (!/getAllMasterDataItems\s*\(/.test(code)) continue;
        const base = path.basename(full);
        // Allowed: MasterDataTab (dev-only sync UI) + backendClient.js (DEFINES
        // the fn) + scopedDataLayer.js (re-exports it). Anything else = H-quater.
        if (base === 'MasterDataTab.jsx' || base === 'backendClient.js' || base === 'scopedDataLayer.js') continue;
        violations.push(path.relative(process.cwd(), full));
      }
    };
    walk(path.resolve(process.cwd(), 'src'));
    expect(violations, `H-quater violations (live getAllMasterDataItems calls): ${violations.join(', ')}`).toEqual([]);
  });
});
