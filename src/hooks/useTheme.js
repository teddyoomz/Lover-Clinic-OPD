import { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

export const THEME_KEY = 'app-theme';
export const THEMES = [
  { value: 'dark',  label: 'Dark',  icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
];

/**
 * Phase 29.22 round-3 fix — read the LIVE data-theme attribute via
 * MutationObserver. Previously `useTheme` had per-component state initialized
 * from localStorage; one component's setTheme didn't propagate to others
 * (RecallRow's badge text color stayed stale after theme toggle elsewhere).
 *
 * Returns the current resolved theme ('dark' | 'light') and stays in sync
 * across the whole app.
 */
function readResolvedTheme() {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme') || 'dark';
  if (attr === 'light' || attr === 'dark') return attr;
  // 'auto' (or missing) → follow system pref
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

// ─── read-only resolved theme (2026-07-04, bug-hunt R1 #9) ──────────────────
// useTheme's [theme] effect WRITES on every mount (setAttribute + localStorage
// + the app-wide `theme-transitioning` * -transition class for 350ms) and
// mounts one MutationObserver per consumer. Fine for the theme OWNER
// (ThemeToggle / dashboards); churn for per-row display consumers — VipName ×
// hundreds of list rows would fire hundreds of root writes per render pass.
// This variant NEVER writes: one module-level singleton observer feeds every
// subscriber via useSyncExternalStore.
const _themeListeners = new Set();
let _themeObserverStarted = false;
function _startThemeObserver() {
  if (_themeObserverStarted || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  _themeObserverStarted = true;
  const obs = new MutationObserver(() => { for (const l of _themeListeners) l(); });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
function _subscribeResolvedTheme(listener) {
  _startThemeObserver();
  _themeListeners.add(listener);
  return () => _themeListeners.delete(listener);
}

/** Read-only 'dark' | 'light' — for display components that must NEVER own/write theme state. */
export function useResolvedTheme() {
  return useSyncExternalStore(_subscribeResolvedTheme, readResolvedTheme, () => 'dark');
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    if (typeof localStorage === 'undefined') return 'dark';
    const saved = localStorage.getItem(THEME_KEY);
    return (saved === 'dark' || saved === 'light') ? saved : 'dark';
  });

  // Live resolved theme — synced across components via data-theme observer.
  const [resolvedTheme, setResolvedTheme] = useState(() => readResolvedTheme());

  // Observe data-theme attribute changes — fires when ANY component (or
  // user toggle) changes theme, keeping all consumers in sync.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const root = document.documentElement;
    const obs = new MutationObserver(() => setResolvedTheme(readResolvedTheme()));
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    // Initial read in case data-theme was set before this hook mounted
    setResolvedTheme(readResolvedTheme());
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-transitioning');
    setTimeout(() => root.classList.remove('theme-transitioning'), 350);
    root.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (localStorage.getItem(THEME_KEY) === 'auto') {
        document.documentElement.setAttribute('data-theme', 'auto');
      }
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  return { theme, resolvedTheme, setTheme: setThemeState };
}
