import { useState, useEffect } from 'react';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Save, PlusCircle, Edit3, Trash2, X, Plus, LayoutTemplate, Type, AlignLeft, CircleDot, CheckSquare } from 'lucide-react';

export default function CustomFormBuilder({ db, appId, user, onBack }) {
  const [templates, setTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'form_templates');
    const unsub = onSnapshot(q, snap => {
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [db, appId]);

  const handleCreateNew = () => {
    setEditingTemplate({
      title: 'แบบฟอร์มใหม่',
      description: 'คำอธิบายแบบฟอร์ม',
      questions: [
        { id: `q_${Date.now()}`, type: 'text', label: 'คำถามแรกของคุณ', options: [], required: false }
      ]
    });
  };

  const handleSave = async () => {
    if (!editingTemplate.title.trim()) return alert("กรุณาตั้งชื่อแบบฟอร์ม");
    try {
      if (editingTemplate.id) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'form_templates', editingTemplate.id), {
          ...editingTemplate, updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'form_templates'), {
          ...editingTemplate, createdAt: serverTimestamp(), createdBy: user.uid
        });
      }
      setEditingTemplate(null);
    } catch (e) {
      console.error(e);
      alert("ไม่สามารถบันทึกแบบฟอร์มได้");
    }
  };

  const deleteTemplate = async (id) => {
    if(!window.confirm("ยืนยันการลบแบบฟอร์มนี้?")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'form_templates', id));
  };

  const addQuestion = (type) => {
    setEditingTemplate(prev => ({
      ...prev,
      questions: [...prev.questions, {
        id: `q_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        type,
        label: type === 'text' ? 'คำถามสั้นๆ' : type === 'textarea' ? 'คำถามแบบยาว' : 'คำถามแบบเลือกตอบ',
        options: type === 'radio' || type === 'checkbox' ? ['ตัวเลือก 1', 'ตัวเลือก 2'] : [],
        required: false
      }]
    }));
  };

  const updateQuestion = (qId, field, value) => {
    setEditingTemplate(prev => ({
      ...prev,
      questions: prev.questions.map(q => q.id === qId ? { ...q, [field]: value } : q)
    }));
  };

  const removeQuestion = (qId) => {
    setEditingTemplate(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== qId)
    }));
  };

  if (editingTemplate) {
    return (
      <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)] animate-in fade-in">
        <div className="flex items-center justify-between mb-6 border-b border-[var(--bd)] pb-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setEditingTemplate(null)} className="p-2 bg-[var(--bg-hover)] hover:bg-[var(--bg-base)] rounded-lg border border-[var(--bd-strong)] transition-colors text-[var(--tx-muted)] hover:text-[var(--tx-heading)]"><ArrowLeft size={20}/></button>
            <h2 className="text-lg sm:text-xl font-black text-[var(--tx-heading)] uppercase tracking-widest">{editingTemplate.id ? 'แก้ไขแบบฟอร์ม' : 'สร้างแบบฟอร์มใหม่'}</h2>
          </div>
          <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-colors text-sm"><Save size={18}/> บันทึก</button>
        </div>

        <div className="space-y-6">
          <div className="bg-[var(--bg-hover)] p-4 sm:p-5 rounded-xl border border-[var(--bd-strong)]">
            <input type="text" value={editingTemplate.title} onChange={e => setEditingTemplate(prev => ({...prev, title: e.target.value}))} placeholder="ชื่อแบบฟอร์ม" className="w-full bg-transparent text-xl sm:text-2xl font-black text-[var(--tx-heading)] outline-none mb-2 placeholder-gray-500 border-b border-[var(--bd-strong)] pb-2 focus:border-blue-500"/>
            <input type="text" value={editingTemplate.description} onChange={e => setEditingTemplate(prev => ({...prev, description: e.target.value}))} placeholder="คำอธิบายแบบฟอร์ม (ถ้ามี)" className="w-full bg-transparent text-sm text-[var(--tx-muted)] outline-none placeholder-gray-500"/>
          </div>

          {editingTemplate.questions.map((q, i) => (
            <div key={q.id} className="bg-[var(--bg-hover)] p-4 sm:p-5 rounded-xl border border-l-4 border-l-blue-600 border-[var(--bd-strong)] relative group">
              <button onClick={() => removeQuestion(q.id)} className="absolute top-4 right-4 text-gray-500 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>

              <div className="flex items-center gap-3 mb-4 pr-8">
                <span className="text-gray-500 font-black">{i+1}.</span>
                <input type="text" value={q.label} onChange={e => updateQuestion(q.id, 'label', e.target.value)} placeholder="พิมพ์คำถามของคุณที่นี่..." className="flex-1 bg-transparent text-[var(--tx-heading)] font-bold outline-none border-b border-dashed border-[var(--bd-strong)] focus:border-blue-500 pb-1"/>
              </div>

              {q.type === 'text' && <div className="text-gray-500 text-sm italic border-b border-[var(--bd-strong)] pb-2 w-1/2">ข้อความสั้นๆ...</div>}
              {q.type === 'textarea' && <div className="text-gray-500 text-sm italic border border-[var(--bd-strong)] p-4 rounded bg-[var(--bg-card)] h-20">ย่อหน้าข้อความ...</div>}
              {(q.type === 'radio' || q.type === 'checkbox') && (
                <div className="space-y-2 ml-6">
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-3">
                      {q.type === 'radio' ? <CircleDot size={16} className="text-gray-500"/> : <CheckSquare size={16} className="text-gray-500"/>}
                      <input type="text" value={opt} onChange={e => {
                        const newOpts = [...q.options];
                        newOpts[oIdx] = e.target.value;
                        updateQuestion(q.id, 'options', newOpts);
                      }} className="bg-transparent text-[var(--tx-body)] outline-none border-b border-transparent focus:border-[var(--bd-strong)]"/>
                      <button onClick={() => {
                        const newOpts = q.options.filter((_, idx) => idx !== oIdx);
                        updateQuestion(q.id, 'options', newOpts);
                      }} className="text-gray-500 hover:text-red-500"><X size={14}/></button>
                    </div>
                  ))}
                  <button onClick={() => updateQuestion(q.id, 'options', [...q.options, `ตัวเลือก ${q.options.length + 1}`])} className="text-blue-500 text-sm font-bold flex items-center gap-1 mt-2 hover:text-blue-400"><Plus size={14}/> เพิ่มตัวเลือก</button>
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-3 pt-4 justify-center bg-[var(--bg-hover)] p-4 rounded-xl border border-[var(--bd)] border-dashed">
            <span className="w-full text-center text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">เพิ่มคำถามใหม่</span>
            <button onClick={() => addQuestion('text')} className="bg-[var(--bg-card)] hover:bg-[var(--bg-base)] text-[var(--tx-body)] px-4 py-2 rounded border border-[var(--bd-strong)] text-sm flex items-center gap-2"><Type size={16}/> ข้อความสั้น</button>
            <button onClick={() => addQuestion('textarea')} className="bg-[var(--bg-card)] hover:bg-[var(--bg-base)] text-[var(--tx-body)] px-4 py-2 rounded border border-[var(--bd-strong)] text-sm flex items-center gap-2"><AlignLeft size={16}/> ย่อหน้า</button>
            <button onClick={() => addQuestion('radio')} className="bg-[var(--bg-card)] hover:bg-[var(--bg-base)] text-[var(--tx-body)] px-4 py-2 rounded border border-[var(--bd-strong)] text-sm flex items-center gap-2"><CircleDot size={16}/> เลือกข้อเดียว</button>
            <button onClick={() => addQuestion('checkbox')} className="bg-[var(--bg-card)] hover:bg-[var(--bg-base)] text-[var(--tx-body)] px-4 py-2 rounded border border-[var(--bd-strong)] text-sm flex items-center gap-2"><CheckSquare size={16}/> เลือกหลายข้อ</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-card)] p-4 sm:p-6 rounded-2xl border border-[var(--bd)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-[var(--tx-heading)] uppercase tracking-widest flex items-center gap-3"><LayoutTemplate className="text-blue-500"/> จัดการแบบฟอร์ม</h2>
          <p className="text-gray-500 text-sm mt-1">สร้างและแก้ไขเทมเพลตแบบสอบถามของคุณเอง</p>
        </div>
        <button onClick={handleCreateNew} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20 shrink-0 text-sm"><PlusCircle size={18}/> สร้างฟอร์มใหม่</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(tpl => (
          <div key={tpl.id} className="bg-[var(--bg-hover)] p-5 rounded-xl border border-[var(--bd-strong)] hover:border-blue-500/50 transition-all group relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
            <h3 className="text-lg font-black text-[var(--tx-heading)] mb-1 truncate pr-8">{tpl.title}</h3>
            <p className="text-sm text-gray-500 mb-4 truncate">{tpl.description}</p>
            <div className="text-xs text-[var(--tx-muted)] font-mono mb-4">{tpl.questions?.length || 0} คำถาม</div>
            <div className="flex gap-2">
              <button onClick={() => setEditingTemplate(tpl)} className="flex-1 bg-[var(--bg-card)] hover:bg-[var(--bg-base)] text-[var(--tx-heading)] py-2 rounded border border-[var(--bd-strong)] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"><Edit3 size={14}/> แก้ไข</button>
              <button onClick={() => deleteTemplate(tpl.id)} className="px-3 bg-red-950/30 hover:bg-red-900/50 text-red-500 rounded border border-red-900/50 transition-colors"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500 border border-dashed border-[var(--bd-strong)] rounded-xl">
            <LayoutTemplate size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-bold tracking-widest uppercase">ยังไม่มีแบบฟอร์มในระบบ</p>
          </div>
        )}
      </div>
    </div>
  );
}
