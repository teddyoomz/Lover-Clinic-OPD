import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Pencil, Circle, Minus, Type, Eraser, Undo2, Redo2, Download, Check, Trash2 } from 'lucide-react';

const COLORS = ['#000000', '#e53e3e', '#3182ce', '#38a169', '#d69e2e', '#805ad5', '#dd6b20', '#ffffff'];
const WIDTHS = [2, 4, 8];

export default function ChartCanvas({ template, existingData, onSave, onCancel, isDark }) {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#e53e3e');
  const [width, setWidth] = useState(4);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [ready, setReady] = useState(false);

  // Save current state to history
  const saveHistory = useCallback(() => {
    if (!fabricRef.current) return;
    const json = fabricRef.current.toJSON();
    setHistory(prev => {
      const next = prev.slice(0, historyIdx + 1);
      next.push(json);
      if (next.length > 30) next.shift();
      return next;
    });
    setHistoryIdx(prev => Math.min(prev + 1, 29));
  }, [historyIdx]);

  // Initialize fabric canvas
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fabric = await import('fabric');
      if (cancelled || !canvasRef.current) return;

      const container = containerRef.current;
      const cw = container?.clientWidth || 600;
      const ch = container?.clientHeight || 700;

      const canvas = new fabric.Canvas(canvasRef.current, {
        width: cw,
        height: ch,
        backgroundColor: '#ffffff',
        isDrawingMode: true,
      });
      fabricRef.current = canvas;

      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = width;

      // Load existing data OR template background
      if (existingData?.fabricJson) {
        await canvas.loadFromJSON(existingData.fabricJson);
        canvas.renderAll();
      } else if (template?.imageUrl) {
        const img = await fabric.FabricImage.fromURL(template.imageUrl, { crossOrigin: 'anonymous' });
        // Scale to fit canvas
        const scale = Math.min((cw - 20) / img.width, (ch - 20) / img.height);
        img.set({
          scaleX: scale, scaleY: scale,
          left: (cw - img.width * scale) / 2,
          top: (ch - img.height * scale) / 2,
          selectable: false, evented: false, excludeFromExport: false,
        });
        canvas.add(img);
        canvas.sendObjectToBack(img);
      }

      canvas.renderAll();
      // Save initial state
      const initJson = canvas.toJSON();
      setHistory([initJson]);
      setHistoryIdx(0);
      setReady(true);

      // Listen for drawing end
      canvas.on('path:created', () => {
        const json = canvas.toJSON();
        setHistory(prev => {
          const next = [...prev.slice(0, historyIdx + 1), json];
          if (next.length > 30) next.shift();
          return next;
        });
        setHistoryIdx(prev => prev + 1);
      });
      canvas.on('object:modified', () => {
        const json = canvas.toJSON();
        setHistory(prev => [...prev.slice(0, historyIdx + 1), json]);
        setHistoryIdx(prev => prev + 1);
      });
    })();
    return () => { cancelled = true; fabricRef.current?.dispose(); fabricRef.current = null; };
  }, []); // eslint-disable-line

  // Update brush when tool/color/width changes
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
      canvas.freeDrawingBrush.width = width * 3;
    } else {
      canvas.isDrawingMode = false;
    }
  }, [tool, color, width]);

  // Tool handlers
  const addShape = async (type) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const fabric = await import('fabric');
    const center = { left: canvas.width / 2 - 30, top: canvas.height / 2 - 30 };
    let obj;
    if (type === 'circle') {
      obj = new fabric.Circle({ ...center, radius: 30, fill: 'transparent', stroke: color, strokeWidth: width });
    } else if (type === 'line') {
      obj = new fabric.Line([center.left, center.top, center.left + 80, center.top], { stroke: color, strokeWidth: width });
    } else if (type === 'text') {
      obj = new fabric.Textbox('ข้อความ', { ...center, fontSize: 16, fill: color, width: 120, fontFamily: 'sans-serif' });
    }
    if (obj) { canvas.add(obj); canvas.setActiveObject(obj); canvas.renderAll(); saveHistory(); }
    setTool('select');
  };

  const handleUndo = () => {
    if (historyIdx <= 0 || !fabricRef.current) return;
    const idx = historyIdx - 1;
    fabricRef.current.loadFromJSON(history[idx]).then(() => { fabricRef.current.renderAll(); });
    setHistoryIdx(idx);
  };
  const handleRedo = () => {
    if (historyIdx >= history.length - 1 || !fabricRef.current) return;
    const idx = historyIdx + 1;
    fabricRef.current.loadFromJSON(history[idx]).then(() => { fabricRef.current.renderAll(); });
    setHistoryIdx(idx);
  };
  const handleClear = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Keep only background (first object if it's a template image)
    const objects = canvas.getObjects();
    const toRemove = objects.slice(1); // keep first (template)
    toRemove.forEach(o => canvas.remove(o));
    canvas.renderAll();
    saveHistory();
  };

  const handleSave = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
    const fabricJson = canvas.toJSON();
    onSave({ dataUrl, fabricJson, templateId: template?.id || 'blank' });
  };

  const btnCls = (active) => `p-1.5 rounded-lg transition-all ${active ? 'bg-teal-500 text-white shadow-md' : isDark ? 'text-gray-400 hover:bg-[#222]' : 'text-gray-600 hover:bg-gray-100'}`;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-gray-50 flex-wrap">
        <span className="text-xs font-black text-teal-600 mr-2">Chart</span>
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1 border-gray-300">
          <button onClick={() => setTool('pen')} className={btnCls(tool === 'pen')} title="ปากกา"><Pencil size={16} /></button>
          <button onClick={() => { setTool('circle'); addShape('circle'); }} className={btnCls(false)} title="วงกลม"><Circle size={16} /></button>
          <button onClick={() => { setTool('line'); addShape('line'); }} className={btnCls(false)} title="เส้นตรง"><Minus size={16} /></button>
          <button onClick={() => { setTool('text'); addShape('text'); }} className={btnCls(false)} title="ข้อความ"><Type size={16} /></button>
          <button onClick={() => setTool('eraser')} className={btnCls(tool === 'eraser')} title="ยางลบ"><Eraser size={16} /></button>
        </div>
        {/* Colors */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1 border-gray-300">
          {COLORS.map(c => (
            <button key={c} onClick={() => { setColor(c); setTool('pen'); }}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c ? 'scale-125 border-teal-500' : 'border-gray-300'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        {/* Width */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1 border-gray-300">
          {WIDTHS.map(w => (
            <button key={w} onClick={() => setWidth(w)}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${width === w ? 'bg-teal-500' : 'bg-gray-200'}`}>
              <div className="rounded-full bg-gray-800" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        {/* Actions */}
        <button onClick={handleUndo} disabled={historyIdx <= 0} className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30"><Undo2 size={16} /></button>
        <button onClick={handleRedo} disabled={historyIdx >= history.length - 1} className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30"><Redo2 size={16} /></button>
        <button onClick={handleClear} className="p-1.5 text-red-400 hover:text-red-600" title="ล้างทั้งหมด"><Trash2 size={16} /></button>

        <div className="flex-1" />
        <button onClick={onCancel} className="px-3 py-1 text-xs font-bold text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100">ยกเลิก</button>
        <button onClick={handleSave} className="px-3 py-1 text-xs font-bold text-white bg-teal-500 rounded-lg hover:bg-teal-600 flex items-center gap-1 ml-1">
          <Check size={12} /> ยืนยัน
        </button>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center bg-gray-100 p-2">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
