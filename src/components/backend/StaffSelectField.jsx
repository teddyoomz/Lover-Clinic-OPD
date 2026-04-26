// V32-tris (2026-04-26) — shared StaffSelectField component for document
// templates. Extracted from DocumentPrintModal so BulkPrintModal can render
// the SAME smart dropdown for staff-select fields (per user directive
// "ทำแบบฉลาดๆ smart อะ").
//
// Searchable combobox loaded from be_doctors / be_staff. The stored value
// is the display name (string), so the template's {{key}} placeholder
// continues to render the same way as a free-text field.
//
// onChange signature: (displayName: string, record: object) => void
//   - displayName goes into the form value
//   - record is the picked be_doctors / be_staff doc — caller uses it to
//     auto-fill linked fields via documentFieldAutoFill.computeStaffAutoFill
//
// V32-tris bug fix: original DocumentPrintModal version called onChange
// with ONLY the display name, so the smart auto-fill never fired. Now
// emits both args so auto-fill works.

import { useState, useEffect, useRef } from 'react';
import RequiredAsterisk from '../ui/RequiredAsterisk.jsx';
import { composeStaffDisplayName, composeStaffSubtitle, filterStaffByQuery } from '../../lib/documentFieldAutoFill.js';

export default function StaffSelectField({ field, value, list, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const loading = list === null;
  const safe = Array.isArray(list) ? list : [];
  const filtered = filterStaffByQuery(safe, query);

  return (
    <div className="space-y-1" ref={ref} data-testid={`staff-select-${field.key}`}>
      <label className="block text-xs text-[var(--tx-muted)]">
        {field.label || field.key}{field.required && <RequiredAsterisk className="ml-0.5" />}
        {!loading && safe.length > 0 && (
          <span className="ml-2 text-[10px] opacity-50">({safe.length} รายการ)</span>
        )}
      </label>
      <div className="relative">
        <input
          type="text"
          value={open ? query : value}
          placeholder={loading ? 'กำลังโหลด...' : value || 'พิมพ์ค้นหา หรือคลิกเพื่อเลือก'}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          className="w-full px-2 py-1.5 rounded text-xs bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]"
          data-field={field.key}
        />
        {open && !loading && (
          <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-[var(--bg-surface)] border border-[var(--bd)] shadow-xl">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--tx-muted)]">ไม่พบรายการ</div>
            ) : (
              filtered.slice(0, 50).map((p, i) => (
                <button
                  key={p.id || i}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-hover)] border-b border-[var(--bd)] last:border-b-0"
                  onClick={() => {
                    // V32-tris fix: emit BOTH display name AND record so the
                    // caller can run smart auto-fill. Original version only
                    // emitted displayName — auto-fill never fired.
                    onChange(composeStaffDisplayName(p), p);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <div className="font-bold text-[var(--tx-primary)]">{composeStaffDisplayName(p)}</div>
                  {composeStaffSubtitle(p) && (
                    <div className="text-[10px] text-[var(--tx-muted)]">{composeStaffSubtitle(p)}</div>
                  )}
                </button>
              ))
            )}
            {filtered.length > 50 && (
              <div className="px-3 py-2 text-[10px] text-[var(--tx-muted)] bg-[var(--bg-hover)]">
                แสดง 50 รายการแรก — พิมพ์ค้นหาเพื่อกรองให้แคบลง
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
