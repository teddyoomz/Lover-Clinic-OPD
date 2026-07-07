// SwUpdateToast — Service Worker update surface (D1, 2026-07-07 instant
// cold-start, AV207). main.jsx dispatches 'sw-need-refresh' when a new build's
// SW is waiting. This toast offers a one-tap refresh; if the user instead
// backgrounds the tab (document.hidden), we auto-apply the update then — a
// reload at a moment that can't interrupt their work. Without either path a
// precached shell could pin clients to an old version indefinitely.
import React, { useState, useEffect } from 'react';

export default function SwUpdateToast() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onNeed = () => setPending(true);
    window.addEventListener('sw-need-refresh', onNeed);
    return () => window.removeEventListener('sw-need-refresh', onNeed);
  }, []);

  useEffect(() => {
    if (!pending) return undefined;
    const onVis = () => {
      // idle moment: tab hidden → safe to activate + reload
      if (document.visibilityState === 'hidden') window.__swUpdate?.(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [pending]);

  if (!pending) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9700]" data-testid="sw-update-toast">
      <button
        onClick={() => window.__swUpdate?.(true)}
        className="px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-2xl border border-white/10"
        style={{ background: 'linear-gradient(135deg, #1f2937, #111827)' }}
      >
        ✨ มีเวอร์ชันใหม่ — แตะเพื่อรีเฟรช
      </button>
    </div>
  );
}
