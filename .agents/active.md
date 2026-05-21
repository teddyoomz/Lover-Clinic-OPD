---
updated_at: "2026-05-21 — Tablet Chart Editor bugfix saga (template/relay/CORS/ratio) + more-tools brainstorm pending"
status: "Relay WORKS end-to-end on prod (verified live) after CORS fix; ratio fix pushed, NOT deployed; more-tools feature at design-approval gate"
branch: "master"
last_commit: "da71fa01 test(tablet-chart): DIAG_TPL env to pick template for ratio testing"
tests: "full vitest GREEN (exit 0; ~13889 = 13880 + tablet-chart bugfix tests) · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "dc9d230c — has relay fixes #1/#3; ratio fix 72ea7585 NOT yet deployed (body still stretched on prod). CORS = applied bucket-side (live)."
firestore_rules_version: "be_chart_* (isClinicStaff) — deployed earlier; unchanged this session"
---

# Active Context

## State
- master = `da71fa01`; prod = `dc9d230c`. master AHEAD by `fb74f0b5` (CORS tooling) + `72ea7585` (ratio fix — **needs deploy**) + `da71fa01` (diag).
- **Storage bucket CORS = applied (live, bucket-side)** via `scripts/set-storage-cors.mjs --apply` (origin:['*'] GET/HEAD) — this unblocked the browser image download. NOT a code/deploy thing.
- Tablet Chart Editor relay **VERIFIED working end-to-end on real prod**: iPad renders the real chart, draw+save, PC fetches the 123KB annotated result. (Checkpoint: `.agents/sessions/2026-05-21-tablet-chart-bugfix-saga.md`)

## What this session shipped
- **FP3/5/6** (prior turns): L2 6/6 + orphan-sweep verified live + wiki/graphify + diag tool + session-end docs (`b9a06553`,`f3ec63ac`,`1b7a58bd`).
- **Bugfix saga** (4 root causes from user L1): `dc9d230c` #1 template path→data URL (`resolveToDataUrl`) + #2 instant-pop race (tablet late-loads templateImageUrl) + #3 PC-stuck (saved-handler try/catch, never hangs) + newest-session selection + cancel-on-failure. `fb74f0b5` **CORS** (THE blocker: bucket had cors:null → browser fetch of Storage blocked) + AV102. `72ea7585` aspect-ratio (PenCanvas buffer=real ratio + CSS contain, mirrors ChartCanvas).
- AV102 (#1-#6) covers transport-normalize / race / no-hang / newest-select / CORS / true-ratio.

## Next action
- **DEPLOY** `vercel --prod` (user-triggered) to ship `72ea7585` ratio fix → iPad shows correct ratio. CORS already live; #1/#3 already live.
- **more-tools feature** (brainstorm PENDING — NOT started): user must pick pen approach — **Fabric constant-pen (recommended, reuse ChartCanvas)** vs hybrid perfect-freehand pressure-pen. Then spec→plan→implement (full toolset: select/move/resize + shapes + text + arrow + color picker + sizes). Chosen B = select/move/resize editing.

## Outstanding user-triggered actions
- **deploy** (ratio fix 72ea7585) — then re-verify body renders 1:2 on prod.
- Answer the more-tools pen question to unblock that feature.
- (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 L1.
