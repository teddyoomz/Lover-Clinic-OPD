// tests/v110-font-detector.test.js
//
// V110 (2026-05-23 EOD+1) — Regression locks for the office-preview font
// detector + Dockerfile font install + fontconfig alias.
//
// The font-detection helper is PURE JS (unzip docx → parse fontTable.xml +
// theme1.xml). The actual fc-list / fc-match calls happen on the Cloud Run
// container — we test those via Rule Q L2 (real-prod re-conversion).

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { describe, it, expect } from 'vitest';
import {
  extractFontsFromDocxBuffer,
} from '../functions/officeToPdf/fontDetector.js';

const ROOT = resolve(process.cwd());
function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

describe('V110 — Office preview font fidelity (Dockerfile + fontconfig + detector)', () => {
  describe('Dockerfile static font install', () => {
    const dockerfile = read('functions/officeToPdf/Dockerfile');

    it('V110.A1 installs fonts-thai-tlwg + OTF variant', () => {
      expect(dockerfile).toMatch(/fonts-thai-tlwg/);
      expect(dockerfile).toMatch(/fonts-thai-tlwg-otf/);
    });

    it('V110.A2 installs fontconfig (required for fc-cache + fc-list + fc-match)', () => {
      expect(dockerfile).toMatch(/\bfontconfig\b/);
    });

    it('V110.A3 copies the Thai substitute fontconfig + runs fc-cache', () => {
      expect(dockerfile).toMatch(/fontconfig-thai\.conf/);
      expect(dockerfile).toMatch(/fc-cache/);
      expect(dockerfile).toMatch(/99-thai-substitute\.conf/);
    });

    it('V110.A4 has the V110 marker for institutional memory', () => {
      expect(dockerfile).toMatch(/V110/);
    });

    it('V110.A5 (V110-bis) deploys LibreOffice Word-compat XCU to gotenberg user home', () => {
      expect(dockerfile).toMatch(/libreoffice-compat\.xcu/);
      expect(dockerfile).toMatch(/\/home\/gotenberg\/\.config\/libreoffice\/4\/user\/registrymodifications\.xcu/);
      expect(dockerfile).toMatch(/chown\s+-R\s+gotenberg:gotenberg/);
    });
  });

  describe('LibreOffice Word-compat XCU (V110-bis)', () => {
    const xcu = read('functions/officeToPdf/libreoffice-compat.xcu');

    it('V110.F1 enables UsePrinterMetrics + AddSpacing + UseLineSpacing (core Word-compat triad)', () => {
      expect(xcu).toMatch(/<prop oor:name="UsePrinterMetrics"[\s\S]*?<value>true<\/value>/);
      expect(xcu).toMatch(/<prop oor:name="AddSpacing"[\s\S]*?<value>true<\/value>/);
      expect(xcu).toMatch(/<prop oor:name="UseLineSpacing"[\s\S]*?<value>true<\/value>/);
    });

    it('V110.F2 enables MsWordCompTrailingBlanks (whitespace handling)', () => {
      expect(xcu).toMatch(/<prop oor:name="MsWordCompTrailingBlanks"[\s\S]*?<value>true<\/value>/);
    });

    it('V110.F3 enables NoExtLeading (line-height calc)', () => {
      expect(xcu).toMatch(/<prop oor:name="NoExtLeading"[\s\S]*?<value>true<\/value>/);
    });

    it('V110.F4 enables CTL (Complex Text Layout — Thai script requires this)', () => {
      expect(xcu).toMatch(/<prop oor:name="CTLFont"[\s\S]*?<value>true<\/value>/);
    });

    it('V110.F5 uses fuse op (merge, not replace, so it composes with docx-internal flags)', () => {
      // Every <prop> should have oor:op="fuse" — never "replace"
      const replaceCount = (xcu.match(/oor:op="replace"/g) || []).length;
      const fuseCount = (xcu.match(/oor:op="fuse"/g) || []).length;
      expect(replaceCount).toBe(0);
      expect(fuseCount).toBeGreaterThanOrEqual(15);
    });
  });

  describe('fontconfig alias map', () => {
    const conf = read('functions/officeToPdf/fontconfig-thai.conf');

    it('V110.B1 maps the four most-common MS-proprietary Thai families', () => {
      expect(conf).toMatch(/<family>Cordia New<\/family>[\s\S]*?<family>Loma<\/family>/);
      expect(conf).toMatch(/<family>Browallia New<\/family>[\s\S]*?<family>Garuda<\/family>/);
      expect(conf).toMatch(/<family>Angsana New<\/family>[\s\S]*?<family>Norasi<\/family>/);
    });

    it('V110.B2 covers UPC variants too (legacy Thai docs)', () => {
      ['CordiaUPC', 'BrowalliaUPC', 'AngsanaUPC', 'IrisUPC', 'JasmineUPC'].forEach(name => {
        expect(conf).toContain(`<family>${name}</family>`);
      });
    });

    it('V110.B3 binds Cordia/Browallia/Angsana with strong binding (overrides LibreOffice tables)', () => {
      const strongAliases = conf.match(/<alias binding="strong">/g) || [];
      expect(strongAliases.length).toBeGreaterThanOrEqual(10);
    });

    it('V110.B4 includes a sans-serif fallback chain preferring fonts-thai-tlwg over Noto', () => {
      // The generic sans-serif alias should prefer Loma/Garuda/Sarabun BEFORE Noto Sans Thai.
      const sansBlock = conf.match(/<family>sans-serif<\/family>[\s\S]*?<\/alias>/)?.[0] || '';
      const lomaIdx = sansBlock.indexOf('Loma');
      const notoIdx = sansBlock.indexOf('Noto Sans Thai');
      expect(lomaIdx).toBeGreaterThanOrEqual(0);
      expect(notoIdx).toBeGreaterThan(lomaIdx);
    });
  });

  describe('fontDetector — pure JS extraction (no container)', () => {
    it('V110.C1 invalid buffer returns error gracefully', () => {
      const r = extractFontsFromDocxBuffer(null);
      expect(r.declared).toEqual([]);
      expect(r.error).toBe('invalid-buffer');
    });

    it('V110.C2 non-zip buffer returns unzip-failed error', () => {
      const r = extractFontsFromDocxBuffer(Buffer.from('NOT A DOCX'));
      expect(r.declared).toEqual([]);
      expect(r.error).toMatch(/unzip-failed/);
    });

    it('V110.C3 user reference docx (if downloaded) extracts Cordia New + TH Sarabun PSK', () => {
      const localPath = '.tmp-docx-inspect/user-doc.docx';
      if (!existsSync(localPath)) {
        // Skip if the diag local copy isn't present (e.g., CI runs)
        return;
      }
      const buf = readFileSync(localPath);
      const r = extractFontsFromDocxBuffer(buf);
      expect(r.error).toBeUndefined();
      expect(r.declared).toContain('Cordia New');
      expect(r.declared).toContain('TH Sarabun PSK');
      // Theme map should explicitly mark Thai → Cordia New (THE smoking gun)
      expect(r.theme.Thai).toBe('Cordia New');
    });
  });

  describe('Cloud Function index.js wiring', () => {
    const idx = read('functions/officeToPdf/index.js');

    it('V110.D1 imports analyzeFontRequirements', () => {
      expect(idx).toMatch(/import\s*\{[^}]*analyzeFontRequirements[^}]*\}\s*from\s*['"]\.\/fontDetector\.js['"]/);
    });

    it('V110.D2 calls analyzeFontRequirements pre-conversion (inside the try block)', () => {
      expect(idx).toMatch(/analyzeFontRequirements\(buf\)/);
    });

    it('V110.D3 logs font-requirements (observability)', () => {
      expect(idx).toMatch(/font-requirements/);
    });

    it('V110.D4 analysis is non-fatal (wrapped in try/catch — never blocks conversion)', () => {
      // The analyze block should have try { ... } catch (e) { console.warn(...continuing...) }
      expect(idx).toMatch(/font-analysis threw \(continuing\)/);
    });

    it('V110.D5 only analyzes Office Open XML (zip-based) — skips legacy .doc/.xls', () => {
      // Should gate on contentType matching wordprocessingml/spreadsheetml/presentationml
      expect(idx).toMatch(/wordprocessingml/);
      expect(idx).toMatch(/spreadsheetml/);
      expect(idx).toMatch(/presentationml/);
    });
  });

  describe('package.json dependency', () => {
    const pkg = JSON.parse(read('functions/officeToPdf/package.json'));

    it('V110.E1 declares fflate dependency (for in-memory docx unzip)', () => {
      expect(pkg.dependencies).toHaveProperty('fflate');
    });
  });
});
