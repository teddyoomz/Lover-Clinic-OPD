import { useState } from 'react';
import { X, FileImage } from 'lucide-react';
import { chartTemplates, chartCategories } from '../data/chartTemplates.js';

export default function ChartTemplateSelector({ isOpen, onClose, onSelect, isDark }) {
  const [category, setCategory] = useState('all');
  if (!isOpen) return null;

  const filtered = category === 'all' ? chartTemplates : chartTemplates.filter(t => t.category === category);

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className={`w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <h3 className="text-sm font-black text-teal-500">เลือก Template</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>

        {/* Category tabs */}
        <div className={`flex gap-1 px-4 py-2 border-b overflow-x-auto ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
          {chartCategories.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)}
              className={`text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap transition-all ${
                category === cat.id
                  ? 'bg-teal-500 text-white'
                  : isDark ? 'bg-[#1a1a1a] text-gray-400 hover:bg-[#222]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 overflow-y-auto flex-1">
          {filtered.map(tmpl => (
            <button key={tmpl.id} onClick={() => { onSelect(tmpl); onClose(); }}
              className={`rounded-lg border overflow-hidden transition-all hover:scale-[1.03] hover:shadow-lg ${
                isDark ? 'border-[#333] bg-[#111] hover:border-teal-500/50' : 'border-gray-200 bg-gray-50 hover:border-teal-400'
              }`}>
              <div className={`aspect-[3/4] flex items-center justify-center p-2 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                {tmpl.imageUrl ? (
                  <img src={tmpl.imageUrl} alt={tmpl.name} className="w-full h-full object-contain opacity-70" />
                ) : (
                  <FileImage size={32} className="text-gray-500" />
                )}
              </div>
              <div className={`px-2 py-1.5 text-center border-t ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
                <span className="text-[10px] font-bold">{tmpl.name}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
