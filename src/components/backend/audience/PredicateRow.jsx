// ─── PredicateRow — Phase 16.1 (2026-04-30) ─────────────────────────────────
// Renders a single predicate leaf inside the audience rule tree. Switches
// param UI by predicate.type. Always emits a fully-shaped predicate doc
// (no undefined leaves — V14 lock).

import { memo } from 'react';
import { Trash2 } from 'lucide-react';
import { PREDICATE_TYPES } from '../../../lib/audienceRules.js';

const PREDICATE_LABELS = Object.freeze({
  'age-range': 'อายุ',
  'gender': 'เพศ',
  'branch': 'สาขา',
  'source': 'ที่มา',
  'bought-x-in-last-n': 'ซื้อสินค้า/คอร์ส',
  'spend-bracket': 'ยอดใช้จ่ายรวม',
  'last-visit-days': 'มาล่าสุด',
  'has-unfinished-course': 'คอร์สคงเหลือ',
});

/** Default params per predicate type. Used when admin adds OR switches type. */
export function defaultParamsForType(type) {
  switch (type) {
    case 'age-range': return { min: 30, max: 60 };
    case 'gender': return { value: 'F' };
    case 'branch': return { branchIds: [] };
    case 'source': return { values: [] };
    case 'bought-x-in-last-n': return { kind: 'product', refId: '', months: 6 };
    case 'spend-bracket': return { min: 10000, max: null };
    case 'last-visit-days': return { op: '<=', days: 90 };
    case 'has-unfinished-course': return { value: true };
    default: return {};
  }
}

const numToInputValue = (v) => (Number.isFinite(v) ? String(v) : '');

