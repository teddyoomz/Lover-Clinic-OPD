// ─── WalletPanel — กระเป๋าเงิน (Phase 7) ────────────────────────────────────
// Per-customer wallet listing with top-up, adjust (±), and transaction history modals.
// Depends on master_data/wallet_types for the list of wallet categories.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard, Plus, Search, Loader2, X, Clock, History, ArrowUpCircle,
  ArrowDownCircle, AlertCircle, CheckCircle2, RefreshCw,
} from 'lucide-react';
import {
  getAllCustomers,
  getCustomerWallets, topUpWallet, adjustWallet, getWalletTransactions,
  ensureCustomerWallet,
  // Phase 14.10-tris (2026-04-26) — be_wallet_types canonical
  listWalletTypes,
} from '../../lib/backendClient.js';
import { fmtMoney } from '../../lib/financeUtils.js';
import DateField from '../DateField.jsx';
import FileUploadField from './FileUploadField.jsx';

import { thaiTodayISO } from '../../utils.js';

const PAYMENT_CHANNELS = ['เงินสด', 'โอนธนาคาร', 'บัตรเครดิต', 'QR Payment', 'อื่นๆ'];

function todayStr() { return thaiTodayISO(); }
const clean = (o) => JSON.parse(JSON.stringify(o));

