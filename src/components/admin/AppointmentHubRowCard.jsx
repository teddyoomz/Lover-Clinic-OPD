// V64 — per-row appointment card with customer summary + appt detail + status-conditional buttons.
// V64-fix11 (2026-05-09): "Editorial Ember" redesign — left-edge status accent bar
// (peripheral-vision indicator), card gradient surface + warm hover border, button
// 3-tier overhaul (ember PRIMARY / sky SECONDARY / rose DESTRUCTIVE / LINE brand).
// Pre-fix11 buttons used solid bg-emerald-600/sky-600/amber-500 — generic Bootstrap-
// feeling. User: "ฝากเปลี่ยนรูปแบบหรือสีของปุ่มทุกปุ่ม ... สไตล์ปุ่มมันเหมือน
// proclinic เป๊ะ".
import React from 'react';
import { isMissedAppointment } from '../../lib/appointmentHubFilters.js';
import { resolveAppointmentTypeLabel } from '../../lib/appointmentTypes.js';
import { buildCustomerDetailUrl } from '../../lib/customerNavigation.js';
import {
  BTN_PRIMARY, BTN_SECONDARY, BTN_DESTRUCTIVE, BTN_LINE,
  CARD_SURFACE, ACCENT_BAR_BASE, ACCENT_BAR, STATUS_CHIP_CLS,
} from './_apptHubStyles.js';
// V71 (2026-05-15) — bottom OPD lifecycle stepper row + inline LINE badge.
// LINE badge moved from absolute-positioned wrapper in AppointmentHubView
// into the right-column status cluster to de-overlap with status chip.
import AppointmentOpdStepperRow from './AppointmentOpdStepperRow.jsx';
import { AppointmentLineBadge } from '../AppointmentLineBadge.jsx';

const STATUS_LABELS = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  done: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
};

