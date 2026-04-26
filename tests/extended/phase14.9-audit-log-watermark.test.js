// ─── Phase 14.9 — Audit Log + Watermark full-flow simulator ─────────────
// Per Rule I: chain test for new user-visible flow.
//   AL.A — buildPrintDocument watermark rendering
//   AL.B — watermark style invariants (z-index, color, rotation, print-color-adjust)
//   AL.C — recordDocumentPrint payload shape (source-grep + simulator)
//   AL.D — DocumentPrintModal wires recordDocumentPrint into both handlers
//   AL.E — firestore.rules append-only contract for be_document_prints
//   AL.F — adversarial inputs (XSS via watermark string, oversized text)
//   AL.G — listDocumentPrints filtering + sorting

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildPrintDocument,
  buildPrintContext,
} from '../src/lib/documentPrintEngine.js';

const ROOT = join(__dirname, '..');
const engineFile = readFileSync(join(ROOT, 'src/lib/documentPrintEngine.js'), 'utf8');
const modalFile = readFileSync(join(ROOT, 'src/components/backend/DocumentPrintModal.jsx'), 'utf8');
const backendFile = readFileSync(join(ROOT, 'src/lib/backendClient.js'), 'utf8');
const rulesFile = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');

// ─── AL.A — buildPrintDocument watermark rendering ───────────────────
describe('AL.A — watermark rendering', () => {
  it('A.1 — empty watermark omits the overlay div', () => {
    const html = buildPrintDocument({
      template: '<p>body</p>',
      context: {},
      watermark: '',
    });
    // CSS rule always exists; only the actual overlay div should be absent
    expect(html).not.toMatch(/<div class="doc-watermark"/);
  });

  it('A.2 — non-empty watermark adds .doc-watermark overlay', () => {
    const html = buildPrintDocument({
      template: '<p>body</p>',
      context: {},
      watermark: 'DRAFT',
    });
    expect(html).toContain('class="doc-watermark"');
    expect(html).toContain('>DRAFT<');
    expect(html).toContain('aria-hidden="true"');
  });

  it('A.3 — watermark text is HTML-escaped (defends against XSS)', () => {
    const html = buildPrintDocument({
      template: '<p>body</p>',
      context: {},
      watermark: '<script>alert(1)</script>',
    });
    // Escaped content should appear once
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // No raw script tag inside the watermark span
    const wm = html.match(/<span>[^<]*<\/span>/);
    expect(wm).toBeTruthy();
    expect(wm[0]).not.toContain('<script>');
  });

  it('A.4 — Thai watermark text renders unchanged', () => {
    const html = buildPrintDocument({
      template: '<p>body</p>',
      context: {},
      watermark: 'ฉบับร่าง',
    });
    expect(html).toContain('ฉบับร่าง');
  });

  it('A.5 — watermark renders BEFORE the body content', () => {
    const html = buildPrintDocument({
      template: '<p data-id="content">body</p>',
      context: {},
      watermark: 'DRAFT',
    });
    const wmIdx = html.indexOf('doc-watermark');
    const bodyIdx = html.indexOf('data-id="content"');
    expect(wmIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(wmIdx).toBeLessThan(bodyIdx);
  });

  it('A.6 — watermark presence works with all paper sizes', () => {
    for (const sz of ['A4', 'A5', 'label-57x32']) {
      const html = buildPrintDocument({
        template: '<p>x</p>',
        context: {},
        watermark: 'COPY',
        paperSize: sz,
      });
      expect(html).toContain('doc-watermark');
      expect(html).toContain('COPY');
    }
  });

  it('A.7 — label-57x32 paper size uses smaller watermark font (14px not 120px)', () => {
    const html = buildPrintDocument({
      template: '<p>x</p>',
      context: {},
      watermark: 'C',
      paperSize: 'label-57x32',
    });
    expect(html).toMatch(/doc-watermark[\s\S]*?font-size:\s*14px/);
  });

  it('A.8 — null/undefined watermark behaves like empty (no overlay)', () => {
    const html1 = buildPrintDocument({ template: '<p>x</p>', context: {}, watermark: null });
    const html2 = buildPrintDocument({ template: '<p>x</p>', context: {}, watermark: undefined });
    expect(html1).not.toMatch(/<div class="doc-watermark"/);
    expect(html2).not.toMatch(/<div class="doc-watermark"/);
  });
});

// ─── AL.B — watermark style invariants ──────────────────────────────
describe('AL.B — watermark style invariants', () => {
  const html = buildPrintDocument({
    template: '<p>x</p>',
    context: {},
    watermark: 'STAMP',
  });

  it('B.1 — z-index 9999 (above all body content)', () => {
    expect(html).toMatch(/\.doc-watermark[\s\S]*?z-index:\s*9999/);
  });

  it('B.2 — pointer-events:none (does not block interaction)', () => {
    expect(html).toMatch(/\.doc-watermark[\s\S]*?pointer-events:\s*none/);
  });

  it('B.3 — print-color-adjust:exact (stamps render even without bg-print)', () => {
    expect(html).toMatch(/print-color-adjust:\s*exact/);
    // -webkit prefix for Chrome
    expect(html).toMatch(/-webkit-print-color-adjust:\s*exact/);
  });

  it('B.4 — rotation -30deg + transparent red color (faithful to industry)', () => {
    expect(html).toMatch(/transform:\s*rotate\(-30deg\)/);
    expect(html).toMatch(/color:\s*rgba\(220,\s*38,\s*38,\s*0\.18\)/);
  });

  it('B.5 — white-space:nowrap (long stamps stay on one line)', () => {
    expect(html).toMatch(/white-space:\s*nowrap/);
  });

  it('B.6 — user-select:none (text not selectable in print preview)', () => {
    expect(html).toMatch(/user-select:\s*none/);
  });
});

// ─── AL.C — recordDocumentPrint payload shape ────────────────────────
describe('AL.C — recordDocumentPrint source-grep contract', () => {
  it('C.1 — function exists in backendClient.js', () => {
    expect(backendFile).toMatch(/export async function recordDocumentPrint/);
  });

  it('C.2 — printId uses crypto.getRandomValues (Rule C2 — no Math.random)', () => {
    const block = backendFile.match(/export async function recordDocumentPrint[\s\S]*?^export /m)?.[0] || '';
    expect(block).toContain('crypto.getRandomValues');
    expect(block).not.toContain('Math.random');
  });

  it('C.3 — payload includes all 14 expected fields', () => {
    const block = backendFile.match(/export async function recordDocumentPrint[\s\S]*?^export /m)?.[0] || '';
    const fields = [
      'printId', 'templateId', 'templateName', 'docType',
      'customerId', 'customerHN', 'customerName',
      'action', 'language', 'paperSize',
      'staffUid', 'staffEmail', 'staffName', 'ts',
    ];
    for (const f of fields) {
      // Field appears either as `field: value` or shorthand `field,`
      expect(block).toMatch(new RegExp(`${f}[:,]`));
    }
  });

  it('C.4 — action defaults to "print" if not "pdf"', () => {
    const block = backendFile.match(/export async function recordDocumentPrint[\s\S]*?^export /m)?.[0] || '';
    expect(block).toMatch(/payload\.action\s*===\s*['"]pdf['"]\s*\?\s*['"]pdf['"]\s*:\s*['"]print['"]/);
  });

  it('C.5 — staffUid/staffEmail derived from auth.currentUser', () => {
    const block = backendFile.match(/export async function recordDocumentPrint[\s\S]*?^export /m)?.[0] || '';
    expect(block).toMatch(/auth\?\.currentUser/);
    expect(block).toMatch(/u\?\.uid/);
    expect(block).toMatch(/u\?\.email/);
  });

  it('C.6 — sourceVersion marker for audit grep', () => {
    const block = backendFile.match(/export async function recordDocumentPrint[\s\S]*?^export /m)?.[0] || '';
    expect(block).toContain("sourceVersion: 'phase-14.9'");
  });

  it('C.7 — uses setDoc with merge:false (full overwrite, idempotent on retry)', () => {
    const block = backendFile.match(/export async function recordDocumentPrint[\s\S]*?^export /m)?.[0] || '';
    expect(block).toMatch(/setDoc\([\s\S]*?\{\s*merge:\s*false\s*\}\)/);
  });

  it('C.8 — Phase 14.9 marker in section header', () => {
    expect(backendFile).toMatch(/Phase 14\.9.*Document Print Audit Log/);
  });
});

// ─── AL.D — DocumentPrintModal wiring ───────────────────────────────
describe('AL.D — DocumentPrintModal recordDocumentPrint wiring', () => {
  it('D.1 — imports recordDocumentPrint from backendClient', () => {
    expect(modalFile).toMatch(/recordDocumentPrint[^}]*}\s*from\s*['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });

  it('D.2 — handlePrint calls recordDocumentPrint after successful printDocument', () => {
    const block = modalFile.match(/const handlePrint\s*=[\s\S]*?\n  \};/)?.[0] || '';
    expect(block).toContain('recordDocumentPrint');
    // Ensure it comes AFTER the printDocument call
    const printIdx = block.indexOf('printDocument(');
    const recIdx = block.indexOf('recordDocumentPrint(');
    expect(recIdx).toBeGreaterThan(printIdx);
  });

  it('D.3 — handleExportPdf calls recordDocumentPrint after successful PDF', () => {
    const block = modalFile.match(/const handleExportPdf\s*=[\s\S]*?finally[\s\S]*?\}\s*\}/)?.[0] || '';
    expect(block).toContain('recordDocumentPrint');
    const pdfIdx = block.indexOf('exportDocumentToPdf(');
    const recIdx = block.indexOf('recordDocumentPrint(');
    expect(recIdx).toBeGreaterThan(pdfIdx);
  });

  it('D.4 — print log call is fire-and-forget (.catch attached, non-fatal)', () => {
    // Both handlers should attach .catch so a logging failure does NOT
    // surface as a print/PDF failure to the user.
    const printBlock = modalFile.match(/const handlePrint\s*=[\s\S]*?\n  \};/)?.[0] || '';
    const pdfBlock = modalFile.match(/const handleExportPdf\s*=[\s\S]*?finally[\s\S]*?\}\s*\}/)?.[0] || '';
    expect(printBlock).toMatch(/recordDocumentPrint\([\s\S]*?\)\.catch/);
    expect(pdfBlock).toMatch(/recordDocumentPrint\([\s\S]*?\)\.catch/);
  });

  it('D.5 — print log carries action="print" for handlePrint', () => {
    const block = modalFile.match(/const handlePrint\s*=[\s\S]*?\n  \};/)?.[0] || '';
    expect(block).toMatch(/action:\s*['"]print['"]/);
  });

  it('D.6 — print log carries action="pdf" for handleExportPdf', () => {
    const block = modalFile.match(/const handleExportPdf\s*=[\s\S]*?finally[\s\S]*?\}\s*\}/)?.[0] || '';
    expect(block).toMatch(/action:\s*['"]pdf['"]/);
  });

  it('D.7 — Phase 14.9 marker in modal', () => {
    expect(modalFile).toMatch(/Phase 14\.9/);
  });
});

