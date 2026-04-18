// ─── WalletPicker — ใช้ Wallet ในการชำระ (Phase 7) ──────────────────────────
// Mirrors DepositPicker's shape but for customer wallets.
// - Lists all the customer's wallets (from be_customer_wallets), showing each
//   balance
// - User picks ONE wallet at a time (to match ProClinic's `customer_wallet_id`
//   + `credit` fields), enters an amount
// - Caps the amount at min(walletBalance + initiallyAppliedToThisRecord, maxAmount)
//   so edit-mode can redistribute up to the pre-apply balance
//
// Props:
//   - customerId: string (required)
//   - value: { walletTypeId, amount } | null   — single selection
//   - onChange: (newValue | null) => void
//   - maxAmount?: number — cap total wallet usage
//   - isDark?: boolean
//   - reloadKey?: any

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, CreditCard, AlertCircle } from 'lucide-react';
import { getCustomerWallets } from '../../lib/backendClient.js';
import { fmtMoney } from '../../lib/financeUtils.js';

export default function WalletPicker({
  customerId,
  value = null,
  onChange,
  maxAmount = Infinity,
  isDark = false,
  reloadKey,
}) {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Snapshot initial application (for edit mode) — same trick as DepositPicker
  const initialApplied = useMemo(() => {
    return value && value.walletTypeId ? Number(value.amount) || 0 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, reloadKey]);
  const initialWalletTypeId = useMemo(() => {
    return value && value.walletTypeId ? String(value.walletTypeId) : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, reloadKey]);

  const load = useCallback(async () => {
    if (!customerId) { setWallets([]); return; }
    setLoading(true); setLoadError('');
    try {
      const list = await getCustomerWallets(customerId);
      setWallets(list);
    } catch (e) {
      console.warn('[WalletPicker] load failed:', e);
      setLoadError(e.message || 'โหลดกระเป๋าเงินไม่สำเร็จ');
      setWallets([]);
    } finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const selectedWalletTypeId = value?.walletTypeId ? String(value.walletTypeId) : '';
  const currentAmount = Number(value?.amount) || 0;

  const availableFor = (w) => {
    const own = Number(w.balance) || 0;
    const mine = String(w.walletTypeId) === initialWalletTypeId ? initialApplied : 0;
    return own + mine;
  };

  const selectedWallet = wallets.find(w => String(w.walletTypeId) === selectedWalletTypeId);
  const selectedAvail = selectedWallet ? availableFor(selectedWallet) : 0;
  const cap = Math.min(selectedAvail, Number(maxAmount) || 0);

  const setWallet = (walletTypeId) => {
    if (!walletTypeId) { onChange?.(null); return; }
    const w = wallets.find(x => String(x.walletTypeId) === String(walletTypeId));
    const avail = w ? availableFor(w) : 0;
    const defaultAmt = Math.min(avail, Number(maxAmount) || 0);
    onChange?.({ walletTypeId: String(walletTypeId), amount: defaultAmt, walletTypeName: w?.walletTypeName || '' });
  };

  const setAmount = (raw) => {
    if (!selectedWalletTypeId) return;
    const a = Math.max(0, Math.min(cap, parseFloat(raw) || 0));
    onChange?.({ walletTypeId: selectedWalletTypeId, amount: a, walletTypeName: selectedWallet?.walletTypeName || '' });
  };

  const setMax = () => setAmount(cap);

  const cardCls = isDark ? 'bg-[var(--bg-elevated)] border-[var(--bd)]' : 'bg-gray-50 border-gray-200';
  const inputCls = `rounded-lg px-2 py-1 text-xs outline-none border ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)]' : 'bg-white border-gray-200 text-gray-800'}`;

  if (!customerId) {
    return (
      <div className={`rounded-lg border p-3 text-xs text-[var(--tx-muted)] ${cardCls}`}>
        <div className="flex items-center gap-2">
          <CreditCard size={12} className="text-sky-400" />
          <span>เลือกลูกค้าก่อนเพื่อดูกระเป๋าเงิน</span>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className={`rounded-lg border p-3 text-xs flex items-center gap-2 ${cardCls}`}>
        <Loader2 size={12} className="animate-spin text-[var(--tx-muted)]" />
        <span className="text-[var(--tx-muted)]">กำลังโหลด...</span>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className={`rounded-lg border p-3 text-xs flex items-center gap-2 ${isDark ? 'bg-red-900/10 border-red-700/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
        <AlertCircle size={12} /><span>{loadError}</span>
      </div>
    );
  }
  if (wallets.length === 0) {
    return (
      <div className={`rounded-lg border p-3 text-xs text-[var(--tx-muted)] ${cardCls}`}>
        <div className="flex items-center gap-2">
          <CreditCard size={12} className="text-[var(--tx-muted)]" />
          <span>ลูกค้ารายนี้ไม่มีกระเป๋าเงิน</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${cardCls}`}>
      <div className={`px-3 py-2 border-b ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <CreditCard size={13} className="text-sky-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">ใช้ Wallet</span>
        </div>
        <div className="text-xs font-bold">
          <span className="text-[var(--tx-muted)]">ใช้ </span>
          <span className="text-sky-400">฿{fmtMoney(currentAmount)}</span>
        </div>
      </div>
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
        <select value={selectedWalletTypeId} onChange={e => setWallet(e.target.value)} className={`${inputCls} flex-1 min-w-[180px]`}>
          <option value="">เลือกกระเป๋าเงิน</option>
          {wallets.map(w => (
            <option key={w.id} value={w.walletTypeId}>
              {w.walletTypeName} — คงเหลือ ฿{fmtMoney(availableFor(w))}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={currentAmount || ''}
          onChange={e => setAmount(e.target.value)}
          onFocus={e => e.target.select()}
          min="0"
          max={cap}
          disabled={!selectedWalletTypeId}
          className={`${inputCls} w-28 text-right ${!selectedWalletTypeId ? 'opacity-40' : ''}`}
          placeholder="0"
        />
        <button type="button" onClick={setMax} disabled={!selectedWalletTypeId}
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            isDark ? 'border-sky-700/40 text-sky-400 hover:bg-sky-900/20' : 'border-sky-300 text-sky-700 hover:bg-sky-50'
          } ${!selectedWalletTypeId ? 'opacity-40 cursor-not-allowed' : ''}`}
          title="ใช้สูงสุด">max</button>
      </div>
      {selectedWalletTypeId && currentAmount > 0 && initialApplied > 0 && (
        <div className={`px-3 pb-2 text-[10px] ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
          (ใช้บิลนี้ ฿{fmtMoney(initialApplied)} — ปรับใหม่แล้วจะ reverse + reapply อัตโนมัติ)
        </div>
      )}
    </div>
  );
}
