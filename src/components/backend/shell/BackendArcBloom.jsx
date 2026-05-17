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
import BackendSubTabBloom from './BackendSubTabBloom.jsx';

const MD_BREAKPOINT = 768;

// Desktop/Tablet (≥768px): organic scatter — mockup-literal positions
// (lines 863-870). NOT a rigid grid. Tiles form 2 gentle arcs (top arc
// dips up-down-down-up, bottom arc dips down-up-up-down) within a
// centered stage. Slight asymmetry = "ไร้ระเบียบนิดหน่อยแต่สมดุล".
// Stretched + re-centered so cluster centroid = stage center (50%, 50%).
// Original mockup means (top=35%, left=42%) caused visual top-left tilt when
// scaled to desktop. Linear-mapped: top [4-66%] → [15-80%], left [8-78%] →
// [12-88%]. Shape preserved (top arc dips up-down-down-up, bottom arc inverse).
const DESKTOP_POSITION = {
  'appointments-section': { top: '32%', left: '12%' },
  'customers':            { top: '19%', left: '34%' },
  'sales':                { top: '15%', left: '58%' },
  'marketing':            { top: '23%', left: '82%' },
  'stock':                { top: '65%', left: '88%' },
  'finance':              { top: '80%', left: '64%' },
  'reports':              { top: '80%', left: '38%' },
  'master':               { top: '65%', left: '16%' },
};

// Colored emoji per section (mockup uses these — visually pops vs monochrome
// lucide icons). Maps section.id → emoji glyph.
const SECTION_EMOJI = {
  'appointments-section': '📅',
  'customers':            '👥',
  'sales':                '🛒',
  'marketing':            '📣',
  'stock':                '📦',
  'finance':              '💰',
  'reports':              '📊',
  'master':               '🗄️',
};

// Mobile Arc Fan — TWO-TIER concentric arcs (4 inner + 4 outer at same
// β angles), anchored at the bottom-right corner where the DuoPill lives.
// EOD+5 round 3 polish: ZERO overlap required (user "ไม่ซ้อนคือไม่ซ้อนกัน
// เลยสักวง ... วงนอกในก็ไม่ซ้อน ไม่ทับกัน"). Round 2 had 5–9 px residual
// touch on inner adjacents because r=130 was too small for 72 px orbs.
//
// Geometry recompute: 72px orbs need ≥ 80 px center-to-center spacing
// (72 px size + 8 px breathing room) for visual zero-touch.
// Inner r=160, Outer r=250 — both rings have full gaps.
//
//   • Within-arc spacing at Δβ=30°: 2·r·sin(15°)
//     - Inner r=160: 82.8 px center distance → ~11 px gap ✓
//     - Outer r=250: 129.4 px center distance → ~57 px gap ✓
//   • Same-β radial pairs: r_outer − r_inner = 90 px → ~18 px gap ✓
//   • Cross-ring near-adjacent (β_inner=0° vs β_outer=30°):
//     sqrt(125² + 57²) = 137 px → ~65 px gap ✓
//   All pairwise distances ≥ 82 px > 72 px orb size → strict no-touch.
//
// Viewport fit (vw=375): outer β=90° at right=280 → orb left edge =
// 375 − 280 − 72 = 23 px from left edge. On-screen with margin.
//
// Assignment (NAV_SECTIONS order preserved):
//   Inner ring (closer to thumb) = first 4 (operational)
//   Outer ring (further reach)   = last 4 (admin/reports)
//
// Positions: right = 30 + r·sin(β),  bottom = 30 + r·cos(β)
//
//   INNER (r=160)                            OUTER (r=250)
//   β=0°   appts     ( 30, 190)              β=0°   stock     ( 30, 280)
//   β=30°  customers (110, 169)              β=30°  finance   (155, 247)
//   β=60°  sales     (169, 110)              β=60°  reports   (247, 155)
//   β=90°  marketing (190,  30)              β=90°  master    (280,  30)
const MOBILE_POSITION = {
  // Inner ring (close to thumb)
  'appointments-section': { right: '30px',  bottom: '190px' },
  'customers':            { right: '110px', bottom: '169px' },
  'sales':                { right: '169px', bottom: '110px' },
  'marketing':            { right: '190px', bottom: '30px'  },
  // Outer ring (further reach)
  'stock':                { right: '30px',  bottom: '280px' },
  'finance':              { right: '155px', bottom: '247px' },
  'reports':              { right: '247px', bottom: '155px' },
  'master':               { right: '280px', bottom: '30px'  },
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
  // Sub-tab picker state — opens when section has ≥2 items
  const [pickerSection, setPickerSection] = useState(null);
  const [pickerOriginRect, setPickerOriginRect] = useState(null);

  useEffect(() => {
    const onResize = () => setIsMobile(getIsMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Focus trap + Esc + arrow keys
  // When picker (SubTabBloom) is open, defer ALL keyboard handling to the picker
  // so Esc closes only the picker (per spec) and arrows scope to mini-orbs.
  useEffect(() => {
    if (!open) return;
    if (pickerSection) return;  // Picker owns keyboard while mounted
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
  }, [open, onClose, sections.length, pickerSection]);

  const handleOrbClick = useCallback(
    (section, ev) => {
      const items = section.items;
      if (!items || items.length === 0) return;
      // Single-item section → direct navigate (skip picker) per spec
      if (items.length === 1) {
        onNavigate?.(items[0].id);
        onClose?.();
        return;
      }
      // Multi-item section → open picker
      const rect = ev?.currentTarget?.getBoundingClientRect?.() || null;
      setPickerOriginRect(rect);
      setPickerSection(section);
    },
    [onNavigate, onClose]
  );

  const handlePickerNavigate = useCallback(
    (itemId) => {
      onNavigate?.(itemId);
      setPickerSection(null);
      onClose?.();  // also close the main ArcBloom — both blooms collapse
    },
    [onNavigate, onClose]
  );

  const handlePickerClose = useCallback(() => {
    setPickerSection(null);
    // Main ArcBloom stays open behind
  }, []);

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

      {/* Bloom stage — both viewports use absolute positioning.
          Desktop: scatter top%/left% inside a centered max-1100x640 stage.
          Mobile: full-screen with fan-arc bottom/right/left px offsets. */}
      <div className={`bloom-stage ${isMobile ? 'mobile' : 'desktop'}`} data-testid="bloom-stage">
        {sections.map((section, i) => {
          const color = SECTION_COLOR[section.id] || { c1: '#dc2626', c2: '#f97316' };
          const count = sectionCount(section);
          const emoji = SECTION_EMOJI[section.id] || '✨';
          const POSITION_MAP = isMobile ? MOBILE_POSITION : DESKTOP_POSITION;
          const pos = POSITION_MAP[section.id] || { top: '50%', left: '50%' };
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
                ...pos,
                '--c1': color.c1,
                '--c2': color.c2,
              }}
              onClick={(ev) => handleOrbClick(section, ev)}
            >
              <span className="bloom-orb-emoji" aria-hidden="true">{emoji}</span>
              <span className="bloom-orb-label">{section.label}</span>
              {count && <span className="bloom-orb-count">{count}</span>}
            </button>
          );
        })}
        {pickerSection && (
          <BackendSubTabBloom
            section={pickerSection}
            parentColor={SECTION_COLOR[pickerSection.id]}
            originRect={pickerOriginRect}
            onNavigate={handlePickerNavigate}
            onClose={handlePickerClose}
          />
        )}
      </div>
    </div>
  );
}
