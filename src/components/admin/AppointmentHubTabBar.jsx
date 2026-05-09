// V64 — 4 tab pills with bubble counts (Q4=A).
// V64-fix9 (2026-05-09): added `rightContent` slot for inline doctor-cards.
// V64-fix11 (2026-05-09): redesigned per "Editorial Ember" direction —
// active tab = ember gradient (matches primary CTA), inactive = ghost with
// ember-tinted hover. Sky-blue (pre-fix11) too generic — felt ProClinic.

import React from 'react';
import { TAB_ACTIVE, TAB_INACTIVE, BUBBLE_ACTIVE, BUBBLE_INACTIVE } from './_apptHubStyles.js';

const TABS = [
  { key: 'today', label: 'วันนี้' },
  { key: 'tomorrow', label: 'พรุ่งนี้' },
  { key: 'future', label: 'ล่วงหน้า 30 วัน' },
  { key: 'past', label: 'ย้อนหลัง 30 วัน' },
];

export default function AppointmentHubTabBar({ activeTab, counts = {}, onTabChange, rightContent = null }) {
  return (
    <div className="flex gap-2 mb-3 flex-wrap items-center" data-testid="appt-hub-tabbar">
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
            className={active ? TAB_ACTIVE : TAB_INACTIVE}
          >
            <span>{t.label}</span>
            <span className={active ? BUBBLE_ACTIVE : BUBBLE_INACTIVE}>{count}</span>
          </button>
        );
      })}
      {rightContent && (
        // V64-fix12 (2026-05-09): mx-auto centers in remaining space (after
        // tabs, before right edge) instead of ml-auto pinning to far right.
        // User: "ชิดขวามันไกลไป มองไม่เห็น" — wide screens pushed the doctor
        // badge to ~95% of viewport; mx-auto puts it at the midpoint of
        // post-tab whitespace (visually around 50–65% mark) where the eye
        // actually lands when scanning.
        <div className="mx-auto flex items-center" data-testid="appt-hub-tabbar-right">
          {rightContent}
        </div>
      )}
    </div>
  );
}
