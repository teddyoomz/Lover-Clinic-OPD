// Phase 15.6 / V35 (2026-04-28) — shared ProductSelectField typeahead picker.
//
// User directive: "ทำให้ Dropdown เลือกสินค้าในทุกหน้าของระบบสต็อค ทั้งของ tab
// สาขาและ tab คลังกลางสามารถ search ได้ด้วย ไม่ใช่เลือกได้อย่างเดียว สินค้า
// เยอะต้อง search ได้". 253+ products → plain <select> unusable.
//
// Mirror of StaffSelectField (V32-tris) shape: typeahead input + dropdown +
// outside-click close + 50-result cap with overflow message + Thai sort.
//
// onChange signature: (id: string, record: object) => void
//   - id is the productId (caller usually stores this on the line item)
//   - record is the full product doc — caller uses it to pull unit, name,
//     cost, group, etc. Caller decides which fields to lift onto the row.
//
// Tier scope: caller passes pre-filtered `options` (e.g.
// StockAdjustPanel.availableProducts already filters by current tier's
// active batches) — this component does NOT enforce scope. Single
// responsibility: search + select.
//
// Rule C1 lock — Phase 15.6 audit S28 grep-checks each backend product
// picker imports from this file. No inline <select>{products.map(...)}.

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import {
  composeProductDisplayName,
  composeProductSubtitle,
  filterProductsByQuery,
} from '../../lib/productSearchUtils.js';

/**
 * @param {object} props
 * @param {string} props.value — currently selected productId
 * @param {(id: string, record: object) => void} props.onChange — picker callback
 * @param {Array} props.options — pre-filtered product list
 * @param {string} [props.placeholder] — input placeholder
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
  const ref = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const safe = Array.isArray(options) ? options : [];
  const filtered = useMemo(() => filterProductsByQuery(safe, query), [safe, query]);

  // Display the currently-selected product's name in the closed input.
  // When list comes from a different scope (tier change), value may not
  // resolve — fall back to id so admin sees something rather than empty.
  const selected = useMemo(() => {
    if (!value) return null;
    return safe.find(p => String(p?.id ?? p?.productId ?? '') === String(value)) || null;
  }, [safe, value]);
  const closedDisplay = selected ? composeProductDisplayName(selected) : (value ? `id: ${value}` : '');

  return (
    <div className={`relative ${className}`} ref={ref} data-testid={testId}>
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tx-muted)] pointer-events-none" />
        <input
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

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-lg bg-[var(--bg-surface)] border border-[var(--bd)] shadow-xl">
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
        </div>
      )}
    </div>
  );
}
