// AV205 (2026-07-07) — Universal modal scroll-lock classifier.
// Every src file containing a `fixed inset-0` overlay must either:
//   (a) engage the scroll lock (useModalScrollLock / <ModalScrollLock>) AND
//       carry layer-2 containment (`overscroll-contain`), or
//   (b) appear in the SANCTIONED closed list below with a reason.
// Dynamic enumeration (AV142 lesson — hardcoded lists rot): a NEW modal file
// that skips the lock turns this suite red.
// Spec: docs/superpowers/specs/2026-07-07-modal-scroll-lock-design.html
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src');

// Closed list — additions require a reason + review (V83 AV78 precedent).
const SANCTIONED = {
  // Full-screen editor "pages" (spec group 4 — not modals)
  'components/ChartCanvas.jsx': 'full-screen chart editor page — spec group 4',
  'pages/TabletChartEditorPage.jsx': 'full-screen tablet editor page — spec group 4',
  // Print views (spec group 4 — Q1)
  'components/backend/SalePrintView.jsx': 'print view — spec group 4',
  'components/backend/QuotationPrintView.jsx': 'print view — spec group 4',
  // Anchored dropdowns (spec group 3 — Q1: no lock)
  'components/OpdNoteTemplateMenu.jsx': 'anchored dropdown (Q1 group 3 — no lock)',
  'components/backend/recall/RecallSnoozeMenu.jsx': 'anchored dropdown (Q1 group 3 — no lock)',
  // Library-managed lock
  'components/backend/nav/BackendMobileDrawer.jsx':
    'Radix Dialog — built-in react-remove-scroll body lock',
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const overlayFiles = walk(SRC)
  .map((f) => ({
    rel: path.relative(SRC, f).replace(/\\/g, '/'),
    src: fs.readFileSync(f, 'utf8'),
  }))
  .filter((f) => f.src.includes('fixed inset-0'));

const locked = overlayFiles.filter((f) => !SANCTIONED[f.rel]);

describe('C1 — every fixed-inset-0 file is classified (locked or sanctioned)', () => {
  it('no unclassified overlay file (new modal without scroll lock → add hook or sanction with reason)', () => {
    const unclassified = locked
      .filter((f) => !/useModalScrollLock|<ModalScrollLock/.test(f.src))
      .map((f) => f.rel);
    expect(unclassified).toEqual([]);
  });
  it('sanity — the sweep actually found a substantial locked set (≥ 40 files)', () => {
    expect(locked.length).toBeGreaterThanOrEqual(40);
  });
});

describe('C2 — locked files carry BOTH layers (hook + overscroll-contain)', () => {
  for (const f of locked) {
    it(`${f.rel}`, () => {
      expect(f.src).toMatch(/useModalScrollLock|<ModalScrollLock/);
      expect(f.src).toMatch(/overscroll-contain/);
    });
  }
});

describe('C3 — sanctioned closed list stays real (delete entry when file is removed)', () => {
  for (const rel of Object.keys(SANCTIONED)) {
    it(`${rel} still exists`, () => {
      expect(fs.existsSync(path.join(SRC, rel))).toBe(true);
    });
  }
  it('sanctioned files do NOT quietly import the lock (they would belong in the locked set)', () => {
    // Radix drawer exempt from this check — importing would be double-lock but harmless.
    const offenders = overlayFiles
      .filter((f) => SANCTIONED[f.rel])
      .filter((f) => /useModalScrollLock|<ModalScrollLock/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

describe('C4 — StaffChatPanel keeps its own V82-fix7-bis mechanism (must NOT migrate)', () => {
  it('docked-panel lock untouched', () => {
    const p = fs.readFileSync(
      path.join(SRC, 'components/staffchat/StaffChatPanel.jsx'), 'utf8');
    expect(p).toMatch(/data-staff-chat-open/);
    expect(p).not.toMatch(/useModalScrollLock/);
  });
});

describe('C5 — layer-1 infrastructure intact', () => {
  it('hook module exports the full contract', () => {
    const h = fs.readFileSync(path.join(SRC, 'lib/useModalScrollLock.js'), 'utf8');
    expect(h).toMatch(/export function useModalScrollLock/);
    expect(h).toMatch(/export function ModalScrollLock/);
    expect(h).toMatch(/data-modal-open/);
    expect(h).toMatch(/--scroll-lock-gutter/);
  });
  it('index.css carries the html[data-modal-open] rules', () => {
    const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
    expect(css).toMatch(/html\[data-modal-open\]\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/html\[data-modal-open\]\s+body\s*\{[^}]*touch-action:\s*none/);
  });
});
