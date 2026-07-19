---
name: audit-api-layer
description: "Audit Vercel serverless /api/proclinic/* and /api/webhook/* for updateMask, idempotency, 429 retry, credential hygiene, timeout, CORS. Use before any API change or before Phase 9 marketing webhooks."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit API Layer

> **⚠️ RESCOPED (V50, 2026-05-08 — noted at audit-all 2026-07-19)**: `api/proclinic/**` was
> DELETED in the V50 strip; webhooks migrated from unauth Firestore REST to the firebase-admin
> SDK (V32-tris-ter-fix). The LIVE api surface is now `api/webhook/**` + `api/admin/**` +
> `api/cron/**` + `api/patient-view`. A1/A2/A3/A5/A6/A7 (proclinic REST/updateMask/429) pass
> vacuously; the still-live invariants are A4 (credential hygiene in logs — verify_token masked
> 2026-07-19), A8 (CORS/method gates), A9 (no hardcoded secrets). `api/admin/**` depth is covered
> by /audit-firebase-admin-security (FA1-FA12).

Vercel serverless endpoints that proxy ProClinic + Facebook/LINE webhooks. Subtle bugs here can wipe Firestore fields, double-create records, or leak credentials.

## Invariants (A1–A9)

### A1 — Every `firestorePatch` includes `updateMask.fieldPaths`
**Why**: CLAUDE.md rule 7 — without mask, PATCH overwrites entire doc, silently wiping other fields. Catastrophic.
**Where**: `api/proclinic/_lib/session.js`, `api/webhook/*.js`
**Grep**: `firestorePatch\\(|PATCH.*documents` in api/
**Expected count**: every call has `updateMask=X&updateMask=Y` in URL.

### A2 — Idempotency key on mutating POSTs
**Why**: duplicate click or retry → duplicate customer/deposit/treatment/appointment. Critical for Phase 9 marketing webhooks.
**Targets**: `/api/proclinic/customer`, `/deposit`, `/treatment`, `/appointment`.
**Check**: either client passes `Idempotency-Key` header, or server dedupes by natural key (HN+timestamp).

### A3 — 429 rate-limit retry with exponential backoff
**Why**: CLAUDE.md rule 5 — ProClinic/Vercel rate limit. Client must back off.
**Grep**: `429|rate[-_ ]?limit|Retry-After` handling in `brokerClient.js` + `api/_lib/`.

### A4 — Credentials never logged
**Grep**: `console.log|console.error` near `password|PROCLINIC_PASSWORD|cookie|session` in api/

### A5 — Session expiry handled cleanly (re-login vs 401 loop)
**Where**: `api/proclinic/_lib/session.js` + `connection.js`

### A6 — Response validation before Firestore write
**Why**: if ProClinic returns junk/error HTML, we shouldn't cascade-write it.
**Check**: every `fetch` result is JSON-parsed + shape-validated before persistence.

### A7 — Fetch timeout
**Why**: hanging promise = Vercel function hanging = cost blowup.
**Grep**: `fetch(` in api/ — each with AbortController or timeout.

### A8 — CORS / origin guard on serverless endpoints
**Check**: api endpoints restrict to known origins.

### A9 — Secrets only from `process.env`
**Grep**: hard-coded credentials in api/ — should be zero.

## How to run
1. `ls api/proclinic/` + `ls api/webhook/` to catalog endpoints.
2. For each endpoint, Read + grep for each pattern.
3. Flag every bare PATCH without updateMask as CRITICAL.

## Report format standard.

## Priority
A1 (updateMask) = field-wipe class. A2 (idempotency) = duplicate-record class. A4 (credential leak) = security class.
