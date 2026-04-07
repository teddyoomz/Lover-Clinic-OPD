// ─── BackendDashboard ──────────────────────────────────────────────────────
// ระบบหลังบ้าน — main container page.
// Tabs: Sync ข้อมูล | ค้นหาลูกค้า
// Includes customer detail overlay.

import { useState } from 'react';
import { ArrowLeft, RefreshCw, Search, X, User, Phone, MapPin, Heart, Stethoscope,
         AlertCircle, Hash, Calendar, Shield, UserCheck, ClipboardList, Package, PackageX, Loader2 } from 'lucide-react';
import BackendSyncPanel from '../components/BackendSyncPanel.jsx';
import BackendCustomerSearch from '../components/BackendCustomerSearch.jsx';
import * as backend from '../lib/backendClient.js';
import { formatPhoneNumberDisplay, renderDobFormat } from '../utils.js';

// ── Underlying condition labels ──────────────────────────────────────────
const UD_LABELS = {
  ud_hypertension: 'ความดันโลหิตสูง',
  ud_diabetes: 'เบาหวาน',
  ud_lung: 'โรคปอด',
  ud_kidney: 'โรคไต',
  ud_heart: 'โรคหัวใจ',
  ud_blood: 'โรคเลือด',
};

// ── Customer Detail Overlay ──────────────────────────────────────────────
function CustomerDetailOverlay({ data, isDark, onClose, onOpenTreatmentForm, backendTreatments }) {
  if (!data) return null;
  const { proClinicId, proClinicHN, patient, courses, expiredCourses, appointments } = data;
  const p = patient || {};
  const fullName = `${p.prefix || ''} ${p.firstName || ''} ${p.lastName || ''}`.trim();

  const underlyingList = Object.entries(UD_LABELS).filter(([key]) => p[key]).map(([, label]) => label);
  if (p.ud_other && p.ud_otherDetail) underlyingList.push(p.ud_otherDetail);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--bg-base)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--bd)] bg-[var(--bg-surface)] flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-all">
          <ArrowLeft size={16} className="text-[var(--tx-secondary)]" />
        </button>
        <div className="flex-1 min-w-0">
          {/* ห้ามใช้สีแดงกับชื่อ/HN */}
          <h3 className="text-sm font-bold text-[var(--tx-heading)] truncate">{fullName || 'ไม่ทราบชื่อ'}</h3>
          {proClinicHN && <span className="text-[10px] text-[var(--tx-muted)]">HN: {proClinicHN}</span>}
        </div>
        <button
          onClick={() => {
            onOpenTreatmentForm({
              mode: 'create',
              customerId: proClinicId,
              patientName: fullName,
              patientData: p,
              saveTarget: 'backend',
            });
          }}
          className="text-[10px] px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white font-bold transition-all flex items-center gap-1"
        >
          <ClipboardList size={10} /> บันทึกการรักษา
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-all">
          <X size={16} className="text-[var(--tx-muted)]" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Personal Info ── */}
        <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <User size={14} className="text-violet-400" />
            <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-400">ข้อมูลส่วนตัว</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <InfoRow label="ชื่อ-สกุล" value={fullName} />
            <InfoRow label="HN" value={proClinicHN} />
            <InfoRow label="เพศ" value={p.gender} />
            <InfoRow label="วันเกิด" value={p.dobDay && p.dobMonth && p.dobYear ? `${p.dobDay}/${p.dobMonth}/${p.dobYear}` : ''} />
            <InfoRow label="อายุ" value={p.age ? `${p.age} ปี` : ''} />
            <InfoRow label="สัญชาติ" value={p.nationality === 'ต่างชาติ' ? `ต่างชาติ (${p.nationalityCountry || ''})` : p.nationality} />
            <InfoRow label="เลขบัตร ปชช." value={p.idCard} />
            <InfoRow label="เบอร์โทร" value={p.phone ? formatPhoneNumberDisplay(p.phone) : ''} />
          </div>
        </div>

        {/* ── Address ── */}
        {(p.address || p.province) && (
          <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={14} className="text-violet-400" />
              <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-400">ที่อยู่</h4>
            </div>
            <p className="text-xs text-[var(--tx-primary)]">
              {[p.address, p.subDistrict, p.district, p.province, p.postalCode].filter(Boolean).join(', ')}
            </p>
          </div>
        )}

        {/* ── Health Summary ── */}
        <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Heart size={14} className="text-violet-400" />
            <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-400">ประวัติสุขภาพ</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <InfoRow label="ประวัติแพ้ยา" value={p.hasAllergies === 'มี' ? `มี — ${p.allergiesDetail || ''}` : 'ไม่มี'} />
            <InfoRow label="โรคประจำตัว" value={p.hasUnderlying === 'มี' ? `มี — ${underlyingList.join(', ') || p.ud_otherDetail || ''}` : 'ไม่มี'} />
            {p.clinicalSummary && <InfoRow label="หมายเหตุ" value={p.clinicalSummary} span2 />}
          </div>
        </div>

        {/* ── Emergency Contact ── */}
        {(p.emergencyName || p.emergencyPhone) && (
          <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-violet-400" />
              <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-400">ผู้ติดต่อฉุกเฉิน</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <InfoRow label="ชื่อ" value={p.emergencyName} />
              <InfoRow label="ความสัมพันธ์" value={p.emergencyRelation} />
              <InfoRow label="เบอร์โทร" value={p.emergencyPhone ? formatPhoneNumberDisplay(p.emergencyPhone) : ''} />
            </div>
          </div>
        )}

        {/* ── How Found Us ── */}
        {p.howFoundUs && p.howFoundUs.length > 0 && (
          <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck size={14} className="text-violet-400" />
              <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-400">ช่องทางที่รู้จัก</h4>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Array.isArray(p.howFoundUs) ? p.howFoundUs : [p.howFoundUs]).map((src, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-700/20 text-violet-400 border border-violet-700/30">
                  {src}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Courses ── */}
        {(courses?.length > 0 || expiredCourses?.length > 0) && (
          <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package size={14} className="text-violet-400" />
              <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-400">คอร์ส</h4>
            </div>

            {courses?.length > 0 && (
              <div className="space-y-2 mb-3">
                <p className="text-[10px] text-emerald-400 font-bold">คอร์สที่ใช้ได้ ({courses.length})</p>
                {courses.map((c, i) => (
                  <CourseCard key={i} course={c} active />
                ))}
              </div>
            )}

            {expiredCourses?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-[var(--tx-muted)] font-bold flex items-center gap-1">
                  <PackageX size={10} /> คอร์สหมดอายุ ({expiredCourses.length})
                </p>
                {expiredCourses.map((c, i) => (
                  <CourseCard key={i} course={c} active={false} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Appointments ── */}
        {appointments?.length > 0 && (
          <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={14} className="text-violet-400" />
              <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-400">นัดหมาย ({appointments.length})</h4>
            </div>
            <div className="space-y-2">
              {appointments.slice(0, 10).map((a, i) => (
                <div key={i} className="text-[10px] p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center gap-2">
                  <Calendar size={10} className="text-[var(--tx-muted)] flex-shrink-0" />
                  <span className="text-[var(--tx-primary)]">{a.date || ''} {a.startTime || ''}</span>
                  {a.doctorName && <span className="text-[var(--tx-secondary)]">— {a.doctorName}</span>}
                  {a.note && <span className="text-[var(--tx-muted)] truncate">({a.note})</span>}
                </div>
              ))}
              {appointments.length > 10 && (
                <p className="text-[10px] text-[var(--tx-muted)] text-center">+{appointments.length - 10} รายการเพิ่มเติม</p>
              )}
            </div>
          </div>
        )}

        {/* ── Backend Treatment History ── */}
        {backendTreatments?.length > 0 && (
          <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Stethoscope size={14} className="text-violet-400" />
              <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-400">บันทึกการรักษา (หลังบ้าน) ({backendTreatments.length})</h4>
            </div>
            <div className="space-y-2">
              {backendTreatments.map((t, i) => (
                <div key={t.id || i} className="text-[10px] p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--tx-primary)] font-semibold">{t.treatmentDate || t.savedAtISO?.split('T')[0] || '—'}</span>
                    {t.doctorName && <span className="text-[var(--tx-secondary)]">— {t.doctorName}</span>}
                  </div>
                  {t.opd?.cc && <p className="text-[var(--tx-muted)] mt-0.5 truncate">CC: {t.opd.cc}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-4" />
      </div>
    </div>
  );
}

// ── Shared UI helpers ────────────────────────────────────────────────────

function InfoRow({ label, value, span2 }) {
  if (!value) return null;
  return (
    <div className={span2 ? 'sm:col-span-2' : ''}>
      <span className="text-[var(--tx-muted)]">{label}: </span>
      <span className="text-[var(--tx-primary)]">{value}</span>
    </div>
  );
}

function CourseCard({ course, active }) {
  const c = course || {};
  return (
    <div className={`text-[10px] p-2.5 rounded-lg border ${active ? 'bg-emerald-500/5 border-emerald-700/30' : 'bg-[var(--bg-hover)] border-[var(--bd)] opacity-60'}`}>
      <div className="flex items-center justify-between">
        <span className={`font-semibold ${active ? 'text-emerald-400' : 'text-[var(--tx-muted)]'}`}>{c.name || '—'}</span>
        {c.value && <span className="text-[var(--tx-secondary)]">เหลือ {c.value}</span>}
      </div>
      <div className="flex items-center gap-3 mt-0.5 text-[var(--tx-muted)]">
        {c.product && <span>{c.product}</span>}
        {c.qty && <span>ใช้ {c.qty} ครั้ง</span>}
        {c.expiry && <span>หมดอายุ {c.expiry}</span>}
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
