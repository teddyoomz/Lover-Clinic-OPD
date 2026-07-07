# Instant cold-start (2026-07-07) — measured results

> Batch: persistentLocalCache (A1) + freshGate (A2) + swrRead/{source} (B1) +
> hub 2-stage (B2) + staff SWR sweep (C1-C3, AV206) + Service Worker (D1, AV207).
> Spec: docs/superpowers/specs/2026-07-07-instant-staff-app-cold-start-design.html

## Hub (นัด) — time to DATA on screen, warm repeat visit
Method: `.tmp-measure-coldstart` (Playwright, 3 reloads, median; staff auth,
นครราชสีมา, pill "ย้อนหลัง 30 วัน" count > 0 = data painted). Local preview
builds; BEFORE = worktree @ 62257b88 (pre-batch), AFTER = this batch.

| build | runs (ms) | median |
|---|---|---|
| BEFORE (server-bound) | 1640 / 1736 / 1772 | **1736 ms** |
| AFTER (SWR cache paint) | 534 / 566 / 1080 | **566 ms** |

**−67% to data-on-screen** on desktop-localhost (fast fiber). The user's real
pain (iPhone PWA on 5G after a long gap: 7-10+s in the report video) shrinks
far more in absolute terms: the BEFORE path scales with network round-trips
(handshake + token refresh + 7 datasets), the AFTER cache paint is local
(~0.5s) regardless of network — the network only feeds the background sync.

## Functional proofs (Playwright L1, tests/e2e/instant-coldstart-swr.spec.js — 4/4 on the BUILT app)
- **S1**: with ALL googleapis traffic dead, a reload still paints the hub
  (IndexedDB) + "กำลังซิงค์…" shows and stays (honesty fix: `__fromCache` tag —
  a network-down `getDocs` silently serves cache; the indicator now reads the
  real SDK metadata); back online → indicator clears.
- **S2**: server-side change made while "away" lands after reload (SWR corrects).
- **S3**: customer `?schedule=` page NEVER renders cached data without server
  confirmation (fresh-always preserved; loading/retry only while unconfirmed).
- **S4**: full offline → SW serves the app shell (react mounts).

## Pixel parity (steady-state)
`perf:parity` coldstart-before (worktree build) vs coldstart-after: 34/40 pairs
≤0.5%; 6 dark-only flags all adjudicated by eyeball (Q-vis) = ArcBloom starfield
animation frames (star positions differ; layout identical — same class as the
perf-campaign adjudications). Hub + link pages **0.000%**.

## Deliberate scope notes
- Reports / stock-op panels / modals / admin tabs = SANCTIONED server-first
  (docs/perf/swr-inventory.md — decision-reads must be fresh).
- iOS may evict IndexedDB after long disuse → degrades to the (now staged +
  SW-shelled) first-ever path; `navigator.storage.persist()` requested for staff.
