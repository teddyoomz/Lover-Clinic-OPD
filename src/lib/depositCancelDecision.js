// Deposit-aware cancel decision (Part 2 — 2026-05-26).
//
// Pure decision used by DepositAwareCancelDialog + every cancel surface
// (Frontend นัดหมาย, Backend AppointmentCalendarView, Backend Finance·มัดจำ).
// Given a fetched be_deposits doc (or null/undefined), returns exactly what
// the dialog needs to render. NO Firestore reads here — the caller fetches
// via getDeposit so this stays pure + unit-testable.
//
// `blocked` reflects the hard-delete invariant: deleteDepositBookingPair /
// cancelDepositBookingPair throw when usedAmount > 0 (a partially-used deposit
// must have its receipt cancelled first). The dialog disables the delete
// option(s) when blocked so the user never hits the throw.
export function resolveDepositCancelState(deposit) {
  if (!deposit || typeof deposit !== 'object') {
    return { hasDeposit: false, depositId: '', amount: 0, usedAmount: 0, remainingAmount: 0, blocked: false, status: '' };
  }
  const depositId = deposit.id || deposit.depositId || '';
  const amount = Number(deposit.amount) || 0;
  const usedAmount = Number(deposit.usedAmount) || 0;
  const remainingAmount = deposit.remainingAmount != null
    ? (Number(deposit.remainingAmount) || 0)
    : Math.max(0, amount - usedAmount);
  const status = deposit.status || '';
  const alreadyGone = status === 'cancelled';
  // Hard-delete throws on a partially-used deposit — block the delete option.
  const blocked = usedAmount > 0;
  const hasDeposit = !!depositId && !alreadyGone;
  return { hasDeposit, depositId, amount, usedAmount, remainingAmount, blocked, status };
}
