# Session 2026-05-20 EOD+5 — V108 SaleTab customer-name "-" fix (DEPLOYED)

## Summary

`/systematic-debugging` on user report: การขาย/ใบเสร็จ (SaleTab) list loads customer name/HN slowly + new sales always show "-" + not real-time (screenshot INV-20260520-0010 = "-"). Root cause found via real-prod diag (Rule R): a 2-layer V105-class bug. Fixed at the write chokepoint + the display load. Shipped, verified (13808/0 + Rule Q L2 6/0), and DEPLOYED.

## Current State

- master = origin = `ec54e310` (clean, pushed). Prod = `853c746a` LIVE — **V108 DEPLOYED** 2026-05-20 (Vercel canonical `https://lover-clinic-app.vercel.app`, root 200). `ec54e310` = post-deploy state docs (harmless docs-ahead).
- Full vitest **13808 pass / 0 fail / 0 skip**; build clean 2.77s.
- V108 = Vercel-only (no firestore/storage rules → no Probe-Deploy-Probe). V106 stock-retention cron also live (03:30 BKK daily).

## Root cause (real-prod diag — 2 layers, V105-class)

- **(A write, root)** TFP auto-sale `TreatmentFormPage.jsx:2746` resolved the name from the `{patientData}` PROP, NOT the authoritative `be_customers` doc → empty `customerName`/`customerHN` for LC-26000074 → `clean()` stripped → INV-20260520-0010 wrote empty.
- **(B display)** SaleTab's V105 list fallback (`customers.find`) was DEAD on the list view — `customers` loaded ONLY in `loadOptions` (form-open), never on list mount. Diag: all 9 recent customers resolve via `resolveCustomerDisplayName` — data existed; write+display didn't use it.

## Decisions / fix (1-line each)

- **Fix A (chokepoint, Rule P)**: `createBackendSale` resolves name/HN from `be_customers` when empty via `_resolveSaleCustomerIdentity` (set after the `_normalizeSaleData` spread → resolved wins) → ALL 7 callers protected (TFP×2 / CustomerDetailView×3 / SaleTab form / online-sale). Rule O / V102 resolve-at-writer lineage.
- **Fix B (display)**: eager-load `customers` on SaleTab mount (mirror sellers eager-load) + `loadOptions` refactored load-only-missing (so `medProducts` still loads). No prod data mutation.
- **Deferred**: full real-time sale-list listener (`listenToAllSales` caps at 365d → would hide older sales; "real-time name" pain solved by A+B).
- **AV100** invariant codified; sanctioned exceptions: NONE (all sale writes flow the chokepoint).

## Commits (this V108 cycle, oldest first)

```
44e03f6e fix(V108): SaleTab customer name/HN "-" — write chokepoint + list resolver (AV100)
853c746a docs(agents): V108 state + V-entry (AV100, Rule P Tier 3)
ec54e310 docs(agents): V108 DEPLOYED 2026-05-20 (Vercel canonical, root 200)
```

## Files Touched (names only)

MOD src: `src/lib/backendClient.js` (import resolveCustomerDisplayName/HN + `_resolveSaleCustomerIdentity` + createBackendSale) · `src/components/backend/SaleTab.jsx` (eager customers mount effect + loadOptions load-only-missing).
MOD skill: `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV100).
NEW tests: `tests/v108-sale-customer-name-chokepoint.test.js` (8). V21 fixup: `tests/sale-tab-buy-mapping.test.js` A.4.
NEW scripts: `scripts/e2e-v108-sale-customer-name.mjs` (Rule Q L2) · `scripts/diag-sale-customer-name.mjs` (Rule R).

## Verification

- AV100 + 8 source-grep regression PASS.
- **Rule Q L2 e2e 6/0 on real prod**: chokepoint resolves the INV-0010 shape, preserves non-empty caller value, victim LC-26000074 resolves.
- Full vitest 13800→**13808 / 0** (caught + fixed a real V21 regression — sale-tab-buy-mapping A.4 deps — instead of dismissing the 1 full-suite fail as a flake; Rule Q V66 discipline).
- L1 (list visual on real screen) = user-pending.

## Lessons

- **Resolve-at-writer chokepoint** protects N callers with ONE guard (Rule O / V102 family) — patching each of 7 callers would be V12-fragile.
- **A display fallback is only as good as the lookup it depends on** — V105's list fallback was correct code but inert because `customers` was never loaded in the list context. Verify a fallback's data source is populated where it runs.
- **Investigate the 1 fail, don't assume flake** — the rtk summary hid the failing test; json-report + PowerShell parse exposed a real V21 regression.
- **`firebase deploy --only storage:rules` fails in CLI 15.x** (carry-over from V106) — use `--only storage`.

## Next Todo

1. **L1 hands-on**: open `tab=sales` → new sales show customer name + HN (not "-"), resolve promptly.
2. V106 cron 03:30 BKK first backlog drain (observe / curl + CRON_SECRET).
3. Prior L1: calendar-density + Recall enhancements.

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-20 EOD+5.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=ec54e310, prod=853c746a LIVE)
3. .agents/active.md (13808 pass / 0 fail)
4. .claude/rules/00-session-start.md (iron-clad + V-summary; V108 row at top)
5. .agents/sessions/2026-05-20-v108-sale-customer-name.md

Status: master=ec54e310, 13808 pass / 0 fail, prod=853c746a LIVE (V108 + V106 deployed)
Next: idle — L1 hands-on (tab=sales names · V106 cron drain · calendar-density · Recall) OR next task
Outstanding (user-triggered): L1 hands-on only — all code shipped + deployed
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (storage = `--only storage`); Rule Q V66 L1/L2 before "verified"; design→Visual Companion from question stage; plans=HTML mockup+flow
/session-start
```
