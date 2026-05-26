---
title: Patient-Link Hide-Empty + Auto-Cleanup — design + plan
type: source
date-created: 2026-05-26
date-updated: 2026-05-26
tags: [patient-link, customer-mode, cron, av135, ui]
---

# Patient-Link Hide-Empty Boxes + Auto-Cleanup of Stale Links

> Spec + 7-task plan for two changes to the customer patient-link page (`?patient=<token>`): (1) show only boxes that have data in customer-mode, (2) a daily cron that auto-deletes a link empty for ≥ 30 days. Shipped LOCAL 2026-05-26 EOD+5 (master `269010c9`), not yet deployed.

## Overview

User report (with the screenshot of `?patient=3cc66f7e…`): the customer link page rendered an ugly empty-state box *"ไม่มีคอร์สคงเหลือ"* when a customer had no remaining courses. Directive: show only boxes with data — hide the empty courses box (the appointments box already hides when empty), and auto-delete links that have shown nothing useful for over a month so they don't flood the system (staff regenerate from CustomerDetailView when needed).

Brainstormed Q1-Q4 (AskUserQuestion previews, Rule S — no live browser at ask/plan). Decisions locked:

- **Q1 = A** — hide empty boxes in the **customer link view only** (`__customerMode`); keep them as feedback in the admin/sync view.
- **Q2 = B** — when a customer has nothing at all → one subtle line *"ยังไม่มีนัดหมายหรือคอร์สในขณะนี้"* (not a bare page — the mockup showed bare looks broken).
- **Q3 = A** — empty-since tracking: stamp on first-empty, delete after 30 days empty, reset clock if data returns.
- **Q4 = A** — "delete" = clear the token (true delete); customer sees the existing "ไม่พบข้อมูล"; staff regenerate.

## Key facts / claims

- The empty courses box lives at `src/pages/PatientDashboard.jsx:914-919`; the appointments box was already conditional at `:882`.
- "What does this link show" was inline in `api/patient-view.js:85-109`; extracted to a shared pure core ([customer-link-payload-core](../entities/customer-link-payload-core.md)) so the endpoint AND the cron compute "empty" identically (AV135 / Rule of 3).
- Expired courses do NOT count as "คอร์สคงเหลือ" → they do not keep a link alive (flagged decision in the spec).
- No firestore.rules / composite-index change (`be_appointments where customerId==` already used by the endpoint; admin-SDK cron bypasses rules) → no Probe-Deploy-Probe.

## Cross-references

- Concept: [Patient-link lifecycle — hide-empty + auto-cleanup](../concepts/patient-link-lifecycle.md)
- Entity: [customerLinkPayloadCore.js](../entities/customer-link-payload-core.md) · [patient-link-cleanup-sweep cron](../entities/patient-link-cleanup-cron.md)
- Built on: Customer Patient-Link feature (2026-05-25, AV126/AV127/AV128 — `api/patient-view.js` + `__customerMode` PatientDashboard)
- Spec (full HTML): `docs/superpowers/specs/2026-05-26-patient-link-hide-empty-boxes-auto-cleanup-design.html`
- Plan (full HTML): `docs/superpowers/plans/2026-05-26-patient-link-hide-empty-boxes-auto-cleanup.html`

## History

- 2026-05-26 — Created during the patient-link hide-empty + auto-cleanup ingest (AV135). Shipped local, awaiting deploy.
