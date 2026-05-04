// ─── PointsPanel — คะแนนสะสม (Phase 7) ─────────────────────────────────────
// Shows each customer's loyalty point balance + recent earn/redeem/adjust
// transactions. Per §20.6, points are NEVER redeemed during a sale — they
// only earn automatically and are spent via manual adjustment.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Star, Search, Loader2, X, Clock, History, AlertCircle, CheckCircle2,
  ArrowUpCircle, ArrowDownCircle, RefreshCw, Plus, Crown,
} from 'lucide-react';
import {
  getAllCustomers, getPointBalance, getPointTransactions, adjustPoints,
  getCustomerMembership,
} from '../../lib/scopedDataLayer.js';
import { fmtPoints, fmtMoney } from '../../lib/financeUtils.js';

const clean = (o) => JSON.parse(JSON.stringify(o));

function PtxTypeBadge({ type, isDark }) {
  const meta = {
    earn:               { label: 'สะสม',       cls: 'bg-emerald-900/30 text-emerald-400', lightCls: 'bg-emerald-50 text-emerald-700' },
    redeem:             { label: 'แลก',         cls: 'bg-sky-900/30 text-sky-400',          lightCls: 'bg-sky-50 text-sky-700' },
    adjust:             { label: 'ปรับ',        cls: 'bg-orange-900/30 text-orange-400',      lightCls: 'bg-orange-50 text-orange-700' },
    membership_initial: { label: 'บัตรสมาชิก',   cls: 'bg-purple-900/30 text-purple-400',    lightCls: 'bg-purple-50 text-purple-700' },
    reverse:            { label: 'คืน',          cls: 'bg-gray-800/50 text-gray-400',        lightCls: 'bg-gray-100 text-gray-600' },
    expire:             { label: 'หมดอายุ',     cls: 'bg-red-900/30 text-red-400',          lightCls: 'bg-red-50 text-red-700' },
  }[type] || { label: type, cls: 'bg-gray-800/50 text-gray-400', lightCls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isDark ? meta.cls : meta.lightCls}`}>{meta.label}</span>;
}

export default function PointsPanel({ theme, initialCustomer, onCustomerUsed }) {
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block';
  const inputCls = `w-full rounded-lg px-3 py-2 text-xs outline-none border transition-all ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)] focus:border-orange-500' : 'bg-white border-gray-200 text-gray-800 focus:border-orange-400'}`;

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [adjustModal, setAdjustModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try { setCustomers(await getAllCustomers()); }
    catch { setCustomers([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // Auto-open adjust if initialCustomer
  useEffect(() => {
    if (initialCustomer) {
      setAdjustModal(initialCustomer);
      if (onCustomerUsed) onCustomerUsed();
    }
  }, [initialCustomer, onCustomerUsed]);

  // Only show customers with points > 0 OR any transaction history would be better,
  // but since we denormalize on customer doc, filter by finance.loyaltyPoints > 0.
  const withPoints = useMemo(() => {
    return customers.filter(c => {
      const p = Number(c.finance?.loyaltyPoints || 0);
      return p > 0;
    });
  }, [customers]);

  const filtered = useMemo(() => {
    let list = withPoints;
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      list = list.filter(c => {
        const nm = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.toLowerCase();
        return nm.includes(q) || (c.proClinicHN || '').toLowerCase().includes(q);
      });
    }
    // Sort by point desc
    list = [...list].sort((a, b) => (b.finance?.loyaltyPoints || 0) - (a.finance?.loyaltyPoints || 0));
    return list;
  }, [withPoints, filterQuery]);

  const totalPoints = useMemo(
    () => withPoints.reduce((s, c) => s + (Number(c.finance?.loyaltyPoints) || 0), 0),
    [withPoints]
  );

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(245,158,11,0.15)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-400/60" />
            <input type="text" value={filterQuery} onChange={e => setFilterQuery(e.target.value)}
              placeholder="ค้นหาลูกค้า... (ชื่อ / HN)"
              className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-sm text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none transition-all" />
          </div>
          <select onChange={e => {
              const c = customers.find(x => (x.proClinicId || x.id) === e.target.value);
              if (c) setAdjustModal(c);
              e.target.value = '';
            }}
            className="px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-xs font-bold text-[var(--tx-primary)] focus:outline-none max-w-[240px]">
            <option value="">— เลือกลูกค้าเพื่อปรับคะแนน —</option>
            {customers.slice(0, 500).map(c => {
              const nm = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.trim();
              return <option key={c.id} value={c.proClinicId || c.id}>{nm} {c.proClinicHN}</option>;
            })}
          </select>
          <button onClick={loadCustomers}
            className="p-2.5 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)] hover:text-orange-400 text-[var(--tx-muted)] transition-all" aria-label="รีเฟรช">
            <RefreshCw size={14} />
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--tx-muted)] flex items-center gap-4">
          <span><Star size={12} className="inline text-orange-400 mr-1" />ลูกค้าที่มีคะแนน: {withPoints.length} คน</span>
          <span>คะแนนรวม: <span className="font-bold text-orange-400">{fmtPoints(totalPoints)}</span></span>
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--tx-muted)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))', border: '1.5px solid rgba(245,158,11,0.3)' }}>
            <Star size={32} className="text-orange-400" />
          </div>
          <h3 className="text-xl font-black text-[var(--tx-heading)] mb-2 tracking-tight">ยังไม่มีลูกค้าที่มีคะแนน</h3>
          <p className="text-sm text-[var(--tx-muted)] max-w-lg mx-auto">
            คะแนนจะสะสมอัตโนมัติเมื่อบันทึก sale ที่ลูกค้ามีบัตรสมาชิก (ตาม bahtPerPoint ของบัตร)
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => {
            const nm = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.trim();
            const cid = String(c.proClinicId || c.id);
            const pts = Number(c.finance?.loyaltyPoints) || 0;
            const mbr = c.finance?.membershipType || '';
            return (
              <div key={cid} className={`rounded-xl border p-4 ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <a href={`/?backend=1&customer=${cid}`} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-bold text-teal-400 hover:text-teal-300 hover:underline truncate block">{nm}</a>
                    <span className="text-[10px] text-[var(--tx-muted)] font-mono">{c.proClinicHN}</span>
                    {mbr && <div className="text-[10px] text-purple-400 flex items-center gap-1 mt-0.5"><Crown size={9} /> {mbr}</div>}
                  </div>
                  <div className="flex gap-0.5">
                    <button onClick={() => setAdjustModal(c)} className="p-1.5 rounded hover:bg-orange-900/20 text-orange-400" aria-label="ปรับคะแนน" title="ปรับคะแนน"><Plus size={11} /></button>
                    <button onClick={() => setHistoryModal(c)} className="p-1.5 rounded hover:bg-violet-900/20 text-violet-400" aria-label="ประวัติ" title="ประวัติ"><History size={11} /></button>
                  </div>
                </div>
                <div className="text-2xl font-black text-orange-400 flex items-center gap-1">
                  <Star size={18} fill="currentColor" />
                  {fmtPoints(pts)}
                  <span className="text-xs font-normal text-[var(--tx-muted)] ml-1">คะแนน</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adjustModal && (
        <AdjustModal
          customer={adjustModal}
          isDark={isDark}
          inputCls={inputCls}
          labelCls={labelCls}
          onClose={() => setAdjustModal(null)}
          onDone={() => { setAdjustModal(null); loadCustomers(); }}
        />
      )}
      {historyModal && (
        <HistoryModal
          customer={historyModal}
          isDark={isDark}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </div>
  );
}

function AdjustModal({ customer, isDark, inputCls, labelCls, onClose, onDone }) {
  const cid = String(customer.proClinicId || customer.id);
  const nm = `${customer.patientData?.prefix || ''} ${customer.patientData?.firstName || ''} ${customer.patientData?.lastName || ''}`.trim();
  const [curPoints, setCurPoints] = useState(Number(customer.finance?.loyaltyPoints) || 0);
  const [bahtPerPoint, setBahtPerPoint] = useState(0);
  const [isIncrease, setIsIncrease] = useState(true);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const live = await getPointBalance(cid);
        setCurPoints(live);
        const mbr = await getCustomerMembership(cid);
        setBahtPerPoint(Number(mbr?.bahtPerPoint) || 0);
      } catch {}
    })();
  }, [cid]);

  const preview = (() => {
    const a = parseInt(amount) || 0;
    return Math.max(0, isIncrease ? curPoints + a : curPoints - a);
  })();

  const handleSave = async () => {
    const a = parseInt(amount);
    if (!a || a <= 0) { setError('จำนวนต้องมากกว่า 0'); return; }
    if (!isIncrease && curPoints < a) { setError(`คะแนนไม่พอ (มี ${curPoints})`); return; }
    if (!note.trim()) { setError('กรุณาระบุเหตุผล'); return; }
    setSaving(true); setError('');
    try {
      await adjustPoints(cid, clean({ amount: a, isIncrease, note }));
      onDone();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60" role="dialog" aria-modal="true"
      onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`}
        onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-4 border-b ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
          <h3 className="text-sm font-bold text-orange-400 flex items-center gap-1.5">
            <Star size={13} /> ปรับคะแนนสะสม
          </h3>
          <p className="text-xs text-[var(--tx-muted)] mt-1">
            {nm} {customer.proClinicHN && `· ${customer.proClinicHN}`}
          </p>
          <p className="text-xs text-orange-400 mt-1">คะแนนปัจจุบัน: {fmtPoints(curPoints)} คะแนน</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input type="radio" checked={isIncrease} onChange={() => setIsIncrease(true)} className="accent-emerald-500" />
              <ArrowUpCircle size={12} className="text-emerald-400" /> เพิ่ม
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input type="radio" checked={!isIncrease} onChange={() => setIsIncrease(false)} className="accent-red-500" />
              <ArrowDownCircle size={12} className="text-red-400" /> ลด
            </label>
          </div>
          <div>
            <label className={labelCls}>จำนวนคะแนน *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} placeholder="0" min="1" />
          </div>
          <div>
            <label className={labelCls}>เหตุผล *</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="ระบุเหตุผลการปรับคะแนน" />
          </div>
          {amount && (
            <div className="text-xs text-[var(--tx-muted)]">
              คะแนนหลังปรับ: <span className="font-bold text-orange-400">{fmtPoints(preview)}</span>
              {bahtPerPoint > 0 && <span className="text-[10px] ml-2">· มูลค่าประมาณ {fmtMoney(preview * bahtPerPoint)} บาท</span>}
            </div>
          )}
          {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</div>}
        </div>
        <div className={`px-5 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
          <button onClick={onClose} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ปิด</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold bg-orange-700 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ customer, isDark, onClose }) {
  const cid = String(customer.proClinicId || customer.id);
  const nm = `${customer.patientData?.prefix || ''} ${customer.patientData?.firstName || ''} ${customer.patientData?.lastName || ''}`.trim();
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setTxs(await getPointTransactions(cid)); }
      catch { setTxs([]); }
      finally { setLoading(false); }
    })();
  }, [cid]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true"
      onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className={`w-full max-w-2xl mx-4 rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`}
        onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
          <div>
            <h3 className="text-sm font-bold text-violet-400">ประวัติคะแนนสะสม</h3>
            <p className="text-xs text-[var(--tx-muted)] mt-1">{nm} {customer.proClinicHN && `· ${customer.proClinicHN}`}</p>
          </div>
          <button onClick={onClose} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]" aria-label="ปิด"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-[var(--tx-muted)]" />
            </div>
          ) : txs.length === 0 ? (
            <p className="text-xs text-[var(--tx-muted)] text-center py-6">ยังไม่มีรายการ</p>
          ) : (
            <div className="space-y-1.5">
              {txs.map(tx => (
                <div key={tx.id || tx.ptxId} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDark ? 'bg-[var(--bg-elevated)]' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock size={11} className="text-[var(--tx-muted)] flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <PtxTypeBadge type={tx.type} isDark={isDark} />
                        {tx.referenceId && <span className="text-[10px] font-mono text-[var(--tx-muted)] truncate">{tx.referenceId}</span>}
                      </div>
                      <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                        {tx.purchaseAmount > 0 && (
                          <span className="ml-2">ซื้อ ฿{fmtMoney(tx.purchaseAmount)} · อัตรา ฿{tx.bahtPerPoint}</span>
                        )}
                      </div>
                      {tx.note && <div className="text-[10px] text-[var(--tx-secondary)] italic mt-0.5 truncate">{tx.note}</div>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className={`font-mono text-xs font-bold ${tx.type === 'redeem' || (tx.type === 'adjust' && tx.pointsAfter < tx.pointsBefore) ? 'text-red-400' : 'text-emerald-400'}`}>
                      {tx.type === 'redeem' || (tx.type === 'adjust' && tx.pointsAfter < tx.pointsBefore) ? '-' : '+'}
                      {fmtPoints(tx.amount)}
                    </div>
                    <div className="text-[10px] text-[var(--tx-muted)] font-mono">
                      คงเหลือ {fmtPoints(tx.pointsAfter)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
