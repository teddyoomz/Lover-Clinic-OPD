// ─── CentralMakeFreshButton — 2026-05-15 (Task 5) ─────────────────────────
// Admin-only trigger button for CentralMakeFreshModal. Two modes:
//   - Per-warehouse: pass `warehouse` prop
//   - Bulk-all: pass `allWarehouses={true}` + `allWarehouseList` for summary
//
// Renders null when isAdmin === false (mirror MakeFreshButton).

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import CentralMakeFreshModal from './CentralMakeFreshModal.jsx';
import { useTabAccess } from '../../hooks/useTabAccess.js';

export default function CentralMakeFreshButton({
  warehouse,
  allWarehouses = false,
  allWarehouseList = [],
  onComplete,
  className,
}) {
  const { isAdmin } = useTabAccess();
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;
  const testIdSuffix = allWarehouses ? 'bulk' : (warehouse?.stockId || warehouse?.id);
  const title = allWarehouses ? 'เคลีย Central Stock ทั้งหมด (Admin only)' : 'ทำให้คลังนี้ใหม่ (Admin only)';
  const label = allWarehouses ? 'เคลียทั้งหมด' : 'คลังใหม่';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={title}
        className={className || 'px-2 py-1 text-xs rounded bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 inline-flex items-center gap-1'}
        data-testid={`central-make-fresh-btn-${testIdSuffix}`}
      >
        <Sparkles size={11} /> {label}
      </button>
      {open && (
        <CentralMakeFreshModal
          warehouse={warehouse}
          allWarehouses={allWarehouses}
          allWarehouseList={allWarehouseList}
          onClose={() => setOpen(false)}
          onComplete={(result) => { setOpen(false); onComplete?.(result); }}
        />
      )}
    </>
  );
}
