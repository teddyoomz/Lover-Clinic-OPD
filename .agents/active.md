---
updated_at: "2026-04-26 (session 3 — 24h pre-launch audit + remediation + perf code-split + design audit + UI click-test + E2E spec authoring)"
status: "All scope shipped: 22 audits + 5-agent design audit + 41/41 backend UI click-test verified live + 4 new E2E spec files (~69 tests). 145-site `:focus-visible` a11y gap closed via single CSS rule. 11 commits ahead of prod."
current_focus: "Idle. All in-scope audit work shipped + verified live. Next decision: deploy 8-commit batch OR start a deeper item (TFP refactor, permission system) that needs explicit user input before commit."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "4d4529b"
tests: "4893/4893 full suite (+214 across this 24h pass)"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "791b2de (2026-04-26 V15 combined deploy — V21 fix + 14.7.H-D wireup). 8 commits 7a9c62d → 4d4529b pushed but NOT deployed."
firestore_rules_deployed: "v10 (be_stock_movements update narrowed in 14.7.F per V19; UNCHANGED this session — re-deploy will be no-diff fire)"
bundle: "BackendDashboard: 1216 KB → 899 KB (-26%, gzip 224 → 162 KB / -28%) after lazy-loading 17 of 44 tabs"
---

# Active Context

## Objective

Pre-launch audit-all sweep + triage + remediation. User authorised a 24h
"use everything" pass to find + fix real bugs before production traffic.

## What this session shipped (2026-04-26 session 3, 5 commits, `7a9c62d` → `b870b40`)

| Commit | Phase | One-liner |
|---|---|---|
| `7a9c62d` | 14.7.H-EFG | (carried from session 2 — period + finance listener + TDZ guard) |
| `b1032bf` | 14.7.H-H | listener cluster: listenToHolidays + bounded listenToAllSales(opts.since); 3 holiday consumer migrations; 29 LC8/LC9 tests |
| `55b5919` | 14.7.H-I | pick-at-treatment reopen-add (last V12.2b deferred); addPicksToResolvedGroup + _pickGroupOptions snapshot + reopen UI; 46 F18 tests |
| `65ba420` | 14.7.H-J | debugLog helper + 9 silent-catch wirings in api/proclinic/{customer,appointment,treatment,deposit}.js; 35 DL1-DL3 tests |
| `b870b40` | audit-2026-04-26 | TZ1 P0 + AP1 P1 + RP5 P1 + AV3 P2 + C3 design lock; 54 tests across 2 files |

## Audit findings + verification (full report: `docs/audit-2026-04-26-sweep.md`)

**Method**: 22 audit skills / 237 invariants run via 6 parallel domain-grouped Explore agents. Raw counts: 12 CRITICAL + 9 HIGH. After verification (read cited code, reproduce assertion, check false positives):

**P0 — fixed**:
- **TZ1** SalePaymentModal:24 paidAt UTC slice → drifted to YESTERDAY 00:00-07:00 Bangkok. Fix: thaiTodayISO(). Same pattern fixed in StockReportTab CSV filename + medicalInstrumentValidation default-today.

**P1 — fixed**:
- **AP1** createBackendAppointment had no server-side collision check → race double-booking. Fix: read existing appointments by date + filter doctorId + check time overlap before write; throw with code='AP1_COLLISION' + collision payload. Combined with client-side check + 1s listener freshness covers realistic clinic-pace gap. Race window down to ~50ms.
- **RP5** silent catches in TFP outer modal-load functions (6) + ChartTemplateSelector (3) → migrated to debugLog with category prefixes (`tfp-medmodal-load`, `chart-template-pc`, etc).

