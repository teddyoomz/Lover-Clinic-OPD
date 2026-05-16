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
  // V77-fix3 (S-2 refactor, 2026-05-16 NIGHT): isChatActive's inline logic
  // moved to src/lib/chatHours.js (canonical helper) to prevent the same
  // V77-ter / V77-quater drift class from recurring across consumers. The
  // AdminDashboard useMemo now reads as one line: `useMemo(() =>
  // isChatHoursActiveNow(cs), [...deps]);`. The deps array still references
  // V51 + legacy field names so React re-runs on schema-relevant changes.
  // CA1.5/CA1.6/CA1.10 inline-block assertions moved to the
  // `chatHours.js implementation` block below.
  const block = src.match(/const isChatActive = useMemo\([\s\S]{0,400}?\]\);/m);

  it('CA1.1 — isChatActive block found in source', () => {
    expect(block).not.toBeNull();
  });

  it('CA1.2 — V77-fix3: delegates to shared isChatHoursActiveNow', () => {
    expect(block[0]).toMatch(/isChatHoursActiveNow\(cs\)/);
  });

  it('CA1.3 — cs.chatHoursMonFri kept in deps array (V51 weekday hours)', () => {
    expect(block[0]).toMatch(/cs\.chatHoursMonFri/);
  });

  it('CA1.4 — cs.chatHoursSatSun kept in deps array (V51 weekend hours)', () => {
    expect(block[0]).toMatch(/cs\.chatHoursSatSun/);
  });

  it('CA1.5 — cs.chatHoursAlwaysOn kept in deps array (V51 alwaysOn)', () => {
    expect(block[0]).toMatch(/cs\.chatHoursAlwaysOn/);
  });

  it('CA1.6 — V77-fix3 import: isChatHoursActiveNow from src/lib/chatHours.js', () => {
    expect(src).toMatch(/import\s*\{\s*isChatHoursActiveNow\s*\}\s*from\s*['"]\.\.\/lib\/chatHours\.js['"]/);
  });

  it('CA1.7 — V51 fields appear in useMemo deps in canonical order', () => {
    expect(block[0]).toMatch(/cs\.chatHoursAlwaysOn[\s\S]{0,200}cs\.chatHoursMonFri[\s\S]{0,200}cs\.chatHoursSatSun/);
  });

  it('CA1.8 — legacy fields kept as fallback deps (backward-compat)', () => {
    // Legacy cs.chatAlwaysOn / cs.chatOpenTime / cs.chatCloseTime preserved
    // as fallback chain — admin envs that haven't migrated still work.
    expect(block[0]).toMatch(/cs\.chatAlwaysOn/);
    expect(block[0]).toMatch(/cs\.chatOpenTime/);
    expect(block[0]).toMatch(/cs\.chatCloseTime/);
  });

  it('CA1.9 — V77-ter marker comment present near isChatActive block', () => {
    // Marker may live in the comment block ABOVE the const definition.
    // V77-fix3 (S-2): also accept V77-fix3 marker (S-2 extract reference).
    const window = src.match(/V77-(ter|fix3)[\s\S]{0,1500}const isChatActive/);
    expect(window).not.toBeNull();
  });

  it('CA1.10 — V12 multi-reader-sweep regression guard: NO inline bare-alwaysOn check', () => {
    // Pre-V77-ter buggy code was `if (cs.chatAlwaysOn) return true;` inline.
    // V77-ter coalesced to `cs.chatHoursAlwaysOn || cs.chatAlwaysOn` inline.
    // V77-fix3 (S-2) extracted to chatHours.js. Anti-regression: ensure the
    // inline AdminDashboard block does NOT re-inline the bare check (drift
    // back to pre-V77-ter shape).
    expect(block[0]).not.toMatch(/if\s*\(\s*cs\.chatAlwaysOn\s*\)\s*return\s+true/);
  });
});

describe('V77-fix3 — chatHours.js implementation (S-2 extracted)', () => {
  // V77-fix3 (2026-05-16 NIGHT): V77-ter inline logic moved here.
  // Previous CA1.5/CA1.6/CA1.10 (inline shape assertions) now check the
  // shared helper instead.
  const src = fs.readFileSync('src/lib/chatHours.js', 'utf8');

  it('CH1.1 — exports isWithinChatHours + isChatHoursActiveNow + resolveChatHoursForDate', () => {
    expect(src).toMatch(/export function isWithinChatHours/);
    expect(src).toMatch(/export function isChatHoursActiveNow/);
    expect(src).toMatch(/export function resolveChatHoursForDate/);
  });

  it('CH1.2 — extracts .open from chatHoursMonFri / chatHoursSatSun', () => {
    expect(src).toMatch(/monFri\.open/);
    expect(src).toMatch(/satSun\.open/);
  });

  it('CH1.3 — extracts .close from chatHoursMonFri / chatHoursSatSun', () => {
    expect(src).toMatch(/monFri\.close/);
    expect(src).toMatch(/satSun\.close/);
  });

  it('CH1.4 — alwaysOn coalesce V51 + legacy fallback', () => {
    expect(src).toMatch(/chatHoursAlwaysOn[\s\S]{0,200}chatAlwaysOn/);
    expect(src).toMatch(/if\s*\(\s*alwaysOn\s*\)\s*return\s+(\{|true)/);
  });

  it('CH1.5 — legacy fallback chain: chatOpenTime / chatCloseTime / weekend', () => {
    expect(src).toMatch(/chatOpenTime/);
    expect(src).toMatch(/chatCloseTime/);
    expect(src).toMatch(/chatOpenTimeWeekend/);
    expect(src).toMatch(/chatCloseTimeWeekend/);
  });

  it('CH1.6 — V77-fix3 P2-8 TZ fix: uses Intl.DateTimeFormat (not toLocaleString round-trip)', () => {
    expect(src).toMatch(/Intl\.DateTimeFormat\(['"]en-US['"],/);
    expect(src).toMatch(/timeZone:\s*['"]Asia\/Bangkok['"]/);
  });
});

describe('V77-fix3 — ChatPanel isWithinChatHours now imports from chatHours.js (S-2)', () => {
  const src = fs.readFileSync('src/components/ChatPanel.jsx', 'utf8');

  it('CP1.1 — imports isWithinChatHours from ../lib/chatHours.js', () => {
    expect(src).toMatch(/import\s*\{\s*isWithinChatHours\s*\}\s*from\s*['"]\.\.\/lib\/chatHours\.js['"]/);
  });

  it('CP1.2 — no local function isWithinChatHours definition remains', () => {
    expect(src).not.toMatch(/function isWithinChatHours\(/);
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
