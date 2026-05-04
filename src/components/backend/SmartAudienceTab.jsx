// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation
// ─── Smart Audience Tab — Phase 16.1 (2026-04-30) ───────────────────────────
// Rule-builder UI for marketing segmentation. Admin builds AND/OR predicate
// trees over be_customers + be_sales + be_audiences (saved segments), sees
// real-time count + 10-name sample (debounced 300ms), saves named segments,
// and exports matched customers as CSV.
//
// Architecture:
//   - SavedSegmentSidebar (left)        — onSnapshot list, click to load, delete
//   - Toolbar (top of right column)     — name + description + save/save-as/delete
//   - RuleBuilder (middle of right col) — recursive group + predicate tree
//   - AudiencePreviewPane (bottom)      — count + 10-name sample + Export CSV
//
// Iron-clad refs:
//   - Rule E + H + H-quater — be_customers + be_sales + be_audiences only
//   - Rule J brainstorming HARD-GATE — 4 Qs locked previous session
//   - V14 no-undefined-leaves via validateAudienceRule before save
//   - V18 deploy auth — firestore.rules edit needs explicit "deploy" THIS turn
//   - Math accuracy — spend-bracket sums billing.netTotal; age uses bangkokNow

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Target, Save, Plus, Trash2, RefreshCw, RotateCcw } from 'lucide-react';
import {
  evaluateRule,
  indexSalesByCustomer,
  computeAgeYears,
  mostRecentSaleDate,
  sumNetTotal,
} from '../../lib/audienceRules.js';
import {
  emptyAudienceRule,
  validateAudienceRule,
} from '../../lib/audienceValidation.js';
import {
  newAudienceId,
  saveAudience,
  deleteAudience,
  listenToAudiences,
  listProducts,
  listCourses,
} from '../../lib/backendClient.js';
import { loadAllCustomersForReport, loadSalesByDateRange } from '../../lib/reportsLoaders.js';
import { downloadCSV } from '../../lib/csvExport.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { thaiTodayISO, bangkokNow } from '../../utils.js';
import { roundTHB } from '../../lib/reportsUtils.js';
import DateField from '../DateField.jsx';
import RuleBuilder from './audience/RuleBuilder.jsx';
import SavedSegmentSidebar from './audience/SavedSegmentSidebar.jsx';
import AudiencePreviewPane from './audience/AudiencePreviewPane.jsx';

const PREVIEW_DEBOUNCE_MS = 300;
const SAMPLE_SIZE = 10;
// P1/P3 perf — bound the be_sales scan so 50k+ docs don't load on every mount.
// Default looks back 12 months from today; admin can widen via toolbar.
const DEFAULT_SALES_RANGE_MONTHS = 12;

/**
 * Compute the default sales date range for the SmartAudience toolbar.
 * Returns ISO YYYY-MM-DD strings in Bangkok TZ. `from` is N months back
 * from today (clamped to day-1 when target month is shorter), `to` is today.
 *
 * Exported for tests so the 12-month default can be asserted without
 * mounting React.
 */
export function defaultSalesDateRange(monthsBack = DEFAULT_SALES_RANGE_MONTHS, todayISO = thaiTodayISO()) {
  const to = todayISO;
  const [yStr, mStr, dStr] = String(todayISO).split('-');
  const y = Number(yStr);
  const m = Number(mStr); // 1-12
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { from: '', to };
  }
  // Subtract N months. JS Date handles month-overflow naturally, but we want
  // to clamp the day so 2026-03-31 minus 1 month = 2026-02-28 (not 2026-03-03).
  const targetMonthIdx = m - 1 - monthsBack; // 0-based, may go negative
  const targetYear = y + Math.floor(targetMonthIdx / 12);
  const targetMonth0 = ((targetMonthIdx % 12) + 12) % 12;
  // Last day of target month: day 0 of month+1.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth0 + 1, 0)).getUTCDate();
  const dayClamped = Math.min(d, lastDay);
  const from = `${targetYear}-${String(targetMonth0 + 1).padStart(2, '0')}-${String(dayClamped).padStart(2, '0')}`;
  return { from, to };
}

