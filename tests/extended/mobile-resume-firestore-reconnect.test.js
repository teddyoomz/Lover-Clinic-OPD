// ─── Phase 14.x · Mobile-resume Firestore reconnect regression tests ──────
// User-reported bug 2026-04-25: "เปิดเข้าไปหน้า frontend ที่ login ค้างไว้ใน
// mobile แล้วไม่โหลด Data อะไรเลย ... ต้อง refresh หรือเปิดปิด browser ใหม่".
//
// Fix (V17): visibilitychange + online handler that toggles
// disableNetwork(db) → enableNetwork(db) to force a clean reconnect of every
// onSnapshot listener. Debounced 1500ms, zero polling.
//
// 2026-06-16 (mobile-load reliability) — the toggle implementation was
// EXTRACTED from an inline App.jsx closure into the shared, module-debounced
// reconnectFirestore() (src/lib/firestoreReconnect.js) so V17 + useResilientLoad
// + useBranchAwareListener all share ONE debounce. Behavior identical; these
// source-grep tests now assert the contract at its TWO homes:
//   • App.jsx           — the visibility/online wiring → reconnectFirestore()
//   • firestoreReconnect.js — the disable→enable toggle + debounce + no-polling
// (Runtime behavior of reconnectFirestore is additionally proven by the default
// suite test tests/firestore-reconnect.test.js.)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('Mobile-resume Firestore reconnect (V17 fix, 2026-06-16 shared-util refactor)', () => {
  const app = READ('src/App.jsx');
  const util = READ('src/lib/firestoreReconnect.js');

  describe('R1: App.jsx wires the shared reconnect', () => {
    it('R1.1: App.jsx imports reconnectFirestore from the shared util', () => {
      expect(app).toMatch(/import\s*\{\s*reconnectFirestore\s*\}\s*from\s*['"]\.\/lib\/firestoreReconnect\.js['"]/);
    });
    it('R1.2: App.jsx no longer imports disableNetwork/enableNetwork directly (moved to the util)', () => {
      expect(app).not.toMatch(/import\s*\{[^}]*\bdisableNetwork\b[^}]*\}\s*from\s*['"]firebase\/firestore['"]/);
    });
  });

  describe('R2: visibility/online listeners exist + call reconnectFirestore', () => {
    it('R2.1: App.jsx adds visibilitychange listener', () => {
      expect(app).toMatch(/addEventListener\(\s*['"]visibilitychange['"]/);
    });
    it('R2.2: App.jsx adds online listener', () => {
      expect(app).toMatch(/addEventListener\(\s*['"]online['"]/);
    });
    it('R2.3: visibilitychange handler checks document.visibilityState === "visible" then reconnects', () => {
      expect(app).toMatch(/document\.visibilityState\s*===\s*['"]visible['"]\)\s*reconnectFirestore\(\)/);
    });
    it('R2.4: online handler calls reconnectFirestore', () => {
      expect(app).toMatch(/onOnline\s*=\s*\(\)\s*=>\s*reconnectFirestore\(\)/);
    });
  });

  describe('R3: the shared util toggles disableNetwork → enableNetwork', () => {
    it('R3.1: firestoreReconnect imports disableNetwork + enableNetwork', () => {
      expect(util).toMatch(/import\s*\{[^}]*\bdisableNetwork\b[^}]*\}\s*from\s*['"]firebase\/firestore['"]/);
      expect(util).toMatch(/import\s*\{[^}]*\benableNetwork\b[^}]*\}\s*from\s*['"]firebase\/firestore['"]/);
    });
    it('R3.2: disableNetwork(db) is called before enableNetwork(db)', () => {
      const m = util.match(/disableNetwork\(db\)[\s\S]{0,200}enableNetwork\(db\)/);
      expect(m, 'expected disableNetwork(db) followed by enableNetwork(db)').toBeTruthy();
    });
  });

  describe('R4: debounce / no-thrash (in the shared util)', () => {
    it('R4.1: reconnect logic is debounced (timestamp guard)', () => {
      expect(/lastToggleAt|DEBOUNCE_MS/.test(util)).toBe(true);
    });
    it('R4.2: reconnect is reentrancy-safe (in-flight guard)', () => {
      expect(/toggling|inFlight|reconnecting/.test(util)).toBe(true);
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
      expect(util.includes('setInterval')).toBe(false);
      expect(app.includes('setInterval(reconnectFirestore') ).toBe(false);
    });
  });
});
