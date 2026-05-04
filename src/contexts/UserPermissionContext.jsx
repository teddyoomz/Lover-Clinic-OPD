// ─── UserPermissionContext — Phase 13.5.1 ─────────────────────────────────
// Provides `{ user, permissions, isAdmin, hasPermission, groupName }` to
// any descendant via the `useUserPermission()` hook.
//
// Wires up:
//   1. Firebase auth user (provided by App.jsx)
//   2. Listener on be_staff/{uid} → resolves `permissionGroupId`
//   3. Chained listener on be_permission_groups/{groupId} → resolves `permissions`
//
// isAdmin derivation (3 paths, OR-joined):
//   1. BOOTSTRAP: @loverclinic.com email + no be_staff doc → admin
//      (lets the first staff member set things up before assignment exists)
//   2. OWNER GROUP: staff.permissionGroupId === 'gp-owner' → admin
//   3. META PERMISSION: group.permissions.permission_group_management === true
//      (any role explicitly granted permission to manage groups)
//
// All three paths additionally require an @loverclinic.com email — matches
// Firestore rules' isClinicStaff() guard so we don't claim admin for users
// the rules would reject anyway.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { listenToUserPermissions } from '../lib/scopedDataLayer.js';
import { isOwnerEmail } from '../lib/ownerEmails.js';
import { bootstrapSelfAsAdmin, syncClaimsSelf } from '../lib/adminUsersClient.js';

const UserPermissionContext = createContext(null);

const LOVERCLINIC_EMAIL_RE = /@loverclinic\.com$/i;

function deriveState(user, staff, group) {
  const email = user?.email || '';
  const isClinicEmail = LOVERCLINIC_EMAIL_RE.test(email);
  // V27-bis: pre-approved owner emails (e.g. Google Sign-In with personal
  // email) bypass the @loverclinic.com regex requirement. See
  // src/lib/ownerEmails.js for the canonical list.
  const isOwnerAccount = isOwnerEmail(email);
  const isAuthorizedAccount = isClinicEmail || isOwnerAccount;
  const groupId = staff?.permissionGroupId || null;
  const permissions = (group && typeof group.permissions === 'object') ? group.permissions : {};

  // V28 (2026-04-26) — bootstrap path is the ONLY one that requires
  // isAuthorizedAccount (clinic email OR owner email + no staff doc).
  // Staff explicitly added by an admin to gp-owner group OR with the
  // permission_group_management meta-perm are admin REGARDLESS of email
  // domain. Previously the isAuthorizedAccount prefix incorrectly blocked
  // legit Gmail-using staff that admin had explicitly granted owner
  // access. Per user directive: "ถ้ามีการเพิ่มสิทธิ์ เพิ่มพนักงาน เพิ่ม
  // เมลที่เป็น admin หรือ user ในอนาคต จะต้องใช้ได้เลย ไม่เป็นแบบนี้อีก".
  const bootstrap = isAuthorizedAccount && !staff;
  const isOwnerGroup = groupId === 'gp-owner';
  const hasMetaPerm = permissions.permission_group_management === true;
  const isAdmin = bootstrap || isOwnerGroup || hasMetaPerm;

  return {
    user: user || null,
    staff: staff || null,
    group: group || null,
    permissions,
    isAdmin,
    groupName: group?.name || (bootstrap ? 'เจ้าของกิจการ (bootstrap)' : ''),
    bootstrap,
    isOwnerAccount,  // exposed for UI badges / future use
    hasPermission: (key) => isAdmin || permissions[key] === true,
  };
}

