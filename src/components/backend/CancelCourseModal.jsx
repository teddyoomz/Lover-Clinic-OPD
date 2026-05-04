// ─── CancelCourseModal — Phase 16.5 (2026-04-29) ───────────────────────────
// Soft-cancel a customer's course (no money refund). User selects from
// RemainingCourseTab kebab → "ยกเลิก".
//
// Phase 16.5-ter (2026-04-29) — required staff dropdown (listStaffByBranch,
// branch-filtered). Staff stored as id + NAME (per user directive
// "ระวังเรื่องพนังงานเป็นตัวเลขไม่ใช่ text"). Reason still required.
//
// Calls backendClient.cancelCustomerCourse(customerId, courseId, reason, opts).
// On success: caller closes modal + refreshes its row.

import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { cancelCustomerCourse, listStaffByBranch } from '../../lib/scopedDataLayer.js';
import ActorPicker, { resolveActorUser } from './ActorPicker.jsx';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { auth } from '../../firebase.js';

/**
 * @param {object} props
 *   - open: bool
 *   - row: { customerId, customerHN, customerName, courseId, courseName, hasRealCourseId, courseIndex }
 *   - onSuccess: () => void
 *   - onCancel: () => void
 */
export default function CancelCourseModal({ open, row, onSuccess, onCancel }) {
  const { branchId } = useSelectedBranch();
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [actorId, setActorId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStaffLoading(true);
    listStaffByBranch({ branchId })
      .then((list) => { if (!cancelled) setStaff(list || []); })
      .catch(() => { if (!cancelled) setStaff([]); })
      .finally(() => { if (!cancelled) setStaffLoading(false); });
    return () => { cancelled = true; };
  }, [open, branchId]);

  if (!open || !row) return null;

  const actor = resolveActorUser(actorId, staff);
  const reasonOk = reason.trim().length > 0;
  const canConfirm = !!actor && reasonOk && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError('');
    try {
      const actorEmail = auth?.currentUser?.email || auth?.currentUser?.uid || '';
      const lookupCourseId = row.hasRealCourseId ? row.courseId : '';
      await cancelCustomerCourse(row.customerId, lookupCourseId, reason.trim(), {
        actor: actorEmail,
        courseIndex: row.courseIndex,
        staffId: actor.userId,
        staffName: actor.userName,
      });
      setActorId(''); setReason('');
      onSuccess?.();
    } catch (e) {
      setError(e?.message || 'ยกเลิกคอร์สไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setActorId(''); setReason(''); setError('');
    onCancel?.();
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      data-testid="cancel-course-modal"
      onClick={handleCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl shadow-2xl bg-[var(--bg-surface)] border border-[var(--bd)] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">ยกเลิกคอร์ส</h3>
            <p className="text-xs text-[var(--tx-muted)] mt-1">
              คอร์สนี้จะถูกทำเครื่องหมายเป็น &quot;ยกเลิก&quot; และไม่สามารถใช้งานได้อีก
              (ไม่คืนเงิน)
            </p>
          </div>
          <button onClick={handleCancel} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] p-3 text-xs space-y-1">
            <div><span className="text-[var(--tx-muted)]">ลูกค้า: </span>
              <span className="text-[var(--tx-primary)] font-bold">{row.customerHN} {row.customerName}</span></div>
            <div><span className="text-[var(--tx-muted)]">คอร์ส: </span>
              <span className="text-[var(--tx-primary)] font-bold">{row.courseName}</span></div>
          </div>

          <ActorPicker
            value={actorId}
            onChange={setActorId}
            sellers={staff}
            loading={staffLoading}
            label="พนักงานที่ทำรายการ"
            required
            testId="cancel-course-staff"
          />

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">
              เหตุผลในการยกเลิก *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="เช่น ลูกค้าขอยกเลิก / กรอกข้อมูลผิด / อื่นๆ"
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] resize-none"
              data-testid="cancel-course-reason"
            />
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-lg p-2 text-xs text-red-400 flex items-start gap-2"
                 data-testid="cancel-course-error">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)]"
              data-testid="cancel-course-close"
            >
              ปิด
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-5 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 bg-rose-700 hover:bg-rose-600"
              data-testid="cancel-course-submit"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
              ยืนยันยกเลิกคอร์ส
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
