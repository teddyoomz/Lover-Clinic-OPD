// ─── Document Print Modal — Phase 14.3 ────────────────────────────────────
// Shared component that powers "พิมพ์เอกสาร" buttons across CustomerDetailView,
// TreatmentFormPage, SaleDetailModal. Step flow:
//   1. Filter to active templates for the chosen docType (or all docTypes)
//   2. User picks template
//   3. Fill form for template.fields (pre-filled from customer/treatment/sale
//      context where keys match)
//   4. Preview → Print (opens browser print dialog via documentPrintEngine)
//
// Rule E: Firestore-only — reads be_document_templates, no ProClinic calls.

import { useState, useEffect, useMemo } from 'react';
import { FileText, Printer, ChevronLeft, X, Loader2, Search } from 'lucide-react';
import DateField from '../DateField.jsx';
import { listDocumentTemplates } from '../../lib/backendClient.js';
import {
  DOC_TYPE_LABELS,
} from '../../lib/documentTemplateValidation.js';
import { printDocument, buildPrintContext, renderTemplate } from '../../lib/documentPrintEngine.js';

const STEP_PICK = 'pick';
const STEP_FILL = 'fill';

export default function DocumentPrintModal({
  open,
  onClose,
  clinicSettings,
  customer,
  // Optional pre-fill context — e.g. treatment form passes diagnosis/findings
  // or sale detail passes originalSaleId. Merged with customer/clinic defaults.
  prefillValues = {},
  // Restrict picker to one or more docTypes (e.g. SaleDetail only offers
  // 'sale-cancelation'). Empty array = all 13 docTypes.
  docTypeFilter = [],
}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [step, setStep] = useState(STEP_PICK);
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!open) return;
    setStep(STEP_PICK); setSelected(null); setValues({}); setQuery('');
    setLoading(true); setError('');
    listDocumentTemplates({ activeOnly: true })
      .then(list => {
        const filtered = docTypeFilter.length > 0
          ? list.filter(t => docTypeFilter.includes(t.docType))
          : list;
        setTemplates(filtered);
      })
      .catch(e => setError(e.message || 'โหลดเทมเพลตล้มเหลว'))
      .finally(() => setLoading(false));
  }, [open, docTypeFilter.join(',')]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t => {
      const hay = [t.name, DOC_TYPE_LABELS[t.docType], t.docType].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [templates, query]);

  const handlePick = (t) => {
    setSelected(t);
    // Pre-fill each field from prefillValues + customer shortcuts. Rendering
    // logic (buildPrintContext) also auto-fills from clinic/customer, but
    // exposing the values in the form lets staff edit before print.
    const initial = {};
    for (const f of (t.fields || [])) {
      if (prefillValues[f.key] != null) initial[f.key] = prefillValues[f.key];
    }
    setValues(initial);
    setStep(STEP_FILL);
  };

  const handleBack = () => { setStep(STEP_PICK); setSelected(null); };

  const handlePrint = () => {
    if (!selected) return;
    // Required-field gate — only for fields flagged required on the template.
    const missing = (selected.fields || []).filter(f => f.required && !String(values[f.key] || '').trim());
    if (missing.length > 0) {
      setError(`กรุณากรอก: ${missing.map(f => f.label || f.key).join(', ')}`);
      return;
    }
    setError('');
    try {
      const win = printDocument({
        template: selected,
        clinic: clinicSettings || {},
        customer: customer || {},
        values,
      });
      if (!win) {
        setError('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาตป๊อปอัพ');
        return;
      }
    } catch (e) {
      setError(e.message || 'พิมพ์ล้มเหลว');
    }
  };

  const previewHtml = useMemo(() => {
    if (!selected) return '';
    const ctx = buildPrintContext({
      clinic: clinicSettings || {},
      customer: customer || {},
      values,
    });
    return renderTemplate(selected.htmlTemplate || '', ctx);
  }, [selected, values, clinicSettings, customer]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose} data-testid="document-print-modal">
      <div className="w-full max-w-4xl mx-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--bd)] max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[var(--bd)]">
          <div className="flex items-center gap-2">
            {step === STEP_FILL && (
              <button onClick={handleBack} className="p-1 rounded hover:bg-[var(--bg-hover)]">
                <ChevronLeft size={18} />
              </button>
            )}
            <FileText size={20} className="text-violet-400" />
            <h3 className="text-lg font-bold text-[var(--tx-heading)]">
              {step === STEP_PICK ? 'เลือกเทมเพลตเอกสาร' : selected?.name || 'เอกสาร'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-hover)]" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-xs">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-10 text-[var(--tx-muted)]">
              <Loader2 size={20} className="animate-spin mr-2" /> กำลังโหลดเทมเพลต...
            </div>
          )}

          {!loading && step === STEP_PICK && (
            <>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหาเทมเพลต..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
                  data-testid="document-print-search"
                  autoFocus
                />
              </div>
              {filteredTemplates.length === 0 ? (
                <div className="py-8 text-center text-[var(--tx-muted)] text-sm">
                  ไม่พบเทมเพลตที่ใช้งาน — ตั้งค่าที่หน้า "เทมเพลตเอกสาร"
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="document-print-template-list">
                  {filteredTemplates.map(t => (
                    <button
                      key={t.templateId || t.id}
                      onClick={() => handlePick(t)}
                      data-testid={`document-print-pick-${t.templateId || t.id}`}
                      className="text-left p-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--bd)] transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <FileText size={14} className="text-violet-400" />
                        <span className="font-bold text-sm">{t.name}</span>
                      </div>
                      <div className="text-[11px] text-[var(--tx-muted)]">
                        {DOC_TYPE_LABELS[t.docType] || t.docType} · {t.language} · {t.paperSize}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && step === STEP_FILL && selected && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Fill form */}
              <div className="space-y-3" data-testid="document-print-fill-form">
                <div className="text-xs text-[var(--tx-muted)]">
                  กรอกข้อมูลที่จำเป็น — ค่าอื่นๆ ระบบเติมอัตโนมัติจากข้อมูลลูกค้า/คลินิก
                </div>
                {(selected.fields || []).map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="block text-xs text-[var(--tx-muted)]">
                      {f.label || f.key}{f.required && <span className="text-red-400"> *</span>}
                    </label>
                    {f.type === 'textarea' ? (
                      <textarea
                        value={values[f.key] || ''}
                        onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                        rows={3}
                        className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
                        data-field={f.key}
                      />
                    ) : f.type === 'date' ? (
                      <DateField
                        value={values[f.key] || ''}
                        onChange={(v) => setValues(vs => ({ ...vs, [f.key]: v }))}
                        fieldClassName="px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
                      />
                    ) : f.type === 'number' ? (
                      <input
                        type="number"
                        value={values[f.key] || ''}
                        onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
                        data-field={f.key}
                      />
                    ) : (
                      <input
                        type="text"
                        value={values[f.key] || ''}
                        onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
                        data-field={f.key}
                      />
                    )}
                  </div>
                ))}
              </div>
              {/* Preview */}
              <div className="space-y-2">
                <div className="text-xs text-[var(--tx-muted)]">พรีวิว</div>
                <div
                  className="p-4 rounded-lg bg-white text-black text-xs leading-relaxed max-h-[60vh] overflow-auto"
                  style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif" }}
                  data-testid="document-print-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === STEP_FILL && (
          <div className="flex items-center justify-end gap-2 p-3 border-t border-[var(--bd)]">
            <button onClick={onClose} className="px-3 py-1.5 rounded text-xs bg-neutral-700 text-white">ยกเลิก</button>
            <button onClick={handlePrint}
              data-testid="document-print-submit"
              className="px-3 py-1.5 rounded text-xs font-bold bg-emerald-700 text-white inline-flex items-center gap-1">
              <Printer size={14} /> พิมพ์
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
