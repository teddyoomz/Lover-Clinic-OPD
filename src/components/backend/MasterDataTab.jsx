// ─── MasterDataTab — Sync + Display master data from ProClinic ──────────────
// Sub-tabs: Products | Doctors | Staff | Courses
// Reads from existing master_data/{type}/items/* collections (shared with ClinicSettingsPanel)

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Loader2, RefreshCw, Download, AlertCircle, CheckCircle2,
  Package, Stethoscope, Users, BookOpen, Database, Filter, ChevronDown
} from 'lucide-react';
import { getMasterDataMeta, getAllMasterDataItems, runMasterDataSync } from '../../lib/backendClient.js';
import { syncProducts, syncDoctors, syncStaff, syncCourses } from '../../lib/brokerClient.js';
import { hexToRgb } from '../../utils.js';

const SYNC_TYPES = [
  { key: 'products', label: 'ยา / บริการ / สินค้า', fn: syncProducts, icon: '💊', color: 'emerald' },
  { key: 'doctors', label: 'แพทย์ / ผู้ช่วย', fn: syncDoctors, icon: '🩺', color: 'sky' },
  { key: 'staff', label: 'พนักงาน', fn: syncStaff, icon: '👤', color: 'purple' },
  { key: 'courses', label: 'คอร์ส', fn: syncCourses, icon: '📋', color: 'amber' },
];

const SYNC_COLOR_MAP = {
  emerald: { btn: 'bg-emerald-950/30 border-emerald-800 text-emerald-400 hover:bg-emerald-900/40', badge: 'bg-emerald-900/40 text-emerald-400' },
  sky: { btn: 'bg-sky-950/30 border-sky-800 text-sky-400 hover:bg-sky-900/40', badge: 'bg-sky-900/40 text-sky-400' },
  purple: { btn: 'bg-purple-950/30 border-purple-800 text-purple-400 hover:bg-purple-900/40', badge: 'bg-purple-900/40 text-purple-400' },
  amber: { btn: 'bg-amber-950/30 border-amber-800 text-amber-400 hover:bg-amber-900/40', badge: 'bg-amber-900/40 text-amber-400' },
};

// Table column definitions per sub-tab
const COLUMNS = {
  products: [
    { key: 'name', label: 'ชื่อสินค้า', sticky: true },
    { key: 'unit', label: 'หน่วย', w: 'w-16' },
    { key: 'price', label: 'ราคา', w: 'w-20', align: 'text-right' },
    { key: 'type', label: 'ประเภท', w: 'w-24' },
    { key: 'category', label: 'หมวด', w: 'w-24' },
    { key: 'status', label: 'สถานะ', w: 'w-16' },
  ],
  doctors: [
    { key: 'name', label: 'ชื่อ', sticky: true },
    { key: 'position', label: 'ตำแหน่ง', w: 'w-28' },
    { key: 'branches', label: 'สาขา', w: 'w-32' },
    { key: 'color', label: 'สี', w: 'w-12', render: (v) => v ? 'color-dot' : '' },
    { key: 'status', label: 'สถานะ', w: 'w-16' },
  ],
  staff: [
    { key: 'name', label: 'ชื่อ', sticky: true },
    { key: 'position', label: 'ตำแหน่ง', w: 'w-28' },
    { key: 'branches', label: 'สาขา', w: 'w-32' },
    { key: 'status', label: 'สถานะ', w: 'w-16' },
  ],
  courses: [
    { key: 'code', label: 'รหัส', w: 'w-20' },
    { key: 'name', label: 'ชื่อคอร์ส', sticky: true },
    { key: 'courseType', label: 'ประเภท', w: 'w-28' },
    { key: 'category', label: 'หมวด', w: 'w-24' },
    { key: 'price', label: 'ราคา', w: 'w-20', align: 'text-right' },
    { key: 'status', label: 'สถานะ', w: 'w-16' },
  ],
};

// Filter config per sub-tab
const FILTER_CONFIG = {
  products: [
    { key: 'type', label: 'ประเภท', field: 'type' },
    { key: 'category', label: 'หมวด', field: 'category' },
  ],
  doctors: [
    { key: 'position', label: 'ตำแหน่ง', field: 'position' },
  ],
  staff: [
    { key: 'position', label: 'ตำแหน่ง', field: 'position' },
  ],
  courses: [
    { key: 'courseType', label: 'ประเภท', field: 'courseType' },
    { key: 'category', label: 'หมวด', field: 'category' },
  ],
};

