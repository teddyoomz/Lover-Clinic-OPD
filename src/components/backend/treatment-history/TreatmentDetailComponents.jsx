// Phase 28 (2026-05-14) — extracted from CustomerDetailView.jsx for shared
// consumption by treatment-history components (Rule C1).
//
// Components moved AS-IS (byte-identical bodies):
//   - DetailField        — labelled value field (skip-when-empty)
//   - TreatmentDetailExpanded — full treatment detail body (vitals/OPD/items/labs/DF/cert/images)
//   - ItemList           — internal helper for treatment items + consumables
//   - ImageRow           — internal helper for before/after/other thumbnail rows
//   - VitalPill          — internal helper for vital-sign chip
//
// All five lived inline in CDV; extracting them together preserves exact behaviour
// (TreatmentDetailExpanded depends on the other four) and keeps the public surface
// the same (only DetailField + TreatmentDetailExpanded are exported per Task 5 spec).

import React from 'react';
import { Activity, Pill, Package, Droplets, Stethoscope, Shield, FileText } from 'lucide-react';

export function DetailField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs font-semibold text-[var(--tx-muted)]">{label}</span>
      <p className="text-sm text-[var(--tx-secondary)] mt-0.5 whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

export function TreatmentDetailExpanded({ detail, ac, acRgb, isDark }) {
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
          // 2026-07-05 thumbs — mini-row renders the thumb; href opens the FULL image
          const thumb = (typeof img === 'object' && img?.thumbUrl) ? img.thumbUrl : src;
          return (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer"
              className="w-14 h-14 rounded border border-[var(--bd)] overflow-hidden flex-shrink-0 hover:ring-1 hover:ring-orange-500 transition-all">
              <img src={thumb} alt={`${label} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
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
