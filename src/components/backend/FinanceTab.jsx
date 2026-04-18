// ─── FinanceTab — การเงิน (Phase 7) ─────────────────────────────────────────
// Container for 4 sub-tabs: Deposit / Wallet / Membership / Points
// Only Deposit is wired in Phase 7 Step 1 — others show "Coming soon" placeholders
// until their panels land in subsequent Phase 7 steps.

import { useState, useEffect } from 'react';
import { Wallet, CreditCard, Ticket, Star } from 'lucide-react';
import DepositPanel from './DepositPanel.jsx';
import WalletPanel from './WalletPanel.jsx';

const SUB_TABS = [
  { key: 'deposit',    label: 'มัดจำ',        icon: Wallet,     color: 'emerald' },
  { key: 'wallet',     label: 'กระเป๋าเงิน',  icon: CreditCard, color: 'sky' },
  { key: 'membership', label: 'บัตรสมาชิก',   icon: Ticket,     color: 'purple' },
  { key: 'points',     label: 'คะแนนสะสม',    icon: Star,       color: 'amber' },
];

const COLOR_ACTIVE = {
  emerald: 'bg-emerald-700 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)]',
  sky:     'bg-sky-700 text-white shadow-[0_0_12px_rgba(14,165,233,0.35)]',
  purple:  'bg-purple-700 text-white shadow-[0_0_12px_rgba(168,85,247,0.35)]',
  amber:   'bg-amber-700 text-white shadow-[0_0_12px_rgba(245,158,11,0.35)]',
};
const COLOR_HOVER = {
  emerald: 'hover:text-emerald-400 hover:border-emerald-800/50',
  sky:     'hover:text-sky-400 hover:border-sky-800/50',
  purple:  'hover:text-purple-400 hover:border-purple-800/50',
  amber:   'hover:text-amber-400 hover:border-amber-800/50',
};

export default function FinanceTab({ clinicSettings, theme, initialCustomer, onCustomerUsed, initialSubTab }) {
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab || 'deposit');

  // Support deep link ?backend=1&tab=finance&subtab=deposit
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const sub = params.get('subtab');
    if (sub && SUB_TABS.some(t => t.key === sub)) setActiveSubTab(sub);
  }, []);

  return (
    <div className="space-y-4">
      {/* Sub-tab nav */}
      <div className="flex items-center gap-2 flex-wrap">
        {SUB_TABS.map(t => {
          const Icon = t.icon;
          const isActive = activeSubTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveSubTab(t.key)} role="tab" aria-selected={isActive}
              className={`px-3 py-2 rounded-lg text-xs font-bold tracking-wider transition-all flex items-center gap-1.5 ${
                isActive
                  ? COLOR_ACTIVE[t.color]
                  : `bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] ${COLOR_HOVER[t.color]}`
              }`}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Sub-panel */}
      {activeSubTab === 'deposit' && (
        <DepositPanel
          clinicSettings={clinicSettings}
          theme={theme}
          initialCustomer={initialCustomer}
          onCustomerUsed={onCustomerUsed}
        />
      )}
      {activeSubTab === 'wallet' && (
        <WalletPanel
          theme={theme}
          initialCustomer={initialCustomer}
          onCustomerUsed={onCustomerUsed}
        />
      )}
      {activeSubTab === 'membership' && <ComingSoon label="บัตรสมาชิก (Membership)" />}
      {activeSubTab === 'points' && <ComingSoon label="คะแนนสะสม (Loyalty Points)" />}
    </div>
  );
}

function ComingSoon({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--bd)] flex items-center justify-center mb-4">
        <Star size={24} className="text-[var(--tx-muted)]" />
      </div>
      <p className="text-sm font-bold text-[var(--tx-heading)]">{label}</p>
      <p className="text-xs text-[var(--tx-muted)] mt-1">กำลังพัฒนา — จะพร้อมใช้ใน Phase 7 ขั้นถัดไป</p>
    </div>
  );
}
