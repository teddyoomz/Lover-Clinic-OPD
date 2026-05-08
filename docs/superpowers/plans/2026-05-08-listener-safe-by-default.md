# Plan: V54 Listener Safe-by-Default (BS-13)

> Spec: `docs/superpowers/specs/2026-05-08-listener-safe-by-default-design.md`
> Status: **EXECUTED** (autonomous V52/V53-style, user said "ทำเลย")
> Implementation date: 2026-05-08 EOD #8

## Phase 1 — backendClient.js safe-by-default (COMPLETE)

4 functions updated to mirror `listenToScheduleByDay` (line 10572+) safe template:
- `getAppointmentsByMonth` (line 2188+)
- `getAppointmentsByDate` (line 2248+)
- `listenToAppointmentsByDate` (line 2278+)
- `listenToAppointmentsByMonth` (line 2342+)

Canonical pattern injected:
```js
const effectiveBranchId = (typeof branchId === 'string' && branchId)
  ? branchId
  : (allBranches ? null : resolveSelectedBranchId());
if (!effectiveBranchId && !allBranches) return ...; // empty: {} or [] or onChange([])+noop
const useFilter = !allBranches && effectiveBranchId;
```

`resolveSelectedBranchId` already imported (line 9). No new imports needed.

## Phase 2 — AdminDashboard.jsx caller fix (COMPLETE)

Line 716: `{}` → `{ branchId: selectedBranchId }`. Defense-in-depth + V52/BS-11 canonical pattern. Comment updated to reflect V54 contract (was a V21 lie).

## Phase 3 — BS-13 audit invariant (COMPLETE)

- `audit-branch-scope/SKILL.md`: 12 → 13 invariants
- `tests/audit-branch-scope.test.js`: +7 BS-13.x sub-tests (4 fns × resolveSelectedBranchId + V54 marker check + safe-template anchor + 2 caller regression guards)

## Phase 4 — Test bank (COMPLETE)

- `tests/v54-listener-safe-by-default.test.js` — 24 unit tests across L1-L5:
  - L1: getAppointmentsByMonth (5 scenarios)
  - L2: getAppointmentsByDate (5 scenarios)
  - L3: listenToAppointmentsByDate (6 scenarios — explicit / allBranches / `{}`+resolved / `{}`+null / legacy positional / invalid date)
  - L4: listenToAppointmentsByMonth (6 scenarios — same matrix; L4.4 explicitly named "CLOSES PRE-V54 ADMIN LEAK")
  - L5: V54 source-grep markers (2 — backendClient + AdminDashboard)

## Phase 5 — V21-class regression test fix-ups (COMPLETE)

4 pre-existing tests asserted the broken `{}` opts pattern (V21 source-grep tests that locked broken behavior). Updated to lock V54 correct contract:

- `tests/phase-20-0-task-6-branch-selector-frontend.test.jsx` Z3.1 — assertion: `{}` → `{ branchId: selectedBranchId }`
- `tests/phase-20-0-flow-a-queue-read-source.test.jsx` A6.1 — same
- `tests/phase-22-0c-schedule-link-branch-separation.test.js` S5.1 — increased char window (1500) because V54 marker comments grew the block
- `tests/branch-selector-bs-f-reader-refactor.test.js` BS-F.2 — `branchId && !allBranches` → `!allBranches && effectiveBranchId` (V54 chain pattern)

Each fixup carries V54 marker comment explaining the pre-V54 V21 drift + post-V54 contract.

## Phase 6 — Verification (COMPLETE)

- Targeted: 134 V54-related tests green (24 unit + 7 BS-13 + 4 fixed + 99 sibling tests in same files)
- Full vitest: 7662/7662 + 1 skipped GREEN (+31 net from V54)
- Build: clean (no MISSING_EXPORT, no syntax errors)

## Phase 7 — Commit + push (NEXT)

Files staged explicitly per Rule V37:
- `src/lib/backendClient.js`
- `src/pages/AdminDashboard.jsx`
- `.agents/skills/audit-branch-scope/SKILL.md`
- `tests/audit-branch-scope.test.js`
- `tests/v54-listener-safe-by-default.test.js`
- `tests/phase-20-0-task-6-branch-selector-frontend.test.jsx`
- `tests/phase-20-0-flow-a-queue-read-source.test.jsx`
- `tests/phase-22-0c-schedule-link-branch-separation.test.js`
- `tests/branch-selector-bs-f-reader-refactor.test.js`
- `docs/superpowers/specs/2026-05-08-listener-safe-by-default-design.md`
- `docs/superpowers/plans/2026-05-08-listener-safe-by-default.md`
- `SESSION_HANDOFF.md`
- `.agents/active.md`
- `.claude/rules/00-session-start.md`
- `.claude/rules/v-log-archive.md`

Commit message includes V54 V-entry references. NO DEPLOY.
