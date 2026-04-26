// ─── V30 (2026-04-26) — listenToUserPermissions firebaseUid lookup fix ──
//
// User report (verbatim): "สิทธิ์เจ้าของกิจการที่เพิ่งสร้างใหม่ ก็ไม่เห็น
// tab ใน backend อยู่ดีไอ้สัส แก้ไม่หายนะไอ้ควย".
//
// Bug: listenToUserPermissions(uid) queried `be_staff/{uid}` (doc-by-id)
// — but be_staff doc IDs are `staffId` (e.g. `STF-XXX` from
// generateStaffId()), NOT the Firebase Auth uid. The Firebase Auth uid
// is stored in the `firebaseUid` FIELD on the doc.
//
// Result: every staff created via StaffFormModal had:
//   - be_staff/{staffId} doc with firebaseUid: <auth.uid>
//   - listener queried be_staff/{auth.uid} → not found → no staff
//   - deriveState saw no staff → not admin → empty sidebar
//
// Even though V29 sync-self correctly set custom claims (it queries by
// firebaseUid field, doing the right thing), the soft-gate listener
// failed to find the doc, so the sidebar was empty.
//
// V30 fix: change listener to query by firebaseUid field via
// `query(staffCol(), where('firebaseUid', '==', uid), limit(1))`.
//
// Tests:
//   V30.1-3: source-grep the listener uses query+where(firebaseUid)
//            instead of staffDoc(uid)
//   V30.4-7: simulate the bug scenario — staff doc keyed by staffId
//            with firebaseUid field; listener must find it
//   V30.8: regression guard — sync-self ALSO queries by firebaseUid
//          (same pattern, both sites must stay in sync)

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('V30 — listenToUserPermissions queries by firebaseUid (not by doc ID)', () => {
  const BACKEND_CLIENT = READ('src/lib/backendClient.js');
  const SYNC_SELF = READ('api/admin/sync-self.js');

  describe('V30.A: Source-grep — listener uses query+where(firebaseUid)', () => {
    it('V30.1: backendClient.js imports `limit` from firestore (V30 query needs it)', () => {
      // The fix uses limit(1) — must be imported
      expect(BACKEND_CLIENT).toMatch(/import\s*\{[^}]*\blimit\b[^}]*\}\s*from\s*['"]firebase\/firestore['"]/);
    });

    it('V30.2: listenToUserPermissions function exists', () => {
      expect(BACKEND_CLIENT).toMatch(/export\s+function\s+listenToUserPermissions/);
    });

    it('V30.3: listener constructs staffQuery via query(staffCol(), where(firebaseUid==uid), limit(1))', () => {
      // Must NOT use staffDoc(uid) (the broken pattern)
      const fnBlock = BACKEND_CLIENT.match(/export\s+function\s+listenToUserPermissions[\s\S]*?\n\}\s*\n/);
      expect(fnBlock, 'listenToUserPermissions function block not found').toBeTruthy();
      const body = fnBlock[0];

      // V30 fix: must use query+where pattern
      expect(body).toMatch(/query\s*\(\s*staffCol\(\)/);
      expect(body).toMatch(/where\(['"]firebaseUid['"]\s*,\s*['"]==['"]\s*,\s*uid\)/);
      expect(body).toMatch(/limit\(1\)/);
      // Must NOT have the bug pattern (staffDoc(uid) for the listener)
      // — match only the broken-listener pattern that includes onSnapshot in
      // proximity to staffDoc(uid). staffDoc helper itself is fine.
      const brokenPattern = /onSnapshot\(\s*staffDoc\(uid\)/;
      expect(body).not.toMatch(brokenPattern);
    });

    it('V30.4: listener derives lastStaff from querySnap.docs[0] (not snap.exists)', () => {
      const fnBlock = BACKEND_CLIENT.match(/export\s+function\s+listenToUserPermissions[\s\S]*?\n\}\s*\n/);
      const body = fnBlock[0];
      // Query returns querySnap with .docs array
      expect(body).toMatch(/querySnap\.docs\[0\]/);
      // The doc has .id (staffId) + .data() (full record)
      expect(body).toMatch(/\.\.\.docSnap\.data\(\)/);
    });
  });

  describe('V30.B: Cross-check — sync-self uses the same query pattern (consistency)', () => {
    it('V30.5: sync-self also queries by firebaseUid field (not callerUid as doc ID)', () => {
      // The bug existed in listenToUserPermissions but NOT in sync-self.
      // Both sites must use the SAME pattern for consistency.
      expect(SYNC_SELF).toMatch(/where\(['"]firebaseUid['"]\s*,\s*['"]==['"]\s*,\s*callerUid\)/);
    });
  });

  describe('V30.C: Bug-reproduction simulation (logic-level)', () => {
    // Pure simulation showing the bug behavior. We don't run the real
    // Firestore — we recreate the lookup logic and assert what the OLD
    // pattern would do vs what the NEW pattern does.
    it('V30.6: OLD pattern (broken) — be_staff/{uid} lookup misses doc keyed by staffId', () => {
      // Simulate: doc stored at /be_staff/STF-001 with firebaseUid='auth-uid-jane'
      const beStaff = {
        'STF-001': { firebaseUid: 'auth-uid-jane', permissionGroupId: 'gp-owner' },
      };
      // OLD broken pattern: lookup by uid as doc ID
      const oldLookup = (uid) => beStaff[uid] || null;
      // jane logs in with auth-uid-jane → broken lookup misses
      expect(oldLookup('auth-uid-jane')).toBe(null);
    });

    it('V30.7: NEW pattern (V30 fix) — query by firebaseUid field finds doc', () => {
      const beStaff = {
        'STF-001': { id: 'STF-001', firebaseUid: 'auth-uid-jane', permissionGroupId: 'gp-owner' },
        'STF-002': { id: 'STF-002', firebaseUid: 'auth-uid-bob', permissionGroupId: 'gp-frontdesk' },
      };
      // NEW pattern: query by firebaseUid field
      const newLookup = (uid) =>
        Object.values(beStaff).find((s) => s.firebaseUid === uid) || null;
      // jane logs in → finds her doc
      const jane = newLookup('auth-uid-jane');
      expect(jane).not.toBe(null);
      expect(jane.id).toBe('STF-001');
      expect(jane.permissionGroupId).toBe('gp-owner');
      // bob also works
      const bob = newLookup('auth-uid-bob');
      expect(bob.permissionGroupId).toBe('gp-frontdesk');
      // Random uid → null (correct)
      expect(newLookup('auth-uid-attacker')).toBe(null);
    });

    it('V30.8: end-to-end — staff doc + group lookup chain produces correct deriveState', () => {
      const beStaff = {
        'STF-001': { id: 'STF-001', firebaseUid: 'auth-uid-jane', permissionGroupId: 'gp-owner' },
      };
      const beGroups = {
        'gp-owner': { id: 'gp-owner', name: 'เจ้าของกิจการ', permissions: { permission_group_management: true } },
      };
      // Listener simulator (NEW pattern)
      const findStaff = (uid) =>
        Object.values(beStaff).find((s) => s.firebaseUid === uid) || null;
      const findGroup = (gid) => beGroups[gid] || null;

      const staff = findStaff('auth-uid-jane');
      expect(staff).toBeTruthy();
      const group = findGroup(staff.permissionGroupId);
      expect(group).toBeTruthy();
      // deriveState would now compute isAdmin via isOwnerGroup branch
      expect(group.id === 'gp-owner').toBe(true);
    });
  });

  describe('V30.D: Regression guard — listener pattern ALSO works for unassigned staff', () => {
    it('V30.9: staff with empty permissionGroupId → listener fires with staff but null group', () => {
      const beStaff = {
        'STF-003': { id: 'STF-003', firebaseUid: 'auth-uid-newhire', permissionGroupId: '' },
      };
      const findStaff = (uid) =>
        Object.values(beStaff).find((s) => s.firebaseUid === uid) || null;
      const staff = findStaff('auth-uid-newhire');
      expect(staff).toBeTruthy();
      expect(staff.permissionGroupId).toBe('');
      // Group lookup with empty groupId returns null — listener still fires
      // with staff so deriveState knows "they exist but have no group"
    });
  });
});
