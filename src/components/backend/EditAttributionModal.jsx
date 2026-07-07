import { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { listStaff, listDoctors, listBranches, updateBackendTreatment } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

/**
 * Phase 26.1 (V26.1, 2026-05-13) — Editor Attribution Modal.
 *
 * Triggered by TFP handleSubmit when mode === 'edit' && saveMode === 'staff'
 * (Phase 26.1c integration). User picks one person (staff/doctor/assistant
 * from current branch) → onConfirm fires with `{uid, name, role}` →
 * handleSubmit re-invokes with editorContext.
 *
 * Single-picker merged-list per spec § 5.3 (Q2 locked = "Single picker, merged").
 *
 * Role mapping:
 * - be_doctors with position='แพทย์' → role 'doctor'
 * - be_doctors with position='ผู้ช่วยแพทย์' → role 'assistant'
 * - be_staff (any position) → role 'staff'
 *
 * Branch filter: be_staff + be_doctors are universal collections (per BSA);
 * docs carry branchIds[] (membership). Filter inline against selectedBranchId.
 *
 * Props:
 * - isOpen: boolean — render gate
 * - onConfirm({uid, name, role}): function — called when user clicks "บันทึก"
 *   with valid selection
 * - onCancel(): function — called on backdrop click, X button, or "ยกเลิก"
 * - isDark: boolean — theme flag
 */
export default function EditAttributionModal({ isOpen, onConfirm, onCancel, isDark }) {
  // AV205 — gate on isOpen (early return below runs after hooks)
  useModalScrollLock(!!isOpen);
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [allStaff, setAllStaff] = useState([]);
  const [allDoctors, setAllDoctors] = useState([]);
  const [pickedId, setPickedId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPickedId('');  // reset on close
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([listStaff(), listDoctors()])
      .then(([staff, doctors]) => {
        if (cancelled) return;
        setAllStaff(Array.isArray(staff) ? staff : []);
        setAllDoctors(Array.isArray(doctors) ? doctors : []);
      })
      .catch(() => {
        if (!cancelled) {
          setAllStaff([]);
          setAllDoctors([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Branch filter (inline) — be_staff + be_doctors are universal per BSA.
  // Each doc has branchIds[] (membership array) OR legacy branchId field.
  const inBranch = (doc) => {
    if (!selectedBranchId) return true;  // no filter
    if (Array.isArray(doc.branchIds) && doc.branchIds.length > 0) {
      return doc.branchIds.includes(selectedBranchId);
    }
    if (doc.branchId) {
      return String(doc.branchId) === String(selectedBranchId);
    }
    return false;  // doc has neither → filtered out
  };

  // Merge into single list with role labels (spec § 5.3 + Q2)
  const merged = useMemo(() => {
    const items = [];
    allDoctors.filter(inBranch).forEach(d => {
      const isAssistant = d.position === 'ผู้ช่วยแพทย์';
      items.push({
        id: String(d.id),
        name: d.name || '',
        role: isAssistant ? 'assistant' : 'doctor',
        roleLabel: isAssistant ? 'ผู้ช่วย' : 'แพทย์',
      });
    });
    allStaff.filter(inBranch).forEach(s => {
      items.push({
        id: String(s.id),
        name: s.name || '',
        role: 'staff',
        roleLabel: 'พนักงาน',
      });
    });
    return items;
  }, [allStaff, allDoctors, selectedBranchId]);

  if (!isOpen) return null;

  const handleConfirmClick = () => {
    const picked = merged.find(m => m.id === pickedId);
    if (!picked) return;
    onConfirm({
      uid: picked.id,
      name: picked.name,
      role: picked.role,
    });
  };

  return (
    <div
      data-testid="edit-attribution-modal"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 overflow-y-auto overscroll-contain"
      onClick={onCancel}
    >
      <div
        className={`max-w-md w-full rounded-xl p-5 shadow-2xl ${isDark ? 'bg-[var(--bg-card)] text-[var(--tx-primary)]' : 'bg-white text-gray-900'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">เลือกผู้แก้ไขบันทึกการรักษา</h3>
          <button
            onClick={onCancel}
            data-testid="edit-attribution-cancel"
            className="p-1 hover:opacity-70"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        <p className={`text-xs mb-3 ${isDark ? 'text-[var(--tx-muted)]' : 'text-gray-500'}`}>
          เลือกชื่อ พนักงาน / ผู้ช่วย / แพทย์ ที่เป็นผู้แก้ไขบันทึกการรักษานี้
          (กรองตามสาขาที่เลือก)
        </p>

        <select
          data-testid="edit-attribution-picker"
          value={pickedId}
          onChange={(e) => setPickedId(e.target.value)}
          disabled={loading}
          className={`w-full px-3 py-2 rounded border text-sm ${isDark ? 'bg-[var(--bg-elevated)] border-[var(--bd)]' : 'bg-gray-50 border-gray-300'}`}
        >
          <option value="">— เลือกผู้แก้ไข —</option>
          {merged.map(m => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.roleLabel}
            </option>
          ))}
        </select>

        {loading && (
          <p className="text-xs mt-2 opacity-60">กำลังโหลดรายชื่อ...</p>
        )}

        <div className="flex gap-2 mt-5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={`px-4 py-2 rounded border text-sm ${isDark ? 'border-[var(--bd)]' : 'border-gray-300'}`}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={!pickedId}
            data-testid="edit-attribution-confirm"
            className="px-4 py-2 rounded bg-purple-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-purple-500 transition-colors"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Phase 27.0 Task 6 — Branch correction modal.
 * Lets admin correct a treatment's branchId after the fact (fix historical mis-tags).
 * Props: treatment {id, detail}, onClose, onSaved
 */
export function EditTreatmentBranchModal({ treatment, onClose, onSaved }) {
  useModalScrollLock(true); // AV205 — renders only while open
  const [editedBranchId, setEditedBranchId] = useState(treatment?.detail?.branchId || '');
  const [branches, setBranches] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listBranches({ allBranches: true })
      .then(list => { if (!cancelled) setBranches(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setBranches([]); });
    return () => { cancelled = true; };
  }, []);

  const currentBranchName = branches.find(b => b.branchId === treatment?.detail?.branchId)?.name || '—';
  const newBranchName = branches.find(b => b.branchId === editedBranchId)?.name || '—';
  const hasChange = editedBranchId !== (treatment?.detail?.branchId || '');

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      await updateBackendTreatment(treatment.id, {
        ...treatment.detail,
        branchId: editedBranchId,
      });
      // Phase 27.0-bis (2026-05-14) — pass new branchId to parent so it can
      // update its display state immediately (optimistic refresh) instead
      // of waiting for a refetch. User report: 'ไม่แสดงผลทันที' — fixed.
      onSaved(editedBranchId);
    } catch (e) {
      setError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    // Phase 27.0-bis (2026-05-14, user iteration) — proper modal chrome
    // per user directive "UI ปุ่ม ตอนกดแก้ไขสาขาน่าเกลียดมาก". Was bare
    // <div> with raw select + buttons; now matches project canonical modal
    // pattern (fixed overlay, centered card, header/body/footer, accent
    // styling consistent with other backend modals).
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto overscroll-contain"
      data-testid="edit-treatment-branch-modal-overlay"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--bd)] bg-[var(--bg-card)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center gap-3 bg-orange-500/5">
          <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-400">
            🏥
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-[var(--tx-heading)]">แก้ไขสาขาที่รักษา</h2>
            <p className="text-xs text-[var(--tx-muted)] mt-0.5">สำหรับ admin แก้ไขประวัติเก่าให้สาขาถูกต้อง</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Current → New summary */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-md bg-[var(--bg-hover)] text-[var(--tx-muted)] font-semibold">
              เดิม: {currentBranchName}
            </span>
            {hasChange && (
              <>
                <span className="text-[var(--tx-muted)]">→</span>
                <span className="px-2 py-1 rounded-md bg-orange-500/15 text-orange-400 font-bold">
                  ใหม่: {newBranchName}
                </span>
              </>
            )}
          </div>

          {/* Branch picker */}
          <label className="block">
            <span className="text-xs font-semibold text-[var(--tx-muted)] block mb-1.5">
              เลือกสาขาที่ถูกต้อง
            </span>
            <select
              aria-label="สาขาที่รักษา"
              value={editedBranchId}
              onChange={e => setEditedBranchId(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--bd)] bg-[var(--bg-input)] text-[var(--tx-primary)] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:opacity-50"
            >
              <option value="">— เลือกสาขา —</option>
              {branches.map(b => (
                <option key={b.branchId} value={b.branchId}>{b.name}</option>
              ))}
            </select>
          </label>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--bd)] flex items-center justify-end gap-2 bg-[var(--bg-hover)]/30">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-bold border border-[var(--bd)] text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] transition-all disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChange || !editedBranchId}
            className="px-5 py-2 rounded-lg text-xs font-black bg-orange-500 text-white hover:bg-orange-400 shadow-lg shadow-orange-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </div>
    </div>
  );
}