function relativeTime(isoStr) {
  if (!isoStr) return '-';
  const d = typeof isoStr === 'object' && isoStr.toDate ? isoStr.toDate() : new Date(isoStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  return `${days} วันที่แล้ว`;
}

export default function MasterDataTab({ clinicSettings, theme }) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState('products');

  // Data state
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState({}); // { products: { count, syncedAt }, ... }

  // Filter state
  const [filterQuery, setFilterQuery] = useState('');
  const [filters, setFilters] = useState({}); // { type: 'ยา', category: 'Botox' }

  // Sync state
  const [syncStatus, setSyncStatus] = useState({}); // { products: 'idle'|'loading'|'done'|'error' }
  const [syncError, setSyncError] = useState({});

  // ── Load metadata for all types on mount ──
  useEffect(() => {
    const loadMeta = async () => {
      const metaMap = {};
      await Promise.all(SYNC_TYPES.map(async (st) => {
        try {
          const m = await getMasterDataMeta(st.key);
          if (m) metaMap[st.key] = m;
        } catch {}
      }));
      setMeta(metaMap);
    };
    loadMeta();
  }, []);

  // ── Load items when sub-tab changes ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFilterQuery('');
    setFilters({});

    getAllMasterDataItems(activeSubTab)
      .then(data => { if (!cancelled) setItems(data); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [activeSubTab]);

  // ── Sync handler ──
  const handleSync = useCallback(async (type, fn) => {
    setSyncStatus(prev => ({ ...prev, [type]: 'loading' }));
    setSyncError(prev => ({ ...prev, [type]: null }));
    try {
      const result = await runMasterDataSync(type, fn);
      if (result.success) {
        setSyncStatus(prev => ({ ...prev, [type]: 'done' }));
        setMeta(prev => ({ ...prev, [type]: { count: result.count, totalPages: result.totalPages, syncedAt: new Date().toISOString() } }));
        // Reload items if currently viewing this type
        if (activeSubTab === type) {
          const data = await getAllMasterDataItems(type);
          setItems(data);
        }
      } else {
        setSyncStatus(prev => ({ ...prev, [type]: 'error' }));
        setSyncError(prev => ({ ...prev, [type]: result.error }));
      }
    } catch (err) {
      setSyncStatus(prev => ({ ...prev, [type]: 'error' }));
      setSyncError(prev => ({ ...prev, [type]: err.message }));
    }
  }, [activeSubTab]);

  const handleSyncAll = useCallback(async () => {
    for (const st of SYNC_TYPES) {
      await handleSync(st.key, st.fn);
    }
  }, [handleSync]);

  // ── Filter logic ──
  const filterOptions = useMemo(() => {
    const config = FILTER_CONFIG[activeSubTab] || [];
    const opts = {};
    config.forEach(f => {
      const values = [...new Set(items.map(item => item[f.field]).filter(Boolean))].sort();
      opts[f.key] = values;
    });
    return opts;
  }, [items, activeSubTab]);

  const filtered = useMemo(() => {
    let result = items;
    // Text search
    if (filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      result = result.filter(item => {
        const searchable = [item.name, item.code, item.category, item.type, item.position, item.branches].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(q);
      });
    }
    // Dropdown filters
    Object.entries(filters).forEach(([key, val]) => {
      if (val) {
        const config = (FILTER_CONFIG[activeSubTab] || []).find(f => f.key === key);
        if (config) result = result.filter(item => item[config.field] === val);
      }
    });
    return result;
  }, [items, filterQuery, filters, activeSubTab]);

  const isSyncing = Object.values(syncStatus).some(s => s === 'loading');

  return (
    <div className="space-y-4">

      {/* ═══ [A] Sync Section ═══ */}
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-[var(--tx-heading)] uppercase tracking-wider flex items-center gap-2">
            <Download size={14} className="text-amber-400" /> Sync ข้อมูลจาก ProClinic
          </h3>
          <button onClick={handleSyncAll} disabled={isSyncing}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-amber-900/20 border border-amber-700/40 text-amber-400 hover:bg-amber-900/30 transition-all disabled:opacity-50 flex items-center gap-1.5">
            {isSyncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Sync ทั้งหมด
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SYNC_TYPES.map(st => {
            const cm = SYNC_COLOR_MAP[st.color];
            const status = syncStatus[st.key];
            const m = meta[st.key];
            return (
              <button key={st.key} onClick={() => handleSync(st.key, st.fn)}
                disabled={status === 'loading'}
                className={`px-3 py-2.5 rounded-lg border text-xs font-bold transition-all flex flex-col items-start gap-1 disabled:opacity-60 ${cm.btn}`}>
                <div className="flex items-center gap-1.5 w-full">
                  <span>{st.icon}</span>
                  <span className="truncate flex-1 text-left">{st.label}</span>
                  {status === 'loading' && <Loader2 size={11} className="animate-spin flex-shrink-0" />}
                  {status === 'done' && <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />}
                  {status === 'error' && <AlertCircle size={11} className="text-red-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-[9px] opacity-70">
                  {m?.count != null && <span>{m.count} รายการ</span>}
                  {m?.syncedAt && <span>{relativeTime(m.syncedAt)}</span>}
                  {!m && <span>ยังไม่ได้ sync</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Sync errors */}
        {Object.entries(syncError).filter(([, v]) => v).map(([key, err]) => (
          <div key={key} className="mt-2 text-[10px] text-red-400 flex items-center gap-1">
            <AlertCircle size={10} /> {key}: {err}
          </div>
        ))}
      </div>

      {/* ═══ [B] Sub-Tab Navigation ═══ */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {SYNC_TYPES.map(st => {
          const isActive = activeSubTab === st.key;
          const m = meta[st.key];
          return (
            <button key={st.key} onClick={() => setActiveSubTab(st.key)}
              className={`px-3 py-2 rounded-lg text-xs font-bold tracking-wider transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-amber-700 text-white shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-amber-400 hover:border-amber-800/50'
              }`}>
              <span>{st.icon}</span> {st.label.split(' / ')[0]}
              {m?.count != null && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-amber-600/50' : 'bg-[var(--bg-elevated)]'}`}>
                  {m.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ [C] Filter Bar ═══ */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input type="text" value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="ค้นหา..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-amber-700/50" />
        </div>

        {/* Dropdown filters */}
        {(FILTER_CONFIG[activeSubTab] || []).map(f => (
          <select key={f.key} value={filters[f.key] || ''}
            onChange={(e) => setFilters(prev => ({ ...prev, [f.key]: e.target.value }))}
            className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-amber-700/50">
            <option value="">ทุก{f.label}</option>
            {(filterOptions[f.key] || []).map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ))}

        {/* Count */}
        <span className="text-[10px] text-[var(--tx-muted)] font-medium whitespace-nowrap">
          {filtered.length} / {items.length} รายการ
        </span>
      </div>

      {/* ═══ [D] Data Table ═══ */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--tx-muted)]" />
          <span className="ml-3 text-sm text-[var(--tx-muted)]">กำลังโหลด...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
          <Database size={32} className="mx-auto text-[var(--tx-muted)] mb-3" />
          <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-1">ยังไม่มีข้อมูล</h3>
          <p className="text-xs text-[var(--tx-muted)]">กด Sync เพื่อดึงข้อมูลจาก ProClinic</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
          <Search size={24} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-xs text-[var(--tx-muted)]">ไม่พบข้อมูลที่ตรงกับตัวกรอง</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--bd)]">
                  {(COLUMNS[activeSubTab] || []).map(col => (
                    <th key={col.key}
                      className={`px-3 py-2.5 text-left font-bold text-[var(--tx-muted)] uppercase tracking-wider text-[10px] bg-[var(--bg-elevated)] ${col.w || ''} ${col.align || ''} ${col.sticky ? 'sticky left-0 z-10 bg-[var(--bg-elevated)]' : ''}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={item.id || i}
                    className={`border-b border-[var(--bd)]/50 hover:bg-[var(--bg-hover)] transition-colors ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/30'}`}>
                    {(COLUMNS[activeSubTab] || []).map(col => (
                      <td key={col.key}
                        className={`px-3 py-2 ${col.w || ''} ${col.align || ''} ${col.sticky ? 'sticky left-0 z-10 bg-inherit' : ''}`}>
                        {col.key === 'status' ? (
                          <StatusBadge value={item[col.key]} />
                        ) : col.key === 'color' && item[col.key] ? (
                          <div className="w-4 h-4 rounded-full border border-[var(--bd)]" style={{ backgroundColor: item[col.key] }} />
                        ) : col.key === 'price' ? (
                          <span className="font-mono">{item[col.key] != null ? Number(item[col.key]).toLocaleString() : '-'}</span>
                        ) : (
                          <span className="text-[var(--tx-secondary)]">{item[col.key] || '-'}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ value }) {
  const isActive = !value || value === 'ใช้งาน';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
      isActive ? 'bg-emerald-900/30 text-emerald-400' : 'bg-gray-800/50 text-gray-500'
    }`}>
      {isActive ? 'ใช้งาน' : value}
    </span>
  );
}
