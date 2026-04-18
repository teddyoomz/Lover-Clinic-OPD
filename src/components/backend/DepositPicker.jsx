// ─── DepositPicker — หักมัดจำ (Phase 7) ─────────────────────────────────────
// Reusable component for selecting customer's active deposits to apply to a sale/treatment.
// Reads real balances from be_deposits (via getActiveDeposits), not ProClinic options.
//
// Props:
//   - customerId: string (required)
//   - value: array of { depositId, amount } (controlled)
//   - onChange: (newValue) => void
//   - maxAmount?: number — cap total deposit usage (e.g. billing.afterDiscount)
//   - isDark?: boolean
//   - compact?: boolean — if true, render inline row (for billing summary); else full panel
//   - reloadKey?: any — change to force reload (e.g. after sale save/cancel)
//
// Usage:
//   const [selDeps, setSelDeps] = useState([]);
//   <DepositPicker customerId={cid} value={selDeps} onChange={setSelDeps} maxAmount={billing.afterDiscount} isDark={isDark} />
//   // billing.depositApplied = selDeps.reduce((s, d) => s + Number(d.amount), 0)

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Wallet, AlertCircle } from 'lucide-react';
import { getActiveDeposits } from '../../lib/backendClient.js';
import { fmtMoney } from '../../lib/financeUtils.js';

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = (s || '').split('-');
  if (!y || !m || !d) return s;
  return `${+d} ${THAI_MONTHS_SHORT[(+m) - 1]} ${String((+y) + 543).slice(-2)}`;
}

