import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, FileImage, Upload, Plus, Pencil, Check, ArrowUp, ArrowDown, Trash2, Lock, Unlock } from 'lucide-react';
import { defaultChartTemplates, chartCategories } from '../data/chartTemplates.js';
import { debugLog } from '../lib/debugLog.js';

// (2026-05-22 EOD+1) — Chart templates persistence rewrite.
//   User report: "อัพรูปผ่าน Modal เพิ่ม chart แล้วอยู่ไม่ถาวร — เปิด TFP
//   ใหม่ ก็หาย". Two compounded bugs in the pre-rewrite version:
//   (A) PATH MISMATCH: component wrote to `pc_chart_templates` but
//       firestore.rules only had `match /chart_templates/{docId}` (no `pc_`
//       prefix) → default-deny → every setDoc returned permission-denied →
//       `.catch(() => {})` swallowed silently → image only in React state.
//   (B) 1 MB DOC LIMIT: all templates stuffed into ONE doc by serialising
//       the whole array (JSON-stringified) with INLINE base64 dataURLs
//       (multi-MB each) → would have hit Firestore's 1 MB cap after the
//       first real upload.
// Rewrite (canonical Rule H — backend = OUR data, universal):
//   - Firestore: per-template DOCS in `be_chart_templates` collection
//     (each doc: {id, name, category, imageUrl, storagePath, builtIn,
//      locked, createdAt, updatedAt})
//   - Firebase Storage: image bytes at `chart-templates/{id}.{ext}` —
//     referenced by `imageUrl`. Built-ins stay as static `/chart-templates/
//     *.svg` paths shipped in `public/`.
//   - UNIVERSAL — no branchId field; one shared collection across all
//     branches (per user "ไม่ต้องเก็บแยกสาขา").
//   - LOCK: `locked: boolean` per doc. Default-locked for built-ins +
//     unlocked for user uploads. Delete button refuses on locked docs.
//   - SORT: localStorage (`lover-chart-template-order-v1`) — per-device
//     reorder; never written to Firestore so each clinician's device
//     keeps its preferred order independently.
import { db as firebaseDb } from '../firebase.js';

const SORT_KEY = 'lover-chart-template-order-v1';

function readLocalOrder() {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}

function writeLocalOrder(ids) {
  try { localStorage.setItem(SORT_KEY, JSON.stringify(ids.filter(x => typeof x === 'string'))); } catch {}
}

// Sort templates by localStorage order first, then by createdAt for
// unknown ids (newly-added templates land at the bottom).
function applyLocalOrder(templates, orderIds) {
  if (!Array.isArray(templates) || templates.length === 0) return [];
  const pos = new Map(orderIds.map((id, i) => [id, i]));
  return [...templates].sort((a, b) => {
    const ai = pos.has(a.id) ? pos.get(a.id) : Infinity;
    const bi = pos.has(b.id) ? pos.get(b.id) : Infinity;
    if (ai !== bi) return ai - bi;
    // Unknown ids: fall back to createdAt (newer last); built-ins come first
    // via their definition order which we preserve as `_seedOrder`.
    const at = a._sortFallback ?? 0;
    const bt = b._sortFallback ?? 0;
    return at - bt;
  });
}

function extFromFile(file) {
  const m = String(file?.name || '').match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
  return m ? m[1].toLowerCase() : 'png';
}

function mintTemplateId() {
  const rand = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 18);
  return `custom-${Date.now()}-${rand}`;
}

