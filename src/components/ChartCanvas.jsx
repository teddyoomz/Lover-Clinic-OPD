import { useEffect, useRef, useState } from 'react';
import { Pencil, Circle, Minus, Type, Eraser, Undo2, Redo2, Check, Trash2, MousePointer, Loader2 } from 'lucide-react';
import { serializeFabricCanvas, isObjectLevelReeditable } from '../lib/tabletChartTools.js';
import { uploadChartImage } from '../lib/chartImageStorage.js';

const COLORS = ['#000000', '#e53e3e', '#3182ce', '#38a169', '#d69e2e', '#805ad5', '#dd6b20', '#ffffff'];
const WIDTHS = [2, 4, 8];

export default function ChartCanvas({ template, existingData, onSave, onCancel, isDark, customerId = '' }) {
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const containerRef = useRef(null);
  const historyRef = useRef([]);
  const historyIdxRef = useRef(-1);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#e53e3e');
  const [width, setWidth] = useState(4);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const pushHistory = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    const h = historyRef.current;
    h.length = historyIdxRef.current + 1;
    h.push(json);
    if (h.length > 40) h.shift();
    historyIdxRef.current = h.length - 1;
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(false);
  };

  useEffect(() => {
    let cancelled = false;
    let createdBlobUrl = null; // track for cleanup — prevents memory leak
    (async () => {
      const fabric = await import('fabric');
      if (cancelled || !canvasElRef.current) return;

      // Wait a tick for flex layout to compute container size
      await new Promise(r => setTimeout(r, 50));
      const container = containerRef.current;
      const maxW = (container?.clientWidth || 700) - 32;  // minus padding
      const maxH = (container?.clientHeight || 800) - 32;

      // Helper: create canvas with given size, setup brush
      const initCanvas = (w, h) => {
        const canvas = new fabric.Canvas(canvasElRef.current, {
          width: w, height: h,
          backgroundColor: '#ffffff',
          isDrawingMode: true,
        });
        fabricRef.current = canvas;
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = '#e53e3e';
        canvas.freeDrawingBrush.width = 4;
        return canvas;
      };

      // ── Restore existing chart (edit mode) ──
      // LOSSLESS object-level re-edit: if the saved chart carries a fabricJson WITH its canvas dims
      // (serializeFabricCanvas), recreate the SAME coordinate space + loadFromJSON so every prior
      // stroke/shape/text is a MOVABLE/ERASABLE object (not baked into a flat raster). The template
      // (object[0]) is re-locked. Falls back to the PNG-background raster path below when there's no
      // re-editable json (legacy charts, or pre-storage-deploy when the tablet json upload is denied
      // → fabricJson is null). Native dims (no zoom) keep object coords consistent across re-edits;
      // the overflow-auto container scrolls if the canvas is larger than the viewport.
      const reeditJson = existingData?.fabricJson
        ? (() => { try { return JSON.parse(existingData.fabricJson); } catch { return null; } })()
        : null;
      if (reeditJson && isObjectLevelReeditable(reeditJson)) {
        const canvas = initCanvas(reeditJson.canvasWidth, reeditJson.canvasHeight);
        await canvas.loadFromJSON(reeditJson);
        if (cancelled || !canvasElRef.current) return;   // unmounted during the async load (V21 guard)
        canvas.backgroundColor = '#ffffff';              // force white — loadFromJSON adopts the json's bg (may be empty/transparent)
        const objs0 = canvas.getObjects();
        if (objs0[0]) objs0[0].set({ selectable: false, evented: false, hoverCursor: 'default' }); // re-lock template
        canvas.renderAll();

      // Raster fallback — use the saved PNG dataUrl as background (legacy / no re-editable json).
      // 2026-05-22 EOD+2 — dataUrl is now a Firebase Storage URL (Storage-ref architectural fix).
      // crossOrigin='anonymous' is required so the canvas isn't tainted when toDataURL later runs
      // for a re-save. Storage bucket has CORS=['*'] (set by V81-saga fix, 2026-05-21). Legacy
      // inline `data:` dataUrls also work — crossOrigin is harmless for them.
      } else if (existingData?.dataUrl) {
        const imgEl = await new Promise((resolve) => {
          const img = new window.Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = existingData.dataUrl;
        });
        if (imgEl) {
          const imgRatio = imgEl.naturalWidth / imgEl.naturalHeight;
          let canvasW, canvasH;
          if (maxW / maxH > imgRatio) { canvasH = maxH; canvasW = Math.round(maxH * imgRatio); }
          else { canvasW = maxW; canvasH = Math.round(maxW / imgRatio); }
          const canvas = initCanvas(canvasW, canvasH);
          const fabricImg = new fabric.FabricImage(imgEl);
          const scale = Math.min(canvasW / fabricImg.width, canvasH / fabricImg.height);
          fabricImg.set({
            scaleX: scale, scaleY: scale,
            left: Math.round((canvasW - fabricImg.width * scale) / 2),
            top: Math.round((canvasH - fabricImg.height * scale) / 2),
            selectable: false, evented: false, hoverCursor: 'default',
            originX: 'left', originY: 'top',
          });
          canvas.add(fabricImg);
          canvas.sendObjectToBack(fabricImg);
          canvas.renderAll();
        } else {
          initCanvas(maxW, maxH);
        }

      // ── New chart with template ──
      } else if (template?.imageUrl) {
        // V50 (2026-05-08) — ProClinic image proxy branch removed. Templates
        // come from local Firestore (be_chart_templates) or user upload —
        // both are dataUrl/blob already, no proxy needed.
        const imgSrc = template.imageUrl;
        const imgEl = await new Promise((resolve) => {
          const img = new window.Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = imgSrc;
        });

        if (imgEl) {
          const imgRatio = imgEl.naturalWidth / imgEl.naturalHeight;
          // Fit canvas to image ratio within container
          let canvasW, canvasH;
          if (maxW / maxH > imgRatio) {
            // Container is wider than image ratio → height-limited
            canvasH = maxH;
            canvasW = Math.round(maxH * imgRatio);
          } else {
            // Container is taller → width-limited
            canvasW = maxW;
            canvasH = Math.round(maxW / imgRatio);
          }
          const canvas = initCanvas(canvasW, canvasH);
          const fabricImg = new fabric.FabricImage(imgEl);
          // Scale to fill canvas (leave small margin)
          const scale = Math.min((canvasW - 8) / fabricImg.width, (canvasH - 8) / fabricImg.height);
          const scaledW = fabricImg.width * scale;
          const scaledH = fabricImg.height * scale;
          fabricImg.set({
            scaleX: scale, scaleY: scale,
            left: Math.round((canvasW - scaledW) / 2),
            top: Math.round((canvasH - scaledH) / 2),
            selectable: false, evented: false, hoverCursor: 'default',
            originX: 'left', originY: 'top',
          });
          canvas.add(fabricImg);
          canvas.sendObjectToBack(fabricImg);
          canvas.renderAll();
        } else {
          initCanvas(maxW, maxH);
        }

      // ── Blank canvas ──
      } else {
        // Blank: use portrait ratio
        const h = maxH;
        const w = Math.min(maxW, Math.round(h * 0.7));
        initCanvas(w, h);
      }

      const canvas = fabricRef.current;
      historyRef.current = [JSON.stringify(canvas.toJSON())];
      historyIdxRef.current = 0;
      setLoading(false);
      canvas.on('path:created', pushHistory);
      canvas.on('object:modified', pushHistory);
    })();
    return () => {
      cancelled = true;
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl); // prevent memory leak
      if (fabricRef.current) { fabricRef.current.dispose(); fabricRef.current = null; }
    };
  }, []); // eslint-disable-line

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (tool === 'pen') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = width;
    } else if (tool === 'eraser') {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.color = '#ffffff';
      canvas.freeDrawingBrush.width = width * 4;
    } else {
      canvas.isDrawingMode = false;
    }
  }, [tool, color, width]);

  const addShape = async (type) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const fabric = await import('fabric');
    canvas.isDrawingMode = false;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    let obj;
    if (type === 'circle') obj = new fabric.Circle({ left: cx - 30, top: cy - 30, radius: 30, fill: 'transparent', stroke: color, strokeWidth: width });
    else if (type === 'line') obj = new fabric.Line([cx - 40, cy, cx + 40, cy], { stroke: color, strokeWidth: width });
    else if (type === 'text') obj = new fabric.Textbox('ข้อความ', { left: cx - 40, top: cy - 10, fontSize: 18, fill: color, width: 120, fontFamily: 'sans-serif' });
    if (obj) { canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll(); pushHistory(); }
    setTool('select');
  };

  const handleUndo = async () => {
    if (historyIdxRef.current <= 0 || !fabricRef.current) return;
    historyIdxRef.current--;
    await fabricRef.current.loadFromJSON(JSON.parse(historyRef.current[historyIdxRef.current]));
    fabricRef.current.renderAll();
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(true);
  };
  const handleRedo = async () => {
    if (historyIdxRef.current >= historyRef.current.length - 1 || !fabricRef.current) return;
    historyIdxRef.current++;
    await fabricRef.current.loadFromJSON(JSON.parse(historyRef.current[historyIdxRef.current]));
    fabricRef.current.renderAll();
    setCanUndo(true);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  };
  const handleClear = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects();
    const startIdx = (objects.length > 0 && !objects[0].selectable) ? 1 : 0;
    for (let i = objects.length - 1; i >= startIdx; i--) canvas.remove(objects[i]);
    canvas.renderAll();
    pushHistory();
  };
  const handleSave = async () => {
    const canvas = fabricRef.current;
    if (!canvas || saving) return;
    // 2026-05-22 EOD+2 — Storage-ref architectural fix. Pre-fix: dataUrl was the
    // full inline base64 PNG (1-2+ MiB) → Firestore rejected detail.charts as
    // "invalid nested entity" when the user uploaded a high-res template.
    // Fix: upload the flattened PNG to Firebase Storage → store only the URL in
    // detail.charts[].dataUrl (small ~200-char string). multiplier:2 KEPT — high
    // resolution preserved (medical data). storagePath returned alongside so the
    // treatment-delete cascade can clean up the Storage object.
    setSaveError('');
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
      const fabricJson = serializeFabricCanvas(canvas);   // includes canvas dims → lossless object-level re-edit
      const { url, storagePath } = await uploadChartImage({ customerId, dataUrl });
      onSave({ dataUrl: url, storagePath, fabricJson, templateId: template?.id || 'blank' });
    } catch (e) {
      console.error('[ChartCanvas] save failed:', e);
      setSaveError(`บันทึก Chart ไม่สำเร็จ: ${e?.message || e}`);
      setSaving(false);
    }
  };

  const btnCls = (active) => `p-1.5 rounded-lg transition-all ${active ? 'bg-teal-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-gray-50 flex-wrap">
        <span className="text-xs font-black text-teal-600 mr-2">Chart</span>
        <span className="text-[11px] text-gray-400 mr-2">เครื่องมือ</span>
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1 border-gray-300">
          <button onClick={() => setTool('select')} className={btnCls(tool === 'select')} title="เลือก/ย้าย"><MousePointer size={16} /></button>
          <button onClick={() => setTool('pen')} className={btnCls(tool === 'pen')} title="ปากกา"><Pencil size={16} /></button>
          <button onClick={() => addShape('circle')} className={btnCls(false)} title="วงกลม"><Circle size={16} /></button>
          <button onClick={() => addShape('line')} className={btnCls(false)} title="เส้นตรง"><Minus size={16} /></button>
          <button onClick={() => addShape('text')} className={btnCls(false)} title="ข้อความ"><Type size={16} /></button>
          <button onClick={() => setTool('eraser')} className={btnCls(tool === 'eraser')} title="ยางลบ"><Eraser size={16} /></button>
        </div>
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1 border-gray-300">
          {COLORS.map(c => (
            <button key={c} onClick={() => { setColor(c); if (tool !== 'eraser') setTool('pen'); }}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c && tool === 'pen' ? 'scale-125 border-teal-500' : 'border-gray-300'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1 border-gray-300">
          {WIDTHS.map(w => (
            <button key={w} onClick={() => setWidth(w)}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${width === w ? 'bg-teal-500' : 'bg-gray-200'}`}>
              <div className="rounded-full bg-gray-800" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <button onClick={handleUndo} disabled={!canUndo} className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30" title="ย้อนกลับ"><Undo2 size={16} /></button>
        <button onClick={handleRedo} disabled={!canRedo} className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30" title="ทำซ้ำ"><Redo2 size={16} /></button>
        <button onClick={handleClear} className="p-1.5 text-red-400 hover:text-red-600" title="ล้างทั้งหมด"><Trash2 size={16} /></button>
        <div className="flex-1" />
        {saveError && <span className="text-[11px] text-red-500 font-bold mr-2 truncate max-w-[40%]" title={saveError}>{saveError}</span>}
        <button onClick={onCancel} disabled={saving} className="px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50">ยกเลิก</button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs font-bold text-white bg-teal-500 rounded-lg hover:bg-teal-600 flex items-center gap-1 ml-1 disabled:opacity-60">
          {saving ? <><Loader2 size={12} className="animate-spin" /> กำลังบันทึก...</> : <><Check size={12} /> ยืนยัน</>}
        </button>
      </div>
      {/* Canvas area — centered */}
      <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center bg-gray-200 p-4">
        {loading && <div className="absolute text-gray-400 text-sm">กำลังโหลด...</div>}
        <canvas ref={canvasElRef} className="shadow-lg" />
      </div>
    </div>
  );
}
