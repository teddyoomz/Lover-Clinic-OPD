// ─── UnitField — smart unit dropdown ────────────────────────────────────────
// Phase 15.4 (2026-04-28) — Rule C1 Rule-of-3 extract.
//
// When the picked product has a configured `defaultProductUnitGroupId`,
// renders a <select> with all unit names from that group (base + larger
// packs). Falls back to free-text <input> for products without a group
// (legacy data, or admin hasn't set up unit-group yet) so existing flows
// keep working.
//
// Originally inlined in OrderPanel.jsx (commit 74985b8). Extracted here so
// CentralStockOrderPanel + Adjust/Transfer/Withdrawal forms can reuse the
// pattern (item 7 of s19 user EOD message).
//
// IMPORTANT: extracted as a sibling sub-component (NOT IIFE) per Rule
// 03-stack V5 — Vite OXC parser crashes on JSX-inline IIFE patterns.

import { getUnitOptionsForProduct } from '../../lib/unitFieldHelpers.js';

/**
 * @param {Object} props
 * @param {string} props.value — current unit value
 * @param {string[]} props.options — unit-name options (from getUnitOptionsForProduct)
 * @param {string} [props.inputCls] — Tailwind class string for select/input
 * @param {(e: any) => void} props.onChange — change handler (event-style)
 * @param {boolean} [props.disabled] — read-only mode (renders <select> as disabled OR <input> readOnly)
 * @param {string} [props.testId='unit'] — data-testid prefix; renders `${testId}-select` / `${testId}-input`
 * @param {string} [props.placeholder='U'] — input placeholder when fallback to free-text
 */
export default function UnitField({
  value,
  options,
  inputCls,
  onChange,
  disabled = false,
  testId = 'unit',
  placeholder = 'U',
}) {
  if (Array.isArray(options) && options.length > 0) {
    return (
      <select
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        className={inputCls}
        data-testid={`${testId}-select`}
      >
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={value || ''}
      onChange={onChange}
      disabled={disabled}
      readOnly={disabled}
      className={inputCls}
      placeholder={placeholder}
      data-testid={`${testId}-input`}
    />
  );
}

// Re-export the helper for ergonomic single-import usage in form panels:
//   import UnitField, { getUnitOptionsForProduct } from './UnitField.jsx';
export { getUnitOptionsForProduct };
