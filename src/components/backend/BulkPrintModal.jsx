// ─── BulkPrintModal — Phase 14.10 (2026-04-26) ───────────────────────────
// User directive (Tier 3 P1): "T3.f Phase 14.10 bulk print + QR + saved drafts".
//
// Bulk PDF generator. Caller passes an array of customer objects + opens
// the modal. Flow:
//   Step 1: Pick template (filter by docType — same as DocumentPrintModal)
//   Step 2: Fill SHARED fields (one-time fill applied to every customer)
//           Per-customer-derived fields (customerName/HN/etc.) auto-populated
//           from each customer's own context at PDF render time.
//   Step 3: "Generate N PDFs" — sequentially generates PDFs, downloads each,
//           records audit log entry per customer, shows progress bar.
//
// Engine reuse: same buildPrintContext + exportDocumentToPdf as the
// per-customer modal — so identical output fidelity. No new validators.
//
// Audit: each generated doc gets its own be_document_prints entry with
// action='pdf' + customerId set per loop iteration.

import { useState, useEffect, useMemo } from 'react';
import { FileText, Download, ChevronLeft, X, Loader2, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  listDocumentTemplates,
  recordDocumentPrint,
} from '../../lib/backendClient.js';
import { exportDocumentToPdf } from '../../lib/documentPrintEngine.js';
import {
  DOC_TYPE_LABELS,
} from '../../lib/documentTemplateValidation.js';

const STEP_PICK = 'pick';
const STEP_FILL = 'fill';
const STEP_RUN  = 'run';

