// ─── Quotation Tab — Phase 13.1.3 ──────────────────────────────────────────
// Lists be_quotations (Firestore only). Drives QuotationFormModal for
// create/edit + QuotationPrintView for the A4 customer-facing print.
// Rule E: no brokerClient import. Rule H: no ProClinic mirror.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, FileText, Printer, Loader2, ArrowRightCircle } from 'lucide-react';
import { listQuotations, deleteQuotation, convertQuotationToSale } from '../../lib/backendClient.js';
import QuotationFormModal from './QuotationFormModal.jsx';
import QuotationPrintView from './QuotationPrintView.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { STATUS_OPTIONS } from '../../lib/quotationValidation.js';

const STATUS_BADGE = {
  draft:     { label: 'ร่าง',       cls: 'bg-neutral-700/20 border-neutral-700/40 text-neutral-300' },
  sent:      { label: 'ส่งแล้ว',    cls: 'bg-sky-700/20 border-sky-700/40 text-sky-400' },
  accepted:  { label: 'ยอมรับ',     cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  rejected:  { label: 'ปฏิเสธ',     cls: 'bg-rose-700/20 border-rose-700/40 text-rose-400' },
  expired:   { label: 'หมดอายุ',    cls: 'bg-amber-700/20 border-amber-700/40 text-amber-400' },
  converted: { label: 'แปลงแล้ว',   cls: 'bg-violet-700/20 border-violet-700/40 text-violet-400' },
  cancelled: { label: 'ยกเลิก',     cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

function formatMoney(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateThai(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function QuotationTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [converting, setConverting] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await listQuotations();
      setItems(data);
    } catch (e) {
      setError(e.message || 'โหลดข้อมูลใบเสนอราคาล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (q && !(
        (it.customerName || '').toLowerCase().includes(q) ||
        (it.customerHN || '').toLowerCase().includes(q) ||
        (it.quotationId || it.id || '').toLowerCase().includes(q) ||
        (it.sellerName || '').toLowerCase().includes(q)
      )) return false;
      if (filterStatus && (it.status || 'draft') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (q) => { setEditing(q); setFormOpen(true); };
  const handlePrint = (q) => setPrinting(q);

  const handleDelete = async (q) => {
    const name = q.customerName || q.quotationId || q.id;
    const id = q.quotationId || q.id;
    if (!window.confirm(`ลบใบเสนอราคา "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id); setError('');
    try { await deleteQuotation(id); await reload(); }
    catch (e) { setError(e.message || 'ลบไม่สำเร็จ'); }
    finally { setDeleting(null); }
  };

  const handleSaved = async () => { setFormOpen(false); setEditing(null); await reload(); };

  const handleConvert = async (q) => {
    const id = q.quotationId || q.id;
    if (!window.confirm(`แปลงใบเสนอราคา "${q.customerName || id}" เป็นใบขาย (draft) ?`)) return;
    setConverting(id); setError('');
    try {
      const res = await convertQuotationToSale(id);
      if (res.alreadyConverted) {
        window.alert(`ใบเสนอราคานี้แปลงแล้ว → ใบขาย ${res.saleId}`);
      } else {
        window.alert(`แปลงสำเร็จ → ใบขาย ${res.saleId} (draft)`);
      }
      await reload();
    } catch (e) { setError(e.message || 'แปลงไม่สำเร็จ'); }
    finally { setConverting(null); }
  };

  const extraFilters = (
    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">สถานะทั้งหมด</option>
      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_BADGE[s]?.label || s}</option>)}
    </select>
  );

  return (
    <>
      <MarketingTabShell
        icon={FileText}
        title="ใบเสนอราคา"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="สร้างใบเสนอราคา"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อลูกค้า / HN / เลขที่ / พนักงาน"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีใบเสนอราคา — กด "สร้างใบเสนอราคา" เพื่อเริ่มต้น'
        notFoundText="ไม่พบใบเสนอราคาที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="space-y-2" data-testid="quotation-list">
          {filtered.map((q) => {
            const id = q.quotationId || q.id;
            const status = q.status || 'draft';
            const badge = STATUS_BADGE[status] || STATUS_BADGE.draft;
            const busy = deleting === id;
            return (
              <div key={id} data-testid={`quotation-row-${id}`}
                className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="font-mono text-xs text-[var(--tx-muted)]">{id}</span>
                  <span className="text-xs text-[var(--tx-muted)]">· {formatDateThai(q.quotationDate)}</span>
                  <span className="font-bold text-[var(--tx-heading)] flex-1 min-w-0 truncate">
                    {q.customerName || q.customerId || '(ไม่ระบุลูกค้า)'}
                    {q.customerHN && <span className="ml-2 text-[11px] font-normal text-[var(--tx-muted)]">{q.customerHN}</span>}
                  </span>
                  <span className="text-lg font-black text-emerald-400 shrink-0">{formatMoney(q.netTotal)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {['draft', 'sent', 'accepted'].includes(status) && (
                      <button onClick={() => handleConvert(q)} disabled={busy || converting === id}
                        aria-label={`แปลงใบเสนอราคา ${id} เป็นใบขาย`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-emerald-700/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-700/30 disabled:opacity-50"
                        data-testid={`quotation-convert-${id}`}>
                        {converting === id ? <Loader2 size={12} className="animate-spin" /> : <ArrowRightCircle size={12} />}
                        แปลงเป็นใบขาย
                      </button>
                    )}
                    <button onClick={() => handlePrint(q)} disabled={busy} aria-label={`ปริ๊นใบเสนอราคา ${id}`}
                      className="p-1.5 rounded text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] hover:text-sky-400 disabled:opacity-50"
                      data-testid={`quotation-print-${id}`}>
                      <Printer size={14} />
                    </button>
                    <button onClick={() => handleEdit(q)} disabled={busy} aria-label={`แก้ไขใบเสนอราคา ${id}`}
                      className="p-1.5 rounded text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] hover:text-sky-400 disabled:opacity-50"
                      data-testid={`quotation-edit-${id}`}>
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(q)} disabled={busy} aria-label={`ลบใบเสนอราคา ${id}`}
                      className="p-1.5 rounded text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] hover:text-red-400 disabled:opacity-50"
                      data-testid={`quotation-delete-${id}`}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
                {q.sellerName && (
                  <div className="text-[11px] text-[var(--tx-muted)] mt-1">พนักงาน: {q.sellerName}</div>
                )}
              </div>
            );
          })}
        </div>
      </MarketingTabShell>

      {formOpen && (
        <QuotationFormModal
          quotation={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}

      {printing && (
        <QuotationPrintView
          quotation={printing}
          clinicSettings={clinicSettings}
          onClose={() => setPrinting(null)}
        />
      )}
    </>
  );
}
