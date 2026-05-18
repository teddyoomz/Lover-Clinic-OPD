// Backend Menu D — Sub-tab picker. Opens when an ArcBloom orb with ≥2 sub-tabs
// is clicked. Desktop ≥768px: V5 3D Tilt Stack + interactive mouse-follow.
// Mobile <768px: V2 Expanding Bubble (parent gradient, scale-zoom from orb).
//
// Single-item sections (customers, finance) bypass this picker — ArcBloom's
// handleOrbClick gates on items.length ≥ 2 before mounting this component.
//
// Cosmetic-shell rule: emits onNavigate(itemId) verbatim · no flow/logic
// changes outside this picker step.

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSubTabEmoji } from './subTabEmoji.js';

const MD_BREAKPOINT = 768;

// EOD+5 polish (2026-05-18) — module-level cursor tracker so the picker can
// seed mouse-follow tilt IMMEDIATELY on open from the last-known cursor
// position instead of waiting for the first mousemove. User report verbatim:
// "ตามทันทีที่เปิด sub tab". Single passive listener; minimal perf cost.
let _lastCursorX = 0;
let _lastCursorY = 0;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'mousemove',
    (e) => {
      _lastCursorX = e.clientX;
      _lastCursorY = e.clientY;
    },
    { passive: true }
  );
}

function getIsMobile() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MD_BREAKPOINT;
}

// Per-cell translateZ depth stagger (deterministic by index modulo 4).
// 0/15/30/15 px cycle — creates layered isometric feel without random jitter.
function depthForIndex(i) {
  const cycle = [0, 15, 30, 15];
  return cycle[i % cycle.length];
}

