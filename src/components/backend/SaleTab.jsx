// ─── SaleTab — Standalone sale/invoice (replicate ProClinic /admin/sale) ─────
// List view + create/edit form overlay with buy modal, billing, payment, sellers

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingCart, Plus, Edit3, Trash2, Search, Loader2, X, Eye,
  ChevronDown, CheckCircle2, AlertCircle, DollarSign, CreditCard,
  Users as UsersIcon, Package, Pill, ArrowLeft
} from 'lucide-react';
import {
  createBackendSale, updateBackendSale, deleteBackendSale,
  getAllSales, getAllCustomers, getAllMasterDataItems,
  cancelBackendSale, updateSalePayment
} from '../../lib/backendClient.js';
import { hexToRgb } from '../../utils.js';

const PAYMENT_CHANNELS = ['เงินสด', 'โอนธนาคาร', 'บัตรเครดิต', 'QR Payment', 'อื่นๆ'].map(n => ({ id: n, name: n }));
const PAYMENT_STATUSES = [
  { value: 'paid', label: 'ชำระแล้ว', color: 'emerald' },
  { value: 'split', label: 'แบ่งชำระ', color: 'sky' },
  { value: 'unpaid', label: 'ค้างชำระ', color: 'amber' },
  { value: 'draft', label: 'แบบร่าง', color: 'gray' },
];
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function fmtDate(s) { if (!s) return '-'; const [y,m,d]=(s||'').split('-'); return d&&m ? `${+d} ${THAI_MONTHS[(+m)-1]} ${(+y)+543}` : s; }
function fmtDateDisplay(s) { if (!s) return 'เลือกวันที่'; const [y,m,d]=(s||'').split('-'); return d&&m ? `${d}/${m}/${y}` : s; }

/** Date picker: shows dd/mm/yyyy text + hidden native date input for calendar popup */
function DatePickerField({ value, onChange, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
      <div className={`w-full rounded-lg px-3 py-2 text-xs border bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)] flex items-center justify-between`}>
        <span>{fmtDateDisplay(value)}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--tx-muted)]"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      </div>
    </div>
  );
}
function fmtMoney(n) { return n != null ? Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '0.00'; }
const clean = (o) => JSON.parse(JSON.stringify(o));

