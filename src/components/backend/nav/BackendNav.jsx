// ─── BackendNav — wrapper that composes sidebar + drawer + topbar + palette
// Desktop (≥lg=1024px):  persistent sidebar left, main content right
// Mobile  (<lg):         top bar with hamburger + off-canvas drawer
// Both:                  Ctrl+K / ⌘K (or 🔍 icon) opens cmdk palette
//
// Layout: this component owns the outer shell. Parent passes `children` for
// the main content area.

import { useState, useCallback, memo } from 'react';
import { useViewport } from '../../../hooks/useViewport.js';
import BackendSidebarRaw from './BackendSidebar.jsx';
import BackendMobileDrawerRaw from './BackendMobileDrawer.jsx';
import BackendTopBarRaw from './BackendTopBar.jsx';
import BackendCmdPaletteRaw from './BackendCmdPalette.jsx';

// Memo nav subtree so that state changes in deeply-nested form modals (e.g.
// typing in an input 3 levels below) don't cause the sidebar / drawer /
// palette to re-render. Props are referentially stable when callers use
// useCallback + useMemo (BackendDashboard does).
const BackendSidebar       = memo(BackendSidebarRaw);
const BackendMobileDrawer  = memo(BackendMobileDrawerRaw);
const BackendTopBar        = memo(BackendTopBarRaw);
const BackendCmdPalette    = memo(BackendCmdPaletteRaw);

export default function BackendNav({
  activeTabId,
  onNavigate,
  clinicSettings,
  theme,
  setTheme,
  children,
  // Optional: hide nav entirely (e.g. when viewing customer detail where
  // parent prefers breadcrumb-only chrome). Falls back to sidebar shown.
  hideSidebar = false,
  topBarSlot = null, // extra action slot in top bar (e.g. breadcrumb actions)
}) {
  const vp = useViewport();
  const isDesktop = vp.is('lg');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Stable callback refs so memo'd children don't re-render every time this
  // component re-renders (e.g. on viewport resize or parent state change).
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openDrawer  = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--tx-primary)] flex flex-col lg:flex-row">
      {/* Desktop sidebar */}
      {isDesktop && !hideSidebar && (
        <div className="sticky top-0 h-screen">
          <BackendSidebar
            activeTabId={activeTabId}
            onNavigate={onNavigate}
            clinicSettings={clinicSettings}
            onOpenPalette={openPalette}
          />
        </div>
      )}

      {/* Mobile drawer (off-canvas) */}
      {!isDesktop && (
        <BackendMobileDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          activeTabId={activeTabId}
          onNavigate={onNavigate}
          clinicSettings={clinicSettings}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        {!isDesktop && (
          <BackendTopBar
            activeTabId={activeTabId}
            clinicSettings={clinicSettings}
            theme={theme}
            setTheme={setTheme}
            onOpenDrawer={openDrawer}
            onOpenPalette={openPalette}
          />
        )}

        {/* Optional extra top-bar slot (breadcrumb / actions) */}
        {topBarSlot && (
          <div className="border-b border-[var(--bd)] bg-[var(--bg-surface)] px-4 py-2">
            {topBarSlot}
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Command palette — always rendered, visibility controlled internally */}
      <BackendCmdPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={onNavigate}
      />
    </div>
  );
}
