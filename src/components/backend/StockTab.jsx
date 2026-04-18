// ─── StockTab — container for all stock sub-panels ──────────────────────────
// Sub-tabs: Balance (ยอดคงเหลือ) / Orders (นำเข้า) / Adjust (ปรับสต็อก) / Movement Log

import { useState } from 'react';
import { Package, ShoppingBag, SlidersHorizontal, Activity } from 'lucide-react';
import OrderPanel from './OrderPanel.jsx';
import StockAdjustPanel from './StockAdjustPanel.jsx';
import MovementLogPanel from './MovementLogPanel.jsx';
import StockBalancePanel from './StockBalancePanel.jsx';

const SUB_TABS = [
  { id: 'balance', label: 'ยอดคงเหลือ', icon: <Package size={14} />, Component: StockBalancePanel },
  { id: 'orders', label: 'นำเข้า', icon: <ShoppingBag size={14} />, Component: OrderPanel },
  { id: 'adjust', label: 'ปรับสต็อก', icon: <SlidersHorizontal size={14} />, Component: StockAdjustPanel },
  { id: 'log', label: 'Movement Log', icon: <Activity size={14} />, Component: MovementLogPanel },
];

export default function StockTab({ clinicSettings, theme, initialSubTab }) {
  const [subTab, setSubTab] = useState(initialSubTab || 'balance');
  const Current = SUB_TABS.find(t => t.id === subTab)?.Component || StockBalancePanel;

  return (
    <div className="space-y-3">
      {/* Sub-tab nav */}
      <div className="bg-[var(--bg-surface)] rounded-xl p-1.5 shadow border border-[var(--bd)] flex gap-1 overflow-x-auto">
        {SUB_TABS.map(t => {
          const active = subTab === t.id;
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                active
                  ? 'bg-rose-700 text-white shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                  : 'text-[var(--tx-muted)] hover:text-rose-400 hover:bg-[var(--bg-hover)]'
              }`}>
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      <Current clinicSettings={clinicSettings} theme={theme} />
    </div>
  );
}
