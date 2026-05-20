---
updated_at: "2026-05-20 EOD+5 — V108 SaleTab customer-name '-' fix (chokepoint + list resolver)"
status: "✅ V108 shipped local (13808 pass/0 fail/build clean); pushed; awaiting deploy"
branch: "master"
last_commit: "44e03f6e fix(V108): SaleTab customer name/HN '-' — write chokepoint + list resolver (AV100)"
tests: "13808 pass / 0 fail / 0 skip · build clean (2.77s)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "864ef9fd LIVE (V106 deployed) — V108 + session-end docs NOT deployed yet"
firestore_rules_version: "unchanged (V108 = UI/lib only — no rules/data)"
storage_rules_version: "unchanged (V106 stock-movements-archive already deployed)"
---

# Active Context

## State

- master = origin = `44e03f6e` (clean, pushed). Prod `864ef9fd` (V106 LIVE) — V108 awaiting one `vercel --prod` (UI/lib only, no rules).
- V108 fixes the SaleTab "การขาย/ใบเสร็จ" customer name/HN showing "-" for new sales + slow + not-real-time.
- Checkpoint: this active.md + SESSION_HANDOFF EOD+5 V108 block.

## What this session shipped (V108 — LOCAL, awaiting deploy)

- **V108 — SaleTab customer-name "-" fix** (`/systematic-debugging`, real-prod diag). Root cause (2 layers): (A write) TFP auto-sale resolved name from the `{patientData}` PROP not the `be_customers` doc → empty `customerName`/`customerHN` written (INV-20260520-0010 / LC-26000074); (B display) SaleTab's V105 list fallback was dead — `customers` loaded only on form-open, not list mount.
- **Fix A (chokepoint, root)**: `createBackendSale` resolves name/HN from `be_customers` when empty via `_resolveSaleCustomerIdentity` → protects all 7 callers (TFP×2, CustomerDetailView×3, SaleTab form, online-sale). Rule O / V102 lineage.
- **Fix B (display)**: eager-load `customers` on SaleTab mount + `loadOptions` load-only-missing (medProducts still loads) → V105 fallback resolves on the list. No prod data mutation.
- **AV100** + 8 source-grep regression + Rule Q L2 e2e (6/0 real prod) + Rule R diag + V21 fixup (sale-tab-buy-mapping A.4 deps). Full vitest 13800→**13808**/0; build clean.

## Next action

- **Deploy** `vercel --prod` (V108 + queued session-end docs; no rules change) when user says "deploy" (V18). Then optional /session-end.

## Outstanding user-triggered actions

- **Deploy** V108 — one `vercel --prod` (Vercel only; firestore/storage rules unchanged).
- **L1 hands-on** (real screen): open `tab=sales` → new sales show customer name + HN (not "-"), resolve promptly on list load. + V106 cron 03:30 BKK first drain + prior calendar-density/Recall.
