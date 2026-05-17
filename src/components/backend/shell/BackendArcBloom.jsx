// Backend Menu D — ArcBloom overlay. 8 orbs radial fan around Duo Pill.
// Reads NAV_SECTIONS verbatim · orb click → onNavigate(firstChildTabId) · onClose
// role=dialog aria-modal · focus trap · Esc + arrow keys · prefers-reduced-motion

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { NAV_SECTIONS } from '../nav/navConfig.js';

// Random star/nebula/ember/petal positions — generated once per module-load
// so they stay stable across re-renders (no jitter).
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

// Arc fan layout — 8 positions on a radial arc anchored to bottom-right.
function orbPosition(i, total) {
  const startAngle = 175; // degrees, fan opens up-and-left from bottom-right
  const sweep = 95;
  const angle = ((startAngle + (sweep * i) / Math.max(1, total - 1)) * Math.PI) / 180;
  const radius = 180; // px from anchor
  // Anchor at viewport bottom-right corner ~64px in
  return {
    right: `${64 + Math.cos(angle - Math.PI) * radius}px`,
    bottom: `${64 + Math.sin(Math.PI - angle) * radius}px`,
  };
}

export default function BackendArcBloom({ open, onClose, onNavigate }) {
  const orbRefs = useRef([]);
  const previouslyFocused = useRef(null);

  const sections = useMemo(() => NAV_SECTIONS, []);

  // Focus trap + Esc + arrow keys
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    // Focus first orb when bloom opens
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

      {/* 8 orbs · radial fan layout */}
      {sections.map((section, i) => {
        const Icon = section.icon;
        const pos = orbPosition(i, sections.length);
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
            className="bloom-orb"
            style={pos}
            onClick={() => handleOrbClick(section)}
          >
            {Icon && <Icon size={26} color="white" />}
            <span className="bloom-orb-label">{section.label}</span>
          </button>
        );
      })}
    </div>
  );
}
