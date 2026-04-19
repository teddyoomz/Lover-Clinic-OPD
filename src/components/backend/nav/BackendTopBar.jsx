// ─── BackendTopBar — sticky mobile header ──────────────────────────────────
// Shown only at <lg (mobile + tablet). Contains:
//   ☰ hamburger — opens mobile drawer
//   breadcrumb — section > current tab
//   🔍 search    — opens cmdk palette (full-screen sheet on mobile)
//   theme toggle (desktop already has one — hide on desktop where TopBar is
//                 not rendered)
//
// Safe-area-inset-top for iOS notch.

import { Menu, Search, ChevronRight } from 'lucide-react';
import { itemById, sectionOf, NAV_SECTIONS } from './navConfig.js';
import ThemeToggle from '../../ThemeToggle.jsx';
import { hexToRgb } from '../../../utils.js';

export default function BackendTopBar({
  activeTabId,
  clinicSettings,
  theme,
  setTheme,
  onOpenDrawer,
  onOpenPalette,
}) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const sec = sectionOf(activeTabId);
  const item = itemById(activeTabId);
  const section = NAV_SECTIONS.find(s => s.id === sec);

  return (
    <header
      className="sticky top-0 z-40 bg-[var(--bg-surface)] backdrop-blur-sm lg:hidden"
      style={{
        borderBottom: `1px solid rgba(${acRgb},0.2)`,
        paddingTop: 'env(safe-area-inset-top, 0)',
      }}
    >
      <div className="h-14 px-3 flex items-center gap-2">
        {/* Hamburger */}
        <button
          onClick={onOpenDrawer}
          aria-label="เปิดเมนู"
          className="p-2 -ml-1 rounded-lg text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
        >
          <Menu size={20} />
        </button>

        {/* Breadcrumb: section > current tab (pinned items skip the section) */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {section && (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] truncate">
                {section.label}
              </span>
              <ChevronRight size={10} className="text-[var(--tx-muted)] flex-shrink-0" />
            </>
          )}
          <h1 className="text-sm font-black truncate" style={{ color: ac }}>
            {item?.label || 'ระบบหลังบ้าน'}
          </h1>
        </div>
        {/* Note: for pinned items (sectionOf = null) the breadcrumb collapses
            to just the tab name — intentional since pinned = top-level. */}

        {/* Search (opens cmdk palette) */}
        <button
          onClick={onOpenPalette}
          aria-label="ค้นหาเมนู"
          className="p-2 rounded-lg text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
        >
          <Search size={18} />
        </button>

        {/* Theme toggle */}
        <div className="flex-shrink-0">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </div>
    </header>
  );
}
