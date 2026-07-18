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
  isSpecificEntityContext = false,
  // ArcBloom deep-link fix (2026-07-19): a `?backend=1&tab=X` deep link must
  // land ON the tab, not under the bloom overlay (old-menu mode already
  // honored tab params; new-menu mode covered them). Feeds ONLY the initial
  // bloomOpen useState — the V90 auto-close effect stays keyed on the real
  // entity signal so mid-session behavior is untouched.
  initialBloomClosed = false,
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
  //
  // V90 (EOD+11 LATE, 2026-05-18) — exception: if BackendDashboard signals
  // the user is landing on a specific entity surface (customer detail /
  // treatment form / customer edit), start bloom CLOSED so the entity
  // content is visible. The bloom auto-closes via the useEffect below
  // when the flag transitions to true during the session (e.g. user on
  // customer list → clicks a customer → entity context kicks in).
  // User reported mobile bug 2026-05-18 EOD+11 LATE: "เปิดค้างทับหน้านั้น
  // ไว้ ปิดไม่ได้". V82 menu-untouchable lock honored — only state defaults
  // change; menu visuals + handlers identical.
  const [bloomOpen, setBloomOpen] = useState(!(isSpecificEntityContext || initialBloomClosed));
  const [paletteOpen, setPaletteOpen] = useState(false);

  // V90 (EOD+11 LATE) — auto-close bloom on transition INTO specific entity
  // context. Covers the case where admin opens backend at root (bloom open)
  // → clicks a customer in CustomerListTab → entity context becomes truthy
  // → bloom auto-collapses so customer-detail content is visible.
  useEffect(() => {
    if (isSpecificEntityContext) {
      setBloomOpen(false);
    }
  }, [isSpecificEntityContext]);

  // Set html data-attr so global CSS can hide standalone StaffChatBubble
  useEffect(() => {
    document.documentElement.setAttribute('data-backend-menu-mode', 'new');
    return () => {
      document.documentElement.removeAttribute('data-backend-menu-mode');
    };
  }, []);

  const openBloom = useCallback(() => setBloomOpen(true), []);
  const closeBloom = useCallback(() => setBloomOpen(false), []);
  // V91 (EOD+11 LATE, 2026-05-18) — toggle handler for DuoPill menu button.
  // User explicit: "ทำปุ่มปิด menu mobile ของเราด้วย อาจจะแตะที่ปุ่มเปิด
  // นั่นแหละเพื่อปิด". Pre-V91 button only opened; dismissal required
  // backdrop tap (poor mobile UX).
  const toggleBloom = useCallback(() => setBloomOpen((b) => !b), []);
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

      {/* DuoPill bottom-right.
          V91 (EOD+11 LATE) — pass bloomOpen + toggle handler so the menu
          button can close the bloom on second tap (mobile UX fix). Icon
          swaps Menu→X when open. */}
      <BackendDuoPill bloomOpen={bloomOpen} onToggleBloom={toggleBloom} />

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
