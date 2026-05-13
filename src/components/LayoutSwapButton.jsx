// src/components/LayoutSwapButton.jsx
//
// Phase 27.1 (2026-05-14) — inline swap button.
// Phase 27.1-quater (2026-05-14, user iteration 3) — refactored from
// floating sticky/absolute to inline button so parent can render it
// inside a sticky header (consolidated TFP header redesign per user
// directive "เอา badge แสดงสาขาในหน้า TFP รวมถึง Tab ประวัติ และปุ่ม
// สลับข้างไปไว้บน Header"). Parent decides placement; component is
// pure render.
//
// Touch target ≥ 44px (WCAG 2.5.5 via w-11 h-11) preserved for desktop.

import { ArrowLeftRight } from 'lucide-react';

export function LayoutSwapButton({ onSwap, position, visible = true, isDark = true }) {
  if (!visible) return null;
  const label = position === 'left'
    ? 'สลับ — ฟอร์มไปขวา / ประวัติไปซ้าย'
    : 'สลับ — ฟอร์มไปซ้าย / ประวัติไปขวา';
  return (
    <button
      type="button"
      onClick={onSwap}
      data-testid="layout-swap-button"
      aria-label={label}
      title={label}
      className={`
        hidden lg:flex items-center justify-center
        w-9 h-9 rounded-full
        border ${isDark ? 'border-[#333] bg-[#1a1a1a]' : 'border-gray-200 bg-white'}
        shadow-sm
        hover:scale-110 active:scale-95
        transition-all duration-150
        text-purple-500 hover:bg-purple-500/10
        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
        focus:ring-offset-transparent
      `}
    >
      <ArrowLeftRight size={16} />
    </button>
  );
}

export default LayoutSwapButton;