// ─── AL.E — firestore.rules append-only contract ────────────────────
describe('AL.E — firestore.rules contract for be_document_prints', () => {
  it('E.1 — has rule for be_document_prints', () => {
    expect(rulesFile).toMatch(/match\s+\/be_document_prints\/\{printId\}/);
  });

  it('E.2 — read + create allowed for clinic staff', () => {
    const ruleBlock = rulesFile.match(/match\s+\/be_document_prints\/\{printId\}\s*\{[\s\S]*?\n\s{0,8}\}/)?.[0] || '';
    expect(ruleBlock).toMatch(/allow read:\s*if isClinicStaff\(\)/);
    expect(ruleBlock).toMatch(/allow create:\s*if isClinicStaff\(\)/);
  });

  it('E.3 — update + delete forbidden (append-only ledger)', () => {
    const ruleBlock = rulesFile.match(/match\s+\/be_document_prints\/\{printId\}\s*\{[\s\S]*?\n\s{0,8}\}/)?.[0] || '';
    expect(ruleBlock).toMatch(/allow update,\s*delete:\s*if false/);
  });

  it('E.4 — V19/V31 lesson comment present (append-only contract enforced at rule layer)', () => {
    const ruleBlock = rulesFile.match(/Phase 14\.9 Document Print Audit Log[\s\S]*?match\s+\/be_document_prints[\s\S]*?\}/)?.[0] || '';
    expect(ruleBlock).toMatch(/append-only/);
    expect(ruleBlock).toMatch(/V31/);
  });
});

