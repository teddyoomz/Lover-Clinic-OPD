// ─── Phase 14.7.F — Treatment edit stock-diff regression tests ─────────
//
// Bug 2026-04-26 (user report verbatim): "คืนสต็อกการรักษาเดิมไม่สำเร็จ:
// Missing or insufficient permissions. ในหน้าแก้ไขการรักษา … จะคืนเหี้ยไร
// กุแค่ edit รูป กับ chart ไปเพิ่ม"
//
// User edited only Before/After/Other photos + chart canvas — no stock
// items changed at all. handleSubmit unconditionally called
// reverseStockForTreatment which (a) was useless work, and (b) hit the
// `allow update: if false` block on be_stock_movements when it tried to
// stamp reversedByMovementId on the old movement.
//
// Two-part fix:
//   1. PURE — `hasStockChange(oldSnapshot, newDetail)` short-circuits the
//      reverse+rededuct path when stock-bearing arrays are shape-equal.
//   2. RULES — narrowed `allow update: if false` on be_stock_movements to
//      `allow update if hasOnly(['reversedByMovementId'])` so legitimate
//      reversal-link writes pass.
//
// This test bank locks both fixes:
//   S1 — pure hasStockChange invariants (boundary + adversarial)
//   S2 — TreatmentFormPage source-grep guards
//   S3 — firestore.rules source-grep guards

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { hasStockChange, stockShape } from '../src/lib/treatmentStockDiff.js';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ─── S1: pure hasStockChange + stockShape invariants ──────────────────────

