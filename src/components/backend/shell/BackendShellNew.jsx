// Backend Menu D — top-level shell composer.
// Mirrors BackendNav's children/topBarSlot/activeTabId/onNavigate/theme/setTheme/
// clinicSettings contract verbatim. Renders TopBarNew + DuoPill + ArcBloom +
// BackendCmdPalette. Sets html[data-backend-menu-mode="new"] for CSS hide of
// standalone StaffChatBubble.

import { useEffect, useState, useCallback } from 'react';
import BackendTopBarNew from './BackendTopBarNew.jsx';
import BackendDuoPill from './BackendDuoPill.jsx';
import BackendArcBloom from './BackendArcBloom.jsx';
import BackendCmdPalette from '../nav/BackendCmdPalette.jsx';

export default function BackendShellNew({
  activeTabId,
  onNavigate,
  clinicSettings,
  theme,
  setTheme,
  topBarSlot = null,
  children,
}) {
  // Backend Menu D EOD+5 polish (2026-05-18) — bloom open by default per user:
  // "เมื่อกดเข้า backend จากไหนก็ตาม ... จะเป็นสถานะเมนูเปิดรออยู่". User can
  // dismiss via backdrop/Esc/orb-click — falls through to the underlying tab
  // (default = appointment-all from BackendDashboard).
  const [bloomOpen, setBloomOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Set html data-attr so global CSS can hide standalone StaffChatBubble
  useEffect(() => {
    document.documentElement.setAttribute('data-backend-menu-mode', 'new');
    return () => {
      document.documentElement.removeAttribute('data-backend-menu-mode');
    };
  }, []);

  const openBloom = useCallback(() => setBloomOpen(true), []);
  const closeBloom = useCallback(() => setBloomOpen(false), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  // Navigate via existing onNavigate prop — same shape as BackendNav.
  // V85-followup (EOD9+1, 2026-05-18) — shell-level handleNavigate is the
  // single coordination point for "go to tab + collapse all menu overlays".
  // Bug pre-fix: Cmd palette pick → `handleSelect` calls onNavigate(itemId) +
  // onOpenChange(false) for palette ONLY → tab switches + palette closes but
  // bloomOpen (default true) stayed → bloom backdrop + orbs rendered behind.
  // Fix: every navigation through this handler ALSO closes both overlays.
  // ArcBloom's own onClose?.() calls become redundant but harmless (React
  // batches same-value setters). New AV82 invariant locks the contract.
  const handleNavigate = useCallback(
    (tabId) => {
      onNavigate?.(tabId);
      setBloomOpen(false);
      setPaletteOpen(false);
    },
    [onNavigate]
  );

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--tx-primary)] flex flex-col">
      <BackendTopBarNew
        activeTabId={activeTabId}
        clinicSettings={clinicSettings}
        theme={theme}
        setTheme={setTheme}
        topBarSlot={topBarSlot}
        onOpenPalette={openPalette}
      />

      {/* Main content — children slot unchanged from BackendNav contract */}
      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>

      {/* DuoPill bottom-right */}
      <BackendDuoPill onOpenBloom={openBloom} />

      {/* ArcBloom overlay — mounted lazily via bloomOpen gate */}
      {bloomOpen && (
        <BackendArcBloom
          open={bloomOpen}
          onClose={closeBloom}
          onNavigate={handleNavigate}
          clinicSettings={clinicSettings}
          theme={theme}
        />
      )}

      {/* CmdPalette preserved verbatim (Cmd+K + 🛒 button trigger it) */}
      <BackendCmdPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={handleNavigate} />
    </div>
  );
}
