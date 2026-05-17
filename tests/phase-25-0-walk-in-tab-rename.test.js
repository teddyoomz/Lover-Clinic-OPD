// Phase 25.0b (2026-05-09) — Frontend tab rename "คิว" → "คิว Walk-IN".
// Phase 29.23-bis (2026-05-14) — Frontend tab rename "คิว Walk-IN" → "คิวหน้า Clinic".
// User: "Tab ที่ชื่อ คิว Walk-IN เปลี่ยนชื่อเป็น คิวหน้า Clinic".
//
// V21 fixup discipline: the prior contract "คิว Walk-IN" is now superseded.
// This test enforces the NEW post-29.23-bis label across both mobile + desktop
// tab definitions, and locks the OLD label as absent (regression guard).
//
// Source-grep regression guard: the AdminDashboard mobile + desktop tab
// for adminMode='dashboard' must read "คิวหน้า Clinic". The internal mode
// key (adminMode value) stays 'dashboard' — only the display label changes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf-8');

describe('Phase 25.0b → 29.23-bis — Frontend tab rename to คิวหน้า Clinic', () => {
  // Menu Variant A v2 (2026-05-18, Phase A) — JSX shape changed from
  // <tab-array.map()> to direct <button onClick={() => setAdminMode('X')}>
  // inline buttons. The {mode:'dashboard'} object pattern no longer exists.
  // Updated regex matches the NEW contract while preserving the V21 intent
  // (verify "คิวหน้า Clinic" label present + no legacy labels remaining).

  it('P25.0b-T1 desktop pill-tab label is "คิวหน้า Clinic"', () => {
    // Variant A v2 desktop tab: <button onClick={() => setAdminMode('dashboard')} ...>
    //   <Activity size={14}/> <span>คิวหน้า Clinic</span> ...
    expect(SRC).toMatch(/setAdminMode\('dashboard'\)[\s\S]{0,300}?<span>คิวหน้า Clinic<\/span>/);
  });

  it('P25.0b-T2 dashboard tab uses Activity icon', () => {
    // Verify the Activity icon paired with the คิวหน้า Clinic label.
    // Size argument no longer asserted (varies by viewport variant — desktop=14, dock=18).
    expect(SRC).toMatch(/<Activity size=\{\d+\}\s*\/>\s*<span>คิวหน้า Clinic<\/span>/);
  });

  it('P25.0b-T3 legacy bare "คิว" label NOT present in dashboard tab', () => {
    // Defensive: ensure the pre-25.0b "label: 'คิว'" object pattern is gone.
    expect(SRC).not.toMatch(/mode:\s*'dashboard'[\s\S]*?label:\s*'คิว',\s*badge:/);
  });

  it('P25.0b-T4 legacy "หน้าคิว" desktop label NOT present', () => {
    expect(SRC).not.toMatch(/<Activity[^>]*>\s*หน้าคิว/);
  });

  it('P25.0b-T5 internal mode key still "dashboard" (no breaking change)', () => {
    // setAdminMode('dashboard') is still the dispatch key on the dashboard tab.
    expect(SRC).toMatch(/setAdminMode\('dashboard'\)/);
  });

  it('P29.23-bis-T6 prior "คิว Walk-IN" label NOT present (V21 fixup lock)', () => {
    // Anti-regression — Walk-IN as a TAB label must not exist.
    expect(SRC).not.toMatch(/<Activity[^>]*>\s*คิว Walk-IN/);
    expect(SRC).not.toMatch(/<span>คิว Walk-IN<\/span>/);
    expect(SRC).not.toMatch(/mode:\s*'dashboard'[\s\S]*?label:\s*'คิว Walk-IN'/);
  });

  it('P-A-v2-T7 Variant A v2 mobile bottom dock has "คิว" short label for dashboard tab', () => {
    // Mobile dock uses shortened label "คิว" inside data-tab="dashboard" button.
    expect(SRC).toMatch(/data-tab="dashboard"[\s\S]{0,200}?<span>คิว<\/span>/);
  });
});
