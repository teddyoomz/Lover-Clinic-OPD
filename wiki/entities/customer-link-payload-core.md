---
title: customerLinkPayloadCore.js
type: entity
date-created: 2026-05-26
date-updated: 2026-05-26
tags: [patient-link, pure-core, av135, rule-of-3]
source-count: 1
---

# customerLinkPayloadCore.js

> Pure, firebase-free SSOT for "what does the customer patient-link show" + the auto-cleanup decision. Single source consumed by the public endpoint AND the cleanup cron so they can never drift (AV135 / Rule of 3). `src/lib/customerLinkPayloadCore.js`.

## Overview

The customer patient-link (`?patient=<token>`) renders a course list + an appointment list. The logic for "which courses are usable remaining" + "which appointments are upcoming" + "is this link empty" used to be inline in [api/patient-view.js](#cross-references) (`:85-109`). It now lives here so the **same** definition of "empty" drives both the render payload (endpoint) and the auto-delete decision ([cron](patient-link-cleanup-cron.md)). Pure JS — no firebase imports — fully unit-testable.

## API surface

| Export | Signature | Purpose |
|---|---|---|
| `PATIENT_LINK_EMPTY_GRACE_MS` | const `30 * 24 * 60 * 60 * 1000` | 30-day grace before a stale link is deleted. |
| `isUsableActiveCourse(c)` | `(course) → boolean` | Effective status === ACTIVE (`src/lib/customerLinkPayloadCore.js`). buffet (total 0, remaining>0) kept; finite depleted dropped. |
| `computeUsableCourses(courses, todayISO)` | `→ { remaining, expired }` | Usable courses split by `expiryDate` vs `todayISO`. |
| `isAppointmentUpcoming(a, todayISO)` | `(appt, today) → boolean` | future-or-today date · not cancelled · not serviced/attended (COMPLETED_APPT_STATUSES + serviceCompletedAt/wasServiceCompleted). |
| `isCustomerLinkEmpty({courses, appointments, todayISO})` | `→ boolean` | No usable non-expired course AND no upcoming appt. **Expired courses do NOT count.** |
| `decidePatientLinkCleanup(customer, isEmpty, now, graceMs?)` | `→ { action: 'stamp'\|'clear'\|'delete'\|'skip', patch }` | Empty-since state machine (see [lifecycle concept](../concepts/patient-link-lifecycle.md)). |

## Key facts / claims

- Reuses `parseQtyString` ([courseUtils.js](../../src/lib/courseUtils.js)) + `parseStatusFromCourse` / `deriveEffectiveStatus` / `STATUS_ACTIVE` ([remainingCourseUtils.js](../../src/lib/remainingCourseUtils.js)) — the SAME effective-status logic as `RemainingCourseTab` + `lineBotResponder.formatCoursesReply` (V33.8). Course "qty" string format is `"remaining / total unit"`.
- `decidePatientLinkCleanup` 'delete' patch = `{ patientLinkToken: null, patientLinkEnabled: false, patientLinkEmptySince: null, patientLinkAutoDeleteReason: 'stale-empty-30d' }` — a **clear-token true-delete** (Q4=A); the cron adds `patientLinkAutoDeletedAt` (serverTimestamp) — the pure core carries no serverTimestamp.
- AV135 forbids re-inlining the usable-course / upcoming-appt filter in the endpoint or cron; the core is the only place that logic lives. Source-grep regression in `tests/patient-link-cleanup-and-hide-empty.test.js` (F1-F8).

## Cross-references

- Concept: [Patient-link lifecycle — hide-empty + auto-cleanup](../concepts/patient-link-lifecycle.md)
- Consumed by: `api/patient-view.js` (computeUsableCourses + isAppointmentUpcoming) · [patient-link-cleanup-sweep cron](patient-link-cleanup-cron.md) (isCustomerLinkEmpty + decidePatientLinkCleanup) · `scripts/patient-link-cleanup-sweep.mjs` · `scripts/diag-patient-link-empty-state.mjs`
- Source: [Patient-Link Hide-Empty + Auto-Cleanup design](../sources/patient-link-hide-empty-cleanup-design.md)
- Same effective-status family: [skip-stock-filter](skip-stock-filter.md) (another branch-agnostic pure single-source filter, Rule O lineage).

## History

- 2026-05-26 — Created. Extracted from `api/patient-view.js:85-109` (behavior-preserving) so the endpoint + cleanup cron agree on "empty" (AV135).
