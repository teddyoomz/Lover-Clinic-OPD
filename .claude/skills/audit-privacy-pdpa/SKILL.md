---
name: audit-privacy-pdpa
description: "Audit Thai PDPA (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562) compliance: consent flags, audit logging for patient-data reads, data export/erasure rights, retention policies, breach logging. Required before Phase 9 marketing launches."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Privacy — Thai PDPA

PDPA is mandatory for any clinic holding health data in Thailand. Penalty: up to 5M THB per violation. 72h breach-notification clock. Marketing sends (Phase 9) require explicit opt-in.

## Invariants (PV1–PV7)

### PV1 — Consent flag for marketing
**Why**: cannot send promotional messages without recorded consent.
**Where**: `be_customers.consent.marketing` field.
**Current state**: likely absent. MUST add before Phase 9.

### PV2 — Consent flag for health data processing
**Why**: sensitive personal data (PDPA §26) requires explicit opt-in.
**Where**: `be_customers.consent.healthData`.

### PV3 — Audit log for patient-data reads
**Why**: PDPA §37 — data subjects can request access history.
**Current state**: absent. Minimum: log CustomerDetailView opens with (adminId, customerId, timestamp, fields accessed).
**Fix hint**: new collection `be_access_logs/{id}` + wrapper around `getCustomer`.

### PV4 — Data export (Right of Access)
**Why**: PDPA §30 — data subjects can request their full data.
**Fix hint**: endpoint that aggregates be_customers + be_treatments + be_sales + be_deposits + be_memberships + be_appointments for a given customerId, returns JSON.

### PV5 — Data deletion (Right to Erasure)
**Why**: PDPA §33.
**Fix hint**: ties into R11 (deleteCustomer cascade).

### PV6 — Retention policy — auto-delete old records
**Current state**: `chat_history` auto-deletes 7 days (CLAUDE.md rule 8). Good. Others?
**Check**: treatments older than X years? customer-inactive records? Document policy.

### PV7 — Breach logging
**Why**: PDPA §37 requires breach notification within 72 hours.
**Fix hint**: log failed auth attempts, unauthorized reads (security rules denials), session takeover signals.

## How to run
1. Grep `consent` in backendClient + customer model — currently likely zero matches.
2. Grep `be_access_logs|accessLog` — should exist or be scheduled.
3. Read Firebase Security Rules (firestore.rules) for deny logging.

## Priority
PV1–PV2 = Phase 9 hard requirement (cannot market without consent).
PV3–PV5 = legal exposure (data subjects can complain + fine).

## Important caveat
LoverClinic is Thai clinic on Firebase. Firebase doesn't offer a Business Associate Agreement equivalent to HIPAA. PDPA compliance is the app's responsibility end-to-end.
