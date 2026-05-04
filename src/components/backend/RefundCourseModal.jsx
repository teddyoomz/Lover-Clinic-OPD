// ─── RefundCourseModal — Phase 16.5 (2026-04-29) ───────────────────────────
// Refund a customer's course (returns money). Marks course status='คืนเงิน'.
// Calls backendClient.refundCustomerCourse(customerId, courseId, amount, opts).
//
// v1 captures: refund amount + reason. (Channel/method dropdown deferred —
// would require refundCustomerCourse signature extension; see spec doc.)
//
// Validation: amount > 0 + reason non-empty.

import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { refundCustomerCourse } from '../../lib/scopedDataLayer.js';
import { auth } from '../../firebase.js';
import { fmtMoney } from '../../lib/financeUtils.js';

/**
 * @param {object} props
 *   - open: bool
 *   - row: { customerId, customerHN, customerName, courseId, courseName, totalSpent, qtyRemaining, qtyTotal }
 *   - onSuccess: () => void
 *   - onCancel: () => void
 */
export default function RefundCourseModal({ open, row, onSuccess, onCancel }) {
  // Suggest pro-rata default (qtyRemaining/qtyTotal × totalSpent), rounded down.
  const proRataDefault = (row && row.qtyTotal > 0)
    ? Math.floor((Number(row.qtyRemaining) / Number(row.qtyTotal)) * Number(row.totalSpent || 0))
    : 0;

  const [amount, setAmount] = useState(proRataDefault > 0 ? String(proRataDefault) : '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open || !row) return null;

  const amountNum = Number(amount);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= Number(row.totalSpent || Infinity);
  const reasonOk = reason.trim().length > 0;
  const canConfirm = amountOk && reasonOk && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError('');
    try {
      const actor = auth?.currentUser?.email || auth?.currentUser?.uid || '';
      // Phase 16.5 fix: pass courseIndex when row has no real courseId
      // (ProClinic-cloned courses don't have one). Backend resolves via
      // courseIndex fallback in applyCourseRefund.
      const lookupCourseId = row.hasRealCourseId ? row.courseId : '';
      await refundCustomerCourse(row.customerId, lookupCourseId, amountNum, {
        reason: reason.trim(),
        actor,
        courseIndex: row.courseIndex,
      });
      setAmount('');
      setReason('');
      onSuccess?.();
    } catch (e) {
      setError(e?.message || 'คืนเงินคอร์สไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setAmount(proRataDefault > 0 ? String(proRataDefault) : '');
    setReason('');
    setError('');
    onCancel?.();
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      data-testid="refund-course-modal"
      onClick={handleCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl shadow-2xl bg-[var(--bg-surface)] border border-[var(--bd)] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">คืนเงินคอร์ส</h3>
            <p className="text-xs text-[var(--tx-muted)] mt-1">
              คอร์สนี้จะถูกทำเครื่องหมายเป็น &quot;คืนเงิน&quot; พร้อมจำนวนที่คืน
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
            <div><span className="text-[var(--tx-muted)]">มูลค่ารวม: </span>
              <span className="text-[var(--tx-primary)]">{fmtMoney(row.totalSpent || 0)}</span>
              {' '}<span className="text-[var(--tx-muted)]">(คงเหลือ {row.qtyRemaining}/{row.qtyTotal})</span></div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">
              จำนวนเงินที่คืน (บาท) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              max={row.totalSpent || undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
              data-testid="refund-course-amount"
            />
            {proRataDefault > 0 && (
              <p className="text-[10px] text-[var(--tx-muted)] mt-1">
                ค่าแนะนำ (pro-rata): {fmtMoney(proRataDefault)} — จำนวนคงเหลือ {row.qtyRemaining}/{row.qtyTotal}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">
              เหตุผลในการคืนเงิน *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="เช่น ลูกค้าขอคืน / สินค้าหมดอายุ / อื่นๆ"
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] resize-none"
              data-testid="refund-course-reason"
            />
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-lg p-2 text-xs text-red-400 flex items-start gap-2"
                 data-testid="refund-course-error">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)]"
              data-testid="refund-course-close"
            >
              ปิด
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-5 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 bg-amber-700 hover:bg-amber-600"
              data-testid="refund-course-submit"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
              ยืนยันคืนเงิน
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
