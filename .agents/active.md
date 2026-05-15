---
updated_at: "2026-05-15 EOD+4 — V68 LINE badge surfacing + CustomerCard V5 redesign"
status: "master=ahead-by-3 (V67 + V68-spec + V68-plan + V68-feature) · prod=84c0af1 LIVE · firestore rules v32 (no rules change)"
branch: "master"
last_commit: "(pending V68 feature commit) — single commit batch under V18 lock"
tests: "10122 PASS / 0 FAIL / 12 skip (full suite GREEN); 21/21 V68 audit + 18/18 L2 render verify GREEN"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "84c0af1"
firestore_rules_version: 32
storage_rules_version: 2
---

# Active Context

## State

- master = ahead-by-3 vs prod=`84c0af1` (V67 + V68-spec + V68-plan + V68-feature pending commit)
- build clean (2.82s, only pre-existing chunk-size warnings)
- NO firestore/storage rules change · NO data ops · NO Playwright e2e change
- V68 LINE badge surfacing across 4 admin appt-list surfaces + CustomerCard V5 redesign + lineNotify legacy strip

## What this session shipped (V68)

**Brainstormed via /brainstorming + visual companion** (4 customer-card variants × dark+light themes); locked V5 Editorial + meta stacked vertically + 4-layer shadow depth. Subagent-Driven Development executed all 16 tasks with 2-stage review.

**NEW components / artifacts**:
- `src/components/AppointmentLineBadge.jsx` — shared appt-row 🟢 LINE chip (defensive notifyChannel || lineNotify fallback per V67 mock-shadow lesson)
- `CustomerLineBadge` sibling export from `src/components/CustomerOption.jsx` — single source of truth for per-branch 🟢/⚪️ logic (consumed by both pickers via CustomerOption AND directly by CustomerCard)
- `src/components/backend/CustomerCard.jsx` — full V5 Editorial rewrite (initials gradient avatar with hash-derived 6-color palette, no red per Thai rule; 4-layer shadow stack with explicit isDark ternary; meta-col phone-above-branch; LINE chip in bottom meta row)
- AV47 invariant in audit-anti-vibe-code SKILL.md (banner AV1–AV47)
- `tests/v68-line-badge-surfacing-audit.test.js` — 21 source-grep regression assertions across 6 groups
- `tests/v68-line-badge-render-l2-verify.test.jsx` — 18 Rule Q L2 jsdom render checks

**Wired** (4 admin surfaces import + render `<AppointmentLineBadge>`):
- AppointmentCalendarView (canonical backend grid)
- AppointmentHubView (admin appt hub — overlay-via-wrapper pattern with `pointer-events-none` for click pass-through)
- CustomerDetailView (per-customer appts tab — single AppointmentCard component covers both next-upcoming + view-all-modal)
- AdminDashboard queue calendar (Frontend page; AV47-sanctioned skip annotation at 8px schedule-day-preferences slot grid)

**Stripped** (legacy lineNotify field — zero consumers):
- AppointmentFormModal: 5 formData/payload sites + 5-line checkbox JSX block + V68 marker comment
- appointmentDepositBatch.js: 4 sites (cleanAppointment-equivalent payload + allow-list + batch payload + dotted-path) + JSDoc cleanup + V68 marker comment

**V21 fixups landed inline** (caused by V68):
- T9 review caught Tailwind `bg-black/3` invalid + `dark:` mode mismatch — fixed via explicit `isDark ? 'bg-white/[0.03]' : 'bg-black/[0.03]'` ternary + `accentColor` unused-prop comment
- T15 caught V21 lock-ins: phase-24-0 F4.1 (Trash2 → 🗑️ broadened) + V67 A8.2 (banner AV46 → AV46+ regex)

**Tests**: 10078 → 10122 PASS (+44 net = 21 V68 audit + 18 L2 render + 5 from V21 fixups). 0 FAIL. 12 skip. Rule N batch-end satisfied.

**Build**: clean (2.82s).

**T4 visual concern (deferred to L1)**: AppointmentHubView badge overlay at `top-2 right-2` could overlap with status chip / action buttons on narrow desktop. `pointer-events-none` ensures no click interference. Self-nullifies for non-LINE appts (most rows). Real visual judgment requires user L1 inspection; reposition trivially adjustable in follow-up if visual is unacceptable.

## Files Touched (V68 — pending single commit)

**NEW (3)**: `src/components/AppointmentLineBadge.jsx`, `tests/v68-line-badge-surfacing-audit.test.js`, `tests/v68-line-badge-render-l2-verify.test.jsx`

**MODIFIED runtime (8)**: `src/components/CustomerOption.jsx`, `src/components/admin/AppointmentHubView.jsx`, `src/components/backend/AppointmentCalendarView.jsx`, `src/components/backend/AppointmentFormModal.jsx`, `src/components/backend/CustomerCard.jsx`, `src/components/backend/CustomerDetailView.jsx`, `src/lib/appointmentDepositBatch.js`, `src/pages/AdminDashboard.jsx`

**MODIFIED audit/tests (3)**: `.agents/skills/audit-anti-vibe-code/SKILL.md`, `tests/phase-24-0-customer-delete-flow-simulate.test.js` (V21 fixup), `tests/v67-line-reminder-canonical-schema-audit.test.js` (V21 fixup)

## Next action

**User L1 hands-on after deploy**:
1. Open `tab=appointment-all` → see 🟢 LINE chips on appts where notifyChannel=line in time-grid
2. Same in `tab=appointment-hub` (verify visual overlap concern — reposition if needed)
3. Same in customer detail view → appts tab
4. Same in `/admin` (Frontend) queue calendar
5. Open AppointmentFormModal → confirm bottom checkbox is GONE; only green-card at top
6. Open `tab=customerlist` → see V5 redesigned cards with 🟢/⚪️ LINE chips + 4-layer shadow depth + initials gradient avatars

**Deploy authorization**: user types "deploy" verb to authorize `vercel --prod` (NO firebase rules change needed — pure UI + lib changes).

## Outstanding user-triggered actions

- Deploy V68 fix to prod (vercel --prod only; combined with V67 commit ahead — both ship together)
- L1 visual verification of AppointmentHubView badge overlay placement (T4 concern)

## Notes

- V68 = first feature shipped via Subagent-Driven Development workflow this project. 16 tasks × subagent-per-task + 2-stage review = ~30 subagent invocations. Caught 2 critical Tailwind bugs (T9 C1+C2) + 2 V21 lock-ins (T15) inline before commit.
- AV47 closes the appt-row badge surface; future cross-cutting status badges (recall pill, no-show flag, VIP, membership tier) follow the same Rule of 3 + defensive `||` + source-grep regression pattern (V67 + V68 establish the canonical playbook).
