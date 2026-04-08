import { useState, useEffect, useRef } from 'react';
import { X, FileImage, Download, Upload, Loader2, Plus, Pencil, Check, ArrowUp, ArrowDown, Trash2, Image as ImageIcon } from 'lucide-react';
import { defaultChartTemplates, chartCategories } from '../data/chartTemplates.js';
import * as broker from '../lib/brokerClient.js';

const FIRESTORE_DOC = 'pc_chart_templates';

export default function ChartTemplateSelector({ isOpen, onClose, onSelect, isDark, db, appId }) {
  const [source, setSource] = useState('local');
  const [category, setCategory] = useState('all');
  const [templates, setTemplates] = useState([]); // managed templates (Firestore)
  const [loaded, setLoaded] = useState(false);
  const [pcTemplates, setPcTemplates] = useState([]);
  const [pcBlobUrls, setPcBlobUrls] = useState({});
  const [pcLoading, setPcLoading] = useState(false);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [nameInput, setNameInput] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const fileRef = useRef(null);
  const uploadRef = useRef(null);

  // Load managed templates from Firestore (seed from defaults if empty)
  useEffect(() => {
    if (!isOpen || !db || !appId || loaded) return;
    import('firebase/firestore').then(({ getDoc, doc }) => {
      getDoc(doc(db, 'artifacts', appId, 'public', 'data', FIRESTORE_DOC, 'managed'))
        .then(snap => {
          if (snap.exists() && snap.data().templates) {
            try {
              const saved = JSON.parse(snap.data().templates);
              if (saved.length > 0) { setTemplates(saved); setLoaded(true); return; }
            } catch (_) {}
          }
          // Seed from defaults
          setTemplates([...defaultChartTemplates]);
          setLoaded(true);
          saveToFirestore([...defaultChartTemplates]);
        }).catch(() => { setTemplates([...defaultChartTemplates]); setLoaded(true); });
    });
  }, [isOpen, db, appId]);

  const saveToFirestore = (list) => {
    if (!db || !appId) return;
    import('firebase/firestore').then(({ setDoc, doc }) => {
      setDoc(doc(db, 'artifacts', appId, 'public', 'data', FIRESTORE_DOC, 'managed'), {
        templates: JSON.stringify(list), updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    });
  };

  const updateTemplates = (newList) => { setTemplates(newList); saveToFirestore(newList); };

  const addTemplate = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const name = file.name.replace(/\.[^.]+$/, '');
      const entry = { id: `custom-${Date.now()}`, name, category: 'other', imageUrl: reader.result };
      const updated = [...templates, entry];
      updateTemplates(updated);
    };
    reader.readAsDataURL(file);
  };

  const deleteTemplate = (idx) => updateTemplates(templates.filter((_, i) => i !== idx));

  const renameTemplate = (idx) => {
    if (!nameInput.trim()) return;
    updateTemplates(templates.map((t, i) => i === idx ? { ...t, name: nameInput.trim() } : t));
    setEditingIdx(-1);
  };

  const setCategoryForTemplate = (idx) => {
    if (!editCategory) return;
    updateTemplates(templates.map((t, i) => i === idx ? { ...t, category: editCategory } : t));
    setEditingIdx(-1);
  };

  const moveTemplate = (idx, dir) => {
    const to = idx + dir;
    if (to < 0 || to >= templates.length) return;
    const updated = [...templates];
    [updated[idx], updated[to]] = [updated[to], updated[idx]];
    updateTemplates(updated);
  };

  // ProClinic templates
  const loadPcTemplates = async () => {
    if (pcTemplates.length > 0) return;
    setPcLoading(true);
    try {
      const data = await broker.getChartTemplates();
      if (data.success && data.templates?.length) {
        setPcTemplates(data.templates);
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
            if (res.ok) { blobMap[tmpl.id] = URL.createObjectURL(await res.blob()); }
          } catch (_) {}
        }));
        setPcBlobUrls(blobMap);
      }
    } catch (_) {}
    setPcLoading(false);
  };

  if (!isOpen) return null;

  const filtered = category === 'all' ? templates : templates.filter(t => t.category === category);

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
          {[
            { id: 'local', label: 'ของเรา', icon: FileImage },
            { id: 'proclinic', label: 'ProClinic', icon: Download },
            { id: 'upload', label: 'อัปโหลด', icon: Upload },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setSource(tab.id); if (tab.id === 'proclinic') loadPcTemplates(); }}
              className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition-all ${
                source === tab.id ? 'bg-teal-500 text-white' : isDark ? 'bg-[#1a1a1a] text-gray-400 hover:bg-[#222]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              <tab.icon size={11} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Category filter + add button (local) */}
        {source === 'local' && (
          <div className={`flex items-center gap-1 px-4 py-2 border-b overflow-x-auto ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
            {chartCategories.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                  category === cat.id ? 'bg-gray-600 text-white' : isDark ? 'bg-[#1a1a1a] text-gray-500' : 'bg-gray-50 text-gray-400'
                }`}>{cat.name}</button>
            ))}
            <button onClick={() => fileRef.current?.click()}
              className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 flex items-center gap-1 shrink-0">
              <Plus size={10} /> เพิ่ม
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) addTemplate(e.target.files[0]); e.target.value = ''; }} />
          </div>
        )}

        {/* Grid */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* ── ของเรา ── */}
          {source === 'local' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((tmpl) => {
                const realIdx = templates.indexOf(tmpl);
                const isEditing = editingIdx === realIdx;
                return (
                  <div key={tmpl.id + realIdx} className="relative group">
                    <button onClick={() => { if (!isEditing) { onSelect(tmpl); onClose(); } }} className={`w-full ${cardCls}`}>
                      <div className={`aspect-[3/4] flex items-center justify-center p-2 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                        {tmpl.imageUrl ? <img src={tmpl.imageUrl} alt={tmpl.name} className="w-full h-full object-contain opacity-70" /> : <FileImage size={32} className="text-gray-500" />}
                      </div>
                      <div className={`px-2 py-1.5 text-center border-t ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
                        {isEditing ? (
                          <div className="space-y-1" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameTemplate(realIdx)}
                                className={`text-xs font-bold bg-transparent border-b outline-none w-full text-center ${isDark ? 'border-teal-500 text-gray-200' : 'border-teal-500'}`} autoFocus />
                              <button onClick={() => renameTemplate(realIdx)} className="text-teal-500 shrink-0"><Check size={12} /></button>
                            </div>
                            <select value={editCategory} onChange={e => { setEditCategory(e.target.value); updateTemplates(templates.map((t, i) => i === realIdx ? { ...t, category: e.target.value } : t)); }}
                              className={`text-[11px] w-full rounded px-1 py-0.5 ${isDark ? 'bg-[#222] text-gray-300 border-[#333]' : 'bg-gray-100'}`}>
                              {chartCategories.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        ) : (
                          <span className="text-xs font-bold">{tmpl.name}</span>
                        )}
                      </div>
                    </button>
                    {/* Controls */}
                    {!isEditing && (
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); setEditingIdx(realIdx); setNameInput(tmpl.name); setEditCategory(tmpl.category || 'other'); }}
                          className="p-1 bg-blue-500 text-white rounded-full shadow" title="แก้ไข"><Pencil size={9} /></button>
                        <button onClick={e => { e.stopPropagation(); moveTemplate(realIdx, -1); }}
                          className="p-1 bg-gray-600 text-white rounded-full shadow" title="เลื่อนขึ้น"><ArrowUp size={9} /></button>
                        <button onClick={e => { e.stopPropagation(); moveTemplate(realIdx, 1); }}
                          className="p-1 bg-gray-600 text-white rounded-full shadow" title="เลื่อนลง"><ArrowDown size={9} /></button>
                        <button onClick={e => { e.stopPropagation(); deleteTemplate(realIdx); }}
                          className="p-1 bg-red-500 text-white rounded-full shadow" title="ลบ"><X size={9} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── ProClinic ── */}
          {source === 'proclinic' && (
            pcLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-teal-500 mr-2" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
            ) : pcTemplates.length === 0 ? (
              <p className="text-center text-xs text-gray-500 py-12">ไม่พบ template</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pcTemplates.map(tmpl => (
                  <button key={tmpl.id} onClick={() => { onSelect({ ...tmpl, imageUrl: pcBlobUrls[tmpl.id] || tmpl.imageUrl, isProClinic: true }); onClose(); }} className={cardCls}>
                    <div className={`aspect-[3/4] flex items-center justify-center p-1 ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                      {pcBlobUrls[tmpl.id] ? <img src={pcBlobUrls[tmpl.id]} alt={tmpl.name} className="w-full h-full object-contain" /> : <ImageIcon size={32} className="text-gray-500" />}
                    </div>
                    <div className={`px-2 py-1.5 text-center border-t ${isDark ? 'border-[#222]' : 'border-gray-100'}`}>
                      <span className="text-xs font-bold">{tmpl.name || 'ProClinic'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── อัปโหลด ── */}
          {source === 'upload' && (
            <div>
              <div className={`rounded-lg border-2 border-dashed py-8 text-center cursor-pointer transition-all ${isDark ? 'border-[#333] hover:border-teal-500/40' : 'border-gray-300 hover:border-teal-400'}`}
                onClick={() => uploadRef.current?.click()}>
                <Upload size={28} className="mx-auto mb-2 text-gray-500" />
                <p className="text-xs text-gray-500">อัปโหลดรูปแล้ววาดทันที</p>
                <p className="text-[11px] text-gray-600 mt-1">JPG, PNG</p>
              </div>
              <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={e => {
                if (e.target.files?.[0]) {
                  const reader = new FileReader();
                  reader.onload = () => { onSelect({ id: `upload-${Date.now()}`, name: 'อัปโหลด', imageUrl: reader.result }); onClose(); };
                  reader.readAsDataURL(e.target.files[0]);
                }
                e.target.value = '';
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
