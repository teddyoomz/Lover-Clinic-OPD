// ─── MarketingFormShell — shared modal chrome for Phase 9 marketing forms ──
// Extracted from PromotionFormModal / CouponFormModal / VoucherFormModal
// (AV10). Provides: backdrop, click-out, ESC key, header (title + close X),
// scrollable body, error banner, footer with cancel + save buttons.
//
// Body content (form fields) is passed via `children`. The accent styling
// (button + glow) is driven by `clinicSettings.accentColor`.
//
// Rule C1 (Rule of 3): modal chrome duplicated across 3 form modals before
// this extract — 60+ LOC of boilerplate per modal collapsed into prop config.

import { useEffect, useRef } from 'react';
import { X, Save, Loader2, AlertCircle } from 'lucide-react';
import { hexToRgb } from '../../utils.js';

const MAX_WIDTH_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

const BODY_SPACING_CLASS = {
  3: 'space-y-3',
  4: 'space-y-4',
  5: 'space-y-5',
  6: 'space-y-6',
};

/**
 * @param {object} props
 * @param {boolean} props.isEdit — picks between titleCreate / titleEdit
 * @param {string} props.titleCreate — modal title when creating
 * @param {string} props.titleEdit — modal title when editing
 * @param {() => void} props.onClose
 * @param {() => void} props.onSave
 * @param {boolean} props.saving — disables close + shows spinner on save button
 * @param {string} [props.error] — appended to end of body
 * @param {'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'|'4xl'} [props.maxWidth='2xl']
 * @param {3|4|5|6} [props.bodySpacing=4] — tailwind space-y-N inside body
 * @param {string} [props.createLabel='สร้าง']
 * @param {string} [props.editLabel='บันทึก']
 * @param {{ accentColor?: string }} [props.clinicSettings]
 * @param {React.ReactNode} props.children — form body content
 */
export default function MarketingFormShell({
  isEdit,
  titleCreate,
  titleEdit,
  onClose,
  onSave,
  saving = false,
  error = '',
  maxWidth = '2xl',
  bodySpacing = 4,
  createLabel = 'สร้าง',
  editLabel = 'บันทึก',
  clinicSettings,
  children,
}) {
  const closeBtnRef = useRef(null);
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  // ESC closes the modal unless a save is in-flight.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const widthClass = MAX_WIDTH_CLASS[maxWidth] || MAX_WIDTH_CLASS['2xl'];
  const spacingClass = BODY_SPACING_CLASS[bodySpacing] || BODY_SPACING_CLASS[4];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose?.(); }}
    >
      <div
        className={`w-full ${widthClass} max-h-[92vh] rounded-2xl shadow-2xl flex flex-col bg-[var(--bg-surface)] border border-[var(--bd)]`}
        style={{ boxShadow: `0 0 40px rgba(${acRgb},0.2)` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--bd)]">
          <h2 className="text-lg font-black tracking-wider uppercase" style={{ color: ac }}>
            {isEdit ? titleEdit : titleCreate}
          </h2>
          <button
            ref={closeBtnRef}
            onClick={() => !saving && onClose?.()}
            disabled={saving}
            aria-label="ปิด"
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={`flex-1 overflow-y-auto px-6 py-5 ${spacingClass}`}>
          {children}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-sm text-red-300">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--bd)]">
          <button
            onClick={() => !saving && onClose?.()}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--bg-hover)] border border-[var(--bd)] disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, rgba(${acRgb},0.95), rgba(${acRgb},0.75))`,
              boxShadow: `0 0 15px rgba(${acRgb},0.4)`,
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? editLabel : createLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
