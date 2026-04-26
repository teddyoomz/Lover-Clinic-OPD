// ─── RequiredAsterisk — shared required-field marker ────────────────────────
// 2026-04-26 (Polish): Thai cultural rule — สีแดงสื่อความตาย; required
// markers should be amber/orange, not red. Replaces 40+ inline
// `<span className="text-red-{400,500}">*</span>` across backend forms.
// `aria-hidden` because the input's own `required` attribute is the
// screen-reader source of truth for required-state.

export default function RequiredAsterisk({ className = '' }) {
  return (
    <span
      className={`text-amber-500 ${className}`.trim()}
      aria-hidden="true"
    >
      *
    </span>
  );
}