export function UserPermissionProvider({ user, children }) {
  const [staff, setStaff] = useState(null);
  const [group, setGroup] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setStaff(null);
      setGroup(null);
      setLoaded(true);
      return undefined;
    }
    setLoaded(false);
    const unsub = listenToUserPermissions(user.uid, ({ staff: s, group: g }) => {
      setStaff(s);
      setGroup(g);
      setLoaded(true);
    });
    return () => unsub();
  }, [user?.uid]);

  // ─── V29 (2026-04-26) — Auto-sync claims on every login (self-service) ──
  // User directive: "ไม่ต้องการระบบ manual เหล่านี้ ... ทำให้ Perfect 100%
  // กับทุก id ทุกสิทธิ์ที่ id นั้นได้รับด้วย".
  //
  // Replaces V28-bis (auto-bootstrap only for OWNER_EMAILS) with universal
  // self-sync that handles ALL user types automatically:
  //
  //   1. Try /api/admin/sync-self — works for any signed-in user with
  //      a be_staff doc. Sets isClinicStaff + permissionGroupId claims.
  //      Auto-grants admin if group is gp-owner OR has meta-perm.
  //
  //   2. If sync-self returns synced=false (no be_staff doc), fall back
  //      to /api/admin/bootstrap-self — handles owner accounts
  //      (@loverclinic.com OR OWNER_EMAILS) that operate without staff
  //      records.
  //
  //   3. Force ID token refresh after either path so claims propagate
  //      to current session immediately.
  //
  // Per-session ref guard prevents re-calling on every render. Reset on
  // user change (logout/login). Idempotent — endpoints handle "already
  // in sync" gracefully.
  const bootstrapAttemptedRef = useRef(false);
  useEffect(() => {
    if (!user?.uid) {
      bootstrapAttemptedRef.current = false;
      return;
    }
    if (bootstrapAttemptedRef.current) return;
    bootstrapAttemptedRef.current = true;

    (async () => {
      try {
        // Try staff-based sync first (covers 99% of users)
        let staffSynced = false;
        try {
          const result = await syncClaimsSelf();
          if (result?.synced) {
            staffSynced = true;
          }
        } catch (err) {
          // Network error or 401 — log + continue to fallback
          // eslint-disable-next-line no-console
          console.warn('[auto-sync] sync-self failed:', err?.message || err);
        }

        // Fallback: owner-account bootstrap (no be_staff doc)
        if (!staffSynced) {
          const email = (user.email || '').toLowerCase();
          const isAuthorized = LOVERCLINIC_EMAIL_RE.test(email) || isOwnerEmail(email);
          if (isAuthorized) {
            try {
              await bootstrapSelfAsAdmin();
            } catch (err) {
              // 409 conflict expected if not owner + admin exists; non-fatal
              // eslint-disable-next-line no-console
              console.warn('[auto-sync] bootstrap-self skip:', err?.message || err);
            }
          }
        }

        // Force token refresh so new claims propagate to current session
        try {
          await user.getIdToken(true);
        } catch { /* non-fatal — next page load picks them up */ }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[auto-sync] failed:', err?.message || err);
      }
    })();
  }, [user?.uid, user?.email]);

  // ─── V29 (2026-04-26) — Re-sync claims when admin changes group ────────
  // If an admin changes this user's permissionGroupId while they're logged
  // in, the user's existing token claims are stale until next refresh
  // (1 hour TTL). The be_staff onSnapshot listener (above) already pushes
  // the new permissions to the soft-gate immediately — but the hard-gate
  // (firestore.rules + /api/admin/* gates) still uses the stale claim.
  //
  // This effect detects when staff.permissionGroupId differs from the
  // current claim's permissionGroupId → triggers a re-sync.
  const lastSyncedGroupRef = useRef(null);
  useEffect(() => {
    if (!user?.uid || !loaded) return;
    const currentGroup = staff?.permissionGroupId || '';
    // Only resync if group actually changed (not on initial load)
    if (lastSyncedGroupRef.current === null) {
      lastSyncedGroupRef.current = currentGroup;
      return;
    }
    if (lastSyncedGroupRef.current === currentGroup) return;
    lastSyncedGroupRef.current = currentGroup;

    (async () => {
      try {
        await syncClaimsSelf();
        await user.getIdToken(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[group-change-resync] failed:', err?.message || err);
      }
    })();
  }, [user?.uid, loaded, staff?.permissionGroupId]);

  const state = useMemo(() => ({
    ...deriveState(user, staff, group),
    loaded,
  }), [user, staff, group, loaded]);

  return (
    <UserPermissionContext.Provider value={state}>
      {children}
    </UserPermissionContext.Provider>
  );
}

/**
 * Read the current user's permission state. Returns an admin-bypass shape
 * when called OUTSIDE the provider — preserves backward compat with the
 * Phase 13.5.0 stub useTabAccess (which returned isAdmin=true) so:
 *   - Standalone RTL tests rendering tabs without an App wrapper see
 *     full access (matches the contract before 13.5.1).
 *   - Tools that don't yet wrap UserPermissionProvider keep working.
 *
 * In PRODUCTION, App.jsx mounts <UserPermissionProvider> above
 * BackendDashboard, so the real permission state is always used for
 * actual backend nav. The fallback only fires in test/storybook contexts.
 */
export function useUserPermission() {
  const ctx = useContext(UserPermissionContext);
  if (!ctx) {
    return {
      user: null,
      staff: null,
      group: null,
      permissions: {},
      isAdmin: true,
      groupName: '',
      bootstrap: true,
      loaded: true,
      hasPermission: () => true,
    };
  }
  return ctx;
}

// Pure helper exported for tests — derives the state shape from raw inputs
// so unit tests can verify isAdmin / hasPermission logic without mounting
// the provider or stubbing Firebase.
export { deriveState as __deriveStateForTest };
