// V33-customer-create — canonical scroll-to-error helper.
// Rule of 3: PatientForm + SaleTab + TreatmentFormPage + CustomerFormModal = 4
// call sites for the same alert+scroll+focus+ring-flash pattern. Extracted to
// reduce drift; one place to fix the UX.
//
// Original pattern (PatientForm.jsx:254-260):
//   alert(msg) → setTimeout(100ms) → querySelector by data-field/name →
//   scrollIntoView smooth+center → focus → add ring-red-500 → remove after 3s.

const DEFAULT_RING_DURATION_MS = 3000;
const DEFAULT_FOCUS_DELAY_MS = 100;

/**
 * Show an alert + scroll to the offending field + flash a red ring.
 *
 * @param {string} fieldName  — matches `data-field="X"` or `name="X"` on the input
 * @param {string} message    — Thai user-facing error
 * @param {object} [opts]
 * @param {boolean} [opts.useAlert=true]      — show window.alert (some flows prefer inline UI)
 * @param {number}  [opts.ringDurationMs=3000]
 * @param {number}  [opts.focusDelayMs=100]
 */
export function scrollToFieldError(fieldName, message, opts = {}) {
  const {
    useAlert = true,
    ringDurationMs = DEFAULT_RING_DURATION_MS,
    focusDelayMs = DEFAULT_FOCUS_DELAY_MS,
  } = opts;

  if (useAlert && message && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message);
  }

  if (typeof document === 'undefined' || !fieldName) return;

  // Defer querySelector so React has a chance to render error state first.
  setTimeout(() => {
    const safe = String(fieldName).replace(/["\\]/g, '\\$&');
    const el = document.querySelector(`[data-field="${safe}"], [name="${safe}"]`);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      // Older jsdom polyfill — skip.
    }
    if (typeof el.focus === 'function') el.focus();
    if (el.classList) {
      el.classList.add('ring-2', 'ring-red-500');
      setTimeout(() => {
        if (el.classList) el.classList.remove('ring-2', 'ring-red-500');
      }, ringDurationMs);
    }
  }, focusDelayMs);
}
