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
  it('P25.0b-T1 mobile tab label is "คิวหน้า Clinic"', () => {
    // Mobile tab definition list at line ~5594 (post-29.23-bis).
    // Non-greedy [\s\S]*? required because the line contains <Activity size={14} />
    // with literal `}` braces that would terminate a [^}]* class.
    expect(SRC).toMatch(/mode:\s*'dashboard'[\s\S]*?label:\s*'คิวหน้า Clinic'/);
  });

  it('P25.0b-T2 desktop button label is "คิวหน้า Clinic"', () => {
    // Desktop button at line ~5631 (post-29.23-bis).
    expect(SRC).toMatch(/<Activity size=\{16\}\s*\/>\s*คิวหน้า Clinic/);
  });

  it('P25.0b-T3 legacy bare "คิว" label NOT present in mobile tab definition', () => {
    // Defensive: ensure the older "คิว" + "หน้าคิว" labels (pre-25.0b) are
    // not present anymore on the dashboard mode. Other "คิว..." labels
    // (deposit/no-deposit history) remain — we only check the dashboard
    // tab definition block.
    expect(SRC).not.toMatch(/mode:\s*'dashboard'[\s\S]*?label:\s*'คิว',\s*badge:/);
  });

  it('P25.0b-T4 legacy "หน้าคิว" desktop label NOT present', () => {
    expect(SRC).not.toMatch(/<Activity size=\{16\}\s*\/>\s*หน้าคิว/);
  });

  it('P25.0b-T5 internal mode key still "dashboard" (no breaking change)', () => {
    // The setAdminMode('dashboard') call must still exist (proves the
    // internal mode key wasn't renamed alongside the display label).
    expect(SRC).toMatch(/setAdminMode\('dashboard'\)/);
  });

  it('P29.23-bis-T6 prior "คิว Walk-IN" label NOT present (V21 fixup lock)', () => {
    // Anti-regression for the 25.0b → 29.23-bis rename. The "Walk-IN"
    // ENGLISH appointment channel name still exists elsewhere (line 2401,
    // 2413 customer source dropdowns + 8573 toast); those are separate
    // concepts (channel) and stay as "Walk-in" English. This guard
    // narrowly checks the tab-label sites only.
    expect(SRC).not.toMatch(/<Activity size=\{16\}\s*\/>\s*คิว Walk-IN/);
    expect(SRC).not.toMatch(/mode:\s*'dashboard'[\s\S]*?label:\s*'คิว Walk-IN'/);
  });
});
