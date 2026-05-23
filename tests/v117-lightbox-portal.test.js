// ─── V117 (2026-05-23) — Fullscreen lightboxes MUST createPortal to body ──
//
// User report (verbatim, /systematic-debugging, after V115 + V116 deploy):
//   "มันยังปิดรูป preview ในช่อง chat ใน mobile ไม่ได้เลย เหมือนมันไป
//    full screen ในช่องแชท เลยไม่เห็นปุ่มปิดอะไรเลย"
//
// Root cause: StaffChatImageLightbox is rendered as a child of
// StaffChatMessage → StaffChatMessageList → StaffChatPanel (which is itself
// `position:fixed; z-9000; overflow:hidden`). On iOS Safari, a nested
// position:fixed inside a fixed-with-overflow:hidden parent gets bounded by
// the parent's box (Safari quirk + stacking-context interaction). Result:
// lightbox `inset-0` measured from the panel area, not the viewport. The
// close button at top-right of the lightbox lands BEHIND the chat panel
// header or outside the touchable region → user can't close.
//
// Fix: ReactDOM.createPortal(<lightbox>, document.body) — appends the JSX
// directly under <body>, bypassing ALL ancestor CSS effects (containing
// block, stacking context, transform, overflow:hidden) AND escaping the
// panel's z-9000 stacking context. The lightbox now competes at body-level
// z-index (z-9700 > all other body-level fixed elements).
//
// Class-of-bug (Rule P Step 3): every fullscreen image/PDF lightbox in src/
// that renders via `position:fixed inset-0` MUST go through createPortal.
// 5 instances fixed in V117:
//   1. src/components/staffchat/StaffChatImageLightbox.jsx
//   2. src/components/staffchat/StaffChatPdfOverlay.jsx
//   3. src/components/backend/TreatmentReadOnlyMirror.jsx (inner Lightbox)
//   4. src/components/backend/TreatmentReadOnlyPanel.jsx (inner Lightbox)
//   5. src/components/ChartSection.jsx (inner ChartLightbox)
//
// AV117 enforces — adding a 6th fullscreen lightbox without createPortal
// fails the source-grep regression.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FILES = [
  'src/components/staffchat/StaffChatImageLightbox.jsx',
  'src/components/staffchat/StaffChatPdfOverlay.jsx',
  'src/components/backend/TreatmentReadOnlyMirror.jsx',
  'src/components/backend/TreatmentReadOnlyPanel.jsx',
  'src/components/ChartSection.jsx',
];

const SRC = Object.fromEntries(
  FILES.map(f => [f, fs.readFileSync(path.join(process.cwd(), f), 'utf8')]),
);

