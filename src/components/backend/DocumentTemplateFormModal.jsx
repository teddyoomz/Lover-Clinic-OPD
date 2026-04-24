// ─── Document Template Form Modal — Phase 14.2 ────────────────────────────
// Create + edit `be_document_templates` records. One modal covers all 13
// docType variants — the docType dropdown just sets the discriminator,
// htmlTemplate + fields are edited per-template.
//
// When editing a system-default (isSystemDefault=true) template the
// docType dropdown is locked (avoid re-typing a medical-certificate as
// a consent by accident and breaking seeds).

import { useState, useMemo, useCallback } from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';
import MarketingFormShell from './MarketingFormShell.jsx';
import { saveDocumentTemplate } from '../../lib/backendClient.js';
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
        <label className="block text-xs text-[var(--tx-muted)]">
          HTML เทมเพลต * &nbsp;
          <span className="text-[10px] text-[var(--tx-muted)]">
            ใช้ <code>{'{{placeholder}}'}</code> สำหรับค่าที่จะเติมตอนพิมพ์
          </span>
        </label>
        <textarea
          value={form.htmlTemplate || ''}
          onChange={(e) => update({ htmlTemplate: e.target.value })}
          rows={12}
          className="w-full px-2 py-1.5 rounded text-xs font-mono bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
          data-field="htmlTemplate"
          spellCheck={false}
        />
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
        {(form.fields || []).map((f, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input type="text" placeholder="key (a-z_)" value={f.key || ''}
              onChange={(e) => updateField(i, { key: e.target.value })}
              className="col-span-3 px-2 py-1 rounded text-xs font-mono bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
            <input type="text" placeholder="label" value={f.label || ''}
              onChange={(e) => updateField(i, { label: e.target.value })}
              className="col-span-4 px-2 py-1 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]" />
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
            <button type="button" onClick={() => removeField(i)}
              className="col-span-1 text-red-400 hover:bg-red-900/20 rounded p-1">
              <X size={12} />
            </button>
          </div>
        ))}
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
