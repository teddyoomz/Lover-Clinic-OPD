// ─── Phase 14.10 — BulkPrintModal full-flow tests ─────────────────────
// Per Rule I: chain test for new user-visible flow.
//   BP.A — Component exists + imports + V21 anti-regression markers
//   BP.B — 3-step flow (PICK → FILL → RUN) + step transitions
//   BP.C — Sequential PDF generation + audit log per customer
//   BP.D — Progress bar + failed list rendering
//   BP.E — Customer name resolution fallback chain
//   BP.F — Adversarial inputs (empty customers, missing fields)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const modalFile = readFileSync(join(ROOT, 'src/components/backend/BulkPrintModal.jsx'), 'utf8');

// ─── BP.A — component shape ────────────────────────────────────────
describe('BP.A — BulkPrintModal shape', () => {
  it('A.1 — file exists + default export', () => {
    expect(modalFile).toContain('export default function BulkPrintModal');
  });

  it('A.2 — accepts customers + clinicSettings + onClose props', () => {
    expect(modalFile).toMatch(/BulkPrintModal\(\{\s*customers[\s\S]*?clinicSettings[\s\S]*?onClose/);
  });

  it('A.3 — imports listDocumentTemplates + recordDocumentPrint from backendClient', () => {
    expect(modalFile).toMatch(/listDocumentTemplates[\s\S]*?recordDocumentPrint[\s\S]*?from\s*['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });

  it('A.4 — imports exportDocumentToPdf from documentPrintEngine', () => {
    expect(modalFile).toMatch(/exportDocumentToPdf[\s\S]*?from\s*['"]\.\.\/\.\.\/lib\/documentPrintEngine\.js['"]/);
  });

  it('A.5 — imports DOC_TYPE_LABELS from validator', () => {
    expect(modalFile).toContain('DOC_TYPE_LABELS');
  });

  it('A.6 — declares 3 steps (pick / fill / run)', () => {
    expect(modalFile).toContain("const STEP_PICK = 'pick'");
    expect(modalFile).toContain("const STEP_FILL = 'fill'");
    expect(modalFile).toContain("const STEP_RUN  = 'run'");
  });

  it('A.7 — has data-testid for E2E', () => {
    expect(modalFile).toContain('data-testid="bulk-print-modal"');
    expect(modalFile).toContain('data-testid="bulk-print-run"');
    expect(modalFile).toContain('data-testid="bulk-print-progress"');
    expect(modalFile).toContain('data-testid="bulk-print-progress-bar"');
  });

  it('A.8 — Phase 14.10 marker', () => {
    expect(modalFile).toContain('Phase 14.10');
  });
});

// ─── BP.B — flow + transitions ─────────────────────────────────────
describe('BP.B — flow transitions', () => {
  it('B.1 — handlePick selects template + advances to fill step', () => {
    const block = modalFile.match(/const handlePick\s*=[\s\S]*?\n  \};/)?.[0] || '';
    expect(block).toContain('setSelected(t)');
    expect(block).toContain('setStep(STEP_FILL)');
  });

  it('B.2 — handlePick initializes signature defaults to empty + checkbox to ☐', () => {
    const block = modalFile.match(/const handlePick\s*=[\s\S]*?\n  \};/)?.[0] || '';
    expect(block).toMatch(/f\.type\s*===\s*['"]signature['"]/);
    expect(block).toMatch(/f\.type\s*===\s*['"]checkbox['"]/);
  });

  it('B.3 — handleBack from FILL → PICK clears selected', () => {
    const block = modalFile.match(/const handleBack\s*=[\s\S]*?\};/)?.[0] || '';
    expect(block).toContain('setStep(STEP_PICK)');
    expect(block).toContain('setSelected(null)');
  });

  it('B.4 — handleBack from RUN → FILL preserves selected', () => {
    const block = modalFile.match(/const handleBack\s*=[\s\S]*?\};/)?.[0] || '';
    // Going back from RUN does NOT clear selected (caller may want to retry)
    expect(block).toMatch(/STEP_RUN[\s\S]*?setStep\(STEP_FILL\)/);
  });

  it('B.5 — handleRun guards against missing customers', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?\};/)?.[0] || '';
    expect(block).toMatch(/customers\.length\s*===\s*0/);
    expect(block).toContain('ไม่มีลูกค้า');
  });

  it('B.6 — handleRun guards against missing template', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?\};/)?.[0] || '';
    expect(block).toContain('if (!selected) return');
  });
});

// ─── BP.C — sequential PDF + audit log ─────────────────────────────
describe('BP.C — sequential PDF generation', () => {
  it('C.1 — handleRun loops with for...let i (sequential, not Promise.all)', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toMatch(/for\s*\(\s*let\s+i\s*=\s*0/);
  });

  it('C.2 — each iteration awaits exportDocumentToPdf', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toMatch(/await\s+exportDocumentToPdf/);
  });

  it('C.3 — each iteration calls recordDocumentPrint with action:"pdf"', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toContain('recordDocumentPrint');
    expect(block).toMatch(/action:\s*['"]pdf['"]/);
  });

  it('C.4 — recordDocumentPrint failure is non-fatal (.catch attached)', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toMatch(/recordDocumentPrint\([\s\S]*?\)\.catch\(/);
  });

  it('C.5 — exportDocumentToPdf failure is caught + recorded in failed list', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toMatch(/catch\s*\(\s*e\s*\)/);
    expect(block).toContain('failed:');
  });

  it('C.6 — sleep between iterations (browser flush + rate-limit guard)', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toMatch(/setTimeout\([\s\S]*?,\s*250\)/);
  });

  it('C.7 — progress.done increments after each customer (success or failure)', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    // Both success path AND failure path should bump done
    expect(block).toMatch(/done:\s*p\.done\s*\+\s*1/);
  });
});