// ─── AL.F — adversarial inputs ──────────────────────────────────────
describe('AL.F — adversarial inputs (XSS + oversize)', () => {
  it('F.1 — watermark with <img onerror> escapes the bracket', () => {
    const html = buildPrintDocument({
      template: '<p>x</p>',
      context: {},
      watermark: '<img src=x onerror=alert(1)>',
    });
    // Escaped — not rendered as actual <img>
    expect(html).toContain('&lt;img');
    // Verify the watermark span doesn't contain a raw img tag
    const wmContent = html.match(/<div class="doc-watermark"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
    expect(wmContent).not.toMatch(/<img/);
  });

  it('F.2 — watermark with quotes does not break the span attribute', () => {
    const html = buildPrintDocument({
      template: '<p>x</p>',
      context: {},
      watermark: 'Don\'t "print"',
    });
    // Should escape both single and double quotes for safety
    expect(html).toContain('&#39;');
    expect(html).toContain('&quot;');
  });

  it('F.3 — extremely long watermark string still renders (no truncation at engine level)', () => {
    const longText = 'STAMP'.repeat(100);
    const html = buildPrintDocument({
      template: '<p>x</p>',
      context: {},
      watermark: longText,
    });
    expect(html).toContain(longText);
  });

  it('F.4 — buildPrintContext + watermark + signature all coexist', () => {
    const ctx = buildPrintContext({
      values: {
        sig: 'data:image/png;base64,iVBORw0KGgoAAAANSU=',
      },
    });
    const html = buildPrintDocument({
      template: '<div>{{{sig}}}</div>',
      context: ctx,
      watermark: 'DRAFT',
    });
    // Both watermark and signature image render
    expect(html).toContain('doc-watermark');
    expect(html).toContain('>DRAFT<');
    expect(html).toContain('<img src="data:image/png');
  });
});

// ─── AL.G — listDocumentPrints contract ─────────────────────────────
describe('AL.G — listDocumentPrints source-grep', () => {
  it('G.1 — function exists', () => {
    expect(backendFile).toMatch(/export async function listDocumentPrints/);
  });

  it('G.2 — supports limit + customerId + docType filters', () => {
    const block = backendFile.match(/export async function listDocumentPrints[\s\S]*?^export |export async function listDocumentPrints[\s\S]{0,1500}/)?.[0] || '';
    expect(block).toMatch(/limit:\s*maxLimit/);
    expect(block).toContain('customerId');
    expect(block).toContain('docType');
  });

  it('G.3 — sorts newest-first by ts', () => {
    const block = backendFile.match(/export async function listDocumentPrints[\s\S]*?^export |export async function listDocumentPrints[\s\S]{0,1500}/)?.[0] || '';
    // Either bt-at OR localeCompare reversed
    expect(block).toMatch(/sort\(/);
    expect(block).toMatch(/bt\.localeCompare\(at\)|bt\s*-\s*at/);
  });

  it('G.4 — caps result at maxLimit', () => {
    const block = backendFile.match(/export async function listDocumentPrints[\s\S]*?^export |export async function listDocumentPrints[\s\S]{0,1500}/)?.[0] || '';
    expect(block).toMatch(/slice\(0,\s*Math\.max\(1,\s*maxLimit\)\)/);
  });
});
