---
updated_at: "2026-05-20 EOD+3 — Recall list enhancements (phone tap-to-call + prominent note + staff logged-by + 'Recall วันนี้') shipped LOCAL"
status: "✅ Recall enhancements coded + full suite green (13697 pass / 0 fail) + build clean + Rule R real-data confirmed · pushed · awaiting user L1 + 'deploy'"
branch: "master"
last_commit: "Recall list enhancements (feat + test + Rule R diag) — pushed"
tests: "13697 pass / 0 fail / 0 skip · build clean (was 13681 baseline)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0511be1e LIVE — NOTHING from EOD/EOD+1/EOD+2/EOD+3 deployed yet"
firestore_rules_version: "unchanged (UI + 1 fn-contract only — no rules/data ops)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = origin = pushed (Recall enhancements + earlier EOD/EOD+1/EOD+2 cluster all LOCAL). Prod still `0511be1e`.
- This session: (1) durable skill+rule update — brainstorming auto-uses Visual Companion from the question stage for design + plans/specs = HTML with mockup AND flow always (user/project CLAUDE.md + 4 skills + 2 memory files). (2) Recall list enhancements feature (brainstorm → spec → plan → code → test → Rule R).

## What this session shipped (all LOCAL, awaiting deploy)

- **Skill/rule directive**: Visual Companion auto-use for design (question stage) + plan IS HTML too (not just spec) + mockup AND flow always. Edited `~/.claude/skills/{brainstorming,writing-plans,executing-plans,subagent-driven-development}/SKILL.md` + both CLAUDE.md + `feedback_visual_companion_always_allowed.md` + `feedback_plans_html_with_mockup.md` + MEMORY.md.
- **Recall enhancements** (Q1=A note=outcomeNote||reason · Q2=B staff dropdown blank+required · Q3=A frontend=all overdue):
  - Shared `RecallRow.jsx`: `customerPhone` tap-to-call (`tel:`, call-accent, name stays non-red) + prominent note block + "บันทึกโดย" byline. Propagates to backend tab / frontend / customer-detail.
  - `recordRecallOutcome` requires `recordedBy` → `outcomeBy {name,staffId}` (throws if missing); `updatedBy` = account. `validateRecallOutcome` pure helper.
  - `RecallOutcomeModal`: required `StaffSelectField` (blank, gates Save) via `listStaff`.
  - Frontend: "Recall วันนี้" heading; compact buckets today(prominent)→overdue→tomorrow.
  - Spec + plan HTML in `docs/superpowers/`. NEW `tests/recall-list-enhancements.test.jsx` + 10 phase-29 V21 fixups. Rule R diag `scripts/diag-recall-list-enhancements-shape.mjs`.

## Verification

- Full vitest 13697 pass / 0 fail · build clean.
- Rule R (real prod, READ-ONLY): customerPhone 100% populated, outcomeBy.name present on finalized, reason/outcomeNote present → UI renders against real data.
- **Rule Q L1 (real-browser visual + tactile) PENDING USER** — tap-to-call, prominent note, byline, today/overdue/tomorrow order + today prominence, Save-gated-until-staff, dark+light beauty. (Per standing "user tests UI" preference + headless-preview visual limit.)

## Next action

- Await user L1 hands-on + "deploy" (combined `vercel --prod`; rules unchanged) for the whole queued cluster.

## Outstanding user-triggered actions

- **Deploy** all queued work (EOD sub-tabs + Menu-D fixes + EOD+2 baseline + EOD+3 Recall enhancements) — one combined `vercel --prod` (V18).
- **L1 hands-on** Recall enhancements (above) + prior EOD/EOD+1 UI.
- **V106** stock-movement 30-day retention — brainstorm locked, spec NOT written.
