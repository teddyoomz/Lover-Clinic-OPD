import { useEffect, useRef, useState } from 'react';
import { Pencil, Circle, Minus, Type, Eraser, Undo2, Redo2, Check, Trash2, MousePointer } from 'lucide-react';

const COLORS = ['#000000', '#e53e3e', '#3182ce', '#38a169', '#d69e2e', '#805ad5', '#dd6b20', '#ffffff'];
const WIDTHS = [2, 4, 8];

export default function ChartCanvas({ template, existingData, onSave, onCancel, isDark }) {
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

  // Push state to undo/redo history
  const pushHistory = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    const h = historyRef.current;
    // Trim future states
    h.length = historyIdxRef.current + 1;
    h.push(json);
    if (h.length > 40) h.shift();
    historyIdxRef.current = h.length - 1;
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(false);
  };

  // Initialize fabric canvas
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fabric = await import('fabric');
      if (cancelled || !canvasElRef.current) return;

      const container = containerRef.current;
      const cw = Math.min(container?.clientWidth || 600, 800);
      const ch = Math.min(container?.clientHeight || 700, 900);

      const canvas = new fabric.Canvas(canvasElRef.current, {
        width: cw, height: ch,
        backgroundColor: '#ffffff',
        isDrawingMode: true,
      });
      fabricRef.current = canvas;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = '#e53e3e';
      canvas.freeDrawingBrush.width = 4;

      // Load existing data (re-edit mode)
      if (existingData?.fabricJson) {
        try {
          const jsonData = typeof existingData.fabricJson === 'string'
            ? JSON.parse(existingData.fabricJson)
            : existingData.fabricJson;
          await canvas.loadFromJSON(jsonData);
          canvas.renderAll();
        } catch (e) {
          console.warn('[ChartCanvas] loadFromJSON failed:', e);
        }
      } else if (template?.imageUrl) {
        // Load template as background image using HTML Image element
        await new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const fabricImg = new fabric.FabricImage(img);
            const scale = Math.min((cw - 20) / fabricImg.width, (ch - 20) / fabricImg.height, 1);
            fabricImg.set({
              scaleX: scale, scaleY: scale,
              left: (cw - fabricImg.width * scale) / 2,
              top: (ch - fabricImg.height * scale) / 2,
              selectable: false, evented: false,
              hoverCursor: 'default',
            });
            canvas.add(fabricImg);
            canvas.sendObjectToBack(fabricImg);
            canvas.renderAll();
            resolve();
          };
          img.onerror = () => {
            console.warn('[ChartCanvas] template image failed to load:', template.imageUrl);
            resolve();
          };
          img.src = template.imageUrl;
        });
      }

      // Initial history state
      historyRef.current = [JSON.stringify(canvas.toJSON())];
      historyIdxRef.current = 0;
      setLoading(false);

      // Track changes for undo/redo
      canvas.on('path:created', pushHistory);
      canvas.on('object:modified', pushHistory);
      canvas.on('object:added', () => {
        // Only push for non-drawing-mode additions (shapes, text)
        if (!canvas.isDrawingMode) pushHistory();
      });
    })();
    return () => {
      cancelled = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  }, []); // eslint-disable-line

  // Update brush settings
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
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    let obj;
    if (type === 'circle') {
      obj = new fabric.Circle({ left: cx - 30, top: cy - 30, radius: 30, fill: 'transparent', stroke: color, strokeWidth: width });
    } else if (type === 'line') {
      obj = new fabric.Line([cx - 40, cy, cx + 40, cy], { stroke: color, strokeWidth: width });
    } else if (type === 'text') {
      obj = new fabric.Textbox('ข้อความ', { left: cx - 40, top: cy - 10, fontSize: 18, fill: color, width: 120, fontFamily: 'sans-serif' });
    }
    if (obj) {
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.renderAll();
    }
    setTool('select');
  };

  const handleUndo = async () => {
    if (historyIdxRef.current <= 0 || !fabricRef.current) return;
    historyIdxRef.current--;
    await fabricRef.current.loadFromJSON(JSON.parse(historyRef.current[historyIdxRef.current]));
    fabricRef.current.renderAll();
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  };

  const handleRedo = async () => {
    if (historyIdxRef.current >= historyRef.current.length - 1 || !fabricRef.current) return;
    historyIdxRef.current++;
    await fabricRef.current.loadFromJSON(JSON.parse(historyRef.current[historyIdxRef.current]));
    fabricRef.current.renderAll();
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  };

  const handleClear = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects();
    // Keep first object if it's the template background
    const startIdx = (objects.length > 0 && !objects[0].selectable) ? 1 : 0;
    for (let i = objects.length - 1; i >= startIdx; i--) canvas.remove(objects[i]);
    canvas.renderAll();
    pushHistory();
  };

  const handleSave = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
    const fabricJson = canvas.toJSON();
    onSave({ dataUrl, fabricJson, templateId: template?.id || 'blank' });
  };

  const btnCls = (active) => `p-1.5 rounded-lg transition-all ${active ? 'bg-teal-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-gray-50 flex-wrap">
        <span className="text-xs font-black text-teal-600 mr-2">Chart</span>
        <span className="text-[9px] text-gray-400 mr-2">เครื่องมือ</span>
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
        <button onClick={onCancel} className="px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100">ยกเลิก</button>
        <button onClick={handleSave} className="px-3 py-1.5 text-xs font-bold text-white bg-teal-500 rounded-lg hover:bg-teal-600 flex items-center gap-1 ml-1">
          <Check size={12} /> ยืนยัน
        </button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center bg-gray-100 p-2">
        {loading && <div className="absolute text-gray-400 text-sm">กำลังโหลด...</div>}
        <canvas ref={canvasElRef} />
      </div>
    </div>
  );
}
