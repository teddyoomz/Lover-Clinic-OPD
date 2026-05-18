// ─── BackendMobileDrawer — off-canvas nav drawer via Radix Dialog ──────────
// Opens when hamburger in BackendTopBar clicked. Slides in from left with
// backdrop. ESC closes; backdrop click closes. Focus trapped inside by Radix.
// Swipe-to-close: pointer events on the panel track x-movement; >100px
// leftward drag closes the drawer.
//
// Reuses BackendSidebar body via `forceExpanded=true` (always expanded in
// drawer mode) + `hideCollapseToggle=true`. Palette button is hidden because
// the TopBar already has a search icon.

import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import BackendSidebar from './BackendSidebar.jsx';

export default function BackendMobileDrawer({
  open,
  onOpenChange,
  activeTabId,
  onNavigate,
  clinicSettings,
}) {
  const panelRef = useRef(null);
  const dragStart = useRef({ x: 0, tracking: false });

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return; // touch/pen only
    dragStart.current = { x: e.clientX, tracking: true };
  };
  const onPointerMove = (e) => {
    if (!dragStart.current.tracking || !panelRef.current) return;
    const dx = Math.min(0, e.clientX - dragStart.current.x);
    panelRef.current.style.transform = `translateX(${dx}px)`;
  };
  const onPointerUp = (e) => {
    if (!dragStart.current.tracking || !panelRef.current) return;
    const dx = e.clientX - dragStart.current.x;
    panelRef.current.style.transform = '';
    dragStart.current.tracking = false;
    if (dx < -100) onOpenChange(false);
  };

  const handleNavigate = (id) => {
    onNavigate(id);
    onOpenChange(false); // auto-close after pick — standard mobile UX
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm data-[state=open]:animate-fadeIn data-[state=closed]:animate-fadeOut lg:hidden"
        />
        <Dialog.Content
          ref={panelRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="fixed inset-y-0 left-0 z-[71] w-[280px] max-w-[85vw] flex flex-col bg-[var(--bg-surface)] shadow-2xl border-r-2 border-rose-500/40 data-[state=open]:animate-slideInLeft data-[state=closed]:animate-slideOutLeft touch-pan-y lg:hidden"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">เมนูระบบหลังบ้าน</Dialog.Title>

          {/* V83-followup-20 (EOD8 LATE 2026-05-18) — Close button moved
              INSIDE the panel boundary + made more prominent. User reported:
              "ปุ่มปิดแบบโมบาย มันหลุดจากกรอบเมนูอีก" — in light theme drawer
              bg = white = page bg → drawer's right edge invisible →
              absolute-positioned X chip appeared to float in empty space.
              Fix: add visible right rose border + bump X chip size/contrast
              + clamp right-2 (was right-3) so it stays well inside the
              drawer's 280px width even on narrow viewports (max-w-85vw). */}
          <Dialog.Close asChild>
            <button
              className="absolute top-3 right-2 z-10 w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-500 hover:bg-rose-500/30 hover:text-rose-700 flex items-center justify-center transition-colors shadow-md"
              aria-label="ปิดเมนู"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </Dialog.Close>

          {/* Reuse the desktop sidebar body — just forced expanded, no toggle. */}
          <BackendSidebar
            activeTabId={activeTabId}
            onNavigate={handleNavigate}
            clinicSettings={clinicSettings}
            forceExpanded
            hideCollapseToggle
            hidePaletteButton
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
