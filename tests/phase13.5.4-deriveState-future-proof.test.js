// ─── V28 (2026-04-26) — deriveState future-proof tests ───────────────────
//
// User directive: "ทำให้ถ้ามีการเพิ่มสิทธิ์ เพิ่มพนักงาน เพิ่มเมลที่เป็น
// admin หรือ user ในอนาคต จะต้องใช้ได้เลย ไม่เป็นแบบนี้อีก เทสให้แน่ใจ"
//
// V27-bis fixed the bootstrap admin (oomz.peerapat@gmail.com — owner with
// no be_staff doc) by adding OWNER_EMAILS allowlist. V28 fixes the OTHER
// half: legit staff added via StaffFormModal must IMMEDIATELY have access
// when they log in, regardless of email domain.
//
// 5 personas tested adversarially. The single contract: who renders the
// backend nav, what permissions they see, what the admin gate sees.

import { describe, it, expect } from 'vitest';
import { __deriveStateForTest } from '../src/contexts/UserPermissionContext.jsx';

// ─── Permissions fixtures ────────────────────────────────────────────────
const ALL_PERMS = {
  // Sample of permission keys — real list is much larger
  permission_group_management: true,
  customer_management: true,
  sale_management: true,
  treatment_management: true,
  appointment_management: true,
  staff_management: true,
};
const FRONTDESK_PERMS = {
  customer_management: true,
  appointment_management: true,
};
const NURSE_PERMS = {
  treatment_management: true,
  customer_management: true,
};
const META_ONLY_PERMS = {
  permission_group_management: true,
};

const groupOwner = { id: 'gp-owner', name: 'เจ้าของ', permissions: ALL_PERMS };
const groupFrontdesk = { id: 'gp-frontdesk', name: 'Front desk', permissions: FRONTDESK_PERMS };
const groupNurse = { id: 'gp-nurse', name: 'พยาบาล', permissions: NURSE_PERMS };
const groupMetaOnly = { id: 'gp-perm-mgr', name: 'Permission manager', permissions: META_ONLY_PERMS };

