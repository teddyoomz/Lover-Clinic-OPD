/**
 * Phase 29.23 — source-grep regression locks.
 *
 * Prevents drift on:
 *   - RecallRow customer-name <a target="_blank"> pattern
 *   - RecallRow imports Pencil + has onEdit prop
 *   - RecallEditModal exists + exported
 *   - deleteRecallCase exports from backendClient + scopedDataLayer
 *   - 3 surface wires (RecallTab + RecallFrontendView + RecallCard)
 *     pass onEdit to RecallList (or RecallRow directly for CDV)
 *   - RecallCasesAdminPanel imports deleteRecallCase
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

describe('Phase 29.23 SG1 — RecallRow customer-name + edit', () => {
  const src = read('src/components/backend/recall/RecallRow.jsx');

  it('SG1.1 — imports Pencil from lucide-react', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bPencil\b[^}]*\}\s*from\s*['"]lucide-react['"]/);
  });

  it('SG1.2 — has onEdit prop in destructure', () => {
    expect(src).toMatch(/onEdit\b/);
    expect(src).toMatch(/onEdit\?\.\(recall\.id\)|onEdit\(recall\.id\)/);
  });

  it('SG1.3 — customer-name uses <a href=...customer={encoded} target=_blank rel=noopener', () => {
    expect(src).toMatch(/href=\{\s*`\/\?backend=1&customer=\$\{encodeURIComponent\(/);
    expect(src).toMatch(/target="_blank"/);
    expect(src).toMatch(/rel="noopener noreferrer"/);
  });

  it('SG1.4 — customer-name <a> has e.stopPropagation (no parent bubble)', () => {
    // Match the entire <a ...> opening tag block (which contains both the
    // testid AND onClick={(e) => e.stopPropagation()}). stopPropagation may
    // appear BEFORE the testid in source-attribute order, so a forward-only
    // match from testid → </a> misses it.
    const snippet = src.match(/<a\s[\s\S]+?data-testid=\{`recall-customer-link-[\s\S]+?>/);
    expect(snippet).toBeTruthy();
    expect(snippet[0]).toMatch(/stopPropagation/);
  });

  it('SG1.5 — has plain <span> fallback when customerId missing', () => {
    // JSX: data-testid={`recall-customer-name-plain-${recall.id}`}
    expect(src).toMatch(/data-testid=\{`recall-customer-name-plain-/);
  });

  it('SG1.6 — edit button uses data-testid=recall-edit-{id}', () => {
    // JSX: data-testid={`recall-edit-${recall.id}`}
    expect(src).toMatch(/data-testid=\{`recall-edit-/);
  });

  it('SG1.7 — edit button stopPropagation on click', () => {
    // Match the entire <button ...> block. stopPropagation + onEdit(recall.id)
    // live in the onClick attribute which precedes the testid in source order.
    const snippet = src.match(/<button[\s\S]+?data-testid=\{`recall-edit-[\s\S]+?<\/button>/);
    expect(snippet).toBeTruthy();
    expect(snippet[0]).toMatch(/stopPropagation/);
    expect(snippet[0]).toMatch(/onEdit\(recall\.id\)/);
  });
});

describe('Phase 29.23 SG2 — RecallEditModal exists + exports', () => {
  const src = read('src/components/backend/recall/RecallEditModal.jsx');

  it('SG2.1 — exports named RecallEditModal', () => {
    expect(src).toMatch(/export\s+function\s+RecallEditModal/);
  });

  it('SG2.2 — exports default RecallEditModal', () => {
    expect(src).toMatch(/export\s+default\s+RecallEditModal/);
  });

  it('SG2.3 — imports updateRecall from scopedDataLayer', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bupdateRecall\b[^}]*\}\s*from\s*['"][./]+lib\/scopedDataLayer\.js['"]/);
  });

  it('SG2.4 — uses DateField + RecallCaseSelectField (not raw input)', () => {
    expect(src).toMatch(/import\s+DateField\s+from/);
    expect(src).toMatch(/RecallCaseSelectField/);
  });
});

describe('Phase 29.23 SG3 — deleteRecallCase exports', () => {
  const backendClient = read('src/lib/backendClient.js');
  const scopedDataLayer = read('src/lib/scopedDataLayer.js');

  it('SG3.1 — deleteRecallCase exported from backendClient', () => {
    expect(backendClient).toMatch(/export\s+async\s+function\s+deleteRecallCase/);
  });

  it('SG3.2 — deleteRecallCase universal pass-through in scopedDataLayer', () => {
    expect(scopedDataLayer).toMatch(/export\s+const\s+deleteRecallCase\s*=\s*\(\.\.\.args\)\s*=>\s*raw\.deleteRecallCase/);
  });

  it('SG3.3 — deleteRecallCase uses recallCaseDoc(id) path', () => {
    const match = backendClient.match(/export\s+async\s+function\s+deleteRecallCase[\s\S]{0,200}/);
    expect(match).toBeTruthy();
    expect(match[0]).toMatch(/deleteDoc\(recallCaseDoc\(id\)\)/);
  });

  it('SG3.4 — deleteRecallCase early-returns when id is empty', () => {
    const match = backendClient.match(/export\s+async\s+function\s+deleteRecallCase[\s\S]{0,200}/);
    expect(match[0]).toMatch(/if\s*\(\s*!\s*id\s*\)\s*return/);
  });
});

describe('Phase 29.23 SG4 — 3 surface wires pass onEdit', () => {
  it('SG4.1 — RecallTab passes onEdit to RecallList', () => {
    const src = read('src/components/backend/recall/RecallTab.jsx');
    expect(src).toMatch(/onEdit=\{handleEdit\}/);
    expect(src).toMatch(/RecallEditModal/);
  });

  it('SG4.2 — RecallFrontendView passes onEdit to RecallList', () => {
    const src = read('src/components/backend/recall/RecallFrontendView.jsx');
    expect(src).toMatch(/onEdit=\{handleEdit\}/);
    expect(src).toMatch(/RecallEditModal/);
  });

  it('SG4.3 — RecallCard (CDV) passes onEdit + renders RecallEditModal', () => {
    const src = read('src/components/backend/customer-recall/RecallCard.jsx');
    expect(src).toMatch(/onEdit/);
    expect(src).toMatch(/RecallEditModal/);
  });

  it('SG4.4 — RecallList propagates onEdit to RecallRow', () => {
    const src = read('src/components/backend/recall/RecallList.jsx');
    expect(src).toMatch(/onEdit/);
    expect(src).toMatch(/onEdit=\{onEdit\}/);
  });
});

describe('Phase 29.23 SG5 — RecallCasesAdminPanel imports + uses deleteRecallCase', () => {
  const src = read('src/components/backend/recall/RecallCasesAdminPanel.jsx');

  it('SG5.1 — imports deleteRecallCase from scopedDataLayer', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bdeleteRecallCase\b[^}]*\}\s*from\s*['"][./]+lib\/scopedDataLayer\.js['"]/);
  });

  it('SG5.2 — has handleDelete function', () => {
    expect(src).toMatch(/(function|const)\s+handleDelete/);
  });

  it('SG5.3 — handleDelete calls deleteRecallCase(c.id)', () => {
    expect(src).toMatch(/deleteRecallCase\(c\.id/);
  });

  it('SG5.4 — handleDelete uses window.confirm', () => {
    expect(src).toMatch(/window\.confirm\(/);
  });

  it('SG5.5 — handleDelete calls onCasesChanged on success', () => {
    const match = src.match(/(function|const)\s+handleDelete[\s\S]{0,500}/);
    expect(match[0]).toMatch(/onCasesChanged\?\.\(\)/);
  });

  it('SG5.6 — delete button uses rose color class near data-testid', () => {
    // Real JSX: data-testid={`recall-case-delete-${c.id}`}
    // Button uses text-rose-500 utility class; rose-500 may appear before
    // OR after the testid in the className attribute. Match within ~250 chars
    // in either direction to absorb whitespace + attribute-order drift.
    expect(src).toMatch(
      /(?:data-testid=\{`recall-case-delete-\$\{c\.id\}`\}[\s\S]{0,250}rose-500|rose-500[\s\S]{0,250}data-testid=\{`recall-case-delete-\$\{c\.id\}`\})/
    );
  });
});
