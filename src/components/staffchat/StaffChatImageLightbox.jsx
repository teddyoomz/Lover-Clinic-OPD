// src/components/staffchat/StaffChatImageLightbox.jsx
//
// V73 Feature F (2026-05-16) — Fullscreen image overlay for chat attachments.
// (2026-05-22) Multi-image: images[] + startIndex + prev/next + counter + filmstrip
//   + keyboard ←→ + touch swipe + download. Single `src` string backward-compat.
// V115 (2026-05-23 EOD+1 LATE+2) — mobile-UX fix per user report
//   "ใน mobile กดเปิดรูป Preview ในช่องแชท staff chat แล้วปิดพรีวิวไม่ได้
//    และซูมดูรูปไม่ได้ด้วย ใช้งานยากมาก":
//   1. Backdrop click closes — aligns with the AV78 sanctioned-exception
//      list in CLAUDE.md (fullscreen image viewers are the closed-list
//      exception to "explicit close only" because Stripe/Linear/WhatsApp/
//      Slack/Photos all close-on-backdrop for image viewers). Earlier
//      comment said "AV78 NORMAL modal" which CONTRADICTED the AV78
//      sanctioned list — corrected here.
//   2. Safe-area-inset-top padding on top bar — close button was partially
//      under iPhone notch / dynamic island status bar.
//   3. Close button bumped w-9 h-9 (36px) → w-11 h-11 (44px) per iOS HIG.
//   4. Multi-touch detection — onTouchStart now BAILS on pinch (e.touches
//      .length > 1) instead of misreading touches[0] as a single-finger
//      swipe. Lets iOS Safari's native pinch-zoom handle 2-finger gestures.
//   5. Double-tap-to-zoom (1x ↔ 2.5x via CSS transform). Resets on idx
//      change. Swipe-nav skipped when zoomed.
//   AV114 enforces these mobile gates across all fullscreen lightboxes.
// Esc / ✕ / backdrop tap close (AV78 sanctioned exception per CLAUDE.md).
// z-9700 above modals.
//
// (2026-05-22 EOD+2 — ROUND 6, user-directed) — User reported after rounds 1-5
//   "กดแล้วไม่ Response กดแล้วไม่เลื่อน กดแล้วรูปไม่เปลี่ยน" + explicit fix
//   suggestion: "ถ้ารูปมันใหญ่ ก็ให้เก็บไว้ใน cache ในเครื่อง จะได้ไม่ต้องโหลดใหม่
//   ทุกครั้งที่กดเลื่อน". Round-5's `<img key={idx}>` keyed-remount caused DOM
//   churn (unmount-then-mount) → brief blank frame between click + new paint →
//   perceived as "click did nothing". Plus every nav re-issued the GET on
//   cache-miss (large originals = visible delay).
//
// Round 6 = the user's design:
//   1. ONE <img> element — NEVER remount. `src` attribute updates on idx change.
//      Browser keeps painting the OLD image until the NEW one is ready, then
//      swaps in place (the native `<img>` smooth-replace behaviour Lightbox apps
//      rely on). No flicker, no blank frame.
//   2. Blob cache — on mount, fetch every image as a Blob → URL.createObjectURL
//      → store in a ref-Map. Once cached, `src=blob:...` swap is local-memory
//      paint (zero network on nav). The first image renders from the original
//      URL immediately while the background warm runs; subsequent clicks pull
//      from the cache.
//   3. NO opacity gate, NO transition, NO state for "loaded" — `<img>` natively
//      handles src swap.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { downloadUrlAsFile } from '../../lib/staffChatDownload.js';

