import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { strokeOutline, outlineToSvgPath, PEN_PRESETS } from '../../lib/penStroke.js';
import { isDrawTool, isShapeTool } from '../../lib/tabletChartTools.js';

// Tablet chart editor canvas — Fabric v7 object model + perfect-freehand pressure pen.
// Rides Fabric's own mouse:down/move/up pipeline (no raw upperCanvasEl listeners → no
// double-handling; getScenePoint gives correct scene coords). Pen strokes become real
// fabric.Path objects (Fabric renders them → no manual contextTop / retina math). Shapes,
// text, select/move/resize are Fabric-native. Eraser = object-granular tap + scrub
// (getBoundingRect hit-test, no new dependency). Same ref API as the old PenCanvas
// (exportDataUrl/undo/redo/clear) + exportFabricJson + deleteSelected.
//
// CRITICAL (root-cause fix): the Fabric canvas is initialized EXACTLY ONCE (init effect has
// [] deps). The template is loaded/replaced on the LIVE canvas by a SEPARATE effect keyed on
// templateImageUrl. Putting templateImageUrl in the init effect's deps was a bug: the template
// arrives late via the instant-pop race (''→dataUrl), so the effect re-ran → cleanup
// `fc.dispose()` removed the React-owned <canvas> → the re-init could not recover (elRef.current
// null) → fcRef=null → blank template + no drawing + broken save. Init-once + a template effect
// (mirror PC ChartCanvas / old PenCanvas) avoids the React↔Fabric DOM-ownership conflict.
// props: templateImageUrl, tool, color, size, onRequestSelect (auto-switch after shape/text).
const TabletChartCanvas = forwardRef(function TabletChartCanvas({ templateImageUrl, tool, color, size, onRequestSelect }, ref) {
  const elRef = useRef(null);
  const fcRef = useRef(null);
  const fabricRef = useRef(null);
  const wrapRef = useRef(null);            // the outer flex container (captured before Fabric wraps the canvas)
  const templateObjRef = useRef(null);
  const hasTemplateRef = useRef(false);
  const templateUrlRef = useRef(templateImageUrl); templateUrlRef.current = templateImageUrl;  // always-current (race-safe)
  const loadedTplRef = useRef(undefined);  // the template url currently loaded on the canvas
  const toolRef = useRef({ tool, color, size }); toolRef.current = { tool, color, size };
  const onSelectRef = useRef(onRequestSelect); onSelectRef.current = onRequestSelect;
  const histRef = useRef([]); const hiRef = useRef(-1);
  const penRef = useRef(null);         // active freehand stroke { tool, color, size, points, pathObj }
  const shapeRef = useRef(null);       // in-progress shape { obj, sx, sy, tool, color, size }
  const penDownRef = useRef(false);    // palm rejection: a pen pointer is down
  const downRef = useRef(false);       // any pointer is down (scrub-erase gate)
  const readyRef = useRef(false);

  const pushHistory = useCallback(() => {
    const fc = fcRef.current; if (!fc) return;
    const json = JSON.stringify(fc.toJSON());
    const h = histRef.current; h.length = hiRef.current + 1; h.push(json);
    if (h.length > 40) h.shift(); hiRef.current = h.length - 1;
  }, []);
  const baselineHistory = () => { const fc = fcRef.current; if (!fc) return; histRef.current = [JSON.stringify(fc.toJSON())]; hiRef.current = 0; };

  // Apply current tool to the canvas: only 'select' makes objects interactive; all other
  // tools turn selection off + skipTargetFind on (we drive draw/shape/text/erase ourselves).
  const applyTool = useCallback(() => {
    const fc = fcRef.current; if (!fc) return;
    const t = toolRef.current.tool;
    fc.isDrawingMode = false;
    fc.selection = (t === 'select');
    fc.skipTargetFind = (t !== 'select');
    fc.defaultCursor = (t === 'select') ? 'default' : 'crosshair';
    fc.forEachObject(o => { if (o !== templateObjRef.current) { o.selectable = (t === 'select'); o.evented = (t === 'select'); } });
    if (t !== 'select') fc.discardActiveObject();
    fc.requestRenderAll();
  }, []);

  const relockTemplate = () => {
    const fc = fcRef.current; if (!fc || !hasTemplateRef.current) return;
    const first = fc.getObjects()[0];
    if (first) { first.set({ selectable: false, evented: false, hoverCursor: 'default' }); templateObjRef.current = first; }
  };

  // Load / replace the locked template image on the LIVE canvas + fit the canvas to its true
  // ratio. Safe to call repeatedly (idempotent on the same url). Operates on the existing
  // fcRef — NEVER disposes/recreates the canvas.
  const loadTemplate = useCallback(async (url) => {
    const fc = fcRef.current, fabric = fabricRef.current; if (!fc || !fabric) return;
    if (url === loadedTplRef.current) return;
    loadedTplRef.current = url;
    if (templateObjRef.current) { fc.remove(templateObjRef.current); templateObjRef.current = null; }
    hasTemplateRef.current = false;
    const wrap = wrapRef.current;
    const maxW = (wrap?.clientWidth || 700) - 8, maxH = (wrap?.clientHeight || 800) - 8;
    if (!url) { fc.setDimensions({ width: Math.min(maxW, Math.round(maxH * 0.78)), height: maxH }); fc.requestRenderAll(); baselineHistory(); return; }
    const img = await new Promise((res) => { const i = new window.Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
    if (!img || fcRef.current !== fc || loadedTplRef.current !== url) return;  // unmounted / superseded during load
    const fi = new fabric.FabricImage(img);
    const iw = fi.width || img.naturalWidth || 1, ih = fi.height || img.naturalHeight || 1;
    const ar = iw / ih;
    let cw, ch;
    if (maxW / maxH > ar) { ch = maxH; cw = Math.round(maxH * ar); } else { cw = maxW; ch = Math.round(maxW / ar); }
    const s = Math.min(cw / iw, ch / ih);
    fi.set({ scaleX: s, scaleY: s, left: Math.round((cw - iw * s) / 2), top: Math.round((ch - ih * s) / 2), selectable: false, evented: false, hoverCursor: 'default', originX: 'left', originY: 'top' });
    fc.setDimensions({ width: cw, height: ch });
    fc.add(fi); fc.sendObjectToBack(fi); templateObjRef.current = fi; hasTemplateRef.current = true;
    fc.requestRenderAll();
    baselineHistory();   // template is part of the baseline → undo never removes it
  }, []);

  // ── pen: rebuild the fabric.Path from accumulated pressure points (Fabric renders) ──
  const renderPenStroke = () => {
    const fc = fcRef.current, fabric = fabricRef.current, s = penRef.current; if (!fc || !s) return;
    const opts = s.tool === 'highlighter' ? PEN_PRESETS.highlighter(s.size) : PEN_PRESETS.pen(s.size);
    const d = outlineToSvgPath(strokeOutline(s.points, opts));
    if (s.pathObj) { fc.remove(s.pathObj); s.pathObj = null; }
    if (!d) return;
    const path = new fabric.Path(d, { fill: s.color, stroke: null, opacity: s.tool === 'highlighter' ? 0.4 : 1, selectable: false, evented: false, objectCaching: false });
    fc.add(path); s.pathObj = path; fc.requestRenderAll();
  };
  const commitPen = () => {
    const fc = fcRef.current, fabric = fabricRef.current, s = penRef.current; penRef.current = null;
    if (!fc || !s) return;
    if (s.pathObj) fc.remove(s.pathObj);
    if (s.points.length < 2) { fc.requestRenderAll(); return; }
    const opts = s.tool === 'highlighter' ? PEN_PRESETS.highlighter(s.size) : PEN_PRESETS.pen(s.size);
    const d = outlineToSvgPath(strokeOutline(s.points, opts));
    if (!d) { fc.requestRenderAll(); return; }
    const sel = toolRef.current.tool === 'select';
    const path = new fabric.Path(d, { fill: s.color, stroke: null, opacity: s.tool === 'highlighter' ? 0.4 : 1, selectable: sel, evented: sel, objectCaching: false });
    fc.add(path); fc.requestRenderAll(); pushHistory();
  };

  // ── shapes (drag start→end) ──
  const buildArrow = (fabric, x1, y1, x2, y2, color, sz) => {
    const line = new fabric.Line([x1, y1, x2, y2], { stroke: color, strokeWidth: sz });
    const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 90;
    const head = new fabric.Triangle({ left: x2, top: y2, width: Math.max(8, sz * 4), height: Math.max(8, sz * 4), fill: color, originX: 'center', originY: 'center', angle: ang });
    const g = new fabric.Group([line, head], { selectable: false, evented: false }); g.__isArrow = true; return g;
  };
  const startShape = (tool, color, sz, p) => {
    const fc = fcRef.current, fabric = fabricRef.current; let obj;
    const common = { selectable: false, evented: false };
    if (tool === 'rect') obj = new fabric.Rect({ left: p.x, top: p.y, width: 1, height: 1, fill: 'transparent', stroke: color, strokeWidth: sz, ...common });
    else if (tool === 'circle') obj = new fabric.Ellipse({ left: p.x, top: p.y, rx: 1, ry: 1, fill: 'transparent', stroke: color, strokeWidth: sz, ...common });
    else if (tool === 'line') obj = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: color, strokeWidth: sz, ...common });
    else if (tool === 'arrow') obj = buildArrow(fabric, p.x, p.y, p.x, p.y, color, sz);
    if (obj) { fc.add(obj); shapeRef.current = { obj, sx: p.x, sy: p.y, tool, color, size: sz }; }
  };
  const updateShape = (p) => {
    const fc = fcRef.current, s = shapeRef.current; if (!s) return; const o = s.obj;
    if (s.tool === 'rect') o.set({ left: Math.min(p.x, s.sx), top: Math.min(p.y, s.sy), width: Math.abs(p.x - s.sx), height: Math.abs(p.y - s.sy) });
    else if (s.tool === 'circle') o.set({ left: Math.min(p.x, s.sx), top: Math.min(p.y, s.sy), rx: Math.abs(p.x - s.sx) / 2, ry: Math.abs(p.y - s.sy) / 2 });
    else if (s.tool === 'line') o.set({ x2: p.x, y2: p.y });
    else if (s.tool === 'arrow') { fc.remove(o); const g = buildArrow(fabricRef.current, s.sx, s.sy, p.x, p.y, s.color, s.size); fc.add(g); s.obj = g; }
    o.setCoords?.(); fc.requestRenderAll();
  };
  const commitShape = () => {
    const fc = fcRef.current, s = shapeRef.current; shapeRef.current = null; if (!s) return; const o = s.obj;
    const w = o.width || 0, h = o.height || 0;
    const dist = Math.hypot((o.x2 ?? 0) - (o.x1 ?? 0), (o.y2 ?? 0) - (o.y1 ?? 0));
    const tiny = ((s.tool === 'rect' || s.tool === 'circle') && w < 4 && h < 4) || ((s.tool === 'line' || s.tool === 'arrow') && dist < 4);
    if (tiny) { fc.remove(o); fc.requestRenderAll(); return; }
    o.set({ selectable: true, evented: true }); o.setCoords?.();
    fc.requestRenderAll(); pushHistory();
    onSelectRef.current?.();
  };

  // ── text ──
  const addText = (color, sz, p) => {
    const fc = fcRef.current, fabric = fabricRef.current;
    const tb = new fabric.Textbox('ข้อความ', { left: p.x, top: p.y, fontSize: Math.max(18, sz * 4), fill: color, fontFamily: 'sans-serif', width: 160 });
    fc.add(tb); fc.setActiveObject(tb); fc.requestRenderAll(); pushHistory();
    onSelectRef.current?.();
    setTimeout(() => { try { tb.enterEditing?.(); tb.selectAll?.(); fc.requestRenderAll(); } catch { /* ignore */ } }, 0);
  };

  // ── eraser: object-granular tap/scrub (getBoundingRect hit-test, topmost first) ──
  const eraseAt = (p) => {
    const fc = fcRef.current; if (!fc) return;
    const objs = fc.getObjects();
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]; if (o === templateObjRef.current) continue;
      const r = o.getBoundingRect ? o.getBoundingRect() : null; if (!r) continue;
      if (p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height) { fc.remove(o); fc.requestRenderAll(); pushHistory(); return; }
    }
  };

  // init fabric ONCE ([] deps) — NEVER re-inits on prop change (avoids React↔Fabric DOM conflict)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fabric = await import('fabric'); fabricRef.current = fabric;
      if (cancelled || !elRef.current) return;
      await new Promise(r => setTimeout(r, 30));                 // let flex layout settle
      if (cancelled || !elRef.current) return;                   // may have unmounted during the wait
      const wrap = elRef.current.parentElement; wrapRef.current = wrap;
      const maxW = (wrap?.clientWidth || 700) - 8, maxH = (wrap?.clientHeight || 800) - 8;
      const cw = Math.min(maxW, Math.round(maxH * 0.78)), ch = maxH;   // provisional; loadTemplate fits to ratio
      const fc = new fabric.Canvas(elRef.current, { width: cw, height: ch, backgroundColor: '#fff', isDrawingMode: false, selection: false, preserveObjectStacking: true, enableRetinaScaling: true });
      fcRef.current = fc;
      fc.renderAll();
      baselineHistory(); readyRef.current = true;
      fc.on('object:modified', pushHistory);

      fc.on('mouse:down', (opt) => {
        const e = opt.e; const { tool, color, size } = toolRef.current;
        if (e.pointerType === 'touch' && penDownRef.current) return;       // palm rejection
        if (e.pointerType === 'pen') penDownRef.current = true;
        downRef.current = true;
        const p = fc.getScenePoint(e);
        if (isDrawTool(tool)) penRef.current = { tool, color, size, points: [[p.x, p.y, e.pressure || 0.5]], pathObj: null };
        else if (isShapeTool(tool)) startShape(tool, color, size, p);
        else if (tool === 'text') addText(color, size, p);
        else if (tool === 'eraser') eraseAt(p);
      });
      fc.on('mouse:move', (opt) => {
        const e = opt.e; const { tool } = toolRef.current;
        if (penRef.current) { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const ev of evs) { const p = fc.getScenePoint(ev); penRef.current.points.push([p.x, p.y, ev.pressure || 0.5]); } renderPenStroke(); }
        else if (shapeRef.current) updateShape(fc.getScenePoint(e));
        else if (tool === 'eraser' && downRef.current) eraseAt(fc.getScenePoint(e));   // scrub-delete
      });
      const finish = (opt) => {
        const e = opt?.e; if (e && e.pointerType === 'pen') penDownRef.current = false;
        downRef.current = false;
        if (penRef.current) commitPen();
        else if (shapeRef.current) commitShape();
      };
      fc.on('mouse:up', finish);
      applyTool();
      loadTemplate(templateUrlRef.current);   // load whatever template is current (race-safe via the ref)
    })();
    return () => { cancelled = true; const fc = fcRef.current; if (fc) { try { fc.dispose(); } catch { /* ignore */ } fcRef.current = null; } readyRef.current = false; templateObjRef.current = null; loadedTplRef.current = undefined; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps  ← init ONCE; template handled by the effect below

  // load/replace the template on the LIVE canvas when it arrives/changes (no re-init)
  useEffect(() => { if (readyRef.current) loadTemplate(templateImageUrl); }, [templateImageUrl, loadTemplate]);

  // react to tool change (color/size are read live from toolRef at draw time)
  useEffect(() => { applyTool(); }, [tool, applyTool]);

  useImperativeHandle(ref, () => ({
    exportDataUrl: () => { const fc = fcRef.current; if (!fc) return null; fc.discardActiveObject(); fc.requestRenderAll(); return fc.toDataURL({ format: 'png', quality: 1, multiplier: 2 }); },
    exportFabricJson: () => { const fc = fcRef.current; return fc ? JSON.stringify(fc.toJSON()) : null; },
    undo: async () => { const fc = fcRef.current; if (!fc || hiRef.current <= 0) return; hiRef.current--; await fc.loadFromJSON(JSON.parse(histRef.current[hiRef.current])); relockTemplate(); applyTool(); fc.requestRenderAll(); },
    redo: async () => { const fc = fcRef.current; if (!fc || hiRef.current >= histRef.current.length - 1) return; hiRef.current++; await fc.loadFromJSON(JSON.parse(histRef.current[hiRef.current])); relockTemplate(); applyTool(); fc.requestRenderAll(); },
    clear: () => { const fc = fcRef.current; if (!fc) return; fc.getObjects().filter(o => o !== templateObjRef.current).forEach(o => fc.remove(o)); fc.discardActiveObject(); fc.requestRenderAll(); pushHistory(); },
    deleteSelected: () => { const fc = fcRef.current; if (!fc) return; const a = fc.getActiveObjects ? fc.getActiveObjects() : []; let n = 0; a.forEach(o => { if (o !== templateObjRef.current) { fc.remove(o); n++; } }); fc.discardActiveObject(); fc.requestRenderAll(); if (n) pushHistory(); },
  }), [pushHistory, applyTool]);

  return <canvas ref={elRef} style={{ touchAction: 'none', background: '#fff', display: 'block' }} />;
});
export default TabletChartCanvas;
