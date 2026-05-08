// V64 — search + 3 filter dropdowns + 2 right-side buttons.
import React from 'react';
import { Search, Printer, Plus } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '__all__', label: 'ทุกสถานะ' },
  { value: 'pending', label: 'รอยืนยัน' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'done', label: 'เสร็จแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
];

export default function AppointmentHubFilterBar({
  search, onSearchChange,
  typeFilter, onTypeFilterChange, typeOptions = [],
  statusFilter, onStatusFilterChange,
  onPrint, onAddWalkIn,
  resultCount = 0,
}) {
  return (
    <div className="mb-3" data-testid="appt-hub-filterbar">
      <div className="text-xs font-bold text-[var(--tx-heading)] mb-2">
        รายการนัดหมาย ลูกค้า {resultCount} คน
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input
            type="text"
            data-testid="appt-hub-search"
            placeholder="ค้นหาข้อมูล ชื่อลูกค้า, เบอร์โทร, แพทย์"
            value={search || ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg text-[var(--tx-heading)] focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <select
          data-testid="appt-hub-type-filter"
          value={typeFilter || ''}
          onChange={(e) => onTypeFilterChange?.(e.target.value)}
          className="text-xs px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg text-[var(--tx-heading)] min-w-[120px]"
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
          className="text-xs px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg text-[var(--tx-heading)] min-w-[120px]"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="button"
          data-testid="appt-hub-print-btn"
          onClick={() => onPrint?.()}
          className="text-xs px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold flex items-center gap-1"
        >
          <Printer size={12} /> พิมพ์ตารางนัดหมาย
        </button>
        <button
          type="button"
          data-testid="appt-hub-walkin-btn"
          onClick={() => onAddWalkIn?.()}
          className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1"
        >
          <Plus size={12} /> เพิ่มคิว Walk-in
        </button>
      </div>
    </div>
  );
}
