---
updated_at: "2026-06-16 EOD+2 — Mobile-load reliability (autoDetectLongPolling + useResilientLoad + LoadErrorRetry) SHIPPED + DEPLOYED + L1-verified LIVE."
status: "DEPLOYED to prod (frontend-only, vercel). No firestore.rules change → no Probe-Deploy-Probe. Adversarial bug-hunt loop CONVERGED (R1→R4, R4 clean). full vitest 16673/0; L1 3/0 (live build); L2 7/0 (real prod)."
branch: "master"
last_commit: "d54d58c4 — fix(useResilientLoad): R3 resetKey in timer-effect deps (orphaned-timer); adversarial loop converged"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = lover-clinic-p4uawr0kx (HEAD d54d58c4) — DEPLOYED 2026-06-16, aliased lover-clinic-app.vercel.app, HTTP 200. firestore.rules UNCHANGED."
firestore_rules_version: "UNCHANGED (this batch = frontend-only). Last rules deploy = dup-customer prevention (be_customer_identity + be_recall_cases) 2026-06-16."
tests: "full vitest 16673/0 (+~65: 61 new mobile-reliability + 4 fix tests) + build clean + L1 Playwright 3/0 (live deployed build, iPhone-13) + L2 cold-start 7/0 (real prod, both transports)."
---

# Active — 2026-06-16 EOD+2 — Mobile-load reliability (✅ DEPLOYED + L1-verified LIVE)

## State
- master HEAD `d54d58c4` (=origin), tree clean. prod = `lover-clinic-p4uawr0kx` @ lover-clinic-app.vercel.app (HTTP 200).
- Adversarial bug-hunt LOOP **CONVERGED**: R1 (6-finder) → 1 race fixed; R2 → resetKey gap fixed; R3 → orphaned-timer (my own R2 fix) fixed; **R4 → 0 findings (clean)**.
- full vitest **16673/0** + build clean + **Rule Q L1 3/0 on the LIVE deployed build** + **Rule Q L2 7/0 real prod**.

## What shipped (`/brainstorming`→spec→`/writing-plans`→inline impl→adversarial hunt)
- **Connection layer (the big lever):** `firebase.js` `getFirestore`→`initializeFirestore({experimentalAutoDetectLongPolling:true})` — heals half-dead WebSocket on flaky mobile (no persistence, Q1 fresh-always).
- **Shared:** `firestoreReconnect.js` (module-debounced disableNetwork→enableNetwork) · `useResilientLoad.js` (loading/ready/error + 8s soft-timeout → 1 auto-retry → error; sync settledRef guard; resetKey re-arm) · `LoadErrorRetry.jsx` (error+retry card, theme-aware).
- **Wired:** App.jsx (V17→shared reconnect + resilient anon-auth gate = kills black-screen-forever) · PatientForm / ClinicSchedule / PatientDashboard (resilient load + error+retry escape; PatientDashboard retry-budget widened) · AdminDashboard (resilient queue banner, resetKey:selectedBranchId) · useBranchAwareListener (silent auto-heal for backend tabs) · BackendDashboard (Suspense chunk-load retry).
- Headline proof (captured live): half-dead Firestore that hung the OLD code forever now auto-recovers at 8s WITHOUT refresh (t3s กำลังโหลด → t10s resolved via reconnect→fromCache); blocked anon-auth → ลองใหม่ card instead of permanent black screen.

## Next action
- Idle / await next task. (USER hands-on optional: the staff-app AdminDashboard queue banner + backend-tab auto-heal aren't in the automated L1 — covered by unit + L2; verify in real use if desired.)

## Outstanding (carried)
- ⚠ ROTATE LINE/FB secrets (AV195).
- Pending chip: encode customer id in the LINE OA message URL (`task_1a3ac96c`).
- Honest gap (Rule Q): customer-link L1 (auth-gate + half-dead-firestore + normal) PROVEN on the live build. AdminDashboard queue banner + backend useBranchAwareListener auto-heal = unit + L2 proven; real-staff-browser hands-on optional. PatientDashboard `/api/patient-view` resilience = L2 (vite dev doesn't serve /api) + source; live behaviour same wiring.
