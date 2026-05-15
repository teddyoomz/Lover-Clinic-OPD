# 2026-05-15 — LINE Reminder Pipeline V67 + V68 + V69 + V69.A Saga

## Summary

User-reported "ยิงไม่ได้ซักอัน" post-Wave 1 LINE-reminder ship triggered systematic-debugging Phase 1 → 4 V-entries shipped + 4 vercel deploys in single session. V67 closed the V66 mock-shadow class at the pipeline schema layer (4 field-name drifts); V68 surfaced LINE badges across 4 admin surfaces + CustomerCard V5 Editorial redesign + lineNotify legacy strip via Subagent-Driven Development (16 tasks); V69 closed 3 follow-up contract drifts found post-V68 deploy; V69.A added force opt-in for debug re-test after L1 friction.

## Current State

- master = `bb48036` · prod = `262cfda` LIVE on https://lover-clinic-app.vercel.app
- 10141 PASS / 0 FAIL / 12 skip (full vitest)
- All audits GREEN: V67 19/19 · V68 21/21 + 18/18 L2 · V69+V69.A 19/19
- Build clean (2.64s)
- firestore rules v32 unchanged · NO data ops · NO Playwright e2e change

## Commits (this session)

```
bb48036 docs(agents): V69.A DEPLOYED LIVE on prod (262cfda)
262cfda fix(V69.A): force-bypass-idempotency opt-in for debug-fire re-test
4bc76f7 docs(agents): V69 DEPLOYED LIVE on prod (vercel-only)
44a3000 fix(V69): LINE reminder debug-fire 3 V67-class contract drifts post-V68 deploy
ae12b04 docs(agents): V67 + V68 DEPLOYED LIVE on prod (vercel-only)
7f7ade4 feat(V68): LINE badge surfacing + CustomerCard V5 redesign + lineNotify strip
5beb3b8 docs(plan): V68 16-task implementation plan
9deb1ac docs(spec): V68 design doc
1b269c5 fix(V67): LINE reminder pipeline schema-drift fix (4 bugs)
```

## Files Touched

**V67 (10 files)**: src/lib/lineReminderTemplate.js · api/cron/line-reminder-fire.js · api/admin/line-reminder-debug-fire.js · 4 LINE-reminder test fixtures · scripts/e2e-line-reminder-real-prod.mjs · 5 V21 fixups · 5 NEW (audit + 4 diag scripts) · audit SKILL.md

**V68 (15 files)**: NEW src/components/AppointmentLineBadge.jsx + tests (audit + L2 jsdom) · CustomerOption sibling export · CustomerCard.jsx full V5 rewrite · 4 surfaces wired (Calendar + Hub + CDV + AdminDashboard) · AppointmentFormModal lineNotify strip · appointmentDepositBatch.js strip · audit SKILL.md (AV47)

**V69 (7 files)**: lineReminderTemplate.js (stripCustomerNamePrefix) · LineReminderDebugSection.jsx (extracted ResultPanel + result.results path + confirmBranchName key) · audit SKILL.md (AV48) · 2 V21 fixups · 1 NEW V69 audit · 1 NEW Rule R diag

**V69.A (4 files)**: api/cron/line-reminder-fire.js (force flag) · api/admin/line-reminder-debug-fire.js (force plumbed + already-sent→skipped) · LineReminderDebugSection.jsx (🔁 checkbox + already-sent hint) · v69 audit (+6 AA tests)

## Decisions

- V67: defensive `||` fallback chains (mirror lineBotResponder.js V32-tris-ter pattern) — single source-of-truth canonical field name + legacy fallback. Mock fixtures must DERIVE from real-prod schema.
- V68: Approach A (shared component + atomic single-commit batch) over phased rollout — Rule of 3 + V67-class hygiene cluster ships together. CustomerCard V5 = Editorial variant with hash-derived gradient avatars + 4-layer shadow stack + meta-col vertical phone-above-branch.
- V68 review: Caught 2 critical Tailwind bugs (`bg-black/3` invalid + `dark:` mode mismatch) + 2 V21 lock-ins inline before commit. Subagent-Driven 2-stage review (spec compliance + code quality) earned its keep.
- V69: 'already-sent' should map to skipped++ (was failed++); semantic accuracy. Force opt-in (V69.A) preserves customer-spam protection by default.
- V69.A: extracted `<ResultPanel>` component because parent had IIFE-in-JSX (`{result && (() => {...})()}`) which is iron-clad-banned per Vite-OXC parser crash rule.

## Lessons (full detail → v-log-archive.md V67/V68/V69)

- **V67 mock-shadow drift class is recurring** — same day Rule Q infrastructure shipped, Wave 1 LINE reminder shipped with 4 field-name drifts. Mock-only verification doesn't catch contract drift between sides.
- **V68 V21 lock-in scope at task-boundary** — every architectural extraction surfaces V21 lock-ins in pre-existing tests; full-suite scan at end-of-batch is mandatory not optional.
- **Subagent-Driven Development with 2-stage review = 30+ subagent invocations for 16 tasks**; caught 4 critical+important issues inline (Tailwind C1+C2, V21 ×2). Worth the cost vs single-pass implementation.
- **V69.A force flag pattern** is reusable for any debug/admin endpoint that has idempotency in production but needs admin opt-in to bypass for testing.

## Next Todo

- User L1 hands-on verification — 3 surfaces × 6 checks (V67 LINE message arrives + V68 badge surfaces + V69 customerName/Sent counter/branch confirm + V69.A force re-test loop)
- Adjust AppointmentHubView badge overlay if visual is cramped (T4 deferred concern)
- Optional: full 8-scenario e2e `node scripts/e2e-line-reminder-real-prod.mjs --apply --admin-line-user-id=Uxxx`

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block.
