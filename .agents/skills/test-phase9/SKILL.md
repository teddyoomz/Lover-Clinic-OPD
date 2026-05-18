---
name: test-phase9
description: Run all Phase 9 Marketing (promotion/coupon/voucher/migration/scraper) tests and report. 300+ adversarial scenarios covering validators (type safety + boundary + malformed input), pure mappers (shape preservation + idempotency), HTML scrapers (cheerio resilience + entity scoping + dedup), and sub-items preservation. Use before any Phase 9 release or after any edit to src/lib/{promotion,coupon,voucher}Validation.js, src/lib/phase9Mappers.js, src/components/backend/{Promotion,Coupon,Voucher}{Tab,FormModal}.jsx, or api/proclinic/master.js coupon/voucher handlers.
user-invocable: true
allowed-tools: "Bash"
---

# Test Phase 9 — comprehensive suite runner

Runs all 8 Phase 9 test files in one shot and reports pass/fail counts per file. Fails loudly on any regression so you can't ship broken code.

## Scope

8 test files / 300+ scenarios:

| File | Scenarios | Covers |
|---|---|---|
| `tests/promotion.test.js` | 14 | baseline validator V1..V12 + emptyForm |
| `tests/coupon.test.js` | 13 | baseline validator CV1..CV10 + COUPON_BRANCHES |
| `tests/voucher.test.js` | 14 | baseline validator VV1..VV10 + VOUCHER_PLATFORMS |
| `tests/phase9-promotion-scenarios.test.js` | 80 | P1-P15 name, SP1-SP15 price, FX1-FX20 flexible bounds, PD1-PD15 period, MF1-MF15 malformed |
| `tests/phase9-coupon-scenarios.test.js` | 60 | CN/CC/CD/CQ/CT/CB — name+code+discount+qty+dates+branches |
| `tests/phase9-voucher-scenarios.test.js` | 50 | VN/VP/VC/VPL/VT — name+price+commission+platform+period |
| `tests/phase9-migration-mappers.test.js` | 40 | MP/MC/MV — shape preservation + nested products + idempotency |
| `tests/phase9-sync-scraper.test.js` | 30 | S1-S15 coupon patterns, V1-V10 voucher, R1-R5 resilience |

## Command

```bash
cd F:/LoverClinic-app && npm test -- --run \
  tests/promotion.test.js \
  tests/coupon.test.js \
  tests/voucher.test.js \
  tests/phase9-promotion-scenarios.test.js \
  tests/phase9-coupon-scenarios.test.js \
  tests/phase9-voucher-scenarios.test.js \
  tests/phase9-migration-mappers.test.js \
  tests/phase9-sync-scraper.test.js
```

## Expected output

```
 Test Files  8 passed (8)
      Tests  301 passed (301)
```

Any file fail or test regression = P0 blocker. Do not deploy until green.

## When to run

- Before any commit that touches Phase 9 source files
- As part of `/audit-all` for release readiness
- After pulling Phase 9-related changes from another branch

## Integration with continuous improvement (iron-clad D)

When a new Phase 9 bug surfaces in production:
1. Add an adversarial test to the matching scenarios file (or create a new one if scope warrants)
2. Re-run this skill — new test must fire, catch the bug, then fix drops it
3. Commit new test + fix in the same PR
4. This skill's scenario count keeps growing over time — that's the goal
