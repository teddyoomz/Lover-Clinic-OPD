// ─── CustomerDetailView — 3-column customer detail (mimics ProClinic layout) ─
// Left: Profile card | Center: Appointments + Treatment timeline | Right: Courses tabs

import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, User, Phone, MapPin, Calendar, Stethoscope, Package,
  Clock, AlertCircle, CheckCircle2, Heart, Pill, FileText, ChevronDown,
  ChevronUp, Activity, Loader2, RefreshCw, Droplets, Shield, Plus, Edit3, Trash2,
  Search, X
} from 'lucide-react';
import { getCustomerTreatments, getCustomerSales, addCourseRemainingQty, getCustomer, exchangeCourseProduct, getAllMasterDataItems } from '../../lib/backendClient.js';
import { parseQtyString } from '../../lib/courseUtils.js';
import { hexToRgb } from '../../utils.js';

// ─── Helper: format Thai date ───────────────────────────────────────────────
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function formatThaiDateFull(dateStr) {
  if (!dateStr) return '-';
  // Handle "2026-04-08" or Thai date strings
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${d} ${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
  }
  // Already Thai format — return as is
  if (THAI_MONTHS_FULL.some(mn => dateStr.includes(mn))) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${THAI_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatThaiDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
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
export default function CustomerDetailView({ customer, accentColor, onBack, onCreateTreatment, onEditTreatment, onDeleteTreatment, onCustomerUpdated, onCreateSale }) {
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
  const activeCourses = allCourses.filter(c => {
    const { remaining } = parseQtyString(c.qty);
    return remaining > 0;
  });
  const usedUpCourses = allCourses.filter(c => {
    const { remaining } = parseQtyString(c.qty);
    return remaining <= 0;
  });
  const expiredCourses = [...(customer?.expiredCourses || []), ...usedUpCourses];
  const appointments = customer?.appointments || [];
  const treatmentSummary = customer?.treatmentSummary || [];

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
                    <span className="text-amber-500 flex items-center gap-1 font-medium"><AlertCircle size={12} /> Clone บางส่วน</span>
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
                <InfoRow label="แพ้ยา" value={pd.allergiesDetail} className="text-amber-400" />
              )}
              {pd.hasUnderlying === 'มี' && (
                <InfoRow label="โรคประจำตัว" value={formatUnderlying(pd)} className="text-amber-400" />
              )}
              {pd.emergencyName && (
                <InfoRow label="ผู้ติดต่อฉุกเฉิน" value={`${pd.emergencyName} (${pd.emergencyRelation || '-'}) ${pd.emergencyPhone || ''}`} />
              )}
              {pd.howFoundUs?.length > 0 && (
                <InfoRow label="ที่มา" value={Array.isArray(pd.howFoundUs) ? pd.howFoundUs.join(', ') : pd.howFoundUs} />
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
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-900/30 text-sky-400 font-bold">{appointments.length}</span>
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
              {onCreateTreatment && (
                <button onClick={onCreateTreatment}
                  className="ml-auto text-xs font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 hover:shadow-md active:scale-95"
                  style={{ color: ac, borderColor: `rgba(${acRgb},0.3)`, backgroundColor: `rgba(${acRgb},0.08)` }}>
                  <Plus size={11} /> สร้างการรักษา
                </button>
              )}
            </div>

            {treatmentsError && (
              <div className="px-4 py-3 text-xs text-amber-400 flex items-center gap-2 bg-amber-900/10 border-b border-[var(--bd)]">
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
                            <TreatmentDetailExpanded detail={detail.detail} ac={ac} acRgb={acRgb} />
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
            <div className="flex items-center border-b border-[var(--bd)]">
              <button onClick={() => setCourseTab('active')}
                className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  courseTab === 'active' ? 'text-teal-400 border-b-2 border-teal-400 bg-teal-900/10' : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
                }`}>
                <Package size={13} /> คอร์สของฉัน
                {activeCourses.length > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-teal-900/30 text-teal-400">{activeCourses.length}</span>
                )}
              </button>
              <button onClick={() => setCourseTab('expired')}
                className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  courseTab === 'expired' ? 'text-red-400 border-b-2 border-red-400 bg-red-900/10' : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
                }`}>
                คอร์สหมดอายุ
                {expiredCourses.length > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-400">{expiredCourses.length}</span>
                )}
              </button>
              <button onClick={() => setCourseTab('purchases')}
                className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  courseTab === 'purchases' ? 'text-rose-400 border-b-2 border-rose-400 bg-rose-900/10' : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
                }`}>
                ประวัติการซื้อ
                {customerSales.length > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-900/30 text-rose-400">{customerSales.length}</span>
                )}
              </button>
              {/* Assign course button */}
              <button onClick={() => onCreateSale?.(customer)}
                className="px-2 py-2 text-teal-400 hover:text-teal-300 transition-colors" title="ขายคอร์สใหม่ให้ลูกค้า">
                <Plus size={16} />
              </button>
            </div>

            {/* Content by tab — scrollable for large course lists */}
            <div className="divide-y divide-[var(--bd)] max-h-[600px] overflow-y-auto">
              {salesError && courseTab === 'purchases' && (
                <div className="px-4 py-3 text-xs text-amber-400 flex items-center gap-2 bg-amber-900/10">
                  <AlertCircle size={13} /> {salesError}
                </div>
              )}
              {courseTab === 'purchases' ? (
                /* Purchase History */
                customerSales.length === 0 && !salesError ? (
                  <div className="p-8 text-center text-sm text-[var(--tx-muted)]">ไม่มีประวัติการซื้อ</div>
                ) : (
                  customerSales.map((sale, i) => (
                    <div key={i} className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-[var(--tx-muted)]">{sale.saleId || '-'}</span>
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                          sale.payment?.status === 'paid' ? 'bg-emerald-900/30 text-emerald-400' :
                          sale.payment?.status === 'cancelled' || sale.status === 'cancelled' ? 'bg-red-900/30 text-red-400' :
                          'bg-amber-900/30 text-amber-400'
                        }`}>{sale.payment?.status === 'paid' ? 'ชำระแล้ว' : sale.status === 'cancelled' ? 'ยกเลิก' : 'ค้างชำระ'}</span>
                      </div>
                      <p className="text-xs text-[var(--tx-secondary)] mt-0.5">{formatThaiDateFull(sale.saleDate)}</p>
                      <p className="text-sm font-bold text-[var(--tx-heading)] font-mono">{sale.billing?.netTotal != null ? Number(sale.billing.netTotal).toLocaleString() : '0'} บาท</p>
                    </div>
                  ))
                )
              ) : (courseTab === 'active' ? activeCourses : expiredCourses).length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--tx-muted)]">
                  {courseTab === 'active' ? 'ไม่มีคอร์ส' : 'ไม่มีคอร์สหมดอายุ'}
                </div>
              ) : (
                (courseTab === 'active' ? activeCourses : expiredCourses).map((course, i) => (
                  <div key={i} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-[var(--tx-heading)] leading-tight">{course.name || '-'}</h4>
                        {course.expiry && (
                          <p className="text-xs text-[var(--tx-muted)] mt-0.5 flex items-center gap-1">
                            <Clock size={9} /> {courseTab === 'active' ? 'ใช้ได้ถึง' : 'หมดอายุ'}: {course.expiry}
                          </p>
                        )}
                        {course.value && (
                          <p className="text-xs text-[var(--tx-muted)]">มูลค่าคงเหลือ {course.value}</p>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                        courseTab === 'active'
                          ? 'bg-teal-900/30 text-teal-400 border border-teal-700/40'
                          : 'bg-red-900/20 text-red-400 border border-red-700/40'
                      }`}>
                        {course.status || (courseTab === 'active' ? 'กำลังใช้งาน' : 'หมดอายุ')}
                      </span>
                    </div>
                    {/* Course items — with progress bar */}
                    {course.product && <CourseItemBar course={course} courseTab={courseTab} allCourses={allCourses}
                      onAddQty={(idx) => { setAddQtyModal({ courseIndex: idx, courseName: course.name }); setAddQtyValue(''); }}
                      onExchange={(idx) => {
                        setExchangeModal({ courseIndex: idx, course });
                      }}
                    />}
                  </div>
                ))
              )}
            </div>

            {/* Add Remaining Modal */}
            {addQtyModal && (
              <div className="p-3 border-t border-[var(--bd)]">
                <p className="text-xs font-bold text-[var(--tx-heading)] mb-2">เพิ่มคงเหลือ: {addQtyModal.courseName}</p>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" value={addQtyValue} onChange={e => setAddQtyValue(e.target.value)}
                    placeholder="จำนวน" className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none" />
                  <button onClick={async () => {
                    if (!addQtyValue || Number(addQtyValue) <= 0) return;
                    setAddQtySaving(true);
                    try {
                      await addCourseRemainingQty(customer.proClinicId, addQtyModal.courseIndex, Number(addQtyValue));
                      if (onCustomerUpdated) {
                        const refreshed = await getCustomer(customer.proClinicId);
                        if (refreshed) onCustomerUpdated(refreshed);
                      }
                      setAddQtyModal(null);
                    } catch (e) { alert(e.message); }
                    finally { setAddQtySaving(false); }
                  }} disabled={addQtySaving || !addQtyValue}
                    className="px-3 py-2 rounded-lg text-xs font-bold bg-teal-700 text-white hover:bg-teal-600 disabled:opacity-40 transition-all">
                    {addQtySaving ? 'กำลังบันทึก...' : 'ยืนยัน'}
                  </button>
                  <button onClick={() => setAddQtyModal(null)} className="px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]">
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Exchange Product Popup ── */}
          {exchangeModal && <ExchangeModal
            course={exchangeModal.course}
            courseIndex={exchangeModal.courseIndex}
            customerId={customer.proClinicId}
            onClose={() => setExchangeModal(null)}
            onDone={async () => {
              const refreshed = await getCustomer(customer.proClinicId);
              if (refreshed && onCustomerUpdated) onCustomerUpdated(refreshed);
              setExchangeModal(null);
            }}
          />}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ExchangeModal({ course, courseIndex, customerId, onClose, onDone }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const currentParsed = parseQtyString(course.qty);

  // Load products on mount
  useEffect(() => {
    getAllMasterDataItems('products').then(p => { setProducts(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => !search || (p.name || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center justify-between sticky top-0 bg-[var(--bg-surface)] z-10">
          <h3 className="text-sm font-bold text-sky-400">เปลี่ยนสินค้าในคอร์ส</h3>
          <button onClick={onClose} className="text-[var(--tx-muted)] hover:text-red-400"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-sky-900/10 border border-sky-700/30 rounded-lg px-4 py-3">
            <p className="text-xs text-[var(--tx-muted)]">สินค้าปัจจุบัน</p>
            <p className="text-sm font-bold text-[var(--tx-heading)]">{course.product}</p>
            <p className="text-xs text-[var(--tx-muted)] mt-1">คงเหลือ: <span className="font-mono font-bold text-sky-400">{currentParsed.remaining} / {currentParsed.total} {currentParsed.unit}</span></p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">จำนวนที่จะเปลี่ยน (จากคอร์สเดิม)</label>
            <input type="number" min="1" max={currentParsed.remaining} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]"
              placeholder={`1 - ${currentParsed.remaining} ${currentParsed.unit}`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">เลือกสินค้าใหม่</label>
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
                  <p className="text-xs text-[var(--tx-muted)] text-center py-4 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> กำลังโหลดสินค้า...</p>
                ) : filtered.length === 0 ? (
                  <p className="text-xs text-[var(--tx-muted)] text-center py-3">ไม่พบสินค้า</p>
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
              <div className="mt-2 bg-sky-900/10 border border-sky-700/30 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-bold text-sky-400">{selected.name} <span className="text-[var(--tx-muted)] font-normal">({selected.unit || '-'})</span></span>
                <button onClick={() => setSelected(null)} className="text-xs text-[var(--tx-muted)] hover:text-red-400">เปลี่ยน</button>
              </div>
            )}
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
            if (!selected) { alert('กรุณาเลือกสินค้าใหม่'); return; }
            setSaving(true);
            try {
              await exchangeCourseProduct(customerId, courseIndex, { name: selected.name, qty: Number(qty), unit: selected.unit || '' }, reason);
              await onDone();
            } catch (e) { alert(e.message); }
            finally { setSaving(false); }
          }} disabled={saving || !selected} className="px-5 py-2 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 disabled:opacity-40 transition-all">
            {saving ? 'กำลังบันทึก...' : 'ยืนยันเปลี่ยนสินค้า'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CourseItemBar({ course, courseTab, allCourses, onAddQty, onExchange }) {
  const parsed = parseQtyString(course.qty);
  const pct = parsed.total > 0 ? (parsed.remaining / parsed.total * 100) : 0;
  const origIdx = allCourses.indexOf(course);
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--tx-secondary)]">{course.product}</span>
        <span className="font-mono font-bold text-[var(--tx-heading)]">{parsed.remaining} / {parsed.total} {parsed.unit}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: pct > 50 ? '#14b8a6' : pct > 20 ? '#f59e0b' : '#ef4444' }} />
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

function TreatmentDetailExpanded({ detail, ac, acRgb }) {
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
            {(medCert.isActuallyCome || d.medCertActuallyCome) && <span className="px-1.5 py-0.5 rounded bg-sky-900/30 text-sky-400">มาตรวจจริง</span>}
            {(medCert.isRest || d.medCertIsRest) && <span className="px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400">พักงาน {medCert.period || d.medCertPeriod || ''}</span>}
            {(medCert.isOther || d.medCertIsOther) && <span className="px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">{medCert.otherDetail || d.medCertOtherDetail || 'อื่นๆ'}</span>}
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
              className="w-14 h-14 rounded border border-[var(--bd)] overflow-hidden flex-shrink-0 hover:ring-1 hover:ring-amber-500 transition-all">
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
