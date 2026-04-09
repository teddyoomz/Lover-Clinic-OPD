// ─── MasterDataTab — Sync + Display master data from ProClinic ──────────────
// Sub-tabs: Products | Doctors | Staff | Courses
// Reads from existing master_data/{type}/items/* collections (shared with ClinicSettingsPanel)

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Loader2, RefreshCw, Download, AlertCircle, CheckCircle2,
  Package, Stethoscope, Users, BookOpen, Database, Filter, ChevronDown, Info,
  Plus, Edit3, Trash2, X, ArrowLeft
} from 'lucide-react';
import { getMasterDataMeta, getAllMasterDataItems, runMasterDataSync, createMasterCourse, updateMasterCourse, deleteMasterCourse } from '../../lib/backendClient.js';
import { syncProducts, syncDoctors, syncStaff, syncCourses, listItems } from '../../lib/brokerClient.js';
import { hexToRgb } from '../../utils.js';

// Wrapper: listItems('promotion') → format like syncProducts response
async function syncPromotions() {
  const data = await listItems('promotion');
  if (!data?.success) return data;
  return { success: true, items: data.items || [], count: (data.items || []).length, totalPages: 1 };
}

const SYNC_TYPES = [
  { key: 'products', label: 'ยา / บริการ / สินค้า', fn: syncProducts, icon: '💊', color: 'emerald' },
  { key: 'doctors', label: 'แพทย์ / ผู้ช่วย', fn: syncDoctors, icon: '🩺', color: 'sky' },
  { key: 'staff', label: 'พนักงาน', fn: syncStaff, icon: '👤', color: 'purple' },
  { key: 'courses', label: 'คอร์ส', fn: syncCourses, icon: '📋', color: 'amber' },
  { key: 'promotions', label: 'โปรโมชัน', fn: syncPromotions, icon: '🏷️', color: 'rose' },
];

