// ─── Document Templates Tab — Phase 14.2 ──────────────────────────────────
// Master-data CRUD for `be_document_templates`. Lives under the
// "ข้อมูลพื้นฐาน" section. Seeds 13 system defaults on first load (Rule H:
// all master data in OUR Firestore — no ProClinic dependency).
//
// Users can: edit ANY template (including seeds to customize the HTML),
// create new templates per docType, delete user-created templates (system
// defaults are protected). The print flow reads be_document_templates on
// demand from wherever the "พิมพ์เอกสาร" button lives (Patient detail,
// Treatment, Sale detail — Phase 14.5 integrations).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, FileText, Plus, Eye, CheckCircle2, XCircle, Lock } from 'lucide-react';
import {
  listDocumentTemplates,
  deleteDocumentTemplate,
  seedDocumentTemplatesIfEmpty,
  upgradeSystemDocumentTemplates,
} from '../../lib/scopedDataLayer.js';
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
} from '../../lib/documentTemplateValidation.js';
import MarketingTabShell from './MarketingTabShell.jsx';
import DocumentTemplateFormModal from './DocumentTemplateFormModal.jsx';
import { printDocument } from '../../lib/documentPrintEngine.js';

export default function DocumentTemplatesTab({ clinicSettings }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filterDocType, setFilterDocType] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let list = await listDocumentTemplates();
      if (list.length === 0) {
        // First-load seed.
        setSeeding(true);
        try {
          const res = await seedDocumentTemplatesIfEmpty();
          if (res.seeded) {
            list = await listDocumentTemplates();
          }
        } catch (seedErr) {
          setError(`เพิ่มเทมเพลตเริ่มต้นล้มเหลว: ${seedErr.message || seedErr}`);
        } finally {
          setSeeding(false);
        }
      } else {
        // Phase 14.2 — schema upgrade pass. Rewrites system-default templates
        // whose schemaVersion is older than the current SEED_TEMPLATES.
        // User-customized templates (isSystemDefault=false) are NEVER touched.
        try {
          const res = await upgradeSystemDocumentTemplates();
          if (res.upgraded > 0 || res.added > 0) {
            list = await listDocumentTemplates();
          }
        } catch (upErr) {
          // Soft-fail — user can still use existing templates. Log to console.
          console.warn('[DocumentTemplates] schema upgrade failed:', upErr);
        }
      }
      setItems(list);
    } catch (e) {
      setError(e.message || 'โหลดเทมเพลตล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(t => {
      if (filterDocType && t.docType !== filterDocType) return false;
      if (filterActive === 'active' && t.isActive === false) return false;
      if (filterActive === 'inactive' && t.isActive !== false) return false;
      if (q) {
        const hay = [t.name, DOC_TYPE_LABELS[t.docType], t.docType].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, query, filterDocType, filterActive]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (t) => { setEditing(t); setFormOpen(true); };
  const handleClose = () => { setFormOpen(false); setEditing(null); };
  const handleSaved = async () => { await reload(); };

  const handleDelete = async (t) => {
    if (t.isSystemDefault) {
      window.alert('เทมเพลตระบบไม่สามารถลบได้ (แก้ไขได้แต่ห้ามลบ)');
      return;
    }
    if (!window.confirm(`ลบเทมเพลต "${t.name}"?`)) return;
    try { await deleteDocumentTemplate(t.templateId || t.id); await reload(); }
    catch (e) { setError(e.message); }
  };

  const handlePreview = (t) => {
    // Open the print engine with empty values — uses only clinic/customer
    // defaults (which come from ClinicSettings + a null customer in preview)
    // so staff can see what the placeholders render like. Browser print
    // dialog will open; user cancels to just preview.
    try {
      printDocument({
        template: t,
        clinic: clinicSettings || {},
        customer: {},
        values: {},
      });
    } catch (e) {
      setError(e.message || 'พิมพ์พรีวิวล้มเหลว');
    }
  };

  const extraFilters = (
    <>
      <select value={filterDocType} onChange={(e) => setFilterDocType(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="document-docType-filter">
        <option value="">ประเภททั้งหมด</option>
        {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
      </select>
      <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="all">ทั้งหมด</option>
        <option value="active">เปิดใช้งาน</option>
        <option value="inactive">ปิดใช้งาน</option>
      </select>
    </>
  );

  return (
    <>
      <MarketingTabShell
        icon={FileText}
        title="เทมเพลตเอกสาร"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มเทมเพลต"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อเทมเพลต / ประเภท"
        extraFilters={extraFilters}
        error={error}
        loading={loading || seeding}
        emptyText={seeding
          ? 'กำลังเพิ่มเทมเพลตเริ่มต้น 13 ชุด...'
          : 'ยังไม่มีเทมเพลตเอกสาร — ระบบจะเพิ่มเทมเพลตเริ่มต้นอัตโนมัติเมื่อ firestore.rules ถูก deploy'}
        notFoundText="ไม่พบเทมเพลตที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="space-y-1" data-testid="document-templates-list">
          {filtered.map(t => {
            const id = t.templateId || t.id;
            return (
              <div key={id} data-testid={`document-template-row-${id}`}
                className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] text-sm flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider bg-violet-700/20 border-violet-700/40 text-violet-400">
                  <FileText size={10} /> {DOC_TYPE_LABELS[t.docType] || t.docType}
                </span>
                <span className="font-bold">{t.name}</span>
                <span className="text-[10px] text-[var(--tx-muted)]">
                  {t.language} · {t.paperSize}
                </span>
                {t.isSystemDefault && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                    <Lock size={10} /> ระบบ
                  </span>
                )}
                {t.isActive !== false ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 size={10} /> ใช้งาน</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-neutral-400"><XCircle size={10} /> ปิด</span>
                )}
                <button onClick={() => handlePreview(t)} aria-label={`พรีวิวเทมเพลต ${t.name}`}
                  data-testid={`document-template-preview-${id}`}
                  className="ml-auto p-1 text-sky-400 hover:bg-sky-900/20 rounded" title="พรีวิว/พิมพ์ตัวอย่าง">
                  <Eye size={14} />
                </button>
                <button onClick={() => handleEdit(t)} aria-label={`แก้ไขเทมเพลต ${t.name}`}
                  data-testid={`document-template-edit-${id}`}
                  className="p-1 text-sky-400 hover:bg-sky-900/20 rounded">
                  <Edit2 size={12} />
                </button>
                {!t.isSystemDefault && (
                  <button onClick={() => handleDelete(t)} aria-label={`ลบเทมเพลต ${t.name}`}
                    data-testid={`document-template-delete-${id}`}
                    className="p-1 text-red-400 hover:bg-red-900/20 rounded">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </MarketingTabShell>

      {formOpen && (
        <DocumentTemplateFormModal
          template={editing}
          onClose={handleClose}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
