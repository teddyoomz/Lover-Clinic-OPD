// ─── BackendDashboard ──────────────────────────────────────────────────────
// ระบบหลังบ้าน — main container page.
// Tabs: Sync ข้อมูล | ค้นหาลูกค้า
// Customer detail: 3-column layout matching ProClinic.

import { useState } from 'react';
import { ArrowLeft, RefreshCw, Search, X, User, Phone, MapPin, Heart, Stethoscope,
         AlertCircle, Hash, Calendar, Shield, UserCheck, ClipboardList, Package, PackageX,
         Loader2, CreditCard, Activity, Weight, Ruler, Star, Wallet, ShoppingCart,
         Briefcase, FileText, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import BackendSyncPanel from '../components/BackendSyncPanel.jsx';
import BackendCustomerSearch from '../components/BackendCustomerSearch.jsx';
import * as backend from '../lib/backendClient.js';
import { formatPhoneNumberDisplay } from '../utils.js';

// ── Underlying condition labels ──────────────────────────────────────────
const UD_LABELS = {
  ud_hypertension: 'ความดันโลหิตสูง',
  ud_diabetes: 'เบาหวาน',
  ud_lung: 'โรคปอด',
  ud_kidney: 'โรคไต',
  ud_heart: 'โรคหัวใจ',
  ud_blood: 'โรคเลือด',
};

// ── Label-Value Row (ProClinic style) ────────────────────────────────────
function LabelValue({ label, value, bold }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[var(--bd)] last:border-0 text-[11px]">
      <span className="text-[var(--tx-muted)] flex-shrink-0">{label}</span>
      <span className={`text-[var(--tx-primary)] text-right ml-2 ${bold ? 'font-bold' : ''}`}>{value || '-'}</span>
    </div>
  );
}