const CSV_COLUMNS = Object.freeze([
  { key: 'hn',           label: 'HN' },
  { key: 'firstname',    label: 'ชื่อ' },
  { key: 'lastname',     label: 'นามสกุล' },
  { key: 'gender',       label: 'เพศ' },
  { key: 'age',          label: 'อายุ' },
  { key: 'branchId',     label: 'สาขา' },
  { key: 'source',       label: 'ที่มา' },
  { key: 'lastVisit',    label: 'มาล่าสุด' },
  { key: 'totalSpend',   label: 'ยอดรวม' },
  { key: 'courseCount',  label: 'จำนวนคอร์ส' },
  { key: 'lineUserId',   label: 'LINE userId' },
  { key: 'phone',        label: 'เบอร์' },
]);

/**
 * Build CSV rows from matched ids + lookup maps. Pure helper — exported for
 * tests so flow-simulate can verify column shape without React mounts.
 */
export function buildAudienceCsvRows(matchedIds, customerById, salesByCustomer, today) {
  const out = [];
  if (!Array.isArray(matchedIds)) return out;
  for (const id of matchedIds) {
    const c = customerById instanceof Map
      ? customerById.get(String(id))
      : (customerById && typeof customerById === 'object' ? customerById[String(id)] : null);
    if (!c) continue;
    const sales = salesByCustomer instanceof Map
      ? (salesByCustomer.get(String(id)) || [])
      : (salesByCustomer && typeof salesByCustomer === 'object' ? (salesByCustomer[String(id)] || []) : []);
    const lastVisit = mostRecentSaleDate(sales);
    const totalSpend = roundTHB(sumNetTotal(sales));
    const ageYears = computeAgeYears(c.birthdate, today);
    out.push({
      hn: c.hn_no || '',
      firstname: c.firstname || '',
      lastname: c.lastname || '',
      gender: c.gender || '',
      age: Number.isFinite(ageYears) ? ageYears : '',
      branchId: c.branchId || '',
      source: c.source || '',
      lastVisit,
      totalSpend,
      courseCount: Array.isArray(c.courses) ? c.courses.length : 0,
      lineUserId: c.lineUserId || '',
      phone: c.telephone_number || '',
    });
  }
  return out;
}

