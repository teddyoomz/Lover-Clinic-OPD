// src/components/staffchat/StaffChatImageLightbox.jsx
// V73 Feature F (2026-05-16) — Fullscreen image overlay for chat attachments.
// (2026-05-22) Multi-image: images[] + startIndex + prev/next + counter +
//   filmstrip + keyboard ←→ + touch swipe + download. Loads the ORIGINAL
//   (fullUrl) at full size; arrows/filmstrip hidden when a single image.
//   Backward-compat: a single `src` string is wrapped as one image.
// Esc / ✕ close (AV78 NORMAL modal — backdrop does NOT close, 2026-05-22; same
//   pain as the user's report: accidental outside-click closing a viewer = ใช้ยาก).
//   z-9700 above modals.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { downloadUrlAsFile } from '../../lib/staffChatDownload.js';

function extFromUrl(u) {
  const m = String(u || '').match(/-o\.(\w+)(?:\?|$)/) || String(u || '').match(/\.(jpg|jpeg|png|webp|gif)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

export function StaffChatImageLightbox({ images: imagesProp, src, startIndex = 0, onClose }) {
  const images = useMemo(() => {
    if (Array.isArray(imagesProp) && imagesProp.length) return imagesProp;
    if (src) return [{ fullUrl: src, thumbUrl: src }];
    return [];
  }, [imagesProp, src]);
  const N = images.length;
  const [idx, setIdx] = useState(() => Math.min(Math.max(0, Number(startIndex) || 0), Math.max(0, N - 1)));
  const touchX = useRef(null);
  // (2026-05-22 EOD+1 — user-reported "บั๊คเหมือนเดิม" saga, ROUND 5 — the
  // architectural-question round). After Rounds 1-4 chased the opacity-
  // gate race through onLoad / refs / useEffect+complete / decode() /
  // Set-of-loaded-URLs — each fix tightened the gate but the user STILL
  // perceived a "delay" / "ไม่ responsive ในทันที / ก่อให้เกิดอาการค้าง".
  // The architectural answer (Phase 4.5 of /systematic-debugging when 4+
  // fixes don't fully land): the GATE ITSELF is the wrong primitive. ANY
  // state-based opacity gate adds a render cycle between click + visual
  // change AND a 150ms CSS transition AND a class of races.
  // Round-5: REMOVE the gate entirely. Two stacked <img>s — blurred thumb
  // BEHIND (always at full opacity, fills frame instantly via the small
  // already-cached thumb URL) + sharp full IN FRONT (no opacity gate, no
  // transition). The browser paints the full IMMEDIATELY on cache-hit
  // (instant), or shows nothing-and-then-paints on fresh-load while the
  // blurred thumb behind covers the gap. Either way the user sees SOMETHING
  // ON THE FRAME the moment the click lands — no delay, no race, no state
  // to drift. Keyed remount preserved so the previous picture never lingers
  // (the original Rounds-1+ symptom). This is the simplest possible design
  // and matches LINE / WhatsApp / Slack lightbox feel exactly.

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, N - 1));
      else if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, N]);

  // (2026-05-22) Warm the neighbouring originals (idx ±1, ±2) into the browser
  // cache so a left/right tap shows the sharp image instantly instead of
  // kicking off a fresh multi-MB fetch on every navigation.
  useEffect(() => {
    if (N <= 1) return undefined;
    const warm = [];
    for (const j of [idx + 1, idx - 1, idx + 2, idx - 2]) {
      const u = images[j]?.fullUrl;
      if (u) { const im = new Image(); im.src = u; warm.push(im); }
    }
    return () => { warm.length = 0; };
  }, [idx, images, N]);

  if (N === 0) return null;

  const stop = (e) => e.stopPropagation();
  const next = (e) => { stop(e); setIdx(i => Math.min(i + 1, N - 1)); };
  const prev = (e) => { stop(e); setIdx(i => Math.max(i - 1, 0)); };

  const onTouchStart = (e) => { touchX.current = e.touches?.[0]?.clientX ?? null; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? touchX.current;
    const dx = endX - touchX.current;
    if (Math.abs(dx) > 40) setIdx(i => dx < 0 ? Math.min(i + 1, N - 1) : Math.max(i - 1, 0));
    touchX.current = null;
  };

  const download = (e) => {
    stop(e);
    const cur = images[idx];
    const url = cur?.fullUrl;
    if (!url) return;
    // (2026-05-22) shared helper (Rule of 3 — image lightbox + file card + PDF overlay).
    const fname = cur?.name || `staff-chat-${Date.now()}.${extFromUrl(url)}`;
    downloadUrlAsFile(url, fname, cur?.size);
  };

  // (2026-05-22) AV78 normal modal — backdrop click does NOT close; only ✕ + Esc.
  // (was a sanctioned lightbox-exception; user reported accidental outside-clicks
  //  closing the viewer mid-look = ใช้ยาก, so it now matches every other modal.)
  return (
    <div
      data-testid="staff-chat-image-lightbox"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[9700] p-4"
    >
      {/* top bar: counter + download + close */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 text-white z-10 bg-gradient-to-b from-black/60 to-transparent" onClick={stop}>
        <span data-testid="staff-chat-lightbox-counter" className="text-sm font-mono">
          {N > 1 ? `📷 ${idx + 1} / ${N}` : '📷'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={download}
            data-testid="staff-chat-lightbox-download"
            className="px-2.5 py-1.5 rounded bg-white/15 hover:bg-white/25 text-xs flex items-center gap-1"
            aria-label="บันทึกรูป"
          >
            <Download size={14} /> บันทึกรูป
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* prev arrow */}
      {N > 1 && idx > 0 && (
        <button
          type="button"
          onClick={prev}
          data-testid="staff-chat-lightbox-prev"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center z-10"
          aria-label="รูปก่อนหน้า"
        >
          <ChevronLeft size={26} />
        </button>
      )}

      {/* main image — thumb shows INSTANTLY on nav (already cached from the chat
          grid), sharp original fades in on top once decoded. keyed by idx so the
          stale previous picture never lingers. */}
      <div
        className="relative w-full max-w-4xl h-[78vh] flex items-center justify-center"
        onClick={stop}
      >
        <img
          key={`thumb-${idx}`}
          src={images[idx]?.thumbUrl || images[idx]?.fullUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain rounded blur-[2px]"
        />
        {/* (2026-05-22 round-5) NO opacity gate, NO transition, NO state.
            Browser paints cache hits instantly; for fresh loads, the blurred
            thumb behind covers the load window. INSTANT response to every
            click — race-free by absence of state. */}
        <img
          key={`full-${idx}`}
          src={images[idx]?.fullUrl}
          alt=""
          data-testid="staff-chat-lightbox-image"
          className="absolute inset-0 w-full h-full object-contain rounded"
        />
      </div>

      {/* next arrow */}
      {N > 1 && idx < N - 1 && (
        <button
          type="button"
          onClick={next}
          data-testid="staff-chat-lightbox-next"
          className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center z-10"
          aria-label="รูปถัดไป"
        >
          <ChevronRight size={26} />
        </button>
      )}

      {/* filmstrip */}
      {N > 1 && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-black/50 overflow-x-auto" onClick={stop}>
          {images.map((im, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              data-testid="staff-chat-lightbox-thumb"
              data-active={i === idx ? 'true' : 'false'}
              className={`w-11 h-11 rounded shrink-0 overflow-hidden border-2 ${i === idx ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`}
            >
              <img src={im.thumbUrl || im.fullUrl} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default StaffChatImageLightbox;