// ── Course Card (ProClinic style) ────────────────────────────────────────
function CourseCard({ course, active }) {
  const c = course || {};
  return (
    <div className={`p-3 rounded-lg border mb-2 ${active ? 'bg-emerald-500/5 border-emerald-700/30' : 'bg-[var(--bg-hover)] border-[var(--bd)] opacity-60'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold ${active ? 'text-emerald-400' : 'text-[var(--tx-muted)]'}`}>{c.name || '—'}</p>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--tx-muted)]">
            {c.product && <span>{c.product}</span>}
            {c.qty && <span>ใช้ {c.qty} ครั้ง</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--tx-muted)]">
            {c.expiry && <span>หมดอายุ {c.expiry}</span>}
            {c.status && <span className="px-1 py-0.5 rounded text-[8px] bg-[var(--bg-hover2)]">{c.status}</span>}
          </div>
        </div>
        {c.value && (
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-[var(--tx-muted)]">เหลือ</p>
            <p className={`text-xs font-bold ${active ? 'text-emerald-400' : 'text-[var(--tx-muted)]'}`}>{c.value}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Treatment Entry (ProClinic timeline style) ──────────────────────────
function TreatmentEntry({ t, isLast }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="relative pl-6 pb-4">
      {/* Timeline dot + line */}
      <div className="absolute left-0 top-1 w-3 h-3 rounded-full bg-violet-500 border-2 border-[var(--bg-base)] z-10" />
      {!isLast && <div className="absolute left-[5px] top-4 bottom-0 w-0.5 bg-[var(--bd)]" />}

      {/* Date header */}
      <div className="flex items-center gap-2 mb-1 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-xs font-bold text-[var(--tx-heading)]">{t.date || '—'}</span>
        {expanded ? <ChevronDown size={12} className="text-[var(--tx-muted)]" /> : <ChevronRight size={12} className="text-[var(--tx-muted)]" />}
      </div>

      {/* Branch + Doctor */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] mb-1">
        {t.branch && <span className="px-1.5 py-0.5 rounded bg-sky-700/20 text-sky-400">สาขา {t.branch}</span>}
        {t.doctor && <span className="text-[var(--tx-secondary)]">{t.doctor}</span>}
        {t.assistants?.length > 0 && t.assistants.map((a, i) => (
          <span key={i} className="text-[var(--tx-muted)]">{a}</span>
        ))}
      </div>

      {/* OPD summary (always visible) */}
      {t.cc && <p className="text-[10px] text-[var(--tx-secondary)] mb-0.5"><span className="text-[var(--tx-muted)]">อาการ:</span> {t.cc}</p>}
      {t.dx && <p className="text-[10px] text-[var(--tx-secondary)]"><span className="text-[var(--tx-muted)]">วินิจฉัยโรค:</span> {t.dx}</p>}

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-2 space-y-1 text-[10px]">
          {t.treatmentInfo && <p className="text-[var(--tx-secondary)]"><span className="text-[var(--tx-muted)]">รายละเอียดการรักษา:</span> {t.treatmentInfo}</p>}
          {t.plan && <p className="text-[var(--tx-secondary)]"><span className="text-[var(--tx-muted)]">แผนการรักษา:</span> {t.plan}</p>}
          {t.productsText && (
            <div className="mt-1 p-2 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]">
              {t.productsText}
            </div>
          )}
          {t.hasConsent && <p className="text-emerald-400 mt-1">คนไข้เซ็นยินยอมการรักษา</p>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── Customer Detail Overlay (3-column ProClinic layout) ──────────────────
// ══════════════════════════════════════════════════════════════════════════

function CustomerDetailOverlay({ data, isDark, onClose, onOpenTreatmentForm, backendTreatments }) {
  if (!data) return null;
  const { proClinicId, proClinicHN, patient, profile, courses, expiredCourses, appointments, treatments } = data;
  const p = patient || {};
  const pr = profile || {};
  const fullName = `${p.prefix || ''} ${p.firstName || ''} ${p.lastName || ''}`.trim() || pr.name || '';
  const initial = (fullName.replace(/^(นาย|นาง|นางสาว|คุณ|Mr\.|Ms\.|Mrs\.)\s*/i, '')[0] || '?').toUpperCase();

  const underlyingList = Object.entries(UD_LABELS).filter(([key]) => p[key]).map(([, label]) => label);
  if (p.ud_other && p.ud_otherDetail) underlyingList.push(p.ud_otherDetail);

  const allTreatments = treatments || [];
  const [showExpiredCourses, setShowExpiredCourses] = useState(false);

  // Find next future appointment
  const today = new Date().toISOString().split('T')[0];
  const nextAppt = (appointments || []).find(a => a.date >= today);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--bg-base)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--bd)] bg-[var(--bg-surface)] flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-all">
          <ArrowLeft size={16} className="text-[var(--tx-secondary)]" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[var(--tx-heading)]">ข้อมูลลูกค้า</h3>
        </div>
        <button
          onClick={() => onOpenTreatmentForm({ mode: 'create', customerId: proClinicId, patientName: fullName, patientData: p, saveTarget: 'backend' })}
          className="text-[10px] px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold transition-all flex items-center gap-1"
        >
          <ClipboardList size={10} /> บันทึกการรักษา
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-all">
          <X size={16} className="text-[var(--tx-muted)]" />
        </button>
      </div>

      {/* 3-Column Layout */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-4 p-4 max-w-[1400px] mx-auto">

          {/* ═══ LEFT COLUMN: Personal Info (ProClinic sidebar style) ═══ */}
          <div className="space-y-3">
            {/* Avatar + Name + HN */}
            <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4 text-center">
              {pr.branch && <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-700/20 text-sky-400 mb-2 inline-block">สาขา {pr.branch}</span>}
              <div className="w-16 h-16 rounded-full bg-[var(--bg-hover2)] flex items-center justify-center text-2xl font-bold text-[var(--tx-muted)] mx-auto my-2">
                {initial}
              </div>
              {/* ห้ามใช้สีแดงกับชื่อ/HN */}
              <p className="text-[11px] text-violet-400 font-mono">{proClinicHN || pr.hn || ''}</p>
              <h4 className="text-sm font-bold text-[var(--tx-heading)] mt-0.5">{fullName || 'ไม่ทราบชื่อ'}</h4>
              {/* Badges */}
              {pr.badges?.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                  {pr.badges.map((b, i) => (
                    <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-violet-700/20 text-violet-400">{b}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Stats (Recency/Frequency/Monetary) */}
            {(pr.recency || pr.frequency || pr.monetary) && (
              <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[9px] text-[var(--tx-muted)]">Recency</p>
                    <p className="text-sm font-bold text-violet-400">{pr.recency || '0'}</p>
                    <p className="text-[8px] text-[var(--tx-muted)]">วัน</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--tx-muted)]">Frequency</p>
                    <p className="text-sm font-bold text-violet-400">{pr.frequency || '0'}</p>
                    <p className="text-[8px] text-[var(--tx-muted)]">ครั้ง</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--tx-muted)]">Monetary</p>
                    <p className="text-sm font-bold text-violet-400">{pr.monetary || '0'}</p>
                    <p className="text-[8px] text-[var(--tx-muted)]">บาท</p>
                  </div>
                </div>
              </div>
            )}

            {/* Points + Wallet */}
            {(pr.points || pr.wallet || pr.purchaseTotal) && (
              <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3 space-y-1">
                {pr.purchaseTotal && <LabelValue label="ยอดสั่งซื้อ" value={`${pr.purchaseTotal} บาท`} bold />}
                {pr.points && <LabelValue label="คะแนนสะสม" value={pr.points} />}
                {pr.pointsExpiring && <LabelValue label="คะแนนหมดอายุ" value={pr.pointsExpiring} />}
                {pr.wallet && <LabelValue label="Wallet" value={pr.wallet} />}
              </div>
            )}

            {/* Personal Details (ProClinic style label-value) */}
            <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3 space-y-0">
              {pr.memberNo && <LabelValue label="รหัสสมาชิก" value={pr.memberNo} />}
              {pr.customerType && <LabelValue label="ประเภทลูกค้า" value={pr.customerType} />}
              <LabelValue label="สัญชาติ" value={p.nationality === 'ต่างชาติ' ? `ต่างชาติ (${p.nationalityCountry || ''})` : (p.nationality || pr.nationality || 'คนไทย')} />
              <LabelValue label="เลขบัตร ปชช." value={p.idCard || pr.idCard} />
              <LabelValue label="เพศ" value={p.gender || pr.gender} />
              <LabelValue label="วันเกิด" value={
                (p.dobDay && p.dobMonth && p.dobYear) ? `${p.dobDay}/${p.dobMonth}/${p.dobYear}${p.age ? ` (อายุ ${p.age} ปี)` : ''}` :
                (pr.birthday ? `${pr.birthday}${pr.age ? ` (อายุ ${pr.age} ปี)` : ''}` : '-')
              } />
              <LabelValue label="น้ำหนัก" value={pr.weight ? `${pr.weight}` : undefined} />
              <LabelValue label="ส่วนสูง" value={pr.height ? `${pr.height}` : undefined} />
              <LabelValue label="BMI" value={pr.bmi ? `${pr.bmi}${pr.bmi > 25 ? ' (เกิน)' : ''}` : undefined} />
              <LabelValue label="อาชีพ/รายได้" value={[pr.occupation, pr.income].filter(Boolean).join(' / ') || undefined} />
              {pr.memberCard && <LabelValue label="บัตรสมาชิก" value={pr.memberCard} />}
              <LabelValue label="เบอร์โทร" value={p.phone ? formatPhoneNumberDisplay(p.phone) : (pr.phone || undefined)} bold />
            </div>

            {/* Address */}
            <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3">
              <p className="text-[10px] text-[var(--tx-muted)] mb-1">ที่อยู่</p>
              <p className="text-[11px] text-[var(--tx-primary)] leading-relaxed">
                {[p.address, p.subDistrict, p.district, p.province, p.postalCode].filter(Boolean).join(', ') || pr.address || '-'}
              </p>
            </div>

            {/* Source + Note */}
            <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3 space-y-0">
              <LabelValue label="ที่มา" value={
                Array.isArray(p.howFoundUs) ? p.howFoundUs.join(', ') : (pr.source || '-')
              } />
              <LabelValue label="หมายเหตุ" value={p.clinicalSummary || pr.clinicalNote} />
            </div>

            {/* Health */}
            <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3 space-y-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Heart size={12} className="text-violet-400" />
                <span className="text-[10px] font-bold text-violet-400 uppercase">สุขภาพ</span>
              </div>
              <LabelValue label="ประวัติแพ้ยา" value={p.hasAllergies === 'มี' ? `มี — ${p.allergiesDetail || ''}` : 'ไม่มี'} />
              <LabelValue label="โรคประจำตัว" value={
                p.hasUnderlying === 'มี'
                  ? `มี — ${underlyingList.join(', ') || p.ud_otherDetail || ''}`
                  : 'ไม่มี'
              } />
            </div>

            {/* Emergency Contact */}
            {(p.emergencyName || p.emergencyPhone) && (
              <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3 space-y-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Shield size={12} className="text-violet-400" />
                  <span className="text-[10px] font-bold text-violet-400 uppercase">ผู้ติดต่อฉุกเฉิน</span>
                </div>
                <LabelValue label="ชื่อ" value={p.emergencyName} />
                <LabelValue label="ความสัมพันธ์" value={p.emergencyRelation} />
                <LabelValue label="เบอร์โทร" value={p.emergencyPhone ? formatPhoneNumberDisplay(p.emergencyPhone) : undefined} />
              </div>
            )}
          </div>

          {/* ═══ CENTER COLUMN: Appointments + Treatment History ═══ */}
          <div className="space-y-4">
            {/* Next Appointment */}
            {nextAppt && (
              <div className="rounded-xl border border-violet-700/30 bg-violet-700/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-violet-400 flex items-center gap-1.5">
                    <Calendar size={14} /> นัดหมายครั้งถัดไป
                  </h4>
                </div>
                <p className="text-sm font-bold text-[var(--tx-heading)]">{nextAppt.date} | {nextAppt.time || nextAppt.startTime || ''}</p>
                <div className="flex flex-wrap gap-2 mt-1 text-[10px]">
                  {nextAppt.doctor && <span className="text-[var(--tx-secondary)]">{nextAppt.doctor}</span>}
                  {nextAppt.branch && <span className="px-1.5 py-0.5 rounded bg-sky-700/20 text-sky-400">สาขา {nextAppt.branch}</span>}
                  {nextAppt.room && <span className="text-[var(--tx-muted)]">{nextAppt.room}</span>}
                </div>
                {nextAppt.notes && <p className="text-[10px] text-[var(--tx-muted)] mt-1">โน๊ต: {nextAppt.notes}</p>}
              </div>
            )}

            {/* Treatment History Header */}
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--tx-heading)] flex items-center gap-1.5">
                <Stethoscope size={14} className="text-violet-400" />
                ประวัติการรักษา
                {allTreatments.length > 0 && <span className="text-[var(--tx-muted)]">({allTreatments.length})</span>}
              </h4>
              <button
                onClick={() => onOpenTreatmentForm({ mode: 'create', customerId: proClinicId, patientName: fullName, patientData: p, saveTarget: 'backend' })}
                className="text-[10px] px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold transition-all flex items-center gap-1"
              >
                <ClipboardList size={10} /> บันทึกการรักษา
              </button>
            </div>

            {/* Treatment Timeline */}
            {allTreatments.length > 0 ? (
              <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4">
                {allTreatments.map((t, i) => (
                  <TreatmentEntry key={t.id || i} t={t} isLast={i === allTreatments.length - 1} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-8 text-center">
                <Stethoscope size={24} className="mx-auto mb-2 text-[var(--tx-faint)]" />
                <p className="text-xs text-[var(--tx-muted)]">ยังไม่มีประวัติการรักษา</p>
              </div>
            )}

            {/* Backend Treatments (our own records) */}
            {backendTreatments?.length > 0 && (
              <>
                <h4 className="text-xs font-bold text-[var(--tx-heading)] flex items-center gap-1.5 mt-4">
                  <FileText size={14} className="text-emerald-400" />
                  บันทึกการรักษา (หลังบ้าน) ({backendTreatments.length})
                </h4>
                <div className="rounded-xl border border-emerald-700/30 bg-[var(--bg-card)] p-4">
                  {backendTreatments.map((t, i) => (
                    <div key={t.id || i} className="pl-6 pb-3 relative">
                      <div className="absolute left-0 top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[var(--bg-base)]" />
                      {i < backendTreatments.length - 1 && <div className="absolute left-[5px] top-4 bottom-0 w-0.5 bg-emerald-700/30" />}
                      <p className="text-xs font-bold text-[var(--tx-heading)]">{t.treatmentDate || t.savedAtISO?.split('T')[0] || '—'}</p>
                      {t.doctorName && <p className="text-[10px] text-[var(--tx-secondary)]">{t.doctorName}</p>}
                      {t.opd?.cc && <p className="text-[10px] text-[var(--tx-muted)]">อาการ: {t.opd.cc}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* All Appointments */}
            {appointments?.length > 1 && (
              <>
                <h4 className="text-xs font-bold text-[var(--tx-heading)] flex items-center gap-1.5 mt-4">
                  <Calendar size={14} className="text-violet-400" />
                  นัดหมายทั้งหมด ({appointments.length})
                </h4>
                <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3 space-y-1.5">
                  {appointments.map((a, i) => (
                    <div key={i} className="text-[10px] p-2 rounded-lg bg-[var(--bg-hover)] flex items-center gap-2">
                      <Calendar size={10} className="text-[var(--tx-muted)] flex-shrink-0" />
                      <span className="text-[var(--tx-primary)] font-semibold">{a.date || ''} {a.time || a.startTime || ''}</span>
                      {a.doctor && <span className="text-[var(--tx-secondary)]">— {a.doctor}</span>}
                      {a.branch && <span className="text-sky-400">สาขา {a.branch}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ═══ RIGHT COLUMN: Courses ═══ */}
          <div className="space-y-3">
            {/* Active Courses */}
            <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                  <Package size={12} /> คอร์สของฉัน
                  {courses?.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-700/20">{courses.length}</span>}
                </h4>
              </div>
              {courses?.length > 0 ? (
                courses.map((c, i) => <CourseCard key={i} course={c} active />)
              ) : (
                <p className="text-[10px] text-[var(--tx-muted)] text-center py-4">ไม่มีคอร์ส</p>
              )}
            </div>

            {/* Expired Courses */}
            {expiredCourses?.length > 0 && (
              <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3">
                <button
                  onClick={() => setShowExpiredCourses(!showExpiredCourses)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h4 className="text-[11px] font-bold text-[var(--tx-muted)] flex items-center gap-1.5">
                    <PackageX size={12} /> คอร์สหมดอายุ
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--bg-hover2)]">{expiredCourses.length}</span>
                  </h4>
                  {showExpiredCourses ? <ChevronDown size={12} className="text-[var(--tx-muted)]" /> : <ChevronRight size={12} className="text-[var(--tx-muted)]" />}
                </button>
                {showExpiredCourses && (
                  <div className="mt-2">
                    {expiredCourses.map((c, i) => <CourseCard key={i} course={c} active={false} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard Component ─────────────────────────────────────────────

export default function BackendDashboard({ db, appId, isDark, clinicSettings, showToast, onOpenTreatmentForm, onClose }) {
  const [activeTab, setActiveTab] = useState('sync');
  const [detailData, setDetailData] = useState(null);
  const [backendTreatments, setBackendTreatments] = useState([]);

  const handleViewDetail = async (data) => {
    setDetailData(data);
    // Load backend treatments for this customer
    try {
      const treatments = await backend.listBackendTreatments(data.proClinicId);
      setBackendTreatments(treatments);
    } catch {
      setBackendTreatments([]);
    }
  };

  const handleCloseDetail = () => {
    setDetailData(null);
    setBackendTreatments([]);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-all" title="กลับ">
          <ArrowLeft size={16} className="text-[var(--tx-secondary)]" />
        </button>
        <div>
          <h2 className="text-base font-black text-[var(--tx-heading)] tracking-tight">ระบบหลังบ้าน</h2>
          <p className="text-[10px] text-[var(--tx-muted)]">จัดการข้อมูล Backend — Clone จาก ProClinic (ข้อมูลทางเดียว)</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('sync')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'sync'
              ? 'bg-violet-700 text-white shadow-[0_0_12px_rgba(109,40,217,0.3)]'
              : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-violet-400 hover:border-violet-700/40'
          }`}
        >
          <RefreshCw size={12} /> Sync ข้อมูล
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'search'
              ? 'bg-violet-700 text-white shadow-[0_0_12px_rgba(109,40,217,0.3)]'
              : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-violet-400 hover:border-violet-700/40'
          }`}
        >
          <Search size={12} /> ค้นหาลูกค้า
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'sync' ? (
        <BackendSyncPanel isDark={isDark} showToast={showToast} />
      ) : (
        <BackendCustomerSearch
          isDark={isDark}
          showToast={showToast}
          onViewDetail={handleViewDetail}
          onOpenTreatmentForm={onOpenTreatmentForm}
        />
      )}

      {/* Customer Detail Overlay */}
      {detailData && (
        <CustomerDetailOverlay
          data={detailData}
          isDark={isDark}
          onClose={handleCloseDetail}
          onOpenTreatmentForm={onOpenTreatmentForm}
          backendTreatments={backendTreatments}
        />
      )}
    </div>
  );
}
