// tests/v77-ter-chat-active-v51-field-migration.test.js
// V77-ter (2026-05-16 EOD+1) — AdminDashboard isChatActive reads V51
// per-branch chat hours from cs.chatHours* fields (NOT old single-tenant
// cs.chatOpenTime/Close).
//
// Class-of-bug: V12 multi-reader-sweep + V51 per-branch settings
// migration gap. AV29-class. V51 BranchFormModal saves to
// be_branches.settings.chatHours.{alwaysOn, monFri, satSun}; merge produces
// cs.chatHours*; AdminDashboard isChatActive was still reading old field
// names → undefined → defaults to 10:00-19:00 → chime gated off after
// 19:00 even when admin configured 11:15-20:45.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('V77-ter — isChatActive reads V51 cs.chatHours* fields', () => {
  const src = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
  const block = src.match(/const isChatActive = useMemo\(\([\s\S]{0,2500}?\}, \[[^\]]+\]\);/m);

  it('CA1.1 — isChatActive block found in source', () => {
    expect(block).not.toBeNull();
  });

  it('CA1.2 — reads cs.chatHoursAlwaysOn (V51 per-branch alwaysOn)', () => {
    expect(block[0]).toMatch(/cs\.chatHoursAlwaysOn/);
  });

  it('CA1.3 — reads cs.chatHoursMonFri (V51 weekday hours)', () => {
    expect(block[0]).toMatch(/cs\.chatHoursMonFri/);
  });

  it('CA1.4 — reads cs.chatHoursSatSun (V51 weekend hours)', () => {
    expect(block[0]).toMatch(/cs\.chatHoursSatSun/);
  });

  it('CA1.5 — extracts .open from chatHoursMonFri/SatSun', () => {
    expect(block[0]).toMatch(/monFri\.open|chatHoursMonFri[\s\S]{0,80}?open/);
    expect(block[0]).toMatch(/satSun\.open|chatHoursSatSun[\s\S]{0,80}?open/);
  });

  it('CA1.6 — extracts .close from chatHoursMonFri/SatSun', () => {
    expect(block[0]).toMatch(/monFri\.close|chatHoursMonFri[\s\S]{0,80}?close/);
    expect(block[0]).toMatch(/satSun\.close|chatHoursSatSun[\s\S]{0,80}?close/);
  });

  it('CA1.7 — V51 fields appear in useMemo deps', () => {
    expect(block[0]).toMatch(/cs\.chatHoursAlwaysOn[\s\S]{0,200}cs\.chatHoursMonFri[\s\S]{0,200}cs\.chatHoursSatSun/);
  });

  it('CA1.8 — legacy fields kept as fallback (backward-compat)', () => {
    // Legacy cs.chatAlwaysOn / cs.chatOpenTime / cs.chatCloseTime preserved
    // as fallback chain — admin envs that haven't migrated still work.
    expect(block[0]).toMatch(/cs\.chatAlwaysOn/);
    expect(block[0]).toMatch(/cs\.chatOpenTime/);
    expect(block[0]).toMatch(/cs\.chatCloseTime/);
  });

  it('CA1.9 — V77-ter marker comment present near isChatActive block', () => {
    // Marker may live in the comment block ABOVE the const definition
    const window = src.match(/V77-ter[\s\S]{0,1500}const isChatActive/);
    expect(window).not.toBeNull();
  });

  it('CA1.10 — V12 multi-reader-sweep regression guard: NO bare cs.chatAlwaysOn check at start', () => {
    // The original buggy code was `if (cs.chatAlwaysOn) return true;`
    // The V77-ter fix coalesces V51 + legacy: cs.chatHoursAlwaysOn || cs.chatAlwaysOn
    // Anti-regression: ensure the if-return-true uses the V51 form
    expect(block[0]).toMatch(/if\s*\(\s*alwaysOn\s*\)\s*return\s+true/);
    expect(block[0]).not.toMatch(/^\s*if\s*\(\s*cs\.chatAlwaysOn\s*\)\s*return\s+true/m);
  });
});

describe('V77-ter — Pure helper isChatActive shape (extracted for testability)', () => {
  // The fix uses mergeBranchIntoClinic-produced fields. Verify the
  // BranchContext.jsx merger still emits cs.chatHoursAlwaysOn +
  // cs.chatHoursMonFri + cs.chatHoursSatSun so AdminDashboard's reader
  // contract is satisfied.
  const mergerSrc = fs.readFileSync('src/lib/BranchContext.jsx', 'utf8');

  it('CA2.1 — mergeBranchIntoClinic emits cs.chatHoursAlwaysOn', () => {
    expect(mergerSrc).toMatch(/chatHoursAlwaysOn:\s*/);
  });

  it('CA2.2 — mergeBranchIntoClinic emits cs.chatHoursMonFri', () => {
    expect(mergerSrc).toMatch(/chatHoursMonFri:\s*/);
  });

  it('CA2.3 — mergeBranchIntoClinic emits cs.chatHoursSatSun', () => {
    expect(mergerSrc).toMatch(/chatHoursSatSun:\s*/);
  });

  it('CA2.4 — sources from branch.settings.chatHours (V51 contract)', () => {
    expect(mergerSrc).toMatch(/settings\.chatHours/);
  });
});
