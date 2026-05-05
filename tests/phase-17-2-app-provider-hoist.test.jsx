// ─── Phase 17.2 — App.jsx provider hoist tests ────────────────────────────
// Source-grep covering the hoist + structural guards. Full mount tests left
// to integration-level testing; this file covers the structural invariants.
//
// IMPLEMENTER NOTE (Batch 4): BackendDashboard.jsx has a Phase-17.2 comment
// explaining the hoist (e.g. "BranchProvider hoisted to App.jsx; this file
// no longer wraps with <BranchProvider>"). That mention is in a COMMENT,
// not LIVE code. AP1.3 + AP1.4 strip comments before asserting NO LIVE
// import / NO LIVE JSX wrap.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// Helper — strip line + block comments so structural assertions check
// LIVE code, not explanatory comment text.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('AP1 — BranchProvider structural placement', () => {
  it('AP1.1 App.jsx imports BranchProvider', () => {
    const content = fs.readFileSync('src/App.jsx', 'utf8');
    expect(content).toMatch(/import\s+\{[^}]*BranchProvider[^}]*\}\s+from\s+['"][^'"]+BranchContext/);
  });

  it('AP1.2 App.jsx wraps with <BranchProvider>', () => {
    const content = fs.readFileSync('src/App.jsx', 'utf8');
    expect(content).toMatch(/<BranchProvider>/);
    expect(content).toMatch(/<\/BranchProvider>/);
  });

  it('AP1.3 BackendDashboard NO duplicate BranchProvider import in LIVE code', () => {
    const content = fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/import.*BranchProvider/);
  });

  it('AP1.4 BackendDashboard NO duplicate BranchProvider JSX in LIVE code', () => {
    const content = fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/<BranchProvider/);
  });

  it('AP1.5 only ONE source has BranchProvider component (i.e. App.jsx)', () => {
    // This is a soft-check; counts unique LIVE consumers (strips comments).
    const appCode = stripComments(fs.readFileSync('src/App.jsx', 'utf8'));
    const backendCode = stripComments(fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf8'));
    const appHas = /<BranchProvider>/.test(appCode);
    const backendHas = /<BranchProvider/.test(backendCode);
    expect(appHas).toBe(true);
    expect(backendHas).toBe(false);
  });
});
