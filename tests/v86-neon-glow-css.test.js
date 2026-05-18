// Phase A — V86 Neon Glow source-grep regression (AV83 lock)
// Locks visual + structural contract documented in
// docs/superpowers/specs/2026-05-18-v86-neon-glow-design.md
//
// CG1: V86 header anchor in src/index.css
// CG2: 8 [data-section] CSS-vars blocks (+ 1 alias for admin)
// CG3: ArcBloom SECTION_COLOR parity (each section c1/c2 matches JS source)
// CG4: keyframes v86-breath + v86-breath-light defined + use var(--neon-c1/c2)
// CG5: prefers-reduced-motion override present
// CG6: [data-theme="light"] override present
// CG7: AV81 menu+print files contain ZERO v86-glow references; customer-facing
//      files contain ZERO v86-glow + data-section + admin-frontend-zone refs
// CG8: V86 rules use var(--neon-c1/c2), no hardcoded section RGB (AV83)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf-8');
const ARC_BLOOM = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/shell/BackendArcBloom.jsx'), 'utf-8'
);

// Extract V86 block from src/index.css (everything from the V86 header anchor onwards)
const v86Block = () => {
  const start = CSS.indexOf('V86 — Neon Cyberpunk Glow');
  if (start < 0) throw new Error('V86 block header not found in src/index.css');
  return CSS.slice(start);
};

