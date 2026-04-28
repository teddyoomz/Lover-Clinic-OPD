// Phase 15.6 / V35 (2026-04-28) — shared ProductSelectField typeahead picker.
//
// User directive: "ทำให้ Dropdown เลือกสินค้าในทุกหน้าของระบบสต็อค ทั้งของ tab
// สาขาและ tab คลังกลางสามารถ search ได้ด้วย ไม่ใช่เลือกได้อย่างเดียว สินค้า
// เยอะต้อง search ได้". 253+ products → plain <select> unusable.
//
// onChange signature: (id: string, record: object) => void
//   - id is the productId (caller usually stores this on the line item)
//   - record is the full product doc — caller uses it to pull unit, name,
//     cost, group, etc.
//
// Tier scope: caller passes pre-filtered `options` (e.g.
// StockAdjustPanel.availableProducts already filters by current tier's
// active batches) — this component does NOT enforce scope.
//
// Phase 15.6-bis (2026-04-28) — V35.1 portal-positioned dropdown.
// User report: "dropdown เลือกสินค้า ในหน้า สร้าง Order นำเข้า โดน box
// modal limit แล้วบังไว้ทำให้โชว์ dropdown ออกมาได้". Pre-fix: dropdown
// rendered as `position: absolute z-50` inside the input wrapper. Any
// ancestor with `overflow: hidden | auto | scroll` clipped it. The
// item-list scroll container in OrderPanel was the culprit. Fix: render
// dropdown via React Portal to document.body with `position: fixed`
// coords computed from the input's getBoundingClientRect. Reposition on
// scroll/resize while open. No ancestor can clip a fixed-positioned body
// child. Same fix benefits BatchSelectField.

import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown } from 'lucide-react';
import {
  composeProductDisplayName,
  composeProductSubtitle,
  filterProductsByQuery,
} from '../../lib/productSearchUtils.js';

/**
 * @param {object} props
 * @param {string} props.value — currently selected productId
 * @param {(id: string, record: object) => void} props.onChange
 * @param {Array} props.options — pre-filtered product list
 * @param {string} [props.placeholder]
 * @param {boolean} [props.disabled]
 * @param {string} [props.testId] — data-testid (default 'product-select-field')
 * @param {string} [props.fieldKey] — for `data-field` attr (scrollToError)
 * @param {string} [props.className] — extra wrapper classes
 */
