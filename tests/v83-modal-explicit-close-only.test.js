// ─── V83 — Modal explicit-close-only regression bank (AV78) ──────────
// EOD8 (2026-05-18). Source-grep over src/components/**/*.jsx.
// Every modal backdrop MUST NOT have onClick={onClose} or
// onClick={(e) => currentTarget guard}. Sanctioned exception list is
// closed: 2 files (StaffChatImageLightbox + TreatmentReadOnlyMirror inner Lightbox).
//
// User pain (locked permanent): "พอกรอกข้อมูลใน modal ใกล้จะหมดแล้ว ดันไป
// เผลอคลิ๊กตรงบริเวณที่ที่ว่างรอบๆ modal แล้ว modal มันปิดไปเอง ... user
// คลิ๊กพลาดปิด modal บ่อยจนอยากจะทุบคอมทิ้ง".

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const PROJECT_ROOT = process.cwd();
const COMPONENTS_DIR = join(PROJECT_ROOT, 'src/components');

// Closed sanctioned list — adding a 4th lightbox MUST extend this AND file a V-entry
const SANCTIONED_EXCEPTIONS = Object.freeze([
  'staffchat/StaffChatImageLightbox.jsx',
  'backend/TreatmentReadOnlyMirror.jsx', // inner ImageLightbox helper for treatment image zoom
]);

function walkJsx(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walkJsx(full, out);
    else if (entry.endsWith('.jsx') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function relToComponents(file) {
  return relative(COMPONENTS_DIR, file).split(/[\\/]/g).join('/');
}

function isSanctioned(file) {
  const rel = relToComponents(file);
  return SANCTIONED_EXCEPTIONS.includes(rel);
}

const ALL_JSX_FILES = walkJsx(COMPONENTS_DIR);

// Look up for AV78 marker within N lines above a target line
function hasAV78MarkerAbove(lines, lineIndex, lookback = 4) {
  const start = Math.max(0, lineIndex - lookback);
  const block = lines.slice(start, lineIndex + 1).join('\n');
  return /AV78\s*\(EOD8\)|AV78\s+lightbox-explicit-exception/.test(block);
}

describe('V83 — Modal explicit-close-only (AV78)', () => {
  describe('M1 — Sanctioned exception list is closed', () => {
    it('M1.1 — exactly 2 sanctioned files', () => {
      expect(SANCTIONED_EXCEPTIONS).toHaveLength(2);
    });

    it('M1.2 — both sanctioned files exist on disk', () => {
      for (const rel of SANCTIONED_EXCEPTIONS) {
        const path = join(COMPONENTS_DIR, rel);
        expect(() => readFileSync(path, 'utf8')).not.toThrow();
      }
    });

    it('M1.3 — both sanctioned files carry AV78 lightbox-explicit-exception annotation', () => {
      for (const rel of SANCTIONED_EXCEPTIONS) {
        const content = readFileSync(join(COMPONENTS_DIR, rel), 'utf8');
        expect(content).toMatch(/AV78\s+lightbox-explicit-exception/);
      }
    });
  });

  describe('M2 — No backdrop onClick patterns outside sanctioned list', () => {
    const offending = [];

    for (const file of ALL_JSX_FILES) {
      if (isSanctioned(file)) continue;

      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for backdrop div opening — fixed inset-0 + bg-black
        if (!/fixed\s+inset-0[^"`]*bg-black/.test(line)) continue;

        // Skip if AV78 marker exists in the lookback window
        if (hasAV78MarkerAbove(lines, i, 4)) continue;

        // Capture up to 6 lines for multi-line attribute spread
        const block = lines.slice(i, Math.min(i + 6, lines.length)).join(' ');

        // Pattern A: direct onClose call as backdrop click
        const hasOnCloseDirect = /onClick=\{onClose\}/.test(block);
        // Pattern B: currentTarget guard
        const hasOnCloseCurrentTarget = /onClick=\{\(e\)\s*=>\s*\{[^}]*e\.target\s*===\s*e\.currentTarget[^}]*onClose/.test(block);
        // Pattern A-alt: state-setter dismissers
        const hasSetStateClose = /onClick=\{\(\)\s*=>\s*set[A-Z][a-zA-Z]*\((null|false)\)\}/.test(block);
        // Pattern A-alt2: stage-gated WholeSystem
        const hasStageGated = /onClick=\{\(\)\s*=>\s*stage\s*!==.*onClose/.test(block);
        // Pattern A-alt3: arbitrary state close
        const hasOnOpenChange = /onClick=\{\(\)\s*=>\s*onOpenChange\(false\)\}/.test(block);

        if (hasOnCloseDirect || hasOnCloseCurrentTarget || hasSetStateClose || hasStageGated || hasOnOpenChange) {
          offending.push(`${relative(PROJECT_ROOT, file).split(/[\\/]/g).join('/')}:${i + 1}  →  ${line.trim().slice(0, 140)}`);
        }
      }
    }

    it('M2.1 — ZERO offending backdrop onClick patterns', () => {
      if (offending.length > 0) {
        console.error('\n🚨 V83 AV78 violations:\n' + offending.join('\n'));
      }
      expect(offending).toHaveLength(0);
    });
  });

  describe('M3 — ESC + X button still close (positive presence)', () => {
    const SAMPLE_MODALS = [
      'backend/AppointmentFormModal.jsx',
      'backend/CustomerBackupModal.jsx',
      'backend/recall/RecallCreateModal.jsx',
      'backend/WholeSystemBackupModal.jsx',
      'backend/DepositPanel.jsx',
      'backend/SaleTab.jsx',
    ];

    for (const rel of SAMPLE_MODALS) {
      it(`M3 — ${rel} retains ESC OR X-button close affordance`, () => {
        const content = readFileSync(join(COMPONENTS_DIR, rel), 'utf8');
        const hasEsc = /onKeyDown=\{[^}]*Escape[^}]*onClose|onKeyDown=\{[^}]*Escape[^}]*set[A-Z]/.test(content);
        const hasXButton = /<X\s+size=|aria-label="ปิด"|aria-label="Close"/.test(content);
        expect(hasEsc || hasXButton).toBe(true);
      });
    }
  });

  describe('M4 — AV78 marker comments present in known stripped files', () => {
    const SAMPLE_STRIPPED = [
      'backend/AppointmentFormModal.jsx',
      'backend/recall/RecallCreateModal.jsx',
      'backend/DepositPanel.jsx',
      'backend/SaleTab.jsx',
      'backend/WalletPanel.jsx',
      'backend/MembershipPanel.jsx',
    ];

    for (const rel of SAMPLE_STRIPPED) {
      it(`M4 — ${rel} carries AV78 marker comment`, () => {
        const content = readFileSync(join(COMPONENTS_DIR, rel), 'utf8');
        expect(content).toMatch(/AV78\s*\(EOD8\)/);
      });
    }
  });

  describe('M5 — Total marker coverage matches strip scope', () => {
    let markerCount = 0;
    for (const file of ALL_JSX_FILES) {
      const content = readFileSync(file, 'utf8');
      const matches = content.match(/AV78\s*\(EOD8\)/g);
      if (matches) markerCount += matches.length;
    }

    it('M5.1 — at least 40 AV78 markers across components', () => {
      expect(markerCount).toBeGreaterThanOrEqual(40);
    });
  });
});
