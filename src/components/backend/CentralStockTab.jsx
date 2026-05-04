// ─── CentralStockTab — Phase 15.1 (read-only) ───────────────────────────────
// Top-level central stock view. Shows central-warehouse-focused presentation
// of inventory, POs, transfers, withdrawals, movements + the existing
// CentralWarehousePanel (CRUD).
//
// Phase 15.1 = READ-ONLY. PO write flow lands in 15.2.
//
// Reuses existing panels via additive override props:
//   - StockBalancePanel: defaultLocationId (preselect central warehouse)
//   - StockTransferPanel + StockWithdrawalPanel: filterLocationId (limit to
//     transfers/withdrawals involving this warehouse)
//   - MovementLogPanel: branchIdOverride (query with central warehouse id
//     instead of BranchContext's branch id)
//   - CentralWarehousePanel: as-is (already central-warehouse CRUD)
//
// Iron-clad:
//   Rule E — no brokerClient import (this tab reads/writes ONLY be_*)
//   Rule H — central stock 100% in OUR Firestore, no ProClinic sync
//   Rule I — flow-simulate test in tests/phase15.1-* covers warehouse
//   selection, sub-tab routing, zero-state, prop pass-through

import { useState, useEffect, useCallback } from 'react';
import {
  Warehouse, Package, ShoppingBag, Truck, ClipboardCheck, Activity,
  Plus, Loader2, SlidersHorizontal,
} from 'lucide-react';
import { listCentralWarehouses } from '../../lib/scopedDataLayer.js';
import StockBalancePanel from './StockBalancePanel.jsx';
import StockTransferPanel from './StockTransferPanel.jsx';
import StockWithdrawalPanel from './StockWithdrawalPanel.jsx';
import StockAdjustPanel from './StockAdjustPanel.jsx';
import MovementLogPanel from './MovementLogPanel.jsx';
import CentralWarehousePanel from './CentralWarehousePanel.jsx';
// Phase 15.2 (2026-04-27) — Central PO write flow
import CentralStockOrderPanel from './CentralStockOrderPanel.jsx';

const SUB_TABS = [
  { id: 'balance',     label: 'ยอดคงเหลือ',  icon: <Package size={14} /> },
  { id: 'orders',      label: 'นำเข้าจาก Vendor', icon: <ShoppingBag size={14} /> },
  { id: 'adjust',      label: 'ปรับสต็อก',    icon: <SlidersHorizontal size={14} /> },
  { id: 'transfers',   label: 'ส่งออก/รับเข้า', icon: <Truck size={14} /> },
  { id: 'withdrawals', label: 'คำขอเบิก',     icon: <ClipboardCheck size={14} /> },
  { id: 'movements',   label: 'Movement Log', icon: <Activity size={14} /> },
  { id: 'warehouses',  label: 'จัดการคลัง',    icon: <Warehouse size={14} /> },
];

