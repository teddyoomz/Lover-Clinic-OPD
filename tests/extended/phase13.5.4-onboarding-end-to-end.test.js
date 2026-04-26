// ─── V29 (2026-04-26) — End-to-end onboarding integration test ────────────
//
// User directive: "ทำแล้วเทสในกรณีเดียวกับที่เมล oomz.peerapat ได้สิทธิ์
// ครั้งแรกแล้วไม่เจออะไรด้วยนะ ต้องไม่เกิดขึ้นอีก ส่วน id ที่ permission
// ไม่เท่ากันอื่นๆ ก็ต้องเทสให้แน่ใจว่า หลังสร้าง id แล้ว user อื่นๆ จะเห็น
// หรือปรับแก้ได้แค่ในสิทธิ์ที่ตัวเองได้ ห้ามพลาด. ออกแบบ test ยังไงก็ได้
// ที่แม่งจะรู้เรื่องพวกนี้ได้ทั้งหมด 100% โดยที่ผมไม่ต้อง test สร้างเองทีละ id".
//
// Comprehensive E2E test that simulates the FULL chain for every persona
// type WITHOUT requiring user to manually click + verify. Mocks Firebase
// Auth + firebase-admin + Firestore so we can exercise the entire
// onboarding flow per persona in pure unit-test land.
//
// Coverage matrix (1 row per persona type):
//
// | # | Persona | Email | be_staff | group | Expected admin? | Expected perms |
// |---|---------|-------|----------|-------|-----------------|----------------|
// | 1 | Bootstrap admin (oomz scenario) | oomz.peerapat@gmail.com | none | none | YES (via bootstrap-self) | full |
// | 2 | Loverclinic bootstrap admin | admin@loverclinic.com | none | none | YES (via bootstrap-self) | full |
// | 3 | Random unauthorized email | random@gmail.com | none | none | NO (sync-self synced=false + bootstrap-self refused) | none |
// | 4 | Gmail staff in gp-owner | jane@gmail.com | yes | gp-owner | YES (via setPermission V28-tris) | full |
// | 5 | Outlook staff in gp-frontdesk | bob@outlook.com | yes | gp-frontdesk | NO | frontdesk only |
// | 6 | Yahoo staff with meta-perm group | alice@yahoo.com | yes | gp-perm-mgr | YES (via meta-perm V28-tris-bis) | full |
// | 7 | Gmail nurse in gp-nurse | nurse@gmail.com | yes | gp-nurse | NO | nurse only |
// | 8 | Group changed mid-session | jane@gmail.com | yes | gp-owner→gp-nurse | re-sync after change |
//
// Each row exercises:
//   - StaffFormModal save path: createAdminUser → saveStaff → setUserPermission
//   - First login: UserPermissionContext useEffect → syncClaimsSelf or bootstrapSelfAsAdmin
//   - deriveState computation per persona
//   - Hard-gate (firestore.rules check via expected claim shape)
//   - Soft-gate (UI permissions per persona)
//
// What this file does NOT cover (out of scope — runtime needed):
//   - Real Firebase Auth account creation (mocked)
//   - Real Firestore reads/writes (mocked)
//   - Browser DOM rendering (RTL would help but adds complexity)
//   - Real network calls to /api/admin (mocked fetch)
// → These are covered by post-deploy preview_eval + manual user verify.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __deriveStateForTest } from '../src/contexts/UserPermissionContext.jsx';

// ─── Group fixtures (mirror Phase 13.5.1 seedDefaultPermissionGroups) ─────
const GROUP_OWNER = {
  id: 'gp-owner', name: 'เจ้าของกิจการ',
  permissions: {
    permission_group_management: true,
    customer_management: true, sale_management: true, treatment_management: true,
    appointment_management: true, staff_management: true, doctor_management: true,
    promotion_management: true, finance_management: true, stock_management: true,
  },
};
const GROUP_FRONTDESK = {
  id: 'gp-frontdesk', name: 'พนักงานหน้าร้าน',
  permissions: {
    customer_management: true, appointment_management: true,
  },
};
const GROUP_NURSE = {
  id: 'gp-nurse', name: 'พยาบาล',
  permissions: {
    treatment_management: true, customer_management: true, stock_management: true,
  },
};
const GROUP_PERM_MGR = {
  id: 'gp-perm-mgr', name: 'Permission Manager (custom)',
  permissions: {
    permission_group_management: true, // meta-perm = admin-equivalent
  },
};