// Parse ArcBloom SECTION_COLOR map → { sectionId: { c1, c2 } }
const arcBloomColors = (() => {
  const out = {};
  const re = /'([\w-]+)':\s*\{\s*c1:\s*'(#[\da-f]{6})',\s*c2:\s*'(#[\da-f]{6})'/gi;
  let m;
  while ((m = re.exec(ARC_BLOOM))) {
    out[m[1]] = { c1: m[2].toLowerCase(), c2: m[3].toLowerCase() };
  }
  return out;
})();

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

describe('V86 — Neon Glow CSS (Phase A source-grep AV83 lock)', () => {
  describe('CG1 — V86 block header anchor', () => {
    it('CG1.1 — V86 block header present in src/index.css', () => {
      expect(CSS).toMatch(/V86 — Neon Cyberpunk Glow/);
    });

    it('CG1.2 — V86 block dated EOD10 2026-05-18', () => {
      expect(CSS).toMatch(/V86.*2026-05-18 EOD\+10/);
    });
  });

  describe('CG2 — 8 [data-section] CSS-vars blocks + alias', () => {
    const sections = [
      'appointments-section',
      'customers',
      'sales',
      'marketing',
      'stock',
      'finance',
      'reports',
      'master',
    ];

    sections.forEach((sec) => {
      it(`CG2 — [data-section="${sec}"] block exists`, () => {
        const block = v86Block();
        expect(block).toMatch(new RegExp(`\\[data-section="${sec}"\\]`));
      });
    });

    it('CG2 — admin-frontend alias [data-section="appointments"] present', () => {
      const block = v86Block();
      expect(block).toMatch(/\[data-section="appointments"\]/);
    });
  });

  describe('CG3 — ArcBloom SECTION_COLOR parity', () => {
    it('CG3.0 — ArcBloom parser found all 8 sections', () => {
      const expected = ['appointments-section', 'customers', 'sales', 'marketing', 'stock', 'finance', 'reports', 'master'];
      expected.forEach((s) => {
        expect(arcBloomColors[s], `arcBloom should have section ${s}`).toBeTruthy();
      });
    });

    const expectedSections = ['appointments-section', 'customers', 'sales', 'marketing', 'stock', 'finance', 'reports', 'master'];
    expectedSections.forEach((sec) => {
      it(`CG3 — ${sec} CSS c1/c2 RGB matches ArcBloom hex SECTION_COLOR`, () => {
        const block = v86Block();
        const arc = arcBloomColors[sec];
        expect(arc, `ArcBloom has SECTION_COLOR for ${sec}`).toBeTruthy();
        const c1 = hexToRgb(arc.c1);
        const c2 = hexToRgb(arc.c2);
        // Locate the section's block + extract --neon-c1 / --neon-c2 values
        // Use a flexible regex that allows comma-grouped selectors before the block
        const secBlockRe = new RegExp(
          `\\[data-section="${sec}"\\][^{]*\\{([^}]+)\\}`,
          'i'
        );
        const m = block.match(secBlockRe);
        expect(m, `section ${sec} block found in src/index.css`).toBeTruthy();
        const body = m[1];
        expect(body).toMatch(new RegExp(`--neon-c1:\\s*${c1.r},\\s*${c1.g},\\s*${c1.b}`));
        expect(body).toMatch(new RegExp(`--neon-c2:\\s*${c2.r},\\s*${c2.g},\\s*${c2.b}`));
      });
    });
  });

  describe('CG4 — Breath keyframes', () => {
    it('CG4.1 — @keyframes v86-breath defined', () => {
      expect(v86Block()).toMatch(/@keyframes\s+v86-breath\b/);
    });

    it('CG4.2 — @keyframes v86-breath-light defined', () => {
      expect(v86Block()).toMatch(/@keyframes\s+v86-breath-light\b/);
    });

    it('CG4.3 — breath keyframes use var(--neon-c1) and var(--neon-c2)', () => {
      const block = v86Block();
      // Match the v86-breath keyframe body (non-light)
      const m = block.match(/@keyframes\s+v86-breath\s*\{[\s\S]*?\}\s*\}/);
      expect(m).toBeTruthy();
      expect(m[0]).toMatch(/var\(--neon-c1\)/);
      expect(m[0]).toMatch(/var\(--neon-c2\)/);
    });
  });

  describe('CG5 — Reduced-motion override', () => {
    it('CG5.1 — @media (prefers-reduced-motion: reduce) block present in V86 area', () => {
      const block = v86Block();
      expect(block).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    });

    it('CG5.2 — reduced-motion block strips animation', () => {
      const block = v86Block();
      const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?animation:\s*none/;
      expect(block).toMatch(re);
    });
  });

  describe('CG6 — Light theme override', () => {
    it('CG6.1 — [data-theme="light"] V86 overrides present', () => {
      const block = v86Block();
      // Either the .v86-glow-card override OR the auto-glow override variant
      expect(block).toMatch(/\[data-theme="light"\]/);
    });

    it('CG6.2 — v86-breath-light keyframe reassigned for light theme', () => {
      const block = v86Block();
      expect(block).toMatch(/\[data-theme="light"\][\s\S]*?animation:\s*v86-breath-light/);
    });
  });

  describe('CG7 — AV81 menu+print + Q4-B customer-facing zero-touch', () => {
    const guardedFiles = [
      'src/components/backend/shell/BackendArcBloom.jsx',
      'src/components/backend/shell/BackendSubTabBloom.jsx',
      'src/components/backend/shell/BackendDuoPill.jsx',
      'src/components/backend/nav/BackendSidebar.jsx',
      'src/components/backend/nav/BackendMobileDrawer.jsx',
      'src/components/backend/nav/BackendCmdPalette.jsx',
      'src/components/SalePrintView.jsx',
      'src/components/QuotationPrintView.jsx',
      'src/components/backend/BulkPrintModal.jsx',
      'src/components/backend/DocumentPrintModal.jsx',
      'src/lib/documentPrintEngine.js',
      // Q4-B customer-facing excludes
      'src/pages/PatientForm.jsx',
      'src/pages/PatientDashboard.jsx',
      'src/pages/ClinicSchedule.jsx',
    ];

    guardedFiles.forEach((f) => {
      it(`CG7 — ${f} contains ZERO v86-glow references`, () => {
        const p = path.join(ROOT, f);
        if (!fs.existsSync(p)) {
          // Tolerate missing optional files (e.g. PatientDashboard may not exist)
          return;
        }
        const src = fs.readFileSync(p, 'utf-8');
        expect(src, `${f} should not reference v86-glow`).not.toMatch(/v86-glow/);
      });
    });

    [
      'src/pages/PatientForm.jsx',
      'src/pages/PatientDashboard.jsx',
      'src/pages/ClinicSchedule.jsx',
    ].forEach((f) => {
      it(`CG7 — ${f} contains ZERO data-section or admin-frontend-zone references`, () => {
        const p = path.join(ROOT, f);
        if (!fs.existsSync(p)) return;
        const src = fs.readFileSync(p, 'utf-8');
        expect(src, `${f} should not have data-section attribute`).not.toMatch(/data-section\s*=/);
        expect(src, `${f} should not have admin-frontend-zone class`).not.toMatch(/admin-frontend-zone/);
      });
    });
  });

  describe('CG8 — V86 rules use CSS vars, no hardcoded section RGB (AV83)', () => {
    it('CG8.1 — .v86-glow-card utility uses var(--neon-c1/c2)', () => {
      const block = v86Block();
      const re = /\.v86-glow-card[^{]*\{([^}]+)\}/g;
      let m;
      let foundAny = false;
      while ((m = re.exec(block))) {
        foundAny = true;
        const body = m[1];
        if (body.match(/rgba?\(/)) {
          expect(body, `.v86-glow-card body contains rgba but no var(--neon-c*): ${body.slice(0, 80)}`).toMatch(/var\(--neon-c[12]\)/);
        }
      }
      expect(foundAny, '.v86-glow-card rules should exist').toBe(true);
    });

    it('CG8.2 — V86 auto-glow override rules reference var(--neon-c1/c2)', () => {
      const block = v86Block();
      // V86 auto-glow scopes to [data-testid="backend-content"] (T4 finding)
      const autoGlowSection = block.indexOf('data-testid="backend-content"') >= 0
        ? block.slice(block.indexOf('data-testid="backend-content"'))
        : '';
      expect(autoGlowSection.length, 'auto-glow override section present').toBeGreaterThan(0);
      expect(autoGlowSection).toMatch(/var\(--neon-c1\)/);
      expect(autoGlowSection).toMatch(/var\(--neon-c2\)/);
    });

    it('CG8.3 — admin-frontend-zone auto-glow rules reference var(--neon-c1/c2)', () => {
      const block = v86Block();
      const adminSection = block.indexOf('admin-frontend-zone') >= 0
        ? block.slice(block.indexOf('admin-frontend-zone'))
        : '';
      expect(adminSection.length, 'admin-frontend-zone rules present').toBeGreaterThan(0);
      expect(adminSection).toMatch(/var\(--neon-c1\)/);
      expect(adminSection).toMatch(/var\(--neon-c2\)/);
    });
  });
});
