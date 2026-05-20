---
updated_at: "2026-05-20 EOD+5 — V108 SaleTab customer-name '-' fix DEPLOYED"
status: "✅ V108 DEPLOYED (13808 pass/0 fail/build clean); prod LIVE"
branch: "master"
last_commit: "853c746a docs(agents): V108 state + V-entry"
tests: "13808 pass / 0 fail / 0 skip · build clean (2.77s)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "853c746a LIVE — V108 deployed 2026-05-20 (Vercel canonical, root 200)"
firestore_rules_version: "unchanged"
storage_rules_version: "unchanged (V106 archive rule already live)"
---

# Active Context

## State

- master = origin = prod = `853c746a` (clean, pushed, **V108 DEPLOYED** 2026-05-20 — Vercel canonical, root 200; Vercel-only, no rules).
- V108 fixed the SaleTab "การขาย/ใบเสร็จ" customer name/HN showing "-" for new sales + slow + not-real-time.
- V106 stock-movement retention cron also live (03:30 BKK daily; first backlog drain on next scheduled fire).

## What this session shipped (DEPLOYED)

- **V108 — SaleTab customer-name "-" fix** (`/systematic-debugging`, real-prod diag). Root cause (2 layers): (A write) TFP auto-sale resolved name from the `{patientData}` PROP not the `be_customers` doc → empty `customerName`/`customerHN` (INV-20260520-0010 / LC-26000074); (B display) SaleTab's V105 list fallback was dead — `customers` loaded only on form-open.
- **Fix A (chokepoint, root)**: `createBackendSale` resolves name/HN from `be_customers` when empty via `_resolveSaleCustomerIdentity` → protects all 7 callers (TFP×2, CustomerDetailView×3, SaleTab form, online-sale). Rule O / V102 lineage.
- **Fix B (display)**: eager-load `customers` on SaleTab mount + `loadOptions` load-only-missing. V105 fallback now resolves on the list. No prod data mutation.
- **AV100** + 8 source-grep regression + Rule Q L2 e2e (6/0 real prod) + Rule R diag + V21 fixup (sale-tab-buy-mapping A.4). Full vitest **13808/0**; build clean. Earlier (this session): V106 stock-movement retention shipped + deployed.

## Next action

- idle — V108 live. L1 hands-on (tab=sales names) when convenient, or next task.

## Outstanding user-triggered actions

- **L1 hands-on** (real screen): open `tab=sales` → new sales show customer name + HN (not "-"), resolve promptly on list load. + V106 cron 03:30 BKK first drain + prior calendar-density/Recall.