// P5 perf — memoized so parent setState (e.g. unrelated rule mutations or
// toolbar typing) doesn't re-render every sibling row. Default shallow compare
// is sufficient because RuleBuilder builds new predicate object identities only
// when that specific row's data changes; refs (branches/products/courses) are
// stable per parent render.
function PredicateRow({ predicate, onChange, onDelete, branches, products, courses }) {
  const type = predicate?.type || 'age-range';
  const params = (predicate?.params && typeof predicate.params === 'object' && !Array.isArray(predicate.params))
    ? predicate.params
    : {};

  const patchParams = (patch) => {
    onChange({ kind: 'predicate', type, params: { ...params, ...patch } });
  };
  const changeType = (newType) => {
    onChange({ kind: 'predicate', type: newType, params: defaultParamsForType(newType) });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 p-2 rounded-md border border-[var(--bd)] bg-[var(--bg-surface)]"
      data-testid="predicate-row"
    >
      <select
        value={type}
        onChange={(e) => changeType(e.target.value)}
        className="px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
        data-testid="predicate-type-select"
        aria-label="ประเภทเงื่อนไข"
      >
        {PREDICATE_TYPES.map((t) => (
          <option key={t} value={t}>{PREDICATE_LABELS[t] || t}</option>
        ))}
      </select>

      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
        {renderParams(type, params, patchParams, { branches, products, courses })}
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="px-2 py-1 rounded text-xs text-[var(--tx-secondary)] hover:text-rose-500 hover:bg-rose-500/10"
        data-testid="predicate-delete"
        aria-label="ลบเงื่อนไข"
        title="ลบเงื่อนไข"
      >
        <Trash2 className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}

function renderParams(type, params, patchParams, refs) {
  switch (type) {
    case 'age-range':
      return (
        <>
          <span className="text-xs text-[var(--tx-secondary)]">อายุ</span>
          <input
            type="number" min={0} max={150}
            value={numToInputValue(params.min)}
            onChange={(e) => patchParams({ min: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-16 px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            placeholder="ขั้นต่ำ"
            data-testid="param-age-min"
            aria-label="อายุขั้นต่ำ (ปี)"
          />
          <span className="text-xs">–</span>
          <input
            type="number" min={0} max={150}
            value={numToInputValue(params.max)}
            onChange={(e) => patchParams({ max: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-16 px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            placeholder="สูงสุด"
            data-testid="param-age-max"
            aria-label="อายุสูงสุด (ปี)"
          />
          <span className="text-xs text-[var(--tx-secondary)]">ปี</span>
        </>
      );
    case 'gender':
      return (
        <select
          value={params.value || ''}
          onChange={(e) => patchParams({ value: e.target.value })}
          className="px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
          data-testid="param-gender"
          aria-label="เลือกเพศ"
        >
          <option value="">เลือกเพศ</option>
          <option value="F">หญิง</option>
          <option value="M">ชาย</option>
        </select>
      );
    case 'branch': {
      const list = Array.isArray(refs.branches) ? refs.branches : [];
      const selected = Array.isArray(params.branchIds) ? params.branchIds : [];
      return (
        <>
          <span className="text-xs text-[var(--tx-secondary)]">สาขา:</span>
          {list.length === 0 ? (
            <span className="text-xs text-[var(--tx-secondary)]">— ยังไม่มีสาขา</span>
          ) : list.map((b) => {
            const id = String(b.branchId || b.id);
            const checked = selected.includes(id);
            return (
              <label key={id} className="flex items-center gap-1 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const cur = selected.slice();
                    if (e.target.checked) {
                      if (!cur.includes(id)) cur.push(id);
                    } else {
                      const idx = cur.indexOf(id);
                      if (idx >= 0) cur.splice(idx, 1);
                    }
                    patchParams({ branchIds: cur });
                  }}
                  data-testid={`param-branch-${id}`}
                />
                <span>{b.name || id}</span>
              </label>
            );
          })}
        </>
      );
    }
    case 'source': {
      const csv = Array.isArray(params.values) ? params.values.join(', ') : '';
      return (
        <>
          <span className="text-xs text-[var(--tx-secondary)]">ที่มา (คั่นด้วย ,):</span>
          <input
            type="text"
            value={csv}
            onChange={(e) => {
              const arr = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              patchParams({ values: arr });
            }}
            className="flex-1 min-w-[160px] px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            placeholder="Facebook, Walk-in, LINE"
            data-testid="param-source"
            aria-label="ที่มาของลูกค้า (คั่นด้วยจุลภาค)"
          />
        </>
      );
    }
    case 'bought-x-in-last-n': {
      const list = params.kind === 'course'
        ? (Array.isArray(refs.courses) ? refs.courses : [])
        : (Array.isArray(refs.products) ? refs.products : []);
      return (
        <>
          <select
            value={params.kind || 'product'}
            onChange={(e) => patchParams({ kind: e.target.value, refId: '' })}
            className="px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-testid="param-bought-kind"
            aria-label="ประเภทรายการที่ซื้อ (สินค้า/คอร์ส)"
          >
            <option value="product">สินค้า</option>
            <option value="course">คอร์ส</option>
          </select>
          <select
            value={params.refId || ''}
            onChange={(e) => patchParams({ refId: e.target.value })}
            className="flex-1 min-w-[180px] px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-testid="param-bought-ref"
            aria-label={`เลือก${params.kind === 'course' ? 'คอร์ส' : 'สินค้า'}ที่ซื้อ`}
          >
            <option value="">เลือก{params.kind === 'course' ? 'คอร์ส' : 'สินค้า'}</option>
            {list.map((it) => {
              const id = String(it.productId || it.courseId || it.id || '');
              const label = String(it.name || it.product_name || it.course_name || id);
              return <option key={id} value={id}>{label}</option>;
            })}
          </select>
          <span className="text-xs text-[var(--tx-secondary)]">ใน</span>
          <input
            type="number" min={1} max={120}
            value={numToInputValue(params.months)}
            onChange={(e) => patchParams({ months: e.target.value === '' ? 0 : Number(e.target.value) })}
            className="w-16 px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-testid="param-bought-months"
            aria-label="จำนวนเดือนย้อนหลัง"
          />
          <span className="text-xs text-[var(--tx-secondary)]">เดือน</span>
        </>
      );
    }
    case 'spend-bracket':
      return (
        <>
          <span className="text-xs text-[var(--tx-secondary)]">ยอดรวม</span>
          <input
            type="number" min={0}
            value={numToInputValue(params.min)}
            onChange={(e) => patchParams({ min: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-24 px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            placeholder="ขั้นต่ำ"
            data-testid="param-spend-min"
            aria-label="ยอดใช้จ่ายขั้นต่ำ (บาท)"
          />
          <span className="text-xs">–</span>
          <input
            type="number" min={0}
            value={numToInputValue(params.max)}
            onChange={(e) => patchParams({ max: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-24 px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            placeholder="สูงสุด"
            data-testid="param-spend-max"
            aria-label="ยอดใช้จ่ายสูงสุด (บาท)"
          />
          <span className="text-xs text-[var(--tx-secondary)]">บาท</span>
        </>
      );
    case 'last-visit-days':
      return (
        <>
          <select
            value={params.op || '<='}
            onChange={(e) => patchParams({ op: e.target.value })}
            className="px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-testid="param-lastvisit-op"
            aria-label="ตัวดำเนินการการมาล่าสุด"
          >
            <option value="<=">มาภายใน</option>
            <option value=">=">ไม่มาเกิน</option>
          </select>
          <input
            type="number" min={0} max={36500}
            value={numToInputValue(params.days)}
            onChange={(e) => patchParams({ days: e.target.value === '' ? 0 : Number(e.target.value) })}
            className="w-20 px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
            data-testid="param-lastvisit-days"
            aria-label="จำนวนวันการมาล่าสุด"
          />
          <span className="text-xs text-[var(--tx-secondary)]">วัน</span>
        </>
      );
    case 'has-unfinished-course':
      return (
        <select
          value={params.value === false ? 'false' : 'true'}
          onChange={(e) => patchParams({ value: e.target.value === 'true' })}
          className="px-2 py-1 rounded text-xs bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-primary)]"
          data-testid="param-unfinished"
          aria-label="มีคอร์สคงเหลือหรือไม่"
        >
          <option value="true">มี</option>
          <option value="false">ไม่มี</option>
        </select>
      );
    default:
      return null;
  }
}

export default memo(PredicateRow);
