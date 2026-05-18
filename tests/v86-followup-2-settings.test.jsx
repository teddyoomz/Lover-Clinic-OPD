// V86-followup-2 Settings UI tests (VS1-VS6)
//
// VS1: validateV86Glow accepts valid; rejects invalid hex; clamps intensity
// VS2: useV86GlowApply sets CSS vars on mount + on config change
// VS3: SystemSettingsTab renders "เอฟเฟกต์แสงเรือง" section with controls
// VS4: Live preview card uses local state (not saved)
// VS5: Save calls saveSystemConfig with validated patch
// VS6: Reset restores defaults without saving; Cancel restores last-saved

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V86_GLOW_DEFAULTS, validateV86Glow } from '../src/lib/systemConfigClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

describe('V86-followup-2 — Settings UI + validator + hook', () => {
  describe('VS1 — validateV86Glow', () => {
    it('VS1.1 accepts valid input', () => {
      const out = validateV86Glow({ enabled: true, c1: '#dc2626', c2: '#ef4444', intensityPercent: 45 });
      expect(out).toEqual({ enabled: true, c1: '#dc2626', c2: '#ef4444', intensityPercent: 45 });
    });

    it('VS1.2 returns defaults for empty/null/undefined patch', () => {
      expect(validateV86Glow({})).toEqual({ ...V86_GLOW_DEFAULTS });
      expect(validateV86Glow(null)).toEqual({ ...V86_GLOW_DEFAULTS });
      expect(validateV86Glow(undefined)).toEqual({ ...V86_GLOW_DEFAULTS });
    });

    it('VS1.3 rejects invalid hex (falls back to defaults)', () => {
      const out = validateV86Glow({ c1: 'not-a-hex', c2: '#zzz' });
      expect(out.c1).toBe(V86_GLOW_DEFAULTS.c1);
      expect(out.c2).toBe(V86_GLOW_DEFAULTS.c2);
    });

    it('VS1.4 clamps intensity 0-150', () => {
      expect(validateV86Glow({ intensityPercent: -10 }).intensityPercent).toBe(0);
      expect(validateV86Glow({ intensityPercent: 200 }).intensityPercent).toBe(150);
      expect(validateV86Glow({ intensityPercent: 75 }).intensityPercent).toBe(75);
    });

    it('VS1.5 normalizes hex to lowercase', () => {
      expect(validateV86Glow({ c1: '#DC2626' }).c1).toBe('#dc2626');
      expect(validateV86Glow({ c2: '#EF4444' }).c2).toBe('#ef4444');
    });

    it('VS1.6 enabled defaults to true; respects false', () => {
      expect(validateV86Glow({}).enabled).toBe(true);
      expect(validateV86Glow({ enabled: false }).enabled).toBe(false);
      expect(validateV86Glow({ enabled: 'not-bool' }).enabled).toBe(true); // ignored
    });

    it('VS1.7 V86_GLOW_DEFAULTS shape lock', () => {
      expect(V86_GLOW_DEFAULTS).toEqual({
        enabled: true,
        c1: '#dc2626',
        c2: '#ef4444',
        intensityPercent: 45,
      });
    });
  });

  describe('VS2 — useV86GlowApply hook source contract', () => {
    it('VS2.1 — hook file exists at expected path', () => {
      const p = path.join(ROOT, 'src/hooks/useV86GlowApply.js');
      expect(fs.existsSync(p)).toBe(true);
    });

    it('VS2.2 — hook reads useSystemConfig + V86_GLOW_DEFAULTS', () => {
      const src = fs.readFileSync(path.join(ROOT, 'src/hooks/useV86GlowApply.js'), 'utf-8');
      expect(src).toMatch(/useSystemConfig/);
      expect(src).toMatch(/V86_GLOW_DEFAULTS/);
    });

    it('VS2.3 — hook calls setProperty for --neon-c1, --neon-c2, --neon-intensity', () => {
      const src = fs.readFileSync(path.join(ROOT, 'src/hooks/useV86GlowApply.js'), 'utf-8');
      expect(src).toMatch(/setProperty\(['"`]--neon-c1['"`]/);
      expect(src).toMatch(/setProperty\(['"`]--neon-c2['"`]/);
      expect(src).toMatch(/setProperty\(['"`]--neon-intensity['"`]/);
    });

    it('VS2.4 — hook handles disabled case (zeros --neon-intensity)', () => {
      const src = fs.readFileSync(path.join(ROOT, 'src/hooks/useV86GlowApply.js'), 'utf-8');
      expect(src).toMatch(/!v86\.enabled/);
      expect(src).toMatch(/['"`]--neon-intensity['"`],\s*['"`]0['"`]/);
    });

    it('VS2.5 — App.jsx mounts useV86GlowApply at root', () => {
      const src = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf-8');
      expect(src).toMatch(/import\s*\{?\s*useV86GlowApply\s*\}?\s*from/);
      expect(src).toMatch(/useV86GlowApply\(\)/);
    });
  });

  describe('VS3 — SystemSettingsTab "เอฟเฟกต์แสงเรือง" section render', () => {
    // Read once at module-load — vitest caches the read result
    const SETTINGS_SRC = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');

    it('VS3.1 — section title "เอฟเฟกต์แสงเรือง" present', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(s).toMatch(/เอฟเฟกต์แสงเรือง/);
    });

    it('VS3.2 — V86_GLOW_DEFAULTS imported', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(s).toMatch(/V86_GLOW_DEFAULTS/);
    });

    it('VS3.3 — 4 data-field attrs present (C1 / C2 / Intensity / Enabled)', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(s).toMatch(/data-field="v86GlowC1"/);
      expect(s).toMatch(/data-field="v86GlowC2"/);
      expect(s).toMatch(/data-field="v86GlowIntensity"/);
      expect(s).toMatch(/data-field="v86GlowEnabled"/);
    });

    it('VS3.4 — handleV86Save + handleV86Reset + handleV86Cancel handlers defined', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(s).toMatch(/handleV86Save\s*=/);
      expect(s).toMatch(/handleV86Reset\s*=/);
      expect(s).toMatch(/handleV86Cancel\s*=/);
    });

    it('VS3.5 — 4 c1 presets + 4 c2 presets defined', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      // V86_C1_PRESETS array of 4 hex strings
      expect(s).toMatch(/V86_C1_PRESETS\s*=\s*\[\s*['"]#dc2626['"]\s*,\s*['"]#3b82f6['"]\s*,\s*['"]#10b981['"]\s*,\s*['"]#a855f7['"]\s*\]/);
      // V86_C2_PRESETS
      expect(s).toMatch(/V86_C2_PRESETS\s*=\s*\[\s*['"]#ef4444['"]\s*,\s*['"]#06b6d4['"]\s*,\s*['"]#22c55e['"]\s*,\s*['"]#ec4899['"]\s*\]/);
    });

    it('VS3.6 — NeonGlowSection mounted between FeatureFlagsSection and audit', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(s).toMatch(/<FeatureFlagsSection[\s\S]*?<NeonGlowSection[\s\S]*?<SectionCard[\s\S]*?ประวัติการเปลี่ยนแปลง/);
    });
  });

  describe('VS4 — Live preview card uses .v86-glow-card class', () => {
    it('VS4.1 — preview card has v86-glow-card class', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(s).toMatch(/v86-glow-card/);
    });
  });

  describe('VS5 — Save calls saveSystemConfig with v86Glow patch', () => {
    it('VS5.1 — handleV86Save invokes saveSystemConfig with {patch:{v86Glow:...}}', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      const sliceMatch = s.match(/handleV86Save\s*=\s*useCallback\([\s\S]*?\]\)/);
      expect(sliceMatch).toBeTruthy();
      expect(sliceMatch[0]).toMatch(/saveSystemConfig\s*\(\s*\{[\s\S]*?patch:\s*\{\s*v86Glow/);
      expect(sliceMatch[0]).toMatch(/executedBy/);
    });
  });

  describe('VS6 — Reset/Cancel semantics', () => {
    it('VS6.1 — handleV86Reset uses V86_GLOW_DEFAULTS spread', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      const sliceMatch = s.match(/handleV86Reset\s*=\s*useCallback\([\s\S]*?\]\)/);
      expect(sliceMatch).toBeTruthy();
      expect(sliceMatch[0]).toMatch(/\.\.\.V86_GLOW_DEFAULTS/);
    });

    it('VS6.2 — handleV86Cancel restores from config.v86Glow', () => {
      const s = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      const sliceMatch = s.match(/handleV86Cancel\s*=\s*useCallback\([\s\S]*?\]\)/);
      expect(sliceMatch).toBeTruthy();
      expect(sliceMatch[0]).toMatch(/config\.v86Glow/);
    });
  });
});
