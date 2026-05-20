---
title: Tablet Chart Editor — session-doc relay
type: concept
date-created: 2026-05-21
date-updated: 2026-05-21
tags: [tablet, chart, relay, firestore, storage, bsa, pen]
source-count: 1
---

# Tablet Chart Editor — session-doc relay

> Remotely hand a chart-template image from a PC's TreatmentFormPage to a standby tablet (iPad/Android + Apple Pencil/stylus), let a clinician annotate it full-screen, and merge the result straight back into the PC's `charts[]` — all over a tiny Firestore "session" doc + Firebase Storage for the image bytes. The tablet never writes a treatment; the PC owns the merge.

## Overview

Shipped 2026-05-20/21 per the [design spec](../sources/tablet-chart-editor-design.md). The feature is built as **separate files** so `TreatmentFormPage.jsx` (TFP) is touched in exactly **one** place — a single `patientLabel` prop on `<ChartSection>` (`src/components/TreatmentFormPage.jsx:3700`). All logic lives outside TFP.

The relay is a **session-doc state machine** (Q1 of the brainstorm — chosen over WebRTC/peer-to-peer so it survives reloads + needs no signalling server):

```
PC (ChartSection)                 Firestore                    Tablet (?tablet=chart)
─────────────────                 ─────────                    ──────────────────────
pick template ──► PcPairingModal
  choose "แก้ที่แท็บเล็ต"
  pick a ready tablet
  send ──────────────► createChartEditSession (TX guard)
                       be_chart_edit_sessions/{id} = requested
                       be_chart_tablet_presence/{dev} = busy
   upload template ──► Storage uploads/chart-edit-sessions/{id}/template.png
                       session.templateImageUrl = <download URL>
                                                   compound-query listener fires ──► editor pops
                                                                                     download template
  PC shows ⏳ waiting                                                                draw (perfect-freehand)
                                                   ◄── status=active + tabletHeartbeatAt
                       session.resultImageUrl ◄──── upload result.png + status=saved
   listener: status saved ──► download result
   onSaved(chartData) ──► TFP handleSave merges into charts[]
   freeChartTablet (idle) + deleteChartEditSession + cleanupSessionStorage
```