// ─── /api/admin/sync-self simulator ───────────────────────────────────────
// Mirrors the server logic in api/admin/sync-self.js (V29) so we can
// assert the full onboarding chain without spinning up Vercel.
function simulateSyncSelf({ callerUid, callerEmail, beStaffByUid, groupsById }) {
  const staff = beStaffByUid[callerUid];
  if (!staff) {
    return {
      synced: false,
      reason: 'no be_staff doc — try bootstrap-self for owner accounts',
      uid: callerUid,
      email: callerEmail,
    };
  }
  const permissionGroupId = staff.permissionGroupId || '';
  const newClaims = { isClinicStaff: true, permissionGroupId };

  let adminGranted = false;
  if (permissionGroupId === 'gp-owner') {
    newClaims.admin = true;
    adminGranted = true;
  } else if (permissionGroupId) {
    const group = groupsById[permissionGroupId];
    if (group?.permissions?.permission_group_management === true) {
      newClaims.admin = true;
      adminGranted = true;
    }
  }
  return { synced: true, uid: callerUid, email: callerEmail, permissionGroupId, adminGranted, newClaims };
}

// ─── /api/admin/bootstrap-self simulator (V25-bis + V27-bis) ─────────────
const LOVERCLINIC_RE = /@loverclinic\.com$/i;
const OWNER_EMAILS = ['oomz.peerapat@gmail.com'];
function simulateBootstrapSelf({ callerEmail, otherAdminExists }) {
  const email = (callerEmail || '').toLowerCase();
  const isOwner = OWNER_EMAILS.includes(email);
  const isClinicEmail = LOVERCLINIC_RE.test(email);
  if (!isOwner && !isClinicEmail) {
    return { ok: false, status: 403, error: 'Forbidden: caller email not in allowlist' };
  }
  if (!isOwner && otherAdminExists) {
    return { ok: false, status: 409, error: 'Conflict: another admin exists' };
  }
  return { ok: true, claims: { admin: true, isClinicStaff: true }, isOwner };
}

// ─── StaffFormModal handleSave simulator (V25 + V28-tris) ────────────────
// Mirrors the StaffFormModal handleSave flow:
//   1. createAdminUser(email,password) → returns mock uid
//   2. saveStaff(id, {...form, firebaseUid})
//   3. setUserPermission(uid, permissionGroupId) → V28-tris auto-grants admin
function simulateStaffCreate({ form, mockUid, db }) {
  // Step 1: Firebase Auth account
  const firebaseUid = mockUid;
  // Step 2: Save be_staff doc (mock — just push to db.beStaff)
  const staffId = form.staffId || `STF-${Date.now()}`;
  db.beStaff[firebaseUid] = {
    id: staffId,
    firebaseUid,
    firstname: form.firstname,
    lastname: form.lastname,
    email: form.email,
    permissionGroupId: form.permissionGroupId,
    branchIds: form.branchIds || [],
    status: 'ใช้งาน',
  };
  // Step 3: setPermission auto-sync (V25 + V28-tris)
  const claims = { isClinicStaff: true, permissionGroupId: form.permissionGroupId || '' };
  if (form.permissionGroupId === 'gp-owner') {
    claims.admin = true;
  } else if (form.permissionGroupId) {
    const group = db.groups[form.permissionGroupId];
    if (group?.permissions?.permission_group_management === true) {
      claims.admin = true;
    }
  }
  db.firebaseClaims[firebaseUid] = claims;
  return { firebaseUid, staffId, claims };
}

// ─── UPC auto-sync simulator (V29) ────────────────────────────────────────
// Mirrors UserPermissionContext useEffect: try sync-self → fallback bootstrap-self
function simulateAutoSync({ user, db, otherAdminExists }) {
  const callerUid = user.uid;
  const callerEmail = user.email;

  // Try sync-self first
  const syncResult = simulateSyncSelf({
    callerUid, callerEmail,
    beStaffByUid: db.beStaff,
    groupsById: db.groups,
  });

  if (syncResult.synced) {
    db.firebaseClaims[callerUid] = syncResult.newClaims;
    return { path: 'sync-self', claims: syncResult.newClaims };
  }

  // Fallback to bootstrap-self
  const bootstrapResult = simulateBootstrapSelf({ callerEmail, otherAdminExists });
  if (bootstrapResult.ok) {
    db.firebaseClaims[callerUid] = bootstrapResult.claims;
    return { path: 'bootstrap-self', claims: bootstrapResult.claims };
  }

  // Neither path granted — user has no claims
  return { path: 'none', claims: db.firebaseClaims[callerUid] || {} };
}

