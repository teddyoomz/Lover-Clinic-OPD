// ─── V123 (2026-05-27) — Chart overlays MUST createPortal to body (AV143) ──
//
// User report (verbatim, /systematic-debugging):
//   "กดแก้ไขชาจใน TFP แล้ว จอ flash เด้งระหว่างภาพที่ 1 และ 2 … ภาพแรกคือ
//    หน้าแก้ที่ ไม่หลุดจาก box ตัวเอง (บั๊ค) … เหมือนมีการซ้อนกัน"
//   + "เพิ่มปุ่มขยายดูรูปใหญ่ให้กับรูปในส่วนของรูปภาพการรักษา … ปุ่มเหมือน
//      ปุ่มดูรูปใหญ่ในส่วนของ Chart"
//
// Root cause (same class as AV117): ChartCanvas (`fixed inset-0 z-95`) is
// rendered INSIDE TreatmentFormPage (itself a `fixed inset-0` overlay). A
// transformed/filtered/animated ancestor in the TFP subtree (transient entry
// transform) becomes the containing block for the editor's `position:fixed`
// → editor bounded to an ancestor BOX, not the viewport → the inline→fullscreen
// flash. The static TFP ancestor chain has NO persistent transform, so the
// trap is transient (settles a frame after mount) = a flash, not a permanent
// mislayout. createPortal(<jsx>, document.body) escapes ALL ancestor
// containing-blocks → full-screen from frame 1, no flash. AV143 enforces.
//
// Rule P expansion: same un-portaled `fixed inset-0` bug afflicts the two
// sibling chart MODALS (ChartTemplateSelector + PcPairingModal) — all 3 fixed
// here. The treatment-image "ดูรูปใหญ่" feature reuses the shared, portaled
// ImageLightbox (AV117 viewer) — consumer wiring locked below.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// The 3 fullscreen chart OVERLAYS (editor + 2 modals) — AV143 closed set.
const CHART_OVERLAYS = [
  { file: 'src/components/ChartCanvas.jsx', role: 'editor' },
  { file: 'src/components/ChartTemplateSelector.jsx', role: 'template-modal' },
  { file: 'src/components/tablet-chart/PcPairingModal.jsx', role: 'pairing-modal' },
];

const SRC = Object.fromEntries(CHART_OVERLAYS.map(o => [o.file, read(o.file)]));

