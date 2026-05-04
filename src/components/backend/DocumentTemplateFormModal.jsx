// ─── Document Template Form Modal — Phase 14.2 ────────────────────────────
// Create + edit `be_document_templates` records. One modal covers all 13
// docType variants — the docType dropdown just sets the discriminator,
// htmlTemplate + fields are edited per-template.
//
// When editing a system-default (isSystemDefault=true) template the
// docType dropdown is locked (avoid re-typing a medical-certificate as
// a consent by accident and breaking seeds).

import { useState, useMemo, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Plus, X, AlertCircle, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react';
import MarketingFormShell from './MarketingFormShell.jsx';
import { saveDocumentTemplate } from '../../lib/scopedDataLayer.js';
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  LANGUAGES,
  PAPER_SIZES,
  FIELD_TYPES,
  validateDocumentTemplate,
  emptyDocumentTemplateForm,
  generateDocumentTemplateId,
  extractTemplatePlaceholders,
} from '../../lib/documentTemplateValidation.js';
// T5.a (2026-04-26) — visual designer MVP: render-as-you-type preview
// using the production print engine so admin sees exactly what will be
// printed without leaving the modal.
import { buildPrintContext, renderTemplate } from '../../lib/documentPrintEngine.js';

const LANG_LABEL = { th: 'ไทย', en: 'English', bilingual: 'สองภาษา' };
const PAPER_LABEL = { A4: 'A4 (210×297mm)', A5: 'A5 (148×210mm)', 'label-57x32': 'ฉลากยา (57×32mm)' };

