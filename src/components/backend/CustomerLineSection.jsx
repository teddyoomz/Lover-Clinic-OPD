// ─── CustomerLineSection — "การแจ้งเตือน LINE" section on Customer Detail ─
// Task 12 (LINE OA Appointment Reminder, 2026-05-15) — spec §5 D.
//
// Renders a self-contained section that shows:
//   1. Per-branch LINE linkages from `customer.lineUserId_byBranch`
//      (Task 8 schema — per-branch map of { lineUserId, lineDisplayName,
//       linkedAt, _lineStale, _lineStaleAt }).
//   2. Legacy V32-tris-ter linkage fallback when `customer.lineUserId` is
//      set AND `customer.branchId` is set AND no per-branch entry already
//      covers that branch.
//   3. Stale-link warning chip when `_lineStale === true` (cron / webhook
//      flags a branch entry stale after a LINE Push 4xx response — see
//      spec §11.4).
//   4. Global "ปิดรับแจ้งเตือน (ทุกสาขา)" toggle bound to
//      `customer.notifyOptOut`. Calls back through `onToggleOptOut(value)`
//      so the parent (CustomerDetailView) owns the write path — this
//      component is purely presentational.
//   5. Sub-text "ลูกค้าเลือกปิดเอง เมื่อ {date}" when
//      `notifyOptOutBy === 'customer-dm'` (Task 8 sets this via the LINE
//       webhook opt-out intent — "หยุดแจ้งเตือน" / "stop").
//
// Props:
//   customer       : be_customers doc (lineUserId_byBranch / lineUserId /
//                    branchId / notifyOptOut / notifyOptOutAt /
//                    notifyOptOutBy)
//   branchesById   : { [branchId]: { branchName, ... } } map. Used to
//                    resolve branch display names. Falls back to branchId
//                    when the branch is unknown.
//   onToggleOptOut : (nextValue: boolean) => void — invoked when the
//                    admin flips the checkbox. Parent updates Firestore
//                    via updateCustomer().

import { useMemo } from 'react';

function formatDateThai(input) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  // dd/mm/yyyy (BE year) — short display sufficient for an audit-style line.
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}

export function CustomerLineSection({ customer, branchesById, onToggleOptOut }) {
  if (!customer) return null;
  const byBranch = customer.lineUserId_byBranch || {};
  const branchMap = branchesById || {};

  // Per-branch entries from the canonical map.
  const perBranchEntries = useMemo(() => {
    return Object.entries(byBranch)
      .filter(([, link]) => link && link.lineUserId)
      .map(([branchId, link]) => ({
        branchId,
        branchName:
          (branchMap[branchId] && branchMap[branchId].branchName) || branchId,
        lineUserId: link.lineUserId,
        lineDisplayName: link.lineDisplayName || 'linked',
        linkedAt: link.linkedAt || '',
        isStale: link._lineStale === true,
        isLegacy: false,
      }));
  }, [byBranch, branchMap]);

  // Legacy V32-tris-ter linkage: customer.lineUserId + customer.branchId
  // (older path before the per-branch map was minted). Surface ONLY when
  // there is no per-branch entry already covering that branch — otherwise
  // it would duplicate the per-branch row.
  const legacyEntry = useMemo(() => {
    const legacyBranchId =
      (typeof customer.branchId === 'string' && customer.branchId) || '';
    if (!customer.lineUserId || !legacyBranchId) return null;
    if (byBranch[legacyBranchId]) return null;
    return {
      branchId: legacyBranchId,
      branchName:
        (branchMap[legacyBranchId] && branchMap[legacyBranchId].branchName) ||
        legacyBranchId,
      lineUserId: customer.lineUserId,
      lineDisplayName: customer.lineDisplayName || 'linked',
      linkedAt: customer.lineLinkedAt || '',
      isStale: customer._lineStale === true,
      isLegacy: true,
    };
  }, [customer, byBranch, branchMap]);

  const allEntries = useMemo(() => {
    return [...perBranchEntries, ...(legacyEntry ? [legacyEntry] : [])];
  }, [perBranchEntries, legacyEntry]);

  const optOut = customer.notifyOptOut === true;
  const optOutByCustomer = customer.notifyOptOutBy === 'customer-dm';
  const optOutAtFormatted = formatDateThai(customer.notifyOptOutAt);

  return (
    <div
      className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl p-4 space-y-3"
      data-testid="customer-line-section"
    >
      <h3 className="text-sm font-bold text-[var(--tx-heading)] flex items-center gap-2">
        การแจ้งเตือน LINE
      </h3>

      {/* ── Per-branch linkages list ── */}
      {allEntries.length > 0 ? (
        <ul className="space-y-2" data-testid="customer-line-branch-list">
          {allEntries.map((e) => (
            <li
              key={`${e.branchId}-${e.isLegacy ? 'legacy' : 'perbranch'}`}
              className="flex flex-wrap items-center gap-2 text-xs text-[var(--tx-secondary)]"
              data-branch-id={e.branchId}
            >
              <span>
                📍 {e.branchName} — LINE: {e.lineDisplayName}
                {e.linkedAt ? ` (linked ${formatDateThai(e.linkedAt)})` : ''}
              </span>
              {e.isLegacy && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/10 text-gray-500"
                  title="V32-tris-ter linkage (legacy single-branch)"
                >
                  (legacy V32-tris-ter linkage)
                </span>
              )}
              {e.isStale && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  data-testid="customer-line-stale-chip"
                >
                  ⚠️ LINE ของลูกค้าไม่ตอบสนอง (ถูกบล็อก/unfollow) — ต้องผูกใหม่
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-[var(--tx-muted)]" data-testid="customer-line-empty">
          ยังไม่ผูก LINE กับสาขาใด
        </div>
      )}

      {/* ── Global opt-out toggle ── */}
      <div className="pt-2 border-t border-[var(--bd)] space-y-1">
        <label className="flex items-center gap-2 text-xs text-[var(--tx-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={optOut}
            onChange={(e) =>
              typeof onToggleOptOut === 'function' &&
              onToggleOptOut(e.target.checked)
            }
            aria-label="ปิดรับแจ้งเตือน (ทุกสาขา)"
            data-testid="customer-line-opt-out-toggle"
          />
          <span>ปิดรับแจ้งเตือน (ทุกสาขา)</span>
        </label>
        {optOut && optOutByCustomer && (
          <div
            className="text-[11px] text-[var(--tx-muted)] pl-6"
            data-testid="customer-line-opt-out-source"
          >
            ลูกค้าเลือกปิดเอง
            {optOutAtFormatted ? ` เมื่อ ${optOutAtFormatted}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerLineSection;
