---
title: Tablet Chart Editor — design spec + plan
type: source
date-created: 2026-05-21
date-updated: 2026-05-21
tags: [tablet, chart, spec, plan, relay]
---

# Tablet Chart Editor — design spec + plan

> Summary + link. The full HTML spec lives at `docs/superpowers/specs/2026-05-20-tablet-chart-editor-design.html` and the 11-task plan at `docs/superpowers/plans/2026-05-20-tablet-chart-editor.html` (both contain Mockup + Flow sections per the HTML-plan directive).

## What it specifies

A tablet (iPad/Android + Apple Pencil/stylus) standby page (`?tablet=chart`) that a PC's TreatmentFormPage triggers remotely to annotate a chart-template image full-screen, saving straight back to the patient's `charts[]`.

## Locked decisions (brainstorm Q1-Q5, all = A + Q5 device-cache)

- **Q1 = session-doc relay** — tablet never writes a treatment; PC merges. Survives reloads; no signalling server. (vs WebRTC/peer.)
- **Q2 = real staff login** — tablet logs in with any clinic-staff account; the `?tablet=chart` route sits inside `UserPermissionProvider` + `BranchProvider`.
- **Q3 = perfect-freehand pen canvas** — pressure-variable strokes via Pointer Events; best-in-class stylus support (requirement #5, emphasized critical).
- **Q4 = named tablets + ready-list** — `be_chart_tablet_presence` heartbeat presence; PC sees a live "ready tablets" list to pick from.
- **Q5 = Firebase Storage transport + device cache** — image bytes travel via Storage (session doc carries only URLs); tablet caches its device name + branch in localStorage so it never re-enters them.

## 11-point requirement → where it landed

1. tablet link + any-staff login + standby → `TabletChartEditorPage` + `TabletStandby` (`?tablet=chart`).
2. standby waits for PC trigger, same branch → compound-query listener (branchId+deviceId+status).
3. TFP chart-modal "edit here" vs "edit on tablet" → `PcPairingModal` from `ChartSection`.
4. PC checks tablet ready → `listenToChartTabletPresenceByBranch` ready-list + `isPresenceReady`.
5. trigger → tablet pops editor with selected image + pro pen tools → `PenCanvas` + `penStroke.js` (perfect-freehand).
6. full-screen editor, header cancel+save, save→chart → `EditorToolRail` + `onSaved → handleSave`.
7. PC shows waiting → `useChartEditSession` phase `waiting`.
8. either-cancel / 30s disconnect → both exit → watchdog + `cancelledBy` + orphan-sweep cron.
9. PC-cancel → tablet shows cancelled → `status=cancelled` listener on the tablet.
10. **separate files; touch TFP minimally** → only `patientLabel` prop added (`TreatmentFormPage.jsx:3700`).
11. intense + stress testing → Rule I flow-simulate F1-F6 + stress ST1-ST6 + AV101 + L2 e2e 6/6 on prod.

## Cross-references

- Concept: [Tablet Chart Editor — session-doc relay](../concepts/tablet-chart-editor-relay.md)
- Entity: [chartEditSessionCore.js](../entities/chart-edit-session-core.md)

## History

- 2026-05-21 — Filed when the feature shipped + deployed.
