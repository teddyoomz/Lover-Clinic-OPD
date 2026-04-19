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
          className="fixed inset-y-0 left-0 z-[71] w-[280px] max-w-[85vw] flex flex-col bg-[var(--bg-surface)] shadow-2xl data-[state=open]:animate-slideInLeft data-[state=closed]:animate-slideOutLeft touch-pan-y lg:hidden"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">เมนูระบบหลังบ้าน</Dialog.Title>

          {/* Close button — top-right corner. Sidebar reuse handles the rest. */}
          <Dialog.Close asChild>
            <button
              className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-colors"
              aria-label="ปิดเมนู"
            >
              <X size={16} />
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
