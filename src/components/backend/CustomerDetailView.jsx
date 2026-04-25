// ─── CustomerDetailView — 3-column customer detail (mimics ProClinic layout) ─
// Left: Profile card | Center: Appointments + Treatment timeline | Right: Courses tabs

import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, User, Phone, MapPin, Calendar, Stethoscope, Package,
  Clock, AlertCircle, CheckCircle2, Heart, Pill, FileText, ChevronDown,
  ChevronUp, Activity, Loader2, RefreshCw, Droplets, Shield, Plus, Edit3, Trash2,
  Search, X, Users, Wallet, CreditCard, Ticket, Star, Crown, Check, Printer
} from 'lucide-react';
import {
  getCustomerTreatments, getCustomerSales, addCourseRemainingQty, getCustomer, getAllMasterDataItems,
  getCustomerMembership, getActiveDeposits, getCustomerWallets, getPointBalance,
} from '../../lib/backendClient.js';
import DocumentPrintModal from './DocumentPrintModal.jsx';
import { parseQtyString } from '../../lib/courseUtils.js';
import { fmtMoney, fmtPoints } from '../../lib/financeUtils.js';
import { cardTextClass } from './MembershipPanel.jsx';
import { hexToRgb, thaiTodayISO } from '../../utils.js';
import { fmtThaiDate, THAI_MONTHS_SHORT, THAI_MONTHS_FULL } from '../../lib/dateFormat.js';

// ─── Helper: format Thai date ───────────────────────────────────────────────
// Short/full Thai-BE formatters delegate to the shared `fmtThaiDate` helper.
// `formatThaiDateFull` additionally guards against already-formatted strings
// (defensive: upstream data sometimes arrives already-Thai from ProClinic).
function formatThaiDateFull(dateStr) {
  if (!dateStr) return '-';
  if (typeof dateStr === 'string' && THAI_MONTHS_FULL.some(mn => dateStr.includes(mn))) return dateStr;
  return fmtThaiDate(dateStr, { monthStyle: 'full' });
}

function formatThaiDate(dateStr) {
  return fmtThaiDate(dateStr);
}

/**
 * Phase 12.2b follow-up (2026-04-25): days-until-expiry countdown for
 * buffet courses. User directive: hide "มูลค่าคงเหลือ" on buffet, show
 * "หมดอายุอีก N วัน" instead (matches ProClinic's customer view).
 *
 * Accepts ISO "YYYY-MM-DD" (how backendClient stores expiry at
 * assignCourseToCustomer time) OR "DD/MM/YYYY" Thai display. Returns
 * integer days (positive = future, 0 = today, negative = past) or null
 * when the input is empty/unparseable. Bangkok TZ via thaiTodayISO.
 */
function daysUntilExpiry(expiryStr) {
  if (!expiryStr || typeof expiryStr !== 'string') return null;
  let iso = expiryStr.trim();
  // DD/MM/YYYY → YYYY-MM-DD
  const dmy = iso.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    iso = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const exp = new Date(iso + 'T00:00:00');
  if (isNaN(exp.getTime())) return null;
  const today = new Date(thaiTodayISO() + 'T00:00:00');
  return Math.floor((exp.getTime() - today.getTime()) / 86400000);
}

function formatDob(pd) {
  if (!pd) return '-';
  const { dobDay, dobMonth, dobYear, age } = pd;
  if (!dobDay && !dobMonth && !dobYear) return age ? `อายุ ${age} ปี` : '-';
  const monthLabel = dobMonth ? (THAI_MONTHS_SHORT[parseInt(dobMonth) - 1] || dobMonth) : '';
  const yearDisplay = dobYear ? (parseInt(dobYear) < 2400 ? parseInt(dobYear) + 543 : dobYear) : '';
  const parts = [dobDay, monthLabel, yearDisplay].filter(Boolean).join(' ');
  return age ? `${parts} (อายุ ${age} ปี)` : parts;
}

