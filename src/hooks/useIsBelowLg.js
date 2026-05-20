import { useState, useEffect } from 'react';

// Calendar-density (2026-05-20) — true below the Tailwind `lg` breakpoint
// (max-width: 1023px). Drives the appointment calendar's auto-switch to the
// mobile agenda view. SSR / no matchMedia → false (desktop grid default).
export function useIsBelowLg() {
  const q = '(max-width: 1023px)';
  const [below, setBelow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(q);
    const on = () => setBelow(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on);
    };
  }, []);
  return below;
}

export default useIsBelowLg;
