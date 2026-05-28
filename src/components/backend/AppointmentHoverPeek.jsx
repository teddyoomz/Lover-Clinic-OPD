import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AppointmentDetailBody from './AppointmentDetailBody.jsx';

const PEEK_W = 345; // XL (user-chosen 2026-05-28)
const GAP = 10;

/**
 * AppointmentHoverPeek (V127) — anchored, portal-rendered, NO-backdrop hover
 * peek-card. Opens beside the hovered appointment card (`rect`), flips left /
 * clamps up to stay on-screen. Read-only — renders the shared
 * <AppointmentDetailBody variant="peek" />. Theme-aware via --bg-card / --bd
 * (correct in both light + dark, like the click-modal).
 *
 * AV98 lineage — portal to document.body so the calendar's overflow / a
 * transformed ancestor can't clip this fixed overlay.
 * pointerEvents:'none' — the peek never steals the mouse from the card beneath,
 * so the card's onPointerLeave (dismiss) fires cleanly + no flicker.
 */
export default function AppointmentHoverPeek({ appt, rect, roomName, doctorMap }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    if (!rect || !ref.current) return;
    const h = ref.current.offsetHeight || 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + GAP;
    if (left + PEEK_W > vw - 8) left = Math.max(8, rect.left - PEEK_W - GAP); // flip left
    left = Math.min(left, vw - PEEK_W - 8);
    let top = rect.top;
    if (top + h > vh - 8) top = Math.max(8, vh - h - 8);                       // clamp up
    setPos({ left, top });
  }, [rect, appt]);

  if (!appt || !rect) return null;

  return createPortal(
    <div
      ref={ref}
      data-testid="appt-hover-peek"
      className="fixed z-[190] rounded-2xl bg-[var(--bg-card)] border border-[var(--bd)] shadow-2xl"
      style={{ left: pos.left, top: pos.top, width: PEEK_W, padding: 20, pointerEvents: 'none' }}
    >
      <AppointmentDetailBody appt={appt} roomName={roomName} doctorMap={doctorMap} variant="peek" />
    </div>,
    document.body,
  );
}