export default function DepositPicker({
  customerId,
  value = [],
  onChange,
  maxAmount = Infinity,
  isDark = false,
  compact = false,
  reloadKey,
}) {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Snapshot "what was already applied to THIS record" at open time (edit mode = restored sale.billing.depositIds;
  // create mode = []). This lets us show the correct "available = remainingAmount + mine" so edit mode doesn't
  // over-restrict (since the remainingAmount in Firestore has already been reduced by this record's own apply).
  // Re-snapshots on customerId or reloadKey change (parent resets both together after save/open).
  const initialApplied = useMemo(() => {
    const snap = {};
    (value || []).forEach(v => { snap[v.depositId] = Number(v.amount) || 0; });
    return snap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, reloadKey]);

  // Load active deposits for this customer
  const load = useCallback(async () => {
    if (!customerId) { setDeposits([]); return; }
    setLoading(true); setLoadError('');
    try {
      const list = await getActiveDeposits(customerId);
      setDeposits(list);
    } catch (e) {
      console.warn('[DepositPicker] load failed:', e);
      setLoadError(e.message || 'โหลดมัดจำไม่สำเร็จ');
      setDeposits([]);
    } finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load, reloadKey]);

  // Total balance = Σ availableFor(dep) — accounts for edit-mode self-apply without double-counting stale rows.
  // (Computed separately below after `rows` is built.)

  // Total currently-used amount across all selected deposits
  const usedTotal = useMemo(
    () => value.reduce((s, v) => s + (Number(v.amount) || 0), 0),
    [value]
  );

  // Merge pre-selected value (edit mode) with fetched deposits:
  // Make sure edit-mode deposits that may no longer appear in active list still show
  const rows = useMemo(() => {
    const seen = new Set(deposits.map(d => d.depositId));
    const fromValue = value
      .filter(v => !seen.has(v.depositId))
      .map(v => ({
        depositId: v.depositId,
        amount: Number(v.originalAmount || 0),
        usedAmount: 0,
        remainingAmount: Number(v.amount) || 0, // treat as fully available for the existing selection
        paymentDate: v.paymentDate || '',
        _stale: true,
      }));
    return [...deposits, ...fromValue];
  }, [deposits, value]);

  const selectedMap = useMemo(() => {
    const m = {};
    value.forEach(v => { m[v.depositId] = Number(v.amount) || 0; });
    return m;
  }, [value]);

  // "available" for a deposit = current remaining (post-apply) + what this record already applied (edit mode).
  // In create mode, `initialApplied[id]` is 0 so it's just remainingAmount.
  // Stale rows (deposit no longer in active list) use the faked remainingAmount as-is — no double count.
  const availableFor = (dep) => {
    if (dep._stale) return Number(dep.remainingAmount) || 0;
    const own = Number(dep.remainingAmount) || 0;
    const mine = Number(initialApplied[dep.depositId]) || 0;
    return own + mine;
  };

  const totalBalance = useMemo(
    () => rows.reduce((s, d) => s + availableFor(d), 0),
    // availableFor closes over initialApplied, already tracked via [rows, initialApplied]
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, initialApplied]
  );

  const setSelected = (depositId, amount) => {
    const a = Math.max(0, Number(amount) || 0);
    const without = value.filter(v => v.depositId !== depositId);
    if (a <= 0) { onChange?.(without); return; }
    onChange?.([...without, { depositId, amount: a }]);
  };

  const capFor = (dep) => {
    const avail = availableFor(dep);
    const myCurrent = selectedMap[dep.depositId] || 0;
    const othersTotal = usedTotal - myCurrent;
    const fromMax = Math.max(0, (Number(maxAmount) || 0) - othersTotal);
    return Math.min(avail, fromMax);
  };

  const handleToggle = (dep, checked) => {
    if (!checked) { setSelected(dep.depositId, 0); return; }
    const cap = capFor(dep);
    setSelected(dep.depositId, cap); // default to max allowed
  };

  const handleAmount = (dep, raw) => {
    const a = Math.max(0, parseFloat(raw) || 0);
    const cap = capFor(dep);
    setSelected(dep.depositId, Math.min(a, cap));
  };

  const handleMax = (dep) => {
    const cap = capFor(dep);
    setSelected(dep.depositId, cap);
  };

  // ─── Render helpers ─────────────────────────────────────────────────────
  const accentText = isDark ? 'text-emerald-400' : 'text-emerald-700';
  const cardCls = isDark ? 'bg-[var(--bg-elevated)] border-[var(--bd)]' : 'bg-gray-50 border-gray-200';
  const inputCls = `rounded-lg px-2 py-1 text-xs outline-none border ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)]' : 'bg-white border-gray-200 text-gray-800'}`;

  // ─── Empty states ──────────────────────────────────────────────────────
  if (!customerId) {
    if (compact) return null;
    return (
      <div className={`rounded-lg border p-3 text-xs text-[var(--tx-muted)] ${cardCls}`}>
        <div className="flex items-center gap-2">
          <Wallet size={12} className="text-emerald-400" />
          <span>เลือกลูกค้าก่อนเพื่อดูยอดมัดจำคงเหลือ</span>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className={`rounded-lg border p-3 text-xs flex items-center gap-2 ${cardCls}`}>
        <Loader2 size={12} className="animate-spin text-[var(--tx-muted)]" />
        <span className="text-[var(--tx-muted)]">กำลังโหลดมัดจำ...</span>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className={`rounded-lg border p-3 text-xs flex items-center gap-2 ${isDark ? 'bg-red-900/10 border-red-700/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
        <AlertCircle size={12} />
        <span>{loadError}</span>
      </div>
    );
  }
  if (rows.length === 0) {
    if (compact) {
      return (
        <div className="text-xs text-[var(--tx-muted)] italic">ไม่มีมัดจำคงเหลือ</div>
      );
    }
    return (
      <div className={`rounded-lg border p-3 text-xs text-[var(--tx-muted)] ${cardCls}`}>
        <div className="flex items-center gap-2">
          <Wallet size={12} className="text-[var(--tx-muted)]" />
          <span>ลูกค้ารายนี้ไม่มีมัดจำคงเหลือ</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${cardCls}`}>
      <div className={`px-3 py-2 border-b ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Wallet size={13} className={accentText} />
          <span className={`text-xs font-bold uppercase tracking-wider ${accentText}`}>หักมัดจำ</span>
          <span className="text-[11px] text-[var(--tx-muted)]">คงเหลือ ฿{fmtMoney(totalBalance)}</span>
        </div>
        <div className="text-xs font-bold">
          <span className="text-[var(--tx-muted)]">ใช้ </span>
          <span className={accentText}>฿{fmtMoney(usedTotal)}</span>
          {Number.isFinite(maxAmount) && maxAmount > 0 && (
            <span className="text-[var(--tx-muted)] text-[10px] ml-1">/ max ฿{fmtMoney(maxAmount)}</span>
          )}
        </div>
      </div>
      <div className="divide-y divide-[var(--bd)]/40 max-h-60 overflow-y-auto">
        {rows.map((dep) => {
          const selAmt = selectedMap[dep.depositId] || 0;
          const checked = selAmt > 0;
          const cap = capFor(dep);
          const canEnable = cap > 0;
          return (
            <div key={dep.depositId} className="flex items-center gap-2 px-3 py-2">
              <input type="checkbox" checked={checked}
                onChange={e => handleToggle(dep, e.target.checked)}
                disabled={!checked && !canEnable}
                className="accent-emerald-500 w-3.5 h-3.5"
                aria-label={`ใช้มัดจำ ${dep.depositId}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-[var(--tx-secondary)] truncate">{dep.depositId}</div>
                <div className="text-[10px] text-[var(--tx-muted)]">
                  {dep.paymentDate && <span>{fmtDate(dep.paymentDate)} · </span>}
                  คงเหลือ ฿{fmtMoney(availableFor(dep))}
                  {(initialApplied[dep.depositId] || 0) > 0 && (
                    <span className="ml-1 text-amber-400">(ใช้บิลนี้ ฿{fmtMoney(initialApplied[dep.depositId])})</span>
                  )}
                  {dep._stale && <span className="ml-1 text-amber-400">(บันทึกเดิม)</span>}
                </div>
              </div>
              <input type="number" value={selAmt || ''} min="0" step="1"
                max={cap}
                onChange={e => handleAmount(dep, e.target.value)}
                onFocus={e => e.target.select()}
                disabled={!checked && !canEnable}
                className={`${inputCls} w-24 text-right ${!checked && !canEnable ? 'opacity-40' : ''}`}
                placeholder="0" />
              <button type="button" onClick={() => handleMax(dep)} disabled={!canEnable && !checked}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  isDark ? 'border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                } ${!canEnable && !checked ? 'opacity-40 cursor-not-allowed' : ''}`}
                title="ใช้สูงสุด">max</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
