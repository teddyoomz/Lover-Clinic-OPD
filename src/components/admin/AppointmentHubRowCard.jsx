// V64 — per-row appointment card with customer summary + appt detail + status-conditional buttons.
// V64-fix11 (2026-05-09): "Editorial Ember" redesign — left-edge status accent bar
// (peripheral-vision indicator), card gradient surface + warm hover border, button
// 3-tier overhaul (ember PRIMARY / sky SECONDARY / rose DESTRUCTIVE / LINE brand).
// Pre-fix11 buttons used solid bg-emerald-600/sky-600/amber-500 — generic Bootstrap-
// feeling. User: "ฝากเปลี่ยนรูปแบบหรือสีของปุ่มทุกปุ่ม ... สไตล์ปุ่มมันเหมือน
// proclinic เป๊ะ".
// Card redesign (2026-05-26 EOD+6): COSMETIC-SHELL re-layout into a 5-band stack
// (header / finance / detail / OPD footer / actions) — beautiful + theme-correct in
// BOTH Dark and Light. ZERO changes to any handler / data-testid / conditional. The
// round-circle สถานะ OPD stepper (AppointmentOpdStepperRow / TreatmentLifecycleStepper)
// is OFF-LIMITS — only re-parented verbatim into the footer band.
import React from 'react';
import { isMissedAppointment } from '../../lib/appointmentHubFilters.js';
import { resolveAppointmentTypeLabel } from '../../lib/appointmentTypes.js';
import { buildCustomerDetailUrl } from '../../lib/customerNavigation.js';
import {
  BTN_PRIMARY, BTN_SECONDARY, BTN_DESTRUCTIVE, BTN_LINE,
  ACCENT_BAR_BASE, ACCENT_BAR, STATUS_CHIP_CLS,
} from './_apptHubStyles.js';
// V71 (2026-05-15) — bottom OPD lifecycle stepper row + inline LINE badge.
// LINE badge moved from absolute-positioned wrapper in AppointmentHubView
// into the right-column status cluster to de-overlap with status chip.
import AppointmentOpdStepperRow from './AppointmentOpdStepperRow.jsx';
import { AppointmentLineBadge } from '../AppointmentLineBadge.jsx';
import PhoneLink from '../PhoneLink.jsx';
// V118 (2026-05-23) — card-level OPD lifecycle row (link send/view + save + view).
import OpdLifecycleRow from './OpdLifecycleRow.jsx';

