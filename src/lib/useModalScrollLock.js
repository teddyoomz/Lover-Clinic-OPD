// AV205 (2026-07-07) — Universal modal scroll lock (layer 1).
// Locks page scrolling while ANY modal/lightbox/drawer/palette overlay is open
// so wheel/touch can never scroll the background page. Ref-counted: stacked
// modals unlock only when the LAST one closes. CSS side lives in src/index.css
// (`html[data-modal-open]` — overflow:hidden + touch-action:none + gutter
// compensation). touch-action:none on body does NOT block scrollers INSIDE the
// modal: a pan implemented by the modal's own scroller only consults
// touch-action from the touch target up to that scroller (proven live by the
// V82-fix7-bis staff-chat lock). Layer 2 (per-modal `overflow-y-auto
// overscroll-contain` on the fixed inset-0 layer) kills scroll chaining into
// inner background scrollers — see tests/modal-scroll-lock-coverage.test.js.
import { useEffect } from 'react';

let lockCount = 0;

function acquire() {
  lockCount += 1;
  if (lockCount !== 1) return;
  const el = document.documentElement;
  // Compensate for the disappearing scrollbar so the page doesn't shift.
  const gutter = window.innerWidth - el.clientWidth;
  if (gutter > 0) el.style.setProperty('--scroll-lock-gutter', `${gutter}px`);
  el.setAttribute('data-modal-open', '1');
}

function release() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0) return;
  const el = document.documentElement;
  el.removeAttribute('data-modal-open');
  el.style.removeProperty('--scroll-lock-gutter');
}

/**
 * Lock background scrolling while this component is mounted (or while
 * `active` is true for always-mounted modals that toggle via prop/state).
 */
export function useModalScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    acquire();
    return release;
  }, [active]);
}

/**
 * Null component for modals written inline inside large hosts
 * (AdminDashboard / TreatmentFormPage / SaleTab / panels): render as the
 * first child of the conditional overlay — mount = lock, unmount = unlock —
 * without violating the rules of hooks.
 */
export function ModalScrollLock({ active = true }) {
  useModalScrollLock(active);
  return null;
}

// test-only
export function _getLockCount() { return lockCount; }
