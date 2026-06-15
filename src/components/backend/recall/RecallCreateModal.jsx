import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search } from 'lucide-react';
import { RecallSlotCard } from './RecallSlotCard.jsx';
import {
  validateRecallCreate,
  normalizeRecallSlot,
} from '../../../lib/recallValidation.js';
import {
  createRecall,
  createRecallPair,
  getAllCustomers,
} from '../../../lib/scopedDataLayer.js';
import { thaiTodayISO } from '../../../utils.js';
import { resolveCustomerDisplayName } from '../../../lib/customerDisplayName.js'; // 2026-06-16 Part B — resolve ALL name shapes (kiosk firstNameTh, etc.)
import PhoneLink from '../../PhoneLink.jsx';

/**
 * Phase 29 (2026-05-14) — Create Recall modal with 2-slot design.
 *
 * Each slot toggles independently; ≥1 must be enabled. Save dispatches:
 *   - createRecall (single, when only 1 slot enabled)
 *   - createRecallPair (atomic batch, when both enabled — cross-stamps
 *     pairedRecallId on both)
 *
 * Auto-suggest: parent passes `masterDataSuggestions` keyed by slotType
 * with `{days, reason, sourceLabel}`. Modal pre-fills the slot's date +
 * reason on mount when present.
 *
 * Inline-learn: when admin sets values for a slot that had no master
 * suggestion, the slot's `saveToMaster` checkbox surfaces. Parent's
 * `onSaveToMaster` callback is invoked after recall creation (parent
 * decides where to write — be_products or be_courses).
 *
 * Anti-flicker discipline (spec §5.6):
 *   - Optimistic close on save success (parent's listener updates list)
 *   - Validation banner inline, no modal-level state churn
 *
 * @param {object} props
 * @param {object} props.customer { id, displayName, phone, lineUserId, hn }
 * @param {object} [props.treatmentContext] { treatmentId, date, summary }
 * @param {object} [props.sourceContext] { productId, productName, courseId, courseName }
 * @param {object} [props.masterDataSuggestions]
 *   DEPRECATED (Phase 29.22) — kept for backward compat. Phase 29 baseline
 *   auto-fill was driven by per-product/course followUpAfterDays fields;
 *   Phase 29.22 moved presets to be_recall_cases (see `recallCases` prop).
 * @param {Array<{caseId,caseName,defaultDays}>} [props.recallCases]
 *   Phase 29.22 — list of recall case presets (universal be_recall_cases).
 *   Passed down to RecallSlotCard → RecallCaseSelectField typeahead.
 * @param {function} props.onClose () => void
 * @param {function} [props.onCreated] (createdIds) => void — fires after successful save
 * @param {function} [props.onSaveAsRecallCase] ({slotType, days, reason}) => Promise<void>
 *   Phase 29.22 — renamed from `onSaveToMaster`. When slot.saveToMaster
 *   checked + creation succeeds, invokes for each opt-in slot. Parent
 *   handles dedup + saveRecallCase to be_recall_cases.
 * @param {function} [props.onSaveToMaster]
 *   DEPRECATED (Phase 29.22) — kept for backward compat. When defined +
 *   `onSaveAsRecallCase` not, it receives the same args. Callers should
 *   migrate to the new name.
 */