// V64-fix2 (Issue 8) preserved — appointment type chip uses APPOINTMENT_TYPES.defaultColor
// (Phase 19.0 SSOT). V64-fix11 refines with borders + dark-mode contrast tuning.
// Phase 25.0a (2026-05-09) — added 'walk-in' 5th type (warm amber/น้ำตาลอ่อน, distinct
// from existing 4 + matches Editorial Ember theme + NOT red per Thai-culture iron-clad).
const TYPE_CHIP_CLS = {
  'deposit-booking':    'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800/60',
  'no-deposit-booking': 'bg-orange-100 text-orange-900 border border-orange-300 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800/60',
  'treatment-in':       'bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800/60',
  'follow-up':          'bg-yellow-100 text-yellow-900 border border-yellow-300 dark:bg-yellow-950/50 dark:text-yellow-200 dark:border-yellow-800/60',
  'walk-in':            'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800/60',
};

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function fullThaiDate(isoYMD) {
  if (typeof isoYMD !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoYMD)) return '';
  const [y, m, d] = isoYMD.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return `วัน${THAI_DOW[dow]} ที่ ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function AppointmentHubRowCard({
  appt,
  summary,
  apptDeposit,
  apptDateTreatments = [],
  isTodayTab = false,                   // V71 NEW
  now = new Date(),
  onConfirm, onEdit, onCancel, onCreateTreatment, onEditTreatment, onOpenLine,
  onMarkServiceComplete,                // V71 NEW
}) {
  const rawStatus = appt.status || 'pending';
  const latestTreatment = apptDateTreatments[0] || null;
  const hasTreatmentForDay = !!latestTreatment;
  // V71 (2026-05-15) — service-completed button visibility: today tab + treatment
  // exists + not yet marked complete. serviceCompletedAt is a Firestore Timestamp
  // or null; truthy-check works for both.
  const showMarkCompleteBtn = isTodayTab && hasTreatmentForDay && !appt.serviceCompletedAt;
  const effectiveStatus = hasTreatmentForDay ? 'done' : rawStatus;
  const status = effectiveStatus;
  const statusLabel = STATUS_LABELS[effectiveStatus] || effectiveStatus;
  const typeLabel = resolveAppointmentTypeLabel(appt.appointmentType);
  const baseMissed = isMissedAppointment(appt, now);
  const todayBangkok = (() => {
    const base = (now instanceof Date ? now : new Date()).getTime();
    const d = new Date(base + 7 * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  })();
  const isPastDate = typeof appt.date === 'string' && appt.date < todayBangkok;
  const isMissed = !hasTreatmentForDay && (baseMissed || (isPastDate && rawStatus === 'pending'));
  const linkedTreatmentId = latestTreatment?.id || appt.linkedTreatmentId || '';
  const hasLinkedTreatment = !!linkedTreatmentId;
  const depositPurpose = apptDeposit
    ? (apptDeposit.note || apptDeposit.appointment?.appointmentTo || apptDeposit.appointment?.purpose || appt.appointmentTo || '').trim()
    : '';

  const handleEditTreatmentBound = () => {
    onEditTreatment?.({ ...appt, linkedTreatmentId });
  };

  // V64-fix11: accent-bar key derives from PRIORITY (missed > status). Missed
  // overrides done so admin sees the urgency even on past completed records
  // that lack treatment data.
  const accentKey = isMissed ? 'missed' : effectiveStatus;
  const accentClass = ACCENT_BAR[accentKey] || ACCENT_BAR.pending;

  return (
    <div
      className={`${CARD_SURFACE} flex flex-col`}
      data-testid="appt-hub-row"
      data-appt-id={appt.id}
      data-status-accent={accentKey}
    >
      {/* V64-fix11 — left-edge status accent bar (3px gradient). Peripheral
          vision: admin scans the queue + sees urgency colour from edge.
          V71 (2026-05-15) — accent bar stays at outermost level so the 3px
          edge spans the FULL card height (3-column body + OPD stepper row). */}
      <span aria-hidden="true" data-testid="row-accent-bar" className={`${ACCENT_BAR_BASE} ${accentClass}`} />

      {/* V71 (2026-05-15) — 3-column body wrapped so the V71 OPD stepper row
          can sit BELOW the 3 columns as a full-width footer of the card. */}
      <div className="flex flex-col md:flex-row gap-4">
      {/* LEFT — Customer
          V64-fix14: min-w-0 on mobile so card can shrink below 260px on
          narrow viewports without horizontal overflow. */}
      <div className="flex-1 min-w-0 md:min-w-[260px] pl-2">
        <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
          <span
            className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--tx-muted)]"
            data-testid="row-hn"
          >
            HN · {summary?.hn || '-'}
          </span>
          {summary?.membershipTier && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 dark:bg-yellow-950/50 dark:text-yellow-200 dark:border-yellow-800/60">
              {summary.membershipTier} · เหลือ {summary.membershipDaysLeft} วัน
            </span>
          )}
        </div>

        {/* V64-fix9: patient name sky-blue (Thai-culture iron-clad: NOT red).
            V64-fix11: bumped to text-lg + font-black for editorial weight. */}
        {appt.customerId ? (
          <a
            href={buildCustomerDetailUrl(appt.customerId)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-black text-lg text-sky-700 dark:text-sky-300 hover:underline hover:text-sky-500 cursor-pointer inline-block leading-tight"
            data-testid="row-name"
            data-customer-id={appt.customerId}
            title="เปิดข้อมูลลูกค้าใน tab ใหม่"
          >
            {summary?.name || appt.customerName || '-'}
          </a>
        ) : (
          <div className="font-black text-lg text-sky-700 dark:text-sky-300 leading-tight" data-testid="row-name">
            {summary?.name || appt.customerName || '-'}
          </div>
        )}

        <div className="text-xs text-[var(--tx-muted)] flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {summary?.gender && <span>เพศ {summary.gender}</span>}
          {summary?.phone && <span>📞 {summary.phone}</span>}
        </div>

        {/* V64-fix10: finance chips bumped to text-xs + font-bold + border + emoji */}
        <div className="flex flex-wrap gap-1.5 mt-2.5" data-testid="row-finance-chips">
          {summary?.walletBalance > 0 && (
            <span
              data-testid="row-chip-wallet"
              className="text-xs font-bold px-2 py-1 rounded bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-700/60"
            >
              💰 Wallet {fmtMoney(summary.walletBalance)} ฿
            </span>
          )}
          {summary?.activeDepositTotal > 0 && (
            <span
              data-testid="row-chip-deposit"
              className="text-xs font-bold px-2 py-1 rounded bg-orange-100 text-orange-900 border border-orange-300 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-700/60"
            >
              🏷️ มัดจำ {fmtMoney(summary.activeDepositTotal)} ฿
            </span>
          )}
          {summary?.outstandingTotal > 0 && (
            <span
              data-testid="row-chip-outstanding"
              className="text-xs font-bold px-2 py-1 rounded bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-700/60"
            >
              ⚠️ ค่างชำระ {fmtMoney(summary.outstandingTotal)} ฿
            </span>
          )}
          {summary?.lifetimeSaleTotal > 0 && (
            <span
              data-testid="row-chip-lifetime"
              className="text-xs font-bold px-2 py-1 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700/60"
            >
              📈 ยอดสั่งซื้อ {fmtMoney(summary.lifetimeSaleTotal)} ฿
            </span>
          )}
        </div>
      </div>

      {/* MIDDLE — Appointment detail (min-w-0 mobile per V64-fix14) */}
      <div className="flex-1 min-w-0 md:min-w-[260px] text-xs space-y-1">
        {/* V64-fix9: time bumped to text-base + amber-emphasis chip */}
        <div className="text-sm font-bold text-[var(--tx-heading)] mb-1.5 flex flex-wrap items-center gap-2" data-testid="row-date-full">
          <span className="text-[var(--tx-muted)]">📅</span>
          <span className="text-[var(--tx-heading)]">{fullThaiDate(appt.date)}</span>
          <span
            className="text-base font-mono font-black px-2.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 border border-amber-300 dark:border-amber-800/60 shadow-sm"
            data-testid="row-time-emphasis"
          >
            {appt.startTime || '-'} – {appt.endTime || '-'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {typeLabel && (
            <span
              data-testid="row-type-chip"
              className={`text-[10px] px-2 py-0.5 rounded font-bold ${TYPE_CHIP_CLS[appt.appointmentType] || 'bg-gray-100 text-gray-800'}`}
            >
              {typeLabel}
            </span>
          )}
          {apptDeposit && (
            <span
              data-testid="row-deposit-chip"
              className="text-[10px] px-2 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700/60 font-bold"
              title={`เลขมัดจำ: ${apptDeposit.id || apptDeposit.depositId || '-'}`}
            >
              💰 มัดจำ {fmtMoney(apptDeposit.amount)} ฿{depositPurpose ? ` · เพื่อ ${depositPurpose}` : ''}
            </span>
          )}
          {isMissed && (
            <span
              className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800/60 font-bold uppercase tracking-wider"
              data-testid="row-missed-chip"
            >
              ⚠ ไม่มาตามนัด
            </span>
          )}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
          <dt className="text-[var(--tx-muted)]">ที่ปรึกษา</dt>
          <dd className="text-[var(--tx-heading)]">{appt.advisor || '-'}</dd>
          <dt className="text-[var(--tx-muted)]">แพทย์</dt>
          <dd className="text-[var(--tx-heading)]">{appt.doctorName || '-'}</dd>
          <dt className="text-[var(--tx-muted)]">ผู้ช่วย</dt>
          <dd className="text-[var(--tx-heading)]">{(appt.assistantNames || []).join(', ') || appt.assistantName || '-'}</dd>
          <dt className="text-[var(--tx-muted)]">ห้องตรวจ</dt>
          <dd className="text-[var(--tx-heading)]">{appt.roomName || '-'}</dd>
        </dl>

        {/* V64-fix9: "นัดมาเพื่อ" prominent — emerald chip + uppercase label */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="row-purpose-block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)]">นัดมาเพื่อ</span>
          <span
            className="text-sm font-bold px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800/60 max-w-full truncate"
            data-testid="row-purpose"
            title={appt.appointmentTo || ''}
          >
            {appt.appointmentTo || '—'}
          </span>
        </div>
      </div>

      {/* RIGHT — Status + Actions
          V64-fix14: always flex-col (was `flex md:flex-col` causing status +
          buttons to crowd horizontally on mobile narrow). On mobile section
          is full-width so items-start (left-align), on desktop md+ it's a
          right rail so md:items-end. min-w only on desktop so card collapses
          cleanly on mobile. */}
      <div className="flex flex-col gap-2 items-start md:items-end justify-start md:min-w-[200px]">
        {/* V71 (2026-05-15) — LINE badge inline with status chip (de-overlap
            from absolute top-right wrapper that lived in AppointmentHubView).
            AppointmentLineBadge self-nullifies when appt has no LINE channel,
            so harmless for non-LINE appts. */}
        <div className="flex items-center gap-2 flex-wrap md:justify-end">
          <AppointmentLineBadge appt={appt} size="xs" />
          <span
            className={`text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${STATUS_CHIP_CLS[status] || ''}`}
            data-testid="row-status"
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap md:justify-end">
          {/* V71 (2026-05-15) — mark service complete (today tab only, treatment
              recorded, not already completed). Confirm dialog before optimistic
              write. Rendered FIRST so it's the most prominent action in the row. */}
          {showMarkCompleteBtn && (
            <button
              type="button"
              data-testid="row-action-mark-complete"
              onClick={() => {
                if (window.confirm('ยืนยันลูกค้าได้รับบริการเรียบร้อย? ลูกค้าจะถูกย้ายไปแท็บ "เสร็จแล้ว"')) {
                  onMarkServiceComplete?.(appt);
                }
              }}
              className={BTN_PRIMARY}
            >
              ✓ ลูกค้ารับบริการเรียบร้อย
            </button>
          )}
          {appt.customerLineUserId && (
            <button
              type="button"
              data-testid="row-action-line"
              onClick={() => onOpenLine?.(appt)}
              title="LINE"
              className={BTN_LINE}
            >
              LINE
            </button>
          )}
          {/* V64-fix6 priority order preserved (treatment-aware):
              1. hasTreatmentForDay → "แก้ไขบันทึกการรักษา" (PRIMARY ember)
              2. rawStatus='done' → "แก้ไขการรักษา"/"บันทึกการรักษา" (PRIMARY)
              3. pending|confirmed && isPastDate → "สร้างบันทึกการรักษา" + missed
              4. pending && !isPastDate → "คอนเฟิร์มนัด" (PRIMARY) + edit + cancel
              5. confirmed && !isPastDate → "บันทึกการรักษา" (PRIMARY) + edit + cancel
              6. cancelled → read-only badge
             V64-fix11 — buttons mapped to 3-tier:
                PRIMARY (ember): confirm / record-treatment / save (positive "go")
                SECONDARY (sky): edit-appointment (navigation/contextual)
                DESTRUCTIVE (rose ghost): cancel
          */}
          {hasTreatmentForDay && (
            <>
              <button
                data-testid="row-action-edit-treatment"
                onClick={handleEditTreatmentBound}
                className={BTN_PRIMARY}
              >
                แก้ไขบันทึกการรักษา
              </button>
              <button
                data-testid="row-action-edit"
                onClick={() => onEdit?.(appt)}
                className={BTN_SECONDARY}
              >
                แก้ไขนัด
              </button>
            </>
          )}
          {!hasTreatmentForDay && rawStatus === 'done' && (
            <>
              <button
                data-testid="row-action-edit-treatment"
                onClick={() => hasLinkedTreatment ? onEditTreatment?.(appt) : onCreateTreatment?.(appt)}
                className={BTN_PRIMARY}
              >
                {hasLinkedTreatment ? 'แก้ไขการรักษา' : 'บันทึกการรักษา'}
              </button>
              {!hasLinkedTreatment && (
                <button
                  data-testid="row-action-cancel"
                  onClick={() => onCancel?.(appt)}
                  className={BTN_DESTRUCTIVE}
                >
                  ยกเลิก
                </button>
              )}
            </>
          )}
          {!hasTreatmentForDay && isPastDate && (rawStatus === 'pending' || rawStatus === 'confirmed') && (
            <>
              <button
                data-testid="row-action-create-treatment"
                onClick={() => onCreateTreatment?.(appt)}
                className={BTN_PRIMARY}
              >
                สร้างบันทึกการรักษา
              </button>
              <button
                data-testid="row-action-edit"
                onClick={() => onEdit?.(appt)}
                className={BTN_SECONDARY}
              >
                แก้ไขนัด
              </button>
              <button
                data-testid="row-action-cancel"
                onClick={() => onCancel?.(appt)}
                className={BTN_DESTRUCTIVE}
              >
                ยกเลิก
              </button>
            </>
          )}
          {!hasTreatmentForDay && rawStatus === 'pending' && !isPastDate && (
            <>
              <button
                data-testid="row-action-confirm"
                onClick={() => onConfirm?.(appt)}
                className={BTN_PRIMARY}
              >
                คอนเฟิร์มนัด
              </button>
              <button
                data-testid="row-action-edit"
                onClick={() => onEdit?.(appt)}
                className={BTN_SECONDARY}
              >
                แก้ไขนัด
              </button>
              <button
                data-testid="row-action-cancel"
                onClick={() => onCancel?.(appt)}
                className={BTN_DESTRUCTIVE}
              >
                ยกเลิก
              </button>
            </>
          )}
          {!hasTreatmentForDay && rawStatus === 'confirmed' && !isPastDate && (
            <>
              <button
                data-testid="row-action-create-treatment"
                onClick={() => onCreateTreatment?.(appt)}
                className={BTN_PRIMARY}
              >
                บันทึกการรักษา
              </button>
              <button
                data-testid="row-action-edit"
                onClick={() => onEdit?.(appt)}
                className={BTN_SECONDARY}
              >
                แก้ไขนัด
              </button>
              <button
                data-testid="row-action-cancel"
                onClick={() => onCancel?.(appt)}
                className={BTN_DESTRUCTIVE}
              >
                ยกเลิก
              </button>
            </>
          )}
          {rawStatus === 'cancelled' && !hasTreatmentForDay && (
            <span className="text-[11px] text-[var(--tx-muted)] italic px-2 py-1 border border-dashed border-[var(--bd)] rounded">
              ยกเลิกแล้ว
            </span>
          )}
        </div>
      </div>
      {/* end of inner 3-column wrapper (V71) */}
      </div>
      {/* V71 (2026-05-15) — full-width OPD lifecycle stepper row sits below the
          3-column body. AppointmentOpdStepperRow self-nullifies when no
          treatment exists AND isTodayTab=false (other tabs hide entirely). */}
      <AppointmentOpdStepperRow latestTreatment={latestTreatment} isTodayTab={isTodayTab} />
    </div>
  );
}
