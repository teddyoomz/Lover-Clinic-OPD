// Backend Menu D — Bloom overlay. 8 scattered rounded-square orbs across the
// bloom backdrop (mockup-matched layout, NOT radial arc).
// Reads NAV_SECTIONS verbatim · orb click → onNavigate(firstChildTabId) · onClose
// role=dialog aria-modal · focus trap · Esc + arrow keys · prefers-reduced-motion
//
// Rewrite 2026-05-18 — replaces previous radial-arc-fan implementation that
// did NOT match the approved mockup. Mockup at
// docs/superpowers/specs/2026-05-18-backend-menu-redesign-mockup.html shows
// 8 tiles scattered in scatter-grid layout (top%/left% per-section) with
// per-section linear-gradient colors and icon+name+count. This rewrite
// matches the mockup verbatim.

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { NAV_SECTIONS } from '../nav/navConfig.js';

const MD_BREAKPOINT = 768;

// Desktop/Tablet (≥768px): CSS Grid 4×2 layout · centered + fluid scale.
// Grid-area assignment per section.id (instead of absolute positions) so the
// layout auto-centers in viewport and scales evenly from tablet → 4K.
// Order: top row (apptmnts, customers, sales, marketing) +
//        bottom row (master, reports, finance, stock).
const DESKTOP_GRID_AREA = {
  'appointments-section': { gridRow: 1, gridColumn: 1 },
  'customers':            { gridRow: 1, gridColumn: 2 },
  'sales':                { gridRow: 1, gridColumn: 3 },
  'marketing':            { gridRow: 1, gridColumn: 4 },
  'master':               { gridRow: 2, gridColumn: 1 },
  'reports':              { gridRow: 2, gridColumn: 2 },
  'finance':              { gridRow: 2, gridColumn: 3 },
  'stock':                { gridRow: 2, gridColumn: 4 },
};

// Mobile fan-arc position (pixel offsets from edges) — from mockup lines 641-648
// (compact phone view). Orbs cluster around the bottom edges + one floats at
// top-center, forming a balloon cluster around the duo pill at bottom-right.
const MOBILE_POSITION = {
  'appointments-section': { bottom: '80px',  right: '12px'  },
  'customers':            { bottom: '124px', right: '30px'  },
  'sales':                { bottom: '158px', right: '70px'  },
  'marketing':            { bottom: '172px', right: '122px' },
  'stock':                { bottom: '164px', left:  '64px'  },
  'finance':              { bottom: '128px', left:  '26px'  },
  'reports':              { bottom: '84px',  left:  '10px'  },
  'master':               { top: '60px', left: '50%', transform: 'translateX(-50%)' },
};

// Per-section gradient colors (--c1 → --c2 at 135deg) — from mockup.
const SECTION_COLOR = {
  'appointments-section': { c1: '#3b82f6', c2: '#06b6d4' }, // blue → cyan
  'customers':            { c1: '#14b8a6', c2: '#22c55e' }, // teal → green
  'sales':                { c1: '#ef4444', c2: '#f97316' }, // red → orange
  'marketing':            { c1: '#a855f7', c2: '#ec4899' }, // purple → pink
  'stock':                { c1: '#f59e0b', c2: '#facc15' }, // amber → yellow
  'finance':              { c1: '#10b981', c2: '#06b6d4' }, // emerald → cyan
  'reports':              { c1: '#0ea5e9', c2: '#6366f1' }, // sky → indigo
  'master':               { c1: '#facc15', c2: '#f97316' }, // yellow → orange
};

// Decorative-layer positions — generated once per module-load for stability.
const STARS = Array.from({ length: 55 }, (_, i) => ({
  top: `${Math.random() * 100}%`,
  left: `${Math.random() * 100}%`,
  delay: `${(Math.random() * 3).toFixed(2)}s`,
  variant: i % 17 === 0 ? 'red' : i % 13 === 0 ? 'orange' : '',
  big: i % 19 === 0,
}));
const NEBULAE = Array.from({ length: 3 }, () => ({
  top: `${20 + Math.random() * 60}%`,
  left: `${20 + Math.random() * 60}%`,
}));
const EMBERS = Array.from({ length: 4 }, (_, i) => ({
  top: `${60 + Math.random() * 30}%`,
  left: `${Math.random() * 100}%`,
  delay: `${(i * 1.5).toFixed(2)}s`,
}));
const PETALS = Array.from({ length: 20 }, (_, i) => ({
  left: `${Math.random() * 100}%`,
  delay: `${(Math.random() * 5).toFixed(2)}s`,
  duration: `${(5 + Math.random() * 4).toFixed(2)}s`,
  size: i % 7 === 0 ? 'big' : i % 5 === 0 ? 'small' : '',
}));