describe('V28 — deriveState future-proof: any future user must "just work"', () => {

  describe('P1: Bootstrap admin paths (no be_staff doc)', () => {
    it('P1.1: @loverclinic.com bootstrap admin → isAdmin true', () => {
      const s = __deriveStateForTest(
        { uid: 'u1', email: 'admin@loverclinic.com' },
        null,
        null,
      );
      expect(s.isAdmin).toBe(true);
      expect(s.bootstrap).toBe(true);
      expect(s.hasPermission('any_random_key')).toBe(true);
    });

    it('P1.2: OWNER_EMAILS Gmail owner (oomz) → isAdmin true', () => {
      const s = __deriveStateForTest(
        { uid: 'u2', email: 'oomz.peerapat@gmail.com' },
        null,
        null,
      );
      expect(s.isAdmin).toBe(true);
      expect(s.bootstrap).toBe(true);
      expect(s.isOwnerAccount).toBe(true);
    });

    it('P1.3: random gmail (NOT in OWNER_EMAILS) + no staff → NOT admin', () => {
      const s = __deriveStateForTest(
        { uid: 'attacker', email: 'random@gmail.com' },
        null,
        null,
      );
      expect(s.isAdmin).toBe(false);
      expect(s.bootstrap).toBe(false);
      expect(s.isOwnerAccount).toBe(false);
    });

    it('P1.4: anonymous user (no email) → NOT admin', () => {
      const s = __deriveStateForTest(
        { uid: 'anon', email: '' },
        null,
        null,
      );
      expect(s.isAdmin).toBe(false);
      expect(s.bootstrap).toBe(false);
    });
  });

  describe('P2: Staff added by admin → MUST work regardless of email', () => {
    // V28 KEY FIX: this group used to fail for non-loverclinic emails because
    // isAuthorizedAccount prefix gated the entire isAdmin computation.
    it('P2.1: Gmail staff in gp-owner group → isAdmin true (V28 fix)', () => {
      const s = __deriveStateForTest(
        { uid: 'staff-jane', email: 'jane.smith@gmail.com' },
        { staffId: 'STF-1', permissionGroupId: 'gp-owner', firebaseUid: 'staff-jane' },
        groupOwner,
      );
      expect(s.isAdmin, 'gmail staff in gp-owner must be admin (V28)').toBe(true);
      expect(s.bootstrap).toBe(false);
      expect(s.hasPermission('staff_management')).toBe(true);
    });

    it('P2.2: Outlook staff in gp-frontdesk → NOT admin, but has frontdesk perms', () => {
      const s = __deriveStateForTest(
        { uid: 'staff-bob', email: 'bob.frontdesk@outlook.com' },
        { staffId: 'STF-2', permissionGroupId: 'gp-frontdesk', firebaseUid: 'staff-bob' },
        groupFrontdesk,
      );
      expect(s.isAdmin).toBe(false);
      expect(s.hasPermission('customer_management')).toBe(true);
      expect(s.hasPermission('appointment_management')).toBe(true);
      expect(s.hasPermission('staff_management'), 'frontdesk should NOT have staff mgmt').toBe(false);
    });

    it('P2.3: Yahoo staff with permission_group_management meta-perm → isAdmin true', () => {
      const s = __deriveStateForTest(
        { uid: 'staff-pm', email: 'permission-manager@yahoo.com' },
        { staffId: 'STF-3', permissionGroupId: 'gp-perm-mgr', firebaseUid: 'staff-pm' },
        groupMetaOnly,
      );
      expect(s.isAdmin, 'meta-perm should grant admin regardless of email').toBe(true);
      expect(s.hasPermission('any_random_key'), 'admin sees all').toBe(true);
    });

    it('P2.4: Gmail nurse (no admin) → only nurse perms', () => {
      const s = __deriveStateForTest(
        { uid: 'staff-nurse', email: 'nurse.alice@gmail.com' },
        { staffId: 'STF-4', permissionGroupId: 'gp-nurse', firebaseUid: 'staff-nurse' },
        groupNurse,
      );
      expect(s.isAdmin).toBe(false);
      expect(s.hasPermission('treatment_management')).toBe(true);
      expect(s.hasPermission('customer_management')).toBe(true);
      expect(s.hasPermission('sale_management')).toBe(false);
      expect(s.hasPermission('staff_management')).toBe(false);
    });

    it('P2.5: Loverclinic staff in gp-frontdesk (NOT bootstrap) → frontdesk perms only, NOT admin', () => {
      // Even @loverclinic.com email, if explicitly assigned to non-admin
      // group, should NOT be admin. The bootstrap path (no staff doc)
      // is a setup-only loophole — once admin assigns them a group, that
      // group's permissions are authoritative.
      const s = __deriveStateForTest(
        { uid: 'staff-clerk', email: 'clerk@loverclinic.com' },
        { staffId: 'STF-5', permissionGroupId: 'gp-frontdesk', firebaseUid: 'staff-clerk' },
        groupFrontdesk,
      );
      expect(s.isAdmin, 'loverclinic email but in non-admin group should NOT be admin').toBe(false);
      expect(s.bootstrap, 'has staff doc → bootstrap is false').toBe(false);
      expect(s.hasPermission('staff_management')).toBe(false);
      expect(s.hasPermission('customer_management')).toBe(true);
    });
  });

  describe('P3: Edge cases — unassigned, deleted, racy', () => {
    it('P3.1: Staff doc with NO permissionGroupId → no permissions', () => {
      const s = __deriveStateForTest(
        { uid: 'staff-unassigned', email: 'new.hire@gmail.com' },
        { staffId: 'STF-6', permissionGroupId: '', firebaseUid: 'staff-unassigned' },
        null,
      );
      expect(s.isAdmin).toBe(false);
      expect(s.hasPermission('customer_management')).toBe(false);
    });

    it('P3.2: Staff doc with bad permissionGroupId (group deleted) → no permissions', () => {
      const s = __deriveStateForTest(
        { uid: 'staff-orphan', email: 'orphan@gmail.com' },
        { staffId: 'STF-7', permissionGroupId: 'gp-deleted', firebaseUid: 'staff-orphan' },
        null,  // group fetch returned null
      );
      expect(s.isAdmin).toBe(false);
      expect(s.hasPermission('customer_management')).toBe(false);
    });

    it('P3.3: User present, staff still loading (null) → bootstrap iff authorized email', () => {
      // Loading state: User logged in, listenToUserPermissions hasn't
      // returned yet. Bootstrap path lights up immediately for known
      // owner emails so they don't see "no access" flash.
      const s = __deriveStateForTest(
        { uid: 'u-loading', email: 'oomz.peerapat@gmail.com' },
        null,
        null,
      );
      expect(s.isAdmin).toBe(true);
      expect(s.bootstrap).toBe(true);
    });

    it('P3.4: User null entirely (logged out) → no admin, no perms', () => {
      const s = __deriveStateForTest(null, null, null);
      expect(s.isAdmin).toBe(false);
      expect(s.bootstrap).toBe(false);
      expect(s.hasPermission('any')).toBe(false);
    });

    it('P3.5: Group with empty permissions object → no perms, but isOwnerGroup still wins', () => {
      const s = __deriveStateForTest(
        { uid: 'staff-empty-grp', email: 'empty-grp@gmail.com' },
        { staffId: 'STF-8', permissionGroupId: 'gp-owner', firebaseUid: 'staff-empty-grp' },
        { id: 'gp-owner', name: 'Owner', permissions: {} },
      );
      // groupId === 'gp-owner' triggers isAdmin via isOwnerGroup branch,
      // even when the group's permissions object is empty (defensive — if
      // an admin accidentally cleared the owner group's perms, we still
      // recognize the gp-owner ID as the admin role).
      expect(s.isAdmin).toBe(true);
    });
  });

  describe('P4: Adversarial — attempts to exploit the new logic', () => {
    it('P4.1: Spoofed gmail with be_staff doc claiming gp-owner → would only work if firestore.rules let them write be_staff (covered by Phase 13.5.4 hard-gate)', () => {
      // This test documents the security boundary. Frontend deriveState
      // trusts the be_staff doc at face value — the actual security
      // gate is firestore.rules requiring isClinicStaff() to write
      // be_staff. So an attacker can't insert a fake be_staff doc;
      // the V26 claim-only rule blocks them.
      const s = __deriveStateForTest(
        { uid: 'attacker', email: 'evil@badactor.com' },
        { staffId: 'STF-FAKE', permissionGroupId: 'gp-owner', firebaseUid: 'attacker' },
        groupOwner,
      );
      // FRONTEND: would render as admin IF this doc existed
      expect(s.isAdmin).toBe(true);
      // SECURITY NOTE: The doc CAN'T exist for an attacker because
      // be_staff create requires isClinicStaff() claim per
      // firestore.rules. Phase 13.5.4 V26 closes this loophole.
    });

    it('P4.2: Empty email + staff in gp-owner → still admin via group (defensive)', () => {
      const s = __deriveStateForTest(
        { uid: 'phone-only', email: '' },
        { staffId: 'STF-9', permissionGroupId: 'gp-owner', firebaseUid: 'phone-only' },
        groupOwner,
      );
      // Phone-only Firebase auth users (no email) — if admin explicitly
      // granted them gp-owner via staff CRUD, they should be admin.
      expect(s.isAdmin).toBe(true);
    });

    it('P4.3: Permissions object with falsy values → not granted', () => {
      const s = __deriveStateForTest(
        { uid: 'staff-zero', email: 'zero-perms@gmail.com' },
        { staffId: 'STF-10', permissionGroupId: 'gp-restrictive', firebaseUid: 'staff-zero' },
        { id: 'gp-restrictive', permissions: { customer_management: false, sale_management: 'false' } },
      );
      expect(s.isAdmin).toBe(false);
      expect(s.hasPermission('customer_management')).toBe(false);
      // 'false' string is truthy in JS but our check is === true, so
      // anything other than literal `true` is rejected
      expect(s.hasPermission('sale_management')).toBe(false);
    });

    it('P4.4: Permissions object with prototype pollution attempts → safely false', () => {
      const evilPerms = JSON.parse('{"__proto__":{"polluted":true},"customer_management":true}');
      const s = __deriveStateForTest(
        { uid: 'staff-polluted', email: 'polluted@gmail.com' },
        { staffId: 'STF-11', permissionGroupId: 'gp-evil', firebaseUid: 'staff-polluted' },
        { id: 'gp-evil', permissions: evilPerms },
      );
      // Specific permission still works (no prototype pollution affects this)
      expect(s.hasPermission('customer_management')).toBe(true);
      // Random keys NOT granted (would be the case if prototype was polluted)
      expect(s.hasPermission('arbitrary_admin_action')).toBe(false);
    });
  });

  describe('P5: groupName surfacing for UI badge', () => {
    it('P5.1: bootstrap admin → "เจ้าของกิจการ (bootstrap)"', () => {
      const s = __deriveStateForTest(
        { uid: 'u1', email: 'oomz.peerapat@gmail.com' },
        null,
        null,
      );
      expect(s.groupName).toBe('เจ้าของกิจการ (bootstrap)');
    });

    it('P5.2: staff in named group → group.name', () => {
      const s = __deriveStateForTest(
        { uid: 'u2', email: 'jane@gmail.com' },
        { staffId: 'STF-12', permissionGroupId: 'gp-frontdesk', firebaseUid: 'u2' },
        groupFrontdesk,
      );
      expect(s.groupName).toBe('Front desk');
    });

    it('P5.3: staff with no group → empty string', () => {
      const s = __deriveStateForTest(
        { uid: 'u3', email: 'nobody@gmail.com' },
        { staffId: 'STF-13', permissionGroupId: '', firebaseUid: 'u3' },
        null,
      );
      expect(s.groupName).toBe('');
    });
  });
});
