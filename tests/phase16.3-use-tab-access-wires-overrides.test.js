// Phase 16.3-bis — useTabAccess wires tabOverrides from system_config.
//
// User report 2026-04-29 late evening: "การติ๊กซ่อน tab หรือ admin only
// ใน ตั้งค่าการมองเห็นแท็บ ใช้ไม่ได้จริง". Root cause: the hook calls
// canAccessTab/filter/first WITHOUT the 4th overrides param → static gate
// behaviour only → admin-saved overrides land in Firestore but have ZERO
// runtime effect. V12 multi-reader-sweep regression at the consumer-hook
// level.
//
// Source-grep guards:
//   - useTabAccess imports useSystemConfig
//   - All 3 forwarded helpers (canAccess / filter / first) pass `overrides`
//   - overrides defaults to {} when config missing (graceful degradation)
//   - Phase 16.3-bis marker comment present

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOOK_SRC = readFileSync(resolve(__dirname, '../src/hooks/useTabAccess.js'), 'utf-8');

describe('Phase 16.3-bis UTA.A — useTabAccess wires overrides', () => {
  test('A.1 — imports useSystemConfig hook', () => {
    expect(HOOK_SRC).toMatch(/import\s*\{\s*useSystemConfig\s*\}\s*from\s*['"]\.\/useSystemConfig\.js['"]/);
  });

  test('A.2 — destructures config from useSystemConfig + extracts tabOverrides', () => {
    expect(HOOK_SRC).toMatch(/const\s*\{\s*config\s*\}\s*=\s*useSystemConfig\(\)/);
    expect(HOOK_SRC).toMatch(/const\s+overrides\s*=\s*config\?\.tabOverrides\s*\|\|\s*\{\}/);
  });

  test('A.3 — canAccess closure passes overrides as 4th arg', () => {
    expect(HOOK_SRC).toMatch(/canAccess:\s*\(tabId\)\s*=>\s*canAccessTab\(tabId,\s*permissions,\s*isAdmin,\s*overrides\)/);
  });

  test('A.4 — filter closure passes overrides as 4th arg', () => {
    expect(HOOK_SRC).toMatch(/filter:\s*\(tabIds\)\s*=>\s*filterAllowedTabs\(tabIds,\s*permissions,\s*isAdmin,\s*overrides\)/);
  });

  test('A.5 — first closure passes overrides as 4th arg', () => {
    expect(HOOK_SRC).toMatch(/first:\s*\(candidates\)\s*=>\s*firstAllowedTab\(permissions,\s*isAdmin,\s*candidates,\s*overrides\)/);
  });

  test('A.6 — overrides included in useMemo dep array (closure invalidation)', () => {
    expect(HOOK_SRC).toMatch(/\}\),\s*\[isAdmin,\s*permissions,\s*loaded,\s*groupName,\s*bootstrap,\s*hasPermission,\s*overrides\]/);
  });

  test('A.7 — overrides exposed in returned object (consumers can inspect)', () => {
    expect(HOOK_SRC).toMatch(/^\s*overrides,\s*$/m);
  });
});

describe('Phase 16.3-bis UTA.B — graceful degradation', () => {
  test('B.1 — overrides defaults to {} when config null/undefined', () => {
    // The optional-chain `?.` + `||` fallback guards against:
    //  - useSystemConfig listener not yet resolved (config = SYSTEM_CONFIG_DEFAULTS)
    //  - read-rule denies non-clinic-staff (config = mergeSystemConfigDefaults(null))
    // Either way `tabOverrides = {}` → static gate behaviour preserved.
    expect(HOOK_SRC).toMatch(/config\?\.tabOverrides\s*\|\|\s*\{\}/);
  });

  test('B.2 — Phase 16.3 marker comment present', () => {
    expect(HOOK_SRC).toMatch(/Phase 16\.3 \(2026-04-29\)/);
    expect(HOOK_SRC).toMatch(/V12 multi-reader-sweep/);
  });
});

describe('Phase 16.3-bis UTA.C — V12 multi-reader-sweep anti-regression', () => {
  test('C.1 — NO bare canAccessTab call without 4th arg in this hook', () => {
    // Hook MUST always pass overrides. Catches the original bug: a future
    // refactor that drops the 4th arg falls back to static gate silently.
    const calls = HOOK_SRC.match(/canAccessTab\([^)]+\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const c of calls) {
      // Each call must have overrides as the last arg
      expect(c).toMatch(/canAccessTab\([^)]+,\s*overrides\)/);
    }
  });

  test('C.2 — NO bare filterAllowedTabs call without 4th arg', () => {
    const calls = HOOK_SRC.match(/filterAllowedTabs\([^)]+\)/g) || [];
    for (const c of calls) {
      expect(c).toMatch(/filterAllowedTabs\([^)]+,\s*overrides\)/);
    }
  });

  test('C.3 — NO bare firstAllowedTab call without 4th arg', () => {
    const calls = HOOK_SRC.match(/firstAllowedTab\([^)]+\)/g) || [];
    for (const c of calls) {
      expect(c).toMatch(/firstAllowedTab\([^)]+,\s*overrides\)/);
    }
  });
});
