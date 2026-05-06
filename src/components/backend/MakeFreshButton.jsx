import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import MakeFreshModal from './MakeFreshModal.jsx';
import { useTabAccess } from '../../hooks/useTabAccess.js';

export default function MakeFreshButton({ branch, onComplete }) {
  const { isAdmin } = useTabAccess();
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="ทำให้เป็นสาขาใหม่ (Admin only)"
        className="px-2 py-1 text-xs rounded bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 inline-flex items-center gap-1"
        data-testid={`make-fresh-btn-${branch.branchId || branch.id}`}
      >
        <Sparkles size={11} /> สาขาใหม่
      </button>
      {open && (
        <MakeFreshModal
          branch={branch}
          onClose={() => setOpen(false)}
          onComplete={(result) => { setOpen(false); onComplete?.(result); }}
        />
      )}
    </>
  );
}
