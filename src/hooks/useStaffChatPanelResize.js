// src/hooks/useStaffChatPanelResize.js
// (2026-05-31) Desktop-only resize for StaffChatPanel. Drag the top-left grip
// to resize (bottom-right stays anchored). Direct-DOM writes during drag (no
// React re-render of the 50-message list → 60fps); commit + persist on
// pointerup. Mobile (<768px): isDesktop=false → caller renders the existing
// fullscreen overlay unchanged. SSR/jsdom-safe (guards window/matchMedia/LS).
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  getPanelSize, setPanelSize, clampSize, DEFAULT_PANEL_SIZE,
} from '../lib/staffChatPanelSize.js';

const DESKTOP_QUERY = '(min-width: 768px)';

function readViewport() {
  if (typeof window === 'undefined') return { vw: Infinity, vh: Infinity };
  return { vw: window.innerWidth, vh: window.innerHeight };
}
function matchesDesktop() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try { return window.matchMedia(DESKTOP_QUERY).matches; } catch { return false; }
}

export function useStaffChatPanelResize() {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [isDesktop, setIsDesktop] = useState(() => matchesDesktop());
  const [size, setSize] = useState(() => clampSize(getPanelSize() || DEFAULT_PANEL_SIZE, readViewport()));

  const writeDom = useCallback((s) => {
    if (panelRef.current) {
      panelRef.current.style.width = s.width + 'px';
      panelRef.current.style.height = s.height + 'px';
    }
  }, []);

  // matchMedia desktop tracking
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let mql;
    try { mql = window.matchMedia(DESKTOP_QUERY); } catch { return; }
    const onChange = () => setIsDesktop(!!mql.matches);
    onChange();
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
    else if (typeof mql.addListener === 'function') mql.addListener(onChange);
    return () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange);
      else if (typeof mql.removeListener === 'function') mql.removeListener(onChange);
    };
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const next = clampSize({ width: d.startW - dx, height: d.startH - dy }, readViewport());
    writeDom(next);          // direct DOM — no setState during drag (60fps)
    d.last = next;
  }, [writeDom]);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    const final = d.last;
    setSize(final);          // commit to React state
    setPanelSize(final);     // persist (device-wide localStorage)
  }, [onPointerMove]);

  const onPointerDown = useCallback((e) => {
    if (!panelRef.current) return;
    if (e.cancelable) e.preventDefault();
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startW: rect.width, startH: rect.height,
      last: { width: Math.round(rect.width), height: Math.round(rect.height) },
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [onPointerMove, onPointerUp]);

  const onDoubleClick = useCallback(() => {
    const next = clampSize(DEFAULT_PANEL_SIZE, readViewport());
    setSize(next);
    setPanelSize(next);
    writeDom(next);
  }, [writeDom]);

  // re-clamp on window resize (keep on-screen)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setSize((prev) => {
        const next = clampSize(prev, readViewport());
        if (next.width === prev.width && next.height === prev.height) return prev;
        writeDom(next);
        setPanelSize(next);
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [writeDom]);

  // defensive cleanup if unmounted mid-drag
  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove, onPointerUp]);

  const gripProps = {
    onPointerDown,
    onDoubleClick,
    role: 'separator',
    'aria-label': 'ปรับขนาดหน้าต่างแชท (ลากมุมซ้ายบน · ดับเบิลคลิกเพื่อรีเซ็ต)',
    'data-testid': 'staff-chat-resize-grip',
    style: { cursor: 'nwse-resize' },
  };

  return { isDesktop, size, panelRef, gripProps };
}
