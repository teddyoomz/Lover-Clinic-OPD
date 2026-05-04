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

import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import DOMPurify from 'dompurify';
import { FileText, Printer, ChevronLeft, X, Loader2, Search, ZoomIn, ZoomOut, Maximize2, Download, MessageCircle } from 'lucide-react';
import DateField from '../DateField.jsx';
import { listDocumentTemplates, getNextCertNumber, listDoctors, listStaff, upgradeSystemDocumentTemplates, recordDocumentPrint, saveDocumentDraft, findResumableDraft, deleteDocumentDraft } from '../../lib/scopedDataLayer.js';
import {
  DOC_TYPE_LABELS,
} from '../../lib/documentTemplateValidation.js';
import { printDocument, buildPrintContext, renderTemplate, safeImgTag, exportDocumentToPdf } from '../../lib/documentPrintEngine.js';
import { computeStaffAutoFill } from '../../lib/documentFieldAutoFill.js';
import { sendDocumentLine } from '../../lib/sendDocumentClient.js';
import { useEffectiveClinicSettings, useSelectedBranch } from '../../lib/BranchContext.jsx';
import { filterStaffByBranch, filterDoctorsByBranch } from '../../lib/branchScopeUtils.js';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import SignatureCanvasField from './SignatureCanvasField.jsx';
import StaffSelectField from './StaffSelectField.jsx';
import LangPillToggle from './LangPillToggle.jsx';

// Print templates rely on inline `style="..."` + `class="..."` for layout
// fidelity (no <style> blocks — print engine adds its own stylesheet via
// buildPrintDocument). Profile is centralized so xss tests can re-import.
const SANITIZE_PROFILE = {
  ADD_ATTR: ['style', 'class'],
  // Forbid these explicitly — defense-in-depth on top of DOMPurify defaults.
  // <style> stripped because template body shouldn't carry its own
  // stylesheet (engine injects one). <script>/iframe/etc. stripped to
  // close the XSS surface admin-typed templates expose.
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur', 'onsubmit'],
};

const STEP_PICK = 'pick';
const STEP_FILL = 'fill';

// Phase 14.x — paper size dimensions (in mm) for the in-modal preview.
// Used to render preview at TRUE paper size + scale-to-fit so the user
// always sees the entire page regardless of monitor / browser zoom.
// Keep in sync with documentTemplateValidation.PAPER_SIZES.
const PAPER_DIMENSIONS_MM = {
  'A4':            { width: 210, height: 297, padding: 15 },
  'A5':            { width: 148, height: 210, padding: 12 },
  'label-57x32':   { width:  57, height:  32, padding:  2 },
};
// Defensive fallback (unknown paper size → A4 layout)
const PAPER_FALLBACK = PAPER_DIMENSIONS_MM.A4;
// 1mm = 96 / 25.4 css px (standard CSS unit conversion)
const MM_TO_PX = 96 / 25.4;

