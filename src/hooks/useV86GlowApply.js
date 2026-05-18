// V86-followup-2 (2026-05-18 EOD+10) — applies V86 glow CSS vars from
// system_config.v86Glow to document.documentElement on mount + change.
// Single mount point at App.jsx root. Falls back to V86_GLOW_DEFAULTS if
// system_config not yet loaded.
//
// AV83-sanctioned consumer: this hook is one of TWO callers allowed to
// invoke document.documentElement.style.setProperty('--neon-c1' | '--neon-c2'
// | '--neon-intensity', ...) — the other is SystemSettingsTab's live-preview
// useEffect (admin tunes via slider/picker → instant cascade update).

import { useEffect } from 'react';
import { useSystemConfig } from './useSystemConfig.js';
import { V86_GLOW_DEFAULTS } from '../lib/systemConfigClient.js';

function hexToRgbTriple(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return '220, 38, 38'; // fallback red-600
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return '220, 38, 38';
  return `${r}, ${g}, ${b}`;
}

export function useV86GlowApply() {
  const { config } = useSystemConfig();
  const v86 = { ...V86_GLOW_DEFAULTS, ...(config?.v86Glow || {}) };
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!v86.enabled) {
      // Disabled: zero out intensity (cards revert to no glow)
      root.style.setProperty('--neon-intensity', '0');
      return;
    }
    root.style.setProperty('--neon-c1', hexToRgbTriple(v86.c1));
    root.style.setProperty('--neon-c2', hexToRgbTriple(v86.c2));
    root.style.setProperty('--neon-intensity', String(v86.intensityPercent / 100));
  }, [v86.enabled, v86.c1, v86.c2, v86.intensityPercent]);
}
