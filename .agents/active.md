---
updated_at: "2026-07-07 — whole-app PERF CAMPAIGN (4 phases) SHIPPED + DEPLOYED LIVE + dead-cron fix drained on prod."
status: "DEPLOYED. master = prod. Final full vitest 17287/17287 · 0 fail. Awaiting user L1 hands-on (perceived speed)."
branch: "master"
last_commit: "perf(T13) after-phase3 final metrics + report.html (see git log)"
tests: "full vitest 17287/17287 · 0 fail (final clean run post-P3). Build clean. Reuse these counts — do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "perf campaign head (2026-07-07) — vercel lover-clinic-lh9waq3po aliased, HTTP 200, live-verified markers"
firestore_rules_version: "UNCHANGED entire campaign → frontend-only deploy, NO Probe-Deploy-Probe"
---

# Active — 2026-07-07 — perf campaign shipped (P0 harness → P1 bundle → P2 render → P3 data)

## Measured results (median-of-3, local-preview; full table docs/perf/report.html)
- Backend tabs JS/หน้า 852-889 → **449-561KB (−44%)** · entry chunk 365 → **31KB** · FCP −25% ·
  backend LCP 1016-1236 → 924-976ms · frontend heap 69 → 48MB · customer links JS −4..−22%.
- P2: chat/presence re-render storms killed (equality guards + renderHook locks) · CustomerCard/RecallRow memo.
- P3: hub refetch debounced (3 bursts → 1) · chat_history client-delete → cron-owned.
- **BONUS BUG**: chat-history retention cron DEAD (Timestamp-vs-ISO-string type mismatch, 46 runs × scanned:0)
  → fixed (dual-type query) + verified LIVE on deployed code + drained 4,265 → 137 docs.

## Key artifacts
- Harness (reusable): scripts/perf-{lib,baseline,bundle-manifest,compare,visual-parity,find-links}.mjs + npm run perf:*
- docs/perf/punchlist.md (verdicts + P1/P2/P3 results + deferred items w/ rationale) · docs/perf/report.html
- Locks: tests/perf-p1-lazy-locks + perf-p2-render-guards + perf-p3-locks + perf-p3-chat-history-sweep-type-fix + perf-harness-lib

## Deploy state
- DEPLOYED + live-verified (Rule Q): preconnect ×4 ✓ · recall-chunk preload GONE ✓ · FOUC hack gone ✓ ·
  /assets immutable cache header ✓ · CSP hashes intact ✓ · cron fix live (scanned 500 on first forced run) ✓.

## Next action
- **NEXT SESSION (user-approved 2026-07-07): link-patient LCP 4.3s data-chain fix** — the customer-facing
  ?patient= link waits SERIALLY (anon-auth → clinicSettings → patientLinkToken query → render) even on
  localhost. `/systematic-debugging` trace the real chain in PatientDashboard.jsx + App.jsx auth gate →
  parallelize/early-start → measure LCP before/after (`node scripts/perf-baseline.mjs --surface link-patient`)
  → Rule Q L1/L2 (V16/V23 history on this page: auth-gates + anon whitelist — strict). Target ~1.5-2s.
- Also pending: user L1 hands-on of the perf campaign (speed feel + visual identical + realtime ปกติ).
- Other deferred perf items stay parked (rationale in docs/perf/punchlist.md).

## Outstanding user-triggered actions
- (none — deployed + drained; L1 feedback only)
