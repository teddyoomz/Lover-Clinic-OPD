// ─── Pick Products Modal — Phase 12.2b (2026-04-24) ──────────────────────
// Triggered from TreatmentFormPage when the doctor clicks the pick-icon
// on a "เลือกสินค้าตามจริง" course entry. Lists every availableProducts
// option configured on the master course with a checkbox + qty input
// (pre-filled with the master's configured qty, editable but bounded by
// the option's maxQty when configured). On confirm, the placeholder
// customerCourses entry is resolved via resolvePickedCourseEntry and the
// picked products behave as standard course sub-rows.
//
// Matches ProClinic's flow: "เลือกสินค้ามา, กำหนดจำนวน, แล้วกดยืนยัน
// คอร์สจะถูกประกอบตาม pick แล้วใช้แบบ course ปกติจนหมด".

import { useState, useMemo } from 'react';

export default function PickProductsModal({ courseName, availableProducts, onCancel, onConfirm }) {
  // Initial state: all unchecked, qty = configured default for each option.
  const initialRows = useMemo(() => {
    return (availableProducts || []).map((p, idx) => ({
      key: `${p.productId}-${idx}`,
      productId: String(p.productId || ''),
      name: p.name || '',
      unit: p.unit || '',
      minQty: p.minQty != null ? Number(p.minQty) : null,
      maxQty: p.maxQty != null ? Number(p.maxQty) : null,
      defaultQty: Number(p.qty) || 0,
      picked: false,
      qty: Number(p.qty) || 0,
    }));
  }, [availableProducts]);

  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState('');

  const updateRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const toggle = (key) => {
    setError('');
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, picked: !r.picked } : r)));
  };

  const pickedCount = rows.filter((r) => r.picked).length;

  const handleConfirm = () => {
    const picked = rows.filter((r) => r.picked);
    if (picked.length === 0) {
      setError('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ');
      return;
    }
    // Validate qty: must be positive; if maxQty set, cap; if minQty set, floor.
    for (const r of picked) {
      const n = Number(r.qty);
      if (!Number.isFinite(n) || n <= 0) {
        setError(`จำนวน "${r.name}" ต้องมากกว่า 0`);
        return;
      }
      if (r.maxQty != null && Number.isFinite(r.maxQty) && n > r.maxQty) {
        setError(`จำนวน "${r.name}" เกินขีดสูงสุด (${r.maxQty} ${r.unit})`);
        return;
      }
      if (r.minQty != null && Number.isFinite(r.minQty) && n < r.minQty) {
        setError(`จำนวน "${r.name}" ต่ำกว่าขีดต่ำสุด (${r.minQty} ${r.unit})`);
        return;
      }
    }
    onConfirm(picked.map((r) => ({
      productId: r.productId,
      name: r.name,
      qty: Number(r.qty),
      unit: r.unit,
    })));
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pick-modal-title"
      onClick={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl shadow-2xl bg-[var(--bg-base)] border border-[var(--bd)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[var(--bd)]">
          <h3 id="pick-modal-title" className="text-sm font-black text-teal-500">
            เลือกสินค้า (คอร์ส {courseName})
          </h3>
        </div>

        <div className="px-5 py-3 space-y-2 max-h-[60vh] overflow-y-auto">
          {rows.length === 0 ? (
            <p className="text-xs text-[var(--tx-muted)] italic text-center py-4">
              ไม่มีสินค้าให้เลือก — ตรวจสอบการตั้งค่าคอร์ส
            </p>
          ) : (
            rows.map((r) => (
              <div key={r.key} className="flex items-center gap-3">
                <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={r.picked}
                    onChange={() => toggle(r.key)}
                    className="w-4 h-4 accent-teal-500 shrink-0"
                    aria-label={`เลือก ${r.name}`}
                  />
                  <span className={`text-sm truncate ${r.picked ? 'font-bold text-[var(--tx-primary)]' : 'text-[var(--tx-secondary)]'}`}>
                    {r.name}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={r.qty}
                  onChange={(e) => updateRow(r.key, { qty: e.target.value })}
                  disabled={!r.picked}
                  className="w-24 px-2 py-1 rounded text-right text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] disabled:opacity-40"
                />
                <span className="text-xs text-[var(--tx-muted)] shrink-0 w-10">{r.unit}</span>
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-red-400 border-t border-red-500/30 bg-red-500/5">
            {error}
          </div>
        )}

        <div className="px-5 py-3 border-t border-[var(--bd)] flex items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--tx-muted)]">
            เลือกแล้ว {pickedCount} / {rows.length} รายการ
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-xs font-bold border border-[var(--bd)] text-[var(--tx-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pickedCount === 0}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-teal-500 text-white hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ยืนยัน
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
