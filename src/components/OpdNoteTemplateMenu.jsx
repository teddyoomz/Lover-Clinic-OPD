// OpdNoteTemplateMenu (2026-07-05) — "template จดประวัติ" pill + dropdown in the
// OPD Card SectionHeader of TFP. Clean boundary: knows nothing about TFP state —
// communicates only via onInsert(content).
// Spec: docs/superpowers/specs/2026-07-05-opd-note-templates-design.html
// - Built-in mandatory templates come from MANDATORY_OPD_NOTE_TEMPLATES (never
//   editable/deletable); branch templates load lazily from be_opd_note_templates.
// - Pre-rules-deploy the branch list read is permission-denied → loadErr row +
//   built-ins stay fully usable (feature degrades, never blocks).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Pencil, Trash2, Plus, X } from 'lucide-react';
import { listOpdNoteTemplates, saveOpdNoteTemplate, deleteOpdNoteTemplate } from '../lib/scopedDataLayer.js';
import {
  MANDATORY_OPD_NOTE_TEMPLATES, validateOpdNoteTemplate, mintOpdNoteTemplateId,
} from '../lib/opdNoteTemplateValidation.js';
import { useEscToClose } from '../lib/useEscToClose.js';

// AV78 modal — backdrop click does NOT close; explicit close only (X / ยกเลิก / ESC via LIFO stack)
function TemplateEditorModal({ isDark, template, onSaved, onClose }) {
  const [name, setName] = useState(template?.name || '');
  const [content, setContent] = useState(template?.content || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEscToClose(onClose);

  const inputCls = `w-full rounded-lg px-3 py-2 text-sm outline-none border transition-all ${isDark ? 'bg-[#111] border-[#222] text-gray-200 focus:border-purple-500' : 'bg-white border-gray-200 text-gray-800 focus:border-purple-400'}`;
  const labelCls = 'text-xs font-semibold text-gray-500 mb-1 block';

  const handleSave = async () => {
    const fail = validateOpdNoteTemplate({ name, content });
    if (fail) { setErr(fail[1]); return; }
    setSaving(true); setErr('');
    try {
      const id = template?.id || mintOpdNoteTemplateId();
      await saveOpdNoteTemplate(id, {
        name,
        content,
        // edit: preserve original stamps + branch; create: undefined →
        // _resolveBranchIdForWrite fills the selected branch in Layer 1.
        createdAt: template?.createdAt,
        createdBy: template?.createdBy,
        branchId: template?.branchId,
      });
      onSaved();
    } catch (e) {
      setErr(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" data-testid="opd-template-editor">
      {/* AV78 (2026-07-05): backdrop has NO onClick — explicit close only (X / ยกเลิก / ESC) */}
      <div className="absolute inset-0 bg-black/60" data-testid="opd-template-editor-backdrop" />
      <div className={`relative w-full max-w-md rounded-2xl border p-5 shadow-2xl ${isDark ? 'bg-[#0a0a0a] border-[#2a2a2a]' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <span className={`text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
            {template ? 'แก้ไข template' : 'สร้าง template ใหม่'}
          </span>
          <button type="button" onClick={onClose} aria-label="ปิด" data-testid="opd-template-editor-close"
            className={`p-1 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}>
            <X size={16} />
          </button>
        </div>
        <label className={labelCls}>ชื่อ template *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          className={`${inputCls} mb-3`} data-field="opdt-name" placeholder="เช่น ปรึกษาผมร่วง" />
        <label className={labelCls}>เนื้อหา (จะถูกเติมเข้าช่อง CC) *</label>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={8}
          className={`${inputCls} resize-y font-mono text-xs mb-2`} data-field="opdt-content"
          placeholder={'หัวข้อ\n-รายการ : ____'} />
        {err && <div className="text-xs font-bold text-red-400 mb-2" data-testid="opd-template-editor-error">{err}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} data-testid="opd-template-editor-cancel"
            className={`text-xs font-bold px-4 py-2 rounded-lg border transition-colors ${isDark ? 'text-gray-300 border-[#333] hover:bg-[#1a1a1a]' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            ยกเลิก
          </button>
          <button type="button" onClick={handleSave} disabled={saving} data-testid="opd-template-editor-save"
            className="text-xs font-bold px-4 py-2 rounded-lg text-white bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 transition-colors">
            {saving ? 'กำลังบันทึก…' : 'บันทึก template'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OpdNoteTemplateMenu({ isDark, onInsert }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [editor, setEditor] = useState(null); // null | {mode:'create'} | {mode:'edit', template}
  const rootRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true); setLoadErr(false);
    try {
      setItems(await listOpdNoteTemplates());
    } catch {
      // pre-rules-deploy → permission-denied → built-ins stay usable
      setLoadErr(true);
      setItems([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) refresh(); // lazy: first open only
  };

  // Dropdown menu (NOT a modal) — closes on outside click, standard dropdown UX.
  // AV78 governs modals only; the editor modal above follows AV78.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handlePick = (t) => {
    onInsert?.(t.content);
    setOpen(false);
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`ลบ template "${t.name}" ?`)) return;
    try {
      await deleteOpdNoteTemplate(t.id);
      await refresh();
    } catch (e) {
      window.alert(e?.message || 'ลบไม่สำเร็จ');
    }
  };

  const rowCls = `w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${isDark ? 'text-gray-200 hover:bg-[#1c1c1c] border-b border-[#222]' : 'text-gray-700 hover:bg-gray-50 border-b border-gray-100'}`;

  return (
    <div ref={rootRef} className="relative ml-auto" data-testid="opd-template-menu">
      <button type="button" onClick={toggleOpen} data-testid="opd-template-trigger"
        className="text-[11px] font-bold px-2 py-1 rounded-lg border transition-all flex items-center gap-1"
        style={{
          color: isDark ? '#a78bfa' : '#7c3aed',
          borderColor: isDark ? '#a78bfa40' : '#7c3aed40',
          background: isDark ? '#a78bfa0a' : '#7c3aed0a',
        }}>
        <FileText size={12} />
        template จดประวัติ {open ? '▴' : '▾'}
      </button>

      {open && (
        <div data-testid="opd-template-list"
          className={`absolute right-0 top-full mt-1 z-30 min-w-[250px] max-w-[320px] rounded-xl border shadow-2xl overflow-hidden ${isDark ? 'bg-[#111] border-[#333]' : 'bg-white border-gray-200'}`}>
          {MANDATORY_OPD_NOTE_TEMPLATES.map(t => (
            <button key={t.id} type="button" onClick={() => handlePick(t)} className={rowCls}
              data-testid={`opd-template-item-${t.id}`}>
              <span className="truncate">{t.name}</span>
              <span className={`shrink-0 text-[9px] font-bold rounded-md px-1.5 py-0.5 border ${isDark ? 'text-amber-400 border-amber-400/25' : 'text-amber-600 border-amber-600/30'}`}>
                บังคับ
              </span>
            </button>
          ))}

          {loading && (
            <div className={`px-3 py-2 text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>กำลังโหลด…</div>
          )}
          {!loading && items.map(t => (
            <div key={t.id} className={rowCls} role="button" tabIndex={0}
              data-testid={`opd-template-item-${t.id}`}
              onClick={() => handlePick(t)}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePick(t); }}>
              <span className="truncate">{t.name}</span>
              <span className="shrink-0 flex items-center gap-1">
                <button type="button" aria-label={`แก้ไข ${t.name}`} data-testid={`opd-template-edit-${t.id}`}
                  onClick={(e) => { e.stopPropagation(); setEditor({ mode: 'edit', template: t }); setOpen(false); }}
                  className={`p-1 rounded transition-colors ${isDark ? 'text-gray-500 hover:text-purple-300' : 'text-gray-400 hover:text-purple-600'}`}>
                  <Pencil size={11} />
                </button>
                <button type="button" aria-label={`ลบ ${t.name}`} data-testid={`opd-template-delete-${t.id}`}
                  onClick={(e) => { e.stopPropagation(); handleDelete(t); }}
                  className={`p-1 rounded transition-colors ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>
                  <Trash2 size={11} />
                </button>
              </span>
            </div>
          ))}
          {!loading && loadErr && (
            <div className={`px-3 py-2 text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`} data-testid="opd-template-load-error">
              โหลด template สาขาไม่สำเร็จ
            </div>
          )}

          <button type="button" data-testid="opd-template-create"
            onClick={() => { setEditor({ mode: 'create' }); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors flex items-center gap-1.5 ${isDark ? 'text-green-400 hover:bg-[#1c1c1c]' : 'text-green-600 hover:bg-green-50'}`}>
            <Plus size={12} /> สร้าง template ใหม่…
          </button>
        </div>
      )}

      {editor && (
        <TemplateEditorModal isDark={isDark} template={editor.template || null}
          onSaved={async () => { setEditor(null); await refresh(); }}
          onClose={() => setEditor(null)} />
      )}
    </div>
  );
}
