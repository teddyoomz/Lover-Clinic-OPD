// ─── SaleTab — Standalone sale/invoice (replicate ProClinic /admin/sale) ─────
// List view + create/edit form overlay with buy modal, billing, payment, sellers

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingCart, Plus, Edit3, Trash2, Search, Loader2, X, Eye,
  ChevronDown, CheckCircle2, AlertCircle, DollarSign, CreditCard,
  Users as UsersIcon, Package, Pill, ArrowLeft, Printer
} from 'lucide-react';
import {
  createBackendSale, updateBackendSale, deleteBackendSale,
  getAllSales, getAllCustomers,
  cancelBackendSale, updateSalePayment, assignCourseToCustomer,
  applyDepositToSale, reverseDepositUsage,
  deductWallet, refundToWallet, getCustomerMembership, earnPoints, reversePointsEarned,
  analyzeSaleCancel, removeLinkedSaleCourses,
  deductStockForSale, reverseStockForSale, analyzeStockImpact,
  // Phase 14.10-tris (2026-04-26) — be_products + be_courses canonical
  // (was master_data via getAllMasterDataItems — stale ProClinic mirror).
  listProducts, listCourses,
  // Phase 14.10-tris (2026-04-26) — listAllSellers is the unified helper
  // backed by be_staff + be_doctors (canonical OUR data). Master_data is
  // dev-only seed per Rule H-bis; the real CRUD writes to be_*. User
  // reported numeric "614" showing because master_data entry for that
  // staff had empty `name`, while be_staff has proper firstname/lastname.
  listAllSellers,
} from '../../lib/backendClient.js';
import { flattenPromotionsForStockDeduction } from '../../lib/treatmentBuyHelpers.js';
import {
  findCouponByCode, listPromotions,
} from '../../lib/backendClient.js';

// Phase 14.7.H follow-up A (2026-04-26) — branchId now resolved via
// `useSelectedBranch()` hook from BranchContext. Single-branch clinics
// fall back to 'main' (BranchContext's default), so existing behavior
// is preserved 100%.
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { resolveSellerName } from '../../lib/documentFieldAutoFill.js';
import { hexToRgb, thaiTodayISO } from '../../utils.js';
import { fmtThaiDate } from '../../lib/dateFormat.js';
import { LocalInput, LocalTextarea } from '../form/LocalField.jsx';
import FileUploadField from './FileUploadField.jsx';
import DepositPicker from './DepositPicker.jsx';
import WalletPicker from './WalletPicker.jsx';
import DateField from '../DateField.jsx';
// Phase 14.10-bis (2026-04-26) — SalePrintView wired into SaleTab so
// every row can generate the same A4 receipt that QuotationTab already
// shows for converted sales. User directive: "ทุกรายการ ต้อง Gen ใบเสร็จ
// ได้ แบบเดียวกันกับ tab=quotations".
import SalePrintView from './SalePrintView.jsx';

const PAYMENT_CHANNELS = ['เงินสด', 'โอนธนาคาร', 'บัตรเครดิต', 'QR Payment', 'อื่นๆ'].map(n => ({ id: n, name: n }));
const PAYMENT_STATUSES = [
  { value: 'paid', label: 'ชำระแล้ว', color: 'emerald' },
  { value: 'split', label: 'แบ่งชำระ', color: 'sky' },
  { value: 'unpaid', label: 'ค้างชำระ', color: 'amber' },
  { value: 'deferred', label: 'ชำระภายหลัง', color: 'purple' },
  { value: 'draft', label: 'แบบร่าง', color: 'gray' },
  { value: 'cancelled', label: 'ยกเลิก', color: 'red' },
];

/** Resolve the display status for a sale row. Cancelled is top-level
 *  (sale.status), so it beats payment.status in the label. */
function resolveSaleStatus(sale) {
  if (sale?.status === 'cancelled') {
    return PAYMENT_STATUSES.find(s => s.value === 'cancelled');
  }
  return PAYMENT_STATUSES.find(s => s.value === sale?.payment?.status)
    || PAYMENT_STATUSES.find(s => s.value === 'draft');
}
const fmtDate = fmtThaiDate;
// DatePickerField removed — shared `DateField` (../DateField.jsx) imported below
// now drives all three sale/payment date inputs. Styling is identical to the
// old local component (same default bg/border/padding), so no visual drift.
function fmtMoney(n) { return n != null ? Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '0.00'; }
const clean = (o) => JSON.parse(JSON.stringify(o));