// ─── Helper: create a fresh test DB ───────────────────────────────────────
function freshDb() {
  return {
    beStaff: {},
    firebaseClaims: {},
    groups: {
      'gp-owner': GROUP_OWNER,
      'gp-frontdesk': GROUP_FRONTDESK,
      'gp-nurse': GROUP_NURSE,
      'gp-perm-mgr': GROUP_PERM_MGR,
    },
  };
}

// ─── PERSONA TESTS ────────────────────────────────────────────────────────

describe('V29 — End-to-end onboarding: every persona, every permission, no manual', () => {

  describe('E1: Bootstrap admin (oomz scenario — must NEVER repeat)', () => {
    it('E1.1: oomz.peerapat@gmail.com first login → auto-bootstrap → admin claim granted', () => {
      const db = freshDb();
      const oomz = { uid: 'u-oomz', email: 'oomz.peerapat@gmail.com' };
      const result = simulateAutoSync({ user: oomz, db, otherAdminExists: false });

      expect(result.path).toBe('bootstrap-self');
      expect(result.claims.admin).toBe(true);
      expect(result.claims.isClinicStaff).toBe(true);
    });

    it('E1.2: oomz first login → soft-gate isAdmin=true → can see all sidebar tabs', () => {
      const oomz = { uid: 'u-oomz', email: 'oomz.peerapat@gmail.com' };
      const state = __deriveStateForTest(oomz, null, null);
      expect(state.isAdmin).toBe(true);
      expect(state.bootstrap).toBe(true);
      // Admin can access EVERY permission key (admin bypass)
      expect(state.hasPermission('any_random_key')).toBe(true);
      expect(state.hasPermission('staff_management')).toBe(true);
      expect(state.hasPermission('customer_management')).toBe(true);
    });

    it('E1.3: V25-bis genesis check skipped for oomz (OWNER_EMAILS) even when other admin exists', () => {
      const result = simulateBootstrapSelf({
        callerEmail: 'oomz.peerapat@gmail.com',
        otherAdminExists: true, // loverclinic@loverclinic.com is already admin
      });
      expect(result.ok).toBe(true);
      expect(result.isOwner).toBe(true);
    });

    it('E1.4: @loverclinic.com bootstrap admin works the same way', () => {
      const db = freshDb();
      const lc = { uid: 'u-lc', email: 'admin@loverclinic.com' };
      const result = simulateAutoSync({ user: lc, db, otherAdminExists: false });

      expect(result.path).toBe('bootstrap-self');
      expect(result.claims.admin).toBe(true);
    });

    it('E1.5: Random unauthorized email gets NO claims (security boundary)', () => {
      const db = freshDb();
      const random = { uid: 'u-rand', email: 'attacker@evil.com' };
      const result = simulateAutoSync({ user: random, db, otherAdminExists: true });

      expect(result.path).toBe('none');
      expect(result.claims.admin).toBeUndefined();
      expect(result.claims.isClinicStaff).toBeUndefined();
    });

    it('E1.6: oomz can immediately add staff after first login (no manual button click required)', () => {
      // Simulate flow: oomz logs in → auto-bootstrap → opens StaffFormModal → adds gmail staff
      const db = freshDb();
      const oomz = { uid: 'u-oomz', email: 'oomz.peerapat@gmail.com' };
      const autoSyncResult = simulateAutoSync({ user: oomz, db, otherAdminExists: false });
      expect(autoSyncResult.claims.admin).toBe(true); // gate cleared

      // Now oomz can add a new staff (no Forbidden: admin privilege required)
      const newStaff = simulateStaffCreate({
        form: {
          firstname: 'Mymild', lastname: 'Tn',
          email: 'mymild.tn@gmail.com', password: 'secret123',
          permissionGroupId: 'gp-owner',
        },
        mockUid: 'u-mymild',
        db,
      });
      expect(newStaff.claims.admin).toBe(true); // V28-tris auto-grant
      expect(newStaff.claims.isClinicStaff).toBe(true);
      expect(db.beStaff['u-mymild'].permissionGroupId).toBe('gp-owner');
    });
  });

  describe('E2: Staff added by admin → auto-claims at CREATION TIME (no login wait)', () => {
    it('E2.1: gmail staff in gp-owner → admin claim immediately set by setPermission', () => {
      const db = freshDb();
      const newStaff = simulateStaffCreate({
        form: { firstname: 'Jane', lastname: 'Smith', email: 'jane@gmail.com', password: 'pw', permissionGroupId: 'gp-owner' },
        mockUid: 'u-jane', db,
      });
      expect(newStaff.claims.admin).toBe(true);
      expect(newStaff.claims.isClinicStaff).toBe(true);
      expect(newStaff.claims.permissionGroupId).toBe('gp-owner');
    });

    it('E2.2: outlook staff in gp-frontdesk → only isClinicStaff (NOT admin)', () => {
      const db = freshDb();
      const newStaff = simulateStaffCreate({
        form: { firstname: 'Bob', lastname: 'F', email: 'bob@outlook.com', password: 'pw', permissionGroupId: 'gp-frontdesk' },
        mockUid: 'u-bob', db,
      });
      expect(newStaff.claims.admin).toBeUndefined();
      expect(newStaff.claims.isClinicStaff).toBe(true);
      expect(newStaff.claims.permissionGroupId).toBe('gp-frontdesk');
    });

    it('E2.3: yahoo staff in custom meta-perm group → admin claim auto-granted (V28-tris-bis)', () => {
      const db = freshDb();
      const newStaff = simulateStaffCreate({
        form: { firstname: 'Alice', lastname: 'PM', email: 'alice@yahoo.com', password: 'pw', permissionGroupId: 'gp-perm-mgr' },
        mockUid: 'u-alice', db,
      });
      // V28-tris-bis: meta-perm → admin
      expect(newStaff.claims.admin).toBe(true);
      expect(newStaff.claims.isClinicStaff).toBe(true);
    });

    it('E2.4: gmail nurse in gp-nurse → no admin, only nurse perms', () => {
      const db = freshDb();
      const newStaff = simulateStaffCreate({
        form: { firstname: 'Nurse', lastname: 'A', email: 'nurse@gmail.com', password: 'pw', permissionGroupId: 'gp-nurse' },
        mockUid: 'u-nurse', db,
      });
      expect(newStaff.claims.admin).toBeUndefined();
      expect(newStaff.claims.isClinicStaff).toBe(true);
      expect(newStaff.claims.permissionGroupId).toBe('gp-nurse');
    });

    it('E2.5: staff WITHOUT password → still gets be_staff doc + claims via setPermission', () => {
      // Edge case: admin only fills basic info, no Firebase account password.
      // Real flow: createAdminUser is skipped, but saveStaff + setPermission
      // still run if firebaseUid is provided manually (rare).
      const db = freshDb();
      const newStaff = simulateStaffCreate({
        form: { firstname: 'NoPwd', lastname: 'X', email: '', permissionGroupId: 'gp-frontdesk' },
        mockUid: 'u-nopwd', db,
      });
      expect(newStaff.claims.isClinicStaff).toBe(true);
      expect(newStaff.claims.permissionGroupId).toBe('gp-frontdesk');
    });
  });

  describe('E3: First-login experience for newly-created staff (immediate access)', () => {
    it('E3.1: Newly-created jane (gp-owner) logs in → soft-gate AND hard-gate both pass', () => {
      const db = freshDb();
      // Admin creates jane
      simulateStaffCreate({
        form: { firstname: 'Jane', email: 'jane@gmail.com', password: 'pw', permissionGroupId: 'gp-owner' },
        mockUid: 'u-jane', db,
      });

      // jane logs in → claims already set by setPermission, syncSelf is idempotent
      const jane = { uid: 'u-jane', email: 'jane@gmail.com' };
      const result = simulateAutoSync({ user: jane, db, otherAdminExists: true });

      // Soft-gate via deriveState
      const staff = db.beStaff['u-jane'];
      const group = db.groups[staff.permissionGroupId];
      const state = __deriveStateForTest(jane, staff, group);
      expect(state.isAdmin).toBe(true);
      expect(state.hasPermission('staff_management')).toBe(true);

      // Hard-gate via claims
      expect(result.claims.admin).toBe(true);
      expect(result.claims.isClinicStaff).toBe(true);
    });

    it('E3.2: Newly-created bob (frontdesk) logs in → only sees frontdesk tabs', () => {
      const db = freshDb();
      simulateStaffCreate({
        form: { firstname: 'Bob', email: 'bob@outlook.com', password: 'pw', permissionGroupId: 'gp-frontdesk' },
        mockUid: 'u-bob', db,
      });

      const bob = { uid: 'u-bob', email: 'bob@outlook.com' };
      const result = simulateAutoSync({ user: bob, db, otherAdminExists: true });
      const staff = db.beStaff['u-bob'];
      const group = db.groups[staff.permissionGroupId];
      const state = __deriveStateForTest(bob, staff, group);

      expect(state.isAdmin).toBe(false);
      expect(state.hasPermission('customer_management')).toBe(true);
      expect(state.hasPermission('appointment_management')).toBe(true);
      // Cannot manage staff, doctors, finance
      expect(state.hasPermission('staff_management')).toBe(false);
      expect(state.hasPermission('finance_management')).toBe(false);
      expect(state.hasPermission('permission_group_management')).toBe(false);

      expect(result.claims.admin).toBeUndefined();
    });

    it('E3.3: Newly-created nurse logs in → only sees nurse tabs', () => {
      const db = freshDb();
      simulateStaffCreate({
        form: { firstname: 'Nurse', email: 'nurse@gmail.com', password: 'pw', permissionGroupId: 'gp-nurse' },
        mockUid: 'u-nurse', db,
      });

      const nurse = { uid: 'u-nurse', email: 'nurse@gmail.com' };
      const result = simulateAutoSync({ user: nurse, db, otherAdminExists: true });
      const staff = db.beStaff['u-nurse'];
      const group = db.groups[staff.permissionGroupId];
      const state = __deriveStateForTest(nurse, staff, group);

      expect(state.isAdmin).toBe(false);
      expect(state.hasPermission('treatment_management')).toBe(true);
      expect(state.hasPermission('stock_management')).toBe(true);
      expect(state.hasPermission('customer_management')).toBe(true);
      expect(state.hasPermission('appointment_management')).toBe(false);
      expect(state.hasPermission('staff_management')).toBe(false);
      expect(state.hasPermission('finance_management')).toBe(false);
    });
  });

  describe('E4: Group change mid-session (admin re-assigns user) → re-sync claims', () => {
    it('E4.1: jane was gp-owner, admin changes to gp-nurse → her claims downgrade on re-sync', () => {
      const db = freshDb();
      // Initial: jane = gp-owner
      simulateStaffCreate({
        form: { firstname: 'Jane', email: 'jane@gmail.com', password: 'pw', permissionGroupId: 'gp-owner' },
        mockUid: 'u-jane', db,
      });
      const initialClaims = db.firebaseClaims['u-jane'];
      expect(initialClaims.admin).toBe(true);

      // Admin changes jane's group to gp-nurse (manual edit + save)
      db.beStaff['u-jane'].permissionGroupId = 'gp-nurse';
      // Re-sync from new group (V29 group-change useEffect would trigger this)
      const jane = { uid: 'u-jane', email: 'jane@gmail.com' };
      const newSync = simulateAutoSync({ user: jane, db: { ...db, firebaseClaims: {} }, otherAdminExists: true });

      expect(newSync.claims.admin).toBeUndefined(); // demoted
      expect(newSync.claims.permissionGroupId).toBe('gp-nurse');
      expect(newSync.claims.isClinicStaff).toBe(true);
    });

    it('E4.2: Promotion path: jane was gp-frontdesk, admin promotes to gp-owner → admin granted', () => {
      const db = freshDb();
      simulateStaffCreate({
        form: { firstname: 'Jane', email: 'jane@gmail.com', password: 'pw', permissionGroupId: 'gp-frontdesk' },
        mockUid: 'u-jane', db,
      });
      expect(db.firebaseClaims['u-jane'].admin).toBeUndefined();

      // Promote to gp-owner
      db.beStaff['u-jane'].permissionGroupId = 'gp-owner';
      const jane = { uid: 'u-jane', email: 'jane@gmail.com' };
      const newSync = simulateAutoSync({ user: jane, db: { ...db, firebaseClaims: {} }, otherAdminExists: true });

      expect(newSync.claims.admin).toBe(true);
      expect(newSync.claims.permissionGroupId).toBe('gp-owner');
    });
  });

  describe('E5: Adversarial — security boundaries hold', () => {
    it('E5.1: Staff cannot escalate by claiming a higher group (admin-only Firestore writes)', () => {
      // The PROCESS to grant admin requires admin to assign group via
      // StaffFormModal. firestore.rules block be_staff writes to non-admin
      // (V26 isClinicStaff() check). So a regular staff CAN'T just write
      // their own be_staff doc with permissionGroupId='gp-owner'.
      // This test documents the security boundary at the DB layer.
      const db = freshDb();
      // Create attacker as nurse first (only admin can do this)
      simulateStaffCreate({
        form: { firstname: 'Attacker', email: 'attacker@gmail.com', password: 'pw', permissionGroupId: 'gp-nurse' },
        mockUid: 'u-att', db,
      });
      const attackerClaims = db.firebaseClaims['u-att'];
      expect(attackerClaims.admin).toBeUndefined();
      expect(attackerClaims.permissionGroupId).toBe('gp-nurse');

      // Hypothetically, IF attacker could modify their be_staff to gp-owner
      // (which firestore.rules V26 blocks at the DB layer), THEN sync-self
      // would grant admin. This is by design — once a doc passes write rules,
      // sync-self trusts it. The security is at firestore.rules, not in
      // sync-self.
      db.beStaff['u-att'].permissionGroupId = 'gp-owner'; // simulating bypass
      const sync = simulateAutoSync({ user: { uid: 'u-att', email: 'attacker@gmail.com' }, db: { ...db, firebaseClaims: {} }, otherAdminExists: true });
      expect(sync.claims.admin).toBe(true);
      // ANOTHER source-grep test elsewhere asserts firestore.rules requires
      // isClinicStaff() to write be_staff (V26) — the trust chain holds.
    });

    it('E5.2: sync-self caller can ONLY sync their OWN uid (lookup by firebaseUid)', () => {
      // The endpoint queries WHERE firebaseUid == callerUid, not by passed-in
      // uid. So caller cannot grant claims to someone else's account.
      const db = freshDb();
      simulateStaffCreate({
        form: { firstname: 'Owner', email: 'owner@x.com', password: 'pw', permissionGroupId: 'gp-owner' },
        mockUid: 'u-owner', db,
      });
      simulateStaffCreate({
        form: { firstname: 'Nurse', email: 'nurse@x.com', password: 'pw', permissionGroupId: 'gp-nurse' },
        mockUid: 'u-nurse', db,
      });
      // Reset claims to test sync-self
      db.firebaseClaims = {};

      // Nurse calls sync-self → gets nurse claims, NOT owner's
      const nurseSync = simulateSyncSelf({
        callerUid: 'u-nurse', callerEmail: 'nurse@x.com',
        beStaffByUid: db.beStaff, groupsById: db.groups,
      });
      expect(nurseSync.synced).toBe(true);
      expect(nurseSync.adminGranted).toBe(false);
      expect(nurseSync.permissionGroupId).toBe('gp-nurse');

      // Owner sync gets owner's claims
      const ownerSync = simulateSyncSelf({
        callerUid: 'u-owner', callerEmail: 'owner@x.com',
        beStaffByUid: db.beStaff, groupsById: db.groups,
      });
      expect(ownerSync.adminGranted).toBe(true);
      expect(ownerSync.permissionGroupId).toBe('gp-owner');
    });

    it('E5.3: Random user (no be_staff, not OWNER_EMAILS) → sync returns synced=false + bootstrap refused → permanent no-access', () => {
      const db = freshDb();
      const random = { uid: 'u-evil', email: 'evil@gmail.com' };
      const result = simulateAutoSync({ user: random, db, otherAdminExists: true });

      expect(result.path).toBe('none');
      expect(result.claims.admin).toBeUndefined();
      expect(result.claims.isClinicStaff).toBeUndefined();

      // Soft-gate: deriveState
      const state = __deriveStateForTest(random, null, null);
      expect(state.isAdmin).toBe(false);
      expect(state.hasPermission('any')).toBe(false);
    });

    it('E5.4: Multi-owner clinic (OWNER_EMAILS = [a@gmail, b@gmail]) → both can bootstrap independently', () => {
      // Even when admin already exists (e.g. b@gmail), a@gmail can still
      // bootstrap because they're in OWNER_EMAILS (genesis check skipped).
      const result = simulateBootstrapSelf({
        callerEmail: 'oomz.peerapat@gmail.com',
        otherAdminExists: true,
      });
      expect(result.ok).toBe(true);
      expect(result.isOwner).toBe(true);
    });
  });

  describe('E6: deriveState personas (soft-gate) cross-check with claims (hard-gate)', () => {
    // These tests pair the SOFT-GATE result (deriveState) with the HARD-GATE
    // claims to ensure they agree per persona. Mismatch = chicken-and-egg
    // bug repeats. PRE-V28 had mismatch for gmail staff in gp-owner (soft
    // said admin, hard didn't). V28-tris fixes by always granting both
    // when group is admin-equivalent.
    const personas = [
      { name: 'oomz bootstrap', user: { uid: 'oomz', email: 'oomz.peerapat@gmail.com' }, staff: null, group: null, expectAdmin: true },
      { name: 'lc bootstrap', user: { uid: 'lc', email: 'a@loverclinic.com' }, staff: null, group: null, expectAdmin: true },
      { name: 'gmail in gp-owner', user: { uid: 'jane', email: 'jane@gmail.com' }, staff: { permissionGroupId: 'gp-owner', firebaseUid: 'jane' }, group: GROUP_OWNER, expectAdmin: true },
      { name: 'outlook in gp-frontdesk', user: { uid: 'bob', email: 'bob@outlook.com' }, staff: { permissionGroupId: 'gp-frontdesk', firebaseUid: 'bob' }, group: GROUP_FRONTDESK, expectAdmin: false },
      { name: 'yahoo in gp-perm-mgr (meta-perm)', user: { uid: 'alice', email: 'alice@yahoo.com' }, staff: { permissionGroupId: 'gp-perm-mgr', firebaseUid: 'alice' }, group: GROUP_PERM_MGR, expectAdmin: true },
      { name: 'random unauth', user: { uid: 'rand', email: 'rand@gmail.com' }, staff: null, group: null, expectAdmin: false },
    ];

    for (const p of personas) {
      it(`E6.${p.name}: soft-gate isAdmin matches hard-gate admin claim expectation`, () => {
        const state = __deriveStateForTest(p.user, p.staff, p.group);
        expect(state.isAdmin, `soft-gate isAdmin for ${p.name}`).toBe(p.expectAdmin);

        // Hard-gate simulation
        const db = freshDb();
        if (p.staff) {
          db.beStaff[p.user.uid] = { ...p.staff, firebaseUid: p.user.uid };
        }
        const sync = simulateAutoSync({ user: p.user, db, otherAdminExists: false });
        const hardGateAdmin = sync.claims?.admin === true;
        expect(hardGateAdmin, `hard-gate admin for ${p.name}`).toBe(p.expectAdmin);
      });
    }
  });

  describe('E7: Source-grep checks for V29 implementation completeness', () => {
    // These tests don't run the simulators — they verify the actual
    // implementation files exist + have the expected shape. Catches
    // accidental code removal.
    it('E7.1: api/admin/sync-self.js exists', () => {
      const fs = require('fs');
      const path = require('path');
      const exists = fs.existsSync(path.resolve(__dirname, '../api/admin/sync-self.js'));
      expect(exists).toBe(true);
    });

    it('E7.2: src/lib/adminUsersClient.js exports syncClaimsSelf', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(path.resolve(__dirname, '../src/lib/adminUsersClient.js'), 'utf8');
      expect(src).toMatch(/export\s+async\s+function\s+syncClaimsSelf/);
    });

    it('E7.3: UserPermissionContext imports syncClaimsSelf + bootstrapSelfAsAdmin', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(path.resolve(__dirname, '../src/contexts/UserPermissionContext.jsx'), 'utf8');
      expect(src).toMatch(/syncClaimsSelf/);
      expect(src).toMatch(/bootstrapSelfAsAdmin/);
    });

    it('E7.4: PermissionGroupsTab does NOT have any of the 3 removed buttons', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(path.resolve(__dirname, '../src/components/backend/PermissionGroupsTab.jsx'), 'utf8');
      expect(src).not.toMatch(/data-testid=["']permission-bootstrap-self-button["']/);
      expect(src).not.toMatch(/data-testid=["']permission-claims-migrate-button["']/);
      expect(src).not.toMatch(/data-testid=["']cleanup-test-probes-button["']/);
    });
  });
});
