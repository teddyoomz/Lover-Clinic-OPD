import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ── Canonical fullscreen image lightbox (shared) ───────────────────────────
// Extracted 2026-05-27 (V123) from ChartSection.ChartLightbox so the chart
// fullscreen view AND the treatment-image "ดูรูปใหญ่" button in TFP share ONE
// portaled implementation (Rule of 3 — chart-view + treatment-images +
// lab-images).
//
// V117 (2026-05-23) lineage — MUST createPortal to document.body so the
// lightbox escapes ANY ancestor containing-block (transform / filter /
// will-change / position:fixed parent). Rendering inside TFP (itself a
// `fixed inset-0` overlay with transient entry transforms) would otherwise
// bound the lightbox to an ancestor box instead of the viewport. AV117.
// AV78 lightbox-explicit-exception — click-anywhere-closes IS expected UX for
// a fullscreen image viewer (Stripe / Linear / Radix convention).
// crossOrigin='anonymous' so Firebase Storage URLs load without tainting the
// canvas (bucket CORS=['*'] set by the V81 saga); harmless for legacy data: URLs.
export default function ImageLightbox({ src, label, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!src) return null;
  return createPortal(
    // audit-anti-vibe-code: AV78 lightbox-explicit-exception — click-anywhere-closes
    // IS expected UX for a fullscreen image viewer (the backdrop onClick below).
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85"
      onClick={onClose}
      role="dialog"
      aria-label={label || 'ดูรูปใหญ่'}
    >
      <div className="relative max-w-[95vw] max-h-[95vh] p-2" onClick={e => e.stopPropagation()}>
        <img
          src={src}
          alt={label || 'รูปภาพ'}
          crossOrigin="anonymous"
          className="max-w-[95vw] max-h-[90vh] object-contain rounded shadow-2xl bg-white"
        />
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition shadow-lg"
          aria-label="ปิด"
        >
          <X size={18} />
        </button>
        {label && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white text-xs bg-black/60 px-3 py-1 rounded">
            {label}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
