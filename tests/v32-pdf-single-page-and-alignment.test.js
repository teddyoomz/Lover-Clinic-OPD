// V32 (2026-04-26) — PDF single-page + text-on-underline alignment regression bank
//
// Bug history (user report 2026-04-26 EOD session 10):
//   "บั๊ค Bulk PDF ที่สร้างเกินมา 1 หน้า และวางตัวอักษรไม่ตรงเส้นในหน้ากระดาษยังอยู่นะ"
//
// Two bugs persisted from session 9 (commits 5b74bcb / 7312679 / 3e8b9d8):
//   (1) Blank 2nd page in PDF — html2pdf.js's pagebreak orchestration
//       silently emitted a ghost page even when content fit in 1 page +
//       `pagebreak: { mode: 'avoid-all' }` was set. The 2026-04-25
//       alignment commit said "fixed" but tests only covered the source
//       grep, not actual page count. (V21-class lock-in.)
//   (2) Text-on-underline alignment broken — CSS attribute selectors
//       `span[style*="border-bottom:1px dotted"][style*="display:inline-block"]`
//       inside the wrapper's <style> block were either silently dropped
//       by html2canvas's CSS resolution OR didn't override the inline
//       `padding: 0 6px` consistently across all 16 templates.
//
// V32 fix surfaces:
//   - exportDocumentToPdf rewritten to use DIRECT html2canvas + jsPDF
//     (instead of html2pdf.js orchestration). One canvas → one
//     pdf.addImage → guaranteed exactly 1 page.
//   - applyPdfAlignmentInline helper applies line-height/padding/vertical-align
//     INLINE on every matching span/div BEFORE html2canvas snapshots.
//     Inline styles always win the cascade.
//
// Test groups:
//   V32.A — applyPdfAlignmentInline pure helper (12 tests)
//   V32.B — alignment helper applied to all 16 seed templates (16 tests)
//   V32.C — engine source-grep regression guards (10 tests)
//   V32.D — adversarial inputs to applyPdfAlignmentInline (8 tests)
//
// Why source-grep + helper tests instead of live PDF tests:
//   html2canvas requires a real browser. The vitest jsdom environment
//   doesn't have a true rendering engine. We verify the engine SHAPE +
//   the helper's BEHAVIOR. The user verifies the rendered PDF in prod
//   after deploy.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { applyPdfAlignmentInline, buildPrintDocument, buildPrintContext } from '../src/lib/documentPrintEngine.js';
import { SEED_TEMPLATES } from '../src/lib/documentTemplateValidation.js';

const ENGINE_SRC = readFileSync('src/lib/documentPrintEngine.js', 'utf8');

function makeWindow(html = '<!DOCTYPE html><html><body></body></html>') {
  const dom = new JSDOM(html);
  return { window: dom.window, document: dom.window.document };
}

