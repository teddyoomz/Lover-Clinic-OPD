// ─── DeleteCustomerCascadeModal — Phase 24.0 (2026-05-06) ───────────────────
// Native-styled minimal modal for cascade-delete confirmation. Body holds
// ONE required dropdown grouping พนักงาน + แพทย์/ผู้ช่วยแพทย์ via <optgroup>
// populated from customer's branch roster. ลบถาวร button disabled until
// admin picks one authorizer.
//
// Phase 24.0-bis (2026-05-06 evening) — collapsed 3 dropdowns → 1 dropdown
// per user directive "ไม่ต้องเอามาหมดโว้ย มีช่อง Dropdown เดียวพอ แล้วเลือก
// ได้ทั้ง พนักงาน ผู้ช่วยแพทย์ และ แพทย์". Single authorizer captured for
// audit trail (with role label). Spec §5.1 + §13 superseded inline.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Trash2, X, AlertTriangle } from 'lucide-react';
import { listStaff, listDoctors } from '../../lib/scopedDataLayer.js';
import { filterStaffByBranch, filterDoctorsByBranch } from '../../lib/branchScopeUtils.js';
import { deleteCustomerViaApi, previewCustomerDeleteViaApi } from '../../lib/customerDeleteClient.js';

const labelCls = 'text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1';
const selectCls = 'w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50';