export default function CentralStockTab({ clinicSettings, theme }) {
  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [subTab, setSubTab] = useState('balance');
  // Phase 15.4 post-deploy s22 (2026-04-28) — prefill state for cross-subtab
  // navigation triggered by StockBalancePanel's per-row "ปรับ"/"+" buttons.
  // Bugs reported in s22: "+" button no-op + (suspected) cross-tier confusion.
  // Fix mirrors StockTab.jsx pattern: clicking "ปรับ" on a Balance row routes
  // to the central 'adjust' sub-tab with the picked product prefilled.
  // Clicking "+" routes to 'orders' (Central PO) with the picked product prefilled.
  const [adjustPrefill, setAdjustPrefill] = useState(null);
  const [orderPrefill, setOrderPrefill] = useState(null);

  const handleCentralAdjustProduct = (product) => {
    setAdjustPrefill(product);
    setSubTab('adjust');
  };
  const handleCentralAddStockForProduct = (product) => {
    setOrderPrefill(product);
    setSubTab('orders');
  };

  const loadWarehouses = useCallback(async () => {
    setWarehousesLoading(true);
    try {
      const list = await listCentralWarehouses({ includeInactive: false });
      setWarehouses(list);
      if (list.length > 0 && !list.some(w => w.stockId === selectedWarehouseId)) {
        setSelectedWarehouseId(list[0].stockId);
      }
    } catch (e) {
      console.error('[CentralStock] load warehouses failed:', e);
      setWarehouses([]);
    } finally {
      setWarehousesLoading(false);
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    loadWarehouses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user creates a warehouse from the zero-state, refresh + jump to balance.
  const handleAfterCreate = async () => {
    await loadWarehouses();
    setSubTab('balance');
  };

  // Loading
  if (warehousesLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--tx-muted)] text-xs">
        <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลดคลังกลาง...
      </div>
    );
  }

  // Zero-state (no warehouses) — guide admin to create the first one
  if (warehouses.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-purple-900/30 border border-purple-800">
              <Warehouse size={22} className="text-purple-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-[var(--tx-heading)]">คลังกลาง (Central Stock)</h2>
              <p className="text-xs text-[var(--tx-muted)]">จัดการ inventory + การขนย้ายสต็อกระหว่างคลังกลางและสาขา (Phase 15)</p>
            </div>
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] rounded-2xl p-10 text-center border border-[var(--bd)]">
          <Warehouse size={48} className="mx-auto text-[var(--tx-muted)] mb-3" />
          <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-2">ยังไม่มีคลังกลาง</h3>
          <p className="text-xs text-[var(--tx-muted)] mb-4 max-w-md mx-auto">
            คลังกลางใช้สำหรับสำรองสต็อกแยกจากสาขาหลัก ใช้ได้แม้มีสาขาเดียว
            (เช่น คลังเก็บของ + ห้องตรวจ).
            สาขาขอเบิกจากคลังกลาง → admin อนุมัติ → จัดส่ง → สาขายืนยันรับ
          </p>
          <button onClick={() => setSubTab('warehouses')}
            className="px-5 py-2.5 rounded-lg text-xs font-bold bg-purple-700 text-white hover:bg-purple-600 inline-flex items-center gap-2">
            <Plus size={14} /> สร้างคลังกลางแห่งแรก
          </button>
        </div>

        {subTab === 'warehouses' && (
          <CentralWarehousePanel clinicSettings={clinicSettings} theme={theme} onAfterCreate={handleAfterCreate} />
        )}
      </div>
    );
  }

  // Normal state — warehouse selector + sub-tabs + content
  return (
    <div className="space-y-3">
      {/* Header — warehouse selector + count */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-purple-900/30 border border-purple-800">
            <Warehouse size={18} className="text-purple-400" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <h2 className="text-base font-bold text-[var(--tx-heading)]">คลังกลาง</h2>
            <p className="text-[10px] text-[var(--tx-muted)]">{warehouses.length} คลัง</p>
          </div>
          {warehouses.length > 1 ? (
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold">คลัง</label>
              <select
                value={selectedWarehouseId}
                onChange={e => setSelectedWarehouseId(e.target.value)}
                className="px-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] min-w-[180px]"
                data-testid="central-warehouse-selector">
                {warehouses.map(w => (
                  <option key={w.stockId} value={w.stockId}>{w.stockName}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-[var(--tx-muted)] flex items-center gap-2">
              <Warehouse size={12} /> {warehouses[0]?.stockName}
            </div>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="bg-[var(--bg-surface)] rounded-xl p-1.5 shadow border border-[var(--bd)] flex gap-1 overflow-x-auto">
        {SUB_TABS.map(t => {
          const active = subTab === t.id;
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)} data-subtab={t.id}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                active
                  ? 'bg-purple-700 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                  : 'text-[var(--tx-muted)] hover:text-purple-400 hover:bg-[var(--bg-hover)]'
              }`}>
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {/* Content panel */}
      {subTab === 'balance' && (
        <StockBalancePanel
          clinicSettings={clinicSettings} theme={theme}
          defaultLocationId={selectedWarehouseId}
          lockLocation
          // Phase 15.4 post-deploy s22 — wire row-action buttons to central
          // sub-tabs (was no-op before; user reported broken UX).
          onAdjustProduct={handleCentralAdjustProduct}
          onAddStockForProduct={handleCentralAddStockForProduct}
        />
      )}

      {subTab === 'orders' && (
        <CentralStockOrderPanel
          centralWarehouseId={selectedWarehouseId}
          theme={theme}
          prefillProduct={orderPrefill}
          onPrefillConsumed={() => setOrderPrefill(null)}
        />
      )}

      {subTab === 'adjust' && (
        <StockAdjustPanel
          clinicSettings={clinicSettings} theme={theme}
          branchIdOverride={selectedWarehouseId}
          prefillProduct={adjustPrefill}
          onPrefillConsumed={() => setAdjustPrefill(null)}
        />
      )}

      {subTab === 'transfers' && (
        <StockTransferPanel
          clinicSettings={clinicSettings} theme={theme}
          filterLocationId={selectedWarehouseId}
        />
      )}

      {subTab === 'withdrawals' && (
        <StockWithdrawalPanel
          clinicSettings={clinicSettings} theme={theme}
          filterLocationId={selectedWarehouseId}
        />
      )}

      {subTab === 'movements' && (
        <MovementLogPanel
          clinicSettings={clinicSettings} theme={theme}
          branchIdOverride={selectedWarehouseId}
        />
      )}

      {subTab === 'warehouses' && (
        <CentralWarehousePanel clinicSettings={clinicSettings} theme={theme} onAfterCreate={loadWarehouses} />
      )}
    </div>
  );
}