export default function BulkPrintModal({ customers = [], clinicSettings, onClose }) {
  const [step, setStep] = useState(STEP_PICK);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [docType, setDocType] = useState('');
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0, currentName: '', failed: [] });
  const [running, setRunning] = useState(false);

  // Load active templates on mount
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    listDocumentTemplates({ activeOnly: true })
      .then((items) => { if (!cancel) setTemplates(items || []); })
      .catch((e) => { if (!cancel) setError(e.message || 'โหลดเทมเพลตล้มเหลว'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  const filtered = useMemo(() => {
    let items = templates;
    if (docType) items = items.filter(t => t.docType === docType);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(t => (t.name || '').toLowerCase().includes(q));
    }
    return items;
  }, [templates, query, docType]);

  const handlePick = (t) => {
    setSelected(t);
    const initial = {};
    for (const f of (t.fields || [])) {
      if (f.type === 'checkbox') initial[f.key] = '☐';
      else if (f.type === 'signature') initial[f.key] = '';
    }
    setValues(initial);
    setStep(STEP_FILL);
  };

  const handleBack = () => {
    if (step === STEP_FILL) { setStep(STEP_PICK); setSelected(null); }
    else if (step === STEP_RUN) { setStep(STEP_FILL); }
  };

  const handleRun = async () => {
    if (!selected) return;
    if (!Array.isArray(customers) || customers.length === 0) {
      setError('ไม่มีลูกค้าสำหรับ bulk print');
      return;
    }
    setError('');
    setStep(STEP_RUN);
    setRunning(true);
    setProgress({ done: 0, total: customers.length, currentName: '', failed: [] });

    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      const name = customer?.customerName
        || customer?.name
        || `${customer?.patientData?.prefix || ''} ${customer?.patientData?.firstName || ''} ${customer?.patientData?.lastName || ''}`.trim()
        || `customer ${i + 1}`;
      setProgress(p => ({ ...p, currentName: name }));
      try {
        await exportDocumentToPdf({
          template: selected,
          clinic: clinicSettings || {},
          customer,
          values,
        });
        // Audit log per customer (fire-and-forget — no per-loop block)
        recordDocumentPrint({
          templateId: selected.id,
          templateName: selected.name,
          docType: selected.docType,
          customerId: customer?.customerId || customer?.id,
          customerHN: customer?.proClinicHN || customer?.hn,
          customerName: name,
          action: 'pdf',
          language: selected.language,
          paperSize: selected.paperSize,
        }).catch(() => {/* non-fatal */});
        setProgress(p => ({ ...p, done: p.done + 1 }));
      } catch (e) {
        setProgress(p => ({
          ...p,
          done: p.done + 1,
          failed: [...p.failed, { name, message: e.message || String(e) }],
        }));
      }
      // Tiny delay so the browser can flush the download UI between PDFs.
      // Without this, Chrome batches downloads which can rate-limit > 10/s.
      await new Promise(r => setTimeout(r, 250));
    }
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="bulk-print-modal">
      <div className="bg-[var(--bg-base)] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[var(--bd)]">
          <div className="flex items-center gap-2">
            {step !== STEP_PICK && (
              <button onClick={handleBack} className="p-1 rounded hover:bg-[var(--bg-hover)]">
                <ChevronLeft size={18} />
              </button>
            )}
            <FileText size={20} className="text-violet-400" />
            <h3 className="text-lg font-bold text-[var(--tx-heading)]">
              {step === STEP_PICK && `Bulk พิมพ์เอกสาร — ${customers.length} คน`}
              {step === STEP_FILL && `Bulk: กรอกข้อมูลร่วม (${selected?.name || '...'})`}
              {step === STEP_RUN  && `Bulk: กำลังสร้าง PDF (${progress.done}/${progress.total})`}
            </h3>
          </div>
          <button onClick={onClose} disabled={running} className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-50" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-xs">
              {error}
            </div>
          )}

          {step === STEP_PICK && (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ค้นชื่อเทมเพลต..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm"
                  />
                </div>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm"
                  data-testid="bulk-print-doctype"
                >
                  <option value="">ทุกประเภท</option>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-[var(--tx-muted)]" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filtered.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handlePick(t)}
                      data-testid={`bulk-print-template-${t.id}`}
                      className="text-left px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)] hover:border-violet-500/50 hover:bg-[var(--bg-hover)] transition-all text-sm"
                    >
                      <div className="font-bold text-[var(--tx-heading)]">{t.name}</div>
                      <div className="text-[11px] text-[var(--tx-muted)] mt-0.5">
                        {DOC_TYPE_LABELS[t.docType] || t.docType} · {t.paperSize || 'A4'}
                      </div>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <div className="col-span-full text-center text-xs text-[var(--tx-muted)] py-8">
                      ไม่พบเทมเพลต
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === STEP_FILL && selected && (
            <>
              <div className="px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/40 text-amber-200 text-xs">
                ค่าที่กรอกที่นี่จะถูกใช้กับลูกค้าทั้ง <b>{customers.length}</b> คน. ฟิลด์ส่วนตัว (ชื่อ/HN) จะดึงจากข้อมูลแต่ละคนอัตโนมัติ.
              </div>
              <div className="space-y-2 max-w-md">
                {(selected.fields || []).filter(f => !f.hidden && f.type !== 'signature').map(f => (
                  <div key={f.key}>
                    <label className="block text-xs text-[var(--tx-muted)] mb-1">{f.label || f.key}</label>
                    {f.type === 'textarea' ? (
                      <textarea
                        value={values[f.key] || ''}
                        onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                        rows={2}
                        className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)]"
                        data-field={f.key}
                      />
                    ) : (
                      <input
                        type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                        value={values[f.key] || ''}
                        onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)]"
                        data-field={f.key}
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {step === STEP_RUN && (
            <div className="space-y-3" data-testid="bulk-print-progress">
              <div className="text-sm text-[var(--tx-muted)]">
                กำลังสร้าง PDF: <b className="text-[var(--tx-heading)]">{progress.currentName || '...'}</b>
              </div>
              <div className="w-full h-3 rounded-full bg-[var(--bg-input)] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                  data-testid="bulk-print-progress-bar"
                />
              </div>
              <div className="text-xs text-[var(--tx-muted)] text-center">
                {progress.done} / {progress.total} สำเร็จ {progress.failed.length > 0 && `· ผิดพลาด ${progress.failed.length}`}
              </div>
              {!running && progress.done === progress.total && (
                <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 size={14} /> เสร็จสิ้น — สร้าง PDF {progress.done - progress.failed.length}/{progress.total} ไฟล์.
                </div>
              )}
              {progress.failed.length > 0 && !running && (
                <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs">
                  <div className="font-bold mb-1 flex items-center gap-1"><AlertCircle size={12} /> รายการที่ผิดพลาด:</div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {progress.failed.map((f, i) => (
                      <li key={i}><b>{f.name}</b>: {f.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === STEP_FILL && (
          <div className="flex items-center justify-end gap-2 p-3 border-t border-[var(--bd)]">
            <button onClick={onClose} className="px-3 py-1.5 rounded text-xs bg-neutral-700 text-white">ยกเลิก</button>
            <button
              onClick={handleRun}
              data-testid="bulk-print-run"
              className="px-3 py-1.5 rounded text-xs font-bold bg-emerald-700 text-white inline-flex items-center gap-1"
            >
              <Download size={14} /> สร้าง PDF {customers.length} ไฟล์
            </button>
          </div>
        )}

        {step === STEP_RUN && !running && (
          <div className="flex items-center justify-end gap-2 p-3 border-t border-[var(--bd)]">
            <button onClick={onClose} className="px-3 py-1.5 rounded text-xs bg-neutral-700 text-white">ปิด</button>
          </div>
        )}
      </div>
    </div>
  );
}