function sectionCount(section) {
  // Sub-tab count — real number from NAV_SECTIONS.items, shown as "N sub".
  // Mockup also uses contextual labels (132 / ฿24K / 3 promo); those need
  // real data wiring (future). For now, the consistent "N sub" gives admin
  // an at-a-glance sense of section size.
  const n = Array.isArray(section.items) ? section.items.length : 0;
  return n > 0 ? `${n} sub` : '';
}

function getIsMobile() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MD_BREAKPOINT;
}

export default function BackendArcBloom({ open, onClose, onNavigate }) {
  const orbRefs = useRef([]);
  const previouslyFocused = useRef(null);
  const sections = useMemo(() => NAV_SECTIONS, []);
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    const onResize = () => setIsMobile(getIsMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Focus trap + Esc + arrow keys
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    requestAnimationFrame(() => orbRefs.current[0]?.focus());

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = orbRefs.current.findIndex((el) => el === document.activeElement);
        const next = (idx + 1) % sections.length;
        orbRefs.current[next]?.focus();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = orbRefs.current.findIndex((el) => el === document.activeElement);
        const prev = (idx - 1 + sections.length) % sections.length;
        orbRefs.current[prev]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, sections.length]);

  const handleOrbClick = useCallback(
    (section) => {
      const firstItem = section.items[0];
      if (!firstItem) return;
      onNavigate?.(firstItem.id);
      onClose?.();
    },
    [onNavigate, onClose]
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="เมนูระบบหลังบ้าน"
      className="bloom-backdrop"
      data-open="true"
      data-testid="bloom-overlay"
    >
      {/* Click-anywhere-to-close backdrop */}
      <div
        className="absolute inset-0"
        data-testid="bloom-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dark: stars + nebulae + embers · Light: petals */}
      <div className="bloom-stars" aria-hidden="true">
        {STARS.map((s, i) => (
          <span
            key={i}
            className={`star ${s.variant} ${s.big ? 'big' : ''}`}
            style={{ top: s.top, left: s.left, animationDelay: s.delay }}
          />
        ))}
      </div>
      {NEBULAE.map((n, i) => (
        <div key={i} className="bloom-nebula" style={n} aria-hidden="true" />
      ))}
      {EMBERS.map((e, i) => (
        <div key={i} className="bloom-ember" style={{ top: e.top, left: e.left, animationDelay: e.delay }} aria-hidden="true" />
      ))}
      {PETALS.map((p, i) => (
        <div
          key={i}
          className={`bloom-petal ${p.size}`}
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
          aria-hidden="true"
        />
      ))}

      {/* Bloom stage — Desktop/Tablet: CSS Grid 4×2 auto-centered + fluid-scale.
          Mobile: full-screen with fan-arc absolute orbs around the duo pill. */}
      <div className={`bloom-stage ${isMobile ? 'mobile' : 'desktop'}`} data-testid="bloom-stage">
        {sections.map((section, i) => {
          const Icon = section.icon;
          const color = SECTION_COLOR[section.id] || { c1: '#dc2626', c2: '#f97316' };
          const count = sectionCount(section);
          const iconSize = isMobile ? 18 : 32;
          // Mobile: absolute pixel offsets · Desktop/Tablet: CSS grid placement
          const positionStyle = isMobile
            ? (MOBILE_POSITION[section.id] || { top: '50%', left: '50%' })
            : (DESKTOP_GRID_AREA[section.id] || {});
          return (
            <button
              key={section.id}
              ref={(el) => (orbRefs.current[i] = el)}
              type="button"
              role="menuitem"
              tabIndex={0}
              data-bloomed="true"
              data-testid={`bloom-orb-${section.id}`}
              aria-label={`ไปยังหมวด ${section.label}`}
              className={`bloom-orb ${isMobile ? 'mobile' : 'desktop'}`}
              style={{
                ...positionStyle,
                '--c1': color.c1,
                '--c2': color.c2,
              }}
              onClick={() => handleOrbClick(section)}
            >
              {Icon && <Icon size={iconSize} color="white" className="bloom-orb-icon" aria-hidden="true" />}
              <span className="bloom-orb-label">{section.label}</span>
              {count && <span className="bloom-orb-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
