// ─── SignatureCanvasField — Phase 14.8.B (2026-04-26) ─────────────────────
// Hand-drawn signature input for document templates. Captures via
// signature_pad library; output is base64 image/png data URL stored in form
// values. Mobile-first: pointer events + responsive canvas resize.
//
// User directive (Tier 3 P1): "T3.b Phase 14.8.B signature canvas".
//
// API:
//   - value: existing data URL (edit mode) — base64 PNG
//   - onChange: (dataUrl: string) => void
//   - onClear: () => void
//   - label: optional label
//   - width / height: canvas dimensions (defaults: 400x150)
//   - disabled: boolean
//
// Storage: parent form passes value/onChange just like text input. The
// data URL goes into the form values object indexed by field.key. The HTML
// template references it via {{{fieldKey}}} (3 braces — raw, no escape).

import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { Eraser, Edit3 } from 'lucide-react';
import { SIGNATURE_MAX_BYTES } from '../../lib/documentTemplateValidation.js';

export default function SignatureCanvasField({
  value,
  onChange,
  onClear,
  label,
  width = 400,
  height = 150,
  disabled = false,
}) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const containerRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(!value);
  const [error, setError] = useState('');

  // Initialize signature_pad once on mount
  useEffect(() => {
    if (!canvasRef.current) return undefined;

    // Resize canvas to its CSS size scaled by devicePixelRatio so strokes
    // render crisp on retina displays. signature_pad's docs require this.
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = padRef.current?.toData() || [];
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(ratio, ratio);
      // Re-render existing strokes after resize
      if (padRef.current && data.length > 0) {
        padRef.current.fromData(data);
      } else if (padRef.current) {
        padRef.current.clear();
      }
    };

    padRef.current = new SignaturePad(canvasRef.current, {
      backgroundColor: 'rgba(255,255,255,0)', // transparent — print engine
      penColor: '#000000',
      minWidth: 0.8,
      maxWidth: 2.2,
      throttle: 16,
    });

    // Hydrate from existing value
    if (value) {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
        setIsEmpty(false);
      };
      img.src = value;
    }

    // Track empty state (signature_pad fires endStroke after each stroke)
    const onEndStroke = () => {
      setIsEmpty(padRef.current?.isEmpty() ?? true);
      setError('');
      const dataUrl = padRef.current?.toDataURL('image/png') || '';
      // Cap size — reject + clear if too big (rare; long detailed strokes)
      if (dataUrl.length * 0.75 > SIGNATURE_MAX_BYTES) {
        padRef.current?.clear();
        setIsEmpty(true);
        setError(`ลายเซ็นใหญ่เกินไป (เกิน ${Math.round(SIGNATURE_MAX_BYTES / 1024)} KB) — กรุณาเซ็นใหม่ในขนาดเล็กลง`);
        onChange?.('');
        return;
      }
      onChange?.(dataUrl);
    };
    padRef.current.addEventListener('endStroke', onEndStroke);

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      padRef.current?.removeEventListener('endStroke', onEndStroke);
      padRef.current?.off();
      padRef.current = null;
    };
    // Empty deps — initialize once. value-change handled via separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value updates (e.g. form reset, edit-mode load) re-render
  useEffect(() => {
    if (!padRef.current || !canvasRef.current) return;
    if (!value) {
      padRef.current.clear();
      setIsEmpty(true);
      return;
    }
    // Don't re-hydrate if value is the same as canvas (avoids loop with onEndStroke)
    const current = padRef.current.toDataURL('image/png');
    if (current === value) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
      setIsEmpty(false);
    };
    img.src = value;
  }, [value]);

  const handleClear = () => {
    if (disabled) return;
    padRef.current?.clear();
    setIsEmpty(true);
    setError('');
    onChange?.('');
    onClear?.();
  };

  return (
    <div ref={containerRef} className="space-y-1">
      {label && (
        <label className="block text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1">
          {label}
        </label>
      )}
      <div
        className={`relative rounded-lg border-2 ${disabled ? 'border-gray-200 bg-gray-50' : 'border-dashed border-[var(--bd)] bg-[var(--bg-input)] hover:border-sky-500/50'} transition-colors`}
        style={{ width: '100%', maxWidth: `${width}px`, height: `${height}px` }}
        data-testid="signature-canvas-container"
        data-empty={isEmpty ? 'true' : 'false'}
      >
        <canvas
          ref={canvasRef}
          aria-label="Signature canvas"
          data-testid="signature-canvas"
          className={`w-full h-full rounded-lg ${disabled ? 'pointer-events-none opacity-60' : 'touch-none cursor-crosshair'}`}
          style={{ display: 'block' }}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-[var(--tx-muted)]">
              <Edit3 size={16} />
              <span className="text-xs">เซ็นชื่อด้านบน</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled || isEmpty}
          aria-label="ล้างลายเซ็น"
          data-testid="signature-clear"
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-red-400 hover:border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Eraser size={11} /> ล้างลายเซ็น
        </button>
        {error && (
          <span className="text-[11px] text-red-400" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