export default function SaleTab({ clinicSettings, theme, initialCustomer, onCustomerUsed, onFormClose }) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // Phase 14.7.H follow-up A — branch-aware sale writes.
  const { branchId: BRANCH_ID } = useSelectedBranch();
  const inputCls = `w-full rounded-lg px-3 py-2 text-xs outline-none border transition-all ${isDark ? 'bg-[var(--bg-surface)] border-[var(--bd)] text-[var(--tx-primary)] focus:border-rose-500' : 'bg-white border-gray-200 text-gray-800 focus:border-rose-400'}`;
  const labelCls = 'text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block';

  // ── List state ──
  const [sales, setSales] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // ── Detail / Cancel / Payment modals ──
  const [viewingSale, setViewingSale] = useState(null);
  const [printingSale, setPrintingSale] = useState(null); // Phase 14.10-bis (2026-04-26) — receipt-print modal
  const [cancelModal, setCancelModal] = useState(null); // { sale }
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefundMethod, setCancelRefundMethod] = useState('เงินสด');
  const [cancelRefundAmount, setCancelRefundAmount] = useState('');
  const [cancelEvidenceUrl, setCancelEvidenceUrl] = useState('');
  const [cancelEvidencePath, setCancelEvidencePath] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelAnalysis, setCancelAnalysis] = useState(null); // { unused, partiallyUsed, fullyUsed, productsList, medsList, depositApplied, walletApplied, pointsEarned }
  const [cancelAlsoRemoveUsed, setCancelAlsoRemoveUsed] = useState(false);
  const [cancelAnalysisLoading, setCancelAnalysisLoading] = useState(false);
  const [payModal, setPayModal] = useState(null); // { sale }
  const [payMethod, setPayMethod] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => thaiTodayISO());
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
  const [saleDate, setSaleDate] = useState(() => thaiTodayISO());
  const [saleNote, setSaleNote] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [paymentEvidenceUrl, setPaymentEvidenceUrl] = useState('');
  const [paymentEvidencePath, setPaymentEvidencePath] = useState('');
  const [purchasedItems, setPurchasedItems] = useState([]);
  const [medications, setMedications] = useState([]);
  const [billDiscount, setBillDiscount] = useState('');
  const [billDiscountType, setBillDiscountType] = useState('amount');
  const [couponCode, setCouponCode] = useState('');
  const [couponInfo, setCouponInfo] = useState(null);        // { id, discount, discount_type, ... } on successful lookup
  const [couponLookupError, setCouponLookupError] = useState('');
  const [couponLookingUp, setCouponLookingUp] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paymentDate, setPaymentDate] = useState(() => thaiTodayISO());
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

  // Deposit selection — [{ depositId, amount }]
  const [selectedDeposits, setSelectedDeposits] = useState([]);
  const [depositReloadKey, setDepositReloadKey] = useState(0);
  // Wallet selection — { walletTypeId, amount, walletTypeName } | null
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [walletReloadKey, setWalletReloadKey] = useState(0);
  // Active membership for this customer (loaded on customer select)
  const [activeMembership, setActiveMembership] = useState(null);

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
  const [medProducts, setMedProducts] = useState([]);
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [medModalQuery, setMedModalQuery] = useState('');
  const [medModalSelected, setMedModalSelected] = useState(null);
  const [medModalQty, setMedModalQty] = useState('1');
  const [medModalDosage, setMedModalDosage] = useState('');
  const [medModalUnit, setMedModalUnit] = useState('เม็ด');
  const [medEditIdx, setMedEditIdx] = useState(-1);
  const [medModalPremium, setMedModalPremium] = useState(false);

  // ── Load sales list ──
  const loadSales = useCallback(async () => {
    setListLoading(true);
    try { setSales(await getAllSales()); } catch { setSales([]); }
    finally { setListLoading(false); }
  }, []);
  useEffect(() => { loadSales(); }, [loadSales]);

  // ── Eager-load seller lookup on mount (V22 fix 2026-04-27) ──
  // Before the fix, sellers[] only loaded inside `loadOptions` (called from
  // openCreate / openEdit / initialCustomer-driven openCreate). View modal +
  // PDF print opened BEFORE any of those fired → sellersLookup empty →
  // resolveSellerName fell back to s.id which leaked the numeric ProClinic
  // staff_id (e.g. "614") into the UI. Loading the seller list eagerly is
  // ~1 small fetch (listAllSellers reads be_staff + be_doctors); cheap
  // enough to do on tab mount so every render path gets a populated lookup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listAllSellers();
        if (!cancelled && Array.isArray(list)) setSellers(list);
      } catch (e) {
        // Non-fatal: subsequent loadOptions still re-fetches when form opens.
        console.warn('[SaleTab] eager listAllSellers failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load cancel analysis (courses + money + stock) whenever the cancel modal opens
  useEffect(() => {
    if (!cancelModal) { setCancelAnalysis(null); setCancelAlsoRemoveUsed(false); return; }
    let cancelled = false;
    const saleId = cancelModal.saleId || cancelModal.id;
    setCancelAnalysisLoading(true);
    (async () => {
      try {
        const [a, stk] = await Promise.all([
          analyzeSaleCancel(saleId).catch(() => null),
          analyzeStockImpact({ saleId }).catch(() => null),
        ]);
        if (!cancelled) setCancelAnalysis(a ? { ...a, stockImpact: stk } : (stk ? { stockImpact: stk } : null));
      } catch (e) {
        console.warn('[SaleTab] analyzeSaleCancel/Stock failed:', e);
        if (!cancelled) setCancelAnalysis(null);
      } finally { if (!cancelled) setCancelAnalysisLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [cancelModal]);

  // Load active membership + apply to billing (auto-discount)
  useEffect(() => {
    if (!customerId) { setActiveMembership(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const m = await getCustomerMembership(customerId);
        if (!cancelled) setActiveMembership(m || null);
      } catch (e) {
        if (!cancelled) setActiveMembership(null);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  // Auto-open form when initialCustomer is provided (from CustomerDetailView)
  useEffect(() => {
    if (initialCustomer) {
      loadOptions();
      setEditingSale(null);
      setCustomerId(initialCustomer.proClinicId || initialCustomer.id || '');
      setCustomerName(`${initialCustomer.patientData?.prefix || ''} ${initialCustomer.patientData?.firstName || ''} ${initialCustomer.patientData?.lastName || ''}`.trim());
      setCustomerHN(initialCustomer.proClinicHN || '');
      setSaleDate(thaiTodayISO());
      setSaleNote(''); setPurchasedItems([]); setMedications([]);
      setBillDiscount(''); setBillDiscountType('amount');
      setPaymentStatus('paid'); setPaymentDate(thaiTodayISO()); setPaymentTime(''); setRefNo('');
      setPmChannels([{ enabled: true, method: '', amount: '' }, { enabled: false, method: '', amount: '' }, { enabled: false, method: '', amount: '' }]);
      setPmSellers([...Array(5)].map(() => ({ enabled: false, id: '', name: '', percent: '0', total: '' })));
      setSelectedDeposits([]); setDepositReloadKey(k => k + 1);
    setSelectedWallet(null); setWalletReloadKey(k => k + 1);
      setError(''); setSuccess(false); setFormOpen(true);
      if (onCustomerUsed) onCustomerUsed();
    }
  }, [initialCustomer]);

  // ── Billing calc ──
  const billing = useMemo(() => {
    let subtotal = 0;
    purchasedItems.forEach(p => { subtotal += (parseFloat(p.unitPrice) || 0) * (parseInt(p.qty) || 1); });
    medications.forEach(m => { if (m.name) subtotal += (parseFloat(m.unitPrice) || 0) * (parseInt(m.qty) || 1); });
    const disc = billDiscountType === 'percent' ? subtotal * (parseFloat(billDiscount) || 0) / 100 : (parseFloat(billDiscount) || 0);
    const afterDiscount = Math.max(0, subtotal - disc);
    const memPercent = Number(activeMembership?.discountPercent) || 0;
    const membershipDiscount = afterDiscount * memPercent / 100;
    const afterMembership = Math.max(0, afterDiscount - membershipDiscount);
    const depositApplied = selectedDeposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const afterDeposit = Math.max(0, afterMembership - depositApplied);
    const walletApplied = Math.min(Number(selectedWallet?.amount) || 0, afterDeposit);
    const netTotal = Math.max(0, afterDeposit - walletApplied);
    return { subtotal, discount: disc, afterDiscount, membershipDiscount, membershipDiscountPercent: memPercent, afterMembership, depositApplied, walletApplied, netTotal };
  }, [purchasedItems, medications, billDiscount, billDiscountType, selectedDeposits, selectedWallet, activeMembership]);

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
  // Phase 14.10-tris (2026-04-26) — sellers loaded from be_staff +
  // be_doctors via unified listAllSellers helper (Rule of 3: same logic
  // shared with QuotationTab + every other backend tab).
  // Med products: still loaded from master_data here pending be_products
  // migration of the medication-flag (isTakeaway/isMedication discriminator).
  const loadOptions = useCallback(async () => {
    if (customers.length && sellers.length) return;
    const [c, sellerList, p] = await Promise.all([
      getAllCustomers(),
      listAllSellers(),
      listProducts(),
    ]);
    setCustomers(c);
    setSellers(sellerList);
    setMedProducts(p.map(x => ({ id: x.id, name: x.name, price: x.price, unit: x.unit, category: x.category, type: x.type })));
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
      let items, cats;
      if (type === 'promotion') {
        // Read OUR promotions from be_promotions (not master_data) so the
        // CRUD'd + migrated promotions are visible here. Filter to active
        // ones only so "พักใช้งาน" don't show in buy modal.
        const all = await listPromotions();
        items = all
          .filter(p => (p.status || 'active') === 'active')
          .map(p => ({
            id: p.promotionId || p.id,
            name: p.promotion_name || '',
            price: p.sale_price || 0,
            category: p.category_name || '',
            itemType: 'promotion',
            cover_image: p.cover_image || '',
            courses: p.courses || [],
            products: p.products || [],
          }));
      } else if (type === 'product') {
        const all = await listProducts();
        items = all.filter(p => p.type === 'สินค้าหน้าร้าน').map(p => ({ id: p.id, name: p.name, price: p.price, unit: p.unit, category: p.category, itemType: 'product' }));
      } else {
        // 'course'
        const all = await listCourses();
        // Phase 12.2b follow-up (2026-04-25): preserve courseType +
        // daysBeforeExpire + period + unit so the full buy chain carries
        // the validity window through to assignCourseToCustomer. Prior
        // whitelist silently dropped these fields → expiry='' on every
        // customer.courses entry ("เหมือนไม่มีวันหมดอายุ" bug). Accept
        // both camelCase (be_courses) + snake_case (legacy master_data).
        //
        // Skip "shadow" courses — ProClinic sync emits archive/template
        // copies alongside each real course (same name, different id,
        // empty courseType, null price). User-reported 2026-04-25:
        // "ราคา 0 มาจากไหน / ทำไมคอร์สซ้ำมันเยอะจัง". ProClinic's own buy
        // modal hides them; we mirror that rule.
        items = all
          .filter(c => {
            const ct = c.courseType || c.course_type || '';
            const price = c.price != null ? Number(c.price) : (c.salePrice != null ? Number(c.salePrice) : null);
            // Real courses always have BOTH a courseType AND a positive price
            return !!ct && price != null && price > 0;
          })
          .map(c => ({
            id: c.id, name: c.name, price: c.price, category: c.category,
            unit: c.unit || '',
            itemType: 'course',
            products: c.products,
            courseType: c.courseType || c.course_type || '',
            daysBeforeExpire: c.daysBeforeExpire != null ? c.daysBeforeExpire
              : (c.days_before_expire != null ? c.days_before_expire : null),
            period: c.period != null ? c.period : null,
          }));
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
      // Keep products/courses for auto-assign after sale
      products: i.products || [], courses: i.courses || [],
      // Phase 12.2b follow-up (2026-04-25): preserve courseType +
      // validity window so assignCourseToCustomer can stamp the
      // correct expiry on customer.courses. Previously dropped here →
      // buffet/specific-qty stored blank expiry.
      courseType: i.courseType || '',
      daysBeforeExpire: i.daysBeforeExpire != null ? i.daysBeforeExpire : null,
      period: i.period != null ? i.period : null,
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
    setSaleDate(thaiTodayISO());
    setSaleNote(''); setPurchasedItems([]); setMedications([]);
    setBillDiscount(''); setBillDiscountType('amount');
    setPaymentStatus('paid'); setPaymentDate(thaiTodayISO()); setPaymentTime(''); setRefNo('');
    setPmChannels([{ enabled: true, method: '', amount: '' }, { enabled: false, method: '', amount: '' }, { enabled: false, method: '', amount: '' }]);
    setPmSellers([...Array(5)].map(() => ({ enabled: false, id: '', name: '', percent: '0', total: '' })));
    setSelectedDeposits([]); setDepositReloadKey(k => k + 1);
    setSelectedWallet(null); setWalletReloadKey(k => k + 1);
    setError(''); setSuccess(false); setFormOpen(true);
  };

  const openEdit = (sale) => {
    loadOptions();
    setEditingSale(sale);
    setCustomerId(sale.customerId || ''); setCustomerName(sale.customerName || ''); setCustomerHN(sale.customerHN || '');
    setSaleDate(sale.saleDate || ''); setSaleNote(sale.saleNote || '');
    setPaymentNote(sale.payment?.note || ''); setCouponCode(sale.couponCode || ''); setAppointmentId(sale.appointmentId || '');
    setPaymentEvidenceUrl(sale.payment?.evidenceUrl || ''); setPaymentEvidencePath(sale.payment?.evidencePath || '');
    setPurchasedItems(sale.items ? [...(sale.items.promotions||[]), ...(sale.items.courses||[]), ...(sale.items.products||[])] : []);
    setMedications(sale.items?.medications || []);
    setBillDiscount(String(sale.billing?.billDiscount || '')); setBillDiscountType(sale.billing?.discountType || 'amount');
    setPaymentStatus(sale.payment?.status || 'paid');
    setPaymentDate(sale.payment?.date || ''); setPaymentTime(sale.payment?.time || ''); setRefNo(sale.payment?.refNo || '');
    setPmChannels(sale.payment?.channels?.length ? sale.payment.channels.concat([...Array(3)].map(() => ({ enabled: false, method: '', amount: '' }))).slice(0, 3)
      : [{ enabled: true, method: '', amount: '' }, { enabled: false, method: '', amount: '' }, { enabled: false, method: '', amount: '' }]);
    setPmSellers(sale.sellers?.length ? sale.sellers.map(s => ({ ...s, enabled: true })).concat([...Array(5)].map(() => ({ enabled: false, id: '', name: '', percent: '0', total: '' }))).slice(0, 5)
      : [...Array(5)].map(() => ({ enabled: false, id: '', name: '', percent: '0', total: '' })));
    // Restore deposit selection from existing sale
    const existingDeps = Array.isArray(sale.billing?.depositIds) ? sale.billing.depositIds : [];
    setSelectedDeposits(existingDeps.map(d => ({ depositId: d.depositId, amount: Number(d.amount) || 0 })));
    setDepositReloadKey(k => k + 1);
    // Restore wallet selection from existing sale
    if (sale.billing?.walletTypeId && Number(sale.billing?.walletApplied) > 0) {
      setSelectedWallet({
        walletTypeId: sale.billing.walletTypeId,
        walletTypeName: sale.billing.walletTypeName || '',
        amount: Number(sale.billing.walletApplied) || 0,
      });
    } else {
      setSelectedWallet(null);
    }
    setWalletReloadKey(k => k + 1);
    setError(''); setSuccess(false); setFormOpen(true);
  };

  const scrollToError = (fieldAttr, msg) => {
    setError(msg);
    setTimeout(() => {
      const el = document.querySelector(`[data-field="${fieldAttr}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-2', 'ring-red-500'); setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 3000); }
    }, 50);
  };

  // ── Save ──
  const handleSave = async () => {
    if (!customerId) { scrollToError('saleCustomer', 'กรุณาเลือกลูกค้า'); return; }
    if (!saleDate) { scrollToError('saleDate', 'กรุณาเลือกวันที่ขาย'); return; }
    if (!pmSellers.some(s => s.enabled && s.id)) { scrollToError('saleSellers', 'กรุณาเลือกพนักงานขาย'); return; }
    if (paymentStatus === 'paid' || paymentStatus === 'split') {
      if (!pmChannels.some(c => c.enabled && c.method)) { scrollToError('salePayment', 'กรุณาเลือกช่องทางชำระเงิน'); return; }
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
      const depositIdsPayload = selectedDeposits
        .filter(d => d.depositId && (Number(d.amount) || 0) > 0)
        .map(d => ({ depositId: d.depositId, amount: Number(d.amount) || 0 }));
      const walletApplied = Number(billing.walletApplied) || 0;
      const walletTypeIdPayload = selectedWallet?.walletTypeId && walletApplied > 0 ? String(selectedWallet.walletTypeId) : '';
      const walletTypeNamePayload = walletTypeIdPayload ? (selectedWallet.walletTypeName || '') : '';
      const firstSeller = pmSellers.find(s => s.enabled && s.id);
      // V33-customer-create — snapshot customer's receipt config onto the sale
      // so SalePrintView renders the right name/tax-id/address (personal vs
      // company vs inherit). Frozen at create time per accounting standards.
      const { resolveCustomerReceiptInfo } = await import('../../lib/customerReceiptInfo.js');
      const currentCustomerDoc = customers.find(c => String(c.proClinicId || c.id) === String(customerId)) || null;
      const receiptInfoSnapshot = resolveCustomerReceiptInfo(currentCustomerDoc);

      const data = clean({
        customerId, customerName, customerHN, saleDate, saleNote,
        couponCode: couponCode || null,
        appointmentId: appointmentId || null,
        items: grouped,
        receiptInfo: receiptInfoSnapshot,
        billing: {
          subtotal: billing.subtotal,
          billDiscount: billing.discount,
          discountType: billDiscountType,
          membershipDiscount: billing.membershipDiscount,
          membershipDiscountPercent: billing.membershipDiscountPercent,
          depositApplied: billing.depositApplied,
          depositIds: depositIdsPayload,
          walletApplied,
          walletTypeId: walletTypeIdPayload,
          walletTypeName: walletTypeNamePayload,
          netTotal: billing.netTotal,
        },
        membershipId: activeMembership?.membershipId || null,
        payment: { status: paymentStatus, channels: pmChannels.filter(c => c.enabled), date: paymentDate, time: paymentTime, refNo, note: paymentNote || '', evidenceUrl: paymentEvidenceUrl || null, evidencePath: paymentEvidencePath || null },
        sellers: pmSellers.filter(s => s.enabled).map(s => ({ id: s.id, name: s.name, percent: s.percent, total: s.total })),
      });
      let newSaleId;
      const oldDeps = editingSale ? (Array.isArray(editingSale.billing?.depositIds) ? editingSale.billing.depositIds : []) : [];
      const oldWalletTypeId = editingSale?.billing?.walletTypeId || '';
      const oldWalletApplied = Number(editingSale?.billing?.walletApplied) || 0;
      const oldNetTotal = Number(editingSale?.billing?.netTotal) || 0;
      const oldBahtPerPoint = Number(editingSale?.bahtPerPointSnapshot) || 0;
      if (editingSale) {
        const saleId = editingSale.saleId || editingSale.id;
        newSaleId = saleId;
        // STEP 0 — Reverse OLD stock deductions (idempotent, must succeed). Runs
        // BEFORE money/points reverses so that on mid-saga failure we haven't lost
        // the ability to identify old stock (linkedSaleId still binds the movements).
        await reverseStockForSale(saleId, { user: { userId: firstSeller?.id || '', userName: firstSeller?.name || '' } });

        // Reverse previously-applied deposits before re-applying
        for (const od of oldDeps) {
          try { await reverseDepositUsage(od.depositId, saleId); }
          catch (e) { console.warn('[SaleTab] reverse old deposit failed:', e); }
        }
        // Refund previously-deducted wallet (if any)
        if (oldWalletTypeId && oldWalletApplied > 0) {
          try {
            await refundToWallet(customerId, oldWalletTypeId, {
              amount: oldWalletApplied,
              walletTypeName: editingSale.billing?.walletTypeName || '',
              note: `แก้ไขใบเสร็จ ${saleId} — คืนยอด wallet เดิม`,
              referenceType: 'sale', referenceId: saleId,
            });
          } catch (e) { console.warn('[SaleTab] wallet refund (edit) failed:', e); }
        }
        // Reverse previously-earned points
        try { await reversePointsEarned(customerId, saleId); }
        catch (e) { console.warn('[SaleTab] points reverse (edit) failed:', e); }

        await updateBackendSale(saleId, data);

        // STEP 5b — Deduct NEW stock. Hard error on failure: by now old stock+money
        // are reversed and sale doc has new items. We roll back any partial new
        // deductions via reverseStockForSale (idempotent) and re-throw so the user
        // sees the actual cause. They can cancel the sale and recreate.
        // Bug fix 2026-04-19: flatten promotion's standalone products[] into
        // products[] before deduction — otherwise _normalizeStockItems would
        // skip them entirely and inventory drifts on every promo sale.
        try {
          await deductStockForSale(saleId, flattenPromotionsForStockDeduction(data.items), {
            branchId: BRANCH_ID, customerId,
            user: { userId: firstSeller?.id || '', userName: firstSeller?.name || '' },
          });
        } catch (stockErr) {
          try { await reverseStockForSale(saleId); } catch {}
          throw new Error(`ตัดสต็อก (แก้ไข) ไม่สำเร็จ: ${stockErr.message}`);
        }

        // Apply new deposits
        for (const nd of depositIdsPayload) {
          try { await applyDepositToSale(nd.depositId, saleId, nd.amount); }
          catch (e) { console.warn('[SaleTab] apply deposit failed:', e); throw new Error(`หักมัดจำ ${nd.depositId} ไม่สำเร็จ: ${e.message}`); }
        }
        // Deduct new wallet
        if (walletTypeIdPayload && walletApplied > 0) {
          try {
            await deductWallet(customerId, walletTypeIdPayload, {
              amount: walletApplied,
              walletTypeName: walletTypeNamePayload,
              note: `แก้ไขใบเสร็จ ${saleId}`,
              referenceType: 'sale', referenceId: saleId,
              staffId: firstSeller?.id || '', staffName: firstSeller?.name || '',
            });
          } catch (e) { console.warn('[SaleTab] wallet deduct (edit) failed:', e); throw new Error(`หัก wallet ไม่สำเร็จ: ${e.message}`); }
        }
      } else {
        const createRes = await createBackendSale(data);
        newSaleId = createRes.saleId;

        // STEP 1b — Deduct stock right after sale creation. On failure, delete the
        // just-created sale so there's nothing dangling. Fail fast BEFORE any
        // deposits/wallet/courses/points are committed.
        // Bug fix 2026-04-19: flatten promotion.products[] into products[]
        // before deduction (see flattenPromotionsForStockDeduction docstring).
        try {
          await deductStockForSale(newSaleId, flattenPromotionsForStockDeduction(data.items), {
            branchId: BRANCH_ID, customerId,
            user: { userId: firstSeller?.id || '', userName: firstSeller?.name || '' },
          });
        } catch (stockErr) {
          try { await deleteBackendSale(newSaleId); } catch {}
          throw new Error(`ตัดสต็อกไม่สำเร็จ: ${stockErr.message}`);
        }

        // Apply deposits
        for (const nd of depositIdsPayload) {
          try { await applyDepositToSale(nd.depositId, newSaleId, nd.amount); }
          catch (e) { console.warn('[SaleTab] apply deposit failed:', e); throw new Error(`หักมัดจำ ${nd.depositId} ไม่สำเร็จ: ${e.message}`); }
        }
        // Deduct wallet
        if (walletTypeIdPayload && walletApplied > 0) {
          try {
            await deductWallet(customerId, walletTypeIdPayload, {
              amount: walletApplied,
              walletTypeName: walletTypeNamePayload,
              note: `หัก wallet จากใบเสร็จ ${newSaleId}`,
              referenceType: 'sale', referenceId: newSaleId,
              staffId: firstSeller?.id || '', staffName: firstSeller?.name || '',
            });
          } catch (e) { console.warn('[SaleTab] wallet deduct failed:', e); throw new Error(`หัก wallet ไม่สำเร็จ: ${e.message}`); }
        }
        // Auto-assign purchased courses + promotions to customer
        // Key: purchased qty (user-entered) multiplies master product qty.
        // Tag each assignment with `linkedSaleId` so cancel/delete can reverse it.
        if (customerId) {
          for (const course of grouped.courses) {
            try {
              const purchasedQty = Number(course.qty) || 1; // qty user bought (e.g. 10)
              const prods = course.products?.length
                ? course.products.map(p => ({ ...p, qty: (Number(p.qty) || 1) * purchasedQty }))
                : [{ name: course.name, qty: purchasedQty, unit: course.unit || 'ครั้ง' }];
              // Phase 12.2b Step 7 follow-up (2026-04-24): carry
              // courseType so assignCourseToCustomer can apply the
              // one-shot qty override for "เหมาตามจริง" (single
              // treatment consumes the whole course → moves to history).
              await assignCourseToCustomer(customerId, {
                name: course.name, products: prods, price: course.unitPrice,
                source: 'sale', parentName: `คอร์ส: ${course.name}`,
                linkedSaleId: newSaleId,
                courseType: course.courseType || '',
                daysBeforeExpire: course.daysBeforeExpire ?? null,
              });
            } catch (e) { console.warn('[SaleTab] assign course failed:', e); }
          }
          for (const promo of grouped.promotions) {
            try {
              const purchasedQty = Number(promo.qty) || 1;
              if (promo.courses?.length) {
                for (const sub of promo.courses) {
                  const subProds = sub.products?.length
                    ? sub.products.map(p => ({ ...p, qty: (Number(p.qty) || 1) * purchasedQty }))
                    : [{ name: sub.name || promo.name, qty: purchasedQty, unit: sub.unit || 'ครั้ง' }];
                  await assignCourseToCustomer(customerId, { name: sub.name || promo.name, products: subProds, source: 'sale', parentName: `โปรโมชัน: ${promo.name}`, linkedSaleId: newSaleId });
                }
              } else if (promo.products?.length) {
                const prods = promo.products.map(p => ({ ...p, qty: (Number(p.qty) || 1) * purchasedQty }));
                await assignCourseToCustomer(customerId, { name: promo.name, products: prods, price: promo.unitPrice, source: 'sale', parentName: `โปรโมชัน: ${promo.name}`, linkedSaleId: newSaleId });
              } else {
                await assignCourseToCustomer(customerId, { name: promo.name, products: [{ name: promo.name, qty: purchasedQty, unit: 'โปรโมชัน' }], price: promo.unitPrice, source: 'sale', parentName: `โปรโมชัน: ${promo.name}`, linkedSaleId: newSaleId });
              }
            } catch (e) { console.warn('[SaleTab] assign promotion failed:', e); }
          }
        }
      }
      // Earn loyalty points if customer has a membership with bahtPerPoint > 0
      const bpp = Number(activeMembership?.bahtPerPoint) || 0;
      if (bpp > 0 && billing.netTotal > 0) {
        try {
          await earnPoints(customerId, {
            purchaseAmount: billing.netTotal,
            bahtPerPoint: bpp,
            referenceType: 'sale',
            referenceId: newSaleId,
            note: `สะสมจากใบเสร็จ ${newSaleId}`,
            staffId: firstSeller?.id || '', staffName: firstSeller?.name || '',
          });
        } catch (e) { console.warn('[SaleTab] earnPoints failed:', e); }
      }
      setSuccess(true);
      setTimeout(() => {
        setFormOpen(false); setSuccess(false); loadSales();
        setDepositReloadKey(k => k + 1);
        setWalletReloadKey(k => k + 1);
      }, 800);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (sale) => {
    const saleId = sale.saleId || sale.id;
    const cid = sale.customerId;
    // Analyze before confirm so we can warn about used courses / products / meds.
    let analysis = null;
    try { analysis = await analyzeSaleCancel(saleId); }
    catch (e) { console.warn('[SaleTab] analyzeSaleCancel (delete) failed:', e); }
    const warnings = [];
    let stockImpact = null;
    try { stockImpact = await analyzeStockImpact({ saleId }); }
    catch (e) { console.warn('[SaleTab] analyzeStockImpact (delete) failed:', e); }
    if (analysis) {
      if (analysis.unused.length > 0) warnings.push(`• ${analysis.unused.length} คอร์สที่ยังไม่ใช้ — จะถูกถอดออก`);
      if (analysis.partiallyUsed.length > 0) warnings.push(`• ⚠ ${analysis.partiallyUsed.length} คอร์สใช้ไปแล้วบางส่วน — จะถูกเก็บไว้ (ประวัติไม่ถูกทำลาย)`);
      if (analysis.fullyUsed.length > 0) warnings.push(`• ⚠ ${analysis.fullyUsed.length} คอร์สใช้หมดแล้ว — จะถูกเก็บไว้`);
      if (analysis.depositApplied > 0) warnings.push(`• มัดจำ ฿${fmtMoney(analysis.depositApplied)} จะถูกคืน`);
      if (analysis.walletApplied > 0) warnings.push(`• Wallet ฿${fmtMoney(analysis.walletApplied)} จะถูกคืน`);
      if (analysis.pointsEarned > 0) warnings.push(`• คะแนน ${analysis.pointsEarned} จะถูกคืน`);
    }
    if (stockImpact && stockImpact.totalQtyToRestore > 0) {
      warnings.push(`• สินค้า/ยา ${stockImpact.batchesAffected.length} lot (${stockImpact.totalQtyToRestore} หน่วย) จะถูกคืนเข้า stock อัตโนมัติ`);
      if (!stockImpact.canReverseFully) {
        warnings.push(`• ⚠ Stock บาง lot คืนไม่ครบ: ${stockImpact.warnings.slice(0, 3).join('; ')}`);
      }
    }
    const msg = `ต้องการลบใบเสร็จ ${saleId}?${warnings.length ? '\n\n' + warnings.join('\n') : ''}\n\nการลบจะเก็บประวัติไว้บน Firestore ไม่ได้`;
    if (!confirm(msg)) return;
    // Reverse applied deposits
    const deps = Array.isArray(sale.billing?.depositIds) ? sale.billing.depositIds : [];
    for (const d of deps) {
      try { await reverseDepositUsage(d.depositId, saleId); }
      catch (e) { console.warn('[SaleTab] reverse deposit on delete failed:', e); }
    }
    // Refund wallet
    if (sale.billing?.walletTypeId && Number(sale.billing?.walletApplied) > 0) {
      try {
        await refundToWallet(cid, sale.billing.walletTypeId, {
          amount: Number(sale.billing.walletApplied),
          walletTypeName: sale.billing.walletTypeName || '',
          note: `ลบใบเสร็จ ${saleId} — คืนยอด wallet`,
          referenceType: 'sale', referenceId: saleId,
        });
      } catch (e) { console.warn('[SaleTab] wallet refund on delete failed:', e); }
    }
    // Reverse earned points
    try { await reversePointsEarned(cid, saleId); }
    catch (e) { console.warn('[SaleTab] points reverse on delete failed:', e); }
    // Remove unused linked courses (keep used ones so history stays intact)
    try { await removeLinkedSaleCourses(saleId, { removeUsed: false }); }
    catch (e) { console.warn('[SaleTab] remove linked courses on delete failed:', e); }
    // Restore stock — idempotent, hard error if unexpected failure (abort delete)
    try { await reverseStockForSale(saleId); }
    catch (e) {
      console.error('[SaleTab] reverseStockForSale (delete) failed:', e);
      alert(`คืนสต็อกล้มเหลว: ${e.message}\nยกเลิกการลบใบเสร็จ`);
      return;
    }
    // Phase 15.6 / Issue 5 (2026-04-28) — wrap delete + reload in try/catch.
    // Test sales (TEST-SALE-DEFAULT-*, TEST-SALE-*) sometimes have malformed
    // shapes (missing customerId, no real treatments). Without this guard,
    // a deleteDoc throw or a loadSales error in the listener bubbles up to
    // the React error boundary → black screen. V31 anti-pattern lock: surface
    // a friendly Thai error in setError instead of swallowing silently.
    try {
      await deleteBackendSale(saleId);
      loadSales();
    } catch (e) {
      console.error('[SaleTab] handleDelete final commit failed:', e);
      setError(`ลบใบขายไม่สำเร็จ — เอกสารอาจมีโครงสร้างผิดปกติ (${e?.message || 'unknown error'})`);
    }
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
            <Plus size={16} /> ขาย
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
              ขาย ขายคอร์ส/โปรโมชัน/สินค้า พร้อมจัดการการชำระเงินและพนักงานขาย
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
              {[
                { step: '1', title: 'เลือกลูกค้า', desc: 'ค้นหาและเลือกจากรายชื่อที่ Clone มา' },
                { step: '2', title: 'เพิ่มสินค้า', desc: 'เลือกคอร์ส โปรโมชัน หรือสินค้า' },
                { step: '3', title: 'ชำระเงิน', desc: 'บันทึกช่องทางชำระและพนักงานขาย' },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--bd)]">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${isDark ? 'bg-rose-900/20 text-rose-400' : 'bg-rose-50 text-rose-700'}`}>{s.step}</span>
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
                  const st = resolveSaleStatus(sale);
                  return (
                    <tr
                      key={sale.saleId || sale.id || i}
                      onClick={() => setViewingSale(sale)}
                      className={`border-b border-[var(--bd)]/50 cursor-pointer hover:bg-violet-900/15 transition-colors ${i % 2 ? 'bg-[var(--bg-card)]/30' : ''}`}
                      title="คลิกเพื่อดูรายละเอียด"
                      data-testid={`saletab-row-${sale.saleId || sale.id || i}`}
                    >
                      <td className="px-3 py-2 font-mono text-[var(--tx-secondary)]">{sale.saleId || '-'}</td>
                      <td className="px-3 py-2 text-[var(--tx-heading)] font-medium">
                        {/* stopPropagation so opening the customer page in a
                            new tab doesn't ALSO trigger the row's detail modal */}
                        {sale.customerId ? (
                          <a
                            href={`/?backend=1&customer=${sale.customerId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-teal-400 hover:text-teal-300 hover:underline transition-colors"
                          >
                            {sale.customerName || '-'}
                          </a>
                        ) : (sale.customerName || '-')}
                        {sale.customerHN && <span className="text-[var(--tx-muted)] text-xs ml-1">{sale.customerHN}</span>}
                      </td>
                      <td className="px-3 py-2 text-[var(--tx-secondary)]">{fmtDate(sale.saleDate)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[var(--tx-heading)]">
                        {sale.source === 'exchange' ? <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isDark ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-50 text-sky-700'}`}>เปลี่ยนสินค้า</span>
                        : sale.source === 'share' ? <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isDark ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-700'}`}>แชร์คอร์ส</span>
                        : sale.source === 'treatment' ? <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isDark ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-700'}`}>จาก OPD</span>
                        : sale.source === 'addRemaining' ? <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>เพิ่มคงเหลือ</span>
                        : `${fmtMoney(sale.billing?.netTotal)} ฿`}
                      </td>
                      <td className="px-3 py-2"><span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${st.color === 'emerald' ? (isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700') : st.color === 'amber' ? (isDark ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-700') : st.color === 'red' ? (isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-700') : st.color === 'gray' ? (isDark ? 'bg-gray-900/30 text-gray-400' : 'bg-gray-100 text-gray-600') : st.color === 'purple' ? (isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-700') : (isDark ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-50 text-sky-700')}`}>{st.label}</span></td>
                      <td className="px-3 py-2">
                        {/* Action buttons MUST stopPropagation so they don't
                            also trigger the row-click detail modal. */}
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setViewingSale(sale)} className="p-2.5 rounded hover:bg-violet-900/20 text-violet-400" title="ดูรายละเอียด" aria-label="ดูรายละเอียด"><Eye size={13} /></button>
                          {/* Phase 14.10-bis (2026-04-26) — Print receipt button.
                              Renders SalePrintView modal — same A4 receipt as
                              QuotationTab uses for converted sales. Available
                              for every row regardless of payment status. */}
                          <button onClick={() => setPrintingSale(sale)}
                            className="p-2.5 rounded hover:bg-emerald-900/20 text-emerald-400"
                            title="พิมพ์ใบเสร็จ"
                            aria-label="พิมพ์ใบเสร็จ"
                            data-testid={`saletab-print-${sale.saleId || sale.id}`}>
                            <Printer size={13} />
                          </button>
                          <button onClick={() => openEdit(sale)} className="p-2.5 rounded hover:bg-sky-900/20 text-sky-400" title="แก้ไข" aria-label="แก้ไข"><Edit3 size={13} /></button>
                          {(sale.payment?.status === 'unpaid' || sale.payment?.status === 'split') && (
                            <button onClick={() => { setPayModal(sale); setPayMethod(''); setPayAmount(''); setPayDate(thaiTodayISO()); setPayRefNo(''); }}
                              className="p-2.5 rounded hover:bg-emerald-900/20 text-emerald-400" title="รับชำระเงิน" aria-label="รับชำระเงิน"><DollarSign size={13} /></button>
                          )}
                          {sale.status !== 'cancelled' && (
                            <button onClick={() => { setCancelModal(sale); setCancelReason(''); setCancelRefundMethod('เงินสด'); setCancelRefundAmount(String(sale.billing?.netTotal || 0)); }}
                              className="p-2.5 rounded hover:bg-red-900/20 text-red-400" title="ยกเลิก" aria-label="ยกเลิก"><X size={13} /></button>
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

      {/* Phase 14.10-bis (2026-04-26) — Sale receipt print modal.
          Same A4 SalePrintView as QuotationTab uses. Available for every
          sale row regardless of status, per user directive: "ทุกรายการ
          ต้อง Gen ใบเสร็จได้ แบบเดียวกันกับ tab=quotations". */}
      {printingSale && (
        <SalePrintView
          sale={printingSale}
          clinicSettings={clinicSettings}
          sellersLookup={sellers}
          onClose={() => setPrintingSale(null)}
        />
      )}

      {/* ═══ DETAIL VIEW MODAL ═══ */}
      {viewingSale && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title-view-sale" onClick={() => setViewingSale(null)} onKeyDown={e => { if (e.key === 'Escape') setViewingSale(null); }}>
          <div className={`w-full max-w-2xl mx-4 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b flex items-center justify-between sticky top-0 z-10 ${isDark ? 'border-[var(--bd)] bg-[var(--bg-surface)]' : 'border-gray-200 bg-white'}`}>
              <div>
                <h3 id="modal-title-view-sale" className="text-sm font-bold text-rose-400">{viewingSale.saleId}</h3>
                <p className="text-xs text-[var(--tx-muted)]">{viewingSale.customerName} | {fmtDate(viewingSale.saleDate)}</p>
              </div>
              <button onClick={() => setViewingSale(null)} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]" aria-label="ปิด"><X size={18} /></button>
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
                {viewingSale.billing?.membershipDiscount > 0 && (
                  <div className="flex justify-between"><span className="text-[var(--tx-muted)]">ส่วนลดสมาชิก ({viewingSale.billing.membershipDiscountPercent || 0}%)</span><span className="font-mono text-purple-400">-{fmtMoney(viewingSale.billing.membershipDiscount)} บาท</span></div>
                )}
                {viewingSale.billing?.depositApplied > 0 && (
                  <div className="flex justify-between"><span className="text-[var(--tx-muted)]">หักมัดจำ</span><span className="font-mono text-emerald-400">-{fmtMoney(viewingSale.billing.depositApplied)} บาท</span></div>
                )}
                {(viewingSale.billing?.depositIds || []).map((d, i) => (
                  <div key={i} className="flex justify-between text-[10px] text-[var(--tx-muted)] pl-3">
                    <span className="font-mono">· {d.depositId}</span>
                    <span className="font-mono">{fmtMoney(d.amount)} บาท</span>
                  </div>
                ))}
                {viewingSale.billing?.walletApplied > 0 && (
                  <div className="flex justify-between"><span className="text-[var(--tx-muted)]">หัก Wallet {viewingSale.billing.walletTypeName && `(${viewingSale.billing.walletTypeName})`}</span><span className="font-mono text-sky-400">-{fmtMoney(viewingSale.billing.walletApplied)} บาท</span></div>
                )}
                <div className="flex justify-between pt-1 border-t border-[var(--bd)] font-bold"><span>ยอดสุทธิ</span><span className="text-emerald-400 font-mono">{fmtMoney(viewingSale.billing?.netTotal)} บาท</span></div>
              </div>
              {/* Payment */}
              <div>
                <h4 className={labelCls}>การชำระเงิน — {resolveSaleStatus(viewingSale)?.label || viewingSale.payment?.status || '-'}</h4>
                {(viewingSale.payment?.channels||[]).filter(c=>c.enabled).map((ch,i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span>{ch.method || 'ไม่ระบุ'}</span><span className="font-mono">{fmtMoney(ch.amount)} บาท</span>
                  </div>
                ))}
                {viewingSale.payment?.refNo && <p className="text-[var(--tx-muted)] mt-1">Ref: {viewingSale.payment.refNo}</p>}
              </div>
              {/* Sellers
                  Phase 14.10-tris (2026-04-26) — fallback lookup against
                  loaded `sellers` state when saved record's `s.name` is
                  empty (legacy data where dropdown didn't capture name).
                  V22 follow-up (2026-04-27) — never leak numeric s.id.
                  Sellers list eagerly loaded on mount so the lookup path
                  always has data. resolveSellerName returns '' when
                  nothing resolves; UI shows "ไม่ระบุ" placeholder. */}
              {viewingSale.sellers?.length > 0 && (
                <div>
                  <h4 className={labelCls}>พนักงานขาย</h4>
                  {viewingSale.sellers.map((s, i) => {
                    const resolvedName = resolveSellerName(s, sellers);
                    return (
                      <div key={i} className="flex justify-between py-0.5">
                        <span>{resolvedName || 'ไม่ระบุ'}</span>
                        <span>{s.percent}%</span>
                      </div>
                    );
                  })}
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
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="modal-title-cancel-sale" onClick={() => setCancelModal(null)} onKeyDown={e => { if (e.key === 'Escape') setCancelModal(null); }}>
          <div className={`w-full max-w-lg mx-4 rounded-2xl shadow-2xl max-h-[88vh] overflow-y-auto ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b sticky top-0 z-10 ${isDark ? 'border-[var(--bd)] bg-[var(--bg-surface)]' : 'border-gray-200 bg-white'}`}>
              <h3 id="modal-title-cancel-sale" className="text-sm font-bold text-red-400">ยกเลิกใบเสร็จ {cancelModal.saleId}</h3>
              <p className="text-xs text-[var(--tx-muted)] mt-1">{cancelModal.customerName} · ยอดสุทธิ ฿{fmtMoney(cancelModal.billing?.netTotal)}</p>
            </div>
            <div className="p-5 space-y-3">
              {/* ══ Impact analysis ══ */}
              {cancelAnalysisLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--bd)]">
                  <Loader2 size={12} className="animate-spin text-[var(--tx-muted)]" />
                  <span className="text-xs text-[var(--tx-muted)]">กำลังวิเคราะห์ผลกระทบ...</span>
                </div>
              ) : cancelAnalysis && (
                <div className={`rounded-lg border p-3 space-y-2 ${isDark ? 'bg-orange-950/10 border-orange-900/40' : 'bg-orange-50 border-orange-200'}`}>
                  <div className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-orange-400' : 'text-orange-700'}`}>
                    <AlertCircle size={12} /> รายการที่จะได้รับผลกระทบ
                  </div>
                  {/* Financials to be auto-reversed */}
                  {(cancelAnalysis.depositApplied > 0 || cancelAnalysis.walletApplied > 0 || cancelAnalysis.pointsEarned > 0) && (
                    <div className={`text-xs space-y-0.5 pb-2 border-b ${isDark ? 'border-[var(--bd)]/60' : 'border-orange-200'}`}>
                      <div className="text-[10px] font-bold text-[var(--tx-muted)] uppercase">จะคืนให้ลูกค้าอัตโนมัติ</div>
                      {cancelAnalysis.depositApplied > 0 && <div>• มัดจำ <span className="font-mono text-emerald-400">฿{fmtMoney(cancelAnalysis.depositApplied)}</span></div>}
                      {cancelAnalysis.walletApplied > 0 && <div>• Wallet <span className="font-mono text-sky-400">฿{fmtMoney(cancelAnalysis.walletApplied)}</span></div>}
                      {cancelAnalysis.pointsEarned > 0 && <div>• คะแนนที่สะสมไป <span className="font-mono text-orange-400">{cancelAnalysis.pointsEarned}</span> คะแนน</div>}
                    </div>
                  )}
                  {/* Courses */}
                  {(cancelAnalysis.unused.length > 0 || cancelAnalysis.partiallyUsed.length > 0 || cancelAnalysis.fullyUsed.length > 0) && (
                    <div className="text-xs space-y-1">
                      <div className="text-[10px] font-bold text-[var(--tx-muted)] uppercase">คอร์ส/สินค้าที่ขายในใบนี้</div>
                      {cancelAnalysis.unused.length > 0 && (
                        <div>
                          <div className="text-emerald-400 font-bold">✓ ยังไม่ใช้ ({cancelAnalysis.unused.length} รายการ) — จะถูกถอดจากคอร์สคงเหลืออัตโนมัติ</div>
                          <div className="pl-4 text-[10px] text-[var(--tx-muted)]">
                            {cancelAnalysis.unused.slice(0, 5).map((c, i) => <div key={i}>• {c.product || c.name} ({c.qty})</div>)}
                            {cancelAnalysis.unused.length > 5 && <div>… และอีก {cancelAnalysis.unused.length - 5} รายการ</div>}
                          </div>
                        </div>
                      )}
                      {cancelAnalysis.partiallyUsed.length > 0 && (
                        <div>
                          <div className={isDark ? 'text-orange-400 font-bold' : 'text-orange-700 font-bold'}>⚠ ใช้ไปแล้วบางส่วน ({cancelAnalysis.partiallyUsed.length} รายการ)</div>
                          <div className="pl-4 text-[10px] text-[var(--tx-muted)]">
                            {cancelAnalysis.partiallyUsed.slice(0, 5).map((c, i) => <div key={i}>• {c.product || c.name} ({c.qty})</div>)}
                            {cancelAnalysis.partiallyUsed.length > 5 && <div>… และอีก {cancelAnalysis.partiallyUsed.length - 5} รายการ</div>}
                          </div>
                        </div>
                      )}
                      {cancelAnalysis.fullyUsed.length > 0 && (
                        <div>
                          <div className="text-red-400 font-bold">⚠ ใช้หมดแล้ว ({cancelAnalysis.fullyUsed.length} รายการ)</div>
                          <div className="pl-4 text-[10px] text-[var(--tx-muted)]">
                            {cancelAnalysis.fullyUsed.slice(0, 5).map((c, i) => <div key={i}>• {c.product || c.name} ({c.qty})</div>)}
                            {cancelAnalysis.fullyUsed.length > 5 && <div>… และอีก {cancelAnalysis.fullyUsed.length - 5} รายการ</div>}
                          </div>
                        </div>
                      )}
                      {(cancelAnalysis.partiallyUsed.length > 0 || cancelAnalysis.fullyUsed.length > 0) && (
                        <label className="flex items-start gap-2 mt-2 cursor-pointer">
                          <input type="checkbox" checked={cancelAlsoRemoveUsed} onChange={e => setCancelAlsoRemoveUsed(e.target.checked)} className="accent-red-500 mt-0.5" />
                          <span className="text-[11px] text-[var(--tx-secondary)]">
                            ลบคอร์สที่ใช้ไปแล้วด้วย (จะสูญเสียประวัติการใช้ — ไม่แนะนำ)
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                  {/* Physical goods — now auto-reversed via stock system (Phase 8b) */}
                  {cancelAnalysis.stockImpact && cancelAnalysis.stockImpact.totalQtyToRestore > 0 && (
                    <div className={`text-xs ${cancelAnalysis.stockImpact.canReverseFully ? 'text-emerald-400' : 'text-orange-400'}`}>
                      📦 <span className="font-bold">สต็อกจะถูกคืนอัตโนมัติ</span> — {cancelAnalysis.stockImpact.batchesAffected.length} lot, รวม {cancelAnalysis.stockImpact.totalQtyToRestore} หน่วย
                      <div className="pl-4 text-[10px] text-[var(--tx-muted)]">
                        {cancelAnalysis.stockImpact.batchesAffected.slice(0, 5).map((b, i) => (
                          <div key={i}>• {b.productName} — คืน {b.willRestore} หน่วย (lot {b.batchId.slice(-8)})</div>
                        ))}
                        {cancelAnalysis.stockImpact.batchesAffected.length > 5 && (
                          <div>… และอีก {cancelAnalysis.stockImpact.batchesAffected.length - 5} lot</div>
                        )}
                      </div>
                      {!cancelAnalysis.stockImpact.canReverseFully && (
                        <div className="pl-4 text-[10px] text-orange-300 mt-1">
                          ⚠ คืนไม่ครบบาง lot: {cancelAnalysis.stockImpact.warnings.slice(0, 2).join('; ')}
                        </div>
                      )}
                    </div>
                  )}
                  {cancelAnalysis.stockImpact && cancelAnalysis.stockImpact.totalQtyToRestore === 0 && (cancelAnalysis.productsCount > 0 || cancelAnalysis.medsCount > 0) && (
                    <div className="text-xs text-[var(--tx-muted)]">
                      ℹ สินค้า/ยาบางรายการไม่ได้ track stock (trackStock=false) — ไม่กระทบสต็อก
                    </div>
                  )}
                </div>
              )}

              <div><label className={labelCls}>เหตุผลการยกเลิก</label><LocalTextarea value={cancelReason} onCommit={setCancelReason} rows={2} className={`${inputCls} resize-none`} placeholder="ระบุเหตุผล..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>วิธีคืนเงิน</label>
                  <select value={cancelRefundMethod} onChange={e => setCancelRefundMethod(e.target.value)} className={inputCls}>
                    <option value="เงินสด">เงินสด</option><option value="โอนธนาคาร">โอนธนาคาร</option><option value="Wallet">Wallet</option><option value="ไม่คืนเงิน">ไม่คืนเงิน</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>เงินสดที่ต้องคืน (บาท)</label>
                  <LocalInput type="number" value={cancelRefundAmount} onCommit={setCancelRefundAmount} className={inputCls} />
                  <p className="text-[10px] text-[var(--tx-muted)] mt-0.5">ไม่รวมมัดจำ/Wallet ที่ระบบคืนให้อัตโนมัติ</p>
                </div>
              </div>
              <FileUploadField
                storagePath={`uploads/be_sales/${cancelModal.saleId}`}
                fieldName="cancelEvidence"
                label="แนบหลักฐานการยกเลิก"
                isDark={isDark}
                onUploadComplete={({ url, storagePath }) => { setCancelEvidenceUrl(url); setCancelEvidencePath(storagePath); }}
                onDelete={() => { setCancelEvidenceUrl(''); setCancelEvidencePath(''); }}
              />
            </div>
            <div className={`px-5 py-4 border-t flex justify-end gap-2 sticky bottom-0 ${isDark ? 'border-[var(--bd)] bg-[var(--bg-surface)]' : 'border-gray-200 bg-white'}`}>
              <button onClick={() => setCancelModal(null)} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ปิด</button>
              <button onClick={async () => {
                setCancelSaving(true);
                const saleId = cancelModal.saleId || cancelModal.id;
                const cid = cancelModal.customerId;
                // Reverse applied deposits so the customer can use them again
                const deps = Array.isArray(cancelModal.billing?.depositIds) ? cancelModal.billing.depositIds : [];
                for (const d of deps) {
                  try { await reverseDepositUsage(d.depositId, saleId); }
                  catch (e) { console.warn('[SaleTab] reverse deposit on cancel failed:', e); }
                }
                // Refund wallet
                if (cancelModal.billing?.walletTypeId && Number(cancelModal.billing?.walletApplied) > 0) {
                  try {
                    await refundToWallet(cid, cancelModal.billing.walletTypeId, {
                      amount: Number(cancelModal.billing.walletApplied),
                      walletTypeName: cancelModal.billing.walletTypeName || '',
                      note: `ยกเลิกใบเสร็จ ${saleId} — คืนยอด wallet`,
                      referenceType: 'sale', referenceId: saleId,
                    });
                  } catch (e) { console.warn('[SaleTab] wallet refund on cancel failed:', e); }
                }
                // Reverse earned points
                try { await reversePointsEarned(cid, saleId); }
                catch (e) { console.warn('[SaleTab] points reverse on cancel failed:', e); }
                // Remove linked courses from customer.courses (respect user's "also remove used" choice)
                try { await removeLinkedSaleCourses(saleId, { removeUsed: cancelAlsoRemoveUsed }); }
                catch (e) { console.warn('[SaleTab] remove linked courses on cancel failed:', e); }
                // Restore stock — hard error aborts the cancel flow
                try { await reverseStockForSale(saleId); }
                catch (e) {
                  console.error('[SaleTab] reverseStockForSale (cancel) failed:', e);
                  alert(`คืนสต็อกล้มเหลว: ${e.message}\nยกเลิกการทำรายการ`);
                  setCancelSaving(false);
                  return;
                }
                await cancelBackendSale(saleId, cancelReason, cancelRefundMethod, parseFloat(cancelRefundAmount) || 0, cancelEvidenceUrl || null);
                setCancelSaving(false); setCancelModal(null); setCancelEvidenceUrl(''); setCancelEvidencePath(''); loadSales();
              }} disabled={cancelSaving} className="px-4 py-2 rounded-lg text-xs font-bold bg-red-700 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1.5">
                {cancelSaving ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                ยืนยันยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PAYMENT UPDATE MODAL ═══ */}
      {payModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="modal-title-pay-sale" onClick={() => setPayModal(null)} onKeyDown={e => { if (e.key === 'Escape') setPayModal(null); }}>
          <div className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
              <h3 id="modal-title-pay-sale" className="text-sm font-bold text-emerald-400">รับชำระเงิน {payModal.saleId}</h3>
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
                <div><label className={labelCls}>จำนวน (บาท)</label><LocalInput type="number" value={payAmount} onCommit={setPayAmount} className={inputCls} placeholder="0.00" /></div>
                <div><label className={labelCls}>วันที่</label><DateField value={payDate} onChange={setPayDate} /></div>
              </div>
              <div><label className={labelCls}>เลขอ้างอิง</label><LocalInput type="text" value={payRefNo} onCommit={setPayRefNo} className={inputCls} placeholder="REF-..." /></div>
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
            <button onClick={() => { setFormOpen(false); if (onFormClose) onFormClose(); }} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" aria-label="กลับ"><ArrowLeft size={16} /></button>
            <h2 className="text-sm font-black tracking-tight text-rose-400 flex items-center gap-2">
              <ShoppingCart size={16} /> {editingSale ? 'แก้ไขใบเสร็จ' : 'ขายใหม่'}
            </h2>
            {customerName && <span className="text-xs text-[var(--tx-muted)]">| {customerName}</span>}
          </div>
        </div>

        {success ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center"><CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" /><p className="text-sm font-bold text-emerald-400">{editingSale ? 'บันทึกสำเร็จ' : 'ขายสำเร็จ'}</p></div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

            {/* Customer picker */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <label className={labelCls}>ลูกค้า *</label>
              {customerName ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-rose-900/10 border border-rose-700/30">
                  <span className="text-xs font-bold">{customerName} <span className="font-mono text-[var(--tx-muted)]">{customerHN}</span></span>
                  <button onClick={() => { setCustomerId(''); setCustomerName(''); setCustomerHN(''); }} className="text-[var(--tx-muted)] hover:text-red-400" aria-label="ล้าง"><X size={14} /></button>
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
                <DateField value={saleDate} onChange={setSaleDate} className="max-w-[200px]" />
              </div>
            </div>

            {/* Buy items section */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-rose-400 flex items-center gap-1.5"><ShoppingCart size={12} /> รายการสินค้า</h3>
                <div className="flex gap-1.5">
                  <button onClick={() => openBuyModal('course')} className={`text-xs font-bold px-2 py-1 rounded border ${isDark ? 'bg-teal-900/20 border-teal-700/40 text-teal-400 hover:bg-teal-900/30' : 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100'}`}><Plus size={10} /> ซื้อคอร์ส</button>
                  <button onClick={() => openBuyModal('product')} className={`text-xs font-bold px-2 py-1 rounded border ${isDark ? 'bg-orange-900/20 border-orange-700/40 text-orange-400 hover:bg-orange-900/30' : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'}`}><Plus size={10} /> สินค้า</button>
                  <button onClick={() => openBuyModal('promotion')} className={`text-xs font-bold px-2 py-1 rounded border ${isDark ? 'bg-sky-900/20 border-sky-700/40 text-sky-400 hover:bg-sky-900/30' : 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'}`}><Plus size={10} /> โปรโมชัน</button>
                  <button onClick={() => { setMedModalOpen(true); setMedModalQuery(''); setMedModalSelected(null); setMedModalQty('1'); setMedModalDosage(''); setMedModalUnit('เม็ด'); setMedEditIdx(-1); setMedModalPremium(false); }}
                    className={`text-xs font-bold px-2 py-1 rounded border flex items-center gap-1 ${isDark ? 'bg-purple-900/20 border-purple-700/40 text-purple-400 hover:bg-purple-900/30' : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'}`}><Plus size={10} /> ยากลับบ้าน</button>
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
                        <button onClick={() => setPurchasedItems(prev => prev.filter((_,j) => j !== i))} className="text-red-400" aria-label="ลบรายการ"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  ))}
                  {medications.map((med, i) => (
                    <div key={`m${i}`} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDark ? 'bg-[var(--bg-surface)]' : 'bg-gray-50'}`}>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold flex items-center gap-1">
                          <Pill size={10} className="text-purple-400 shrink-0" />{med.name || 'ไม่ระบุชื่อยา'}
                          {med.is_premium && <span className={`text-[9px] px-1 py-0.5 rounded ${isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>ของแถม</span>}
                        </span>
                        <span className="text-[10px] text-[var(--tx-muted)] block">{med.dosage || '-'} | {med.qty} {med.unit} | ฿{med.unitPrice || '0'}/{med.unit}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono">{fmtMoney((parseFloat(med.unitPrice)||0) * (parseInt(med.qty)||1))}</span>
                        <button onClick={() => { setMedEditIdx(i); setMedModalSelected({ name: med.name, price: med.is_premium ? '0' : med.unitPrice, unit: med.unit, id: med.id }); setMedModalQty(String(med.qty)); setMedModalDosage(med.dosage || ''); setMedModalUnit(med.unit || 'เม็ด'); setMedModalQuery(med.name || ''); setMedModalPremium(!!med.is_premium); setMedModalOpen(true); }}
                          className="text-sky-400 hover:text-sky-300" aria-label="แก้ไข"><Edit3 size={11} /></button>
                        <button onClick={() => setMedications(prev => prev.filter((_,j) => j !== i))} className="text-red-400 hover:text-red-300" aria-label="ลบรายการ"><Trash2 size={11} /></button>
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
                  <input type="text" value={couponCode}
                    onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponInfo(null); setCouponLookupError(''); }}
                    className={`${inputCls} !w-32 !py-1 font-mono`} placeholder="รหัสคูปอง" />
                  <button type="button" disabled={!couponCode || couponLookingUp}
                    onClick={async () => {
                      setCouponLookingUp(true); setCouponLookupError('');
                      try {
                        const c = await findCouponByCode(couponCode);
                        if (!c) { setCouponInfo(null); setCouponLookupError('ไม่พบคูปอง หรือหมดอายุ'); return; }
                        setCouponInfo(c);
                        // Apply: pre-fill billDiscount + billDiscountType from coupon
                        setBillDiscount(String(c.discount || 0));
                        setBillDiscountType(c.discount_type === 'baht' ? 'amount' : 'percent');
                      } catch (e) { setCouponLookupError(e.message || 'ตรวจสอบคูปองล้มเหลว'); }
                      finally { setCouponLookingUp(false); }
                    }}
                    className="px-2 py-1 text-[11px] font-bold rounded bg-emerald-700/30 border border-emerald-700/50 text-emerald-400 hover:bg-emerald-700/50 disabled:opacity-40 transition-colors">
                    {couponLookingUp ? '...' : 'ใช้'}
                  </button>
                  {couponInfo && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-700/30 border border-emerald-700/50 text-emerald-300 font-bold">
                      ✓ {couponInfo.coupon_name || 'ใช้ได้'}
                    </span>
                  )}
                  {couponLookupError && (
                    <span className="text-[10px] text-red-400">{couponLookupError}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--tx-muted)]">ส่วนลด</span>
                  <LocalInput type="number" value={billDiscount} onCommit={setBillDiscount} className={`${inputCls} !w-20 !py-1 text-center`} placeholder="0" />
                  <select value={billDiscountType} onChange={e => setBillDiscountType(e.target.value)} className={`${inputCls} !w-16 !py-1`}>
                    <option value="amount">฿</option><option value="percent">%</option>
                  </select>
                  <span className="ml-auto font-mono text-red-400">-{fmtMoney(billing.discount)}</span>
                </div>
                <div className="flex justify-between text-[var(--tx-muted)]">
                  <span>ยอดหลังส่วนลด</span>
                  <span className="font-mono">{fmtMoney(billing.afterDiscount)} บาท</span>
                </div>
                {activeMembership && billing.membershipDiscountPercent > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--tx-muted)]">
                      ส่วนลดสมาชิก <span className="text-purple-400 font-bold">({activeMembership.cardTypeName} {billing.membershipDiscountPercent}%)</span>
                    </span>
                    <span className="font-mono text-purple-400">-{fmtMoney(billing.membershipDiscount)} บาท</span>
                  </div>
                )}
                {/* Deposit picker */}
                <div className="pt-1">
                  <DepositPicker
                    customerId={customerId}
                    value={selectedDeposits}
                    onChange={setSelectedDeposits}
                    maxAmount={billing.afterMembership}
                    isDark={isDark}
                    reloadKey={depositReloadKey}
                  />
                </div>
                {billing.depositApplied > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--tx-muted)]">หักมัดจำ</span>
                    <span className="font-mono text-emerald-400">-{fmtMoney(billing.depositApplied)} บาท</span>
                  </div>
                )}
                {/* Wallet picker */}
                <div className="pt-1">
                  <WalletPicker
                    customerId={customerId}
                    value={selectedWallet}
                    onChange={setSelectedWallet}
                    maxAmount={Math.max(0, billing.afterMembership - billing.depositApplied)}
                    isDark={isDark}
                    reloadKey={walletReloadKey}
                  />
                </div>
                {billing.walletApplied > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--tx-muted)]">หัก Wallet</span>
                    <span className="font-mono text-sky-400">-{fmtMoney(billing.walletApplied)} บาท</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-[var(--bd)] font-bold text-sm">
                  <span>ยอดสุทธิ</span><span className="text-emerald-400 font-mono">{fmtMoney(billing.netTotal)} บาท</span>
                </div>
                {Number(activeMembership?.bahtPerPoint) > 0 && billing.netTotal > 0 && (
                  <div className="text-[10px] text-orange-400 flex items-center justify-end gap-1">
                    ⭐ จะสะสม {Math.floor(billing.netTotal / activeMembership.bahtPerPoint)} คะแนน (อัตรา ฿{activeMembership.bahtPerPoint}/คะแนน)
                  </div>
                )}
              </div>
            </div>

            {/* Payment */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-pink-400 flex items-center gap-1.5 mb-3"><CreditCard size={12} /> การชำระเงิน</h3>
              <div className="flex gap-3 mb-3 flex-wrap">
                {[{v:'paid',l:'ชำระเต็ม'},{v:'split',l:'แบ่งชำระ'},{v:'deferred',l:'ชำระภายหลัง'},{v:'unpaid',l:'ค้างชำระ'},{v:'draft',l:'แบบร่าง'}].map(s => (
                  <label key={s.v} className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <input type="radio" name="payStatus" checked={paymentStatus===s.v} onChange={() => {
                      setPaymentStatus(s.v);
                      if (s.v === 'paid') setPmChannels(prev => prev.map((c, i) => i === 0 ? { ...c, enabled: true, amount: String(billing.netTotal || 0) } : c));
                    }} className="accent-rose-500" />{s.l}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div><label className={labelCls}>วันที่ชำระ</label><DateField value={paymentDate} onChange={setPaymentDate} /></div>
                <div><label className={labelCls}>เวลา</label><input type="time" value={paymentTime} onChange={e => setPaymentTime(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>เลขอ้างอิง</label><LocalInput type="text" value={refNo} onCommit={setRefNo} className={inputCls} placeholder="REF-001" /></div>
              </div>
              <label className={labelCls}>ช่องทางชำระเงิน</label>
              {pmChannels.map((ch, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <input type="checkbox" checked={ch.enabled} onChange={e => setPmChannels(prev => prev.map((c,j) => j===i ? {...c, enabled: e.target.checked} : c))} className="accent-rose-500" />
                  <select value={ch.method} onChange={e => setPmChannels(prev => prev.map((c,j) => j===i ? {...c, method: e.target.value} : c))} className={`${inputCls} !w-40`} disabled={!ch.enabled}>
                    <option value="">เลือกช่องทาง</option>
                    {PAYMENT_CHANNELS.map(pc => <option key={pc.id} value={pc.name}>{pc.name}</option>)}
                  </select>
                  <LocalInput type="number" value={ch.amount} onCommit={v => setPmChannels(prev => prev.map((c,j) => j===i ? {...c, amount: v} : c))} className={`${inputCls} !w-28 text-right`} placeholder="0.00" disabled={!ch.enabled} />
                  <span className="text-xs text-[var(--tx-muted)] shrink-0">บาท</span>
                </div>
              ))}
              <div className="mt-3">
                <FileUploadField
                  storagePath={`uploads/be_sales/${editingSale?.saleId || `_pending_${Date.now()}`}`}
                  fieldName="paymentEvidence"
                  label="แนบหลักฐานชำระเงิน"
                  isDark={isDark}
                  value={paymentEvidenceUrl}
                  onUploadComplete={({ url, storagePath }) => { setPaymentEvidenceUrl(url); setPaymentEvidencePath(storagePath); }}
                  onDelete={() => { setPaymentEvidenceUrl(''); setPaymentEvidencePath(''); }}
                />
              </div>
            </div>

            {/* Sellers */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-orange-400 flex items-center gap-1.5 mb-3"><UsersIcon size={12} /> พนักงานขาย</h3>
              {pmSellers.map((s, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <input type="checkbox" checked={s.enabled} onChange={e => setPmSellers(prev => prev.map((x,j) => j===i ? {...x, enabled: e.target.checked} : x))} className="accent-orange-500" />
                  <select value={s.id} onChange={e => { const sel = sellers.find(x => String(x.id)===e.target.value); setPmSellers(prev => prev.map((x,j) => j===i ? {...x, id: e.target.value, name: sel?.name||''} : x)); }} className={`${inputCls} !w-48`} disabled={!s.enabled}>
                    <option value="">เลือกพนักงาน</option>
                    {sellers.map(sl => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                  </select>
                  <LocalInput type="number" value={s.percent} onCommit={v => setPmSellers(prev => prev.map((x,j) => j===i ? {...x, percent: v} : x))} className={`${inputCls} !w-16 text-center`} placeholder="%" disabled={!s.enabled} />
                  <span className="text-xs text-[var(--tx-muted)]">%</span>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[var(--bg-card)] border-[var(--bd)]' : 'bg-white border-gray-200'}`}>
              <label className={labelCls}>หมายเหตุการขาย</label>
              <LocalTextarea value={saleNote} onCommit={setSaleNote} rows={2} className={`${inputCls} resize-none mb-2`} placeholder="หมายเหตุเกี่ยวกับรายการขาย" />
              <label className={labelCls}>หมายเหตุการชำระเงิน</label>
              <LocalTextarea value={paymentNote} onCommit={setPaymentNote} rows={2} className={`${inputCls} resize-none`} placeholder="หมายเหตุเกี่ยวกับการชำระ" />
            </div>

            {/* Error + Submit */}
            {error && <div className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</div>}
            <div className="flex justify-end gap-2 pb-8">
              <button onClick={() => { setFormOpen(false); if (onFormClose) onFormClose(); }} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ยกเลิก</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-50 flex items-center gap-1.5">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {editingSale ? 'บันทึก' : 'ขาย'}
              </button>
            </div>
          </div>
        )}

        {/* Buy modal */}
        {buyModalOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="modal-title-buy" onClick={() => setBuyModalOpen(false)} onKeyDown={e => { if (e.key === 'Escape') setBuyModalOpen(false); }}>
            <div className={`w-full max-w-lg mx-4 rounded-2xl shadow-2xl max-h-[70vh] flex flex-col ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
              <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
                <div className="flex gap-2">
                  <span id="modal-title-buy" className="sr-only">เลือกสินค้า</span>
                  {['course','product','promotion'].map(t => (
                    <button key={t} onClick={() => { setBuyModalType(t); setBuySelectedCat(''); if (!buyItems[t]?.length) openBuyModal(t); }}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg ${buyModalType===t ? 'bg-rose-700 text-white' : isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>
                      {t==='course' ? 'คอร์ส' : t==='product' ? 'สินค้า' : 'โปรโมชัน'}
                    </button>
                  ))}
                </div>
                <button onClick={() => setBuyModalOpen(false)} className="text-[var(--tx-muted)]" aria-label="ปิด"><X size={16} /></button>
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
                        {/* Cover thumbnail — only for promotion items with cover_image. */}
                        {buyModalType === 'promotion' && item.cover_image && (
                          <img src={item.cover_image} alt="" loading="lazy"
                            className="w-6 h-6 rounded object-cover flex-shrink-0 border border-[var(--bd)]"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        )}
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

        {/* Med modal — เพิ่ม/แก้ไขยากลับบ้าน */}
        {medModalOpen && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="modal-title-med-sale" onClick={() => setMedModalOpen(false)} onKeyDown={e => { if (e.key === 'Escape') setMedModalOpen(false); }}>
            <div className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl ${isDark ? 'bg-[var(--bg-surface)] border border-[var(--bd)]' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
              <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
                <h3 id="modal-title-med-sale" className="text-sm font-bold text-purple-400">{medEditIdx >= 0 ? 'แก้ไขยากลับบ้าน' : 'เพิ่มยากลับบ้าน'}</h3>
                <button onClick={() => setMedModalOpen(false)} className="text-[var(--tx-muted)] hover:text-[var(--tx-primary)]" aria-label="ปิด"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-3">
                {/* Product search */}
                <div>
                  <label className={labelCls}>ยากลับบ้าน *</label>
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                    <input value={medModalSelected ? medModalSelected.name : medModalQuery}
                      onChange={e => { setMedModalQuery(e.target.value); setMedModalSelected(null); }}
                      onFocus={() => { if (medModalSelected) { setMedModalQuery(medModalSelected.name); setMedModalSelected(null); } }}
                      className={`${inputCls} !pl-8`} placeholder="ค้นหายากลับบ้าน..." autoFocus />
                  </div>
                  {!medModalSelected && medModalQuery.length > 0 && (
                    <div className={`rounded-lg border mt-1 max-h-40 overflow-y-auto ${isDark ? 'border-[var(--bd)] bg-[var(--bg-elevated)]' : 'border-gray-200 bg-white'}`}>
                      {medProducts.filter(p => p.name?.toLowerCase().includes(medModalQuery.toLowerCase())).slice(0, 30).length === 0 ? (
                        <p className="text-xs text-[var(--tx-muted)] text-center py-3">ไม่พบรายการ</p>
                      ) : medProducts.filter(p => p.name?.toLowerCase().includes(medModalQuery.toLowerCase())).slice(0, 30).map(p => (
                        <button key={p.id} onClick={() => { setMedModalSelected(p); setMedModalUnit(p.unit || 'เม็ด'); }}
                          className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[var(--bd)]/50 hover:bg-[var(--bg-hover)]' : 'border-gray-100 hover:bg-gray-50'}`}>
                          <span className="font-bold text-[var(--tx-primary)]">{p.name}</span>
                          <span className="text-[var(--tx-muted)] whitespace-nowrap ml-2">฿{p.price || 0} / {p.unit || '-'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Qty + Unit + Dosage */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={labelCls}>จำนวน</label>
                    <LocalInput type="number" value={medModalQty} onCommit={setMedModalQty} min="1" className={`${inputCls} text-center`} />
                  </div>
                  <div>
                    <label className={labelCls}>หน่วย</label>
                    <select value={medModalUnit} onChange={e => setMedModalUnit(e.target.value)} className={inputCls}>
                      <option value="เม็ด">เม็ด</option><option value="ซีซี">ซีซี</option><option value="ช้อนชา">ช้อนชา</option>
                      <option value="แคปซูล">แคปซูล</option><option value="ซอง">ซอง</option><option value="หลอด">หลอด</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>ราคา/หน่วย</label>
                    <input type="number" value={medModalPremium ? '0' : (medModalSelected?.price || '')} readOnly className={`${inputCls} text-right ${medModalPremium ? 'line-through opacity-40' : 'opacity-60'}`} />
                  </div>
                </div>
                <label className={`flex items-center gap-2 text-xs cursor-pointer py-1 ${medModalPremium ? 'text-emerald-400 font-bold' : 'text-[var(--tx-muted)]'}`}>
                  <input type="checkbox" checked={medModalPremium} onChange={e => setMedModalPremium(e.target.checked)} className="accent-emerald-500" />
                  สินค้าของแถม (ราคา 0 บาท)
                </label>
                <div>
                  <label className={labelCls}>วิธีรับประทาน</label>
                  <LocalInput type="text" value={medModalDosage} onCommit={setMedModalDosage} className={inputCls} placeholder="เช่น ครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร" />
                </div>
              </div>
              <div className={`px-5 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-[var(--bd)]' : 'border-gray-200'}`}>
                <button onClick={() => setMedModalOpen(false)} className={`px-4 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)]' : 'bg-gray-100 text-gray-600'}`}>ยกเลิก</button>
                <button disabled={!medModalSelected} onClick={() => {
                  const med = {
                    id: medModalSelected.id, name: medModalSelected.name,
                    qty: medModalQty || '1', unitPrice: medModalPremium ? '0' : String(medModalSelected.price || ''),
                    unit: medModalUnit, dosage: medModalDosage, is_premium: medModalPremium,
                    generic_name: '', indications: '', dosage_amount: '', dosage_unit: medModalUnit,
                    times_per_day: '', administration_method: '', administration_times: [],
                    instructions: '', storage_instructions: '',
                  };
                  if (medEditIdx >= 0) setMedications(prev => prev.map((m, j) => j === medEditIdx ? med : m));
                  else setMedications(prev => [...prev, med]);
                  setMedModalOpen(false);
                }} className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40">
                  {medEditIdx >= 0 ? 'บันทึก' : 'เพิ่ม'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
