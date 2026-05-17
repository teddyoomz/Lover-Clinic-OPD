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
import ClinicLogo from '../../ClinicLogo.jsx';

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
  // EOD+6 polish — widened from prior scatter (top/left shifted ~5% outward)
  // to open up center space for the ClinicLogo (rendered at 50%/50%).
  // EOD+6 round 2 (logo enlarged) — pushed finance + reports from 86% to 91%
  // so the bumped 25vw logo has ≥10px breathing room above the bottom row
  // at 1280×800. Top row (sales 10%, customers 14%) already clears the
  // logo top with margin per preview_eval verification.
  'appointments-section': { top: '28%', left: '8%'  },
  'customers':            { top: '14%', left: '32%' },
  'sales':                { top: '10%', left: '60%' },
  'marketing':            { top: '18%', left: '86%' },
  'stock':                { top: '70%', left: '92%' },
  'finance':              { top: '91%', left: '64%' },
  'reports':              { top: '91%', left: '36%' },
  'master':               { top: '70%', left: '12%' },
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

// Mobile Arc Fan — APPTS-CENTRIC concentric ring layout (EOD+5 round 5).
// User explicit (round 4 angry rewrite): "นัดหมายเหมือนจุดศูนย์กลาง แล้ว
// แถวอื่นเรียงตัวสวย ห่างพอดี เป็นชั้น 2 ชั้นต่อไปจากนัดหมาย ... เอานัดหมาย
// มาเหนือปุ่มเปิดแชทเปิดเมนูนิดเดียวเลย".
//
// Layout (8 orbs):
//   Tier 1 (center): appointments-section just above the DuoPill
//   Tier 2 (inner ring r=110 around appts): 3 orbs — α=90° / 142.5° / 195°
//   Tier 3 (outer ring r=200 around appts): 4 orbs — α=90° / 125° / 160° / 195°
//
// Geometry (72 px orbs · appts center at viewport ≈(309, 681) on 375×812):
//   • T1 ↔ T2 (r=110): every T2 orb is 110 px from appts → 38 px edge gap ✓
//   • T1 ↔ T3 (r=200): every T3 orb is 200 px from appts → 128 px edge gap ✓
//   • T2 within-ring (Δα=52.5°, r=110): 2·110·sin(26.25°) = 97 px → 25 px ✓
//   • T3 within-ring (Δα=35°,  r=200): 2·200·sin(17.5°)  = 120 px → 48 px ✓
//   • T2 vs T3 same-α radial pairs:  200 − 110 = 90 px → 18 px edge gap ✓
//   • T2 vs T3 near-adjacent crosses: ≥ 100 px → 28 px edge gap ✓
//   STRICT no-overlap across all 28 pairs · min edge gap = 18 px ✓
//
// Viewport fit (vw=375): all orbs centered between x≈116 and x=309
//   (edges 80–345 px). Outer α=195° (master) at bottom=43 sits LEFT of
//   the duo pill — no horizontal conflict (orb x≈116, pill x≈275-365).
//
// Appts to duo pill: appts bottom edge at viewport y = 812 − 95 − 72 = 645
//   from top (= 167 px from viewport bottom). Duo pill at bottom ≈22 px
//   above pill top → ~22 px breathing room. "นิดเดียวเลย" ✓
//
// NAV_SECTIONS assignment (preserves order, groups by tier):
//   T1: appointments-section
//   T2: customers (α=90° up), sales (α=142.5° upper-left), marketing (α=195°)
//   T3: stock (α=90° up), finance (α=125°), reports (α=160°), master (α=195°)
//   Same-α radial spokes: customers↑stock (α=90°), marketing↓master (α=195°)
const MOBILE_POSITION = {
  // T1 — appointments at center (just above duo pill)
  'appointments-section': { right: '30px',  bottom: '95px'  },
  // T2 — inner ring r=110 around appts (3 orbs)
  'customers':            { right: '30px',  bottom: '205px' }, // α=90°    (up)
  'sales':                { right: '117px', bottom: '162px' }, // α=142.5° (upper-left)
  'marketing':            { right: '136px', bottom: '67px'  }, // α=195°   (lower-left)
  // T3 — outer ring r=200 around appts (4 orbs)
  'stock':                { right: '30px',  bottom: '295px' }, // α=90°    (up)
  'finance':              { right: '145px', bottom: '259px' }, // α=125°
  'reports':              { right: '218px', bottom: '163px' }, // α=160°
  'master':               { right: '223px', bottom: '43px'  }, // α=195°
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

export default function BackendArcBloom({ open, onClose, onNavigate, clinicSettings = null, theme = 'dark' }) {
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

      {/* Center logo — Lover Clinic mark, theme-aware (dark/light), slow glow.
          Desktop: centered at 50%/50% inside bloom-stage. Mobile: top-center
          where the upper viewport is empty (per user EOD+6 placement). */}
      <div className={`bloom-logo-wrap ${isMobile ? 'mobile' : 'desktop'}`} aria-hidden="true">
        <ClinicLogo
          clinicSettings={clinicSettings}
          theme={theme}
          showText={false}
          className="bloom-logo"
        />
      </div>

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
