// ─── BranchSelector — small dropdown in BackendDashboard header ────
// Phase 14.7.H follow-up A (2026-04-26). Auto-hides when < 2 branches
// so single-branch clinics don't see clutter.
//
// Phase BS (2026-05-06): swap useSelectedBranch → useUserScopedBranches
// so the dropdown only shows branches the current user is allowed to
// switch to (staff.branchIds[] gate). Empty/missing branchIds preserves
// backward-compat (sees all branches).

import { Briefcase } from 'lucide-react';
import { useUserScopedBranches } from '../../lib/BranchContext.jsx';

export default function BranchSelector({ className = '' }) {
  const { branchId, branches, selectBranch } = useUserScopedBranches();

  // Single-branch (or single-accessible-branch) → no dropdown.
  if (!branches || branches.length < 2) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="branch-selector">
      <Briefcase size={14} className="text-[var(--tx-muted)] flex-shrink-0" />
      <select
        value={branchId}
        onChange={(e) => selectBranch(e.target.value)}
        data-testid="branch-selector-dropdown"
        aria-label="เลือกสาขา"
        className="text-xs font-bold rounded px-2 py-1 bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {branches.map((b) => {
          const id = b.branchId || b.id;
          const name = b.name || b.branchName || id;
          return (
            <option key={id} value={id}>{name}{b.isDefault ? ' ⭐' : ''}</option>
          );
        })}
      </select>
    </div>
  );
}
