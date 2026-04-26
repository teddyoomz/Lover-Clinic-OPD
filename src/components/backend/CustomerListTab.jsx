// ─── CustomerListTab — Display cloned customers from be_customers ───────────
// Card grid layout similar to ProClinic's /admin/customer/search page.
// Client-side search filtering by name, HN, phone.

import { useState, useEffect, useMemo } from 'react';
import { Users, Search, Loader2, RefreshCw, Download, Eye, Info, AlertCircle, FileText, CheckSquare, Square, UserPlus } from 'lucide-react';
import { getAllCustomers } from '../../lib/backendClient.js';
import { hexToRgb } from '../../utils.js';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import CustomerCard from './CustomerCard.jsx';
import BulkPrintModal from './BulkPrintModal.jsx';

export default function CustomerListTab({ clinicSettings, theme, onViewCustomer, onCreateCustomer, refreshSignal = 0 }) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const isDark = theme !== 'light';
  const canCreate = useHasPermission('customer_management');

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState(null);
  // Phase 14.10 (2026-04-26) — bulk-print multi-select mode + selected ids
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // V33.2 — refresh when external signal increments (e.g. parent saved new customer)
  useEffect(() => {
    if (refreshSignal > 0) setRefreshKey((k) => k + 1);
  }, [refreshSignal]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };
  const selectedCustomers = useMemo(
    () => customers.filter(c => selectedIds.has(c.id)),
    [customers, selectedIds],
  );

  // Fetch all cloned customers
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    getAllCustomers()
      .then(data => {
        if (!cancelled) setCustomers(data);
      })
      .catch(err => {
        console.error('[CustomerListTab] Failed to load customers:', err);
        if (!cancelled) setLoadError(err.message || 'โหลดข้อมูลลูกค้าไม่สำเร็จ');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [refreshKey]);

  // Client-side filter
  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return customers;
    const q = filterQuery.trim().toLowerCase();
    return customers.filter(c => {
      const name = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.toLowerCase();
      const hn = (c.proClinicHN || '').toLowerCase();
      const phone = (c.patientData?.phone || '').toLowerCase();
      const id = (c.proClinicId || '').toLowerCase();
      return name.includes(q) || hn.includes(q) || phone.includes(q) || id.includes(q);
    });
  }, [customers, filterQuery]);

  return (
    <div className="space-y-4">

      {/* ── Header bar ── */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: `1.5px solid rgba(${acRgb},0.15)` }}>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: `rgba(${acRgb},0.5)` }} />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="ค้นหาลูกค้าในระบบ... (ชื่อ, HN, เบอร์โทร)"
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-sm text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none transition-all"
              style={{ boxShadow: `inset 0 2px 4px rgba(0,0,0,0.1)` }}
            />
          </div>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="px-5 py-3 rounded-xl font-black text-sm text-white transition-all disabled:opacity-40 flex items-center gap-2 hover:shadow-xl active:scale-[0.97] uppercase tracking-wider"
            style={{ background: `linear-gradient(135deg, rgba(${acRgb},0.9), rgba(${acRgb},0.6))`, boxShadow: `0 4px 20px rgba(${acRgb},0.25)` }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> รีเฟรช
          </button>
          {/* Phase 14.10 — bulk-print toggle + action bar */}
          <button
            onClick={() => { setSelectMode(s => !s); if (selectMode) clearSelection(); }}
            disabled={loading || customers.length === 0}
            data-testid="bulk-print-toggle"
            className={`px-4 py-3 rounded-xl font-black text-sm transition-all disabled:opacity-40 flex items-center gap-2 uppercase tracking-wider ${selectMode ? 'bg-violet-700 text-white' : 'bg-[var(--bg-input)] text-[var(--tx-primary)] border border-[var(--bd)] hover:border-violet-500/50'}`}
          >
            <FileText size={15} /> {selectMode ? 'ยกเลิก' : 'พิมพ์ Bulk'}
          </button>
          {/* V33-customer-create — manual add customer (V33.2: full-page takeover) */}
          {canCreate && onCreateCustomer && (
            <button
              onClick={() => onCreateCustomer()}
              disabled={loading}
              data-testid="add-customer-button"
              className="px-5 py-3 rounded-xl font-black text-sm text-white transition-all disabled:opacity-40 flex items-center gap-2 hover:shadow-xl active:scale-[0.97] uppercase tracking-wider bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 shadow-lg shadow-emerald-900/30"
            >
              <UserPlus size={15} /> เพิ่มลูกค้า
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-[var(--tx-muted)] flex items-center gap-1.5">
            <Info size={12} /> ลูกค้าที่ Clone มาจาก ProClinic จะแสดงที่นี่
          </p>
          <span className="text-xs text-[var(--tx-muted)] font-bold">
            {filtered.length} / {customers.length} รายการ
          </span>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--tx-muted)]" />
          <span className="ml-3 text-sm text-[var(--tx-muted)]">กำลังโหลดข้อมูลลูกค้า...</span>
        </div>
      )}

      {/* ── Error state ── */}
      {!loading && loadError && (
        <div className={`rounded-xl border p-6 text-center ${isDark ? 'bg-red-900/20 border-red-700/40' : 'bg-red-50 border-red-200'}`}>
          <AlertCircle size={24} className={`mx-auto mb-2 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
          <p className={`text-sm font-bold ${isDark ? 'text-red-400' : 'text-red-700'}`}>โหลดข้อมูลไม่สำเร็จ</p>
          <p className={`text-xs mt-1 ${isDark ? 'text-red-400/70' : 'text-red-600/70'}`}>{loadError}</p>
          <button onClick={() => setRefreshKey(k => k + 1)} className={`mt-3 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${isDark ? 'bg-red-900/20 border-red-700/40 text-red-400 hover:bg-red-900/30' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}>
            ลองอีกครั้ง
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !loadError && customers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, rgba(${acRgb},0.2), rgba(${acRgb},0.05))`, border: `1.5px solid rgba(${acRgb},0.3)`, boxShadow: `0 0 40px rgba(${acRgb},0.15), 0 0 80px rgba(${acRgb},0.05)` }}>
              <Users size={32} style={{ color: ac }} />
            </div>
            <div className="absolute -inset-4 rounded-3xl opacity-30" style={{ background: `radial-gradient(circle, rgba(${acRgb},0.15) 0%, transparent 70%)` }} />
          </div>
          <h3 className="text-xl font-black text-[var(--tx-heading)] mb-2 tracking-tight">ข้อมูลลูกค้า</h3>
          <p className="text-sm text-[var(--tx-muted)] max-w-lg mx-auto text-center leading-relaxed mb-8">
            ดูรายชื่อลูกค้าทั้งหมดที่ Clone มาจาก ProClinic แล้ว พร้อมข้อมูลคอร์ส, นัดหมาย, และประวัติการรักษา
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
            {[
              { step: '1', icon: <Download size={16} />, title: 'Clone ก่อน', desc: 'ไปแท็บ "Clone ลูกค้า" เพื่อดูดข้อมูล' },
              { step: '2', icon: <Eye size={16} />, title: 'ดูข้อมูล', desc: 'กดเข้าดูรายละเอียดแต่ละราย' },
              { step: '3', icon: <Search size={16} />, title: 'ค้นหา', desc: 'กรองด้วยชื่อ, HN, หรือเบอร์โทร' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--bd)]">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                  style={{ backgroundColor: `rgba(${acRgb},0.15)`, color: ac }}>{s.step}</span>
                <div>
                  <p className="text-sm font-bold text-[var(--tx-heading)]">{s.title}</p>
                  <p className="text-xs text-[var(--tx-muted)] mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── No filter results ── */}
      {!loading && customers.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
          <Search size={28} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-sm text-[var(--tx-muted)]">ไม่พบลูกค้าที่ตรงกับ "{filterQuery}"</p>
        </div>
      )}

      {/* ── Customer Grid ── */}
      {!loading && filtered.length > 0 && (
        <>
          {selectMode && (
            <div
              className="sticky top-0 z-10 -mx-1 px-3 py-2 rounded-lg bg-violet-900/30 border border-violet-700/50 text-xs text-violet-100 flex items-center gap-2 backdrop-blur"
              data-testid="bulk-print-action-bar"
            >
              <span className="font-bold">เลือก {selectedIds.size} รายการ</span>
              <span className="opacity-70">— กดที่ลูกค้าเพื่อเลือก</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(new Set(filtered.map(c => c.id)));
                  }}
                  data-testid="bulk-print-select-all"
                  className="px-2 py-1 rounded bg-violet-800 hover:bg-violet-700 text-white text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <CheckSquare size={11} /> เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedIds.size === 0}
                  className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white text-[11px] disabled:opacity-50"
                >
                  ล้าง
                </button>
                <button
                  type="button"
                  onClick={() => setBulkOpen(true)}
                  disabled={selectedIds.size === 0}
                  data-testid="bulk-print-launch"
                  className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={11} /> สร้าง PDF
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map(customer => {
              const selected = selectedIds.has(customer.id);
              return (
                <div
                  key={customer.id}
                  className={selectMode ? 'relative cursor-pointer' : 'relative'}
                  onClick={selectMode ? () => toggleSelect(customer.id) : undefined}
                  data-testid={selectMode ? `bulk-print-row-${customer.id}` : undefined}
                  data-selected={selectMode && selected ? 'true' : undefined}
                >
                  {selectMode && (
                    <div className="absolute top-2 left-2 z-10 pointer-events-none" aria-hidden="true">
                      {selected
                        ? <CheckSquare size={20} className="text-emerald-400 drop-shadow" />
                        : <Square size={20} className="text-[var(--tx-muted)] drop-shadow" />
                      }
                    </div>
                  )}
                  <div className={selectMode ? (selected ? 'ring-2 ring-emerald-500/70 rounded-2xl' : 'opacity-80') : ''}>
                    <CustomerCard
                      customer={customer}
                      accentColor={ac}
                      theme={theme}
                      mode="cloned"
                      onView={selectMode ? null : onViewCustomer}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Phase 14.10 — Bulk print modal */}
      {bulkOpen && (
        <BulkPrintModal
          customers={selectedCustomers}
          clinicSettings={clinicSettings}
          onClose={() => { setBulkOpen(false); exitSelectMode(); }}
        />
      )}
      {/* V33.2 — CustomerCreatePage is now mounted as a sibling page in
          BackendDashboard via creatingCustomer takeover, NOT a modal here. */}
    </div>
  );
}
