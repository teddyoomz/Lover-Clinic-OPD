// ─── useViewport — SSR-safe breakpoint hook for responsive nav ──────────────
// Used by BackendNav to decide sidebar vs drawer. Breakpoints match Tailwind
// defaults (sm/md/lg/xl/2xl) so CSS classes and JS stay aligned.

import { useEffect, useState } from 'react';

const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

/** @returns {{ w: number, h: number, is: (bp: 'sm'|'md'|'lg'|'xl'|'2xl') => boolean }} */
export function useViewport() {
  const get = () => ({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    h: typeof window === 'undefined' ? 800 : window.innerHeight,
  });
  const [size, setSize] = useState(get);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSize(get()));
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, []);

  return {
    w: size.w,
    h: size.h,
    /** true if viewport is >= breakpoint (e.g. `is('lg')` = desktop+). */
    is: (bp) => size.w >= BREAKPOINTS[bp],
  };
}