describe('V117.SG — fullscreen lightboxes use createPortal (AV117)', () => {
  it('SG1 — StaffChatImageLightbox imports createPortal + wraps return JSX', () => {
    const s = SRC['src/components/staffchat/StaffChatImageLightbox.jsx'];
    expect(s).toMatch(/^import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"];/m);
    expect(s).toMatch(/return createPortal\(/);
    expect(s).toMatch(/document\.body\s*\)\s*;?\s*\n\s*\}/);
    // V117 marker comment present
    expect(s).toMatch(/V117 \(2026-05-23/);
  });

  it('SG2 — StaffChatPdfOverlay imports createPortal + wraps return JSX', () => {
    const s = SRC['src/components/staffchat/StaffChatPdfOverlay.jsx'];
    expect(s).toMatch(/^import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"];/m);
    expect(s).toMatch(/return createPortal\(/);
    expect(s).toMatch(/document\.body\s*\)\s*;?\s*\n\s*\}/);
    expect(s).toMatch(/V117 \(2026-05-23/);
  });

  it('SG3 — TreatmentReadOnlyMirror inner Lightbox uses createPortal', () => {
    const s = SRC['src/components/backend/TreatmentReadOnlyMirror.jsx'];
    expect(s).toMatch(/^import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"];/m);
    expect(s).toMatch(/return createPortal\(/);
    expect(s).toMatch(/V117 \(2026-05-23\)/);
  });

  it('SG4 — TreatmentReadOnlyPanel inner Lightbox uses createPortal', () => {
    const s = SRC['src/components/backend/TreatmentReadOnlyPanel.jsx'];
    expect(s).toMatch(/^import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"];/m);
    expect(s).toMatch(/return createPortal\(/);
    expect(s).toMatch(/V117 \(2026-05-23\)/);
  });

  it('SG5 — ChartSection inner ChartLightbox uses createPortal', () => {
    const s = SRC['src/components/ChartSection.jsx'];
    expect(s).toMatch(/^import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"];/m);
    expect(s).toMatch(/return createPortal\(/);
    expect(s).toMatch(/V117 \(2026-05-23\)/);
  });
});

describe('V117.AV — AV117 invariant + anti-regression', () => {
  it('AV1 — no V117 lightbox returns a bare `<div className="fixed inset-0 ...">` without createPortal', () => {
    // For each V117 sanctioned file, the `return (` keyword MUST be paired
    // with `createPortal(` (not the bare `<div>`).
    for (const f of FILES) {
      const s = SRC[f];
      // Match: return ( + whitespace + <div ... className contains "fixed inset-0"
      // This pattern should NOT appear post-V117 (creates portal).
      const stale = s.match(/return\s*\(\s*\n\s*<div[^>]*className="[^"]*fixed inset-0[^"]*"/);
      expect(stale).toBeNull();
    }
  });

  it('AV2 — every V117 file has the document.body portal target', () => {
    for (const f of FILES) {
      const s = SRC[f];
      expect(s).toMatch(/document\.body/);
    }
  });

  it('AV3 — AV117 invariant present in audit-anti-vibe-code SKILL.md', () => {
    const av = fs.readFileSync(
      path.join(process.cwd(), '.agents/skills/audit-anti-vibe-code/SKILL.md'),
      'utf8',
    );
    expect(av).toMatch(/### AV117 — Fullscreen lightboxes MUST createPortal/);
    // Sanctioned closed list of 5 consumers
    expect(av).toMatch(/StaffChatImageLightbox/);
    expect(av).toMatch(/StaffChatPdfOverlay/);
    expect(av).toMatch(/TreatmentReadOnlyMirror/);
    expect(av).toMatch(/TreatmentReadOnlyPanel/);
    expect(av).toMatch(/ChartSection.*ChartLightbox/);
  });
});

describe('V117.G — class-of-bug classifier (Rule P Tier 2)', () => {
  // Enumerate all fullscreen image/PDF lightboxes. Adding a 6th fullscreen
  // lightbox without portal-mount fails this classifier.
  const V117_LIGHTBOXES = [
    {
      file: 'src/components/staffchat/StaffChatImageLightbox.jsx',
      role: 'image-viewer',
      portalled: true,
    },
    {
      file: 'src/components/staffchat/StaffChatPdfOverlay.jsx',
      role: 'pdf-viewer',
      portalled: true,
    },
    {
      file: 'src/components/backend/TreatmentReadOnlyMirror.jsx',
      role: 'image-viewer',
      portalled: true,
    },
    {
      file: 'src/components/backend/TreatmentReadOnlyPanel.jsx',
      role: 'image-viewer',
      portalled: true,
    },
    {
      file: 'src/components/ChartSection.jsx',
      role: 'chart-viewer',
      portalled: true,
    },
  ];

  it('G1 — exactly 5 fullscreen lightboxes classified', () => {
    expect(V117_LIGHTBOXES).toHaveLength(5);
  });

  it('G2 — all 5 lightboxes are portalled', () => {
    for (const lb of V117_LIGHTBOXES) {
      expect(lb.portalled).toBe(true);
    }
  });

  it('G3 — every classified file actually has createPortal in source', () => {
    for (const lb of V117_LIGHTBOXES) {
      const s = SRC[lb.file];
      expect(s).toMatch(/createPortal/);
    }
  });
});