export default function DeleteCustomerCascadeModal({ customer, onClose, onDeleted }) {
  const [staffOptions, setStaffOptions] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);
  // Phase 24.0-bis — single authorizer ID. Resolved against staffOptions OR
  // doctorOptions on submit to derive role label (staff / doctor) for audit.
  const [authorizerId, setAuthorizerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Issue #1 — cascade preview row state. Loaded on mount; informational only
  // — failing to load preview does NOT block the delete (3-dropdown gate is
  // independent).
  const [cascadeCounts, setCascadeCounts] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const cancelRef = useRef(null);

  // Cancel-button autofocus on first render — matches DocumentPrintModal +
  // PermissionGroupsTab cleanup confirm pattern.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Issue #1 — fetch cascade preview counts on mount so the admin sees what
  // will be removed BEFORE clicking ลบ. Spec §5.1 + §13. Failure to load is
  // non-fatal — it surfaces as a warning banner but the ลบ button gate stays
  // independent (canSubmit only depends on the 3 dropdowns).
  useEffect(() => {
    let cancelled = false;
    if (!customer?.id) return;
    (async () => {
      try {
        const res = await previewCustomerDeleteViaApi({ customerId: customer.id });
        if (cancelled) return;
        setCascadeCounts(res?.cascadeCounts || null);
      } catch (e) {
        if (cancelled) return;
        setPreviewError(e?.userMessage || e?.message || 'ไม่ทราบสาเหตุ');
      }
    })();
    return () => { cancelled = true; };
  }, [customer?.id]);

  // Load + branch-filter staff + doctor rosters once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [staff, doctors] = await Promise.all([
          listStaff().catch(() => []),
          listDoctors().catch(() => []),
        ]);
        if (cancelled) return;
        const branchId = customer?.branchId || '';
        const branchStaff = filterStaffByBranch(staff || [], branchId)
          .filter(s => s.status !== 'พักใช้งาน');
        const branchDoctors = filterDoctorsByBranch(doctors || [], branchId)
          .filter(d => d.status !== 'พักใช้งาน');
        setStaffOptions(branchStaff.map(s => ({ value: String(s.id), label: s.name || s.id })));
        setDoctorOptions(branchDoctors.map(d => ({ value: String(d.id), label: d.name || d.id })));
      } catch (e) {
        if (!cancelled) setError('โหลดรายชื่อทีมงานไม่สำเร็จ — ' + (e?.message || ''));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customer?.branchId]);

  const isProClinicCloned = customer && customer.isManualEntry !== true;
  const fullName = useMemo(() => {
    return [customer?.prefix, customer?.firstname, customer?.lastname]
      .filter(Boolean).join(' ').trim() || '(ไม่มีชื่อ)';
  }, [customer?.prefix, customer?.firstname, customer?.lastname]);
  const hn = customer?.hn_no || customer?.id || '';

  const canSubmit = !submitting && !loading && !!authorizerId;

  async function handleDelete() {
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      // Phase 24.0-bis — resolve role from which list contains the chosen ID.
      // Staff list checked first; then doctor list. role: 'staff' | 'doctor'.
      const staffRec = staffOptions.find(s => s.value === authorizerId);
      const doctorRec = doctorOptions.find(d => d.value === authorizerId);
      const role = staffRec ? 'staff' : (doctorRec ? 'doctor' : '');
      const authorizerName = staffRec?.label || doctorRec?.label || '';
      const result = await deleteCustomerViaApi({
        customerId: customer.id,
        authorizedBy: {
          authorizerId,
          authorizerName,
          authorizerRole: role,
        },
      });
      // Phase 24.0 (post-review hardening) — wrap onDeleted so a parent
      // throw doesn't strand the modal in submitting=true (which would
      // permanently lock the close + retry buttons).
      try {
        onDeleted?.(result);
      } catch (parentErr) {
        // Parent handler errored AFTER successful server delete. Surface
        // the error but don't re-attempt the (already-completed) delete.
        setError(`ลบสำเร็จแต่ refresh ล้มเหลว: ${parentErr?.message || parentErr}`);
        setSubmitting(false);
      }
    } catch (e) {
      setError(e.userMessage || e.message || 'การลบล้มเหลว');
      setSubmitting(false);
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !submitting) onClose?.();
  }
  function handleEsc(e) {
    if (e.key === 'Escape' && !submitting) onClose?.();
  }
  useEffect(() => {
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  return (
    <div
      onClick={handleBackdrop}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[80]"
      data-testid="delete-customer-modal"
    >
      <div className="bg-[var(--bg-elevated)] rounded-xl w-full max-w-md p-6 border border-red-900/50 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-red-400 flex items-center gap-2">
            <AlertTriangle size={18} /> ยืนยันลบลูกค้า
          </h3>
          <button onClick={onClose} disabled={submitting} className="text-gray-500 hover:text-white disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-4 leading-relaxed">
          ยืนยันลบลูกค้า <span className="font-bold text-white">{fullName}</span>
          {' '}<span className="text-xs text-gray-500">(HN: {hn})</span>
          {' '}พร้อมประวัติทั้งหมด?
          <br />
          <span className="text-xs text-red-400">การลบเป็นการกระทำถาวร ไม่สามารถกู้คืนได้</span>
        </p>

        {isProClinicCloned && (
          <div className="mb-4 p-2 bg-amber-950/20 border border-amber-900/40 rounded text-xs text-amber-300 font-mono">
            ⚠️ ลูกค้าจาก ProClinic sync — การลบจะไม่ส่งผลต่อ ProClinic; หากต้องการกู้คืนต้องสร้างใหม่ด้วยมือ
          </div>
        )}

        {/* Issue #1 — cascade preview row (counts BEFORE confirm) */}
        {cascadeCounts && (
          <div data-testid="delete-customer-cascade-preview" className="mb-4 p-2 bg-[var(--bg-card)] border border-[var(--bd)] rounded text-xs text-gray-300 font-mono">
            <div className="text-[10px] text-[var(--tx-muted)] uppercase mb-1">ข้อมูลที่จะถูกลบ:</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span>{cascadeCounts.treatments} การรักษา</span>
              <span>{cascadeCounts.sales} การขาย</span>
              <span>{cascadeCounts.deposits} มัดจำ</span>
              <span>{cascadeCounts.appointments} นัดหมาย</span>
              <span>{cascadeCounts.wallets} wallet</span>
              <span>{cascadeCounts.walletTransactions} wallet tx</span>
              <span>{cascadeCounts.memberships} membership</span>
              <span>{cascadeCounts.pointTransactions} point tx</span>
              <span>{cascadeCounts.courseChanges} course changes</span>
              <span>{cascadeCounts.linkRequests} link requests</span>
              <span>{cascadeCounts.customerLinkTokens} link tokens</span>
            </div>
          </div>
        )}
        {previewError && (
          <div data-testid="delete-customer-preview-error" className="mb-4 p-2 bg-amber-950/20 border border-amber-900/40 rounded text-xs text-amber-300">
            โหลด preview ไม่สำเร็จ: {previewError}
          </div>
        )}

        {/* Phase 24.0-bis — single dropdown grouping พนง + แพทย์/ผู้ช่วยแพทย์ via <optgroup>.
            Admin picks ONE authorizer (any role). Server cross-validates ID
            against be_staff OR be_doctors at customer.branchId. */}
        <div className="mb-4" data-testid="delete-customer-authorizers">
          <label className={labelCls}>ผู้รับผิดชอบ <span className="text-red-500">*</span></label>
          <select
            value={authorizerId}
            onChange={e => setAuthorizerId(e.target.value)}
            disabled={submitting || loading}
            className={selectCls}
            data-testid="delete-customer-authorizer-select"
          >
            <option value="">-- เลือกผู้รับผิดชอบ --</option>
            {staffOptions.length > 0 && (
              <optgroup label="พนักงาน">
                {staffOptions.map(o => <option key={`s-${o.value}`} value={o.value}>{o.label}</option>)}
              </optgroup>
            )}
            {doctorOptions.length > 0 && (
              <optgroup label="แพทย์ / ผู้ช่วยแพทย์">
                {doctorOptions.map(o => <option key={`d-${o.value}`} value={o.value}>{o.label}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-950/30 border border-red-900/50 rounded text-xs text-red-400 font-mono">
            ⚠️ {error}
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-[var(--bd)]">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 rounded-lg font-bold text-xs uppercase border border-[var(--bd-strong)] disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleDelete}
            disabled={!canSubmit}
            data-testid="delete-customer-confirm"
            className="flex-1 px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-lg font-bold text-xs uppercase disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting
              ? <><Loader2 size={14} className="animate-spin" /> กำลังลบ...</>
              : <><Trash2 size={14} /> ลบถาวร</>}
          </button>
        </div>
      </div>
    </div>
  );
}
