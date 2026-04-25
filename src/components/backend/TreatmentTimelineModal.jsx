// ─── TreatmentTimelineModal — "ดูไทม์ไลน์" image-led treatment view ──────
// Phase 14.7.E (2026-04-26)
//
// Replicates ProClinic's #treatmentTimelineModal (Bootstrap modal-xxl) verified
// via opd.js scan against trial.proclinicth.com 2026-04-25. Source-of-truth
// at docs/proclinic-scan/customer-detail-treatment-history-and-timeline.md.
//
// Per-treatment row layout: 3-col / 9-col split (left meta+items, right
// 3-image grid with carousel). All treatments rendered chronologically
// (newest first) — no pagination, no filters, no AJAX (matches ProClinic).
//
// Reuses CustomerDetailView's already-loaded `treatments[]` array (no new
// fetch). Image categories map ProClinic → our schema:
//   - "OPD/อื่นๆ"  ⇒ detail.otherImages
//   - "Before"     ⇒ detail.beforeImages
//   - "After"      ⇒ detail.afterImages
// Each image is `{ dataUrl, id }` per saveTreatment writer.

import { useState, useMemo, useEffect } from 'react';
import {
  X, Stethoscope, Activity, FileText, ChevronDown, ChevronUp,
  Edit3, MapPin, User, Calendar, Pill, Package, Loader2, Image as ImageIcon,
} from 'lucide-react';
import { fmtThaiDate, THAI_MONTHS_FULL } from '../../lib/dateFormat.js';
import { hexToRgb } from '../../utils.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Match CustomerDetailView's formatThaiDateFull semantics exactly */
function formatThaiDateFull(dateStr) {
  if (!dateStr) return '-';
  if (typeof dateStr === 'string' && THAI_MONTHS_FULL.some(mn => dateStr.includes(mn))) return dateStr;
  return fmtThaiDate(dateStr, { monthStyle: 'full' });
}

/** Extract image URL from {dataUrl, id} or string. */
function imageUrl(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  return img.dataUrl || img.url || '';
}

// ─── Image grid column (3 of these per treatment row) ──────────────────────