export default function SaleTab({ clinicSettings, theme }) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const inputCls = `w-full rounded-lg px-3 py-2 text-xs outline-none border transition-all ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)] focus:border-rose-500' : 'bg-white border-gray-200 text-gray-800 focus:border-rose-400'}`;
  const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block';

  // ── List state ──
  const [sales, setSales] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // ── Detail / Cancel / Payment modals ──
  const [viewingSale, setViewingSale] = useState(null);
  const [cancelModal, setCancelModal] = useState(null); // { sale }
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefundMethod, setCancelRefundMethod] = useState('เงินสด');
  const [cancelRefundAmount, setCancelRefundAmount] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);
  const [payModal, setPayModal] = useState(null); // { sale }
  const [payMethod, setPayMethod] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payRefNo, setPayRefNo] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  // ── Form state ──
  const [formOpen, setFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Form fields
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerHN, setCustomerHN] = useState('');
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [saleNote, setSaleNote] = useState('');
  const [purchasedItems, setPurchasedItems] = useState([]);
  const [medications, setMedications] = useState([]);
  const [billDiscount, setBillDiscount] = useState('');
  const [billDiscountType, setBillDiscountType] = useState('amount');
  const [couponCode, setCouponCode] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentTime, setPaymentTime] = useState('');
  const [refNo, setRefNo] = useState('');
  const [pmChannels, setPmChannels] = useState([
    { enabled: true, method: '', amount: '' },
    { enabled: false, method: '', amount: '' },
    { enabled: false, method: '', amount: '' },
  ]);
  const [pmSellers, setPmSellers] = useState([
    { enabled: true, id: '', name: '', percent: '0', total: '' },
    { enabled: false, id: '', name: '', percent: '0', total: '' },
    { enabled: false, id: '', name: '', percent: '0', total: '' },
    { enabled: false, id: '', name: '', percent: '0', total: '' },
    { enabled: false, id: '', name: '', percent: '0', total: '' },
  ]);

  // Buy modal
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyModalType, setBuyModalType] = useState('course');
  const [buyItems, setBuyItems] = useState({ course: [], promotion: [], product: [] });
  const [buyCategories, setBuyCategories] = useState({});
  const [buyChecked, setBuyChecked] = useState(new Set());
  const [buyQtyMap, setBuyQtyMap] = useState({});
  const [buyQuery, setBuyQuery] = useState('');
  const [buySelectedCat, setBuySelectedCat] = useState('');
  const [buyLoading, setBuyLoading] = useState(false);

  // Options
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [sellers, setSellers] = useState([]);

  // ── Load sales list ──
  const loadSales = useCallback(async () => {
    setListLoading(true);
    try { setSales(await getAllSales()); } catch { setSales([]); }
    finally { setListLoading(false); }
  }, []);
  useEffect(() => { loadSales(); }, [loadSales]);

  // ── Billing calc ──
  const billing = useMemo(() => {
    let subtotal = 0;
    purchasedItems.forEach(p => { subtotal += (parseFloat(p.unitPrice) || 0) * (parseInt(p.qty) || 1); });
    medications.forEach(m => { if (m.name) subtotal += (parseFloat(m.unitPrice) || 0) * (parseInt(m.qty) || 1); });
    const disc = billDiscountType === 'percent' ? subtotal * (parseFloat(billDiscount) || 0) / 100 : (parseFloat(billDiscount) || 0);
    const netTotal = Math.max(0, subtotal - disc);
    return { subtotal, discount: disc, netTotal };
  }, [purchasedItems, medications, billDiscount, billDiscountType]);

  // ── Auto-fill payment amount when "ชำระเต็ม" + billing changes ──
  useEffect(() => {
    if (paymentStatus === 'paid' && billing.netTotal > 0) {
      setPmChannels(prev => prev.map((c, i) => i === 0 ? { ...c, enabled: true, amount: String(billing.netTotal) } : c));
    }
  }, [billing.netTotal, paymentStatus]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = sales;
    if (filterStatus) list = list.filter(s => s.payment?.status === filterStatus || s.status === filterStatus);
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      list = list.filter(s => (s.customerName || '').toLowerCase().includes(q) || (s.saleId || '').toLowerCase().includes(q) || (s.customerHN || '').includes(q));
    }
    return list;
  }, [sales, filterQuery, filterStatus]);

  // ── Load form options ──
  const loadOptions = useCallback(async () => {
    if (customers.length && sellers.length) return;
    const [c, d, s] = await Promise.all([getAllCustomers(), getAllMasterDataItems('doctors'), getAllMasterDataItems('staff')]);
    setCustomers(c);
    setSellers([...s.map(x => ({ id: x.id, name: x.name })), ...d.map(x => ({ id: x.id, name: x.name }))]);
  }, [customers.length, sellers.length]);

  // ── Open buy modal ──
  const openBuyModal = useCallback(async (type) => {
    setBuyModalOpen(true);
    setBuyModalType(type);
    setBuyQuery('');
    setBuySelectedCat('');
    setBuyChecked(new Set());
    setBuyQtyMap({});
    if (buyItems[type]?.length > 0) return;
    setBuyLoading(true);
    try {
      const all = await getAllMasterDataItems(type === 'product' ? 'products' : type === 'course' ? 'courses' : 'promotions');
      let items, cats;
      if (type === 'product') {
        items = all.filter(p => p.type === 'สินค้าหน้าร้าน').map(p => ({ id: p.id, name: p.name, price: p.price, unit: p.unit, category: p.category, itemType: 'product' }));
      } else if (type === 'course') {
        items = all.map(c => ({ id: c.id, name: c.name, price: c.price, category: c.category, itemType: 'course', products: c.products }));
      } else {
        items = all.map(p => ({ id: p.id, name: p.name, price: p.price, category: p.category, itemType: 'promotion', courses: p.courses, products: p.products }));
      }
      cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
      setBuyItems(prev => ({ ...prev, [type]: items }));
      setBuyCategories(prev => ({ ...prev, [type]: cats }));
    } catch {}
    setBuyLoading(false);
  }, [buyItems]);

  const confirmBuy = () => {
    const items = buyItems[buyModalType] || [];
    const newItems = items.filter(i => buyChecked.has(i.id)).map(i => ({
      id: i.id, name: i.name, price: i.price, unitPrice: i.price, unit: i.unit || (buyModalType === 'course' ? 'คอร์ส' : buyModalType === 'promotion' ? 'โปรโมชัน' : ''),
      qty: String(buyQtyMap[i.id] || 1), itemType: i.itemType || buyModalType, category: i.category,
    }));
    setPurchasedItems(prev => [...prev, ...newItems]);
    setBuyModalOpen(false);
  };

  const buyFilteredItems = useMemo(() => {
    let items = buyItems[buyModalType] || [];
    if (buySelectedCat) items = items.filter(i => i.category === buySelectedCat);
    if (buyQuery) { const q = buyQuery.toLowerCase(); items = items.filter(i => i.name.toLowerCase().includes(q)); }
    return items;
  }, [buyItems, buyModalType, buySelectedCat, buyQuery]);

  // ── Customer search ──
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 15);
    const q = customerSearch.toLowerCase();
    return customers.filter(c => {
      const name = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.toLowerCase();
      return name.includes(q) || (c.proClinicHN || '').toLowerCase().includes(q);
    }).slice(0, 15);
  }, [customers, customerSearch]);

  // ── Open create/edit form ──
  const openCreate = () => {
    loadOptions();
    setEditingSale(null);
    setCustomerId(''); setCustomerName(''); setCustomerHN('');
    setSaleDate(new Date().toISOString().split('T')[0]);
    setSaleNote(''); setPurchasedItems([]); setMedications([]);
    setBillDiscount(''); setBillDiscountType('amount');
    setPaymentStatus('paid'); setPaymentDate(new Date().toISOString().split('T')[0]); setPaymentTime(''); setRefNo('');
    setPmChannels([{ enabled: true, method: '', amount: '' }, { enabled: false, method: '', amount: '' }, { enabled: false, method: '', amount: '' }]);
    setPmSellers([...Array(5)].map(() => ({ enabled: false, id: '', name: '', percent: '0', total: '' })));
    setError(''); setSuccess(false); setFormOpen(true);
  };

  const openEdit = (sale) => {
    loadOptions();
    setEditingSale(sale);
    setCustomerId(sale.customerId || ''); setCustomerName(sale.customerName || ''); setCustomerHN(sale.customerHN || '');
    setSaleDate(sale.saleDate || ''); setSaleNote(sale.saleNote || '');
    setPurchasedItems(sale.items ? [...(sale.items.promotions||[]), ...(sale.items.courses||[]), ...(sale.items.products||[])] : []);
    setMedications(sale.items?.medications || []);
    setBillDiscount(String(sale.billing?.billDiscount || '')); setBillDiscountType(sale.billing?.discountType || 'amount');
    setPaymentStatus(sale.payment?.status || 'paid');
    setPaymentDate(sale.payment?.date || ''); setPaymentTime(sale.payment?.time || ''); setRefNo(sale.payment?.refNo || '');
    setPmChannels(sale.payment?.channels?.length ? sale.payment.channels.concat([...Array(3)].map(() => ({ enabled: false, method: '', amount: '' }))).slice(0, 3)
      : [{ enabled: true, method: '', amount: '' }, { enabled: false, method: '', amount: '' }, { enabled: false, method: '', amount: '' }]);
    setPmSellers(sale.sellers?.length ? sale.sellers.map(s => ({ ...s, enabled: true })).concat([...Array(5)].map(() => ({ enabled: false, id: '', name: '', percent: '0', total: '' }))).slice(0, 5)
      : [...Array(5)].map(() => ({ enabled: false, id: '', name: '', percent: '0', total: '' })));
    setError(''); setSuccess(false); setFormOpen(true);
  };

  // ── Save ──
  const handleSave = async () => {
    if (!customerId) { setError('กรุณาเลือกลูกค้า'); return; }
    if (!saleDate) { setError('กรุณาเลือกวันที่ขาย'); return; }
    if (!pmSellers.some(s => s.enabled && s.id)) { setError('กรุณาเลือกพนักงานขาย'); return; }
    if (paymentStatus === 'paid' || paymentStatus === 'split') {
      if (!pmChannels.some(c => c.enabled && c.method)) { setError('กรุณาเลือกช่องทางชำระเงิน'); return; }
    }
    setSaving(true); setError('');
    try {
      const grouped = { promotions: [], courses: [], products: [], medications: medications.filter(m => m.name) };
      purchasedItems.forEach(p => {
        const t = p.itemType || 'product';
        if (t === 'promotion') grouped.promotions.push(p);
        else if (t === 'course') grouped.courses.push(p);
        else grouped.products.push(p);
      });
      const data = clean({
        customerId, customerName, customerHN, saleDate, saleNote,
        items: grouped,
        billing: { subtotal: billing.subtotal, billDiscount: billing.discount, discountType: billDiscountType, netTotal: billing.netTotal },
        payment: { status: paymentStatus, channels: pmChannels.filter(c => c.enabled), date: paymentDate, time: paymentTime, refNo },
        sellers: pmSellers.filter(s => s.enabled).map(s => ({ id: s.id, name: s.name, percent: s.percent, total: s.total })),
      });
      if (editingSale) {
        await updateBackendSale(editingSale.saleId || editingSale.id, data);
      } else {
        await createBackendSale(data);
      }
      setSuccess(true);
      setTimeout(() => { setFormOpen(false); setSuccess(false); loadSales(); }, 800);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (sale) => {
    if (!confirm('ต้องการลบใบเสร็จนี้?')) return;
    await deleteBackendSale(sale.saleId || sale.id);
    loadSales();
  };

  // ════════════════════ RENDER ════════════════════
  if (formOpen) return renderForm();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-rose-400/50" />
            <input type="text" value={filterQuery} onChange={e => setFilterQuery(e.target.value)} placeholder="ค้นหาใบเสร็จ... (เลขที่, ชื่อลูกค้า, HN)"
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-sm text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none transition-all"
              style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-3 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-xs font-bold text-[var(--tx-primary)] focus:outline-none transition-all">
            <option value="">ทุกสถานะ</option>
            {PAYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={openCreate}
            className="px-6 py-3 rounded-xl font-black text-sm text-white transition-all flex items-center gap-2 hover:shadow-xl active:scale-[0.97] uppercase tracking-wider whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #be123c, #e11d48)', boxShadow: '0 4px 20px rgba(244,63,94,0.35)' }}>
            <Plus size={16} /> สร้างใบเสร็จ
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-[var(--tx-muted)] flex items-center gap-1.5">
            <ShoppingCart size={12} /> จัดการใบเสร็จ ดูรายละเอียด ยกเลิก หรือรับชำระเพิ่ม
          </p>
          <span className="text-xs text-[var(--tx-muted)] font-bold">{filtered.length} รายการ</span>
        </div>
      </div>

      {/* Table */}
      {listLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-[var(--tx-muted)]" /><span className="ml-3 text-sm text-[var(--tx-muted)]">กำลังโหลด...</span></div>
      ) : filtered.length === 0 ? (
        sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.2), rgba(244,63,94,0.05))', border: '1.5px solid rgba(244,63,94,0.3)', boxShadow: '0 0 40px rgba(244,63,94,0.15), 0 0 80px rgba(244,63,94,0.05)' }}>
                <ShoppingCart size={32} className="text-rose-400" />
              </div>
              <div className="absolute -inset-4 rounded-3xl opacity-30" style={{ background: 'radial-gradient(circle, rgba(244,63,94,0.15) 0%, transparent 70%)' }} />
            </div>
            <h3 className="text-xl font-black text-[var(--tx-heading)] mb-2 tracking-tight">ขาย / ใบเสร็จ</h3>
            <p className="text-sm text-[var(--tx-muted)] max-w-lg mx-auto text-center leading-relaxed mb-8">
              สร้างใบเสร็จ ขายคอร์ส/โปรโมชัน/สินค้า พร้อมจัดการการชำระเงินและพนักงานขาย
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
              {[
                { step: '1', title: 'เลือกลูกค้า', desc: 'ค้นหาและเลือกจากรายชื่อที่ Clone มา' },
                { step: '2', title: 'เพิ่มสินค้า', desc: 'เลือกคอร์ส โปรโมชัน หรือสินค้า' },
                { step: '3', title: 'ชำระเงิน', desc: 'บันทึกช่องทางชำระและพนักงานขาย' },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--bd)]">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 bg-rose-900/20 text-rose-400">{s.step}</span>
                  <div>
                    <p className="text-sm font-bold text-[var(--tx-heading)]">{s.title}</p>
                    <p className="text-xs text-[var(--tx-muted)] mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
            <Search size={28} className="mx-auto text-[var(--tx-muted)] mb-2" />
            <p className="text-sm text-[var(--tx-muted)]">ไม่พบรายการที่ตรงกับตัวกรอง</p>
          </div>
        )
      ) : (
        <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--bd)] bg-[var(--bg-elevated)]">
                  {['เลขที่','ลูกค้า','วันที่','ยอดรวม','สถานะ','จัดการ'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-bold text-[var(--tx-muted)] uppercase tracking-wider text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale, i) => {
                  const st = PAYMENT_STATUSES.find(s => s.value === sale.payment?.status) || PAYMENT_STATUSES[3];
                  return (
                    <tr key={sale.saleId || sale.id || i} className={`border-b border-[var(--bd)]/50 hover:bg-[var(--bg-hover)] ${i % 2 ? 'bg-[var(--bg-card)]/30' : ''}`}>
                      <td className="px-3 py-2 font-mono text-[var(--tx-secondary)]">{sale.saleId || '-'}</td>
                      <td className="px-3 py-2 text-[var(--tx-heading)] font-medium">{sale.customerName || '-'} <span className="text-[var(--tx-muted)] text-xs">{sale.customerHN}</span></td>
                      <td className="px-3 py-2 text-[var(--tx-secondary)]">{fmtDate(sale.saleDate)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[var(--tx-heading)]">{fmtMoney(sale.billing?.netTotal)} ฿</td>
                      <td className="px-3 py-2"><span className={`text-[11px] font-bold px-1.5 py-0.5 rounded bg-${st.color}-900/30 text-${st.color}-400`}>{st.label}</span></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => setViewingSale(sale)} className="p-1 rounded hover:bg-violet-900/20 text-violet-400" title="ดูรายละเอียด"><Eye size={13} /></button>
                          <button onClick={() => openEdit(sale)} className="p-1 rounded hover:bg-sky-900/20 text-sky-400" title="แก้ไข"><Edit3 size={13} /></button>
                          {(sale.payment?.status === 'unpaid' || sale.payment?.status === 'split') && (
                            <button onClick={() => { setPayModal(sale); setPayMethod(''); setPayAmount(''); setPayDate(new Date().toISOString().split('T')[0]); setPayRefNo(''); }}
                              className="p-1 rounded hover:bg-emerald-900/20 text-emerald-400" title="รับชำระเงิน"><DollarSign size={13} /></button>
                          )}
                          {sale.status !== 'cancelled' && (
                            <button onClick={() => { setCancelModal(sale); setCancelReason(''); setCancelRefundMethod('เงินสด'); setCancelRefundAmount(String(sale.billing?.netTotal || 0)); }}
                              className="p-1 rounded hover:bg-red-900/20 text-red-400" title="ยกเลิก"><X size={13} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ DETAIL VIEW MODAL ═══ */}
      {viewingSale && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setViewingSale(null)}>
          <div className={`w-full max-w-2xl mx-4 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b flex items-center justify-between sticky top-0 z-10 ${isDark ? 'border-[var(--bd)] bg-[var(--bg-surface)]' : 'border-gray-200 bg-white'}`}>
              <div>
                <h3 className="text-sm font-bold text-rose-400">{viewingSale.saleId}</h3>
                <p className="text-xs text-[var(--tx-muted)]">{viewingSale.customerName} | {fmtDate(viewingSale.saleDate)}</p>
              </div>
              <button onClick={() => setViewingSale(null)} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              {/* Items */}
              <div>
                <h4 className={labelCls}>รายการสินค้า</h4>
                {[...(viewingSale.items?.promotions||[]),...(viewingSale.items?.courses||[]),...(viewingSale.items?.products||[])].map((item,i) => (
                  <div key={i} className={`flex justify-between py-1 ${isDark ? 'border-b border-[var(--bd)]/50' : 'border-b border-gray-100'}`}>
                    <span>{item.name} <span className="text-[var(--tx-muted)]">x{item.qty}</span></span>
                    <span className="font-mono">{fmtMoney((parseFloat(item.unitPrice)||0)*(parseInt(item.qty)||1))} บาท</span>
                  </div>
                ))}
                {(viewingSale.items?.medications||[]).map((m,i) => (
                  <div key={`m${i}`} className={`flex justify-between py-1 ${isDark ? 'border-b border-[var(--bd)]/50' : 'border-b border-gray-100'}`}>
                    <span><Pill size={10} className="inline mr-1 text-purple-400" />{m.name} <span className="text-[var(--tx-muted)]">{m.dosage} x{m.qty}</span></span>
                    <span className="font-mono">{fmtMoney((parseFloat(m.unitPrice)||0)*(parseInt(m.qty)||1))} บาท</span>
                  </div>
                ))}
              </div>
              {/* Billing */}
              <div className={`p-3 rounded-lg ${isDark ? 'bg-[var(--bg-elevated)]' : 'bg-gray-50'}`}>
                <div className="flex justify-between"><span className="text-[var(--tx-muted)]">ยอดรวม</span><span className="font-mono">{fmtMoney(viewingSale.billing?.subtotal)} บาท</span></div>
                {viewingSale.billing?.billDiscount > 0 && <div className="flex justify-between"><span className="text-[var(--tx-muted)]">ส่วนลด</span><span className="font-mono text-red-400">-{fmtMoney(viewingSale.billing.billDiscount)} บาท</span></div>}
                <div className="flex justify-between pt-1 border-t border-[var(--bd)] font-bold"><span>ยอดสุทธิ</span><span className="text-emerald-400 font-mono">{fmtMoney(viewingSale.billing?.netTotal)} บาท</span></div>
              </div>
              {/* Payment */}
              <div>
                <h4 className={labelCls}>การชำระเงิน — {(PAYMENT_STATUSES.find(s => s.value===viewingSale.payment?.status)||{}).label || viewingSale.payment?.status}</h4>
                {(viewingSale.payment?.channels||[]).filter(c=>c.enabled).map((ch,i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span>{ch.method || 'ไม่ระบุ'}</span><span className="font-mono">{fmtMoney(ch.amount)} บาท</span>
                  </div>
                ))}
                {viewingSale.payment?.refNo && <p className="text-[var(--tx-muted)] mt-1">Ref: {viewingSale.payment.refNo}</p>}
              </div>
              {/* Sellers */}
              {viewingSale.sellers?.length > 0 && (
                <div>
                  <h4 className={labelCls}>พนักงานขาย</h4>
                  {viewingSale.sellers.map((s,i) => <div key={i} className="flex justify-between py-0.5"><span>{s.name||s.id}</span><span>{s.percent}%</span></div>)}
                </div>
              )}
              {/* Cancelled info */}
              {viewingSale.status === 'cancelled' && viewingSale.cancelled && (
                <div className={`p-3 rounded-lg border ${isDark ? 'bg-red-950/20 border-red-900/40' : 'bg-red-50 border-red-200'}`}>
                  <h4 className="text-xs font-bold text-red-400 mb-1">ยกเลิกแล้ว</h4>
                  <p className="text-xs text-[var(--tx-secondary)]">เหตุผล: {viewingSale.cancelled.reason || '-'}</p>
                  <p className="text-xs text-[var(--tx-secondary)]">คืนเงิน: {viewingSale.cancelled.refundMethod} {fmtMoney(viewingSale.cancelled.refundAmount)} บาท</p>
                </div>
              )}
              {viewingSale.saleNote && <p className="text-[var(--tx-muted)]">หมายเหตุ: {viewingSale.saleNote}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ═══ CANCEL MODAL ═══ */}
      {cancelModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60" onClick={() => setCancelModal(null)}>
          <div className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
              <h3 className="text-sm font-bold text-red-400">ยกเลิกใบเสร็จ {cancelModal.saleId}</h3>
            </div>
            <div className="p-5 space-y-3">
              <div><label className={labelCls}>เหตุผลการยกเลิก</label><textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="ระบุเหตุผล..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>วิธีคืนเงิน</label>
                  <select value={cancelRefundMethod} onChange={e => setCancelRefundMethod(e.target.value)} className={inputCls}>
                    <option value="เงินสด">เงินสด</option><option value="โอนธนาคาร">โอนธนาคาร</option><option value="Wallet">Wallet</option><option value="ไม่คืนเงิน">ไม่คืนเงิน</option>
                  </select>
                </div>
                <div><label className={labelCls}>จำนวนคืน (บาท)</label><input type="number" value={cancelRefundAmount} onChange={e => setCancelRefundAmount(e.target.value)} className={inputCls} /></div>
              </div>
            </div>
            <div className={`px-5 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
              <button onClick={() => setCancelModal(null)} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ปิด</button>
              <button onClick={async () => {
                setCancelSaving(true);
                await cancelBackendSale(cancelModal.saleId || cancelModal.id, cancelReason, cancelRefundMethod, parseFloat(cancelRefundAmount) || 0);
                setCancelSaving(false); setCancelModal(null); loadSales();
              }} disabled={cancelSaving} className="px-4 py-2 rounded-lg text-xs font-bold bg-red-700 text-white hover:bg-red-600 disabled:opacity-50">
                {cancelSaving ? <Loader2 size={12} className="animate-spin" /> : 'ยืนยันยกเลิก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PAYMENT UPDATE MODAL ═══ */}
      {payModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60" onClick={() => setPayModal(null)}>
          <div className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
              <h3 className="text-sm font-bold text-emerald-400">รับชำระเงิน {payModal.saleId}</h3>
              <p className="text-xs text-[var(--tx-muted)]">ยอดค้าง: {fmtMoney(Math.max(0, (payModal.billing?.netTotal||0) - (payModal.payment?.channels||[]).reduce((s,c) => s + (parseFloat(c.amount)||0), 0)))} บาท</p>
            </div>
            <div className="p-5 space-y-3">
              <div><label className={labelCls}>ช่องทาง</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className={inputCls}>
                  <option value="">เลือกช่องทาง</option>
                  {PAYMENT_CHANNELS.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>จำนวน (บาท)</label><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className={inputCls} placeholder="0.00" /></div>
                <div><label className={labelCls}>วันที่</label><DatePickerField value={payDate} onChange={setPayDate} /></div>
              </div>
              <div><label className={labelCls}>เลขอ้างอิง</label><input type="text" value={payRefNo} onChange={e => setPayRefNo(e.target.value)} className={inputCls} placeholder="REF-..." /></div>
            </div>
            <div className={`px-5 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
              <button onClick={() => setPayModal(null)} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ปิด</button>
              <button onClick={async () => {
                if (!payMethod || !payAmount) return;
                setPaySaving(true);
                await updateSalePayment(payModal.saleId || payModal.id, { method: payMethod, amount: payAmount, date: payDate, refNo: payRefNo });
                setPaySaving(false); setPayModal(null); loadSales();
              }} disabled={paySaving || !payMethod || !payAmount} className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50">
                {paySaving ? <Loader2 size={12} className="animate-spin" /> : 'บันทึกการชำระ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════ FORM OVERLAY ════════════════════
  function renderForm() {
    return (
      <div className={`fixed inset-0 z-[80] overflow-y-auto ${isDark ? 'bg-[var(--bg-elevated)] text-[var(--tx-primary)]' : 'bg-gray-50 text-gray-800'}`}>
        {/* Header */}
        <div className={`sticky top-0 z-10 border-b backdrop-blur-sm ${isDark ? 'bg-[var(--bg-elevated)]/95 border-[var(--bd)]' : 'bg-white/95 border-gray-200'}`}>
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]"><ArrowLeft size={16} /></button>
            <h2 className="text-sm font-black tracking-tight text-rose-400 flex items-center gap-2">
              <ShoppingCart size={16} /> {editingSale ? 'แก้ไขใบเสร็จ' : 'สร้างใบเสร็จใหม่'}
            </h2>
            {customerName && <span className="text-xs text-[var(--tx-muted)]">| {customerName}</span>}
          </div>
        </div>

        {success ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center"><CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" /><p className="text-sm font-bold text-emerald-400">{editingSale ? 'บันทึกสำเร็จ' : 'สร้างใบเสร็จสำเร็จ'}</p></div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

            {/* Customer picker */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <label className={labelCls}>ลูกค้า *</label>
              {customerName ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-rose-900/10 border border-rose-700/30">
                  <span className="text-xs font-bold">{customerName} <span className="font-mono text-[var(--tx-muted)]">{customerHN}</span></span>
                  <button onClick={() => { setCustomerId(''); setCustomerName(''); setCustomerHN(''); }} className="text-[var(--tx-muted)] hover:text-red-400"><X size={14} /></button>
                </div>
              ) : (
                <div>
                  <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="ค้นหาชื่อ / HN..."
                    className={inputCls} />
                  {filteredCustomers.length > 0 && customerSearch && (
                    <div className={`mt-1 max-h-32 overflow-y-auto border rounded-lg ${isDark ? 'border-[var(--bd-strong)] bg-[var(--bg-surface)]' : 'border-gray-200 bg-white'}`}>
                      {filteredCustomers.map(c => {
                        const nm = `${c.patientData?.prefix||''} ${c.patientData?.firstName||''} ${c.patientData?.lastName||''}`.trim();
                        return (
                          <button key={c.id} onClick={() => { setCustomerId(c.proClinicId||c.id); setCustomerName(nm); setCustomerHN(c.proClinicHN||''); setCustomerSearch(''); }}
                            className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] flex justify-between">
                            <span>{nm}</span><span className="text-xs font-mono text-[var(--tx-muted)]">{c.proClinicHN||''}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-2">
                <label className={labelCls}>วันที่ขาย *</label>
                <DatePickerField value={saleDate} onChange={setSaleDate} className="max-w-[200px]" />
              </div>
            </div>

            {/* Buy items section */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-rose-400 flex items-center gap-1.5"><ShoppingCart size={12} /> รายการสินค้า</h3>
                <div className="flex gap-1.5">
                  <button onClick={() => openBuyModal('course')} className="text-xs font-bold px-2 py-1 rounded bg-teal-900/20 border border-teal-700/40 text-teal-400 hover:bg-teal-900/30"><Plus size={10} /> ซื้อคอร์ส</button>
                  <button onClick={() => openBuyModal('product')} className="text-xs font-bold px-2 py-1 rounded bg-amber-900/20 border border-amber-700/40 text-amber-400 hover:bg-amber-900/30"><Plus size={10} /> สินค้า</button>
                  <button onClick={() => openBuyModal('promotion')} className="text-xs font-bold px-2 py-1 rounded bg-sky-900/20 border border-sky-700/40 text-sky-400 hover:bg-sky-900/30"><Plus size={10} /> โปรโมชัน</button>
                  <button onClick={() => setMedications(prev => [...prev, { name: '', dosage: '', qty: '1', unitPrice: '', unit: 'เม็ด' }])} className="text-xs font-bold px-2 py-1 rounded bg-purple-900/20 border border-purple-700/40 text-purple-400 hover:bg-purple-900/30"><Plus size={10} /> ยากลับบ้าน</button>
                </div>
              </div>
              {purchasedItems.length === 0 && medications.length === 0 ? (
                <p className="text-xs text-[var(--tx-muted)] text-center py-6">ยังไม่มีรายการ — กดปุ่มด้านบนเพื่อเพิ่ม</p>
              ) : (
                <div className="space-y-1">
                  {purchasedItems.map((item, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${isDark ? 'bg-[var(--bg-surface)]' : 'bg-gray-50'}`}>
                      <span className="text-xs">{item.name} <span className="text-[var(--tx-muted)]">x{item.qty}</span></span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">{fmtMoney((parseFloat(item.unitPrice)||0) * (parseInt(item.qty)||1))}</span>
                        <button onClick={() => setPurchasedItems(prev => prev.filter((_,j) => j !== i))} className="text-red-400"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  ))}
                  {medications.map((med, i) => (
                    <div key={`m${i}`} className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${isDark ? 'bg-[var(--bg-surface)]' : 'bg-gray-50'}`}>
                      <span className="text-xs"><Pill size={10} className="inline mr-1 text-purple-400" />{med.name} <span className="text-[var(--tx-muted)]">{med.dosage} x{med.qty}</span></span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">{fmtMoney((parseFloat(med.unitPrice)||0) * (parseInt(med.qty)||1))}</span>
                        <button onClick={() => setMedications(prev => prev.filter((_,j) => j !== i))} className="text-red-400"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Billing summary */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5 mb-3"><DollarSign size={12} /> สรุปค่าใช้จ่าย</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-[var(--tx-muted)]">ยอดรวม</span><span className="font-mono">{fmtMoney(billing.subtotal)} บาท</span></div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--tx-muted)] shrink-0">คูปอง</span>
                  <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)} className={`${inputCls} !w-32 !py-1`} placeholder="รหัสคูปอง" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--tx-muted)]">ส่วนลด</span>
                  <input type="number" value={billDiscount} onChange={e => setBillDiscount(e.target.value)} className={`${inputCls} !w-20 !py-1 text-center`} placeholder="0" />
                  <select value={billDiscountType} onChange={e => setBillDiscountType(e.target.value)} className={`${inputCls} !w-16 !py-1`}>
                    <option value="amount">฿</option><option value="percent">%</option>
                  </select>
                  <span className="ml-auto font-mono text-red-400">-{fmtMoney(billing.discount)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[var(--bd)] font-bold text-sm">
                  <span>ยอดสุทธิ</span><span className="text-emerald-400 font-mono">{fmtMoney(billing.netTotal)} บาท</span>
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-pink-400 flex items-center gap-1.5 mb-3"><CreditCard size={12} /> การชำระเงิน</h3>
              <div className="flex gap-3 mb-3 flex-wrap">
                {[{v:'paid',l:'ชำระเต็ม'},{v:'split',l:'แบ่งชำระ'},{v:'unpaid',l:'ค้างชำระ'},{v:'draft',l:'แบบร่าง'}].map(s => (
                  <label key={s.v} className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input type="radio" name="payStatus" checked={paymentStatus===s.v} onChange={() => {
                      setPaymentStatus(s.v);
                      if (s.v === 'paid') setPmChannels(prev => prev.map((c, i) => i === 0 ? { ...c, enabled: true, amount: String(billing.netTotal || 0) } : c));
                    }} className="accent-rose-500" />{s.l}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className={labelCls}>วันที่ชำระ</label><DatePickerField value={paymentDate} onChange={setPaymentDate} /></div>
                <div><label className={labelCls}>เลขอ้างอิง</label><input type="text" value={refNo} onChange={e => setRefNo(e.target.value)} className={inputCls} placeholder="REF-001" /></div>
              </div>
              <label className={labelCls}>ช่องทางชำระเงิน</label>
              {pmChannels.map((ch, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <input type="checkbox" checked={ch.enabled} onChange={e => setPmChannels(prev => prev.map((c,j) => j===i ? {...c, enabled: e.target.checked} : c))} className="accent-rose-500" />
                  <select value={ch.method} onChange={e => setPmChannels(prev => prev.map((c,j) => j===i ? {...c, method: e.target.value} : c))} className={`${inputCls} !w-40`} disabled={!ch.enabled}>
                    <option value="">เลือกช่องทาง</option>
                    {PAYMENT_CHANNELS.map(pc => <option key={pc.id} value={pc.name}>{pc.name}</option>)}
                  </select>
                  <input type="number" value={ch.amount} onChange={e => setPmChannels(prev => prev.map((c,j) => j===i ? {...c, amount: e.target.value} : c))} className={`${inputCls} !w-28 text-right`} placeholder="0.00" disabled={!ch.enabled} />
                  <span className="text-xs text-[var(--tx-muted)] shrink-0">บาท</span>
                </div>
              ))}
            </div>

            {/* Sellers */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 mb-3"><UsersIcon size={12} /> พนักงานขาย</h3>
              {pmSellers.map((s, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <input type="checkbox" checked={s.enabled} onChange={e => setPmSellers(prev => prev.map((x,j) => j===i ? {...x, enabled: e.target.checked} : x))} className="accent-amber-500" />
                  <select value={s.id} onChange={e => { const sel = sellers.find(x => String(x.id)===e.target.value); setPmSellers(prev => prev.map((x,j) => j===i ? {...x, id: e.target.value, name: sel?.name||''} : x)); }} className={`${inputCls} !w-48`} disabled={!s.enabled}>
                    <option value="">เลือกพนักงาน</option>
                    {sellers.map(sl => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                  </select>
                  <input type="number" value={s.percent} onChange={e => setPmSellers(prev => prev.map((x,j) => j===i ? {...x, percent: e.target.value} : x))} className={`${inputCls} !w-16 text-center`} placeholder="%" disabled={!s.enabled} />
                  <span className="text-xs text-[var(--tx-muted)]">%</span>
                </div>
              ))}
            </div>

            {/* Note */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <label className={labelCls}>หมายเหตุ</label>
              <textarea value={saleNote} onChange={e => setSaleNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
            </div>

            {/* Error + Submit */}
            {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</div>}
            <div className="flex justify-end gap-2 pb-8">
              <button onClick={() => setFormOpen(false)} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ยกเลิก</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-50 flex items-center gap-1.5">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {editingSale ? 'บันทึก' : 'สร้างใบเสร็จ'}
              </button>
            </div>
          </div>
        )}

        {/* Buy modal */}
        {buyModalOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setBuyModalOpen(false)}>
            <div className={`w-full max-w-lg mx-4 rounded-2xl shadow-2xl max-h-[70vh] flex flex-col ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
              <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
                <div className="flex gap-2">
                  {['course','product','promotion'].map(t => (
                    <button key={t} onClick={() => { setBuyModalType(t); setBuySelectedCat(''); if (!buyItems[t]?.length) openBuyModal(t); }}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg ${buyModalType===t ? 'bg-rose-700 text-white' : isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>
                      {t==='course' ? 'คอร์ส' : t==='product' ? 'สินค้า' : 'โปรโมชัน'}
                    </button>
                  ))}
                </div>
                <button onClick={() => setBuyModalOpen(false)} className="text-[var(--tx-muted)]"><X size={16} /></button>
              </div>
              <div className="px-4 py-2 flex gap-2">
                <input type="text" value={buyQuery} onChange={e => setBuyQuery(e.target.value)} placeholder="ค้นหา..." className={`${inputCls} !py-1.5`} />
                {(buyCategories[buyModalType]||[]).length > 0 && (
                  <select value={buySelectedCat} onChange={e => setBuySelectedCat(e.target.value)} className={`${inputCls} !w-32 !py-1.5`}>
                    <option value="">ทุกหมวด</option>
                    {(buyCategories[buyModalType]||[]).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-2">
                {buyLoading ? <div className="text-center py-8"><Loader2 size={18} className="animate-spin mx-auto text-[var(--tx-muted)]" /></div>
                : buyFilteredItems.length === 0 ? <p className="text-xs text-[var(--tx-muted)] text-center py-8">ไม่พบรายการ</p>
                : buyFilteredItems.map(item => {
                  const checked = buyChecked.has(item.id);
                  return (
                    <label key={item.id} className={`flex items-center justify-between py-2 px-2 rounded-lg mb-1 cursor-pointer ${checked ? isDark ? 'bg-rose-500/10' : 'bg-rose-50' : isDark ? 'hover:bg-[var(--bg-hover)]' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <input type="checkbox" checked={checked} onChange={() => {
                          setBuyChecked(prev => { const n = new Set(prev); checked ? n.delete(item.id) : n.add(item.id); return n; });
                          if (!buyQtyMap[item.id]) setBuyQtyMap(prev => ({...prev, [item.id]: '1'}));
                        }} className="accent-rose-500" />
                        <span className={`text-xs truncate ${checked ? 'font-bold text-rose-400' : ''}`}>{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {checked && <input type="number" value={buyQtyMap[item.id]||'1'} onChange={e => setBuyQtyMap(prev => ({...prev, [item.id]: e.target.value}))} min="1" className={`${inputCls} !w-14 !py-0.5 text-center`} />}
                        <span className="text-xs text-[var(--tx-muted)]">{item.price ? fmtMoney(item.price) : ''}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className={`px-4 py-3 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
                <button onClick={() => setBuyModalOpen(false)} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ยกเลิก</button>
                <button onClick={confirmBuy} disabled={buyChecked.size===0} className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40">
                  เพิ่ม {buyChecked.size} รายการ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
