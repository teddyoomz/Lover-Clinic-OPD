// ─── Staff/Doctor branch-count live-resolve (2026-06-10) ─────────────────────
// User report: system has 3 branches (be_branches) but StaffTab showed
// "สาขา: 4 สาขา" for OoMz + Mild. Root cause (diag-staff-branch-count.mjs on
// real prod): both staff docs carried an ORPHAN branchId
// `TEST-V81-TS-BR-1778958484080` (a V81 test-fixture branch whose be_branches
// doc was deleted) AND StaffTab.jsx/DoctorsTab.jsx rendered the RAW
// `branchIds.length` without resolving against live be_branches.
//
// Class-of-bug: display-layer renders a stored FK array count without
// live-resolve (V47/AV25 family — "data stored, display ignores the live
// referenced collection"). Branch deletion does NOT cascade-clean
// staff.branchIds (Rule H soft-keep), so the DISPLAY must tolerate orphans.
//
// Fix: countLiveBranchMemberships(branchIds, branches) in branchScopeUtils.js
// — count = unique branchIds that resolve in the live branch list; raw-length
// fallback ONLY when the branch list is empty/not loaded (defensive for
// provider-absent mounts). AV193 locks the contract.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { countLiveBranchMemberships } from '../src/lib/branchScopeUtils.js';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');

// Live branches as the BranchProvider exposes them ({...data, id: docId};
// some legacy docs also carry a `branchId` field — both shapes must resolve).
const LIVE_BRANCHES = [
  { id: 'BR-1777873556815-26df6480', name: 'นครราชสีมา' },
  { id: 'BR-1777885958735-38afbdeb', name: 'พระราม 3' },
  { id: 'BR-1778136097138-98199ef5', name: 'ทดลอง 1' },
];

describe('L1 — countLiveBranchMemberships unit', () => {
  it('L1.1 PROD REPRO: 3 live ids + 1 orphan TEST-V81 fixture id → 3 (not 4)', () => {
    const branchIds = [
      'BR-1777873556815-26df6480',
      'BR-1777885958735-38afbdeb',
      'TEST-V81-TS-BR-1778958484080', // orphan — branch doc deleted
      'BR-1778136097138-98199ef5',
    ];
    expect(countLiveBranchMemberships(branchIds, LIVE_BRANCHES)).toBe(3);
  });

  it('L1.2 all ids live → full count', () => {
    expect(countLiveBranchMemberships(
      ['BR-1777873556815-26df6480', 'BR-1777885958735-38afbdeb'], LIVE_BRANCHES,
    )).toBe(2);
  });

  it('L1.3 all ids orphan → 0 (display row hides)', () => {
    expect(countLiveBranchMemberships(['TEST-V81-TS-BR-1778958484080', 'BR-dead'], LIVE_BRANCHES)).toBe(0);
  });

  it('L1.4 empty / missing / non-array branchIds → 0', () => {
    expect(countLiveBranchMemberships([], LIVE_BRANCHES)).toBe(0);
    expect(countLiveBranchMemberships(null, LIVE_BRANCHES)).toBe(0);
    expect(countLiveBranchMemberships(undefined, LIVE_BRANCHES)).toBe(0);
    expect(countLiveBranchMemberships('BR-x', LIVE_BRANCHES)).toBe(0);
  });

  it('L1.5 branch list empty/not loaded → RAW unique-count fallback (defensive, provider-absent mounts)', () => {
    const ids = ['BR-a', 'BR-b', 'BR-b'];
    expect(countLiveBranchMemberships(ids, [])).toBe(2);
    expect(countLiveBranchMemberships(ids, null)).toBe(2);
    expect(countLiveBranchMemberships(ids, undefined)).toBe(2);
  });

  it('L1.6 duplicate ids dedup — never double-count a membership', () => {
    const ids = ['BR-1777873556815-26df6480', 'BR-1777873556815-26df6480', 'BR-1777885958735-38afbdeb'];
    expect(countLiveBranchMemberships(ids, LIVE_BRANCHES)).toBe(2);
  });

  it('L1.7 branch docs carrying `branchId` field (legacy shape) resolve too', () => {
    const branches = [{ branchId: 'BR-legacy-1', name: 'x' }, { id: 'BR-doc-2', name: 'y' }];
    expect(countLiveBranchMemberships(['BR-legacy-1', 'BR-doc-2', 'BR-dead'], branches)).toBe(2);
  });

  it('L1.8 adversarial: numeric ids String-coerced; null/empty entries ignored', () => {
    const branches = [{ id: '123' }, { id: 'BR-ok' }, null, { id: '' }];
    expect(countLiveBranchMemberships([123, 'BR-ok', null, '', undefined], branches)).toBe(2);
  });
});

