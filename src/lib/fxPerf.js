// ─── FX Perf — adaptive visual performance (2026-07-21) ─────────────────────
//
// User report (iPhone 17 Pro Max, TFP): fast scroll → half-white page that
// fills in <1s + the glow "breathing" itself stutters. MEASURED root cause:
// 10 full-width TFP cards run infinite BOX-SHADOW keyframes (v86-breath auto-
// glow) — animated shadows repaint their whole region every frame, so ~the
// entire page invalidates at 60fps forever. iOS's tile rasterizer can never
// cache tiles → scroll outruns raster → white. Device power cannot fix a page
// that dirties itself by design. (machinePerf = DATA layer only — there was
// NO visual tiering before this module; every device got max effects.)
//
// Two layers, driven through ONE CSS custom property (--fx-anim) that every
// box-shadow-animating rule consumes via `animation-play-state`:
//   1. installFxScrollPause() — html.is-scrolling during any scroll (+180ms
//      settle) pauses the breathers → tiles become cacheable → white gone on
//      EVERY tier. Breathing is invisible mid-scroll anyway, so FULL devices
//      lose nothing ("เครื่องแรงลื่นปกติ" — beauty intact at idle).
//   2. visual tier — html[data-visual-tier="eco"] pauses breath permanently +
//      dims the halo for weak machines. Resolution order: manual override
//      (health-card toggle) > hardware floor (≤2 cores / ≤2GB) > measured
//      frame-jank history (≥2 of last 3 sessions janky → eco — the
//      machinePerf "measure, don't guess" ethos). Default = full.
//
// PURITY: resolver + probe-recording are pure/injectable for tests. The only
// side effects live in apply/install functions. Beacon import is pure-safe.
import { reportTelemetryToBeacon } from './errorBeacon.js';

export const VISUAL_TIER_OVERRIDE_KEY = 'lover.visualTierOverride'; // 'auto' | 'full' | 'eco'
export const FRAME_JANK_HIST_KEY = 'lover.frameJankHist';
export const JANK_HIST_LEN = 3;
export const JANK_RATIO_THRESHOLD = 0.25; // >25% of frames dropped below ~20fps = janky session
export const JANK_FRAME_MS = 50;          // a rAF delta this slow = a visibly dropped frame
export const SCROLL_SETTLE_MS = 180;
export const PROBE_DELAY_MS = 3500;       // let boot/data work finish before sampling
export const PROBE_DURATION_MS = 2000;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked storage */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* blocked storage */ } }

function readHist() {
  try {
    const h = JSON.parse(lsGet(FRAME_JANK_HIST_KEY) || '[]');
    return Array.isArray(h) ? h : [];
  } catch { return []; }
}

/**
 * Pure tier resolution — no DOM/storage access (everything injected).
 * @returns {'full'|'eco'}
 */
export function resolveVisualTier({ override = 'auto', hist = [], deviceMemory = 0, cores = 0 } = {}) {
  if (override === 'full' || override === 'eco') return override;
  // hardware floor — instantly eco, no probe needed (genuinely weak device)
  if ((cores > 0 && cores <= 2) || (deviceMemory > 0 && deviceMemory <= 2)) return 'eco';
  const janky = hist.filter((h) => h && Number(h.ratio) > JANK_RATIO_THRESHOLD).length;
  if (hist.length >= 2 && janky >= 2) return 'eco';
  return 'full';
}

/** Current state for the health-card UI. */
export function getVisualTierState() {
  const override = lsGet(VISUAL_TIER_OVERRIDE_KEY) || 'auto';
  const hist = readHist();
  const applied = (typeof document !== 'undefined' && document.documentElement.dataset.visualTier) || 'full';
  return { override, hist, applied };
}

/** Health-card toggle. mode: 'auto' | 'full' | 'eco'. Re-applies immediately. */
export function setVisualTierOverride(mode) {
  if (mode === 'auto') lsDel(VISUAL_TIER_OVERRIDE_KEY);
  else if (mode === 'full' || mode === 'eco') lsSet(VISUAL_TIER_OVERRIDE_KEY, mode);
  applyVisualTier();
}

