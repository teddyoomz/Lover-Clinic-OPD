import { useState, useEffect, useRef } from 'react';
import { X, FileImage, Download, Upload, Loader2, Plus, Trash2, GripVertical, Pencil, Check, Image as ImageIcon } from 'lucide-react';
import { chartTemplates, chartCategories } from '../data/chartTemplates.js';
import * as broker from '../lib/brokerClient.js';

export default function ChartTemplateSelector({ isOpen, onClose, onSelect, isDark, db, appId }) {
  const [source, setSource] = useState('local'); // local | proclinic | upload
  const [category, setCategory] = useState('all');
  const [pcTemplates, setPcTemplates] = useState([]);
  const [pcBlobUrls, setPcBlobUrls] = useState({}); // id -> blob URL for thumbnails
  const [pcLoading, setPcLoading] = useState(false);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [editingName, setEditingName] = useState(null); // idx being renamed
  const [nameInput, setNameInput] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const fileRef = useRef(null);
  const localFileRef = useRef(null);

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

  const saveCustomToFirestore = (updated) => {
    setCustomTemplates(updated);
    if (db && appId) {
      import('firebase/firestore').then(({ setDoc, doc }) => {
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pc_chart_templates', 'custom'), {
          templates: JSON.stringify(updated), updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      });
    }
  };

  // Load ProClinic templates + proxy thumbnails
  const loadPcTemplates = async () => {
    if (pcTemplates.length > 0) return;
    setPcLoading(true);
    try {
      const data = await broker.getChartTemplates();
      if (data.success && data.templates?.length) {
        setPcTemplates(data.templates);
        // Proxy all thumbnails in parallel
        const token = await broker.getCachedIdToken();
        const blobMap = {};
        await Promise.all(data.templates.map(async (tmpl) => {
          if (!tmpl.imageUrl?.includes('proclinicth.com')) return;
          try {
            const res = await fetch('/api/proclinic/treatment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ action: 'proxyImage', url: tmpl.imageUrl }),
            });
            if (res.ok) {
              const blob = await res.blob();
              blobMap[tmpl.id] = URL.createObjectURL(blob);
            }
          } catch (_) {}
        }));
        setPcBlobUrls(blobMap);
      }
    } catch (_) {}
    setPcLoading(false);
  };

  // Handle file upload (for both "upload" tab and "local" tab management)
  const handleFileUpload = (e, addToLocal) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const name = file.name.replace(/\.[^.]+$/, '');
      if (addToLocal) {
        // Add to custom templates managed in "ของเรา" tab
        const updated = [...customTemplates, { id: `custom-${Date.now()}`, name, imageUrl: dataUrl, isCustom: true }];
        saveCustomToFirestore(updated);
      } else {
        // Direct select for drawing
        onSelect({ id: `upload-${Date.now()}`, name, imageUrl: dataUrl });
        onClose();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const deleteCustomTemplate = (idx) => saveCustomToFirestore(customTemplates.filter((_, i) => i !== idx));

  const renameCustomTemplate = (idx) => {
    if (!nameInput.trim()) return;
    const updated = customTemplates.map((t, i) => i === idx ? { ...t, name: nameInput.trim() } : t);
    saveCustomToFirestore(updated);
    setEditingName(null);
  };

  const moveTemplate = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= customTemplates.length) return;
    const updated = [...customTemplates];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    saveCustomToFirestore(updated);
  };

  if (!isOpen) return null;

  // Merge built-in SVGs + custom uploads for "ของเรา" tab
  const allLocalTemplates = [...chartTemplates, ...customTemplates];
  const localFiltered = category === 'all' ? allLocalTemplates : allLocalTemplates.filter(t => t.category === category || (t.isCustom && category === 'other'));

  const sourceTabs = [
    { id: 'local', label: 'ของเรา', icon: FileImage },
    { id: 'proclinic', label: 'ProClinic', icon: Download },
    { id: 'upload', label: 'อัปโหลด', icon: Upload },
  ];

  const cardCls = `rounded-lg border overflow-hidden transition-all hover:scale-[1.02] ${isDark ? 'border-[#333] bg-[#111] hover:border-teal-500/50' : 'border-gray-200 bg-gray-50 hover:border-teal-400'}`;

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
                source === tab.id ? 'bg-teal-500 text-white' : isDark ? 'bg-[#1a1a1a] text-gray-400 hover:bg-[#222]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              <tab.icon size={11} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Category filter (local only) */}
        {source === 'local' && (
          <div className={`flex items-center gap-1 px-4 py-2 border-b overflow-x-auto ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
            {chartCategories.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`text-[9px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-all ${
                  category === cat.id ? 'bg-gray-600 text-white' : isDark ? 'bg-[#1a1a1a] text-gray-500' : 'bg-gray-50 text-gray-400'
                }`}>
                {cat.name}
              </button>
            ))}
            <button onClick={() => localFileRef.current?.click()}
              className="ml-auto text-[9px] font-bold px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 flex items-center gap-1">
              <Plus size={10} /> เพิ่ม
            </button>
            <input ref={localFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, true)} />
          </div>
        )}

        {/* Template grid */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* ── Local templates ── */}
          {source === 'local' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {localFiltered.map((tmpl, idx) => {
                const isCustom = tmpl.isCustom;
                const customIdx = isCustom ? customTemplates.findIndex(t => t.id === tmpl.id) : -1;
                return (
                  <div key={tmpl.id} className="relative group">
                    <button onClick={() => { onSelect(tmpl); onClose(); }} className={`w-full ${cardCls}`}>
                      <div className={`aspect-[3/4] flex items-center justify-center p-2 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                        {tmpl.imageUrl ? (
                          <img src={tmpl.imageUrl} alt={tmpl.name} className="w-full h-full object-contain opacity-70" />
                        ) : (
                          <FileImage size={32} className="text-gray-500" />
                        )}
                      </div>
                      <div className={`px-2 py-1.5 text-center border-t ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
                        {editingName === customIdx && isCustom ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameCustomTemplate(customIdx)}
                              className="text-[10px] font-bold bg-transparent border-b border-teal-500 outline-none w-full text-center" autoFocus />
                            <button onClick={() => renameCustomTemplate(customIdx)} className="text-teal-500"><Check size={12} /></button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold">{tmpl.name}</span>
                        )}
                      </div>
                    </button>
                    {/* Custom template controls */}
                    {isCustom && customIdx >= 0 && editingName !== customIdx && (
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); setEditingName(customIdx); setNameInput(tmpl.name); }}
                          className="p-1 bg-blue-500 text-white rounded-full shadow" title="เปลี่ยนชื่อ"><Pencil size={9} /></button>
                        <button onClick={e => { e.stopPropagation(); moveTemplate(customIdx, customIdx - 1); }}
                          className="p-1 bg-gray-600 text-white rounded-full shadow" title="เลื่อนขึ้น">&#9650;</button>
                        <button onClick={e => { e.stopPropagation(); moveTemplate(customIdx, customIdx + 1); }}
                          className="p-1 bg-gray-600 text-white rounded-full shadow" title="เลื่อนลง">&#9660;</button>
                        <button onClick={e => { e.stopPropagation(); deleteCustomTemplate(customIdx); }}
                          className="p-1 bg-red-500 text-white rounded-full shadow" title="ลบ"><X size={9} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
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
                    onSelect({ ...tmpl, imageUrl: pcBlobUrls[tmpl.id] || tmpl.imageUrl, isProClinic: true });
                    onClose();
                  }} className={cardCls}>
                    <div className={`aspect-[3/4] flex items-center justify-center p-1 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                      {pcBlobUrls[tmpl.id] ? (
                        <img src={pcBlobUrls[tmpl.id]} alt={tmpl.name} className="w-full h-full object-contain" />
                      ) : (
                        <ImageIcon size={32} className="text-gray-500" />
                      )}
                    </div>
                    <div className={`px-2 py-1.5 text-center border-t ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
                      <span className="text-[10px] font-bold">{tmpl.name || 'ProClinic'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Upload tab ── */}
          {source === 'upload' && (
            <div>
              <div className={`rounded-lg border-2 border-dashed py-8 text-center cursor-pointer mb-4 transition-all ${
                isDark ? 'border-[#333] hover:border-teal-500/40' : 'border-gray-300 hover:border-teal-400'
              }`} onClick={() => fileRef.current?.click()}>
                <Upload size={28} className="mx-auto mb-2 text-gray-500" />
                <p className="text-xs text-gray-500">กดเพื่ออัปโหลดรูปแล้ววาดทันที</p>
                <p className="text-[9px] text-gray-600 mt-1">JPG, PNG — ไม่ save เป็น template</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, false)} />
              <p className="text-[10px] text-gray-500 text-center">ถ้าต้องการ save เป็น template ให้ใช้ปุ่ม "เพิ่ม" ใน tab "ของเรา"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