// V73-BS1 (2026-05-18) — confirmed label expanded to "ยืนยันแล้ว · รอการรักษา"
// per user spec: badge state machine
//   pending             → "รอยืนยัน"
//   confirmed (NOT done) → "ยืนยันแล้ว · รอการรักษา"  ← V73-BS1 expanded
//   done (serviceCompletedAt truthy) → "เสร็จแล้ว"
//   cancelled            → "ยกเลิก"
// `done` is now driven by `serviceCompletedAt` (not `hasTreatmentForDay`) so
// the badge correctly reverts to "ยืนยันแล้ว · รอการรักษา" when admin un-marks
// service-complete and moves the customer back to the waiting queue.
const STATUS_LABELS = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว · รอการรักษา',
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
  onUnmarkServiceComplete,              // V71.A NEW — symmetric "back to waiting" handler
  // V118 (2026-05-23) — card-level OPD lifecycle (link + save + view). Object
  // shape: { state, onSendLink, onViewLink, onSaveOpd, onViewOpd,
  //          sendLinkBusy, saveOpdBusy, hidden } — see OpdLifecycleRow props.
  // `hidden:true` short-circuits render (used on the ยกเลิก sub-tab).
  // null/undefined → row not rendered (back-compat for old callers).
  opdLifecycle = null,
}) {
  const rawStatus = appt.status || 'pending';
  const latestTreatment = apptDateTreatments[0] || null;
  const hasTreatmentForDay = !!latestTreatment;
  // V71 (2026-05-15) → V71.B-ter (2026-05-18) → V126 (2026-05-24 EOD+1) —
  // service-completed button gate.
  // V71.B-ter dropped TREATMENT-related gates (hasTreatmentForDay,
  // wasServiceCompleted) per "trust admin's deliberate click" — those were
  // fragile (treatment-link race / date-mismatch). V126 adds a WORKFLOW gate
  // on `status === 'confirmed'` because the user wants strict sequencing:
  // คอนเฟิร์มนัด (= ยืนยันลูกค้ามาคลินิก) → ✓ ลูกค้ารับบริการเรียบร้อย.
  // V71.B-ter's philosophy is preserved — `status` is set by deliberate admin
  // click on "คอนเฟิร์มนัด" (not a fragile derived value), so this gate
  // doesn't reintroduce the V71-class limbo bug. Orthogonal concerns.
  // User directive 2026-05-24 EOD+1: "ต้องกดคอนเฟืมนัดก่อน เป็นการยืนยันว่า
  // ลูกค้ามาคลินิกตามนัดแล้ว ถึงจะกด ✓ ลูกค้ารับบริการเรียบร้อย ได้".
  const showMarkCompleteBtn = isTodayTab && !appt.serviceCompletedAt && rawStatus === 'confirmed';
  // V71.A (2026-05-15) — un-mark button visibility (symmetric mirror): today tab +
  // already marked complete. Mutually exclusive with showMarkCompleteBtn (one
  // requires !serviceCompletedAt, the other requires !!serviceCompletedAt).
  // Lets admin recover from accidental mark-complete press.
  const showUnmarkBtn = isTodayTab && !!appt.serviceCompletedAt;
  // V73-BS1 (2026-05-18) — badge "done" status follows serviceCompletedAt,
  // NOT hasTreatmentForDay. Pre-fix: badge stayed green "เสร็จแล้ว" after
  // admin clicked "↩ กลับไปคิวรอ" because hasTreatmentForDay was still true
  // (treatment record exists, just not yet service-completed). Post-fix:
  // un-mark clears serviceCompletedAt → effectiveStatus reverts to 'confirmed'
  // → badge shows "ยืนยันแล้ว · รอการรักษา" matching the waiting-queue state.
  const effectiveStatus = appt.serviceCompletedAt ? 'done' : rawStatus;
  const status = effectiveStatus;
  // ① (2026-05-31) — confirmed (not yet served) gets a clear sky-tinted box
  // (matches the existing sky "ยืนยันแล้ว" accent/chip). Cosmetic only — uses the
  // already-derived effectiveStatus; no handler/state/prop change.
  const isConfirmedHighlight = effectiveStatus === 'confirmed';
  const surfaceCls = isConfirmedHighlight
    ? 'border-sky-500/50 bg-sky-500/[0.06]'
    : 'border-[var(--bd)] bg-[var(--bg-card)]';
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

  // Card redesign (2026-05-26): the OPD footer band renders iff at least one of
  // its children would render — OpdLifecycleRow (opdLifecycle present + not hidden)
  // OR the stepper (latestTreatment OR isTodayTab; it self-nullifies otherwise).
  // Each child keeps its own render condition byte-for-byte; this gate only
  // avoids an empty warm strip. No behavior change.
  const showOpdLifecycle = !!(opdLifecycle && !opdLifecycle.hidden);
  const showOpdFooterBand = showOpdLifecycle || !!latestTreatment || isTodayTab;
  // EOD+7 (2026-05-26) — filled-pending (📥 ลูกค้ากรอกแล้ว · รอบันทึก, OPD
  // state D) → card gets a strong "unread"-style breathing + shadow (CSS
  // .card-filled-pending) so it pops out of the queue. Same condition as the
  // ready-to-save chip (line ~183). Cosmetic only — no handler/wiring change.
  const isFilledPending = !!(opdLifecycle && opdLifecycle.state === 'D' && !opdLifecycle.hidden);

  return (
    <div
      className={`relative border ${surfaceCls} rounded-2xl overflow-hidden shadow-sm mb-3 flex flex-col transition-all duration-200 hover:border-orange-700/30 hover:shadow-lg hover:shadow-orange-950/10${isFilledPending ? ' card-filled-pending' : ''}`}
      data-testid="appt-hub-row"
      data-appt-id={appt.id}
      data-status-accent={accentKey}
    >
      {/* V64-fix11 — left-edge status accent bar (3px gradient). Peripheral vision:
          admin scans the queue + sees urgency colour from edge. Spans full card
          height (all 5 bands). */}
      <span aria-hidden="true" data-testid="row-accent-bar" className={`${ACCENT_BAR_BASE} ${accentClass}`} />

      {/* ① HEADER BAND — HN · membership/ready chip · name (sky, never red) · phone
          | right: LINE badge + status pill */}
      <div className="flex justify-between items-start gap-3 px-4 py-3 pl-5 bg-[var(--bg-elevated)] border-b border-[var(--bd)]">
        <div className="min-w-0">
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
            {/* V118 — ready-to-save chip (State D). Visible next to HN so admin
                sees the "ready" state at a glance. */}
            {opdLifecycle && opdLifecycle.state === 'D' && !opdLifecycle.hidden && (
              <span
                data-testid="opd-ready-to-save-chip"
                className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-700/60 animate-pulse"
                style={{ animationDuration: '2.4s' }}
              >
                📥 ลูกค้ากรอกแล้ว · รอบันทึก
              </span>
            )}
          </div>

          {/* V64-fix9: patient name sky-blue (Thai-culture iron-clad: NOT red). */}
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
            {summary?.phone && <span>📞 <PhoneLink value={summary.phone}>{summary.phone}</PhoneLink></span>}
          </div>
        </div>

        {/* V71 — LINE badge inline with status chip. AppointmentLineBadge
            self-nullifies when appt has no LINE channel. */}
        <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
          <AppointmentLineBadge appt={appt} size="xs" />
          <span
            className={`text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${STATUS_CHIP_CLS[status] || ''}`}
            data-testid="row-status"
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* ② FINANCE STRIP — wallet / มัดจำ / ค่างชำระ / ยอดสั่งซื้อ (same 4 conditionals) */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2 pl-5 border-b border-[var(--bd)]" data-testid="row-finance-chips">
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

      {/* ③ DETAIL ZONE — 2-col desktop, 1-col mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 py-3 pl-5 text-xs">
        <div className="space-y-1 min-w-0">
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

          <div className="flex items-center gap-1.5 flex-wrap">
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
        </div>

        <div className="min-w-0">
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
            <dt className="text-[var(--tx-muted)]">ที่ปรึกษา</dt>
            {/* V73 RC1 fix (2026-05-18) — Canonical Firestore field is `advisorName`
                (written by AppointmentFormModal:626 + AdminDashboard:3119 +
                appointmentDepositBatch:536). Pre-fix this read `appt.advisor` which
                is the legacy FORM-STATE field name on AdminDashboard's local
                noDepositFormData but NOT the stored doc field — always empty here.
                Mirror sibling lines 249 (doctorName) + 253 (roomName) pattern. */}
            <dd className="text-[var(--tx-heading)]">{appt.advisorName || appt.advisor || '-'}</dd>
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
      </div>

      {/* ④ OPD FOOTER ZONE — lifecycle pills + the สถานะ OPD stepper. NO "OPD
          lifecycle" header label (Q5). Warm-tinted footer band. The stepper
          (AppointmentOpdStepperRow → TreatmentLifecycleStepper) is re-parented
          VERBATIM — never restyled/recolored (Q4). */}
      {showOpdFooterBand && (
        <div className="px-4 py-2 pl-5 border-t border-red-500/25 dark:border-red-500/20 bg-red-100/50 dark:bg-red-500/[0.06]">
          {showOpdLifecycle && (
            <OpdLifecycleRow
              state={opdLifecycle.state}
              onSendLink={opdLifecycle.onSendLink}
              onViewLink={opdLifecycle.onViewLink}
              onSaveOpd={opdLifecycle.onSaveOpd}
              onViewOpd={opdLifecycle.onViewOpd}
              sendLinkBusy={!!opdLifecycle.sendLinkBusy}
              saveOpdBusy={!!opdLifecycle.saveOpdBusy}
            />
          )}
          <AppointmentOpdStepperRow latestTreatment={latestTreatment} isTodayTab={isTodayTab} />
        </div>
      )}

      {/* ⑤ ACTION BAR — the SAME status-conditional button matrix, relocated to a
          bottom bar. Every button + data-testid + onClick + conditional verbatim. */}
      <div className="flex gap-1.5 flex-wrap justify-end px-4 py-2.5 border-t border-[var(--bd)] bg-[var(--bg-elevated)]">
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
        {/* V71.A (2026-05-15) — un-mark service complete (today tab + already
            completed). For when admin pressed mark-complete by mistake. Uses
            SECONDARY (sky) tier since it's a corrective action, not the
            primary call-to-action. Confirm dialog before optimistic revert. */}
        {showUnmarkBtn && (
          <button
            type="button"
            data-testid="row-action-unmark-complete"
            onClick={() => {
              if (window.confirm('ย้ายลูกค้ากลับไปคิวรอ? (ใช้ในกรณีกดผิด)')) {
                onUnmarkServiceComplete?.(appt);
              }
            }}
            className={BTN_SECONDARY}
          >
            ↩ กลับไปคิวรอ
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
  );
}
