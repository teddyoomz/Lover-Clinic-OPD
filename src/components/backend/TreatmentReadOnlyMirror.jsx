/**
 * TreatmentReadOnlyMirror.jsx
 *
 * AV39 contract (Phase 26.2f Task 6):
 *  - Mirrors TFP's editable form layout but every field is DISABLED.
 *  - ALL <input>, <textarea>, <select> elements MUST have the `disabled` attribute.
 *  - NO save/submit button text or functionality.
 *  - NO onEditTreatment / onDeleteTreatment props.
 *  - Self-contained — no exports beyond the default export.
 *
 * Props:
 *   treatmentDoc   {object}  Full treatment Firestore document (top-level + detail sub-object).
 *   theme          {string}  'dark' | 'light'
 *   accentColor    {string}  Hex accent, e.g. '#e74c3c'
 *   isLatest       {boolean} Whether this is the patient's most-recent treatment.
 *   showCloseButton {boolean}
 *   onClose        {function}
 */

import React, { useState, useEffect, useCallback } from 'react';

// ─── helpers ───────────────────────────────────────────────────────────────

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatThaiDateFull(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = d.getDate();
    const mon = THAI_MONTHS_SHORT[d.getMonth()];
    const year = d.getFullYear() + 543;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${mon} ${year} ${hh}:${mm}`;
  } catch {
    return isoStr;
  }
}

function formatThaiDateOnly(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = d.getDate();
    const mon = THAI_MONTHS_SHORT[d.getMonth()];
    const year = d.getFullYear() + 543;
    return `${day} ${mon} ${year}`;
  } catch {
    return isoStr;
  }
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '231, 76, 60';
}

function imageUrl(dataUrl) {
  return dataUrl || null;
}

// ─── Lightbox ──────────────────────────────────────────────────────────────

function Lightbox({ src, label, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-label={label || 'ขยายรูป'}
    >
      <div className="relative max-w-4xl max-h-[90vh] p-2" onClick={e => e.stopPropagation()}>
        <img
          src={src}
          alt={label || 'treatment image'}
          className="max-w-full max-h-[85vh] object-contain rounded shadow-xl"
        />
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition"
          aria-label="ปิด"
        >
          ✕
        </button>
        {label && (
          <div className="absolute bottom-2 left-0 right-0 text-center text-white text-xs bg-black/40 py-1 rounded">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ImageGridColumn ───────────────────────────────────────────────────────

function ImageGridColumn({ images, label, onZoom, testidPrefix }) {
  if (!images?.length) return null;
  // testidPrefix overrides the default "mirror-img-zoom-{label}" pattern
  // Used by chart callers to emit "mirror-chart-zoom-{i}" per AV39 spec
  const resolveTestid = (idx) =>
    testidPrefix ? `${testidPrefix}-${idx}` : `mirror-img-zoom-${label}-${idx}`;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium" style={{ color: 'var(--tx-muted)' }}>{label}</p>
      <div className="grid grid-cols-3 gap-1">
        {images.slice(0, 9).map((src, idx) => (
          <button
            key={idx}
            type="button"
            data-testid={resolveTestid(idx)}
            className="aspect-square overflow-hidden rounded border cursor-zoom-in hover:opacity-80 transition"
            style={{ borderColor: 'var(--bd)' }}
            onClick={() => onZoom?.(src, `${label} ${idx + 1}`)}
            aria-label={`ขยายรูป ${label} ${idx + 1}`}
          >
            <img
              src={imageUrl(src)}
              alt={`${label} ${idx + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
      {images.length > 9 && (
        <p className="text-xs" style={{ color: 'var(--tx-muted)' }}>+{images.length - 9} รูปเพิ่มเติม</p>
      )}
    </div>
  );
}

// ─── Accordion ─────────────────────────────────────────────────────────────

function Accordion({ title, defaultOpen = false, children, accentColor }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: 'var(--bd)', background: 'var(--bg-card)' }}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left font-semibold text-sm transition hover:opacity-80"
        style={{ color: accentColor || 'var(--tx-heading)' }}
        onClick={() => setOpen(v => !v)}
      >
        <span>{title}</span>
        <span className="text-xs opacity-60">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: 'var(--bd)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── FieldRow ──────────────────────────────────────────────────────────────