function relativeTime(isoStr) {
  if (!isoStr) return '-';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  return `${days} วันที่แล้ว`;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function CustomerDetailView({ customer, accentColor, theme, clinicSettings, onBack, onCreateTreatment, onEditTreatment, onDeleteTreatment, onCustomerUpdated, onCreateSale, onOpenFinance }) {
  const isDark = theme !== 'light';
  const ac = accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const pd = customer?.patientData || {};

  const [treatments, setTreatments] = useState([]);
  const [treatmentsLoading, setTreatmentsLoading] = useState(false);
  const [treatmentsError, setTreatmentsError] = useState('');
  const [courseTab, setCourseTab] = useState('active'); // 'active' | 'expired' | 'purchases'
  const [customerSales, setCustomerSales] = useState([]);
  const [salesError, setSalesError] = useState('');
  const [expandedTreatment, setExpandedTreatment] = useState(null);
  const [addQtyModal, setAddQtyModal] = useState(null);
  const [addQtyValue, setAddQtyValue] = useState('');
  const [addQtySaving, setAddQtySaving] = useState(false);
  // (assignModal removed — "เพิ่มคอร์สใหม่" now opens SaleTab via onCreateSale)
  // Exchange product
  const [exchangeModal, setExchangeModal] = useState(null); // { courseIndex, course }
  // Share course
  const [shareModal, setShareModal] = useState(null); // { courseIndex, course }
  // Phase 14.5 — print document modal
  const [printDocOpen, setPrintDocOpen] = useState(false);

  // Load treatment details from be_treatments
  useEffect(() => {
    if (!customer?.proClinicId) return;
    setTreatmentsLoading(true);
    setTreatmentsError('');
    getCustomerTreatments(customer.proClinicId)
      .then(data => setTreatments(data))
      .catch(err => {
        console.error('[CustomerDetailView] treatments load failed:', err);
        setTreatmentsError('โหลดประวัติการรักษาไม่สำเร็จ');
      })
      .finally(() => setTreatmentsLoading(false));
  }, [customer?.proClinicId, customer?.treatmentCount]);

  // Load financial summary (deposit / wallet / points / membership)
  const [finSummary, setFinSummary] = useState(null);
  const [finLoading, setFinLoading] = useState(false);
  useEffect(() => {
    if (!customer?.proClinicId) return;
    setFinLoading(true);
    (async () => {
      try {
        const cid = customer.proClinicId;
        const [deposits, wallets, points, membership] = await Promise.all([
          getActiveDeposits(cid),
          getCustomerWallets(cid),
          getPointBalance(cid),
          getCustomerMembership(cid),
        ]);
        const depositBalance = deposits.reduce((s, d) => s + (Number(d.remainingAmount) || 0), 0);
        const walletBalance = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
        setFinSummary({ depositBalance, walletBalance, wallets, points, membership });
      } catch (e) {
        console.warn('[CustomerDetailView] finSummary load failed:', e);
        setFinSummary(null);
      } finally { setFinLoading(false); }
    })();
  }, [customer?.proClinicId, customer?.treatmentCount]);

  // Load customer sales for purchase history tab
  useEffect(() => {
    if (!customer?.proClinicId) return;
    setSalesError('');
    getCustomerSales(customer.proClinicId)
      .then(setCustomerSales)
      .catch(err => {
        console.error('[CustomerDetailView] sales load failed:', err);
        setSalesError('โหลดประวัติการซื้อไม่สำเร็จ');
      });
  }, [customer?.proClinicId]);

  const name = `${pd.prefix || ''} ${pd.firstName || ''} ${pd.lastName || ''}`.trim() || '-';
  const hn = customer?.proClinicHN || '';
  // Filter out courses with 0 remaining from active (they're effectively "used up")
  const allCourses = customer?.courses || [];
  const activeCourses = useMemo(() => allCourses.filter(c => {
    // Phase 12.2b follow-up (2026-04-24): pick-at-treatment placeholders
    // carry qty='' (picks haven't happened yet) → parseQtyString returns
    // remaining=0 → would be dropped. Keep them in active so the
    // customer sees "เลือกสินค้าเพื่อใช้" pending action + the
    // treatment form can surface the "เลือกสินค้า" button.
    if (c && c.needsPickSelection) return true;
    // Phase 12.2b follow-up (2026-04-25): buffet = unlimited until
    // date-expiry. parseQtyString on a buffet's stored qty could
    // legitimately parse to remaining=0 after heavy use. Keep them
    // active so คอร์สของฉัน always shows them until date expiry
    // (the expiredCourses lifecycle handler moves them over).
    if (c && String(c.courseType || '').trim() === 'บุฟเฟต์') return true;
    const { remaining } = parseQtyString(c.qty);
    return remaining > 0;
  }), [allCourses]);
  // Phase 12.2b follow-up (2026-04-24): "คอร์สหมดอายุ" means ACTUALLY
  // expired by date — not used-up courses. User directive: "คอร์สหมด
  // อายุก็คือคอร์สหมดอายุจริงๆ". Used-up courses are traceable via
  // Purchase History (sales linked to customer). Drop usedUpCourses
  // from the expired tab.
  const expiredCourses = useMemo(() => (customer?.expiredCourses || []), [customer?.expiredCourses]);
  const appointments = customer?.appointments || [];
  // Sort treatments newest-first. `rebuildTreatmentSummary` writes them in desc order
  // on every backend save, but customers cloned from ProClinic keep ProClinic's ordering
  // until their next rebuild — defensively re-sort client-side so the latest always tops.
  const treatmentSummary = useMemo(() => {
    const list = [...(customer?.treatmentSummary || [])];
    list.sort((a, b) => {
      const da = a?.date || '';
      const db = b?.date || '';
      if (da === db) {
        // tie-breaker: treatmentId contains timestamp for backend-created ones
        return String(b?.id || '').localeCompare(String(a?.id || ''));
      }
      return db.localeCompare(da);
    });
    return list;
  }, [customer?.treatmentSummary]);

  return (
    <div>
      {/* ── 3-Column Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] lg:grid-cols-[300px_1fr_340px] gap-5 overflow-hidden">

        {/* ════════════════════ LEFT: Profile ════════════════════ */}
        <div className="space-y-3 min-w-0">
          {/* Profile Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
            {/* Avatar + Name header */}
            <div className="p-5 text-center border-b border-[var(--bd)]">
              {/* Avatar */}
              <div className="w-24 h-24 rounded-full mx-auto mb-3 flex items-center justify-center border-2"
                style={{ borderColor: `rgba(${acRgb},0.4)`, backgroundColor: `rgba(${acRgb},0.08)` }}>
                <span className="text-3xl font-bold text-[var(--tx-heading)]">
                  {(pd.firstName || '?')[0]}
                </span>
              </div>

              {/* HN Badge */}
              {hn && (
                <span className="inline-block px-3 py-1 rounded-lg text-sm font-mono font-bold tracking-wider bg-[var(--bg-elevated)] border border-[var(--bd)] text-[var(--tx-secondary)] mb-2">
                  {hn}
                </span>
              )}

              {/* Name — NEVER red (Thai culture) */}
              <h2 className="text-lg font-bold text-[var(--tx-heading)]">{name}</h2>

              {/* Clone status */}
              {customer?.cloneStatus && (
                <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                  {customer.cloneStatus === 'complete' ? (
                    <span className="text-emerald-500 flex items-center gap-1 font-medium"><CheckCircle2 size={12} /> Clone สมบูรณ์</span>
                  ) : customer.cloneStatus === 'partial_error' ? (
                    <span className="text-orange-500 flex items-center gap-1 font-medium"><AlertCircle size={12} /> Clone บางส่วน</span>
                  ) : null}
                  <span className="text-[var(--tx-muted)]">| {relativeTime(customer.lastSyncedAt)}</span>
                </div>
              )}
            </div>

            {/* Personal Info Table */}
            <div className="p-4 space-y-0">
              <InfoRow label="สัญชาติ" value={pd.nationality || '-'} />
              <InfoRow label="เลขบัตรปชช." value={pd.idCard || '-'} />
              <InfoRow label="เพศ" value={pd.gender || '-'} />
              <InfoRow label="วันเกิด" value={formatDob(pd)} />
              <InfoRow label="เบอร์โทร" value={pd.phone || '-'} icon={<Phone size={11} />} />
              <InfoRow label="กรุ๊ปเลือด" value={pd.bloodType || '-'} />
              <InfoRow label="ที่อยู่" value={formatAddress(pd)} icon={<MapPin size={11} />} />
              {pd.allergiesDetail && (
                <InfoRow label="แพ้ยา" value={pd.allergiesDetail} className="text-orange-400" />
              )}
              {pd.hasUnderlying === 'มี' && (
                <InfoRow label="โรคประจำตัว" value={formatUnderlying(pd)} className="text-orange-400" />
              )}
              {pd.emergencyName && (
                <InfoRow label="ผู้ติดต่อฉุกเฉิน" value={`${pd.emergencyName} (${pd.emergencyRelation || '-'}) ${pd.emergencyPhone || ''}`} />
              )}
              {pd.howFoundUs?.length > 0 && (
                <InfoRow label="ที่มา" value={Array.isArray(pd.howFoundUs) ? pd.howFoundUs.join(', ') : pd.howFoundUs} />
              )}
            </div>
          </div>

          {/* ── Financial Summary Card (Phase 7) ── */}
          <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--bd)] flex items-center gap-2">
              <Wallet size={14} className="text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--tx-heading)]">การเงิน</h3>
              {finLoading && <Loader2 size={11} className="animate-spin text-[var(--tx-muted)] ml-auto" />}
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {/* มัดจำ */}
              <button onClick={() => onOpenFinance?.('deposit', customer)}
                className={`text-left rounded-lg px-3 py-2 border transition-all ${isDark ? 'bg-[var(--bg-elevated)] border-[var(--bd)] hover:border-emerald-700/50' : 'bg-gray-50 border-gray-200 hover:border-emerald-300'}`}
                title="จัดการมัดจำ">
                <div className="flex items-center gap-1.5 mb-1">
                  <Wallet size={11} className="text-emerald-400" />
                  <span className="text-[10px] font-bold text-[var(--tx-muted)] uppercase">มัดจำ</span>
                </div>
                <div className="text-sm font-black text-emerald-400 font-mono">
                  ฿{fmtMoney(finSummary?.depositBalance || 0)}
                </div>
              </button>
              {/* Wallet */}
              <button onClick={() => onOpenFinance?.('wallet', customer)}
                className={`text-left rounded-lg px-3 py-2 border transition-all ${isDark ? 'bg-[var(--bg-elevated)] border-[var(--bd)] hover:border-sky-700/50' : 'bg-gray-50 border-gray-200 hover:border-sky-300'}`}
                title="จัดการ Wallet">
                <div className="flex items-center gap-1.5 mb-1">
                  <CreditCard size={11} className="text-sky-400" />
                  <span className="text-[10px] font-bold text-[var(--tx-muted)] uppercase">Wallet</span>
                </div>
                <div className="text-sm font-black text-sky-400 font-mono">
                  ฿{fmtMoney(finSummary?.walletBalance || 0)}
                </div>
                {finSummary?.wallets?.length > 1 && (
                  <div className="text-[9px] text-[var(--tx-muted)] mt-0.5">{finSummary.wallets.length} กระเป๋า</div>
                )}
              </button>
              {/* Points */}
              <button onClick={() => onOpenFinance?.('points', customer)}
                className={`text-left rounded-lg px-3 py-2 border transition-all ${isDark ? 'bg-[var(--bg-elevated)] border-[var(--bd)] hover:border-orange-700/50' : 'bg-gray-50 border-gray-200 hover:border-orange-300'}`}
                title="คะแนนสะสม">
                <div className="flex items-center gap-1.5 mb-1">
                  <Star size={11} className="text-orange-400" fill="currentColor" />
                  <span className="text-[10px] font-bold text-[var(--tx-muted)] uppercase">คะแนน</span>
                </div>
                <div className="text-sm font-black text-orange-400 font-mono">
                  {fmtPoints(finSummary?.points || 0)}
                </div>
              </button>
              {/* Membership — text color mirrors the actual card color (e.g. GOLD → amber) */}
              <button onClick={() => onOpenFinance?.('membership', customer)}
                className={`text-left rounded-lg px-3 py-2 border transition-all ${isDark ? 'bg-[var(--bg-elevated)] border-[var(--bd)] hover:border-purple-700/50' : 'bg-gray-50 border-gray-200 hover:border-purple-300'}`}
                title="บัตรสมาชิก">
                <div className="flex items-center gap-1.5 mb-1">
                  <Crown size={11} className={finSummary?.membership ? cardTextClass(finSummary.membership.colorName, finSummary.membership.cardTypeName) : 'text-purple-400'} />
                  <span className="text-[10px] font-bold text-[var(--tx-muted)] uppercase">สมาชิก</span>
                </div>
                {finSummary?.membership ? (
                  <>
                    <div className={`text-sm font-black truncate ${cardTextClass(finSummary.membership.colorName, finSummary.membership.cardTypeName)}`}>
                      {finSummary.membership.cardTypeName}
                    </div>
                    <div className="text-[9px] text-[var(--tx-muted)] mt-0.5">ส่วนลด {finSummary.membership.discountPercent || 0}%</div>
                  </>
                ) : (
                  <div className="text-xs text-[var(--tx-muted)] italic">ไม่มีบัตร</div>
                )}
              </button>
            </div>
            {/* Action buttons */}
            <div className="px-3 pb-3 flex gap-1.5 flex-wrap">
              <button onClick={() => onOpenFinance?.('deposit', customer)}
                className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 ${isDark ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/30' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}>
                <Plus size={9} /> จ่ายมัดจำ
              </button>
              <button onClick={() => onOpenFinance?.('wallet', customer)}
                className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 ${isDark ? 'bg-sky-900/20 border-sky-700/40 text-sky-400 hover:bg-sky-900/30' : 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'}`}>
                <Plus size={9} /> เติมเงิน
              </button>
              {!finSummary?.membership && (
                <button onClick={() => onOpenFinance?.('membership', customer)}
                  className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 ${isDark ? 'bg-purple-900/20 border-purple-700/40 text-purple-400 hover:bg-purple-900/30' : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'}`}>
                  <Plus size={9} /> ซื้อบัตร
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════ CENTER: Medical ════════════════════ */}
        <div className="space-y-4 min-w-0">

          {/* Appointments Card */}
          {appointments.length > 0 && (
            <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--bd)] flex items-center gap-2">
                <Calendar size={16} className="text-sky-400" />
                <h3 className="text-sm font-bold text-[var(--tx-heading)]">นัดหมาย</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isDark ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-50 text-sky-700'}`}>{appointments.length}</span>
              </div>
              <div className="divide-y divide-[var(--bd)]">
                {appointments.map((appt, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--tx-heading)]">
                      <Calendar size={13} className="text-sky-400" />
                      {appt.date} {appt.time && `| ${appt.time}`}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--tx-muted)]">
                      {appt.branch && <span>{appt.branch}</span>}
                      {appt.doctor && <span>{appt.doctor}</span>}
                      {appt.room && <span>{appt.room}</span>}
                    </div>
                    {appt.notes && <p className="mt-1 text-xs text-[var(--tx-muted)]">{appt.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Treatment Timeline */}
          <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--bd)] flex items-center gap-2">
              <Stethoscope size={16} style={{ color: ac }} />
              <h3 className="text-sm font-bold text-[var(--tx-heading)]">ประวัติการรักษา</h3>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: `rgba(${acRgb},0.15)`, color: ac }}>
                {customer?.treatmentCount || treatmentSummary.length}
              </span>
              <button onClick={() => setPrintDocOpen(true)}
                data-testid="print-document-btn"
                className="ml-auto text-xs font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 hover:shadow-md active:scale-95"
                style={{ color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)', backgroundColor: 'rgba(167,139,250,0.08)' }}
                title="พิมพ์ใบรับรอง / ฉลากยา / เอกสารอื่นๆ">
                <Printer size={11} /> พิมพ์เอกสาร
              </button>
              {onCreateTreatment && (
                <button onClick={onCreateTreatment}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 hover:shadow-md active:scale-95"
                  style={{ color: ac, borderColor: `rgba(${acRgb},0.3)`, backgroundColor: `rgba(${acRgb},0.08)` }}>
                  <Plus size={11} /> สร้างการรักษา
                </button>
              )}
            </div>

            {treatmentsError && (
              <div className={`px-4 py-3 text-xs flex items-center gap-2 border-b border-[var(--bd)] ${isDark ? 'text-orange-400 bg-orange-900/10' : 'text-orange-700 bg-orange-50'}`}>
                <AlertCircle size={13} /> {treatmentsError}
              </div>
            )}
            {treatmentSummary.length === 0 && !treatmentsError ? (
              <div className="p-8 text-center text-sm text-[var(--tx-muted)]">ไม่มีประวัติการรักษา</div>
            ) : (
              <div className="divide-y divide-[var(--bd)]">
                {treatmentSummary.map((t, i) => {
                  const isExpanded = expandedTreatment === t.id;
                  const detail = treatments.find(tr => tr.treatmentId === t.id || tr.id === t.id);
                  return (
                    <div key={t.id || i} className="group">
                      {/* Summary row */}
                      <button onClick={() => setExpandedTreatment(isExpanded ? null : t.id)}
                        className="w-full px-4 py-3 text-left hover:bg-[var(--bg-hover)] transition-colors">
                        <div className="flex items-start gap-3">
                          {/* Timeline dot */}
                          <div className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 border-2"
                            style={{ borderColor: i === 0 ? ac : 'var(--bd-strong)', backgroundColor: i === 0 ? ac : 'transparent' }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-[var(--tx-heading)]">{formatThaiDateFull(t.date) || '-'}</span>
                              {isExpanded ? <ChevronUp size={14} className="text-[var(--tx-muted)]" /> : <ChevronDown size={14} className="text-[var(--tx-muted)]" />}
                            </div>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-[var(--tx-muted)]">
                              {t.branch && <span>{t.branch}</span>}
                              {t.doctor && <span>{t.doctor}</span>}
                              {t.assistants?.length > 0 && <span>{t.assistants.join(', ')}</span>}
                            </div>
                            {t.cc && <p className="mt-1 text-xs text-[var(--tx-secondary)] truncate">CC: {t.cc}</p>}
                            {t.dx && <p className="text-xs text-[var(--tx-muted)] truncate">DX: {t.dx}</p>}
                          </div>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pl-10">
                          {/* Edit/Delete for backend-created treatments only */}
                          {(detail?.createdBy === 'backend' || t.createdBy === 'backend') && (onEditTreatment || onDeleteTreatment) && (
                            <div className="flex gap-1.5 mb-2">
                              {onEditTreatment && (
                                <button onClick={() => onEditTreatment(t.id)}
                                  className="text-xs font-bold px-2 py-1 rounded border border-sky-700/40 text-sky-400 bg-sky-900/10 hover:bg-sky-900/20 transition-all flex items-center gap-1">
                                  <Edit3 size={10} /> แก้ไข
                                </button>
                              )}
                              {onDeleteTreatment && (
                                <button onClick={() => onDeleteTreatment(t.id)}
                                  className="text-xs font-bold px-2 py-1 rounded border border-red-700/40 text-red-400 bg-red-900/10 hover:bg-red-900/20 transition-all flex items-center gap-1">
                                  <Trash2 size={10} /> ลบ
                                </button>
                              )}
                            </div>
                          )}
                          {treatmentsLoading && !detail ? (
                            <div className="flex items-center gap-2 text-xs text-[var(--tx-muted)] py-2">
                              <Loader2 size={12} className="animate-spin" /> กำลังโหลด...
                            </div>
                          ) : detail?.detail ? (
                            <TreatmentDetailExpanded detail={detail.detail} ac={ac} acRgb={acRgb} isDark={isDark} />
                          ) : (
                            <div className="bg-[var(--bg-elevated)] rounded-lg p-3 space-y-2">
                              {t.cc && <DetailField label="อาการ (CC)" value={t.cc} />}
                              {t.dx && <DetailField label="วินิจฉัย (DX)" value={t.dx} />}
                              <p className="text-xs text-[var(--tx-muted)]">ไม่มีข้อมูลรายละเอียดเพิ่มเติม</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════ RIGHT: Courses ════════════════════ */}
        <div className="space-y-3 min-w-0">
          {/* Tabs */}
          <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
            <div className="flex items-center border-b border-[var(--bd)]" role="tablist">
              <button onClick={() => setCourseTab('active')} role="tab" aria-selected={courseTab === 'active'}
                className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  courseTab === 'active' ? `text-teal-400 border-b-2 border-teal-400 ${isDark ? 'bg-teal-900/10' : 'bg-teal-50'}` : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
                }`}>
                <Package size={13} /> คอร์สของฉัน
                {activeCourses.length > 0 && (
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${isDark ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-50 text-teal-700'}`}>{activeCourses.length}</span>
                )}
              </button>
              <button onClick={() => setCourseTab('expired')} role="tab" aria-selected={courseTab === 'expired'}
                className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  courseTab === 'expired' ? `text-red-400 border-b-2 border-red-400 ${isDark ? 'bg-red-900/10' : 'bg-red-50'}` : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
                }`}>
                คอร์สหมดอายุ
                {expiredCourses.length > 0 && (
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-700'}`}>{expiredCourses.length}</span>
                )}
              </button>
              <button onClick={() => setCourseTab('purchases')} role="tab" aria-selected={courseTab === 'purchases'}
                className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  courseTab === 'purchases' ? `text-rose-400 border-b-2 border-rose-400 ${isDark ? 'bg-rose-900/10' : 'bg-rose-50'}` : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
                }`}>
                ประวัติการซื้อ
                {customerSales.length > 0 && (
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${isDark ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-50 text-rose-700'}`}>{customerSales.length}</span>
                )}
              </button>
              {/* Assign course button */}
              <button onClick={() => onCreateSale?.(customer)}
                className="px-2 py-2 text-teal-400 hover:text-teal-300 transition-colors" title="ขายคอร์สใหม่ให้ลูกค้า" aria-label="ขายคอร์สใหม่">
                <Plus size={16} />
              </button>
            </div>

            {/* Content by tab — scrollable for large course lists */}
            <div className="divide-y divide-[var(--bd)] max-h-[600px] overflow-y-auto">
              {salesError && courseTab === 'purchases' && (
                <div className={`px-4 py-3 text-xs flex items-center gap-2 ${isDark ? 'text-orange-400 bg-orange-900/10' : 'text-orange-700 bg-orange-50'}`}>
                  <AlertCircle size={13} /> {salesError}
                </div>
              )}
              {courseTab === 'purchases' ? (
                /* Purchase History */
                customerSales.length === 0 && !salesError ? (
                  <div className="p-8 text-center text-sm text-[var(--tx-muted)]">ไม่มีประวัติการซื้อ</div>
                ) : (
                  customerSales.map((sale, i) => {
                    // Phase 12.2b follow-up (2026-04-24): surface the
                    // purchased item names + quantities so the user
                    // doesn't have to click into every sale to see
                    // what was bought. User directive: "ทำให้ตรงประวัติ
                    // การซื้อแสดงรายละเอียดคอร์สที่ซื้อด้วย ไม่ใช่แสดง
                    // แต่เลข inv". Sale items shape: either grouped
                    // `{courses, promotions, products, medications}`
                    // (SaleTab canonical) or legacy flat `[...]`.
                    const items = sale.items || {};
                    const courses = Array.isArray(items.courses) ? items.courses : [];
                    const promotions = Array.isArray(items.promotions) ? items.promotions : [];
                    const products = Array.isArray(items.products) ? items.products : [];
                    const medications = Array.isArray(items.medications) ? items.medications : [];
                    const flatLegacy = Array.isArray(items) ? items : [];
                    const allLines = flatLegacy.length
                      ? flatLegacy.map(it => ({ ...it, itemType: it.itemType || 'item' }))
                      : [
                        ...courses.map(c => ({ ...c, itemType: 'course' })),
                        ...promotions.map(p => ({ ...p, itemType: 'promotion' })),
                        ...products.map(p => ({ ...p, itemType: 'product' })),
                        ...medications.map(m => ({ ...m, itemType: 'medication' })),
                      ];
                    const typeColor = {
                      course: isDark ? 'text-teal-400' : 'text-teal-700',
                      promotion: isDark ? 'text-orange-400' : 'text-orange-700',
                      product: isDark ? 'text-sky-400' : 'text-sky-700',
                      medication: isDark ? 'text-pink-400' : 'text-pink-700',
                      item: isDark ? 'text-gray-400' : 'text-gray-600',
                    };
                    const typeLabel = {
                      course: 'คอร์ส',
                      promotion: 'โปรโมชัน',
                      product: 'สินค้า',
                      medication: 'ยา',
                      item: '',
                    };
                    return (
                      <div key={i} className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-[var(--tx-muted)]">{sale.saleId || '-'}</span>
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                            sale.payment?.status === 'paid' ? (isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700') :
                            sale.payment?.status === 'cancelled' || sale.status === 'cancelled' ? (isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-700') :
                            (isDark ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-700')
                          }`}>{sale.payment?.status === 'paid' ? 'ชำระแล้ว' : sale.status === 'cancelled' ? 'ยกเลิก' : 'ค้างชำระ'}</span>
                        </div>
                        <p className="text-xs text-[var(--tx-secondary)] mt-0.5">{formatThaiDateFull(sale.saleDate)}</p>
                        <p className="text-sm font-bold text-[var(--tx-heading)] font-mono">{sale.billing?.netTotal != null ? Number(sale.billing.netTotal).toLocaleString() : '0'} บาท</p>
                        {allLines.length > 0 && (
                          <ul className={`mt-1.5 space-y-0.5 pl-2 border-l-2 ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                            {allLines.map((it, j) => {
                              const name = it.name || it.productName || it.courseName || '-';
                              const qty = Number(it.qty) || 0;
                              const unit = it.unit || '';
                              const unitPrice = Number(it.unitPrice || it.price) || 0;
                              return (
                                <li key={j} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="flex items-center gap-1.5 min-w-0">
                                    <span className={`text-[9px] uppercase tracking-wider shrink-0 ${typeColor[it.itemType] || typeColor.item}`}>
                                      {typeLabel[it.itemType]}
                                    </span>
                                    <span className="text-[var(--tx-secondary)] truncate">{name}</span>
                                  </span>
                                  <span className="text-[var(--tx-muted)] font-mono tabular-nums shrink-0">
                                    {qty > 0 && `${qty}${unit ? ' ' + unit : ''}`}
                                    {unitPrice > 0 && qty > 0 && ' · '}
                                    {unitPrice > 0 && `฿${unitPrice.toLocaleString('th-TH')}`}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )
              ) : (courseTab === 'active' ? activeCourses : expiredCourses).length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--tx-muted)]">
                  {courseTab === 'active' ? 'ไม่มีคอร์ส' : 'ไม่มีคอร์สหมดอายุ'}
                </div>
              ) : (
                (courseTab === 'active' ? activeCourses : expiredCourses).map((course, i) => {
                  // Phase 12.2b follow-up (2026-04-25): buffet = hide
                  // "มูลค่าคงเหลือ", show days-until-expiry countdown
                  // ("หมดอายุอีก N วัน") per user directive + ProClinic
                  // parity. All other course types keep the existing
                  // value + expiry layout.
                  const isBuffetCourse = String(course.courseType || '').trim() === 'บุฟเฟต์';
                  const daysLeft = isBuffetCourse && courseTab === 'active' ? daysUntilExpiry(course.expiry) : null;
                  return (
                  <div key={i} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-[var(--tx-heading)] leading-tight">{course.name || '-'}</h4>
                        {course.parentName && (
                          <p className="text-[11px] text-orange-400/70 mt-0.5">{course.parentName}</p>
                        )}
                        {course.expiry && (
                          <p className="text-xs text-[var(--tx-muted)] mt-0.5 flex items-center gap-1">
                            <Clock size={9} /> {courseTab === 'active' ? 'ใช้ได้ถึง' : 'หมดอายุ'}: {course.expiry}
                            {daysLeft != null && (
                              <span className={`ml-1 italic ${daysLeft <= 30 ? 'text-amber-400' : 'text-violet-400'}`}>
                                {daysLeft > 0 ? `(หมดอายุอีก ${daysLeft} วัน)` : daysLeft === 0 ? '(หมดอายุวันนี้)' : `(เลยกำหนด ${Math.abs(daysLeft)} วัน)`}
                              </span>
                            )}
                          </p>
                        )}
                        {course.value && !isBuffetCourse && (
                          <p className="text-xs text-[var(--tx-muted)]">มูลค่าคงเหลือ {course.value}</p>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                        courseTab === 'active'
                          ? (isDark ? 'bg-teal-900/30 text-teal-400 border border-teal-700/40' : 'bg-teal-50 text-teal-700 border border-teal-200')
                          : (isDark ? 'bg-red-900/20 text-red-400 border border-red-700/40' : 'bg-red-50 text-red-700 border border-red-200')
                      }`}>
                        {course.status || (courseTab === 'active' ? 'กำลังใช้งาน' : 'หมดอายุ')}
                      </span>
                    </div>
                    {/* Course items — with progress bar */}
                    {course.product && <CourseItemBar course={course} courseTab={courseTab} allCourses={allCourses}
                      onAddQty={(idx) => { setAddQtyModal({ courseIndex: idx, courseName: course.name }); setAddQtyValue(''); }}
                      onExchange={(idx) => { setExchangeModal({ courseIndex: idx, course }); }}
                      onShare={(idx) => { setShareModal({ courseIndex: idx, course }); }}
                    />}
                    {/* Phase 12.2b follow-up (2026-04-24): pick-at-treatment
                        placeholder — no product row yet, show a prompt
                        with the available option count. Action happens
                        on the treatment-form side; CustomerDetailView is
                        read-only context here. */}
                    {course.needsPickSelection && Array.isArray(course.availableProducts) && (
                      <div className={`mt-2 px-2.5 py-1.5 rounded border text-[11px] flex items-center justify-between gap-2 ${isDark ? 'border-teal-800/40 bg-teal-900/10 text-teal-300' : 'border-teal-200 bg-teal-50/60 text-teal-700'}`}>
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Check size={11} className="shrink-0" />
                          <span className="truncate">เลือกสินค้าเพื่อใช้ ({course.availableProducts.length} ตัวเลือก)</span>
                        </span>
                        <span className="italic shrink-0 text-[10px] text-[var(--tx-muted)]">เลือกในหน้าสร้างการรักษา</span>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>

          {/* AddQtyModal rendered as fixed popup below */}
          </div>

          {/* ── Add Qty Popup ── */}
          {addQtyModal && <AddQtyModal
            course={allCourses[addQtyModal.courseIndex]}
            courseIndex={addQtyModal.courseIndex}
            courseName={addQtyModal.courseName}
            customerId={customer.proClinicId}
            customerName={name}
            onClose={() => setAddQtyModal(null)}
            onDone={async () => {
              const refreshed = await getCustomer(customer.proClinicId);
              if (refreshed && onCustomerUpdated) onCustomerUpdated(refreshed);
              setAddQtyModal(null);
            }}
          />}

          {/* ── Exchange Product Popup ── */}
          {exchangeModal && <ExchangeModal
            course={exchangeModal.course}
            courseIndex={exchangeModal.courseIndex}
            customerId={customer.proClinicId}
            customerName={name}
            isDark={isDark}
            onClose={() => setExchangeModal(null)}
            onDone={async () => {
              const refreshed = await getCustomer(customer.proClinicId);
              if (refreshed && onCustomerUpdated) onCustomerUpdated(refreshed);
              setExchangeModal(null);
            }}
          />}

          {/* ── Share Course Popup ── */}
          {shareModal && <ShareModal
            course={shareModal.course}
            courseIndex={shareModal.courseIndex}
            fromCustomerId={customer.proClinicId}
            fromCustomerName={name}
            isDark={isDark}
            onClose={() => setShareModal(null)}
            onDone={async () => {
              const refreshed = await getCustomer(customer.proClinicId);
              if (refreshed && onCustomerUpdated) onCustomerUpdated(refreshed);
              setShareModal(null);
            }}
          />}
        </div>
      </div>
      {/* Phase 14.5 — print document modal (shared component).
          Phase 14.2 — passes ALL clinicSettings fields (clinicName,
          clinicNameEn, clinicAddress, clinicAddressEn, clinicPhone,
          clinicLicenseNo, clinicTaxId, clinicEmail) so templates
          can render the full ProClinic letterhead. */}
      <DocumentPrintModal
        open={printDocOpen}
        onClose={() => setPrintDocOpen(false)}
        clinicSettings={clinicSettings || { accentColor: ac }}
        customer={customer}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function AddQtyModal({ course, courseIndex, courseName, customerId, customerName, onClose, onDone }) {
  const [addQty, setAddQty] = useState('');
  const [staff, setStaff] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllMasterDataItems('staff').then(s => { setStaff(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const selectedStaff = staff.find(s => String(s.id) === staffId);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title-add-qty" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center justify-between">
          <h3 id="modal-title-add-qty" className="text-sm font-bold text-teal-400">เพิ่มคงเหลือ: {courseName}</h3>
          <button onClick={onClose} className="text-[var(--tx-muted)] hover:text-red-400" aria-label="ปิด"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">จำนวนที่จะเพิ่ม</label>
            <input type="number" min="1" value={addQty} onChange={e => setAddQty(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]" placeholder="จำนวน" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">พนักงานผู้ดำเนินการ *</label>
            {loading ? <p className="text-xs text-[var(--tx-muted)]">กำลังโหลด...</p> : (
              <select value={staffId} onChange={e => setStaffId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]">
                <option value="">เลือกพนักงาน</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[var(--bd)] flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]">ยกเลิก</button>
          <button onClick={async () => {
            if (!addQty || Number(addQty) <= 0) { alert('กรุณากรอกจำนวน'); return; }
            if (!staffId) { alert('กรุณาเลือกพนักงาน'); return; }
            setSaving(true);
            try {
              await addCourseRemainingQty(customerId, courseIndex, Number(addQty));
              // Create sale record for audit
              const { createBackendSale } = await import('../../lib/backendClient.js');
              await createBackendSale(JSON.parse(JSON.stringify({
                customerId, customerName: customerName || '', customerHN: '',
                saleDate: thaiTodayISO(),
                saleNote: `เพิ่มคงเหลือ: ${courseName} +${addQty}`,
                items: { promotions: [], courses: [{ name: `เพิ่มคงเหลือ: ${courseName} +${addQty}`, qty: '1', unitPrice: '0', itemType: 'addRemaining' }], products: [], medications: [] },
                billing: { subtotal: 0, billDiscount: 0, discountType: 'amount', netTotal: 0 },
                payment: { status: 'paid', channels: [] },
                sellers: [{ id: staffId, name: selectedStaff?.name || '', percent: '0', total: '0' }],
                source: 'addRemaining',
              })));
              await onDone();
            } catch (e) { alert(e.message); }
            finally { setSaving(false); }
          }} disabled={saving || !staffId} className="px-5 py-2 rounded-lg text-xs font-bold bg-teal-700 text-white hover:bg-teal-600 disabled:opacity-40 transition-all">
            {saving ? 'กำลังบันทึก...' : 'ยืนยันเพิ่มคงเหลือ'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExchangeModal({ course, courseIndex, customerId, customerName, isDark, onClose, onDone }) {
  const [products, setProducts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [prodCategory, setProdCategory] = useState('course'); // 'course' | 'retail'
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState('');
  const [newQty, setNewQty] = useState('');
  const [staffId, setStaffId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const currentParsed = parseQtyString(course.qty);

  useEffect(() => {
    Promise.all([getAllMasterDataItems('products'), getAllMasterDataItems('staff')])
      .then(([p, s]) => { setProducts(p); setStaff(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => {
    const matchSearch = !search || (p.name || '').toLowerCase().includes(search.toLowerCase());
    const isRetail = p.type === 'สินค้าหน้าร้าน';
    const matchCategory = prodCategory === 'retail' ? isRetail : !isRetail;
    return matchSearch && matchCategory;
  });
  const selectedStaff = staff.find(s => String(s.id) === staffId);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title-exchange" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center justify-between sticky top-0 bg-[var(--bg-surface)] z-10">
          <h3 id="modal-title-exchange" className="text-sm font-bold text-sky-400">เปลี่ยนสินค้าในคอร์ส</h3>
          <button onClick={onClose} className="text-[var(--tx-muted)] hover:text-red-400" aria-label="ปิด"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`rounded-lg px-4 py-3 border ${isDark ? 'bg-sky-900/10 border-sky-700/30' : 'bg-sky-50 border-sky-200'}`}>
            <p className="text-xs text-[var(--tx-muted)]">สินค้าปัจจุบัน</p>
            <p className="text-sm font-bold text-[var(--tx-heading)]">{course.product}</p>
            <p className="text-xs text-[var(--tx-muted)] mt-1">คงเหลือ: <span className={`font-mono font-bold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>{currentParsed.remaining} / {currentParsed.total} {currentParsed.unit}</span></p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">จำนวนที่จะเปลี่ยน (จากคอร์สเดิม)</label>
            <input type="number" min="1" max={currentParsed.remaining} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]"
              placeholder={`1 - ${currentParsed.remaining} ${currentParsed.unit}`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">เลือกสินค้าใหม่</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => { setProdCategory('course'); setSelected(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${prodCategory === 'course' ? 'bg-sky-700 text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]'}`}>คอร์ส</button>
              <button onClick={() => { setProdCategory('retail'); setSelected(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${prodCategory === 'retail' ? 'bg-orange-700 text-white' : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]'}`}>สินค้าหน้าร้าน</button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
              <input value={selected ? selected.name : search}
                onChange={e => { setSearch(e.target.value); setSelected(null); }}
                onFocus={() => { if (selected) { setSearch(selected.name); setSelected(null); } }}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]"
                placeholder="ค้นหาสินค้า... (หรือเลื่อนดูด้านล่าง)" />
            </div>
            {!selected && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--bd)] mt-1">
                {loading ? (
                  <p className="text-xs text-[var(--tx-muted)] text-center py-4 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> กำลังโหลด...</p>
                ) : filtered.map(p => (
                  <button key={p.id} onClick={() => setSelected(p)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-hover)] border-b border-[var(--bd)]/50 flex items-center justify-between">
                    <span className="text-[var(--tx-secondary)]">{p.name}</span>
                    <span className="text-[var(--tx-muted)]">{p.unit || ''} {p.price ? `| ${Number(p.price).toLocaleString()} ฿` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className={`mt-2 rounded-lg px-3 py-2 flex items-center justify-between border ${isDark ? 'bg-sky-900/10 border-sky-700/30' : 'bg-sky-50 border-sky-200'}`}>
                <span className={`text-xs font-bold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>{selected.name} ({selected.unit || '-'})</span>
                <button onClick={() => setSelected(null)} className="text-xs text-[var(--tx-muted)] hover:text-red-400">เปลี่ยน</button>
              </div>
            )}
          </div>

          {/* New product qty */}
          {selected && (
            <div>
              <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">จำนวนสินค้าใหม่ ({selected.unit || '-'})</label>
              <input type="number" min="1" value={newQty} onChange={e => setNewQty(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]"
                placeholder={`จำนวน ${selected.unit || ''}`} />
            </div>
          )}

          {/* Staff selector */}
          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">พนักงานผู้ดำเนินการ *</label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]">
              <option value="">เลือกพนักงาน</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">เหตุผล (ไม่บังคับ)</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]" placeholder="ลูกค้าต้องการเปลี่ยน..." />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[var(--bd)] flex items-center justify-end gap-2 sticky bottom-0 bg-[var(--bg-surface)]">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]">ยกเลิก</button>
          <button onClick={async () => {
            if (!qty) { alert('กรุณากรอกจำนวนที่จะเปลี่ยน'); return; }
            if (Number(qty) > currentParsed.remaining) { alert(`คงเหลือไม่พอ: มี ${currentParsed.remaining} ${currentParsed.unit} ต้องการ ${qty}`); return; }
            if (!selected) { alert('กรุณาเลือกสินค้าใหม่'); return; }
            if (!newQty) { alert('กรุณากรอกจำนวนสินค้าใหม่'); return; }
            if (!staffId) { alert('กรุณาเลือกพนักงาน'); return; }
            setSaving(true);
            try {
              const { deductCourseItems, assignCourseToCustomer, createBackendSale } = await import('../../lib/backendClient.js');
              const isRetail = selected.type === 'สินค้าหน้าร้าน';
              // 1. Deduct from source course
              await deductCourseItems(customerId, [{ courseIndex, deductQty: Number(qty), courseName: course.name }]);
              // 2. Create sale record (price=0) for audit trail
              await createBackendSale(JSON.parse(JSON.stringify({
                customerId, customerName: customerName || '', customerHN: '',
                saleDate: thaiTodayISO(),
                saleNote: `เปลี่ยนสินค้า: ${qty}${currentParsed.unit} ${course.product} → ${newQty}${selected.unit || ''} ${selected.name}${isRetail ? ' (สินค้าหน้าร้าน - นำกลับบ้าน)' : ''}${reason ? ` | ${reason}` : ''}`,
                items: { promotions: [], courses: [{ name: `เปลี่ยนสินค้า: ${course.product} → ${selected.name}`, qty: '1', unitPrice: '0', itemType: 'exchange' }], products: [], medications: [] },
                billing: { subtotal: 0, billDiscount: 0, discountType: 'amount', netTotal: 0 },
                payment: { status: 'paid', channels: [] },
                sellers: [{ id: staffId, name: selectedStaff?.name || '', percent: '0', total: '0' }],
                source: 'exchange',
              })));
              // 3. Create new course ONLY if not retail (retail = take home, no new course)
              if (!isRetail) {
                await assignCourseToCustomer(customerId, {
                  name: selected.name,
                  products: [{ name: selected.name, qty: Number(newQty), unit: selected.unit || '' }],
                  source: 'exchange', parentName: `เปลี่ยนจาก: ${course.name}`,
                });
              }
              await onDone();
            } catch (e) { alert(e.message); }
            finally { setSaving(false); }
          }} disabled={saving || !selected || !staffId} className="px-5 py-2 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 disabled:opacity-40 transition-all">
            {saving ? 'กำลังบันทึก...' : 'ยืนยันเปลี่ยนสินค้า'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareModal({ course, courseIndex, fromCustomerId, fromCustomerName, isDark, onClose, onDone }) {
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [custSearch, setCustSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState(null);
  const [shareQty, setShareQty] = useState('');
  const [staffId, setStaffId] = useState('');
  const [saving, setSaving] = useState(false);

  const currentParsed = parseQtyString(course.qty);

  useEffect(() => {
    Promise.all([
      import('../../lib/backendClient.js').then(m => m.getAllCustomers()),
      getAllMasterDataItems('staff'),
    ]).then(([c, s]) => { setCustomers(c.filter(c => c.proClinicId !== fromCustomerId)); setStaff(s); setLoading(false); }).catch(() => setLoading(false));
  }, [fromCustomerId]);

  const filteredCust = customers.filter(c => {
    if (!custSearch) return true;
    const n = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.toLowerCase();
    return n.includes(custSearch.toLowerCase()) || (c.proClinicHN || '').toLowerCase().includes(custSearch.toLowerCase());
  });
  const selectedStaff = staff.find(s => String(s.id) === staffId);
  const toName = selectedCust ? `${selectedCust.patientData?.prefix || ''} ${selectedCust.patientData?.firstName || ''} ${selectedCust.patientData?.lastName || ''}`.trim() : '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title-share" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center justify-between sticky top-0 bg-[var(--bg-surface)] z-10">
          <h3 id="modal-title-share" className="text-sm font-bold text-purple-400">แชร์คอร์สให้ลูกค้าอื่น</h3>
          <button onClick={onClose} className="text-[var(--tx-muted)] hover:text-red-400" aria-label="ปิด"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`rounded-lg px-4 py-3 border ${isDark ? 'bg-purple-900/10 border-purple-700/30' : 'bg-purple-50 border-purple-200'}`}>
            <p className="text-xs text-[var(--tx-muted)]">คอร์สที่จะแชร์</p>
            <p className="text-sm font-bold text-[var(--tx-heading)]">{course.name} — {course.product}</p>
            <p className="text-xs text-[var(--tx-muted)] mt-1">จาก: <span className={isDark ? 'text-purple-400' : 'text-purple-700'}>{fromCustomerName}</span> | คงเหลือ: <span className={`font-mono font-bold ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>{currentParsed.remaining} {currentParsed.unit}</span></p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">จำนวนที่จะแชร์</label>
            <input type="number" min="1" max={currentParsed.remaining} value={shareQty} onChange={e => setShareQty(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]"
              placeholder={`1 - ${currentParsed.remaining} ${currentParsed.unit}`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">เลือกลูกค้าปลายทาง</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
              <input value={selectedCust ? toName : custSearch}
                onChange={e => { setCustSearch(e.target.value); setSelectedCust(null); }}
                onFocus={() => { if (selectedCust) { setCustSearch(toName); setSelectedCust(null); } }}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]"
                placeholder="ค้นหาลูกค้า... (ชื่อ / HN)" />
            </div>
            {!selectedCust && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--bd)] mt-1">
                {loading ? (
                  <p className="text-xs text-[var(--tx-muted)] text-center py-4 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> กำลังโหลด...</p>
                ) : filteredCust.slice(0, 30).map(c => {
                  const cName = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.trim();
                  return (
                    <button key={c.id || c.proClinicId} onClick={() => setSelectedCust(c)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-hover)] border-b border-[var(--bd)]/50 flex items-center justify-between">
                      <span className="text-[var(--tx-secondary)]">{cName}</span>
                      <span className="text-[var(--tx-muted)] font-mono">{c.proClinicHN || ''}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedCust && (
              <div className={`mt-2 rounded-lg px-3 py-2 flex items-center justify-between border ${isDark ? 'bg-purple-900/10 border-purple-700/30' : 'bg-purple-50 border-purple-200'}`}>
                <span className={`text-xs font-bold ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>{toName} <span className="font-mono text-[var(--tx-muted)]">{selectedCust.proClinicHN || ''}</span></span>
                <button onClick={() => setSelectedCust(null)} className="text-xs text-[var(--tx-muted)] hover:text-red-400">เปลี่ยน</button>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">พนักงานผู้ดำเนินการ *</label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]">
              <option value="">เลือกพนักงาน</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[var(--bd)] flex items-center justify-end gap-2 sticky bottom-0 bg-[var(--bg-surface)]">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]">ยกเลิก</button>
          <button onClick={async () => {
            if (!shareQty || Number(shareQty) <= 0) { alert('กรุณากรอกจำนวน'); return; }
            if (!selectedCust) { alert('กรุณาเลือกลูกค้าปลายทาง'); return; }
            if (!staffId) { alert('กรุณาเลือกพนักงาน'); return; }
            if (Number(shareQty) > currentParsed.remaining) { alert(`คงเหลือไม่พอ: มี ${currentParsed.remaining} ต้องการ ${shareQty}`); return; }
            setSaving(true);
            try {
              const { deductCourseItems, assignCourseToCustomer, createBackendSale } = await import('../../lib/backendClient.js');
              const toId = selectedCust.proClinicId || selectedCust.id;
              // 1. Deduct from source customer
              await deductCourseItems(fromCustomerId, [{ courseIndex, deductQty: Number(shareQty), courseName: course.name }]);
              // 2. Assign to target customer
              await assignCourseToCustomer(toId, {
                name: course.name,
                products: [{ name: course.product, qty: Number(shareQty), unit: currentParsed.unit }],
                source: 'share', parentName: `แชร์จาก: ${fromCustomerName} (${course.name})`,
              });
              // 3. Create sale record (price=0)
              await createBackendSale(JSON.parse(JSON.stringify({
                customerId: fromCustomerId, customerName: fromCustomerName, customerHN: '',
                saleDate: thaiTodayISO(),
                saleNote: `แชร์คอร์ส: ${shareQty} ${currentParsed.unit} ${course.product} → ${toName}`,
                items: { promotions: [], courses: [{ name: `แชร์คอร์ส: ${course.product} → ${toName}`, qty: '1', unitPrice: '0', itemType: 'share' }], products: [], medications: [] },
                billing: { subtotal: 0, billDiscount: 0, discountType: 'amount', netTotal: 0 },
                payment: { status: 'paid', channels: [] },
                sellers: [{ id: staffId, name: selectedStaff?.name || '', percent: '0', total: '0' }],
                source: 'share',
                shareDetail: { fromCustomerId, fromCustomerName, toCustomerId: toId, toCustomerName: toName, courseName: course.name, product: course.product, qty: Number(shareQty), unit: currentParsed.unit },
              })));
              await onDone();
            } catch (e) { alert(e.message); }
            finally { setSaving(false); }
          }} disabled={saving || !selectedCust || !staffId} className="px-5 py-2 rounded-lg text-xs font-bold bg-purple-700 text-white hover:bg-purple-600 disabled:opacity-40 transition-all">
            {saving ? 'กำลังบันทึก...' : 'ยืนยันแชร์คอร์ส'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CourseItemBar({ course, courseTab, allCourses, onAddQty, onExchange, onShare }) {
  const parsed = parseQtyString(course.qty);
  const pct = parsed.total > 0 ? (parsed.remaining / parsed.total * 100) : 0;
  const origIdx = allCourses.findIndex(c => c.name === course.name && c.product === course.product && c.qty === course.qty);
  // Phase 12.2b follow-up (2026-04-24): fill-later (เหมาตามจริง) courses
  // display "เหมาตามจริง" in the qty column instead of the raw "1/1 U"
  // sentinel — the "1" is a placeholder for "one-shot use", not a real
  // remaining balance. The progress bar uses a distinct violet tone so
  // the card visually separates from specific-qty courses even when
  // still "กำลังใช้งาน" (bought but not yet used).
  const isRealQty = String(course.courseType || '').trim() === 'เหมาตามจริง';
  // Phase 12.2b follow-up (2026-04-25): buffet = unlimited until expiry.
  // Display "บุฟเฟต์" in the qty column (matching ProClinic). Progress
  // bar stays full + violet (same tone as fill-later — both are
  // "stock-doesn't-decrement" course concepts).
  const isBuffet = String(course.courseType || '').trim() === 'บุฟเฟต์';
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--tx-secondary)]">{course.product}</span>
        {isRealQty ? (
          <span className="font-mono font-bold text-violet-400">เหมาตามจริง</span>
        ) : isBuffet ? (
          <span className="font-mono font-bold text-violet-400">บุฟเฟต์</span>
        ) : (
          <span className="font-mono font-bold text-[var(--tx-heading)]">{parsed.remaining} / {parsed.total} {parsed.unit}</span>
        )}
      </div>
      <div className="w-full h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{
            width: (isRealQty || isBuffet) ? '100%' : `${pct}%`,
            // Violet for fill-later + buffet (unlimited/one-shot concepts);
            // teal/amber/red for standard by %.
            backgroundColor: (isRealQty || isBuffet)
              ? '#a855f7'
              : (pct > 50 ? '#14b8a6' : pct > 20 ? '#f59e0b' : '#ef4444'),
          }} />
      </div>
      {courseTab === 'active' && (
        <div className="flex items-center gap-3">
          <button onClick={() => onAddQty(origIdx)}
            className="text-[11px] text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 transition-colors">
            <Plus size={10} /> เพิ่มคงเหลือ
          </button>
          <button onClick={() => onExchange(origIdx)}
            className="text-[11px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 transition-colors">
            <RefreshCw size={10} /> เปลี่ยนสินค้า
          </button>
          <button onClick={() => onShare(origIdx)}
            className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 transition-colors">
            <Users size={10} /> แชร์คอร์ส
          </button>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, icon, className = '' }) {
  if (!value || value === '-') {
    return (
      <div className="flex items-start py-2 border-b border-[var(--bd)]/50 last:border-0">
        <span className="text-xs text-[var(--tx-muted)] w-28 flex-shrink-0">{label}</span>
        <span className="text-xs text-[var(--tx-muted)]">-</span>
      </div>
    );
  }
  return (
    <div className="flex items-start py-2 border-b border-[var(--bd)]/50 last:border-0">
      <span className="text-xs text-[var(--tx-muted)] w-28 flex-shrink-0">{label}</span>
      <span className={`text-xs text-[var(--tx-secondary)] flex items-center gap-1 break-all leading-relaxed ${className}`}>
        {icon} {value}
      </span>
    </div>
  );
}

function DetailField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs font-semibold text-[var(--tx-muted)]">{label}</span>
      <p className="text-sm text-[var(--tx-secondary)] mt-0.5 whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

function TreatmentDetailExpanded({ detail, ac, acRgb, isDark }) {
  const d = detail || {};
  const vitals = d.vitals || {};
  const meds = d.medications || d.takeHomeMeds || [];
  const items = d.treatmentItems || [];
  const consumables = d.consumables || [];
  const labItems = d.labItems || [];
  const doctorFees = d.doctorFees || [];
  const medCert = d.medCert || {};
  const beforeImgs = d.beforeImages || [];
  const afterImgs = d.afterImages || [];
  const otherImgs = d.otherImages || [];
  const hasImages = beforeImgs.length > 0 || afterImgs.length > 0 || otherImgs.length > 0;

  return (
    <div className="bg-[var(--bg-elevated)] rounded-lg p-3 space-y-3">
      {/* Vitals */}
      {(vitals.weight || vitals.height || vitals.temperature) && (
        <div>
          <span className="text-xs font-semibold text-[var(--tx-muted)] flex items-center gap-1">
            <Activity size={10} /> สัญญาณชีพ
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {vitals.weight && <VitalPill label="น้ำหนัก" value={`${vitals.weight} kg`} />}
            {vitals.height && <VitalPill label="ส่วนสูง" value={`${vitals.height} cm`} />}
            {vitals.temperature && <VitalPill label="BT" value={`${vitals.temperature} C`} />}
            {vitals.pulseRate && <VitalPill label="PR" value={`${vitals.pulseRate}/min`} />}
            {vitals.systolicBP && <VitalPill label="BP" value={`${vitals.systolicBP}/${vitals.diastolicBP || '?'}`} />}
            {vitals.oxygenSaturation && <VitalPill label="O2" value={`${vitals.oxygenSaturation}%`} />}
          </div>
        </div>
      )}

      {/* OPD Card */}
      <DetailField label="อาการ (CC)" value={d.symptoms} />
      <DetailField label="ตรวจร่างกาย (PE)" value={d.physicalExam} />
      <DetailField label="วินิจฉัย (DX)" value={d.diagnosis} />
      <DetailField label="การรักษา (Tx)" value={d.treatmentInfo} />
      <DetailField label="แผนการรักษา" value={d.treatmentPlan} />
      <DetailField label="หมายเหตุ" value={d.treatmentNote} />
      <DetailField label="หมายเหตุเพิ่มเติม" value={d.additionalNote} />

      {/* Treatment items */}
      <ItemList icon={<Pill size={10} />} label="รายการรักษา" items={items} nameKey="name" qtyKey="qty" unitKey="unit" />

      {/* Consumables */}
      <ItemList icon={<Package size={10} />} label="สินค้าสิ้นเปลือง" items={consumables} nameKey="name" qtyKey="qty" unitKey="unit" />

      {/* Medications */}
      {meds.length > 0 && (
        <div>
          <span className="text-xs font-semibold text-[var(--tx-muted)] flex items-center gap-1">
            <Pill size={10} /> ยากลับบ้าน
          </span>
          <div className="mt-1 space-y-1">
            {meds.map((med, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-[var(--bg-card)] rounded px-2 py-1">
                <span className="text-[var(--tx-secondary)]">{med.name || med.productName || '-'}</span>
                <span className="font-mono text-[var(--tx-muted)]">{med.qty || ''} {med.dosage || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lab — enhanced with price + info */}
      {labItems.length > 0 && (
        <div>
          <span className="text-xs font-semibold text-[var(--tx-muted)] flex items-center gap-1">
            <Droplets size={10} /> Lab
          </span>
          <div className="mt-1 space-y-1">
            {labItems.map((lab, i) => (
              <div key={i} className="text-xs bg-[var(--bg-card)] rounded px-2 py-1">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--tx-secondary)]">{lab.productName || '-'}</span>
                  <span className="font-mono text-[var(--tx-muted)]">
                    {lab.qty || ''}{lab.price ? ` | ${Number(lab.price).toLocaleString()} ฿` : ''}
                  </span>
                </div>
                {lab.information && <p className="text-xs text-[var(--tx-muted)] mt-0.5">{lab.information}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Doctor Fees */}
      {doctorFees.length > 0 && (
        <div>
          <span className="text-xs font-semibold text-[var(--tx-muted)] flex items-center gap-1">
            <Stethoscope size={10} /> ค่ามือ
          </span>
          <div className="mt-1 space-y-1">
            {doctorFees.map((df, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-[var(--bg-card)] rounded px-2 py-1">
                <span className="text-[var(--tx-secondary)]">{df.name || df.product || '-'}</span>
                <span className="font-mono text-[var(--tx-muted)]">{df.fee ? `${Number(df.fee).toLocaleString()} ฿` : '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Medical Certificate */}
      {(medCert.isActuallyCome || medCert.isRest || medCert.isOther || d.medCertActuallyCome) && (
        <div>
          <span className="text-xs font-semibold text-[var(--tx-muted)] flex items-center gap-1">
            <Shield size={10} /> ใบรับรองแพทย์
          </span>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {(medCert.isActuallyCome || d.medCertActuallyCome) && <span className={`px-1.5 py-0.5 rounded ${isDark ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-50 text-sky-700'}`}>มาตรวจจริง</span>}
            {(medCert.isRest || d.medCertIsRest) && <span className={`px-1.5 py-0.5 rounded ${isDark ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-700'}`}>พักงาน {medCert.period || d.medCertPeriod || ''}</span>}
            {(medCert.isOther || d.medCertIsOther) && <span className={`px-1.5 py-0.5 rounded ${isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-700'}`}>{medCert.otherDetail || d.medCertOtherDetail || 'อื่นๆ'}</span>}
          </div>
        </div>
      )}

      {/* Before/After/Other Images */}
      {hasImages && (
        <div>
          <span className="text-xs font-semibold text-[var(--tx-muted)] flex items-center gap-1">
            <FileText size={10} /> รูปภาพ
          </span>
          <div className="mt-1 space-y-2">
            <ImageRow label="Before" images={beforeImgs} />
            <ImageRow label="After" images={afterImgs} />
            <ImageRow label="Other" images={otherImgs} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Reusable item list (treatment items, consumables, etc.) */
function ItemList({ icon, label, items, nameKey = 'name', qtyKey = 'qty', unitKey = 'unit' }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <span className="text-xs font-semibold text-[var(--tx-muted)] flex items-center gap-1">
        {icon} {label}
      </span>
      <div className="mt-1 space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs bg-[var(--bg-card)] rounded px-2 py-1">
            <span className="text-[var(--tx-secondary)]">{item[nameKey] || item.productName || '-'}</span>
            <span className="font-mono text-[var(--tx-muted)]">{item[qtyKey] || ''} {item[unitKey] || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Thumbnail row for treatment images */
function ImageRow({ label, images }) {
  if (!images || images.length === 0) return null;
  return (
    <div>
      <span className="text-[11px] text-[var(--tx-muted)] font-medium">{label} ({images.length})</span>
      <div className="flex flex-wrap gap-1.5 mt-0.5">
        {images.map((img, i) => {
          const src = typeof img === 'string' ? img : img?.dataUrl || '';
          if (!src) return null;
          return (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer"
              className="w-14 h-14 rounded border border-[var(--bd)] overflow-hidden flex-shrink-0 hover:ring-1 hover:ring-orange-500 transition-all">
              <img src={src} alt={`${label} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function VitalPill({ label, value }) {
  return (
    <span className="text-xs text-[var(--tx-secondary)]">
      <span className="text-[var(--tx-muted)]">{label}:</span> {value}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAddress(pd) {
  const parts = [pd.address, pd.subDistrict, pd.district, pd.province, pd.postalCode].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '-';
}

function formatUnderlying(pd) {
  const items = [];
  if (pd.ud_hypertension) items.push('ความดันโลหิตสูง');
  if (pd.ud_diabetes) items.push('เบาหวาน');
  if (pd.ud_heart) items.push('โรคหัวใจ');
  if (pd.ud_lung) items.push('โรคปอด');
  if (pd.ud_kidney) items.push('โรคไต');
  if (pd.ud_blood) items.push('โรคเลือด');
  if (pd.ud_other && pd.ud_otherDetail) items.push(pd.ud_otherDetail);
  return items.length > 0 ? items.join(', ') : pd.ud_otherDetail || '-';
}
