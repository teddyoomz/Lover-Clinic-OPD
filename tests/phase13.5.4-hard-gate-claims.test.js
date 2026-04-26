// ─── Phase 13.5.4 — Hard-Gate Custom Claims (MVP) ─────────────────────────
//
// Goal: close the security gap where any @loverclinic.com email user
// (legitimate staff OR external attacker who got an email) has full Firestore
// access via the SDK. Soft-gate (Phase 13.5.1-3) hides UI but rules still
// allow access.
//
// Phase 13.5.4 plan:
//   1. Add `isClinicStaff` + `permissionGroupId` Firebase custom claims via
//      /api/admin/users `setPermission` action
//   2. Auto-sync claims on every staff save in StaffFormModal (after Firestore
//      write succeeds)
//   3. Migration button in PermissionGroupsTab — backfill all existing be_staff
//   4. Deploy 1: app + endpoint + button (rules unchanged)
//   5. User clicks migration button → all staff get claims
//   6. Deploy 2: firestore.rules check `isClinicStaff` claim instead of email
//
// This test bank locks Deploy 1 surfaces. Deploy 2 (firestore.rules
// claim-only) ships in a follow-up commit after user runs migration.
//
// V21 lesson: source-grep tests can encode broken behavior — pair with
// runtime. The Deploy 2 commit will add a probe that verifies the rule
// works end-to-end (anon user + email but no claim → rejected).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const USERS_API = READ('api/admin/users.js');
const ADMIN_CLIENT = READ('src/lib/adminUsersClient.js');
const STAFF_MODAL = READ('src/components/backend/StaffFormModal.jsx');
const PG_TAB = READ('src/components/backend/PermissionGroupsTab.jsx');