export default function BackendSubTabBloom({
  section,
  onClose,
  onNavigate,
  parentColor,        // { c1, c2 } from SECTION_COLOR of parent orb
  originRect = null,  // DOMRect of clicked orb for mobile bubble transform-origin
}) {
  const modalRef = useRef(null);
  const cellRefs = useRef([]);
  const previouslyFocused = useRef(null);
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    const onResize = () => setIsMobile(getIsMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Focus first cell on open · restore on close · Esc + arrow nav
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    requestAnimationFrame(() => cellRefs.current[0]?.focus());

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      const total = section.items.length;
      if (total === 0) return;
      const idx = cellRefs.current.findIndex((el) => el === document.activeElement);
      // 4-column grid wrap
      let next = idx;
      if (e.key === 'ArrowRight') next = (idx + 1) % total;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + total) % total;
      else if (e.key === 'ArrowDown') next = Math.min(idx + 4, total - 1);
      else if (e.key === 'ArrowUp') next = Math.max(idx - 4, 0);
      else return;
      e.preventDefault();
      cellRefs.current[next]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [section.items.length, onClose]);

  // Desktop: cursor-direction tilt bias · lerp-smoothed · ±6deg max
  useEffect(() => {
    if (isMobile) return;
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let rafId = null;
    let currentBiasX = 0; // visible value lerped toward target
    let currentBiasY = 0;
    let targetBiasX = 0;
    let targetBiasY = 0;
    const MAX_BIAS = 6; // degrees
    const LERP = 0.12;

    // Pure bias-from-cursor compute (also used to seed initial state on mount)
    //
    // V83-followup-2 (EOD8 2026-05-18) — VIEWPORT-CLAMPED sensing center.
    // User report: "sub tab มันบิดไปข้างบนได้ดีกว่าข้างล่าง พอเอาเม้าวางข้างล่าง
    // แล้วแทบจะไม่หมุนหาเลย เช็คว่าจุดเช็คตรงกลาง จุดศูนย์กลางในการ sense
    // ซ้าย ขวา บน ล่าง มันอยู่กลางจอและกลาง sub tab นั้นๆที่สร้างจริงๆไหม".
    //
    // Pre-fix bug: when modal taller/wider than viewport (data section has 22
    // sub-tabs → ~1100px tall on 800px viewport), getBoundingClientRect returns
    // FULL rect including the part that overflows below the viewport. cy ended
    // up at ~y=740 on an 800px viewport → cursor at viewport bottom (clientY=800)
    // gave dy=(800-740)/550=0.11 → barely any forward tilt. Cursor above had
    // plenty of room (clientY=0 → dy=(0-740)/550=-1.34 → maxed to -1.0) so
    // tilted up easily. Asymmetric UX.
    //
    // Fix: clamp rect to viewport intersection. Use VISIBLE half-extents for
    // normalization → cursor at any viewport edge can reach ±MAX_BIAS regardless
    // of how much the modal overflows.
    const biasFromCursor = (clientX, clientY) => {
      const modal = modalRef.current;
      if (!modal) return null;
      const rect = modal.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const vw = window.innerWidth || rect.width;
      const vh = window.innerHeight || rect.height;
      const visLeft   = Math.max(rect.left,   0);
      const visRight  = Math.min(rect.right,  vw);
      const visTop    = Math.max(rect.top,    0);
      const visBottom = Math.min(rect.bottom, vh);
      const cx = (visLeft + visRight) / 2;
      const cy = (visTop + visBottom) / 2;
      const halfW = Math.max(1, (visRight - visLeft) / 2);
      const halfH = Math.max(1, (visBottom - visTop) / 2);
      const dx = (clientX - cx) / halfW;
      const dy = (clientY - cy) / halfH;
      return {
        x: Math.max(-1, Math.min(1, dx)) * MAX_BIAS,
        y: -Math.max(-1, Math.min(1, dy)) * MAX_BIAS,
      };
    };

    const onMove = (e) => {
      const bias = biasFromCursor(e.clientX, e.clientY);
      if (bias) {
        targetBiasX = bias.x;
        targetBiasY = bias.y;
      }
    };

    const onLeave = () => {
      targetBiasX = 0;
      targetBiasY = 0;
    };

    const tick = () => {
      currentBiasX += (targetBiasX - currentBiasX) * LERP;
      currentBiasY += (targetBiasY - currentBiasY) * LERP;
      const modal = modalRef.current;
      if (modal) {
        modal.style.setProperty('--tilt-mx', `${currentBiasX.toFixed(2)}deg`);
        modal.style.setProperty('--tilt-my', `${currentBiasY.toFixed(2)}deg`);
      }
      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseout', onLeave);

    // EOD+5 polish — seed bias from last-known cursor position so the modal
    // tilts toward the cursor IMMEDIATELY on open instead of starting flat
    // and only reacting after the first mouse jitter. Use rAF to wait one
    // frame so the modal has been positioned + getBoundingClientRect returns
    // meaningful dimensions; then snap both target AND current to skip the
    // lerp's first-frame "from zero" intro.
    requestAnimationFrame(() => {
      const bias = biasFromCursor(_lastCursorX, _lastCursorY);
      if (bias) {
        targetBiasX = bias.x;
        targetBiasY = bias.y;
        currentBiasX = bias.x;
        currentBiasY = bias.y;
      }
    });

    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onLeave);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isMobile]);

  const handleCellClick = useCallback(
    (item) => {
      onNavigate?.(item.id);
      onClose?.();
    },
    [onNavigate, onClose]
  );

  const sectionEmoji = getSubTabEmoji(section.id);
  const c1 = parentColor?.c1 || '#0ea5e9';
  const c2 = parentColor?.c2 || '#6366f1';

  // Compute transform-origin in % of viewport for mobile bubble (scale-zoom from orb)
  const originStyle = {};
  if (isMobile && originRect && typeof window !== 'undefined') {
    const ox = ((originRect.left + originRect.width / 2) / window.innerWidth) * 100;
    const oy = ((originRect.top + originRect.height / 2) / window.innerHeight) * 100;
    originStyle['--origin-x'] = `${ox.toFixed(1)}%`;
    originStyle['--origin-y'] = `${oy.toFixed(1)}%`;
  }

  /* V85-followup (EOD9, 2026-05-18) — picker rendered via createPortal to
     document.body. Reason: parent BackendArcBloom mounts this inside
     `.bloom-stage` which has `transform: translate(-50%,-50%)`. CSS
     `transform` creates a containing block for fixed-position descendants,
     so `.subtab-overlay`'s `position: fixed; inset: 0` was constrained to
     bloom-stage's 1100×640 box instead of the viewport. That made the
     full-screen blur appear as a localized rectangle film. Portal to body
     escapes the transform ancestor → fixed positioning now relative to
     the actual viewport → blur is truly full-screen.

     User feedback (3 rounds, frustrated): "background sub tab สร้างกล่อง
     สีเหลี่ยมดำๆ" / "ยังมีอยู่ไอ้สัส" / "ถ้าจะเบลอก็ขยายไปทั้งจอเลย ... แม่งคือ
     กรอบของ modal sub tab แน่ๆ เพราะถ้ากดไปบนเบลอๆ sub tab จะปิด แต่ถ้ากด
     ลงไปบน background ที่ไม่เบลอ เมนูจะปิดไปทั้งอันแล้ว".

     Zero behavioral change — same onClose semantics, same focus trap,
     same keyboard nav. Only the DOM mounting point changes. */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`เลือก ${section.label}`}
      className={`subtab-overlay ${isMobile ? 'mobile' : 'desktop'}`}
      data-testid="subtab-overlay"
      onClick={onClose}
    >
      {/* Modal — V5 3D (desktop) / V2 Bubble (mobile) */}
      <div
        ref={modalRef}
        className={`subtab-modal ${isMobile ? 'mobile' : 'desktop'}`}
        data-testid="subtab-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          '--c1': c1,
          '--c2': c2,
          ...originStyle,
        }}
      >
        {/* Header */}
        <div className="subtab-header">
          <span className="subtab-header-emoji" aria-hidden="true">{sectionEmoji}</span>
          <div className="subtab-header-text">
            <div className="subtab-header-name">{section.label}</div>
            <div className="subtab-header-count">{section.items.length} รายการ</div>
          </div>
        </div>

        {/* Grid of mini-orbs */}
        <div className="subtab-grid" data-testid="subtab-grid">
          {section.items.map((item, i) => {
            const emoji = getSubTabEmoji(item.id);
            const depth = !isMobile ? depthForIndex(i) : 0;
            return (
              <button
                key={item.id}
                ref={(el) => (cellRefs.current[i] = el)}
                type="button"
                role="menuitem"
                tabIndex={0}
                data-testid={`subtab-cell-${item.id}`}
                aria-label={item.label}
                className="subtab-cell"
                style={{ '--depth': `${depth}px` }}
                onClick={() => handleCellClick(item)}
              >
                <span className="subtab-cell-emoji" aria-hidden="true">{emoji}</span>
                <span className="subtab-cell-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
