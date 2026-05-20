---
title: chartEditSessionCore.js
type: entity
date-created: 2026-05-21
date-updated: 2026-05-21
tags: [tablet, chart, relay, pure-logic, ssot, firestore]
source-count: 1
---

# chartEditSessionCore.js

> Branch-blind pure-JS single-source-of-truth for the [Tablet Chart Editor relay](../concepts/tablet-chart-editor-relay.md): status enums, heartbeat/staleness math, the transition graph, the doc builders, and the orphan-reap decision. No Firebase imports — same logic is consumed by the PC hook, the tablet page, the backend writers, AND the cron sweep, so they can never drift.

## Overview

`src/lib/chartEditSessionCore.js` (61 LOC). Everything that decides *whether a transition is legal*, *whether a tablet is ready*, *whether a session is an orphan* lives here as pure functions, so the React UI (`useChartEditSession`, `useTabletPresence`, `TabletChartEditorPage`), the data layer (`backendClient.js` TX guard + listeners), and the serverless cron (`api/cron/chart-edit-session-sweep.js`) all share one implementation. This is the Rule-of-3 / V12-shape-drift defense applied up front.

## API surface

Constants:
- `SESSION_STATUS` = `{ REQUESTED, ACTIVE, SAVED, CANCELLED }` (frozen) — `:1`
- `CANCELLED_BY` = `{ PC: 'pc', TABLET: 'tablet', TIMEOUT: 'timeout' }` (frozen) — `:2`
- `HEARTBEAT_INTERVAL_MS = 10000` / `HEARTBEAT_STALE_MS = 30000` — `:3-4` (10s beat, 30s stale window = requirement #8's "30s disconnect")
- `SESSION_MAX_AGE_MS = 3_600_000` — 1h orphan cap — `:5`

Functions:
- `isTerminal(status)` → saved|cancelled — `:8`
- `toMillis(ts)` — tolerates number / Date / ISO string / `{toMillis()}` / `{seconds,nanoseconds}` / `{_seconds,_nanoseconds}` (V81-fix1 Firestore-shape coverage) — `:11-20`
- `isHeartbeatStale(lastMs, nowMs, staleMs=30000)` — `:22-24`
- `isPresenceReady(presence, nowMs)` → `presence.status==='idle' && !stale` — `:25-28`. **The TABLET_OFFLINE gate** (FP4): idle-but-stale = not ready.
- `canTransition(from, to)` — edge set `requested→{active,cancelled}`, `active→{saved,cancelled}`, terminals→∅ — `:30-35`
- `buildPresenceUpsert({...})` → `be_chart_tablet_presence` doc shape — `:37-39`
- `buildSessionCreate({...})` → `be_chart_edit_sessions` requested-doc shape (template URLs null, dual heartbeats, expiresAt) — `:40-49`
- `shouldReap(session, nowMs)` — non-terminal: `pcStale || tbStale || age>cap`; terminal: `updatedAt age > cap` — `:54-60`

## Key facts / claims

- **`shouldReap` is why a real PC send is safe but an injected orphan dies** — a live PC heartbeats every 10s so `pcHeartbeatAt` stays fresh; a one-shot/abandoned session goes `pcStale` after 30s and the cron reaps it (`:57-59`). Confirmed live on prod 2026-05-21.
- **`tabletHeartbeatAt != null` guard** (`:58`) — a `requested` session not yet opened by the tablet (`tabletHeartbeatAt: null`) is not reaped on tablet-staleness alone; the PC heartbeat governs until the tablet picks up.
- **`toMillis` mirrors V81-fix1** — backups taught us Firestore Timestamps serialize many ways; this helper accepts all so heartbeat math is correct whether the field came from the client SDK, admin SDK, or a JSON round-trip.
- 100% pure → unit-tested directly in `tests/chart-edit-session-core.test.js`; reused by `tests/tablet-chart-editor-flow-simulate.test.jsx` to chain the lifecycle without mounting React.

## Cross-references

- Concept: [Tablet Chart Editor — session-doc relay](../concepts/tablet-chart-editor-relay.md)
- Concept: [V12 shape-drift bug class](../concepts/v12-shape-drift.md) — the pure-SSOT pattern this file embodies.
- Source: [Tablet Chart Editor design](../sources/tablet-chart-editor-design.md)

## History

- 2026-05-21 — Created with the Tablet Chart Editor ship. API surface cited at file:line.
