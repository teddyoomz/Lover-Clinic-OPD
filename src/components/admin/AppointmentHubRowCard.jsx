// V64 — per-row appointment card with customer summary + appt detail + status-conditional buttons.
import React from 'react';
import { isMissedAppointment } from '../../lib/appointmentHubFilters.js';
import { resolveAppointmentTypeLabel } from '../../lib/appointmentTypes.js';

const STATUS_LABELS = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  done: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
};

const STATUS_CHIP_CLS = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  confirmed: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  cancelled: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

// V64-fix2 (Issue 8): color-coded type badges per APPOINTMENT_TYPES.defaultColor
// (Phase 19.0 SSOT). Each type gets a distinct hue + adequate dark-mode contrast.
const TYPE_CHIP_CLS = {
  'deposit-booking':    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  'no-deposit-booking': 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
  'treatment-in':       'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  'follow-up':          'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300',
};

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// V64-fix2 (Issue 3): full Thai date label "วันพฤหัสบดี ที่ 9 พฤษภาคม 2569"
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
  apptDeposit,  // V64-fix4 (Issue 1): linked-deposit doc if appt came from จองมัดจำ flow
  apptDateTreatments = [],  // V64-fix6: treatments for THIS customer+date (sorted createdAt DESC)
  now = new Date(),
  onConfirm, onEdit, onCancel, onCreateTreatment, onEditTreatment, onOpenLine,
}) {
  const rawStatus = appt.status || 'pending';
  // V64-fix6: treatment-aware logic. If a treatment exists for this customer
  // on this appointment's date (any time), the system treats the appointment
  // as effectively done — admin may have forgotten to confirm, but the
  // treatment record is the source of truth that the customer DID come.
  const latestTreatment = apptDateTreatments[0] || null;
  const hasTreatmentForDay = !!latestTreatment;
  const effectiveStatus = hasTreatmentForDay ? 'done' : rawStatus;
  const status = effectiveStatus;  // alias used by button-set switches below
  const statusLabel = STATUS_LABELS[effectiveStatus] || effectiveStatus;
  const typeLabel = resolveAppointmentTypeLabel(appt.appointmentType);
  // V64-fix6: missed badge ONLY when past date AND no treatment found.
  // The base isMissedAppointment only checks status==='confirmed'; we extend
  // to also flag past 'pending' (admin forgot to confirm + customer never came).
  const baseMissed = isMissedAppointment(appt, now);
  const todayBangkok = (() => {
    // V64-fix6: respects injected `now` prop (test/SSR friendly).
    // Bangkok-stable midday-UTC parse pattern.
    const base = (now instanceof Date ? now : new Date()).getTime();
    const d = new Date(base + 7 * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  })();
  const isPastDate = typeof appt.date === 'string' && appt.date < todayBangkok;
  const isMissed = !hasTreatmentForDay && (baseMissed || (isPastDate && rawStatus === 'pending'));
  // V64-fix6: linked-treatment fallback chain — prefer latestTreatment.id
  // (proves customer came on this date), fall back to appt.linkedTreatmentId
  // (legacy field).
  const linkedTreatmentId = latestTreatment?.id || appt.linkedTreatmentId || '';
  const hasLinkedTreatment = !!linkedTreatmentId;
  // V64-fix4 (Issue 1): deposit purpose fallback chain
  const depositPurpose = apptDeposit
    ? (apptDeposit.note || apptDeposit.appointment?.appointmentTo || apptDeposit.appointment?.purpose || appt.appointmentTo || '').trim()
    : '';

  // V64-fix6: helper that wraps onEditTreatment with the resolved treatment id
  // (so the parent's existing handler receives appt.linkedTreatmentId pointing
  // at the latest same-day treatment, not the legacy stored one).
  const handleEditTreatmentBound = () => {
    onEditTreatment?.({ ...appt, linkedTreatmentId });
  };

  return (
    <div
      className="border border-[var(--bd)] rounded-xl bg-[var(--bg-card)] p-3 mb-2 flex flex-col md:flex-row gap-3"
      data-testid="appt-hub-row"
      data-appt-id={appt.id}
    >
      {/* LEFT — Customer */}
      <div className="flex-1 min-w-[260px]">
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className="text-[11px] text-[var(--tx-muted)]" data-testid="row-hn">HN: {summary?.hn || '-'}</span>
          {summary?.membershipTier && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">
              {summary.membershipTier} คงเหลือ {summary.membershipDaysLeft} วัน
            </span>
          )}
        </div>
        <div className="font-bold text-sm text-[var(--tx-heading)]" data-testid="row-name">
          {summary?.name || appt.customerName || '-'}
        </div>
        <div className="text-xs text-[var(--tx-muted)] flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {summary?.gender && <span>เพศ: {summary.gender}</span>}
          {summary?.phone && <span>📞 {summary.phone}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {summary?.walletBalance > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
              Wallet {fmtMoney(summary.walletBalance)} ฿
            </span>
          )}
          {summary?.activeDepositTotal > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-800">
              มัดจำ {fmtMoney(summary.activeDepositTotal)} ฿
            </span>
          )}
          {summary?.outstandingTotal > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
              ค่างชำระ {fmtMoney(summary.outstandingTotal)} ฿
            </span>
          )}
          {summary?.lifetimeSaleTotal > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
              ยอดสั่งซื้อ {fmtMoney(summary.lifetimeSaleTotal)} ฿
            </span>
          )}
        </div>
      </div>

      {/* MIDDLE — Appointment detail */}
      <div className="flex-1 min-w-[260px] text-xs space-y-0.5">
        {/* V64-fix2 (Issue 3): full Thai date label, prominently */}
        <div className="text-sm font-bold text-[var(--tx-heading)] mb-1" data-testid="row-date-full">
          📅 {fullThaiDate(appt.date)} <span className="text-[var(--tx-muted)] font-normal">· {appt.startTime || '-'} - {appt.endTime || '-'}</span>
        </div>
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {typeLabel && (
            <span
              data-testid="row-type-chip"
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${TYPE_CHIP_CLS[appt.appointmentType] || 'bg-gray-100 text-gray-800'}`}
            >
              {typeLabel}
            </span>
          )}
          {/* V64-fix4 (Issue 1): per-appt linked deposit chip — amount + purpose */}
          {apptDeposit && (
            <span
              data-testid="row-deposit-chip"
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 font-bold"
              title={`เลขมัดจำ: ${apptDeposit.id || apptDeposit.depositId || '-'}`}
            >
              💰 มัดจำ {fmtMoney(apptDeposit.amount)} ฿{depositPurpose ? ` · เพื่อ ${depositPurpose}` : ''}
            </span>
          )}
          {isMissed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold" data-testid="row-missed-chip">
              ไม่มาตามนัด
            </span>
          )}
        </div>
        <div className="text-[var(--tx-muted)]">ที่ปรึกษา: <span className="text-[var(--tx-heading)]">{appt.advisor || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">แพทย์: <span className="text-[var(--tx-heading)]">{appt.doctorName || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">ผู้ช่วย: <span className="text-[var(--tx-heading)]">{(appt.assistantNames || []).join(', ') || appt.assistantName || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">เวลานัด: <span className="text-[var(--tx-heading)]">{appt.startTime || '-'} - {appt.endTime || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">ห้องตรวจ: <span className="text-[var(--tx-heading)]">{appt.roomName || '-'}</span></div>
        <div className="text-[var(--tx-muted)]">นัดมาเพื่อ: <span className="text-[var(--tx-heading)]">{appt.appointmentTo || '-'}</span></div>
      </div>

      {/* RIGHT — Status + Actions */}
      <div className="flex md:flex-col gap-2 items-end justify-start min-w-[200px]">
        <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${STATUS_CHIP_CLS[status] || ''}`} data-testid="row-status">
          {statusLabel}
        </span>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {appt.customerLineUserId && (
            <button
              type="button"
              data-testid="row-action-line"
              onClick={() => onOpenLine?.(appt)}
              title="LINE"
              className="text-[11px] px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-bold"
            >
              LINE
            </button>
          )}
          {/* V64-fix6 priority order (treatment-aware):
              1. hasTreatmentForDay (V64-fix6: ANY same-day treatment) →
                 "แก้ไขบันทึกการรักษา" linked to latest. Auto-confirms.
              2. rawStatus='done' (legacy V64-fix2) → "แก้ไขการรักษา"/
                 "บันทึกการรักษา" with linkedTreatmentId fallback toggle
              3. pending|confirmed && isPastDate → "สร้างบันทึกการรักษา"
                 + missed badge (V64-fix6: customer never came)
              4. pending && !isPastDate → existing pending flow
              5. confirmed && !isPastDate → existing confirmed flow
              6. cancelled → read-only badge
          */}
          {hasTreatmentForDay && (
            <>
              <button
                data-testid="row-action-edit-treatment"
                onClick={handleEditTreatmentBound}
                className="text-[11px] px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold"
              >
                แก้ไขบันทึกการรักษา
              </button>
              <button data-testid="row-action-edit" onClick={() => onEdit?.(appt)} className="text-[11px] px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold">
                แก้ไขนัด
              </button>
            </>
          )}
          {!hasTreatmentForDay && rawStatus === 'done' && (
            <>
              <button
                data-testid="row-action-edit-treatment"
                onClick={() => hasLinkedTreatment ? onEditTreatment?.(appt) : onCreateTreatment?.(appt)}
                className="text-[11px] px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold"
              >
                {hasLinkedTreatment ? 'แก้ไขการรักษา' : 'บันทึกการรักษา'}
              </button>
              {!hasLinkedTreatment && (
                <button data-testid="row-action-cancel" onClick={() => onCancel?.(appt)} className="text-[11px] px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded font-bold">
                  ยกเลิก
                </button>
              )}
            </>
          )}
          {!hasTreatmentForDay && isPastDate && (rawStatus === 'pending' || rawStatus === 'confirmed') && (
            <>
              <button data-testid="row-action-create-treatment" onClick={() => onCreateTreatment?.(appt)} className="text-[11px] px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded font-bold">
                สร้างบันทึกการรักษา
              </button>
              <button data-testid="row-action-edit" onClick={() => onEdit?.(appt)} className="text-[11px] px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold">
                แก้ไขนัด
              </button>
              <button data-testid="row-action-cancel" onClick={() => onCancel?.(appt)} className="text-[11px] px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded font-bold">
                ยกเลิก
              </button>
            </>
          )}
          {!hasTreatmentForDay && rawStatus === 'pending' && !isPastDate && (
            <>
              <button data-testid="row-action-confirm" onClick={() => onConfirm?.(appt)} className="text-[11px] px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold">
                คอนเฟิร์มนัด
              </button>
              <button data-testid="row-action-edit" onClick={() => onEdit?.(appt)} className="text-[11px] px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold">
                แก้ไขนัด
              </button>
              <button data-testid="row-action-cancel" onClick={() => onCancel?.(appt)} className="text-[11px] px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded font-bold">
                ยกเลิก
              </button>
            </>
          )}
          {!hasTreatmentForDay && rawStatus === 'confirmed' && !isPastDate && (
            <>
              <button data-testid="row-action-create-treatment" onClick={() => onCreateTreatment?.(appt)} className="text-[11px] px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded font-bold">
                บันทึกการรักษา
              </button>
              <button data-testid="row-action-edit" onClick={() => onEdit?.(appt)} className="text-[11px] px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold">
                แก้ไขนัด
              </button>
              <button data-testid="row-action-cancel" onClick={() => onCancel?.(appt)} className="text-[11px] px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded font-bold">
                ยกเลิก
              </button>
            </>
          )}
          {rawStatus === 'cancelled' && !hasTreatmentForDay && (
            <span className="text-[11px] text-[var(--tx-muted)] italic">ยกเลิกแล้ว</span>
          )}
        </div>
      </div>
    </div>
  );
}