// ─── BP.D — progress UI ────────────────────────────────────────────
describe('BP.D — progress UI', () => {
  it('D.1 — progress bar width derived from done/total ratio', () => {
    expect(modalFile).toMatch(/done\s*\/\s*progress\.total/);
    expect(modalFile).toMatch(/Math\.round\(\(progress\.done/);
  });

  it('D.2 — progress shows currentName during run', () => {
    expect(modalFile).toContain('progress.currentName');
  });

  it('D.3 — failed list renders with names + messages', () => {
    expect(modalFile).toMatch(/progress\.failed\.map/);
    expect(modalFile).toMatch(/{f\.name}/);
    expect(modalFile).toMatch(/{f\.message}/);
  });

  it('D.4 — done state shows success banner with count', () => {
    expect(modalFile).toContain('CheckCircle2');
    expect(modalFile).toMatch(/progress\.done\s*-\s*progress\.failed\.length/);
  });

  it('D.5 — close button disabled while running', () => {
    expect(modalFile).toMatch(/disabled=\{running\}/);
  });
});

// ─── BP.E — customer name fallback ─────────────────────────────────
describe('BP.E — customer name resolution', () => {
  it('E.1 — fallback chain: customerName → name → patientData → "customer N"', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toContain('customer?.customerName');
    expect(block).toContain('customer?.name');
    expect(block).toContain('customer?.patientData');
    expect(block).toMatch(/customer\s+\$\{i\s*\+\s*1\}/);
  });

  it('E.2 — customer name flows into recordDocumentPrint payload', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toMatch(/customerName:\s*name/);
  });
});

// ─── BP.F — adversarial inputs ─────────────────────────────────────
describe('BP.F — adversarial', () => {
  it('F.1 — empty customers array shows error message and does NOT advance to run', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toMatch(/setError\([^)]*ไม่มีลูกค้า/);
    expect(block).toMatch(/return\s*;/);
  });

  it('F.2 — Array.isArray guard before iteration', () => {
    const block = modalFile.match(/const handleRun\s*=[\s\S]*?setRunning\(false\);[\s\S]*?\};/)?.[0] || '';
    expect(block).toMatch(/Array\.isArray\(customers\)/);
  });

  it('F.3 — listDocumentTemplates loaded with activeOnly:true (no archived templates)', () => {
    expect(modalFile).toMatch(/listDocumentTemplates\(\{\s*activeOnly:\s*true\s*\}\)/);
  });

  it('F.4 — load failure caught + surfaced as error', () => {
    expect(modalFile).toMatch(/setError\(e\.message\s*\|\|\s*['"]โหลดเทมเพลตล้มเหลว/);
  });

  it('F.5 — fill step hides signature fields (signatures need per-customer canvas, not bulk-shared)', () => {
    expect(modalFile).toMatch(/f\.type\s*!==\s*['"]signature['"]/);
  });

  it('F.6 — fill step hides hidden:true fields (auto-populated from context)', () => {
    expect(modalFile).toMatch(/!f\.hidden/);
  });
});
