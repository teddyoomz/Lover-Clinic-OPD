// ─── V28-bis (2026-04-26) → V29 (2026-04-26) — Auto-sync claims on login ─
//
// V28-bis history: auto-bootstrap admin on login for OWNER_EMAILS only.
// V29 evolution: replaced with universal sync-self pattern that handles
// ALL user types (staff in any group + owner accounts) automatically.
// User directive: "ทำให้ Perfect 100% กับทุก id ทุกสิทธิ์ที่ id นั้น
// ได้รับด้วย" — no manual buttons, every id gets correct claims auto.
//
// V29 flow on login (UserPermissionContext useEffect):
//   1. Try /api/admin/sync-self — works for any signed-in user with
//      a be_staff doc. Sets isClinicStaff + permissionGroupId. Auto-
//      grants admin if group is gp-owner OR has meta-perm.
//   2. If sync-self returns synced=false (no be_staff doc) → fallback
//      to /api/admin/bootstrap-self for owner accounts (@loverclinic
//      OR OWNER_EMAILS).
//   3. Force ID token refresh after either path so claims propagate.
//
// Source-grep tests lock the implementation. Runtime verification
// happens via real-browser refresh after deploy.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PROVIDER = fs.readFileSync(
  path.join(ROOT, 'src/contexts/UserPermissionContext.jsx'),
  'utf8',
);

describe('V29 — UserPermissionContext auto-sync claims on login', () => {
  describe('AB1: Imports + ref guard', () => {
    it('AB1.1: imports useRef from react', () => {
      expect(PROVIDER).toMatch(/import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*['"]react['"]/);
    });

    it('AB1.2: imports BOTH bootstrapSelfAsAdmin AND syncClaimsSelf', () => {
      expect(PROVIDER).toMatch(/bootstrapSelfAsAdmin/);
      expect(PROVIDER).toMatch(/syncClaimsSelf/);
      expect(PROVIDER).toMatch(/from\s*['"]\.\.\/lib\/adminUsersClient/);
    });

    it('AB1.3: bootstrapAttemptedRef declared via useRef (V29 still uses session guard)', () => {
      expect(PROVIDER).toMatch(/bootstrapAttemptedRef\s*=\s*useRef\(false\)/);
    });
  });

  describe('AB2: V29 auto-sync useEffect logic — sync-self FIRST, bootstrap-self FALLBACK', () => {
    it('AB2.1: useEffect runs on user.uid OR user.email change', () => {
      expect(PROVIDER).toMatch(/\[user\?\.uid,\s*user\?\.email\]/);
    });

    it('AB2.2: per-session guard — only fires once per uid (ref check)', () => {
      const fnBlock = PROVIDER.match(/bootstrapAttemptedRef[\s\S]{0,400}useEffect[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      expect(fnBlock).toBeTruthy();
      expect(fnBlock[0]).toMatch(/if\s*\(bootstrapAttemptedRef\.current\)\s*return/);
      expect(fnBlock[0]).toMatch(/bootstrapAttemptedRef\.current\s*=\s*true/);
    });

    it('AB2.3: reset ref on logout (user.uid null)', () => {
      expect(PROVIDER).toMatch(/if\s*\(\s*!user\?\.uid\s*\)[\s\S]{0,400}bootstrapAttemptedRef\.current\s*=\s*false/);
    });

    it('AB2.4: V29 — calls syncClaimsSelf FIRST (universal staff sync)', () => {
      const fnBlock = PROVIDER.match(/Auto-sync claims on every login[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      expect(fnBlock, 'V29 auto-sync useEffect not found').toBeTruthy();
      expect(fnBlock[0]).toMatch(/await\s+syncClaimsSelf\(\)/);
    });

    it('AB2.5: V29 — falls back to bootstrapSelfAsAdmin when sync-self returns synced=false', () => {
      const fnBlock = PROVIDER.match(/Auto-sync claims on every login[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      // When sync-self returns synced=false, the fallback path checks
      // for authorized email (loverclinic OR OWNER_EMAILS) and calls
      // bootstrap-self.
      expect(fnBlock[0]).toMatch(/staffSynced/);
      expect(fnBlock[0]).toMatch(/if\s*\(!staffSynced\)/);
      expect(fnBlock[0]).toMatch(/LOVERCLINIC_EMAIL_RE\.test\(email\)/);
      expect(fnBlock[0]).toMatch(/isOwnerEmail\(email\)/);
      expect(fnBlock[0]).toMatch(/await\s+bootstrapSelfAsAdmin\(\)/);
    });

    it('AB2.6: forces token refresh after sync (so claims propagate to current session)', () => {
      const fnBlock = PROVIDER.match(/Auto-sync claims on every login[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      expect(fnBlock[0]).toMatch(/getIdToken\(true\)/);
    });

    it('AB2.7: errors caught + logged, not thrown (non-fatal)', () => {
      const fnBlock = PROVIDER.match(/Auto-sync claims on every login[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      // Try/catch + console.warn for safety
      expect(fnBlock[0]).toMatch(/try\s*\{[\s\S]*?syncClaimsSelf[\s\S]*?\}\s*catch/);
      expect(fnBlock[0]).toMatch(/console\.warn\([^)]*auto-sync/);
    });
  });

  describe('AB3: Email lowercase comparison (consistency)', () => {
    it('AB3.1: email is lowercased before isOwnerEmail check', () => {
      expect(PROVIDER).toMatch(/email\s*=\s*\(user\.email\s*\|\|\s*''\)\.toLowerCase\(\)/);
    });
  });

  describe('AB4: V29 group-change re-sync (handles admin changing user group while logged in)', () => {
    it('AB4.1: lastSyncedGroupRef tracks current group for change detection', () => {
      expect(PROVIDER).toMatch(/lastSyncedGroupRef\s*=\s*useRef\(null\)/);
    });

    it('AB4.2: group-change useEffect deps include staff?.permissionGroupId', () => {
      expect(PROVIDER).toMatch(/\[user\?\.uid,\s*loaded,\s*staff\?\.permissionGroupId\]/);
    });

    it('AB4.3: skips initial render (lastSyncedGroupRef === null first time)', () => {
      const fnBlock = PROVIDER.match(/Re-sync claims when admin changes group[\s\S]*?\}\,\s*\[user\?\.uid,\s*loaded,\s*staff/);
      expect(fnBlock).toBeTruthy();
      expect(fnBlock[0]).toMatch(/if\s*\(lastSyncedGroupRef\.current\s*===\s*null\)/);
    });

    it('AB4.4: re-syncs only when group actually changes (not on every render)', () => {
      const fnBlock = PROVIDER.match(/Re-sync claims when admin changes group[\s\S]*?\}\,\s*\[user\?\.uid,\s*loaded,\s*staff/);
      expect(fnBlock[0]).toMatch(/if\s*\(lastSyncedGroupRef\.current\s*===\s*currentGroup\)\s*return/);
      expect(fnBlock[0]).toMatch(/await\s+syncClaimsSelf\(\)/);
      expect(fnBlock[0]).toMatch(/getIdToken\(true\)/);
    });
  });
});