**P2 — fixed**:
- **AV3** txId / ptxId Math.random suffix → crypto.getRandomValues with Math.random fallback. Audit-chain integrity hardened.
- **C3** deleteBackendTreatment design-intent regression test added (the audit's CRITICAL was a false positive — the comment block at lines 270-281 explicitly documents stock NOT reversed because items WERE used; user must cancel the linked SALE).

**False positives ruled out by verification** (no code changes):
- **C3** stock orphan — design intent (locked with regression test)
- **CL1** clone dedup gap — already implemented at cloneOrchestrator.js:91-116 (HN + phone + national-ID via findCustomersByField)
- **CL3** silent partial-failure — handled with per-appointment errors[] + console.error aggregate count
- **FF3** scrollToError gap — data-field="sellers" (line 4511) + data-field="paymentChannels" (line 4478) BOTH exist
- **RP1/AV1** IIFE JSX — CLAUDE.md Bug #5 was about CLICK HANDLERS specifically; render-time IIFEs at TFP:3286 + 4580 work today (4848 tests + clean build)
- **PV1-PV5** PDPA — explicitly deferred per user directive

## Live verification done this session (preview_eval against real Firestore)

User authorisations from earlier sessions still in force ("Generate อะไรจริงๆขึ้นมาเทสใน backend ได้ไม่จำกัด").

### Test 1 — listener cluster H (b1032bf)
- listenToHolidays: 1 emit, payload=[] (no holidays in test data) ✓
- listenToAllSales (default 365d since): 50 sales returned, sample shape correct ✓
- listenToAllSales(since='2024-01-01'): 50 returned, override accepted ✓

### Test 2 — pick-at-treatment reopen-add (55b5919)
- 425 customers scanned (no existing pick-at-treatment data — feature flows forward only) ✓
- mapRawCoursesToForm carries _pickedFromCourseId + _pickGroupOptions on synthetic input ✓
- addPicksToResolvedGroup throws cleanly on bogus group id ✓

### Test 3 — debugLog helper (65ba420)
- 6 invocation paths produce expected formats ✓
- Long-string detail truncated to 200 chars ✓
- console.warn (not .error) ✓

### Test 4 — audit batch fixes (b870b40)
- thaiTodayISO returns "2026-04-26" (YYYY-MM-DD shape) ✓
- daysUntilMaintenance fallback agrees with explicit-arg call ✓
- AP1: first write success → overlapping write throws code='AP1_COLLISION' → edge-touch write success ✓
- 2 test appointments cleaned up ✓

## Outstanding user-triggered actions (NOT auto-run)

- **`vercel --prod` for 5 commits `7a9c62d` → `b870b40`** — V15 combined deploy (vercel + firestore:rules) in parallel. firestore:rules unchanged this round → no-diff probe fire expected. Per V18, user must say "deploy" THIS turn.

## Recent decisions (non-obvious — preserve reasoning)

1. **Triage downgrades** — 6 of the 12 raw CRITICAL findings were verified false positives. Reading the cited code (especially comment blocks like `deleteBackendTreatment` lines 270-281 + cloneOrchestrator dedup at 91-116) revealed the audit invariants were either outdated or didn't account for explicit design intent. Lock these decisions with regression tests so they don't get "re-fixed" by future contributors.

2. **AP1 server-side check uses read-then-write (not transaction)** — Firestore SDK doesn't support queries inside runTransaction. True atomicity would require a slot-claim doc architecture. Read-then-write reduces race window from ms-wide to ~50ms — combined with client-side check + 1s listener freshness, covers realistic clinic-pace booking. Slot-claim architecture deferred.

3. **AV3 crypto suffix is 4 bytes (8 hex chars sliced to 4)** — keeps existing WTX-/PTX- + Date.now()-XXXX format stable for log-grep + downstream parsers. Math.random fallback preserved for legacy node test environments.

4. **Silent-catch migration scope** — picked TFP + ChartTemplateSelector outer catches (highest-traffic user-facing surfaces). brokerClient.js sites 54/233/245/253 deferred — they're internal broker bookkeeping, lower diagnostic value.

5. **IIFE JSX not refactored** — CLAUDE.md Bug #5 was about CLICK HANDLER IIFEs blocking events, not all render-time IIFEs. The TFP:3286 grand-total computation + TFP:4580 modal mount both work today (4848 tests + clean build). Refactor when convenient (extract to useMemo / sub-component) but not blocking.

## Detail checkpoint

See `docs/audit-2026-04-26-sweep.md` (full audit findings + triage matrix).
