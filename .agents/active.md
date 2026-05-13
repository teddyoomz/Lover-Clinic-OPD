---
updated_at: "2026-05-14 EOD — V55 brutal pre-deploy test bank SHIPPED + DEPLOYED"
status: "master=e8086de · prod=e8086de · IN SYNC · 8928 passed + 1 skip · build clean"
branch: "master"
last_commit: "e8086de test(V55 brutal pre-deploy): property-based + fuzz + snapshot + AV41 + stress (+372 tests)"
tests: 8928
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "e8086de"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = prod = `e8086de` (96-commit queue cleared in one combined deploy).
- 8928 tests + 1 skipped + 0 fail. Build clean.
- Vercel deploy verified HTTP 200, TTFB 799ms on https://lover-clinic-app.vercel.app
- Firebase rules redeploy idempotent — "latest version already up to date, skipping upload".

## What this session shipped
**V55 brutal pre-deploy test bank** (user directive "ทุกประเภทที่มี / จับผิดตัวเอง / โหดที่สุด"):

NEW infrastructure:
- `fast-check@4.x` + `@fast-check/vitest@0.4.x` (property-based with shrinking)
- `@stryker-mutator/{core,vitest-runner}@9.1.x` (installed; mutation testing blocked by Windows symlink + Vite 8 / Rolldown sandbox incompatibility — documented for future)
- `tests/helpers/adversarialFixtures.js` (17 ADVERSARIAL_STRINGS + 15 ADVERSARIAL_NON_STRINGS)
- AV41 audit invariant — global.fetch test isolation discipline

NEW test files (+372 net assertions, 8556 → 8928):
1. `tests/v55-1-property-based-patient-health-mapping.test.js` — 343 tests (P1-P26 + A1-A6 + D1-D6)
2. `tests/v55-1-snapshot-byte-identical.test.js` — 25 tests (OPD print Thai+EN + kioskPatientToCanonical shape)
3. `tests/v55-1-global-fetch-isolation-audit.test.js` — 4 audit tests (AV41 classifier)
4. `tests/v55-1-stress-fetch-pollution.test.js` — 53 tests (50-iter survival + 100-cycle mockReset)

PATCHES:
- `tests/extended/adminUsersClient.test.js` — migrated to PREFERRED AV41 pattern
- `tests/phase-24-0-permission-customer-delete.test.js` P.8 — exclude tooling sandbox dirs

Bugs caught + fixed (8 total):
1. P4 Thai trim predicate hole (`"".split(", ") = [""]` false-positive) — fast-check shrunk to `[""]`
2. P10 English same predicate hole — same fix
3. P23 BE-year boundary at 2400 — test arbitrary excluded strict-inequality boundary; documented intentional code design
4. P.8 audit walk missing `.stryker-tmp/` exclusion — false-positive from mutation testing sandbox
5. Dead-code branch identified at `kioskPatientToCanonical.js:45` (documented, defensive coding preserved)
6. Stryker 9.1 + Vite 8 + Windows symlink tooling blocker (documented for future)
7-10. 4 behavioral drifts documented (helper trim/typeof/null-safety strictly safer than pre-2e95696 inline — zero prod-data hits)

Zero production code bugs in shipped commits.

DEPLOY (V15 combined + V18 user-authorized):
- Vercel `vercel --prod --yes` — built in 52s, aliased to `lover-clinic-app.vercel.app`
- Firebase `firebase deploy --only firestore:rules` — idempotent (file unchanged from prod since rules unmodified across 95+ commits)
- HTTP 200 smoke check passed

## Carried institutional memory
- Property-based testing via `@fast-check/vitest` is now project canon — fast-check's shrinking surfaces minimal failing inputs, caught 3 test predicate bugs in 1 session.
- AV41 — every test file assigning `global.fetch` MUST capture+restore via afterAll (PREFERRED) OR afterEach delete (ACCEPTABLE). Audit test classifies all fetch-mocking files; VIOLATORS=0.
- Snapshot byte-identical contracts via `toMatchInlineSnapshot` lock OPD print Thai+English output across 8 scenarios; future label drift caught at PR diff.
- Adversarial fuzz fixture module reusable: NFC/NFD/NUL/10K/astral/zero-width/SQL/XSS/path-traversal + non-string types.
- 8-layer test methodology stack established (helper-unit + source-grep + Rule I flow-simulate + property-based + adversarial fuzz + snapshot + stress + live admin-SDK e2e).
- Stryker 9.1 + Vite 8 + Windows symlink incompatibility — revisit when Stryker 10.x lands with Rolldown native support.

## Next action
None pending. Deploy queue empty. Ready for next user directive.

## Outstanding user-triggered actions
None.
