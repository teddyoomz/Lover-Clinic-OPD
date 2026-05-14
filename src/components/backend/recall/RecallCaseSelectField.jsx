import React, { useState, useRef, useEffect } from 'react';

/**
 * Phase 29.22 (2026-05-14) — typeahead picker for be_recall_cases.
 * Mirror ProductSelectField shape. Free-text input + filterable dropdown.
 * Click row → onPick({caseName, defaultDays}); typing → onChange(text).
 *
 * @param {object} props
 * @param {string} props.value
 * @param {Array<{caseId,caseName,defaultDays}>} props.recallCases
 * @param {(text:string)=>void} props.onChange
 * @param {({caseName,defaultDays}:object)=>void} props.onPick
 * @param {string} [props['data-field']]
 * @param {string} [props.placeholder]
 */
export function RecallCaseSelectField({
  value,
  recallCases = [],
  onChange,
  onPick,
  placeholder = 'พิมพ์เพื่อค้นหา หรือเลือกเคสที่บันทึกไว้...',
  ...rest
}) {
  const [open, setOpen] = useState(false);
  // Internal query state — mirrors what the user typed in the input.
  // Initialized from `value` prop; updated on type (independent of whether
  // parent echoes onChange back to `value`). Click-row resets to caseName.
  const [internalQuery, setInternalQuery] = useState(value || '');
  const wrapperRef = useRef(null);
  const lastSyncedValueRef = useRef(value || '');

  // Sync internal query when parent's `value` changes via external set
  // (e.g. parent resets the slot). Don't override mid-typing — only when
  // value actually diverged from our last sync.
  useEffect(() => {
    const v = value || '';
    if (v !== lastSyncedValueRef.current) {
      setInternalQuery(v);
      lastSyncedValueRef.current = v;
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dataField = rest['data-field'];
  const dataTestId = rest['data-testid'] || 'recall-case-select-input';
  const query = internalQuery.trim().toLowerCase();
  const filtered = (recallCases || []).filter((c) => {
    if (!query) return true;
    return typeof c.caseName === 'string' && c.caseName.toLowerCase().includes(query);
  });
  const visible = filtered.slice(0, 20);

  return (
    <div ref={wrapperRef} className="relative" data-field={dataField}>
      <input
        type="text"
        value={internalQuery}
        onChange={(e) => {
          const text = e.target.value;
          setInternalQuery(text);
          lastSyncedValueRef.current = text; // prevent re-sync overwrite
          onChange?.(text);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-xs rounded border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--tx-primary)]"
        data-testid={dataTestId}
      />
      {open && visible.length > 0 && (
        <div
          className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded border border-[var(--border-card)] bg-[var(--bg-card)] shadow-lg"
          data-testid="recall-case-select-dropdown"
        >
          {visible.map((c) => (
            <button
              type="button"
              key={c.caseId || c.id}
              onMouseDown={(e) => {
                e.preventDefault();
                setInternalQuery(c.caseName);
                lastSyncedValueRef.current = c.caseName;
                onPick?.({ caseName: c.caseName, defaultDays: c.defaultDays });
                setOpen(false);
              }}
              data-recall-case-row
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--bg-hover)] flex justify-between items-center gap-2"
            >
              <span className="text-[var(--tx-primary)] truncate">{c.caseName}</span>
              <span className="text-[10px] text-[var(--tx-secondary)] shrink-0">
                {c.defaultDays} วัน
              </span>
            </button>
          ))}
          {filtered.length > 20 && (
            <div className="px-2 py-1 text-[10px] text-[var(--tx-secondary)] text-center border-t border-[var(--border-card)]">
              ... และอีก {filtered.length - 20} เคส (พิมพ์เพื่อกรอง)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
