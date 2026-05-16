// tests/v75-fb-settings-nav-wire.test.js
// V75 Item 3 — fb-settings tab navigation + permissions + dashboard wire.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('V75 Item 3 — fb-settings tab nav wire', () => {
  it('I-V75.1 — navConfig.js has fb-settings entry under master section', () => {
    const src = fs.readFileSync('src/components/backend/nav/navConfig.js', 'utf8');
    expect(src).toMatch(/['"]fb-settings['"]/);
    // V75 marker comment must be present
    expect(src).toMatch(/V75 Item 3/);
  });

  it('I-V75.2 — tabPermissions.js TAB_PERMISSION_MAP has fb-settings: adminOnly:true', () => {
    const src = fs.readFileSync('src/lib/tabPermissions.js', 'utf8');
    expect(src).toMatch(/['"]fb-settings['"][\s\S]{0,80}adminOnly:\s*true/);
  });

  it('I-V75.3 — BackendDashboard.jsx has lazy import + render case for fb-settings', () => {
    const src = fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
    expect(src).toMatch(/FbSettingsTab/);
    expect(src).toMatch(/['"]fb-settings['"]/);
    // Must be lazy-imported
    expect(src).toMatch(/FbSettingsTab\s*=\s*lazy/);
  });

  it('I-V75.4 — fb-settings entry adjacent to line-settings (both in same master section)', () => {
    const src = fs.readFileSync('src/components/backend/nav/navConfig.js', 'utf8');
    const lineIdx = src.indexOf("'line-settings'");
    const fbIdx = src.indexOf("'fb-settings'");
    expect(lineIdx).toBeGreaterThan(0);
    expect(fbIdx).toBeGreaterThan(0);
    // fb-settings should come AFTER line-settings (adjacent placement)
    expect(fbIdx).toBeGreaterThan(lineIdx);
    // Distance should be small (adjacent, not far-apart)
    expect(fbIdx - lineIdx).toBeLessThan(1500);
  });
});