export function RecallCreateModal({
  customer: customerProp,
  treatmentContext = null,
  sourceContext = null,
  masterDataSuggestions = {},
  recallCases = [],
  onClose,
  onCreated,
  onSaveAsRecallCase,
  onSaveToMaster, // DEPRECATED
}) {
  const todayISO = thaiTodayISO();

  // Phase 29.21-fix2 (2026-05-14) — customer picker for standalone-launch case.
  // When opened from Backend "+ ตั้ง Recall ใหม่" or Frontend pill,
  // customerProp = null; admin needs to search + pick a customer first.
  // When opened from CDV / treatment-history-chip, customerProp is pre-filled
  // → search UI hidden; header shows customer immediately.
  const [pickedCustomer, setPickedCustomer] = useState(null);
  const customer = customerProp || pickedCustomer;

  const [customerSearch, setCustomerSearch] = useState('');
  const [allCustomers, setAllCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const customerSearchRef = useRef(null);

  // Phase 29.21-fix2 Playwright finding A1: autoFocus attribute doesn't
  // fire when the input is initially DISABLED (during customers loading).
  // Manually focus when customers finish loading + the picker is still
  // visible. Uses ref so we focus even after re-render.
  useEffect(() => {
    if (customer) return; // picker hidden
    if (customersLoading) return;
    // Defer to next tick so React renders the enabled state first
    const t = setTimeout(() => {
      try { customerSearchRef.current?.focus(); } catch (e) { /* defensive */ }
    }, 30);
    return () => clearTimeout(t);
  }, [customer, customersLoading]);

  // Lazy-load customers ONLY when no customer pre-filled (saves a heavy fetch
  // when modal is launched from CDV / treatment-history context).
  useEffect(() => {
    if (customerProp) return; // already have one — skip fetch
    if (allCustomers.length > 0) return; // already loaded
    setCustomersLoading(true);
    getAllCustomers()
      .then((c) => setAllCustomers(c || []))
      .catch((err) => {
        console.error('[RecallCreateModal] getAllCustomers failed:', err);
        setAllCustomers([]);
      })
      .finally(() => setCustomersLoading(false));
  }, [customerProp, allCustomers.length]);

  const filteredCustomers = useMemo(() => {
    if (customer) return []; // already picked
    if (!customerSearch.trim()) return allCustomers.slice(0, 30);
    const q = customerSearch.trim().toLowerCase();
    return allCustomers
      .filter((c) => {
        const pd = c?.patientData || {};
        // 2026-06-16 — resolve ALL name shapes (kiosk firstNameTh/firstname) so
        // search-by-name works for customers the old composition missed.
        const name = (resolveCustomerDisplayName(c) || `${pd.prefix || ''} ${pd.firstName || ''} ${pd.lastName || ''}`).trim().toLowerCase();
        const hn = String(c?.proClinicHN || c?.hn || '').toLowerCase();
        const phone = String(pd.phone || c?.phone || '').toLowerCase();
        return name.includes(q) || hn.includes(q) || phone.includes(q);
      })
      .slice(0, 30);
  }, [allCustomers, customerSearch, customer]);

  const _shapeCustomer = (c) => {
    const pd = c?.patientData || {};
    // 2026-06-16 Part B — resolve via the canonical resolver (handles kiosk
    // firstNameTh / top-level firstname), so the picked customer's name + the
    // snapshotted recall.customerName are correct at create time.
    const fullName = resolveCustomerDisplayName(c) || `${pd.prefix || ''} ${pd.firstName || ''} ${pd.lastName || ''}`.trim();
    return {
      id: c.id || c.proClinicId || '',
      displayName: fullName,
      name: fullName,
      phone: pd.phone || c?.phone || '',
      lineUserId: c?.lineUserId || null,
      hn: c?.proClinicHN || c?.hn || null,
    };
  };

  // Initialize each slot — auto-suggest pre-fill when master data exists.
  const initSlot = useCallback((slotType) => {
    const suggestion = masterDataSuggestions?.[slotType];
    if (suggestion?.days != null) {
      // Pre-fill: enable + compute date from today + reason from master
      const daysMs = todayISO ? new Date(`${todayISO}T12:00:00Z`).getTime() : Date.now();
      const futureMs = daysMs + suggestion.days * 86400000;
      const fd = new Date(futureMs);
      const y = fd.getUTCFullYear();
      const mo = String(fd.getUTCMonth() + 1).padStart(2, '0');
      const d = String(fd.getUTCDate()).padStart(2, '0');
      return {
        enabled: true,
        recallDate: `${y}-${mo}-${d}`,
        reason: suggestion.reason || '',
        saveToMaster: false,
      };
    }
    // No master data — disabled by default unless launched from treatment
    return {
      enabled: !!treatmentContext && slotType === 'aftercare', // default aftercare-on when from treatment
      recallDate: '',
      reason: '',
      saveToMaster: false,
    };
  }, [masterDataSuggestions, todayISO, treatmentContext]);

  const [slot1, setSlot1] = useState(() => initSlot('aftercare'));
  const [slot2, setSlot2] = useState(() => initSlot('revisit'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Re-initialize when master data arrives async (parent loads after open)
  useEffect(() => {
    if (masterDataSuggestions?.aftercare && !slot1.recallDate) {
      setSlot1(initSlot('aftercare'));
    }
    if (masterDataSuggestions?.revisit && !slot2.recallDate) {
      setSlot2(initSlot('revisit'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterDataSuggestions]);

  // ESC closes modal
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Enabled-slot count for live footer summary
  const enabledCount = (slot1.enabled ? 1 : 0) + (slot2.enabled ? 1 : 0);

  const validationResult = validateRecallCreate({
    customerId: customer?.id,
    slot1: normalizeRecallSlot(slot1),
    slot2: normalizeRecallSlot(slot2),
  });
  const validationErrors = validationResult.errors;
  const canSave = validationResult.ok && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setError('');
    setSaving(true);
    try {
      const baseCustomerFields = {
        customerId: customer.id,
        // 2026-06-16 Part B — snapshot a resolved name going forward (live-resolve
        // at render is still primary per V113; this keeps new snapshots correct).
        customerName: resolveCustomerDisplayName(customer) || customer.displayName || customer.name || '',
        customerPhone: customer.phone || '',
        customerLineUserId: customer.lineUserId || null,
        customerHN: customer.hn || customer.HN || null,
      };
      const baseSourceFields = {
        sourceTreatmentId: treatmentContext?.treatmentId || null,
        sourceProductId: sourceContext?.productId || null,
        sourceProductName: sourceContext?.productName || null,
        sourceCourseId: sourceContext?.courseId || null,
        sourceCourseName: sourceContext?.courseName || null,
        source: treatmentContext ? 'from-treatment-row' : 'manual',
      };

      const norm1 = normalizeRecallSlot(slot1);
      const norm2 = normalizeRecallSlot(slot2);

      let createdIds = [];
      if (slot1.enabled && slot2.enabled) {
        const { id1, id2 } = await createRecallPair({
          ...baseCustomerFields,
          ...baseSourceFields,
          slot1: { recallDate: norm1.recallDate, reason: norm1.reason },
          slot2: { recallDate: norm2.recallDate, reason: norm2.reason },
        });
        createdIds = [id1, id2];
      } else if (slot1.enabled) {
        const { id } = await createRecall({
          ...baseCustomerFields,
          ...baseSourceFields,
          slotType: 'aftercare',
          recallDate: norm1.recallDate,
          reason: norm1.reason,
        });
        createdIds = [id];
      } else if (slot2.enabled) {
        const { id } = await createRecall({
          ...baseCustomerFields,
          ...baseSourceFields,
          slotType: 'revisit',
          recallDate: norm2.recallDate,
          reason: norm2.reason,
        });
        createdIds = [id];
      }

      // Phase 29.22 (2026-05-14) — inline-learn fires on the NEW callback
      // name `onSaveAsRecallCase` (writes to be_recall_cases). Falls back
      // to legacy `onSaveToMaster` if only the old name is passed (backward
      // compat — callers should migrate).
      const saveCb = typeof onSaveAsRecallCase === 'function'
        ? onSaveAsRecallCase
        : (typeof onSaveToMaster === 'function' ? onSaveToMaster : null);
      if (saveCb) {
        try {
          if (slot1.enabled && slot1.saveToMaster) {
            await saveCb({
              slotType: 'aftercare',
              days: computeDaysBetween(todayISO, norm1.recallDate),
              reason: norm1.reason,
            });
          }
          if (slot2.enabled && slot2.saveToMaster) {
            await saveCb({
              slotType: 'revisit',
              days: computeDaysBetween(todayISO, norm2.recallDate),
              reason: norm2.reason,
            });
          }
        } catch (mEx) {
          // Non-fatal — recalls already created. Log + warn but don't block close.
          console.warn('[RecallCreateModal] inline-learn save failed (continuing):', mEx);
        }
      }

      onCreated?.(createdIds);
      onClose?.();
    } catch (ex) {
      console.error('[RecallCreateModal] save failed:', ex);
      setError(ex?.message || 'บันทึก Recall ไม่สำเร็จ');
      setSaving(false);
    }
  };

  // 2026-05-20 (recall modal flicker→freeze) — portal to document.body so the
  // fixed overlay escapes any transformed ancestor (V86 auto-glow applies a
  // hover `transform` to rounded cards in new-menu backend-content; RecallCard's
  // rounded-xl wrapper would otherwise become this fixed modal's containing
  // block → confine + hover-feedback flicker). AV98.
  return createPortal(
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      data-testid="recall-create-modal"
    >
      <div
        className="bg-[var(--bg-card)] border-2 border-[var(--bd-strong)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--bd-strong)] px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--tx-primary)]">🔔 ตั้ง Recall ใหม่</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-create-close"
            className="w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)]"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Customer header / picker
              Phase 29.21-fix2: when no customer pre-filled, show search input
              + filtered list. Once picked (or pre-filled), show header. */}
          {customer ? (
            <div className="p-3 rounded-lg bg-teal-500/[0.06] border border-teal-500/25">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-teal-500/20 flex items-center justify-center text-[11px] font-bold text-teal-300 flex-shrink-0">
                  {(customer.displayName || customer.name || '?')[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-[var(--tx-primary)]" data-testid="recall-create-customer-name">
                      {customer.displayName || customer.name || '—'}
                    </span>
                    {customer.id && (
                      <span className="font-mono text-[9px] text-[var(--tx-muted)]">{customer.id}</span>
                    )}
                    {customer.lineUserId && (
                      <span className="text-[8px] px-1 py-0 bg-green-500/15 text-green-300 border border-green-500/30 rounded font-bold">L</span>
                    )}
                    {/* Allow changing pick when admin chose the wrong customer (only when not pre-filled by parent) */}
                    {!customerProp && (
                      <button
                        type="button"
                        onClick={() => setPickedCustomer(null)}
                        data-testid="recall-create-customer-clear"
                        className="ml-auto text-[var(--tx-muted)] hover:text-red-400 text-[10px]"
                        aria-label="เลือกลูกค้าใหม่"
                        title="เลือกลูกค้าใหม่"
                      >
                        เปลี่ยน
                      </button>
                    )}
                  </div>
                  {customer.phone && (
                    <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">📞 <PhoneLink value={customer.phone}>{customer.phone}</PhoneLink></div>
                  )}
                  {customer.hn && (
                    <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">HN {customer.hn}</div>
                  )}
                  {treatmentContext && (
                    <div className="text-[10px] text-teal-300 mt-0.5">
                      จากการรักษา {treatmentContext.date || ''} · {treatmentContext.summary || ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--bd)]">
              <label className="block text-[10px] font-bold text-[var(--tx-muted)] mb-1.5 uppercase tracking-wider">
                เลือกลูกค้า <span className="text-red-300">*</span>
              </label>
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
                <input
                  ref={customerSearchRef}
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder={customersLoading ? 'กำลังโหลดลูกค้า...' : 'ค้นหา (ชื่อ / HN / เบอร์โทร)'}
                  disabled={customersLoading}
                  data-testid="recall-create-customer-search"
                  className="w-full pl-7 pr-2 py-2 rounded-lg text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
                />
              </div>
              {/* Filtered customer list */}
              {!customersLoading && filteredCustomers.length > 0 && (
                <div
                  className="mt-1.5 max-h-48 overflow-y-auto border-2 border-[var(--bd-strong)] rounded-lg bg-[var(--bg-input)] shadow-md"
                  data-testid="recall-create-customer-list"
                >
                  {filteredCustomers.map((c) => {
                    const pd = c?.patientData || {};
                    const name = `${pd.prefix || ''} ${pd.firstName || ''} ${pd.lastName || ''}`.trim() || '—';
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setPickedCustomer(_shapeCustomer(c))}
                        data-testid={`recall-create-customer-pick-${c.id}`}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between gap-2 border-b border-[var(--bd)] last:border-b-0"
                      >
                        <span className="text-[var(--tx-primary)] truncate flex-1">
                          {name}
                          {c.lineUserId && (
                            <span className="ml-1.5 inline-block text-[8px] px-1 py-0 bg-green-500/15 text-green-300 border border-green-500/30 rounded font-bold align-middle">L</span>
                          )}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--tx-muted)] flex-shrink-0">
                          {c.proClinicHN || c.hn || ''} {pd.phone ? <>· <PhoneLink value={pd.phone}>{pd.phone}</PhoneLink></> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {!customersLoading && customerSearch.trim() && filteredCustomers.length === 0 && (
                <div
                  className="mt-1.5 px-3 py-2 text-[11px] text-[var(--tx-muted)] italic"
                  data-testid="recall-create-customer-no-results"
                >
                  ไม่พบลูกค้าที่ตรงกับคำค้น "{customerSearch}"
                </div>
              )}
            </div>
          )}

          {/* Slot 1 */}
          <RecallSlotCard
            slotType="aftercare"
            value={slot1}
            onChange={(patch) => setSlot1(prev => ({ ...prev, ...patch }))}
            todayISO={todayISO}
            masterDataSuggestion={masterDataSuggestions?.aftercare || null}
            recallCases={recallCases}
          />

          {/* Slot 2 */}
          <RecallSlotCard
            slotType="revisit"
            value={slot2}
            onChange={(patch) => setSlot2(prev => ({ ...prev, ...patch }))}
            todayISO={todayISO}
            masterDataSuggestion={masterDataSuggestions?.revisit || null}
            recallCases={recallCases}
          />

          {/* Validation banner */}
          {validationErrors.includes('at-least-one-slot-required') && (
            <div
              className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300"
              data-testid="recall-create-validation-banner"
            >
              ⚠ กรุณาเปิดอย่างน้อย 1 slot
            </div>
          )}
          {validationErrors.includes('customer-required') && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300" data-testid="recall-create-customer-required">
              ⚠ กรุณาเลือกลูกค้าก่อน
            </div>
          )}

          {error && (
            <div
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300"
              data-testid="recall-create-error"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--bg-card)] border-t border-[var(--bd-strong)] px-4 py-3 flex items-center justify-between gap-3">
          <div
            className="text-[11px] text-[var(--tx-muted)]"
            data-testid="recall-create-summary"
          >
            📋 จะสร้าง <span className="font-bold text-[var(--tx-primary)]">{enabledCount}</span> recall
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              data-testid="recall-create-cancel"
              className="px-4 py-2 rounded-lg text-xs font-semibold text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]"
              disabled={saving}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              data-testid="recall-create-save"
              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'กำลังบันทึก…' : `บันทึก ${enabledCount} Recall`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: days delta between two ISO dates (Bangkok-stable via midday-UTC parse)
// — duplicated here intentionally to avoid an extra import; matches the
// recallResolvers internal convention.
// ─────────────────────────────────────────────────────────────────────────────
function computeDaysBetween(fromISO, toISO) {
  const parse = (iso) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) : null;
  };
  const a = parse(fromISO);
  const b = parse(toISO);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

export default RecallCreateModal;
