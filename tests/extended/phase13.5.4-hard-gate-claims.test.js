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

    it('H1.5-V28tris: setPermission auto-grants admin if permissionGroupId===gp-owner', () => {
      // V28-tris (2026-04-26): User directive "ป้องกันอย่าให้เป็นอีกไม่ว่า
      // กับ id ไหน mail ไหน". setPermission must close the chicken-and-egg
      // loop by granting admin claim when assigning to gp-owner group.
      const block = USERS_API.match(/async\s+function\s+handleSetPermission[\s\S]*?\n\}/);
      expect(block).toBeTruthy();
      expect(block[0]).toMatch(/permissionGroupId\s*===\s*['"]gp-owner['"]/);
      expect(block[0]).toMatch(/grantAdminAuto\s*=\s*true/);
      expect(block[0]).toMatch(/claims\.admin\s*=\s*true/);
    });

    it('H1.5-V28tris-bis: setPermission also auto-grants admin if group has permission_group_management meta-perm', () => {
      // For custom admin groups not named gp-owner. Lookup via Firestore
      // Admin SDK + check group.permissions.permission_group_management.
      const block = USERS_API.match(/async\s+function\s+handleSetPermission[\s\S]*?\n\}/);
      expect(block[0]).toMatch(/getAdminFirestore/);
      expect(block[0]).toMatch(/be_permission_groups/);
      expect(block[0]).toMatch(/permission_group_management\s*===\s*true/);
    });

    it('H1.5-V28tris-resilience: group lookup failure is non-fatal (claim sync continues)', () => {
      const block = USERS_API.match(/async\s+function\s+handleSetPermission[\s\S]*?\n\}/);
      // Try/catch around the group lookup — if Firestore unavailable, set
      // permission still proceeds (just without admin auto-grant)
      expect(block[0]).toMatch(/try\s*\{[\s\S]*?groupRef[\s\S]*?\}\s*catch/);
      expect(block[0]).toMatch(/console\.warn[^)]*setPermission/);
    });

    it('H1.5-V28tris-no-revoke: does NOT auto-revoke admin if group changes to non-admin', () => {
      // V28-tris explicit lesson: don't auto-revoke. Admin demotion is a
      // separate explicit operation (revokeAdmin) to prevent accidental
      // lockout. Look for the comment that explains this:
      const block = USERS_API.match(/async\s+function\s+handleSetPermission[\s\S]*?\n\}/);
      expect(block[0]).toMatch(/NOT auto-revoke/);
      // The fn must NOT have `delete claims.admin` anywhere
      expect(block[0]).not.toMatch(/delete\s+claims\.admin/);
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

  describe('H4 (V29 REMOVED): manual buttons removed — auto-sync via UPC + sync-self', () => {
    // V29 (2026-04-26) — User directive: "เอาปุ่ม Bootstrap ตัวเองเป็น admin,
    // Sync ทุก staff → Claims, ลบ test-probe ค้าง. ออกให้หมด ไม่ต้องการ
    // ระบบ manual เหล่านี้". All 3 manual buttons removed.
    it('H4-removed.1: handleMigrateAllToClaims function REMOVED', () => {
      expect(PG_TAB).not.toMatch(/handleMigrateAllToClaims/);
    });

    it('H4-removed.2: "Sync ทุก staff → Claims" button data-testid REMOVED', () => {
      expect(PG_TAB).not.toMatch(/data-testid=["']permission-claims-migrate-button["']/);
    });

    it('H4-removed.3: handleBootstrapSelf function REMOVED', () => {
      expect(PG_TAB).not.toMatch(/handleBootstrapSelf/);
    });

    it('H4-removed.4: "Bootstrap ตัวเองเป็น admin" button data-testid REMOVED', () => {
      expect(PG_TAB).not.toMatch(/data-testid=["']permission-bootstrap-self-button["']/);
    });

    it('H4-removed.5: handleCleanupTestProbes function REMOVED', () => {
      expect(PG_TAB).not.toMatch(/handleCleanupTestProbes/);
    });

    it('H4-removed.6: "ลบ test-probe ค้าง" button data-testid REMOVED', () => {
      expect(PG_TAB).not.toMatch(/data-testid=["']cleanup-test-probes-button["']/);
    });

    it('H4-removed.7: V29 marker comment in tab explaining removal', () => {
      expect(PG_TAB).toMatch(/V29[\s\S]{0,200}REMOVED|Removed manual buttons|All manual admin buttons REMOVED/);
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

    it('H6.3: caller email must match @loverclinic.com OR be in OWNER_EMAILS (V27-bis)', () => {
      expect(BOOTSTRAP_API).toMatch(/LOVERCLINIC_EMAIL_RE/);
      expect(BOOTSTRAP_API).toMatch(/@loverclinic\\\./);
      // V27-bis: extended check — OWNER_EMAILS allowlist
      expect(BOOTSTRAP_API).toMatch(/OWNER_EMAILS/);
      expect(BOOTSTRAP_API).toMatch(/isOwnerEmail/);
      // Updated forbidden message — mentions both paths
      expect(BOOTSTRAP_API).toMatch(/Forbidden:[\s\S]{0,80}OWNER_EMAILS|Forbidden:[\s\S]{0,80}allowlist/);
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

    it('H6.8: logs the admin grant for audit trail (V27-bis: now covers genesis OR owner-bootstrap)', () => {
      expect(BOOTSTRAP_API).toMatch(/console\.log\([^)]*bootstrap-self/);
      // After V27-bis the log says "admin granted" (covers BOTH genesis
      // first-admin path AND owner-bootstrap path — flag is in `owner=`
      // suffix instead)
      expect(BOOTSTRAP_API).toMatch(/admin\s+granted/);
    });

    it('H6.10: V27-bis — owner-email skips genesis check (multi-owner clinics)', () => {
      const fnBlock = BOOTSTRAP_API.match(/Gate 3:[\s\S]*?\}\s*\}/);
      expect(fnBlock, 'Gate 3 block not found').toBeTruthy();
      // The genesis check must be conditional on !isOwner
      expect(fnBlock[0]).toMatch(/if\s*\(\s*!isOwner\s*\)/);
      expect(fnBlock[0]).toMatch(/findExistingAdmin/);
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

    it('H7.4 (V29 REMOVED): PermissionGroupsTab does NOT import bootstrapSelfAsAdmin (button removed)', () => {
      // V29: bootstrap button removed; auto-sync via UserPermissionContext
      // useEffect handles owner accounts on login. The endpoint still
      // exists (for manual emergency use) but the UI button is gone.
      expect(PG_TAB).not.toMatch(/bootstrapSelfAsAdmin/);
    });

    it('H7.5 (V29 REMOVED): handleBootstrapSelf function gone from PermissionGroupsTab', () => {
      expect(PG_TAB).not.toMatch(/handleBootstrapSelf/);
    });

    it('H7.6 (V29 REMOVED): bootstrap button data-testid gone', () => {
      expect(PG_TAB).not.toMatch(/data-testid=["']permission-bootstrap-self-button["']/);
    });

    // bootstrapSelfAsAdmin client wrapper still exists for UPC auto-sync use
    it('H7.7-keep: bootstrapSelfAsAdmin client wrapper still exported', () => {
      expect(ADMIN_CLIENT).toMatch(/export\s+async\s+function\s+bootstrapSelfAsAdmin/);
    });

    it('H7.8-keep: client wrapper attaches status + payload (UPC auto-sync uses this)', () => {
      const fnBlock = ADMIN_CLIENT.match(/async\s+function\s+bootstrapSelfAsAdmin[\s\S]*?\n\}/);
      expect(fnBlock[0]).toMatch(/err\.status\s*=\s*res\.status/);
    });
  });

  describe('H8 (V29): /api/admin/sync-self endpoint + auto-sync via UPC', () => {
    const SYNC_SELF_API = READ('api/admin/sync-self.js');
    const UPC = READ('src/contexts/UserPermissionContext.jsx');

    it('H8.1: /api/admin/sync-self endpoint exists with default export handler', () => {
      expect(SYNC_SELF_API).toMatch(/export\s+default\s+async\s+function\s+handler/);
    });

    it('H8.2: requires Bearer token (signature verified, NOT admin gate)', () => {
      // Self-service: any signed-in user can sync THEIR OWN claims
      expect(SYNC_SELF_API).toMatch(/Bearer/);
      expect(SYNC_SELF_API).toMatch(/verifyIdToken/);
      expect(SYNC_SELF_API).not.toMatch(/verifyAdminToken\s*\(/);
    });

    it('H8.3: looks up be_staff WHERE firebaseUid == caller uid (own only)', () => {
      expect(SYNC_SELF_API).toMatch(/be_staff/);
      expect(SYNC_SELF_API).toMatch(/firebaseUid/);
      expect(SYNC_SELF_API).toMatch(/where\(['"]firebaseUid['"]\s*,\s*['"]==['"]\s*,\s*callerUid\)/);
    });

    it('H8.4: returns synced=false when no be_staff doc (UPC falls back to bootstrap-self)', () => {
      expect(SYNC_SELF_API).toMatch(/synced:\s*false/);
      expect(SYNC_SELF_API).toMatch(/no be_staff doc/);
    });

    it('H8.5: sets isClinicStaff + permissionGroupId claims', () => {
      expect(SYNC_SELF_API).toMatch(/isClinicStaff:\s*true/);
      expect(SYNC_SELF_API).toMatch(/permissionGroupId/);
      expect(SYNC_SELF_API).toMatch(/setCustomUserClaims/);
    });

    it('H8.6: V28-tris auto-grants admin if gp-owner OR meta-perm group', () => {
      expect(SYNC_SELF_API).toMatch(/permissionGroupId\s*===\s*['"]gp-owner['"]/);
      expect(SYNC_SELF_API).toMatch(/be_permission_groups/);
      expect(SYNC_SELF_API).toMatch(/permission_group_management\s*===\s*true/);
    });

    it('H8.7: preserves existing custom claims (spread + override)', () => {
      expect(SYNC_SELF_API).toMatch(/\.\.\.\(existing\.customClaims\s*\|\|\s*\{\}\)/);
    });

    it('H8.8: UPC imports syncClaimsSelf', () => {
      expect(UPC).toMatch(/syncClaimsSelf/);
      expect(UPC).toMatch(/from\s+['"]\.\.\/lib\/adminUsersClient/);
    });

    it('H8.9: UPC auto-sync useEffect tries sync-self FIRST, then falls back to bootstrap-self', () => {
      // Sync-self call must come BEFORE bootstrap-self in the same effect
      const fnBlock = UPC.match(/Auto-sync claims on every login[\s\S]*?\n\s*\}\,\s*\[user\?\.uid/);
      expect(fnBlock, 'V29 auto-sync useEffect not found').toBeTruthy();
      const body = fnBlock[0];
      const syncIdx = body.indexOf('syncClaimsSelf');
      const bootstrapIdx = body.indexOf('bootstrapSelfAsAdmin');
      expect(syncIdx).toBeGreaterThan(-1);
      expect(bootstrapIdx).toBeGreaterThan(-1);
      expect(syncIdx).toBeLessThan(bootstrapIdx);
    });

    it('H8.10: UPC group-change useEffect re-syncs claims when staff.permissionGroupId changes', () => {
      expect(UPC).toMatch(/Re-sync claims when admin changes group/);
      expect(UPC).toMatch(/lastSyncedGroupRef/);
      expect(UPC).toMatch(/staff\?\.permissionGroupId/);
    });

    it('H8.11: UPC forces token refresh after sync (getIdToken(true))', () => {
      expect(UPC).toMatch(/getIdToken\(true\)/);
    });
  });

  describe('H5: Phase 13.5.4 staging — Deploy 2 LIVE (V26 + V27-bis)', () => {
    it('H5.1: firestore.rules POST-Deploy-2 — isClinicStaff() is now claim-only', () => {
      // After Deploy 2 (V26) shipped, the helper checks custom claims
      // instead of email. This test was originally an anti-regression for
      // Deploy 1 ("rules unchanged"); after V26 deploy completed it
      // flipped to lock the new shape. See V26 entry in
      // .claude/rules/00-session-start.md for the migration journey.
      const RULES = READ('firestore.rules');
      // Helper now checks isClinicStaff custom claim
      expect(RULES).toMatch(/request\.auth\.token\.isClinicStaff\s*==\s*true/);
      // AND checks admin claim (defense-in-depth)
      expect(RULES).toMatch(/request\.auth\.token\.admin\s*==\s*true/);
      // Email regex check REMOVED from helper body (still in comments
      // for institutional memory — strip comments before checking)
      const fn = RULES.match(/function\s+isClinicStaff[\s\S]*?\n\s+\}/);
      const noCommentBody = fn[0]
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      expect(noCommentBody).not.toMatch(/\.matches\(['"`]\.\*@loverclinic/);
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