function FieldRow({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--tx-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// Base style shared by all disabled inputs
const disabledInputCls =
  'w-full px-3 py-2 rounded border text-sm bg-opacity-50 cursor-not-allowed ' +
  'disabled:opacity-70 disabled:cursor-not-allowed';

function inputStyle() {
  return {
    background: 'var(--bg-hover)',
    borderColor: 'var(--bd)',
    color: 'var(--tx-primary)',
  };
}

// ─── StatusBadge ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    draft: { label: 'ร่าง', cls: 'bg-yellow-500/20 text-yellow-400' },
    saved: { label: 'บันทึกแล้ว', cls: 'bg-green-500/20 text-green-400' },
    cancelled: { label: 'ยกเลิก', cls: 'bg-red-500/20 text-red-400' },
    'doctor-recorded': { label: 'หมอบันทึกแล้ว', cls: 'bg-blue-500/20 text-blue-400' },
    'vitalsigns-recorded': { label: 'วัดสัญญาณชีพแล้ว', cls: 'bg-purple-500/20 text-purple-400' },
  };
  const s = map[status] || { label: status || '—', cls: 'bg-gray-500/20 text-gray-400' };
  // testid for audit-spec AV39: mirror-status-chip-{status} for known status values
  const testid = status === 'doctor-recorded'
    ? 'mirror-status-chip-doctor-recorded'
    : status === 'vitalsigns-recorded'
      ? 'mirror-status-chip-vitalsigns-recorded'
      : undefined;
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}
      {...(testid ? { 'data-testid': testid } : {})}
    >
      {s.label}
    </span>
  );
}

// ─── SectionDivider ────────────────────────────────────────────────────────

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-2 my-2">
      <div className="flex-1 h-px" style={{ background: 'var(--bd)' }} />
      {label && (
        <span className="text-xs font-medium px-2" style={{ color: 'var(--tx-muted)' }}>
          {label}
        </span>
      )}
      <div className="flex-1 h-px" style={{ background: 'var(--bd)' }} />
    </div>
  );
}

// ─── ItemTable ─────────────────────────────────────────────────────────────

