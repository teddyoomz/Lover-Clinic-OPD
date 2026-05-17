// Backend Menu D — TopBarNew. Replaces classic BackendTopBar visually but
// preserves every sub-component verbatim (BranchSelector, ThemeToggle,
// ProfileDropdown). Mobile <768px: 2-row 44px each. Desktop ≥768px: 1-row 48px.
//
// 5 utility buttons (all preserved at all states):
//   🏠 Frontend · 🛒 Shortcut · 📍 BranchSelector · 🌓 ThemeToggle · 👤 ProfileDropdown
//
// Plus Mode Toggle pill (Desktop+Tablet ≥768px only) between Shortcut and BranchSelector.
//
// Responsive split via JS-detected innerWidth (NOT Tailwind `md:` classes) — this
// guarantees the test environment (jsdom — no CSS engine for media queries) and
// the real browser BOTH render exactly one row tree, so BranchSelector et al.
// mount once. Listens to `resize` so live-resize across breakpoints reflows.

import { useEffect, useState } from 'react';
import { Home, Briefcase } from 'lucide-react';
import { itemById, sectionOf, NAV_SECTIONS } from '../nav/navConfig.js';
import ThemeToggle from '../../ThemeToggle.jsx';
import BranchSelector from '../BranchSelector.jsx';
import ProfileDropdown from '../ProfileDropdown.jsx';
import BackendMenuModeToggle from './BackendMenuModeToggle.jsx';
import { hexToRgb } from '../../../utils.js';

const MD_BREAKPOINT = 768;

function getIsDesktop() {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= MD_BREAKPOINT;
}

export default function BackendTopBarNew({
  activeTabId,
  clinicSettings,
  theme,
  setTheme,
  topBarSlot,
  onOpenPalette,
}) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const sec = sectionOf(activeTabId);
  const item = itemById(activeTabId);
  const section = NAV_SECTIONS.find((s) => s.id === sec);

  const [isDesktop, setIsDesktop] = useState(getIsDesktop);

  useEffect(() => {
    const onResize = () => setIsDesktop(getIsDesktop());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-[14px] backend-topbar-new"
      style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
      data-testid="backend-topbar-new"
    >
      {!isDesktop && (
        /* Mobile <768px : 2-row */
        <div>
          {/* Row 1 — 44px — chrome buttons (NO Mode Toggle on mobile per spec) */}
          <div className="h-11 px-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              aria-label="กลับ Frontend"
              data-testid="topbar-frontend-mobile"
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
            >
              <Home size={18} />
            </button>
            <button
              type="button"
              onClick={onOpenPalette}
              aria-label="ค้นหาเมนู"
              data-testid="topbar-shortcut-mobile"
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
            >
              <Briefcase size={18} />
            </button>
            <div className="flex-1" />
            <BranchSelector />
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <ProfileDropdown />
          </div>
          {/* Row 2 — 44px — title + breadcrumb */}
          <div className="h-11 px-3 flex items-center gap-1.5 border-t border-[var(--bd)] bg-[var(--bg-surface)]/30">
            {section && (
              <>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] truncate">
                  {section.label}
                </span>
                <span className="text-[var(--tx-muted)] flex-shrink-0">›</span>
              </>
            )}
            <h1 className="text-sm font-black truncate" style={{ color: ac }}>
              {item?.label || 'ระบบหลังบ้าน'}
            </h1>
            <div className="ml-auto">{topBarSlot}</div>
          </div>
        </div>
      )}

      {isDesktop && (
        /* Desktop ≥768px : 1-row 48px */
        <div className="flex h-12 px-4 items-center gap-2">
          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            aria-label="กลับ Frontend"
            data-testid="topbar-frontend-desktop"
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
          >
            <Home size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenPalette}
            aria-label="ค้นหาเมนู (Cmd+K)"
            data-testid="topbar-shortcut-desktop"
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
          >
            <Briefcase size={18} />
          </button>
          <BackendMenuModeToggle />
          <BranchSelector />
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            {section && (
              <>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] truncate">
                  {section.label}
                </span>
                <span className="text-[var(--tx-muted)] flex-shrink-0">›</span>
              </>
            )}
            <h1 className="text-sm font-black truncate" style={{ color: ac }}>
              {item?.label || 'ระบบหลังบ้าน'}
            </h1>
            <div className="ml-3">{topBarSlot}</div>
          </div>
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <ProfileDropdown />
        </div>
      )}
    </header>
  );
}
