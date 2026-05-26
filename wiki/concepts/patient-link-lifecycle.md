---
title: Patient-link lifecycle — hide-empty + auto-cleanup (AV135)
type: concept
date-created: 2026-05-26
date-updated: 2026-05-26
tags: [patient-link, customer-mode, cron, av135, lifecycle]
---

# Patient-link lifecycle — hide-empty + auto-cleanup

> The customer patient-link (`?patient=<token>`) shows only boxes with data, and stale links self-clean after 30 days empty. "What does this link show" is single-sourced so the display, the endpoint, and the cleanup cron all agree (AV135).

## Overview

A customer opens an anon link (no login) to see their upcoming appointments + remaining courses (Customer Patient-Link feature, 2026-05-25). Two lifecycle properties were added 2026-05-26:

1. **Display = data-only (customer-mode).** The page renders ONLY sections that have data. The empty "ไม่มีคอร์สคงเหลือ" box is hidden in `__customerMode`; the appointments box was already conditional; when there is nothing at all, a single subtle line "ยังไม่มีนัดหมายหรือคอร์สในขณะนี้" shows (Q2=B) rather than a bare or empty-box page. The admin/sync patient view KEEPS the empty boxes as feedback (Q1=A) — the hide is gated to `__customerMode` only.
2. **Auto-cleanup.** A daily cron deletes a link that has been empty (no upcoming appt + no remaining usable course) for ≥ 30 days, via an empty-since state machine. Staff regenerate from CustomerDetailView when a customer needs a link again. Keeps the active-link set from flooding the system.

## Key facts / claims

- **Single source for "empty"** ([customerLinkPayloadCore.js](../entities/customer-link-payload-core.md), AV135): `computeUsableCourses` / `isAppointmentUpcoming` / `isCustomerLinkEmpty` are consumed by BOTH `api/patient-view.js` (render payload) AND the [cleanup cron](../entities/patient-link-cleanup-cron.md). They cannot drift — the cron will never delete a link the page would still show data for.
- **Customer-mode gate** (`src/pages/PatientDashboard.jsx`): `isCustomerMode = !!sessionData?.__customerMode`; empty courses box renders `{!isCustomerMode && courses.length === 0 && ...}`; subtle line renders `{isCustomerMode && appointments.length === 0 && courses.length === 0 && expiredCourses.length === 0 && ...}`.
- **Empty-since state machine** ([decidePatientLinkCleanup](../entities/patient-link-cleanup-cron.md)): stamp `patientLinkEmptySince` on first-empty → delete (clear token + disable) after 30d → clear the stamp when data returns (clock resets). Delete = clear token (Q4=A true delete); the customer then sees the existing "ไม่พบข้อมูล" 404.
- **Expired courses ≠ remaining.** `isCustomerLinkEmpty` ignores the expired bucket — an expired-only customer is "empty" and eligible for cleanup (flagged decision; reverse by requiring `expired.length===0` if undesired).
- **No rules/index change** → no Probe-Deploy-Probe. `be_appointments where customerId==` already used by the endpoint; the admin-SDK cron bypasses rules.

## Cross-references

- Entity: [customerLinkPayloadCore.js](../entities/customer-link-payload-core.md) · [patient-link-cleanup-sweep cron](../entities/patient-link-cleanup-cron.md)
- Source: [Patient-Link Hide-Empty + Auto-Cleanup design](../sources/patient-link-hide-empty-cleanup-design.md)
- Built on: Customer Patient-Link feature (2026-05-25 — AV126 anon-safety, AV127 used-up-course filter, AV128 completed-appt exclusion). The F6.6/F7.3/E10 class-of-bug locks from AV127/AV128 now follow the core extraction (core gates for the endpoint; PatientDashboard's ProClinic-sync path still gates inline).
- Pattern: [Data ops via local + admin SDK (Rule M)](data-ops-via-local-sdk.md) · same single-source-pure-filter shape as [skip-stock-hide-from-balance](skip-stock-hide-from-balance.md).

## History

- 2026-05-26 — Created during the patient-link hide-empty + auto-cleanup ingest (AV135). Shipped local `269010c9`; awaiting deploy + user visual L1.
