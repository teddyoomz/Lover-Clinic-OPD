# Session Checkpoint — V52 + V53 + V54 Branch-Scope Trilogy

> 2026-05-08 EOD #6→#8 (continuous autonomous overnight)
> 3 V-entries · 3 new BS invariants (11/12/13) · 7333 → 7662 tests (+329 net) · 0 deploys

## Summary

User authorized 3 autonomous bug-fix cycles in sequence ("ไม่ต้องถาม → ทำเลย"). Each round closed a different layer of the same V12 multi-reader-sweep family at the branch-scope axis: V52 = report-tab loaders, V53 = canonical TIME_SLOTS time-axis, V54 = raw listener safe-by-default (architectural backstop). Three new audit invariants (BS-11, BS-12, BS-13) lock each layer permanently. NO deploys this session — user authorizes `vercel --prod` separately.

## Current State (post-V54)

- master = `eee8003` (+3 commits ahead of prod `ef580a6`)
- 7662/7662 + 1 skipped GREEN · build clean
- Iron-clad invariants: AV1-AV29 + BS-1..BS-13 + CB-1..5
- Rule H-bis EXECUTED + COMPLETE (V50 family done)
- ProClinic stripped; per-branch settings (V51) live; report tabs + time-axis + listeners all branch-scoped

## Commits

```
eee8003  fix(V54/BS-13): raw appointment listeners safe-by-default — AdminDashboard branch leak
dd7f473  feat(V53/BS-12): per-branch open hours drive time-axis everywhere
4df1347  feat(V52/BS-11): every report tab respects top-right BranchSelector
```

## Files Touched (per V-entry)

**V52** (`4df1347`): src/lib/reportsLoaders.js + 16 report tabs (13 fixed + 2 EXEMPTED + 1 nav) + audit-branch-scope SKILL/test + 3 new test files

**V53** (`dd7f473`): src/lib/scheduleFilterUtils.js (+3 helpers) + 4 victim surfaces (AppointmentCalendarView + AppointmentFormModal + ScheduleEntryFormModal + DepositPanel) + audit-branch-scope SKILL/test + 3 new test files

**V54** (`eee8003`): src/lib/backendClient.js (4 fns) + src/pages/AdminDashboard.jsx (caller) + audit-branch-scope SKILL/test + 1 new test file + 4 V21-class test fixups (Z3.1/A6.1/S5.1/BS-F.2)

## Decisions (1-line each — full reasoning in v-log-archive.md)

- **V52**: 9 stale `// audit-branch-scope: report — uses {allBranches:true}` annotations were lies; stripped + replaced with V52 marker. EXEMPTED list closed (3 files: Expense + Clinic + ReportsHome).
- **V53 Q1=A**: Legacy appts outside new open hours auto-expand visible range + orange chip (preserve data visibility; don't hide).
- **V53 Bangkok TZ**: Midday-UTC parse pattern (`Date.UTC(y, mo, d, 12, 0, 0)`) avoids `T00:00:00+07:00` previous-day-UTC edge case. Codified in helper + unit tests.
- **V54 architectural backstop**: 4 raw appointment fns in backendClient.js mirror `listenToScheduleByDay` safe template (resolveSelectedBranchId fallback + empty-on-no-branch). Closes 3-layer V21 drift permanently regardless of caller mistakes.
- **V54 audit anchor**: BS-13 anchors on `resolveSelectedBranchId` REFERENCE (not comment text) to prevent future comment-vs-code drift recurrence.
- **V54 test fixups**: 4 pre-existing tests asserted broken `{}` opts pattern; updated each with V54 marker explaining drift + new contract.

## Methodology lessons

- **systematic-debugging Phase 1-2 catches what static audit misses** — V52/V53 audits accepted comment text at face value; V54 caught the 3-layer V21 drift only via root-cause investigation. Mitigation: BS-13 audit anchored on STRUCTURAL reference (not comment text).
- **3-layer V21 drift requires backstop at the data layer** — caller comment + wrapper + safe-by-default-FAILED stack up. Architectural backstop closes regardless of caller mistakes.
- **Test fixups are first-class artifacts** — pre-existing source-grep tests can lock broken behavior (V21 lock-in). Updating with marker comments explaining drift = institutional memory.
- **Defense-in-depth pattern** — backstop at data layer + explicit pattern at caller (V52/BS-11 canonical) = belt-and-suspenders.

## Next Todo

- User: deploy combined V52+V53+V54 when ready (`vercel --prod` requires explicit "deploy" THIS turn per V18)
- User: visual verify per V52/V53/V54 instructions
- (Idle until user direction)

## Resume Prompt

See SESSION_HANDOFF.md `## Resume Prompt` block (auto-updated this checkpoint).
