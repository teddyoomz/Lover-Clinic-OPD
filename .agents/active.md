---
updated_at: "2026-05-28 EOD+5 — V130 (createdBy + responsive table) + V131/V131-bis (HN canonical, fill-height, clickable name, cursor/caret) SHIPPED + DEPLOYED + prod-verified."
status: "All deployed + live. Working tree CLEAN. prod LIVE = c070123d."
branch: "master"
last_commit: "c070123d (V131 + V131-bis). EOD docs commit on top."
tests: "NO re-run at session-end (per rule). Last FULL suite this session 15106 pass + 1 isolated flake (staff-chat-lightbox-cached-image-race 200-iter stress, 7/0 isolated, unrelated). Build clean. V130 12/0 · V131 (hn 16 + appt 6) · V131-bis 7/0 all GREEN."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c070123d LIVE (vercel --prod, aliased) — V128/V129/V130/V131/V131-bis all live."
firestore_rules_version: "UNCHANGED — entire session frontend/lib/CSS only (no rules/storage/index/cron → no Probe-Deploy-Probe)."
---

# Active Context — V130 + V131/V131-bis SHIPPED + DEPLOYED (2026-05-28 EOD+5)

## State
- Earlier session deployed the held V128/V129/V130 batch (commit bd925fe8). Then V131 + V131-bis shipped + deployed (c070123d). prod LIVE = c070123d, working tree clean.
- Two `/brainstorming → spec → writing-plans → executing-plans` cycles (V130) + four `/systematic-debugging` rounds (V131 HN + table-height + appt-name + caret browsing).
- Caret-browsing root cause = browser F7 (user-confirmed); app can't toggle the browser setting but hides the caret app-wide via caret-color (same visible result).

## What this session shipped (detail → checkpoint 2026-05-28-v130-v131-reports-caret.md)
- **V130** — sale `createdBy` true-capture (createBackendSale chokepoint `_resolveSaleCreatedBy`; AV149) + reports-sale compact + reachable-scroll table (AV148) + Rule-M backfill script (held). 
- **V131** — HN class-of-bug: canonical `resolveCustomerHN` (reads `hn_no`) across 6 files; report blank-HN 6→0, CustomerDetailView HN badge restored (AV150). Table fills viewport height. Appt-modal name clickable → customer tab (AV151).
- **V131-bis** — `body{cursor:default}` (mouse arrow) + `html{caret-color:transparent}` + inputs restored (hides caret-browsing `|` everywhere except inputs; copy preserved; AV152).
- All L2/real-browser verified (HN on real prod; caret/cursor computed-style on live prod build).

## Next action
Idle / await user.

## Outstanding user-triggered actions
- **V130 backfill `--apply`** (`scripts/v130-backfill-sale-created-by.mjs`) — 49 legacy sales' createdBy = first seller (tagged). OPTIONAL (display already shows first-seller fallback). Needs explicit authorization (Rule M).
- L1 hands-on (auth-gated): create sale logged-in → ผู้ทำรายการ = you; reports-sale HN + fill-height on a Windows-scaled screen; appt-modal clickable name; (with F7 on) caret hidden except inputs.
