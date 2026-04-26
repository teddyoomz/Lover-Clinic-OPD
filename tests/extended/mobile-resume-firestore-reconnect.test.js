// ─── Phase 14.x · Mobile-resume Firestore reconnect regression tests ──────
// User-reported bug 2026-04-25: "เปิดเข้าไปหน้า frontend ที่ login ค้างไว้ใน
// mobile แล้วไม่โหลด Data อะไรเลย ไม่เห็นคิวที่ค้างไว้ ไม่เห็นแชทค้าง — ต้อง
// refresh หรือเปิดปิด browser ใหม่ data ถึงจะปรากฎ".
//
// Root cause: When a tab is backgrounded for ~5min+ on mobile (iOS Safari
// / Android Chrome aggressive tab suspension), the Firestore SDK's
// WebSocket connection gets dropped by the OS. SDK is supposed to
// auto-reconnect on resume but in practice on mobile + slow networks
// often keeps stale connection state — cached data shows but new server
// updates don't flow until refresh.
//
// Fix: visibilitychange + online handler in App.jsx that toggles
// disableNetwork(db) → enableNetwork(db) to force a clean reconnect of
// every onSnapshot listener in the app. Debounced 1500ms, zero polling.
//
// These source-grep tests lock the contract so future refactors can't
// silently regress.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('Mobile-resume Firestore reconnect (V17 fix)', () => {
  const app = READ('src/App.jsx');

  describe('R1: imports + setup', () => {
    it('R1.1: App.jsx imports disableNetwork + enableNetwork from firebase/firestore', () => {
      expect(app).toMatch(/import\s*\{[^}]*\bdisableNetwork\b[^}]*\}\s*from\s*['"]firebase\/firestore['"]/);
      expect(app).toMatch(/import\s*\{[^}]*\benableNetwork\b[^}]*\}\s*from\s*['"]firebase\/firestore['"]/);
    });
  });

  describe('R2: visibility/online listeners exist', () => {
    it('R2.1: App.jsx adds visibilitychange listener', () => {
      expect(app).toMatch(/addEventListener\(\s*['"]visibilitychange['"]/);
    });

    it('R2.2: App.jsx adds online listener', () => {
      expect(app).toMatch(/addEventListener\(\s*['"]online['"]/);
    });

    it('R2.3: visibilitychange handler checks document.visibilityState === "visible"', () => {
      // Without this check, the toggle would also run when tab BECOMES hidden
      // — wasted work + potential flicker.
      expect(app).toMatch(/document\.visibilityState\s*===\s*['"]visible['"]/);
    });
  });

  describe('R3: reconnect calls disableNetwork → enableNetwork', () => {
    it('R3.1: a function calls disableNetwork(db) before enableNetwork(db)', () => {
      // Match the toggle pattern in order: disable first, then enable.
      const m = app.match(/disableNetwork\(db\)[\s\S]{0,200}enableNetwork\(db\)/);
      expect(m, 'expected disableNetwork(db) followed by enableNetwork(db) within 200 chars').toBeTruthy();
    });
  });

  describe('R4: debounce / no-thrash', () => {
    it('R4.1: reconnect logic is debounced (has timestamp guard)', () => {
      // Look for some kind of "if recently toggled, skip" pattern. We accept
      // any of: lastToggleAt, lastReconnect, debounce constant, etc.
      const hasDebounce = /lastToggleAt|TOGGLE_DEBOUNCE_MS|lastReconnect|debounce|throttle/.test(app);
      expect(hasDebounce, 'expected debounce guard so rapid visibility changes do not thrash').toBe(true);
    });

    it('R4.2: reconnect is reentrancy-safe (in-flight guard)', () => {
      // Look for a `toggling` / `inFlight` boolean
      const hasInFlight = /toggling|inFlight|reconnecting|isReconnecting/.test(app);
      expect(hasInFlight).toBe(true);
    });
  });

  describe('R5: cleanup', () => {
    it('R5.1: visibilitychange listener is removed in cleanup', () => {
      expect(app).toMatch(/removeEventListener\(\s*['"]visibilitychange['"]/);
    });

    it('R5.2: online listener is removed in cleanup', () => {
      expect(app).toMatch(/removeEventListener\(\s*['"]online['"]/);
    });
  });

  describe('R6: zero-polling guarantee', () => {
    it('R6.1: reconnect logic does NOT use setInterval', () => {
      // Find the reconnect useEffect block. Heuristic: search lines around
      // "disableNetwork(db)" and verify no setInterval in the same block.
      const idx = app.indexOf('disableNetwork(db)');
      expect(idx).toBeGreaterThan(-1);
      // Find the surrounding useEffect block (back to "useEffect(() => {")
      const beforeText = app.slice(Math.max(0, idx - 2000), idx);
      const blockStart = beforeText.lastIndexOf('useEffect(() => {');
      expect(blockStart).toBeGreaterThan(-1);
      // Find block end (forward from idx, look for "}, []);" closing useEffect)
      const afterText = app.slice(idx, Math.min(app.length, idx + 1500));
      const blockEnd = afterText.indexOf('}, []);');
      expect(blockEnd).toBeGreaterThan(-1);
      const block = app.slice(Math.max(0, idx - 2000) + blockStart, idx + blockEnd);
      // Polling pattern would be setInterval — forbidden in this hook
      expect(block.includes('setInterval')).toBe(false);
    });
  });
});
