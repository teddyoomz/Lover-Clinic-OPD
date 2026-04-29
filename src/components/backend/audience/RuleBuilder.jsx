// ─── RuleBuilder — Phase 16.1 (2026-04-30) ──────────────────────────────────
// Recursive tree renderer for audience rule builder.
// Each group has op (AND/OR) + children (groups OR predicates).
// Depth capped at 4 for sensible UX (validator allows 6).

import { Plus } from 'lucide-react';
import PredicateRow, { defaultParamsForType } from './PredicateRow.jsx';

const MAX_NEST_DEPTH_UI = 3;

export default function RuleBuilder({ rule, onChange, branches, products, courses, depth = 0 }) {
  const op = rule?.op === 'OR' ? 'OR' : 'AND';
  const children = Array.isArray(rule?.children) ? rule.children : [];

  function setOp(newOp) {
    onChange({ ...rule, kind: 'group', op: newOp, children });
  }
  function setChildren(next) {
    onChange({ ...rule, kind: 'group', op, children: next });
  }
  function patchChild(idx, next) {
    const arr = children.slice();
    arr[idx] = next;
    setChildren(arr);
  }
  function deleteChild(idx) {
    const arr = children.slice();
    arr.splice(idx, 1);
    setChildren(arr);
  }
  function addPredicate() {
    setChildren([
      ...children,
      { kind: 'predicate', type: 'age-range', params: defaultParamsForType('age-range') },
    ]);
  }
  function addGroup() {
    setChildren([
      ...children,
      { kind: 'group', op: 'AND', children: [] },
    ]);
  }

  const indent = Math.min(depth, MAX_NEST_DEPTH_UI) * 16;

  return (
    <div
      className="flex flex-col gap-2"
      style={{ marginLeft: indent }}
      data-testid={`rule-group-depth-${depth}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={op}
          onChange={(e) => setOp(e.target.value)}
          className="px-2 py-1 rounded text-xs font-semibold bg-[var(--bg-card)] border border-[var(--bd)] text-[var(--tx-heading)]"
          data-testid={`rule-op-depth-${depth}`}
        >
          <option value="AND">ทั้งหมด (AND)</option>
          <option value="OR">อย่างน้อยหนึ่ง (OR)</option>
        </select>
        <span className="text-xs text-[var(--tx-secondary)]">
          {children.length === 0 ? '— ยังไม่มีเงื่อนไข' : `ของเงื่อนไข ${children.length} ข้อ`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={addPredicate}
            className="px-2 py-1 rounded text-xs border border-[var(--bd)] hover:border-emerald-500 flex items-center gap-1"
            data-testid={`rule-add-predicate-depth-${depth}`}
          >
            <Plus className="w-3 h-3" aria-hidden />
            เงื่อนไข
          </button>
          {depth < MAX_NEST_DEPTH_UI && (
            <button
              type="button"
              onClick={addGroup}
              className="px-2 py-1 rounded text-xs border border-[var(--bd)] hover:border-sky-500 flex items-center gap-1"
              data-testid={`rule-add-group-depth-${depth}`}
            >
              <Plus className="w-3 h-3" aria-hidden />
              กลุ่ม
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {children.length === 0 ? (
          <div className="text-xs text-[var(--tx-secondary)] italic px-2 py-3 border border-dashed border-[var(--bd)] rounded text-center">
            กดปุ่ม "เงื่อนไข" หรือ "กลุ่ม" เพื่อเริ่มสร้างกลุ่มเป้าหมาย
          </div>
        ) : children.map((child, idx) => {
          if (child?.kind === 'group') {
            return (
              <div
                key={idx}
                className="rounded-md border border-dashed border-[var(--bd)] p-2 bg-[var(--bg-surface)]"
                data-testid={`rule-child-group-${depth}-${idx}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--tx-secondary)]">กลุ่มย่อย</span>
                  <button
                    type="button"
                    onClick={() => deleteChild(idx)}
                    className="text-xs text-rose-500 hover:underline"
                    data-testid={`rule-group-delete-${depth}-${idx}`}
                  >
                    ลบกลุ่ม
                  </button>
                </div>
                <RuleBuilder
                  rule={child}
                  onChange={(next) => patchChild(idx, next)}
                  branches={branches}
                  products={products}
                  courses={courses}
                  depth={depth + 1}
                />
              </div>
            );
          }
          return (
            <PredicateRow
              key={idx}
              predicate={child}
              onChange={(next) => patchChild(idx, next)}
              onDelete={() => deleteChild(idx)}
              branches={branches}
              products={products}
              courses={courses}
            />
          );
        })}
      </div>
    </div>
  );
}
