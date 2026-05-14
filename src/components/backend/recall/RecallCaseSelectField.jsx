import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

/**
 * Phase 29.22 (2026-05-14) — typeahead picker for be_recall_cases.
 *
 * Renders the dropdown via React Portal to `document.body` with
 * `position: fixed` so ancestors with `overflow: hidden` (e.g. the
 * RecallSlotCard outer wrapper, which uses overflow-hidden for rounded-
 * corner clipping + transition-all animation) CANNOT clip the dropdown.
 *
 * Mirrors ProductSelectField V35.1 canonical pattern (commit history:
 * "absolute-positioned dropdown clipped by ancestor overflow" class-of-
 * bug — V35.1 closed it permanently with portal + position-fixed +
 * coord-from-rect + smart flip-up).
 *
 * @param {object} props
 * @param {string} props.value
 * @param {Array<{caseId,caseName,defaultDays,isHidden?}>} props.recallCases
 * @param {(text:string)=>void} props.onChange
 * @param {({caseName,defaultDays}:object)=>void} props.onPick
 * @param {string} [props['data-field']]
 * @param {string} [props['data-testid']]
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
  // Internal query state — decoupled from value so typing always filters
  // (test L7.4 lock). Click row writes both internalQuery + onPick.
  const [internalQuery, setInternalQuery] = useState(value || '');
  const [coords, setCoords] = useState(null);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const lastSyncedValueRef = useRef(value || '');

  // Sync internal query when parent's value changes externally (e.g. slot
  // reset). Don't override mid-typing.
  useEffect(() => {
    const v = value || '';
    if (v !== lastSyncedValueRef.current) {
      setInternalQuery(v);
      lastSyncedValueRef.current = v;
    }
  }, [value]);

  // Compute portal coords from input's bounding rect — V35.1 canonical.
  const recomputeCoords = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const GAP = 4;
    const MARGIN = 8;
    const spaceBelow = vh - r.bottom - GAP - MARGIN;
    const spaceAbove = r.top - GAP - MARGIN;
    // Flip up when below is constrained AND above has meaningfully more room.
    const openUp = (spaceBelow < 240 && spaceAbove > spaceBelow * 1.3) ||
                   (spaceBelow < 120);
    const HARD_CAP = 320; // ~13 rows at 24px (compact typeahead)
    if (openUp) {
      setCoords({
        bottom: vh - r.top + GAP,
        left: r.left,
        width: r.width,
        maxHeight: Math.max(120, Math.min(spaceAbove, HARD_CAP)),
        flipUp: true,
      });
    } else {
      setCoords({
        top: r.bottom + GAP,
        left: r.left,
        width: r.width,
        maxHeight: Math.max(120, Math.min(spaceBelow, HARD_CAP)),
        flipUp: false,
      });
    }
  };

  // Reposition on open + scroll + resize (any of these can move the input).
  useLayoutEffect(() => {
    if (!open) return;
    recomputeCoords();
    const onScroll = () => recomputeCoords();
    const onResize = () => recomputeCoords();
    window.addEventListener('scroll', onScroll, true); // capture: any ancestor scroll
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  // Close on outside-click — both wrapper AND dropdown count as "inside"
  // because dropdown is rendered in document.body via portal (not a DOM
  // child of wrapper).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const inWrapper = wrapperRef.current?.contains(e.target);
      const inDropdown = dropdownRef.current?.contains(e.target);
      if (!inWrapper && !inDropdown) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const dataField = rest['data-field'];
  const dataTestId = rest['data-testid'] || 'recall-case-select-input';

  // Defense in depth: client-side filter excludes c.isHidden === true even
  // if parent passes stale data containing hidden cases.
  // Plus query-substring filter (case-insensitive).
  const query = internalQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = Array.isArray(recallCases) ? recallCases : [];
    return list.filter((c) => {
      if (!c) return false;
      if (c.isHidden === true) return false;
      if (!query) return true;
      return typeof c.caseName === 'string' && c.caseName.toLowerCase().includes(query);
    });
  }, [recallCases, query]);
  const visible = filtered.slice(0, 20);

  const dropdown = open && coords && visible.length > 0 ? createPortal(
    <div
      ref={dropdownRef}
      data-testid="recall-case-select-dropdown"
      data-flip-up={coords.flipUp ? 'true' : 'false'}
      className="fixed z-[1000] overflow-auto rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] shadow-xl"
      style={{
        ...(coords.flipUp
          ? { bottom: coords.bottom, left: coords.left, width: coords.width }
          : { top: coords.top, left: coords.left, width: coords.width }),
        maxHeight: coords.maxHeight,
      }}
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
          className="w-full text-left px-3 py-2 text-xs border-b border-[var(--border-card)] last:border-b-0 hover:bg-[var(--bg-hover)] flex justify-between items-center gap-2"
        >
          <span className="text-[var(--tx-primary)] truncate">{c.caseName}</span>
          <span className="text-[10px] text-[var(--tx-secondary)] shrink-0">
            {c.defaultDays} วัน
          </span>
        </button>
      ))}
      {filtered.length > 20 && (
        <div className="px-3 py-2 text-[10px] text-[var(--tx-secondary)] text-center border-t border-[var(--border-card)] bg-[var(--bg-hover)]">
          ... และอีก {filtered.length - 20} เคส (พิมพ์เพื่อกรอง)
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapperRef} className="relative" data-field={dataField}>
      <input
        ref={inputRef}
        type="text"
        value={internalQuery}
        onChange={(e) => {
          const text = e.target.value;
          setInternalQuery(text);
          lastSyncedValueRef.current = text;
          onChange?.(text);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-xs rounded border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--tx-primary)]"
        data-testid={dataTestId}
      />
      {dropdown}
    </div>
  );
}
