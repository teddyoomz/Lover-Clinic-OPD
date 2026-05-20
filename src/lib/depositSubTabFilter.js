// Deposit-page sub-tab partition (2026-05-20). Splits DepositPanel's list into
// the "ใช้งานอยู่" (active+partial) and "สิ้นสุดแล้ว" (used/cancelled/refunded/
// expired) sub-tabs. Pure JS — no React, no Firestore. Mirrors saleSubTabFilter
// + skipStockFilter (single-source predicate). The active|partial = "usable"
// split matches the codebase's existing convention (backendClient.js
// getDepositBalance / customer summary filter `status === 'active' || 'partial'`).

/** Statuses where the deposit still has a usable balance. */
export const ACTIVE_DEPOSIT_STATUSES = ['active', 'partial'];

/** Terminal statuses — the deposit is finished (no further use). */
export const FINISHED_DEPOSIT_STATUSES = ['used', 'cancelled', 'refunded', 'expired'];

/** A deposit is "finished" iff its status is one of the terminal states.
 *  Missing/unknown status → NOT finished (stays on the active pill, visible). */
export function isFinishedDeposit(dep) {
  return FINISHED_DEPOSIT_STATUSES.includes(dep?.status);
}

/** Partition the loaded deposits list for the given sub-tab.
 *  subTab === 'finished' → terminal statuses; anything else → still-usable.
 *  Tolerates non-array input + null members (defensive). */
export function filterDepositsBySubTab(deposits, subTab) {
  const list = Array.isArray(deposits) ? deposits : [];
  if (subTab === 'finished') return list.filter(isFinishedDeposit);
  return list.filter((d) => !isFinishedDeposit(d));
}
