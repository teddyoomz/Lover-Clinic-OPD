// ─── useTabAccess — Phase 13.5.1 wired ─────────────────────────────────────
// Returns the current user's tab-access context. Reads from
// UserPermissionContext (provider mounted in App.jsx above BackendDashboard
// route) and forwards to the pure tabPermissions helpers.
//
// Outside the provider (or when context is loading) → all-deny defaults.
// Bootstrap admins (@loverclinic.com user with no be_staff doc) get full
// access so the first staff member can wire up their own permission group.
//
// Phase 16.3 (2026-04-29) — wires tabOverrides from system_config so the
// admin-saved per-tab visibility rules actually take effect at the
// consumer hook level. Pre-fix: the hook called canAccessTab without the
// 4th `overrides` arg → the Phase 16.3 override save landed in Firestore
// but had ZERO runtime effect. V12 multi-reader-sweep regression at the
// consumer-hook level — when introducing a new param to a pure helper,
// audit ALL callsites.

import { useMemo } from 'react';
import { canAccessTab, filterAllowedTabs, firstAllowedTab } from '../lib/tabPermissions.js';
import { useUserPermission } from '../contexts/UserPermissionContext.jsx';
import { useSystemConfig } from './useSystemConfig.js';

export function useTabAccess() {
  const { isAdmin, permissions, loaded, hasPermission, groupName, bootstrap } = useUserPermission();
  // Phase 16.3 — overrides cached in shared listener at module scope; safe
  // to call from any backend hook. Defaults to {} when listener not yet
  // resolved or when read-rule denies (graceful degradation — overrides
  // simply don't apply, static gate behaviour preserved).
  const { config } = useSystemConfig();
  const overrides = config?.tabOverrides || {};

  return useMemo(() => ({
    isAdmin,
    permissions,
    loaded,
    groupName,
    bootstrap,
    hasPermission,
    overrides,
    canAccess: (tabId) => canAccessTab(tabId, permissions, isAdmin, overrides),
    filter: (tabIds) => filterAllowedTabs(tabIds, permissions, isAdmin, overrides),
    first: (candidates) => firstAllowedTab(permissions, isAdmin, candidates, overrides),
  }), [isAdmin, permissions, loaded, groupName, bootstrap, hasPermission, overrides]);
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