const SYNC_COLOR_MAP = {
  emerald: { btn: 'bg-emerald-950/30 border-emerald-800 text-emerald-400 hover:bg-emerald-900/40', badge: 'bg-emerald-900/40 text-emerald-400' },
  sky: { btn: 'bg-sky-950/30 border-sky-800 text-sky-400 hover:bg-sky-900/40', badge: 'bg-sky-900/40 text-sky-400' },
  purple: { btn: 'bg-purple-950/30 border-purple-800 text-purple-400 hover:bg-purple-900/40', badge: 'bg-purple-900/40 text-purple-400' },
  amber: { btn: 'bg-amber-950/30 border-amber-800 text-amber-400 hover:bg-amber-900/40', badge: 'bg-amber-900/40 text-amber-400' },
  rose: { btn: 'bg-rose-950/30 border-rose-800 text-rose-400 hover:bg-rose-900/40', badge: 'bg-rose-900/40 text-rose-400' },
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
  promotions: [
    { key: 'name', label: 'ชื่อโปรโมชัน', sticky: true },
    { key: 'price', label: 'ราคา', w: 'w-20', align: 'text-right' },
    { key: 'category', label: 'หมวด', w: 'w-24' },
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
  promotions: [
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

  // Course CRUD state (Phase 6.3)
  const [courseFormOpen, setCourseFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseSaving, setCourseSaving] = useState(false);
  const [courseError, setCourseError] = useState('');
  const [cfName, setCfName] = useState('');
  const [cfCode, setCfCode] = useState('');
  const [cfCategory, setCfCategory] = useState('');
  const [cfCourseType, setCfCourseType] = useState('fixed bundle');
  const [cfPrice, setCfPrice] = useState('');
  const [cfValidity, setCfValidity] = useState('');
  const [cfStatus, setCfStatus] = useState('ใช้งาน');
  const [cfProducts, setCfProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [prodSearch, setProdSearch] = useState('');

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

  // ── Course CRUD handlers ──
  const openCourseCreate = async () => {
    setEditingCourse(null); setCfName(''); setCfCode(''); setCfCategory(''); setCfCourseType('fixed bundle');
    setCfPrice(''); setCfValidity(''); setCfStatus('ใช้งาน'); setCfProducts([]); setCourseError('');
    setCourseFormOpen(true);
    if (allProducts.length === 0) {
      const prods = await getAllMasterDataItems('products');
      setAllProducts(prods);
    }
  };
  const openCourseEdit = async (course) => {
    setEditingCourse(course);
    setCfName(course.name || ''); setCfCode(course.code || ''); setCfCategory(course.category || '');
    setCfCourseType(course.courseType || 'fixed bundle'); setCfPrice(String(course.price || ''));
    setCfValidity(String(course.validityDays || '')); setCfStatus(course.status || 'ใช้งาน');
    setCfProducts((course.products || []).map(p => ({ id: p.id || '', name: p.name || '', qty: String(p.qty || ''), unit: p.unit || '' })));
    setCourseError(''); setCourseFormOpen(true);
    if (allProducts.length === 0) {
      const prods = await getAllMasterDataItems('products');
      setAllProducts(prods);
    }
  };
  const handleCourseSave = async () => {
    if (!cfName.trim()) { setCourseError('กรุณากรอกชื่อคอร์ส'); return; }
    setCourseSaving(true); setCourseError('');
    try {
      const data = JSON.parse(JSON.stringify({
        name: cfName, code: cfCode, category: cfCategory, courseType: cfCourseType,
        price: parseFloat(cfPrice) || 0, validityDays: parseInt(cfValidity) || 0,
        status: cfStatus, products: cfProducts.filter(p => p.name),
      }));
      if (editingCourse) {
        await updateMasterCourse(editingCourse.id, data);
      } else {
        await createMasterCourse(data);
      }
      setCourseFormOpen(false);
      const refreshed = await getAllMasterDataItems('courses');
      setItems(refreshed);
    } catch (e) { setCourseError(e.message); }
    finally { setCourseSaving(false); }
  };
  const handleCourseDelete = async (course) => {
    if (!confirm(`ต้องการลบคอร์ส "${course.name}"?`)) return;
    try {
      await deleteMasterCourse(course.id);
      setItems(prev => prev.filter(i => i.id !== course.id));
    } catch (e) { alert(e.message); }
  };

  const filteredProds = useMemo(() => {
    if (!prodSearch.trim()) return allProducts.slice(0, 30);
    const q = prodSearch.toLowerCase();
    return allProducts.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 30);
  }, [allProducts, prodSearch]);

  // ── Render Course Form Overlay ──
  if (courseFormOpen) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => setCourseFormOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]"><ArrowLeft size={18} /></button>
        <h2 className="text-sm font-bold text-amber-400">{editingCourse ? 'แก้ไขคอร์ส' : 'สร้างคอร์สใหม่'}</h2>
      </div>
      {courseError && <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-400">{courseError}</div>}
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">ชื่อคอร์ส *</label>
            <input value={cfName} onChange={e => setCfName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]" placeholder="เช่น Botox Package" /></div>
          <div><label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">รหัส</label>
            <input value={cfCode} onChange={e => setCfCode(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]" placeholder="BTX-001" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">หมวด</label>
            <input value={cfCategory} onChange={e => setCfCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]" placeholder="Botox" /></div>
          <div><label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">ประเภท</label>
            <select value={cfCourseType} onChange={e => setCfCourseType(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]">
              <option value="fixed bundle">Fixed Bundle</option><option value="buffet">Buffet</option>
              <option value="pay-per-actual">Pay Per Actual</option><option value="choose-per-actual">Choose Per Actual</option>
            </select></div>
          <div><label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">สถานะ</label>
            <select value={cfStatus} onChange={e => setCfStatus(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]">
              <option value="ใช้งาน">ใช้งาน</option><option value="พักใช้งาน">พักใช้งาน</option>
            </select></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">ราคา (บาท)</label>
            <input type="number" value={cfPrice} onChange={e => setCfPrice(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]" placeholder="0" /></div>
          <div><label className="text-xs font-semibold text-[var(--tx-muted)] block mb-1">อายุ (วัน)</label>
            <input type="number" value={cfValidity} onChange={e => setCfValidity(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]" placeholder="365" /></div>
        </div>
        {/* Products */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-[var(--tx-muted)]">สินค้าในคอร์ส ({cfProducts.length})</label>
            <button onClick={() => setCfProducts(p => [...p, { id: '', name: '', qty: '1', unit: '' }])}
              className="text-xs font-bold text-amber-400 flex items-center gap-1"><Plus size={12} /> เพิ่มสินค้า</button>
          </div>
          {cfProducts.length === 0 && <p className="text-xs text-[var(--tx-muted)] text-center py-3 bg-[var(--bg-elevated)] rounded-lg">ยังไม่มีสินค้า — กด "เพิ่มสินค้า"</p>}
          {cfProducts.map((p, pi) => (
            <div key={pi} className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <input value={p.name} onChange={e => {
                  setProdSearch(e.target.value);
                  setCfProducts(prev => prev.map((x, i) => i === pi ? { ...x, name: e.target.value, id: '' } : x));
                }} className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)]" placeholder="ค้นหาสินค้า" />
                {prodSearch && pi === cfProducts.findIndex(x => !x.id) && (
                  <div className="absolute z-20 mt-1 w-full max-h-32 overflow-y-auto bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg shadow-xl">
                    {filteredProds.map(fp => (
                      <button key={fp.id} onClick={() => {
                        setCfProducts(prev => prev.map((x, i) => i === pi ? { ...x, id: fp.id, name: fp.name, unit: fp.unit || '' } : x));
                        setProdSearch('');
                      }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)] text-[var(--tx-secondary)] truncate">{fp.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <input value={p.qty} onChange={e => setCfProducts(prev => prev.map((x, i) => i === pi ? { ...x, qty: e.target.value } : x))}
                className="w-16 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-center text-[var(--tx-primary)]" placeholder="จำนวน" />
              <input value={p.unit} onChange={e => setCfProducts(prev => prev.map((x, i) => i === pi ? { ...x, unit: e.target.value } : x))}
                className="w-16 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-center text-[var(--tx-primary)]" placeholder="หน่วย" />
              <button onClick={() => setCfProducts(prev => prev.filter((_, i) => i !== pi))} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => setCourseFormOpen(false)} className="px-4 py-2.5 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)]">ยกเลิก</button>
        <button onClick={handleCourseSave} disabled={courseSaving}
          className="px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-amber-700 hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2 transition-all">
          {courseSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {editingCourse ? 'บันทึก' : 'สร้างคอร์ส'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ═══ [A] Sync Section ═══ */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: `1.5px solid rgba(245,158,11,0.15)` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-[var(--tx-heading)] uppercase tracking-wider flex items-center gap-2">
            <Download size={14} className="text-amber-400" /> Sync ข้อมูลจาก ProClinic
          </h3>
          <button onClick={handleSyncAll} disabled={isSyncing}
            className="px-5 py-2.5 rounded-xl font-black text-xs text-white transition-all disabled:opacity-40 flex items-center gap-2 hover:shadow-xl active:scale-[0.97] uppercase tracking-wider"
            style={{ background: 'linear-gradient(135deg, #b45309, #d97706)', boxShadow: '0 4px 20px rgba(245,158,11,0.3)' }}>
            {isSyncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Sync ทั้งหมด
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {SYNC_TYPES.map(st => {
            const cm = SYNC_COLOR_MAP[st.color];
            const status = syncStatus[st.key];
            const m = meta[st.key];
            return (
              <button key={st.key} onClick={() => handleSync(st.key, st.fn)}
                disabled={status === 'loading'}
                className={`px-3 py-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-start gap-1.5 disabled:opacity-60 hover:shadow-lg active:scale-[0.98] ${cm.btn}`}>
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-base">{st.icon}</span>
                  <span className="truncate flex-1 text-left">{st.label}</span>
                  {status === 'loading' && <Loader2 size={12} className="animate-spin flex-shrink-0" />}
                  {status === 'done' && <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />}
                  {status === 'error' && <AlertCircle size={12} className="text-red-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-[11px] opacity-70">
                  {m?.count != null && <span className="font-mono">{m.count} รายการ</span>}
                  {m?.syncedAt && <span>{relativeTime(m.syncedAt)}</span>}
                  {!m && <span>ยังไม่ได้ sync</span>}
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-[var(--tx-muted)] flex items-center gap-1.5">
          <Info size={12} /> Sync ข้อมูลพื้นฐานจาก ProClinic เพื่อใช้ในฟอร์มการรักษาและใบเสร็จ
        </p>

        {/* Sync errors */}
        {Object.entries(syncError).filter(([, v]) => v).map(([key, err]) => (
          <div key={key} className="mt-2 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle size={12} /> <span className="font-bold">{key}:</span> {err}
          </div>
        ))}
      </div>

      {/* ═══ [B] Sub-Tab Navigation ═══ */}
      <div className="flex items-center gap-2 flex-wrap">
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
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-amber-600/50' : 'bg-[var(--bg-elevated)]'}`}>
                  {m.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ [C] Filter Bar ═══ */}
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl p-3 flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input type="text" value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="ค้นหา..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-1 focus:ring-amber-700/50 transition-all" />
        </div>

        {/* Dropdown filters */}
        {(FILTER_CONFIG[activeSubTab] || []).map(f => (
          <select key={f.key} value={filters[f.key] || ''}
            onChange={(e) => setFilters(prev => ({ ...prev, [f.key]: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-xs text-[var(--tx-primary)] focus:outline-none focus:ring-1 focus:ring-amber-700/50 transition-all">
            <option value="">ทุก{f.label}</option>
            {(filterOptions[f.key] || []).map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ))}

        {/* Count */}
        <span className="text-xs text-[var(--tx-muted)] font-bold whitespace-nowrap">
          {filtered.length} / {items.length} รายการ
        </span>
        {/* Create course button */}
        {activeSubTab === 'courses' && (
          <button onClick={openCourseCreate}
            className="px-3 py-2 rounded-lg text-xs font-bold text-white bg-amber-700 hover:bg-amber-600 transition-all flex items-center gap-1.5 whitespace-nowrap">
            <Plus size={13} /> สร้างคอร์ส
          </button>
        )}
      </div>

      {/* ═══ [D] Data Table ═══ */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-[var(--tx-muted)]" />
          <span className="ml-3 text-sm text-[var(--tx-muted)]">กำลังโหลด...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))', border: '1.5px solid rgba(245,158,11,0.3)', boxShadow: '0 0 40px rgba(245,158,11,0.15)' }}>
              <Database size={28} className="text-amber-400" />
            </div>
            <div className="absolute -inset-4 rounded-3xl opacity-30" style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)' }} />
          </div>
          <h3 className="text-lg font-black text-[var(--tx-heading)] mb-2 tracking-tight">ยังไม่มีข้อมูล{SYNC_TYPES.find(s => s.key === activeSubTab)?.label || ''}</h3>
          <p className="text-sm text-[var(--tx-muted)] max-w-md mx-auto text-center leading-relaxed mb-6">
            กดปุ่ม <span className="font-bold text-amber-400">Sync</span> ด้านบนเพื่อดึงข้อมูลจาก ProClinic มาเก็บไว้ในระบบ
          </p>
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
                      className={`px-3 py-2.5 text-left font-bold text-[var(--tx-muted)] uppercase tracking-wider text-xs bg-[var(--bg-elevated)] ${col.w || ''} ${col.align || ''} ${col.sticky ? 'sticky left-0 z-10 bg-[var(--bg-elevated)]' : ''}`}>
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
                    {activeSubTab === 'courses' && item._createdBy === 'backend' && (
                      <td className="px-2 py-2 w-16">
                        <div className="flex gap-1">
                          <button onClick={() => openCourseEdit(item)} className="p-1 rounded hover:bg-sky-900/20 text-sky-400"><Edit3 size={13} /></button>
                          <button onClick={() => handleCourseDelete(item)} className="p-1 rounded hover:bg-red-900/20 text-red-400"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    )}
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
    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
      isActive ? 'bg-emerald-900/30 text-emerald-400' : 'bg-gray-800/50 text-gray-500'
    }`}>
      {isActive ? 'ใช้งาน' : value}
    </span>
  );
}
