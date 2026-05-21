import { useState } from 'react';
import { Plus, Edit3, Trash2, FileImage } from 'lucide-react';
import ChartTemplateSelector from './ChartTemplateSelector.jsx';
import ChartCanvas from './ChartCanvas.jsx';
import PcPairingModal from './tablet-chart/PcPairingModal.jsx';
import { useChartEditSession } from '../hooks/useChartEditSession.js';
import { useSelectedBranch } from '../lib/BranchContext.jsx';
import { auth } from '../firebase.js';

export default function ChartSection({ charts, onChartsChange, isDark, accent, db, appId, patientLabel = '' }) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasTemplate, setCanvasTemplate] = useState(null);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [pendingTemplate, setPendingTemplate] = useState(null);   // staged template awaiting "edit here vs tablet"
  const [pendingChart, setPendingChart] = useState(null);         // existing chart being re-edited via the modal (null = new chart)
  const { branchId } = useSelectedBranch();
  const pcDeviceId = (auth.currentUser?.uid || 'pc') + ':' + (typeof window !== 'undefined' ? (window.name || 'main') : 'main');

  // New chart OR editing an existing one both stage the "edit here vs tablet" choice (PcPairingModal).
  // pendingChart distinguishes them: null = new chart (send the blank template), set = re-edit (send the
  // existing chart's PNG + fabricJson so the tablet can object-level re-edit + merge back to the same slot).
  const handleSelectTemplate = (tmpl) => {
    setCanvasTemplate(tmpl);
    setEditingIdx(-1);
    setSelectorOpen(false);
    setPendingChart(null);
    setPendingTemplate(tmpl);
  };

  const handleEdit = (idx) => {
    const chart = charts[idx];
    setCanvasTemplate(chart?.template || null);
    setEditingIdx(idx);
    setPendingChart(chart || null);
    setPendingTemplate(chart?.template || { id: chart?.templateId || 'blank', name: 'Chart', category: '' });
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

  // Tablet-pairing relay (Q1): the tablet result funnels through the SAME handleSave
  // the local canvas uses → identical charts[] shape. ChartSection owns this; TFP is untouched.
  // Re-edit: when pendingChart is set, send the existing chart's PNG (raster fallback) + fabricJson
  // (object-level) → result merges back into the SAME slot (editingIdx preserved through the relay).
  const { phase, error, start, cancel } = useChartEditSession({
    pcDeviceId, pcUid: auth.currentUser?.uid,
    onSaved: (chartData) => { handleSave(chartData); setPendingTemplate(null); setPendingChart(null); },
  });
  const editHere = () => { setPendingTemplate(null); setPendingChart(null); setCanvasOpen(true); };
  const sendToTablet = (tablet) => start({
    tablet,
    template: { id: pendingTemplate?.id, name: pendingTemplate?.name, category: pendingTemplate?.category || '' },
    patientLabel,
    templateDataUrl: pendingChart ? pendingChart.dataUrl : pendingTemplate?.imageUrl,
    editFabricJson: pendingChart ? pendingChart.fabricJson : undefined,
    branchId,
  });
  const closePairing = () => { cancel(); setPendingTemplate(null); setPendingChart(null); };

  return (
    <>
      {/* Section header */}
      <div className="flex items-center flex-wrap gap-2 mb-3">
        <FileImage size={14} style={{ color: accent, filter: `drop-shadow(0 0 4px ${accent}60)` }} />
        <h4 className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: accent }}>Chart</h4>
        {charts.length < 2 && (
          <button onClick={() => setSelectorOpen(true)}
            className={`ml-auto text-xs font-bold px-2 py-1 rounded-lg border transition-all flex items-center gap-1`}
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
          <p className="text-xs text-gray-500">กด เพิ่ม Chart เพื่อเลือก template และวาดบันทึกการรักษา</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {charts.map((chart, idx) => (
            <div key={idx} className={`relative rounded-lg border overflow-hidden group ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
              <img src={chart.dataUrl} alt={`Chart ${idx + 1}`} className="w-full object-contain bg-white" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button data-testid={`chart-edit-${idx}`} onClick={() => handleEdit(idx)} className="p-2 bg-white/90 rounded-full text-blue-600 hover:bg-white shadow"><Edit3 size={14} /></button>
                <button data-testid={`chart-delete-${idx}`} onClick={() => handleDelete(idx)} className="p-2 bg-white/90 rounded-full text-red-500 hover:bg-white shadow"><Trash2 size={14} /></button>
              </div>
              <div className={`text-center py-1 text-[11px] font-bold ${isDark ? 'bg-[#111] text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                Chart {idx + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template selector modal */}
      <ChartTemplateSelector isOpen={selectorOpen} onClose={() => setSelectorOpen(false)} onSelect={handleSelectTemplate} isDark={isDark} db={db} appId={appId} />

      {/* Edit-on-tablet choice / waiting / failed (new charts AND re-edit) */}
      {(pendingTemplate || pendingChart) && (
        <PcPairingModal
          branchId={branchId}
          phase={phase === 'idle' ? 'choose' : phase}
          error={error}
          onEditHere={editHere}
          onSendToTablet={sendToTablet}
          onCancel={closePairing}
          onRetry={() => cancel()}
          onClose={closePairing}
        />
      )}

      {/* Drawing canvas (full-screen) — local edit */}
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
