# Checkpoint 2026-07-07 — Whole-app performance campaign (P0-P3) SHIPPED + DEPLOYED

## Summary
User directive: audit + optimize speed/smoothness/load of the ENTIRE app, visible results,
zero new bugs, zero visual change ("โหลดเร็ว ลื่น และยังสวยงามเหมือนเดิม"). Measurement-first
4-phase campaign per spec/plan `docs/superpowers/{specs,plans}/2026-07-06-performance-audit-optimization*`.

## Final state
- master = prod, DEPLOYED (`vercel --prod`, frontend-only — firestore.rules UNCHANGED all campaign → no Probe-Deploy-Probe).
- **Final full vitest 17,287/17,287 · 0 fail** (from 17,245 at start; +42 perf tests). Build clean.
- Live-verified on prod (Rule Q): preconnect ×5 present · zero recall-chunk preload · FOUC hack gone ·
  `/assets/*` served `public, max-age=31536000, immutable` · CSP inline-script hashes intact.
- (rtk-grep NOTE: `grep` via rtk falsely reported 0-matches on the downloaded prod HTML — PowerShell
  regex count was the arbiter. Don't trust rtk 0-matches on temp files.)

## Measured (median-of-3, local-preview; consolidated in docs/perf/report.html)
| Metric | baseline | after-P1..P3 |
|---|---|---|
| Backend tab JS/page | 852-889KB | 449-561KB (−44%) |
| Entry chunk | 365KB raw | 31KB |
| FCP (all surfaces) | 108-136ms | 84-112ms |
| Backend LCP | 1016-1236ms | ~924-1024ms |
| Frontend heap | 69MB | 48-51MB |
| link-patient JS | 427KB | 336KB |

## What shipped (commits ~17)
- **P0**: reusable harness (`scripts/perf-*.mjs`, `npm run perf:*`) — metrics runner (dom-quiet +
  spinner-aware settle), bundle manifest, pixel-parity gate (sharp), compare report, Rule R link
  discovery; baselines local+prod committed; 51-finding audit salvaged from the halted Workflow
  (user rate-limit directive → inline adjudication; memory `feedback_no_large_agent_fanout` locked).
- **P1 bundle**: removed `recall` manualChunk that had swallowed Firebase SDK + backendClient into a
  903KB chunk modulepreloaded on EVERY route (Rolldown panic gone) · ~25 static BackendDashboard tabs +
  TFP + PatientForm/PrintTemplates + 5 AdminDashboard children → lazy · preconnect ×4 · immutable
  cache · dead warmup entries · lossless icons · FOUC fade removed (CSP-hashed scripts untouched).
- **P2 render**: useChatUnread equality guard (was: whole conv array in AdminDashboard state → monolith
  re-render per ANY chat doc change; renderHook identity locks) · admin_presence signature guard (was:
  guaranteed ≤30s re-render/tab) · CustomerCard memo + stable handler (search keystroke re-rendered
  400+ cards) · RecallRow memo · fmtMoney/fmtPoints hoisted Intl (331 sites, byte-identical).
- **P3 data**: hub change-signal debounce 800ms (TFP save fired 3 signals → 3× 7-dataset refetch → 1) ·
  chat_history client-delete removed (cron owns) · **DEAD-CRON FIX**: retention sweep queried
  Timestamp cutoff vs ISO-STRING resolvedAt → type-ranked ordering matched NOTHING for 46 daily runs
  (4,265 docs accumulated) → dual-type query, TDD red→green, L2 dry-run prod (500 vs 0), verified on
  DEPLOYED code + drained 4,265 → 137 via the cron's own endpoint (user-mandated 1-day retention).
- **Parity discipline**: spinner-aware + entrance-grace harness; baseline REBUILT from git worktree
  `283dd9c5` for apples-to-apples; noise classes adjudicated by eyeball (dark starfield = random star
  positions per mount 0.5-2.7%; light glow-dither ≤0.56%) — layout identical every flagged pair checked.
- Incidents (transparent): `rm -rf` traversed a node_modules junction in the baseline worktree →
  partial delete → recovered `npm ci` (memory `feedback_windows_junction_rm_hazard`).

## Deferred (rationale in docs/perf/punchlist.md)
TFP buy-modal keystroke isolation (money-critical, own session) · link-patient LCP ~4.3s (serial
anon-auth→settings→token data chain — needs focused redesign) · movement-log pagination (1,498 docs,
recommend >5k) · opd_sessions archive retention decision (143/155 archived, grows forever) ·
getStorage eager-init · appointmentDepositBatch import normalization · dead V85 glow CSS.

## Next Todo
1. User L1 hands-on: เว็บ/tab switch เร็วขึ้น · ค้นหาลูกค้าลื่น · หน้าตาเหมือนเดิม 100% · realtime ปกติ.
2. (optional) `node scripts/perf-baseline.mjs --run after-phase3 --target prod` for real-network numbers.
3. If any regression → iron-clad A revert the specific perf commit.

## Resume Prompt
Resume LoverClinic — 2026-07-07. Perf campaign (P0-P3) SHIPPED + DEPLOYED live
(lover-clinic-app.vercel.app). Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md →
.claude/rules/00-session-start.md → this checkpoint. full vitest 17287/0. Status: idle —
awaiting user L1. No deploy without explicit "deploy" (V18). No agent fan-outs (memory lock).
