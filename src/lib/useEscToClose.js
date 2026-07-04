// useEscToClose (2026-07-04, bug-hunt R1 #12) — ESC-stack discipline for
// stacked modals. Pre-fix every modal added its own bare window keydown
// listener, so ONE ESC press closed EVERY open modal at once (e.g. staff-chat
// followup card → EDDetailModal ON TOP of CustomerDetailView's EDDetailModal:
// ESC nuked both). This hook keeps a module-level stack; only the TOP modal
// responds to ESC — one press = one close, LIFO like native dialogs.
//
// Token is minted once per mount (stable across re-renders — an inline
// onClose identity change must NOT re-push the token, or a lower modal would
// jump to the top of the stack). onClose is read through a ref so the latest
// callback always fires.
//
// Adopted by: EDDetailModal + StaffChatIntakeModal + StaffChatEdModalLauncher
// (the stacking trio this feature introduced). ponytail: ~20 sibling modals
// still use bare listeners — migrate when a real stacking pair surfaces.
import { useEffect, useRef } from 'react';

const stack = [];

export function useEscToClose(onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const token = {};
    stack.push(token);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (stack[stack.length - 1] !== token) return; // only the TOP modal closes
      closeRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      const i = stack.indexOf(token);
      if (i !== -1) stack.splice(i, 1);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}

// test-only introspection (never import from app code)
export function __escStackSize() { return stack.length; }

export default useEscToClose;
