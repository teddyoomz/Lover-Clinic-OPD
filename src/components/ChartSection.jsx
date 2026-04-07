import { useState } from 'react';
import { Plus, Edit3, Trash2, FileImage } from 'lucide-react';
import ChartTemplateSelector from './ChartTemplateSelector.jsx';
import ChartCanvas from './ChartCanvas.jsx';

export default function ChartSection({ charts, onChartsChange, isDark, accent }) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasTemplate, setCanvasTemplate] = useState(null);
  const [editingIdx, setEditingIdx] = useState(-1);

  const handleSelectTemplate = (tmpl) => {
    setCanvasTemplate(tmpl);
    setEditingIdx(-1);
    setCanvasOpen(true);
  };

  const handleEdit = (idx) => {
    setCanvasTemplate(charts[idx]?.template || null);
    setEditingIdx(idx);
    setCanvasOpen(true);
  };

  const handleSave = (chartData) => {
    // Ensure fabricJson is serialized as string for reliable storage/restore
    const fabricJson = typeof chartData.fabricJson === 'string' ? chartData.fabricJson : JSON.stringify(chartData.fabricJson);
    const entry = { ...chartData, fabricJson, template: canvasTemplate, savedAt: new Date().toISOString() };
    if (editingIdx >= 0) {
      onChartsChange(prev => prev.map((c, i) => i === editingIdx ? entry : c));
    } else {
      onChartsChange(prev => [...prev, entry].slice(0, 2)); // max 2 charts
    }
    setCanvasOpen(false);
  };

  const handleDelete = (idx) => {
    onChartsChange(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <>
      {/* Section header */}
      <div className="flex items-center flex-wrap gap-2 mb-3">
        <FileImage size={14} style={{ color: accent, filter: `drop-shadow(0 0 4px ${accent}60)` }} />
        <h4 className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: accent }}>Chart</h4>
        {charts.length < 2 && (
          <button onClick={() => setSelectorOpen(true)}
            className={`ml-auto text-[10px] font-bold px-2 py-1 rounded-lg border transition-all flex items-center gap-1`}
            style={{ color: accent, borderColor: `${accent}40`, background: `${accent}0a` }}>
            <Plus size={10} /> เพิ่ม Chart
          </button>
        )}
      </div>

      {/* Chart thumbnails */}
      {charts.length === 0 ? (
        <div className={`rounded-lg border border-dashed py-6 text-center cursor-pointer transition-all ${
          isDark ? 'border-[#333] hover:border-teal-500/40' : 'border-gray-300 hover:border-teal-400'
        }`} onClick={() => setSelectorOpen(true)}>
          <FileImage size={24} className="mx-auto mb-2 text-gray-500" />
          <p className="text-[10px] text-gray-500">กด เพิ่ม Chart เพื่อเลือก template และวาดบันทึกการรักษา</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {charts.map((chart, idx) => (
            <div key={idx} className={`relative rounded-lg border overflow-hidden group ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
              <img src={chart.dataUrl} alt={`Chart ${idx + 1}`} className="w-full object-contain bg-white" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button onClick={() => handleEdit(idx)} className="p-2 bg-white/90 rounded-full text-blue-600 hover:bg-white shadow"><Edit3 size={14} /></button>
                <button onClick={() => handleDelete(idx)} className="p-2 bg-white/90 rounded-full text-red-500 hover:bg-white shadow"><Trash2 size={14} /></button>
              </div>
              <div className={`text-center py-1 text-[9px] font-bold ${isDark ? 'bg-[#111] text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                Chart {idx + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template selector modal */}
      <ChartTemplateSelector isOpen={selectorOpen} onClose={() => setSelectorOpen(false)} onSelect={handleSelectTemplate} isDark={isDark} />

      {/* Drawing canvas (full-screen) */}
      {canvasOpen && (
        <ChartCanvas
          template={canvasTemplate}
          existingData={editingIdx >= 0 ? charts[editingIdx] : null}
          onSave={handleSave}
          onCancel={() => setCanvasOpen(false)}
          isDark={isDark}
        />
      )}
    </>
  );
}