export default function ChartTemplateSelector({ isOpen, onClose, onSelect, isDark, db: dbProp, appId }) {
  // Prefer prop (existing call site) but fall back to imported singleton.
  const db = dbProp || firebaseDb;
  const [source, setSource] = useState('local');
  const [category, setCategory] = useState('all');
  const [templates, setTemplates] = useState([]); // raw list from Firestore
  const [orderIds, setOrderIds] = useState(() => readLocalOrder());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false); // upload / delete in flight
  const [editingIdx, setEditingIdx] = useState(-1);
  const [nameInput, setNameInput] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const fileRef = useRef(null);
  const uploadRef = useRef(null);

  // Subscribe to the be_chart_templates collection. On first open with an
  // empty collection, seed defaults from the static module. Built-ins are
  // seeded as `locked: true` so a stray click can't wipe them.
  useEffect(() => {
    if (!isOpen || !db || !appId) return undefined;
    let unsub = null;
    (async () => {
      const { collection, onSnapshot, query } = await import('firebase/firestore');
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'be_chart_templates');
      unsub = onSnapshot(query(colRef), async (snap) => {
        if (snap.empty && !loaded) {
          // Seed defaults exactly once
          await seedDefaults(db, appId);
          // Snapshot will re-fire with the seeded docs; just return now.
          return;
        }
        const list = [];
        snap.forEach(doc => {
          const data = doc.data();
          list.push({ ...data, id: doc.id, _sortFallback: data._seedOrder ?? (data.createdAtMs || 0) });
        });
        setTemplates(list);
        setLoaded(true);
      }, (err) => {
        debugLog('chart-template-load', 'snapshot error', err);
        // Fallback: show in-memory defaults so the user is never stuck
        setTemplates(defaultChartTemplates.map((t, i) => ({ ...t, locked: true, _sortFallback: i })));
        setLoaded(true);
      });
    })();
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [isOpen, db, appId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Defaults seed — one-shot batch write. Built-ins keep their static
  // /chart-templates/*.svg URLs (no Storage upload needed) and default to
  // locked=true. The `_seedOrder` field preserves the definition order.
  async function seedDefaults(d, app) {
    const { writeBatch, doc, serverTimestamp } = await import('firebase/firestore');
    const batch = writeBatch(d);
    defaultChartTemplates.forEach((t, i) => {
      batch.set(doc(d, 'artifacts', app, 'public', 'data', 'be_chart_templates', t.id), {
        id: t.id,
        name: t.name,
        category: t.category,
        imageUrl: t.imageUrl,
        storagePath: null,
        builtIn: true,
        locked: true,
        _seedOrder: i,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      });
    });
    try { await batch.commit(); } catch (e) { debugLog('chart-template-seed', 'seed failed', e); }
  }

  // Upload a file to Storage + create the Firestore doc. The Storage path
  // is `chart-templates/{id}.{ext}` — universal (no branch). Errors surface
  // to the user via a visible alert (no more silent swallow).
  async function addTemplate(file) {
    if (!db || !appId) return;
    setBusy(true);
    try {
      const id = mintTemplateId();
      const ext = extFromFile(file);
      const storagePath = `chart-templates/${id}.${ext}`;
      const name = String(file.name || 'อัปโหลด').replace(/\.[^.]+$/, '') || 'อัปโหลด';
      const [{ getStorage, ref, uploadBytes, getDownloadURL }, { setDoc, doc, serverTimestamp }] = await Promise.all([
        import('firebase/storage'),
        import('firebase/firestore'),
      ]);
      const storage = getStorage();
      const sref = ref(storage, storagePath);
      await uploadBytes(sref, file, { contentType: file.type || 'image/png' });
      const imageUrl = await getDownloadURL(sref);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'be_chart_templates', id), {
        id, name, category: 'other', imageUrl, storagePath,
        builtIn: false, locked: false,
        _seedOrder: 9999, // user uploads sort after built-ins by default
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      });
      // Optimistic local-order: append id so it shows at the bottom; user
      // can reorder. (Snapshot will fire too — orderIds remains stable.)
      const nextOrder = [...orderIds.filter(x => x !== id), id];
      setOrderIds(nextOrder); writeLocalOrder(nextOrder);
    } catch (e) {
      debugLog('chart-template-upload', 'upload failed', e);
      alert(`อัปโหลด template ไม่สำเร็จ: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(tmpl) {
    if (!db || !appId || !tmpl) return;
    if (tmpl.locked) {
      alert('🔒 Template นี้ถูกล็อคไว้ — กดปุ่มปลดล็อคก่อนถึงจะลบได้');
      return;
    }
    if (!window.confirm(`ยืนยันลบ Template "${tmpl.name}" ?`)) return;
    setBusy(true);
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'be_chart_templates', tmpl.id));
      if (tmpl.storagePath) {
        try {
          const { getStorage, ref, deleteObject } = await import('firebase/storage');
          await deleteObject(ref(getStorage(), tmpl.storagePath));
        } catch (e) { debugLog('chart-template-delete-storage', 'storage delete failed (doc gone OK)', e); }
      }
      const nextOrder = orderIds.filter(x => x !== tmpl.id);
      setOrderIds(nextOrder); writeLocalOrder(nextOrder);
    } catch (e) {
      debugLog('chart-template-delete', 'delete failed', e);
      alert(`ลบ Template ไม่สำเร็จ: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleLock(tmpl) {
    if (!db || !appId || !tmpl) return;
    setBusy(true);
    try {
      const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'be_chart_templates', tmpl.id), {
        locked: !tmpl.locked,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      debugLog('chart-template-lock', 'toggle lock failed', e);
      alert(`เปลี่ยนสถานะล็อคไม่สำเร็จ: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function renameTemplate(tmpl) {
    if (!nameInput.trim() || !db || !appId) return;
    setBusy(true);
    try {
      const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'be_chart_templates', tmpl.id), {
        name: nameInput.trim(), updatedAt: serverTimestamp(),
      });
      setEditingIdx(-1);
    } catch (e) { alert(`เปลี่ยนชื่อไม่สำเร็จ: ${e?.message || e}`); }
    finally { setBusy(false); }
  }

  async function setCategoryFor(tmpl, newCat) {
    if (!newCat || !db || !appId) return;
    try {
      const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'be_chart_templates', tmpl.id), {
        category: newCat, updatedAt: serverTimestamp(),
      });
    } catch (e) { debugLog('chart-template-category', 'update failed', e); }
  }

  // Move = local order only (per-device). No Firestore write — each
  // device keeps its preferred order independently.
  function moveTemplate(tmpl, dir) {
    const visible = displayed;
    const cur = visible.findIndex(t => t.id === tmpl.id);
    const to = cur + dir;
    if (to < 0 || to >= visible.length) return;
    const reordered = [...visible];
    [reordered[cur], reordered[to]] = [reordered[to], reordered[cur]];
    const newOrderIds = reordered.map(t => t.id);
    setOrderIds(newOrderIds);
    writeLocalOrder(newOrderIds);
  }

  if (!isOpen) return null;

  // Apply local order to the raw list, then filter by category
  const displayed = applyLocalOrder(templates, orderIds);
  const filtered = category === 'all' ? displayed : displayed.filter(t => t.category === category);

  const cardCls = 'rounded-lg border overflow-hidden transition-all hover:scale-[1.02] border-[var(--bd-strong)] bg-[var(--bg-card)] hover:border-teal-500/50';

  // The backdrop div itself has NO onClick — close requires the X button (line 290) or ESC.
  // The inner X button's onClick={onClose} sits within the test's 6-line lookahead window
  // from the backdrop, so we mark this site as a sanctioned NO-onClick-on-backdrop case.
  // V123 (2026-05-27) — createPortal to document.body (AV143). Same trap class
  // as AV117: this `fixed inset-0` modal is rendered inside TFP's `fixed inset-0`
  // overlay; a transformed/filtered ancestor would bound it to an ancestor box
  // instead of the viewport. Portal → always viewport-centered, no flash.
  return createPortal(
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / ESC).
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col bg-[var(--bg-elevated)] border border-[var(--bd)]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--bd)]">
          <h3 className="text-sm font-black text-teal-500">เลือก Template</h3>
          <button onClick={onClose} className="text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]"><X size={18} /></button>
        </div>

        <div className="flex gap-1 px-4 py-2 border-b border-[var(--bd)]">
          {[
            { id: 'local', label: 'ของเรา', icon: FileImage },
            { id: 'upload', label: 'อัปโหลด', icon: Upload },
          ].map(tab => (
            <button key={tab.id} onClick={() => setSource(tab.id)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition-all ${
                source === tab.id ? 'bg-teal-500 text-white' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:bg-[var(--bg-hover2)]'
              }`}>
              <tab.icon size={11} /> {tab.label}
            </button>
          ))}
        </div>

        {source === 'local' && (
          <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto border-[var(--bd)]">
            {chartCategories.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                  category === cat.id ? 'bg-gray-600 text-white' : 'bg-[var(--bg-hover)] text-[var(--tx-muted)]'
                }`}>{cat.name}</button>
            ))}
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              data-testid="chart-template-add-btn"
              className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 flex items-center gap-1 shrink-0 disabled:opacity-50">
              <Plus size={10} /> {busy ? 'กำลังอัพ...' : 'เพิ่ม'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) addTemplate(e.target.files[0]); e.target.value = ''; }} />
          </div>
        )}

        <div className="p-4 overflow-y-auto flex-1">
          {source === 'local' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((tmpl, displayedIdx) => {
                const realIdx = displayed.indexOf(tmpl);
                const isEditing = editingIdx === realIdx;
                return (
                  <div key={tmpl.id} data-testid="chart-template-card" className="relative group">
                    <button onClick={() => { if (!isEditing) { onSelect(tmpl); onClose(); } }} className={`w-full ${cardCls}`}>
                      <div className="aspect-[3/4] flex items-center justify-center p-2 bg-[var(--bg-input)]">
                        {tmpl.imageUrl ? <img src={tmpl.imageUrl} alt={tmpl.name} className="w-full h-full object-contain opacity-70" /> : <FileImage size={32} className="text-[var(--tx-muted)]" />}
                      </div>
                      <div className="px-2 py-1.5 text-center border-t border-[var(--bd)]">
                        {isEditing ? (
                          <div className="space-y-1" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameTemplate(tmpl)}
                                className="text-xs font-bold bg-transparent border-b outline-none w-full text-center border-teal-500 text-[var(--tx-primary)]" autoFocus />
                              <button onClick={() => renameTemplate(tmpl)} className="text-teal-500 shrink-0"><Check size={12} /></button>
                            </div>
                            <select value={editCategory} onChange={e => { setEditCategory(e.target.value); setCategoryFor(tmpl, e.target.value); }}
                              className="text-[11px] w-full rounded px-1 py-0.5 bg-[var(--bg-hover2)] text-[var(--tx-secondary)] border border-[var(--bd-strong)]">
                              {chartCategories.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        ) : (
                          <span className="text-xs font-bold flex items-center justify-center gap-1">
                            {tmpl.locked && <Lock size={9} className="text-amber-500" data-testid="chart-template-lock-badge" />}
                            {tmpl.name}
                          </span>
                        )}
                      </div>
                    </button>
                    {!isEditing && (
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); setEditingIdx(realIdx); setNameInput(tmpl.name); setEditCategory(tmpl.category || 'other'); }}
                          className="p-1 bg-blue-500 text-white rounded-full shadow" title="แก้ไข"><Pencil size={9} /></button>
                        <button onClick={e => { e.stopPropagation(); moveTemplate(tmpl, -1); }}
                          className="p-1 bg-gray-600 text-white rounded-full shadow" title="เลื่อนขึ้น (เฉพาะเครื่องนี้)"><ArrowUp size={9} /></button>
                        <button onClick={e => { e.stopPropagation(); moveTemplate(tmpl, 1); }}
                          className="p-1 bg-gray-600 text-white rounded-full shadow" title="เลื่อนลง (เฉพาะเครื่องนี้)"><ArrowDown size={9} /></button>
                        <button onClick={e => { e.stopPropagation(); toggleLock(tmpl); }}
                          data-testid="chart-template-lock-btn"
                          className={`p-1 text-white rounded-full shadow ${tmpl.locked ? 'bg-amber-500' : 'bg-gray-500'}`}
                          title={tmpl.locked ? 'ปลดล็อค' : 'ล็อคป้องกันลบโดยไม่ตั้งใจ'}>
                          {tmpl.locked ? <Lock size={9} /> : <Unlock size={9} />}
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteTemplate(tmpl); }}
                          disabled={tmpl.locked || busy}
                          data-testid="chart-template-delete-btn"
                          className={`p-1 text-white rounded-full shadow ${tmpl.locked ? 'bg-red-500/30 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'}`}
                          title={tmpl.locked ? '🔒 ล็อคอยู่ — ปลดล็อคก่อนถึงจะลบได้' : 'ลบ Template'}>
                          <Trash2 size={9} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {loaded && filtered.length === 0 && (
                <div className="col-span-full text-center text-xs text-[var(--tx-muted)] py-8">ไม่มี Template ในหมวดนี้</div>
              )}
            </div>
          )}

          {source === 'upload' && (
            <div>
              <div className="rounded-lg border-2 border-dashed py-8 text-center cursor-pointer transition-all border-[var(--bd-strong)] hover:border-teal-500/40"
                onClick={() => uploadRef.current?.click()}>
                <Upload size={28} className="mx-auto mb-2 text-[var(--tx-muted)]" />
                <p className="text-xs text-[var(--tx-muted)]">อัปโหลดรูปแล้ววาดทันที</p>
                <p className="text-[11px] text-[var(--tx-faint)] mt-1">JPG, PNG</p>
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
    </div>,
    document.body,
  );
}
