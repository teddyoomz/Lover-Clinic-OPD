// ─── BranchSelector — small dropdown in BackendDashboard header ────
// Phase 14.7.H follow-up A (2026-04-26). Auto-hides when < 2 branches
// so single-branch clinics don't see clutter.
//
// Phase BS (2026-05-06): swap useSelectedBranch → useUserScopedBranches
// so the dropdown only shows branches the current user is allowed to
// switch to (staff.branchIds[] gate). Empty/missing branchIds preserves
// backward-compat (sees all branches).
//
// Phase 17.2 (2026-05-05):
//   - isDefault star "⭐" stripped from option labels (all branches equal).
//   - Wire useBranchVisibility().showSelector — when false (single
//     accessible branch), render a static `<span>สาขา: {name}</span>`
//     label instead of the dropdown. When zero branches, render null.

import { Briefcase } from 'lucide-react';
import {
  useUserScopedBranches,
  useBranchVisibility,
} from '../../lib/BranchContext.jsx';

export default function BranchSelector({ className = '' }) {
  const { branchId, selectBranch } = useUserScopedBranches();
  const { showSelector, branches } = useBranchVisibility();

  // Zero accessible branches → render nothing (BranchProvider still
  // mounting, or staff has no branch scope yet).
  if (!branches || branches.length === 0) return null;

  // Phase 17.2: single accessible branch → static label, no dropdown.
  if (!showSelector) {
    const only = branches[0];
    const name = only.name || only.branchName || only.branchId || only.id;
    return (
      <div
        className={`flex items-center gap-2 ${className}`}
        data-testid="branch-selector"
        data-branch-static-label="true"
      >
        <Briefcase size={14} className="text-[var(--tx-muted)] flex-shrink-0" />
        <span className="text-xs font-bold text-[var(--tx-primary)]">
          สาขา: {name}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="branch-selector">
      <Briefcase size={14} className="text-[var(--tx-muted)] flex-shrink-0" />
      <select
        value={branchId || ''}
        onChange={(e) => selectBranch(e.target.value)}
        data-testid="branch-selector-dropdown"
        aria-label="เลือกสาขา"
        className="text-xs font-bold rounded px-2 py-1 bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {branches.map((b) => {
          const id = b.branchId || b.id;
          const name = b.name || b.branchName || id;
          return (
            <option key={id} value={id}>{name}</option>
          );
        })}
      </select>
    </div>
  );
}
