// ─── CrossBranchImportButton — Phase 17.1 ──────────────────────────────────
// Admin-only icon button rendered next to existing Create button on each of
// the 7 master-data tabs. Opens CrossBranchImportModal pre-bound to the
// adapter for that entityType.

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { useTabAccess } from '../../hooks/useTabAccess.js';
import { getAdapter } from '../../lib/crossBranchImportAdapters/index.js';
import CrossBranchImportModal from './CrossBranchImportModal.jsx';

export default function CrossBranchImportButton({ entityType, onImported, isDark }) {
  const { isAdmin } = useTabAccess();
  const [open, setOpen] = useState(false);

  // Phase 17.1 (Q6 lock) — admin-only. Hide the button entirely from
  // non-admin staff. Server endpoint also enforces admin claim (defense
  // in depth).
  if (!isAdmin) return null;

  const adapter = getAdapter(entityType);

  const buttonCls = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
    isDark
      ? 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-800/40'
      : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
  }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonCls}
        title="Copy from another branch (admin only)"
        data-testid={`cross-branch-import-btn-${entityType}`}
      >
        <Copy size={12} />
        <span>Copy จากสาขาอื่น</span>
      </button>
      {open && (
        <CrossBranchImportModal
          adapter={adapter}
          isDark={isDark}
          onClose={() => setOpen(false)}
          onImported={(result) => {
            setOpen(false);
            if (typeof onImported === 'function') onImported(result);
          }}
        />
      )}
    </>
  );
}