function ItemTable({ items, columns, emptyLabel = 'ไม่มีข้อมูล' }) {
  if (!items?.length) {
    return (
      <p className="text-xs italic py-2" style={{ color: 'var(--tx-muted)' }}>{emptyLabel}</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded border" style={{ borderColor: 'var(--bd)' }}>
      <table className="min-w-full text-xs" style={{ background: 'var(--bg-card)' }}>
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--bd)' }}>
            {columns.map(col => (
              <th
                key={col.key}
                className="px-3 py-2 text-left font-semibold"
                style={{ color: 'var(--tx-muted)' }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={idx}
              className="border-b last:border-0"
              style={{ borderColor: 'var(--bd)' }}
            >
              {columns.map(col => (
                <td key={col.key} className="px-3 py-2" style={{ color: 'var(--tx-primary)' }}>
                  {col.render ? col.render(item, idx) : (item[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TreatmentReadOnlyMirror — main component
// ═══════════════════════════════════════════════════════════════════════════

export default function TreatmentReadOnlyMirror({
  treatmentDoc,
  theme = 'dark',
  accentColor = '#e74c3c',
  isLatest = false,
  showCloseButton = false,
  onClose,
}) {
  const [lightbox, setLightbox] = useState(null); // { src, label }

  // ── Esc closes lightbox first, then panel ─────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (lightbox) {
          setLightbox(null);
        } else {
          onClose?.();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox, onClose]);

  const handleZoom = useCallback((src, label) => {
    setLightbox({ src, label });
  }, []);

  // ── Extract data from Firestore document ─────────────────────────────
  const doc = treatmentDoc || {};
  const detail = doc.detail || {};
  const health = detail.healthInfo || {};
  const vitals = detail.vitals || {};

  // Meta (top-level fields)
  const treatmentId = doc.treatmentId || '';
  const status = doc.status || 'saved';
  const recordedBy = doc.recordedBy || doc.createdBy || '';
  const recordedAt = doc.recordedAt || doc.createdAt || '';
  const editedBy = doc.editedByName || doc.editedBy || '';
  const editedAt = doc.editedAt || '';

  // OPD card
  const treatmentDate = detail.treatmentDate || '';
  const doctorId = detail.doctorId || '';
  const doctorName = detail.doctorName || doctorId || '—';
  const branchName = detail.branchName || detail.branchId || '—';
  const chiefComplaint = detail.chiefComplaint || detail.cc || '';
  const symptoms = detail.symptoms || '';
  const physicalExam = detail.physicalExam || '';
  const diagnosis = detail.diagnosis || detail.dx || '';
  const treatmentInfo = detail.treatmentInfo || '';
  const treatmentPlan = detail.treatmentPlan || '';
  const treatmentNote = detail.treatmentNote || '';
  const additionalNote = detail.additionalNote || '';

  // Assistants — stored as [{id, name}]
  const assistants = detail.assistants || [];
  const assistantsDisplay = assistants.map(a => (a.name || a.id || a)).filter(Boolean).join(', ');

  // Health info
  const bloodType = health.bloodType || '';
  const congenitalDisease = health.congenitalDisease || '';
  const drugAllergy = health.drugAllergy || '';
  const treatmentHistory = health.treatmentHistory || '';

  // Vitals
  const weight = vitals.weight || '';
  const height = vitals.height || '';
  const temperature = vitals.temperature || '';
  const pulseRate = vitals.pulseRate || '';
  const respiratoryRate = vitals.respiratoryRate || '';
  const systolicBP = vitals.systolicBP || '';
  const diastolicBP = vitals.diastolicBP || '';
  const oxygenSaturation = vitals.oxygenSaturation || '';
  const bmi = (weight && height && Number(height) > 0)
    ? (Number(weight) / Math.pow(Number(height) / 100, 2)).toFixed(1)
    : '';

  // Medical certificate
  const medCertActuallyCome = detail.medCertActuallyCome ?? false;
  const medCertIsRest = detail.medCertIsRest ?? false;
  const medCertPeriod = detail.medCertPeriod || '';
  const medCertIsOther = detail.medCertIsOther ?? false;
  const medCertOtherDetail = detail.medCertOtherDetail || '';

  // Arrays
  const treatmentItems = detail.treatmentItems || [];
  const medications = detail.medications || detail.takeHomeMeds || [];
  const consumables = detail.consumables || [];
  const beforeImages = detail.beforeImages || [];
  const afterImages = detail.afterImages || [];
  const otherImages = detail.otherImages || [];
  const charts = detail.charts || [];
  const chartImages = detail.chartImages || [];

  // Payment info
  const paymentMethod = detail.paymentMethod || '';
  const paymentStatus = detail.paymentStatus || '';
  const totalAmount = detail.totalAmount ?? detail.total ?? '';
  const discountAmount = detail.discountAmount ?? '';

  // ── Accent RGB for shadow/glow effects ────────────────────────────────
  const accentRgb = hexToRgb(accentColor);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Lightbox (z-[110] — above parent modal z-[100]) */}
      {lightbox && (
        <Lightbox
          src={lightbox.src}
          label={lightbox.label}
          onClose={() => setLightbox(null)}
        />
      )}

      <div
        className="flex flex-col h-full overflow-hidden"
        style={{ background: 'var(--bg-card)', color: 'var(--tx-primary)' }}
        data-testid="treatment-read-only-mirror"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-5 py-3 border-b flex items-center gap-3"
          style={{
            borderColor: 'var(--bd)',
            background: `rgba(${accentRgb}, 0.06)`,
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-bold text-sm tracking-wide"
                style={{ color: accentColor }}
              >
                บันทึกการรักษา
              </span>
              {isLatest && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: `rgba(${accentRgb}, 0.15)`,
                    color: accentColor,
                  }}
                >
                  ล่าสุด
                </span>
              )}
              <StatusBadge status={status} />
            </div>
            <div className="text-xs mt-0.5 space-x-3" style={{ color: 'var(--tx-muted)' }}>
              {treatmentDate && <span>📅 {formatThaiDateOnly(treatmentDate)}</span>}
              {doctorName !== '—' && <span>👨‍⚕️ {doctorName}</span>}
              {branchName !== '—' && <span>🏥 {branchName}</span>}
            </div>
          </div>
          {showCloseButton && (
            <button
              type="button"
              data-testid="treatment-read-only-mirror-close"
              onClick={onClose}
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition"
              aria-label="ปิด"
              style={{ color: 'var(--tx-muted)' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* ── 1. OPD Card ─────────────────────────────────────────── */}
          <Accordion title="📋 ข้อมูลการรักษา (OPD)" defaultOpen accentColor={accentColor}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <FieldRow label="วันที่รักษา">
                <input
                  type="text"
                  disabled
                  value={formatThaiDateOnly(treatmentDate)}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="แพทย์ผู้รักษา">
                <input
                  type="text"
                  disabled
                  value={doctorName}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="ผู้ช่วยแพทย์">
                <input
                  type="text"
                  disabled
                  value={assistantsDisplay || '—'}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="สาขา">
                <input
                  type="text"
                  disabled
                  value={branchName}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
            </div>

            <SectionDivider label="อาการและการตรวจ" />

            <div className="space-y-3">
              <FieldRow label="อาการสำคัญ (CC)">
                <input
                  type="text"
                  disabled
                  value={chiefComplaint}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="อาการ / ประวัติ (Symptoms)">
                <textarea
                  disabled
                  rows={3}
                  value={symptoms}
                  className={`${disabledInputCls} resize-none`}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="การตรวจร่างกาย (PE)">
                <textarea
                  disabled
                  rows={3}
                  value={physicalExam}
                  className={`${disabledInputCls} resize-none`}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="การวินิจฉัย (Dx)">
                <textarea
                  disabled
                  rows={2}
                  value={diagnosis}
                  className={`${disabledInputCls} resize-none`}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="การรักษา (Treatment)">
                <textarea
                  disabled
                  rows={3}
                  value={treatmentInfo}
                  className={`${disabledInputCls} resize-none`}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="แผนการรักษา (Plan)">
                <textarea
                  disabled
                  rows={2}
                  value={treatmentPlan}
                  className={`${disabledInputCls} resize-none`}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="หมายเหตุการรักษา">
                <textarea
                  disabled
                  rows={2}
                  value={treatmentNote}
                  className={`${disabledInputCls} resize-none`}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="หมายเหตุเพิ่มเติม">
                <textarea
                  disabled
                  rows={2}
                  value={additionalNote}
                  className={`${disabledInputCls} resize-none`}
                  style={inputStyle()}
                />
              </FieldRow>
            </div>
          </Accordion>

          {/* ── 2. Health Info ──────────────────────────────────────── */}
          <Accordion title="🩺 ข้อมูลสุขภาพ" accentColor={accentColor}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <FieldRow label="กรุ๊ปเลือด">
                <select
                  disabled
                  value={bloodType}
                  className={disabledInputCls}
                  style={inputStyle()}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {['A', 'B', 'AB', 'O', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="ประวัติการรักษา">
                <input
                  type="text"
                  disabled
                  value={treatmentHistory}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="โรคประจำตัว">
                <textarea
                  disabled
                  rows={2}
                  value={congenitalDisease}
                  className={`${disabledInputCls} resize-none`}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="ประวัติแพ้ยา">
                <textarea
                  disabled
                  rows={2}
                  value={drugAllergy}
                  className={`${disabledInputCls} resize-none`}
                  style={inputStyle()}
                />
              </FieldRow>
            </div>
          </Accordion>

          {/* ── 3. Vitals ───────────────────────────────────────────── */}
          <Accordion title="📊 สัญญาณชีพ (Vitals)" accentColor={accentColor}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
              <FieldRow label="น้ำหนัก (kg)">
                <input
                  type="number"
                  disabled
                  value={weight}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="ส่วนสูง (cm)">
                <input
                  type="number"
                  disabled
                  value={height}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="BMI">
                <input
                  type="text"
                  disabled
                  value={bmi || '—'}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="อุณหภูมิ (°C)">
                <input
                  type="number"
                  disabled
                  value={temperature}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="ชีพจร (bpm)">
                <input
                  type="number"
                  disabled
                  value={pulseRate}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="อัตราหายใจ (bpm)">
                <input
                  type="number"
                  disabled
                  value={respiratoryRate}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="SBP (mmHg)">
                <input
                  type="number"
                  disabled
                  value={systolicBP}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="DBP (mmHg)">
                <input
                  type="number"
                  disabled
                  value={diastolicBP}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
              <FieldRow label="O₂ Saturation (%)">
                <input
                  type="number"
                  disabled
                  value={oxygenSaturation}
                  className={disabledInputCls}
                  style={inputStyle()}
                />
              </FieldRow>
            </div>
          </Accordion>

          {/* ── 4. Medical Certificate ─────────────────────────────── */}
          <Accordion title="📜 ใบรับรองแพทย์" accentColor={accentColor}>
            <div className="mt-2 space-y-3">
              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-not-allowed opacity-80">
                  <input
                    type="checkbox"
                    disabled
                    checked={medCertActuallyCome}
                    className="disabled:cursor-not-allowed"
                    readOnly
                  />
                  <span style={{ color: 'var(--tx-primary)' }}>มาตรวจจริง</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-not-allowed opacity-80">
                  <input
                    type="checkbox"
                    disabled
                    checked={medCertIsRest}
                    className="disabled:cursor-not-allowed"
                    readOnly
                  />
                  <span style={{ color: 'var(--tx-primary)' }}>ต้องพักผ่อน</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-not-allowed opacity-80">
                  <input
                    type="checkbox"
                    disabled
                    checked={medCertIsOther}
                    className="disabled:cursor-not-allowed"
                    readOnly
                  />
                  <span style={{ color: 'var(--tx-primary)' }}>รายละเอียดอื่น</span>
                </label>
              </div>
              {medCertIsRest && (
                <FieldRow label="ระยะเวลาพัก">
                  <input
                    type="text"
                    disabled
                    value={medCertPeriod}
                    className={disabledInputCls}
                    style={inputStyle()}
                    placeholder="เช่น 2 วัน"
                  />
                </FieldRow>
              )}
              {medCertIsOther && (
                <FieldRow label="รายละเอียดเพิ่มเติม">
                  <textarea
                    disabled
                    rows={2}
                    value={medCertOtherDetail}
                    className={`${disabledInputCls} resize-none`}
                    style={inputStyle()}
                  />
                </FieldRow>
              )}
            </div>
          </Accordion>

          {/* ── 5. Treatment Items (courses used) ───────────────────── */}
          <Accordion title="💊 รายการที่ใช้บริการ" defaultOpen={treatmentItems.length > 0} accentColor={accentColor}>
            <div className="mt-2">
              <ItemTable
                items={treatmentItems}
                emptyLabel="ไม่มีรายการที่ใช้บริการ"
                columns={[
                  { key: 'name', label: 'รายการ', render: (item) => item.name || item.courseName || '—' },
                  { key: 'product', label: 'สินค้า/คอร์ส', render: (item) => item.product || item.productName || '—' },
                  { key: 'qty', label: 'จำนวน', render: (item) => item.qty ?? item.quantity ?? '—' },
                  { key: 'skipStockDeduction', label: 'ไม่ตัดสต็อค', render: (item) => item.skipStockDeduction ? '✓' : '' },
                ]}
              />
              {treatmentItems.length > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--tx-muted)' }}>
                  รวม {treatmentItems.length} รายการ
                </p>
              )}
            </div>
          </Accordion>

          {/* ── 6. Medications ─────────────────────────────────────── */}
          <Accordion title="💉 ยาที่จ่าย / Take-Home Meds" defaultOpen={medications.length > 0} accentColor={accentColor}>
            <div className="mt-2">
              <ItemTable
                items={medications}
                emptyLabel="ไม่มีรายการยา"
                columns={[
                  { key: 'name', label: 'ชื่อยา', render: (item) => item.name || item.productName || '—' },
                  { key: 'qty', label: 'จำนวน', render: (item) => item.qty ?? item.quantity ?? '—' },
                  { key: 'unit', label: 'หน่วย', render: (item) => item.unit || item.unitName || '—' },
                  { key: 'note', label: 'วิธีใช้', render: (item) => item.note || item.usage || '—' },
                ]}
              />
            </div>
          </Accordion>

          {/* ── 7. Consumables ─────────────────────────────────────── */}
          {consumables.length > 0 && (
            <Accordion title="🩹 วัสดุสิ้นเปลือง (Consumables)" defaultOpen accentColor={accentColor}>
              <div className="mt-2">
                <ItemTable
                  items={consumables}
                  emptyLabel="ไม่มีรายการวัสดุ"
                  columns={[
                    { key: 'name', label: 'รายการ', render: (item) => item.name || item.productName || '—' },
                    { key: 'qty', label: 'จำนวน', render: (item) => item.qty ?? item.quantity ?? '—' },
                    { key: 'unit', label: 'หน่วย', render: (item) => item.unit || item.unitName || '—' },
                  ]}
                />
              </div>
            </Accordion>
          )}

          {/* ── 8. Payment ─────────────────────────────────────────── */}
          {(totalAmount !== '' || paymentStatus) && (
            <Accordion title="💳 ข้อมูลการชำระเงิน" accentColor={accentColor}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                <FieldRow label="สถานะการชำระ">
                  <select
                    disabled
                    value={paymentStatus}
                    className={disabledInputCls}
                    style={inputStyle()}
                  >
                    <option value="">— ไม่ระบุ —</option>
                    <option value="paid">ชำระแล้ว</option>
                    <option value="unpaid">ค้างชำระ</option>
                    <option value="split">แบ่งชำระ</option>
                    <option value="2">ชำระแล้ว</option>
                    <option value="0">ค้างชำระ</option>
                    <option value="4">แบ่งชำระ</option>
                  </select>
                </FieldRow>
                <FieldRow label="วิธีชำระ">
                  <input
                    type="text"
                    disabled
                    value={paymentMethod}
                    className={disabledInputCls}
                    style={inputStyle()}
                  />
                </FieldRow>
                <FieldRow label="ยอดรวม (บาท)">
                  <input
                    type="text"
                    disabled
                    value={totalAmount !== '' ? Number(totalAmount).toLocaleString('th-TH') : '—'}
                    className={disabledInputCls}
                    style={inputStyle()}
                  />
                </FieldRow>
                {discountAmount !== '' && (
                  <FieldRow label="ส่วนลด (บาท)">
                    <input
                      type="text"
                      disabled
                      value={Number(discountAmount).toLocaleString('th-TH')}
                      className={disabledInputCls}
                      style={inputStyle()}
                    />
                  </FieldRow>
                )}
              </div>
            </Accordion>
          )}

          {/* ── 9. Images ──────────────────────────────────────────── */}
          {(beforeImages.length > 0 || afterImages.length > 0 || otherImages.length > 0) && (
            <Accordion title="📷 รูปภาพ" defaultOpen accentColor={accentColor}>
              <div className="mt-2 space-y-4">
                <ImageGridColumn images={beforeImages} label="ก่อนรักษา" onZoom={handleZoom} />
                <ImageGridColumn images={afterImages} label="หลังรักษา" onZoom={handleZoom} />
                <ImageGridColumn images={otherImages} label="OPD / อื่นๆ" onZoom={handleZoom} />
              </div>
            </Accordion>
          )}

          {/* ── 10. Chart Images ───────────────────────────────────── */}
          {(chartImages.length > 0 || charts.length > 0) && (
            <Accordion title="🗂️ แผนภูมิ / Chart" defaultOpen accentColor={accentColor}>
              <div className="mt-2 space-y-3">
                {/* Render chart images (dataUrl only) */}
                {chartImages.length > 0 && (
                  <ImageGridColumn
                    images={chartImages}
                    label="Chart"
                    onZoom={handleZoom}
                    testidPrefix="mirror-chart-zoom"
                  />
                )}
                {/* Render charts array (objects with dataUrl) that aren't in chartImages */}
                {charts.filter(c => c.dataUrl && !chartImages.includes(c.dataUrl)).length > 0 && (
                  <ImageGridColumn
                    images={charts.filter(c => c.dataUrl).map(c => c.dataUrl)}
                    label="Chart (detail)"
                    onZoom={handleZoom}
                    testidPrefix="mirror-chart-zoom"
                  />
                )}
                {charts.some(c => c.templateId) && (
                  <div className="text-xs space-y-1" style={{ color: 'var(--tx-muted)' }}>
                    {charts.map((c, idx) => (
                      c.templateId ? (
                        <p key={idx}>
                          Chart {idx + 1}: Template <code className="text-xs">{c.templateId}</code>
                          {c.savedAt ? ` · บันทึก ${formatThaiDateFull(c.savedAt)}` : ''}
                        </p>
                      ) : null
                    ))}
                  </div>
                )}
              </div>
            </Accordion>
          )}

          {/* ── 11. Audit Trail ────────────────────────────────────── */}
          <div
            className="rounded-lg border px-4 py-3 text-xs space-y-1"
            style={{ borderColor: 'var(--bd)', background: 'var(--bg-card)', color: 'var(--tx-muted)' }}
          >
            <p className="font-semibold mb-1" style={{ color: 'var(--tx-secondary)' }}>
              ประวัติการบันทึก
            </p>
            {treatmentId && (
              <p>รหัสการรักษา: <span style={{ color: 'var(--tx-primary)' }}>{treatmentId}</span></p>
            )}
            {recordedAt && (
              <p>บันทึกเมื่อ: <span style={{ color: 'var(--tx-primary)' }}>{formatThaiDateFull(recordedAt)}</span>
                {recordedBy && <span> โดย {recordedBy}</span>}
              </p>
            )}
            {editedAt && (
              <p>แก้ไขล่าสุด: <span style={{ color: 'var(--tx-primary)' }}>{formatThaiDateFull(editedAt)}</span>
                {editedBy && <span> โดย {editedBy}</span>}
              </p>
            )}
          </div>

          {/* Bottom padding for scroll */}
          <div className="h-4" />
        </div>
      </div>
    </>
  );
}
