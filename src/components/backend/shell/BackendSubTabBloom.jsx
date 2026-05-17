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
import { getSubTabEmoji } from './subTabEmoji.js';

const MD_BREAKPOINT = 768;

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

  return (
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
    </div>
  );
}
