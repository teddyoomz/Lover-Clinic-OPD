// src/components/LayoutSwapButton.jsx
//
// Phase 27.1 (2026-05-14) — floating swap button at column divider.
// Click → onSwap(). Visible only when split-screen active (caller passes
// visible=true). Touch target ≥ 44px (WCAG 2.5.5 via w-11 h-11).
//
// pointer-events on wrapper = none + on button = auto → button is clickable
// but rest of wrapper area is click-through (doesn't block clicks on panels).

import { ArrowLeftRight } from 'lucide-react';

export function LayoutSwapButton({ onSwap, position, visible = true, isDark = true }) {
  if (!visible) return null;
  const label = position === 'left'
    ? 'สลับ — ฟอร์มไปขวา / ประวัติไปซ้าย'
    : 'สลับ — ฟอร์มไปซ้าย / ประวัติไปขวา';
  return (
    <div
      className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
      style={{ pointerEvents: 'none' }}
      data-testid="layout-swap-button-wrapper"
    >
      <button
        type="button"
        onClick={onSwap}
        data-testid="layout-swap-button"
        aria-label={label}
        title={label}
        style={{ pointerEvents: 'auto' }}
        className={`
          flex items-center justify-center
          w-11 h-11 rounded-full
          border-2 ${isDark ? 'border-[#333] bg-[#1a1a1a]' : 'border-gray-200 bg-white'}
          shadow-lg
          hover:scale-110 active:scale-95
          transition-all duration-150
          text-purple-500 hover:bg-purple-500/10
          focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
        `}
      >
        <ArrowLeftRight size={18} />
      </button>
    </div>
  );
}

export default LayoutSwapButton;
