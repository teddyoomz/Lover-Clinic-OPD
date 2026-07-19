// ─── Number-input wheel guard (2026-07-19, user directive) ───────────────────
//
// User: "ช่องใส่จำนวนเงินทุกที่ ห้าม scroll mouse ปรับค่า — user ชอบพลาดมือ
// คีย์จำนวนเงินผิด ส่วนช่องจำนวนอื่นๆ ให้ scroll ปรับได้ทีละ 1 เสมอ".
//
// ONE global capture-phase wheel listener (installed once in App.jsx) covers
// every `<input type="number">` in the app — SAFE-BY-DEFAULT (V54 lesson):
//
//   - DEFAULT (no data attr): wheel over the FOCUSED input → blur() → the
//     typed value is untouched and the page scrolls normally. Money fields
//     need ZERO per-site wiring, and every FUTURE number input is born safe.
//   - `data-wheelable`: quantity-style fields opt in → wheel adjusts the
//     value by EXACTLY ±1 (never the step attr's 0.01/0.1), clamped to
//     min/max. The step attr is left alone so typed decimals stay valid.
//
// Unfocused inputs are ignored entirely (native Chrome only wheel-changes a
// focused input, so there is nothing to guard and page scroll must proceed).
//
// Classifier lock: tests/number-input-wheel-guard.test.jsx — money-keyword
// inputs must NEVER carry data-wheelable.

/** React 16+ hides direct .value writes from onChange — go through the
 *  native prototype setter then fire a bubbling input event. */
function setNativeInputValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Pure step math (exported for tests): current + (wheel-up ? +1 : -1),
 *  clamped to the input's min/max attrs when present. */
export function nextWheelableValue({ value, deltaY, min, max }) {
  const cur = Number.parseFloat(value);
  const base = Number.isFinite(cur) ? cur : 0;
  let next = base + (deltaY < 0 ? 1 : -1);
  const lo = Number.parseFloat(min);
  const hi = Number.parseFloat(max);
  if (Number.isFinite(lo) && next < lo) next = lo;
  if (Number.isFinite(hi) && next > hi) next = hi;
  return next;
}

export function handleNumberInputWheel(e) {
  const el = e.target;
  if (!el || el.tagName !== 'INPUT' || el.type !== 'number') return;
  if (el.ownerDocument.activeElement !== el) return; // unfocused = native no-op; let the page scroll
  if (el.dataset.wheelable === undefined) {
    // Money-safe default: drop focus so the browser can't spin the value;
    // the wheel event then scrolls the page like over any other element.
    el.blur();
    return;
  }
  if (el.disabled || el.readOnly) return;
  e.preventDefault(); // take over: ALWAYS ±1 regardless of the step attr
  const next = nextWheelableValue({ value: el.value, deltaY: e.deltaY, min: el.min, max: el.max });
  if (String(next) !== el.value) setNativeInputValue(el, next);
}

/** Install once at app root. Non-passive because the wheelable branch calls
 *  preventDefault. Returns the uninstaller (for tests / HMR). */
export function installNumberInputWheelGuard(doc = document) {
  doc.addEventListener('wheel', handleNumberInputWheel, { capture: true, passive: false });
  return () => doc.removeEventListener('wheel', handleNumberInputWheel, { capture: true });
}