function ImageGridColumn({ label, images, isDark }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const valid = (images || []).filter(img => imageUrl(img));
  // Reset thumbnail index when image count changes (e.g. parent reload)
  useEffect(() => { setActiveIdx(0); }, [valid.length]);

  const heading = valid.length > 1 ? `${label} (${valid.length} รูป)` : label;

  if (valid.length === 0) {
    return (
      <div>
        <h6 className="text-xs font-bold text-[var(--tx-secondary)] mb-2">{label}</h6>
        <div className={`aspect-[4/3] rounded-lg flex items-center justify-center ${isDark ? 'bg-[var(--bg-card)]' : 'bg-gray-100'}`}>
          <ImageIcon size={28} className="text-[var(--tx-muted)] opacity-40" />
        </div>
      </div>
    );
  }

  if (valid.length === 1) {
    const src = imageUrl(valid[0]);
    return (
      <div>
        <h6 className="text-xs font-bold text-[var(--tx-secondary)] mb-2">{heading}</h6>
        <a href={src} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] rounded-lg overflow-hidden border border-[var(--bd)] hover:ring-2 hover:ring-orange-500 transition-all">
          <img src={src} alt={label} className="w-full h-full object-cover" loading="lazy" />
        </a>
      </div>
    );
  }

  // Carousel: big image + thumbnail row
  const activeSrc = imageUrl(valid[activeIdx]) || imageUrl(valid[0]);
  return (
    <div>
      <h6 className="text-xs font-bold text-[var(--tx-secondary)] mb-2">{heading}</h6>
      <a href={activeSrc} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] rounded-lg overflow-hidden border border-[var(--bd)] hover:ring-2 hover:ring-orange-500 transition-all mb-2">
        <img src={activeSrc} alt={`${label} ${activeIdx + 1}`} className="w-full h-full object-cover" loading="lazy" />
      </a>
      <div className="flex flex-wrap gap-1">
        {valid.map((img, i) => {
          const src = imageUrl(img);
          if (!src) return null;
          const isActive = i === activeIdx;
          return (
            <button key={i} onClick={() => setActiveIdx(i)}
              data-testid={`timeline-img-thumb-${i}`}
              aria-label={`รูปที่ ${i + 1}`}
              aria-current={isActive ? 'true' : undefined}
              className={`w-12 h-12 rounded border overflow-hidden flex-shrink-0 transition-all ${isActive ? 'border-orange-500 ring-1 ring-orange-500' : 'border-[var(--bd)] opacity-60 hover:opacity-100'}`}>
              <img src={src} alt={`thumb ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Item-list accordion (collapsed by default) ────────────────────────────

function Accordion({ title, items, nameKey = 'name', qtyKey = 'qty', unitKey = 'unit', icon, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!items || items.length === 0) return null;
  return (
    <details className="rounded-lg border border-[var(--bd)] bg-[var(--bg-card)] overflow-hidden"
      open={open}
      onToggle={(e) => setOpen(e.target.open)}
      data-testid={`timeline-accordion-${title}`}>
      <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 text-xs font-bold text-[var(--tx-secondary)] hover:bg-[var(--bg-hover)] transition-colors list-none">
        {icon} {title}
        <span className="text-[10px] text-[var(--tx-muted)] font-normal ml-1">({items.length})</span>
        {open ? <ChevronUp size={12} className="ml-auto" /> : <ChevronDown size={12} className="ml-auto" />}
      </summary>
      <ul className="px-3 py-2 space-y-1 border-t border-[var(--bd)]">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between text-xs">
            <span className="text-[var(--tx-secondary)]">{item[nameKey] || item.productName || '-'}</span>
            <span className="font-mono text-[var(--tx-muted)]">
              {item[qtyKey] || ''} {item[unitKey] || ''}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Main modal ─────────────────────────────────────────────────────────────

/**
 * @param {Object} props
 * @param {Object} props.customer
 * @param {Array} props.treatmentSummary — sorted desc (matches CustomerDetailView memo)
 * @param {Array} props.treatments — full detail array
 * @param {boolean} props.treatmentsLoading
 * @param {string} props.theme
 * @param {string} props.accentColor
 * @param {() => void} props.onClose
 * @param {(treatmentId:string) => void} [props.onEditTreatment]
 */
export default function TreatmentTimelineModal({
  customer, treatmentSummary, treatments, treatmentsLoading,
  theme, accentColor, onClose, onEditTreatment,
}) {
  const isDark = theme !== 'light';
  const ac = accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  // Esc to close + click-outside to close (delegated to backdrop onClick).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Index treatments by id once for O(1) detail lookup
  const treatmentsById = useMemo(() => {
    const map = {};
    (treatments || []).forEach(t => {
      map[t.treatmentId || t.id] = t;
    });
    return map;
  }, [treatments]);

  const customerName = customer
    ? `${customer.patientData?.prefix || ''} ${customer.patientData?.firstName || ''} ${customer.patientData?.lastName || ''}`.trim()
    : '';
  const customerHN = customer?.proClinicHN || '';
  const totalCount = treatmentSummary?.length || 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeline-modal-title"
      data-testid="treatment-timeline-modal"
      onClick={onClose}>
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl w-[95vw] max-w-screen-xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--bd)] flex items-center gap-3 flex-wrap">
          <Activity size={20} style={{ color: '#2EC4B6' }} />
          <div className="flex-1 min-w-0">
            <h4 id="timeline-modal-title" className="text-lg font-black text-[var(--tx-heading)] tracking-tight" style={{ color: '#2EC4B6' }}>
              Timeline การรักษา
            </h4>
            {customer && (
              <p className="text-xs text-[var(--tx-muted)] mt-0.5">
                {customerName || '-'} {customerHN && <span className="font-mono">· HN {customerHN}</span>}
                {totalCount > 0 && <span> · ทั้งหมด <span className="font-bold text-[var(--tx-secondary)]">{totalCount}</span> ครั้ง</span>}
              </p>
            )}
          </div>
          <button onClick={onClose}
            data-testid="timeline-close-btn"
            aria-label="ปิด"
            className="p-2 rounded-lg text-[var(--tx-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--tx-primary)] transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5" data-testid="timeline-body">
          {totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-20" data-testid="timeline-empty">
              <Stethoscope size={48} className="text-[var(--tx-muted)] opacity-40 mb-4" />
              <p className="text-lg font-bold text-[var(--tx-secondary)] mb-1">ไม่พบประวัติการรักษา</p>
              <p className="text-sm text-[var(--tx-muted)]">บันทึกการรักษาแรกในหน้าหลัก</p>
            </div>
          ) : (
            <div className="space-y-6">
              {treatmentSummary.map((t, globalIndex) => {
                const fullDoc = treatmentsById[t.id] || null;
                const detail = fullDoc?.detail || null;
                const beforeImages = detail?.beforeImages || [];
                const afterImages = detail?.afterImages || [];
                const otherImages = detail?.otherImages || [];
                const courseItems = detail?.treatmentItems || [];
                const medications = detail?.medications || detail?.takeHomeMeds || [];
                const consumables = detail?.consumables || [];
                const isLatest = globalIndex === 0;
                const isLoading = treatmentsLoading && !fullDoc;

                return (
                  <div key={t.id || globalIndex}
                    data-testid={`timeline-row-${t.id}`}
                    className={`grid grid-cols-1 md:grid-cols-12 gap-5 pb-6 ${globalIndex < totalCount - 1 ? 'border-b border-[var(--bd)]' : ''}`}>
                    {/* LEFT: meta + items (3/12) */}
                    <div className="md:col-span-4 lg:col-span-3 space-y-3">
                      {/* Date + ล่าสุด badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Calendar size={14} style={{ color: '#2EC4B6' }} />
                        <span className="text-sm font-bold text-[var(--tx-heading)]">{formatThaiDateFull(t.date) || '-'}</span>
                        {isLatest && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `rgba(${acRgb},0.15)`, color: ac }}>ล่าสุด</span>
                        )}
                      </div>

                      {/* Meta row: branch + doctor + nurse */}
                      <div className="space-y-1 text-xs">
                        {t.branch && (
                          <div className="flex items-center gap-1.5 text-[var(--tx-secondary)]">
                            <MapPin size={11} style={{ color: '#2EC4B6' }} />
                            <span>{t.branch}</span>
                          </div>
                        )}
                        {t.doctor && (
                          <div className="flex items-center gap-1.5 text-[var(--tx-secondary)]">
                            <Stethoscope size={11} style={{ color: '#2EC4B6' }} />
                            <span className="font-semibold">{t.doctor}</span>
                          </div>
                        )}
                        {t.assistants?.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[var(--tx-muted)]">
                            <User size={11} style={{ color: '#2EC4B6' }} />
                            <span>{t.assistants.join(', ')}</span>
                          </div>
                        )}
                      </div>

                      {/* CC / DX / Dr.Note (only when populated) */}
                      <div className="space-y-2">
                        {t.cc && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-semibold mb-0.5">อาการ (CC)</p>
                            <p className="text-xs text-[var(--tx-secondary)] whitespace-pre-wrap">{t.cc}</p>
                          </div>
                        )}
                        {t.dx && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-semibold mb-0.5">วินิจฉัย (DX)</p>
                            <p className="text-xs text-[var(--tx-secondary)] whitespace-pre-wrap">{t.dx}</p>
                          </div>
                        )}
                        {detail?.treatmentNote && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-semibold mb-0.5">รายละเอียดการรักษา (Dr. Note)</p>
                            <p className="text-xs text-[var(--tx-secondary)] whitespace-pre-wrap">{detail.treatmentNote}</p>
                          </div>
                        )}
                      </div>

                      {/* Course/treatment items in gray card */}
                      {courseItems.length > 0 && (
                        <div className={`rounded-lg p-3 ${isDark ? 'bg-[var(--bg-card)]' : 'bg-gray-50'} border border-[var(--bd)]`}>
                          <p className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-semibold mb-1.5">รายการรักษา</p>
                          <ul className="space-y-1">
                            {courseItems.map((item, i) => (
                              <li key={i} className="flex items-center justify-between text-xs">
                                <span className="text-[var(--tx-secondary)]">{item.name || item.productName || '-'}</span>
                                <span className="font-mono text-[var(--tx-muted)]">{item.qty || ''} {item.unit || ''}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Accordions: ยากลับบ้าน / สินค้าสิ้นเปลือง */}
                      <div className="space-y-2">
                        <Accordion title="ยากลับบ้าน" items={medications}
                          nameKey="name" qtyKey="qty" unitKey="unit"
                          icon={<Pill size={11} className="text-[var(--tx-muted)]" />} />
                        <Accordion title="สินค้าสิ้นเปลือง" items={consumables}
                          nameKey="name" qtyKey="qty" unitKey="unit"
                          icon={<Package size={11} className="text-[var(--tx-muted)]" />} />
                      </div>
                    </div>

                    {/* RIGHT: 3-image grid (9/12) */}
                    <div className="md:col-span-8 lg:col-span-9">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider">รูปภาพการรักษา</h5>
                        {onEditTreatment && (
                          <button onClick={() => onEditTreatment(t.id)}
                            data-testid={`timeline-edit-${t.id}`}
                            className="text-xs font-bold flex items-center gap-1 px-2 py-1 rounded transition-all hover:bg-[var(--bg-hover)]"
                            style={{ color: '#2EC4B6' }}>
                            <Edit3 size={11} /> แก้ไขรูป
                          </button>
                        )}
                      </div>
                      {isLoading ? (
                        <div className="flex items-center gap-2 text-xs text-[var(--tx-muted)] py-8 justify-center">
                          <Loader2 size={14} className="animate-spin" /> กำลังโหลดรายละเอียด...
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <ImageGridColumn label="OPD/อื่นๆ" images={otherImages} isDark={isDark} />
                          <ImageGridColumn label="Before" images={beforeImages} isDark={isDark} />
                          <ImageGridColumn label="After" images={afterImages} isDark={isDark} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer (count info) */}
        <div className="px-6 py-3 border-t border-[var(--bd)] flex items-center justify-between text-xs text-[var(--tx-muted)]">
          <span>แสดงทั้งหมด {totalCount} ครั้ง · เรียงจากใหม่ไปเก่า</span>
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-bold border border-[var(--bd)] hover:bg-[var(--bg-hover)] text-[var(--tx-secondary)] transition-all">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
