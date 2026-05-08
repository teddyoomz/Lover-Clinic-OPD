// V64 — 4 tab pills with bubble counts (Q4=A).
import React from 'react';

const TABS = [
  { key: 'today', label: 'วันนี้' },
  { key: 'tomorrow', label: 'พรุ่งนี้' },
  { key: 'future', label: 'ล่วงหน้า 30 วัน' },
  { key: 'past', label: 'ย้อนหลัง 30 วัน' },
];

export default function AppointmentHubTabBar({ activeTab, counts = {}, onTabChange }) {
  return (
    <div className="flex gap-2 mb-3 flex-wrap" data-testid="appt-hub-tabbar">
      {TABS.map(t => {
        const active = t.key === activeTab;
        const count = Number(counts[t.key] || 0);
        return (
          <button
            key={t.key}
            type="button"
            data-testid={`appt-hub-tab-${t.key}`}
            data-active={active ? 'true' : 'false'}
            onClick={() => onTabChange?.(t.key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border ${
              active
                ? 'bg-sky-600 border-sky-600 text-white'
                : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:text-sky-400 hover:border-sky-700/50'
            }`}
          >
            <span>{t.label}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-white text-sky-700' : 'bg-sky-100 text-sky-700'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