describe('Phase 13.5.4 — Hard-Gate Custom Claims (Deploy 1: app + endpoint + button)', () => {

  describe('H1: api/admin/users.js — setPermission + clearPermission actions', () => {
    it('H1.1: handleSetPermission function defined', () => {
      expect(USERS_API).toMatch(/async\s+function\s+handleSetPermission\s*\(/);
    });

    it('H1.2: handleClearPermission function defined', () => {
      expect(USERS_API).toMatch(/async\s+function\s+handleClearPermission\s*\(/);
    });

    it('H1.3: ACTIONS map entry — setPermission', () => {
      expect(USERS_API).toMatch(/setPermission:\s*\(\s*auth\s*,\s*p\s*\)\s*=>\s*handleSetPermission/);
    });

    it('H1.4: ACTIONS map entry — clearPermission (passes caller for self-protection)', () => {
      expect(USERS_API).toMatch(/clearPermission:\s*\(\s*auth\s*,\s*p\s*,\s*caller\s*\)\s*=>\s*handleClearPermission/);
    });

    it('H1.5: setPermission does NOT drop existing claims (spread + override)', () => {
      // The implementation must preserve `admin: true` if the user already had
      // it, while adding/updating isClinicStaff + permissionGroupId.
      const block = USERS_API.match(/async\s+function\s+handleSetPermission[\s\S]*?\n\}/);
      expect(block).toBeTruthy();
      expect(block[0]).toMatch(/\.\.\.\(existing\.customClaims\s*\|\|\s*\{\}\)/);
      expect(block[0]).toMatch(/isClinicStaff:\s*true/);
      expect(block[0]).toMatch(/permissionGroupId/);
    });

    it('H1.6: clearPermission removes only isClinicStaff + permissionGroupId (preserves admin)', () => {
      const block = USERS_API.match(/async\s+function\s+handleClearPermission[\s\S]*?\n\}/);
      expect(block).toBeTruthy();
      expect(block[0]).toMatch(/delete\s+claims\.isClinicStaff/);
      expect(block[0]).toMatch(/delete\s+claims\.permissionGroupId/);
      // Must NOT delete the admin claim (handleRevokeAdmin is the dedicated path)
      expect(block[0]).not.toMatch(/delete\s+claims\.admin\b/);
    });

    it('H1.7: clearPermission self-protection — cannot clear own claim unless bootstrap', () => {
      const block = USERS_API.match(/async\s+function\s+handleClearPermission[\s\S]*?\n\}/);
      expect(block[0]).toMatch(/uid\s*===\s*caller\.uid/);
      expect(block[0]).toMatch(/isBootstrapAdmin\(caller\.uid\)/);
      expect(block[0]).toMatch(/cannot clear own permission claim/);
    });

    it('H1.8: setPermission accepts empty permissionGroupId (unassigned still gets isClinicStaff)', () => {
      const block = USERS_API.match(/async\s+function\s+handleSetPermission[\s\S]*?\n\}/);
      expect(block[0]).toMatch(/permissionGroupId\s*=\s*params\.permissionGroupId[\s\S]*?String\(params\.permissionGroupId\)\.trim\(\)[\s\S]*?''/);
    });

    it('H1.9: serializeUser exposes isClinicStaff + permissionGroupId from customClaims', () => {
      expect(USERS_API).toMatch(/isClinicStaff:\s*userRecord\.customClaims\?\.isClinicStaff\s*===\s*true/);
      expect(USERS_API).toMatch(/permissionGroupId:\s*userRecord\.customClaims\?\.permissionGroupId\s*\|\|\s*''/);
    });
  });

  describe('H2: src/lib/adminUsersClient.js — wrappers', () => {
    it('H2.1: setUserPermission wrapper exported', () => {
      expect(ADMIN_CLIENT).toMatch(/export\s+function\s+setUserPermission\s*\(/);
      expect(ADMIN_CLIENT).toMatch(/callAdminUsers\(['"]setPermission['"]/);
    });

    it('H2.2: clearUserPermission wrapper exported', () => {
      expect(ADMIN_CLIENT).toMatch(/export\s+function\s+clearUserPermission\s*\(/);
      expect(ADMIN_CLIENT).toMatch(/callAdminUsers\(['"]clearPermission['"]/);
    });

    it('H2.3: setUserPermission accepts { uid, permissionGroupId } object pattern (matches V11 lesson)', () => {
      // The wrapper should accept named args, not positional — that's how the
      // existing createAdminUser/updateAdminUser are written. V11 lesson
      // (mock-shadowed export) — keep call-shape consistent.
      expect(ADMIN_CLIENT).toMatch(/setUserPermission\s*\(\s*\{\s*uid\s*,\s*permissionGroupId\s*\}/);
    });
  });

  describe('H3: StaffFormModal auto-sync wiring', () => {
    it('H3.1: imports setUserPermission from adminUsersClient', () => {
      expect(STAFF_MODAL).toMatch(/setUserPermission/);
      expect(STAFF_MODAL).toMatch(/from\s+['"]\.\.\/\.\.\/lib\/adminUsersClient\.js['"]/);
    });

    it('H3.2: setUserPermission called AFTER saveStaff (auto-sync after Firestore write)', () => {
      const saveStaffIdx = STAFF_MODAL.indexOf('await saveStaff(');
      const setPermIdx = STAFF_MODAL.indexOf('setUserPermission(');
      expect(saveStaffIdx).toBeGreaterThan(-1);
      expect(setPermIdx).toBeGreaterThan(-1);
      expect(setPermIdx).toBeGreaterThan(saveStaffIdx);
    });

    it('H3.3: claim sync wrapped in try/catch (non-fatal — Firestore save already succeeded)', () => {
      // The auto-sync must be defensive — a network blip on the claim-set
      // call must not undo the Firestore save the user just made. Migration
      // button can backfill on retry.
      const setPermIdx = STAFF_MODAL.indexOf('setUserPermission(');
      const ctx = STAFF_MODAL.slice(Math.max(0, setPermIdx - 200), setPermIdx + 200);
      expect(ctx).toMatch(/try\s*\{[\s\S]*?setUserPermission\([\s\S]*?\}\s*catch/);
    });

    it('H3.4: claim sync only runs when firebaseUid is present (Firestore-only staff skipped)', () => {
      const setPermIdx = STAFF_MODAL.indexOf('setUserPermission(');
      const before = STAFF_MODAL.slice(Math.max(0, setPermIdx - 300), setPermIdx);
      // Must check firebaseUid before the call
      expect(before).toMatch(/if\s*\(\s*firebaseUid/);
    });

    it('H3.5: claim sync passes the form\'s permissionGroupId', () => {
      const setPermIdx = STAFF_MODAL.indexOf('setUserPermission(');
      const ctx = STAFF_MODAL.slice(setPermIdx, setPermIdx + 200);
      expect(ctx).toMatch(/permissionGroupId:\s*form\.permissionGroupId/);
    });
  });

  describe('H4: PermissionGroupsTab migration button', () => {
    it('H4.1: imports listStaff + setUserPermission', () => {
      expect(PG_TAB).toMatch(/listStaff/);
      expect(PG_TAB).toMatch(/setUserPermission/);
    });

    it('H4.2: handleMigrateAllToClaims function defined', () => {
      expect(PG_TAB).toMatch(/handleMigrateAllToClaims\s*=/);
    });

    it('H4.3: button has data-testid="permission-claims-migrate-button"', () => {
      expect(PG_TAB).toMatch(/data-testid=["']permission-claims-migrate-button["']/);
    });

    it('H4.4: button gated on canDelete (permission_group_management permission)', () => {
      const buttonIdx = PG_TAB.indexOf('permission-claims-migrate-button');
      const ctx = PG_TAB.slice(buttonIdx, buttonIdx + 500);
      expect(ctx).toMatch(/disabled=\{[^}]*!canDelete/);
    });

    it('H4.5: migration loops every be_staff with firebaseUid', () => {
      const fnBlock = PG_TAB.match(/handleMigrateAllToClaims\s*=\s*async[\s\S]*?\n\s*\};/);
      expect(fnBlock).toBeTruthy();
      const body = fnBlock[0];
      expect(body).toMatch(/await\s+listStaff\(\)/);
      expect(body).toMatch(/for\s*\(\s*const\s+s\s+of\s+allStaff\s*\)/);
      expect(body).toMatch(/s\.firebaseUid/);
      expect(body).toMatch(/await\s+setUserPermission/);
    });

    it('H4.6: skips entries without firebaseUid (Firestore-only records)', () => {
      const fnBlock = PG_TAB.match(/handleMigrateAllToClaims\s*=\s*async[\s\S]*?\n\s*\};/);
      expect(fnBlock[0]).toMatch(/if\s*\(\s*!uid\s*\)\s*\{[^}]*skipped/);
    });

    it('H4.7: per-staff error caught — one failure does not abort the whole loop', () => {
      const fnBlock = PG_TAB.match(/handleMigrateAllToClaims\s*=\s*async[\s\S]*?\n\s*\};/);
      // Inside the for-loop, must have try/catch with failed counter
      expect(fnBlock[0]).toMatch(/try\s*\{[\s\S]*?setUserPermission[\s\S]*?\}\s*catch[\s\S]*?failed\s*\+=\s*1/);
    });

    it('H4.8: result UI shows synced/skipped/failed counts + Deploy 2 readiness hint', () => {
      expect(PG_TAB).toMatch(/data-testid=["']permission-claims-migrate-result["']/);
      expect(PG_TAB).toMatch(/synced/);
      expect(PG_TAB).toMatch(/skipped/);
      expect(PG_TAB).toMatch(/failed/);
      expect(PG_TAB).toMatch(/Deploy\s*2/);
    });

    it('H4.9: window.confirm guard before destructive operation', () => {
      const fnBlock = PG_TAB.match(/handleMigrateAllToClaims\s*=\s*async[\s\S]*?\n\s*\};/);
      expect(fnBlock[0]).toMatch(/window\.confirm/);
    });

    // ─── V25 (2026-04-26) — Admin self-bootstrap (lockout-prevention) ──
    // Discovered when user ran migration: 20 staff / 0 synced / 20 skipped
    // (none had firebaseUid). The CURRENT logged-in admin would have NO
    // claim either → Deploy 2 (claim-only rule) = lockout. Fix: button
    // ALSO syncs auth.currentUser.uid as gp-owner if not in be_staff.
    it('H4.10: imports auth from firebase.js (for current-user lookup)', () => {
      expect(PG_TAB).toMatch(/import\s*\{[^}]*\bauth\b/);
      expect(PG_TAB).toMatch(/from\s+['"]\.\.\/\.\.\/firebase\.js['"]/);
    });

    it('H4.11: admin self-bootstrap reads auth.currentUser.uid', () => {
      const fnBlock = PG_TAB.match(/handleMigrateAllToClaims\s*=\s*async[\s\S]*?\n\s*\};/);
      expect(fnBlock[0]).toMatch(/auth\?\.currentUser\?\.uid/);
    });

    it('H4.12: admin self-bootstrap only fires when uid NOT in be_staff (foundInBeStaff guard)', () => {
      const fnBlock = PG_TAB.match(/handleMigrateAllToClaims\s*=\s*async[\s\S]*?\n\s*\};/);
      expect(fnBlock[0]).toMatch(/foundInBeStaff/);
      expect(fnBlock[0]).toMatch(/if\s*\(\s*!foundInBeStaff\s*\)/);
    });

    it('H4.13: admin self-bootstrap calls setUserPermission with gp-owner default', () => {
      const fnBlock = PG_TAB.match(/handleMigrateAllToClaims\s*=\s*async[\s\S]*?\n\s*\};/);
      // The bootstrap call must use gp-owner (admin assumption)
      expect(fnBlock[0]).toMatch(/setUserPermission\(\s*\{\s*uid:\s*myUid,\s*permissionGroupId:\s*['"]gp-owner['"]/);
    });

    it('H4.14: result tracks adminBootstrap field for UI surfacing', () => {
      const fnBlock = PG_TAB.match(/handleMigrateAllToClaims\s*=\s*async[\s\S]*?\n\s*\};/);
      expect(fnBlock[0]).toMatch(/adminBootstrap:/);
      // UI block surfaces it to the admin
      expect(PG_TAB).toMatch(/migrateResult\.adminBootstrap/);
      expect(PG_TAB).toMatch(/Admin\s+self-bootstrap/);
    });

    it('H4.15: bootstrap error caught — counts as failed but does NOT abort the loop', () => {
      const fnBlock = PG_TAB.match(/handleMigrateAllToClaims\s*=\s*async[\s\S]*?\n\s*\};/);
      // The bootstrap try/catch must increment result.failed and push an
      // error (with admin marker) — and the FOR loop below must still run
      const bootstrapBlock = fnBlock[0].match(/if\s*\(\s*!foundInBeStaff\s*\)\s*\{[\s\S]*?\}\s*\}/);
      expect(bootstrapBlock).toBeTruthy();
      expect(bootstrapBlock[0]).toMatch(/try\s*\{[\s\S]*?setUserPermission[\s\S]*?\}\s*catch/);
      expect(bootstrapBlock[0]).toMatch(/admin self-bootstrap/);
    });
  });

  // ─── V25-bis (2026-04-26) — Genesis admin bootstrap endpoint ──────────────
  // The Phase 13.5.4 D1 deploy revealed admin user
  // (loverclinic@loverclinic.com) had neither admin:true claim NOR
  // FIREBASE_ADMIN_BOOTSTRAP_UIDS env entry. Migration button hit 403 from
  // /api/admin/users. New endpoint /api/admin/bootstrap-self breaks the
  // chicken-and-egg with strict genesis guards: caller email must match
  // @loverclinic.com AND no other admin may exist.
  describe('H6: V25-bis genesis admin bootstrap endpoint (/api/admin/bootstrap-self)', () => {
    const BOOTSTRAP_API = READ('api/admin/bootstrap-self.js');

    it('H6.1: endpoint file exists with default export handler', () => {
      expect(BOOTSTRAP_API).toMatch(/export\s+default\s+async\s+function\s+handler/);
    });

    it('H6.2: requires Bearer token (signature verified, NOT admin gate)', () => {
      // We do NOT call verifyAdminToken here (chicken-and-egg). We DO
      // verify the token signature ourselves so we can extract caller's
      // UID + email.
      expect(BOOTSTRAP_API).toMatch(/Bearer/);
      expect(BOOTSTRAP_API).toMatch(/verifyIdToken/);
      // Must NOT call verifyAdminToken (would 403 the genesis caller)
      expect(BOOTSTRAP_API).not.toMatch(/verifyAdminToken\s*\(/);
    });

    it('H6.3: caller email must match @loverclinic.com', () => {
      expect(BOOTSTRAP_API).toMatch(/LOVERCLINIC_EMAIL_RE/);
      expect(BOOTSTRAP_API).toMatch(/@loverclinic\\\./);
      expect(BOOTSTRAP_API).toMatch(/Forbidden:\s*caller\s+email\s+must\s+match/);
    });

    it('H6.4: genesis check — refuses if any other admin exists (409 Conflict)', () => {
      expect(BOOTSTRAP_API).toMatch(/findExistingAdmin/);
      expect(BOOTSTRAP_API).toMatch(/another\s+admin\s+already\s+exists/);
      expect(BOOTSTRAP_API).toMatch(/409/);
    });

    it('H6.5: idempotent — already-admin caller still gets isClinicStaff added', () => {
      // If decoded.admin === true, set the claim (with isClinicStaff added)
      // and return alreadyAdmin: true (don't refuse, but no genesis flag)
      expect(BOOTSTRAP_API).toMatch(/decoded\.admin\s*===\s*true/);
      expect(BOOTSTRAP_API).toMatch(/alreadyAdmin:\s*true/);
    });

    it('H6.6: grants both admin: true AND isClinicStaff: true on success', () => {
      // The genesis path must set BOTH claims so the user passes both
      // verifyAdminToken (admin) and Phase 13.5.4 Deploy 2 rule
      // (isClinicStaff). The two-claim grant is the whole point.
      const genesisBlock = BOOTSTRAP_API.match(/All gates passed[\s\S]*?await auth\.setCustomUserClaims/);
      expect(genesisBlock).toBeTruthy();
      expect(genesisBlock[0]).toMatch(/admin:\s*true/);
      expect(genesisBlock[0]).toMatch(/isClinicStaff:\s*true/);
    });

    it('H6.7: preserves existing custom claims (spread)', () => {
      // Just like setPermission, must NOT drop other claims (spread + override)
      expect(BOOTSTRAP_API).toMatch(/\.\.\.\(existing\.customClaims\s*\|\|\s*\{\}\)/);
    });

    it('H6.8: logs the genesis grant for audit trail', () => {
      expect(BOOTSTRAP_API).toMatch(/console\.log\([^)]*bootstrap-self/);
      expect(BOOTSTRAP_API).toMatch(/genesis\s+admin\s+granted/);
    });

    it('H6.9: pagination cap on findExistingAdmin (DoS protection)', () => {
      // The list-all-admins check is paginated — cap at 10 batches × 1000
      // = 10k users so a huge user table doesn't cause perf degradation
      const fnBlock = BOOTSTRAP_API.match(/async\s+function\s+findExistingAdmin[\s\S]*?\n\}/);
      expect(fnBlock).toBeTruthy();
      expect(fnBlock[0]).toMatch(/page\s*<\s*10/);
      expect(fnBlock[0]).toMatch(/listUsers\(1000/);
    });
  });

  describe('H7: V25-bis client wrapper + UI button', () => {
    it('H7.1: bootstrapSelfAsAdmin client wrapper exported', () => {
      expect(ADMIN_CLIENT).toMatch(/export\s+async\s+function\s+bootstrapSelfAsAdmin/);
    });

    it('H7.2: client wrapper hits the bootstrap-self endpoint (NOT /api/admin/users)', () => {
      const fnBlock = ADMIN_CLIENT.match(/async\s+function\s+bootstrapSelfAsAdmin[\s\S]*?\n\}/);
      expect(fnBlock).toBeTruthy();
      expect(fnBlock[0]).toMatch(/['"]\/api\/admin\/bootstrap-self['"]/);
      expect(fnBlock[0]).toMatch(/method:\s*['"]POST['"]/);
      expect(fnBlock[0]).toMatch(/Authorization:\s*`Bearer\s*\$\{token\}`/);
    });

    it('H7.3: client wrapper attaches status + payload to thrown error', () => {
      // When the server returns 409 with existingAdmin info, the UI needs
      // both the HTTP status and the payload to surface it
      const fnBlock = ADMIN_CLIENT.match(/async\s+function\s+bootstrapSelfAsAdmin[\s\S]*?\n\}/);
      expect(fnBlock[0]).toMatch(/err\.status\s*=\s*res\.status/);
      expect(fnBlock[0]).toMatch(/err\.payload\s*=\s*payload/);
    });

    it('H7.4: PermissionGroupsTab imports bootstrapSelfAsAdmin', () => {
      expect(PG_TAB).toMatch(/bootstrapSelfAsAdmin/);
    });

    it('H7.5: handleBootstrapSelf function defined in PermissionGroupsTab', () => {
      expect(PG_TAB).toMatch(/handleBootstrapSelf\s*=\s*async/);
    });

    it('H7.6: bootstrap button has data-testid="permission-bootstrap-self-button"', () => {
      expect(PG_TAB).toMatch(/data-testid=["']permission-bootstrap-self-button["']/);
    });

    it('H7.7: bootstrap success forces ID token refresh (getIdToken(true))', () => {
      const fnBlock = PG_TAB.match(/handleBootstrapSelf\s*=\s*async[\s\S]*?\n\s*\};/);
      expect(fnBlock).toBeTruthy();
      expect(fnBlock[0]).toMatch(/getIdToken\(true\)/);
    });

    it('H7.8: bootstrap result UI surfaces 409 conflict with existingAdmin info', () => {
      // The UI must show the existing admin's email/uid when bootstrap is
      // refused — so the user knows who to ask for grantAdmin
      expect(PG_TAB).toMatch(/data-testid=["']permission-bootstrap-result["']/);
      expect(PG_TAB).toMatch(/existingAdmin/);
      expect(PG_TAB).toMatch(/grantAdmin/);
    });
  });

  describe('H5: Phase 13.5.4 staging — Deploy 1 vs Deploy 2 separation', () => {
    it('H5.1: firestore.rules unchanged in this commit (Deploy 1 ships rules-unchanged)', () => {
      // After Deploy 1 + user runs migration button + verification,
      // a follow-up commit changes the isClinicStaff() helper to claim-only.
      // This test asserts that's still pending (not done in this commit).
      const RULES = READ('firestore.rules');
      // Current isClinicStaff() check is still email-based
      expect(RULES).toMatch(/function\s+isClinicStaff\(\)\s*\{[\s\S]*?@loverclinic\[\.\]com/);
      // Should NOT yet check the custom claim — that's Deploy 2 surface
      // (this assertion FAILS once Deploy 2 lands; that's intentional —
      // remove this guard then.)
      expect(RULES).not.toMatch(/request\.auth\.token\.isClinicStaff\s*===\s*true/);
    });

    it('H5.2: dev-only Sync ProClinic infra unaffected (per Rule H-bis + user 2026-04-26)', () => {
      // User: "ทุกปุ่มใน tab นั้นจะถูกลบทั้งหมด ... ไม่ต้องให้ความสำคัญกับ
      // เรื่องความปลอดภัยมาก". MasterDataTab is dev-only and doesn't
      // need to use isClinicStaff custom claims — it stays as-is, will
      // be stripped at production-launch time.
      const masterTab = READ('src/components/backend/MasterDataTab.jsx');
      // Dev-only marker present (or the tab is on the strip-list at minimum)
      // Just ensure we did NOT accidentally add custom-claim wiring to
      // MasterDataTab (would be wasted work).
      expect(masterTab).not.toMatch(/setUserPermission/);
    });
  });
});
