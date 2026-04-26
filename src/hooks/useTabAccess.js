// ─── useTabAccess — Phase 13.5.1 wired ─────────────────────────────────────
// Returns the current user's tab-access context. Reads from
// UserPermissionContext (provider mounted in App.jsx above BackendDashboard
// route) and forwards to the pure tabPermissions helpers.
//
// Outside the provider (or when context is loading) → all-deny defaults.
// Bootstrap admins (@loverclinic.com user with no be_staff doc) get full
// access so the first staff member can wire up their own permission group.

import { useMemo } from 'react';
import { canAccessTab, filterAllowedTabs, firstAllowedTab } from '../lib/tabPermissions.js';
import { useUserPermission } from '../contexts/UserPermissionContext.jsx';

export function useTabAccess() {
  const { isAdmin, permissions, loaded, hasPermission, groupName, bootstrap } = useUserPermission();

  return useMemo(() => ({
    isAdmin,
    permissions,
    loaded,
    groupName,
    bootstrap,
    hasPermission,
    canAccess: (tabId) => canAccessTab(tabId, permissions, isAdmin),
    filter: (tabIds) => filterAllowedTabs(tabIds, permissions, isAdmin),
    first: (candidates) => firstAllowedTab(permissions, isAdmin, candidates),
  }), [isAdmin, permissions, loaded, groupName, bootstrap, hasPermission]);
}

/**
 * Phase 13.5.3 — single-key permission check. Returns true when user is
 * admin OR group.permissions[key] === true. Stable identity (referenced
 * via context-derived hasPermission). Use for inline button gates:
 *
 *   const canCancel = useHasPermission('sale_cancel');
 *   <button disabled={!canCancel} title={canCancel ? '' : 'ไม่มีสิทธิ์'}>...</button>
 */
export function useHasPermission(key) {
  const { hasPermission } = useUserPermission();
  return hasPermission(key);
}
