// ─── ActorConfirmModal — replaces confirm()+prompt() for stock state-flips ──
// User directive 2026-04-27: every state-flip emitting a stock movement
// (transfer dispatch/receive/cancel/reject; withdrawal dispatch/receive/cancel;
// PO receive/cancel) must record WHO did it. The legacy `confirm()+prompt()`
// pattern collected at most a reason string + assumed logged-in admin as actor.
//
// This modal:
//   - shows the action title + description
//   - REQUIRES picking an actor (force-pick UX per user directive)
//   - optionally captures a reason (required or not, configurable)
//   - on confirm: fires onConfirm({ actor, reason }) where actor = {userId, userName}
//   - on cancel: fires onCancel() — caller closes the modal
//
// Iron-clad mapping:
//   C1 (Rule of 3): used by OrderPanel + StockTransferPanel + StockWithdrawalPanel
//                   + CentralStockOrderPanel = 4 callers across multiple actions
//   V13: full-flow simulate test pins {actor, reason} payload contract
//   V14: actor field is null until pick → submit blocked
//   V31: no silent-swallow — onConfirm error propagates to caller

import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import ActorPicker, { resolveActorUser } from './ActorPicker.jsx';

/**
 * @param {object} props
 *   - open: bool — controlled visibility
 *   - title: string — modal title (e.g. "ยกเลิกใบสั่งซื้อ ORD-...")
 *   - message: string — explanation shown above the picker
 *   - actionLabel: string — confirm-button label (default "ยืนยัน")
 *   - actionColor: 'red'|'orange'|'sky'|'emerald'|'violet' (default 'rose')
 *   - sellers: [{id, name}]
 *   - sellersLoading: bool
 *   - requireReason: bool — default false; when true, reason input is required
 *   - reasonLabel: string — default "หมายเหตุ/เหตุผล"
 *   - reasonOptional: bool — when true, reason field shown but optional
 *   - onConfirm: async ({ actor: {userId, userName}, reason: string }) => void
 *   - onCancel: () => void
 *   - testId: string — default "actor-confirm-modal"
 */
export default function ActorConfirmModal({
  open,
  title,
  message,
  actionLabel = 'ยืนยัน',
  actionColor = 'rose',
  sellers,
  sellersLoading = false,
  requireReason = false,
  reasonOptional = false,
  reasonLabel = 'หมายเหตุ/เหตุผล',
  onConfirm,
  onCancel,
  testId = 'actor-confirm-modal',
}) {
  const [actorId, setActorId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const colorClasses = {
    red: 'bg-red-700 hover:bg-red-600',
    rose: 'bg-rose-700 hover:bg-rose-600',
    orange: 'bg-orange-700 hover:bg-orange-600',
    sky: 'bg-sky-700 hover:bg-sky-600',
    emerald: 'bg-emerald-700 hover:bg-emerald-600',
    violet: 'bg-violet-700 hover:bg-violet-600',
  };
  const btnColor = colorClasses[actionColor] || colorClasses.rose;

  const actor = resolveActorUser(actorId, sellers);
  const reasonOk = !requireReason || (reason.trim().length > 0);
  const canConfirm = !!actor && reasonOk && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true); setError('');
    try {
      await onConfirm({ actor, reason: reason.trim() });
      // Caller is responsible for closing the modal (sets open=false). Reset
      // state defensively in case caller keeps it open for chained actions.
      setActorId(''); setReason('');
    } catch (e) {
      setError(e?.message || 'ดำเนินการไม่สำเร็จ');
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
      data-testid={testId}
      onClick={handleCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl shadow-2xl bg-[var(--bg-surface)] border border-[var(--bd)] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-[var(--tx-heading)]">{title}</h3>
            {message && <p className="text-xs text-[var(--tx-muted)] mt-1">{message}</p>}
          </div>
          <button onClick={handleCancel} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <ActorPicker
            value={actorId}
            onChange={setActorId}
            sellers={sellers}
            loading={sellersLoading}
            label="ผู้ทำรายการ"
            required
            testId="actor-confirm-picker"
          />

          {(requireReason || reasonOptional) && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">
                {reasonLabel}{requireReason ? ' *' : ' (ไม่บังคับ)'}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] resize-none"
                data-testid="actor-confirm-reason"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-lg p-2 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)]"
              data-testid="actor-confirm-cancel"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`px-5 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 ${btnColor}`}
              data-testid="actor-confirm-submit"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
