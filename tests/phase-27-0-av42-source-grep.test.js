// tests/phase-27-0-av42-source-grep.test.js
//
// Phase 27.0 Task 7 (2026-05-14) — AV42 audit invariant
// Treatment doctor/assistant/branch display MUST live-resolve via
// treatmentDisplayResolvers helpers. Direct fallback chains like
// `detail.doctorName || detail.doctorId` or `a.name || a.id` are
// forbidden — they leak raw doc IDs into the UI when the denormalized
// cache is empty (e.g. doctor renamed/deleted post-save).
//
// Mirror of Rule O productName live-resolve pattern (V46/AV24).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir, results = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (
        e.name === 'node_modules' ||
        e.name === 'dist' ||
        e.name === '.git' ||
        e.name === 'graphify-out' ||
        e.name === '.agents' ||
        e.name === 'docs' ||
        e.name === '.claude' ||
        e.name === '.stryker-tmp' ||
        e.name === '.tmp_scan' ||
        e.name === 'tests' ||
        e.name === '.next' ||
        e.name === 'coverage' ||
        e.name === '.vercel'
      )
        continue;
      walk(p, results);
    } else if (/\.(js|jsx)$/.test(e.name)) {
      results.push(p);
    }
  }
  return results;
}

describe('AV42 — treatment display resolver discipline', () => {
  const files = walk(process.cwd());

  const SANCTIONED = new Set([
    'src/lib/treatmentDisplayResolvers.js',
    'src/components/backend/TreatmentReadOnlyMirror.jsx',
    'src/components/backend/TreatmentReadOnlyPanel.jsx',
    'src/components/backend/EditAttributionModal.jsx',
    'src/components/TreatmentFormPage.jsx',
    // AV42 sanctioned exception: clinicReportAggregator uses detail.doctorId || ''
    // as an internal KEY for building saleToDoctor Map — never displayed to users.
    // This is ID extraction for report keying, not a display fallback chain.
    'src/lib/clinicReportAggregator.js',
  ]);

  function relPath(f) {
    return f
      .replace(process.cwd() + '\\', '')
      .replace(process.cwd() + '/', '')
      .replace(/\\/g, '/');
  }

  it('AV42.1 no component outside sanctioned uses detail.doctorId || raw fallback', () => {
    const violators = files.filter((f) => {
      const rel = relPath(f);
      if (SANCTIONED.has(rel)) return false;
      const txt = readFileSync(f, 'utf-8');
      return (
        /detail\.doctorId\s*\|\|\s*['"]/.test(txt) ||
        /\|\|\s*doctorId\s*\|\|/.test(txt)
      );
    });
    expect(violators).toEqual([]);
  });

  it('AV42.2 no component outside sanctioned uses a.name || a.id pattern', () => {
    const violators = files.filter((f) => {
      const rel = relPath(f);
      if (SANCTIONED.has(rel)) return false;
      const txt = readFileSync(f, 'utf-8');
      return /a\.name\s*\|\|\s*a\.id/.test(txt);
    });
    expect(violators).toEqual([]);
  });

  it('AV42.3 resolver module exports all 4 canonical helpers', () => {
    const src = readFileSync('src/lib/treatmentDisplayResolvers.js', 'utf-8');
    expect(src).toMatch(/export function resolveDoctorDisplayName/);
    expect(src).toMatch(/export function resolveAssistantDisplayName/);
    expect(src).toMatch(/export function resolveBranchDisplayName/);
    expect(src).toMatch(/export function resolveAssistantsDisplay/);
  });

  it('AV42.4 sanctioned consumers actually import resolvers', () => {
    const mirror = readFileSync(
      'src/components/backend/TreatmentReadOnlyMirror.jsx',
      'utf-8'
    );
    const panel = readFileSync(
      'src/components/backend/TreatmentReadOnlyPanel.jsx',
      'utf-8'
    );
    expect(mirror).toMatch(/from.*treatmentDisplayResolvers/);
    expect(panel).toMatch(/from.*treatmentDisplayResolvers/);
  });
});
