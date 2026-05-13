// ─── TreatmentReadOnlyPanel — read-only treatment detail card ──────────────
// Phase 26.2 (2026-05-13)
//
// Extracted from TreatmentTimelineModal.jsx row JSX (lines ~276-404) for
// dual-consumer use:
//   1. TreatmentTimelineModal (Task 3 — renders one per treatment in the list)
//   2. TFP split-screen right panel (Task 5 — renders the selected treatment)
//
// AV38 invariant (read-only contract):
//   - NO onEditTreatment / onDeleteTreatment props
//   - NO <input>, <select>, <textarea> elements
//   - NO save / submit buttons
//   Audit grep: no `onEditTreatment` reference, no `data-testid="timeline-edit-*"`.
//
// Accepted props:
//   treatmentSummary — summary row (id, date, doctor, branch, cc, dx, status, …)
//   treatmentFull    — full Firestore treatment doc ({ detail: { treatmentItems, … } })
//   treatmentsLoading — boolean; shows spinner when true AND treatmentFull is null
//   theme            — 'dark' | 'light'
//   accentColor      — hex string e.g. '#2EC4B6'
//   showCloseButton  — boolean (default false); renders close button for TFP use
//   onClose          — () => void; called by close button (no-op if not provided)
//   isLatest         — boolean (default false); shows ล่าสุด badge
//
// Phase 26.2 spec: docs/superpowers/specs/2026-05-13-phase-26-2-tfp-split-screen.md

import { useState, useEffect } from 'react';
import {
  X, Stethoscope, ChevronDown, ChevronUp,
  MapPin, User, Calendar, Pill, Package, Loader2, Image as ImageIcon, Activity,
} from 'lucide-react';
import { fmtThaiDate, THAI_MONTHS_FULL } from '../../lib/dateFormat.js';
import { hexToRgb } from '../../utils.js';
import {
  resolveDoctorDisplayName,
  resolveAssistantsDisplay,
  resolveBranchDisplayName,
} from '../../lib/treatmentDisplayResolvers.js';
import { listDoctors, listStaff, listBranches } from '../../lib/scopedDataLayer.js';

// ─── Local helpers (mirror TreatmentTimelineModal.jsx) ──────────────────────

/** Replicates TreatmentTimelineModal.formatThaiDateFull exactly. */
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