// V117 (2026-05-23 EOD+1 LATE+3) — createPortal to document.body is the
// canonical fullscreen-overlay pattern. User reported V115 mobile fix STILL
// didn't close the preview: "เหมือนมันไป full screen ในช่องแชท เลยไม่เห็นปุ่ม
// ปิด". Root cause: StaffChatImageLightbox is rendered as a child of
// StaffChatMessage → StaffChatPanel (which is itself `position:fixed; z-9000`).
// On iOS Safari, a nested position:fixed inside another position:fixed +
// overflow:hidden parent gets BOUNDED by the parent's box (iOS Safari quirk
// + stacking context interaction). Result: lightbox `inset-0` measured from
// the panel, not the viewport; close button hidden behind panel header /
// outside touchable area. createPortal to document.body bypasses ALL ancestor
// CSS (containing-block, stacking context, transform, overflow:hidden) by
// rendering the lightbox directly under <body>. AV117 enforces.

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
  // V115 (2026-05-23 EOD+1 LATE+2) — mobile zoom state.
  // `zoom` toggled via double-tap (1x ↔ 2.5x). 2-finger pinch is delegated
  // to iOS Safari's native viewport pinch-zoom (`onTouchStart` bails on
  // multi-touch — see below). Resets on idx change so each image starts at
  // 1x. CSS transform on the <img> is the rendering primitive; cursor hint
  // (zoom-in / zoom-out) shows desktop double-click affordance.
  const [zoom, setZoom] = useState(1);
  // V128.lb2 (2026-05-28) — PRO pan-zoom: when zoomed in, DRAG to pan (clamped
  // to the image edges) + scroll-wheel to zoom (desktop), like Photos/Google
  // Photos. Pan is in screen px via transform `translate(pan) scale(zoom)`.
  // User: "ซูมก็ซูมได้แค่กลางรูป ... ถ้าซูมมันต้องเลื่อนดูได้ ... ทำให้เหมือนแอป preview รูประดับโปร".
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const lastTapAtRef = useRef(0);

  // Blob cache — Map<originalUrl, blobObjectUrl>. State (not ref) so re-renders
  // see cached entries; cleared on unmount via revokeObjectURL.
  const [blobCache, setBlobCache] = useState({});
  const objectUrlsRef = useRef([]); // for cleanup

  // Preload + cache ALL originals at mount (fetch → blob → URL.createObjectURL).
  // Browser dedupes the underlying HTTP request with any concurrent <img> load,
  // so the first image still paints instantly from the original URL while the
  // cache warms in the background. Concurrent fetches are fine — Firebase
  // Storage's CDN handles parallel GETs cheaply.
  useEffect(() => {
    let cancelled = false;
    const created = [];
    objectUrlsRef.current = created;
    (async () => {
      // Sequence the fetches so the CURRENT image's cache lands FIRST (smoother
      // perceived latency on a slow connection). Index order: current, next,
      // prev, then the rest.
      const order = [idx];
      for (let off = 1; off < N; off++) {
        if (idx + off < N) order.push(idx + off);
        if (idx - off >= 0) order.push(idx - off);
      }
      for (const i of order) {
        if (cancelled) return;
        const url = images[i]?.fullUrl;
        if (!url) continue;
        // Skip if already cached
        if (typeof blobCache[url] === 'string') continue;
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const blob = await r.blob();
          if (cancelled) return;
          const objUrl = URL.createObjectURL(blob);
          created.push(objUrl);
          setBlobCache(prev => ({ ...prev, [url]: objUrl }));
        } catch {
          // CORS / network — fall back to original URL naturally
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const u of created) {
        try { URL.revokeObjectURL(u); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]); // re-warm if the message changes

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, N - 1));
      else if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, N]);

  // V115 — reset zoom when image changes so each photo starts at 1x.
  // V128.lb2 — also reset pan so the next image starts centered.
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [idx]);

  if (N === 0) return null;

  const stop = (e) => e.stopPropagation();
  const next = (e) => { stop(e); setIdx(i => Math.min(i + 1, N - 1)); };
  const prev = (e) => { stop(e); setIdx(i => Math.max(i - 1, 0)); };

  // V115 — onTouchStart bails on multi-touch (pinch) so iOS Safari's
  // native pinch-zoom can handle 2-finger gestures uninterrupted. Without
  // this guard, the old code read only `touches[0]?.clientX` and on
  // touchend interpreted the resulting horizontal distance as a swipe,
  // triggering unwanted prev/next nav.
  const onTouchStart = (e) => {
    if (e.touches && e.touches.length > 1) {
      // pinch / multi-touch → defer to native viewport pinch
      touchX.current = null;
      return;
    }
    touchX.current = e.touches?.[0]?.clientX ?? null;
  };

  // V115 — onTouchEnd does: (a) double-tap detect (toggle zoom 1x ↔ 2.5x
  // when single-finger, <300ms between taps, near-stationary), then (b)
  // swipe-nav (skip when zoomed — pan-intent dominates while zoomed in).
  const onTouchEnd = (e) => {
    if (e.touches && e.touches.length > 0) return; // still touching
    const now = Date.now();
    const endX = e.changedTouches?.[0]?.clientX ?? touchX.current;
    const dx = touchX.current != null ? endX - touchX.current : 0;

    // (a) Double-tap detection: 2 quick taps within 300ms, low movement
    if (Math.abs(dx) < 12 && now - lastTapAtRef.current < 300) {
      setZoom(z => (z === 1 ? 2.5 : 1));
      setPan({ x: 0, y: 0 }); // V128.lb2 — re-center on zoom toggle
      lastTapAtRef.current = 0;
      touchX.current = null;
      return;
    }
    lastTapAtRef.current = now;

    // (b) Swipe-nav: skip when zoomed (pan intent), require ≥40px travel
    if (zoom === 1 && touchX.current != null && Math.abs(dx) > 40) {
      setIdx(i => dx < 0 ? Math.min(i + 1, N - 1) : Math.max(i - 1, 0));
    }
    touchX.current = null;
  };

  // V128.lb2 — clamp pan so the image can't be dragged past its own edges
  // (max pan = half the overflow at the current zoom). Returns {0,0} at 1x.
  const clampPan = (p, z) => {
    const el = imgRef.current;
    if (!el || z <= 1) return { x: 0, y: 0 };
    const maxX = (el.offsetWidth * (z - 1)) / 2;
    const maxY = (el.offsetHeight * (z - 1)) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, p.x)), y: Math.max(-maxY, Math.min(maxY, p.y)) };
  };

  // V115/V128.lb2 — desktop double-click / mobile double-tap toggle 1x ↔ 2.5x;
  // pan re-centers on toggle.
  const onImageDoubleClick = (e) => {
    e.stopPropagation();
    setZoom(zoom === 1 ? 2.5 : 1);
    setPan({ x: 0, y: 0 });
  };

  // V128.lb2 — desktop scroll-wheel zoom (continuous 1x–5x); pan re-clamps so
  // zooming out never leaves the image off-center.
  const onImageWheel = (e) => {
    e.preventDefault();
    const nz = Math.max(1, Math.min(5, zoom - e.deltaY * 0.0015 * (zoom || 1)));
    setZoom(nz);
    setPan((p) => clampPan(p, nz));
  };

  // V128.lb2 — drag-to-pan (mouse + touch via Pointer Events), only when zoomed.
  // Pointer-capture keeps the drag tracking even if the cursor leaves the image.
  const onImagePointerDown = (e) => {
    if (zoom <= 1) return;
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
  };
  const onImagePointerMove = (e) => {
    if (!dragRef.current) return;
    setPan(clampPan({ x: dragRef.current.px + (e.clientX - dragRef.current.sx), y: dragRef.current.py + (e.clientY - dragRef.current.sy) }, zoom));
  };
  const onImagePointerUp = (e) => {
    if (!dragRef.current) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = null;
    setDragging(false);
  };

  const download = (e) => {
    stop(e);
    const cur = images[idx];
    const url = cur?.fullUrl;
    if (!url) return;
    const fname = cur?.name || `staff-chat-${Date.now()}.${extFromUrl(url)}`;
    downloadUrlAsFile(url, fname, cur?.size);
  };

  // ROUND 6 — current image source = cached blob URL when available, else
  // the original network URL. ONE <img> element, src updates on idx change,
  // browser smooth-swaps in place. Zero remounts, zero state for loaded.
  const currentFullUrl = images[idx]?.fullUrl;
  const effectiveSrc = (currentFullUrl && blobCache[currentFullUrl]) || currentFullUrl;

  // V117 (2026-05-23 EOD+1 LATE+3) — createPortal to document.body. Bypasses
  // the StaffChatPanel (`position:fixed; z-9000; overflow:hidden`) ancestor
  // that bounded the lightbox to the panel area on iOS Safari (nested
  // position:fixed + iOS Safari quirk → close button hidden). Body-mount is
  // the canonical React pattern for fullscreen overlays (Radix/HeadlessUI/
  // Chakra all do this). AV117 enforces for all fullscreen lightboxes.
  return createPortal(
    // audit-anti-vibe-code: AV78 lightbox-explicit-exception — sanctioned
    // by CLAUDE.md AV78 list (closed set of 2: StaffChatImageLightbox +
    // TreatmentReadOnlyMirror inner Lightbox). Click-anywhere-closes IS
    // the expected UX for fullscreen image viewers (Stripe/Linear/WhatsApp/
    // Slack/Photos). V115 corrects the prior AV78-NORMAL mis-ship.
    // AV114 — fullscreen lightbox MUST close on backdrop tap + safe-area
    // padding + 44pt close button. Children (top-bar, image, filmstrip)
    // each carry `onClick={stop}` (e.stopPropagation) so taps on them
    // don't bubble to the backdrop close handler.
    <div
      data-testid="staff-chat-image-lightbox"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={onClose}
      className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[9700] overflow-hidden"
    >
      {/* top bar: counter + download + close
          V115 — paddingTop env(safe-area-inset-top) keeps close button
          below iPhone notch / dynamic island; max(0.75rem, ...) preserves
          desktop spacing when safe-area is 0. */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pb-3 text-white z-10 bg-gradient-to-b from-black/60 to-transparent"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        onClick={stop}
      >
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
            data-testid="staff-chat-lightbox-close"
            className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/35 flex items-center justify-center transition-colors"
            aria-label="ปิด"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* prev arrow — (round-6, 2026-05-22 EOD+2) ALWAYS mounted when N>1.
          The old conditional unmount at idx===0 created phantom missing buttons
          during rapid power-clicking; the button disappeared mid-click → user
          perceived "ติดบ้าง ไม่ติดบ้าง". Now disabled at edges instead. Also
          enlarged the click target horizontally (w-20 wide). VERTICAL span is
          CAPPED top-16/bottom-16 so the hit zone never overlaps the top-bar
          close+download buttons OR the bottom filmstrip (user reported this:
          "กดปิดรูปไม่ได้เลย เม้าขึ้นเป็น emoji ห้าม" — top-0 bottom-0 had
          swallowed the X click and showed disabled cursor). */}
      {N > 1 && (
        <button
          type="button"
          onClick={prev}
          disabled={idx <= 0}
          data-testid="staff-chat-lightbox-prev"
          className="absolute left-0 top-16 bottom-16 w-20 flex items-center justify-start pl-3 z-10 text-white group disabled:opacity-30"
          aria-label="รูปก่อนหน้า"
        >
          <span className="w-11 h-11 rounded-full bg-white/15 group-hover:bg-white/30 group-active:bg-white/40 flex items-center justify-center transition-colors">
            <ChevronLeft size={26} />
          </span>
        </button>
      )}

      {/* main image — ONE <img>, NEVER remounted. src swaps in place when idx
          changes. Browser keeps the previous frame painted until the new src
          is ready (native <img> behaviour) → smooth swap, zero flicker.
          Cached blob URLs (in-memory) make the swap instantaneous. */}
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        onClick={stop}
      >
        {/* V115 — CSS transform scale() for double-tap-zoom.
            transition-transform gives smooth 1x↔2.5x toggle. cursor hint
            shows desktop double-click affordance (zoom-in / zoom-out).
            Multi-touch pinch is delegated to iOS Safari's native pinch
            (onTouchStart bails on touches.length>1). */}
        <img
          ref={imgRef}
          src={effectiveSrc}
          alt=""
          data-testid="staff-chat-lightbox-image"
          onDoubleClick={onImageDoubleClick}
          onWheel={onImageWheel}
          onPointerDown={onImagePointerDown}
          onPointerMove={onImagePointerMove}
          onPointerUp={onImagePointerUp}
          onPointerCancel={onImagePointerUp}
          draggable={false}
          style={{
            // V128.lb2 — translate(pan) BEFORE scale(zoom) → pan in screen px so
            // dragging moves the magnified image; transition off while dragging.
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
            cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
            // touchAction none while zoomed so our pointer-pan owns the touch-drag
            // (1x keeps native so the outer swipe-nav still works).
            touchAction: zoom > 1 ? 'none' : 'auto',
            // V128.lb (2026-05-28) — FULL-SCREEN FILL. EXPLICIT width/height 100%
            // of the full-viewport wrapper (w-full h-full) so even a SMALL image
            // UPSCALES to fit the screen — `max-w`/`max-h` only CAP (a small image
            // stays tiny: the bug). object-contain keeps aspect (letterboxed on the
            // short axis); 100% (NOT 100vw) avoids the scrollbar-gutter overflow.
            // The top bar + filmstrip overlay the image edges (semi-transparent,
            // Photos-style). User: "ใหญ่สุดเท่าขนาดจอ เต็มจอพอดี".
            width: '100%',
            height: '100%',
          }}
          className="object-contain rounded select-none"
        />
      </div>

      {/* next arrow — (round-6) ALWAYS mounted when N>1, disabled at idx===N-1.
          Same fix-pattern as prev: wide hit zone but VERTICAL cap (top-16/bottom-16)
          so it doesn't overlap the top-bar close button or the filmstrip. */}
      {N > 1 && (
        <button
          type="button"
          onClick={next}
          disabled={idx >= N - 1}
          data-testid="staff-chat-lightbox-next"
          className="absolute right-0 top-16 bottom-16 w-20 flex items-center justify-end pr-3 z-10 text-white group disabled:opacity-30"
          aria-label="รูปถัดไป"
        >
          <span className="w-11 h-11 rounded-full bg-white/15 group-hover:bg-white/30 group-active:bg-white/40 flex items-center justify-center transition-colors">
            <ChevronRight size={26} />
          </span>
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
    </div>,
    document.body
  );
}

export default StaffChatImageLightbox;
