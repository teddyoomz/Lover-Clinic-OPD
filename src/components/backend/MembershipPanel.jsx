// ─── MembershipPanel — บัตรสมาชิก (Phase 7) ─────────────────────────────────
// Top: card-type grid (from master_data/membership_types) for quick reference
// Below: sold-membership list with sell / renew / cancel actions
// Sell triggers side-effects: credit wallet + initial points (via createMembership)

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Ticket, Plus, Search, Loader2, X, Eye, ArrowLeft,
  CheckCircle2, AlertCircle, Ban, RotateCcw, Crown, Trash2,
} from 'lucide-react';
import {
  getAllCustomers, getAllMasterDataItems,
  createMembership, cancelMembership, renewMembership, getAllMemberships, deleteMembership,
} from '../../lib/backendClient.js';
import { fmtMoney, calcMembershipExpiry, isMembershipExpired } from '../../lib/financeUtils.js';
import { fmtThaiDate } from '../../lib/dateFormat.js';
import DateField from '../DateField.jsx';
import FileUploadField from './FileUploadField.jsx';
import { thaiTodayISO } from '../../utils.js';

const PAYMENT_CHANNELS = ['เงินสด', 'โอนธนาคาร', 'บัตรเครดิต', 'QR Payment', 'อื่นๆ'];
function todayStr() { return thaiTodayISO(); }
const clean = (o) => JSON.parse(JSON.stringify(o));

const COLOR_MAP = {
  gold:     { bg: 'from-orange-600 to-orange-500',  text: 'text-orange-900' },
  opal:     { bg: 'from-sky-400 to-cyan-300',       text: 'text-sky-900' },
  silver:   { bg: 'from-gray-400 to-gray-300',      text: 'text-gray-900' },
  diamond:  { bg: 'from-cyan-300 to-indigo-400',    text: 'text-indigo-900' },
  citrine:  { bg: 'from-orange-400 to-orange-400',  text: 'text-orange-900' },
  platinum: { bg: 'from-gray-500 to-slate-300',     text: 'text-gray-900' },
  emerald:  { bg: 'from-emerald-500 to-teal-400',   text: 'text-emerald-900' },
  ruby:     { bg: 'from-rose-600 to-rose-400',      text: 'text-white' },
  vip:      { bg: 'from-rose-600 to-rose-400',      text: 'text-white' },
  vvip:     { bg: 'from-purple-700 to-purple-400',  text: 'text-white' },
  prestige: { bg: 'from-zinc-800 to-zinc-500',      text: 'text-white' },
};
// Text-only colors for use on neutral backgrounds (e.g. customer-detail membership tile).
// Uses brighter -400 shades so labels pop on both light and dark surfaces.
export const CARD_TEXT_COLOR = {
  gold:     'text-orange-400',
  opal:     'text-sky-400',
  silver:   'text-gray-300',
  diamond:  'text-indigo-300',
  citrine:  'text-orange-400',
  platinum: 'text-slate-300',
  emerald:  'text-emerald-400',
  ruby:     'text-rose-400',
  vip:      'text-rose-400',
  vvip:     'text-purple-400',
  prestige: 'text-zinc-400',
};
function cardGradient(colorName, cardName) {
  const k1 = (colorName || '').toLowerCase().trim();
  const k2 = (cardName || '').toLowerCase().trim();
  return COLOR_MAP[k1] || COLOR_MAP[k2] || { bg: 'from-purple-600 to-purple-400', text: 'text-white' };
}

/**
 * Resolve the text-only color class for a membership card so badges/labels on
 * neutral surfaces match the physical card's color. Falls back to card-name
 * lookup if `colorName` is empty (e.g. clinic-created card with just the name).
 */
export function cardTextClass(colorName, cardName) {
  const k1 = (colorName || '').toLowerCase().trim();
  const k2 = (cardName || '').toLowerCase().trim();
  return CARD_TEXT_COLOR[k1] || CARD_TEXT_COLOR[k2] || 'text-purple-400';
}

