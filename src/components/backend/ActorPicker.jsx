// ─── ActorPicker — required staff/doctor selector for stock movements ───────
// User directive 2026-04-27: every stock state-flip (create order / adjust /
// transfer / withdrawal / PO action) must record WHO performed it.
// Default = empty + REQUIRED (force pick every time — no implicit logged-in
// user fallback in the writer's user field).
//
// Reuses listAllSellers() shape: [{ id, name }, ...] (be_staff + be_doctors merged).
//
// Iron-clad mapping:
//   C1 (Rule of 3): used by OrderPanel + StockAdjustPanel + StockTransferPanel
//                   + StockWithdrawalPanel + CentralStockOrderPanel + ActorConfirmModal
//                   → 6 callers; shared component is mandatory.
//   V14: never returns undefined — empty-string default with required validation.

import { Loader2 } from 'lucide-react';

/**
 * @param {object} props
 *   - value: string  — picked seller id (controlled)
 *   - onChange: (id) => void
 *   - sellers: [{id, name}]
 *   - loading: bool
 *   - inputCls: string  — caller's input className for visual consistency
 *   - label: string  — default "ผู้ทำรายการ"
 *   - required: bool  — default true; appends ' *' to label
 *   - placeholder: string  — default "— เลือกผู้ทำรายการ —"
 *   - testId: string  — default "actor-picker"
 */
export default function ActorPicker({
  value,
  onChange,
  sellers,
  loading = false,
  inputCls = 'w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]',
  label = 'ผู้ทำรายการ',
  required = true,
  placeholder = '— เลือกผู้ทำรายการ —',
  testId = 'actor-picker',
}) {
  const labelCls = 'block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold';
  const list = Array.isArray(sellers) ? sellers : [];

  return (
    <div>
      <label className={labelCls}>{label}{required ? ' *' : ''}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
        disabled={loading}
        data-testid={testId}
        required={required}
      >
        <option value="">{placeholder}</option>
        {list.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {loading && (
        <div className="text-[10px] text-[var(--tx-muted)] mt-1 flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" /> โหลดรายชื่อ...
        </div>
      )}
    </div>
  );
}

/**
 * Resolve {userId, userName} from a sellers list for writer's `user` field.
 * Pure helper — caller passes the picked id + the loaded list, gets back
 * an audit-shape object suitable for the createStock / cancelStock /
 * updateStock writers' `opts.user`. Returns null when no match (caller
 * should refuse to submit).
 *
 * @param {string} actorId
 * @param {Array<{id, name}>} sellers
 * @returns {{userId, userName} | null}
 */
export function resolveActorUser(actorId, sellers) {
  if (!actorId || !Array.isArray(sellers)) return null;
  const match = sellers.find((s) => s && String(s.id) === String(actorId));
  if (!match || typeof match.name !== 'string' || !match.name.trim()) return null;
  return { userId: String(match.id), userName: match.name.trim() };
}
