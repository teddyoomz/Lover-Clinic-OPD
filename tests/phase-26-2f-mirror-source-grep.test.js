/**
 * tests/phase-26-2f-mirror-source-grep.test.js
 *
 * M1 — Source-grep regression bank for TreatmentReadOnlyMirror (Phase 26.2f Task 6).
 *
 * AV39 contract:
 *   - ALL <input>, <textarea>, <select> MUST have `disabled` attribute.
 *   - NO save/submit button text.
 *   - NO onEditTreatment / onDeleteTreatment callbacks.
 *   - Lightbox at z-[110] (above panel z-[100]).
 *   - data-testid="treatment-read-only-mirror" on root div.
 *   - data-testid="treatment-read-only-mirror-close" on close button.
 *   - StatusBadge emits mirror-status-chip-{doctor-recorded|vitalsigns-recorded} testids.
 *   - No ProClinic / brokerClient imports.
 *
 * These tests lock the file's code shape so future refactors don't silently
 * break the read-only contract.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIRROR_PATH = path.join(
  __dirname,
  '../src/components/backend/TreatmentReadOnlyMirror.jsx'
);

let src;
try {
  src = readFileSync(MIRROR_PATH, 'utf8');
} catch {
  src = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// M1.1 — File exists and is non-empty
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.1 — file presence', () => {
  it('TreatmentReadOnlyMirror.jsx exists and is non-empty', () => {
    expect(src.length).toBeGreaterThan(500);
  });

  it('exports a default function (TreatmentReadOnlyMirror)', () => {
    expect(src).toMatch(/export\s+default\s+function\s+TreatmentReadOnlyMirror/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1.2 — AV39: every form control is disabled
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.2 — AV39 disabled controls', () => {
  it('all <input> elements have disabled attribute', () => {
    // Every <input element in JSX must be followed by disabled (with optional type=…)
    // Pattern: any <input optionally with type="…" then disabled somewhere before />
    const inputBlocks = src.match(/<input[\s\S]*?\/>/g) || [];
    expect(inputBlocks.length).toBeGreaterThan(0);
    for (const block of inputBlocks) {
      // Skip Lightbox close button (which uses <button not <input>)
      // Skip if this is actually a sub-component declaration line (contains "function")
      if (block.includes('function ')) continue;
      expect(block, `<input block missing disabled: ${block.slice(0, 120)}`).toMatch(/\bdisabled\b/);
    }
  });

  it('all <textarea> elements have disabled attribute', () => {
    // Mirror uses JSX self-closing syntax: <textarea disabled ... /> (no </textarea>)
    const textareaBlocks = src.match(/<textarea[\s\S]*?\/>/g) || [];
    expect(textareaBlocks.length).toBeGreaterThan(0);
    for (const block of textareaBlocks) {
      expect(block, `<textarea block missing disabled: ${block.slice(0, 120)}`).toMatch(/\bdisabled\b/);
    }
  });

  it('all <select> elements have disabled attribute', () => {
    const selectBlocks = src.match(/<select[\s\S]*?<\/select>/g) || [];
    expect(selectBlocks.length).toBeGreaterThan(0);
    for (const block of selectBlocks) {
      expect(block, `<select block missing disabled: ${block.slice(0, 120)}`).toMatch(/\bdisabled\b/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1.3 — AV39: no save / submit / edit / delete actions
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.3 — AV39 no mutating actions', () => {
  it('does NOT contain "บันทึก" in a button label context', () => {
    // Allow the word inside comments (like AV39 description) but NOT as button text
    // The header shows "บันทึกการรักษา" as a read-only title span — that's OK.
    // We check that no <button …>บันทึก patterns exist.
    const buttonSavePattern = /<button[\s\S]{0,200}บันทึก[\s\S]{0,50}<\/button>/;
    expect(src).not.toMatch(buttonSavePattern);
  });

  it('does NOT contain type="submit" anywhere', () => {
    expect(src).not.toMatch(/type=["']submit["']/);
  });

  it('does NOT define or receive onEditTreatment prop', () => {
    // Strip block comments first — the word appears in JSDoc to document its ABSENCE
    const srcNoBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(srcNoBlockComments).not.toMatch(/onEditTreatment/);
  });

  it('does NOT define or receive onDeleteTreatment prop', () => {
    // Strip block comments first — the word appears in JSDoc to document its ABSENCE
    const srcNoBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(srcNoBlockComments).not.toMatch(/onDeleteTreatment/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1.4 — Test IDs: root and close button
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.4 — data-testid anchors', () => {
  it('root div has data-testid="treatment-read-only-mirror"', () => {
    expect(src).toContain('data-testid="treatment-read-only-mirror"');
  });

  it('close button has data-testid="treatment-read-only-mirror-close"', () => {
    expect(src).toContain('data-testid="treatment-read-only-mirror-close"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1.5 — Lightbox at z-[110]
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.5 — Lightbox z-index', () => {
  it('Lightbox renders at z-[110]', () => {
    expect(src).toMatch(/z-\[110\]/);
  });

  it('setLightbox state is present (zoom functionality)', () => {
    expect(src).toMatch(/setLightbox/);
  });

  it('Lightbox component is defined in the file', () => {
    expect(src).toMatch(/function Lightbox\s*\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1.6 — Section ordering (accordion titles in correct sequence)
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.6 — accordion section ordering', () => {
  const sections = [
    '📋 ข้อมูลการรักษา (OPD)',
    '🩺 ข้อมูลสุขภาพ',
    '📊 สัญญาณชีพ (Vitals)',
    '📜 ใบรับรองแพทย์',
  ];

  it('all four primary accordion sections are present', () => {
    for (const title of sections) {
      expect(src, `Missing accordion: "${title}"`).toContain(title);
    }
  });

  it('sections appear in the correct order (OPD → Health → Vitals → MedCert)', () => {
    const positions = sections.map(t => src.indexOf(t));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i], `Section "${sections[i]}" should appear after "${sections[i - 1]}"`).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('additional item-list sections are present', () => {
    expect(src).toContain('💊 รายการที่ใช้บริการ');
    expect(src).toContain('💉 ยาที่จ่าย / Take-Home Meds');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1.7 — StatusBadge chip test-ids
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.7 — StatusBadge testids', () => {
  it('emits mirror-status-chip-doctor-recorded for doctor-recorded status', () => {
    expect(src).toContain('mirror-status-chip-doctor-recorded');
  });

  it('emits mirror-status-chip-vitalsigns-recorded for vitalsigns-recorded status', () => {
    expect(src).toContain('mirror-status-chip-vitalsigns-recorded');
  });

  it('StatusBadge uses bg-blue for doctor-recorded', () => {
    expect(src).toMatch(/doctor-recorded.*bg-blue|bg-blue.*doctor-recorded/s);
  });

  it('StatusBadge uses bg-purple for vitalsigns-recorded', () => {
    expect(src).toMatch(/vitalsigns-recorded.*bg-purple|bg-purple.*vitalsigns-recorded/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1.8 — Field path derivation (de-facto data contract)
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.8 — field path derivation', () => {
  it('vitals are read from detail.vitals (not detail.vitalSigns)', () => {
    expect(src).toMatch(/const vitals = detail\.vitals/);
    expect(src).not.toMatch(/detail\.vitalSigns/);
  });

  it('health info is read from detail.healthInfo', () => {
    expect(src).toMatch(/const health = detail\.healthInfo/);
  });

  it('doctorName is derived from detail.doctorName (string field)', () => {
    expect(src).toMatch(/detail\.doctorName/);
  });

  it('medCert flags are read directly from detail (not nested medicalCert object)', () => {
    expect(src).toMatch(/detail\.medCertActuallyCome/);
    expect(src).toMatch(/detail\.medCertIsRest/);
    expect(src).not.toMatch(/detail\.medicalCert\./);
  });

  it('congenitalDisease from health.congenitalDisease (not chronicDisease)', () => {
    expect(src).toMatch(/health\.congenitalDisease/);
    expect(src).not.toMatch(/health\.chronicDisease/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1.9 — No broker / ProClinic imports
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.9 — no ProClinic / broker imports (Rule E)', () => {
  it('does NOT import brokerClient', () => {
    expect(src).not.toMatch(/brokerClient/);
  });

  it('does NOT import from /api/proclinic/', () => {
    expect(src).not.toMatch(/\/api\/proclinic\//);
  });

  it('does NOT import from backendClient (pure display component)', () => {
    // Mirror is a pure display component; data is passed as props, not fetched
    expect(src).not.toMatch(/from.*backendClient/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M1.10 — Phase 26.2f marker present (institutional memory)
// ─────────────────────────────────────────────────────────────────────────────
describe('M1.10 — Phase marker and AV39 reference', () => {
  it('file references AV39 in its contract comment', () => {
    expect(src).toMatch(/AV39/);
  });

  it('file documents the no-save / no-edit contract in JSDoc', () => {
    expect(src).toMatch(/NO save\/submit|NO onEditTreatment/);
  });
});
