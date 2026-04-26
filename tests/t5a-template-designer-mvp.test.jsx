// T5.a (Phase 14.11 MVP) — visual template designer (2026-04-26)
//
// User directive (this session, P1-P3): "ทำทั้งหมด" → T5.a designer.
// MVP scope: live preview pane + quick-insert placeholder bar + field
// reorder (move up/down). Drag-drop full editor deferred (mega XL).
//
// Test groups:
//   T5A.A — source-grep regression guards (DocumentTemplateFormModal wiring)
//   T5A.B — RTL: insert helper bar inserts at cursor + reorder + preview

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DocumentTemplateFormModal from '../src/components/backend/DocumentTemplateFormModal.jsx';

const MODAL_SRC = readFileSync('src/components/backend/DocumentTemplateFormModal.jsx', 'utf8');

// Mock backend client + print engine to avoid Firestore + DOMPurify quirks
vi.mock('../src/lib/backendClient.js', () => ({
  saveDocumentTemplate: vi.fn().mockResolvedValue({}),
}));

// ─── T5A.A — source-grep regression guards ──────────────────────────────
describe('T5A.A — DocumentTemplateFormModal designer wiring', () => {
  test('A.1 imports buildPrintContext + renderTemplate from print engine', () => {
    expect(MODAL_SRC).toMatch(/import\s*\{[^}]*buildPrintContext[^}]*renderTemplate[^}]*\}\s+from\s+['"]\.\.\/\.\.\/lib\/documentPrintEngine\.js['"]/);
  });
  test('A.2 imports DOMPurify (XSS hardening for live preview)', () => {
    expect(MODAL_SRC).toMatch(/import\s+DOMPurify\s+from\s+['"]dompurify['"]/);
  });
  test('A.3 imports ArrowUp + ArrowDown + Eye + EyeOff icons', () => {
    expect(MODAL_SRC).toMatch(/ArrowUp/);
    expect(MODAL_SRC).toMatch(/ArrowDown/);
    expect(MODAL_SRC).toMatch(/Eye/);
    expect(MODAL_SRC).toMatch(/EyeOff/);
  });
  test('A.4 declares htmlTextareaRef for cursor-aware insertion', () => {
    expect(MODAL_SRC).toMatch(/htmlTextareaRef\s*=\s*useRef/);
  });
  test('A.5 declares previewOpen state (default true) + toggle button', () => {
    expect(MODAL_SRC).toMatch(/setPreviewOpen/);
    expect(MODAL_SRC).toMatch(/data-testid=["']template-preview-toggle["']/);
  });
  test('A.6 moveField helper exists with delta param + edge guards', () => {
    expect(MODAL_SRC).toMatch(/const moveField = \(idx, delta\)/);
    expect(MODAL_SRC).toMatch(/target\s*<\s*0\s*\|\|\s*target\s*>=\s*fields\.length/);
  });
  test('A.7 insertPlaceholder helper preserves cursor position via requestAnimationFrame', () => {
    expect(MODAL_SRC).toMatch(/const insertPlaceholder = useCallback/);
    expect(MODAL_SRC).toMatch(/requestAnimationFrame/);
    expect(MODAL_SRC).toMatch(/setSelectionRange/);
  });
  test('A.8 previewHtml useMemo runs renderTemplate + buildPrintContext', () => {
    expect(MODAL_SRC).toMatch(/const previewHtml = useMemo/);
    expect(MODAL_SRC).toMatch(/renderTemplate\(form\.htmlTemplate/);
    expect(MODAL_SRC).toMatch(/buildPrintContext\(/);
  });
  test('A.9 sample data covers all FIELD_TYPES', () => {
    // The previewHtml useMemo branches on f.type === 'date' / 'number' /
    // 'staff-select' / 'checkbox' so the preview shows non-empty values.
    expect(MODAL_SRC).toMatch(/f\.type === ['"]date['"]/);
    expect(MODAL_SRC).toMatch(/f\.type === ['"]number['"]/);
    expect(MODAL_SRC).toMatch(/f\.type === ['"]staff-select['"]/);
    expect(MODAL_SRC).toMatch(/f\.type === ['"]checkbox['"]/);
  });
  test('A.10 preview pane uses DOMPurify.sanitize (XSS-safe)', () => {
    expect(MODAL_SRC).toMatch(/dangerouslySetInnerHTML=\{[^}]*DOMPurify\.sanitize\(previewHtml/);
  });
  test('A.11 preview pane has data-testid + max-height (no runaway scroll)', () => {
    expect(MODAL_SRC).toMatch(/data-testid=["']template-live-preview["']/);
    expect(MODAL_SRC).toMatch(/maxHeight:\s*['"]320px['"]/);
  });
  test('A.12 quick-insert bar surfaces field keys + canonical context keys', () => {
    expect(MODAL_SRC).toMatch(/data-testid=["']template-quick-insert["']/);
    // Default canonical keys: customerName, customerHN, today, clinicName
    expect(MODAL_SRC).toMatch(/['"]customerName['"]/);
    expect(MODAL_SRC).toMatch(/['"]customerHN['"]/);
    expect(MODAL_SRC).toMatch(/['"]today['"]/);
    expect(MODAL_SRC).toMatch(/['"]clinicName['"]/);
  });
  test('A.13 reorder buttons disabled at array edges', () => {
    expect(MODAL_SRC).toMatch(/disabled=\{i === 0\}/);
    expect(MODAL_SRC).toMatch(/disabled=\{i === total - 1\}/);
  });
});

// ─── T5A.B — RTL: live designer behavior ────────────────────────────────
describe('T5A.B — RTL designer behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('B.1 renders preview pane with sample-rendered output', async () => {
    const tpl = {
      docType: 'medical-certificate',
      name: 'Test Cert',
      language: 'th',
      paperSize: 'A4',
      htmlTemplate: '<h1>{{clinicName}} — {{customerName}}</h1>',
      fields: [],
      isActive: true,
    };
    render(<DocumentTemplateFormModal template={tpl} clinicSettings={{ clinicName: 'My Clinic' }} onClose={() => {}} onSaved={() => {}} />);
    const preview = await screen.findByTestId('template-live-preview');
    expect(preview).toBeInTheDocument();
    // Preview should contain rendered output (not raw {{...}} placeholder)
    expect(preview.innerHTML).toContain('My Clinic');
    expect(preview.innerHTML).toContain('นางสาว ตัวอย่าง');
  });

  test('B.2 toggle button hides + shows preview pane', async () => {
    const tpl = { docType: 'chart', htmlTemplate: '<p>x</p>', fields: [], language: 'th', paperSize: 'A4', isActive: true };
    render(<DocumentTemplateFormModal template={tpl} onClose={() => {}} onSaved={() => {}} />);
    const toggle = screen.getByTestId('template-preview-toggle');
    expect(screen.getByTestId('template-live-preview')).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByTestId('template-live-preview')).not.toBeInTheDocument());
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId('template-live-preview')).toBeInTheDocument());
  });

  test('B.3 quick-insert button appends placeholder to textarea', async () => {
    const tpl = { docType: 'chart', htmlTemplate: '', fields: [], language: 'th', paperSize: 'A4', isActive: true };
    render(<DocumentTemplateFormModal template={tpl} onClose={() => {}} onSaved={() => {}} />);
    const insertBtn = screen.getByTestId('template-insert-customerName');
    fireEvent.click(insertBtn);
    const ta = document.querySelector('[data-field="htmlTemplate"]');
    expect(ta.value).toContain('{{customerName}}');
  });

  test('B.4 reorder up button moves field idx 1 → 0', async () => {
    const tpl = {
      docType: 'chart',
      htmlTemplate: '',
      fields: [
        { key: 'a', label: 'A', type: 'text' },
        { key: 'b', label: 'B', type: 'text' },
      ],
      language: 'th', paperSize: 'A4', isActive: true,
    };
    render(<DocumentTemplateFormModal template={tpl} onClose={() => {}} onSaved={() => {}} />);
    // Row 1 (key='b') has up button
    const upBtn = screen.getByTestId('template-field-up-1');
    fireEvent.click(upBtn);
    // Now row 0 should have key='b'
    await waitFor(() => {
      const row0KeyInput = screen.getByTestId('template-field-row-0').querySelector('input[placeholder="key (a-z_)"]');
      expect(row0KeyInput.value).toBe('b');
    });
  });

  test('B.5 reorder up disabled on row 0', async () => {
    const tpl = {
      docType: 'chart',
      htmlTemplate: '',
      fields: [{ key: 'a', label: 'A', type: 'text' }],
      language: 'th', paperSize: 'A4', isActive: true,
    };
    render(<DocumentTemplateFormModal template={tpl} onClose={() => {}} onSaved={() => {}} />);
    const upBtn = screen.getByTestId('template-field-up-0');
    expect(upBtn).toBeDisabled();
  });

  test('B.6 reorder down disabled on last row', async () => {
    const tpl = {
      docType: 'chart',
      htmlTemplate: '',
      fields: [
        { key: 'a', label: 'A', type: 'text' },
        { key: 'b', label: 'B', type: 'text' },
      ],
      language: 'th', paperSize: 'A4', isActive: true,
    };
    render(<DocumentTemplateFormModal template={tpl} onClose={() => {}} onSaved={() => {}} />);
    const downBtn = screen.getByTestId('template-field-down-1');
    expect(downBtn).toBeDisabled();
  });

  test('B.7 preview re-renders when htmlTemplate changes', async () => {
    const tpl = { docType: 'chart', htmlTemplate: '<p>a</p>', fields: [], language: 'th', paperSize: 'A4', isActive: true };
    render(<DocumentTemplateFormModal template={tpl} onClose={() => {}} onSaved={() => {}} />);
    const ta = document.querySelector('[data-field="htmlTemplate"]');
    fireEvent.change(ta, { target: { value: '<p>updated content xyz</p>' } });
    await waitFor(() => {
      const preview = screen.getByTestId('template-live-preview');
      expect(preview.innerHTML).toContain('updated content xyz');
    });
  });

  test('B.8 field-row data-testid pattern lets E2E target each row', () => {
    const tpl = {
      docType: 'chart',
      htmlTemplate: '',
      fields: [
        { key: 'a', label: 'A', type: 'text' },
        { key: 'b', label: 'B', type: 'text' },
        { key: 'c', label: 'C', type: 'text' },
      ],
      language: 'th', paperSize: 'A4', isActive: true,
    };
    render(<DocumentTemplateFormModal template={tpl} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByTestId('template-field-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('template-field-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('template-field-row-2')).toBeInTheDocument();
  });
});