describe('S1: hasStockChange pure helper', () => {
  // ─── Image-only edit (the actual bug — must NOT trigger stock change) ──
  it('S1.1: image-only edit returns false (no stock change)', () => {
    const old = {
      treatmentItems: [{ name: 'Botox', qty: '1', unit: 'U' }],
      consumables: [{ name: 'Gauze', qty: '2', unit: 'pcs' }],
      medications: [],
    };
    const newDetail = {
      treatmentItems: [{ name: 'Botox', qty: '1', unit: 'U' }],
      consumables: [{ name: 'Gauze', qty: '2', unit: 'pcs' }],
      medications: [],
      // Image / chart / dr.note fields are irrelevant to this helper —
      // they're not even passed in. The lack-of-change in stock arrays
      // alone gives us the green light to skip the reverse+rededuct.
    };
    expect(hasStockChange(old, newDetail)).toBe(false);
  });

  // ─── Stock change must trigger ──
  it('S1.2: adding a treatment item returns true', () => {
    const old = { treatmentItems: [], consumables: [], medications: [] };
    const newDetail = { treatmentItems: [{ name: 'Filler', qty: '1', unit: 'cc' }], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.3: removing a consumable returns true', () => {
    const old = { treatmentItems: [], consumables: [{ name: 'Mask', qty: '5', unit: 'pcs' }], medications: [] };
    const newDetail = { treatmentItems: [], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.4: editing qty on existing item returns true', () => {
    const old = { treatmentItems: [{ name: 'Botox', qty: '1', unit: 'U' }], consumables: [], medications: [] };
    const newDetail = { treatmentItems: [{ name: 'Botox', qty: '2', unit: 'U' }], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.5: editing unit returns true', () => {
    const old = { treatmentItems: [{ name: 'Botox', qty: '1', unit: 'U' }], consumables: [], medications: [] };
    const newDetail = { treatmentItems: [{ name: 'Botox', qty: '1', unit: 'cc' }], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.6: editing productName returns true', () => {
    const old = { treatmentItems: [{ name: 'Botox', qty: '1', unit: 'U' }], consumables: [], medications: [] };
    const newDetail = { treatmentItems: [{ name: 'Allergan', qty: '1', unit: 'U' }], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.7: editing productId returns true', () => {
    const old = { treatmentItems: [{ productId: 'A1', name: 'Botox', qty: '1', unit: 'U' }], consumables: [], medications: [] };
    const newDetail = { treatmentItems: [{ productId: 'A2', name: 'Botox', qty: '1', unit: 'U' }], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.8: reordering items returns true (false-positive accepted — extra reverse is correct)', () => {
    const old = {
      treatmentItems: [
        { name: 'Botox', qty: '1', unit: 'U' },
        { name: 'Filler', qty: '2', unit: 'cc' },
      ],
      consumables: [],
      medications: [],
    };
    const newDetail = {
      treatmentItems: [
        { name: 'Filler', qty: '2', unit: 'cc' },
        { name: 'Botox', qty: '1', unit: 'U' },
      ],
      consumables: [],
      medications: [],
    };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  // ─── Defensive: missing snapshot ──
  it('S1.9: null snapshot returns true (legacy behavior preserved)', () => {
    expect(hasStockChange(null, { treatmentItems: [], consumables: [], medications: [] })).toBe(true);
  });

  it('S1.10: undefined snapshot returns true', () => {
    expect(hasStockChange(undefined, { treatmentItems: [], consumables: [], medications: [] })).toBe(true);
  });

  it('S1.11: non-object snapshot (string/number) returns true', () => {
    expect(hasStockChange('snapshot-corrupted', {})).toBe(true);
    expect(hasStockChange(42, {})).toBe(true);
  });

  // ─── Empty / equivalent shapes ──
  it('S1.12: both empty returns false (no-op edit on empty stock)', () => {
    const old = { treatmentItems: [], consumables: [], medications: [] };
    const newDetail = { treatmentItems: [], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(false);
  });

  it('S1.13: missing arrays in newDetail treated as empty', () => {
    const old = { treatmentItems: [], consumables: [], medications: [] };
    expect(hasStockChange(old, {})).toBe(false);
    expect(hasStockChange(old, undefined)).toBe(false);
  });

  it('S1.14: name<->productName aliasing handled (snapshot might use either)', () => {
    // Saved doc shape uses `name` (TreatmentFormPage writer line ~1844).
    // Some legacy code uses `productName`. Either should produce the same
    // shape after normalization.
    const old = { treatmentItems: [{ productName: 'Botox', qty: '1', unit: 'U' }], consumables: [], medications: [] };
    const newDetail = { treatmentItems: [{ name: 'Botox', qty: '1', unit: 'U' }], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(false);
  });

  it('S1.15: medications-only change returns true', () => {
    const old = { treatmentItems: [], consumables: [], medications: [{ name: 'Paracetamol', qty: '10', unit: 'tab' }] };
    const newDetail = { treatmentItems: [], consumables: [], medications: [{ name: 'Paracetamol', qty: '20', unit: 'tab' }] };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.16: consumables-only change returns true', () => {
    const old = { treatmentItems: [], consumables: [{ name: 'Mask', qty: '5', unit: 'pcs' }], medications: [] };
    const newDetail = { treatmentItems: [], consumables: [{ name: 'Mask', qty: '6', unit: 'pcs' }], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.17: stockShape strips id / ui-flags / price / total', () => {
    const ui = [
      { id: 'tmp-1', name: 'Botox', qty: '1', unit: 'U', price: '5000', _selected: true, total: '5000' },
    ];
    expect(stockShape(ui)).toEqual([
      { productId: '', productName: 'Botox', qty: 1, unit: 'U' },
    ]);
  });

  it('S1.18: stockShape filters null/undefined/non-object entries', () => {
    expect(stockShape([null, undefined, 0, '', { name: 'x', qty: 1, unit: 'U' }, false])).toEqual([
      { productId: '', productName: 'x', qty: 1, unit: 'U' },
    ]);
  });

  it('S1.19: stockShape on non-array returns empty array', () => {
    expect(stockShape(null)).toEqual([]);
    expect(stockShape(undefined)).toEqual([]);
    expect(stockShape({ name: 'oops' })).toEqual([]);
    expect(stockShape('string')).toEqual([]);
  });

  it('S1.20: qty cast to Number — string "1" === number 1', () => {
    const old = { treatmentItems: [{ name: 'Botox', qty: 1, unit: 'U' }], consumables: [], medications: [] };
    const newDetail = { treatmentItems: [{ name: 'Botox', qty: '1', unit: 'U' }], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(false);
  });

  it('S1.21: NaN/garbage qty normalizes to 0', () => {
    const old = { treatmentItems: [{ name: 'Botox', qty: 'abc', unit: 'U' }], consumables: [], medications: [] };
    const newDetail = { treatmentItems: [{ name: 'Botox', qty: 0, unit: 'U' }], consumables: [], medications: [] };
    expect(hasStockChange(old, newDetail)).toBe(false);
  });

  // ─── Combined scenarios that exercise the OR-of-three branches ──
  it('S1.22: only treatmentItems differs → returns true (consumables + meds equal)', () => {
    const old = {
      treatmentItems: [{ name: 'A', qty: '1', unit: 'U' }],
      consumables: [{ name: 'B', qty: '1', unit: 'pcs' }],
      medications: [{ name: 'C', qty: '1', unit: 'tab' }],
    };
    const newDetail = {
      treatmentItems: [{ name: 'A2', qty: '1', unit: 'U' }],
      consumables: [{ name: 'B', qty: '1', unit: 'pcs' }],
      medications: [{ name: 'C', qty: '1', unit: 'tab' }],
    };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.23: only medications differs → returns true (early exit at the medications check)', () => {
    const old = {
      treatmentItems: [{ name: 'A', qty: '1', unit: 'U' }],
      consumables: [{ name: 'B', qty: '1', unit: 'pcs' }],
      medications: [{ name: 'C', qty: '1', unit: 'tab' }],
    };
    const newDetail = {
      treatmentItems: [{ name: 'A', qty: '1', unit: 'U' }],
      consumables: [{ name: 'B', qty: '1', unit: 'pcs' }],
      medications: [{ name: 'D', qty: '1', unit: 'tab' }],
    };
    expect(hasStockChange(old, newDetail)).toBe(true);
  });

  it('S1.24: simulates the exact bug scenario — image-edit only', () => {
    // Snapshot taken at edit-load time. User then adds 3 photos to
    // beforeImages/afterImages and re-saves. backendDetail in handleSubmit
    // has the SAME stock arrays (form state untouched) but new image arrays.
    // hasStockChange ONLY compares stock — it must return false so the
    // reverse+rededuct skips and Firestore sees zero stock writes.
    const realisticSnapshot = {
      treatmentItems: [
        { name: 'Allergan 100 U', qty: '1', unit: 'U', price: '5000' },
        { name: 'Hyaluronic Filler', qty: '1', unit: 'cc', price: '8000' },
      ],
      consumables: [
        { name: 'Numbing cream', qty: '1', unit: 'ml' },
      ],
      medications: [
        { name: 'Paracetamol', qty: '10', unit: 'เม็ด' },
      ],
    };
    const newDetailFromSave = {
      treatmentItems: [
        { name: 'Allergan 100 U', qty: '1', unit: 'U', price: '5000' },
        { name: 'Hyaluronic Filler', qty: '1', unit: 'cc', price: '8000' },
      ],
      consumables: [
        { name: 'Numbing cream', qty: '1', unit: 'ml' },
      ],
      medications: [
        { name: 'Paracetamol', qty: '10', unit: 'เม็ด' },
      ],
      // The edit added these — irrelevant to stock decision
      beforeImages: [{ dataUrl: 'data:image/...', id: 'X' }],
      otherImages: [{ dataUrl: 'data:image/...', id: 'Y' }],
      charts: [{ dataUrl: 'data:image/...', fabricJson: { v: 1 } }],
    };
    expect(hasStockChange(realisticSnapshot, newDetailFromSave)).toBe(false);
  });
});

// ─── S2: TreatmentFormPage source-grep regression guards ───────────────────

describe('S2: TreatmentFormPage wires hasStockChange to gate reverse+rededuct', () => {
  const TFP = READ('src/components/TreatmentFormPage.jsx');

  it('S2.1: imports hasStockChange from treatmentStockDiff.js (dynamic import inside handleSubmit)', () => {
    expect(TFP).toMatch(/hasStockChange/);
    // Lazy-loaded inside handleSubmit to avoid bumping the initial bundle —
    // the rest of TFP already chunks heavy modules this way.
    expect(TFP).toMatch(/import\(\s*['"]\.\.\/lib\/treatmentStockDiff\.js['"]\s*\)/);
  });

  it('S2.2: existingStockSnapshot state hook present + populated at edit-load', () => {
    expect(TFP).toMatch(/const\s*\[\s*existingStockSnapshot,\s*setExistingStockSnapshot\s*\]\s*=\s*useState\(null\)/);
    expect(TFP).toMatch(/setExistingStockSnapshot\(\{[\s\S]+?treatmentItems:\s*t\.treatmentItems\s*\|\|\s*\[\][\s\S]+?consumables:\s*t\.consumables\s*\|\|\s*\[\][\s\S]+?medications:\s*t\.medications\s*\|\|\s*\[\]/);
  });

  it('S2.3: stockChanged flag computed before reverseStockForTreatment', () => {
    expect(TFP).toMatch(/const\s+stockChanged\s*=\s*!isEdit\s*\|\|\s*hasStockChange\(existingStockSnapshot,/);
  });

  it('S2.4: reverseStockForTreatment gated by isEdit && stockChanged', () => {
    expect(TFP).toMatch(/if\s*\(\s*isEdit\s*&&\s*stockChanged\s*\)\s*\{[\s\S]+?reverseStockForTreatment\(treatmentId\)/);
  });

  it('S2.5: deductStockForTreatment (consumables+treatmentItems) gated by stockChanged', () => {
    // Pattern: inside the try block the deduct call must sit inside `if (stockChanged) { ... }`
    expect(TFP).toMatch(/if\s*\(\s*stockChanged\s*\)\s*\{[\s\S]+?deductStockForTreatment\(newTreatmentId,\s*\{[\s\S]+?consumables/);
  });

  it('S2.6: deductStockForTreatment (medications type-7) gated by stockChanged', () => {
    expect(TFP).toMatch(/if\s*\(\s*stockChanged\s*&&\s*!hasSale\s*&&\s*\(backendDetail\.medications/);
  });

  it('S2.7: legacy unconditional `if (isEdit)` reverse path GONE (regression guard)', () => {
    // The OLD pattern was `if (isEdit) { ... reverseStockForTreatment ... }`
    // with NO inner stockChanged gate. The new pattern always adds && stockChanged.
    // Anti-pattern grep: any `if (isEdit) {` that immediately calls reverseStockForTreatment
    // with no additional gate would fail this. Tightened to require && stockChanged.
    const reverseBlock = TFP.match(/reverseStockForTreatment\(treatmentId\)/);
    expect(reverseBlock).toBeTruthy();
    // The 80 chars BEFORE the reverseStockForTreatment call should contain `stockChanged`
    const idx = TFP.indexOf('reverseStockForTreatment(treatmentId)');
    const surrounding = TFP.slice(Math.max(0, idx - 200), idx);
    expect(surrounding).toMatch(/stockChanged/);
  });

  it('S2.8: error message preserved (Thai user-facing copy)', () => {
    expect(TFP).toMatch(/คืนสต็อกการรักษาเดิมไม่สำเร็จ:/);
  });
});

// ─── S3: firestore.rules narrowed update rule ──────────────────────────────

describe('S3: firestore.rules — be_stock_movements update narrowed', () => {
  const RULES = READ('firestore.rules');

  it('S3.1: update on be_stock_movements is conditional, not `false`', () => {
    // The OLD rule was `allow update, delete: if false;` — that blocked the
    // legitimate reversedByMovementId stamp inside _reverseOneMovement.
    // The NEW rule allows update IFF only reversedByMovementId is touched.
    expect(RULES).toMatch(/match\s+\/be_stock_movements\/\{movementId\}[\s\S]+?allow update:\s*if\s+isClinicStaff\(\)\s*&&\s*request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['reversedByMovementId'\]\)/);
  });

  it('S3.2: delete on be_stock_movements still locked (`if false`)', () => {
    expect(RULES).toMatch(/match\s+\/be_stock_movements\/\{movementId\}[\s\S]+?allow delete:\s*if\s+false/);
  });

  it('S3.3: read + create unchanged (still gated by isClinicStaff)', () => {
    expect(RULES).toMatch(/match\s+\/be_stock_movements\/\{movementId\}[\s\S]+?allow read,\s*create:\s*if\s+isClinicStaff\(\)/);
  });

  it('S3.4: rule comment preserves the audit-immutable contract reasoning', () => {
    expect(RULES).toMatch(/MOVEMENTS ARE IMMUTABLE EXCEPT/);
    expect(RULES).toMatch(/reversedByMovementId/);
    expect(RULES).toMatch(/Phase 14\.7\.F/);
  });
});
