---
updated_at: "2026-07-07 (cont.) — link-patient LCP fix (AV204) SHIPPED local, committed+pushed. NOT deployed."
status: "COMMITTED+PUSHED. full vitest 17302/17302 · 0 fail. Awaiting explicit 'deploy' (V18) + user L1."
branch: "master"
last_commit: "perf(link-patient): LCP 3780->2040ms (-46%) — entry-time early fetch (AV204)"
tests: "full vitest 17302/17302 · 0 fail (final clean run). Build clean. Reuse these counts — do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "perf campaign head (2026-07-07) — the link-patient fix is 1 commit AHEAD of prod"
firestore_rules_version: "UNCHANGED → next deploy is frontend+api only, NO Probe-Deploy-Probe"
---

# Active — 2026-07-07 (cont.) — link-patient LCP 4.3s deferred item DONE

## What shipped (1 commit ahead of prod)
- **LCP 3780 → 2040ms (−46%)** measured median-of-3 vs REAL prod API (new NARROW `/api/patient-view`
  vite dev/preview proxy makes the surface measurable/devable locally for the first time).
- Root cause: /api/patient-view (plain token GET, no auth/settings needed) waited behind
  anon-auth gate → lazy chunk → clinicSettingsLoaded (~1.2-1.8s dead serial before a 1.3-3.5s call).
- Fix: NEW `src/lib/patientViewEarlyFetch.js` consume-once slot started in main.jsx; PatientDashboard
  consumes it once (token-guarded) inside the UNCHANGED 3×600ms retry loop; endpoint branch-gets
  parallelized (Promise.all — payload byte-identical, `scripts/diag-patient-view-l2.mjs`).
- **NO warm chunk import** — adversarial review: failed entry-time module fetch poisons the module
  map (iOS Safari) → React.lazy black screen. Dropped; LCP unaffected (API-bound).

## Verification (exhaustive pass per user directive)
- 17 new locks `tests/perf-link-patient-early-fetch.test.js` + full vitest 17302/0 + build clean.
- Rule Q L1 real-browser matrix **24/24**: single request · total-failure→retry-UI→manual-retry
  recovers · 12s-slow-first soft-timeout auto-retry recovers · late stale response harmless ·
  bad-token 404 · empty-token zero requests · admin=1/EN/theme/mobile-375 · root+filler+session-link
  regression clean · entry 29.8KB, PatientDashboard stays lazy un-preloaded.
- Pixel parity loaded-vs-loaded 0.010%/0.011% both themes. L2 payload-identical vs live.
- 2-agent adversarial review (ultracode, ≤4-agent cap honored): 2 findings, BOTH fixed
  (warm-import poisoning removed · B6 proxy lock made structural).

## Next action
- **Awaiting explicit "deploy"** — ships the client fix + the endpoint branch-parallel to prod
  (frontend+api only, rules unchanged → no Probe-Deploy-Probe). Post-deploy: re-run
  `node scripts/diag-patient-view-l2.mjs` (payload check) + optional
  `node scripts/perf-baseline.mjs --run after-lcpfix --target prod --surface link-patient`.
- User L1: เปิดลิงก์ ?patient= จริงจากมือถือ — เร็วขึ้นชัดเจน + หน้าตาเหมือนเดิม.
- Residual (user call, documented in punchlist): endpoint COLD start ~3.5s — warmup ping or
  admin-SDK preferRest could trim; deliberately not done (blast radius vs rare-cold gain).

## Outstanding user-triggered actions
- "deploy" (V18) — 1 commit ahead of prod.
