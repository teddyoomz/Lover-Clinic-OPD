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

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { listenToUserPermissions } from '../lib/backendClient.js';

const UserPermissionContext = createContext(null);

const LOVERCLINIC_EMAIL_RE = /@loverclinic\.com$/i;

function deriveState(user, staff, group) {
  const email = user?.email || '';
  const isClinicEmail = LOVERCLINIC_EMAIL_RE.test(email);
  const groupId = staff?.permissionGroupId || null;
  const permissions = (group && typeof group.permissions === 'object') ? group.permissions : {};

  const bootstrap = isClinicEmail && !staff;
  const isOwner = groupId === 'gp-owner';
  const hasMetaPerm = permissions.permission_group_management === true;
  const isAdmin = isClinicEmail && (bootstrap || isOwner || hasMetaPerm);

  return {
    user: user || null,
    staff: staff || null,
    group: group || null,
    permissions,
    isAdmin,
    groupName: group?.name || (bootstrap ? 'เจ้าของกิจการ (bootstrap)' : ''),
    bootstrap,
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
