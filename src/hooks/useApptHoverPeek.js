import { useState, useRef, useEffect, useCallback } from 'react';

// V127 — Desktop-only hover-intent controller for the appointment peek-card.
// The `pointerType === 'mouse'` guard means it NEVER fires on touch (iPad taps
// fall through to the card's onClick → AppointmentDetailPopover modal, unchanged).
// open after `openDelay` ms of sustained hover; close after `closeGrace` ms
// (absorbs flicker when the mouse crosses between adjacent grid cells).
export function useApptHoverPeek({ openDelay = 150, closeGrace = 80 } = {}) {
  const [peek, setPeek] = useState(null); // { appt, rect } | null
  const openT = useRef(null);
  const closeT = useRef(null);

  const clearTimers = () => {
    if (openT.current) { clearTimeout(openT.current); openT.current = null; }
    if (closeT.current) { clearTimeout(closeT.current); closeT.current = null; }
  };

  const closePeek = useCallback(() => { clearTimers(); setPeek(null); }, []);

  const getHoverProps = useCallback((appt) => ({
    onPointerEnter: (e) => {
      if (e.pointerType !== 'mouse') return;            // touch/pen → ignore
      const el = e.currentTarget;
      if (closeT.current) { clearTimeout(closeT.current); closeT.current = null; }
      if (openT.current) clearTimeout(openT.current);
      openT.current = setTimeout(() => {
        openT.current = null;
        setPeek({ appt, rect: el.getBoundingClientRect() });
      }, openDelay);
    },
    onPointerLeave: (e) => {
      if (e.pointerType !== 'mouse') return;
      if (openT.current) { clearTimeout(openT.current); openT.current = null; }
      if (closeT.current) clearTimeout(closeT.current);
      closeT.current = setTimeout(() => { closeT.current = null; setPeek(null); }, closeGrace);
    },
  }), [openDelay, closeGrace]);

  // Dismiss on scroll / resize while open (anchor rect would otherwise go stale).
  useEffect(() => {
    if (!peek) return undefined;
    const onMove = () => closePeek();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [peek, closePeek]);

  useEffect(() => () => clearTimers(), []); // unmount cleanup

  return { peek, getHoverProps, closePeek };
}

export default useApptHoverPeek;
