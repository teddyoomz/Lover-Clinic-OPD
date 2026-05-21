import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { strokeOutline, outlineToPath2D, PEN_PRESETS } from '../../lib/penStroke.js';

// props: templateImageUrl, tool ('pen'|'highlighter'|'eraser'), color, size.
// Ref api: exportDataUrl(), undo(), redo(), clear().
const PenCanvas = forwardRef(function PenCanvas({ templateImageUrl, tool, color, size }, ref) {
  const canvasRef = useRef(null); const imgRef = useRef(null);
  const strokesRef = useRef([]);      // committed: { tool, color, size, points:[[x,y,p]] }
  const redoRef = useRef([]);
  const drawingRef = useRef(null);    // active stroke
  const penActiveRef = useRef(false); // palm rejection: a pen is currently down
  const toolRef = useRef({ tool, color, size }); toolRef.current = { tool, color, size };

  const redraw = useCallback(() => {
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, c.width, c.height);   // template background
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current;
    for (const s of all) {
      const outline = strokeOutline(s.points, s.tool === 'highlighter' ? PEN_PRESETS.highlighter(s.size) : PEN_PRESETS.pen(s.size));
      if (!outline.length) continue;
      ctx.save();
      if (s.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
      else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = s.tool === 'highlighter' ? 0.4 : 1; ctx.fillStyle = s.color; }
      ctx.fill(outlineToPath2D(outline));
      ctx.restore();
    }
  }, []);

  // Load the template + size the drawing buffer to the image's REAL aspect ratio (high-res),
  // so it renders WITHOUT distortion. The element then displays "contain" via CSS
  // (max-width/height) — fills the screen while keeping the true ratio. Buffer ratio ==
  // display ratio ⇒ pointer-coord scale stays uniform. (bugfix: was a fixed 1024x1280 buffer
  // + width/height:100% which stretched every template to the screen's landscape ratio.)
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    if (!templateImageUrl) {
      if (c.width !== 1024 || c.height !== 1280) { c.width = 1024; c.height = 1280; }  // blank default
      imgRef.current = null; redraw(); return;
    }
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
      const s = 1600 / Math.max(nw, nh);   // longest side → 1600px (crisp + scales to fill)
      c.width = Math.max(1, Math.round(nw * s));
      c.height = Math.max(1, Math.round(nh * s));
      imgRef.current = img; redraw();
    };
    img.onerror = () => { imgRef.current = null; redraw(); };
    img.src = templateImageUrl;
  }, [templateImageUrl, redraw]);

  const ptFromEvent = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const sx = canvasRef.current.width / r.width, sy = canvasRef.current.height / r.height;
    return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy, e.pressure || 0.5];
  };
  const onPointerDown = (e) => {
    if (e.pointerType === 'touch' && penActiveRef.current) return;        // palm rejection
    if (e.pointerType === 'pen') penActiveRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { tool, color, size } = toolRef.current;
    drawingRef.current = { tool, color, size, points: [ptFromEvent(e)] };
    redoRef.current = []; redraw();
  };
  const onPointerMove = (e) => {
    if (!drawingRef.current) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];        // low-latency sampling
    for (const ev of evs) drawingRef.current.points.push(ptFromEvent(ev));
    redraw();
  };
  const onPointerUp = (e) => {
    if (e.pointerType === 'pen') penActiveRef.current = false;
    if (!drawingRef.current) return;
    if (drawingRef.current.points.length > 1) strokesRef.current.push(drawingRef.current);
    drawingRef.current = null; redraw();
  };

  useImperativeHandle(ref, () => ({
    exportDataUrl: () => { drawingRef.current = null; redraw(); return canvasRef.current.toDataURL('image/png'); },
    undo: () => { const s = strokesRef.current.pop(); if (s) redoRef.current.push(s); redraw(); },
    redo: () => { const s = redoRef.current.pop(); if (s) strokesRef.current.push(s); redraw(); },
    clear: () => { strokesRef.current = []; redoRef.current = []; redraw(); },
  }), [redraw]);

  return (
    <canvas ref={canvasRef} width={1024} height={1280}
      style={{ touchAction: 'none', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', background: '#fff', display: 'block' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
  );
});
export default PenCanvas;