describe('V123.SG — chart overlays use createPortal to document.body (AV143)', () => {
  it('SG1 — ChartCanvas (editor) imports createPortal + portals return to body', () => {
    const s = SRC['src/components/ChartCanvas.jsx'];
    expect(s).toMatch(/^import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"];/m);
    expect(s).toMatch(/return createPortal\(/);
    expect(s).toMatch(/document\.body/);
    expect(s).toMatch(/V123 \(2026-05-27\)/);
    // anti-regression: the editor's fixed-inset-0 div must NOT be returned bare
    expect(s).not.toMatch(/return\s*\(\s*\n\s*<div[^>]*className="[^"]*fixed inset-0[^"]*"/);
  });

  it('SG2 — ChartTemplateSelector (modal) imports createPortal + portals return to body', () => {
    const s = SRC['src/components/ChartTemplateSelector.jsx'];
    expect(s).toMatch(/^import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"];/m);
    expect(s).toMatch(/return createPortal\(/);
    expect(s).toMatch(/document\.body/);
    expect(s).toMatch(/V123 \(2026-05-27\)/);
    // the `if (!isOpen) return null` early-return is preserved (NOT portaled)
    expect(s).toMatch(/if \(!isOpen\) return null;/);
  });

  it('SG3 — PcPairingModal (modal) imports createPortal + portals return to body', () => {
    const s = SRC['src/components/tablet-chart/PcPairingModal.jsx'];
    expect(s).toMatch(/^import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"];/m);
    expect(s).toMatch(/return createPortal\(/);
    expect(s).toMatch(/document\.body/);
    expect(s).toMatch(/V123 \(2026-05-27\)/);
  });
});

describe('V123.CON — consumer wiring (shared ImageLightbox + treatment-image zoom)', () => {
  const chartSection = read('src/components/ChartSection.jsx');
  const tfp = read('src/components/TreatmentFormPage.jsx');
  const imageLightbox = read('src/components/ImageLightbox.jsx');

  it('CON1 — ImageLightbox is the shared, portaled viewer', () => {
    expect(imageLightbox).toMatch(/^import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"];/m);
    expect(imageLightbox).toMatch(/return createPortal\(/);
    expect(imageLightbox).toMatch(/document\.body/);
    // self-gates on empty src so callers can render it unconditionally
    expect(imageLightbox).toMatch(/if \(!src\) return null;/);
  });

  it('CON2 — ChartSection delegates to ImageLightbox (no more inner ChartLightbox/createPortal)', () => {
    expect(chartSection).toMatch(/import ImageLightbox from '\.\/ImageLightbox\.jsx';/);
    expect(chartSection).toMatch(/<ImageLightbox\b/);
    // the inner ChartLightbox function + ChartSection's own createPortal are gone
    expect(chartSection).not.toMatch(/function ChartLightbox/);
    expect(chartSection).not.toMatch(/createPortal/);
  });

  it('CON3 — TFP imports ImageLightbox + renders it', () => {
    expect(tfp).toMatch(/import ImageLightbox from '\.\/ImageLightbox\.jsx';/);
    expect(tfp).toMatch(/<ImageLightbox\b/);
    expect(tfp).toMatch(/const \[imageLightboxSrc, setImageLightboxSrc\] = useState\(''\)/);
  });

  it('CON4 — TFP treatment + lab image thumbnails have a Maximize2 view-large button', () => {
    // Maximize2 imported + at least 2 zoom buttons (treatment images + lab images)
    expect(tfp).toMatch(/\bMaximize2\b.*from 'lucide-react'|Maximize2 \} from 'lucide-react'/);
    const zoomHandlers = (tfp.match(/onClick=\{\(\) => setImageLightboxSrc\(img\.dataUrl\)\}/g) || []).length;
    expect(zoomHandlers).toBeGreaterThanOrEqual(2);
    const maximizeIcons = (tfp.match(/<Maximize2\b/g) || []).length;
    expect(maximizeIcons).toBeGreaterThanOrEqual(2);
  });
});

describe('V123.AV — AV143 invariant present + closed list', () => {
  const av = read('.agents/skills/audit-anti-vibe-code/SKILL.md');

  it('AV1 — AV143 entry present in audit-anti-vibe-code SKILL.md', () => {
    expect(av).toMatch(/### AV143 — Fullscreen chart overlays .* MUST createPortal to document\.body/);
  });

  it('AV2 — AV143 lists all 3 sanctioned chart overlays', () => {
    expect(av).toMatch(/ChartCanvas\.jsx/);
    expect(av).toMatch(/ChartTemplateSelector\.jsx/);
    expect(av).toMatch(/PcPairingModal\.jsx/);
  });

  it('AV3 — AV117 sanctioned list updated to the shared ImageLightbox', () => {
    expect(av).toMatch(/ImageLightbox\.jsx` — shared portaled fullscreen image viewer/);
  });
});

describe('V123.G — class-of-bug classifier (Rule P Tier 2)', () => {
  it('G1 — exactly 3 fullscreen chart overlays classified', () => {
    expect(CHART_OVERLAYS).toHaveLength(3);
  });

  it('G2 — every classified overlay actually portals in source', () => {
    for (const o of CHART_OVERLAYS) {
      expect(SRC[o.file]).toMatch(/return createPortal\(/);
      expect(SRC[o.file]).toMatch(/document\.body/);
    }
  });

  it('G3 — no chart overlay returns a bare `fixed inset-0` div without portal', () => {
    for (const o of CHART_OVERLAYS) {
      expect(SRC[o.file]).not.toMatch(/return\s*\(\s*\n\s*<div[^>]*className="[^"]*fixed inset-0[^"]*"/);
    }
  });
});