describe('G — source-grep: tabs render LIVE count, not raw length', () => {
  const staffSrc = read('src/components/backend/StaffTab.jsx');
  const doctorsSrc = read('src/components/backend/DoctorsTab.jsx');

  it('G1 StaffTab imports + calls countLiveBranchMemberships + useSelectedBranch', () => {
    expect(staffSrc).toMatch(/import\s*\{[^}]*countLiveBranchMemberships[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/branchScopeUtils\.js'/);
    expect(staffSrc).toMatch(/useSelectedBranch/);
    expect(staffSrc).toMatch(/countLiveBranchMemberships\(\s*s\.branchIds\s*,/);
  });

  it('G2 DoctorsTab imports + calls countLiveBranchMemberships + useSelectedBranch', () => {
    expect(doctorsSrc).toMatch(/import\s*\{[^}]*countLiveBranchMemberships[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/branchScopeUtils\.js'/);
    expect(doctorsSrc).toMatch(/useSelectedBranch/);
    expect(doctorsSrc).toMatch(/countLiveBranchMemberships\(\s*d\.branchIds\s*,/);
  });

  it('G3 ANTI-REGRESSION: no raw `branchIds.length} สาขา` render remains in either tab', () => {
    expect(staffSrc).not.toMatch(/branchIds\.length\}\s*สาขา/);
    expect(doctorsSrc).not.toMatch(/branchIds\.length\}\s*สาขา/);
  });
});

describe('M — Rule M cleanup script decideBranchIdsCleanup (pure decision helper)', () => {
  it('M1 strips the PROD orphan + keeps the 3 live ids in order', async () => {
    const { decideBranchIdsCleanup } = await import('../scripts/cleanup-orphan-staff-branchids.mjs');
    const live = LIVE_BRANCHES.map((b) => b.id);
    const r = decideBranchIdsCleanup(
      ['BR-1777873556815-26df6480', 'TEST-V81-TS-BR-1778958484080', 'BR-1777885958735-38afbdeb', 'BR-1778136097138-98199ef5'],
      live,
    );
    expect(r.keep).toEqual(['BR-1777873556815-26df6480', 'BR-1777885958735-38afbdeb', 'BR-1778136097138-98199ef5']);
    expect(r.removed).toEqual(['TEST-V81-TS-BR-1778958484080']);
    expect(r.changed).toBe(true);
  });

  it('M2 idempotent: clean input → changed=false, nothing removed', async () => {
    const { decideBranchIdsCleanup } = await import('../scripts/cleanup-orphan-staff-branchids.mjs');
    const live = LIVE_BRANCHES.map((b) => b.id);
    const r = decideBranchIdsCleanup(['BR-1777873556815-26df6480'], live);
    expect(r.changed).toBe(false);
    expect(r.keep).toEqual(['BR-1777873556815-26df6480']);
    expect(r.removed).toEqual([]);
  });

  it('M3 collapses duplicate live ids + strips empty/null entries', async () => {
    const { decideBranchIdsCleanup } = await import('../scripts/cleanup-orphan-staff-branchids.mjs');
    const r = decideBranchIdsCleanup(['BR-a', 'BR-a', '', null, 'BR-dead'], ['BR-a']);
    expect(r.keep).toEqual(['BR-a']);
    expect(r.removed.length).toBe(4);
    expect(r.changed).toBe(true);
  });
});

describe('C — AV193 classifier: display-count class instances project-wide', () => {
  // Every UI render of a branch-membership COUNT must go through
  // countLiveBranchMemberships. Membership CHECKS (isStaffAccessibleInBranch
  // / filterStaffByBranch / filterBranchesForStaff intersections) are
  // sanctioned — an orphan id can never satisfy a membership test against a
  // live id, so they are orphan-tolerant by construction.
  it('C1 no OTHER component renders `{X.branchIds.length} สาขา` (closed instance list: StaffTab + DoctorsTab, both fixed)', () => {
    // Recursive scan of src/components — the two fixed tabs already assert
    // helper usage in G1/G2; here we lock that no NEW raw-count render appears.
    const { readdirSync, statSync } = require('node:fs');
    const offenders = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir)) {
        const full = path.join(dir, f);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(jsx?|tsx?)$/.test(f)) continue;
        const src = readFileSync(full, 'utf8');
        if (/branchIds\.length\}\s*สาขา/.test(src)) offenders.push(full);
      }
    };
    walk(path.resolve(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});