function TxTypeBadge({ type, isDark }) {
  const meta = {
    topup:              { label: 'เติมเงิน',  cls: 'bg-emerald-900/30 text-emerald-400', lightCls: 'bg-emerald-50 text-emerald-700' },
    deduct:             { label: 'หักจากขาย', cls: 'bg-sky-900/30 text-sky-400',          lightCls: 'bg-sky-50 text-sky-700' },
    refund:             { label: 'คืนเงิน',    cls: 'bg-purple-900/30 text-purple-400',    lightCls: 'bg-purple-50 text-purple-700' },
    adjust:             { label: 'ปรับยอด',   cls: 'bg-orange-900/30 text-orange-400',      lightCls: 'bg-orange-50 text-orange-700' },
    membership_credit:  { label: 'บัตรสมาชิก', cls: 'bg-purple-900/30 text-purple-400',    lightCls: 'bg-purple-50 text-purple-700' },
  }[type] || { label: type, cls: 'bg-gray-800/50 text-gray-400', lightCls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isDark ? meta.cls : meta.lightCls}`}>{meta.label}</span>;
}

export default function WalletPanel({ theme, initialCustomer, onCustomerUsed }) {
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block';
  const inputCls = `w-full rounded-lg px-3 py-2 text-xs outline-none border transition-all ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)] focus:border-sky-500' : 'bg-white border-gray-200 text-gray-800 focus:border-sky-400'}`;

  // ── State ──
  const [customers, setCustomers] = useState([]);
  const [walletTypes, setWalletTypes] = useState([]);
  const [allWallets, setAllWallets] = useState([]); // [{customerId, walletTypeId, balance, ...}]
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  // Modals
  const [topupModal, setTopupModal] = useState(null); // { customer, wallet? }
  const [adjustModal, setAdjustModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null); // { customer, wallet? }

  const loadCustomers = useCallback(async () => {
    try { setCustomers(await getAllCustomers()); } catch { setCustomers([]); }
  }, []);
  const loadWalletTypes = useCallback(async () => {
    try { setWalletTypes((await listWalletTypes()).filter(w => w.status !== 'พักใช้งาน')); }
    catch { setWalletTypes([]); }
  }, []);

  const loadAllWallets = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch per customer would explode — fetch the collection once and group client-side
      const { collection, getDocs } = await import('firebase/firestore');
      const { db, appId } = await import('../../firebase.js');
      const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'be_customer_wallets'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllWallets(list);
    } catch (e) {
      console.warn('[WalletPanel] load wallets failed:', e);
      setAllWallets([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCustomers(); loadWalletTypes(); loadAllWallets(); }, [loadCustomers, loadWalletTypes, loadAllWallets]);

  // Auto-focus on a specific customer if passed from CustomerDetail
  useEffect(() => {
    if (initialCustomer) {
      setSelectedCustomerId(initialCustomer.proClinicId || initialCustomer.id || '');
      if (onCustomerUsed) onCustomerUsed();
    }
  }, [initialCustomer, onCustomerUsed]);

  // Group wallets by customerId
  const walletsByCustomer = useMemo(() => {
    const m = {};
    for (const w of allWallets) {
      if (!m[w.customerId]) m[w.customerId] = [];
      m[w.customerId].push(w);
    }
    return m;
  }, [allWallets]);

  const customersWithWallets = useMemo(() => {
    // Only customers who have at least one wallet — plus any currently selected customer
    const ids = new Set(Object.keys(walletsByCustomer));
    if (selectedCustomerId) ids.add(selectedCustomerId);
    return customers.filter(c => ids.has(String(c.proClinicId || c.id)));
  }, [customers, walletsByCustomer, selectedCustomerId]);

  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return customersWithWallets;
    const q = filterQuery.toLowerCase();
    return customersWithWallets.filter(c => {
      const nm = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.toLowerCase();
      return nm.includes(q) || (c.proClinicHN || '').toLowerCase().includes(q);
    });
  }, [customersWithWallets, filterQuery]);

  const handleOpenTopup = (customer, wallet = null, walletType = null) => {
    setTopupModal({ customer, wallet, walletType });
  };
  const handleOpenAdjust = (customer, wallet) => { setAdjustModal({ customer, wallet }); };
  const handleOpenHistory = (customer, wallet = null) => { setHistoryModal({ customer, wallet }); };

  // ══════════════════ RENDER ══════════════════
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(14,165,233,0.15)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-400/60" />
            <input type="text" value={filterQuery} onChange={e => setFilterQuery(e.target.value)}
              placeholder="ค้นหาลูกค้า... (ชื่อ / HN)"
              className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-sm text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:border-sky-500/50 transition-all" />
          </div>
          <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-xs font-bold text-[var(--tx-primary)] focus:outline-none max-w-[240px]">
            <option value="">— เลือกลูกค้าใหม่เพื่อเติมเงิน —</option>
            {customers.slice(0, 500).map(c => {
              const nm = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.trim();
              return <option key={c.id} value={c.proClinicId || c.id}>{nm} {c.proClinicHN}</option>;
            })}
          </select>
          {selectedCustomerId && (
            <button onClick={() => {
              const c = customers.find(x => (x.proClinicId || x.id) === selectedCustomerId);
              if (c) handleOpenTopup(c);
            }}
              className="px-4 py-2.5 rounded-xl font-black text-xs text-white transition-all flex items-center gap-2 hover:shadow-xl uppercase tracking-wider whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg, #0369a1, #0ea5e9)', boxShadow: '0 4px 20px rgba(14,165,233,0.35)' }}>
              <Plus size={14} /> เติมเงิน
            </button>
          )}
          <button onClick={loadAllWallets}
            className="p-2.5 rounded-xl bg-[var(--bg-hover)] border border-[var(--bd)] hover:text-sky-400 text-[var(--tx-muted)] transition-all" aria-label="รีเฟรช">
            <RefreshCw size={14} />
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--tx-muted)]">
          💼 กระเป๋าเงิน {walletTypes.length} ประเภท · ลูกค้าที่มีกระเป๋าเงิน {Object.keys(walletsByCustomer).length} คน
          {walletTypes.length === 0 && (
            <span className="ml-2 text-orange-400">(ยังไม่มีประเภทกระเป๋าเงิน — ไปสร้างที่ "ข้อมูลพื้นฐาน")</span>
          )}
        </p>
      </div>

      {/* Customer wallet cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--tx-muted)]" />
          <span className="ml-3 text-sm text-[var(--tx-muted)]">กำลังโหลด...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
            style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(14,165,233,0.05))', border: '1.5px solid rgba(14,165,233,0.3)' }}>
            <CreditCard size={32} className="text-sky-400" />
          </div>
          <h3 className="text-xl font-black text-[var(--tx-heading)] mb-2 tracking-tight">ยังไม่มีกระเป๋าเงิน</h3>
          <p className="text-sm text-[var(--tx-muted)] max-w-lg mx-auto leading-relaxed">
            เลือกลูกค้าจาก dropdown ด้านบนแล้วกด "เติมเงิน" เพื่อสร้างกระเป๋าเงินครั้งแรก
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map(customer => {
            const cid = String(customer.proClinicId || customer.id);
            const wallets = walletsByCustomer[cid] || [];
            const nm = `${customer.patientData?.prefix || ''} ${customer.patientData?.firstName || ''} ${customer.patientData?.lastName || ''}`.trim();
            return (
              <div key={cid} className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <a href={`/?backend=1&customer=${cid}`} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-bold text-teal-400 hover:text-teal-300 hover:underline transition-colors">{nm || '-'}</a>
                    <span className="text-xs text-[var(--tx-muted)] font-mono ml-2">{customer.proClinicHN}</span>
                  </div>
                  <button onClick={() => handleOpenTopup(customer)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-600 flex items-center gap-1.5">
                    <Plus size={11} /> เติม / สร้าง
                  </button>
                </div>
                {wallets.length === 0 ? (
                  <p className="text-xs text-[var(--tx-muted)] italic">ยังไม่มีกระเป๋าเงิน — กด "เติม / สร้าง" เพื่อสร้างใบแรก</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {wallets.map(w => (
                      <div key={w.id} className={`rounded-lg p-3 border ${isDark ? 'bg-[var(--bg-elevated)] border-[var(--bd)]' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-sky-400 truncate">{w.walletTypeName || w.walletTypeId}</span>
                          <div className="flex gap-0.5">
                            <button onClick={() => handleOpenTopup(customer, w)} className="p-1 rounded hover:bg-emerald-900/20 text-emerald-400" aria-label="เติมเงิน" title="เติมเงิน"><Plus size={11} /></button>
                            <button onClick={() => handleOpenAdjust(customer, w)} className="p-1 rounded hover:bg-orange-900/20 text-orange-400" aria-label="ปรับยอด" title="ปรับยอด">±</button>
                            <button onClick={() => handleOpenHistory(customer, w)} className="p-1 rounded hover:bg-violet-900/20 text-violet-400" aria-label="ประวัติ" title="ประวัติ"><History size={11} /></button>
                          </div>
                        </div>
                        <div className="text-lg font-black text-[var(--tx-heading)] font-mono">
                          ฿{fmtMoney(w.balance)}
                        </div>
                        <div className="text-[10px] text-[var(--tx-muted)] mt-1">
                          เติมรวม ฿{fmtMoney(w.totalTopUp)} · ใช้รวม ฿{fmtMoney(w.totalUsed)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════ Top-up modal ══════════ */}
      {topupModal && (
        <TopupModal
          modal={topupModal}
          walletTypes={walletTypes}
          isDark={isDark}
          inputCls={inputCls}
          labelCls={labelCls}
          onClose={() => setTopupModal(null)}
          onDone={() => { setTopupModal(null); loadAllWallets(); }}
        />
      )}

      {/* ══════════ Adjust modal ══════════ */}
      {adjustModal && (
        <AdjustModal
          modal={adjustModal}
          isDark={isDark}
          inputCls={inputCls}
          labelCls={labelCls}
          onClose={() => setAdjustModal(null)}
          onDone={() => { setAdjustModal(null); loadAllWallets(); }}
        />
      )}

      {/* ══════════ History modal ══════════ */}
      {historyModal && (
        <HistoryModal
          modal={historyModal}
          isDark={isDark}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </div>
  );
}