export default function DocumentTemplateFormModal({
  template,
  onClose,
  onSaved,
  clinicSettings,
}) {
  const isEdit = !!template;
  const [form, setForm] = useState(() => ({
    ...emptyDocumentTemplateForm(template?.docType || 'medical-certificate'),
    ...(template || {}),
    fields: template?.fields ? [...template.fields] : [],
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // T5.a (2026-04-26) — visual designer state: preview toggle + cursor
  // position for "insert placeholder at cursor" helper.
  const [previewOpen, setPreviewOpen] = useState(true);
  const htmlTextareaRef = useRef(null);

  const update = useCallback((patch) => setForm(prev => ({ ...prev, ...patch })), []);

  // Placeholders referenced in template HTML — used to suggest missing fields.
  const placeholders = useMemo(
    () => extractTemplatePlaceholders(form.htmlTemplate || ''),
    [form.htmlTemplate]
  );
  const fieldKeySet = useMemo(
    () => new Set((form.fields || []).map(f => f.key)),
    [form.fields]
  );
  const missingFields = placeholders.filter(p => !fieldKeySet.has(p) && !DEFAULT_CONTEXT_KEYS.has(p));

  const addField = () => {
    setForm(prev => ({
      ...prev,
      fields: [
        ...(prev.fields || []),
        { key: '', label: '', type: 'text', required: false },
      ],
    }));
  };

  const removeField = (idx) => {
    setForm(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== idx),
    }));
  };

  const updateField = (idx, patch) => {
    setForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => i === idx ? { ...f, ...patch } : f),
    }));
  };

  // T5.a (2026-04-26) — reorder fields. Used by ArrowUp/ArrowDown buttons
  // on each row. Out-of-bounds moves are no-ops.
  const moveField = (idx, delta) => {
    setForm(prev => {
      const fields = [...(prev.fields || [])];
      const target = idx + delta;
      if (target < 0 || target >= fields.length) return prev;
      [fields[idx], fields[target]] = [fields[target], fields[idx]];
      return { ...prev, fields };
    });
  };

  // T5.a (2026-04-26) — insert {{placeholder}} at the textarea cursor.
  // Smart-pick keeps the cursor in the right place AFTER the inserted token
  // so admin can keep typing context around it.
  const insertPlaceholder = useCallback((key) => {
    const ta = htmlTextareaRef.current;
    if (!ta) {
      // Fallback: append to end
      update({ htmlTemplate: (form.htmlTemplate || '') + `{{${key}}}` });
      return;
    }
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const before = (form.htmlTemplate || '').slice(0, start);
    const after = (form.htmlTemplate || '').slice(end);
    const insert = `{{${key}}}`;
    const next = before + insert + after;
    update({ htmlTemplate: next });
    // Restore cursor AFTER the inserted token on next paint
    requestAnimationFrame(() => {
      const cursor = start + insert.length;
      ta.focus();
      ta.setSelectionRange(cursor, cursor);
    });
  }, [form.htmlTemplate, update]);

  // T5.a (2026-04-26) — live preview HTML. Mirrors documentPrintEngine
  // render path. Sample data ensures placeholders show non-empty values
  // so admin can verify alignment / wrapping / styling.
  const previewHtml = useMemo(() => {
    const sampleValues = {};
    (form.fields || []).forEach((f) => {
      if (!f?.key) return;
      if (f.type === 'date') sampleValues[f.key] = '2026-04-26';
      else if (f.type === 'number') sampleValues[f.key] = '123';
      else if (f.type === 'staff-select') sampleValues[f.key] = 'นพ. ตัวอย่าง';
      else if (f.type === 'checkbox') sampleValues[f.key] = '☑';
      else sampleValues[f.key] = `[${f.label || f.key}]`;
    });
    const ctx = buildPrintContext({
      clinic: clinicSettings || {},
      customer: {
        customerName: 'นางสาว ตัวอย่าง',
        proClinicHN: '000000',
        patientData: { gender: 'หญิง', age: '30', phone: '080-000-0000' },
      },
      values: sampleValues,
      language: form.language || 'th',
      toggles: {},
    });
    return renderTemplate(form.htmlTemplate || '', ctx);
  }, [form.htmlTemplate, form.fields, form.language, clinicSettings]);

  const handleSave = async () => {
    setError('');
    const fail = validateDocumentTemplate(form, { strict: true });
    if (fail) { setError(fail[1]); return; }
    setSaving(true);
    try {
      const id = isEdit ? (template.templateId || template.id) : generateDocumentTemplateId(form.docType);
      await saveDocumentTemplate(id, form, { strict: true });
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MarketingFormShell
      isEdit={isEdit}
      titleCreate="เพิ่มเทมเพลตเอกสาร"
      titleEdit={template?.isSystemDefault ? 'แก้ไขเทมเพลตระบบ' : 'แก้ไขเทมเพลตเอกสาร'}
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      maxWidth="3xl"
      bodySpacing={4}
      clinicSettings={clinicSettings}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">ประเภทเอกสาร *</label>
          <select
            value={form.docType}
            onChange={(e) => {
              const dt = e.target.value;
              update({ docType: dt, name: form.name || DOC_TYPE_LABELS[dt] || '' });
            }}
            disabled={template?.isSystemDefault}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] disabled:opacity-60"
            data-field="docType"
          >
            {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
          </select>
          {template?.isSystemDefault && (
            <p className="text-[10px] text-[var(--tx-muted)]">เทมเพลตระบบ — ห้ามเปลี่ยนประเภท</p>
          )}
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">ชื่อเทมเพลต *</label>
          <input
            type="text"
            value={form.name || ''}
            onChange={(e) => update({ name: e.target.value })}
            maxLength={200}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-field="name"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">ภาษา</label>
          <select
            value={form.language}
            onChange={(e) => update({ language: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
          >
            {LANGUAGES.map(l => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--tx-muted)]">ขนาดกระดาษ</label>
          <select
            value={form.paperSize}
            onChange={(e) => update({ paperSize: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
          >
            {PAPER_SIZES.map(p => <option key={p} value={p}>{PAPER_LABEL[p]}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="block text-xs text-[var(--tx-muted)]">
            HTML เทมเพลต * &nbsp;
            <span className="text-[10px] text-[var(--tx-muted)]">
              ใช้ <code>{'{{placeholder}}'}</code> สำหรับค่าที่จะเติมตอนพิมพ์
            </span>
          </label>
          {/* T5.a — toggle live preview pane */}
          <button type="button"
            onClick={() => setPreviewOpen(o => !o)}
            data-testid="template-preview-toggle"
            className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-card)]">
            {previewOpen ? <EyeOff size={12} /> : <Eye size={12} />}
            {previewOpen ? 'ซ่อน Preview' : 'แสดง Preview'}
          </button>
        </div>
        {/* T5.a — quick-insert placeholder bar (clicks insert {{key}} at
            textarea cursor). Combines field keys + common context keys. */}
        <div className="flex items-center gap-1 flex-wrap" data-testid="template-quick-insert">
          <span className="text-[10px] text-[var(--tx-muted)]">เพิ่ม placeholder:</span>
          {[...new Set([
            ...((form.fields || []).map(f => f.key).filter(Boolean)),
            'customerName', 'customerHN', 'today', 'clinicName',
          ])].slice(0, 12).map(key => (
            <button key={key} type="button"
              onClick={() => insertPlaceholder(key)}
              data-testid={`template-insert-${key}`}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--bd)]">
              {`{{${key}}}`}
            </button>
          ))}
        </div>
        <div className={previewOpen ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : ''}>
          <textarea
            ref={htmlTextareaRef}
            value={form.htmlTemplate || ''}
            onChange={(e) => update({ htmlTemplate: e.target.value })}
            rows={12}
            className="w-full px-2 py-1.5 rounded text-xs font-mono bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-field="htmlTemplate"
            spellCheck={false}
          />
          {previewOpen && (
            <div className="rounded border border-[var(--bd)] bg-white text-black p-3 overflow-auto"
              style={{ maxHeight: '320px', fontSize: '11px', minHeight: '180px' }}
              data-testid="template-live-preview"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml || '<em style="color:#999">— ว่าง —</em>') }}
            />
          )}
        </div>
        {placeholders.length > 0 && (
          <div className="text-[11px] text-[var(--tx-muted)]">
            Placeholder ในเทมเพลต: {placeholders.map(p => (
              <code key={p} className="px-1 py-0.5 mr-1 rounded bg-[var(--bg-card)]">{p}</code>
            ))}
          </div>
        )}
        {missingFields.length > 0 && (
          <div className="text-[11px] flex items-start gap-1 text-amber-400">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>
              Placeholder ที่ยังไม่มีใน fields (ระบบจะเติมว่าง): {missingFields.join(', ')}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs text-[var(--tx-muted)]">ฟิลด์ที่กรอกตอนพิมพ์</label>
          <button type="button" onClick={addField}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-card)]">
            <Plus size={12} /> เพิ่มฟิลด์
          </button>
        </div>
        {(form.fields || []).map((f, i) => {
          const total = (form.fields || []).length;
          return (
            <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`template-field-row-${i}`}>
              <input type="text" placeholder="key (a-z_)" value={f.key || ''}
                onChange={(e) => updateField(i, { key: e.target.value })}
                className="col-span-3 px-2 py-1 rounded text-xs font-mono bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
              <input type="text" placeholder="label" value={f.label || ''}
                onChange={(e) => updateField(i, { label: e.target.value })}
                className="col-span-3 px-2 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
              <select value={f.type || 'text'}
                onChange={(e) => updateField(i, { type: e.target.value })}
                className="col-span-2 px-2 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
                {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="col-span-2 text-xs flex items-center gap-1">
                <input type="checkbox" checked={!!f.required}
                  onChange={(e) => updateField(i, { required: e.target.checked })} />
                required
              </label>
              {/* T5.a — reorder buttons (move up / down). Disabled at the
                  edges so admin doesn't hammer no-op clicks. */}
              <div className="col-span-1 flex items-center gap-0.5">
                <button type="button"
                  onClick={() => moveField(i, -1)}
                  disabled={i === 0}
                  data-testid={`template-field-up-${i}`}
                  title="ย้ายขึ้น"
                  className="text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] rounded p-0.5 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowUp size={12} />
                </button>
                <button type="button"
                  onClick={() => moveField(i, 1)}
                  disabled={i === total - 1}
                  data-testid={`template-field-down-${i}`}
                  title="ย้ายลง"
                  className="text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] rounded p-0.5 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowDown size={12} />
                </button>
              </div>
              <button type="button" onClick={() => removeField(i)}
                data-testid={`template-field-remove-${i}`}
                title="ลบฟิลด์"
                className="col-span-1 text-red-400 hover:bg-red-900/20 rounded p-1">
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <label className="text-xs flex items-center gap-2">
          <input type="checkbox" checked={form.isActive !== false}
            onChange={(e) => update({ isActive: e.target.checked })} />
          เปิดใช้งาน
        </label>
      </div>
    </MarketingFormShell>
  );
}

// Keys provided by buildPrintContext so missing-field warnings don't flag them.
const DEFAULT_CONTEXT_KEYS = new Set([
  'clinicName', 'clinicAddress', 'clinicPhone', 'clinicEmail', 'clinicTaxId',
  'customerName', 'customerHN', 'nationalId', 'age', 'gender', 'phone',
  'today', 'todayISO', 'todayBE',
]);
