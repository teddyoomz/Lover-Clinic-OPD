// Phase 15.6 / V35.1 (2026-04-28) — shared BatchSelectField typeahead picker.
//
// User directive (paired with Issue 1 portal fix): "ทำให้ทั้งหน้าสร้างใบโอน
// ย้ายสต็อกและสร้างใบเบิก ของทั้งสาขาและคลังกลาง ใช้ระบบ search เลือกรายการ
// สินค้าได้เหมือนกันกับ สร้าง Order นำเข้า".
//
// Mirror of ProductSelectField shape but for be_stock_batches: pick a
// specific batch (FEFO lot) rather than a master product. Same Portal-
// based dropdown so it can't be clipped by ancestor overflow.
//
// onChange signature: (batchId: string, record: object) => void
//   - batchId is what callers set on `it.sourceBatchId`
//   - record is the full batch doc — caller pulls .productName, .unit,
//     .qty.remaining, .qty.total for inline display.
//
// Caller pre-filters `options` (e.g. only the source tier's active batches
// from listStockBatches) — this component does NOT enforce scope.

import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown } from 'lucide-react';
import {
  composeBatchDisplayName,
  composeBatchSubtitle,
  filterBatchesByQuery,
} from '../../lib/batchSearchUtils.js';

export default function BatchSelectField({
  value,
  onChange,
  options,
  placeholder = '— เลือก batch / พิมพ์ค้นหา —',
  disabled = false,
  testId = 'batch-select-field',
  fieldKey,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState(null);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // V35.1-bis (2026-04-28) — smart positioning identical to ProductSelectField.
  // Flip dropdown UPWARD when below has < 160px AND above has more space.
  // Cap maxHeight by available viewport space so internal scroll works.
  const recomputeCoords = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const GAP = 4;
    const MARGIN = 8;
    const spaceBelow = vh - r.bottom - GAP - MARGIN;
    const spaceAbove = r.top - GAP - MARGIN;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    if (openUp) {
      const maxHeight = Math.max(120, Math.min(spaceAbove, 480));
      setCoords({ bottom: vh - r.top + GAP, left: r.left, width: r.width, maxHeight, flipUp: true });
    } else {
      const maxHeight = Math.max(120, Math.min(spaceBelow, 480));
      setCoords({ top: r.bottom + GAP, left: r.left, width: r.width, maxHeight, flipUp: false });
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    // V35.1-tris — scroll page so input sits ~120px from viewport top
    // when below is constrained. Mirrors ProductSelectField.
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const spaceBelow = vh - r.bottom;
      if (spaceBelow < 320 && r.top > 160) {
        const targetOffsetFromTop = 120;
        const delta = r.top - targetOffsetFromTop;
        window.scrollBy({ top: delta, behavior: 'auto' });
      }
    }
    recomputeCoords();
    const onScroll = () => recomputeCoords();
    const onResize = () => recomputeCoords();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const inWrapper = wrapperRef.current?.contains(e.target);
      const inDropdown = dropdownRef.current?.contains(e.target);
      if (!inWrapper && !inDropdown) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const safe = Array.isArray(options) ? options : [];
  const filtered = useMemo(() => filterBatchesByQuery(safe, query), [safe, query]);

  const selected = useMemo(() => {
    if (!value) return null;
    return safe.find(b => String(b?.batchId ?? b?.id ?? '') === String(value)) || null;
  }, [safe, value]);
  const closedDisplay = selected ? composeBatchDisplayName(selected) : (value ? `id: ${value}` : '');

  const dropdown = open && !disabled && coords ? createPortal(
    <div
      ref={dropdownRef}
      data-testid={`${testId}-dropdown`}
      data-flip-up={coords.flipUp ? 'true' : 'false'}
      className="fixed z-[1000] overflow-auto rounded-lg bg-[var(--bg-surface)] border border-[var(--bd)] shadow-xl"
      style={{
        ...(coords.flipUp
          ? { bottom: coords.bottom, left: coords.left, width: coords.width }
          : { top: coords.top, left: coords.left, width: coords.width }),
        maxHeight: coords.maxHeight,
      }}
    >
      {safe.length === 0 ? (
        <div className="px-3 py-3 text-xs text-[var(--tx-muted)]">ไม่มี batch ให้เลือก</div>
      ) : filtered.length === 0 ? (
        <div className="px-3 py-3 text-xs text-[var(--tx-muted)]">
          ไม่พบ batch ตรงกับ "{query}"
        </div>
      ) : (
        <>
          {filtered.slice(0, 50).map((b, i) => {
            const id = String(b?.batchId ?? b?.id ?? '');
            const isActive = id === String(value || '');
            return (
              <button
                key={id || i}
                type="button"
                data-batch-id={id}
                className={`w-full text-left px-3 py-2 text-xs border-b border-[var(--bd)] last:border-b-0 hover:bg-[var(--bg-hover)] ${isActive ? 'bg-[var(--bg-hover)]' : ''}`}
                onClick={() => {
                  onChange(id, b);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <div className="font-bold text-[var(--tx-primary)]">
                  {composeBatchDisplayName(b)}
                </div>
                {composeBatchSubtitle(b) && (
                  <div className="text-[10px] text-[var(--tx-muted)]">
                    {composeBatchSubtitle(b)}
                  </div>
                )}
              </button>
            );
          })}
          {filtered.length > 50 && (
            <div className="px-3 py-2 text-[10px] text-[var(--tx-muted)] bg-[var(--bg-hover)]">
              แสดง 50 รายการแรก จาก {filtered.length} — พิมพ์ค้นหาเพื่อกรองให้แคบลง
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className={`relative ${className}`} ref={wrapperRef} data-testid={testId}>
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={open ? query : closedDisplay}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); } }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          className="w-full pl-7 pr-7 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-rose-500 disabled:opacity-50"
          {...(fieldKey ? { 'data-field': fieldKey } : {})}
        />
        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
      </div>
      {dropdown}
    </div>
  );
}
