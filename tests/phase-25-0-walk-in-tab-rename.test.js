// Phase 25.0b (2026-05-09) — Frontend tab rename "คิว" → "คิว Walk-IN".
// User: "เปลี่ยนชื่อ tab หน้าคิวของ Frontend เป็น คิว Walk-IN".
//
// Source-grep regression guard: the AdminDashboard mobile + desktop tab
// for adminMode='dashboard' must read "คิว Walk-IN", not the legacy "คิว"
// or "หน้าคิว". The internal mode key (adminMode value) stays 'dashboard'
// — only the display label changes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf-8');

describe('Phase 25.0b — Frontend tab rename to Walk-IN', () => {
  it('P25.0b-T1 mobile tab label is "คิว Walk-IN"', () => {
    // Mobile tab definition list at line ~5548
    // Non-greedy [\s\S]*? required because the line contains <Activity size={14} />
    // with literal `}` braces that would terminate a [^}]* class.
    expect(SRC).toMatch(/mode:\s*'dashboard'[\s\S]*?label:\s*'คิว Walk-IN'/);
  });

  it('P25.0b-T2 desktop button label is "คิว Walk-IN"', () => {
    // Desktop button at line ~5585
    expect(SRC).toMatch(/<Activity size=\{16\}\s*\/>\s*คิว Walk-IN/);
  });

  it('P25.0b-T3 legacy bare "คิว" label NOT present in mobile tab definition', () => {
    // Defensive: ensure the old "คิว" + "หน้าคิว" labels are not present
    // anymore on the dashboard mode. Other "คิว..." labels (deposit/no-deposit
    // history) remain — we only check the dashboard-mode block.
    // Bound non-greedy match by `, badge:` to stay within the mode='dashboard'
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
});