export default function ProductSelectField({
  value,
  onChange,
  options,
  placeholder = '— เลือกสินค้า / พิมพ์ค้นหา —',
  disabled = false,
  testId = 'product-select-field',
  fieldKey,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState(null);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Compute portal coords from the input's bounding rect.
  // V35.1 fix: dropdown rendered in document.body so ancestor overflow
  // can't clip; positioning has to be computed manually.
  //
  // V35.1-bis (2026-04-28) — smart positioning: if there's not enough
  // space below the input, flip the dropdown UPWARD (anchor to input.top).
  // Always cap maxHeight to fit visible viewport so internal scroll works
  // and the dropdown never extends beyond the screen edge.
  // User report: "dropdown ออกมาด้านนอกแล้ว แต่ แสดงผลได้น้อยเนื่องจาก
  // ติด dropdown ของทั้ง page มันเลื่อนลงไม่ได้" — pre-fix max-h-72 was
  // a fixed 288px cap that could still extend beyond viewport when input
  // was near bottom. Page scroll is locked because position:fixed
  // dropdown isn't part of the page scroll context.
  const recomputeCoords = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const GAP = 4;          // px between input and dropdown
    const MARGIN = 8;       // px from viewport edge
    const spaceBelow = vh - r.bottom - GAP - MARGIN;
    const spaceAbove = r.top - GAP - MARGIN;
    // Open downward unless space below < 160px AND space above > space below
    // V35.1-tris+ (round 2) — flip up when below is constrained AND above
    // has meaningfully more room. Original threshold (spaceBelow < 160)
    // missed the common case where below = 200-400px while above is 500+
    // and the page can't scroll further (user report: "scrollbar ขวาสุด
    // ก็ยังเลื่อนลงมาไม่ได้").
    const openUp = (spaceBelow < 400 && spaceAbove > spaceBelow * 1.3) ||
                   (spaceBelow < 160);
    // V35.1-tris+ — cap raised from 480 to 720 (~15 rows at 48px each).
    // The scroll-into-view step above lifts the input toward viewport top,
    // so spaceBelow is usually large; let the cap follow.
    const HARD_CAP = 720;
    if (openUp) {
      const maxHeight = Math.max(120, Math.min(spaceAbove, HARD_CAP));
      setCoords({
        bottom: vh - r.top + GAP,  // anchor to input.top (use bottom CSS prop)
        left: r.left,
        width: r.width,
        maxHeight,
        flipUp: true,
      });
    } else {
      const maxHeight = Math.max(120, Math.min(spaceBelow, HARD_CAP));
      setCoords({
        top: r.bottom + GAP,
        left: r.left,
        width: r.width,
        maxHeight,
        flipUp: false,
      });
    }
  };

  // Reposition on open + scroll + resize (any of these can move the input)
  useLayoutEffect(() => {
    if (!open) return;
    // V35.1-tris+ (2026-04-28) — when dropdown opens, lift the input toward
    // the top of the viewport so the dropdown gets max possible space below.
    // User report (round 2): "scrollbar ขวาสุด ก็ยังเลื่อนลงมาไม่ได้อยู่ดี
    // dropdown มันสั้นไป แสดงรายการสินค้าน้อยไป". Pre-fix threshold was
    // spaceBelow < 320 (rare hit); now always scroll if input is more than
    // 50px past the target row. This guarantees ≥ ~70% of viewport for the
    // dropdown to expand.
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      const TARGET_TOP = 120;       // input lands ~120px from viewport top
      if (r.top > TARGET_TOP + 50) {
        const delta = r.top - TARGET_TOP;
        window.scrollBy({ top: delta, behavior: 'auto' });
      }
    }
    recomputeCoords();
    const onScroll = () => recomputeCoords();
    const onResize = () => recomputeCoords();
    window.addEventListener('scroll', onScroll, true);  // capture true → reposition on ANY ancestor scroll
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  // Close on outside-click. Wrapper OR dropdown click → keep open.
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
  const filtered = useMemo(() => filterProductsByQuery(safe, query), [safe, query]);

  const selected = useMemo(() => {
    if (!value) return null;
    return safe.find(p => String(p?.id ?? p?.productId ?? '') === String(value)) || null;
  }, [safe, value]);
  const closedDisplay = selected ? composeProductDisplayName(selected) : (value ? `id: ${value}` : '');

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
        <div className="px-3 py-3 text-xs text-[var(--tx-muted)]">ไม่มีสินค้าให้เลือก</div>
      ) : filtered.length === 0 ? (
        <div className="px-3 py-3 text-xs text-[var(--tx-muted)]">
          ไม่พบสินค้าตรงกับ "{query}"
        </div>
      ) : (
        <>
          {filtered.slice(0, 50).map((p, i) => {
            const id = String(p?.id ?? p?.productId ?? '');
            const isActive = id === String(value || '');
            return (
              <button
                key={id || i}
                type="button"
                data-product-id={id}
                className={`w-full text-left px-3 py-2 text-xs border-b border-[var(--bd)] last:border-b-0 hover:bg-[var(--bg-hover)] ${isActive ? 'bg-[var(--bg-hover)]' : ''}`}
                onClick={() => {
                  onChange(id, p);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <div className="font-bold text-[var(--tx-primary)]">
                  {composeProductDisplayName(p)}
                </div>
                {composeProductSubtitle(p) && (
                  <div className="text-[10px] text-[var(--tx-muted)]">
                    {composeProductSubtitle(p)}
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