// ─── Image grid column (carousel) ───────────────────────────────────────────
// Full copy from TreatmentTimelineModal.jsx (V21 lightbox-button pattern).
function ImageGridColumn({ label, images, isDark, onZoom }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const valid = (images || []).filter(img => imageUrl(img));
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
        <button type="button" onClick={() => onZoom?.(src, label)}
          data-testid="timeline-img-zoom"
          aria-label={`ขยาย ${label}`}
          className="block w-full aspect-[4/3] rounded-lg overflow-hidden border border-[var(--bd)] hover:ring-2 hover:ring-orange-500 transition-all p-0 cursor-zoom-in bg-transparent">
          <img src={src} alt={label} className="w-full h-full object-cover" loading="lazy" />
        </button>
      </div>
    );
  }

  // Carousel: big image + thumbnail row
  const activeSrc = imageUrl(valid[activeIdx]) || imageUrl(valid[0]);
  return (
    <div>
      <h6 className="text-xs font-bold text-[var(--tx-secondary)] mb-2">{heading}</h6>
      <button type="button" onClick={() => onZoom?.(activeSrc, label)}
        data-testid="timeline-img-zoom"
        aria-label={`ขยาย ${label} ${activeIdx + 1}`}
        className="block w-full aspect-[4/3] rounded-lg overflow-hidden border border-[var(--bd)] hover:ring-2 hover:ring-orange-500 transition-all mb-2 p-0 cursor-zoom-in bg-transparent">
        <img src={activeSrc} alt={`${label} ${activeIdx + 1}`} className="w-full h-full object-cover" loading="lazy" />
      </button>
      <div className="flex flex-wrap gap-1">
        {valid.map((img, i) => {
          const src = imageUrl(img);
          if (!src) return null;
          const isActive = i === activeIdx;
          return (
            <button key={i} type="button" onClick={() => setActiveIdx(i)}
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

// ─── Lightbox overlay (z-[110]) ─────────────────────────────────────────────
// Copy from TreatmentTimelineModal.jsx (V21 fix companion).
// NOTE: Esc handling is intentionally NOT here — the parent TreatmentReadOnlyPanel
// owns a prioritized chain (lightbox first → onClose second) so Task 5 split-screen
// consumers get correct two-step behaviour. Duplicate child handler removed
// Phase 26.2b-review.
function Lightbox({ src, label, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
      role="dialog"
      aria-modal="true"
      aria-label={`ขยายรูป ${label || ''}`}
      data-testid="timeline-lightbox"
      onClick={(e) => { e.stopPropagation(); onClose?.(); }}>
      <img src={src} alt={label || 'รูปขยาย'}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()} />
      <button onClick={(e) => { e.stopPropagation(); onClose?.(); }}
        data-testid="timeline-lightbox-close"
        aria-label="ปิดรูปขยาย"
        className="absolute top-4 right-4 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all">
        <X size={20} />
      </button>
    </div>
  );
}

// ─── Item-list accordion ─────────────────────────────────────────────────────
// Copy from TreatmentTimelineModal.jsx (uses <details> element).
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

// ─── TreatmentReadOnlyPanel ──────────────────────────────────────────────────

/**
 * Read-only treatment detail panel.
 *
 * AV38 — read-only contract enforced:
 *   - No onEditTreatment / onDeleteTreatment props accepted
 *   - No form inputs, selects, textareas
 *   - No save / submit buttons
 *
 * @param {Object}  props
 * @param {Object}  props.treatmentSummary    — summary row (id, date, doctor, branch, cc, dx, status, …)
 * @param {Object}  [props.treatmentFull]     — full Firestore doc with detail sub-object
 * @param {boolean} [props.treatmentsLoading] — shows spinner when true + no full doc
 * @param {string}  [props.theme]             — 'dark' | 'light'
 * @param {string}  [props.accentColor]       — hex color string
 * @param {boolean} [props.showCloseButton]   — renders close button (for TFP split-screen)
 * @param {Function}[props.onClose]           — called when close button clicked
 * @param {boolean} [props.isLatest]          — shows ล่าสุด badge
 */
export default function TreatmentReadOnlyPanel({
  treatmentSummary,
  treatmentFull = null,
  treatmentsLoading = false,
  theme = 'dark',
  accentColor = '#2EC4B6',
  showCloseButton = false,
  onClose,
  isLatest = false,
}) {
  const isDark = theme !== 'light';
  const ac = accentColor || '#2EC4B6';
  const acRgb = hexToRgb(ac);

  // Local lightbox state — self-contained; no prop threading needed
  const [lightbox, setLightbox] = useState(null); // { src, label } | null

  // Phase 27.0 (2026-05-14) — live-resolve doctor/assistant/branch names via
  // treatmentDisplayResolvers (AV42). NEVER fall back to raw doc ID.
  // V41 lookup-map pattern: include hidden persons for past-record display.
  const [doctorMap, setDoctorMap] = useState(() => new Map());
  const [staffMap, setStaffMap] = useState(() => new Map());
  const [branchMap, setBranchMap] = useState(() => new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listDoctors({ includeHidden: true }).catch(() => []),
      listStaff({ includeHidden: true }).catch(() => []),
      listBranches({ allBranches: true }).catch(() => []),
    ]).then(([doctors, staff, branches]) => {
      if (cancelled) return;
      setDoctorMap(new Map(doctors.map((d) => [String(d.id), d])));
      setStaffMap(new Map(staff.map((s) => [String(s.id), s])));
      setBranchMap(new Map(branches.map((b) => [String(b.branchId || b.id), b])));
    });
    return () => { cancelled = true; };
  }, []);

  // Esc: close lightbox first, then call onClose if provided
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(null);
      else onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, lightbox]);

  const t = treatmentSummary || {};
  const fullDoc = treatmentFull || null;
  const detail = fullDoc?.detail || null;

  // Phase 27.0 (2026-05-14) — resolver migration. NEVER fall back to raw ID.
  // Fallback to treatmentSummary pre-resolved strings if detail not yet loaded.
  const doctorId = detail?.doctorId || '';
  const resolvedDoctor = resolveDoctorDisplayName(doctorId, doctorMap, t.doctor);
  const doctorName = resolvedDoctor || t.doctor || '—';
  const branchId = detail?.branchId || '';
  const resolvedBranch = resolveBranchDisplayName(branchId, branchMap, t.branch);
  const branchName = resolvedBranch || t.branch || '—';
  const assistants = detail?.assistants || [];
  const resolvedAssistants = resolveAssistantsDisplay(assistants, doctorMap, staffMap);
  const assistantsDisplay = resolvedAssistants || (t.assistants?.join(', ')) || '—';

  const beforeImages = detail?.beforeImages || [];
  const afterImages = detail?.afterImages || [];
  const otherImages = detail?.otherImages || [];
  const courseItems = detail?.treatmentItems || [];
  const medications = detail?.medications || detail?.takeHomeMeds || [];
  const consumables = detail?.consumables || [];

  const isLoading = treatmentsLoading && !fullDoc;

  return (
    <div
      data-testid="treatment-read-only-panel"
      className="grid grid-cols-1 md:grid-cols-12 gap-5"
    >
      {/* LEFT: meta + items (3/12) */}
      <div className="md:col-span-4 lg:col-span-3 space-y-3">
        {/* Date + ล่าสุด badge + doctor-recorded chip */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} style={{ color: ac }} />
          <span className="text-sm font-bold text-[var(--tx-heading)]">{formatThaiDateFull(t.date) || '-'}</span>
          {isLatest && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `rgba(${acRgb},0.15)`, color: ac }}>ล่าสุด</span>
          )}
          {/* V26.0 doctor-recorded chip (mirror TreatmentTimelineModal + CustomerDetailView) */}
          {t.status === 'doctor-recorded' && (
            <span
              data-testid={`treatment-status-chip-doctor-recorded-${t.id}`}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 border ${isDark ? 'bg-amber-950 border-amber-800 text-amber-100' : 'bg-amber-100 border-amber-200 text-amber-900'}`}
              title="แพทย์ลงบันทึก"
            >
              <Stethoscope size={10} />
              <span>แพทย์ลงบันทึก</span>
            </span>
          )}
          {/* Phase 26.2f-pre — vitals-recorded chip (mirror doctor-recorded chip).
              Renders when treatment.status === 'vitalsigns-recorded' (admin saved
              vitals only; doctor has not yet completed). Teal styling distinct
              from amber doctor-recorded chip. */}
          {t.status === 'vitalsigns-recorded' && (
            <span
              data-testid={`treatment-status-chip-vitalsigns-recorded-${t.id}`}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 border ${isDark ? 'bg-teal-950 border-teal-800 text-teal-100' : 'bg-teal-100 border-teal-200 text-teal-900'}`}
              title="บันทึกข้อมูลซักประวัติ"
            >
              <Activity size={10} />
              <span>บันทึกข้อมูลซักประวัติ</span>
            </span>
          )}
        </div>

        {/* Meta row: branch + doctor + assistants */}
        <div className="space-y-1 text-xs">
          {branchName !== '—' && (
            <div className="flex items-center gap-1.5 text-[var(--tx-secondary)]">
              <MapPin size={11} style={{ color: ac }} />
              <span>{branchName}</span>
            </div>
          )}
          {doctorName !== '—' && (
            <div className="flex items-center gap-1.5 text-[var(--tx-secondary)]">
              <Stethoscope size={11} style={{ color: ac }} />
              <span className="font-semibold">{doctorName}</span>
            </div>
          )}
          {assistantsDisplay !== '—' && (
            <div className="flex items-center gap-1.5 text-[var(--tx-muted)]">
              <User size={11} style={{ color: ac }} />
              <span>{assistantsDisplay}</span>
            </div>
          )}
        </div>

        {/* CC / DX / Dr.Note */}
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

        {/* Course/treatment items */}
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

      {/* RIGHT: image grid (9/12) */}
      <div className="md:col-span-8 lg:col-span-9">
        {/* Header row — NO edit button (AV38 read-only contract) */}
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider">รูปภาพการรักษา</h5>
          {/* showCloseButton: used by TFP split-screen to dismiss the panel */}
          {showCloseButton && (
            <button
              type="button"
              onClick={() => onClose?.()}
              data-testid="treatment-read-only-panel-close"
              aria-label="ปิดรายละเอียดการรักษา"
              className="text-xs font-bold flex items-center gap-1 px-2 py-1 rounded transition-all hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]">
              <X size={11} /> ปิด
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-[var(--tx-muted)] py-8 justify-center">
            <Loader2 size={14} className="animate-spin" /> กำลังโหลดรายละเอียด...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ImageGridColumn label="OPD/อื่นๆ" images={otherImages} isDark={isDark}
              onZoom={(src, lbl) => setLightbox({ src, label: lbl })} />
            <ImageGridColumn label="Before" images={beforeImages} isDark={isDark}
              onZoom={(src, lbl) => setLightbox({ src, label: lbl })} />
            <ImageGridColumn label="After" images={afterImages} isDark={isDark}
              onZoom={(src, lbl) => setLightbox({ src, label: lbl })} />
          </div>
        )}
      </div>

      {/* V21 — In-panel lightbox (z-110, above any parent modal) */}
      {lightbox && (
        <Lightbox src={lightbox.src} label={lightbox.label} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