// ─── Top-up Modal ──────────────────────────────────────────────────────────

function TopupModal({ modal, walletTypes, isDark, inputCls, labelCls, onClose, onDone }) {
  const { customer, wallet } = modal;
  const [walletTypeId, setWalletTypeId] = useState(wallet?.walletTypeId || '');
  const [amount, setAmount] = useState('');
  const [paymentChannel, setPaymentChannel] = useState('เงินสด');
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedType = walletTypes.find(w => String(w.id) === String(walletTypeId));
  const customerId = String(customer.proClinicId || customer.id);
  const customerName = `${customer.patientData?.prefix || ''} ${customer.patientData?.firstName || ''} ${customer.patientData?.lastName || ''}`.trim();

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!walletTypeId) { setError('กรุณาเลือกประเภทกระเป๋าเงิน'); return; }
    if (!amt || amt <= 0) { setError('ยอดเติมต้องมากกว่า 0'); return; }
    setSaving(true); setError('');
    try {
      await topUpWallet(customerId, walletTypeId, clean({
        amount: amt,
        walletTypeName: selectedType?.name || '',
        paymentChannel, refNo, note,
        referenceType: 'manual', referenceId: '',
        paymentEvidenceUrl: evidenceUrl || '',
      }));
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
          <h3 className="text-sm font-bold text-sky-400 flex items-center gap-1.5">
            <ArrowUpCircle size={14} /> เติมเงินกระเป๋า
          </h3>
          <p className="text-xs text-[var(--tx-muted)] mt-1">
            {customerName} {customer.proClinicHN && `· ${customer.proClinicHN}`}
            {wallet && <> · ปัจจุบัน ฿{fmtMoney(wallet.balance)}</>}
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className={labelCls}>ประเภทกระเป๋าเงิน *</label>
            <select value={walletTypeId} onChange={e => setWalletTypeId(e.target.value)} className={inputCls} disabled={!!wallet}>
              <option value="">เลือกประเภท</option>
              {walletTypes.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>ยอดเติม (บาท) *</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} placeholder="0" min="1" />
            </div>
            <div>
              <label className={labelCls}>ช่องทาง</label>
              <select value={paymentChannel} onChange={e => setPaymentChannel(e.target.value)} className={inputCls}>
                {PAYMENT_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>วันที่</label>
              <DateField value={paymentDate} onChange={setPaymentDate} />
            </div>
            <div>
              <label className={labelCls}>เลขอ้างอิง</label>
              <input type="text" value={refNo} onChange={e => setRefNo(e.target.value)} className={inputCls} placeholder="REF-..." />
            </div>
          </div>
          <div>
            <label className={labelCls}>หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="หมายเหตุ (ถ้ามี)" />
          </div>
          <FileUploadField
            storagePath={`uploads/be_wallet_topups/${customerId}_${Date.now()}`}
            fieldName="topupEvidence"
            label="แนบหลักฐาน"
            isDark={isDark}
            onUploadComplete={({ url }) => setEvidenceUrl(url)}
            onDelete={() => setEvidenceUrl('')}
          />
          {wallet && amount && (
            <div className="text-xs text-[var(--tx-muted)]">
              ยอดหลังเติม: <span className="font-mono text-emerald-400 font-bold">฿{fmtMoney((Number(wallet.balance) || 0) + (parseFloat(amount) || 0))}</span>
            </div>
          )}
          {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</div>}
        </div>
        <div className={`px-5 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
          <button onClick={onClose} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ปิด</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            ยืนยันเติม
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Adjust Modal ──────────────────────────────────────────────────────────

function AdjustModal({ modal, isDark, inputCls, labelCls, onClose, onDone }) {
  const { customer, wallet } = modal;
  const [isIncrease, setIsIncrease] = useState(true);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const customerId = String(customer.proClinicId || customer.id);
  const preview = (() => {
    const a = parseFloat(amount) || 0;
    const cur = Number(wallet.balance) || 0;
    return Math.max(0, isIncrease ? cur + a : cur - a);
  })();

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('ยอดต้องมากกว่า 0'); return; }
    if (!note.trim()) { setError('กรุณาระบุเหตุผลการปรับยอด'); return; }
    setSaving(true); setError('');
    try {
      await adjustWallet(customerId, wallet.walletTypeId, clean({
        amount: amt, isIncrease,
        walletTypeName: wallet.walletTypeName || '',
        note,
      }));
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
          <h3 className="text-sm font-bold text-orange-400">ปรับยอดกระเป๋าเงิน</h3>
          <p className="text-xs text-[var(--tx-muted)] mt-1">
            {wallet.walletTypeName} · ยอดปัจจุบัน ฿{fmtMoney(wallet.balance)}
          </p>
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
            <label className={labelCls}>จำนวน (บาท) *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} placeholder="0" min="1" />
          </div>
          <div>
            <label className={labelCls}>เหตุผล *</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="ระบุเหตุผลการปรับยอด" />
          </div>
          {amount && (
            <div className="text-xs text-[var(--tx-muted)]">
              ยอดหลังปรับ: <span className={`font-mono font-bold ${isIncrease ? 'text-emerald-400' : 'text-orange-400'}`}>฿{fmtMoney(preview)}</span>
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

// ─── History Modal ──────────────────────────────────────────────────────────

function HistoryModal({ modal, isDark, onClose }) {
  const { customer, wallet } = modal;
  const customerId = String(customer.proClinicId || customer.id);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await getWalletTransactions(customerId, wallet?.walletTypeId || null);
        setTxs(list);
      } catch { setTxs([]); }
      finally { setLoading(false); }
    })();
  }, [customerId, wallet?.walletTypeId]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true"
      onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className={`w-full max-w-2xl mx-4 rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`}
        onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
          <div>
            <h3 className="text-sm font-bold text-violet-400">ประวัติรายการกระเป๋าเงิน</h3>
            <p className="text-xs text-[var(--tx-muted)] mt-1">
              {wallet ? `${wallet.walletTypeName}` : 'ทุกประเภท'}
            </p>
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
                <div key={tx.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDark ? 'bg-[var(--bg-elevated)]' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock size={11} className="text-[var(--tx-muted)] flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <TxTypeBadge type={tx.type} isDark={isDark} />
                        {!wallet && <span className="text-[10px] text-sky-400 truncate">{tx.walletTypeName}</span>}
                      </div>
                      <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                        {tx.referenceId && <span className="ml-2 font-mono">{tx.referenceId}</span>}
                      </div>
                      {tx.note && <div className="text-[10px] text-[var(--tx-secondary)] italic mt-0.5">{tx.note}</div>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className={`font-mono text-xs font-bold ${tx.type === 'deduct' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {tx.type === 'deduct' ? '-' : '+'}฿{fmtMoney(tx.amount)}
                    </div>
                    <div className="text-[10px] text-[var(--tx-muted)] font-mono">
                      คงเหลือ ฿{fmtMoney(tx.balanceAfter)}
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
