// ─── V28-bis (2026-04-26) — Auto-bootstrap admin on owner login ──────────
//
// User report: oomz.peerapat@gmail.com (after V27-bis OWNER_EMAILS) saw
// backend sidebar but couldn't add staff via StaffFormModal — got
// "Forbidden: admin privilege required" because /api/admin/users gate
// requires admin: true custom claim. oomz had no claim because they never
// manually clicked "Bootstrap ตัวเองเป็น admin" button.
//
// V28-bis: UserPermissionContext auto-calls bootstrapSelfAsAdmin() on
// login for authorized users (loverclinic email OR OWNER_EMAILS) who
// don't yet have admin claim. Silent, per-session ref guard prevents
// repeat calls. Token refresh forces claim pickup.
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

describe('V28-bis — UserPermissionContext auto-bootstrap on login', () => {
  describe('AB1: Imports + ref guard', () => {
    it('AB1.1: imports useRef from react', () => {
      expect(PROVIDER).toMatch(/import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*['"]react['"]/);
    });

    it('AB1.2: imports bootstrapSelfAsAdmin from adminUsersClient', () => {
      expect(PROVIDER).toMatch(/import\s*\{[^}]*\bbootstrapSelfAsAdmin\b[^}]*\}\s*from\s*['"]\.\.\/lib\/adminUsersClient/);
    });

    it('AB1.3: bootstrapAttemptedRef declared via useRef', () => {
      expect(PROVIDER).toMatch(/bootstrapAttemptedRef\s*=\s*useRef\(false\)/);
    });
  });

  describe('AB2: Auto-bootstrap useEffect logic', () => {
    it('AB2.1: useEffect runs on user.uid OR user.email change', () => {
      // Effect deps must include both uid and email — uid for identity,
      // email for re-evaluation if user updates email
      expect(PROVIDER).toMatch(/\[user\?\.uid,\s*user\?\.email\]/);
    });

    it('AB2.2: per-session guard — only fires once per uid (ref check)', () => {
      const fnBlock = PROVIDER.match(/bootstrapAttemptedRef[\s\S]{0,200}useEffect[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      expect(fnBlock).toBeTruthy();
      expect(fnBlock[0]).toMatch(/if\s*\(bootstrapAttemptedRef\.current\)\s*return/);
      expect(fnBlock[0]).toMatch(/bootstrapAttemptedRef\.current\s*=\s*true/);
    });

    it('AB2.3: reset ref on logout (user.uid null)', () => {
      // When user.uid becomes null, ref must reset so next login can bootstrap
      expect(PROVIDER).toMatch(/if\s*\(\s*!user\?\.uid\s*\)[\s\S]{0,200}bootstrapAttemptedRef\.current\s*=\s*false/);
    });

    it('AB2.4: skips if admin claim already true (avoid unnecessary network)', () => {
      expect(PROVIDER).toMatch(/tokenResult\?\.claims\?\.admin\s*===\s*true/);
      expect(PROVIDER).toMatch(/getIdTokenResult\(\)/);
    });

    it('AB2.5: skips if email NOT in @loverclinic OR OWNER_EMAILS', () => {
      // Must check both LOVERCLINIC_EMAIL_RE AND isOwnerEmail
      const fnBlock = PROVIDER.match(/Auto-bootstrap[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      expect(fnBlock).toBeTruthy();
      expect(fnBlock[0]).toMatch(/LOVERCLINIC_EMAIL_RE\.test\(email\)/);
      expect(fnBlock[0]).toMatch(/isOwnerEmail\(email\)/);
      expect(fnBlock[0]).toMatch(/if\s*\(!isAuthorized\)\s*return/);
    });

    it('AB2.6: calls bootstrapSelfAsAdmin then forces token refresh', () => {
      const fnBlock = PROVIDER.match(/Auto-bootstrap[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      expect(fnBlock[0]).toMatch(/await\s+bootstrapSelfAsAdmin\(\)/);
      expect(fnBlock[0]).toMatch(/getIdToken\(true\)/);
    });

    it('AB2.7: errors caught + logged, not thrown (non-fatal)', () => {
      const fnBlock = PROVIDER.match(/Auto-bootstrap[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      expect(fnBlock[0]).toMatch(/try\s*\{[\s\S]*?\}\s*catch\s*\([\s\S]*?\)\s*\{/);
      expect(fnBlock[0]).toMatch(/console\.warn\([^)]*auto-bootstrap/);
    });
  });

  describe('AB3: Email lowercase comparison (consistency)', () => {
    it('AB3.1: email is lowercased before isOwnerEmail check', () => {
      // OWNER_EMAILS list is lowercase; case-insensitive matching prevents
      // false negatives if Firebase returns email with different case
      expect(PROVIDER).toMatch(/email\s*=\s*\(user\.email\s*\|\|\s*''\)\.toLowerCase\(\)/);
    });
  });
});