export default function DocumentPrintModal({
  open,
  onClose,
  clinicSettings: rawClinicSettings,
  customer,
  // Optional pre-fill context — e.g. treatment form passes diagnosis/findings
  // or sale detail passes originalSaleId. Merged with customer/clinic defaults.
  prefillValues = {},
  // Restrict picker to one or more docTypes (e.g. SaleDetail only offers
  // 'sale-cancelation'). Empty array = all 13 docTypes.
  docTypeFilter = [],
}) {
  // 2026-04-28: branch-aware clinic info — every PDF generated from this
  // modal pulls clinic name/address/phone/taxId from the selected branch's
  // be_branches doc (with clinic_settings fallback). User directive:
  // "เปลี่ยนให้ระบบ Gen PDF ของเราทั้งหมดดึงข้อมูลคลินิกจาก ข้อมูลของสาขา".
  const clinicSettings = useEffectiveClinicSettings(rawClinicSettings);
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [step, setStep] = useState(STEP_PICK);
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState({});
  // Phase 14.10 (2026-04-26) — saved drafts. draftId tracks the active
  // draft so subsequent saves overwrite the same doc. resumeBanner shows
  // when a previous draft is found on template pick (admin can opt-in).
  const [draftId, setDraftId] = useState('');
  const [resumeBanner, setResumeBanner] = useState(null); // { draft } or null
  // 2026-04-25 — staff/doctor lists for staff-select fields. Lazy-loaded
  // ONLY when a template that needs them is picked, then cached for the
  // session. Empty arrays = not yet loaded.
  const [doctorList, setDoctorList] = useState(null);
  const [staffList, setStaffList] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStep(STEP_PICK); setSelected(null); setValues({}); setQuery('');
    setLoading(true); setError('');
    // 2026-04-25 — auto-upgrade system templates if SCHEMA_VERSION in code
    // is newer than what's stored. Without this, users only get the latest
    // hidden/staff-select fields after visiting DocumentTemplatesTab. Best-
    // effort: failure here just means stale templates show, not crash.
    upgradeSystemDocumentTemplates().catch(() => {})
      .then(() => listDocumentTemplates({ activeOnly: true }))
      .then(list => {
        const filtered = docTypeFilter.length > 0
          ? list.filter(t => docTypeFilter.includes(t.docType))
          : list;
        setTemplates(filtered);
      })
      .catch(e => setError(e.message || 'โหลดเทมเพลตล้มเหลว'))
      .finally(() => setLoading(false));
    // 2026-04-25 — lazy-load doctor + staff lists ONCE on modal open. Cached
    // for the session so any template can use them without re-fetch. Errors
    // (permission denied / network) gracefully fall back to empty list so
    // the dropdown doesn't stay stuck on "กำลังโหลด...".
    // Phase BSA leak-fix (2026-05-04): branch soft-gate. Print signers
    // should be staff at the current branch.
    listDoctors().then((d) => setDoctorList(filterDoctorsByBranch(d || [], selectedBranchId))).catch((err) => {
      console.warn('[DocumentPrintModal] listDoctors failed:', err?.message || err);
      setDoctorList([]);
    });
    listStaff().then((s) => setStaffList(filterStaffByBranch(s || [], selectedBranchId))).catch((err) => {
      console.warn('[DocumentPrintModal] listStaff failed:', err?.message || err);
      setStaffList([]);
    });
  }, [open, docTypeFilter.join(','), selectedBranchId]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t => {
      const hay = [t.name, DOC_TYPE_LABELS[t.docType], t.docType].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [templates, query]);

  // Phase 14.2 — toggles + language live alongside fill values. Toggles
  // are reset to the template's defaultOn per pick. Language defaults to
  // template.language (th/en/bilingual). Both surface as UI controls
  // before the fill form so staff can mirror ProClinic's print options.
  const [toggles, setToggles] = useState({});
  const [language, setLanguage] = useState('th');

  const handlePick = async (t) => {
    setSelected(t);
    const initial = {};
    for (const f of (t.fields || [])) {
      if (prefillValues[f.key] != null) initial[f.key] = prefillValues[f.key];
      // 2026-04-25 — checkbox fields default to '☐' (visible empty box) so
      // the printed doc renders the box even when the user hasn't toggled
      // the checkbox. Without this, an empty value renders as nothing,
      // leaving a blank space where the user expects ☐.
      else if (f.type === 'checkbox') initial[f.key] = '☐';
      // Phase 14.8.B (2026-04-26) — signature defaults to empty string.
      // The print engine treats falsy values as "no image", which keeps
      // the signature line clean when the user hasn't signed.
      else if (f.type === 'signature') initial[f.key] = '';
    }
    // (Doctor/staff lists already loaded by modal-open useEffect — no need
    // to re-fetch here. Cached across template picks within a session.)
    // Phase 14.2.B — auto-generate cert# if the template has a `certNumber`
    // field and the user hasn't provided one via prefill. Uses runTransaction
    // for race-safety (matches the invoice-counter pattern). Best-effort:
    // if Firestore is unavailable / rules block, leave field empty.
    const hasCertNumberField = (t.fields || []).some(f => f.key === 'certNumber');
    if (hasCertNumberField && !initial.certNumber) {
      try {
        initial.certNumber = await getNextCertNumber(t.docType);
      } catch (_e) { /* leave empty if counter not writable */ }
    }
    setValues(initial);
    // Initialize toggles. Phase 14.2.B (2026-04-25): when a template has
    // NO toggles array (i.e. cert is "always-on" per ProClinic — fit-to-fly,
    // patient-referral, medical-cert, driver-license), default the universal
    // toggle keys to TRUE so {{#if showCertNumber}} / {{#if showPatientSignature}}
    // blocks in the shared sub-templates render. Templates with explicit
    // toggles use their declared defaultOn instead.
    const initToggles = {};
    const declared = Array.isArray(t.toggles) ? t.toggles : [];
    if (declared.length === 0) {
      initToggles.showCertNumber = true;
      initToggles.showPatientSignature = true;
    } else {
      for (const tog of declared) initToggles[tog.key] = !!tog.defaultOn;
    }
    setToggles(initToggles);
    setLanguage(t.language || 'th');
    setStep(STEP_FILL);

    // Phase 14.10 — saved-draft probe. Look up the most recent draft for
    // this template + customer + caller. If found, surface a banner so
    // admin can opt in to resume the prior fill session.
    setResumeBanner(null);
    setDraftId('');
    findResumableDraft({
      templateId: t.id,
      customerId: customer?.customerId || customer?.id || '',
    }).then((draft) => {
      // Don't auto-load; user opts in (avoid surprising overwrite of
      // a prefill the parent passed in).
      if (draft && draft.draftId) setResumeBanner({ draft });
    }).catch(() => {/* non-fatal */});
  };

  const acceptResumeDraft = () => {
    const draft = resumeBanner?.draft;
    if (!draft) return;
    if (draft.values && typeof draft.values === 'object') setValues(draft.values);
    if (draft.toggles && typeof draft.toggles === 'object') setToggles(draft.toggles);
    if (draft.language) setLanguage(draft.language);
    setDraftId(draft.draftId);
    setResumeBanner(null);
  };

  const dismissResumeBanner = () => setResumeBanner(null);

  // Phase 14.10 — debounced auto-save. Fires 1.2s after the last `values`
  // mutation. Skips empty drafts + the initial render. Per-modal lifetime
  // draftId means subsequent saves overwrite the same doc.
  const draftIdRef = useRef('');
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);
  useEffect(() => {
    if (step !== STEP_FILL || !selected) return undefined;
    const valueCount = Object.values(values || {}).filter(v => v !== '' && v != null).length;
    if (valueCount === 0) return undefined;
    const handle = setTimeout(() => {
      let id = draftIdRef.current;
      if (!id) {
        const tsCompact = new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '').slice(0, 12);
        const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)))
          .map(b => b.toString(16).padStart(2, '0')).join('');
        id = `DFT-${tsCompact}-${rand}`;
        setDraftId(id);
      }
      saveDocumentDraft(id, {
        templateId: selected.id,
        customerId: customer?.customerId || customer?.id,
        customerHN: customer?.proClinicHN || customer?.hn,
        customerName: customer?.customerName || customer?.name,
        values,
        language,
        toggles,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[DocumentPrintModal] draft auto-save failed (non-fatal):', err?.message || err);
      });
    }, 1200);
    return () => clearTimeout(handle);
    // values is the trigger; selected/customer/language/toggles read inside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, selected, language, toggles, step]);

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
        language,
        toggles,
      });
      if (!win) {
        setError('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาตป๊อปอัพ');
        return;
      }
      // Phase 14.9 (2026-04-26) — append-only audit log. Non-fatal: print
      // already succeeded; logging failure is logged but doesn't surface
      // to the user (avoids confusing them).
      recordDocumentPrint({
        templateId: selected.id,
        templateName: selected.name,
        docType: selected.docType,
        customerId: customer?.customerId || customer?.id,
        customerHN: customer?.proClinicHN || customer?.hn,
        customerName: customer?.customerName || customer?.name,
        action: 'print',
        language: language || selected.language,
        paperSize: selected.paperSize,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[DocumentPrintModal] audit log write failed (non-fatal):', err?.message || err);
      });
      // Phase 14.10 — clear the draft after successful print (it served
      // its purpose). Non-fatal: print already succeeded.
      if (draftId) {
        deleteDocumentDraft(draftId).catch(() => {/* non-fatal */});
        setDraftId('');
      }
    } catch (e) {
      setError(e.message || 'พิมพ์ล้มเหลว');
    }
  };

  // Phase 14.8.C (2026-04-26) — PDF export. Same required-field gate as
  // handlePrint. html2pdf.js is dynamically imported inside the engine
  // so it doesn't bloat the main bundle. UI shows "กำลังสร้าง PDF..."
  // during the ~1-3s render; download triggers automatically on success.
  const [pdfBusy, setPdfBusy] = useState(false);
  // T3.e (2026-04-26) — LINE delivery state. Email/SMTP intentionally NOT
  // supported per user directive ("มีแค่ระบบ line official"). busy/result
  // /error so the modal shows one inline status banner.
  const [deliveryBusy, setDeliveryBusy] = useState('');         // '' | 'line'
  const [deliveryResult, setDeliveryResult] = useState(null);   // { channel, recipient } | null
  const [deliveryError, setDeliveryError] = useState('');
  const handleExportPdf = async () => {
    if (!selected) return;
    const missing = (selected.fields || []).filter(f => f.required && !String(values[f.key] || '').trim());
    if (missing.length > 0) {
      setError(`กรุณากรอก: ${missing.map(f => f.label || f.key).join(', ')}`);
      return;
    }
    setError('');
    setPdfBusy(true);
    try {
      await exportDocumentToPdf({
        template: selected,
        clinic: clinicSettings || {},
        customer: customer || {},
        values,
        language,
        toggles,
      });
      // Phase 14.9 — audit log (non-fatal, fire-and-forget)
      recordDocumentPrint({
        templateId: selected.id,
        templateName: selected.name,
        docType: selected.docType,
        customerId: customer?.customerId || customer?.id,
        customerHN: customer?.proClinicHN || customer?.hn,
        customerName: customer?.customerName || customer?.name,
        action: 'pdf',
        language: language || selected.language,
        paperSize: selected.paperSize,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[DocumentPrintModal] audit log write failed (non-fatal):', err?.message || err);
      });
      // Phase 14.10 — clear the draft after successful PDF export.
      if (draftId) {
        deleteDocumentDraft(draftId).catch(() => {/* non-fatal */});
        setDraftId('');
      }
    } catch (e) {
      setError(e.message || 'สร้าง PDF ล้มเหลว');
    } finally {
      setPdfBusy(false);
    }
  };

  // T3.e (2026-04-26) LINE-only — email/SMTP intentionally not supported.
  const handleSendLine = async () => {
    if (deliveryBusy) return;
    const defaultLine = customer?.lineUserId || customer?.patientData?.lineUserId || '';
    const recipient = window.prompt(
      'ส่งลิงก์เอกสารไปที่ LINE userId ของลูกค้า — โปรดยืนยัน LINE userId:',
      defaultLine,
    );
    if (!recipient) return;
    setDeliveryBusy('line');
    setDeliveryError('');
    setDeliveryResult(null);
    try {
      // For LINE we don't push the binary — just send a notice that the
      // document is ready. Phase 14.9 future: upload PDF to Firebase
      // Storage + sign URL, then pass via pdfUrl. v1 sends a text-only
      // notification.
      await sendDocumentLine({
        recipient: recipient.trim(),
        message: `เรียน คุณ${customer?.customerName || ''} เอกสาร "${selected.name}" พร้อมแล้ว — โปรดแจ้งคลินิกหากต้องการรับ`,
      });
      setDeliveryResult({ channel: 'line', recipient });
      recordDocumentPrint({
        templateId: selected.id,
        templateName: selected.name,
        docType: selected.docType,
        customerId: customer?.customerId || customer?.id,
        customerHN: customer?.proClinicHN || customer?.hn,
        customerName: customer?.customerName || customer?.name,
        action: 'line',
        recipient,
        language: language || selected.language,
        paperSize: selected.paperSize,
      }).catch(() => { /* non-fatal */ });
    } catch (e) {
      if (e.code === 'CONFIG_MISSING') {
        setDeliveryError(`ยังไม่ได้ตั้งค่า LINE Channel Access Token — โปรดเพิ่มที่ ตั้งค่าคลินิก → Chat → LINE. (${e.message})`);
      } else {
        setDeliveryError(e.message || 'ส่ง LINE ล้มเหลว');
      }
    } finally {
      setDeliveryBusy('');
    }
  };

  const previewHtml = useMemo(() => {
    if (!selected) return '';
    const ctx = buildPrintContext({
      clinic: clinicSettings || {},
      customer: customer || {},
      values,
      language,
      toggles,
    });
    return renderTemplate(selected.htmlTemplate || '', ctx);
  }, [selected, values, clinicSettings, customer, language, toggles]);

  // Phase 14.x — paper-size-aware preview scaling. The preview pane should
  // ALWAYS show the entire page (A4/A5/label) regardless of monitor size or
  // browser zoom. Approach: render the preview content at TRUE mm dimensions,
  // then transform: scale() it to fit the available container width. The
  // outer wrapper takes the scaled space so layout flows correctly.
  const paper = selected?.paperSize && PAPER_DIMENSIONS_MM[selected.paperSize]
    ? PAPER_DIMENSIONS_MM[selected.paperSize]
    : PAPER_FALLBACK;
  const previewContainerRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(0.5);
  // Phase 14.x — manual zoom multiplier. Stacks on top of the auto-fit scale.
  // Aspect ratio is automatically preserved because we apply one uniform
  // scale value to both width and height. zoomMultiplier=1 means "fit".
  const [zoomMultiplier, setZoomMultiplier] = useState(1);
  const ZOOM_STEP = 0.25;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 5;
  const effectiveScale = previewScale * zoomMultiplier;
  // Reset zoom when switching templates (different paper size = different fit)
  useEffect(() => { setZoomMultiplier(1); }, [selected?.id]);

  // 2026-04-25 — hand-drag pan on the preview. When user is zoomed past
  // 100% (zoomMultiplier > 1), the doc overflows the container and they
  // need to pan to see all corners. Native scrollbars work but a grab
  // cursor + drag interaction is the world-class UX (matches Adobe Acrobat,
  // Figma, Google Docs zoom mode).
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
  const onPanStart = (e) => {
    if (zoomMultiplier <= 1) return; // no need to pan when fit
    const el = previewContainerRef.current;
    if (!el) return;
    isPanning.current = true;
    const point = e.touches ? e.touches[0] : e;
    panStart.current = {
      x: point.clientX, y: point.clientY,
      scrollX: el.scrollLeft, scrollY: el.scrollTop,
    };
    el.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const onPanMove = (e) => {
    if (!isPanning.current) return;
    const el = previewContainerRef.current;
    if (!el) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - panStart.current.x;
    const dy = point.clientY - panStart.current.y;
    el.scrollLeft = panStart.current.scrollX - dx;
    el.scrollTop  = panStart.current.scrollY - dy;
  };
  const onPanEnd = () => {
    if (!isPanning.current) return;
    isPanning.current = false;
    const el = previewContainerRef.current;
    if (el) el.style.cursor = zoomMultiplier > 1 ? 'grab' : 'auto';
  };
  // Attach mousemove/mouseup at window level so drag continues even if
  // cursor leaves the container.
  useEffect(() => {
    const handleMove = (e) => onPanMove(e);
    const handleEnd = () => onPanEnd();
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [zoomMultiplier]);

  // 2026-04-25 — mouse-wheel zoom on preview (Adobe Acrobat / Figma UX).
  // Wheel up = zoom in, wheel down = zoom out. Hold Ctrl to constrain to
  // wheel-only (without Ctrl, normal scroll behavior). Smooth 5% per notch
  // to feel natural.
  const onWheelZoom = (e) => {
    // Only intercept when wheel happens INSIDE the preview container.
    // We use a non-passive listener so we can preventDefault().
    const delta = e.deltaY;
    if (delta === 0) return;
    e.preventDefault();
    const step = delta > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoomMultiplier(z => {
      const next = +(z + step).toFixed(2);
      return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    });
  };
  // Attach wheel listener with { passive: false } so preventDefault works.
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const handler = (e) => onWheelZoom(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [/* re-attach when ref changes — open toggles ref */ open, step]);
  useLayoutEffect(() => {
    if (!previewContainerRef.current) return;
    const updateScale = () => {
      const el = previewContainerRef.current;
      if (!el) return;
      // Subtract container padding (16px on each side from p-4)
      const containerInnerWidth = el.clientWidth - 32;
      const paperWidthPx = paper.width * MM_TO_PX;
      if (paperWidthPx <= 0 || containerInnerWidth <= 0) return;
      // Always fit width. Cap at 1.0 so we never scale up beyond paper size.
      const next = Math.min(1, containerInnerWidth / paperWidthPx);
      setPreviewScale(prev => Math.abs(prev - next) > 0.01 ? next : prev);
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(previewContainerRef.current);
    // Also re-fit on window resize (covers zoom changes which don't always
    // fire ResizeObserver depending on browser).
    window.addEventListener('resize', updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [paper.width]);

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
          {/* Phase 14.10 — saved-draft resume banner */}
          {step === STEP_FILL && resumeBanner?.draft && (
            <div
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/40 text-amber-200 text-xs"
              data-testid="document-resume-banner"
            >
              <span>
                พบฉบับร่างที่บันทึกไว้ก่อนหน้า ({String(resumeBanner.draft.updatedAt || '').slice(0, 16).replace('T', ' ')}) — ต้องการดึงค่าฟอร์มกลับมาหรือไม่?
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={acceptResumeDraft}
                  data-testid="document-resume-accept"
                  className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white text-[11px] font-bold"
                >
                  ดึงค่ากลับมา
                </button>
                <button
                  type="button"
                  onClick={dismissResumeBanner}
                  data-testid="document-resume-dismiss"
                  className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white text-[11px]"
                >
                  ไม่
                </button>
              </div>
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
                {/* Phase 14.2 — top toggle bar (mirrors ProClinic): per-template
                    show/hide gates + TH/EN/bilingual language switch. */}
                <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--bd)]">
                  {(selected.toggles || []).map(tog => (
                    <label key={tog.key} className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                      data-testid={`document-print-toggle-${tog.key}`}>
                      <input type="checkbox"
                        checked={!!toggles[tog.key]}
                        onChange={(e) => setToggles(prev => ({ ...prev, [tog.key]: e.target.checked }))}
                        className="cursor-pointer" />
                      <span>{tog.labelTh}</span>
                    </label>
                  ))}
                  <div className="ml-auto flex items-center gap-1 text-xs">
                    <span className="text-[var(--tx-muted)]">ภาษา:</span>
                    {/* V33.7 (Rule C1) — extracted to shared LangPillToggle.
                        Behavior preserved: violet-700 active, 3 options. */}
                    <LangPillToggle
                      value={language}
                      onChange={(lang) => setLanguage(lang)}
                      options={['th', 'en', 'bilingual']}
                      activeClassName="bg-violet-700 text-white border-violet-700"
                      ariaLabel="document language"
                    />
                  </div>
                </div>
                <div className="text-xs text-[var(--tx-muted)]">
                  กรอกข้อมูลที่จำเป็น — ค่าอื่นๆ ระบบเติมอัตโนมัติจากข้อมูลลูกค้า/คลินิก
                </div>
                {/* 2026-04-25 — skip `hidden: true` fields (auto-fill HTML
                    blocks like treatmentRecordRows / homeMedicationRows /
                    deductionRows). Render checkbox type as a real toggle
                    (was previously rendered as raw text — UX disaster). */}
                {(selected.fields || []).filter(f => !f.hidden).map((f) => {
                  // Doctor/staff dropdown: searchable combobox loaded from
                  // be_doctors / be_staff. The stored value is the display
                  // name (string), so the template's {{key}} placeholder
                  // continues to render the same way as a free-text field.
                  if (f.type === 'staff-select') {
                    const src = f.source || 'doctors';
                    const list = src === 'staff' ? staffList
                               : src === 'doctors+staff' ? [...(doctorList || []), ...(staffList || [])]
                               : doctorList;
                    return (
                      <StaffSelectField
                        key={f.key}
                        field={f}
                        value={values[f.key] || ''}
                        list={list}
                        onChange={(displayName, record) => {
                          // V32-tris (2026-04-26) — auto-fill via shared helper.
                          // When a doctor/staff/assistant is picked, populate
                          // ALL related fields the template has from the
                          // be_doctors / be_staff record (license / phone /
                          // email / position / English name / department /
                          // signature). See documentFieldAutoFill.js for the
                          // full <baseKey><Suffix> convention.
                          setValues(vs => ({
                            ...vs,
                            [f.key]: displayName,
                            ...computeStaffAutoFill(record, f.key, selected.fields || []),
                          }));
                        }}
                      />
                    );
                  }
                  // Phase 14.8.B (2026-04-26) — signature canvas field.
                  // Captures hand-drawn signature as base64 PNG data URL.
                  // Template references via {{{fieldKey}}} (3-brace = raw).
                  // For print engine compatibility, value is wrapped in
                  // safeImgTag at render time.
                  if (f.type === 'signature') {
                    return (
                      <div key={f.key} className="space-y-1" data-field={f.key}>
                        <label className="block text-xs text-[var(--tx-muted)]">
                          {f.label || f.key}{f.required && <RequiredAsterisk className="ml-0.5" />}
                        </label>
                        <SignatureCanvasField
                          value={values[f.key] || ''}
                          onChange={(dataUrl) => setValues(v => ({ ...v, [f.key]: dataUrl }))}
                          width={400}
                          height={120}
                        />
                      </div>
                    );
                  }
                  // Checkbox: toggles between '☑' and '' (empty = unchecked).
                  // Template uses {{markKey}} which renders the symbol or
                  // nothing — keeps the rendered HTML semantically correct.
                  if (f.type === 'checkbox') {
                    const checked = values[f.key] === '☑';
                    return (
                      <label key={f.key} className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.checked ? '☑' : '☐' }))}
                          className="cursor-pointer accent-red-600"
                          data-field={f.key}
                        />
                        <span className="text-[var(--tx-primary)]">
                          {f.label || f.key}{f.required && <RequiredAsterisk className="ml-0.5" />}
                        </span>
                      </label>
                    );
                  }
                  return (
                    <div key={f.key} className="space-y-1">
                      <label className="block text-xs text-[var(--tx-muted)]">
                        {f.label || f.key}{f.required && <RequiredAsterisk className="ml-0.5" />}
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
                  );
                })}
              </div>
              {/* Preview — Phase 14.x: full-page scale-to-fit + user zoom.
                  Renders the template at TRUE paper size (A4/A5/label-57x32
                  in mm) and scales it via transform: scale() to always show
                  the entire document. User can zoom in for detail; aspect
                  ratio is locked (single uniform scale value). */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--tx-muted)]">
                  <span>พรีวิว ({selected?.paperSize || 'A4'})</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setZoomMultiplier(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
                      disabled={zoomMultiplier <= ZOOM_MIN + 0.001}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="ซูมออก"
                      aria-label="ซูมออก"
                      data-testid="document-print-zoom-out"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomMultiplier(1)}
                      className="px-2 py-1 rounded hover:bg-[var(--bg-hover)] font-mono text-[11px] min-w-[56px] text-center"
                      title="พอดีหน้า (Fit)"
                      data-testid="document-print-zoom-fit"
                    >
                      {Math.round(effectiveScale * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomMultiplier(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
                      disabled={zoomMultiplier >= ZOOM_MAX - 0.001}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="ซูมเข้า"
                      aria-label="ซูมเข้า"
                      data-testid="document-print-zoom-in"
                    >
                      <ZoomIn size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomMultiplier(1)}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] ml-1"
                      title="รีเซ็ตเป็นพอดีหน้า"
                      aria-label="รีเซ็ตซูม"
                      data-testid="document-print-zoom-reset"
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>
                {/* 2026-04-25 — preview-scoped CSS: text-on-underline alignment +
                    signature column centering. Mirrors the rules in the print
                    window's <head> (documentPrintEngine.buildPrintDocument)
                    so what-you-see-is-what-you-print. */}
                <style>{`
                  /* V32-tris round 2 (2026-04-26) — preview MUST mirror
                     the print + PDF layout. Padding-bottom: 10px pushes
                     the dotted underline FURTHER below the digit baseline
                     for clear breathing room. User reported "ต้องเอาขึ้น
                     อีกนิด" — 10px matches ProClinic's reference. */
                  [data-testid="document-print-preview"] span[style*="border-bottom:1px dotted"][style*="display:inline-block"],
                  [data-testid="document-print-preview"] span[style*="border-bottom: 1px dotted"][style*="display: inline-block"] {
                    line-height: 14px !important;
                    height: auto !important;
                    padding-top: 4px !important;
                    padding-bottom: 10px !important;
                    vertical-align: bottom !important;
                    white-space: pre-wrap !important;
                    box-sizing: content-box !important;
                  }
                  [data-testid="document-print-preview"] div[style*="border-bottom:1px dotted"][style*="min-height"],
                  [data-testid="document-print-preview"] div[style*="border-bottom: 1px dotted"][style*="min-height"] {
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: flex-end !important;
                    padding-bottom: 4px !important;
                    white-space: pre-wrap !important;
                  }
                  [data-testid="document-print-preview"] .sig-col,
                  [data-testid="document-print-preview"] .signature-col { text-align: center; }
                `}</style>
                <div
                  ref={previewContainerRef}
                  className="p-4 rounded-lg bg-neutral-200 dark:bg-neutral-800 max-h-[80vh] overflow-auto select-none"
                  data-testid="document-print-preview-container"
                  style={{ cursor: zoomMultiplier > 1 ? 'grab' : 'auto' }}
                  onMouseDown={onPanStart}
                  onTouchStart={onPanStart}
                >
                  {/* Scaled wrapper takes the visible scaled space so the
                      surrounding layout flows correctly. Single scale =
                      aspect-ratio-safe (height & width scale together).
                      Centered via margin:auto when smaller than container,
                      flush-left when zoomed past it (so scroll reaches
                      every corner — fix for "ซุมแล้วเลื่อนดูไม่ครบ"). */}
                  <div
                    style={{
                      width:  `${paper.width  * effectiveScale}mm`,
                      height: `${paper.height * effectiveScale}mm`,
                      margin: '0 auto',
                    }}
                  >
                    <div
                      style={{
                        width:  `${paper.width}mm`,
                        minHeight: `${paper.height}mm`,
                        padding: `${paper.padding}mm`,
                        boxSizing: 'border-box',
                        background: '#ffffff',
                        color: '#000000',
                        fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif",
                        fontSize: '12px',
                        lineHeight: 1.5,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                        transform: `scale(${effectiveScale})`,
                        transformOrigin: 'top left',
                      }}
                      data-testid="document-print-preview"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml, SANITIZE_PROFILE) }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* T3.e (2026-04-26) — delivery status banner. Surfaces email/LINE
            send result OR config-missing error inline above the footer. */}
        {step === STEP_FILL && (deliveryResult || deliveryError) && (
          <div className="px-3 py-2 border-t border-[var(--bd)]" data-testid="document-delivery-banner">
            {deliveryResult && (
              <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs">
                ส่งสำเร็จทาง {deliveryResult.channel === 'email' ? 'อีเมล' : 'LINE'} → {deliveryResult.recipient}
              </div>
            )}
            {deliveryError && (
              <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs" data-testid="document-delivery-error">
                {deliveryError}
              </div>
            )}
          </div>
        )}
        {/* Footer */}
        {step === STEP_FILL && (
          <div className="flex items-center justify-end gap-2 p-3 border-t border-[var(--bd)]">
            <button onClick={onClose} className="px-3 py-1.5 rounded text-xs bg-neutral-700 text-white">ยกเลิก</button>
            <button onClick={handleSendLine} disabled={!!deliveryBusy || pdfBusy}
              data-testid="document-send-line"
              title="แจ้ง LINE ลูกค้า"
              className="px-3 py-1.5 rounded text-xs font-bold bg-[#06C755] text-white inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed">
              {deliveryBusy === 'line' ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
              {deliveryBusy === 'line' ? 'กำลังส่ง...' : 'แจ้ง LINE'}
            </button>
            <button onClick={handleExportPdf} disabled={pdfBusy || !!deliveryBusy}
              data-testid="document-export-pdf"
              className="px-3 py-1.5 rounded text-xs font-bold bg-sky-700 text-white inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed">
              {pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {pdfBusy ? 'กำลังสร้าง PDF...' : 'PDF'}
            </button>
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

// V32-tris (2026-04-26) — local StaffSelectField removed. Now imported from
// './StaffSelectField.jsx' so BulkPrintModal + future callers share the
// SAME smart dropdown + auto-fill logic. Auto-fill helper extracted to
// '../../lib/documentFieldAutoFill.js'.
