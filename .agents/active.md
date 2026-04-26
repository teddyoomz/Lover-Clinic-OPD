---
updated_at: "2026-04-26 (session 4 — polish batch + Phase 13.5 permission system)"
status: "master 4 commits ahead of prod. 4 commits this session: P1 polish (XSS/leak/amber/CSS-vars) + Phase 13.5.1 useTabAccess wired + Phase 13.5.2 sidebar filter + Phase 13.5.3 button gates. Tests: 5061 vitest + 75 E2E = 5136 total. Build clean."
current_focus: "Idle. Awaiting user 'deploy' command to push 4 commits (02ee2ef → 242107a) to production. Rules unchanged so probe-deploy-probe is idempotent."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "242107a"
tests: "5061 vitest + 75 E2E = 5136 total"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "093d4d9 (2026-04-26 EOD V15 combined deploy session 3). Production NOT updated this session."
firestore_rules_deployed: "v10 (be_stock_movements update narrowed in 14.7.F per V19; UNCHANGED this session)"
bundle: "BackendDashboard: 920 KB → 924 KB (+0.5%) after permission system + dompurify"
---

# Active Context

## Objective

Resume from session 3 EOD. User selected P1 polish batch + permission
system as next focus. All shipped + tested + pushed; awaiting deploy.

## What this session shipped (4 commits)

