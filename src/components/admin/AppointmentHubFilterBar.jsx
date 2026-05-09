// V64 — search + 3 filter dropdowns + 2 right-side buttons.
// V64-fix11 (2026-05-09): redesigned per "Editorial Ember" — pre-fix11
// buttons used solid bg-sky-600 / bg-emerald-600 (Bootstrap-feeling). Now
// search input has ember focus ring + walk-in is PRIMARY ember (creating
// new = warm/go) + print is SECONDARY sky ghost (utility action).
import React from 'react';
import { Search, Printer, Plus } from 'lucide-react';
import { BTN_PRIMARY, BTN_SECONDARY } from './_apptHubStyles.js';

const STATUS_OPTIONS = [
  { value: '__all__', label: 'ทุกสถานะ' },
  { value: 'pending', label: 'รอยืนยัน' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'done', label: 'เสร็จแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
];

const FILTER_INPUT_CLS =
  'text-xs px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--bd)] rounded-md ' +
  'text-[var(--tx-heading)] focus:outline-none focus:border-orange-700/60 focus:ring-1 focus:ring-orange-700/30 transition-colors';

export default function AppointmentHubFilterBar({
  search, onSearchChange,
  typeFilter, onTypeFilterChange, typeOptions = [],
  statusFilter, onStatusFilterChange,
  onPrint, onAddWalkIn,
  resultCount = 0,
  // V64-fix13 (2026-05-09): doctor-cards badge slot moved here from TabBar
  // rightContent. User: "ขอย้าย หมอมายด์ 13:30-19:30 ลงมา 1 row มาอยู่
  // row รายการนัดหมาย เว้นนิดหน่อยพอสวยงาม". Reserved min-height on the
  // slot so layout doesn't shift when switching to tabs without doctors.
  doctorBadge = null,
}) {
  return (
    <div className="mb-4" data-testid="appt-hub-filterbar">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-black uppercase tracking-wider text-[var(--tx-heading)]">รายการนัดหมาย</h2>
        {/* V64-fix14 (2026-05-09): count bumped to match heading size + weight.
            User: "ตัวอักษร 2 คน มันเล็กไปด้วย ทำให้ตัวมันเท่ากับ รายการนัดหมาย ได้เลย".
            Pre-fix14 was text-[11px] font-mono muted — visually demoted; now
            text-sm font-black heading-color so count reads as a peer of the
            section label. */}
        <span
          className="text-sm font-black text-[var(--tx-heading)]"
          data-testid="appt-hub-result-count"
        >
          {resultCount} คน
        </span>
        {/* V64-fix13: doctor-badge slot — min-h-[44px] reserves space so UI
            doesn't jump when switching between today/tomorrow (with doctor
            chips) and future/past (without). */}
        <div
          className="ml-2 flex items-center gap-2 flex-wrap min-h-[44px]"
          data-testid="appt-hub-doctor-slot"
        >
          {doctorBadge}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
          <input
            type="text"
            data-testid="appt-hub-search"
            placeholder="ค้นหาข้อมูล ชื่อลูกค้า, เบอร์โทร, แพทย์"
            value={search || ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className={`w-full pl-8 pr-2 ${FILTER_INPUT_CLS}`}
          />
        </div>
        <select
          data-testid="appt-hub-type-filter"
          value={typeFilter || ''}
          onChange={(e) => onTypeFilterChange?.(e.target.value)}
          className={`${FILTER_INPUT_CLS} min-w-[120px]`}
        >
          <option value="">ประเภทนัด</option>
          {typeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          data-testid="appt-hub-status-filter"
          value={statusFilter || '__all__'}
          onChange={(e) => onStatusFilterChange?.(e.target.value)}
          className={`${FILTER_INPUT_CLS} min-w-[120px]`}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="button"
          data-testid="appt-hub-print-btn"
          onClick={() => onPrint?.()}
          className={BTN_SECONDARY}
        >
          <Printer size={12} /> พิมพ์ตารางนัดหมาย
        </button>
        <button
          type="button"
          data-testid="appt-hub-walkin-btn"
          onClick={() => onAddWalkIn?.()}
          className={BTN_PRIMARY}
        >
          <Plus size={12} /> เพิ่มคิว Walk-in
        </button>
      </div>
    </div>
  );
}
