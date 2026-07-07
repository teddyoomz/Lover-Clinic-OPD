import { useState, useEffect } from 'react';
import { getDeposit } from '../../lib/scopedDataLayer.js';
import { resolveDepositCancelState } from '../../lib/depositCancelDecision.js';
import { fmtMoney } from '../../lib/financeUtils.js';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

// Shared deposit-aware cancel dialog (Part 2 — 2026-05-26).
// Wired into every deposit-booking cancel surface (Frontend นัดหมาย,
// Backend AppointmentCalendarView, Backend Finance·มัดจำ) per AV132.
//
// orientation:
//   'appt'    — cancelling an appointment ("ยกเลิกนัด + ลบมัดจำ" / "ยกเลิกแต่นัด (เก็บมัดจำไว้)")
//   'deposit' — cancelling a deposit     ("ลบมัดจำ + ยกเลิกนัด"  / "ลบแต่มัดจำ (เก็บนัดไว้)")
//
// onChoice fires with 'both' | 'this-only' | 'cancel'. The caller maps:
//   both       → deleteDepositBookingPair(depId)         (hard — both vanish)
//   this-only  → appt: cancel appt + keep deposit  ·  deposit: deleteDeposit + keep appt
//   cancel     → no-op (also calls onClose)
//
// Explicit-close only (AV78) — no backdrop dismiss; ✕/ย้อนกลับ close it.
export default function DepositAwareCancelDialog({ open, orientation = 'appt', depositId, title, subtitle, onChoice, onClose }) {
  // AV205 — gate on open (early return below runs after hooks)
  useModalScrollLock(!!open);
  const [deposit, setDeposit] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !depositId) { setDeposit(null); return; }
    let alive = true;
    setLoading(true);
    getDeposit(depositId)
      .then((d) => { if (alive) { setDeposit(d || null); setLoading(false); } })
      .catch(() => { if (alive) { setDeposit(null); setLoading(false); } });
    return () => { alive = false; };
  }, [open, depositId]);

  if (!open) return null;

  const st = resolveDepositCancelState(deposit);
  const isAppt = orientation === 'appt';
  const bothLabel = isAppt ? '🗑 ยกเลิกนัด + ลบมัดจำ' : '🗑 ลบมัดจำ + ยกเลิกนัด';
  const keepLabel = isAppt ? '📌 ยกเลิกแต่นัด (เก็บมัดจำไว้)' : '📌 ลบแต่มัดจำ (เก็บนัดไว้)';
  // appt orientation: the keep-option PRESERVES the deposit → never blocked.
  // deposit orientation: the keep-option STILL deletes the deposit → blocked when used.
  const keepBlocked = !isAppt && st.blocked;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4 overflow-y-auto overscroll-contain" data-testid="deposit-cancel-dialog">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-surface)] border border-[var(--bd)] p-5 shadow-2xl">
        <h3 className="text-base font-bold text-[var(--tx-heading)] mb-1">
          {title || (isAppt ? 'ยกเลิกการนัดหมาย' : 'ยกเลิกมัดจำ')}
        </h3>
        {subtitle && <div className="text-xs text-[var(--tx-muted)] mb-3">{subtitle}</div>}

        {loading ? (
          <div className="text-xs text-[var(--tx-muted)] py-4 text-center">กำลังโหลดข้อมูลมัดจำ…</div>
        ) : (
          <>
            {st.blocked ? (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 mb-3">
                ⚠ มัดจำถูกใช้ไปแล้วบางส่วน ({fmtMoney(st.usedAmount)}) — ต้องยกเลิกใบเสร็จที่ใช้มัดจำก่อนจึงจะลบได้
              </div>
            ) : (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 mb-3">
                ⚠ {isAppt ? 'นัดนี้มีมัดจำ' : 'มัดจำ'} {fmtMoney(st.amount)} ในระบบ
              </div>
            )}

            <button
              type="button"
              disabled={st.blocked}
              onClick={() => onChoice?.('both')}
              data-testid="cancel-choice-both"
              className={`w-full text-left px-4 py-3 rounded-xl mb-2 font-bold transition-all ${
                st.blocked
                  ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)] cursor-not-allowed border border-dashed border-[var(--bd)]'
                  : 'bg-[var(--accent)] text-white'
              }`}
            >
              {bothLabel}{st.blocked ? ' (ปิดใช้งาน)' : ''}
            </button>

            <button
              type="button"
              disabled={keepBlocked}
              onClick={() => onChoice?.('this-only')}
              data-testid="cancel-choice-keep"
              className={`w-full text-left px-4 py-3 rounded-xl mb-2 transition-all ${
                keepBlocked
                  ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)] cursor-not-allowed border border-dashed border-[var(--bd)]'
                  : 'bg-[var(--bg-hover)] text-[var(--tx-heading)] border border-[var(--bd)]'
              }`}
            >
              {keepLabel}{keepBlocked ? ' (ปิดใช้งาน)' : ''}
            </button>

            <button
              type="button"
              onClick={() => { onChoice?.('cancel'); onClose?.(); }}
              data-testid="cancel-choice-back"
              className="w-full px-4 py-2.5 rounded-xl text-[var(--tx-muted)] text-sm hover:bg-[var(--bg-hover)] transition-all"
            >
              ย้อนกลับ
            </button>
          </>
        )}
      </div>
    </div>
  );
}
