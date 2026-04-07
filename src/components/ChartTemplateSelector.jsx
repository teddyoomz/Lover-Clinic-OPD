import { useState, useEffect, useRef } from 'react';
import { X, FileImage, Download, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { chartTemplates, chartCategories } from '../data/chartTemplates.js';
import * as broker from '../lib/brokerClient.js';

export default function ChartTemplateSelector({ isOpen, onClose, onSelect, isDark, db, appId }) {
  const [source, setSource] = useState('local'); // local | proclinic | upload
  const [category, setCategory] = useState('all');
  const [pcTemplates, setPcTemplates] = useState([]);
  const [pcLoading, setPcLoading] = useState(false);
  const [customTemplates, setCustomTemplates] = useState([]);
  const fileRef = useRef(null);

  // Load custom templates from Firestore
  useEffect(() => {
    if (!isOpen || !db || !appId) return;
    import('firebase/firestore').then(({ getDoc, doc }) => {
      getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pc_chart_templates', 'custom'))
        .then(snap => {
          if (snap.exists() && snap.data().templates) {
            try { setCustomTemplates(JSON.parse(snap.data().templates)); } catch (_) {}
          }
        }).catch(() => {});
    });
  }, [isOpen, db, appId]);

  // Load ProClinic templates (lazy)
  const loadPcTemplates = async () => {
    if (pcTemplates.length > 0) return;
    setPcLoading(true);
    try {
      const data = await broker.getChartTemplates();
      if (data.success && data.templates?.length) setPcTemplates(data.templates);
    } catch (_) {}
    setPcLoading(false);
  };

  // Handle custom image upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const newTemplate = { id: `custom-${Date.now()}`, name: file.name.replace(/\.[^.]+$/, ''), imageUrl: dataUrl, isCustom: true };
      const updated = [...customTemplates, newTemplate];
      setCustomTemplates(updated);
      // Save to Firestore
      if (db && appId) {
        import('firebase/firestore').then(({ setDoc, doc }) => {
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pc_chart_templates', 'custom'), {
            templates: JSON.stringify(updated), updatedAt: new Date().toISOString(),
          }, { merge: true }).catch(() => {});
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const deleteCustomTemplate = (idx) => {
    const updated = customTemplates.filter((_, i) => i !== idx);
    setCustomTemplates(updated);
    if (db && appId) {
      import('firebase/firestore').then(({ setDoc, doc }) => {
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pc_chart_templates', 'custom'), {
          templates: JSON.stringify(updated), updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      });
    }
  };

  if (!isOpen) return null;

  const localFiltered = category === 'all' ? chartTemplates : chartTemplates.filter(t => t.category === category);

  const sourceTabs = [
    { id: 'local', label: 'ของเรา', icon: FileImage },
    { id: 'proclinic', label: 'ProClinic', icon: Download },
    { id: 'upload', label: 'อัปโหลด', icon: Upload },
  ];

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className={`w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <h3 className="text-sm font-black text-teal-500">เลือก Template</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
        </div>

        {/* Source tabs */}
        <div className={`flex gap-1 px-4 py-2 border-b ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
          {sourceTabs.map(tab => (
            <button key={tab.id} onClick={() => { setSource(tab.id); if (tab.id === 'proclinic') loadPcTemplates(); }}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition-all ${
                source === tab.id
                  ? 'bg-teal-500 text-white'
                  : isDark ? 'bg-[#1a1a1a] text-gray-400 hover:bg-[#222]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              <tab.icon size={11} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Category filter (local only) */}
        {source === 'local' && (
          <div className={`flex gap-1 px-4 py-2 border-b overflow-x-auto ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
            {chartCategories.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`text-[9px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-all ${
                  category === cat.id
                    ? 'bg-gray-600 text-white'
                    : isDark ? 'bg-[#1a1a1a] text-gray-500 hover:bg-[#222]' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                }`}>
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Template grid */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* ── Local templates ── */}
          {source === 'local' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {localFiltered.map(tmpl => (
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
          )}

          {/* ── ProClinic templates ── */}
          {source === 'proclinic' && (
            pcLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-teal-500 mr-2" />
                <span className="text-xs text-gray-500">กำลังโหลดจาก ProClinic...</span>
              </div>
            ) : pcTemplates.length === 0 ? (
              <p className="text-center text-xs text-gray-500 py-12">ไม่พบ template จาก ProClinic</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pcTemplates.map(tmpl => (
                  <button key={tmpl.id} onClick={() => {
                    // Use proxy URL so canvas can load the image
                    const proxyUrl = `/api/proclinic/treatment`;
                    onSelect({ ...tmpl, imageUrl: tmpl.imageUrl, proxyUrl, isProClinic: true });
                    onClose();
                  }}
                    className={`rounded-lg border overflow-hidden transition-all hover:scale-[1.03] hover:shadow-lg ${
                      isDark ? 'border-[#333] bg-[#111] hover:border-amber-500/50' : 'border-gray-200 bg-gray-50 hover:border-amber-400'
                    }`}>
                    <div className={`aspect-[3/4] flex items-center justify-center p-1 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                      <img src={tmpl.imageUrl} alt={tmpl.name} className="w-full h-full object-contain"
                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling?.classList?.remove('hidden'); }}
                      />
                      <ImageIcon size={32} className="text-gray-500 hidden" />
                    </div>
                    <div className={`px-2 py-1.5 text-center border-t ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
                      <span className="text-[10px] font-bold">{tmpl.name || 'ProClinic Template'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Upload custom templates ── */}
          {source === 'upload' && (
            <div>
              {/* Upload button */}
              <div className={`rounded-lg border-2 border-dashed py-8 text-center cursor-pointer mb-4 transition-all ${
                isDark ? 'border-[#333] hover:border-teal-500/40' : 'border-gray-300 hover:border-teal-400'
              }`} onClick={() => fileRef.current?.click()}>
                <Upload size={28} className="mx-auto mb-2 text-gray-500" />
                <p className="text-xs text-gray-500">กดเพื่ออัปโหลดรูป template</p>
                <p className="text-[9px] text-gray-600 mt-1">รองรับ JPG, PNG</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

              {/* Custom templates list */}
              {customTemplates.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {customTemplates.map((tmpl, idx) => (
                    <div key={tmpl.id} className="relative group">
                      <button onClick={() => { onSelect({ ...tmpl, imageUrl: tmpl.imageUrl }); onClose(); }}
                        className={`w-full rounded-lg border overflow-hidden transition-all hover:scale-[1.03] ${
                          isDark ? 'border-[#333] bg-[#111]' : 'border-gray-200 bg-gray-50'
                        }`}>
                        <div className={`aspect-[3/4] flex items-center justify-center p-1 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                          <img src={tmpl.imageUrl} alt={tmpl.name} className="w-full h-full object-contain" />
                        </div>
                        <div className={`px-2 py-1.5 text-center border-t ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
                          <span className="text-[10px] font-bold">{tmpl.name}</span>
                        </div>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteCustomTemplate(idx); }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {customTemplates.length === 0 && (
                <p className="text-center text-[10px] text-gray-600 mt-2">ยังไม่มี template ที่อัปโหลด</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
