// ─── useTabAccess — Phase 13.5 scaffolding hook ───────────────────────────
// Returns the current user's tab-access context. TODO: when Firebase custom
// claims integration lands (follow-on Phase), swap the stub for a real read
// of claims + user's be_permission_groups doc.
//
// Current behaviour: treat every authenticated user as admin. This preserves
// existing UX while letting components adopt the `canAccess` API so we can
// flip the switch in one place later.

import { useMemo } from 'react';
import { canAccessTab, filterAllowedTabs, firstAllowedTab } from '../lib/tabPermissions.js';

export function useTabAccess() {
  return useMemo(() => ({
    isAdmin: true, // TODO: replace with Firebase custom claim `admin` lookup
    permissions: {}, // TODO: populate from user's be_permission_groups/{user.permissionGroupId}
    canAccess: (tabId) => canAccessTab(tabId, {}, true),
    filter: (tabIds) => filterAllowedTabs(tabIds, {}, true),
    first: (candidates) => firstAllowedTab({}, true, candidates),
  }), []);
}
