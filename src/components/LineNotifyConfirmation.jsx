// ─── LineNotifyConfirmation — appointment-modal LINE-notify confirmation ───
// Task 10 (LINE OA Appointment Reminder, 2026-05-15) — single source of truth
// for the per-branch LINE-notify checkbox + status chip rendered by every
// appointment-creating modal (LR-4 invariant locked).
//
// Renders one of three states:
//   linked-here (per-branch entry OR legacy lineUserId at customer.branchId)
//     → green card + checkbox + display name. Auto-tick handled by parent.
//     → If notifyOptOut → checkbox disabled + (ลูกค้าปิดแจ้งเตือน) chip
//     → If _lineStale  → checkbox disabled + (LINE หมดอายุ — ต้องผูกใหม่) chip
//   linked-elsewhere (some other branch only)
//     → yellow warning card + "สร้าง QR ผูก LINE สาขานี้" CTA (when
//       onOfferLinkHere is provided)
//   not-linked-anywhere
//     → returns null (no visible UI; nothing to confirm)
//
// Props:
//   customer        : be_customers doc shape (or null/undefined → returns null)
//   targetBranchId  : the branch this appointment will live on (drives the
//                     per-branch linkage decision)
//   checked         : boolean — whether 'line' is in parent's notifyChannel state
//   onChange        : (val:boolean) => void — fires when user toggles checkbox
//   onOfferLinkHere : optional — () => void — fires when user clicks the
//                     "สร้าง QR ผูก LINE สาขานี้" CTA in the warning card.
//                     Component renders the CTA only when this is provided.
//
// LR-4 lock: every appointment-creating modal MUST render this component so
// the user can confirm + adjust the LINE-notify channel BEFORE submit. Auto-
// tick logic + notifyChannel state live in the parent modal; this component
// is the visual contract.

export function LineNotifyConfirmation({ customer, targetBranchId, checked, onChange, onOfferLinkHere }) {
  if (!customer || !targetBranchId) return null;
  const branchLink = customer.lineUserId_byBranch?.[targetBranchId];
  const legacyValid = customer.branchId === targetBranchId && customer.lineUserId;
  const linkedHere = !!(branchLink?.lineUserId || legacyValid);
  const hasAnyLink = customer.lineUserId || Object.keys(customer.lineUserId_byBranch || {}).length > 0;
  const linkedElsewhere = !linkedHere && hasAnyLink;
  if (!linkedHere && !linkedElsewhere) return null;

  const displayName = branchLink?.lineDisplayName || customer.lineDisplayName || 'เชื่อมแล้ว';
  const isStale = branchLink?._lineStale === true ||
    (customer.branchId === targetBranchId && customer._lineStale === true);
  const isOptOut = customer.notifyOptOut === true;

  if (linkedElsewhere) {
    return (
      <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-3 mt-2 text-sm">
        <div className="font-medium">⚠️ ลูกค้าผูก LINE กับสาขาอื่น — ยังไม่ได้ผูกกับสาขานี้</div>
        {onOfferLinkHere && (
          <button
            type="button"
            onClick={onOfferLinkHere}
            className="mt-2 px-3 py-1 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-xs font-medium"
          >
            สร้าง QR ผูก LINE สาขานี้
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded border border-green-500/30 bg-green-500/5 p-3 mt-2">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={isOptOut || isStale}
          data-field="notify-line"
        />
        <div>
          <div className="font-medium flex items-center gap-2 flex-wrap">
            <span>🟢 แจ้งเตือนผ่าน LINE</span>
            {isOptOut && <span className="text-xs text-red-500">(ลูกค้าปิดแจ้งเตือน)</span>}
            {isStale && <span className="text-xs text-orange-500">(LINE หมดอายุ — ต้องผูกใหม่)</span>}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            LINE: <strong>{displayName}</strong>
          </div>
        </div>
      </label>
    </div>
  );
}
