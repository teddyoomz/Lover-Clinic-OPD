// audit-branch-scope: TFP buy-fetcher needs beCourseToMasterShape canonical mapper (V44 single-source contract; mapper is branch-blind pure helper). Direct backendClient.js dynamic-import sanctioned because scopedDataLayer.js does NOT re-export bare beCourseToMasterShape; only listCoursesForPicker (which uses it internally) is exposed. Refactor to listCoursesForPicker would require restructuring buy fetcher's preloaded productLookup pattern; deferred until a clean refactor pass. See V49 V-entry + audit-branch-scope BS-1.
import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { LocalInput, LocalTextarea } from './form/LocalField.jsx';
// TFP extraction step 1 (2026-07-07) — 7 memo'd leaf components moved verbatim
// to ./treatment-form/TfpFormPrimitives.jsx (flushSync moved with OPDFieldWithPrev).
import { SectionHeader, FormSection, ActionBtn, LabPriceSummary, MedPriceSummary, VitalsGrid, OPDFieldWithPrev } from './treatment-form/TfpFormPrimitives.jsx';
import DepositPicker from './backend/DepositPicker.jsx';
import WalletPicker from './backend/WalletPicker.jsx';
import { ArrowLeft, Loader2, Stethoscope, Heart, Thermometer, ClipboardList,
         Pill, ShoppingCart, DollarSign, Shield, CreditCard, Check, Plus, Trash2,
         Search, Package, Edit3, RotateCcw, Camera, X, ImageIcon, FlaskConical, Copy, Paperclip,
         AlertCircle, ClipboardCheck, Calendar, Activity, Maximize2 } from 'lucide-react';
import { doc, setDoc, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
// V50 (2026-05-08) — ProClinic strip. `import * as broker` removed. All
// runtime data fetches now go through scopedDataLayer.js (be_* canonical).
// saveTarget default changed below from 'proclinic' to 'backend' so admin/
// backend code paths converge — one unified system, branch-aware via BSA.
import { thaiTodayISO } from '../utils.js';
import { mapPromotionProductsToConsumables, filterOutConsumablesForPromotion, buildCustomerPromotionGroups, buildCustomerCourseGroups, buildPurchasedCourseEntry, findMissingFillLaterQty, resolvePickedCourseEntry, resolvePurchasedCourseForAssign, isPurchasedSessionRowId, mapRawCoursesToForm, isCourseUsableInTreatment, buildPromotionSubCourseProducts, overlayCustomerCoursesWithMaster, buildReDeductListWithCarryForward, buildCourseItemsForSave } from '../lib/treatmentBuyHelpers.js';
import { chartEntryForPersist } from '../lib/tabletChartTools.js';
import { aaAccent } from '../lib/themeAccent.js';
import { ModalScrollLock } from '../lib/useModalScrollLock.js';
// ED Score (2026-06-15) — หมายเหตุทั่วไป shows the latest-2 ED rounds (doctor
// context while writing) + strips the baked ED screening from the note.
import { listenToAssessments } from '../lib/scopedDataLayer.js';
import { pickKioskAssessmentFields } from '../lib/kioskAssessmentFields.js';
import { latestRounds } from '../lib/assessmentRoundsCore.js';
import { scoreForType, ED_TYPE_META, stripScreeningSection, formatRoundDate } from '../lib/edScoreDisplay.js';
// 2026-05-25 — Storage-ref for ALL treatment blobs (photos / lab images / PDFs).
// Class-of-bug fix (Rule P): inline base64 in be_treatments doc → 1 MiB cap →
// intermittent save failure + upload jank. Mirrors the 2026-05-22 chart fix.
import { processAndUploadTreatmentImage, uploadTreatmentPdf } from '../lib/treatmentImageUpload.js';
import { deleteTreatmentBlob } from '../lib/chartImageStorage.js';
import { debugLog } from '../lib/debugLog.js';
import ChartSection from './ChartSection.jsx';
import DateField from './DateField.jsx';
import OpdNoteTemplateMenu from './OpdNoteTemplateMenu.jsx';
import { appendTemplateToCc } from '../lib/opdNoteTemplateValidation.js';
import ImageLightbox from './ImageLightbox.jsx';
import DfEntryModal from './backend/DfEntryModal.jsx';
import PickProductsModal from './backend/PickProductsModal.jsx';
import EditAttributionModal from './backend/EditAttributionModal.jsx';
import TreatmentReadOnlyMirror from './backend/TreatmentReadOnlyMirror.jsx';
import { buildDefaultRows, generateDfEntryId, buildMasterIdByName } from '../lib/dfEntryValidation.js';
import { getRateForStaffCourse } from '../lib/dfGroupValidation.js';
// Phase 14.7.H follow-up A — branch-aware sale + stock writes.
// Phase 17.2 (2026-05-05): BranchProvider hoisted to App.jsx so every
// reachable mount of TreatmentFormPage (BackendDashboard, AdminDashboard
// overlay, public-link routes) sees the same provider. The hook returns
// the user's persisted selection (per-uid localStorage) or `null` until
// branches load — callers guard with `branchId || ''` defensive defaults.
import { useSelectedBranch } from '../lib/BranchContext.jsx';
import { filterStaffByBranch, filterDoctorsByBranch } from '../lib/branchScopeUtils.js';
// Task 9 (LINE OA Appointment Reminder, 2026-05-15) — shared customer
// name + per-branch LINE badge (LR-4 lock). Used in the TFP header
// so admin sees per-branch LINE linkage state alongside the patient
// name. patientData prop is the canonical be_customers.patientData
// shape and may carry lineUserId / lineUserId_byBranch when
// available.
import { CustomerOption } from './CustomerOption.jsx';
// Task 10 (LINE OA Appointment Reminder, 2026-05-15) — LR-4 lock part 2.
// LineNotifyConfirmation is the per-modal LINE-notify confirmation card.
// TreatmentFormPage edits/creates BE TREATMENTS (be_treatments docs), NOT
// appointments — so the canonical notifyChannel state lives on the
// be_appointments doc that AppointmentFormModal / DepositPanel /
// AdminDashboard already write. TFP DOES NOT add a new appointment record
// at save time (treatments link to existing appointments via
// linkedAppointmentId; appointment creation is handled by the dedicated
// appointment-creating modals). The import here documents the LR-4
// invariant: every appointment-creating surface routes through
// LineNotifyConfirmation. TFP is NOT an appointment-creating surface;
// the notifyChannel marker below is structural (audit/source-grep
// invariant) — there is no auto-tick effect or render block in TFP.
// (Source-grep AV45 / LR-4 invariant — import-presence + intent comment
// is the canonical pattern for "treatment-only, no appt write" surfaces.)
// eslint-disable-next-line no-unused-vars
import { LineNotifyConfirmation } from './LineNotifyConfirmation.jsx';
// Source-grep marker — notifyChannel state is OWNED by the appointment-
// creating modals (AppointmentFormModal / DepositPanel /
// AdminDashboard.handleApptFormSubmit). TFP only reads existing
// appointments; it does not write notifyChannel.
// T5.b (2026-04-26) — billing math + BMI + baht formatter extracted to
// pure helpers. `computeTreatmentBilling` mirrors the previous inline
// useMemo logic 1:1; tested in tests/t5b-treatment-billing.test.js.
import { computeTreatmentBilling, computeBmi, formatBaht } from '../lib/treatmentBilling.js';
// Phase 26.2g-fillin-bis (2026-05-13) — canonical resolver reads for TFP auto-fill.
import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
} from '../lib/patientHealthMapping.js';
// Phase 27.1 (2026-05-14) — TFP layout swap: hook + floating button for split-screen.
import { useLayoutPreference } from '../hooks/useLayoutPreference.js';
import { LayoutSwapButton } from './LayoutSwapButton.jsx';
// Phase 26.0a (V26.0, 2026-05-13) — Doctor-Save scaffold. `auth` needed for
// `recordedBy: auth.currentUser?.uid` forensic stamp when doctor saves a
// treatment (status='doctor-recorded'). See spec
// docs/superpowers/specs/2026-05-13-doctor-save-and-admin-finalize-mode-design.md
// section 5.1 (TFP changes) and v-log V26.0 entry.
import { auth } from '../firebase.js';
// V105 (2026-05-19 LATE+3 NIGHT+2) — canonical customer-name resolver.
// Pre-V105 used parent-prop `patientName` directly which only read top-level
// firstname/lastname (lowercase). Customers from FB/LINE/kiosk only have
// `patientData.firstName/lastName` (camelCase nested). Resolver walks ALL
// shape variants. Used in auto-sale chain (createBackendSale customerName +
// customerHN). See AV93 + V105 V-entry.
import { resolveCustomerDisplayName, resolveCustomerHN } from '../lib/customerDisplayName.js';

// ── data-field tag registry (TF2 audit, 2026-05-04) ────────────────────────
//
// Every required-field validator in handleSubmit (and any future addition)
// must target one of these `data-field` keys. The shared scrollToFieldError
// resolver in src/lib/scrollToFieldError.js does
// `document.querySelector('[data-field="<key>"], [name="<key>"]')` and is a
// SILENT NO-OP when the key has no matching node. CLAUDE.md historical bug
// #8 (scrollToError missing data-field) — keep this list in sync with both
// the validator AND the JSX. Tests/tf2-scroll-to-error-coverage.test.js
// asserts no validator key drifts away from the JSX.
//
// Form-section anchors (one per required-field group):
//   doctor                            — แพทย์ select
//   treatmentDate                     — DateField wrapper
//   courseSection                     — entire ข้อมูลการใช้คอร์ส section
//   sellers                           — section wrapper for พนักงานขาย
//   sellers[<idx>]                    — per-row anchor on each pmSellers row
//   paymentChannels                   — section wrapper for ช่องทางชำระเงิน
//   paymentChannels[<idx>]            — per-row anchor on each pmChannels row
//   paymentDate                       — required (วันที่ชำระเงิน *)
//
// Repeating-row anchors (idx is 0-based array index):
//   <treatmentItem.id>                — fill-later qty row (id = courseRowId)
//   purchasedItems[<idx>]             — purchased retail product row
//   medications[<idx>]                — medication row
//   consumables[<idx>]                — consumable row
//
// Vital-sign per-field anchors (forward-looking — vital validators may
// require any one of these to scroll-to-error directly):
//   vitals.weight, vitals.height, vitals.temperature, vitals.pulseRate,
//   vitals.respiratoryRate, vitals.systolicBP, vitals.diastolicBP,
//   vitals.oxygenSaturation
//
// When you ADD a new required-field validator, also add the corresponding
// data-field tag in the JSX AND extend the assertion list in
// tests/tf2-scroll-to-error-coverage.test.js. Otherwise the alert fires
// but the page stays put — exactly the production-affecting silent no-op
// the TF2 audit flagged.
//
// ── Helpers — EXTRACTED (2026-07-07 TFP extraction step 1) ──────────────────
// The 7 memo'd leaf components (SectionHeader / FormSection / ActionBtn /
// LabPriceSummary / MedPriceSummary / VitalsGrid / OPDFieldWithPrev) moved
// VERBATIM to ./treatment-form/TfpFormPrimitives.jsx (imported above).
// data-field="vitals.*" anchors now live there (inside VitalsGrid).

// ── Main Component ──────────────────────────────────────────────────────────