/** Resolve + stamp html[data-visual-tier]. Safe anywhere (no-op without DOM). */
export function applyVisualTier() {
  if (typeof document === 'undefined') return 'full';
  const tier = resolveVisualTier({
    override: lsGet(VISUAL_TIER_OVERRIDE_KEY) || 'auto',
    hist: readHist(),
    deviceMemory: Number(navigator.deviceMemory) || 0,
    cores: Number(navigator.hardwareConcurrency) || 0,
  });
  document.documentElement.dataset.visualTier = tier;
  return tier;
}

/**
 * Record one session's measured jank ratio (pure-ish; storage only).
 * Auto-flip telemetry when the record makes the resolver turn eco.
 * @returns {'flipped'|'recorded'|'skipped'}
 */
export function recordJankSample(ratio, { nowMs = Date.now() } = {}) {
  if (!Number.isFinite(ratio) || ratio < 0) return 'skipped';
  const before = resolveVisualTier({ hist: readHist() });
  let hist = readHist();
  hist.push({ t: nowMs, ratio: Math.round(ratio * 100) / 100 });
  hist = hist.slice(-JANK_HIST_LEN);
  lsSet(FRAME_JANK_HIST_KEY, JSON.stringify(hist));
  const after = resolveVisualTier({ hist });
  if (before === 'full' && after === 'eco') {
    // bucketed message (stable dedupe hash) — kind:'telemetry' (never counts
    // toward the error alert; visible in the health-card viewer)
    reportTelemetryToBeacon(`[client-env] auto-eco-visual reason=frame-jank ratio>${JANK_RATIO_THRESHOLD} hits=2of3`);
    return 'flipped';
  }
  return 'recorded';
}

/**
 * Sample rAF frame deltas for PROBE_DURATION_MS after PROBE_DELAY_MS idle,
 * then record. Skips when the tab is hidden (background rAF throttling would
 * read as fake jank). One probe per page load.
 */
export function startFrameJankProbe({ delayMs = PROBE_DELAY_MS, durationMs = PROBE_DURATION_MS } = {}) {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
  setTimeout(() => {
    if (document.visibilityState !== 'visible') return;
    const deltas = [];
    let last = performance.now();
    const endAt = last + durationMs;
    const tick = (now) => {
      deltas.push(now - last);
      last = now;
      if (now < endAt) requestAnimationFrame(tick);
      else {
        if (document.visibilityState !== 'visible' || deltas.length < 10) return; // tab hidden mid-probe → discard
        const janky = deltas.filter((d) => d > JANK_FRAME_MS).length;
        const changed = recordJankSample(janky / deltas.length);
        if (changed === 'flipped') applyVisualTier();
      }
    };
    requestAnimationFrame(tick);
  }, delayMs);
}

/**
 * Pause the shadow-breathing animations while ANY scroll is happening
 * (window or inner scrollers — capture phase). classList is touched only on
 * state CHANGE; the settle timer is the only per-event work.
 */
export function installFxScrollPause({ settleMs = SCROLL_SETTLE_MS } = {}) {
  if (typeof document === 'undefined') return () => {};
  let timer = null;
  let on = false;
  const el = document.documentElement;
  const onScroll = () => {
    if (!on) { on = true; el.classList.add('is-scrolling'); }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { on = false; el.classList.remove('is-scrolling'); }, settleMs);
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => {
    document.removeEventListener('scroll', onScroll, { capture: true });
    if (timer) clearTimeout(timer);
    el.classList.remove('is-scrolling');
  };
}

export function _resetFxPerfForTests() {
  lsDel(VISUAL_TIER_OVERRIDE_KEY);
  lsDel(FRAME_JANK_HIST_KEY);
  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.visualTier;
    document.documentElement.classList.remove('is-scrolling');
  }
}
