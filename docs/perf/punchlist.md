# Perf Punch-List — 2026-07-06 (P0 audit output)

> Source: 6-lens audit (51 raw findings salvaged from stopped Workflow — fan-out halted per
> user rate-limit directive; refuter stage replaced by MY OWN inline adjudication).
> Verdicts: **CONFIRMED-V** = I verified the cited code/artifact myself ·
> **CONFIRMED-F** = finder-cited with consistent evidence, MUST re-verify at fix time (V162).
> Baselines: `docs/perf/baseline-{local-preview,prod}/` + `bundle-baseline.json` (123 chunks, 1671KB gz).
> Baseline headline: every backend tab pays ~852KB JS · link-patient LCP 3.5-4.4s (worst surface) ·
> customers tab 5,419 DOM nodes · idleMutations>0 on 12/20 surfaces · frontend heap 69MB.
> UNMEASURED (honest gap): link-schedule — no live SCH-* link on prod (auto-picks up when one exists).
> Litter noted: `clinic_schedules/ws1-probe-vandal` probe doc (deletion = Rule M, needs user OK).

## P1 — Bundle & load

| # | Verdict | Finding | Fix | Impact/Risk |
|---|---------|---------|-----|-------------|
| 1 | **CONFIRMED-V** (dist/index.html modulepreloads recall-*.js; SDK wire-code inside it; vendor-firebase only 19KB) | `vite.config.js:151` 'recall' manualChunk absorbed Firebase SDK + backendClient core → 903KB (252KB gz) modulepreloaded on EVERY route incl. patient links | Rework manualChunks: test removing the recall bucket (Rolldown panic may be fixed) or pin core explicitly; verify with ANALYZE=1 + rebuild | HIGH / med (Phase-29 panic precedent — build-test per change) |
| 2 | **CONFIRMED-V** (read imports :33-120) | `BackendDashboard.jsx` ~25 heavy tabs + `TreatmentFormPage` statically imported while 30 siblings already lazy | Convert to `lazy()` (proven in-file pattern); TFP lazy at both dashboards | HIGH / low |
| 3 | **CONFIRMED-V** (App.jsx:23-25) | Entry chunk carries static `PatientForm` (116KB src) + `PrintTemplates` (41KB) while 7 sibling pages lazy | `lazy()` both; printMode + ?session= routes already have Suspense pattern | MED-HIGH / low-med |
| 4 | CONFIRMED-F | `AdminDashboard.jsx` zero lazy — AppointmentHubView / ChatPanel / CustomFormBuilder / ClinicSettingsPanel / TreatmentTimeline all in 357KB chunk | lazy() conditional surfaces | MED / low |
| 5 | **CONFIRMED-V** (vercel.json:89-100) | No Cache-Control for hashed /assets/* + `X-DNS-Prefetch-Control: off` | Add `/assets/(.*)` → `public, max-age=31536000, immutable` | MED-HIGH repeat visits / low |
| 6 | **CONFIRMED-V** (index.html) | No preconnect to firestore/identitytoolkit/firebasestorage/www.googleapis | Add `<link rel="preconnect">` ×4 | MED / none |
| 7 | CONFIRMED-F | `src/firebase.js:28` eager `getStorage(app)` pulls storage impl into boot chunk | Investigate lazy getter (many importers — verify all) | LOW-MED / med |
| 8 | **CONFIRMED-V** (build warning) | `appointmentDepositBatch.js` static+dynamic import mix → INEFFECTIVE_DYNAMIC_IMPORT | Normalize to static (remove dead `await import()` ceremony) | LOW / low |
| 9 | **CONFIRMED-V** (build log errors) | `vite.config.js:75` warmup lists V50-deleted files ×3 | Remove dead entries (dev-only) | LOW / none |
| 10 | CONFIRMED-F | `public/icon-512.png` 247KB used as favicon+touch-icon; 546B favicon.svg unused | Serve favicon.svg / optimized PNG for favicon rel; keep 512 for PWA manifest | LOW-MED / none (same logo pixels) |
| 11 | CONFIRMED-F | `index.html:24` body opacity-0 + 0.15s fade = artificial first-paint delay | Verify mechanism; shorten/remove fade while keeping FOUC guard | LOW-MED perceived / low |
| 12 | CONFIRMED-F | `src/index.css:1613` ~8.7KB dead V85 glow-variant CSS + a source-grep test LOCKS the dead rules | Grep usage → remove + repoint test (V21-class fixup) | LOW / low |

## P2 — Render smoothness

| # | Verdict | Finding | Fix | Impact/Risk |
|---|---------|---------|-----|-------------|
| 13 | **CONFIRMED-V** (ChatPanel:982-1008) | `useChatUnread` whole-collection listener stores raw conv array in AdminDashboard state → dashboard-wide re-render per ANY chat doc change | Derive counts inside hook; shallow-equal guard before setState | HIGH smoothness / low-med |
| 14 | **CONFIRMED-V** (AdminDashboard:654-683) | admin_presence: 30s heartbeat write + whole-collection listener + deleteDoc-in-listener → guaranteed re-render ≤30s/tab | Equality-guard setOnlineAdmins; stale-doc cleanup threshold | MED / low |
| 15 | **CONFIRMED-V** (AdminDashboard:1125) | 60s `setCurrentTime` tick re-renders 8.6k-line monolith every minute | Isolate consumer or accept + memo heavy children | LOW-MED / low |
| 16 | CONFIRMED-F | `AdminDashboard.jsx:6445` month-calendar availability recomputed per render (nested per-day×slot×appt scans, unmemoized) | useMemo keyed on inputs | MED / low |
| 17 | CONFIRMED-F + baseline (5,419 DOM nodes) | `CustomerListTab.jsx:278` all customers rendered as non-memo cards + inline handlers | React.memo rows + useCallback; windowing only if parity holds | MED / low-med |
| 18 | CONFIRMED-F | `StaffChatMessageList.jsx:191` non-memo rows + groupMessagesByDay per render + renders while display:none | memo + useMemo + skip-render-when-hidden (careful: V160 visibility lessons) | MED / med (V160/V161 mount-model history!) |
| 19 | CONFIRMED-F | `RecallRow` non-memo under AdminDashboard monolith fires | React.memo | LOW-MED / low |
| 20 | CONFIRMED-F | `TreatmentFormPage.jsx:5100` buy-modal search keystroke re-renders whole 5.9k-line form | Isolate modal state / defer; TFP = money-critical, strictest gates | MED / med |
| 21 | Baseline-measured | idleMutations_5s >0: customer-detail 101, appointment-all 101, central-stock 79, stock 66, frontend 57-65 | Trace mutation source during P2 (clock/presence/listeners) → re-measure proves each fix | evidence for 13-16 |

## P3 — Data loading

| # | Verdict | Finding | Fix | Impact/Risk |
|---|---------|---------|-----|-------------|
| 22 | **CONFIRMED-V** (AdminDashboard:2335) | opd_sessions listener = whole collection, zero constraints (archived history included); branch-filter client-side | Count prod docs first; server-side narrowing has V23-class legacy-missing-field risk → design carefully or cap | MED-HIGH / **HIGH** (queue = core; where() excludes missing-field docs) |
| 23 | **CONFIRMED-V** (backendClient:4136 + AppointmentHubView:174) | Whole be_treatments onSnapshot as change-signal → loadAll refetches 7 whole datasets (getAllCustomers, getAllMemberships, …) per ANY treatment write, no debounce | Debounce loadAll; narrow refetch | MED-HIGH / med |
| 24 | **CONFIRMED-V** (ChatPanel:178-190, :520-522) | deleteDoc INSIDE onSnapshot callbacks (messages >7d + history >7d) — own-write cascade class; crons exist (chat-history-retention-sweep) | Verify cron covers both scopes → drop client deletes | LOW-MED + correctness / low-med |
| 25 | CONFIRMED-F | `backendClient.js:3281` appointment month/date listeners: branchId only, NO date bounds — whole branch history streamed | Add date-bounded query (index impl.) or accept; verify consumers | MED / med |
| 26 | CONFIRMED-F | `backendClient.js:6511` Movement Log fetches ENTIRE be_stock_movements (append-only ledger, grows forever) | Server-side branch/date filter or pagination | MED (grows) / med |
| 27 | CONFIRMED-F | `AdminDashboard.jsx:1384` clinic_schedules whole-collection always-on listener | Narrow or lazy-subscribe | LOW / low |
| 28 | CONFIRMED-F | `RecallTogglePill.jsx:12` subscribes ALL be_recalls incl. done/closed though server-side filters exist | Pass status/dateBefore filters | LOW-MED / low |
| 29 | **CONFIRMED-V** (financeUtils:114) | fmtMoney/fmtPoints construct Intl per call × 331 call sites in table rows | Hoist 2 `Intl.NumberFormat` instances (byte-identical output) | LOW / none |

## P1 RESULT (2026-07-06 — measured, full vitest 17,276/0, parity eyeball-adjudicated)
- DONE: #1 recall-chunk (903KB bucket removed; vendor-firebase 504KB consolidated; backendClient own 215KB) ·
  #2 ~25 backend tabs + TFP lazy (976KB chunk dissolved; AdminDashboard 365→297KB) ·
  #3 entry 365→31KB (PatientForm/PrintTemplates lazy) · #4 AdminDashboard heavy children lazy ·
  #5 immutable /assets cache · #6 preconnect ×4 · #9 warmup cleaned · #10 icons lossless −15KB ·
  #11 FOUC fade removed (CSP-hashed inline scripts untouched).
- Measured (local-preview, median-of-3): backend tabs JS 852-889 → **449-561KB (−44%)** · FCP −25% ·
  backend LCP 1016-1236 → **924-976ms** · frontend heap 69→48MB · link JS −4..−22%.
- link-patient LCP ~4.4s UNCHANGED → data-wait bound (serial anon-auth→settings→token query) → P3 focus.
- DEFERRED (documented, low gain vs blast radius): #7 getStorage eager (many consumers) ·
  #8 appointmentDepositBatch static+dynamic mix (runtime no-op noise) · #12 dead V85 glow CSS (~1.5KB gz).
- Parity noise classes (v2 sets, spinner-aware harness + 1.5s entrance grace): dark bloom-menu starfield
  = RANDOM star positions per mount → 0.5-2.6% pixel diff with IDENTICAL layout (eyeball-confirmed);
  light theme all ≤0.35%. Baseline-v2 shots came from worktree build of `283dd9c5`.

## P2 RESULT (2026-07-06 — parity eyeball-adjudicated; behavioral renderHook locks)
- DONE: #13 useChatUnread equality guard (dashboard no longer re-renders per ANY chat doc change —
  proven by renderHook identity test) · #14 admin_presence id|email signature guard (was a guaranteed
  ≤30s full-dashboard re-render per open tab) · #17 CustomerCard memo + stable delete handler
  (search keystroke re-rendered 400+ cards / 5.4k nodes) · #19 RecallRow memo (both export forms) ·
  #29 fmtMoney/fmtPoints hoisted Intl (331 sites, byte-identical).
- DEFERRED (documented): #15 60s tick (1/min re-render negligible post-13/14; moving clock state =
  monolith surgery for ~nothing) · #16 month-calendar memo (only computes in non-default calendar view;
  post-13/14 re-render frequency collapsed) · #18 StaffChatMessageList (V160/V161 mount-model minefield —
  drop-rule) · #20 TFP keystroke isolation (money-critical 5.9k-line form — needs its own session).
- Parity after-phase2 vs after-phase1-v2: light ≤0.56% (customers-light eyeballed = identical, glow
  dithering), dark = starfield class. Note: the P2.13/14 wins are event-driven (chat/presence) so the
  5s idle window can't show them — the renderHook identity tests are the proof (Q-honest).

## P3 RESULT (2026-07-06 — size-justified scoping via prod counts: docs/perf via diag-collection-counts.mjs)
- Prod counts: opd_sessions 155 (143 archived) · be_treatments 412 · be_appointments 453 ·
  be_stock_movements 1,498 · chat_history 4,265 · clinic_schedules 1 · be_recalls 53 · chat_conversations 11.
- DONE: #24 chat_history client-delete removed (cron owns; own-write cascade gone) ·
  #23 AppointmentHubView change-signal debounce 800ms (a TFP save fired 3 signals → 3× 7-dataset refetch;
  now 1 per burst; manual reconcile stays direct; pending timer cancelled on branch switch) ·
  **BONUS BUG FIX**: chat-history retention CRON was DEAD (Timestamp-vs-ISO-string type mismatch →
  46 runs × scanned:0 while 4,265 docs accumulated) — dual-type query fix, TDD + Rule Q L2 dry-run on
  prod (scanned 500/would-delete 500, was 0). Effective after next deploy; drains ≤500/day (~9 days),
  or a one-shot CLI --apply can drain immediately (user call — destructive-scope callout).
- DROPPED (size-justified): #27 clinic_schedules (1 doc) · #28 RecallTogglePill (53 docs + eff-date
  OR edge would risk badge undercount).
- DEFERRED (documented): #22 opd_sessions narrowing (155 docs now = no present cost; where()-excludes-
  missing-field V23-class risk needs its own design; growth bounded by archive... which retains forever —
  recommend a retention decision later) · #25 appointment date-bounds (453 docs total) ·
  #26 movement-log pagination (1,498 grows forever — recommend when >5k) · link-patient LCP 4.3s =
  serial anon-auth→settings→token-query chain — needs its own focused session (data-path redesign,
  Rule Q L2 per change).

## Ordering inside phases
P1: 1 → 2 → 3 → 4 → 5+6 → 9+8 → 10-12 → 7. P2: 13 → 14 → 16 → 17 → 15 → 19 → 18 → 20 (21 = evidence loop).
P3: 24 → 23 → 28 → 26 → 25 → 27 → 22 (riskiest LAST; drop rule applies — anything un-enumerable gets dropped, documented).

## Standing gates (every fix)
One change per commit · build clean · targeted tests · parity on affected surfaces · full vitest + parity + re-measure at phase end · iron-clad A revert on any break · NO visual change · NO rules change.
