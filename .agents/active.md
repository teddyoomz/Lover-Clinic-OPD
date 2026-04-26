---
updated_at: "2026-04-26 (session 3 EOD — audit + design + e2e + deploy COMPLETE)"
status: "Production at 093d4d9 LIVE. V15 combined deploy of 11 commits done; pre+post-probe 200/200/200/200. master 1 commit ahead with E2E spec only (no production code). Tests: 4961 vitest + 75 E2E = 5036 total. Bundle -26% via code-split."
current_focus: "Idle. Pre-launch audit pass + design pass + E2E backend coverage + V16 public-link lock all shipped + deployed. Production verified working for both authed admins (full E2E) and non-logged-in customers (public-link spec)."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "2001aa6"
tests: "4961 vitest + 75 E2E = 5036 total"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "093d4d9 (2026-04-26 EOD V15 combined deploy — 11 commits including audit fixes + IIFE refactor + code-split + design-CSS + E2E suite). Pre+post probes 200/200/200/200."
firestore_rules_deployed: "v10 (be_stock_movements update narrowed in 14.7.F per V19; UNCHANGED this session — re-deploy was idempotent fire)"
bundle: "BackendDashboard: 1216 KB → 899 KB (-26%, gzip 224 → 162 KB / -28%) via React.lazy on 17 of 44 tabs"
---

# Active Context

## Objective

24h pre-launch session. User authorized "use everything" — audit-all sweep
+ design pass + UI click-test + E2E coverage + deploy. All shipped.

## What this session shipped (12 commits — 4 themes)

### Theme 1: Audit-all sweep + remediation (commits b1032bf → b870b40)
- 22 audit skills / 237 invariants via 6 parallel agents → docs/audit-2026-04-26-sweep.md
- **TZ1 P0**: SalePaymentModal paidAt + StockReportTab + medicalInstrumentValidation → thaiTodayISO
- **AP1 P1**: server-side appointment collision check (read-then-write, ~50ms race window) + AP1_COLLISION error code + Thai message
- **RP5 P1**: 6 TFP + 3 ChartTemplateSelector silent catches → debugLog
- **AV3 P2**: txId / ptxId crypto.getRandomValues hardening (audit-chain integrity)
- **C3 P2**: deleteBackendTreatment design-intent regression test (false-positive lock)
- **listenToHolidays + listenToAllSales**: extends listener cluster pattern
- **Pick-at-treatment reopen-add**: last V12.2b deferred item closed
- **debugLog helper**: structured logger for ProClinic API silent-catch sites

### Theme 2: Bonus polish (5b790e4 → 4d4529b)
- IIFE JSX refactor (TFP:3287 + 4589 → component-scope useMemo)
- BackendDashboard code-split via React.lazy + Suspense (17 tabs lazy)
- Bundle: 1216 KB → 899 KB (-26%, gzip -28%)

### Theme 3: Design audit + a11y fix (24b82ac)
- 5 parallel design-audit agents reviewed all 95 backend component files
- Top P0: 145-site `:focus-visible` gap → single CSS rule covers all
- docs/audit-2026-04-26-design-pass.md catalogued P1/P2/P3 for next session

### Theme 4: E2E coverage + V15 deploy + V16 lock (093d4d9 → 2001aa6)
- 4 new backend E2E specs (smoke 40 + marketing 3 + reports 13 + master-data 12 = 68 tests)
- helpers.js: expandAllNavSections + clickLeafTab (handle nav section/leaf disambiguation)
- V15 combined deploy: vercel + firestore:rules; pre+post-probe 200/200/200/200
- V16 anti-regression public-link spec: 7 tests for ?session/?patient/?schedule no-auth access
- Production HTTP probed: 3 sample public URLs returned 200

## Live verification done this session

### Preview server (preview_eval against real Firestore)
- 41/41 backend tabs verified loading via programmatic click-test (0 console errors)
- debugLog helper correct format (6 invocation paths)
- thaiTodayISO returns "2026-04-26"
- AP1 collision: first write success → overlapping write throws code='AP1_COLLISION'
- mapRawCoursesToForm carries pick-group fields on synthetic data

### Playwright E2E
- backend-all-tabs-smoke: 40 passed (3.1m)
- marketing/reports/master-data batch: 28 passed (1.2m)
- public-links-no-auth: 7 passed (16.2s)

### Production HTTP
- /?session=DEP-DBGMJ7         → 200
- /?patient=dkeq1b2hx7bk5138pe80 → 200
- /?schedule=SCH-0bb9ed3369    → 200

## Outstanding user-triggered actions (NOT auto-run)

None. Production deployed + verified. master 1 commit ahead (`2001aa6`) is
the V16 anti-regression spec only — no production code change → no deploy
needed.

## Recent decisions (non-obvious — preserve reasoning)

1. **Triage downgraded 6 of 12 raw CRITICAL audit findings to false positives** by reading cited code (C3 design intent, CL1/CL3 already implemented, FF3 attrs exist, RP1 click-handler-only rule, PV1-PV5 user-deferred).

2. **:focus-visible CSS rule beats per-component focus-ring edits** — single CSS rule scoped to interactive elements covers 145 sites; only triggers on KEYBOARD focus (mouse preserved).

3. **Bundle code-split kept 12 always-on tabs eager** — lazy-loading entry-point tabs would block first click. TFP stays eager (multi-site usage).

4. **AP1 server-side check uses read-then-write (not transaction)** — Firestore SDK doesn't allow queries in transactions. Read-then-write reduces race from ms-wide to ~50ms; combined with client-side + listener freshness, covers clinic-pace bookings.

5. **AV3 crypto suffix is 4 bytes (8 hex sliced to 4)** — keeps WTX-/PTX- + Date.now()-XXXX format stable for log-grep.

6. **E2E spec helper iteration was 3 rounds** — final form uses `clickLeafTab` filtering via `nav button:not([aria-expanded])` to disambiguate "การเงิน" leaf vs section header.

7. **Public-link spec uses content-settle wait** — Firestore listeners keep network active forever; `waitForLoadState('networkidle')` would never resolve. 3.5s after domcontentloaded covers V16 race window with margin.

## Detail checkpoint

See `.agents/sessions/2026-04-26-session3-audit-deploy-e2e.md` (this
session's full detail — 12 commits + verification + decisions + next-todo).