export default function TreatmentFormPage({ mode = 'create', customerId, customerHN: customerHNProp = '', treatmentId, patientName, patientData, isDark, db, appId, onClose, onSaved, saveTarget = 'backend', initialTreatmentDate = '' }) {
  // V35.2-sexies (2026-04-28) — guard against null/undefined customerId.
  // V71.A (2026-05-15) — copy refreshed post-V50 ProClinic strip. ProClinic
  // "clone" / "proClinicId" language no longer applies (V50 removed all
  // ProClinic infrastructure). Modern root cause: caller (e.g. AdminDashboard
  // setTreatmentFormMode JSX prop) forgot to pass `customerId` in the payload.
  // V71.A audit AV50 + tests/v71a-edit-fix-and-unmark.test.jsx U3.x lock the
  // contract that every setTreatmentFormMode({mode:'edit'/'create',...}) call
  // MUST include customerId. Render an error placeholder so save can't fire
  // with a null id.
  const validCustomerId = String(customerId ?? '').trim();
  if (!validCustomerId || validCustomerId === 'null' || validCustomerId === 'undefined') {
    return (
      <div className="p-6 text-center text-rose-400" data-testid="tfp-missing-customer-id">
        <p className="font-bold mb-2">ไม่พบ customerId</p>
        <p className="text-xs text-[var(--tx-muted)] mb-4">
          ไม่สามารถสร้าง/แก้ไขการรักษาได้ — ข้อมูลลูกค้าไม่ถูกส่งให้ครบถ้วน
          (customerId ว่างเปล่า). ปิดและเปิดหน้านี้ใหม่ หรือติดต่อผู้ดูแลระบบ
        </p>
        {onClose && (
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)]">
            กลับ
          </button>
        )}
      </div>
    );
  }
  const isEdit = mode === 'edit';
  // 2026-05-25 — blob-remove cleanup. CREATE mode: a removed blob was uploaded this
  // session + is in NO saved doc → delete the orphan Storage object now. EDIT mode:
  // the saved doc may STILL reference it (until + unless this edit is saved) →
  // do NOT delete here, or cancelling-without-saving would 404 the image. Removed-
  // in-edit blobs become harmless orphans (negligible Storage cost; the delete-
  // treatment cascade still cleans referenced blobs on full delete). Shared by the
  // 4 TFP remove handlers + ChartSection (onBlobRemoved).
  const removeTreatmentBlob = useCallback((storagePath, thumbStoragePath) => {
    if (storagePath && !isEdit) deleteTreatmentBlob(storagePath).catch(() => {});
    // 2026-07-05 thumbs — the thumbnail blob dies with its full image
    if (thumbStoragePath && !isEdit) deleteTreatmentBlob(thumbStoragePath).catch(() => {});
  }, [isEdit]);
  // Note: `canAddNewItems` flag is declared lower (after the
  // `loadedTreatmentStatus` useState declaration) to avoid a temporal
  // dead zone reference error. See the Phase 26.0a comment block below
  // the `loadedTreatmentStatus` state for full rationale.
  const accent = isDark ? '#a78bfa' : '#7c3aed';
  const accentRgb = isDark ? '167,139,250' : '124,58,237';
  // Phase 14.7.H follow-up A + Phase 17.2 — resolve current branch for sale
  // + stock writes. BranchProvider is hoisted to App.jsx (Phase 17.2), so
  // SELECTED_BRANCH_ID always resolves to a real branchId (or null until
  // BranchContext snapshot resolves; callers guard via isReady).
  // Phase 27.0 (2026-05-14) — selectedBranchId alias used in backendDetail write path.
  // SELECTED_BRANCH_ID kept for banner + display usages elsewhere in this file.
  const { branchId: selectedBranchId, branchId: SELECTED_BRANCH_ID, branches: branchList } = useSelectedBranch();
  // Phase 27.1 (2026-05-14) — TFP split-screen layout swap (form-left/history-right
  // default; admin can flip per-device). Reusable hook keyed by 'tfp'.
  const { position: tfpLayout, swap: swapTfpLayout, isPrimaryLeft: isFormLeft } = useLayoutPreference('tfp', 'left');
  // Phase 17.2-septies (2026-05-05) — branch indicator banner. User directive:
  // "ทำให้แสดงสาขาตรงด้านบนของหน้า TFP ทั้งสร้างทั้งแก้ไขเลย user จะได้ไม่
  // สับสน ตัวมึงเองจะได้ไม่สับสนด้วย". Resolved at render time so any branch
  // switch surfaces immediately. data-branch-id on the banner gives future
  // preview_eval / RTL tests a deterministic selector.
  const currentBranch = (branchList || []).find(b => (b.branchId || b.id) === SELECTED_BRANCH_ID) || null;

  // Phase 17.0 (BS-9) + Phase 17.2-quinquies (2026-05-05) — clear ALL modal
  // data caches on branch switch. Defense-in-depth: cache-reset here +
  // length>0 short-circuit guards REMOVED in every modal opener (Option A).
  // Bug report 2026-05-05: original BS-9 effect missed buyItems +
  // buyCategories so course / สินค้าหน้าร้าน / โปรโมชัน buttons kept showing
  // the previous branch's data after BranchSelector switch. Companion fix
  // adds SELECTED_BRANCH_ID to the form-data useEffect deps (line ~1033) so
  // page-level masterCourses / dfGroups / productItems refresh on switch.
  // Mirrors PromotionTab/CouponTab/VoucherTab BS-9 pattern.
  useEffect(() => {
    setMedAllProducts([]);
    setMedGroupData([]);
    setConsAllProducts([]);
    setConsGroupData([]);
    setBuyItems({ course: [], promotion: [], product: [] });
    setBuyCategories({ course: [], promotion: [], product: [] });
  }, [SELECTED_BRANCH_ID]);
  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border transition-all ${isDark ? 'bg-[#111] border-[#222] text-gray-200 focus:border-purple-500' : 'bg-white border-gray-200 text-gray-800 focus:border-purple-400'}`;
  const labelCls = 'text-xs font-semibold text-gray-500 mb-1 block';
  const selectCls = inputCls;

  // ── Core state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // appointment-loop R3 (2026-06-03) — SYNCHRONOUS double-submit guard. The
  // save buttons use disabled={saving}, but React state lags one render, so a
  // rapid double-click (or same-frame double-fire) can run handleSubmit TWICE
  // before the button disables → two createBackendTreatment + two auto-sales =
  // DOUBLE CHARGE + double stock + double DF. A ref flips synchronously.
  const submitInFlightRef = useRef(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // TF3 a11y polish (audit, 2026-05-04): per-field error map mirroring
  // CustomerCreatePage / SaleTab (commit f88f23e). Keys match the data-field
  // anchors used by scrollToError so screen-reader users get the same
  // aria-invalid + aria-describedby experience the sighted user gets via
  // ring-2 ring-red-500 + scrollIntoView. Cleared as the user edits the
  // offending control. WCAG 2.2 1.3.1 (Info and Relationships) +
  // 4.1.3 (Status Messages).
  const [fieldErrors, setFieldErrors] = useState({});

  /** Spread props that surface aria-invalid + aria-describedby for `field`. */
  const ariaErrProps = (field) => {
    const has = !!fieldErrors[field];
    return {
      'aria-invalid': has || undefined,
      'aria-describedby': has ? `err-${field}` : undefined,
    };
  };

  /** Inline error <p role="alert"> with stable id="err-{field}". */
  const FieldError = ({ field }) => {
    const msg = fieldErrors[field];
    if (!msg) return null;
    return (
      <p
        id={`err-${field}`}
        role="alert"
        className="text-rose-500 text-xs mt-1"
        data-testid={`field-error-${field}`}
      >
        {msg}
      </p>
    );
  };

  /** Clear error for a field (call from per-field onChange / setter). */
  const clearFieldError = (field) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };
  const [options, setOptions] = useState(null);
  const [prevTreatment, setPrevTreatment] = useState(null);
  // Phase 26.0a (V26.0, 2026-05-13) — Doctor-Save scaffold. Captures the
  // top-level `status` field from the loaded treatment doc when in edit mode
  // (set by the edit-mode load function below, around line 787). Drives the
  // `canAddNewItems` flag so admin can finalize a doctor-recorded treatment
  // by adding course-items / consumables / purchasedItems / auto-sale that
  // the doctor-save path intentionally skipped. Initial value `undefined`
  // (no value loaded yet); becomes string when an existing.status is found
  // (e.g. 'doctor-recorded' | 'completed'). Pre-flight finding: spec/plan
  // reference to `loadedTreatment?.status` resolved here since TFP has no
  // full-doc state — only individually destructured fields from existing.detail.
  const [loadedTreatmentStatus, setLoadedTreatmentStatus] = useState(undefined);
  // V142-quinquies (2026-05-31) — the PRECISE "this treatment currently has an
  // active course deduction" flag, loaded from the persisted `_courseDeducted`
  // field (backward-compat fallback to the status heuristic for pre-fix docs).
  // Replaces the V142-quater status-based `priorSaveDeducted` heuristic, which
  // mis-classified finalize→doctor→finalize as "never deducted" → skipped the
  // reverse → DOUBLE-DEDUCT (real-prod repro). The flag is set by the deducting
  // (bottom) save + PRESERVED by course-neutral doctor/vitals saves, so the
  // reverse decision is independent of status flips. AV165.
  const [loadedCourseDeducted, setLoadedCourseDeducted] = useState(false);
  // V136 (2026-05-31) — captured at edit-load: true iff this finalized
  // treatment deducted NO course (detail.courseItems AND detail.treatmentItems
  // both empty). Gates canEditCourseUsageRetro (computed after canAddNewItems).
  // Default false → before-load + treatments-with-usage stay locked (no flash).
  const [loadedHasNoCourseUsage, setLoadedHasNoCourseUsage] = useState(false);
  // Phase 27.2 (2026-05-14) — completedAt timestamp from edit-mode load.
  // Used by v26StatusPatch to preserve "first completion" time across
  // re-edits (Rule: completedAt is set ONCE per treatment, never updated).
  const [loadedTreatmentCompletedAt, setLoadedTreatmentCompletedAt] = useState(null);
  // (2026-07-04 spec ③④, bug-hunt R1 #7) — the treatment's PERSISTED branchId,
  // captured at edit-load. The staff-chat card write prefers it over the
  // admin's CURRENT BranchSelector so a vitals-card and a doctor-card for the
  // same treatment always land in the SAME branch chat even when the admin
  // switches the top-right branch between the two saves.
  const [loadedTreatmentBranchId, setLoadedTreatmentBranchId] = useState('');
  // Phase 26.2a (V26.2, 2026-05-13) — customer.note display above doctor-save button.
  const [customerNote, setCustomerNote] = useState('');
  // ED Score (2026-06-15) — the customer's follow-up assessment rounds (universal
  // listener). หมายเหตุทั่วไป shows the latest 2 (date + scores) for doctor context.
  const [edAssessments, setEdAssessments] = useState([]);
  const [customerCreatedISO, setCustomerCreatedISO] = useState(''); // R4 — intake-round date fallback (admission)
  useEffect(() => {
    if (!customerId) { setEdAssessments([]); return; }
    const unsub = listenToAssessments(
      customerId,
      setEdAssessments,
      (err) => console.warn('[TreatmentFormPage] assessments listener failed:', err),
    );
    return () => unsub();
  }, [customerId]);
  // R4 (2026-06-15) — give the intake round (round 1) a date. Diag confirmed
  // saved customers' patientData.assessmentDate is typically undefined, so fall
  // back to the customer's createdAt (admission date) as "วันที่รับเข้า". Merged
  // HERE (not in the shared AV194 pickKioskAssessmentFields helper) so other
  // consumers are untouched; hasPerf/typesInRaw only inspect adam_/iief_/mrs_/symp_pe.
  const edIntakePerf = useMemo(
    () => ({ ...pickKioskAssessmentFields(patientData || {}), assessmentDate: (patientData?.assessmentDate || customerCreatedISO || '') }),
    [patientData, customerCreatedISO],
  );
  const edLatest2 = useMemo(() => latestRounds(edIntakePerf, edAssessments, 2), [edIntakePerf, edAssessments]);
  const edStrippedNote = useMemo(() => stripScreeningSection(customerNote).trim(), [customerNote]);
  // Phase 26.2b (V26.2, 2026-05-13) — History tab strip: top-5 recent treatments.
  const [historyTreatments, setHistoryTreatments] = useState([]);
  const [selectedHistoryTreatmentId, setSelectedHistoryTreatmentId] = useState(null);
  const [historyFullDoc, setHistoryFullDoc] = useState(null);
  // handleHistoryTabClick — toggle: re-click active tab clears selection.
  const handleHistoryTabClick = (id) => {
    if (selectedHistoryTreatmentId === id) {
      setSelectedHistoryTreatmentId(null);
      setHistoryFullDoc(null);
    } else {
      setSelectedHistoryTreatmentId(id);
      setHistoryFullDoc(null); // show loading state until fetch resolves
      import('../lib/scopedDataLayer.js')
        .then(({ getTreatment: getBackendTreatment }) => getBackendTreatment(id))
        .then(setHistoryFullDoc)
        .catch(() => setHistoryFullDoc(null));
    }
  };
  // Phase 26.2b inline helper — dd/mm from YYYY-MM-DD (Rule C lean: no new export)
  const formatThaiDateShort = (iso) =>
    iso ? iso.slice(5).split('-').reverse().join('/') : '-';
  // Phase 26.0a (V26.0, 2026-05-13) — Doctor-Save scaffold. Unlocks add-ops
  // (course-items / consumables / purchasedItems / auto-sale) when admin
  // is finalizing a treatment that was previously doctor-saved (status set
  // to 'doctor-recorded' by the doctor-save path — see spec section 5.1).
  // Currently equals `!isEdit` because no doctor-recorded treatments exist
  // yet (the doctor-save button/path activates in Task 3). Future Tasks
  // 2-9 will swap 5 JSX `!isEdit && (...)` gates to `canAddNewItems && (...)`.
  // Pre-flight finding: uses `loadedTreatmentStatus` state (set during
  // edit-mode load) instead of plan's `loadedTreatment?.status` reference
  // since TFP has no full-doc state variable. Placed AFTER the state
  // declaration to avoid a temporal dead zone reference error (const is
  // not hoisted).
  // Phase 26.2f-pre — extended canAddNewItems to also unlock when status
  // is 'vitalsigns-recorded' (admin saved vitals only; doctor or admin
  // can now add items in subsequent edit cycles).
  const canAddNewItems = (mode === 'create')
    || (loadedTreatmentStatus === 'doctor-recorded')
    || (loadedTreatmentStatus === 'vitalsigns-recorded');

  // V136 (2026-05-31) — retroactive course-usage edit. Unlock the
  // ข้อมูลการใช้คอร์ส picker on an ALREADY-finalized treatment ONLY when it
  // deducted NO course (loadedHasNoCourseUsage = courseItems AND treatmentItems
  // both empty at load — matches the user's "ไม่พบรายการรักษา" screenshot).
  // User: "edit ข้อมูลการใช้คอร์สย้อนหลังได้ ถ้ายังไม่มีการใช้/ตัดคอร์สใดๆ;
  // ถ้ามีการใช้อะไรไปแล้ว แก้ไม่ได้เหมือนเดิม". Decisions: Q1=A (no course
  // deducted) / Q2=A (course section ONLY) / Q3=B (record use of EXISTING
  // courses; NO buy → no auto-sale/INV). Distinct from canAddNewItems (which
  // ALSO unlocks buy + consumables + meds). The save uses saveMode='course'
  // (staff-save MINUS the auto-sale path). The ซื้อ buttons + consumables/meds
  // sections stay gated on canAddNewItems ONLY (so they stay locked here).
  const canEditCourseUsageRetro = isEdit && !canAddNewItems && loadedHasNoCourseUsage;
  // Drives the course-section locked-table-vs-interactive-grid branch ONLY.
  const courseUsageInteractive = canAddNewItems || canEditCourseUsageRetro;

  // Doctor & Date
  const [doctorId, setDoctorId] = useState('');
  const [assistantIds, setAssistantIds] = useState([]);
  // Thai time (GMT+7) — browser-local date drifts to yesterday for non-Thai
  // browsers, and `.toISOString()` always returns UTC. Canonical helper in utils.js.
  // V64-fix7 (2026-05-09): when caller passes initialTreatmentDate (e.g.
  // V64 hub's "สร้างบันทึกการรักษา" button on a past appointment row),
  // lock the form date to the appointment date so the new treatment is
  // correctly associated with that day. Falls back to today otherwise.
  const [treatmentDate, setTreatmentDate] = useState(() => (
    typeof initialTreatmentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(initialTreatmentDate)
      ? initialTreatmentDate
      : thaiTodayISO()
  ));

  // Doctor fees (ค่ามือแพทย์) — LEGACY (Phase 12.x flat fee per doctor).
  // Kept for backward-compat on existing treatments. Phase 14.4 (2026-04-24)
  // introduces `dfEntries[]` below as the canonical per-doctor-per-course DF
  // structure; legacy doctorFees is still written in the save payload so
  // dfPayoutAggregator stays stable until Phase 14.5 migrates it.
  const [doctorFees, setDoctorFees] = useState([]); // [{doctorId, name, fee, groupId}]
  const [dfEditingIdx, setDfEditingIdx] = useState(-1); // -1=none, >=0=editing inline

  // Phase 14.4 (2026-04-24): dfEntries[] — per-doctor per-course DF matching
  // ProClinic's #addDfModal structure (Triangle capture 2026-04-24). Each
  // entry has rows[] with {courseId, enabled, value, type}. Resolver in
  // dfEntryValidation.buildDefaultRows auto-fills from dfGroups + staffRates.
  const [dfEntries, setDfEntries] = useState([]);
  const [dfModalState, setDfModalState] = useState(null); // null | { mode: 'add', entry: null } | { mode: 'edit', entry }
  // Phase 12.2b follow-up (2026-04-24): pick-at-treatment modal state.
  // Holds the courseId of the customer-course entry whose availableProducts
  // list is being picked. null = modal closed.
  const [pickModalCourseId, setPickModalCourseId] = useState(null);
  // Phase 14.7.H follow-up I (2026-04-26) — reopen-add for previously-picked
  // courses. Holds { pickedFromCourseId, courseName, options } when the user
  // clicks "+ เพิ่มสินค้าจากคอร์สเดียวกัน". Modal lets them ADD new picks
  // (not edit existing — see addPicksToResolvedGroup JSDoc).
  const [reopenPickGroup, setReopenPickGroup] = useState(null);
  const [dfGroups, setDfGroups] = useState([]);
  const [dfStaffRates, setDfStaffRates] = useState([]);
  const [masterCourses, setMasterCourses] = useState([]);
  // Phase 14.4 ask-B (2026-04-24): track doctors whose auto-created DF entry
  // the user has explicitly deleted. Re-picking that doctor later won't
  // resurrect the entry — respect the manual dismissal.
  const [dfDismissedIds, setDfDismissedIds] = useState(() => new Set());

  // Phase 26.1c (V26.1, 2026-05-13) — Editor attribution modal state.
  // Triggered when admin clicks save in edit mode + staff saveMode (not
  // doctor-save, not create-mode). Modal opens, suspends handleSubmit, and
  // re-invokes handleSubmit with editorContext on user confirm.
  const [editAttributionModal, setEditAttributionModal] = useState({ isOpen: false });

  const handleEditAttributionConfirm = (editorCtx) => {
    setEditAttributionModal({ isOpen: false });
    // Re-invoke handleSubmit synchronously with the editor context via the
    // V26.1 internal object form. This re-enters handleSubmit fresh — the
    // `needsEditorAttribution` guard now passes (editorContext present) and
    // the save flow proceeds normally with the editor stamping in v26StatusPatch.
    handleSubmit({ saveMode: 'staff', editorContext: editorCtx });
  };

  const handleEditAttributionCancel = () => {
    setEditAttributionModal({ isOpen: false });
    // No save. Admin can re-click the save button to retry; form state preserved.
  };

  // Health Info
  const [bloodType, setBloodType] = useState('');
  const [congenitalDisease, setCongenitalDisease] = useState('');
  const [drugAllergy, setDrugAllergy] = useState('');
  const [treatmentHistory, setTreatmentHistory] = useState('');

  // Vitals
  const [vitals, setVitals] = useState({
    weight: '', height: '', temperature: '', pulseRate: '',
    respiratoryRate: '', systolicBP: '', diastolicBP: '', oxygenSaturation: '',
  });

  // OPD Card
  const [opd, setOpd] = useState({
    symptoms: '', physicalExam: '', diagnosis: '',
    treatmentInfo: '', treatmentPlan: '', treatmentNote: '', additionalNote: '',
  });
  // Stable per-field updater — keeps the memo'd OPDFieldWithPrev from
  // re-rendering all 7 siblings on every keystroke in one of them.
  const setOpdField = useCallback((field, value) => {
    setOpd(prev => ({ ...prev, [field]: value }));
  }, []);
  // OPD note templates (2026-07-05, Q2=A) — append template content into CC.
  // Functional update reads prev.symptoms fresh (textarea blur commits via
  // flushSync BEFORE the menu click lands → no race with in-flight typing).
  const handleInsertCcTemplate = useCallback((content) => {
    setOpd(prev => ({ ...prev, symptoms: appendTemplateToCc(prev.symptoms, content) }));
  }, []);
  // Stable per-field updater for vitals (8 fields under one object).
  const setVitalField = useCallback((field, value) => {
    setVitals(prev => ({ ...prev, [field]: value }));
  }, []);

  // Consent & Med Cert
  const [medCertActuallyCome, setMedCertActuallyCome] = useState(false);
  const [medCertIsRest, setMedCertIsRest] = useState(false);
  const [medCertPeriod, setMedCertPeriod] = useState('');
  const [medCertIsOther, setMedCertIsOther] = useState(false);
  const [medCertOtherDetail, setMedCertOtherDetail] = useState('');

  // Chart drawings (max 2)
  const [charts, setCharts] = useState([]);

  // Treatment images (Before/After/Other) — each item: { dataUrl: <Storage URL>, storagePath, id }
  // (legacy treatments may carry inline `data:` in dataUrl — readers handle both)
  const [beforeImages, setBeforeImages] = useState([]);
  const [afterImages, setAfterImages] = useState([]);
  const [otherImages, setOtherImages] = useState([]);
  // 2026-05-25 — in-flight blob uploads (photos / lab images / PDFs go to Firebase
  // Storage on add). Save is gated while >0 so we never persist a half-uploaded blob.
  const [pendingUploads, setPendingUploads] = useState(0);
  // 2026-05-27 (V123) — "ดูรูปใหญ่" fullscreen view for treatment + lab images
  // (single src; the shared portaled ImageLightbox self-gates on empty string).
  const [imageLightboxSrc, setImageLightboxSrc] = useState('');

  // Lab items
  const [labItems, setLabItems] = useState([]);
  // Treatment files (ไฟล์ tab — max 2 PDFs)
  const [treatmentFiles, setTreatmentFiles] = useState([
    { slot: 1, fileId: '', pdfBase64: '', pdfFileName: '' },
    { slot: 2, fileId: '', pdfBase64: '', pdfFileName: '' },
  ]);
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [labModalQuery, setLabModalQuery] = useState('');
  const [labProducts, setLabProducts] = useState([]);
  const [labModalLoading, setLabModalLoading] = useState(false);
  const [labModalSelected, setLabModalSelected] = useState(null);
  const [labModalQty, setLabModalQty] = useState('1');
  const [labModalPrice, setLabModalPrice] = useState('');
  const [labModalDiscount, setLabModalDiscount] = useState('');
  const [labModalDiscountType, setLabModalDiscountType] = useState('amount');
  const [labModalVat, setLabModalVat] = useState(false);
  const [editingLabIndex, setEditingLabIndex] = useState(-1);

  // Take-home medications
  const [medications, setMedications] = useState([]);
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [medModalQuery, setMedModalQuery] = useState('');
  const [medAllProducts, setMedAllProducts] = useState([]); // all meds loaded on open
  const [medModalLoading, setMedModalLoading] = useState(false);
  const [medModalSelected, setMedModalSelected] = useState(null); // selected product in modal
  const [medModalQty, setMedModalQty] = useState('');
  const [medModalPrice, setMedModalPrice] = useState('');
  const [medModalDiscount, setMedModalDiscount] = useState('');
  const [medModalDiscountType, setMedModalDiscountType] = useState('amount'); // amount | percent
  const [medModalVat, setMedModalVat] = useState(false);
  const [medModalPremium, setMedModalPremium] = useState(false);
  const [medModalLabelOpen, setMedModalLabelOpen] = useState(false);
  const [editingMedIndex, setEditingMedIndex] = useState(-1); // -1 = adding new, >= 0 = editing
  const [medGroupModalOpen, setMedGroupModalOpen] = useState(false);
  const [medGroupData, setMedGroupData] = useState([]); // all groups from API
  const [medGroupSelectedId, setMedGroupSelectedId] = useState('');
  const [medGroupChecked, setMedGroupChecked] = useState(new Set()); // checked product indices
  const [medGroupLoading, setMedGroupLoading] = useState(false);
  const [remedModalOpen, setRemedModalOpen] = useState(false);

  // Course items — selected rowIds
  const [selectedCourseItems, setSelectedCourseItems] = useState(new Set());
  // 2026-06-09 — monotonic counter that mints a UNIQUE per-purchase id for every
  // buy-this-visit course/promotion. item.id is the MASTER id (shared when the same
  // course is bought twice) → not unique; the counter guarantees distinct courseId
  // + rowId per purchase regardless of clock resolution. Used by confirmBuyModal.
  const purchaseSeqRef = useRef(0);
  const [existingCourseItems, setExistingCourseItems] = useState([]); // saved courseItems from edit mode
  // Phase 14.7.F (2026-04-26) — snapshot of the stock-bearing fields at edit-load
  // time. handleSubmit diffs against this to skip the reverse+rededuct path
  // when the user only edited non-stock fields (images, charts, dr.note, etc.).
  // Bug report 2026-04-26: "คืนสต็อกการรักษาเดิมไม่สำเร็จ: Missing or insufficient
  // permissions" while the user just edited a Before/After photo — the legacy
  // path called reverseStockForTreatment unconditionally, which tried to update
  // be_stock_movements (blocked by `allow update: if false`).
  const [existingStockSnapshot, setExistingStockSnapshot] = useState(null);

  // Treatment items — items shown in รายการรักษา panel (from courses or manual)
  const [treatmentItems, setTreatmentItems] = useState([]);

  // Consumables
  const [consumables, setConsumables] = useState([]);
  const [consModalOpen, setConsModalOpen] = useState(false);
  const [consModalQuery, setConsModalQuery] = useState('');
  const [consAllProducts, setConsAllProducts] = useState([]);
  const [consModalLoading, setConsModalLoading] = useState(false);
  const [consModalSelected, setConsModalSelected] = useState(null);
  const [consModalQty, setConsModalQty] = useState('');
  const [consGroupModalOpen, setConsGroupModalOpen] = useState(false);
  const [consGroupData, setConsGroupData] = useState([]);
  const [consGroupSelectedId, setConsGroupSelectedId] = useState('');
  const [consGroupChecked, setConsGroupChecked] = useState(new Set());
  const [consGroupLoading, setConsGroupLoading] = useState(false);

  // Buy items modal (ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน)
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyModalType, setBuyModalType] = useState('course'); // course | promotion | product
  const [buyItems, setBuyItems] = useState({ course: [], promotion: [], product: [] });
  const [buyCategories, setBuyCategories] = useState({ course: [], promotion: [], product: [] });
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyQuery, setBuyQuery] = useState('');
  const [buySelectedCat, setBuySelectedCat] = useState('');
  const [buyChecked, setBuyChecked] = useState(new Set()); // checked item IDs
  const [buyQtyMap, setBuyQtyMap] = useState({}); // id → qty
  const [buyDiscMap, setBuyDiscMap] = useState({}); // id → discount
  const [buyVatMap, setBuyVatMap] = useState({}); // id → boolean
  // Purchased items (displayed in grid below)
  const [purchasedItems, setPurchasedItems] = useState([]); // { id, name, price, unit, qty, discount, vat, itemType }

  // Insurance
  const [isInsuranceClaimed, setIsInsuranceClaimed] = useState(false);
  const [benefitType, setBenefitType] = useState('');
  const [insuranceCompanyId, setInsuranceCompanyId] = useState('');
  const [insuranceClaimAmount, setInsuranceClaimAmount] = useState('');

  // Discounts
  const [medDiscountOverride, setMedDiscountOverride] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponInfo, setCouponInfo] = useState(null);
  const [couponLookupError, setCouponLookupError] = useState('');
  const [couponLookingUp, setCouponLookingUp] = useState(false);
  const [billDiscount, setBillDiscount] = useState('');
  const [billDiscountType, setBillDiscountType] = useState('amount');

  // Deposit & Wallet
  const [useDeposit, setUseDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  // Backend mode: multi-deposit selection via DepositPicker
  const [selectedDeposits, setSelectedDeposits] = useState([]);
  const [depositReloadKey, setDepositReloadKey] = useState(0);
  // Backend mode: single wallet selection via WalletPicker
  const [selectedWallet, setSelectedWallet] = useState(null); // { walletTypeId, amount, walletTypeName } | null
  const [walletReloadKey, setWalletReloadKey] = useState(0);
  // Backend mode: cached active membership (for discount % + bahtPerPoint)
  const [backendActiveMembership, setBackendActiveMembership] = useState(null);
  const isBackend = saveTarget === 'backend';
  const [useWallet, setUseWallet] = useState(false);
  const [walletId, setWalletId] = useState('');
  const [walletAmount, setWalletAmount] = useState('');

  // Payment
  const [paymentStatus, setPaymentStatus] = useState('2'); // 0=ชำระภายหลัง, 2=ชำระเต็มจำนวน, 4=แบ่งชำระ
  const [saleDate, setSaleDate] = useState(() => thaiTodayISO());
  const [paymentDate, setPaymentDate] = useState(() => thaiTodayISO());
  const [paymentTime, setPaymentTime] = useState('');
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [saleNote, setSaleNote] = useState('');

  // Payment channels (3 rows)
  const [pmChannels, setPmChannels] = useState([
    { enabled: false, method: '', amount: '' },
    { enabled: false, method: '', amount: '' },
    { enabled: false, method: '', amount: '' },
  ]);
  const updatePmChannel = (idx, field, val) => setPmChannels(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));

  // Sellers (5 rows)
  const [pmSellers, setPmSellers] = useState([
    { enabled: false, id: '', percent: '0', total: '' },
    { enabled: false, id: '', percent: '0', total: '' },
    { enabled: false, id: '', percent: '0', total: '' },
    { enabled: false, id: '', percent: '0', total: '' },
    { enabled: false, id: '', percent: '0', total: '' },
  ]);
  const updatePmSeller = (idx, field, val) => setPmSellers(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  // ── BMI auto-calc (T5.b 2026-04-26: extracted to src/lib/treatmentBilling.js) ──
  const bmi = useMemo(() => computeBmi(vitals.weight, vitals.height), [vitals.weight, vitals.height]);

  // ── Billing calculation (T5.b 2026-04-26: extracted to computeTreatmentBilling helper) ──
  const billing = useMemo(() => computeTreatmentBilling({
    purchasedItems, medications, consumables,
    medDiscountOverride, billDiscount, billDiscountType,
    isInsuranceClaimed, insuranceClaimAmount,
    isBackend, selectedDeposits, selectedWallet, backendActiveMembership, options,
    useDeposit, depositAmount, useWallet, walletAmount,
  }), [purchasedItems, medications, consumables, medDiscountOverride, billDiscount, billDiscountType,
      isInsuranceClaimed, insuranceClaimAmount, useDeposit, depositAmount, useWallet, walletAmount,
      isBackend, selectedDeposits, selectedWallet, backendActiveMembership, options]);

  // ── Backend mode: load active membership when customer changes ───────
  useEffect(() => {
    if (!isBackend || !customerId) { setBackendActiveMembership(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { getCustomerMembership } = await import('../lib/scopedDataLayer.js');
        const m = await getCustomerMembership(customerId);
        if (!cancelled) setBackendActiveMembership(m || null);
      } catch (e) {
        if (!cancelled) setBackendActiveMembership(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isBackend, customerId]);

  // ── Phase 26.2b — load top-5 recent treatments for history tab strip ───
  // Fires in BOTH create + edit modes. In edit mode, excludes the current
  // treatmentId so the strip doesn't show the treatment being viewed.
  // In create mode, treatmentId is null/undefined so the filter is a no-op.
  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getCustomerTreatments } = await import('../lib/scopedDataLayer.js');
        const all = await getCustomerTreatments(customerId);
        if (!cancelled) {
          const sorted = (all || []).slice().sort((a, b) => {
            const dA = a.detail?.treatmentDate || '';
            const dB = b.detail?.treatmentDate || '';
            const dateCmp = dB.localeCompare(dA);
            if (dateCmp !== 0) return dateCmp;
            // Phase 26.2f-followup (2026-05-13) — same-date tiebreak: most-recent
            // createdAt ts first, then treatmentId/id desc (BT-<unix-ms> →
            // lexicographic desc = chronological desc). Fixes "ล่าสุด" badge
            // pointing at an older treatment when multiple fall on same date.
            const tsA = a.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? a.createdAt : 0);
            const tsB = b.createdAt?.toMillis?.() || (typeof b.createdAt === 'number' ? b.createdAt : 0);
            if (tsA !== tsB) return tsB - tsA;
            const idA = a.treatmentId || a.id || '';
            const idB = b.treatmentId || b.id || '';
            return idB.localeCompare(idA);
          });
          const filtered = (isEdit && treatmentId)
            ? sorted.filter(t => (t.treatmentId || t.id) !== treatmentId)
            : sorted;
          setHistoryTreatments(filtered.slice(0, 5));
        }
      } catch (e) {
        if (!cancelled) setHistoryTreatments([]);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId, treatmentId, isEdit]);

  // ── Load form data ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // ── BACKEND MODE: load from master_data + be_treatments ──
        if (saveTarget === 'backend') {
          // Task 7 (BSA, 2026-05-04) — Rule H-quater fix: replaced the legacy
          // master-data universal-pool lister (branch-blind) with be_* listers
          // via scopedDataLayer. listProducts/listCourses
          // auto-inject the selected branchId. listStaff/listDoctors are
          // universal — branch soft-gate via filterStaffByBranch /
          // filterDoctorsByBranch (Phase BS V1) is preserved below.
          const {
            getTreatment: getBackendTreatment,
            getCustomer: getBackendCustomer,
            listDfGroups,
            listDfStaffRates,
            listProducts,
            listCourses,
            listStaff,
            listDoctors,
          } = await import('../lib/scopedDataLayer.js');
          // V41 (2026-05-08) — opt-in for full lookup map (handles past-record
          // name display for hidden persons) + filter visible client-side for
          // picker dropdowns via filterDoctorsByBranch / filterStaffByBranch +
          // !isHidden below. AV20.
          const [doctorItems, productItems, staffItems, courseItems, dfGroupItems, dfStaffRatesItems] = await Promise.all([
            listDoctors({ includeHidden: true }).catch(() => []),  // universal — soft-gate below
            listProducts().catch(() => []),                        // auto-inject branchId
            listStaff({ includeHidden: true }).catch(() => []),    // universal — soft-gate below
            listCourses().catch(() => []),                  // auto-inject branchId
            listDfGroups().catch(() => []),
            listDfStaffRates().catch(() => []),
          ]);
          setDfGroups(dfGroupItems || []);
          setDfStaffRates(dfStaffRatesItems || []);
          // Phase 14.4 bug fix (2026-04-24): build name→master-courseId map
          // so `treatmentCoursesForDf` can resolve synthetic be-course-N ids
          // from customer.courses[] (which carry only name, not master id)
          // back to the real master courseId that be_df_groups.rates[]
          // are keyed by. Without this map the resolver returns null for
          // every row and the DF modal shows "0 บาท ทุกอัน" (user-reported).
          setMasterCourses(courseItems || []);
          // Phase BS (2026-05-06) — branch-scope staff + doctor pickers.
          // Backward-compat: empty/missing branchIds[] = visible-everywhere.
          // Filter applied BEFORE other transforms so downstream maps + the
          // sellers/doctors/assistants triple-fanout all inherit the scope.
          const branchScopedStaff = filterStaffByBranch(staffItems, SELECTED_BRANCH_ID);
          const branchScopedDoctors = filterDoctorsByBranch(doctorItems, SELECTED_BRANCH_ID);
          // V41 (2026-05-08) — filter hidden persons OUT of picker sources. AV20.
          const allStaff = branchScopedStaff.filter(s => !s.isHidden).map(s => ({ id: s.id, name: s.name, position: s.position }));
          const allDoctors = branchScopedDoctors.filter(d => d.status !== 'พักใช้งาน' && !d.isHidden);

          // Load customer courses from be_customers (NOT from ProClinic).
          // One row per customer.courses entry — NO grouping — so each purchase
          // is selectable/deductible independently. rowId encodes the exact array
          // index so deductCourseItems can target that specific entry.
          let customerCoursesForForm = [];
          let customerPromotionsForForm = [];
          if (customerId) {
            try {
              const custData = await getBackendCustomer(customerId);
              const rawCourses = custData?.courses || [];
              // Phase 12.2b follow-up (2026-04-25): extracted into
              // `mapRawCoursesToForm` so the branch logic (pick-at-treatment
              // placeholder / เหมาตามจริง / บุฟเฟต์ / specific-qty) is
              // unit-testable without mounting TreatmentFormPage.
              customerCoursesForForm = mapRawCoursesToForm(rawCourses);
              // V43 (2026-05-08) — overlay live-resolved skipStockDeduction
              // from be_courses master onto every customer.courses[i] entry.
              // Closes the freeze-time gap: customer.courses[i] is denormalized
              // at buy time, so admin edits to the master flag AFTER the
              // purchase don't propagate. The overlay reads the current master
              // state (already fetched as `courseItems` above) and rewrites
              // each products[j].skipStockDeduction. Orphans (no master by
              // courseName — legacy ProClinic-imported) preserve their frozen
              // value, so no regression for the 1355 prod legacy entries.
              // Diag: scripts/v43-diag-customer-courses-skip-stock.mjs reported
              // 3 V43-bug entries on LC-26000006 (PRP at indices 0/3/6).
              customerCoursesForForm = overlayCustomerCoursesWithMaster(
                customerCoursesForForm,
                courseItems || []
              );
              // Phase 26.2a (V26.2, 2026-05-13) — stamp customer note for display above doctor-save button.
              setCustomerNote(custData?.note || custData?.patientData?.note || patientData?.note || '');
              // R4 — capture admission date (Bangkok YYYY-MM-DD) as the intake-round date fallback.
              const _ca = custData?.createdAt;
              const _ms = _ca?.toMillis?.() ?? (typeof _ca === 'number' ? _ca : 0);
              if (_ms) setCustomerCreatedISO(new Date(_ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }));
            } catch (e) { console.error('[TreatmentForm] product parse error:', e); }
          }

          // Phase 15.7 (2026-04-28) — REVERSED Phase 14.1 directive. User's
          // ACTUAL spec (post V15 #4): "ผู้ช่วยแพทย์ (สูงสุด 5 คน) หมายความว่า
          // ให้เอาแพทย์และผู้ช่วยที่มีทั้งหมดมาให้เลือก แต่ select ได้แค่ 5 คน".
          // Show ALL be_doctors records (any position, including missing/blank)
          // in the assistant picker; max-5 enforced on SELECTION via the
          // toggleAssistant prev.length>=5 gate (line ~931). Same change at
          // AppointmentFormModal:189.
          const backendOptions = {
            doctors: allDoctors.map(d => ({
              id: d.id, name: d.name, position: d.position,
              defaultDfGroupId: d.defaultDfGroupId || '',
            })),
            assistants: allDoctors
              .map(d => ({ id: d.id, name: d.name, defaultDfGroupId: d.defaultDfGroupId || '' })),
            // Phase 12.2b follow-up (2026-04-25): bloodTypeOptions must
            // be objects {id, name} because the render maps `b.id` +
            // `b.name` (line 2740) and the ProClinic import path at line
            // 930 matches by `b.name`. Prior `['A','B',...]` string array
            // rendered `<option key={undefined} value={undefined}>` → empty
            // dropdown (user-reported bug).
            bloodTypeOptions: ['A', 'B', 'AB', 'O', 'ไม่ทราบ'].map(v => ({ id: v, name: v })),
            products: productItems,
            customerCourses: customerCoursesForForm,
            customerPromotions: customerPromotionsForForm,
            benefitTypes: [], insuranceCompanies: [],
            paymentChannels: ['เงินสด', 'โอนธนาคาร', 'บัตรเครดิต', 'QR Payment', 'อื่นๆ'].map(n => ({ id: n, name: n })),
            wallets: [],
            sellers: [...allStaff, ...allDoctors.map(d => ({ id: d.id, name: d.name, position: d.position }))],
            medicationGroups: [], consumableGroups: [],
            healthInfo: {}, vitalsDefaults: {},
          };
          setOptions(backendOptions);
          // Edit mode: load existing backend treatment
          if (isEdit && treatmentId) {
            const existing = await getBackendTreatment(treatmentId);
            // Phase 26.0a (V26.0, 2026-05-13) — capture top-level status field
            // (e.g. 'doctor-recorded' | 'completed' | undefined) so the
            // canAddNewItems flag (computed at top of render, after the
            // loadedTreatmentStatus state declaration) can unlock add-ops
            // when admin finalizes a doctor-recorded treatment.
            if (existing?.status) setLoadedTreatmentStatus(existing.status);
            // V142-quinquies (2026-05-31) — load the precise course-deduction flag.
            // Stored in detail (via detailRest) by save; backward-compat: pre-fix
            // docs without the flag fall back to the V142-quater status heuristic
            // (completed → was deducted; doctor/vitals → not). AV165.
            setLoadedCourseDeducted(
              typeof existing?.detail?._courseDeducted === 'boolean'
                ? existing.detail._courseDeducted
                : (existing?.status !== 'doctor-recorded' && existing?.status !== 'vitalsigns-recorded')
            );
            // Phase 27.2 (2026-05-14) — capture completedAt so submit handler
            // can preserve it (won't re-stamp on subsequent edits).
            if (existing?.completedAt) setLoadedTreatmentCompletedAt(existing.completedAt);
            if (existing?.detail) {
              const t = existing.detail;
              // (2026-07-04 bug-hunt R1 #7) capture the persisted branchId for
              // the staff-chat card write (same-branch-chat invariant).
              if (t.branchId) setLoadedTreatmentBranchId(t.branchId);
              // V136 (2026-05-31) — retro course-usage unlock eligibility.
              // "No course used" = NEITHER the deduction ledger (courseItems)
              // NOR the displayed treatment-items list has any entry. Captured
              // once here (stable across live edits) so canEditCourseUsageRetro
              // doesn't re-lock mid-edit. Treatments WITH any course usage keep
              // the read-only locked table (default false).
              setLoadedHasNoCourseUsage(!(t.courseItems?.length) && !(t.treatmentItems?.length));
              if (t.doctorId) setDoctorId(t.doctorId);
              if (t.assistants?.length) setAssistantIds(t.assistants.map(a => a.id || a).filter(Boolean));
              if (t.treatmentDate) setTreatmentDate(t.treatmentDate);
              if (t.healthInfo?.bloodType) setBloodType(t.healthInfo.bloodType);
              if (t.healthInfo?.congenitalDisease) setCongenitalDisease(t.healthInfo.congenitalDisease);
              if (t.healthInfo?.drugAllergy) setDrugAllergy(t.healthInfo.drugAllergy);
              if (t.vitals) setVitals(v => ({ ...v, ...t.vitals }));
              setOpd({ symptoms: t.symptoms || '', physicalExam: t.physicalExam || '', diagnosis: t.diagnosis || '', treatmentInfo: t.treatmentInfo || '', treatmentPlan: t.treatmentPlan || '', treatmentNote: t.treatmentNote || '', additionalNote: t.additionalNote || '' });
              if (t.healthInfo?.treatmentHistory) setTreatmentHistory(t.healthInfo.treatmentHistory);
              if (t.beforeImages?.length) setBeforeImages(t.beforeImages);
              if (t.afterImages?.length) setAfterImages(t.afterImages);
              if (t.otherImages?.length) setOtherImages(t.otherImages);
              if (t.charts?.length) setCharts(t.charts.map(c => ({ dataUrl: c.dataUrl || '', fabricJson: c.fabricJson || null, templateId: c.templateId || 'blank', savedAt: c.savedAt || '', storagePath: c.storagePath || null })));
              if (t.labItems?.length) setLabItems(t.labItems);
              if (t.medications?.length) setMedications(t.medications);
              if (t.consumables?.length) setConsumables(t.consumables);
              if (t.treatmentItems?.length) {
                // V101 (2026-05-19 LATE+2) — edit-load rebind by productId.
                // Pre-V101: every treatmentItem got id=`existing-${i}` and
                // selectedCourseItems stayed empty when t.courseItems was empty
                // (line 1054 gate). On save → courseItems serialization saw
                // empty Set → wrote courseItems=[] again → self-perpetuating
                // loop where customer.courses[] never decremented across edits.
                // V101 rebind: when treatmentItem has productId AND matches an
                // entry in customerCoursesForForm, restore the rowId+selectedCourseItems
                // pair so save-time serialization works. Falls back to legacy
                // `existing-${i}` ID when no match (preserves orphan/manual rows).
                const restoredItems = [];
                const restoredSelection = new Set();
                t.treatmentItems.forEach((item, i) => {
                  const baseShape = {
                    name: item.name || '',
                    qty: item.qty || '1',
                    unit: item.unit || '',
                    price: item.price || '',
                    productId: item.productId || '',
                  };
                  if (item.productId && Array.isArray(customerCoursesForForm) && customerCoursesForForm.length > 0) {
                    let matched = null;
                    for (const course of customerCoursesForForm) {
                      const product = (course.products || []).find(p => String(p.productId) === String(item.productId));
                      if (product) { matched = product; break; }
                    }
                    if (matched && matched.rowId) {
                      restoredItems.push({ ...baseShape, id: matched.rowId });
                      restoredSelection.add(matched.rowId);
                      return;
                    }
                  }
                  // Fallback — no productId or no match → legacy existing-N id
                  restoredItems.push({ ...baseShape, id: `existing-${i}` });
                });
                setTreatmentItems(restoredItems);
                if (restoredSelection.size > 0) setSelectedCourseItems(restoredSelection);
              }
              // Phase 14.7.F — snapshot stock-bearing arrays for diff-on-save.
              // Captured AFTER setters so the comparison normalizer has the same
              // shape both old and new go through. Stored as raw doc shape (not
              // form-state shape) for fidelity to what was actually persisted.
              setExistingStockSnapshot({
                treatmentItems: t.treatmentItems || [],
                consumables: t.consumables || [],
                medications: t.medications || [],
              });
              if (t.doctorFees?.length) setDoctorFees(t.doctorFees);
              // Phase 14.4: dfEntries restore. Check both top-level
              // (save path writes here) and detail.dfEntries (future-proof
              // for treatment validator TR-9 wiring in Phase 14.5).
              if (Array.isArray(t.dfEntries) && t.dfEntries.length > 0) setDfEntries(t.dfEntries);
              else if (Array.isArray(t.detail?.dfEntries) && t.detail.dfEntries.length > 0) setDfEntries(t.detail.dfEntries);
              if (t.treatmentFiles?.length) setTreatmentFiles(prev => prev.map(slot => {
                const found = t.treatmentFiles.find(f => f.slot === slot.slot);
                return found ? { ...slot, ...found } : slot;
              }));
              // Medical certificate
              if (t.medCertActuallyCome != null) setMedCertActuallyCome(t.medCertActuallyCome);
              if (t.medCertIsRest != null) setMedCertIsRest(t.medCertIsRest);
              if (t.medCertPeriod) setMedCertPeriod(t.medCertPeriod);
              if (t.medCertIsOther != null) setMedCertIsOther(t.medCertIsOther);
              if (t.medCertOtherDetail) setMedCertOtherDetail(t.medCertOtherDetail);
              // Billing & Payment (Phase 5A)
              if (t.purchasedItems?.length) setPurchasedItems(t.purchasedItems);
              // Discounts (edit-mode restore — FF6)
              if (t.discount) setBillDiscount(String(t.discount));
              if (t.discountType) setBillDiscountType(t.discountType === '%' ? 'percent' : 'amount');
              if (t.couponCode) {
                setCouponCode(t.couponCode);
                try {
                  const { findCouponByCode } = await import('../lib/scopedDataLayer.js');
                  const c = await findCouponByCode(t.couponCode);
                  if (c) setCouponInfo(c);
                } catch { /* coupon expired / deleted — keep code string, skip badge */ }
              }
              if (t.payment?.paymentStatus) setPaymentStatus(t.payment.paymentStatus);
              if (t.payment?.paymentDate) setPaymentDate(t.payment.paymentDate);
              if (t.payment?.paymentTime) setPaymentTime(t.payment.paymentTime);
              if (t.payment?.refNo) setRefNo(t.payment.refNo);
              if (t.payment?.channels?.length) setPmChannels(prev => prev.map((ch, i) => t.payment.channels[i] ? { ...ch, ...t.payment.channels[i], enabled: true } : ch));
              if (t.sellers?.length) setPmSellers(prev => prev.map((s, i) => t.sellers[i] ? { ...s, ...t.sellers[i], enabled: true } : s));
              if (t.payment?.saleNote) setSaleNote(t.payment.saleNote);
              // Phase 7: Restore deposit + wallet selection from linked sale (if exists)
              try {
                const { getSaleByTreatmentId } = await import('../lib/scopedDataLayer.js');
                const linkedSale = await getSaleByTreatmentId(treatmentId);
                const deps = Array.isArray(linkedSale?.billing?.depositIds) ? linkedSale.billing.depositIds : [];
                if (deps.length > 0) {
                  setSelectedDeposits(deps.map(d => ({ depositId: d.depositId, amount: Number(d.amount) || 0 })));
                }
                if (linkedSale?.billing?.walletTypeId && Number(linkedSale.billing.walletApplied) > 0) {
                  setSelectedWallet({
                    walletTypeId: linkedSale.billing.walletTypeId,
                    walletTypeName: linkedSale.billing.walletTypeName || '',
                    amount: Number(linkedSale.billing.walletApplied) || 0,
                  });
                }
              } catch (e) { console.warn('[TreatmentForm] restore deposits/wallet failed:', e); }
              // Phase 6: Restore courseItems for deduction reversal + checkbox restore
              if (t.courseItems?.length) {
                setExistingCourseItems(t.courseItems);
                setSelectedCourseItems(new Set(t.courseItems.map(ci => ci.rowId)));
                setTreatmentItems(t.courseItems.map(ci => ({
                  id: ci.rowId,
                  name: ci.productName,
                  qty: String(ci.deductQty || 1),
                  unit: ci.unit || '',
                  price: '',
                })));
              }
            }
          }
          // Pre-fill from patient data (Phase 26.2g-fillin-bis — canonical resolver reads)
          if (patientData) {
            if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
            if (!isEdit) {
              // Phase 26.2g-fillin-bis (2026-05-13) — read CANONICAL patientData fields
              // directly via resolvePatient* helpers. Phase 26.2g-fillin derivePatient*
              // approach was a no-op: kiosk-shape fields (ud_*/hasUnderlying/
              // allergiesDetail/currentMedication/pregnancy) don't exist on
              // be_customers.patientData. kioskPatientToCanonical pre-derives kiosk
              // → canonical strings BEFORE customer doc creation; admin form writes
              // canonical directly. resolvePatient* read those canonical strings.
              const congenital = resolvePatientCongenitalDisease(patientData);
              if (congenital) setCongenitalDisease(congenital);
              const allergy = resolvePatientDrugAllergy(patientData);
              if (allergy) setDrugAllergy(allergy);
              const history = resolvePatientTreatmentHistory(patientData);
              if (history) setTreatmentHistory(history);
            }
          }
          setLoading(false);
          return;
        }

        // V50 (2026-05-08) — PROCLINIC MODE block deleted (~177 lines).
        // saveTarget defaults to 'backend' + only callsites pass 'backend';
        // proclinic fallthrough was unreachable. Full strip per H-bis.
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  // Phase 17.2-quinquies (2026-05-05) — SELECTED_BRANCH_ID added to deps so
  // when the user switches the top-right BranchSelector mid-TFP-life, the
  // page-level state (productItems / courseItems / dfGroupItems / staffItems
  // / doctorItems → masterCourses + options + DF lookups) refreshes against
  // the new branch's master data. Without this dep, all in-page lookups
  // remained pinned to the branch active at TFP mount.
  }, [customerId, treatmentId, isEdit, SELECTED_BRANCH_ID]);

  // ── Toggle assistant ──
  const toggleAssistant = (id) => {
    setAssistantIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  // ── Auto-populate doctor fees when doctor/assistants change ──
  useEffect(() => {
    if (!options) return;
    const allDoctors = options.doctors || [];
    const allAssistants = options.assistants || [];
    const selectedIds = [doctorId, ...assistantIds].filter(Boolean);
    setDoctorFees(prev => {
      // Keep existing entries that are still selected, add new ones
      const kept = prev.filter(f => selectedIds.includes(String(f.doctorId)));
      const newEntries = selectedIds
        .filter(id => !kept.some(f => String(f.doctorId) === String(id)))
        .map(id => {
          const doc = allDoctors.find(d => String(d.id) === String(id)) || allAssistants.find(a => String(a.id) === String(id));
          return { doctorId: id, name: doc?.name || '', fee: '0', groupId: doc?.defaultDfGroupId || '' };
        });
      return [...kept, ...newEntries];
    });
  }, [doctorId, assistantIds, options]);

  // Phase 14.4 ask-B auto-populate useEffect was here — MOVED down to
  // after `treatmentCoursesForDf` + `treatmentPeopleForDf` are declared.
  // Declaring it above those `const` memos caused a "Cannot access
  // '<memo>' before initialization" ReferenceError at render time
  // (TDZ), which crashed the whole TreatmentFormPage with a blank/black
  // screen on both create + edit paths. User-reported 2026-04-24
  // post-deploy. Fix: relocate the hook; effect order is unchanged
  // because React fires them in declaration order AFTER render.

  // ── Course item toggle — also update treatment items ──
  const toggleCourseItem = (product) => {
    // Phase 12.2b Step 7 (2026-04-24): fill-later products (เหมาตามจริง /
    // เลือกสินค้าตามจริง) have product.fillLater=true with remaining='' —
    // bypass the "remaining ≤ 0" guard since there's no pre-set qty to
    // consume. Doctor enters qty during treatment via the treatmentItem
    // input, validated at handleSubmit.
    if (!product.fillLater) {
      const rem = parseFloat(product.remaining);
      if (!selectedCourseItems.has(product.rowId) && (isNaN(rem) || rem <= 0)) {
        alert(`"${product.name}" คงเหลือ 0 — ไม่สามารถเลือกได้`);
        return;
      }
    }
    setSelectedCourseItems(prev => {
      const next = new Set(prev);
      if (next.has(product.rowId)) {
        next.delete(product.rowId);
        setTreatmentItems(ti => ti.filter(t => t.id !== product.rowId));
      } else {
        next.add(product.rowId);
        // Only add to treatment items if not already there (prevent duplicates from multiple course entries)
        setTreatmentItems(ti => {
          if (ti.some(t => t.id === product.rowId)) return ti;
          // Phase 12.2b follow-up (2026-04-24, user-reported): for
          // "ระบุสินค้าและจำนวนสินค้า" courses auto-populate qty with
          // the product's saved remaining value instead of hardcoding
          // '1'. Users expect "ให้ขึ้นจำนวนที่บันทึกไว้เลย โดยอัตโนมัติ".
          // Fill-later courses still start blank (qty entered during
          // treatment). If remaining isn't a positive number (missing /
          // NaN / 0), fall back to '1' so the existing contract holds.
          const rawRemaining = String(product.remaining ?? '').trim();
          const remainingNum = Number(rawRemaining);
          const defaultQty = product.fillLater
            ? ''
            : (Number.isFinite(remainingNum) && remainingNum > 0 ? rawRemaining : '1');
          return [...ti, {
            id: product.rowId,
            // Phase 12.2b Step 7 follow-up (2026-04-24): carry real
            // master productId onto the treatment item so
            // deductStockForTreatment → _normalizeStockItems can
            // resolve the actual be_products doc + its batch instead
            // of falling back to rowId (which is synthetic and never
            // matches anything in be_products).
            productId: product.productId || '',
            name: product.name,
            qty: defaultQty,
            unit: product.unit || '',
            price: '',
            fillLater: !!product.fillLater,
            // 2026-04-28: per-row "ไม่ตัดสต็อค" flag — propagated from
            // be_courses (or customer.courses[] for purchases done in
            // earlier visits). When true, _deductOneItem emits a
            // course-skip movement instead of touching the batch.
            skipStockDeduction: !!product.skipStockDeduction,
          }];
        });
      }
      return next;
    });
  };

  // ── Treatment items CRUD ──
  const updateTreatmentItem = (id, field, value) => {
    setTreatmentItems(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };
  const removeTreatmentItem = (id) => {
    setTreatmentItems(prev => prev.filter(t => t.id !== id));
    setSelectedCourseItems(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  // ── Medication modal (เพิ่มยากลับบ้าน — matching ProClinic) ──
  const openMedModal = async () => {
    setEditingMedIndex(-1); // Reset to "add new" mode
    setMedModalOpen(true);
    setMedModalQuery('');
    setMedModalSelected(null);
    setMedModalQty('');
    setMedModalPrice('');
    setMedModalDiscount('');
    setMedModalDiscountType('amount');
    setMedModalVat(false);
    setMedModalPremium(false);
    setMedModalLabelOpen(false);
    // Phase 17.2-quinquies (2026-05-05) — drop length>0 short-circuit so every
    // modal open re-fetches via scopedDataLayer (auto-injects current branchId).
    // BS-9 cache-reset effect (line ~337) already drains the cache on branch
    // switch; this guarantees freshness even if a future cache slot is missed.
    setMedModalLoading(true);
    try {
      // V50 (2026-05-08) — backend-only. ProClinic broker.searchProducts branch
      // deleted; be_products via scopedDataLayer auto-injects branchId.
      const { listProducts } = await import('../lib/scopedDataLayer.js');
      const all = await listProducts();
      setMedAllProducts(all.filter(p => (p.productType || p.type) === 'ยา').map(p => ({
        id: p.id,
        name: p.productName || p.name || '',
        price: p.price,
        unit: p.mainUnitName || p.unit || '',
        category: p.categoryName || p.category || '',
      })));
    } catch (e) { debugLog('tfp-medmodal-load', 'unexpected error opening medication modal (open path)', e); }
    setMedModalLoading(false);
  };
  const medFilteredProducts = useMemo(() => {
    if (!medModalQuery) return medAllProducts;
    const q = medModalQuery.toLowerCase();
    return medAllProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [medAllProducts, medModalQuery]);
  const selectMedProduct = (p) => {
    setMedModalSelected(p);
    setMedModalQty(p.label?.dosageAmount || '1');
    setMedModalPrice(p.price || '0');
    setMedModalVat(!!p.isVatIncluded);
    setMedModalDiscount('');
    setMedModalDiscountType('amount');
    setMedModalPremium(false);
  };
  const confirmMedModal = () => {
    if (!medModalSelected) return;
    const p = medModalSelected;
    const dosageText = p.label
      ? [p.label.administrationTimes, p.label.administrationMethod].filter(Boolean).join(', ')
      : (editingMedIndex >= 0 ? medications[editingMedIndex]?.dosage || '' : '');
    const price = parseFloat(medModalPrice) || 0;
    const disc = parseFloat(medModalDiscount) || 0;
    const discounted = medModalDiscountType === 'percent' ? price * (1 - disc / 100) : price - disc;
    const vatAmount = medModalVat ? discounted * 0.07 : 0;
    const netPrice = medModalPremium ? 0 : Math.max(0, discounted + vatAmount);
    const medItem = {
      id: p.id,
      name: p.name,
      dosage: dosageText,
      qty: medModalQty || '1',
      unitPrice: netPrice.toFixed(2),
      unit: p.unit || p.label?.dosageUnit || '',
      isPremium: medModalPremium,
    };
    if (editingMedIndex >= 0) {
      // Edit mode — update in-place
      setMedications(prev => prev.map((m, idx) => idx === editingMedIndex ? medItem : m));
      setEditingMedIndex(-1);
    } else {
      // Add mode — append
      setMedications(prev => [...prev, medItem]);
    }
    setMedModalOpen(false);
  };
  const editMedication = async (i) => {
    const med = medications[i];
    setEditingMedIndex(i);
    // Pre-fill modal with existing values
    const product = medAllProducts.find(p => p.id === med.id) || { id: med.id, name: med.name, unit: med.unit, price: med.unitPrice, label: null };
    setMedModalSelected(product);
    setMedModalQty(med.qty || '1');
    setMedModalPrice(med.isPremium ? (product.price || med.unitPrice || '0') : (med.unitPrice || '0'));
    setMedModalPremium(med.isPremium || false);
    setMedModalDiscount('');
    setMedModalDiscountType('amount');
    setMedModalVat(false);
    setMedModalLabelOpen(false);
    setMedModalQuery('');
    setMedModalOpen(true);
    // Load product list if not loaded
    if (medAllProducts.length === 0) {
      setMedModalLoading(true);
      try {
        // V50 — be_products via scopedDataLayer
        const { listProducts } = await import('../lib/scopedDataLayer.js');
        const all = await listProducts();
        const products = all.filter(p => (p.productType || p.type) === 'ยา').map(p => ({
          id: p.id,
          name: p.productName || p.name || '',
          price: p.price,
          unit: p.mainUnitName || p.unit || '',
          category: p.categoryName || p.category || '',
        }));
        setMedAllProducts(products);
        // Re-find product with label
        const found = products.find(p => p.id === med.id);
        if (found) setMedModalSelected(found);
      } catch (e) { debugLog('tfp-medmodal-load', 'unexpected error re-fetching products on medication edit', e); }
      setMedModalLoading(false);
    }
  };
  const openMedGroupModal = async () => {
    setMedGroupModalOpen(true);
    setMedGroupChecked(new Set());
    setMedGroupSelectedId('');
    // Phase 17.2-quinquies (2026-05-05) — drop length>0 short-circuit (see BS-9 effect).
    setMedGroupLoading(true);
    try {
      // V50 (2026-05-08) — backend-only. ProClinic broker.getMedicationGroups
      // branch deleted; be_product_groups is the ONLY source.
      const { listProductGroupsForTreatment } = await import('../lib/scopedDataLayer.js');
      const cached = await listProductGroupsForTreatment('ยากลับบ้าน');
      if (cached.length) { setMedGroupData(cached); setMedGroupSelectedId(String(cached[0].id)); setMedGroupChecked(new Set(cached[0].products?.map((_,i)=>i)||[])); }
    } catch (e) { debugLog('tfp-medgroup-load', 'unexpected error opening medication-group modal', e); }
    setMedGroupLoading(false);
  };
  const selectedGroupProducts = useMemo(() => {
    const g = medGroupData.find(g => String(g.id) === medGroupSelectedId);
    return g?.products || [];
  }, [medGroupData, medGroupSelectedId]);
  const toggleMedGroupCheck = (idx) => {
    setMedGroupChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const confirmMedGroup = () => {
    selectedGroupProducts.forEach((p, i) => {
      if (!medGroupChecked.has(i)) return;
      const dosageText = p.label
        ? [p.label.administrationTimes, p.label.administrationMethod].filter(Boolean).join(', ')
        : '';
      setMedications(prev => [...prev, {
        id: p.id,
        name: p.name,
        dosage: dosageText,
        qty: p.qty || p.label?.dosageAmount || '1',
        unitPrice: p.price || '0',
        unit: p.unit || p.label?.dosageUnit || '',
      }]);
    });
    setMedGroupModalOpen(false);
  };
  const updateMed = (i, field, value) => {
    setMedications(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };
  const removeMed = (i) => {
    setMedications(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Consumable modal (เพิ่มสินค้าสิ้นเปลือง — matching ProClinic) ──
  const openConsModal = async () => {
    setConsModalOpen(true);
    setConsModalQuery('');
    setConsModalSelected(null);
    setConsModalQty('');
    // Phase 17.2-quinquies (2026-05-05) — drop length>0 short-circuit (see BS-9 effect).
    setConsModalLoading(true);
    try {
      // V50 (2026-05-08) — backend-only. ProClinic broker.searchProducts branch deleted.
      const { listProducts } = await import('../lib/scopedDataLayer.js');
      const all = await listProducts();
      setConsAllProducts(all.filter(p => (p.productType || p.type) === 'สินค้าสิ้นเปลือง').map(p => ({
        id: p.id,
        name: p.productName || p.name || '',
        unit: p.mainUnitName || p.unit || '',
        category: p.categoryName || p.category || '',
      })));
    } catch (e) { debugLog('tfp-cons-load', 'unexpected error opening consumable modal', e); }
    setConsModalLoading(false);
  };
  const consFilteredProducts = useMemo(() => {
    if (!consModalQuery) return consAllProducts;
    const q = consModalQuery.toLowerCase();
    return consAllProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [consAllProducts, consModalQuery]);
  const confirmConsModal = () => {
    if (!consModalSelected) return;
    setConsumables(prev => [...prev, {
      id: consModalSelected.id,
      name: consModalSelected.name,
      qty: consModalQty || '1',
      unit: consModalSelected.unit || '',
    }]);
    setConsModalOpen(false);
  };
  const updateConsumable = (i, field, value) => {
    setConsumables(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };
  const removeConsumable = (i) => {
    setConsumables(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Consumable group modal ──
  const openConsGroupModal = async () => {
    setConsGroupModalOpen(true);
    setConsGroupChecked(new Set());
    setConsGroupSelectedId('');
    // Phase 17.2-quinquies (2026-05-05) — drop length>0 short-circuit (see BS-9 effect).
    setConsGroupLoading(true);
    try {
      // V50 (2026-05-08) — backend-only. ProClinic broker.getMedicationGroups branch deleted.
      const { listProductGroupsForTreatment } = await import('../lib/scopedDataLayer.js');
      const cached = await listProductGroupsForTreatment('สินค้าสิ้นเปลือง');
      if (cached.length) { setConsGroupData(cached); setConsGroupSelectedId(String(cached[0].id)); setConsGroupChecked(new Set(cached[0].products?.map((_,i)=>i)||[])); }
    } catch (e) { debugLog('tfp-consgroup-load', 'unexpected error opening consumable-group modal', e); }
    setConsGroupLoading(false);
  };
  const selectedConsGroupProducts = useMemo(() => {
    const g = consGroupData.find(g => String(g.id) === consGroupSelectedId);
    return g?.products || [];
  }, [consGroupData, consGroupSelectedId]);
  const toggleConsGroupCheck = (idx) => {
    setConsGroupChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const confirmConsGroup = () => {
    selectedConsGroupProducts.forEach((p, i) => {
      if (!consGroupChecked.has(i)) return;
      setConsumables(prev => [...prev, {
        id: p.id,
        name: p.name,
        qty: p.qty || '1',
        unit: p.unit || '',
      }]);
    });
    setConsGroupModalOpen(false);
  };

  // ── Buy items modal (ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน) ──
  const openBuyModal = async (type = 'course') => {
    setBuyModalOpen(true);
    setBuyModalType(type);
    setBuyQuery('');
    setBuySelectedCat('');
    setBuyShowLimit(50);
    setBuyChecked(new Set());
    setBuyQtyMap({});
    setBuyDiscMap({});
    setBuyVatMap({});
    // Phase 17.2-quinquies (2026-05-05) — drop length>0 short-circuit; always
    // re-fetch via scopedDataLayer auto-inject so course/product/promotion
    // tabs reflect the currently-selected branch. BS-9 effect (line ~337)
    // additionally drains buyItems/buyCategories on branch switch.
    setBuyLoading(true);
    try {
      // V50 (2026-05-08) — backend-only. ProClinic broker.listItems branch deleted.
      // BSA: courses/products read via be_* listers (branch-scoped),
      // promotions via be_promotions. No master_data/* reads (Rule H-quater).
      {
        const { listProducts, listCourses, listPromotions } = await import('../lib/scopedDataLayer.js');
        // V44 (2026-05-08) — beCourseToMasterShape is the SINGLE-SOURCE
        // mapper for course-buy items (canonical, includes mainProduct +
        // courseProducts → unified products[] with `name` field). SaleTab +
        // QuotationFormModal already use it; TFP buy fetcher previously did
        // inline mapping that dropped main product AND used field
        // productName→name without translation, breaking
        // buildPurchasedCourseEntry's `p.name || item.name` fallback →
        // customer.courses[i].product silently became courseName.
        const { beCourseToMasterShape } = await import('../lib/backendClient.js');
        let items = [];
        let categories = [];
        if (type === 'product') {
          const all = await listProducts();
          // Phase 17.2-septies (2026-05-05) — schema-reader fix. be_products
          // canonical fields are productType / productName / categoryName /
          // mainUnitName. Filter + map use productType-first fallback.
          items = all.filter(p => (p.productType || p.type) === 'สินค้าหน้าร้าน').map(p => ({
            id: p.id,
            name: p.productName || p.name || '',
            price: p.price,
            unit: p.mainUnitName || p.unit || '',
            category: p.categoryName || p.category || '',
            type: p.productType || p.type || '',
          }));
          categories = [...new Set(items.map(p => p.category).filter(Boolean))].sort();
        } else if (type === 'course') {
          const all = await listCourses();
          // Phase 12.2b follow-up (2026-04-25): preserve daysBeforeExpire
          // + period + unit. Prior whitelist kept courseType but stripped
          // the validity window → expiry='' on customer.courses even when
          // master had it. Accept both camelCase + snake_case.
          //
          // Skip shadow/archive courses from ProClinic sync (empty
          // courseType, null price — same rule as SaleTab).
          //
          // Phase 17.2-septies (2026-05-05) — schema-reader fix. be_courses
          // canonical fields are courseName / courseCategory / salePrice /
          // courseProducts. Map uses courseName-first fallback so courses
          // render with their actual name + price + category visible
          // (was "เป็นโครงเปล่าๆ" pre-fix).
          // V44 (2026-05-08) — preload be_products into a Map so
          // beCourseToMasterShape can enrich each course's products[] with
          // unit + canonical name (matches SaleTab pattern). Without the
          // Map, mainProduct enrichment falls back to '' for courses where
          // be_courses doc lacks mainProductName text.
          const productLookup = new Map();
          try {
            const allBeProducts = await listProducts();
            for (const p of allBeProducts) {
              productLookup.set(String(p.id), {
                name: p.productName || p.name || '',
                unit: p.mainUnitName || p.unit || '',
              });
            }
          } catch { /* non-fatal — beCourseToMasterShape degrades gracefully */ }
          items = all
            .filter(c => {
              const ct = c.courseType || c.course_type || '';
              const price = c.salePrice != null ? Number(c.salePrice) : (c.price != null ? Number(c.price) : null);
              return !!ct && price != null && price > 0;
            })
            .map(c => {
              // V44 — single-source via beCourseToMasterShape. Returns
              // shape { id, name, products: [{id, name, qty, unit, isMainProduct,
              // skipStockDeduction}], ... } where products[] correctly includes
              // mainProduct (top-level mainProductId/Name) + sub-products
              // (courseProducts[] mapped to {name, ...} with `name` not
              // `productName`). Closes the V44 multi-reader-sweep gap that
              // had buildPurchasedCourseEntry falling back to course name.
              const shape = beCourseToMasterShape(c, { productLookup });
              return {
                id: shape.id,
                name: shape.name,
                // V111 (2026-05-23 EOD+1 LATE) — receipt name override.
                // be_courses.receiptCourseName ("ชื่อคอร์ส (แสดงในใบเสร็จ)")
                // surfaced via beCourseToMasterShape.receipt_course_name (V44).
                // Carried as parallel field so SalePrintView prefers it on the
                // receipt while `name` stays original for customer.courses
                // display + treatment course dropdowns + reports. Empty string
                // → renderer falls back to original name. AV111.
                receiptCourseName: shape.receipt_course_name || '',
                price: shape.sale_price ?? shape.price,
                category: shape.course_category || shape.category || '',
                type: 'course', itemType: 'course',
                unit: c.unit || '',
                courseType: c.courseType || c.course_type || '',
                products: shape.products || [],
                daysBeforeExpire: c.daysBeforeExpire != null ? c.daysBeforeExpire
                  : (c.days_before_expire != null ? c.days_before_expire : null),
                period: c.period != null ? c.period : null,
                // V44 carry top-level skipStockDeduction so confirmBuy /
                // assignCourseToCustomer course-level fallback continues.
                skipStockDeduction: !!c.skipStockDeduction,
              };
            });
          categories = [...new Set(items.map(c => c.category).filter(Boolean))].sort();
        } else if (type === 'promotion') {
          const all = await listPromotions();
          items = all
            .filter(p => (p.status || 'active') === 'active')
            .map(p => ({
              id: p.promotionId || p.id,
              name: p.promotion_name || '',
              price: p.sale_price || 0,
              category: p.category_name || '',
              type: 'promotion',
              itemType: 'promotion',
              cover_image: p.cover_image || '',
              courses: p.courses || [],
              products: p.products || [],
            }));
          categories = [...new Set(items.map(p => p.category).filter(Boolean))].sort();
        }
        setBuyItems(prev => ({ ...prev, [type]: items }));
        setBuyCategories(prev => ({ ...prev, [type]: categories }));
      }
    } catch (e) { debugLog('tfp-buy-load', 'unexpected error opening buy-modal', e); }
    setBuyLoading(false);
  };
  const [buyShowLimit, setBuyShowLimit] = useState(50);
  const buyFilteredItems = useMemo(() => {
    let items = buyItems[buyModalType] || [];
    if (buySelectedCat) items = items.filter(i => i.category === buySelectedCat);
    if (buyQuery) {
      const q = buyQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [buyItems, buyModalType, buySelectedCat, buyQuery]);
  const buyVisibleItems = buyFilteredItems.slice(0, buyShowLimit);
  const toggleBuyCheck = (id) => {
    setBuyChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Auto-set qty to 1 when checked
        setBuyQtyMap(qm => ({ ...qm, [id]: qm[id] || '1' }));
      }
      return next;
    });
  };
  const confirmBuyModal = () => {
    const items = buyItems[buyModalType] || [];
    const newItems = items.filter(i => buyChecked.has(i.id)).map(i => {
      const qty = parseInt(buyQtyMap[i.id]) || 0;
      const disc = parseFloat(buyDiscMap[i.id]) || 0;
      const vat = !!buyVatMap[i.id];
      const price = parseFloat(i.price) || 0;
      const afterDisc = price - disc;
      const vatAmt = vat ? afterDisc * 0.07 : 0;
      const net = Math.max(0, afterDisc + vatAmt);
      // 2026-06-09 — mint a UNIQUE per-purchase id (counter beats clock-resolution
      // collisions). Threaded into buildPurchasedCourseEntry (opts.uid) + the promo
      // courseId/rowId below so the same course/promo bought twice stays distinct.
      const purchaseUid = `${Date.now().toString(36)}-${++purchaseSeqRef.current}`;
      // Phase 12.2b Step 7 (2026-04-24): preserve courseType through the
      // buy flow so downstream rendering (customerCourses row, DF modal,
      // treatment qty input) knows whether the course is fill-later
      // (เหมาตามจริง / เลือกสินค้าตามจริง) vs fixed-qty. Also flag
      // isRealQty locally so the stats + UI can branch without re-parsing.
      return {
        id: i.id, name: i.name, price: i.price, unitPrice: net.toFixed(2), unit: i.unit,
        // V111 (2026-05-23 EOD+1 LATE) — receipt name override snapshot.
        // Carried verbatim from picker → purchasedItem → grouped.courses[i]
        // (line ~2724) → createBackendSale spread → sale.items.courses[i].
        // SalePrintView prefers this over `name`. AV111.
        receiptCourseName: i.receiptCourseName || '',
        qty: String(qty || 0), discount: String(disc), vat,
        purchaseUid,
        itemType: i.itemType || buyModalType,
        category: i.category, courses: i.courses, products: i.products,
        courseType: i.courseType || '',
        isRealQty: i.courseType === 'เหมาตามจริง',
        // Phase 12.2b follow-up (2026-04-25): preserve the master-course
        // validity window so assignCourseToCustomer can stamp
        // customer.courses[].expiry. Lost before → buffet/specific-qty
        // courses had blank expiry → no countdown, "เหมือนไม่มีวันหมดอายุ".
        daysBeforeExpire: i.daysBeforeExpire != null ? i.daysBeforeExpire : null,
        period: i.period != null ? i.period : null,
      };
    });
    setPurchasedItems(prev => [...prev, ...newItems]);
    // Auto-add purchased items to customerCourses (so checkboxes appear in course/promotion columns).
    // Phase 12.2b Step 6 (2026-04-24): every synthetic entry carries
    // `isAddon: true` + `purchasedItemId` + `purchasedItemType` so the
    // course / promotion column renders a "(ซื้อเพิ่ม)" header badge +
    // Trash button on the parent course group itself (ProClinic Image-1
    // style), replacing the old gather-at-bottom flat list.
    newItems.forEach(item => {
      if (item.itemType === 'course') {
        // Phase 12.2b Step 7 (2026-04-24): delegate to pure helper so
        // courseType-aware fill-later logic is unit tested (no TFP mount
        // required). buildPurchasedCourseEntry stamps isAddon +
        // purchasedItemId + isRealQty + isPickAtTreatment + empty qty
        // markers when the course type is fill-later.
        const courseEntry = buildPurchasedCourseEntry(item, { uid: item.purchaseUid });
        if (courseEntry) {
          setOptions(prev => ({
            ...prev,
            customerCourses: [...(prev?.customerCourses || []), courseEntry],
          }));
        }
      }
      // Purchased promotion → add sub-courses as bundle (no manual picking)
      // V42 (2026-05-07): route through buildPromotionSubCourseProducts so the
      // 3-level multiplier (item.qty × c.qty × p.qty) is applied correctly.
      // Pre-V42 this path used `String(p.qty || 1)` — dropped both item.qty
      // (buy-quantity) AND c.qty (course-instance count inside the promotion
      // bundle). User reproduced live: promo with 6×PRP + 2×AHL produced
      // customer.courses[] with 1× of each. See V42 V-entry.
      if (item.itemType === 'promotion' && item.courses?.length) {
        const newCourseEntries = item.courses.map(c => {
          const multipliedProducts = buildPromotionSubCourseProducts(c, item.qty, { fallbackName: c.name || item.name });
          return {
            // 2026-06-09 — courseId + rowId include the per-purchase uid so the
            // same promotion bought twice stays distinct (independent checkboxes +
            // targeted remove). buildCustomerPromotionGroups groups buy-this-visit
            // promos by purchaseUid.
            courseId: `promo-${item.id}-${item.purchaseUid}-course-${c.id}`,
            courseName: c.name,
            promotionId: item.id,
            isAddon: true,
            purchasedItemId: item.id,
            purchasedItemType: 'promotion',
            purchaseUid: item.purchaseUid,
            products: multipliedProducts.map((mp, idx) => {
              const sourceProduct = (c.products || [])[idx];
              const productId = sourceProduct?.id != null
                ? sourceProduct.id
                : (sourceProduct?.productId != null ? sourceProduct.productId : `idx${idx}`);
              return {
                rowId: `promo-${item.id}-${item.purchaseUid}-row-${c.id}-${productId}`,
                name: mp.name,
                remaining: String(mp.qty),
                total: String(mp.qty),
                unit: mp.unit || 'ครั้ง',
              };
            }),
          };
        });
        setOptions(prev => ({
          ...prev,
          customerCourses: [...(prev?.customerCourses || []), ...newCourseEntries],
          customerPromotions: [...(prev?.customerPromotions || []), { id: item.id, promotionName: item.name, isAddon: true, purchaseUid: item.purchaseUid }],
        }));
      }
      // Purchased promotion's STANDALONE products → consumables (so they
      // appear in "สินค้าสิ้นเปลือง" UI AND get deducted from stock via
      // deductStockForTreatment which iterates items.consumables[]).
      // Bug fix 2026-04-19 — previously dropped on the floor → inventory drift.
      if (item.itemType === 'promotion' && item.products?.length) {
        const promoConsumables = mapPromotionProductsToConsumables(item);
        if (promoConsumables.length > 0) {
          setConsumables(prev => [...prev, ...promoConsumables]);
        }
      }
    });
    setBuyModalOpen(false);
  };
  const removePurchasedItem = (item) => {
    // 2026-06-09 — target the SPECIFIC purchase via purchaseUid (passed by the trash
    // button). item.id is the MASTER id (shared when a course/promo is bought twice)
    // → matching by id alone removed BOTH buys (the user-reported "ลบคอร์สแรกแล้ว
    // คอร์สที่ 2 หายด้วย"). Legacy fallback (no purchaseUid — standalone products /
    // pre-fix data) keeps the old first-by-id + startsWith behavior.
    const targetUid = item.purchaseUid != null ? String(item.purchaseUid) : null;
    setPurchasedItems(prev => {
      let idx = targetUid
        ? prev.findIndex(p => p.purchaseUid != null && String(p.purchaseUid) === targetUid)
        : -1;
      if (idx === -1) idx = prev.findIndex(p => String(p.id) === String(item.id) && p.itemType === item.itemType);
      if (idx === -1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
    // Also remove from customerCourses (added by confirmBuyModal)
    if (item.itemType === 'course' || item.itemType === 'promotion') {
      setOptions(prev => {
        if (!prev?.customerCourses) return prev;
        const filtered = prev.customerCourses.filter(c => {
          // Exact per-purchase match: drop ONLY entries from THIS purchase. Covers
          // course (1 entry) AND promotion (N sub-course entries) uniformly.
          if (targetUid && c.purchaseUid != null) return String(c.purchaseUid) !== targetUid;
          // Legacy fallback (entry without purchaseUid — pre-fix data only).
          if (item.itemType === 'course') return !c.courseId?.startsWith(`purchased-course-${item.id}-`);
          if (item.itemType === 'promotion') return !c.courseId?.startsWith(`promo-${item.id}-`);
          return true;
        });
        return { ...prev, customerCourses: filtered };
      });
      // Also remove any selected course items that belonged to this purchase
      setSelectedCourseItems(prev => {
        const next = new Set(prev);
        const prefix = targetUid
          ? (item.itemType === 'course' ? `purchased-${item.id}-${targetUid}-row-` : `promo-${item.id}-${targetUid}-row-`)
          : (item.itemType === 'course' ? `purchased-${item.id}-row-` : `promo-${item.id}-row-`);
        for (const rowId of prev) {
          if (rowId.startsWith(prefix)) {
            next.delete(rowId);
            setTreatmentItems(ti => ti.filter(t => t.id !== rowId));
          }
        }
        return next;
      });
    }
    // Also remove consumables that were added by this promotion's standalone
    // products (symmetric with confirmBuyModal — bug fix 2026-04-19).
    // 2026-06-09 — prefer purchaseUid so removing one promo buy doesn't strip the
    // OTHER buy's standalone-product consumables (would under-deduct stock on save).
    if (item.itemType === 'promotion') {
      setConsumables(prev => filterOutConsumablesForPromotion(prev, item.id, targetUid));
    }
  };
  // Group purchased items by type for display
  const purchasedByType = useMemo(() => {
    const grouped = { course: [], promotion: [], product: [] };
    purchasedItems.forEach(item => {
      if (grouped[item.itemType]) grouped[item.itemType].push(item);
    });
    return grouped;
  }, [purchasedItems]);

  // Phase 14.4 (2026-04-24): derive the list of courses selected on this
  // treatment for the DF modal. DfEntryModal renders ONE row per distinct
  // course, filtered by what the user has picked (selectedCourseItems Set).
  //
  // Bug fix round 2 (2026-04-24): use MASTER courseId (from master_data
  // courses / be_courses), not the synthetic `be-course-N` id baked into
  // customer.courses[]. The synthetic id is scoped to a customer's
  // purchase history and never matches `be_df_groups.rates[].courseId`
  // (which is keyed by master id). User-reported: "ขึ้นว่า 0 บาท ทุกอัน"
  // when adding a DF entry — the resolver walked mismatched ids and
  // returned null for every row → buildDefaultRows defaulted to
  // value: 0, enabled: false.
  //
  // Strategy: look up the master course by course name. Ambiguity (two
  // master courses with identical names) resolves to the first hit —
  // that's the same hit DfGroupFormModal's picker would show. Missing
  // match → pass the customer name as pseudo-id so the modal still
  // renders the row (user can set the value manually).
  // AV200 (2026-07-04): canonical be_courses uses `courseName` — the old
  // inline map read `mc.name` (legacy) → empty map → DF modal showed 0 บาท
  // on every row while the entered rates existed. Canonical-first via the
  // shared helper (courseName → name fallback).
  const masterCourseIdByName = useMemo(
    () => buildMasterIdByName(masterCourses, ['courseName', 'name'], ['id', 'courseId']),
    [masterCourses]
  );

  // AV200 (2026-07-04): product/procedure rows from "+ เพิ่มรายการรักษา" or
  // course-product ticks carry only a NAME — resolve to the be_products
  // master id so DF group product rates (kind: 'product') auto-fill in the
  // DF modal. Course-first keeps the Phase 14.4 contract; the product map
  // is the NEW fallback.
  const masterProductIdByName = useMemo(
    () => buildMasterIdByName(options?.products, ['productName', 'name'], ['id', 'productId']),
    [options?.products]
  );

  const treatmentCoursesForDf = useMemo(() => {
    const seen = new Set();
    const out = [];
    // Phase 12.2b follow-up (2026-04-24): carry course `price` so
    // DfEntryModal can show the calculated baht amount next to percent
    // rates ("10%" → "฿5,000" for a ฿50,000 course). User request:
    // "ค่ามือแพทย์ที่เป็น % ไม่แสดงจำนวนเงิน".
    const push = (cid, name, price) => {
      const key = String(cid || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      const priceNum = Number(price) || 0;
      out.push({ courseId: key, courseName: name || key, price: priceNum });
    };

    // Price map from purchasedItems (this-visit buys) — indexed by course
    // name for cross-lookup with customerCourses entries.
    const priceByName = new Map();
    for (const p of (purchasedItems || [])) {
      if (p.itemType !== 'course') continue;
      const n = String(p.name || '').trim();
      if (!n) continue;
      const unitPrice = Number(p.unitPrice) || Number(p.price) || 0;
      const qty = Number(p.qty) || 1;
      priceByName.set(n, unitPrice * qty);
    }

    // Source 1: customer's purchased courses picked this visit (deducted).
    const all = options?.customerCourses || [];
    for (const c of all) {
      const hasPicked = (c.products || []).some(p => selectedCourseItems.has(p.rowId));
      if (!hasPicked) continue;
      const name = String(c.courseName || '').trim();
      const masterId = masterCourseIdByName.get(name) || '';
      const cid = masterId || String(c.courseId || name);
      // Price fallback order: this-visit purchase → parsed `value`
      // string on customer.courses entry (e.g. "50000 บาท").
      let price = priceByName.get(name) || 0;
      if (!price && c.value) {
        const m = String(c.value).match(/([\d,.]+)/);
        if (m) price = parseFloat(m[1].replace(/,/g, '')) || 0;
      }
      push(cid, name, price);
    }

    // Phase 14.4 ask-A (2026-04-24): Source 2 — items directly added on
    // this visit via "+ เพิ่มรายการรักษา". Match by name → master id;
    // unmatched items fall back to their display name as pseudo-id so the
    // row still renders in the DF modal. This is how DF entries can be
    // added to a treatment that doesn't deduct any existing purchased
    // course (e.g. ad-hoc walk-in procedures).
    for (const ti of (treatmentItems || [])) {
      const name = String(ti?.name || '').trim();
      if (!name) continue;
      // AV200 chain: course map first (Phase 14.4 contract) → product map
      // (NEW — kind:'product' rates in be_df_groups) → pseudo-name fallback.
      const masterId = masterCourseIdByName.get(name) || masterProductIdByName.get(name) || '';
      const price = priceByName.get(name) || (Number(ti.price) || 0);
      push(masterId || name, name, price);
    }
    return out;
  }, [options?.customerCourses, selectedCourseItems, masterCourseIdByName, masterProductIdByName, treatmentItems, purchasedItems]);

  // Audit P2 (2026-04-26 RP1/AV1): pick-modal course lookup. Extracted
  // from render-time IIFE at TFP:4589 (anti-IIFE-JSX rule alignment).
  // Returns null when modal closed OR course not found in customerCourses.
  const pickModalCourse = useMemo(() => {
    if (!pickModalCourseId) return null;
    return (options?.customerCourses || []).find(c => c.courseId === pickModalCourseId) || null;
  }, [pickModalCourseId, options?.customerCourses]);

  // Audit P2 (2026-04-26 RP1/AV1): grand-total baht sum across all DF
  // entries (percent + baht combined). Extracted from a render-time IIFE
  // at TFP:3287 to align with CLAUDE.md anti-IIFE-JSX rule. Pure compute
  // depending on dfEntries + treatmentCoursesForDf — useMemo memoises so
  // the render-loop cost stays bounded.
  const dfGrandTotal = useMemo(() => {
    const priceByCourseId = new Map(
      (treatmentCoursesForDf || []).map(c => [String(c.courseId), Number(c.price) || 0])
    );
    return dfEntries.reduce((sum, e) => {
      const enabled = (e.rows || []).filter(r => r.enabled);
      const bahtSum = enabled.filter(r => r.type === 'baht').reduce((s, r) => s + (Number(r.value) || 0), 0);
      const percentSum = enabled.filter(r => r.type === 'percent').reduce((s, r) => {
        const price = priceByCourseId.get(String(r.courseId)) || 0;
        return s + (price * (Number(r.value) || 0) / 100);
      }, 0);
      return sum + bahtSum + percentSum;
    }, 0);
  }, [dfEntries, treatmentCoursesForDf]);

  // Combined people list (doctors + assistants) for DfEntryModal picker.
  // Each carries `position` + `defaultDfGroupId` so the modal can auto-fill
  // the group dropdown when the user selects a person.
  const treatmentPeopleForDf = useMemo(() => {
    const doctors = (options?.doctors || []);
    const assistants = (options?.assistants || []);
    const merged = [];
    const seen = new Set();
    for (const p of [...doctors, ...assistants]) {
      const id = String(p.id);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push({ id, name: p.name, position: p.position, defaultDfGroupId: p.defaultDfGroupId || '' });
    }
    return merged;
  }, [options?.doctors, options?.assistants]);

  /**
   * !!! HOOK-ORDER INVARIANT — DO NOT MOVE !!!
   *
   * This useEffect MUST be declared AFTER both upstream memos:
   *   - `treatmentCoursesForDf` (useMemo, ~line 1619) — read at line 1716, 1734
   *   - `treatmentPeopleForDf`  (useMemo, ~line 1683) — read at line 1729
   *
   * Moving this hook BEFORE either memo triggers a Temporal Dead Zone
   * (TDZ) ReferenceError DURING RENDER:
   *   "Cannot access 'treatmentCoursesForDf' before initialization"
   * which crashes TreatmentFormPage with a BLANK SCREEN on both create
   * AND edit paths. There is NO ESLint/TypeScript rule that catches this
   * — `react-hooks/exhaustive-deps` only checks the dep array shape, not
   * declaration ordering. The crash only surfaces at render time.
   *
   * If you need to add a NEW hook between the memos and this useEffect,
   * verify both memos are still declared above the new hook + this
   * useEffect remains the LAST one in the chain that references them.
   *
   * @see Phase 14.4 ask-B (2026-04-24) — original bug fix
   * @see SESSION_HANDOFF.md "Hook-order TDZ in TreatmentFormPage:1694"
   *
   * Behavior: when user picks doctor / assistants AND the treatment has
   * any billable items (purchased-course picks OR direct treatmentItems),
   * create one dfEntry per person with the resolver's default rows. No
   * manual "เพิ่มค่ามือ" click required — mirrors the legacy doctorFees
   * auto-populate, scoped to the per-course DF model. Respects manual
   * dismissal: when user deletes an auto-created entry, its doctorId
   * lands in `dfDismissedIds` so picking the same doctor again won't
   * resurrect the row.
   */
  useEffect(() => {
    if (!options) return;
    if (treatmentCoursesForDf.length === 0) return;
    if (!Array.isArray(dfGroups) || dfGroups.length === 0) return;
    const selectedIds = [doctorId, ...assistantIds].filter(Boolean);
    if (selectedIds.length === 0) return;

    setDfEntries((prev) => {
      const existingByDoctor = new Map(prev.map((e) => [String(e.doctorId), e]));
      const next = [...prev];
      let changed = false;
      for (const pid of selectedIds) {
        const key = String(pid);
        if (existingByDoctor.has(key)) continue;
        if (dfDismissedIds.has(key)) continue;
        const person = treatmentPeopleForDf.find((p) => String(p.id) === key);
        if (!person) continue;
        const entryGroupId = person.defaultDfGroupId || '';
        if (!entryGroupId) continue; // no default group → skip auto-create
        const rows = buildDefaultRows(
          treatmentCoursesForDf,
          key,
          entryGroupId,
          dfGroups,
          dfStaffRates,
          getRateForStaffCourse,
        );
        if (!rows.some((r) => r.enabled)) continue;
        next.push({
          id: generateDfEntryId(),
          doctorId: key,
          doctorName: person.name || '',
          dfGroupId: entryGroupId,
          rows,
        });
        changed = true;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, assistantIds, treatmentCoursesForDf, dfGroups, dfStaffRates, treatmentPeopleForDf]);

  // Group promotion-linked courses by promotionId with promotion name
  const customerPromotionGroups = useMemo(() => {
    // Phase 12.2b Step 6 (2026-04-24): extracted into a pure helper in
    // treatmentBuyHelpers.js so the add-on propagation logic has direct
    // unit-test coverage without remounting TreatmentFormPage.
    return buildCustomerPromotionGroups(options?.customerCourses, options?.customerPromotions);
  }, [options]);

  // 2026-04-28: group flat customerCourses entries by purchase event so
  // the "ข้อมูลการใช้คอร์ส" panel renders ONE course header + N nested
  // product rows (instead of repeating the header for every product —
  // user reported "[IV Drip] Aura bright x 2" header showing 4 times for
  // a 4-product course). Promotion-linked entries handled by
  // customerPromotionGroups above; this helper only groups non-promotion
  // courses. Pure render-side aggregation — flat customerCourses array
  // remains the source of truth for selectedCourseItems / deductCourseItems
  // / treatmentCoursesForDf which all read by rowId or courseIndex.
  const customerCourseGroups = useMemo(() => {
    // Phase 16.7-quinquies-ter (2026-04-29) — hide depleted (remaining=0)
    // + zero-total (0/0) courses; keep special types (เหมาตามจริง /
    // บุฟเฟต์ / pick-at-treatment) regardless of qty.
    const usable = (options?.customerCourses || []).filter(isCourseUsableInTreatment);
    return buildCustomerCourseGroups(usable);
  }, [options?.customerCourses]);

  // ── Seller commission auto-calc ──
  useEffect(() => {
    if (billing.netTotal <= 0) return;
    setPmSellers(prev => prev.map(s => {
      if (!s.enabled) return s;
      const pct = parseFloat(s.percent) || 0;
      const newTotal = (billing.netTotal * pct / 100).toFixed(2);
      return newTotal !== s.total ? { ...s, total: newTotal } : s;
    }));
  }, [billing.netTotal, pmSellers.map(s => s.percent + s.enabled).join()]);

  // ── Payment auto-fill when status=2 (full payment) ──
  useEffect(() => {
    if (paymentStatus === '2' && billing.netTotal > 0) {
      setPmChannels(prev => {
        const newAmt = billing.netTotal.toFixed(2);
        if (prev[0].enabled && prev[0].amount === newAmt) return prev;
        return prev.map((c, i) => i === 0 ? { ...c, enabled: true, amount: newAmt } : c);
      });
    }
  }, [paymentStatus, billing.netTotal]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const hasSale = purchasedItems.length > 0 || medications.length > 0 || consumables.length > 0;
  // Phase 12.2b follow-up (2026-04-24): hide every billing-related UI
  // section when the net payable is 0 (free course, fully-discounted,
  // or gift). User request: "หากเงินเป็น 0 บาท ไม่ต้องส่วนของขึ้น
  // การคิดเงินในหน้าสร้างการรักษา". Covers: insurance claim, expense
  // summary, sale note + date, payment channels, sellers. The rest of
  // the treatment save still runs (doctor DF, course deductions).
  const showBilling = hasSale && (Number(billing?.netTotal) || 0) > 0;

  const scrollToError = (fieldAttr, msg) => {
    alert(msg);
    setError(msg);
    // TF3 a11y polish (audit 2026-05-04): mirror the visual ring-2 with the
    // SR-equivalent aria-invalid + aria-describedby. Stored under the same
    // key as data-field so a single key drives both pathways. Cleared
    // either by the per-field setter (clearFieldError) or by the next
    // setFieldErrors({}) at handleSubmit reset.
    if (fieldAttr) setFieldErrors((prev) => ({ ...prev, [fieldAttr]: msg }));
    setTimeout(() => {
      const el = document.querySelector(`[data-field="${fieldAttr}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-2', 'ring-red-500'); setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 3000); }
      else { const errEl = document.querySelector('[data-error-banner]'); if (errEl) errEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }, 50);
  };

  // V104 (2026-05-19 LATE+3 EOD+1) — RENAMED 2nd param from `options` →
  // `submitOpts` to eliminate parameter-shadowing of the React-state
  // `options` declared at line 461 (`const [options, setOptions] = useState(null)`).
  //
  // Pre-V104: handleSubmit(eventOrSaveMode, options = {}) shadowed the
  // React state inside the entire function body. EVERY `options?.X` read
  // in this body (customerCourses, doctors, assistants, etc.) read the
  // EMPTY parameter default `{}` instead of the React state.
  //
  // User-visible consequence (the bug that triggered V104):
  // - V101 IIFE at ~line 2405 read `options?.customerCourses` → undefined
  //   → liveCustomerCourses=[] → Pass 1+2 both no-op → courseItems=[]
  //   → existingDeductions=[] + purchasedDeductions=[] → deductCourseItems
  //   NEVER called → customer.courses[] NEVER decremented
  // - User saved a treatment ใช้คอร์ส 12 ครั้ง → customer.courses[] still
  //   showed 12/12. "ไม่ตัดสักครั้ง บั๊คคค ไอ้สัส" (real user quote).
  // - 4-of-4 latest treatments evidence: scripts/diag-v104-all-today-treatments.mjs.
  // - JS shadow proof: `node -e "const x={};const f=(_,x={})=>console.log(x);f()"` → {}
  //
  // V101 backfill silently rescued treatments by writing
  // _v101BackfilledAt:true forensic stamps on courseItems retroactively
  // — but live save path was always broken.
  //
  // Bug has been live since Phase 26.1 (2026-05-13) when `options = {}`
  // 2nd param was added for editorContext (which was never actually
  // passed via 2nd arg — re-invoke at line 578 passes it via FIRST arg
  // as `{saveMode, editorContext}`).
  const handleSubmit = async (eventOrSaveMode, submitOpts = {}) => {
    // Phase 26.0a (V26.0, 2026-05-13) — Doctor-Save scaffold. Defensive
    // coercion: any value OTHER than the literal string 'doctor' resolves
    // to 'staff' default. Backward-compat: existing callers pass either
    // nothing or a form submit Event (handlers in onClick/onSubmit), both
    // of which → 'staff'. Phase 26.0b added explicit gates around
    // course-deduct / sale-create / consumables-deduct using this var.
    //
    // Phase 26.1 (V26.1, 2026-05-13) — Editor-attribution modal extension.
    // handleSubmit may be re-invoked internally after EditAttributionModal
    // confirms with `{saveMode, editorContext}` object form. Defensive
    // coercion preserved: string 'doctor' / Event / undefined / null still
    // resolve to original behavior. The NEW object form is recognized only
    // when eventOrSaveMode is a plain object WITHOUT preventDefault (i.e.,
    // not a React SyntheticEvent).
    let saveMode = 'staff';
    let editorContext = submitOpts.editorContext || null;

    if (typeof eventOrSaveMode === 'string') {
      // Phase 26.0 form: handleSubmit('doctor') OR handleSubmit('staff')
      // Phase 26.2f: handleSubmit('vitals') added for vitals-only saves
      // V136 (2026-05-31): handleSubmit('course') — retroactive course-usage
      // edit on a finalized treatment that deducted NO course. Deducts the
      // selected existing courses but SKIPS the auto-sale path (no INV/money).
      saveMode = (eventOrSaveMode === 'doctor') ? 'doctor'
               : (eventOrSaveMode === 'vitals') ? 'vitals'
               : (eventOrSaveMode === 'course') ? 'course'
               : 'staff';
    } else if (
      eventOrSaveMode &&
      typeof eventOrSaveMode === 'object' &&
      typeof eventOrSaveMode.preventDefault !== 'function'
    ) {
      // Phase 26.1 internal re-invoke: handleSubmit({saveMode, editorContext})
      // Phase 26.2f: 'vitals' accepted in object form too
      // V136: 'course' accepted in object form too
      saveMode = (eventOrSaveMode.saveMode === 'doctor') ? 'doctor'
               : (eventOrSaveMode.saveMode === 'vitals') ? 'vitals'
               : (eventOrSaveMode.saveMode === 'course') ? 'course'
               : 'staff';
      if (eventOrSaveMode.editorContext) {
        editorContext = eventOrSaveMode.editorContext;
      }
    } else if (eventOrSaveMode && typeof eventOrSaveMode.preventDefault === 'function') {
      // Phase 26.0 form: handleSubmit(SyntheticEvent) from form submit
      eventOrSaveMode.preventDefault();
      // saveMode stays 'staff' default
    }
    // else: handleSubmit() with no arg → saveMode = 'staff', editorContext = null
    // TF3 a11y polish — clear stale per-field errors at submit start so
    // re-submit doesn't surface yesterday's aria-invalid on inputs the
    // user has since corrected.
    setFieldErrors({});
    // Phase 26.2f-followup (V26.2f, 2026-05-13) → V73-DR1 (2026-05-18) —
    // REQUIRE doctor for BOTH 'staff' AND 'doctor' saves.
    //   User curse-report: "ทำให้ปุ่ม บันทึกสำหรับแพทย์ ใน TFP บังคับให้ต้อง
    //   เลือกหมอด้วยสิวะ เป็นบันทึกของแพทย์เสือกไม่ Required field แพทย์
    //   ด้านบนสุดได้ยังไง". A doctor's note MUST attribute to a specific
    //   doctor — without it the record is orphan ("doctor recorded but no
    //   doctor name"). Pre-V73-DR1 the gate only fired for saveMode='staff'.
    //   Skip ONLY for 'vitals' (admin vitals-only entry — nurse/staff records
    //   vitals before doctor sees patient; doctor TBD).
    if (saveMode !== 'vitals' && !doctorId) { scrollToError('doctor', 'กรุณาเลือกแพทย์'); return; }
    if (!treatmentDate) { scrollToError('treatmentDate', 'กรุณาเลือกวันที่รักษา'); return; }
    // 2026-05-25 — block save while any blob upload is in flight so we never
    // persist a half-uploaded photo/PDF (Storage-ref: state holds a Storage URL
    // only AFTER upload settles; pendingUploads is normally 0, settles in ~1-2s).
    if (pendingUploads > 0) { alert('รูปภาพ/ไฟล์กำลังอัปโหลด — กรุณารอสักครู่แล้วบันทึกอีกครั้ง'); return; }
    // Phase 12.2b Step 7 (2026-04-24): fill-later treatment items (from
    // เหมาตามจริง / เลือกสินค้าตามจริง courses) must have qty entered
    // before save. qty was left blank at toggle-time; doctor fills it
    // in during treatment. Empty qty → block save with a specific error
    // targeting the first offender. Validator lives in treatmentBuyHelpers
    // so the logic is unit-tested without TreatmentFormPage mount.
    const fillLaterMissing = findMissingFillLaterQty(treatmentItems);
    if (fillLaterMissing) {
      scrollToError(fillLaterMissing.id, `กรุณาระบุจำนวน "${fillLaterMissing.name}" ก่อนบันทึก (คอร์สเหมาตามจริง)`);
      return;
    }
    // Phase 12.2b follow-up (2026-04-24): if the net total is 0 (free /
    // fully-discounted / promo-gift course), skip the hasSale-gated seller
    // + payment checks. Bug was: buying a ฿0 course populated purchasedItems
    // (→ hasSale=true) → validation demanded seller+payment channel even
    // though there's nothing to collect. User-reported on the new-treatment
    // screen. Non-zero totals keep the original validation contract.
    const netTotalNow = Number(billing?.netTotal) || 0;
    if (hasSale && netTotalNow > 0) {
      if (!pmSellers.some(s => s.enabled && s.id)) { scrollToError('sellers', 'กรุณาเลือกพนักงานขาย'); return; }
      if (paymentStatus === '2' || paymentStatus === '4') {
        if (!pmChannels.some(c => c.enabled && c.method)) { scrollToError('paymentChannels', 'กรุณาเลือกช่องทางชำระเงิน'); return; }
        if (!pmChannels.some(c => c.enabled && parseFloat(c.amount) > 0)) { scrollToError('paymentChannels', 'กรุณากรอกจำนวนเงินที่ชำระ'); return; }
      }
    }
    // Phase 26.1c (V26.1, 2026-05-13) — Editor attribution gate. When admin
    // clicks save in edit-mode + staff saveMode, suspend the rest of handleSubmit
    // and open the modal. User picks → onConfirm fires → handleSubmit re-invokes
    // with editorContext → this guard passes (editorContext truthy) → save proceeds.
    const needsEditorAttribution = isEdit && saveMode === 'staff';
    if (needsEditorAttribution && !editorContext) {
      setEditAttributionModal({ isOpen: true });
      return;  // Suspend; modal-confirm handler re-enters with editorContext
    }
    // appointment-loop R3 — synchronous re-entry guard (placed AFTER the editor-
    // attribution suspend-return so the modal-confirm re-invoke is NOT blocked).
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSaving(true);
    setError('');
    try {
      // Build seller entries from pmSellers array
      const sellerPayload = {};
      pmSellers.forEach((s, i) => {
        if (s.enabled && s.id) {
          sellerPayload[`seller${i + 1}Id`] = s.id;
          sellerPayload[`sellerPercent${i + 1}`] = s.percent;
          sellerPayload[`sellerTotal${i + 1}`] = s.total;
        }
      });
      const payload = {
        doctorId,
        assistantIds,
        treatmentDate,
        ...opd,
        vitals,
        bloodType,
        congenitalDisease,
        drugAllergy,
        treatmentHistory,
        medCertActuallyCome,
        medCertIsRest,
        medCertPeriod,
        medCertIsOther,
        medCertOtherDetail,
        courseItems: Array.from(selectedCourseItems).map(rowId => {
          const ti = treatmentItems.find(t => t.id === rowId);
          return { rowId, qty: ti?.qty || '1' };
        }),
        doctorFees: doctorFees.map(f => ({ doctorId: f.doctorId, fee: f.fee, groupId: f.groupId })),
        // Phase 14.4: per-doctor-per-course DF entries (canonical going forward)
        dfEntries,
        purchasedItems: purchasedItems.map(p => ({ id: p.id, name: p.name, qty: p.qty, unitPrice: p.unitPrice, unit: p.unit, itemType: p.itemType })),
        medications: medications.filter(m => m.name),
        consumables: consumables.filter(c => c.name),
        treatmentItems,
        // Chart images — sent as chart_image[] to ProClinic (data URLs from canvas)
        chartImages: charts.filter(c => c.dataUrl).map(c => c.dataUrl),
        // Treatment images — Before/After/Other galleries
        // 2026-07-05 thumbs (Q3=B) — thumbUrl/thumbStoragePath persist with each entry
        beforeImages: beforeImages.map(i => ({ dataUrl: i.dataUrl, id: i.id || '', storagePath: i.storagePath || '', thumbUrl: i.thumbUrl || '', thumbStoragePath: i.thumbStoragePath || '' })),
        afterImages: afterImages.map(i => ({ dataUrl: i.dataUrl, id: i.id || '', storagePath: i.storagePath || '', thumbUrl: i.thumbUrl || '', thumbStoragePath: i.thumbStoragePath || '' })),
        otherImages: otherImages.map(i => ({ dataUrl: i.dataUrl, id: i.id || '', storagePath: i.storagePath || '', thumbUrl: i.thumbUrl || '', thumbStoragePath: i.thumbStoragePath || '' })),
        labItems: labItems.map(l => ({
          id: l.id || '', productId: l.productId, productName: l.productName,
          unitName: l.unitName || '', productType: l.productType || 'บริการ',
          qty: l.qty, price: l.price, originalPrice: l.originalPrice || l.price,
          discount: l.discount || '0', discountType: l.discountType || 'บาท',
          isVatIncluded: l.isVatIncluded || false, rowId: l.rowId || '',
          information: l.information || '', fileId: l.fileId || '',
          images: (l.images || []).map(i => ({ dataUrl: i.dataUrl, id: i.id || '', storagePath: i.storagePath || '', thumbUrl: i.thumbUrl || '', thumbStoragePath: i.thumbStoragePath || '' })),
          pdfBase64: l.pdfBase64 || '', pdfStoragePath: l.pdfStoragePath || '', pdfFileName: l.pdfFileName || '',
        })),
        treatmentFiles: (isEdit
          ? treatmentFiles  // Edit: send ALL slots so deleted files get cleared
          : treatmentFiles.filter(f => f.pdfBase64 || f.fileId)  // Create: only send slots with data
        ).map(f => ({
          slot: f.slot, fileId: f.fileId || '', pdfBase64: f.pdfBase64 || '', pdfStoragePath: f.pdfStoragePath || '', pdfFileName: f.pdfFileName || '',
        })),
        // Billing/Payment — only include when there's an actual sale
        ...(hasSale ? {
          saleDate,
          medicineDiscountPercent: billing.medDiscPct,
          discount: billDiscount || '',
          discountType: billDiscountType === 'percent' ? '%' : 'บาท',
          couponCode,
          isInsuranceClaimed,
          benefitType,
          insuranceCompanyId,
          totalClaimAmount: insuranceClaimAmount,
          useDeposit, depositAmount,
          useWallet, walletId, walletAmount,
          paymentStatus,
          paymentDate,
          paymentTime,
          paymentMethod: pmChannels[0].enabled ? pmChannels[0].method : '',
          paidAmount: pmChannels[0].enabled ? pmChannels[0].amount : '',
          paymentMethod2: pmChannels[1].enabled ? pmChannels[1].method : '',
          paidAmount2: pmChannels[1].enabled ? pmChannels[1].amount : '',
          paymentMethod3: pmChannels[2].enabled ? pmChannels[2].method : '',
          paidAmount3: pmChannels[2].enabled ? pmChannels[2].amount : '',
          refNo, note, saleNote,
          ...sellerPayload,
        } : {}),
      };

      // ── BACKEND SAVE ──
      if (saveTarget === 'backend') {
        // V26.0 Phase 26.0b — doctor-save gate: skip course over-deduction
        // validation when saveMode === 'doctor'. Doctor-save records OPD/meds/DF
        // only; admin finalizes course items + bill later (canAddNewItems unlocks
        // edit-mode for status='doctor-recorded'). Without this gate, the validator
        // would fire against selectedCourseItems that the doctor may have touched
        // but won't actually deduct in this save path.
        if (saveMode !== 'doctor' && saveMode !== 'vitals') {
          // Validate course deductions against LIVE Firestore data.
          // Since rows are no longer grouped, validate each row against the exact
          // Firestore course entry at its `courseIndex`.
          if (selectedCourseItems.size > 0) {
            try {
              const { getCustomer: fetchLiveCustomer } = await import('../lib/scopedDataLayer.js');
              const { parseQtyString } = await import('../lib/courseUtils.js');
              const liveCustomer = await fetchLiveCustomer(customerId);
              const liveCourses = liveCustomer?.courses || [];
              const overDeductions = [];
              for (const rowId of selectedCourseItems) {
                for (const course of (options?.customerCourses || [])) {
                  const product = course.products?.find(p => p.rowId === rowId);
                  if (product) {
                    // Phase 12.2b follow-up (2026-04-24): fill-later
                    // (เหมาตามจริง) courses don't have meaningful "remaining"
                    // — the doctor enters actual product usage at treatment
                    // time, and the course consumes to 0 on save via the
                    // deductCourseItems short-circuit. Skip the pre-check
                    // for these rows; the backend zero-out handles
                    // lifecycle, and stock deduction uses treatment qty
                    // directly (be_products batch, not course balance).
                    const liveC = typeof product.courseIndex === 'number'
                      ? liveCourses[product.courseIndex]
                      : null;
                    const liveIsRealQty = String(liveC?.courseType || '').trim() === 'เหมาตามจริง';
                    const inMemoryIsRealQty = !!(product.fillLater || course.isRealQty);
                    if (liveIsRealQty || inMemoryIsRealQty) continue;
                    // Phase 12.2b follow-up (2026-04-25): buffet courses
                    // have unlimited usage until date-expiry. No
                    // over-deduct is possible; skip the remaining check.
                    const liveIsBuffet = String(liveC?.courseType || '').trim() === 'บุฟเฟต์';
                    const inMemoryIsBuffet = !!(product.isBuffet || course.isBuffet);
                    if (liveIsBuffet || inMemoryIsBuffet) continue;
                    const deductAmt = Number(treatmentItems.find(t => t.id === rowId)?.qty || 1);
                    const isPurchased = isPurchasedSessionRowId(rowId);
                    // After de-grouping: each row = one customer.courses entry, so validate
                    // against the row's own remaining. For existing entries we verify against
                    // LIVE Firestore remaining at the exact courseIndex (race-safe).
                    let remaining;
                    if (isPurchased) {
                      remaining = parseFloat(product.remaining) || 0;
                    } else if (liveC) {
                      const { remaining: liveRem } = parseQtyString(liveC.qty);
                      remaining = liveRem;
                    } else {
                      remaining = parseFloat(product.remaining) || 0;
                    }
                    if (deductAmt > remaining) {
                      overDeductions.push(`• "${product.name}" คงเหลือ${isPurchased ? '' : 'จริง'} ${remaining} ${product.unit} — ต้องการตัด ${deductAmt}`);
                    }
                  }
                }
              }
              if (overDeductions.length > 0) {
                const msg = `คอร์สคงเหลือไม่พอ:\n${overDeductions.join('\n')}`;
                scrollToError('courseSection', msg);
                setSaving(false);
                return;
              }
            } catch (e) {
              console.warn('[TreatmentForm] course validation check failed:', e);
              // Don't block save if validation check itself fails — let deduction handle it
            }
          }
        }

        const { createBackendTreatment, updateBackendTreatment, rebuildTreatmentSummary } = await import('../lib/scopedDataLayer.js');
        // Strip undefined values — Firestore rejects any field with value undefined
        const clean = (obj) => JSON.parse(JSON.stringify(obj));
        const backendDetail = clean({
          treatmentDate,
          doctorId,
          doctorName: (options?.doctors || []).find(d => String(d.id) === String(doctorId))?.name || '',
          assistants: assistantIds.map(aid => {
            const a = [...(options?.doctors || []), ...(options?.assistants || [])].find(x => String(x.id) === String(aid));
            return { id: aid, name: a?.name || '' };
          }),
          // Phase 27.0 (2026-05-14) — stamp branchId from BranchSelector context so
          // TreatmentReadOnlyMirror can display "สาขา <name>" without a separate lookup.
          // branchName is intentionally omitted — render-side resolveBranchDisplayName
          // (AV42) live-resolves at render time, so no allBranches fetch is needed here.
          // Empty selectedBranchId (admin on "all branches" view) saves as '';
          // admin can correct via EditAttributionModal (Phase 27.0 Task 6).
          branchId: selectedBranchId || '',
          symptoms: opd.symptoms, physicalExam: opd.physicalExam, diagnosis: opd.diagnosis,
          treatmentInfo: opd.treatmentInfo, treatmentPlan: opd.treatmentPlan,
          treatmentNote: opd.treatmentNote, additionalNote: opd.additionalNote,
          vitals: { ...vitals, bmi: bmi || '' },
          healthInfo: { bloodType, congenitalDisease, drugAllergy, treatmentHistory },
          medCertActuallyCome, medCertIsRest, medCertPeriod, medCertIsOther, medCertOtherDetail,
          beforeImages, afterImages, otherImages,
          charts: charts.filter(c => c.dataUrl).map(chartEntryForPersist),   // size-guarded: drops oversized fabricJson so a big chart can't blow the 1MB Firestore doc + break the save
          // Phase 12.2b follow-up (2026-04-24): preserve productId +
          // fillLater on the save payload so deductStockForTreatment's
          // _normalizeStockItems can resolve real be_products batches
          // instead of falling back to the synthetic rowId. Without
          // this, fill-later treatments silently skipped stock and the
          // user reported "ใช้คอร์สเหมาแล้วไม่ตัดสต็อค".
          treatmentItems: treatmentItems.filter(t => t.name).map(t => ({ id: t.id, productId: t.productId || '', name: t.name, qty: t.qty, unit: t.unit, price: t.price, fillLater: !!t.fillLater, skipStockDeduction: !!t.skipStockDeduction })),
          medications: medications.filter(m => m.name).map(m => ({ name: m.name, dosage: m.dosage, qty: m.qty, unitPrice: m.unitPrice, unit: m.unit })),
          consumables: consumables.filter(c => c.name).map(c => ({ name: c.name, qty: c.qty, unit: c.unit })),
          labItems: labItems.map(l => ({ productId: l.productId, productName: l.productName, qty: l.qty, price: l.price, information: l.information, images: l.images, pdfBase64: l.pdfBase64, pdfStoragePath: l.pdfStoragePath || '' })),
          doctorFees: doctorFees.map(f => ({ doctorId: f.doctorId, name: f.name, fee: f.fee, groupId: f.groupId })),
          // Phase 14.4: per-doctor-per-course DF entries (canonical)
          dfEntries,
          treatmentFiles: treatmentFiles.filter(f => f.pdfBase64 || f.fileId).map(f => ({ slot: f.slot, fileId: f.fileId, pdfBase64: f.pdfBase64, pdfStoragePath: f.pdfStoragePath || '', fileName: f.fileName })),
          // Billing & Payment (Phase 5A)
          purchasedItems: purchasedItems.map(p => ({ id: p.id, name: p.name, qty: p.qty, unitPrice: p.unitPrice, unit: p.unit, itemType: p.itemType })),
          billing: { subtotal: billing.subtotal, medDisc: billing.medDisc, billDiscAmt: billing.billDiscAmt, netTotal: billing.netTotal },
          payment: { paymentStatus, channels: pmChannels.filter(c => c.enabled), paymentDate, paymentTime, refNo, note: note, saleNote },
          sellers: pmSellers.filter(s => s.enabled).map(s => ({ id: s.id, percent: s.percent, total: s.total })),
          hasSale,
          // Phase 6: Save course items used (for deduction tracking).
          // `courseIndex` (when present) targets a specific customer.courses entry —
          // lets deductCourseItems hit the exact row the user selected instead of
          // falling back to FIFO name/product match across possibly many duplicates.
          //
          // V101 (2026-05-19 LATE+2) — TWO-PASS defensive serialization.
          // User report (real prod, วันเพ็ญ LC-26000078): 4 of 4 auditable treatments
          // had treatmentItems with productId matching customer.courses[].productId
          // but courseItems serialized to []. Class-of-bug: "treatmentItems-
          // courseItems desync at save boundary" — root cause channels include
          // (a) edit-load self-perpetuating loop (line 991 sets id=`existing-${i}`
          //     while selectedCourseItems stays empty → save with empty courseItems
          //     → loop), (b) state-sync race between selectedCourseItems Set +
          //     options.customerCourses array (timing-dependent, not always
          //     reproducible), (c) purchase + use-immediately path where rowId
          //     lookup in customerCourses misses post-confirmBuyModal append.
          // V101 backstop: Pass 1 = original rowId-based lookup; Pass 2 =
          // productId-based fallback that catches all 3 channels.
          // V142-bis (2026-05-31) — extracted VERBATIM to buildCourseItemsForSave
          // (treatmentBuyHelpers.js) so the create-flow buy→deduct serialization
          // is directly testable; behavior-identical to the prior inline IIFE.
          // V142-quinquies (2026-05-31) — course-NEUTRAL doctor/vitals saves MUST
          // NOT write course-deduction data (user directive: "ปุ่มบันทึกสำหรับแพทย์
          // ไม่ต้องบันทึกพวกข้อมูลการตัดคอร์ส ที่จะบันทึกตัดคอร์สด้วยจะเป็นบันทึกด้านล่างของ TFP").
          // The bottom (deducting) save owns the course-item record; doctor/vitals
          // PRESERVE the existing record instead of re-serializing the selection.
          courseItems: (saveMode === 'doctor' || saveMode === 'vitals')
            ? (existingCourseItems || [])
            : buildCourseItemsForSave(selectedCourseItems, options?.customerCourses, treatmentItems),
        });
        // Phase 6: Course deduction BEFORE save — only deduct EXISTING courses (not purchased-in-session).
        // Reversal on edit: split old deductions into existing + purchased so the reversal algorithm
        // hits the same entry the deduction touched (purchased items go to the newest match, which is
        // what preferNewest: true gives us).
        const freshExisting = (backendDetail.courseItems || []).filter(ci => !isPurchasedSessionRowId(ci.rowId));
        const oldExisting = (existingCourseItems || []).filter(ci => !isPurchasedSessionRowId(ci.rowId));
        const oldPurchased = (existingCourseItems || []).filter(ci => isPurchasedSessionRowId(ci.rowId));
        // V142 (2026-05-31) — edit-resave SYMMETRY. The reverse below refunds
        // oldExisting/oldPurchased; the re-deduct MUST re-apply every reversed
        // deduction whose row is STILL selected, else a 2nd+ save un-deducts a
        // used course (real-prod LC-26000115: courseItems serialized [] on
        // reload → reverse without re-deduct → balance reverted to full).
        // Create-mode has no reverse → fresh list only (no behavior change).
        const existingDeductions = isEdit
          ? buildReDeductListWithCarryForward(freshExisting, oldExisting, selectedCourseItems)
          : freshExisting;
        // V26.0 Phase 26.0b — doctor-save gate: skip reverseCourseDeduction.
        // Doctor-save doesn't touch course balances on save (skips deductCourseItems
        // below). Mirror: skip the reverse so we don't refund a balance that was
        // never deducted in this save path.
        //
        // V142-quater (2026-05-31) — OVER-CREDIT fix used a status heuristic
        // (priorSaveDeducted = status !== doctor/vitals). Its comment asserted
        // "finalize→doctor→finalize cannot occur because the doctor-save UI is gated
        // on status==='doctor-recorded'" — but that was FALSE: the doctor-save button
        // is "always shown" (Phase 27.2-bis, TFP ~3756). So a COMPLETED treatment
        // (already deducted) could be re-saved as doctor (status→'doctor-recorded')
        // then finalized again → the heuristic read 'doctor-recorded' → priorSaveDeducted
        // FALSE → reverse SKIPPED → re-deduct → DOUBLE-DEDUCT (real-prod repro:
        // scripts/diag-finalize-doctor-finalize-double-deduct.mjs R1/R2 → 3/5).
        //
        // V142-quinquies (2026-05-31) — ROOT-CAUSE fix. The status heuristic can't
        // distinguish "never deducted" (vitals→doctor→finalize) from "deducted then
        // doctor-rerecorded" (finalize→doctor→finalize) — both show 'doctor-recorded'.
        // Replace it with the precise persisted `_courseDeducted` flag (loadedCourseDeducted,
        // loaded above): set TRUE by the deducting (bottom) save, PRESERVED by the
        // course-neutral doctor/vitals saves → the reverse decision is independent of
        // status flips. Handles ALL histories: V142 (completed re-save → flag true →
        // reverse), V142-quater (vitals/doctor never set flag → no reverse → no
        // over-credit), and the new double-deduct (finalize sets flag → preserved
        // through doctor → 2nd finalize reverses → no double). AV165.
        const priorSaveDeducted = loadedCourseDeducted;
        if (saveMode !== 'doctor' && saveMode !== 'vitals' && isEdit && priorSaveDeducted && (oldExisting.length > 0 || oldPurchased.length > 0)) {
          const { reverseCourseDeduction } = await import('../lib/scopedDataLayer.js');
          if (oldExisting.length > 0) await reverseCourseDeduction(customerId, oldExisting);
          if (oldPurchased.length > 0) await reverseCourseDeduction(customerId, oldPurchased, { preferNewest: true });
        }
        // V36-bis (2026-04-29) — moved deductCourseItems to AFTER
        // createBackendTreatment. Pre-V36-bis: in create mode, treatmentId
        // prop was empty when deductCourseItems ran → opts.treatmentId
        // gate at backendClient.js:938 was falsy → audit emit (kind='use')
        // skipped silently → "ประวัติการใช้คอร์ส" tab showed nothing for
        // newly-created treatments. User report 2026-04-29: "คอร์สที่ตัด
        // ผ่านการรักษาในแต่ละครั้ง ไม่ขึ้นในประวัติการใช้คอร์ส".
        // The reorder is safe because:
        //   (a) edit-mode reverseCourseDeduction still fires above (line 2099)
        //       before any new write
        //   (b) if course deduction throws (shortfall), we delete the orphan
        //       treatment to maintain atomic-rollback contract
        // See V36-bis test V36.J in tests/v36-treatment-skip-fail-loud.test.js

        // Phase 8b — Stock: on EDIT, reverse old treatment stock BEFORE the doc update.
        // Phase 14.7.F (2026-04-26) — gate the reverse+rededuct on a stock-shape
        // diff. Image-only / chart-only / dr-note-only edits previously triggered
        // this path unconditionally, which (a) churned write ops needlessly and
        // (b) hit `allow update: if false` on be_stock_movements when trying to
        // set reversedByMovementId on the original movement. The pure helper
        // hasStockChange returns true iff treatmentItems / consumables /
        // medications differ in length, content, or order vs the snapshot
        // captured at edit-load time.
        const { hasStockChange } = await import('../lib/treatmentStockDiff.js');
        const stockChanged = !isEdit || hasStockChange(existingStockSnapshot, {
          treatmentItems: backendDetail.treatmentItems || [],
          consumables: backendDetail.consumables || [],
          medications: backendDetail.medications || [],
        });
        if (isEdit && stockChanged) {
          try {
            const { reverseStockForTreatment } = await import('../lib/scopedDataLayer.js');
            await reverseStockForTreatment(treatmentId);
          } catch (stockErr) {
            throw new Error(`คืนสต็อกการรักษาเดิมไม่สำเร็จ: ${stockErr.message}`);
          }
        }

        // V26.0 Phase 26.0b — status routing + forensic trail.
        // Doctor-save:      stamp status='doctor-recorded' + recordedBy=uid + recordedAt=serverTimestamp()
        // Staff/admin save: clear status via deleteField() (drops the field from the doc shape).
        //                   recordedBy + recordedAt INTENTIONALLY OMITTED from this patch so any
        //                   prior values are PRESERVED — admin finalize keeps the forensic trail
        //                   "who recorded the OPD card and when?" per spec § 3 semantics matrix.
        // Patch is appended AFTER clean() (which is JSON.parse(JSON.stringify(...))) because
        // Firestore sentinels deleteField() + serverTimestamp() don't survive a JSON round-trip.
        // Phase 27.2-bis (2026-05-14) — per user directive "time stamp ก็จะ
        // อัพเดทตามการแก้ไขล่าสุด เหมือนกันทุกปุ่มบันทึก": every save mode
        // ALWAYS updates its corresponding stage timestamp (no preservation
        // gates). Each badge in CDV reflects the LATEST time that stage was
        // saved, not the first. Stage attribution survives stage transitions
        // because each stage has its own discrete timestamp field.
        const v26StatusPatch = saveMode === 'doctor' ? {
          status: 'doctor-recorded',
          recordedBy: auth.currentUser?.uid || null,
          recordedAt: serverTimestamp(),
          doctorRecordedAt: serverTimestamp(),
          doctorRecordedBy: auth.currentUser?.uid || null,
        } : saveMode === 'vitals' ? {
          status: 'vitalsigns-recorded',
          recordedBy: auth.currentUser?.uid || null,
          recordedAt: serverTimestamp(),
          vitalsignsRecordedAt: serverTimestamp(),
          vitalsignsRecordedBy: auth.currentUser?.uid || null,
        } : saveMode === 'course' ? {
          // V136 (2026-05-31) — retroactive course-usage edit. Forensic-only:
          // stamp WHO recorded the course usage retroactively + WHEN. Do NOT
          // touch `status` (preserve the treatment's finalized lifecycle — this
          // is a course-usage backfill, not a re-completion) and do NOT
          // re-stamp completedAt. No deleteField() → safe in edit mode.
          courseUsageEditedAt: serverTimestamp(),
          courseUsageEditedBy: auth.currentUser?.uid || null,
        } : {
          // admin/staff save clears status (advances to "completed" state)
          // V96 (2026-05-19) — deleteField() ONLY in EDIT mode. For CREATE mode
          // (`!isEdit`), the new treatment doc has no `status` field to delete;
          // Firestore client SDK rejects `setDoc()` (non-merge) with deleteField()
          // sentinels per its API contract ("deleteField() cannot be used with
          // set() unless you pass {merge:true}"). Phase 27.2-bis allowed direct
          // staff-create which surfaced this latent bug; user saw it 2026-05-19
          // as "Function setDoc() called with invalid data" on BT-1779181253570.
          // The thrown error blocked the WHOLE save → auto-sale + course
          // deduction never ran (all 3 symptoms = 1 root cause).
          ...(isEdit ? { status: deleteField() } : {}),
          // Phase 27.2-bis — always stamp completedAt to latest staff save
          // (was previously gated on !loadedTreatmentCompletedAt; user wants
          // each click to refresh the badge time).
          completedAt: serverTimestamp(),
          completedBy: auth.currentUser?.uid || null,
          // Phase 26.1 (V26.1, 2026-05-13) — editor attribution from EditAttributionModal.
          ...(editorContext ? {
            editedBy: editorContext.uid,
            editedByName: editorContext.name,
            editedByRole: editorContext.role,
            editedAt: serverTimestamp(),
          } : {}),
        };
        // V142-quinquies (2026-05-31) — persist the precise course-deduction flag.
        // Deducting saves (staff/course) OWN it = whether this save leaves an active
        // course deduction (existing OR purchased, carry-forward-aware). Course-neutral
        // doctor/vitals saves PRESERVE the loaded value (must not touch course state).
        // Stored in detail (via detailRest) → read at edit-load → drives the reverse
        // gate (priorSaveDeducted) independent of status. AV165.
        const _freshPurchasedForFlag = (backendDetail.courseItems || []).filter(ci => isPurchasedSessionRowId(ci.rowId));
        const _purchasedDedForFlag = isEdit
          ? buildReDeductListWithCarryForward(_freshPurchasedForFlag, oldPurchased, selectedCourseItems)
          : _freshPurchasedForFlag;
        const willDeductCourses = existingDeductions.length > 0 || _purchasedDedForFlag.length > 0;
        const courseDeductedAfter = (saveMode === 'doctor' || saveMode === 'vitals')
          ? loadedCourseDeducted
          : willDeductCourses;
        const finalBackendDetail = { ...backendDetail, ...v26StatusPatch, _courseDeducted: courseDeductedAfter };
        const result = isEdit
          ? await updateBackendTreatment(treatmentId, finalBackendDetail)
          : await createBackendTreatment(customerId, finalBackendDetail);
        await rebuildTreatmentSummary(customerId);
        // (2026-07-04 spec ③④) staff-chat "ระบบ" card on vitals/doctor save —
        // fire-and-forget + NON-FATAL (writeTfpChatCard never throws). Uses the
        // resolved id (result.treatmentId on create OR treatmentId prop on edit —
        // V36-quater newTid pattern; do NOT read shadowed state, V104).
        // branchId: EDIT prefers the treatment's PERSISTED branchId (bug-hunt R1
        // #7 — vitals-card + doctor-card of ONE treatment must land in the SAME
        // branch chat even if the admin switched the top-right branch between
        // the two saves); CREATE uses the selector. '' (all-branches view with
        // no persisted id) → builder returns null → no card.
        if (saveMode === 'vitals' || saveMode === 'doctor') {
          const cardTid = result?.treatmentId || treatmentId;
          if (cardTid) {
            import('../lib/tfpStaffChatNotify.js').then(({ writeTfpChatCard }) => writeTfpChatCard({
              kind: saveMode === 'doctor' ? 'tfp-doctor' : 'tfp-vitals',
              treatmentId: cardTid,
              customerId,
              customerName: patientName || '',
              customerHN: customerHNProp || '',
              doctorName: (options?.doctors || []).find(d => String(d.id) === String(doctorId))?.name || '',
              branchId: (isEdit && loadedTreatmentBranchId) || selectedBranchId || '',
            })).catch(() => {});
          }
        }
        // V157 — collect non-fatal side-effect failures (deposit/wallet/points/
        // course) so the admin SEES them at save. The treatment+sale are saved
        // regardless (deliberate non-blocking design), but pre-V157 a failed
        // money/course side-effect was swallowed to console only → invisible to
        // the clinic → silent money/inventory discrepancy. Surfaced via a non-
        // fatal alert before the success screen (additive — happy path untouched).
        const sideEffectWarnings = [];

        // V36-bis (2026-04-29) — deductCourseItems moved here so we have
        // the real treatmentId (from result.treatmentId on create OR from
        // treatmentId prop on edit). The audit emit (kind='use') at
        // backendClient.js:938 fires only when opts.treatmentId is set.
        // V26.0 Phase 26.0b — doctor-save gate: skip deductCourseItems entirely.
        // Course balances are touched only when admin finalizes (saveMode='staff'
        // on a treatment that was previously status='doctor-recorded' OR a normal
        // staff save). Doctor-save records OPD/meds/DF only.
        if (saveMode !== 'doctor' && saveMode !== 'vitals' && existingDeductions.length > 0) {
          const newTid = result.treatmentId || treatmentId;
          const { deductCourseItems } = await import('../lib/scopedDataLayer.js');
          const treatingDoctor = (options?.doctors || []).find(d => String(d.id) === String(doctorId));
          try {
            await deductCourseItems(customerId, existingDeductions, {
              treatmentId: newTid,
              // 2026-06-09 — course-USE attribution ("ตัดคอร์สจากการรักษา โดย ...")
              // = the OPD EDITOR (the person who keyed/last-edited the treatment),
              // NOT the doctor. Staff usually key the deduction, not the doctor.
              // editorContext is the same identity stamped as editedByName
              // ("แก้ไขโดย: X"). Falls back to the doctor only when no editor.
              staffId: editorContext?.uid || doctorId || '',
              staffName: editorContext?.name || treatingDoctor?.name || '',
            });
          } catch (courseErr) {
            // Atomic-rollback contract: if course deduction throws (e.g.
            // shortfall), delete the just-created treatment doc so the
            // user can fix and retry without an orphan record.
            // Edit-mode preserves the original doc — no rollback needed.
            if (!isEdit && result?.treatmentId) {
              try {
                const { deleteBackendTreatment } = await import('../lib/scopedDataLayer.js');
                await deleteBackendTreatment(result.treatmentId);
              } catch (rbErr) {
                console.error('[TreatmentForm] orphan-treatment rollback failed:', rbErr);
              }
            }
            throw new Error(`ตัดคอร์สไม่สำเร็จ: ${courseErr.message}`);
          }
        }

        // Phase 8b — Stock: deduct treatment-side items.
        //
        // Splitting into two calls so the movement log shows the right type:
        //   - consumables + treatmentItems → MOVEMENT_TYPES.TREATMENT (6)
        //     ("ใช้ในการรักษา" — supplies/instruments used during the visit)
        //   - take-home medications        → MOVEMENT_TYPES.TREATMENT_MED (7)
        //     ("จ่ายยาในการรักษา" — meds dispensed for home use)
        // ProClinic uses these as distinct codes so the log is filterable
        // (group "รักษา" = both 6+7; pharmacist needs the 7-only view).
        //
        // Take-home meds bypass this path when hasSale=true: the auto-sale
        // owns them via deductStockForSale (movement type 2 SALE) so they
        // appear under that sale's saleId in the audit trail. Either way
        // every dispensed med yields exactly one movement entry.
        const newTreatmentId = result.treatmentId || treatmentId;
        const { deductStockForTreatment } = await import('../lib/scopedDataLayer.js');
        const stockUtilsMod = await import('../lib/stockUtils.js');
        const TREATMENT_TYPE = stockUtilsMod.MOVEMENT_TYPES.TREATMENT;       // 6
        const TREATMENT_MED_TYPE = stockUtilsMod.MOVEMENT_TYPES.TREATMENT_MED; // 7
        // Phase 14.7.F gate — skip both the consumables/items deduct AND the
        // medications deduct when stock was already in the right state for
        // this treatment (i.e. only image/chart/note fields changed). The
        // `stockChanged` flag was computed before the doc update and OR'd
        // with `!isEdit` so create-mode always deducts.
        try {
          // 1) consumables + treatmentItems → type 6
          // V26.0 Phase 26.0b — doctor-save gate: skip consumables/treatmentItems
          // deduct. Admin records consumables when finalizing (canAddNewItems edit
          // path). Per Q2 spec decision, meds (call 2 below) stay UNGATED — doctor
          // dispenses meds at OPD time and stock decrements immediately.
          if (saveMode !== 'doctor' && saveMode !== 'vitals' && stockChanged) {
            await deductStockForTreatment(newTreatmentId, {
              consumables: backendDetail.consumables || [],
              treatmentItems: backendDetail.treatmentItems || [],
            }, {
              customerId, branchId: SELECTED_BRANCH_ID,
              movementType: TREATMENT_TYPE,
              user: { userId: '', userName: '' },
            });
          }
          // 2) take-home meds → type 7 (only when no auto-sale takes them)
          // NOTE: intentionally NOT saveMode-gated per Q2 — meds always deduct
          // when the doctor enters them (auto-sale handles them when hasSale).
          if (stockChanged && !hasSale && (backendDetail.medications || []).length > 0) {
            await deductStockForTreatment(newTreatmentId, {
              medications: backendDetail.medications || [],
            }, {
              customerId, branchId: SELECTED_BRANCH_ID,
              movementType: TREATMENT_MED_TYPE,
              user: { userId: '', userName: '' },
            });
          }
        } catch (stockErr) {
          throw new Error(`ตัดสต็อกการรักษาไม่สำเร็จ: ${stockErr.message}`);
        }

        // Auto-create sale invoice when treatment has billing items (hasSale)
        // V26.0 Phase 26.0b — doctor-save gate: skip the entire auto-sale chain
        // (createBackendSale + deductStockForSale + applyDepositToSale +
        // deductWallet + earnPoints + assignCourseToCustomer + promo-assign).
        // Doctor-save defers all billing/sale creation to admin finalize.
        // V136 (2026-05-31) — saveMode='course' (retro course-usage edit) ALSO
        // skips the auto-sale chain: it records existing-course usage only, no
        // buy/INV/money (Q3=B). [Moot for create-path (!isEdit) but explicit.]
        if (saveMode !== 'doctor' && saveMode !== 'vitals' && saveMode !== 'course' && hasSale && !isEdit) {
          try {
            const { createBackendSale, assignCourseToCustomer, applyDepositToSale, deductWallet, earnPoints, setTreatmentLinkedSaleId } = await import('../lib/scopedDataLayer.js');
            const grouped = { promotions: [], courses: [], products: [], medications: medications.filter(m => m.name) };
            purchasedItems.forEach(p => {
              const t = p.itemType || 'product';
              if (t === 'promotion') grouped.promotions.push(p);
              else if (t === 'course') grouped.courses.push(p);
              else grouped.products.push(p);
            });
            const pmStatusMap = { '2': 'paid', '4': 'split', '0': 'unpaid' };
            const depositIdsPayload = selectedDeposits
              .filter(d => d.depositId && (Number(d.amount) || 0) > 0)
              .map(d => ({ depositId: d.depositId, amount: Number(d.amount) || 0 }));
            const walletAppliedValue = Number(billing.walDed) || 0;
            const walletTypeIdPayload = selectedWallet?.walletTypeId && walletAppliedValue > 0 ? String(selectedWallet.walletTypeId) : '';
            const walletTypeNamePayload = walletTypeIdPayload ? (selectedWallet?.walletTypeName || '') : '';
            const firstSeller = pmSellers.find(s => s.enabled && s.id);
            // V105 (2026-05-19 LATE+3 NIGHT+2) — canonical customer-name
            // resolution. Pre-V105 used `customerName: patientName` directly,
            // but `patientName` parent-prop is derived from top-level
            // `firstname / lastname` lowercase fields. Customers created via
            // Facebook/LINE/kiosk paths only populate `patientData.firstName
            // / lastName` (camelCase nested) → patientName=='' → sale shows
            // "-". User report 2026-05-19 LATE+3 (LC-26000079 / INV-20260519-
            // 0008). Resolver walks ALL shape variants in priority order
            // (patientData.firstNameTh > patientData.firstName > top-level
            // firstname > customerName legacy > nickname) and returns
            // first non-empty. Fallback to patientName prop preserves
            // backward-compat for customers populated via legacy path.
            const _v105ResolvedName = resolveCustomerDisplayName(
              { patientData },
              { includePrefix: true }
            ) || patientName || '';
            const _v105ResolvedHN = resolveCustomerHN({ patientData })
              || customerHNProp
              || '';
            const createRes = await createBackendSale(clean({
              customerId, customerName: _v105ResolvedName,
              // V105 canonical HN resolver covers patientData.hn /
              // patientData.HN / patientData.proClinicHN / top-level
              // proClinicHN / top-level hn variants.
              customerHN: _v105ResolvedHN,
              saleDate: treatmentDate, saleNote: '',
              items: grouped,
              billing: {
                subtotal: billing.subtotal,
                billDiscount: billing.billDiscAmt,
                membershipDiscount: billing.membershipDisc,
                membershipDiscountPercent: billing.memPct,
                depositApplied: billing.depDed,
                depositIds: depositIdsPayload,
                walletApplied: walletAppliedValue,
                walletTypeId: walletTypeIdPayload,
                walletTypeName: walletTypeNamePayload,
                netTotal: billing.netTotal,
              },
              membershipId: backendActiveMembership?.membershipId || null,
              payment: { status: pmStatusMap[paymentStatus] || 'paid', channels: pmChannels.filter(c => c.enabled), date: paymentDate, time: paymentTime, refNo },
              sellers: pmSellers.filter(s => s.enabled).map(s => ({ id: s.id, percent: s.percent, total: s.total })),
              source: 'treatment',
              linkedTreatmentId: result.treatmentId || treatmentId || '',
            }));
            // Phase 12.2b follow-up (2026-04-25): back-link the treatment
            // to this sale so `dfPayoutAggregator` can match
            // `t.detail.linkedSaleId` → `sale.saleId`. Without this,
            // the treatment's dfEntries[] never contributes to the DF
            // payout report (user bug: "ค่ามือหมอที่คิด ไม่ได้เชื่อมกับ
            // หน้ารายงาน DF"). Writes BOTH top-level + detail. fields so
            // _clearLinkedTreatmentsHasSale + aggregator both see it.
            try {
              const tid = result.treatmentId || treatmentId || '';
              if (tid) await setTreatmentLinkedSaleId(tid, createRes.saleId);
            } catch (e) { console.warn('[TreatmentForm] setTreatmentLinkedSaleId failed:', e); }
            // Phase 8b — Stock: deduct for auto-sale's products + medications. Fail-fast
            // and delete the sale if stock can't be allocated, so no partial state.
            try {
              const { deductStockForSale, deleteBackendSale } = await import('../lib/scopedDataLayer.js');
              await deductStockForSale(createRes.saleId, grouped, {
                customerId, branchId: SELECTED_BRANCH_ID,
                user: { userId: firstSeller?.id || '', userName: firstSeller?.name || '' },
              });
            } catch (stockErr) {
              try {
                const { deleteBackendSale } = await import('../lib/scopedDataLayer.js');
                await deleteBackendSale(createRes.saleId);
              } catch {}
              throw new Error(`ตัดสต็อก auto-sale ไม่สำเร็จ: ${stockErr.message}`);
            }
            // Apply each selected deposit to this new sale
            for (const d of depositIdsPayload) {
              try { await applyDepositToSale(d.depositId, createRes.saleId, d.amount); }
              catch (e) { console.warn('[TreatmentForm] apply deposit failed:', e); sideEffectWarnings.push(`หักมัดจำ ${d.amount}฿ ไม่สำเร็จ — ใบเสร็จบันทึกว่าใช้มัดจำแล้วแต่ระบบยังไม่หัก กรุณาตรวจสอบ`); }
            }
            // Deduct wallet if any
            if (walletTypeIdPayload && walletAppliedValue > 0) {
              try {
                await deductWallet(customerId, walletTypeIdPayload, {
                  amount: walletAppliedValue,
                  walletTypeName: walletTypeNamePayload,
                  note: `หัก wallet จากใบเสร็จ ${createRes.saleId}`,
                  referenceType: 'sale', referenceId: createRes.saleId,
                  staffId: firstSeller?.id || '', staffName: firstSeller?.name || '',
                });
              } catch (e) { console.warn('[TreatmentForm] wallet deduct failed:', e); sideEffectWarnings.push(`หัก wallet ${walletAppliedValue}฿ ไม่สำเร็จ — ใบเสร็จบันทึกว่าใช้ wallet แล้วแต่ระบบยังไม่หัก กรุณาตรวจสอบ`); }
            }
            // Earn points
            const bpp = Number(backendActiveMembership?.bahtPerPoint) || 0;
            if (bpp > 0 && billing.netTotal > 0) {
              try {
                await earnPoints(customerId, {
                  purchaseAmount: billing.netTotal,
                  bahtPerPoint: bpp,
                  referenceType: 'sale', referenceId: createRes.saleId,
                  note: `สะสมจาก treatment ${result.treatmentId || treatmentId}`,
                  staffId: firstSeller?.id || '', staffName: firstSeller?.name || '',
                });
              } catch (e) {
                // C13: non-blocking — sale + treatment already committed.
                // Structured error lets ops reconcile missed points later.
                console.error('[TreatmentForm] earnPoints failed (treatment still saved, points NOT earned)', {
                  customerId, saleId: createRes.saleId,
                  treatmentId: result.treatmentId || treatmentId,
                  purchaseAmount: billing.netTotal, bahtPerPoint: bpp,
                  error: e?.message,
                });
              }
            }
            // Auto-assign purchased courses + promotions to customer.
            // purchased qty multiplies master product qty.
            // Tag each assignment with linkedSaleId + linkedTreatmentId for reversal.
            const linkedTreatmentId = result.treatmentId || treatmentId || '';
            for (const course of grouped.courses) {
              try {
                // Phase 12.2b follow-up (2026-04-24): for เลือกสินค้าตามจริง
                // courses, use the RESOLVED picks (if any) from in-memory
                // customerCourses instead of the master options list.
                // alreadyResolved=true tells assignCourseToCustomer to
                // write standard per-product entries, NOT a fresh
                // placeholder (which would overwrite the just-picked
                // products and cause deductCourseItems to fail).
                const { products: prods, alreadyResolved } = resolvePurchasedCourseForAssign(
                  course, options?.customerCourses, course.qty
                );
                await assignCourseToCustomer(customerId, {
                  name: course.name, products: prods, price: course.unitPrice,
                  source: 'treatment', parentName: `คอร์ส: ${course.name}`,
                  linkedSaleId: createRes.saleId, linkedTreatmentId,
                  courseType: course.courseType || '',
                  daysBeforeExpire: course.daysBeforeExpire ?? null,
                  alreadyResolved,
                });
              } catch (e) { console.error('[TreatmentForm] course assign error:', e); sideEffectWarnings.push(`เพิ่มคอร์ส "${course.name}" ให้ลูกค้าไม่สำเร็จ — ลูกค้าจ่ายแล้วแต่ยังไม่ได้คอร์ส กรุณาเพิ่มให้`); }
            }
            for (const promo of grouped.promotions) {
              try {
                const pQty = Number(promo.qty) || 1;
                if (promo.courses?.length) {
                  for (const sub of promo.courses) {
                    // V42 (2026-05-07): route through buildPromotionSubCourseProducts
                    // so sub.qty (course-instance multiplier) is applied. Pre-V42
                    // this site only multiplied by pQty, dropping sub.qty.
                    const subProds = buildPromotionSubCourseProducts(sub, pQty, { fallbackName: sub.name || promo.name });
                    await assignCourseToCustomer(customerId, { name: sub.name || promo.name, products: subProds, source: 'treatment', parentName: `โปรโมชัน: ${promo.name}`, linkedSaleId: createRes.saleId, linkedTreatmentId });
                  }
                } else {
                  const prods = promo.products?.length
                    ? promo.products.map(p => ({ ...p, qty: (Number(p.qty) || 1) * pQty }))
                    : [{ name: promo.name, qty: pQty, unit: 'โปรโมชัน' }];
                  await assignCourseToCustomer(customerId, { name: promo.name, products: prods, price: promo.unitPrice, source: 'treatment', parentName: `โปรโมชัน: ${promo.name}`, linkedSaleId: createRes.saleId, linkedTreatmentId });
                }
              } catch (e) { console.error('[TreatmentForm] promo assign error:', e); sideEffectWarnings.push(`เพิ่มโปรโมชัน "${promo.name}" ให้ลูกค้าไม่สำเร็จ — ลูกค้าจ่ายแล้วแต่ยังไม่ได้ กรุณาเพิ่มให้`); }
            }
          } catch (e) { console.warn('[TreatmentForm] auto sale creation failed:', e); sideEffectWarnings.push('สร้างใบเสร็จอัตโนมัติไม่สำเร็จ — การรักษาบันทึกแล้วแต่ยังไม่มีใบเสร็จ กรุณาสร้างใบเสร็จเอง'); }
        }

        // Phase 7: On EDIT, if a linked sale exists, reverse & reapply deposits + wallet + points
        // V26.0 Phase 26.0b — doctor-save gate: skip the edit-mode sale sync chain.
        // Per spec § 5.1.F doctor-save button is hidden in edit mode, so this gate
        // is a defensive backstop — if a future code path invokes handleSubmit('doctor')
        // in edit mode (e.g. via API), this prevents accidentally touching the linked
        // sale's deposits/wallet/points/stock.
        // V136 (2026-05-31) — KEY guard for retro course-usage edit. saveMode==
        // 'course' MUST skip this path: a consumables-only treatment has
        // hasSale=true, and this block CREATES a new sale on the !linkedSale
        // transition + runs the full deposit/wallet/points reverse-reapply
        // saga. A course-usage backfill must touch ZERO money/INV (Q3=B).
        if (saveMode !== 'doctor' && saveMode !== 'vitals' && saveMode !== 'course' && hasSale && isEdit) {
          try {
            const {
              getSaleByTreatmentId, updateBackendSale,
              applyDepositToSale, reverseDepositUsage,
              deductWallet, refundToWallet,
              earnPoints, reversePointsEarned,
              reverseStockForSale, deductStockForSale,
            } = await import('../lib/scopedDataLayer.js');
            const linkedSale = await getSaleByTreatmentId(result.treatmentId || treatmentId || '');
            // TF4: hasSale false→true transition on edit. The treatment was
            // saved without purchased items on a previous visit; user edited
            // and added items/meds this time. No linked sale exists yet, so
            // the reverse-and-reapply branch below would skip — but we still
            // need to CREATE a sale now. Mirror the create-path saga.
            if (!linkedSale) {
              try {
                const { createBackendSale, assignCourseToCustomer, applyDepositToSale, deductWallet, earnPoints, deductStockForSale, deleteBackendSale, setTreatmentLinkedSaleId } = await import('../lib/scopedDataLayer.js');
                const newGrouped = { promotions: [], courses: [], products: [], medications: medications.filter(m => m.name) };
                purchasedItems.forEach(p => {
                  const t = p.itemType || 'product';
                  if (t === 'promotion') newGrouped.promotions.push(p);
                  else if (t === 'course') newGrouped.courses.push(p);
                  else newGrouped.products.push(p);
                });
                const pmStatusMap = { '2': 'paid', '4': 'split', '0': 'unpaid' };
                const depositIdsPayload = selectedDeposits
                  .filter(d => d.depositId && (Number(d.amount) || 0) > 0)
                  .map(d => ({ depositId: d.depositId, amount: Number(d.amount) || 0 }));
                const walletAppliedValue = Number(billing.walDed) || 0;
                const walletTypeIdPayload = selectedWallet?.walletTypeId && walletAppliedValue > 0 ? String(selectedWallet.walletTypeId) : '';
                const walletTypeNamePayload = walletTypeIdPayload ? (selectedWallet?.walletTypeName || '') : '';
                const firstSeller = pmSellers.find(s => s.enabled && s.id);
                // V105 — canonical customer-name resolution. Mirror of
                // create-mode block above. See AV93 + V105 V-entry.
                const _v105EditResolvedName = resolveCustomerDisplayName(
                  { patientData },
                  { includePrefix: true }
                ) || patientName || '';
                const _v105EditResolvedHN = resolveCustomerHN({ patientData })
                  || customerHNProp
                  || '';
                const createRes = await createBackendSale(clean({
                  customerId, customerName: _v105EditResolvedName,
                  customerHN: _v105EditResolvedHN,
                  saleDate: treatmentDate, saleNote: '',
                  items: newGrouped,
                  billing: {
                    subtotal: billing.subtotal, billDiscount: billing.billDiscAmt,
                    membershipDiscount: billing.membershipDisc,
                    membershipDiscountPercent: billing.memPct,
                    depositApplied: billing.depDed, depositIds: depositIdsPayload,
                    walletApplied: walletAppliedValue,
                    walletTypeId: walletTypeIdPayload, walletTypeName: walletTypeNamePayload,
                    netTotal: billing.netTotal,
                  },
                  membershipId: backendActiveMembership?.membershipId || null,
                  payment: { status: pmStatusMap[paymentStatus] || 'paid', channels: pmChannels.filter(c => c.enabled), date: paymentDate, time: paymentTime, refNo },
                  sellers: pmSellers.filter(s => s.enabled).map(s => ({ id: s.id, percent: s.percent, total: s.total })),
                  source: 'treatment',
                  linkedTreatmentId: result.treatmentId || treatmentId || '',
                }));
                // Back-link treatment → sale for DF aggregator (see same
                // fix in the create-path above).
                try {
                  const tid = result.treatmentId || treatmentId || '';
                  if (tid) await setTreatmentLinkedSaleId(tid, createRes.saleId);
                } catch (e) { console.warn('[TreatmentForm] setTreatmentLinkedSaleId (edit→sale) failed:', e); }
                try {
                  await deductStockForSale(createRes.saleId, newGrouped, {
                    customerId, branchId: SELECTED_BRANCH_ID,
                    user: { userId: firstSeller?.id || '', userName: firstSeller?.name || '' },
                  });
                } catch (stockErr) {
                  try { await deleteBackendSale(createRes.saleId); } catch {}
                  throw new Error(`ตัดสต็อก auto-sale (edit→sale) ไม่สำเร็จ: ${stockErr.message}`);
                }
                for (const d of depositIdsPayload) {
                  try { await applyDepositToSale(d.depositId, createRes.saleId, d.amount); }
                  catch (e) { console.warn('[TreatmentForm] apply deposit (edit→sale) failed:', e); sideEffectWarnings.push(`หักมัดจำ ${d.amount}฿ ไม่สำเร็จ — ใบเสร็จบันทึกว่าใช้มัดจำแล้วแต่ระบบยังไม่หัก กรุณาตรวจสอบ`); }
                }
                if (walletTypeIdPayload && walletAppliedValue > 0) {
                  try {
                    await deductWallet(customerId, walletTypeIdPayload, {
                      amount: walletAppliedValue, walletTypeName: walletTypeNamePayload,
                      note: `หัก wallet จากใบเสร็จ ${createRes.saleId}`,
                      referenceType: 'sale', referenceId: createRes.saleId,
                      staffId: firstSeller?.id || '', staffName: firstSeller?.name || '',
                    });
                  } catch (e) { console.warn('[TreatmentForm] wallet deduct (edit→sale) failed:', e); sideEffectWarnings.push(`หัก wallet ${walletAppliedValue}฿ ไม่สำเร็จ — ใบเสร็จบันทึกว่าใช้ wallet แล้วแต่ระบบยังไม่หัก กรุณาตรวจสอบ`); }
                }
                const bpp2 = Number(backendActiveMembership?.bahtPerPoint) || 0;
                if (bpp2 > 0 && billing.netTotal > 0) {
                  try {
                    await earnPoints(customerId, {
                      purchaseAmount: billing.netTotal, bahtPerPoint: bpp2,
                      referenceType: 'sale', referenceId: createRes.saleId,
                      note: `สะสมจาก treatment edit→sale ${result.treatmentId || treatmentId}`,
                      staffId: firstSeller?.id || '', staffName: firstSeller?.name || '',
                    });
                  } catch (e) {
                    console.error('[TreatmentForm] earnPoints (edit→sale) failed', {
                      customerId, saleId: createRes.saleId, error: e?.message,
                    });
                  }
                }
                const linkedTreatmentId2 = result.treatmentId || treatmentId || '';
                for (const course of newGrouped.courses) {
                  try {
                    const { products: prods, alreadyResolved } = resolvePurchasedCourseForAssign(
                      course, options?.customerCourses, course.qty
                    );
                    await assignCourseToCustomer(customerId, {
                      name: course.name, products: prods, price: course.unitPrice,
                      source: 'treatment', parentName: `คอร์ส: ${course.name}`,
                      linkedSaleId: createRes.saleId, linkedTreatmentId: linkedTreatmentId2,
                      courseType: course.courseType || '',
                      daysBeforeExpire: course.daysBeforeExpire ?? null,
                      alreadyResolved,
                    });
                  } catch (e) { console.error('[TreatmentForm] course assign (edit→sale) error:', e); sideEffectWarnings.push(`เพิ่มคอร์ส "${course.name}" ให้ลูกค้าไม่สำเร็จ — ลูกค้าจ่ายแล้วแต่ยังไม่ได้คอร์ส กรุณาเพิ่มให้`); }
                }
                // Mirror create-path: also assign purchased promotions (bundled sub-courses or plain promo).
                for (const promo of newGrouped.promotions) {
                  try {
                    const pQty = Number(promo.qty) || 1;
                    if (promo.courses?.length) {
                      for (const sub of promo.courses) {
                        // V42 (2026-05-07): see auto-sale-create site above.
                        const subProds = buildPromotionSubCourseProducts(sub, pQty, { fallbackName: sub.name || promo.name });
                        await assignCourseToCustomer(customerId, { name: sub.name || promo.name, products: subProds, source: 'treatment', parentName: `โปรโมชัน: ${promo.name}`, linkedSaleId: createRes.saleId, linkedTreatmentId: linkedTreatmentId2 });
                      }
                    } else {
                      const prods = promo.products?.length
                        ? promo.products.map(p => ({ ...p, qty: (Number(p.qty) || 1) * pQty }))
                        : [{ name: promo.name, qty: pQty, unit: 'โปรโมชัน' }];
                      await assignCourseToCustomer(customerId, { name: promo.name, products: prods, price: promo.unitPrice, source: 'treatment', parentName: `โปรโมชัน: ${promo.name}`, linkedSaleId: createRes.saleId, linkedTreatmentId: linkedTreatmentId2 });
                    }
                  } catch (e) { console.error('[TreatmentForm] promo assign (edit→sale) error:', e); }
                }
              } catch (e) { console.warn('[TreatmentForm] edit→sale creation failed:', e); }
            } else if (linkedSale.status !== 'cancelled') {
              const saleId = linkedSale.saleId || linkedSale.id;
              // 1. Reverse existing deposits
              const oldDeps = Array.isArray(linkedSale.billing?.depositIds) ? linkedSale.billing.depositIds : [];
              for (const od of oldDeps) {
                try { await reverseDepositUsage(od.depositId, saleId); }
                catch (e) { console.warn('[TreatmentForm] reverse old deposit failed:', e); sideEffectWarnings.push('คืนมัดจำเดิม (แก้ไขใบเสร็จ) ไม่สำเร็จ — กรุณาตรวจสอบยอดมัดจำ'); }
              }
              // 2. Refund old wallet
              const oldWalletTypeId = linkedSale.billing?.walletTypeId || '';
              const oldWalletApplied = Number(linkedSale.billing?.walletApplied) || 0;
              if (oldWalletTypeId && oldWalletApplied > 0) {
                try {
                  await refundToWallet(customerId, oldWalletTypeId, {
                    amount: oldWalletApplied,
                    walletTypeName: linkedSale.billing?.walletTypeName || '',
                    note: `แก้ไข treatment — คืนยอด wallet เดิมบน ${saleId}`,
                    referenceType: 'sale', referenceId: saleId,
                  });
                } catch (e) { console.warn('[TreatmentForm] wallet refund (edit) failed:', e); sideEffectWarnings.push('คืนยอด wallet เดิม (แก้ไขใบเสร็จ) ไม่สำเร็จ — กรุณาตรวจสอบ'); }
              }
              // 3. Reverse old earned points
              try { await reversePointsEarned(customerId, saleId); }
              catch (e) { console.warn('[TreatmentForm] points reverse (edit) failed:', e); }

              // 3b. Scenario-J: reverse the linked sale's existing stock deductions
              //     so the ledger can be rebuilt from the new items below. Without
              //     this step, editing the treatment to remove meds/products left
              //     the sale's stock still deducted — "ghost" inventory loss.
              try { await reverseStockForSale(saleId); }
              catch (e) { console.warn('[TreatmentForm] reverse old stock (edit) failed:', e); }

              // 4. Build new billing + items payload + update sale
              const depositIdsPayload = selectedDeposits
                .filter(d => d.depositId && (Number(d.amount) || 0) > 0)
                .map(d => ({ depositId: d.depositId, amount: Number(d.amount) || 0 }));
              const walletAppliedValue = Number(billing.walDed) || 0;
              const walletTypeIdPayload = selectedWallet?.walletTypeId && walletAppliedValue > 0 ? String(selectedWallet.walletTypeId) : '';
              const walletTypeNamePayload = walletTypeIdPayload ? (selectedWallet?.walletTypeName || '') : '';
              const firstSeller = pmSellers.find(s => s.enabled && s.id);
              // Rebuild grouped items from current treatment state (mirrors create path).
              const editGrouped = { promotions: [], courses: [], products: [], medications: medications.filter(m => m.name) };
              purchasedItems.forEach(p => {
                const t = p.itemType || 'product';
                if (t === 'promotion') editGrouped.promotions.push(p);
                else if (t === 'course') editGrouped.courses.push(p);
                else editGrouped.products.push(p);
              });
              await updateBackendSale(saleId, {
                items: editGrouped,
                billing: {
                  ...(linkedSale.billing || {}),
                  subtotal: billing.subtotal,
                  billDiscount: billing.billDiscAmt,
                  membershipDiscount: billing.membershipDisc,
                  membershipDiscountPercent: billing.memPct,
                  depositApplied: billing.depDed,
                  depositIds: depositIdsPayload,
                  walletApplied: walletAppliedValue,
                  walletTypeId: walletTypeIdPayload,
                  walletTypeName: walletTypeNamePayload,
                  netTotal: billing.netTotal,
                },
                membershipId: backendActiveMembership?.membershipId || null,
              });
              // 4b. Re-deduct stock based on the new items. Hard error so we
              //     don't leave the sale in a half-reversed state silently.
              try {
                await deductStockForSale(saleId, editGrouped, {
                  customerId, branchId: SELECTED_BRANCH_ID,
                  user: { userId: firstSeller?.id || '', userName: firstSeller?.name || '' },
                });
              } catch (stockErr) {
                console.error('[TreatmentForm] rededuct stock (edit) failed — stock ledger now out of sync with sale', {
                  saleId, treatmentId, error: stockErr?.message,
                });
                throw new Error(`ตัดสต็อกใหม่ไม่สำเร็จ: ${stockErr.message}`);
              }
              // 5. Apply new deposits
              for (const d of depositIdsPayload) {
                try { await applyDepositToSale(d.depositId, saleId, d.amount); }
                catch (e) { console.warn('[TreatmentForm] apply deposit failed:', e); sideEffectWarnings.push(`หักมัดจำ ${d.amount}฿ (แก้ไขใบเสร็จ) ไม่สำเร็จ — กรุณาตรวจสอบ`); }
              }
              // 6. Deduct new wallet
              if (walletTypeIdPayload && walletAppliedValue > 0) {
                try {
                  await deductWallet(customerId, walletTypeIdPayload, {
                    amount: walletAppliedValue,
                    walletTypeName: walletTypeNamePayload,
                    note: `แก้ไข treatment — หัก wallet บน ${saleId}`,
                    referenceType: 'sale', referenceId: saleId,
                    staffId: firstSeller?.id || '', staffName: firstSeller?.name || '',
                  });
                } catch (e) { console.warn('[TreatmentForm] wallet deduct (edit) failed:', e); sideEffectWarnings.push(`หัก wallet ${walletAppliedValue}฿ (แก้ไขใบเสร็จ) ไม่สำเร็จ — กรุณาตรวจสอบ`); }
              }
              // 7. Earn new points
              const bpp = Number(backendActiveMembership?.bahtPerPoint) || 0;
              if (bpp > 0 && billing.netTotal > 0) {
                try {
                  await earnPoints(customerId, {
                    purchaseAmount: billing.netTotal,
                    bahtPerPoint: bpp,
                    referenceType: 'sale', referenceId: saleId,
                    note: `แก้ไข treatment — สะสมใหม่`,
                    staffId: firstSeller?.id || '', staffName: firstSeller?.name || '',
                  });
                } catch (e) {
                  // C13: edit flow — sale + treatment already updated; only
                  // points re-earn failed. Log enough context to reconcile.
                  console.error('[TreatmentForm] earnPoints (edit) failed (treatment updated, points NOT re-earned)', {
                    customerId, saleId, treatmentId,
                    purchaseAmount: billing.netTotal, bahtPerPoint: bpp,
                    error: e?.message,
                  });
                }
              }
            }
          } catch (e) { console.warn('[TreatmentForm] edit deposit/wallet/points sync failed:', e); }
        }

        // Deduct purchased courses that were USED in this treatment (after assign).
        // `preferNewest: true` — iterate last→first so the just-assigned course entries
        // (always pushed to the end by assignCourseToCustomer) get deducted, not any
        // older entries with the same name+product from prior treatments.
        // V26.0 Phase 26.0b — doctor-save gate: skip purchased-course deductions.
        // Doctor-save doesn't run the auto-sale chain that assigns these purchased
        // courses, so the deduct path is moot. Admin's later finalize save re-runs
        // BOTH the assignCourseToCustomer chain AND this purchased-deduction step.
        const freshPurchased = (backendDetail.courseItems || []).filter(ci => isPurchasedSessionRowId(ci.rowId));
        // V142 — symmetric re-deduct for PURCHASED courses (the primary bug
        // surface: in-session `purchased-…` rowIds never match the regenerated
        // deterministic `be-row-N` on edit-reload → Pass-1 miss → fresh list
        // empty while the reverse refunded). Carry forward oldPurchased that is
        // still selected so reverse + re-deduct net to the correct balance.
        const purchasedDeductions = isEdit
          ? buildReDeductListWithCarryForward(freshPurchased, oldPurchased, selectedCourseItems)
          : freshPurchased;
        if (saveMode !== 'doctor' && saveMode !== 'vitals' && purchasedDeductions.length > 0) {
          // V104 (2026-05-19 LATE+3 EOD+1) — RIP silent-swallow.
          // Pre-V104: `catch (e) { console.warn(...); }` hid ALL deductCourseItems
          // errors → user saw "บันทึกสำเร็จ" while customer.courses[] silently
          // failed to decrement (combined with V104 shadow bug, this masked
          // 100% of buy-this-visit course deductions).
          // Mirror of existingDeductions atomic-rollback at line ~2599: throw
          // a clear Thai error AND delete the just-created treatment doc so
          // admin can fix + retry without orphan.
          const { deductCourseItems } = await import('../lib/scopedDataLayer.js');
          // Phase 16.5-quater — same treatment-deduction audit emit
          // V36-quater (2026-04-29) — V12 multi-writer-sweep miss fix.
          // Pre-V36-quater used bare `treatmentId` prop (empty in
          // create-mode) → audit emit gate at backendClient.js:938
          // skipped → "ประวัติการใช้คอร์ส" tab empty for purchased-in-
          // session course usage. User report 2026-04-29: "ไม่เห็นขึ้น
          // เลยไอ้สั้ส เห็นคอร์สที่เพิ่งใช้ไหม". V36-bis already fixed
          // the existingDeductions sibling call site (line ~2156) but
          // missed THIS call site — exact V12 lesson repeat (every
          // grep-replace must enumerate ALL call sites of the target).
          // Customer + branch invariant per user directive
          // "อย่าให้พลาดอีก ในคนอื่นและสาขาอื่นด้วย" — deductCourseItems
          // is branch-agnostic (reads only customerDoc + opts), so this
          // fix works for any customer at any branch.
          const purchasedNewTid = result.treatmentId || treatmentId;
          const treatingDoctor = (options?.doctors || []).find(d => String(d.id) === String(doctorId));
          try {
            await deductCourseItems(customerId, purchasedDeductions, {
              preferNewest: true,
              treatmentId: purchasedNewTid,
              // 2026-06-09 — course-USE attribution = the OPD editor, not the
              // doctor (see existingDeductions site above).
              staffId: editorContext?.uid || doctorId || '',
              staffName: editorContext?.name || treatingDoctor?.name || '',
            });
          } catch (courseErr) {
            // V104 atomic-rollback contract: if purchased-course deduction
            // throws (shortfall / index drift / etc.), delete the just-
            // created treatment doc so admin retries cleanly. Edit-mode
            // preserves original doc — no rollback needed. Mirror of
            // existingDeductions handler at line ~2604.
            if (!isEdit && result?.treatmentId) {
              try {
                const { deleteBackendTreatment } = await import('../lib/scopedDataLayer.js');
                await deleteBackendTreatment(result.treatmentId);
              } catch (rbErr) {
                console.error('[TreatmentForm] V104 orphan-treatment rollback failed:', rbErr);
              }
            }
            throw new Error(`ตัดคอร์สที่ซื้อในการรักษาไม่สำเร็จ: ${courseErr.message}`);
          }
        }

        // V157 — surface any non-fatal side-effect failures to the admin. The
        // treatment/sale IS saved; this makes a silently-failed money/course
        // step visible so the admin can reconcile (no longer a silent leak).
        if (sideEffectWarnings.length) {
          try { window.alert('บันทึกสำเร็จ ✓\n\nแต่บางรายการทำไม่สำเร็จ กรุณาตรวจสอบ/ทำซ้ำ:\n• ' + sideEffectWarnings.join('\n• ')); } catch { /* alert unavailable (SSR/test) */ }
        }
        setSuccess(true);
        const savedId = result.treatmentId || treatmentId || '';
        // Clean up form state before closing
        setSelectedCourseItems(new Set());
        setExistingCourseItems([]);
        setTreatmentItems([]);
        setTimeout(() => { if (onSaved) onSaved(savedId); }, 1200);
        setSaving(false);
        return;
      }

      // V50 (2026-05-08) — PROCLINIC SAVE branch deleted. saveTarget='backend'
      // is the only path; backend save above already returned. Reaching here
      // means saveTarget was set to a non-existent mode — fail loud so admin
      // can investigate (rather than silently writing to ProClinic which is
      // gone).
      throw new Error('V50: saveTarget must be "backend" — ProClinic mode removed');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
      submitInFlightRef.current = false;  // appointment-loop R3 — release the re-entry guard
    }
  };

  // ── Loading / Success states ────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`fixed inset-0 z-[80] flex items-center justify-center ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: accent }} />
          <p className="text-xs text-gray-500">กำลังโหลดฟอร์มการรักษา...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={`fixed inset-0 z-[80] flex items-center justify-center ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check size={24} className="text-green-500" />
          </div>
          <p className="text-sm font-bold text-green-500">{isEdit ? 'บันทึกสำเร็จ' : 'สร้างการรักษาสำเร็จ'}</p>
        </div>
      </div>
    );
  }

  const doctors = options?.doctors || [];
  const assistants = options?.assistants || [];
  const allCustomerCourses = options?.customerCourses || [];
  // Filter out courses with 0 remaining (หมดแล้ว — ไม่ต้องแสดง)
  const customerCourses = allCustomerCourses.filter(c => {
    if (c.promotionId) return false;
    // Phase 12.2b follow-up (2026-04-24): pick-at-treatment placeholder
    // has `products: []` by design (awaiting user pick). `[].every()`
    // returns true (vacuous truth) → would drop the placeholder so
    // the "เลือกสินค้า" button never renders. Exempt placeholders.
    if (c.isPickAtTreatment && c.needsPickSelection) return true;
    // Phase 12.2b follow-up (2026-04-25): buffet courses are unlimited
    // use until date-expiry — "remaining" is conceptually irrelevant,
    // and the stored qty sentinel could parse to 0 after cold-load.
    // Always show buffet while it's in customer.courses.
    if (c.isBuffet || String(c.courseType || '').trim() === 'บุฟเฟต์') return true;
    // Check if ALL products in this course are 0 remaining
    const allZero = (c.products || []).every(p => parseFloat(p.remaining) <= 0);
    return !allZero;
  });
  const customerPromotions = options?.customerPromotions || [];

  const bloodTypeOptions = options?.bloodTypeOptions || [];
  const benefitTypes = options?.benefitTypes || [];
  const insuranceCompanies = options?.insuranceCompanies || [];
  const paymentChannels = options?.paymentChannels || [];
  const wallets = options?.wallets || [];
  const sellerOptions = options?.sellers || [];
  const medicationGroups = options?.medicationGroups || [];
  const consumableGroups = options?.consumableGroups || [];

  return (
    <div className={`fixed inset-0 z-[80] overflow-y-auto overscroll-contain ${isDark ? 'bg-[#0a0a0a] text-gray-200' : 'bg-gray-50 text-gray-800'}`}>
      <ModalScrollLock />
      {/* ── Header ──────────────────────────────────────────────────────────
          Phase 27.1-quater (2026-05-14, user iteration 3) — unified header
          per user directive: "เอา badge แสดงสาขาในหน้า TFP รวมถึง Tab ประวัติ
          และปุ่ม สลับข้างไปไว้บน Header". Title + customer name on left;
          branch chip + layout-swap button on right (when split-screen active).
          Replaces the prior standalone orange branch banner below the
          history tab strip — chip is more compact, integrated, and elegant. */}
      <div className={`sticky top-0 z-10 border-b backdrop-blur-sm ${isDark ? 'bg-[#0a0a0a]/95 border-[#222]' : 'bg-white/95 border-gray-200'}`}>
        {/* Phase 27.1-sexies (2026-05-14) — 3-zone flex layout: LEFT (back +
            title) takes flex-1, CENTER (history tabs) is naturally centered,
            RIGHT (branch chip + swap) takes flex-1 justify-end. User: "เอา
            ประวัติไว้ตรงกลางของ row เลย". */}
        <div className="max-w-[2000px] mx-auto px-4 py-3 flex items-center gap-3">
          {/* LEFT ZONE — flex-1 so center can be true-centered between left + right */}
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <button onClick={onClose} aria-label="ปิด" className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${isDark ? 'hover:bg-[#1a1a1a]' : 'hover:bg-gray-100'}`}>
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0 max-w-[200px] lg:max-w-[260px]">
              <h2 className="text-base font-bold flex items-center gap-2 truncate" style={{ color: accent }}>
                {isEdit ? <Edit3 size={18} /> : <Stethoscope size={18} />}
                <span className="truncate">{isEdit ? 'แก้ไขการรักษา' : 'สร้างการรักษาใหม่'}</span>
              </h2>
              {patientName && (
                <p className="text-xs text-gray-500 truncate">
                  {/* Task 9 LR-4 (2026-05-15) — surface 🟢/⚪️ LINE chip next to
                      patient name in the TFP header.
                      Task 9 polish M5 (2026-05-15) — INTENT NOTE:
                      The LINE-status fields (lineUserId / lineDisplayName /
                      lineUserId_byBranch) live on the ROOT be_customers doc,
                      NOT on `patientData`. The reads below intentionally pull
                      them with `patientData?.X` so that:
                        (a) if a future caller denormalizes them onto patientData,
                            the chip renders correctly;
                        (b) otherwise the chip stays inert (no badge) — TFP is
                            a per-treatment editor, not an appointment-creating
                            picker, so chip absence is acceptable here.
                      Acquiring the full customer doc just for this header chip
                      would require an extra fetch + state in TFP; deferred until
                      LR-5 (push-reminder dispatch) needs the same info. */}
                  <CustomerOption
                    customer={{
                      // VIP (2026-07-04) — thread the customer id so the header
                      // name goes gold + 👑 for VIP customers (CustomerOption
                      // keys the VipProvider set by customer.id).
                      id: customerId,
                      name: patientName,
                      branchId: patientData?.branchId,
                      lineUserId: patientData?.lineUserId,
                      lineDisplayName: patientData?.lineDisplayName,
                      lineUserId_byBranch: patientData?.lineUserId_byBranch,
                    }}
                    contextBranchId={selectedBranchId}
                  />
                </p>
              )}
            </div>
          </div>

          {/* CENTER ZONE — history tab strip (truly centered between left + right) */}
          {historyTreatments && historyTreatments.length > 0 && (
            <div className="hidden md:flex flex-shrink min-w-0 overflow-x-auto" data-testid="tfp-history-tab-strip">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-muted)] flex-shrink-0">
                  ประวัติ:
                </span>
                {historyTreatments.map((t, i) => {
                  const tid = t.treatmentId || t.id;
                  const active = selectedHistoryTreatmentId === tid;
                  const cc = t.detail?.symptoms || '';
                  return (
                    <button
                      key={tid}
                      onClick={() => handleHistoryTabClick(tid)}
                      data-testid={`tfp-history-tab-${tid}`}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 flex-shrink-0 ${
                        active
                          ? 'bg-purple-700 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                          : 'text-[var(--tx-muted)] hover:text-purple-400 hover:bg-[var(--bg-hover)] border border-[var(--bd)]'
                      }`}
                    >
                      <Calendar size={11} />
                      <span>{formatThaiDateShort(t.detail?.treatmentDate || t.date || '')}</span>
                      {i === 0 && <span className="text-[9px] opacity-70">· ล่าสุด</span>}
                      {cc && (
                        <span className="text-[10px] opacity-60 max-w-[80px] truncate">
                          · {cc}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* RIGHT ZONE — branch chip + swap button (flex-1 + justify-end for true-center balance) */}
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
            {currentBranch && (
              <div
                data-testid="tfp-branch-indicator"
                data-branch-id={SELECTED_BRANCH_ID || ''}
                className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${
                  isDark
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                    : 'bg-orange-50 border-orange-200 text-orange-700'
                }`}
                title={`สาขา: ${currentBranch.name || ''}${currentBranch.nameEn ? ' (' + currentBranch.nameEn + ')' : ''} · ${SELECTED_BRANCH_ID || ''}`}
              >
                <span className="opacity-60 font-semibold">สาขา</span>
                <span>{currentBranch.name || '(ไม่มีชื่อ)'}</span>
                {currentBranch.nameEn && (
                  <span className="opacity-50 text-[10px] font-medium">{currentBranch.nameEn}</span>
                )}
              </div>
            )}
            {selectedHistoryTreatmentId && (
              <LayoutSwapButton
                onSwap={swapTfpLayout}
                position={tfpLayout}
                visible={true}
                isDark={isDark}
              />
            )}
          </div>

          {/* V26.1 (2026-05-13) — top-right "ยืนยันการรักษา" button REMOVED.
              User report: button no longer functional. Bottom save button at
              line ~4816+ is the canonical save path. Doctor-save button
              (Phase 26.0d) under OPD Card unchanged. */}
        </div>
      </div>

      {/* Phase 27.1-quinquies (2026-05-14) — separate sticky history tab strip
          REMOVED. Now inlined into the title bar above. */}

      {/* ── Phase 26.0d (V26.0, 2026-05-13) — edit-mode banner ──────────────
          Amber banner shown when admin opens a treatment that was originally
          saved via "บันทึกสำหรับแพทย์" (status === 'doctor-recorded').
          Instructs admin to add the missing pieces (courses / products /
          DF / bill). `canAddNewItems` flag unlocks the 6 UI add-op sites. */}
      {loadedTreatmentStatus === 'doctor-recorded' && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div
            data-testid="tfp-doctor-recorded-banner"
            className={`px-4 py-3 rounded-lg border text-sm flex items-center gap-2 ${isDark ? 'bg-amber-950 border-amber-800 text-amber-100' : 'bg-amber-50 border-amber-200 text-amber-900'}`}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>การรักษานี้บันทึกโดยแพทย์</strong> —
              กรุณาเติมข้อมูลคอร์ส / สินค้า / ค่ามือ / ใบเสร็จให้ครบ แล้วกดบันทึก
            </span>
          </div>
        </div>
      )}

      {/* Phase 27.1-quater (2026-05-14) — standalone branch indicator REMOVED.
          Replaced by compact chip in the unified sticky header above. */}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 pt-3" data-error-banner>
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500 font-bold whitespace-pre-wrap">{error}</div>
        </div>
      )}

      {/* ── Two-Column Layout ─────────────────────────────────────────────── */}
      {/* Phase 27.1 (2026-05-14) — Layout swap: relative + conditional lg:flex-row-reverse */}
      <div className={selectedHistoryTreatmentId
        ? `max-w-[2000px] lg:flex lg:gap-4 mx-auto px-4 py-4 ${isFormLeft ? '' : 'lg:flex-row-reverse'}`
        : 'max-w-6xl mx-auto px-4 py-4'
      }>
        {/* Phase 27.1-quater (2026-05-14) — LayoutSwapButton MOVED to unified
            sticky header. Was here as floating absolute-sticky between panels;
            now it sits next to the branch chip in the header for a cohesive,
            world-class top-bar UX. */}
        {/* Phase 26.2 Task 5 — LEFT panel wrapper for conditional split-screen */}
        <div className={selectedHistoryTreatmentId ? 'lg:w-1/2 lg:min-w-0' : ''}>
        <div className={selectedHistoryTreatmentId ? 'grid grid-cols-1 xl:grid-cols-2 gap-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-4'}>

          {/* ════ LEFT PANEL ════ */}
          {/* 2026-05-27 — flex-col (was space-y-4) so the teal vitals-save button can
              mt-auto bottom-pin and row-align with the purple doctor-save button.
              gap-4 keeps the same 16px inter-section spacing space-y-4 gave; the only
              behavioural delta is the button bottom-pin. Cosmetic — no logic touched.
              Root cause (real-browser measured): block left column vs flex right column
              handled the trailing mb-3 differently → ~12px button offset. */}
          <div className="flex flex-col gap-4">
            {/* Doctor / Assistants / Date */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Stethoscope} title="ข้อมูลการรักษา" isDark={isDark} accent={accent} />
              <div className="space-y-3">
                <div data-field="doctor">
                  <label className={labelCls} htmlFor="tfp-doctor-select">แพทย์ *</label>
                  <select
                    id="tfp-doctor-select"
                    value={doctorId}
                    onChange={e => { setDoctorId(e.target.value); clearFieldError('doctor'); }}
                    className={selectCls}
                    aria-label="เลือกแพทย์"
                    {...ariaErrProps('doctor')}
                  >
                    <option value="">เลือกแพทย์</option>
                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <FieldError field="doctor" />
                </div>
                <div>
                  <label className={labelCls}>ผู้ช่วยแพทย์ (สูงสุด 5 คน)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {assistants.map(a => {
                      const sel = assistantIds.includes(a.id);
                      return (
                        <button key={a.id} onClick={() => toggleAssistant(a.id)}
                          className={`text-xs px-2 py-1 rounded-lg border transition-all ${sel
                            ? 'bg-purple-600/20 border-purple-500/50 text-purple-400 font-bold'
                            : isDark ? 'border-[#333] text-gray-500 hover:border-[#555]' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                          }`}>
                          {a.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div data-field="treatmentDate" {...ariaErrProps('treatmentDate')}>
                  <label className={labelCls}>วันที่รักษา *</label>
                  <DateField
                    value={treatmentDate}
                    onChange={(v) => { setTreatmentDate(v); clearFieldError('treatmentDate'); }}
                    locale="be"
                    fieldClassName={inputCls}
                  />
                  <FieldError field="treatmentDate" />
                </div>
              </div>
            </FormSection>

            {/* Phase 26.2f-pre (V26.2f, 2026-05-13) — หมายเหตุทั่วไป moved from RIGHT column
                to LEFT column (between ข้อมูลการรักษา and ข้อมูลสุขภาพลูกค้า) per user spec. */}
            {(edStrippedNote || edLatest2.length > 0) && (
              <div
                data-testid="tfp-customer-note"
                className="mb-3 bg-amber-950/10 border border-amber-900/40 rounded-xl overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-amber-900/40 flex items-center gap-2">
                  <ClipboardCheck size={14} className="text-amber-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    หมายเหตุทั่วไป
                  </h3>
                </div>
                <div className="p-3">
                  {/* ED Score (2026-06-15) — baked ED screening stripped; clean latest-2 shown below */}
                  {edStrippedNote && (
                    <pre className="text-xs text-[var(--tx-secondary)] whitespace-pre-wrap font-sans leading-relaxed" data-testid="tfp-customer-note-text">
                      {edStrippedNote}
                    </pre>
                  )}
                  {edLatest2.length > 0 && (
                    <div className={edStrippedNote ? 'mt-3 pt-3 border-t border-amber-900/30' : ''} data-testid="tfp-ed-latest2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-orange-400 mb-1.5">ED Score · 2 ครั้งล่าสุด</div>
                      <div className="flex flex-col gap-1">
                        {edLatest2.map((r) => {
                          // R4 — readable date (dd/mm/yyyy พ.ศ.) + "วันนี้" badge when assessed today.
                          // Block body (NOT IIFE-in-JSX — Vite OXC crashes on that).
                          const fd = formatRoundDate(r.assessmentDate, thaiTodayISO());
                          return (
                          <div key={r.id} className="flex items-center justify-between gap-2 text-[11px] bg-black/10 rounded px-2 py-1">
                            <span className="text-[var(--tx-muted)] shrink-0 whitespace-nowrap">
                              ครั้งที่ {r.round}
                              {fd.text ? <> · <span className="text-[var(--tx-secondary)]">{fd.text}</span></> : ''}
                              {fd.isToday && <span className="ml-1 inline-block align-middle bg-orange-500/15 border border-orange-500/40 text-orange-300 rounded-full px-1.5 text-[9px] font-bold" data-testid="ed-today-badge">วันนี้</span>}
                            </span>
                            <span className="text-[var(--tx-secondary)] text-right">
                              {r.types.map((t) => {
                                const s = scoreForType(t, r.raw);
                                if (!s) return null;
                                return s.boolean ? `${ED_TYPE_META[t].label} ${s.present ? 'มีอาการ' : '-'}` : `${ED_TYPE_META[t].label} ${s.value}/${s.max}`;
                              }).filter(Boolean).join(' · ')}
                            </span>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Health Info */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Heart} title="ข้อมูลสุขภาพลูกค้า" isDark={isDark} accent="#ef4444" />
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>กรุ๊ปเลือด</label>
                  {bloodTypeOptions.length > 0
                    ? <select value={bloodType} onChange={e => setBloodType(e.target.value)} className={selectCls}>
                        <option value="">-</option>
                        {bloodTypeOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    : <input value={bloodType} onChange={e => setBloodType(e.target.value)} className={inputCls} placeholder="กรุ๊ปเลือด" />
                  }
                </div>
                {[
                  ['congenitalDisease', 'โรคประจำตัว', congenitalDisease, setCongenitalDisease],
                  ['drugAllergy', 'ประวัติแพ้ยา', drugAllergy, setDrugAllergy],
                  ['treatmentHistory', 'ประวัติการรักษาอื่นๆ', treatmentHistory, setTreatmentHistory],
                ].map(([key, label, val, setter]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <LocalTextarea value={val} onCommit={setter} rows={4} className={`${inputCls} resize-none`} placeholder={label} />
                  </div>
                ))}
              </div>
            </FormSection>

            {/* Vital Signs */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Thermometer} title="ข้อมูลซักประวัติ (Vital Signs)" isDark={isDark} accent="#f59e0b" />
              <VitalsGrid vitals={vitals} onFieldChange={setVitalField} bmi={bmi} inputCls={inputCls} labelCls={labelCls} />
            </FormSection>

            {/* Phase 26.2f-followup (V26.2f, 2026-05-13) — vitals-save button in LEFT
                column immediately after Vital Signs section. Moved from RIGHT column so
                the button lives next to the data it saves. Subtitle <p> dropped per
                user direction. */}
            {/* Phase 27.2-bis (2026-05-14) — vitals button always visible per user
                directive: "ทำให้ปุ่มข้อมูลซักประวัติสามารถแก้ไขได้เรื่อยๆ เหมือนปุ่ม
                ลงบันทึกแพทย์ แต่ time stamp ก็จะอัพเดทตามการแก้ไขล่าสุด เหมือนกัน
                ทุกปุ่มบันทึก". Was gated on !isEdit; now always shown so staff
                can re-edit vitals at any time. Each click updates vitalsignsRecordedAt. */}
            {/* mt-auto bottom-pins this teal button to the grid-stretched left-column
                bottom so it row-aligns with the purple doctor-save button (the right
                column already flex-bottom-pins via the OPD-card flex-1). Mirrors the
                right column; replaces the old block-column stray-mb-3 offset. */}
            <div className="mb-3 mt-auto">
              <button
                type="button"
                onClick={() => handleSubmit('vitals')}
                data-testid="tfp-vitals-save-btn"
                disabled={saving}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all bg-[#2EC4B6] hover:bg-[#26a89c] active:bg-[#1f8f86] shadow-[0_0_18px_rgba(46,196,182,0.25)] disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Activity size={16} />
                บันทึกข้อมูลซักประวัติ
              </button>
            </div>

          </div>

          {/* ════ RIGHT PANEL — OPD Card ════ */}
          {/* 2026-05-25 — flex-col so the OPD Card fills the grid-stretched column
              height + the CC field grows → the purple "บันทึกสำหรับแพทย์" button
              bottom-aligns with the teal "บันทึกข้อมูลซักประวัติ" button. Cosmetic. */}
          <div className="flex flex-col gap-4">
            <FormSection isDark={isDark} className="flex-1 flex flex-col">
              <SectionHeader icon={ClipboardList} title="OPD Card" isDark={isDark} accent={accent}>
                {prevTreatment && (
                  <span className={`text-[11px] font-bold ${isDark ? 'text-orange-500/60' : 'text-orange-600/60'}`}>
                    มีข้อมูลครั้งก่อน {prevTreatment.treatmentDate ? `(${prevTreatment.treatmentDate})` : ''}
                  </span>
                )}
                {/* OPD note templates (2026-07-05, Q1=A) — pill in the header row
                    (ml-auto inside the component) so the right column gains NO
                    height → เขียว/ม่วง save buttons stay bottom-aligned. */}
                <OpdNoteTemplateMenu isDark={isDark} onInsert={handleInsertCcTemplate} />
              </SectionHeader>
              <div className="flex flex-col gap-3 flex-1 min-h-0">
                {[
                  ['symptoms', 'CC — อาการ (Chief Complaint)', 3],
                  ['physicalExam', 'PE — ตรวจร่างกาย (Physical Exam)', 3],
                  ['diagnosis', 'DX — วินิจฉัยโรค (Diagnosis)', 6],
                  ['treatmentInfo', 'Tx — รักษา / Dr. Note', 6],
                  ['treatmentPlan', 'Plan — แผนการรักษา', 4],
                  ['treatmentNote', 'Note — หมายเหตุการรักษา', 2],
                  ['additionalNote', 'หมายเหตุเพิ่มเติม', 2],
                ].map(([key, label, rows]) => (
                  // field+onFieldChange (vs inline onChange) lets React.memo
                  // reject re-renders for the other 6 siblings on keystroke.
                  <OPDFieldWithPrev key={key} field={key} label={label} rows={rows}
                    value={opd[key]} onFieldChange={setOpdField}
                    prevValue={prevTreatment?.[key] || ''} isDark={isDark} inputCls={inputCls} labelCls={labelCls}
                    grow={key === 'symptoms'} />
                ))}
              </div>
            </FormSection>

            {/* Consent & Med Cert — Phase 26.2f-followup2: moved from LEFT column to RIGHT
                column so it sits immediately above the doctor-save button. */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={ClipboardList} title="ใบรับรองแพทย์" isDark={isDark} accent="#06b6d4" />
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertActuallyCome} onChange={e => setMedCertActuallyCome(e.target.checked)} className="rounded border-gray-400" />
                  ผู้ป่วยมารักษาวันนี้จริง
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertIsRest} onChange={e => setMedCertIsRest(e.target.checked)} className="rounded border-gray-400" />
                  ให้หยุดพัก
                </label>
                {medCertIsRest && (
                  <div className="ml-6">
                    <label className={labelCls}>ระยะเวลาหยุดพัก</label>
                    <LocalInput value={medCertPeriod} onCommit={setMedCertPeriod} className={inputCls} placeholder="เช่น 3 วัน" />
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertIsOther} onChange={e => setMedCertIsOther(e.target.checked)} className="rounded border-gray-400" />
                  อื่นๆ
                </label>
                {medCertIsOther && (
                  <div className="ml-6">
                    <LocalTextarea value={medCertOtherDetail} onCommit={setMedCertOtherDetail} rows={2} className={`${inputCls} resize-none`} placeholder="รายละเอียด" />
                  </div>
                )}
              </div>
            </FormSection>

            {/* ════ Phase 26.0d (V26.0, 2026-05-13) — doctor-save button ════
                "บันทึกสำหรับแพทย์" — records OPD/vitals/charts/meds/DF only;
                skips course-items + consumables + purchasedItems + auto-sale.
                Phase 26.2f-pre: gate extended to allow edit mode when status is
                'vitalsigns-recorded' (transition from vitals to doctor stage).
                Otherwise stays create-only per Phase 26.0d. */}
            {/* Phase 26.2f-followup2 (V26.2f, 2026-05-13) — doctor-save button restyled to
                royal purple to visually distinguish it from the teal vitals-save button. */}
            {/* Phase 27.2-bis (2026-05-14) — doctor button always visible too
                (gate removed; can re-edit at any TFP open). Each click updates
                doctorRecordedAt. The previous gate `!isEdit ||
                loadedTreatmentStatus === 'vitalsigns-recorded'` hid the
                button after doctor-recorded → blocked re-edits. Now always shown. */}
            <div className="mb-3">
              <button
                type="button"
                onClick={() => handleSubmit('doctor')}
                disabled={saving}
                data-testid="tfp-doctor-save-btn"
                data-save-mode="doctor"
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all bg-[#7c3aed] hover:bg-[#6d28d9] active:bg-[#5b21b6] shadow-[0_0_18px_rgba(124,58,237,0.3)] disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Stethoscope className="w-4 h-4" />
                <span>บันทึกสำหรับแพทย์</span>
              </button>
            </div>
          </div>
        </div>

        {/* ════ FULL-WIDTH BOTTOM SECTIONS ════ */}
        <div className="space-y-4 mt-4">

          {/* ── Chart (บันทึกแผนผังการรักษา) ────────────────────────────────── */}
          <FormSection isDark={isDark}>
            <ChartSection charts={charts} onChartsChange={setCharts} isDark={isDark} accent="#14b8a6" db={db} appId={appId} patientLabel={patientName ? `คุณ ${patientName}${customerHNProp ? ` (HN ${customerHNProp})` : ''}` : (customerHNProp ? `HN ${customerHNProp}` : '')} customerId={customerId} onBlobRemoved={removeTreatmentBlob} />
          </FormSection>

          {/* ── Treatment Images (รูปภาพการรักษา) ────────────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Camera} title="รูปภาพการรักษา" isDark={isDark} accent="#f59e0b" />
            {[
              { label: 'รูปภาพก่อนรักษา (Before)', images: beforeImages, setImages: setBeforeImages },
              { label: 'รูปภาพหลังรักษา (After)', images: afterImages, setImages: setAfterImages },
              { label: 'รูปภาพการรักษาอื่นๆ', images: otherImages, setImages: setOtherImages },
            ].map(({ label, images, setImages }, gi) => (
              <div key={gi} className={gi > 0 ? 'mt-4 pt-3 border-t ' + (isDark ? 'border-[#222]' : 'border-gray-200') : ''}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label} <span className="text-gray-600 normal-case">({images.length}/12)</span></span>
                  {images.length < 12 && (
                    <label className={`text-xs font-bold cursor-pointer flex items-center gap-1 ${pendingUploads > 0 ? 'text-orange-300 opacity-70' : 'text-orange-500 hover:text-orange-400'}`}>
                      {pendingUploads > 0 ? <><Loader2 size={10} className="animate-spin" /> กำลังอัปโหลด…</> : <><Plus size={10} /> เพิ่มรูป</>}
                      {/* 2026-05-25 — resize → upload to Firebase Storage on add; state holds the
                          Storage URL (never inline base64) so the be_treatments doc stays tiny. */}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={async e => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = '';
                        const remain = 12 - images.length;
                        const toProcess = files.slice(0, Math.max(0, remain));
                        for (const file of toProcess) {
                          if (file.size > 10 * 1024 * 1024) { alert('รูปภาพขนาดไม่เกิน 10MB'); continue; }
                          setPendingUploads(n => n + 1);
                          try {
                            const entry = await processAndUploadTreatmentImage({ file, customerId, kind: 'photo' });
                            setImages(prev => prev.length < 12 ? [...prev, entry] : prev);
                          } catch (err) {
                            console.error('[TFP] treatment photo upload failed:', err);
                            alert('อัปโหลดรูปไม่สำเร็จ: ' + (err?.message || err));
                          } finally {
                            setPendingUploads(n => Math.max(0, n - 1));
                          }
                        }
                      }} />
                    </label>
                  )}
                </div>
                {images.length === 0 ? (
                  <div className={`text-center py-4 rounded-lg border border-dashed ${isDark ? 'border-[#333] text-gray-600' : 'border-gray-300 text-gray-400'}`}>
                    <ImageIcon size={20} className="mx-auto mb-1 opacity-40" />
                    <p className="text-xs">ไม่พบรูปภาพ</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {/* 2026-07-05 thumbs — grid renders the ~320px thumb (falls back
                        to full URL for legacy entries); zoom loads the full image. */}
                    {images.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-[#333] group">
                        <img src={img.thumbUrl || img.dataUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                        {/* 2026-05-27 (V123) — view-large button (mirror Chart's Maximize2).
                            bg-white/90 + dark icon: theme-stable. `text-white` is remapped
                            dark by index.css:404 in light theme UNLESS on a colored bg
                            (the exception list excludes bg-black) → a white icon on bg-black
                            renders BLACK/invisible in light theme. White button = visible in both. */}
                        <button type="button" onClick={() => setImageLightboxSrc(img.dataUrl)}
                          aria-label={`ดูรูปใหญ่ที่ ${idx + 1}`} title="ดูรูปใหญ่"
                          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white/90 text-gray-700 shadow hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 size={10} />
                        </button>
                        <button onClick={() => {
                            removeTreatmentBlob(img?.storagePath, img?.thumbStoragePath);
                            setImages(prev => prev.filter((_, i) => i !== idx));
                          }}
                          aria-label={`ลบรูปที่ ${idx + 1}`}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 text-red-500 shadow hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* 2026-05-27 (V123) — shared portaled lightbox for treatment + lab
                image "ดูรูปใหญ่" buttons (mirror the Chart fullscreen view). */}
            <ImageLightbox src={imageLightboxSrc} label="รูปภาพการรักษา" onClose={() => setImageLightboxSrc('')} />
          </FormSection>

          {/* ── Lab Items ────────────────────────────────────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={FlaskConical} title="Lab" isDark={isDark} accent="#06b6d4">
              <ActionBtn color="#06b6d4" isDark={isDark} onClick={async () => {
                setLabModalOpen(true); setLabModalSelected(null); setLabModalQty('1'); setLabModalPrice(''); setLabModalDiscount(''); setLabModalDiscountType('amount'); setLabModalVat(false); setEditingLabIndex(-1);
                if (labProducts.length === 0) {
                  setLabModalLoading(true);
                  try {
                    // V50 (2026-05-08) — backend-only. Lab products from be_products.
                    const { listProducts } = await import('../lib/scopedDataLayer.js');
                    const all = await listProducts();
                    setLabProducts(all.filter(p => (p.productType || p.type) === 'บริการ' && ((p.categoryName || p.category) || '').toLowerCase().includes('lab')).map(p => ({
                      id: p.id,
                      name: p.productName || p.name || '',
                      price: p.price,
                      unit: p.mainUnitName || p.unit || '',
                    })));
                  } catch (e) { console.error('[TreatmentForm] lab search error:', e); }
                  setLabModalLoading(false);
                }
              }}>
                <Plus size={10} /> เพิ่ม Lab
              </ActionBtn>
            </SectionHeader>
            {labItems.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-3">ยังไม่มี Lab — กด "เพิ่ม Lab" เพื่อเพิ่ม</p>
            ) : (
              <div className="space-y-3">
                {labItems.map((lab, li) => (
                  <div key={li} className={`p-3 rounded-lg border ${isDark ? 'bg-[#111] border-[#333]' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold flex-1 truncate">{lab.productName}</span>
                      <span className="text-xs text-gray-400">{lab.qty} {lab.unitName || ''} @ {lab.price}</span>
                      <button onClick={() => {
                        setEditingLabIndex(li);
                        setLabModalSelected({ id: lab.productId, name: lab.productName, unit: lab.unitName, price: lab.originalPrice || lab.price });
                        setLabModalQty(String(lab.qty)); setLabModalPrice(String(lab.originalPrice || lab.price));
                        setLabModalDiscount(String(lab.discount || '')); setLabModalDiscountType(lab.discountType === '%' ? 'percent' : 'amount');
                        setLabModalVat(!!lab.isVatIncluded); setLabModalOpen(true);
                        if (labProducts.length === 0) {
                          // V50 (2026-05-08) — backend-only. Lab products from be_products.
                          import('../lib/scopedDataLayer.js').then(({ listProducts }) => listProducts().then(all => setLabProducts(all.filter(p => (p.productType || p.type) === 'บริการ' && ((p.categoryName || p.category)||'').toLowerCase().includes('lab')).map(p => ({
                            id: p.id,
                            name: p.productName || p.name || '',
                            price: p.price,
                            unit: p.mainUnitName || p.unit || '',
                          })))));
                        }
                      }} className="text-cyan-500 hover:text-cyan-400" aria-label={`แก้ไข Lab ${lab.productName || ''}`}><Edit3 size={12} /></button>
                      <button onClick={() => setLabItems(prev => prev.filter((_, i) => i !== li))} className="text-red-500 hover:text-red-400" aria-label={`ลบ Lab ${lab.productName || ''}`}><Trash2 size={12} /></button>
                    </div>
                    <textarea value={lab.information || ''} onChange={e => setLabItems(prev => prev.map((l, i) => i === li ? { ...l, information: e.target.value } : l))}
                      rows={2} className={`w-full text-[11px] rounded-lg px-2 py-1.5 resize-none outline-none border mb-2 ${isDark ? 'bg-[#0a0a0a] border-[#333] text-gray-300' : 'bg-white border-gray-200'}`} placeholder="รายละเอียด Lab" />
                    {/* Lab images (max 6) */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-gray-500 uppercase tracking-wider">รูปภาพ ({(lab.images||[]).length}/6)</span>
                      {(lab.images||[]).length < 6 && (
                        <label className={`text-[11px] cursor-pointer flex items-center gap-0.5 ${pendingUploads > 0 ? 'text-cyan-300 opacity-70' : 'text-cyan-500'}`}>
                          {pendingUploads > 0 ? <><Loader2 size={8} className="animate-spin" /> อัปโหลด…</> : <><Plus size={8} /> เพิ่มรูป</>}
                          {/* 2026-05-25 — Storage-ref (mirror treatment photos). */}
                          <input type="file" accept="image/*" multiple className="hidden" onChange={async e => {
                            const files = Array.from(e.target.files || []).slice(0, 6 - (lab.images||[]).length);
                            e.target.value = '';
                            for (const file of files) {
                              if (file.size > 10*1024*1024) { alert('รูปภาพขนาดไม่เกิน 10MB'); continue; }
                              setPendingUploads(n => n + 1);
                              try {
                                const entry = await processAndUploadTreatmentImage({ file, customerId, kind: 'labimg' });
                                setLabItems(prev => prev.map((l, i) => i === li ? { ...l, images: [...(l.images||[]).slice(0, 5), entry] } : l));
                              } catch (err) {
                                console.error('[TFP] lab image upload failed:', err);
                                alert('อัปโหลดรูป Lab ไม่สำเร็จ: ' + (err?.message || err));
                              } finally {
                                setPendingUploads(n => Math.max(0, n - 1));
                              }
                            }
                          }} />
                        </label>
                      )}
                    </div>
                    {(lab.images||[]).length > 0 && (
                      <div className="grid grid-cols-6 gap-1">
                        {lab.images.map((img, ii) => (
                          <div key={ii} className="relative aspect-square rounded overflow-hidden border border-[#333] group">
                            <img src={img.thumbUrl || img.dataUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                            {/* 2026-05-27 (V123) — view-large button (mirror Chart's Maximize2);
                                white bg + dark icon = theme-stable (see treatment-image note). */}
                            <button type="button" onClick={() => setImageLightboxSrc(img.dataUrl)}
                              aria-label={`ดูรูป Lab ใหญ่ที่ ${ii + 1}`} title="ดูรูปใหญ่"
                              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/90 text-gray-700 shadow hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 size={8} /></button>
                            <button onClick={() => {
                                const removed = labItems[li]?.images?.[ii];
                                removeTreatmentBlob(removed?.storagePath, removed?.thumbStoragePath);
                                setLabItems(prev => prev.map((l, i) => i === li ? { ...l, images: l.images.filter((_, j) => j !== ii) } : l));
                              }}
                              aria-label={`ลบรูป Lab ที่ ${ii + 1}`}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white/90 text-red-500 shadow hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={8} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Lab PDF attachment */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] text-gray-500 uppercase tracking-wider">PDF</span>
                      {lab.pdfBase64 || lab.fileId ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-cyan-500">{lab.pdfFileName || (lab.fileId ? `ไฟล์ #${lab.fileId}` : 'PDF')}</span>
                          <button onClick={() => {
                              const removed = labItems[li];
                              removeTreatmentBlob(removed?.pdfStoragePath);
                              setLabItems(prev => prev.map((l, i) => i === li ? { ...l, pdfBase64: '', pdfStoragePath: '', pdfFileName: '', fileId: '' } : l));
                            }}
                            aria-label="ลบไฟล์ PDF Lab"
                            className="text-red-400 hover:text-red-300"><X size={10} /></button>
                        </div>
                      ) : (
                        <label className="text-[11px] text-cyan-500 cursor-pointer flex items-center gap-0.5">
                          <Plus size={8} /> แนบ PDF
                          {/* 2026-05-25 — Storage-ref: pdfBase64 now holds a Storage URL (not base64);
                              pdfStoragePath drives cleanup. A single inline PDF (≤13 MB base64) would
                              alone blow the 1 MiB doc cap — this removes that failure mode. */}
                          <input type="file" accept="application/pdf" className="hidden" onChange={async e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            if (file.size > 10*1024*1024) { alert('ไฟล์ PDF ขนาดไม่เกิน 10MB'); return; }
                            setPendingUploads(n => n + 1);
                            try {
                              const { url, storagePath } = await uploadTreatmentPdf({ file, customerId, kind: 'labpdf' });
                              setLabItems(prev => prev.map((l, i) => i === li ? { ...l, pdfBase64: url, pdfStoragePath: storagePath, pdfFileName: file.name, fileId: '' } : l));
                            } catch (err) {
                              console.error('[TFP] lab pdf upload failed:', err);
                              alert('อัปโหลด PDF ไม่สำเร็จ: ' + (err?.message || err));
                            } finally {
                              setPendingUploads(n => Math.max(0, n - 1));
                            }
                          }} />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {/* Lab Modal */}
          {labModalOpen && (
            // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-lab" onKeyDown={e => { if (e.key === 'Escape') setLabModalOpen(false); }}>
              <ModalScrollLock />
              <div className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5 mx-4 ${isDark ? 'bg-[#111] border border-[#333]' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
                <h4 id="modal-title-lab" className="text-sm font-bold text-cyan-500 mb-4">{editingLabIndex >= 0 ? 'แก้ไข Lab' : 'เพิ่ม Lab'}</h4>
                {labModalLoading ? <div className="text-center py-6"><Loader2 size={20} className="animate-spin mx-auto text-gray-500" /></div> : (
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>เลือก Lab</label>
                      <select value={labModalSelected?.id || ''} onChange={e => {
                        const p = labProducts.find(p => String(p.id) === e.target.value);
                        if (p) { setLabModalSelected(p); setLabModalPrice(p.price || '0'); setLabModalVat(!!p.isVatIncluded); }
                      }} className={selectCls} disabled={editingLabIndex >= 0}>
                        <option value="">-- เลือก --</option>
                        {labProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>จำนวน</label>
                        <input type="number" step="0.01" min="0.01" value={labModalQty} onChange={e => setLabModalQty(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>ราคาต่อหน่วย</label>
                        <input type="number" step="0.01" min="0" value={labModalPrice} onChange={e => setLabModalPrice(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>ส่วนลด</label>
                        <input type="number" step="0.01" min="0" value={labModalDiscount} onChange={e => setLabModalDiscount(e.target.value)} className={inputCls} placeholder="0" />
                      </div>
                      <div>
                        <label className={labelCls}>ประเภทส่วนลด</label>
                        <select value={labModalDiscountType} onChange={e => setLabModalDiscountType(e.target.value)} className={selectCls}>
                          <option value="amount">บาท</option>
                          <option value="percent">%</option>
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input type="checkbox" checked={labModalVat} onChange={e => setLabModalVat(e.target.checked)} /> VAT 7%
                    </label>
                    {/* Lab price summary — pre-computed (no IIFE, Vite OXC safe) */}
                    <LabPriceSummary price={labModalPrice} discount={labModalDiscount} discountType={labModalDiscountType} vat={labModalVat} isDark={isDark} />
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setLabModalOpen(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${isDark ? 'border-[#333] text-gray-400' : 'border-gray-300 text-gray-500'}`}>ยกเลิก</button>
                      <button disabled={!labModalSelected} onClick={() => {
                        const p = parseFloat(labModalPrice) || 0;
                        const d = parseFloat(labModalDiscount) || 0;
                        const afterDisc = labModalDiscountType === 'percent' ? p * (1 - d/100) : p - d;
                        const vat = labModalVat ? afterDisc * 0.07 : 0;
                        const finalPrice = (afterDisc + vat).toFixed(2);
                        const existing = editingLabIndex >= 0 ? labItems[editingLabIndex] : null;
                        const item = {
                          id: existing?.id || '',
                          productId: labModalSelected.id, productName: labModalSelected.name, unitName: labModalSelected.unit || '',
                          qty: labModalQty || '1', price: finalPrice, originalPrice: labModalPrice,
                          discount: labModalDiscount || '0', discountType: labModalDiscountType === 'percent' ? '%' : 'บาท',
                          isVatIncluded: labModalVat, rowId: existing?.rowId || '',
                          information: existing?.information || '',
                          images: existing?.images || [],
                          fileId: existing?.fileId || '', pdfBase64: existing?.pdfBase64 || '', pdfFileName: existing?.pdfFileName || '',
                        };
                        if (editingLabIndex >= 0) {
                          setLabItems(prev => prev.map((l, i) => i === editingLabIndex ? item : l));
                        } else {
                          setLabItems(prev => [...prev, item]);
                        }
                        setLabModalOpen(false);
                      }} className="flex-1 py-2 rounded-lg text-xs font-bold bg-cyan-600 text-white disabled:opacity-40">ยืนยัน</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Treatment Files (ไฟล์การรักษา — PDF, max 2) ────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Paperclip} title="ไฟล์การรักษา" isDark={isDark} accent="#8b5cf6">
              <span className="text-[11px] text-gray-500">PDF, ไม่เกิน 10MB/ไฟล์, สูงสุด 2 ไฟล์</span>
            </SectionHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {treatmentFiles.map((tf, ti) => (
                <div key={tf.slot} className={`rounded-lg border-2 border-dashed p-4 flex flex-col items-center justify-center min-h-[100px] transition-all ${
                  tf.pdfBase64 || tf.fileId
                    ? isDark ? 'border-purple-500/40 bg-purple-950/10' : 'border-purple-300 bg-purple-50/50'
                    : isDark ? 'border-[#333] hover:border-[#444]' : 'border-gray-300 hover:border-gray-400'
                }`}>
                  {tf.pdfBase64 || tf.fileId ? (
                    <div className="flex flex-col items-center gap-2">
                      <Paperclip size={20} className={isDark ? 'text-purple-400' : 'text-purple-500'} />
                      <span className={`text-[11px] font-bold text-center ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                        {tf.pdfFileName || (tf.fileId ? `ไฟล์ #${tf.fileId}` : `ไฟล์ ${tf.slot}`)}
                      </span>
                      <button type="button" onClick={() => {
                          const removed = treatmentFiles[ti];
                          removeTreatmentBlob(removed?.pdfStoragePath);
                          setTreatmentFiles(prev => prev.map((f, i) => i === ti ? { ...f, pdfBase64: '', pdfStoragePath: '', pdfFileName: '', fileId: '' } : f));
                        }}
                        className={`text-xs font-bold px-2 py-1 rounded border transition-all flex items-center gap-1 ${isDark ? 'border-red-900/50 text-red-400 hover:bg-red-950/30' : 'border-red-200 text-red-500 hover:bg-red-50'}`}>
                        <X size={10} /> ลบไฟล์
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center gap-2 w-full">
                      <Paperclip size={20} className="text-gray-500 opacity-40" />
                      <span className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>แนบไฟล์ (PDF, ไม่เกิน 10MB)</span>
                      {/* 2026-05-25 — Storage-ref: pdfBase64 holds a Storage URL; pdfStoragePath cleans up. */}
                      <input type="file" accept="application/pdf" className="hidden" onChange={async e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) { alert('ไฟล์ PDF ขนาดไม่เกิน 10MB'); return; }
                        setPendingUploads(n => n + 1);
                        try {
                          const { url, storagePath } = await uploadTreatmentPdf({ file, customerId, kind: 'tfile' });
                          setTreatmentFiles(prev => prev.map((f, i) => i === ti ? { ...f, pdfBase64: url, pdfStoragePath: storagePath, pdfFileName: file.name, fileId: '' } : f));
                        } catch (err) {
                          console.error('[TFP] treatment file upload failed:', err);
                          alert('อัปโหลดไฟล์ไม่สำเร็จ: ' + (err?.message || err));
                        } finally {
                          setPendingUploads(n => Math.max(0, n - 1));
                        }
                      }} />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </FormSection>

          {/* ── DF Entries (Phase 14.4 — per-doctor per-course DF) ─────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={DollarSign} title="ค่ามือแพทย์ & ผู้ช่วยแพทย์" isDark={isDark} accent="#14b8a6">
              <ActionBtn color="#14b8a6" isDark={isDark} onClick={() => setDfModalState({ mode: 'add', entry: null })}>
                <Plus size={10} /> เพิ่มค่ามือ
              </ActionBtn>
            </SectionHeader>
            {dfEntries.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-3">
                ยังไม่มีรายการค่ามือ — กด "เพิ่มค่ามือ" เพื่อเพิ่มต่อแพทย์ / ผู้ช่วย
              </p>
            ) : (
              <div className="space-y-1.5">
                {dfEntries.map((e) => {
                  const groupName = dfGroups.find(g => String(g.groupId || g.id) === String(e.dfGroupId))?.name || e.dfGroupId || '—';
                  const enabledRows = (e.rows || []).filter(r => r.enabled);
                  const bahtSum = enabledRows
                    .filter(r => r.type === 'baht')
                    .reduce((s, r) => s + (Number(r.value) || 0), 0);
                  // Phase 12.2b follow-up (2026-04-24): compute the baht
                  // amount for percent rows using the course price carried
                  // on treatmentCoursesForDf. User directive: "ขอให้แสดง
                  // ค่ามือตรงรายละเอียดด้านนอก modal". Sum across all
                  // enabled percent rows; rows without a known price
                  // contribute 0.
                  const priceByCourseId = new Map(
                    (treatmentCoursesForDf || []).map(c => [String(c.courseId), Number(c.price) || 0])
                  );
                  const percentSum = enabledRows
                    .filter(r => r.type === 'percent')
                    .reduce((s, r) => {
                      const price = priceByCourseId.get(String(r.courseId)) || 0;
                      return s + (price * (Number(r.value) || 0) / 100);
                    }, 0);
                  const totalDf = bahtSum + percentSum;
                  return (
                    <div key={e.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isDark ? 'bg-[#111]' : 'bg-gray-50'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-bold truncate">{e.doctorName || e.doctorId}</div>
                          {totalDf > 0 && (
                            <span className="text-xs font-bold font-mono tabular-nums text-emerald-400 shrink-0">
                              ฿{totalDf.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {groupName} · {enabledRows.length} คอร์ส
                          {bahtSum > 0 && ` · ${bahtSum.toFixed(2)} บาท`}
                          {percentSum > 0 && ` · ${percentSum.toFixed(2)} บาท (%)`}
                        </div>
                      </div>
                      <button
                        onClick={() => setDfModalState({ mode: 'edit', entry: e })}
                        className="text-blue-400 hover:text-blue-300 transition-colors shrink-0"
                        aria-label={`แก้ไข ${e.doctorName}`}
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        onClick={() => {
                          // Phase 14.4 ask-B: record dismissal so the auto-
                          // populate effect doesn't re-create this entry.
                          setDfDismissedIds((prev) => {
                            const n = new Set(prev);
                            n.add(String(e.doctorId));
                            return n;
                          });
                          setDfEntries(prev => prev.filter(x => x.id !== e.id));
                        }}
                        className="text-red-400 hover:text-red-300 transition-colors shrink-0"
                        aria-label={`ลบ ${e.doctorName}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
                {/* Phase 12.2b follow-up (2026-04-24): grand-total baht
                    sum across all entries (percent + baht combined).
                    Audit 2026-04-26 RP1/AV1: extracted to dfGrandTotal
                    useMemo at component scope (~line 1690). */}
                {dfEntries.length > 0 && (
                  <div className={`flex justify-between pt-2 mt-1 border-t text-xs font-bold ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <span style={{ color: aaAccent('#14b8a6', isDark) }}>รวมทั้งสิ้น · {dfEntries.length} รายการ</span>
                    <span className="font-mono tabular-nums" style={{ color: aaAccent('#14b8a6', isDark) }}>
                      ฿{dfGrandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            )}
          </FormSection>

          {/* ── Take-Home Medications ──────────────────────────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Pill} title="สั่งยากลับบ้าน" isDark={isDark} accent="#10b981">
              {/* Phase 26.0c (V26.0, 2026-05-13) — gate on canAddNewItems so admin can
                  ADD new meds when finalizing a doctor-recorded treatment. Legacy
                  edit-mode behaviour preserved (canAddNewItems === !isEdit when
                  loadedTreatmentStatus !== 'doctor-recorded'). */}
              {canAddNewItems && (
                <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                  <ActionBtn color="#3b82f6" isDark={isDark} onClick={openMedGroupModal}>
                    <Plus size={10} /> กลุ่มยากลับบ้าน
                  </ActionBtn>
                  <ActionBtn color="#10b981" isDark={isDark} onClick={openMedModal}>
                    <Plus size={10} /> ยากลับบ้าน
                  </ActionBtn>
                  <ActionBtn color="#38bdf8" isDark={isDark} onClick={() => setRemedModalOpen(true)}>
                    <RotateCcw size={10} /> Remed
                  </ActionBtn>
                </div>
              )}
            </SectionHeader>

            {/* เพิ่มยากลับบ้าน modal — matching ProClinic */}
            {medModalOpen && (
              // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-med" onKeyDown={e => { if (e.key === 'Escape') setMedModalOpen(false); }}>
                <ModalScrollLock />
                <div className={`w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  <div className={`px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 id="modal-title-med" className="text-sm font-black" style={{ color: aaAccent('#10b981', isDark) }}>{editingMedIndex >= 0 ? 'แก้ไขยากลับบ้าน' : 'เพิ่มยากลับบ้าน'}</h3>
                  </div>
                  <div className="px-5 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                    {/* Product select with search */}
                    <div>
                      <label className={labelCls}>ยากลับบ้าน *</label>
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                        <input value={medModalSelected ? medModalSelected.name : medModalQuery}
                          onChange={e => { setMedModalQuery(e.target.value); setMedModalSelected(null); }}
                          onFocus={() => { if (medModalSelected) { setMedModalQuery(medModalSelected.name); setMedModalSelected(null); } }}
                          className={`${inputCls} !pl-8`} placeholder="เลือกยากลับบ้าน" autoFocus />
                      </div>
                      {!medModalSelected && (
                        <div className={`rounded-lg border mt-1 max-h-40 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                          {medModalLoading ? (
                            <div className="flex items-center justify-center gap-2 py-4"><Loader2 size={14} className="animate-spin text-emerald-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                          ) : medFilteredProducts.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center py-3">ไม่พบรายการ</p>
                          ) : medFilteredProducts.map(p => (
                            <button key={p.id} onClick={() => selectMedProduct(p)}
                              className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <div>
                                <span className="font-bold">{p.name}</span>
                                {p.category && <span className="text-xs text-gray-500 ml-2">[{p.category}]</span>}
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap ml-2">฿{p.price} / {p.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Qty + Unit + Price */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>จำนวน *</label>
                        <div className="flex">
                          <input type="number" value={medModalQty} onChange={e => setMedModalQty(e.target.value)}
                            className={`${inputCls} rounded-r-none`} placeholder="กรอกจำนวน" />
                          <span className={`flex items-center px-2 text-xs border border-l-0 rounded-r-lg ${isDark ? 'border-[#333] bg-[#1a1a1a] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                            {medModalSelected?.unit || 'หน่วย'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>ราคาต่อหน่วย *</label>
                        <input type="number" value={medModalPrice} onChange={e => setMedModalPrice(e.target.value)}
                          className={inputCls} placeholder="กรอกราคาต่อหน่วย" />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                          <input type="checkbox" checked={medModalPremium} onChange={e => setMedModalPremium(e.target.checked)}
                            className="w-3.5 h-3.5 rounded accent-emerald-500" />
                          สินค้าของแถม
                        </label>
                      </div>
                    </div>
                    {/* Price summary */}
                    <div className={`rounded-lg border p-3 space-y-2 ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-gray-50'}`}>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">สรุปราคาต่อหน่วย</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-24 shrink-0">ส่วนลดต่อหน่วย</span>
                        <input type="number" value={medModalDiscount} onChange={e => setMedModalDiscount(e.target.value)}
                          className={`${inputCls} !w-24`} placeholder="0" />
                        <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                          <input type="radio" name="medDiscType" checked={medModalDiscountType === 'amount'} onChange={() => setMedModalDiscountType('amount')} className="w-3 h-3" /> บาท
                        </label>
                        <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                          <input type="radio" name="medDiscType" checked={medModalDiscountType === 'percent'} onChange={() => setMedModalDiscountType('percent')} className="w-3 h-3" /> %
                        </label>
                      </div>
                      {/* Med price summary — extracted from IIFE (Vite OXC safe) */}
                      <MedPriceSummary price={medModalPrice} discount={medModalDiscount} discountType={medModalDiscountType} vat={medModalVat} onVatChange={setMedModalVat} premium={medModalPremium} isDark={isDark} />
                    </div>
                    {/* Label info (expandable) */}
                    <div>
                      <button onClick={() => setMedModalLabelOpen(!medModalLabelOpen)}
                        className={`flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-400 transition-colors`}>
                        <span className={`transition-transform ${medModalLabelOpen ? 'rotate-90' : ''}`}>▶</span>
                        ข้อมูลฉลากยา
                      </button>
                      {medModalLabelOpen && medModalSelected?.label && (
                        <div className={`mt-2 rounded-lg border p-3 space-y-2 text-xs ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-gray-50'}`}>
                          <div><span className="text-xs font-bold text-gray-500">ชื่อสามัญ:</span> <span className="text-gray-400">{medModalSelected.label.genericName || '-'}</span></div>
                          <div><span className="text-xs font-bold text-gray-500">ข้อบ่งใช้:</span> <span className="text-gray-400">{medModalSelected.label.indications || '-'}</span></div>
                          <div><span className="text-xs font-bold text-gray-500">รับประทานครั้งละ:</span> <span className="text-gray-400">{medModalSelected.label.dosageAmount || '-'} {medModalSelected.label.dosageUnit || ''}</span></div>
                          <div><span className="text-xs font-bold text-gray-500">วันละ:</span> <span className="text-gray-400">{medModalSelected.label.timesPerDay || '-'} ครั้ง</span></div>
                          <div><span className="text-xs font-bold text-gray-500">วิธีรับประทาน:</span> <span className="text-gray-400">{medModalSelected.label.administrationMethod || '-'}</span></div>
                          <div><span className="text-xs font-bold text-gray-500">ช่วงเวลา:</span> <span className="text-gray-400">{medModalSelected.label.administrationTimes || '-'}</span></div>
                          <div><span className="text-xs font-bold text-gray-500">คำแนะนำ:</span> <span className="text-gray-400">{medModalSelected.label.instructions || '-'}</span></div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Footer */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setMedModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmMedModal} disabled={!medModalSelected}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Medication group modal — full overlay matching ProClinic */}
            {medGroupModalOpen && (
              // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-med-group" onKeyDown={e => { if (e.key === 'Escape') setMedGroupModalOpen(false); }}>
                <ModalScrollLock />
                <div className={`w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 id="modal-title-med-group" className="text-sm font-black" style={{ color: aaAccent('#10b981', isDark) }}>เพิ่มยากลับบ้าน</h3>
                    <select value={medGroupSelectedId}
                      onChange={e => {
                        setMedGroupSelectedId(e.target.value);
                        const g = medGroupData.find(g => String(g.id) === e.target.value);
                        setMedGroupChecked(new Set((g?.products || []).map((_, i) => i)));
                      }}
                      className={`${selectCls} !w-auto !text-xs min-w-[180px]`}>
                      {medGroupData.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                    </select>
                  </div>
                  {/* Table */}
                  <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
                    {medGroupLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8"><Loader2 size={16} className="animate-spin text-emerald-400" /><span className="text-xs text-gray-500">กำลังโหลดกลุ่มยา...</span></div>
                    ) : selectedGroupProducts.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-8">กรุณาเลือกกลุ่มยากลับบ้าน</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            <th className="text-left py-1.5 pr-2 w-8"></th>
                            <th className="text-left py-1.5">รายการยากลับบ้าน ({selectedGroupProducts.length} รายการ)</th>
                            <th className="text-center py-1.5 w-16">จำนวน</th>
                            <th className="text-center py-1.5 w-12">หน่วย</th>
                            <th className="text-center py-1.5 w-20">ราคาต่อหน่วย</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedGroupProducts.map((p, i) => (
                            <tr key={p.id} className={`border-t ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                              <td className="py-2 pr-2">
                                <input type="checkbox" checked={medGroupChecked.has(i)} onChange={() => toggleMedGroupCheck(i)}
                                  className="w-3.5 h-3.5 rounded accent-emerald-500" />
                              </td>
                              <td className="py-2 font-medium">{p.name}</td>
                              <td className="py-2 text-center">{parseFloat(p.qty) || 1}</td>
                              <td className="py-2 text-center text-gray-500">{p.unit}</td>
                              <td className="py-2 text-center">{parseFloat(p.price).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {/* Selected items chips */}
                  {medGroupChecked.size > 0 && (
                    <div className={`px-5 py-2 border-t ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                      <p className="text-xs font-bold text-gray-500 mb-1.5">รายการที่เลือก ({medGroupChecked.size} รายการ)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedGroupProducts.map((p, i) => medGroupChecked.has(i) && (
                          <span key={i} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                            {p.name} ({parseFloat(p.qty)} {p.unit})
                            <button onClick={() => toggleMedGroupCheck(i)} className="hover:text-red-400 ml-0.5">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Footer buttons */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setMedGroupModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmMedGroup} disabled={medGroupChecked.size === 0}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Remed modal — past medications from treatment history */}
            {remedModalOpen && (
              <div className={`rounded-lg border p-3 mb-3 ${isDark ? 'border-sky-900/30 bg-[#0a0c14]' : 'border-sky-200 bg-sky-50/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-bold text-sky-400 uppercase tracking-widest">ประวัติการสั่งยา (Remed)</p>
                  <button onClick={() => setRemedModalOpen(false)} aria-label="ปิดประวัติการสั่งยา" className="ml-auto text-gray-400 hover:text-gray-300 p-1"><Trash2 size={12} /></button>
                </div>
                {(options?.remedItems || []).length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">ไม่พบประวัติการสั่งยาของผู้ป่วยรายนี้</p>
                ) : (
                  <div className={`rounded-lg border max-h-48 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                    {options.remedItems.map((item, idx) => (
                      <button key={idx} onClick={() => {
                        setMedications(prev => [...prev, {
                          id: item.productId || `remed-${idx}`,
                          name: item.name,
                          dosage: '',
                          qty: item.qty || '1',
                          unitPrice: item.price || '0',
                          unit: '',
                        }]);
                      }}
                        className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                        <span className="font-bold">{item.name}</span>
                        <span className="text-xs text-gray-500">
                          x{item.qty} {item.price !== '0' && item.price !== '0.00' ? `฿${item.price}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Medication table */}
            {medications.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">{isEdit ? 'ไม่พบยากลับบ้าน' : 'ยังไม่มีรายการยากลับบ้าน — กด "ยากลับบ้าน" เพื่อค้นหาและเพิ่ม'}</p>
            ) : (
              /* Phase 26.0c (V26.0, 2026-05-13) — Pattern β grid swap: gate
                 editable (12-col, price + actions) vs read-only (10-col) layout
                 on canAddNewItems instead of !isEdit. doctor-recorded edits get
                 the editable shape so admin can adjust per-item before finalize. */
              <div className="space-y-2">
                <div className={`grid ${canAddNewItems ? 'grid-cols-12' : 'grid-cols-10'} gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-500 px-1`}>
                  <div className={canAddNewItems ? 'col-span-4' : 'col-span-4'}>รายการ</div>
                  <div className={canAddNewItems ? 'col-span-3' : 'col-span-3'}>วิธีรับประทาน</div>
                  <div className={canAddNewItems ? 'col-span-2' : 'col-span-3'}>จำนวน</div>
                  {canAddNewItems && <div className="col-span-2">ราคาต่อหน่วย</div>}
                  {canAddNewItems && <div className="col-span-1"></div>}
                </div>
                {medications.map((med, i) => (
                  <div key={i} data-field={`medications[${i}]`} className={`grid ${canAddNewItems ? 'grid-cols-12' : 'grid-cols-10'} gap-2 items-center py-1 border-b ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`} {...ariaErrProps(`medications[${i}]`)}>
                    <div className={`${canAddNewItems ? 'col-span-4' : 'col-span-4'} text-xs font-bold truncate px-1`}>{med.name}</div>
                    <div className={`${canAddNewItems ? 'col-span-3' : 'col-span-3'} text-xs text-gray-400 truncate px-1`}>{med.dosage || '-'}</div>
                    <div className={`${canAddNewItems ? 'col-span-2' : 'col-span-3'} text-xs text-center`}>{med.qty} {med.unit}</div>
                    {canAddNewItems && <div className="col-span-2 text-xs text-center">{med.isPremium ? <span className="text-green-500">ของแถม</span> : med.unitPrice}</div>}
                    {canAddNewItems && (
                      <div className="col-span-1 flex items-center justify-center gap-1">
                        <button onClick={() => editMedication(i)} aria-label={`แก้ไขยา ${med.name}`} className="text-blue-400 hover:text-blue-300 transition-colors"><Edit3 size={11} /></button>
                        <button onClick={() => removeMed(i)} aria-label={`ลบยา ${med.name}`} className="text-red-400 hover:text-red-300 transition-colors"><Trash2 size={11} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {/* ── ข้อมูลการใช้คอร์ส — matching ProClinic layout ──────────── */}
          {<div data-field="courseSection" {...ariaErrProps('courseSection')}><FormSection isDark={isDark}>
            <FieldError field="courseSection" />
            <SectionHeader icon={ShoppingCart} title="ข้อมูลการใช้คอร์ส" isDark={isDark} accent="#f97316">
              {/* Phase 26.0c (V26.0, 2026-05-13) — gate on canAddNewItems so admin
                  can ADD course/product/promotion purchases when finalizing a
                  doctor-recorded treatment. */}
              {canAddNewItems && (
                <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                  <ActionBtn color="#14b8a6" isDark={isDark} onClick={() => openBuyModal('course')}>
                    <Plus size={10} /> ซื้อคอร์ส
                  </ActionBtn>
                  <ActionBtn color="#f59e0b" isDark={isDark} onClick={() => openBuyModal('product')}>
                    <Plus size={10} /> ซื้อสินค้าหน้าร้าน
                  </ActionBtn>
                  <ActionBtn color="#38bdf8" isDark={isDark} onClick={() => openBuyModal('promotion')}>
                    <Plus size={10} /> ซื้อโปรโมชัน
                  </ActionBtn>
                </div>
              )}
            </SectionHeader>

            {/* Phase 26.0c (V26.0, 2026-05-13) — Pattern β branch swap: gate
                interactive 3-column picker vs read-only items table on
                canAddNewItems instead of isEdit. doctor-recorded edits get the
                interactive shape so admin can pick course/product/promotion.
                V136 (2026-05-31) — ALSO open the interactive grid when
                canEditCourseUsageRetro (finalized treatment that used no
                course). courseUsageInteractive = canAddNewItems ||
                canEditCourseUsageRetro. The ซื้อ buttons above stay gated on
                canAddNewItems ONLY, so retro mode shows the existing-course
                picker WITHOUT the buy buttons (Q3=B). */}
            {!courseUsageInteractive ? (
              /* ── Read-only (locked) mode: treatment items table (matching ProClinic) ── */
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">รายการรักษา</p>
                <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                  <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                    <span className="text-xs font-bold" style={{ color: aaAccent('#f97316', isDark) }}>รายการ</span>
                    <span className="text-xs text-gray-500">จำนวน</span>
                  </div>
                  {treatmentItems.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">ไม่พบรายการรักษา</p>
                  ) : treatmentItems.map(item => (
                    <div key={item.id} className={`flex items-center justify-between px-3 py-2 border-b ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'}`}>
                      <span className="text-xs">{item.name}</span>
                      <span className="text-xs text-gray-500 shrink-0 ml-2">{item.qty} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Add-allowed mode: interactive 3-column grid ── */
              <div>
                <p className="text-xs text-gray-500 mb-3">คอร์ส/สินค้า/โปรโมชัน</p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* ── Column 1: คอร์ส ── */}
                  <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                      <span className="text-xs font-bold" style={{ color: aaAccent('#14b8a6', isDark) }}>คอร์ส</span>
                      <span className="text-xs text-gray-500">จำนวน</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                      {/* 2026-04-28: render via `customerCourseGroups`
                          (built by buildCustomerCourseGroups). Same shape
                          as a single course entry but with multiple
                          products[] flattened from N customerCourses
                          entries that share the same purchase event
                          (courseName + linkedSaleId + linkedTreatmentId
                          + parentName). Result: ONE header per purchase
                          + N nested product rows, instead of repeating
                          the header for every product. User report
                          (verbatim): "อะไรที่มาจากคอร์สเดียวกัน โปรโมชั่น
                          เดียวกัน จัดให้อยู่ใน Group ย่อยเดียวกัน".
                          Promotion-linked entries handled by
                          customerPromotionGroups separately. */}
                      {customerCourseGroups.map(course => (
                        <div key={course.groupId}>
                          <div className={`flex items-center justify-between px-3 py-1 border-b text-xs font-bold ${isDark ? 'border-[#1a1a1a] bg-[#0c0c0c] text-teal-400/80' : 'border-gray-100 bg-teal-50/50 text-teal-700'}`}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate">{course.courseName}</span>
                              {course.parentName && (
                                <span className={`text-[10px] font-normal ${isDark ? 'text-orange-400/80' : 'text-orange-600'}`}>· {course.parentName}</span>
                              )}
                              {course.isAddon && (
                                <span className="text-[10px] text-teal-500 font-semibold shrink-0">(ซื้อเพิ่ม)</span>
                              )}
                              {/* Phase 12.2b Step 7 (2026-04-24):
                                  fill-later badge — เหมาตามจริง courses
                                  don't pre-set qty; doctor enters during
                                  treatment. Pick-at-treatment courses
                                  get their own button below (not this
                                  badge) — they BECOME standard after
                                  picking. */}
                              {course.isRealQty && (
                                <span className="text-[10px] text-amber-500 font-semibold shrink-0 italic">
                                  (ระบุตอนรักษา)
                                </span>
                              )}
                              {course.isBuffet && (
                                <span className="text-[10px] text-violet-400 font-semibold shrink-0 italic">
                                  (บุฟเฟต์)
                                </span>
                              )}
                              {/* Phase 12.2b follow-up (2026-04-24):
                                  pick-at-treatment courses show a
                                  "เลือกสินค้า" button on the header
                                  when products haven't been picked yet.
                                  After pick, the button disappears and
                                  products render as standard sub-rows. */}
                              {course.isPickAtTreatment && course.needsPickSelection && (
                                <button
                                  type="button"
                                  onClick={() => setPickModalCourseId(course.courseId)}
                                  className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 border border-teal-500/40 transition-colors shrink-0"
                                  aria-label={`เลือกสินค้า ${course.courseName}`}
                                >
                                  <Check size={10} /> เลือกสินค้า
                                </button>
                              )}
                            </div>
                            {course.isAddon && course.purchasedItemId && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removePurchasedItem({ id: course.purchasedItemId, itemType: course.purchasedItemType, courseId: course.courseId, purchaseUid: course.purchaseUid }); }}
                                className="text-red-400 hover:text-red-300 shrink-0 p-1"
                                aria-label={`ลบ ${course.courseName}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          {course.isPickAtTreatment && course.needsPickSelection ? (
                            /* Pick-at-treatment placeholder — before pick */
                            <p className={`text-[11px] italic text-center py-2 px-3 border-b ${isDark ? 'border-[#1a1a1a] text-teal-400/70' : 'border-gray-50 text-teal-600'}`}>
                              ยังไม่ได้เลือกสินค้า — กด "เลือกสินค้า" ด้านบน
                            </p>
                          ) : (<>{course.products.map(product => {
                            const isSelected = selectedCourseItems.has(product.rowId);
                            const remainingNum = parseFloat(product.remaining) || 0;
                            const totalNum = parseFloat(product.total) || 0;
                            // Fill-later + buffet products: never "exhausted".
                            // - Fill-later: one-shot qty entered at save time
                            // - Buffet: unlimited until date-expiry
                            const exhausted = !product.fillLater && !product.isBuffet && totalNum > 0 && remainingNum <= 0;
                            return (
                              <label key={product.rowId} className={`flex items-center justify-between px-3 py-1.5 border-b cursor-pointer transition-all ${
                                isSelected ? isDark ? 'bg-teal-500/10 border-teal-500/20' : 'bg-teal-50 border-teal-100'
                                : isDark ? 'border-[#1a1a1a] hover:bg-[#151515]' : 'border-gray-50 hover:bg-gray-50'
                              } ${exhausted ? 'opacity-50' : ''}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <input type="checkbox" checked={isSelected} onChange={() => toggleCourseItem(product)}
                                    disabled={exhausted}
                                    className="w-3.5 h-3.5 rounded accent-teal-500 shrink-0" />
                                  <span className={`text-xs truncate ${isSelected ? 'font-bold text-teal-400' : ''}`}>{product.name}</span>
                                </div>
                                <span className="text-xs text-gray-500 shrink-0 ml-2 whitespace-nowrap font-mono">
                                  {product.fillLater
                                    ? <span className="italic text-amber-500">เหมาตามจริง</span>
                                    : product.isBuffet
                                      ? <span className="italic text-violet-400">บุฟเฟต์</span>
                                      : `${product.remaining} / ${product.total} ${product.unit}`}
                                </span>
                              </label>
                            );
                          })}
                          {/* Phase 14.7.H follow-up I (2026-04-26) — reopen-add.
                              Show on courses that originated as pick-at-treatment
                              and still carry the options snapshot (1st sibling).
                              Lets the doctor pick MORE products from the same
                              original course at a later visit. Add-only — does
                              not edit existing entry qty (preserves deduction
                              math). */}
                          {course._pickGroupOptions && course._pickedFromCourseId && (
                            <button
                              type="button"
                              onClick={() => setReopenPickGroup({
                                pickedFromCourseId: course._pickedFromCourseId,
                                courseName: course.courseName,
                                options: course._pickGroupOptions,
                              })}
                              className={`flex items-center justify-center gap-1 w-full px-3 py-1.5 text-[11px] font-semibold border-b transition-colors ${isDark ? 'bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 border-[#1a1a1a]' : 'bg-teal-50 text-teal-600 hover:bg-teal-100 border-gray-50'}`}
                              data-testid={`reopen-pick-${course._pickedFromCourseId}`}
                              aria-label={`เพิ่มสินค้าจากคอร์ส ${course.courseName}`}
                            >
                              <Check size={10} /> เพิ่มสินค้าจากคอร์สเดียวกัน
                            </button>
                          )}
                          </>)}
                        </div>
                      ))}
                      {customerCourses.filter(c => !c.promotionId).length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-4">ไม่มีคอร์ส</p>
                      )}
                    </div>
                  </div>

                  {/* ── Column 2: โปรโมชัน ── */}
                  <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                      <span className="text-xs font-bold" style={{ color: aaAccent('#f59e0b', isDark) }}>โปรโมชัน</span>
                      <span className="text-xs text-gray-500">จำนวน</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                      {/* Phase 12.2b Step 6 (2026-04-24): promotion group
                          header renders its own "(ซื้อเพิ่ม)" badge +
                          Trash when the group came from a buy-this-visit
                          promotion. Removes the old flat "purchased
                          promotion" list that was rendered below. */}
                      {customerPromotionGroups.map(group => (
                        <div key={group.groupKey || `promo-${group.promotionId}`}>
                          <div className={`flex items-center justify-between px-3 py-1.5 border-b text-[11px] font-black tracking-wide ${isDark ? 'border-orange-900/40 bg-orange-950/40 text-orange-300' : 'border-orange-200 bg-orange-100 text-orange-800'}`}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate">{group.promotionName}</span>
                              {group.isAddon && (
                                <span className={`text-[10px] font-semibold shrink-0 ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>(ซื้อเพิ่ม)</span>
                              )}
                            </div>
                            {group.isAddon && group.purchasedItemId && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removePurchasedItem({ id: group.purchasedItemId, itemType: group.purchasedItemType || 'promotion', purchaseUid: group.purchaseUid }); }}
                                className="text-red-400 hover:text-red-300 shrink-0 p-1"
                                aria-label={`ลบโปรโมชัน ${group.promotionName}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          {group.courses.map(course => (
                            <div key={course.courseId}>
                              <div className={`px-3 pl-5 py-0.5 border-b text-xs font-medium ${isDark ? 'border-[#1a1a1a] bg-[#0a0a0a] text-gray-400' : 'border-gray-100 bg-gray-50 text-gray-600'}`}>
                                {course.courseName}
                              </div>
                              {course.products.map(product => {
                                const isSelected = selectedCourseItems.has(product.rowId);
                                return (
                                  <label key={product.rowId} className={`flex items-center justify-between px-3 pl-7 py-1.5 border-b cursor-pointer transition-all ${
                                    isSelected ? isDark ? 'bg-orange-500/10 border-orange-500/20' : 'bg-orange-50 border-orange-100'
                                    : isDark ? 'border-[#1a1a1a] hover:bg-[#151515]' : 'border-gray-50 hover:bg-gray-50'
                                  }`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <input type="checkbox" checked={isSelected} onChange={() => toggleCourseItem(product)}
                                        className="w-3.5 h-3.5 rounded accent-orange-500 shrink-0" />
                                      <span className={`text-xs truncate ${isSelected ? 'font-bold text-orange-400' : ''}`}>{product.name}</span>
                                    </div>
                                    <span className="text-xs text-gray-500 shrink-0 ml-2 whitespace-nowrap">{product.remaining} {product.unit}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      ))}
                      {customerPromotionGroups.length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-4">ไม่มีโปรโมชัน</p>
                      )}
                    </div>
                  </div>

                  {/* ── Column 3: รายการรักษา ── */}
                  <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                      <span className="text-xs font-bold" style={{ color: aaAccent('#f97316', isDark) }}>รายการรักษา</span>
                      <span className="text-xs text-gray-500">จำนวน</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                      {treatmentItems.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-4">เลือกรายการจากคอร์ส/โปรโมชันด้านซ้าย</p>
                      ) : treatmentItems.map(item => {
                        // Phase 12.2b Step 7 (2026-04-24): fill-later rows
                        // highlight the qty input (amber + required) and
                        // carry a data-field anchor for scrollToError when
                        // the doctor tries to save without entering qty.
                        const needsQty = item.fillLater && (!item.qty || Number(item.qty) <= 0);
                        return (
                          <div
                            key={item.id}
                            data-field={item.id}
                            className={`flex items-center gap-2 px-3 py-1.5 border-b ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'} ${needsQty ? 'bg-amber-500/10' : ''}`}
                          >
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs font-medium truncate block ${item.source === 'purchased' ? 'text-orange-400' : ''}`}>
                                {item.name}
                                {item.source === 'purchased' && <span className="text-[11px] text-orange-500 ml-1">(ซื้อเพิ่ม)</span>}
                                {item.fillLater && (
                                  <span className="text-[11px] text-amber-500 ml-1 italic">(ระบุจำนวนตามจริง)</span>
                                )}
                              </span>
                            </div>
                            <input
                              type="number"
                              value={item.qty}
                              onChange={e => { updateTreatmentItem(item.id, 'qty', e.target.value); clearFieldError(item.id); }}
                              className={`${inputCls} !w-24 text-center !py-1 shrink-0 ${needsQty ? '!border-amber-500 !ring-1 !ring-amber-500/50' : ''}`}
                              min="0"
                              placeholder={item.fillLater ? 'ระบุ' : ''}
                              aria-label={`จำนวน ${item.name}${item.fillLater ? ' (ต้องระบุก่อนบันทึก)' : ''}`}
                              {...ariaErrProps(item.id)}
                            />
                            <span className="text-xs text-gray-500 shrink-0">{item.unit}</span>
                            <button onClick={() => removeTreatmentItem(item.id)} aria-label={`ลบรายการ ${item.name}`} className="text-red-400 hover:text-red-300 shrink-0 ml-1"><Trash2 size={11} /></button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Purchased retail products (สินค้าหน้าร้าน) — shown below grid */}
            {purchasedByType.product.length > 0 && (
              <div className={`mt-3 rounded-lg border overflow-hidden ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                  <span className="text-xs font-bold" style={{ color: aaAccent('#f97316', isDark) }}>สินค้าหน้าร้าน</span>
                  <span className="text-xs text-gray-500">จำนวน</span>
                </div>
                <div className="max-h-[150px] overflow-y-auto">
                  {purchasedByType.product.map((item, idx) => (
                    <div key={`pr-${idx}`} data-field={`purchasedItems[${idx}]`} className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#1a1a1a] bg-orange-500/5' : 'border-gray-50 bg-orange-50/50'}`} {...ariaErrProps(`purchasedItems[${idx}]`)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Check size={12} className="text-orange-500 shrink-0" />
                        <span className="text-xs font-medium truncate">{item.name}</span>
                        <span className="text-[11px] text-orange-500 shrink-0">(ซื้อเพิ่ม)</span>
                        <button onClick={(e) => { e.stopPropagation(); removePurchasedItem(item); }} aria-label={`ลบสินค้า ${item.name}`} className="text-red-400 hover:text-red-300 shrink-0 p-1"><Trash2 size={12} /></button>
                      </div>
                      <span className="text-xs text-gray-500 shrink-0 ml-2">{item.qty} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buy modal — ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน */}
            {buyModalOpen && (
              // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-treat-buy" onKeyDown={e => { if (e.key === 'Escape') setBuyModalOpen(false); }}>
                <ModalScrollLock />
                <div className={`w-full max-w-5xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 id="modal-title-treat-buy" className="text-sm font-black" style={{ color: aaAccent('#14b8a6', isDark) }}>ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน</h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input value={buyQuery} onChange={e => setBuyQuery(e.target.value)}
                          className={`${inputCls} !pl-8 !w-48`} placeholder="ค้นหาด้วยชื่อ" />
                      </div>
                      <select value={buyModalType} onChange={e => { setBuyModalType(e.target.value); setBuySelectedCat(''); setBuyChecked(new Set()); setBuyQtyMap({}); setBuyDiscMap({}); setBuyVatMap({}); openBuyModal(e.target.value); /* Phase 17.2-quinquies: always re-fetch on tab switch */ }}
                        className={`${selectCls} !w-auto !text-xs`}>
                        <option value="course">คอร์ส</option>
                        <option value="promotion">โปรโมชัน</option>
                        <option value="product">สินค้าหน้าร้าน</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Left sidebar — categories */}
                    <div className={`w-48 shrink-0 border-r overflow-y-auto ${isDark ? 'border-[#222] bg-[#0a0a0a]' : 'border-gray-200 bg-gray-50'}`}>
                      {['promotion', 'course', 'product'].map(type => {
                        const cats = buyCategories[type] || [];
                        const typeLabel = type === 'promotion' ? 'โปรโมชัน' : type === 'course' ? 'คอร์ส' : 'สินค้าหน้าร้าน';
                        const isActiveType = buyModalType === type;
                        return (
                          <div key={type}>
                            <button onClick={() => { setBuyModalType(type); setBuySelectedCat(''); openBuyModal(type); /* Phase 17.2-quinquies: always re-fetch on tab switch */ }}
                              className={`w-full text-left px-3 py-2 text-xs font-bold border-b flex items-center justify-between ${
                                isActiveType ? 'text-teal-500' : isDark ? 'text-gray-400 border-[#1a1a1a]' : 'text-gray-600 border-gray-100'
                              } ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                              {typeLabel}
                              <span className="text-xs">{isActiveType ? '▼' : '▶'}</span>
                            </button>
                            {isActiveType && (
                              <div>
                                <button onClick={() => setBuySelectedCat('')}
                                  className={`w-full text-left px-4 py-1.5 text-[11px] border-b transition-all ${
                                    !buySelectedCat ? 'text-teal-500 font-bold' : isDark ? 'text-gray-400 hover:bg-[#151515]' : 'text-gray-500 hover:bg-gray-100'
                                  } ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'}`}>
                                  {typeLabel}ทั้งหมด
                                </button>
                                {cats.map(cat => (
                                  <button key={cat} onClick={() => setBuySelectedCat(cat)}
                                    className={`w-full text-left px-4 py-1.5 text-[11px] border-b transition-all ${
                                      buySelectedCat === cat ? 'text-teal-500 font-bold' : isDark ? 'text-gray-400 hover:bg-[#151515]' : 'text-gray-500 hover:bg-gray-100'
                                    } ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'}`}>
                                    {cat}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Right — items table */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="overflow-x-auto overflow-y-auto flex-1">
                        {buyLoading ? (
                          <div className="flex items-center justify-center gap-2 py-12"><Loader2 size={16} className="animate-spin text-teal-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="sticky top-0" style={{ background: isDark ? '#0e0e0e' : 'white' }}>
                              <tr className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                <th className="text-left py-2 px-2 w-8"></th>
                                <th className="text-left py-2 px-2">รายการ ({buyFilteredItems.length} รายการ)</th>
                                <th className="text-center py-2 px-2 w-16">จำนวน</th>
                                <th className="text-center py-2 px-2 w-12">หน่วย</th>
                                <th className="text-center py-2 px-2 w-24">ราคาต่อหน่วย</th>
                                <th className="text-center py-2 px-2 w-24">ส่วนลดต่อหน่วย</th>
                                <th className="text-center py-2 px-2 w-16">VAT 7%</th>
                                <th className="text-center py-2 px-2 w-24">ราคาสุทธิต่อหน่วย</th>
                              </tr>
                            </thead>
                            <tbody>
                              {buyVisibleItems.map(item => {
                                const checked = buyChecked.has(item.id);
                                const qty = parseInt(buyQtyMap[item.id]) || 0;
                                const disc = parseFloat(buyDiscMap[item.id]) || 0;
                                const vat = !!buyVatMap[item.id];
                                const price = parseFloat(item.price) || 0;
                                const afterDisc = price - disc;
                                const vatAmt = vat ? afterDisc * 0.07 : 0;
                                const net = Math.max(0, afterDisc + vatAmt);
                                return (
                                  <tr key={item.id} className={`border-t ${checked ? isDark ? 'bg-teal-500/10' : 'bg-teal-50' : ''} ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                                    <td className="py-2 px-2">
                                      <input type="checkbox" checked={checked} onChange={() => toggleBuyCheck(item.id)}
                                        className="w-3.5 h-3.5 rounded accent-teal-500" />
                                    </td>
                                    <td className="py-2 px-2 font-medium">
                                      <div className="flex items-center gap-2 min-w-0">
                                        {buyModalType === 'promotion' && item.cover_image && (
                                          <img src={item.cover_image} alt="" loading="lazy"
                                            className="w-6 h-6 rounded object-cover flex-shrink-0 border border-[var(--bd)]"
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                        )}
                                        <span className="truncate">{item.name}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2">
                                      <input type="number" value={buyQtyMap[item.id] || ''} min="0"
                                        onChange={e => setBuyQtyMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        className={`${inputCls} text-center !py-1 !text-xs !w-20`} />
                                    </td>
                                    <td className="py-2 px-2 text-center text-gray-500">{item.unit || (buyModalType === 'course' ? 'คอร์ส' : buyModalType === 'promotion' ? 'โปรโมชัน' : '-')}</td>
                                    <td className="py-2 px-2 text-center">{(Number(item.price) || 0).toFixed(2)}</td>
                                    <td className="py-2 px-2">
                                      <input type="number" value={buyDiscMap[item.id] || ''} min="0"
                                        onChange={e => setBuyDiscMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        className={`${inputCls} text-center !py-1 !text-xs !w-20`} />
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <input type="checkbox" checked={vat}
                                        onChange={e => setBuyVatMap(prev => ({ ...prev, [item.id]: e.target.checked }))}
                                        className="w-3.5 h-3.5 rounded accent-teal-500" />
                                    </td>
                                    <td className="py-2 px-2 text-center font-medium">{net.toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                      {/* Load more + Selected count */}
                      <div className={`px-4 py-2 border-t text-xs text-gray-500 flex items-center justify-between ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                        <span>รายการที่เลือก ({buyChecked.size} รายการ) | แสดง {buyVisibleItems.length}/{buyFilteredItems.length}</span>
                        {buyShowLimit < buyFilteredItems.length && (
                          <button onClick={() => setBuyShowLimit(p => p + 50)} className="text-teal-400 hover:text-teal-300 font-bold">โหลดเพิ่ม +50</button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setBuyModalOpen(false)}
                      className={`px-8 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmBuyModal} disabled={buyChecked.size === 0}
                      className="px-8 py-2 rounded-lg text-xs font-bold text-white bg-teal-500 hover:bg-teal-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}
          </FormSection></div>}

          {/* Promotion course picker removed — sub-courses auto-populate from synced data */}

          {/* ── Consumables (สินค้าสิ้นเปลือง) ────────────────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Package} title="สินค้าสิ้นเปลือง" isDark={isDark} accent="#eab308">
              {/* Phase 26.0c (V26.0, 2026-05-13) — gate on canAddNewItems so admin
                  can ADD consumables when finalizing a doctor-recorded treatment. */}
              {canAddNewItems && (
                <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                  <ActionBtn color="#3b82f6" isDark={isDark} onClick={openConsGroupModal}>
                    <Plus size={10} /> กลุ่มสินค้าสิ้นเปลือง
                  </ActionBtn>
                  <ActionBtn color="#eab308" isDark={isDark} onClick={openConsModal}>
                    <Plus size={10} /> สินค้าสิ้นเปลือง
                  </ActionBtn>
                </div>
              )}
            </SectionHeader>

            {/* เพิ่มสินค้าสิ้นเปลือง modal — matching ProClinic */}
            {consModalOpen && (
              // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-cons" onKeyDown={e => { if (e.key === 'Escape') setConsModalOpen(false); }}>
                <ModalScrollLock />
                <div className={`w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  <div className={`px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 id="modal-title-cons" className="text-sm font-black" style={{ color: aaAccent('#eab308', isDark) }}>เพิ่มสินค้าสิ้นเปลือง</h3>
                  </div>
                  <div className="px-5 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                    <div>
                      <label className={labelCls}>สินค้าสิ้นเปลือง *</label>
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                        <input value={consModalSelected ? consModalSelected.name : consModalQuery}
                          onChange={e => { setConsModalQuery(e.target.value); setConsModalSelected(null); }}
                          onFocus={() => { if (consModalSelected) { setConsModalQuery(consModalSelected.name); setConsModalSelected(null); } }}
                          className={`${inputCls} !pl-8`} placeholder="เลือกสินค้าสิ้นเปลือง" autoFocus />
                      </div>
                      {!consModalSelected && (
                        <div className={`rounded-lg border mt-1 max-h-40 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                          {consModalLoading ? (
                            <div className="flex items-center justify-center gap-2 py-4"><Loader2 size={14} className="animate-spin text-orange-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                          ) : consFilteredProducts.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center py-3">ไม่พบรายการ</p>
                          ) : consFilteredProducts.map(p => (
                            <button key={p.id} onClick={() => { setConsModalSelected(p); setConsModalQty('1'); }}
                              className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <span className="font-bold">{p.name}</span>
                              <span className="text-xs text-gray-500">{p.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>จำนวน *</label>
                      <input type="number" value={consModalQty} onChange={e => setConsModalQty(e.target.value)}
                        className={inputCls} placeholder="กรอกจำนวน" />
                    </div>
                  </div>
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setConsModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmConsModal} disabled={!consModalSelected}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Consumable group modal — full overlay matching ProClinic */}
            {consGroupModalOpen && (
              // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-cons-group" onKeyDown={e => { if (e.key === 'Escape') setConsGroupModalOpen(false); }}>
                <ModalScrollLock />
                <div className={`w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 id="modal-title-cons-group" className="text-sm font-black" style={{ color: aaAccent('#eab308', isDark) }}>เพิ่มสินค้าสิ้นเปลือง</h3>
                    <select value={consGroupSelectedId}
                      onChange={e => {
                        setConsGroupSelectedId(e.target.value);
                        const g = consGroupData.find(g => String(g.id) === e.target.value);
                        setConsGroupChecked(new Set((g?.products || []).map((_, i) => i)));
                      }}
                      className={`${selectCls} !w-auto !text-xs min-w-[180px]`}>
                      {consGroupData.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                    </select>
                  </div>
                  {/* Table */}
                  <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
                    {consGroupLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8"><Loader2 size={16} className="animate-spin text-orange-400" /><span className="text-xs text-gray-500">กำลังโหลดกลุ่มสินค้า...</span></div>
                    ) : selectedConsGroupProducts.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-8">กรุณาเลือกกลุ่มสินค้าสิ้นเปลือง</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            <th className="text-left py-1.5 pr-2 w-8"></th>
                            <th className="text-left py-1.5">รายการ ({selectedConsGroupProducts.length} รายการ)</th>
                            <th className="text-center py-1.5 w-16">จำนวน</th>
                            <th className="text-center py-1.5 w-12">หน่วย</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedConsGroupProducts.map((p, i) => (
                            <tr key={p.id} className={`border-t ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                              <td className="py-2 pr-2">
                                <input type="checkbox" checked={consGroupChecked.has(i)} onChange={() => toggleConsGroupCheck(i)}
                                  className="w-3.5 h-3.5 rounded accent-orange-500" />
                              </td>
                              <td className="py-2 font-medium">{p.name}</td>
                              <td className="py-2 text-center">{parseFloat(p.qty) || 1}</td>
                              <td className="py-2 text-center text-gray-500">{p.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {/* Selected items chips */}
                  {consGroupChecked.size > 0 && (
                    <div className={`px-5 py-2 border-t ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                      <p className="text-xs font-bold text-gray-500 mb-1.5">รายการที่เลือก ({consGroupChecked.size} รายการ)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedConsGroupProducts.map((p, i) => consGroupChecked.has(i) && (
                          <span key={i} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                            {p.name} ({parseFloat(p.qty)} {p.unit})
                            <button onClick={() => toggleConsGroupCheck(i)} className="hover:text-red-400 ml-0.5">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Footer buttons */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setConsGroupModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmConsGroup} disabled={consGroupChecked.size === 0}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Consumable table */}
            {consumables.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">{isEdit ? 'ไม่พบสินค้าสิ้นเปลือง' : 'ยังไม่มีรายการสินค้าสิ้นเปลือง — กด "สินค้าสิ้นเปลือง" เพื่อค้นหาและเพิ่ม'}</p>
            ) : (
              /* Phase 26.0c (V26.0, 2026-05-13) — Pattern β grid swap: gate
                 editable (12-col, qty input + delete) vs read-only (10-col)
                 layout on canAddNewItems instead of !isEdit. doctor-recorded
                 edits get the editable shape so admin can adjust consumable
                 qtys before finalize. */
              <div className="space-y-2">
                <div className={`grid ${canAddNewItems ? 'grid-cols-12' : 'grid-cols-10'} gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-500 px-1`}>
                  <div className={canAddNewItems ? 'col-span-6' : 'col-span-5'}>รายการ</div>
                  <div className={canAddNewItems ? 'col-span-3' : 'col-span-3'}>จำนวน</div>
                  <div className={canAddNewItems ? 'col-span-2' : 'col-span-2'}>หน่วย</div>
                  {canAddNewItems && <div className="col-span-1"></div>}
                </div>
                {consumables.map((item, i) => (
                  <div key={i} data-field={`consumables[${i}]`} className={`grid ${canAddNewItems ? 'grid-cols-12' : 'grid-cols-10'} gap-2 items-center`} {...ariaErrProps(`consumables[${i}]`)}>
                    <div className={`${canAddNewItems ? 'col-span-6' : 'col-span-5'} text-xs font-bold truncate px-1`}>{item.name}</div>
                    {!canAddNewItems ? (
                      <div className="col-span-3 text-xs text-center">{item.qty}</div>
                    ) : (
                      <input value={item.qty} onChange={e => { updateConsumable(i, 'qty', e.target.value); clearFieldError(`consumables[${i}]`); }} className={`${inputCls} col-span-3 text-center`} placeholder="1" aria-label={`จำนวนสินค้าสิ้นเปลือง ${item.name}`} />
                    )}
                    <div className={`${canAddNewItems ? 'col-span-2' : 'col-span-2'} text-xs text-gray-500 px-1`}>{item.unit}</div>
                    {canAddNewItems && (
                      <button onClick={() => removeConsumable(i)} aria-label={`ลบสินค้าสิ้นเปลือง ${item.name}`} className="col-span-1 flex items-center justify-center text-red-400 hover:text-red-300 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {/* ── Insurance (เบิกประกัน) — only when there's a sale ─────────── */}
          {showBilling && (
          <FormSection isDark={isDark}>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isInsuranceClaimed} onChange={e => setIsInsuranceClaimed(e.target.checked)} className="w-3.5 h-3.5 accent-purple-500" />
                <span className="text-xs font-bold" style={{ color: accent }}>เบิกประกัน</span>
              </label>
              {isInsuranceClaimed && (
                <>
                  <select value={benefitType} onChange={e => setBenefitType(e.target.value)} className={`${selectCls} max-w-[200px]`}>
                    <option value="">ประเภทสิทธิ</option>
                    {benefitTypes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <select value={insuranceCompanyId} onChange={e => setInsuranceCompanyId(e.target.value)} className={`${selectCls} max-w-[200px]`}>
                    <option value="">บริษัทประกัน</option>
                    {insuranceCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </>
              )}
            </div>
          </FormSection>
          )}

          {/* ── Expense Summary (สรุปค่าใช้จ่าย) ───────────────────────────── */}
          {showBilling && (
          <FormSection isDark={isDark}>
            <SectionHeader icon={DollarSign} title="สรุปค่าใช้จ่าย" isDark={isDark} accent="#10b981" />
            <div className="space-y-1 text-xs">
              {billing.lines.map((l, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>{l.name}</span>
                  <span className="font-mono">{formatBaht(l.amount)} บาท</span>
                </div>
              ))}
              <div className={`flex justify-between py-1.5 mt-1 border-t font-bold ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
                <span>ราคารวม</span>
                <span className="font-mono">{formatBaht(billing.subtotal)} บาท</span>
              </div>
              {/* Medicine discount */}
              <div className="flex justify-between items-center py-0.5">
                <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>ส่วนลดค่ายา ({billing.medDiscPct}%)</span>
                <div className="flex items-center gap-1">
                  <LocalInput type="number" value={medDiscountOverride} onCommit={setMedDiscountOverride} className={`${inputCls} w-24 text-right py-1`} placeholder={billing.medDisc.toFixed(2)} min="0" step="0.01" />
                  <span className="text-xs">บาท</span>
                </div>
              </div>
              {/* Coupon */}
              <div className="flex justify-between items-center py-0.5 flex-wrap gap-1">
                <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>คูปองส่วนลด</span>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  <input type="text" value={couponCode}
                    onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponInfo(null); setCouponLookupError(''); }}
                    className={`${inputCls} w-32 py-1 font-mono`} placeholder="กรอกรหัสคูปอง" />
                  <button type="button" disabled={!couponCode || couponLookingUp}
                    onClick={async () => {
                      setCouponLookingUp(true); setCouponLookupError('');
                      try {
                        const { findCouponByCode } = await import('../lib/scopedDataLayer.js');
                        const c = await findCouponByCode(couponCode);
                        if (!c) { setCouponInfo(null); setCouponLookupError('ไม่พบคูปอง หรือหมดอายุ'); return; }
                        setCouponInfo(c);
                        setBillDiscount(String(c.discount || 0));
                        setBillDiscountType(c.discount_type === 'baht' ? 'amount' : 'percent');
                      } catch (e) { setCouponLookupError(e.message || 'ตรวจสอบคูปองล้มเหลว'); }
                      finally { setCouponLookingUp(false); }
                    }}
                    className="px-2 py-1 text-[11px] font-bold rounded bg-emerald-700/30 border border-emerald-700/50 text-emerald-400 hover:bg-emerald-700/50 disabled:opacity-40 transition-colors">
                    {couponLookingUp ? '...' : 'ใช้'}
                  </button>
                  {couponInfo && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-700/30 border border-emerald-700/50 text-emerald-300 font-bold">
                      ✓ {couponInfo.coupon_name || 'ใช้ได้'}
                    </span>
                  )}
                  {couponLookupError && (
                    <span className="text-[10px] text-red-400">{couponLookupError}</span>
                  )}
                </div>
              </div>
              {/* Bill-end discount */}
              <div className="flex justify-between items-center py-0.5">
                <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>ส่วนลดท้ายบิล</span>
                <div className="flex items-center gap-1">
                  <LocalInput type="number" value={billDiscount} onCommit={setBillDiscount} className={`${inputCls} w-24 text-right py-1`} placeholder="0" min="0" step="0.01" />
                  <button onClick={() => setBillDiscountType(p => p === 'amount' ? 'percent' : 'amount')}
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${isDark ? 'border-[#444] text-gray-300' : 'border-gray-300 text-gray-600'}`}>
                    {billDiscountType === 'percent' ? '%' : '฿'}
                  </button>
                  <span className="text-xs">บาท</span>
                </div>
              </div>
              {/* After discount */}
              <div className={`flex justify-between py-1 font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <span>ยอดหลังหักส่วนลด</span>
                <span className="font-mono">{formatBaht(billing.afterDiscount)} บาท</span>
              </div>
              {/* Insurance deduction */}
              {isInsuranceClaimed && (
                <div className="flex justify-between items-center py-0.5">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>ยอดเบิกประกัน</span>
                  <div className="flex items-center gap-1">
                    <LocalInput type="number" value={insuranceClaimAmount} onCommit={setInsuranceClaimAmount} className={`${inputCls} w-24 text-right py-1`} placeholder="0" min="0" step="0.01" />
                    <span className="text-xs">บาท</span>
                  </div>
                </div>
              )}
              {/* Membership discount (backend mode, auto-apply) */}
              {isBackend && backendActiveMembership && billing.memPct > 0 && (
                <div className="flex justify-between items-center py-0.5">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                    ส่วนลดสมาชิก <span className="text-purple-400 font-bold">({backendActiveMembership.cardTypeName} {billing.memPct}%)</span>
                  </span>
                  <span className="font-mono text-purple-400">-{formatBaht(billing.membershipDisc)} บาท</span>
                </div>
              )}
              {/* Deposit */}
              {isBackend ? (
                <div className="py-1">
                  <DepositPicker
                    customerId={customerId}
                    value={selectedDeposits}
                    onChange={setSelectedDeposits}
                    maxAmount={Math.max(0, billing.afterMembership - billing.insDed)}
                    isDark={isDark}
                    reloadKey={depositReloadKey}
                  />
                  {billing.depDed > 0 && (
                    <div className="flex justify-between text-xs mt-1">
                      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>หักมัดจำ</span>
                      <span className="font-mono text-emerald-400">-{formatBaht(billing.depDed)} บาท</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-between items-center py-0.5">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                    ยอดนัดจำ ({formatBaht(options?.depositBalance || 0)} บาท)
                  </span>
                  <div className="flex items-center gap-1">
                    <input type="checkbox" checked={useDeposit} onChange={e => setUseDeposit(e.target.checked)} className="w-3 h-3 accent-purple-500" />
                    <LocalInput type="number" value={depositAmount} onCommit={setDepositAmount} disabled={!useDeposit} className={`${inputCls} w-24 text-right py-1 ${!useDeposit ? 'opacity-40' : ''}`} placeholder="0" min="0" step="0.01" />
                    <span className="text-xs">บาท</span>
                  </div>
                </div>
              )}
              {/* Wallet — backend mode uses WalletPicker */}
              {isBackend && (
                <div className="py-1">
                  <WalletPicker
                    customerId={customerId}
                    value={selectedWallet}
                    onChange={setSelectedWallet}
                    maxAmount={Math.max(0, billing.afterMembership - billing.insDed - billing.depDed)}
                    isDark={isDark}
                    reloadKey={walletReloadKey}
                  />
                  {billing.walDed > 0 && (
                    <div className="flex justify-between text-xs mt-1">
                      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>หัก Wallet</span>
                      <span className="font-mono text-sky-400">-{formatBaht(billing.walDed)} บาท</span>
                    </div>
                  )}
                </div>
              )}
              {/* Wallet — legacy ProClinic mode only */}
              {!isBackend && wallets.length > 0 && (
                <div className="flex justify-between items-center py-0.5">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Wallet</span>
                  <div className="flex items-center gap-1">
                    <input type="checkbox" checked={useWallet} onChange={e => setUseWallet(e.target.checked)} className="w-3 h-3 accent-purple-500" />
                    <select value={walletId} onChange={e => setWalletId(e.target.value)} disabled={!useWallet} className={`${selectCls} w-40 py-1 text-xs ${!useWallet ? 'opacity-40' : ''}`}>
                      <option value="">เลือกกระเป๋า</option>
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <LocalInput type="number" value={walletAmount} onCommit={setWalletAmount} disabled={!useWallet} className={`${inputCls} w-20 text-right py-1 ${!useWallet ? 'opacity-40' : ''}`} placeholder="0" min="0" step="0.01" />
                    <span className="text-xs">บาท</span>
                  </div>
                </div>
              )}
              {/* Net total */}
              <div className={`flex justify-between py-2 mt-1 border-t text-sm font-black ${isDark ? 'border-[#333]' : 'border-gray-200'}`} style={{ color: accent }}>
                <span>ยอดสุทธิ</span>
                <span className="font-mono">{formatBaht(billing.netTotal)} บาท</span>
              </div>
            </div>
          </FormSection>
          )}

          {/* ── Sale Note + Date — only when there's a sale ─────────────────── */}
          {showBilling && (
          <FormSection isDark={isDark}>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>หมายเหตุการขาย</label>
                <LocalTextarea value={saleNote} onCommit={setSaleNote} rows={2} className={`${inputCls} resize-none`} placeholder="กรอกหมายเหตุการขาย" />
              </div>
              <div className="w-48">
                <label className={labelCls}>วันที่ขาย *</label>
                <DateField value={saleDate} onChange={setSaleDate} locale="be" fieldClassName={inputCls} />
              </div>
            </div>
          </FormSection>
          )}

          {/* ── Payment (การชำระเงิน) — only when there's a sale ────────────── */}
          {showBilling && (
          <FormSection isDark={isDark}>
            <SectionHeader icon={CreditCard} title="การชำระเงิน" isDark={isDark} accent="#ec4899" />

            {/* Payment status — radio buttons */}
            <div className="flex items-center gap-4 mb-3">
              {[['4', 'แบ่งชำระ'], ['2', 'ชำระเต็มจำนวน'], ['0', 'ชำระภายหลัง']].map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="paymentStatus" value={val} checked={paymentStatus === val}
                    onChange={e => setPaymentStatus(e.target.value)} className="w-3.5 h-3.5 accent-purple-500" />
                  <span className="text-xs">{label}</span>
                </label>
              ))}
            </div>

            {/* Payment date + time */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div data-field="paymentDate" {...ariaErrProps('paymentDate')}>
                <label className={labelCls}>วันที่ชำระเงิน *</label>
                <DateField
                  value={paymentDate}
                  onChange={(v) => { setPaymentDate(v); clearFieldError('paymentDate'); }}
                  locale="be"
                  fieldClassName={inputCls}
                />
                <FieldError field="paymentDate" />
              </div>
              <div>
                <label className={labelCls} htmlFor="tfp-payment-time">เวลา</label>
                <input
                  id="tfp-payment-time"
                  type="time"
                  value={paymentTime}
                  onChange={e => setPaymentTime(e.target.value)}
                  className={inputCls}
                  aria-label="เวลาที่ชำระเงิน"
                />
              </div>
            </div>

            {/* Payment channels (3 rows) — visible when status is 2 or 4 */}
            {(paymentStatus === '2' || paymentStatus === '4') && (
              <div className="space-y-2 mb-3" data-field="paymentChannels" {...ariaErrProps('paymentChannels')}>
                <label className={labelCls}>ช่องทางชำระเงิน</label>
                {pmChannels.map((ch, idx) => (
                  <div key={idx} data-field={`paymentChannels[${idx}]`} className={`flex items-center gap-2 flex-wrap sm:flex-nowrap ${!ch.enabled && idx > 0 ? 'opacity-40' : ''}`}>
                    <input type="checkbox" checked={ch.enabled} onChange={e => updatePmChannel(idx, 'enabled', e.target.checked)} className="w-3.5 h-3.5 accent-purple-500 shrink-0" aria-label={`เปิดใช้ช่องทางชำระแถวที่ ${idx + 1}`} />
                    <select value={ch.method} onChange={e => { updatePmChannel(idx, 'method', e.target.value); clearFieldError('paymentChannels'); }} disabled={!ch.enabled}
                      className={`${selectCls} !w-auto flex-1 min-w-[160px]`}
                      aria-label={`เลือกช่องทางชำระแถวที่ ${idx + 1}`}>
                      <option value="">เลือกช่องทาง</option>
                      {paymentChannels.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input type="number" value={ch.amount} onChange={e => { updatePmChannel(idx, 'amount', e.target.value); clearFieldError('paymentChannels'); }} disabled={!ch.enabled}
                      className={`${inputCls} !w-32 text-right shrink-0`} placeholder={`ยอดชำระ ${idx + 1}`} min="0" step="0.01"
                      aria-label={`จำนวนเงินที่ชำระแถวที่ ${idx + 1}`} />
                  </div>
                ))}
                <FieldError field="paymentChannels" />
              </div>
            )}

            {/* Ref no + Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>เลขที่อ้างอิงใบเสร็จหน้าร้าน</label>
                <LocalInput type="text" value={refNo} onCommit={setRefNo} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>หมายเหตุ</label>
                <LocalTextarea value={note} onCommit={setNote} rows={2} className={`${inputCls} resize-none`} placeholder="หมายเหตุ" />
              </div>
            </div>
          </FormSection>
          )}

          {/* ── Sellers (พนักงานขาย) — only when there's a sale ───────────────── */}
          {showBilling && (
          <div data-field="sellers" {...ariaErrProps('sellers')}><FormSection isDark={isDark}>
            <SectionHeader icon={DollarSign} title="พนักงานขาย" isDark={isDark} accent="#f59e0b" />
            <div className="space-y-2">
              {pmSellers.map((sl, idx) => (
                <div key={idx} data-field={`sellers[${idx}]`} className={`flex items-center gap-2 flex-wrap sm:flex-nowrap ${!sl.enabled && idx > 0 ? 'opacity-40' : ''}`}>
                  <input type="checkbox" checked={sl.enabled} onChange={e => updatePmSeller(idx, 'enabled', e.target.checked)} className="w-3.5 h-3.5 accent-purple-500 shrink-0" aria-label={`เปิดใช้พนักงานขายแถวที่ ${idx + 1}`} />
                  <select value={sl.id} onChange={e => { updatePmSeller(idx, 'id', e.target.value); clearFieldError('sellers'); }} disabled={!sl.enabled}
                    className={`${selectCls} !w-auto flex-1 min-w-[140px]`}
                    aria-label={`เลือกพนักงานขายแถวที่ ${idx + 1}`}>
                    <option value="">เลือกพนักงานขาย</option>
                    {sellerOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input type="number" value={sl.percent} onChange={e => updatePmSeller(idx, 'percent', e.target.value)} disabled={!sl.enabled}
                    className={`${inputCls} !w-14 text-right shrink-0`} placeholder="%" min="0" max="100" step="0.01"
                    aria-label={`เปอร์เซ็นต์คอมมิชชันแถวที่ ${idx + 1}`} />
                  <span className="text-xs text-gray-500 shrink-0">%</span>
                  <input type="text" value={sl.total ? formatBaht(sl.total) : ''} readOnly disabled={!sl.enabled}
                    className={`${inputCls} !w-24 text-right opacity-70 shrink-0`} placeholder="คอม"
                    aria-label={`ยอดคอมมิชชันแถวที่ ${idx + 1} (คำนวณอัตโนมัติ)`} />
                  <span className="text-xs text-gray-500 shrink-0">บาท</span>
                </div>
              ))}
            </div>
            <FieldError field="sellers" />
          </FormSection></div>
          )}

          {/* Submit (bottom) */}
          <div className="flex justify-end gap-3 pt-2 pb-8">
            <button onClick={onClose} disabled={saving}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              ยกเลิก
            </button>
            {/* V136 (2026-05-31) — retro course-usage edit uses saveMode='course'
                (deduct existing course, NO auto-sale). Otherwise the canonical
                staff save (SyntheticEvent → saveMode='staff'). */}
            <button
              onClick={canEditCourseUsageRetro ? () => handleSubmit('course') : handleSubmit}
              disabled={saving}
              data-testid={canEditCourseUsageRetro ? 'tfp-save-course-retro' : 'tfp-save'}
              className="px-8 py-2.5 rounded-xl text-sm font-black bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-purple-600/20">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {saving ? 'กำลังบันทึก...' : canEditCourseUsageRetro ? 'บันทึกการใช้คอร์ส' : isEdit ? 'บันทึกการแก้ไข' : 'ยืนยันการรักษา'}
            </button>
          </div>
        </div>
        </div>{/* end LEFT panel wrapper (Phase 26.2 Task 5) */}

        {/* Phase 26.2 Task 5 — RIGHT panel: history read-only (desktop only) */}
        {selectedHistoryTreatmentId && (
          <aside className="hidden lg:block lg:w-1/2 lg:min-w-0 lg:sticky lg:top-[68px] lg:self-start lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto">
            {/* Phase 27.1-quinquies (2026-05-14) — sticky offset updated from
                top-[120px]/max-h-(100vh-140px) to top-[68px]/max-h-(100vh-88px)
                to match the new unified single-row header height (~60px + 8px
                breathing). User report: 'box ขวาเตี้ยกว่า' — fixed. */}
            <div className={`rounded-xl p-4 border border-[var(--bd)] ${isDark ? 'bg-[var(--bg-card)]' : 'bg-white shadow-sm'}`}>
              <TreatmentReadOnlyMirror
                treatmentDoc={historyFullDoc}
                theme={isDark ? 'dark' : 'light'}
                accentColor={accent}
                isLatest={historyTreatments.findIndex(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId) === 0}
                showCloseButton={true}
                onClose={() => {
                  setSelectedHistoryTreatmentId(null);
                  setHistoryFullDoc(null);
                }}
              />
            </div>
          </aside>
        )}
      </div>

      {/* ── DF Entry Modal (Phase 14.4) ─────────────────────────────────── */}
      {dfModalState && (
        <DfEntryModal
          entry={dfModalState.entry}
          treatmentCourses={treatmentCoursesForDf}
          people={treatmentPeopleForDf}
          dfGroups={dfGroups}
          staffRates={dfStaffRates}
          existingEntries={
            dfModalState.mode === 'edit'
              ? dfEntries.filter(e => e.id !== dfModalState.entry?.id)
              : dfEntries
          }
          onSave={(saved) => {
            setDfEntries(prev => {
              const idx = prev.findIndex(e => e.id === saved.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = saved;
                return next;
              }
              return [...prev, saved];
            });
            setDfModalState(null);
          }}
          onClose={() => setDfModalState(null)}
          clinicSettings={{}}
        />
      )}

      {/* ── Pick Products Modal (Phase 12.2b เลือกสินค้าตามจริง) ──────────
          Audit 2026-04-26 RP1/AV1: refactored from render-time IIFE to
          useMemo + conditional render. pickModalCourse defined at
          ~line 1696. */}
      {pickModalCourse && (
        <PickProductsModal
          courseName={pickModalCourse.courseName}
          availableProducts={pickModalCourse.availableProducts || []}
          onCancel={() => setPickModalCourseId(null)}
          onConfirm={async (picks) => {
            // Phase 12.2b follow-up (2026-04-24): resolve the
            // placeholder entry with the user's picks — populate
            // products[] and clear needsPickSelection. Courses then
            // render as standard sub-rows with remaining tracking,
            // tick-to-treat, stock deduction.
            setOptions((prev) => {
              if (!prev) return prev;
              const list = (prev.customerCourses || []).map((c) => {
                if (c.courseId !== pickModalCourseId) return c;
                return resolvePickedCourseEntry(c, picks);
              });
              return { ...prev, customerCourses: list };
            });
            // Persist to be_customers when the placeholder came from
            // an earlier-visit sale (i.e. it's a be_customers.courses
            // entry, not an in-visit ซื้อเพิ่ม item). `_beCourseId` /
            // `_beCourseIndex` are stamped by customerCoursesForForm
            // only in that case. Prefer the persistent courseId —
            // it survives index shift from resolving OTHER
            // placeholders on the same customer in the same session.
            const isPersistedPlaceholder = pickModalCourse._beCourseId != null
              || typeof pickModalCourse._beCourseIndex === 'number';
            if (saveTarget === 'backend' && customerId && isPersistedPlaceholder) {
              try {
                const { resolvePickedCourseInCustomer } = await import('../lib/scopedDataLayer.js');
                const key = pickModalCourse._beCourseId || pickModalCourse._beCourseIndex;
                await resolvePickedCourseInCustomer(customerId, key, picks);
              } catch (e) {
                console.error('[TreatmentForm] persist pick-at-treatment pick failed:', e);
              }
            }
            setPickModalCourseId(null);
          }}
        />
      )}

      {/* Phase 14.7.H follow-up I (2026-04-26) — reopen pick modal. */}
      {reopenPickGroup && (
        <PickProductsModal
          courseName={reopenPickGroup.courseName + ' (เพิ่ม)'}
          availableProducts={reopenPickGroup.options || []}
          onCancel={() => setReopenPickGroup(null)}
          onConfirm={async (picks) => {
            // Persist new picks to be_customers as additional siblings,
            // then re-fetch the customer doc + re-run mapRawCoursesToForm
            // so options.customerCourses reflects the new entries on next
            // render (without remounting TFP). Mirrors the load path at
            // lines ~595-603 of this file.
            if (saveTarget === 'backend' && customerId && reopenPickGroup.pickedFromCourseId) {
              try {
                const { addPicksToResolvedGroup, getCustomer: getBackendCustomer } =
                  await import('../lib/scopedDataLayer.js');
                await addPicksToResolvedGroup(
                  customerId,
                  reopenPickGroup.pickedFromCourseId,
                  picks,
                );
                const fresh = await getBackendCustomer(customerId);
                const newCustomerCourses = mapRawCoursesToForm(fresh?.courses || []);
                setOptions(prev => ({ ...prev, customerCourses: newCustomerCourses }));
              } catch (e) {
                console.error('[TreatmentForm] reopen-add pick failed:', e);
              }
            }
            setReopenPickGroup(null);
          }}
        />
      )}

      {/* Phase 26.1c (V26.1, 2026-05-13) — Editor attribution modal */}
      <EditAttributionModal
        isOpen={editAttributionModal.isOpen}
        onConfirm={handleEditAttributionConfirm}
        onCancel={handleEditAttributionCancel}
        isDark={isDark}
      />

        {/* Phase 26.2 Task 5 — Mobile fallback: history modal overlay (<lg) */}
        {selectedHistoryTreatmentId && (
          // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
          <div
            className="lg:hidden fixed inset-0 z-[90] bg-black/60 flex items-end sm:items-center justify-center p-2 sm:p-4 overflow-y-auto overscroll-contain"
          >
            <ModalScrollLock />
            <div
              className={`max-w-2xl w-full rounded-t-xl sm:rounded-xl max-h-[90vh] overflow-y-auto p-4 ${isDark ? 'bg-[var(--bg-card)]' : 'bg-white'}`}
              onClick={(e) => e.stopPropagation()}
              data-testid="tfp-history-modal-fallback"
            >
              <TreatmentReadOnlyMirror
                treatmentDoc={historyFullDoc}
                theme={isDark ? 'dark' : 'light'}
                accentColor={accent}
                isLatest={historyTreatments.findIndex(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId) === 0}
                showCloseButton={true}
                onClose={() => {
                  setSelectedHistoryTreatmentId(null);
                  setHistoryFullDoc(null);
                }}
              />
            </div>
          </div>
        )}
    </div>
  );
}