export default function MembershipPanel({ theme, initialCustomer, onCustomerUsed }) {
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block';
  const inputCls = `w-full rounded-lg px-3 py-2 text-xs outline-none border transition-all ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)] focus:border-purple-500' : 'bg-white border-gray-200 text-gray-800 focus:border-purple-400'}`;

  // ── State ──
  const [cardTypes, setCardTypes] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modals
  const [viewing, setViewing] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [renewModal, setRenewModal] = useState(null);

  // Sell form
  const [sellOpen, setSellOpen] = useState(false);

  const loadCardTypes = useCallback(async () => {
    try { setCardTypes(await getAllMasterDataItems('membership_types')); }
    catch { setCardTypes([]); }
  }, []);
  const loadMemberships = useCallback(async () => {
    try { setMemberships(await getAllMemberships()); }
    catch { setMemberships([]); }
  }, []);
  const loadCustomers = useCallback(async () => {
    try { setCustomers(await getAllCustomers()); }
    catch { setCustomers([]); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadCardTypes(), loadMemberships(), loadCustomers()])
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadCardTypes, loadMemberships, loadCustomers]);

  const filtered = useMemo(() => {
    let list = memberships;
    if (filterStatus) list = list.filter(m => m.status === filterStatus);
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      list = list.filter(m =>
        (m.customerName || '').toLowerCase().includes(q) ||
        (m.customerHN || '').toLowerCase().includes(q) ||
        (m.membershipId || '').toLowerCase().includes(q) ||
        (m.cardTypeName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [memberships, filterQuery, filterStatus]);

  const openSell = (customer) => {
    setSellOpen({ customer });
  };

  const handleOpenCancel = (m) => setCancelModal(m);
  const handleOpenRenew = (m) => setRenewModal(m);
  const handleDelete = async (m) => {
    if (!confirm(`ลบบัตรสมาชิก ${m.membershipId}? (การลบจะไม่ย้อน wallet/คะแนนที่เคยเติม)`)) return;
    try {
      await deleteMembership(m.membershipId);
      loadMemberships();
    } catch (e) { alert(e.message); }
  };

  // Auto-open sell if initialCustomer provided
  useEffect(() => {
    if (initialCustomer) {
      openSell(initialCustomer);
      if (onCustomerUsed) onCustomerUsed();
    }
  }, [initialCustomer, onCustomerUsed]);

  // ══════════════════ RENDER ══════════════════
  if (sellOpen) return (
    <SellMembershipForm
      initialCustomer={sellOpen.customer}
      customers={customers}
      cardTypes={cardTypes}
      isDark={isDark}
      inputCls={inputCls}
      labelCls={labelCls}
      onClose={() => setSellOpen(false)}
      onSaved={() => { setSellOpen(false); loadMemberships(); }}
    />
  );

  return (
    <div className="space-y-4">
      {/* Card types showcase */}
      {cardTypes.length > 0 && (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(168,85,247,0.15)' }}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-3 flex items-center gap-1.5">
            <Crown size={13} /> ประเภทบัตรสมาชิก
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {cardTypes.map(ct => {
              const grad = cardGradient(ct.colorName, ct.name);
              const disabled = ct.status === 'พักใช้งาน';
              return (
                <div key={ct.id} className={`rounded-xl p-3 bg-gradient-to-br ${grad.bg} shadow-lg ${grad.text} relative ${disabled ? 'opacity-40' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase opacity-80">บัตรสมาชิก</div>
                      <div className="text-base font-black tracking-wide">{ct.name}</div>
                    </div>
                    <Crown size={18} className="opacity-70" />
                  </div>
                  <div className="mt-3 text-[10px] space-y-0.5 opacity-90">
                    <div>เครดิต: ฿{fmtMoney(ct.credit)}</div>
                    <div>ส่วนลด: {ct.discountPercent || 0}%</div>
                    <div>คะแนนเริ่ม: {ct.point || 0}</div>
                    {Number(ct.bahtPerPoint) > 0 && <div>ซื้อ ฿{ct.bahtPerPoint} = 1 คะแนน</div>}
                    <div>อายุ: {ct.expiredInDays || 365} วัน</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs font-bold">฿{fmtMoney(ct.price)}</span>
                    {disabled && <span className="text-[9px] px-1.5 py-0.5 bg-black/30 rounded">พักใช้งาน</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(168,85,247,0.15)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400/60" />
            <input type="text" value={filterQuery} onChange={e => setFilterQuery(e.target.value)}
              placeholder="ค้นหา... (MBR-, ชื่อลูกค้า, HN, บัตร)"
              className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-sm text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none transition-all" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-xs font-bold text-[var(--tx-primary)] focus:outline-none transition-all">
            <option value="">ทุกสถานะ</option>
            <option value="active">ใช้งาน</option>
            <option value="expired">หมดอายุ</option>
            <option value="cancelled">ยกเลิก</option>
          </select>
          <button
            onClick={() => setSellOpen({ customer: null })}
            disabled={cardTypes.length === 0}
            className="px-5 py-2.5 rounded-xl font-black text-sm text-white transition-all flex items-center gap-2 hover:shadow-xl active:scale-[0.97] uppercase tracking-wider whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #7e22ce, #a855f7)', boxShadow: '0 4px 20px rgba(168,85,247,0.35)' }}>
            <Plus size={16} /> ขายบัตรสมาชิก
          </button>
        </div>
        {cardTypes.length === 0 && (
          <p className="mt-3 text-xs text-orange-400 flex items-center gap-1.5">
            <AlertCircle size={12} /> ยังไม่มีประเภทบัตรสมาชิก — ไปเพิ่มที่ "ข้อมูลพื้นฐาน → บัตรสมาชิก"
          </p>
        )}
      </div>

      {/* Memberships list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--tx-muted)]" />
        </div>
      ) : filtered.length === 0 ? (
        memberships.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
              style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))', border: '1.5px solid rgba(168,85,247,0.3)' }}>
              <Ticket size={32} className="text-purple-400" />
            </div>
            <h3 className="text-xl font-black text-[var(--tx-heading)] mb-2 tracking-tight">ยังไม่มีการขายบัตรสมาชิก</h3>
            <p className="text-sm text-[var(--tx-muted)] max-w-lg mx-auto">กดปุ่ม "ขายบัตรสมาชิก" ด้านบนเพื่อเริ่ม</p>
          </div>
        ) : (
          <div className="text-center py-12 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
            <Search size={24} className="mx-auto text-[var(--tx-muted)] mb-2" />
            <p className="text-xs text-[var(--tx-muted)]">ไม่พบรายการที่ตรงกับตัวกรอง</p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(m => {
            const grad = cardGradient(m.colorName || m.cardTypeName);
            const expired = isMembershipExpired(m.expiresAt);
            const status = m.status === 'active' && expired ? 'expired' : m.status;
            return (
              <div key={m.membershipId} className={`rounded-xl overflow-hidden border flex ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
                <div className={`w-20 bg-gradient-to-b ${grad.bg} flex items-center justify-center ${grad.text}`}>
                  <Crown size={20} />
                </div>
                <div className="flex-1 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-xs font-mono text-[var(--tx-muted)]">{m.membershipId}</span>
                      <span className="mx-2 text-[var(--tx-muted)]">·</span>
                      <span className="text-sm font-black text-[var(--tx-heading)]">{m.cardTypeName}</span>
                      <StatusBadge status={status} isDark={isDark} />
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setViewing(m)} className="p-1.5 rounded hover:bg-violet-900/20 text-violet-400" aria-label="ดูรายละเอียด"><Eye size={13} /></button>
                      {m.status === 'active' && !expired && (
                        <>
                          <button onClick={() => handleOpenRenew(m)} className="p-1.5 rounded hover:bg-emerald-900/20 text-emerald-400" aria-label="ต่ออายุ"><RotateCcw size={13} /></button>
                          <button onClick={() => handleOpenCancel(m)} className="p-1.5 rounded hover:bg-red-900/20 text-red-400" aria-label="ยกเลิก"><Ban size={13} /></button>
                        </>
                      )}
                      <button onClick={() => handleDelete(m)} className="p-1.5 rounded hover:bg-red-900/20 text-red-400" aria-label="ลบ"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--tx-secondary)]">
                    <a href={`/?backend=1&customer=${m.customerId}`} target="_blank" rel="noopener noreferrer"
                      className="text-teal-400 hover:text-teal-300 hover:underline font-bold">{m.customerName || m.customerId}</a>
                    {m.customerHN && <span className="text-[var(--tx-muted)] font-mono">{m.customerHN}</span>}
                    <span className="text-[var(--tx-muted)]">·</span>
                    <span>ราคา ฿{fmtMoney(m.purchasePrice)}</span>
                    <span className="text-[var(--tx-muted)]">·</span>
                    <span>ส่วนลด {m.discountPercent || 0}%</span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--tx-muted)]">
                    หมดอายุ {fmtThaiDate(m.expiresAt)}
                    {m.initialCredit > 0 && <> · เครดิตให้ ฿{fmtMoney(m.initialCredit)}</>}
                    {m.initialPoints > 0 && <> · คะแนนให้ {m.initialPoints}</>}
                    {Number(m.bahtPerPoint) > 0 && <> · ซื้อ ฿{m.bahtPerPoint} = 1 คะแนน</>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewing && <DetailModal m={viewing} isDark={isDark} onClose={() => setViewing(null)} />}
      {cancelModal && (
        <CancelModal
          m={cancelModal}
          isDark={isDark}
          inputCls={inputCls}
          labelCls={labelCls}
          onClose={() => setCancelModal(null)}
          onDone={() => { setCancelModal(null); loadMemberships(); }}
        />
      )}
      {renewModal && (
        <RenewModal
          m={renewModal}
          isDark={isDark}
          inputCls={inputCls}
          labelCls={labelCls}
          onClose={() => setRenewModal(null)}
          onDone={() => { setRenewModal(null); loadMemberships(); }}
        />
      )}
    </div>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────
function StatusBadge({ status, isDark }) {
  const meta = {
    active:    { label: 'ใช้งาน',  cls: 'bg-emerald-900/30 text-emerald-400', lightCls: 'bg-emerald-50 text-emerald-700' },
    expired:   { label: 'หมดอายุ', cls: 'bg-orange-900/30 text-orange-400',     lightCls: 'bg-orange-50 text-orange-700' },
    cancelled: { label: 'ยกเลิก',  cls: 'bg-red-900/30 text-red-400',         lightCls: 'bg-red-50 text-red-700' },
  }[status] || { label: status, cls: 'bg-gray-800/50 text-gray-400', lightCls: 'bg-gray-100 text-gray-600' };
  return <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${isDark ? meta.cls : meta.lightCls}`}>{meta.label}</span>;
}

// ─── Sell form (full-page overlay) ─────────────────────────────────────────
function SellMembershipForm({ initialCustomer, customers, cardTypes, isDark, inputCls, labelCls, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerHN, setCustomerHN] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [cardTypeId, setCardTypeId] = useState('');
  const [saleDate, setSaleDate] = useState(todayStr());
  const [paymentStatus, setPaymentStatus] = useState('full'); // 'full' | 'split'
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [paymentTime, setPaymentTime] = useState('');
  const [pmChannels, setPmChannels] = useState([
    { enabled: true, method: 'เงินสด', amount: '' },
    { enabled: false, method: '', amount: '' },
    { enabled: false, method: '', amount: '' },
  ]);
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [sellers, setSellers] = useState([...Array(5)].map(() => ({ enabled: false, id: '', name: '', percent: '0', total: '' })));
  const [sellerList, setSellerList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const selectedCard = useMemo(() => cardTypes.find(c => String(c.id) === String(cardTypeId)) || null, [cardTypes, cardTypeId]);

  // Auto-fill first channel amount with purchase price
  useEffect(() => {
    if (selectedCard?.price && paymentStatus === 'full') {
      setPmChannels(prev => prev.map((c, i) => i === 0 ? { ...c, enabled: true, amount: String(selectedCard.price) } : c));
    }
  }, [selectedCard?.price, paymentStatus]);

  // Pre-fill from initialCustomer
  useEffect(() => {
    if (initialCustomer) {
      setCustomerId(String(initialCustomer.proClinicId || initialCustomer.id || ''));
      setCustomerName(`${initialCustomer.patientData?.prefix || ''} ${initialCustomer.patientData?.firstName || ''} ${initialCustomer.patientData?.lastName || ''}`.trim());
      setCustomerHN(initialCustomer.proClinicHN || '');
    }
  }, [initialCustomer]);

  // Load staff list for sellers
  useEffect(() => {
    (async () => {
      try {
        const [s, d] = await Promise.all([
          getAllMasterDataItems('staff'),
          getAllMasterDataItems('doctors'),
        ]);
        const merged = [
          ...s.map(x => ({ id: x.id, name: x.name, position: x.position })),
          ...d.map(x => ({ id: x.id, name: x.name, position: x.position || 'แพทย์' })),
        ];
        setSellerList(merged);
      } catch { setSellerList([]); }
    })();
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 15);
    const q = customerSearch.toLowerCase();
    return customers.filter(c => {
      const nm = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.toLowerCase();
      return nm.includes(q) || (c.proClinicHN || '').toLowerCase().includes(q);
    }).slice(0, 15);
  }, [customers, customerSearch]);

  const handleSave = async () => {
    if (!customerId) { setError('กรุณาเลือกลูกค้า'); return; }
    if (!selectedCard) { setError('กรุณาเลือกประเภทบัตร'); return; }
    const activeSellers = sellers.filter(s => s.enabled && s.id);
    if (activeSellers.length === 0) { setError('กรุณาเลือกพนักงานขายอย่างน้อย 1 คน'); return; }
    setSaving(true); setError('');
    try {
      await createMembership(clean({
        customerId, customerName, customerHN,
        cardTypeId: selectedCard.id,
        cardTypeName: selectedCard.name,
        colorName: selectedCard.colorName || '',
        cardColor: selectedCard.color || '',
        purchasePrice: Number(selectedCard.price) || 0,
        initialCredit: Number(selectedCard.credit) || 0,
        discountPercent: Number(selectedCard.discountPercent) || 0,
        initialPoints: Number(selectedCard.point) || 0,
        bahtPerPoint: Number(selectedCard.bahtPerPoint) || 0,
        expiredInDays: Number(selectedCard.expiredInDays) || 365,
        walletTypeId: selectedCard.walletTypeId || '',
        walletTypeName: selectedCard.walletTypeName || '',
        activatedAt: new Date(saleDate).toISOString(),
        paymentChannel: pmChannels.find(c => c.enabled)?.method || '',
        paymentChannels: pmChannels.filter(c => c.enabled),
        paymentStatus,
        paymentDate, paymentTime,
        refNo, note,
        paymentEvidenceUrl: evidenceUrl || '',
        sellers: activeSellers.map(s => ({ id: s.id, name: s.name, percent: Number(s.percent) || 0, total: Number(s.total) || 0 })),
      }));
      setSuccess(true);
      setTimeout(onSaved, 700);
    } catch (e) { setError(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  return (
    <div className={`fixed inset-0 z-[80] overflow-y-auto ${isDark ? 'bg-[var(--bg-elevated)] text-[var(--tx-primary)]' : 'bg-gray-50 text-gray-800'}`}>
      <div className={`sticky top-0 z-10 border-b backdrop-blur-sm ${isDark ? 'bg-[var(--bg-elevated)]/95 border-[var(--bd)]' : 'bg-white/95 border-gray-200'}`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" aria-label="กลับ"><ArrowLeft size={16} /></button>
          <h2 className="text-sm font-black tracking-tight text-purple-400 flex items-center gap-2">
            <Ticket size={16} /> ขายบัตรสมาชิก
          </h2>
          {customerName && <span className="text-xs text-[var(--tx-muted)]">| {customerName}</span>}
        </div>
      </div>

      {success ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
            <p className="text-sm font-bold text-emerald-400">ขายบัตรสมาชิกสำเร็จ</p>
            <p className="text-xs text-[var(--tx-muted)] mt-2">เครดิต wallet + คะแนนถูกเติมให้ลูกค้าแล้ว</p>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {/* Customer picker */}
          <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
            <label className={labelCls}>ลูกค้า *</label>
            {customerName ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-900/10 border border-purple-700/30">
                <span className="text-xs font-bold">{customerName} <span className="font-mono text-[var(--tx-muted)]">{customerHN}</span></span>
                <button onClick={() => { setCustomerId(''); setCustomerName(''); setCustomerHN(''); }} className="text-[var(--tx-muted)] hover:text-red-400" aria-label="ล้าง"><X size={14} /></button>
              </div>
            ) : (
              <div>
                <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="ค้นหาชื่อ / HN..." className={inputCls} />
                {filteredCustomers.length > 0 && customerSearch && (
                  <div className={`mt-1 max-h-32 overflow-y-auto border rounded-lg ${isDark ? 'border-[var(--bd-strong)] bg-[var(--bg-surface)]' : 'border-gray-200 bg-white'}`}>
                    {filteredCustomers.map(c => {
                      const nm = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.trim();
                      return (
                        <button key={c.id} onClick={() => { setCustomerId(c.proClinicId || c.id); setCustomerName(nm); setCustomerHN(c.proClinicHN || ''); setCustomerSearch(''); }}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] flex justify-between">
                          <span>{nm}</span><span className="text-xs font-mono text-[var(--tx-muted)]">{c.proClinicHN || ''}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card type picker + preview */}
          <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
            <div>
              <label className={labelCls}>ประเภทบัตร *</label>
              <select value={cardTypeId} onChange={e => setCardTypeId(e.target.value)} className={inputCls}>
                <option value="">เลือกบัตร</option>
                {cardTypes.filter(c => c.status !== 'พักใช้งาน').map(c =>
                  <option key={c.id} value={c.id}>{c.name} (ราคา ฿{fmtMoney(c.price)})</option>
                )}
              </select>
            </div>
            {selectedCard && (
              <div className={`rounded-lg p-3 bg-gradient-to-br ${cardGradient(selectedCard.colorName, selectedCard.name).bg} ${cardGradient(selectedCard.colorName, selectedCard.name).text}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] opacity-80 font-bold uppercase">Preview</div>
                    <div className="text-lg font-black">{selectedCard.name}</div>
                  </div>
                  <Crown size={22} />
                </div>
                <div className="mt-2 text-xs grid grid-cols-2 gap-1">
                  <div>ราคา: ฿{fmtMoney(selectedCard.price)}</div>
                  <div>เครดิตเข้า wallet: ฿{fmtMoney(selectedCard.credit)}</div>
                  <div>ส่วนลด: {selectedCard.discountPercent || 0}%</div>
                  <div>คะแนนเริ่ม: {selectedCard.point || 0}</div>
                  <div>อายุ: {selectedCard.expiredInDays || 365} วัน</div>
                  <div>หมดอายุ: {fmtThaiDate(calcMembershipExpiry(new Date(saleDate).toISOString(), Number(selectedCard.expiredInDays) || 365))}</div>
                </div>
              </div>
            )}
          </div>

          {/* Sale date */}
          <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
            <label className={labelCls}>วันที่ขาย *</label>
            <div className="max-w-[200px]"><DateField value={saleDate} onChange={setSaleDate} /></div>
          </div>

          {/* Payment */}
          <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-pink-400">การชำระเงิน</h3>
            <div className="flex gap-3">
              {[{ v: 'full', l: 'ชำระเต็มจำนวน' }, { v: 'split', l: 'แบ่งชำระ' }].map(s => (
                <label key={s.v} className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input type="radio" checked={paymentStatus === s.v} onChange={() => setPaymentStatus(s.v)} className="accent-purple-500" />{s.l}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>วันที่ชำระ *</label>
                <DateField value={paymentDate} onChange={setPaymentDate} />
              </div>
              <div>
                <label className={labelCls}>เวลา</label>
                <input type="time" value={paymentTime} onChange={e => setPaymentTime(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>เลขอ้างอิง</label>
                <input type="text" value={refNo} onChange={e => setRefNo(e.target.value)} className={inputCls} placeholder="REF-001" />
              </div>
            </div>
            <label className={labelCls}>ช่องทางชำระเงิน</label>
            {pmChannels.map((ch, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="checkbox" checked={ch.enabled} onChange={e => setPmChannels(prev => prev.map((c, j) => j === i ? { ...c, enabled: e.target.checked } : c))} className="accent-purple-500" />
                <select value={ch.method} onChange={e => setPmChannels(prev => prev.map((c, j) => j === i ? { ...c, method: e.target.value } : c))} className={`${inputCls} !w-40`} disabled={!ch.enabled}>
                  <option value="">เลือกช่องทาง</option>
                  {PAYMENT_CHANNELS.map(pc => <option key={pc} value={pc}>{pc}</option>)}
                </select>
                <input type="number" value={ch.amount} onChange={e => setPmChannels(prev => prev.map((c, j) => j === i ? { ...c, amount: e.target.value } : c))} className={`${inputCls} !w-28 text-right`} placeholder="0.00" disabled={!ch.enabled} />
                <span className="text-xs text-[var(--tx-muted)]">บาท</span>
              </div>
            ))}
            <FileUploadField
              storagePath={`uploads/be_memberships/${customerId || '_pending'}_${Date.now()}`}
              fieldName="paymentEvidence"
              label="แนบหลักฐานชำระเงิน"
              isDark={isDark}
              onUploadComplete={({ url }) => setEvidenceUrl(url)}
              onDelete={() => setEvidenceUrl('')}
            />
          </div>

          {/* Sellers */}
          <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-3">พนักงานขาย (5 ช่อง)</h3>
            {sellers.map((s, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <input type="checkbox" checked={s.enabled} onChange={e => setSellers(prev => prev.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))} className="accent-orange-500" />
                <select value={s.id} onChange={e => {
                  const sel = sellerList.find(x => String(x.id) === e.target.value);
                  setSellers(prev => prev.map((x, j) => j === i ? { ...x, id: e.target.value, name: sel?.name || '' } : x));
                }} className={`${inputCls} !w-64`} disabled={!s.enabled}>
                  <option value="">เลือกพนักงาน</option>
                  {sellerList.map(opt => <option key={opt.id} value={opt.id}>{opt.name}{opt.position ? ` — ${opt.position}` : ''}</option>)}
                </select>
                <input type="number" value={s.percent} onChange={e => setSellers(prev => prev.map((x, j) => j === i ? { ...x, percent: e.target.value } : x))} className={`${inputCls} !w-16 text-center`} placeholder="%" disabled={!s.enabled} />
                <span className="text-xs text-[var(--tx-muted)]">%</span>
                <input type="number" value={s.total} onChange={e => setSellers(prev => prev.map((x, j) => j === i ? { ...x, total: e.target.value } : x))} className={`${inputCls} !w-28 text-right`} placeholder="0" disabled={!s.enabled} />
                <span className="text-xs text-[var(--tx-muted)]">บาท</span>
              </div>
            ))}
          </div>

          {/* Note */}
          <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
            <label className={labelCls}>หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="หมายเหตุ (ถ้ามี)" />
          </div>

          {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</div>}
          <div className="flex justify-end gap-2 pb-8">
            <button onClick={onClose} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ยกเลิก</button>
            <button onClick={handleSave} disabled={saving} className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-purple-700 hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              ขายบัตร
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail modal ──────────────────────────────────────────────────────────
function DetailModal({ m, isDark, onClose }) {
  const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block';
  const grad = cardGradient(m.colorName || m.cardTypeName);
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true"
      onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className={`w-full max-w-2xl mx-4 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`}
        onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
          <div>
            <h3 className="text-sm font-bold text-purple-400">{m.membershipId}</h3>
            <p className="text-xs text-[var(--tx-muted)]">{m.customerName} {m.customerHN && `· ${m.customerHN}`}</p>
          </div>
          <button onClick={onClose} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]" aria-label="ปิด"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 text-xs">
          <div className={`rounded-xl p-4 bg-gradient-to-br ${grad.bg} ${grad.text}`}>
            <div className="text-[10px] opacity-80 font-bold uppercase">บัตรสมาชิก</div>
            <div className="text-xl font-black">{m.cardTypeName}</div>
            <div className="mt-2 text-xs">หมดอายุ {fmtThaiDate(m.expiresAt)}</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className={`p-2 rounded ${isDark ? 'bg-[var(--bg-elevated)]' : 'bg-gray-50'}`}><p className="text-[10px] text-[var(--tx-muted)]">ราคา</p><p className="font-bold">฿{fmtMoney(m.purchasePrice)}</p></div>
            <div className={`p-2 rounded ${isDark ? 'bg-[var(--bg-elevated)]' : 'bg-gray-50'}`}><p className="text-[10px] text-[var(--tx-muted)]">เครดิตให้</p><p className="font-bold">฿{fmtMoney(m.initialCredit)}</p></div>
            <div className={`p-2 rounded ${isDark ? 'bg-[var(--bg-elevated)]' : 'bg-gray-50'}`}><p className="text-[10px] text-[var(--tx-muted)]">คะแนนให้</p><p className="font-bold">{m.initialPoints || 0}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className={labelCls}>ส่วนลด On Top</p><p>{m.discountPercent || 0}%</p></div>
            <div><p className={labelCls}>ยอดซื้อต่อคะแนน</p><p>{Number(m.bahtPerPoint) > 0 ? `฿${m.bahtPerPoint} = 1 คะแนน` : 'ไม่สะสม'}</p></div>
            <div><p className={labelCls}>ช่องทางชำระ</p><p>{m.paymentChannel || '-'}</p></div>
            <div><p className={labelCls}>วันที่ชำระ</p><p>{m.paymentDate || '-'}</p></div>
            {m.refNo && <div><p className={labelCls}>เลขอ้างอิง</p><p className="font-mono">{m.refNo}</p></div>}
            {m.walletTypeName && <div><p className={labelCls}>เครดิตเข้า Wallet</p><p>{m.walletTypeName}</p></div>}
          </div>
          {m.sellers?.length > 0 && (
            <div>
              <p className={labelCls}>พนักงานขาย</p>
              {m.sellers.map((s, i) => <div key={i} className="flex justify-between py-0.5"><span>{s.name || s.id}</span><span className="text-[var(--tx-muted)]">{s.percent}%</span></div>)}
            </div>
          )}
          {m.renewals?.length > 0 && (
            <div>
              <p className={labelCls}>ประวัติต่ออายุ</p>
              {m.renewals.map((r, i) => (
                <div key={i} className={`px-2 py-1 rounded mb-1 ${isDark ? 'bg-[var(--bg-elevated)]' : 'bg-gray-50'}`}>
                  <div className="flex justify-between"><span>{fmtThaiDate(r.renewedAt)}</span><span className="font-mono">฿{fmtMoney(r.price)}</span></div>
                  <div className="text-[10px] text-[var(--tx-muted)]">ขยายถึง {fmtThaiDate(r.expiresAt)}</div>
                </div>
              ))}
            </div>
          )}
          {m.status === 'cancelled' && (
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-red-950/20 border-red-900/40' : 'bg-red-50 border-red-200'}`}>
              <p className="text-[11px] font-bold text-red-400 uppercase mb-1">ยกเลิก</p>
              <p className="text-[var(--tx-secondary)]">เหตุผล: {m.cancelNote || '-'}</p>
              {m.cancelledAt && <p className="text-[var(--tx-muted)] text-[10px] mt-1">เมื่อ: {new Date(m.cancelledAt).toLocaleString('th-TH')}</p>}
            </div>
          )}
          {m.note && <div><p className={labelCls}>หมายเหตุ</p><p className="text-[var(--tx-secondary)]">{m.note}</p></div>}
        </div>
      </div>
    </div>
  );
}

// ─── Cancel modal ──────────────────────────────────────────────────────────
function CancelModal({ m, isDark, inputCls, labelCls, onClose, onDone }) {
  const [cancelNote, setCancelNote] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!cancelNote.trim()) { setError('กรุณาระบุเหตุผล'); return; }
    setSaving(true); setError('');
    try {
      await cancelMembership(m.membershipId, { cancelNote, cancelEvidenceUrl: evidenceUrl });
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
          <h3 className="text-sm font-bold text-red-400">ยกเลิกบัตรสมาชิก {m.membershipId}</h3>
          <p className="text-xs text-[var(--tx-muted)] mt-1">{m.customerName} · {m.cardTypeName}</p>
          <p className="text-[11px] text-orange-400 mt-1">⚠️ การยกเลิกจะไม่คืนเครดิต wallet + คะแนนที่เคยเติม</p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className={labelCls}>เหตุผล *</label>
            <textarea value={cancelNote} onChange={e => setCancelNote(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="ระบุเหตุผล..." />
          </div>
          <FileUploadField
            storagePath={`uploads/be_memberships/${m.membershipId}`}
            fieldName="cancelEvidence"
            label="แนบหลักฐาน (ถ้ามี)"
            isDark={isDark}
            onUploadComplete={({ url }) => setEvidenceUrl(url)}
            onDelete={() => setEvidenceUrl('')}
          />
          {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</div>}
        </div>
        <div className={`px-5 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
          <button onClick={onClose} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ปิด</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold bg-red-700 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />} ยืนยันยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Renew modal ───────────────────────────────────────────────────────────
function RenewModal({ m, isDark, inputCls, labelCls, onClose, onDone }) {
  const [extendDays, setExtendDays] = useState('365');
  const [price, setPrice] = useState('');
  const [paymentChannel, setPaymentChannel] = useState('เงินสด');
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [grantCredit, setGrantCredit] = useState('0');
  const [grantPoints, setGrantPoints] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const newExpiryPreview = useMemo(() => {
    const base = Math.max(Date.now(), m.expiresAt ? new Date(m.expiresAt).getTime() : Date.now());
    return new Date(base + (Number(extendDays) || 0) * 86400000).toISOString();
  }, [m.expiresAt, extendDays]);

  const handleSave = async () => {
    const d = parseInt(extendDays);
    if (!d || d <= 0) { setError('จำนวนวันต้องมากกว่า 0'); return; }
    setSaving(true); setError('');
    try {
      await renewMembership(m.membershipId, {
        extendDays: d,
        price: parseFloat(price) || 0,
        paymentChannel, refNo, note,
        grantCredit: parseFloat(grantCredit) || 0,
        grantPoints: parseInt(grantPoints) || 0,
      });
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
          <h3 className="text-sm font-bold text-emerald-400">ต่ออายุบัตรสมาชิก</h3>
          <p className="text-xs text-[var(--tx-muted)] mt-1">{m.customerName} · {m.cardTypeName}</p>
          <p className="text-[11px] text-[var(--tx-muted)] mt-0.5">หมดอายุเดิม: {fmtThaiDate(m.expiresAt)}</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>ต่อ (วัน) *</label>
              <input type="number" value={extendDays} onChange={e => setExtendDays(e.target.value)} className={inputCls} min="1" />
            </div>
            <div>
              <label className={labelCls}>ค่าต่ออายุ</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} className={inputCls} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>ช่องทาง</label>
              <select value={paymentChannel} onChange={e => setPaymentChannel(e.target.value)} className={inputCls}>
                {PAYMENT_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>เลขอ้างอิง</label>
              <input type="text" value={refNo} onChange={e => setRefNo(e.target.value)} className={inputCls} placeholder="REF-..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>เติม wallet</label>
              <input type="number" value={grantCredit} onChange={e => setGrantCredit(e.target.value)} className={inputCls} placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>ให้คะแนนเพิ่ม</label>
              <input type="number" value={grantPoints} onChange={e => setGrantPoints(e.target.value)} className={inputCls} placeholder="0" />
            </div>
          </div>
          <div>
            <label className={labelCls}>หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="หมายเหตุ (ถ้ามี)" />
          </div>
          <div className="text-xs text-[var(--tx-muted)]">
            หมดอายุใหม่: <span className="font-bold text-emerald-400">{fmtThaiDate(newExpiryPreview)}</span>
          </div>
          {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</div>}
        </div>
        <div className={`px-5 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
          <button onClick={onClose} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ปิด</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} ยืนยันต่อ
          </button>
        </div>
      </div>
    </div>
  );
}