Either side cancelling, or a 30s heartbeat gap, drops both sides (requirement #8/#9): the PC watchdog cancels on stale `tabletHeartbeatAt`; the tablet reacts to `status=cancelled`; the [orphan-sweep cron](#orphan-sweep) is the crashed-client backstop.

## Key facts / claims

- **Image bytes never live in the session doc** — only URLs. `uploadTransportImage` → `getDownloadURL`; doc stays well under the 1 MB Firestore cap (`src/lib/chartEditSession.js:15-19`). Verified by flow-simulate F5 (2 MB template → doc < 5000 bytes).
- **Pure SSOT** — all status/heartbeat/transition/reap logic is branch-blind pure JS in [chartEditSessionCore.js](../entities/chart-edit-session-core.md): `SESSION_STATUS`, `HEARTBEAT_INTERVAL_MS=10000`, `HEARTBEAT_STALE_MS=30000`, `isHeartbeatStale`, `isPresenceReady`, `canTransition`, `shouldReap`, plus `toMillis` that handles V81-fix1 Firestore Timestamp shapes.
- **TX guard distinguishes BUSY vs OFFLINE** — `createChartEditSession` runs a `runTransaction`: presence `status==='busy'` → `TABLET_BUSY`; presence missing/stale (`!isPresenceReady`) → `TABLET_OFFLINE` (`src/lib/backendClient.js`). The PC hook maps these to distinct Thai messages (`src/hooks/useChartEditSession.js:32-34`). **This split was the FP4 fix (V-entry below)** — a stale-but-idle tablet was wrongly reported "in use".
- **Instant-pop compound query** — the tablet's `listenToRequestedSessionForTablet` filters `branchId == X AND tabletDeviceId == Y AND status == 'requested'`, served by a `be_chart_edit_sessions` composite index (`firestore.indexes.json`). L2 e2e proves the index returns the session.
- **Busy-aware heartbeat prevents mid-edit free** — `useTabletPresence(busy)` writes `status: busy ? 'busy' : 'idle'` every 10s, and `TabletChartEditorPage` keeps `TabletStandby` mounted (busy prop) so opening the editor never unmounts the presence hook. Without this, the standby unmount freed presence ~30s mid-edit → a 2nd PC could grab the tablet (caught during T10, never shipped).
- **TFP minimally touched** — Rule #10. Only `patientLabel` added; zero logic/handler change. `onSaved(chartData)` funnels through the **existing** `handleSave` path so the tablet result is indistinguishable from a here-edited chart.
- **Pen quality** — `src/lib/penStroke.js` wraps `perfect-freehand` (pressure-variable outline → `Path2D`); `PenCanvas.jsx` uses Pointer Events (`getCoalescedEvents`, `touch-action:none`, palm rejection) for best-in-class Apple Pencil/stylus input (Q3 + requirement #5).

## Orphan sweep

`api/cron/chart-edit-session-sweep.js` (every 15 min, `CRON_SECRET`-gated, admin SDK) scans `be_chart_edit_sessions`; for each `shouldReap` doc: terminal → delete doc + Storage; live orphan → `status=cancelled, cancelledBy='timeout'` **+ free the tablet presence (busy→idle)** + clean Storage (`api/cron/chart-edit-session-sweep.js:66-76`). **Verified live on real prod** 2026-05-21 — an admin-injected orphan `requested` session (no live PC heartbeat) was reaped + its tablet freed within the window.

## BSA classification

- `be_chart_tablet_presence` + `be_chart_edit_sessions` are **branch-scoped** (BC2 coverage). Writers use `xDoc`/`xCol` accessors registered in the `ACCESSORS` map so branch-collection-coverage passes.
- Listeners are **BS-13 safe-by-default** (`listenToChartTabletPresenceByBranch` resolves branchId; empty result rather than whole-collection fallback).
- Layer 2 passthrough wrappers in `scopedDataLayer.js`; UI/hook code imports the pairing fns from `src/lib/chartEditSession.js` (one module).
- **AV101** invariant guards the relay's chokepoints.

## Verification (Rule Q)

- **L2 e2e 6/6 on real prod** — `scripts/e2e-tablet-chart-editor.mjs` drives two simulated clients (PC + tablet) through the exact compound query + Storage round-trip + TX guard + cleanup. Gold-standard relay verification.
- **Rule I flow-simulate** — `tests/tablet-chart-editor-flow-simulate.test.jsx` F1-F6 chains the whole lifecycle with the REAL PC hook over an in-memory store; F6 locks the FP4 OFFLINE-vs-BUSY message.
- **Stress** — `tests/tablet-chart-stress.test.js` ST1-ST6. **AV** — `tests/tablet-chart-av.test.js` AV101.1-4.
- **Live partial-L1** — tablet UI lifecycle (standby → pop → draw → save → standby) + PC choice/ready-list/send verified live in Chrome (foreground). The simultaneous two-tab pop is blocked only by a single-machine harness constraint (a backgrounded browser tab reports `visibilityState:hidden`, suspending its Firestore listener) — not a product defect.
- **Rule R diag tools** — `scripts/diag-tablet-chart-trigger.mjs` (client SDK) + `scripts/diag-tablet-chart-admin-trigger.mjs` (admin SDK, no client creds) drive the PC side for manual tablet exercise.

## Cross-references

- Entity: [chartEditSessionCore.js](../entities/chart-edit-session-core.md) — pure SSOT + API surface.
- Source: [Tablet Chart Editor design](../sources/tablet-chart-editor-design.md) — spec + plan summary.
- Concept: [Branch-Scope Architecture](branch-scope-architecture.md) — BS-13 + Layer 2 + accessor pattern this feature follows.
- Concept: [Branch-switch refresh discipline (BS-9)](branch-switch-refresh-discipline.md).
- Entity: [TreatmentFormPage (TFP)](../entities/treatment-form-page.md) — the one-prop touch point.

## History

- 2026-05-21 — Created after the Tablet Chart Editor shipped (11-task plan + FP1/FP2 deploy + FP4 OFFLINE/BUSY fix). Records the relay state machine, presence model, TX guard, orphan sweep (verified live), and Rule Q verification chain.
