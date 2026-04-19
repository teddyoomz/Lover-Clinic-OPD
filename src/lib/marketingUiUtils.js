// ─── Marketing UI utils — Phase 9 shared helpers (AV10 extract) ────────────
// Small pure helpers used by Marketing Tabs (Promotion/Coupon/Voucher) and
// their form modals. Centralized here so scrollToField / id generation /
// accent helpers don't drift across the 3 tabs.
//
// Rule C1 (Rule of 3): scrollToField + generateId(prefix) duplicated across
// PromotionFormModal, CouponFormModal, VoucherFormModal before this extract.

/**
 * Scroll the element with `data-field="<name>"` into view, focus its first
 * input/textarea/select, and flash a red ring for 3 seconds. No-op on SSR.
 */
export function scrollToField(name) {
  if (typeof document === 'undefined' || !name) return;
  const el = document.querySelector(`[data-field="${name}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('ring-2', 'ring-red-500');
  setTimeout(() => el.classList.remove('ring-2', 'ring-red-500'), 3000);
  const input = el.querySelector('input, textarea, select');
  if (input) input.focus();
}

/**
 * Build a Marketing entity id with crypto-random suffix (per rule C2: no
 * Math.random for IDs, even though these aren't auth tokens).
 *
 * Shape: `<prefix>-<timestamp>-<8 hex chars>`, e.g. `PROMO-1712940000000-a1b2c3d4`
 *
 * @param {string} prefix — e.g. 'PROMO', 'COUP', 'VOUC' (uppercased).
 * @returns {string}
 */
export function generateMarketingId(prefix) {
  const p = String(prefix || 'ITEM').toUpperCase();
  // crypto.getRandomValues is available in modern browsers + Node 16+.
  // In tests (jsdom) it's polyfilled; fallback below guards SSR/old envs.
  let rand;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    rand = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Deterministic-free fallback — still not Math.random — derives from
    // hi-res clock. Only used in environments without crypto (rare).
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now().toString(36).replace('.', '')
      : Date.now().toString(36);
    rand = now.slice(-8).padStart(8, '0');
  }
  return `${p}-${Date.now()}-${rand}`;
}

/**
 * Resolve whether the current theme should render dark variants.
 * Marketing tabs pass `theme` through to their modal to style accents; this
 * centralizes the `auto` detection so the logic doesn't drift.
 */
export function resolveIsDark(theme) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  // 'auto' or undefined — check browser preference (SSR-safe).
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}
