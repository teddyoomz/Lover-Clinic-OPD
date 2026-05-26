---
title: patient-link-cleanup-sweep (cron)
type: entity
date-created: 2026-05-26
date-updated: 2026-05-26
tags: [patient-link, cron, av135, empty-since, rule-m]
source-count: 1
---

# patient-link-cleanup-sweep (daily cron)

> Daily Vercel cron that auto-deletes a customer patient-link once it has been empty (no upcoming appt + no remaining course) for ≥ 30 days. `api/cron/patient-link-cleanup-sweep.js` (handler + exported `sweepPatientLinkCleanup`) — mirror of [opd-session-cleanup-sweep](#cross-references).

## Overview

Staff generate a `patientLinkToken` per customer (Customer Patient-Link feature, 2026-05-25). Stale links accumulate. This cron garbage-collects them via an **empty-since state machine**: stamp `patientLinkEmptySince` when a link is first observed empty → delete after a 30-day grace → clear the stamp if data returns (clock resets, so a customer finishing a course gets a fresh month before the link is reaped). "Delete" = clear the token (true delete, Q4=A); staff regenerate from CustomerDetailView. Goal: keep the active-link set from flooding the system.

## State machine (`decidePatientLinkCleanup`)

| Customer state | Action | Write patch |
|---|---|---|
| empty & no `patientLinkEmptySince` | stamp | `{ patientLinkEmptySince: now }` |
| empty & `now − emptySince ≥ 30d` | delete | `{ patientLinkToken: null, patientLinkEnabled: false, patientLinkEmptySince: null, patientLinkAutoDeleteReason, +AutoDeletedAt }` |
| empty & within grace | skip | — |
| has data & `emptySince` set | clear | `{ patientLinkEmptySince: null }` |
| has data & no `emptySince` | skip | — |

## Key facts / claims

- Schedule: `"30 21 * * *"` (04:30 BKK) in `vercel.json` crons[] — off-peak after the other daily sweeps. 9th cron in the registry.
- CRON_SECRET-gated · admin SDK · canonical `artifacts/{APP_ID}/public/data` paths (Rule M) · batch writes (chunk 450) · audit doc `be_admin_audit/patient-link-cleanup-sweep-<ts>-<rand>`.
- Query `be_customers where patientLinkEnabled == true`; **optimization** — usable courses are read locally from `doc.courses[]`, so the per-customer `be_appointments where customerId==` query fires only when courses are already empty.
- `isEmpty` + `decidePatientLinkCleanup` come from the shared [customerLinkPayloadCore](customer-link-payload-core.md) (AV135) — same definition as the public endpoint, so the cron never deletes a link the page would still show data for.
- `scripts/patient-link-cleanup-sweep.mjs` = Rule M dry-run/apply mirror (`--apply` to commit; dry-run is READ-ONLY). `scripts/diag-patient-link-empty-state.mjs` = Rule R diag (resolve a token → real-core isEmpty + UI box decision).
- AV135 forbids `batch.delete`/`deleteDoc` of the customer doc — it's a link cleanup (clear token), not a customer wipe; the cron uses `batch.update`.

## Verification (Rule Q-honest)

- L2 real-prod dry-run (2026-05-26): scanned 2 / skipped 2 / 0 deleted — both enabled links have data. Diag of the screenshot customer LC-26000023 (0 courses + 1 appt) → cron isEmpty=false → kept (no spurious delete).
- `--apply` runs daily once deployed; first manual apply is user-authorized (currently 0 would-delete, safe).

## Cross-references

- Entity: [customerLinkPayloadCore.js](customer-link-payload-core.md) (the shared decision core)
- Concept: [Patient-link lifecycle — hide-empty + auto-cleanup](../concepts/patient-link-lifecycle.md)
- Mirror of: `api/cron/opd-session-cleanup-sweep.js` (same CRON_SECRET + admin SDK + dry-run/apply + audit structure)
- Pattern: [Data ops via local + admin SDK (Rule M)](../concepts/data-ops-via-local-sdk.md)
- Source: [Patient-Link Hide-Empty + Auto-Cleanup design](../sources/patient-link-hide-empty-cleanup-design.md)

## History

- 2026-05-26 — Created. New daily cron + Rule M script mirror + Rule R diag. Empty-since state machine (Q3=A) + clear-token delete (Q4=A).