export default function SmartAudienceTab({ clinicSettings: _unused }) {
  const { branches } = useSelectedBranch();

  // Saved-segment sidebar state
  const [audiences, setAudiences] = useState([]);
  const [audiencesLoading, setAudiencesLoading] = useState(true);

  // Current-segment editor state
  const [selectedAudienceId, setSelectedAudienceId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rule, setRule] = useState(() => emptyAudienceRule());

  // P1/P3 — sales date-range state (default 12 months back to today, Bangkok TZ).
  // Initialized lazily so we evaluate once at mount; admin can widen via UI.
  const [salesRange, setSalesRange] = useState(() => defaultSalesDateRange());

  // Data sources for evaluation
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  // Preview state (debounced)
  const [previewResult, setPreviewResult] = useState({ matchedIds: [], total: 0 });
  const [previewing, setPreviewing] = useState(false);
  const debounceRef = useRef(null);

  // Save / delete state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Subscribe to saved segments via onSnapshot.
  useEffect(() => {
    const unsub = listenToAudiences(
      (items) => { setAudiences(items || []); setAudiencesLoading(false); },
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[SmartAudience] sidebar listener error', err);
        setAudiencesLoading(false);
      },
    );
    return () => { try { unsub && unsub(); } catch { /* noop */ } };
  }, []);

  // Load customers + sales + products + courses. Customer load stays full
  // (needed for evaluation); sales load is BOUNDED by salesRange (P1/P3).
  const reloadData = useCallback(async () => {
    setDataLoading(true);
    setDataError('');
    try {
      const [cs, ss, ps, cos] = await Promise.all([
        loadAllCustomersForReport(),
        loadSalesByDateRange({ from: salesRange.from || '', to: salesRange.to || '' }),
        listProducts().catch(() => []),
        listCourses().catch(() => []),
      ]);
      setCustomers(Array.isArray(cs) ? cs : []);
      setSales(Array.isArray(ss) ? ss : []);
      setProducts(Array.isArray(ps) ? ps : []);
      setCourses(Array.isArray(cos) ? cos : []);
    } catch (e) {
      setDataError(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setDataLoading(false);
    }
  }, [salesRange.from, salesRange.to]);

  // Reload when range changes (or on mount). useCallback dep ensures fresh closure.
  useEffect(() => { reloadData(); }, [reloadData]);

  const handleRangeFromChange = useCallback((v) => {
    setSalesRange((cur) => ({ ...cur, from: v || '' }));
  }, []);
  const handleRangeToChange = useCallback((v) => {
    setSalesRange((cur) => ({ ...cur, to: v || '' }));
  }, []);
  const handleRangeReset = useCallback(() => {
    setSalesRange(defaultSalesDateRange());
  }, []);

  // Pre-build sales index (memo by sales array reference).
  const salesByCustomer = useMemo(() => indexSalesByCustomer(sales), [sales]);

  // Customer-by-id lookup (used for sample render + CSV export).
  const customerById = useMemo(() => {
    const map = new Map();
    for (const c of customers) {
      if (c?.id) map.set(String(c.id), c);
    }
    return map;
  }, [customers]);

  // Debounced evaluation: re-runs whenever rule/customers/salesByCustomer change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreviewing(true);
    debounceRef.current = setTimeout(() => {
      try {
        const today = bangkokNow();
        const result = evaluateRule(customers, salesByCustomer, rule, today);
        setPreviewResult(result);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[SmartAudience] evaluate error', e);
        setPreviewResult({ matchedIds: [], total: 0 });
      } finally {
        setPreviewing(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rule, customers, salesByCustomer]);

  // 10-name sample list for the preview pane.
  const sampleCustomers = useMemo(() => {
    const ids = previewResult.matchedIds.slice(0, SAMPLE_SIZE);
    const out = [];
    for (const id of ids) {
      const c = customerById.get(String(id));
      if (c) out.push(c);
    }
    return out;
  }, [previewResult.matchedIds, customerById]);

  // ── Saved-segment actions ────────────────────────────────────────────────
  const handleSelectAudience = useCallback((aud) => {
    if (!aud) return;
    setSelectedAudienceId(String(aud.id));
    setName(typeof aud.name === 'string' ? aud.name : '');
    setDescription(typeof aud.description === 'string' ? aud.description : '');
    setRule(aud.rule && typeof aud.rule === 'object' ? aud.rule : emptyAudienceRule());
    setSaveError('');
  }, []);

  const handleNew = useCallback(() => {
    setSelectedAudienceId('');
    setName('');
    setDescription('');
    setRule(emptyAudienceRule());
    setSaveError('');
  }, []);

  const handleSave = useCallback(async (asNew = false) => {
    setSaveError('');
    const trimmedName = String(name).trim();
    if (!trimmedName) {
      setSaveError('กรุณาระบุชื่อกลุ่ม');
      return;
    }
    const fail = validateAudienceRule(rule);
    if (fail) {
      const [field, msg] = fail;
      setSaveError(`${field}: ${msg}`);
      return;
    }
    setSaving(true);
    try {
      const id = (asNew || !selectedAudienceId) ? newAudienceId() : selectedAudienceId;
      await saveAudience(id, { name: trimmedName, description, rule });
      setSelectedAudienceId(id);
    } catch (e) {
      setSaveError(e?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }, [name, description, rule, selectedAudienceId]);

  const handleDelete = useCallback(async () => {
    if (!selectedAudienceId) return;
    if (typeof window !== 'undefined' && !window.confirm('ลบกลุ่มเป้าหมายนี้ใช่หรือไม่?')) return;
    setSaveError('');
    setSaving(true);
    try {
      await deleteAudience(selectedAudienceId);
      handleNew();
    } catch (e) {
      setSaveError(e?.message || 'ลบไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }, [selectedAudienceId, handleNew]);

  // ── CSV export ───────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const today = bangkokNow();
    const rows = buildAudienceCsvRows(
      previewResult.matchedIds,
      customerById,
      salesByCustomer,
      today,
    );
    const stamp = thaiTodayISO();
    const safeName = (name || 'audience').replace(/[^\w฀-๿-]+/g, '-');
    downloadCSV(`smart-audience-${safeName}-${stamp}`, rows, CSV_COLUMNS);
  }, [previewResult.matchedIds, customerById, salesByCustomer, name]);

  const subtitle = useMemo(() => {
    if (dataLoading) return 'กำลังโหลดข้อมูล…';
    if (dataError) return dataError;
    return `จากลูกค้า ${customers.length.toLocaleString('th-TH')} ราย — ตรงตามเงื่อนไข ${previewResult.total.toLocaleString('th-TH')} ราย`;
  }, [dataLoading, dataError, customers.length, previewResult.total]);

  return (
    <div className="flex flex-col lg:flex-row gap-4" data-testid="smart-audience-tab">
      <SavedSegmentSidebar
        audiences={audiences}
        loading={audiencesLoading}
        selectedId={selectedAudienceId}
        onSelect={handleSelectAudience}
        onNew={handleNew}
      />

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div
          className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg p-4 flex flex-col gap-3"
          data-testid="smart-audience-toolbar"
        >
          <div className="flex items-center gap-2 text-base font-semibold text-[var(--tx-heading)]">
            <Target className="w-5 h-5" aria-hidden />
            <span>Smart Audience</span>
            <button
              type="button"
              onClick={reloadData}
              className="ml-auto text-xs px-2 py-1 rounded border border-[var(--bd)] hover:border-[var(--tx-heading)] flex items-center gap-1"
              title="โหลดข้อมูลใหม่"
              data-testid="smart-audience-reload"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden />
              โหลดใหม่
            </button>
          </div>
          <div className="text-xs text-[var(--tx-secondary)]" data-testid="smart-audience-subtitle">
            {subtitle}
          </div>

          {/* P1/P3 perf — bounded sales date-range filter (default 12 months back). */}
          <div
            className="flex flex-wrap items-end gap-2"
            data-testid="smart-audience-sales-range"
          >
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] uppercase tracking-wide text-[var(--tx-secondary)]">
                ช่วงเวลา (วันที่ขาย) — ตั้งแต่
              </label>
              <div className="w-40">
                <DateField
                  size="sm"
                  value={salesRange.from || ''}
                  onChange={handleRangeFromChange}
                  placeholder="ตั้งแต่"
                />
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] uppercase tracking-wide text-[var(--tx-secondary)]">
                ถึง
              </label>
              <div className="w-40">
                <DateField
                  size="sm"
                  value={salesRange.to || ''}
                  onChange={handleRangeToChange}
                  placeholder="ถึง"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleRangeReset}
              className="px-2 py-1 text-xs rounded border border-[var(--bd)] hover:border-[var(--tx-heading)] flex items-center gap-1"
              title="รีเซ็ตเป็น 12 เดือนล่าสุด"
              data-testid="smart-audience-range-reset"
            >
              <RotateCcw className="w-3 h-3" aria-hidden />
              รีเซ็ต
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อกลุ่มเป้าหมาย"
              className="px-3 py-2 rounded-md text-sm bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
              data-testid="smart-audience-name"
              maxLength={80}
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="คำอธิบาย (ไม่บังคับ)"
              className="px-3 py-2 rounded-md text-sm bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]"
              data-testid="smart-audience-description"
              maxLength={300}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving || !name.trim()}
              className="px-3 py-1.5 text-xs rounded-md bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              data-testid="smart-audience-save"
            >
              <Save className="w-3.5 h-3.5" aria-hidden />
              {selectedAudienceId ? 'บันทึก' : 'บันทึกใหม่'}
            </button>
            {selectedAudienceId && (
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving || !name.trim()}
                className="px-3 py-1.5 text-xs rounded-md border border-[var(--bd)] hover:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                data-testid="smart-audience-save-as"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden />
                บันทึกเป็นกลุ่มใหม่
              </button>
            )}
            {selectedAudienceId && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="px-3 py-1.5 text-xs rounded-md border border-[var(--bd)] hover:border-rose-500 hover:text-rose-500 disabled:opacity-50 flex items-center gap-1"
                data-testid="smart-audience-delete"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden />
                ลบกลุ่ม
              </button>
            )}
            {saveError && (
              <span
                className="text-xs text-rose-500"
                data-testid="smart-audience-save-error"
              >
                {saveError}
              </span>
            )}
          </div>
        </div>

        <div
          className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg p-4"
          data-testid="smart-audience-rule-builder"
        >
          <RuleBuilder
            rule={rule}
            onChange={setRule}
            branches={branches}
            products={products}
            courses={courses}
          />
        </div>

        <AudiencePreviewPane
          loading={dataLoading || previewing}
          total={previewResult.total}
          sample={sampleCustomers}
          onExport={handleExport}
          canExport={!dataLoading && previewResult.total > 0}
        />
      </div>
    </div>
  );
}