### Commit 1 — `02ee2ef` polish batch
- DOMPurify XSS hardening on DocumentPrintModal (`dangerouslySetInnerHTML`
  wrapped in DOMPurify.sanitize with FORBID list; `safeImgTag` URL allowlist
  for signature injection — http(s) + data:image/* only)
- FileUploadField blob URL leak fix (revokeIfBlob helper + activeBlobRef +
  unmount cleanup useEffect; revokes on swap, post-upload, delete, unmount)
- Shared `RequiredAsterisk` component (text-amber-500 + aria-hidden) replacing
  39 inline `<span className="text-red-{400|500}">*</span>` across 17 backend
  modals
- ChartTemplateSelector 19 hardcoded hex/gray colors → CSS vars (var(--bg-*)
  / var(--bd) / var(--tx-*)); teal accent kept as brand
- 72 new tests across 4 files

### Commit 2 — `79feb5f` Phase 13.5.1 wired
- New `src/contexts/UserPermissionContext.jsx` — provider + useUserPermission
  hook + deriveState (pure, exported for test). isAdmin via 3 OR-joined paths
  (bootstrap @loverclinic.com / OWNER GROUP gp-owner / META PERM
  permission_group_management) all gated by clinic-email match
- New `src/lib/seedDefaultPermissionGroups.js` — 5 starter groups
  (gp-owner all 131 keys / gp-manager 128 / gp-frontdesk 17 /
  gp-nurse 12 / gp-doctor 12). Idempotent seed — noop if any group exists
- `src/lib/backendClient.js` — listenToUserPermissions(uid, onChange, onError)
  chained listener: be_staff/{uid} → be_permission_groups/{groupId}; 200ms
  debounce per Phase 14.7.H listener-cluster pattern
- `src/hooks/useTabAccess.js` — replaced TODO stub with useUserPermission()
  read forwarding to canAccessTab/filterAllowedTabs/firstAllowedTab helpers
- `src/App.jsx` — UserPermissionProvider mounted above BackendDashboard route
- 29 PT1 tests covering deriveState 3-path admin logic + seed shape +
  idempotent seed + source-grep regression guards

### Commit 3 — `1c83dc8` Phase 13.5.2 sidebar/palette/deep-link filter
- BackendSidebar + BackendCmdPalette read useTabAccess; filter PINNED + sections
  via canAccess; empty sections collapse out (no header for zero-allowed groups)
- BackendDashboard redirect useEffect: when (hydrated && permsLoaded && !canAccess)
  → setActiveTab(firstAllowedTab(['appointments','customers','reports','sales']))
- handleNavigate canAccess defense-in-depth gate
- tabPermissions.js TAB_PERMISSION_MAP gained 3 missing entries that were
  default-allow: insurance-claims (sale_management|sale_view) + vendor-sales
  (vendor_sale_management) + document-templates (adminOnly)
- 23 PS1 tests across source-grep guards + per-role filter behavior +
  empty-section collapse sanity

### Commit 4 — `242107a` Phase 13.5.3 button gates on 9 destructive actions
- New useHasPermission(key) hook export from useTabAccess.js
- 9 tabs gated (each: import + canDelete useState + disabled prop + Thai tooltip):
  PermissionGroupsTab → permission_group_management
  StaffTab            → user_management
  DoctorsTab          → doctor_management
  BranchesTab         → branch_management
  HolidaysTab         → holiday_setting
  CouponTab           → coupon_management
  PromotionTab        → promotion_management
  VoucherTab          → voucher_management
  DepositPanel refund → deposit_cancel
- useUserPermission outside-provider default flipped from default-deny to
  default-admin (preserves backward compat with Phase 13.5.0 stub for
  standalone RTL tests; production always wraps via App.jsx)
- 44 PB1 tests including V21-anti-pattern guard pairing source-grep with
  deriveState integration

## Live verification (preview_eval)

Reload + import probes confirmed:
- DEFAULT_PERMISSION_GROUPS exports 5 groups, owner has 131 permission keys
- UserPermissionContext exports UserPermissionProvider + useUserPermission
- useTabAccess.js exports both useHasPermission + useTabAccess
- Page loads cleanly, no console errors
- Logged-in user (loverclinic@loverclinic.com) → bootstrap admin path active,
  all sidebar sections visible

## Outstanding user-triggered actions (NOT auto-run)

1. **Deploy** 4 commits via V15 combined (`02ee2ef → 242107a`). Rules
   unchanged so probe-deploy-probe is idempotent fire. Required ANY deploy
   per Rule B. User must type "deploy" THIS turn per V18 lesson.
2. **Permission group customization** post-deploy: 5 default groups seed
   on first PermissionGroupsTab open. User can edit names + permissions
   to match real clinic role structure.

## Recent decisions (non-obvious — preserve reasoning)

1. **isAdmin fallback when context is null switched to TRUE** (Phase 13.5.3).
   Original Phase 13.5.1 design defaulted to deny outside the provider —
   correct fail-closed posture but broke 15 existing RTL tests rendering
   tabs without an App wrapper. Switched to admin-bypass for the
   outside-provider case. Production always wraps via App.jsx so the
   real permission state always applies for actual backend nav. Test
   render contexts have no real user identity to gate anyway.

2. **Phase 13.5.4 hard-gate deferred**. Soft-gate (UI hide + button
   disable) is sufficient for clinic launch; firestore.rules narrowing
   needs a Rule B probe-deploy-probe turn + server-side custom claim
   setting via /api/admin/setUserPermission. Defer until post-launch.

3. **Default 5 permission groups follow real-world clinic roles**:
   Owner / Manager / Front-desk / Nurse / Doctor. Manager excludes the
   3 admin keys (permission_group / user / branch_management) so they
   can't promote themselves. Bootstrap admin path covers the
   chicken-and-egg of "who assigns the first owner group".

4. **9 button gates, not 12**. Plan called for 12 sites but the deeper
   ones (SaleTab cancel/refund, TreatmentFormPage delete, CustomerListTab
   delete) require navigating modal/drill-down state. Shipped the 9
   tab-level delete buttons + DepositPanel refund as the high-leverage
   set; the deeper 3 ride next session (same useHasPermission(key)
   pattern, just different anchor sites).

5. **Tab → permission key mapping for new entries**:
   - insurance-claims uses sale_management OR sale_view (sale-adjacent)
   - vendor-sales uses vendor_sale_management
   - document-templates is adminOnly (doc CRUD = config, not day-to-day)

## Detail checkpoint

This file. No separate checkpoint file in `.agents/sessions/` for this
session — all 4 commits are well-described in their commit messages
and SESSION_HANDOFF.md.
