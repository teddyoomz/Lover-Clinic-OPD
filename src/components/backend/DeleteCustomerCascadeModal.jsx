// ─── DeleteCustomerCascadeModal — Phase 24.0 (2026-05-06) ───────────────────
// Native-styled minimal modal for cascade-delete confirmation. Body holds
// 3 required dropdowns (พนง / ผู้ช่วย / แพทย์) populated from customer's
// branch roster. ลบถาวร button disabled until all 3 selected.
//
// Spec: docs/superpowers/specs/2026-05-06-customer-delete-button-design.md §5.1.

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
  const [staffId, setStaffId] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [doctorId, setDoctorId] = useState('');
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

  const canSubmit = !submitting && !loading && staffId && assistantId && doctorId;

  async function handleDelete() {
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      const staffRec = staffOptions.find(s => s.value === staffId);
      const assistantRec = doctorOptions.find(d => d.value === assistantId);
      const doctorRec = doctorOptions.find(d => d.value === doctorId);
      const result = await deleteCustomerViaApi({
        customerId: customer.id,
        authorizedBy: {
          staffId, staffName: staffRec?.label || '',
          assistantId, assistantName: assistantRec?.label || '',
          doctorId, doctorName: doctorRec?.label || '',
        },
      });
      onDeleted?.(result);
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

        {/* 3 required dropdowns — branch-scoped roster */}
        <div className="space-y-3 mb-4" data-testid="delete-customer-authorizers">
          <div>
            <label className={labelCls}>พนักงาน <span className="text-red-500">*</span></label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)} disabled={submitting || loading} className={selectCls}>
              <option value="">-- เลือกพนักงาน --</option>
              {staffOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ผู้ช่วยแพทย์ <span className="text-red-500">*</span></label>
            <select value={assistantId} onChange={e => setAssistantId(e.target.value)} disabled={submitting || loading} className={selectCls}>
              <option value="">-- เลือกผู้ช่วยแพทย์ --</option>
              {doctorOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>แพทย์ <span className="text-red-500">*</span></label>
            <select value={doctorId} onChange={e => setDoctorId(e.target.value)} disabled={submitting || loading} className={selectCls}>
              <option value="">-- เลือกแพทย์ --</option>
              {doctorOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
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
