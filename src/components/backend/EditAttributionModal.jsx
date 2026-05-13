import { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { listStaff, listDoctors, listBranches, updateBackendTreatment } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

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
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60"
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
  const [editedBranchId, setEditedBranchId] = useState(treatment?.detail?.branchId || '');
  const [branches, setBranches] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listBranches({ allBranches: true })
      .then(list => { if (!cancelled) setBranches(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setBranches([]); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateBackendTreatment(treatment.id, {
        ...treatment.detail,
        branchId: editedBranchId,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <select
        aria-label="สาขาที่รักษา"
        value={editedBranchId}
        onChange={e => setEditedBranchId(e.target.value)}
      >
        {branches.map(b => (
          <option key={b.branchId} value={b.branchId}>{b.name}</option>
        ))}
      </select>
      <button onClick={handleSave} disabled={saving}>บันทึก</button>
      <button onClick={onClose}>ยกเลิก</button>
    </div>
  );
}
