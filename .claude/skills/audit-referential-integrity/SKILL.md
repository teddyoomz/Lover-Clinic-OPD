---
name: audit-referential-integrity
description: "Audit foreign-key consistency and orphan detection across Firestore collections. Firestore has no FK enforcement — this skill checks every cross-doc reference stays resolvable. Use before releases, after schema changes, or when tracing ghost-doc bugs."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Referential Integrity

Firestore has no FK constraints. Every `customerId`, `productId`, `batchId`, `saleId`, etc. is just a string — if the referenced doc is deleted, the reference becomes a ghost. This skill catches those.

## Invariants (R1–R11)

### R1 — Every `be_sales.customerId` resolves
**Where**: `src/lib/backendClient.js` createBackendSale
**Grep**: `customerId:` in salesCol writes
**Check**: No writer accepts empty/null customerId; no caller passes stale ID

### R2 — Every `be_treatments.customerId` resolves
**Where**: `src/components/TreatmentFormPage.jsx` + backendClient.createBackendTreatment
**Check**: same

### R3 — Every `be_appointments.customerId` resolves
**Where**: `src/components/backend/AppointmentTab.jsx` + createBackendAppointment

### R4 — Every `be_deposits/be_customer_wallets/be_memberships.customerId` resolves
**Where**: backendClient CRUD for each

### R5 — Every `sale.items[].productId` resolves to `master_data/products/items/{id}`
**Why**: admin deletes product → existing sales point to ghost
**Grep**: `items[].productId` writers
**Check**: Does `deleteMasterItem` cascade-warn? (Currently NO — see bug #8 in scan)

### R6 — Every `sale.items[].courseId` resolves AND matches name+product
**Why**: course dedup bug — raw index unsafe (CLAUDE.md bug #2)

### R7 — Every `treatment.doctorId`, `appointment.doctorId`, `sale.sellerId[]` resolves to master_data/staff or /doctors
**Grep**: `doctorId|staffId|sellerId` writes

### R8 — Every `be_stock_movements.batchId` resolves to `be_stock_batches/{id}`
**Check**: No dangling movements; batch never hard-deleted (soft status=cancelled only per S14)

### R9 — Every transfer/withdrawal `sourceLocationId`/`destinationLocationId` resolves to a branch or central warehouse
**Grep**: `sourceLocationId|destinationLocationId` in transfers/withdrawals

### R10 — Every `wallet_tx.walletId` and `point_tx.customerId` resolves
**Check**: walletTxDoc + pointTxDoc references valid

### R11 — No `deleteCustomer` without cascade — PROBABLE VIOLATION
**Why**: Dropping a customer while they have active sales/treatments/deposits = orphan everything
**Current state**: `deleteCustomer` function does NOT exist in `backendClient.js`. Verify no component calls a hard-delete. If added in Phase 9+, MUST cascade to treatments, sales, deposits, wallets, memberships, appointments, courses, stock-movements linked to their sales.

## How to run
1. For each invariant, grep the write site.
2. Confirm the reference value comes from a validated source (not free-form string).
3. For R5/R7/R8, sample Firestore collections and cross-check (dev session): fetch 10 recent sales → for each `items[].productId`, getDoc on master product → flag missing.
4. For R11, grep `deleteDoc.*customerDoc` in entire src/ — should be zero.

## Report format
Severity: **CRITICAL** = ghost refs can exist in production. **HIGH** = possible under rare conditions. **WARN** = no guard but never observed. Use standard table output.

## Why this matters
MOPH audit, customer-data deletion requests, financial reconciliation. Ghost refs break all three.
