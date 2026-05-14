// ─── CustomerOption — Shared customer name + per-branch LINE badge ────
// Task 9 (LINE OA Appointment Reminder, 2026-05-15) — extracts the
// inline-name + LINE-status pattern from 6 appointment-creating callsites
// (Rule of 3, LR-4 invariant locked).
//
// Renders the customer's display name plus a 🟢/⚪️ LINE chip that
// reflects per-branch linkage (`customer.lineUserId_byBranch[contextBranchId]`)
// with backward-compat for the LEGACY V32-tris-ter `customer.lineUserId`
// scoped to `customer.branchId`.
//
// Badge contract:
//   🟢 LINE    — linked at THIS branch (per-branch entry OR legacy
//                lineUserId when customer.branchId === contextBranchId)
//   ⚪️ LINE    — linked at SOME other branch only
//   (none)     — not linked anywhere
//
// Props:
//   customer        : be_customers doc shape (or any object with name /
//                     fullName + optional lineUserId / lineUserId_byBranch)
//   contextBranchId : the branch the appointment/deposit will live on
//                     (drives the per-branch badge decision)
//   showLineBadge   : optional, default true; pass false to render
//                     name-only (e.g. customer-detail header when
//                     LINE status is shown elsewhere)
//
// LR-4 lock: every appointment-creating modal/picker MUST distinguish
// "linked at THIS branch" vs "linked at OTHER branch". This component is
// the single source of truth for that distinction.

export function CustomerOption({ customer, contextBranchId, showLineBadge = true }) {
  if (!customer) return null;

  const displayName = customer.fullName || customer.name || '';

  const branchLink = customer.lineUserId_byBranch?.[contextBranchId];
  const legacyValid = customer.branchId === contextBranchId && customer.lineUserId;
  const linkedHere = !!(branchLink?.lineUserId || legacyValid);

  const hasAnyLink = !!customer.lineUserId
    || Object.keys(customer.lineUserId_byBranch || {}).length > 0;
  const linkedElsewhere = !linkedHere && hasAnyLink;

  const displayLine = branchLink?.lineDisplayName || customer.lineDisplayName || 'linked';

  return (
    <div className="flex items-center gap-2">
      <span>{displayName}</span>
      {showLineBadge && linkedHere && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-medium"
          title={`LINE: ${displayLine}`}
        >
          🟢 LINE
        </span>
      )}
      {showLineBadge && linkedElsewhere && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500 text-xs"
          title="ลูกค้าผูก LINE กับสาขาอื่น — ยังไม่ผูกกับสาขานี้"
        >
          ⚪️ LINE
        </span>
      )}
    </div>
  );
}
