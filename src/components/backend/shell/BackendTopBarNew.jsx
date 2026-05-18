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
import { Home, Briefcase, Search } from 'lucide-react';
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
        /* Desktop ≥768px : 1-row 48px.
           V85-followup (EOD9, 2026-05-18) — 3-zone flex layout.
              [LEFT cluster] | flex-1 center (search) | [RIGHT cluster]
           justify-between distributes the zones so right-side icons
           always sit at the right edge instead of clumping on the left.
           Search box stays centered between the left and right clusters
           with max-w-[320px] cap. */
        <div className="flex h-12 px-4 items-center gap-3 justify-between">
          {/* LEFT cluster — home + mode toggle + branch */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              aria-label="กลับ Frontend"
              data-testid="topbar-frontend-desktop"
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
            >
              <Home size={18} />
            </button>
            <BackendMenuModeToggle />
            <BranchSelector />
          </div>
          {/* CENTER — search-box trigger (max 320px), centered in remaining
              flex space between left and right clusters. Click opens
              BackendCmdPalette with the real search input. */}
          <div className="flex-1 min-w-0 flex justify-center">
            <button
              type="button"
              onClick={onOpenPalette}
              aria-label="ค้นหาเมนู (Cmd+K)"
              data-testid="topbar-shortcut-desktop"
              className="w-full max-w-[320px] h-8 flex items-center gap-1.5 px-2.5 rounded-md bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] border border-[var(--bd)] hover:border-[var(--bd-strong)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] text-xs font-medium transition-all"
            >
              <Search size={13} className="flex-shrink-0" strokeWidth={2.25} />
              <span className="flex-1 text-left truncate">ค้นหาเมนู…</span>
              <kbd
                className="text-[9px] font-mono leading-none px-1 py-[3px] rounded bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-muted)] flex-shrink-0"
                aria-hidden="true"
              >⌘K</kbd>
            </button>
          </div>
          {/* RIGHT cluster — breadcrumb (xl+) + topBarSlot + theme + profile */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="hidden 2xl:flex items-center gap-1.5 min-w-0 max-w-xs mr-2">
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
            </div>
            {topBarSlot && <div className="flex-shrink-0">{topBarSlot}</div>}
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <ProfileDropdown />
          </div>
        </div>
      )}
    </header>
  );
}