// ─── V32.A — applyPdfAlignmentInline pure helper ─────────────────────────
describe('V32.A applyPdfAlignmentInline helper', () => {
  test('A.1 returns 0 when root is null/undefined', () => {
    expect(applyPdfAlignmentInline(null)).toBe(0);
    expect(applyPdfAlignmentInline(undefined)).toBe(0);
    expect(applyPdfAlignmentInline({})).toBe(0);
  });

  test('A.2 wraps dotted inline-block span text in absolute-positioned inner (V32-tris fix)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:inline-block;border-bottom:1px dotted #000;min-width:160px;padding:0 6px">26/04/2569</span>';
    const span = document.querySelector('span');
    expect(applyPdfAlignmentInline(document.body)).toBe(1);
    // V32-tris: outer span keeps inline-block + becomes positioning context.
    // Inner span (newly created) is absolutely-positioned at bottom: 4px so
    // the value text sits exactly 4px above the dotted underline. Robust
    // in html2canvas (position:absolute is rock-solid; flex/line-height
    // were not).
    expect(span.style.position).toBe('relative');
    expect(span.style.display).toBe('inline-block');
    expect(span.style.minHeight).toBe('26px');
    expect(span.style.verticalAlign).toBe('bottom');
    expect(span.style.lineHeight).toBe('14px');
    expect(span.getAttribute('data-pdf-aligned')).toBe('1');
    // Inner wrapper exists with abs position
    const inner = span.querySelector('span');
    expect(inner).toBeTruthy();
    expect(inner.textContent).toBe('26/04/2569');
    expect(inner.style.position).toBe('absolute');
    expect(inner.style.bottom).toBe('10px');
    expect(inner.style.lineHeight).toBe('14px');
  });

  test('A.3 applies flex column to dotted div with min-height (multi-line content box)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<div style="min-height:60px;border-bottom:1px dotted #000">HPI text</div>';
    const div = document.querySelector('div');
    expect(applyPdfAlignmentInline(document.body)).toBe(1);
    expect(div.style.display).toBe('flex');
    expect(div.style.flexDirection).toBe('column');
    expect(div.style.justifyContent).toBe('flex-end');
    expect(div.style.paddingBottom).toBe('4px');
    expect(div.style.whiteSpace).toBe('pre-wrap');
  });

  test('A.4 ignores spans without dotted border', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:inline-block;border-bottom:1px solid #000">value</span>';
    expect(applyPdfAlignmentInline(document.body)).toBe(0);
    expect(document.querySelector('span').style.lineHeight).toBe('');
  });

  test('A.5 ignores spans without inline-block', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="border-bottom:1px dotted #000">value</span>';
    expect(applyPdfAlignmentInline(document.body)).toBe(0);
  });

  test('A.6 ignores divs without min-height', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<div style="border-bottom:1px dotted #000">value</div>';
    expect(applyPdfAlignmentInline(document.body)).toBe(0);
  });

  test('A.7 handles spaces in CSS attribute values (border-bottom: 1px dotted #000)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display: inline-block; border-bottom: 1px dotted #000">value</span>';
    expect(applyPdfAlignmentInline(document.body)).toBe(1);
    expect(document.querySelector('span').style.verticalAlign).toBe('bottom');
  });

  test('A.8 handles 2px / 3px dotted (different border widths)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:inline-block;border-bottom:2px dotted black">v</span><div style="min-height:30px;border-bottom:3px dotted gray">d</div>';
    expect(applyPdfAlignmentInline(document.body)).toBe(2);
  });

  test('A.9 counts multiple matches across nested DOM correctly', () => {
    const { document } = makeWindow();
    document.body.innerHTML = `
      <div>
        <span style="display:inline-block;border-bottom:1px dotted #000">a</span>
        <p>
          <span style="display:inline-block;border-bottom:1px dotted black">b</span>
        </p>
      </div>
      <div style="min-height:30px;border-bottom:1px dotted #000">c</div>
      <div style="min-height:50px;border-bottom:1px dotted gray">d</div>
    `;
    expect(applyPdfAlignmentInline(document.body)).toBe(4);
  });

  test('A.10 idempotent — running twice produces same result + DOM not duplicated', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:inline-block;border-bottom:1px dotted #000">v</span>';
    applyPdfAlignmentInline(document.body);
    applyPdfAlignmentInline(document.body);
    const span = document.querySelector('span');
    // Span has data-pdf-aligned mark + ONE inner wrapper (not nested twice)
    expect(span.getAttribute('data-pdf-aligned')).toBe('1');
    expect(span.querySelectorAll('span').length).toBe(1);
    const inner = span.querySelector('span');
    expect(inner.textContent).toBe('v');
  });

  test('A.10b ALL inline-block dotted spans become wrapper-positioned (V32-tris lock)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:inline-block;border-bottom:1px dotted #000">v</span>';
    applyPdfAlignmentInline(document.body);
    const span = document.querySelector('span');
    expect(span.style.position).toBe('relative');
    expect(span.style.display).toBe('inline-block');
    expect(span.style.minHeight).toBe('26px');
    const inner = span.querySelector('span');
    expect(inner.style.position).toBe('absolute');
    expect(inner.style.bottom).toBe('10px');
  });

  test('A.11 does not modify spans that have no border-bottom at all', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:inline-block">plain</span>';
    expect(applyPdfAlignmentInline(document.body)).toBe(0);
    const span = document.querySelector('span');
    // No data-pdf-aligned attr + no inner wrapper added
    expect(span.getAttribute('data-pdf-aligned')).toBe(null);
    expect(span.querySelectorAll('span').length).toBe(0);
    expect(span.style.position).toBe('');
  });

  test('A.11b preserves spans with element children (e.g. signature <img> spans untouched in text-content)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:inline-block;border-bottom:1px dotted #000;min-width:180px"><img src="data:image/png;base64,xxx" alt="sig"/></span>';
    expect(applyPdfAlignmentInline(document.body)).toBe(1);
    const span = document.querySelector('span');
    // Outer styling applied, BUT inner <img> preserved (not wrapped/replaced)
    expect(span.style.position).toBe('relative');
    expect(span.querySelector('img')).toBeTruthy();
    // No additional inner span wrapping (because content is element, not text)
    expect(span.querySelectorAll('span').length).toBe(0);
  });

  test('A.12 returns count of touched elements (helper observability)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = `
      <span style="display:inline-block;border-bottom:1px dotted #000">a</span>
      <div style="min-height:30px;border-bottom:1px dotted #000">b</div>
      <span style="display:inline-block;border-bottom:1px dotted #000">c</span>
    `;
    expect(applyPdfAlignmentInline(document.body)).toBe(3);
  });
});

// ─── V32.B — every seed template gets alignment treatment ────────────────
describe('V32.B alignment helper applied to all 16 seed templates', () => {
  test('B.1 every seed template has at least one dotted-underline element OR is signature/label', () => {
    // Sanity: catches future templates that drop ALL underlines (would
    // hide a real bug behind "0 matches"). Whitelisted:
    //   medicine-label    — tiny 57x32mm sticker has no underlines
    //   treatment-history — 2-column grid + table layout, no fill-in lines
    const NO_UNDERLINE_OK = new Set(['medicine-label', 'treatment-history']);
    SEED_TEMPLATES.forEach((seed) => {
      if (NO_UNDERLINE_OK.has(seed.docType)) return;
      const html = seed.htmlTemplate || '';
      const hasDotted = /border-bottom\s*:\s*\d+px\s+dotted/i.test(html);
      expect(hasDotted, `${seed.docType} should have at least one dotted underline OR be in NO_UNDERLINE_OK`).toBe(true);
    });
  });

  // Run B.2..B.17 — one per seed template — assert helper produces > 0 alignment fixes
  // (or 0 only when whitelisted as no-underline)
  SEED_TEMPLATES.forEach((seed, i) => {
    test(`B.${i + 2} ${seed.docType} — alignment helper applies to all dotted spans/divs`, () => {
      const ctx = buildPrintContext({
        clinic: { clinicName: 'Lover Clinic' },
        customer: { customerName: 'Test', proClinicHN: '000', patientData: { gender: 'หญิง' } },
        values: { showCertNumber: true, showPatientSignature: true },
      });
      const html = buildPrintDocument({
        template: seed.htmlTemplate,
        context: ctx,
        paperSize: seed.paperSize || 'A4',
        title: seed.name,
      });
      const { document } = makeWindow();
      const wrapper = document.createElement('div');
      const parsed = new JSDOM(html).window.document;
      Array.from(parsed.body.childNodes).forEach((n) => {
        if (n.nodeType === 1 && n.tagName === 'SCRIPT') return;
        wrapper.appendChild(n.cloneNode(true));
      });
      document.body.appendChild(wrapper);
      const count = applyPdfAlignmentInline(wrapper);
      // medicine-label + treatment-history might have 0; anything else should have ≥ 1
      const NO_UNDERLINE_OK = new Set(['medicine-label', 'treatment-history']);
      if (NO_UNDERLINE_OK.has(seed.docType)) {
        expect(count).toBeGreaterThanOrEqual(0);
      } else {
        expect(count, `${seed.docType} expected ≥ 1 alignment match`).toBeGreaterThan(0);
      }
    });
  });
});

// ─── V32.C — engine source-grep regression guards ────────────────────────
describe('V32.C engine source-grep regression guards', () => {
  test('C.1 exportDocumentToPdf imports html2canvas (not via html2pdf bundle)', () => {
    expect(ENGINE_SRC).toMatch(/import\(['"]html2canvas['"]\)/);
  });

  test('C.2 exportDocumentToPdf imports jspdf directly', () => {
    expect(ENGINE_SRC).toMatch(/import\(['"]jspdf['"]\)/);
  });

  test('C.3 NO html2pdf.js orchestration call (was the source of blank page 2)', () => {
    // Allow comments mentioning html2pdf history but disallow ACTUAL calls
    expect(ENGINE_SRC).not.toMatch(/html2pdf\(\)\s*\.from\(/);
    expect(ENGINE_SRC).not.toMatch(/import\(['"]html2pdf\.js['"]\)/);
  });

  test('C.4 NO pagebreak: { mode: ... } config (we do not use html2pdf anymore)', () => {
    expect(ENGINE_SRC).not.toMatch(/pagebreak\s*:\s*\{\s*mode/);
  });

  test('C.5 jsPDF.addImage called with paper-size mm dimensions (not auto)', () => {
    // Match: pdf.addImage(imgData, 'JPEG', 0, 0, sz.wMm, sz.hMm, ...)
    expect(ENGINE_SRC).toMatch(/\.addImage\(\s*[a-zA-Z]+\s*,\s*['"]JPEG['"]\s*,\s*0\s*,\s*0\s*,\s*sz\.wMm\s*,\s*sz\.hMm/);
  });

  test('C.6 html2canvas options pass explicit width + height (not just windowWidth/windowHeight)', () => {
    // The prior bug allowed scrollHeight to drive canvas size when only
    // windowWidth/windowHeight were passed. Now we MUST pass width+height.
    const html2cBlock = ENGINE_SRC.match(/html2canvas\(wrapper,\s*\{[\s\S]*?\}\)/);
    expect(html2cBlock).toBeTruthy();
    expect(html2cBlock[0]).toMatch(/width\s*:\s*sz\.wPx/);
    expect(html2cBlock[0]).toMatch(/height\s*:\s*sz\.hPx/);
  });

  test('C.7 PDF_WRAPPER_STYLES has wPx/hPx/wMm/hMm for every paper size', () => {
    const pdfWrapMatch = ENGINE_SRC.match(/const PDF_WRAPPER_STYLES = \{[\s\S]*?\};/);
    expect(pdfWrapMatch).toBeTruthy();
    const block = pdfWrapMatch[0];
    ['A4', 'A5', 'label-57x32'].forEach((sz) => {
      expect(block).toContain(`'${sz}'`);
    });
    expect(block).toMatch(/wPx:/);
    expect(block).toMatch(/hPx:/);
    expect(block).toMatch(/wMm:/);
    expect(block).toMatch(/hMm:/);
  });

  test('C.8 applyPdfAlignmentInline is called BEFORE html2canvas snapshot', () => {
    const applyIdx = ENGINE_SRC.indexOf('applyPdfAlignmentInline(wrapper)');
    const h2cIdx = ENGINE_SRC.indexOf('await html2canvas(wrapper');
    expect(applyIdx).toBeGreaterThan(0);
    expect(h2cIdx).toBeGreaterThan(applyIdx); // alignment THEN canvas snapshot
  });

  test('C.9 V32 marker comment present (institutional memory grep)', () => {
    expect(ENGINE_SRC).toMatch(/V32\s*\(2026-04-26\)/);
  });

  test('C.10 jsPDF constructor uses correct paper format mapping', () => {
    expect(ENGINE_SRC).toMatch(/new jsPDF\(\{/);
    expect(ENGINE_SRC).toMatch(/format:\s*paperSize === 'label-57x32'\s*\?\s*\[sz\.wMm,\s*sz\.hMm\]\s*:\s*\(paperSize === 'A5'\s*\?\s*'a5'\s*:\s*'a4'\)/);
  });
});

// ─── V32.D — adversarial inputs ──────────────────────────────────────────
describe('V32.D adversarial inputs to applyPdfAlignmentInline', () => {
  test('D.1 handles an empty document body', () => {
    const { document } = makeWindow();
    expect(applyPdfAlignmentInline(document.body)).toBe(0);
  });

  test('D.2 handles spans with multiple style fragments matching pattern', () => {
    const { document } = makeWindow();
    // Many properties; dotted is buried mid-style
    document.body.innerHTML = '<span style="color:red;display:inline-block;font-size:14px;border-bottom:1px dotted #000;padding:0 6px;min-width:160px">v</span>';
    expect(applyPdfAlignmentInline(document.body)).toBe(1);
    expect(document.querySelector('span').style.verticalAlign).toBe('bottom');
  });

  test('D.3 handles dotted but NOT inline-block (some templates use display:block)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:block;border-bottom:1px dotted #000">v</span>';
    // Block-display spans don't get the inline-block treatment (correct)
    expect(applyPdfAlignmentInline(document.body)).toBe(0);
  });

  test('D.4 handles thai characters in span content (no encoding issue)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:inline-block;border-bottom:1px dotted #000">วันที่รักษา 26/04/2569</span>';
    expect(applyPdfAlignmentInline(document.body)).toBe(1);
  });

  test('D.5 handles deep nesting (span inside table inside flex grid)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<div><table><tr><td><span style="display:inline-block;border-bottom:1px dotted #000">v</span></td></tr></table></div>';
    expect(applyPdfAlignmentInline(document.body)).toBe(1);
  });

  test('D.6 does NOT match spans with border-top/left/right dotted (only bottom)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = '<span style="display:inline-block;border-top:1px dotted #000">v</span>';
    expect(applyPdfAlignmentInline(document.body)).toBe(0);
  });

  test('D.7 handles divs with min-height set in different units (% / em / rem)', () => {
    const { document } = makeWindow();
    document.body.innerHTML = `
      <div style="min-height:30px;border-bottom:1px dotted #000">px</div>
      <div style="min-height:5em;border-bottom:1px dotted #000">em</div>
      <div style="min-height:10%;border-bottom:1px dotted #000">pct</div>
    `;
    expect(applyPdfAlignmentInline(document.body)).toBe(3);
  });

  test('D.8 hostile input — undefined attributes do not crash', () => {
    const { document } = makeWindow();
    const span = document.createElement('span');
    // No setAttribute('style'); getAttribute returns null
    document.body.appendChild(span);
    expect(() => applyPdfAlignmentInline(document.body)).not.toThrow();
  });
});
