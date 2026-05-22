// tests/audit-av108-office-preview-exception.test.js
//
// T7 — AV108 regression bank for the staff-chat Office preview shipment.
// AV108 baseline (2026-05-22): "no 3rd-party doc viewer in staff-chat".
// EOD+2 amendment: ONE sanctioned exception — the in-project Gotenberg
// Cloud Function at functions/officeToPdf/, calling localhost:3000 ONLY.
//
// Tests:
//   AV108.1 — NO 3rd-party doc viewer URLs in client src/
//   AV108.2 — NO client-side office render libraries in src/
//   AV108.3 — Cloud Function calls ONLY localhost Gotenberg (sanctioned)
//   AV108.4 — AV108 SKILL.md entry mentions the sanctioned exception
//   AV108.5 — Office MIME whitelist + status constants stay in lock-step
//             between src/lib/staffChatOfficePreviewCore.js + functions/officeToPdf/helpers.js
//             (Rule of 3 duplication-at-deploy-boundary)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');
const FN_DIR = join(ROOT, 'functions/officeToPdf');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

describe('AV108 — staff-chat office preview: no 3rd-party doc viewer (2026-05-22 EOD+2 amendment)', () => {
  const SRC_FILES = walk(SRC_DIR);

  it('AV108.1 — NO 3rd-party doc viewer URL in client src/', () => {
    for (const f of SRC_FILES) {
      const c = readFileSync(f, 'utf8');
      expect(c, f).not.toMatch(/officeapps|docs\.google\.com\/(viewer|gview)/);
      expect(c, f).not.toMatch(/(aspose|cloudconvert|convertapi)\.com/);
      expect(c, f).not.toMatch(/graph\.microsoft\.com\/v1\.0\/.+\/convert/);
    }
  });

  it('AV108.2 — NO client-side office render libraries in src/', () => {
    for (const f of SRC_FILES) {
      const c = readFileSync(f, 'utf8');
      // Word: mammoth / docx-preview / docx2html
      expect(c, f).not.toMatch(/(^|[^a-z])mammoth([^a-z]|$)/i);
      expect(c, f).not.toMatch(/(^|[^a-z])docx-preview([^a-z]|$)/i);
      expect(c, f).not.toMatch(/(^|[^a-z])docx2html([^a-z]|$)/i);
      // Excel: SheetJS / xlsx import/require
      expect(c, f).not.toMatch(/import\s+[^;]*\s+from\s+['"]xlsx['"]/);
      expect(c, f).not.toMatch(/require\(['"]xlsx['"]\)/);
      expect(c, f).not.toMatch(/(^|[^a-z])SHEET_EXT([^a-z]|$)/);
      expect(c, f).not.toMatch(/renderSheetToHtml|renderDocxToHtml/);
    }
  });

  it('AV108.3 — Cloud Function calls ONLY localhost Gotenberg (the ONE sanctioned exception)', () => {
    expect(existsSync(FN_DIR)).toBe(true);
    const cf = readFileSync(join(FN_DIR, 'index.js'), 'utf8');
    // Must invoke the localhost-bundled Gotenberg
    expect(cf).toMatch(/http:\/\/localhost:3000\/forms\/libreoffice\/convert/);
    // Must NOT invoke any external doc-converter
    expect(cf).not.toMatch(/officeapps|docs\.google\.com/);
    expect(cf).not.toMatch(/(aspose|cloudconvert|convertapi)\.com/);
    expect(cf).not.toMatch(/graph\.microsoft\.com/);
  });

  it('AV108.4 — AV108 SKILL.md entry mentions the EOD+2 sanctioned exception', () => {
    const skill = readFileSync(join(ROOT, '.agents/skills/audit-anti-vibe-code/SKILL.md'), 'utf8');
    expect(skill).toMatch(/AV108/);
    expect(skill).toMatch(/officeToPdf/);
    expect(skill).toMatch(/Gotenberg|gotenberg/);
    expect(skill).toMatch(/sanctioned exception/i);
  });

  it('AV108.5 — MIME whitelist + status constants stay in lock-step across the deploy boundary', () => {
    // Client canonical
    const client = readFileSync(join(SRC_DIR, 'lib/staffChatOfficePreviewCore.js'), 'utf8');
    // Cloud Function duplicate
    const cf = readFileSync(join(FN_DIR, 'helpers.js'), 'utf8');

    // All 7 canonical MIMEs must appear in BOTH files.
    const REQUIRED = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/csv',
    ];
    for (const m of REQUIRED) {
      expect(client).toContain(m);
      expect(cf).toContain(m);
    }

    // All 4 status constants must appear in BOTH files (string values).
    for (const v of ['pending', 'ready', 'failed', 'unsupported']) {
      expect(client).toMatch(new RegExp(`['"\`]${v}['"\`]`));
      expect(cf).toMatch(new RegExp(`['"\`]${v}['"\`]`));
    }
  });
});
