# Session Handoff — LoverClinic OPD Cross-Session State

> **This file is read FIRST every new session.** Updated by `/session-end` skill.
> Link out to `.agents/sessions/*` for detail.

---

## 📏 HARD CAP: 10 sessions (2026-06-16 — supersedes the 200 KB size cap)

This file carries **at most the last 10 `### Session ...` blocks + the last 10
`## Current State` one-line bullets** — ALWAYS. (Header repaired 2026-07-19 EOD+1 —
a past trim accidentally embedded a full stale session block inside this sentence;
that block's content lives in `.agents/sessions/2026-07-07-fable-final-batch.md`.) `/session-end` MUST trim EVERY
turn (not "when it gets big"):

1. After inserting today's new block + bullet, count `### Session` blocks and
   `- **NEW (` / `- **Date (` Current State bullets.
2. If either is > 10, move the OLDEST overflow (sessions 11+, bullets 11+) into
   `.agents/sessions/session-handoff-archive.md` — prepend the NEW batch at the
   TOP (newest archived first; one `## Archived <date>` heading per batch).
3. Delete the moved content from this file; keep the footer pointer to the archive.
4. The canonical trimmer is `.tmp-trim.py`-style logic baked into the skill — keep
   exactly 10 + 10 (counts, not bytes). Detail per session lives in
   `.agents/sessions/*.md` checkpoints + `v-log-archive.md`, so trimming loses nothing.

**Origin**: 2026-06-16 — the size cap (180/200 KB) let the file accumulate 23
session blocks + 45 Current-State bullets (~40k tokens) while sitting *under* the
trigger, wasting boot tokens every session. User directive: *"ให้มันเหลือแค่ 10
session ที่ carry ข้อมูลไว้ในไฟล์นี้ตลอด ... จะได้ไม่ต้องมานั่งเปลือง token อ่านไฟล์ใหญ่ๆ"*.
The count cap (10+10) replaces the byte cap so the file stays ~10-12k tokens forever.

---

## 🚨🚨🚨 RULE Q — REAL-ADVERSARIAL VERIFICATION (V66, 2026-05-14) — READ EVERY TURN 🚨🚨🚨

**TRUST COLLAPSED. PHASE 29 SHIPPED WITH 5+ USER-VISIBLE BUGS WHILE 8 LAYERS OF TESTS CLAIMED PASS.**

Mock tests are NOT verification. Admin-SDK doc-level access is NOT verification.
They are **CODE-SHAPE COVERAGE ONLY**.

**Before claiming ANY of these — "verified" / "shipped" / "tests passed" / "done" / "complete" / "ready to deploy" / "PR ready" / "approved" / "working" — for ANY user-visible code (UI, API endpoint with auth, Firestore query, etc.) — you MUST satisfy ≥1 level:**

- **L1 (PREFERRED)** — Playwright/real-browser drives the REAL deployed UI with real auth + real DOM + real Firestore side-effects
- **L2 (ACCEPTABLE)** — Real client SDK (NOT admin) issuing the EXACT compound queries / listener subscriptions the UI issues
- **L3 (LAST RESORT)** — User walkthrough with written confirmation ("ลองแล้ว work" / "ลองแล้ว พัง XYZ")

**FORBIDDEN** (Rule Q violations):
- `vi.mock('firebase/firestore')` + claim "verified"
- RTL with mocked listener data only
- Admin SDK `doc.get/set/batch.commit` + claim "compound query verified"
- `firebase firestore:indexes` returns N → claim "indexes ready" (deployed ≠ built; indexes take 2-30 min)
- Post-deploy probe = anon HTTP POST to one collection (not a compound query)
- "All vitest tests pass + build clean → shipped" (INSUFFICIENT for user-visible flows)
- "I tested for 5 min and found no bugs" (<5 min + 0 bugs → retest at higher level)
- Confirmation-bias test design ("write test that assumes correctness → green")

**Self-check** (run BEFORE any "verified" claim — any "no" or "I'm not sure" → DO NOT CLAIM):
1. Did I drive REAL browser OR real client SDK?
2. Did I issue the EXACT query the UI issues?
3. Did I actively TRY to BREAK my own code?
4. If <5 min testing + 0 bugs → did I retest at higher level?
5. Can I produce output log + screenshot proving the flow?

**Full text**: `.claude/rules/01-iron-clad.md` Rule Q (top-of-file) + `~/.claude/skills/real-adversarial-verification/SKILL.md` + V66 in `.claude/rules/00-session-start.md` § 2 + verbose entry in `.claude/rules/v-log-archive.md`.

**Origin**: V66 (2026-05-14) — Phase 29 trust collapse. User curse-verified: *"กูไม่เชื่อเทสที่ไม่น่าเชื่อถือของมึงแล้ว ... ทำยังไงก็ได้ให้ต่อไปนี้การเทสของมึงจะต้องไม่เหี้ย ไม่โกหก ไม่เข้าข้างตัวเองและใช้ไม่ได้จริง"*. EVERY FUTURE "VERIFIED" CLAIM MUST PASS L1 OR L2. NO EXCEPTIONS.

---

## Current State

- **NEW (2026-07-19 EOD+3) — Infra Health Monitor + Client Error Beacon (AV211) + TFP keystroke isolation (#20) — SHIPPED local, NOT deployed**: master `2d6ac980` = 4 commits ahead of prod `a61ad87a` (**firestore.rules UNCHANGED → deploy จะเป็น vercel-only**). iPhone push popup **user-confirmed → AV210 ปิดสมบูรณ์**. User: "ทำหมดเลย แต่ห้ามเพิ่มบั๊ค" → `/brainstorming`(Q1=staff-chat+LINE / Q2=beacon ทุกหน้า)→spec→plan→inline. **① Health Monitor**: cron `infra-health-sweep` (07:30 BKK, 00:30 UTC — หลัง night crons ทั้งหมด) อ่าน 5 แหล่ง (`scheduled_task_status` SSOT เดิม 11 crons + `recon-daily-{y}` + `push_config/tokens+settings` + `client_error_log` count + `system_config`) → pure `evaluateInfraHealth` (`src/lib/infraHealthCore.js`) → เขียน `be_admin_audit/infra-health-latest`+history → warn/red → **staff-chat card kind `infra-health` (id ต่อวัน idempotent) + LINE OA text push** (ทั้งคู่อิสระจาก FCM — FCM ประกาศความตายตัวเองไม่ได้); ปิด class ตายเงียบ 3 เคสประวัติศาสตร์ (AV210 12วัน / V122 5วัน / dead-cron 46 รอบ — ทั้ง 3 เป็น repro fixtures ในเทส) + **anti-drift classifier**: cron ใหม่ใน vercel.json ไม่ประกาศ coverage = เทสแดง (AV142-style). **② Error Beacon**: `errorBeacon.js` (onerror/unhandledrejection, dedupe 1/5นาที, cap 20/session, self-safe ทุกชั้น) + `AppErrorBoundary` (จอดำ V163-class → หน้า "โหลดหน้าใหม่") → POST `/api/client-error` (anon, allowlist+truncate, **tx daily cap 500**, URL เก็บแค่ชื่อ param — token/PHI ไม่หลุด) → `client_error_log` **default-deny** (อ่าน/เขียนผ่าน admin-SDK endpoints — **ศูนย์ rules change**) + viewer + retention 30 วัน (health cron กวาด). **UI**: การ์ด "🩺 สุขภาพระบบ" ใน SystemSettingsTab (status rows + LINE targets config + **ปุ่มทดสอบแจ้งเตือน** + ตรวจตอนนี้ + error viewer) + task ที่ 12 ใน ScheduledTasksTab (`system_config.infraHealth` additive + registry). **③ TFP #20**: `buyQuery/buySelectedCat/buyShowLimit` + filter memo ย้าย verbatim เข้า `TfpBuyModal` — keystroke ค้นหาไม่ re-render ฟอร์มเงิน 5.3k บรรทัดอีก; money state/handlers อยู่ TFP เดิม 100% (V13/V42/V162); reset semantics เดิม (mount-fresh + effect-on-type). **Verified**: full vitest **17,887/17,887 · 0 fail** (definitive json) + build clean + AV210 bank green + `git diff vercel.json` = crons/functions เท่านั้น (headers ไม่แตะ — blast-radius F5 test lock) + **Rule Q L2 จริง**: `diag-infra-health.mjs` บน prod = 13/14 ok + 🟡 จริง 1 (archive-retention ยังไม่เคยรัน — รอบแรกคืนนี้ = true positive) + `e2e-client-error-endpoint.mjs` 10/0 (token stripped / cap drop / cleanup zero-orphan) + **L1**: beacon จับ error จริงใน browser → sendBeacon payload ถูก + การ์ด SystemSettings render กับ prod data จริง + **Playwright buy-modal 10/10** (TEST-AV192 fixture, cleaned). **AV211** both SKILL copies (SY1 verbatim-copy). Honest gaps: การ์ด/LINE alert ตัวจริง + beacon round-trip เต็ม = post-deploy (ตั้ง LINE target + กดปุ่มทดสอบ = L1 ปิดท้าย) · Q-vis screenshot การ์ด = harness stuck (DOM+console+RTL ยืนยันแทน). Checkpoint `.agents/sessions/2026-07-19-eod3-observability-tfp20.md`.
- **NEW (2026-07-19 EOD+2) — AV210 push outage: root-caused + fixed + DEPLOYED + live-verified**: master `fe40702f` (fix `a61ad87a`) = prod (vercel-only; **rules UNCHANGED**). Push ตายเงียบทั้ง fleet 07-07→07-19: WS4 CSP (06-10) ไม่มี gstatic ใน script-src (latent — installed SW ไม่ re-evaluate) → AV207 scope-move (07-07) บังคับ fresh registration → **FCM SW evaluation fail ทุกเครื่อง** ("NetworkError" บน iPhone = WebKit importScripts-fail string; airplane mode = red herring) + subscription เก่าค้างบน sw.js ไร้ push handler → FCM ส่ง 8 token เก่า = "success" แต่ไม่แสดงอะไร → prune ไม่เคยยิง → ไร้ error ทุกชั้น (token ล่าสุด 05-26 = ศูนย์ mint หลัง 07-07). **Fix `a61ad87a`**: vercel.json dedicated CSP rule `/firebase-messaging-sw.js` (script-src +gstatic; **page CSP ไม่แตะ** — gstatic = CSP-bypass gadget host) + `cleanupLegacyRootPushSubscription()` ทั้ง 2 mint sites + AV210 (both SKILL copies SY1) + V-entry + Rule M prune + test-send diag. **Post-deploy verified live**: curl header ✓ ping 200 · desktop self-heal mint token แรกใน 54 วัน · **iPhone (เครื่อง NetworkError) heal เองในไม่กี่นาทีโดยไม่ต้องแตะ** · prune 8 zombies (audit `push-legacy-token-prune-*`) → fresh 2/zombie 0 · test push **2/2 FCM success**. Full vitest **17,788/0** + AV210 bank 23/0. Honest: iPhone popup = user-confirm pending; dev-PC toast = Windows OS-muted (พิสูจน์: page-level Notification ก็เงียบ — ไม่ใช่บั๊คแอป). Checkpoint `.agents/sessions/2026-07-19-eod2-av210-push-outage.md`.
- **NEW (2026-07-19 EOD+1) — Tail sweep + /audit-all final + VIP sort + wheel guard — SHIPPED + DEPLOYED LIVE**: master `2610a1a6` = prod (vercel `lover-clinic-kbqgmhp8h` aliased lover-clinic-app.vercel.app 200; **rules UNCHANGED → vercel-only**; post-deploy ping 200 + backfill straggler re-run 0). Full vitest **17,777/17,777 · 0 fail** + build clean. ① **AV209 tail ปิดถาวร**: writers stamp per-row `crs-` courseId (assign per-product/no-products + resolve-pick + add-picks ที่ strip template id กัน duplicate-byId) + Rule M backfill `crsbf-` **523 rows / 123 docs บน prod** (per-doc runTransaction vs live writers; idempotent 0; audit `av209-courseid-backfill-*`; L2 e2e 17/0 re-run + real rows resolve byId exact 15/15+12/12). ② BranchesTab dual-read `settings.phone/address` (V51). ③ **VIP sort**: chip "👑 VIP ก่อน" ใน CustomerListTab + NEW `useVipIds()` — stable VIP-first จาก VipProvider set เดียวกับ badge ทอง (id = proClinicId||id ตรง CustomerCard); **L1 Chrome จริง**: VIP 9/9 ขึ้นก่อน + chip amber + Q-vis; RTL 8/0 + AV202 39/0. ④ **/audit-all รอบสุดท้าย** (user สั่ง "แก้ 100%"): full suite + 2-agent grep sweep 23 skills/238 invariants → **0 CRITICAL/HIGH/MEDIUM**; แก้ 1 LOW (fb webhook verify_token masked) + refresh 6 stale audit-skill docs (C3 treatment-delete-stock = sanctioned design / C5 `_clearLinkedTreatmentsHasSale` EXISTS / F3 V144 narrow-delete / UC2 gold superseded / AN4 V78 regex / clone-sync RETIRED + api-layer RESCOPED post-V50) sync ทั้ง 2 copies; refuted-with-evidence: FF9 billDiscount (type=number) + UC1 phone-red (call-button design) + TZ2. ⑤ **Wheel guard (user directive)**: NEW `src/lib/wheelGuard.js` + App.jsx install — global capture non-passive listener, SAFE-BY-DEFAULT (V54): untagged `<input type=number>` = blur-on-wheel (เงินทุกช่องรวม TFP LocalInput ทั้งหมดปลอดภัยโดยไม่แตะไฟล์; blur ยัง commit ค่า); `data-wheelable` 22 qty inputs/12 files = **±1 เสมอ** (ไม่ใช่ step 0.01; clamp min/max; step attr ไม่แตะ → พิมพ์ทศนิยมได้). เทส 14/0 (execution+RTL round-trip+classifier: money-keyword ห้าม wheelable + closed 22-tag inventory + TFP zero-wheelable lock) + **Rule Q L1 Playwright trusted-wheel 2/2** (W1 ราคา 1500 นิ่งสองทิศ / W2 จำนวน 1→2→1→0-clamp) — บทเรียน: Chrome-MCP `scroll` = scroll GESTURE ยิง wheel event เป็นศูนย์ (logger พิสูจน์) ใช้ทดสอบ wheel ไม่ได้; `page.mouse.wheel` เท่านั้น (AV205 tool lesson ยืนยันซ้ำ). ⑥ Cron คืนแรก: retention doc ยังไม่มี = ถูกต้อง (รอบแรก 03:20 คืนนี้ — เช็คพรุ่งนี้ `diag-cron-first-night.mjs`) · warmup ttfb 0.66-1.24s (cold floor หาย). Honest gaps: user L1 ทั้ง stack. Checkpoint `.agents/sessions/2026-07-19-eod1-tail-audit-wheelguard.md`.
- **NEW (2026-07-19) — "ไล่ทำทั้งหมดอย่าให้เหลือ" full backlog sweep (9 items) + AV209 + hunt loop CONVERGED — SHIPPED + DEPLOYED LIVE**: master `39b23d99` = prod (vercel `lover-clinic-cbq2qwbdq` aliased lover-clinic-app.vercel.app HTTP 200; **firestore.rules UNCHANGED → vercel-only, no Probe-Deploy-Probe**; post-deploy: `?ping=1` → 200 `{ok,ping}` LIVE + 13 crons registered รวม `patient-view-warmup` */5 + `opd-session-archive-retention` 03:20 BKK). FINAL gate: full vitest **17,742/17,742 · 0 fail** (definitive json) + **extended 4,681/0 (quarantine CLEARED)** + build clean. User: "ไล่ทำทั้งหมดอย่าให้เหลือ อย่างรอบคอบห้ามขี้เกียจ และต้องไม่มีบั๊คเพิ่มเติมแล้ว". **① AV209 positional-rowId TOCTOU CLOSED (เงิน)**: NEW `resolveCourseRowIndex` identity-first (courseId hard-fail-on-miss > hint validated by name/product รวม `''`-as-constraint > unambiguous LIVE search > Thai stale error) ทุก courses[] mutator + NEW `removeCustomerCourseRowAtomic` แทน getCustomer→splice→updateCustomer (Rule T) + 6 UI callsites ส่ง identity + terminal-row SPLIT semantics (hint identity-match ชนะแม้ terminal → `COURSE_ROW_TERMINAL_MSG` downstream; search ไม่จับ terminal twin). **3 บั๊คแฝงที่จับได้เอง**: audit "ลดคงเหลือ" fail เงียบตั้งแต่ 06-09 (whitelist ไม่มี 'reduce' — L2 จับ) · PermissionGroupsTab `<Loader2/>` ไม่ import → จอดำตอนกดลบ (V163 class; extended sweep จับ; NEW `lucide-icon-import-classifier` ปิด class) · `applyCourseRefund` ไม่กัน 'ยกเลิก' → double-reimbursement record (Phase-16.5 hole; hunt R3 จับ). ② doctorName-edge (`resolvePersonNameById` 3 ชั้น, 3 save sites) ③ TFP resilient-timeout (15s → ลองใหม่; run-seq invalidate ก่อน reconnect) ④ ArcBloom deep-link (`initialBloomClosed`) ⑤ TFP buy-modal extraction step 3 (verbatim; **Rule Q L1 Playwright 10/10 บน prod จริง** — fixture '2867' ถูกลบจาก prod = สาเหตุ spec เดิมตายทั้งไฟล์ → seed TEST- + env override) ⑥ opd_sessions archive retention >180d (cron 03:20 BKK + guards isPermanent/live-link/booking-referenced/no-timestamp + dual-type ts + cursor pagination + registry/UI; prod dry-run 0 eligible) ⑦ ws1-probe-vandal `{hacked:true}` ลบ (Rule M + audit) ⑧ patient-view warmup `?ping=1` + cron */5 (ฆ่า cold LCP floor ~3.5s; handler รันจริงบน prod) ⑨ extended quarantine CLEARED (49 ไฟล์/~320 asserts repointed + 25 obsolete V50 asserts ลบ). **Hunt (≤2 agents/รอบ + adjudicate first-hand)**: R1→5 confirmed fixed (รวม `''`-constraint semantics + retry-ordering ที่ผมสร้างเอง) · R2→1 (R1 terminal-exclusion redirect ไป twin — A13 เคยล็อคพฤติกรรมผิด, rewrite) · R3→1 pre-existing → **0 จากงานวันนี้ = CONVERGED**. **Rule Q**: L2 `e2e-av209-course-row-identity.mjs` **17/0 real prod re-run ทุก round** + L1 10/10 + retention/warmup executed on prod. Honest gaps: user L1 ทั้ง stack · warmup/retention มีผลจริงหลัง deploy · irreducible legacy-twin tail (backfill courseId ถ้ากัด). Checkpoint `.agents/sessions/2026-07-19-sweep-all-backlog.md`.
- **NEW (2026-07-18) — TFP Entry SWR cold-start fix (AV208): root cause 3 ชั้นวัดจริง + fix 4 ชั้น + bug-hunt loop R1(4)→R2(4)→R3(0) CONVERGED — SHIPPED + DEPLOYED LIVE**: master = prod (vercel `lover-clinic-4hr8of3tr` aliased lover-clinic-app.vercel.app HTTP 200; **firestore.rules UNCHANGED → vercel-only, no Probe-Deploy-Probe**; post-deploy L1 probe บน LIVE prod: chip + cache paint + 18KB delta @400kbps ✓). Full vitest **17,631/17,631 · 0 fail** + AV208 bank 76/0 + build clean. User: TFP กดเข้าแล้วหมุนค้างบน WiFi คลินิก (5G เร็ว·หน้าอื่นเร็ว·เครื่องเปิด TFP บ่อย=ช้าสุด) + สั่ง "แก้ให้หายขาด + loop bug hunt จนหมดบั๊ค ≤5 agents/รอบ". **Root (วัดจริงบน LIVE prod จากเครื่องคลินิก)**: (1) TFP หลุดจาก AV206 sweep → หน้า staff เดียวที่ first paint ผูก network 100% (~600 docs/520-630KB ทุกการเปิด); (2) working set ~17.6MB raw ≈ ~44MB IDB ชนเพดาน cache default 40MB → เครื่องใช้หนัก LRU-evict → cold pull ทุกรอบ; (3) WiFi แย่เป็นตัวคูณ (cold 2.4/7.2/23.8s ตาม link vs warm delta ~4KB ≤3.2s เสมอ). ไม่ใช่ IP block · ไม่ใช่ cookie (ล้าง cache ยิ่งแย่). **Fix 4 ชั้น**: TFP swrRun 2-pass (fetch/apply split verbatim + 3 cache-MISS gates + hydration/prefill-once + SyncIndicator chip + save-gate 15s) · `cacheSizeBytes: 200MB` · idle prefetch 6 listers @ 2 staff shells · **AV208 full-scan classifier** (จับ 8 ไฟล์ unclassified เพิ่มตั้งแต่รันแรก + prove-red). **Bug-hunt**: R1 (5 lenses) → 4 confirmed เงิน/สต็อคทั้งหมด (applyChain serialization กัน `courseItems=[]` V101-class · treatment server-fresh กัน stale snapshot/concurrent-edit · DF-rate `!tfpSyncing` gate · skip-flag write-time live-resolve) · R2 (2 agents โจมตี R1 fixes) → 4 hardenings (per-link catch · single shared point-read · classifier regex holes · doctors MISS gate+prefetch) · R3 → 0 = **converged**. **Rule Q L1 adversarial 5/5 บน real prod**: typing ระหว่าง sync ไม่โดนทับ · กด save ตอน chip โชว์ → gate อั้น → doc ถูกต้อง · Q-vis eyeballed; probes: reopen ดึง **4-18KB** (เดิม 630KB), spinner ~0.5-2s แม้ 400kbps/500ms. 4 V21 repoints. **User L1 pending หลัง deploy** (เครื่องคลินิกช้าจริง + มือถือ). Checkpoint `.agents/sessions/2026-07-18-tfp-entry-swr.md` · spec/plan `docs/superpowers/{specs,plans}/2026-07-18-tfp-entry-swr-coldstart-fix*`.
- **NEW (2026-07-08) — Reports-home fully functional: 7 mislabeled/hidden tabs WIRED + 4 data-ready new report tabs + dead cards removed — SHIPPED + DEPLOYED LIVE**: master = prod (deployed `vercel --prod` `lover-clinic-n999lj1l7` aliased lover-clinic-app.vercel.app HTTP 200 + fresh version.json; **firestore.rules UNCHANGED → frontend-only, no Probe-Deploy-Probe**). Full vitest **17,573/17,573 · 0 fail** + build clean. User (verbatim): *"ทำให้หน้านี้ใช้ได้ทุก fucntion และเอาที่แนะนำเพิ่มเติมด้วย ... ถ้าได้ก็จัดการเลย"* (screenshot of รายงาน landing page). **Finding = V52-class wiring gap**: `ReportsHomeTab` landing grid is a hand-maintained mirror of "which reports exist" that DRIFTED from navConfig — **7 fully-built, registered, working tabs** (~2,445 LOC) were shown as "เร็วๆนี้"/hidden (กำไรขาดทุน `reports-pnl` / รายจ่ายทั้งหมด `expense-report` / ค่ามือแพทย์ `reports-df-payout` / คอร์สคงเหลือ `reports-remaining-course` / รายงานคลินิก `clinic-report` / สรุปบัญชีรับชำระ `reports-payment` / **Smart Audience** — a real 507-line Phase-16.1 tab stale-labeled "Phase 10b"); the left menu opened them fine, only the landing grid pointed wrong. `/brainstorming`(Q1=A wire-all + build-data-ready / Q2=remove-all-dead-cards; Visual Companion status-map + after-mockup)→spec→`/writing-plans`→`/executing-plans` inline (per no-large-agent-fanout lock). **Wired all 7** + **built 4 new report tabs** (ReportShell + DateRangePicker + pure SSOT aggregator + CSV + V52 BS-11 branch-scope + Rule E): `reports-alt-sales` (online+vendor via listOnlineSales/listVendorSales; realized = online paid/completed, vendor confirmed) · `reports-outstanding` (ค้างชำระ) · `reports-stock-alert` (expiry+low-stock via stockUtils `hasExpired`/`daysToExpiry` + per-product `alertDayBeforeExpire`/`alertQtyBeforeOutOfStock`) · `reports-stock-movements` → **reuses existing MovementLogPanel** (ponytail — richer viewer already exists, don't rebuild a duplicate). Removed ALL dead cards (Q2) → **zero "เร็วๆนี้"/disabled remain**. **Drift-guard test** (`tests/reports-home-wiring-drift-guard.test.js`: every active card.tabId ∈ registered navConfig ids; no `status:'soon'`; no `tabId:null`) → this wiring-gap class **can't recur** (institutional lock, the V52 lesson). **🔬 Rule Q L2 caught a would-ship bug (the session's key catch)**: outstanding first read `totalPaidAmount` — **undefined on EVERY live sale** → would have shipped **฿1.67M of FAKE receivables** (180/219 fully-paid sales flagged as ค้างชำระ). Real payment lives in `payment.channels[{method,amount,enabled}]`; `billing.netTotal` already nets deposit/wallet (must NOT re-add). Fixed → prod outstanding = **0** (clinic is pay-at-point-of-sale: 215 paid + 4 cancelled, all reconcile). **Exact same class as the recon false-positive** — proof that Rule Q L2 vs REAL prod is non-negotiable; `scripts/diag-reports-new-l2.mjs` (adversarial re-verify: 0 false positives after fix) + OS5 deposit-netting guard test. **Verified**: aggregator units 13/0 + registration/deep-link 13/0 + drift-guard 5/0 + **Rule I flow-simulate 16/0** (real render, every card routes to its exact tabId) + **Rule Q L2** (3 aggregators vs real prod) + **Rule Q L1 Playwright on REAL prod** (home grid: all categories 9/9·2/2·2/2·1/1·5/5 active, 0 dead cards, Smart Audience live; stock-alert tab renders REAL data — Elonza near-expiry lot + 24 low-stock — through card→loader→aggregator→ReportShell; **screenshots eyeballed Q-vis**). 1 V21 repoint (TAB_PERMISSION_MAP 61→65). **DEPLOYED LIVE** (vercel-only; alias 200). User L1 pending. Checkpoint `.agents/sessions/2026-07-08-reports-home-wire-up.md` · spec/plan `docs/superpowers/{specs,plans}/2026-07-07-reports-home-wire-and-new-reports*`.
- **NEW (2026-07-07 EOD+3) — Fable-5 final batch: TFP extraction ×2 + Money Reconciliation (tab+cron) + CentralStock in-place modal + extended-suite revival — SHIPPED + DEPLOYED LIVE**: master = prod (vercel-only; **firestore.rules UNCHANGED → no Probe-Deploy-Probe**; alias 200 + live cron L2 `recon-daily-20260706` written on the DEPLOYED endpoint). FINAL gate **full vitest 17,526/17,526 · 0 fail** (flake ก็ผ่าน) + **extended 2,668/0** + build clean. ① **TFP extraction steps 1+2** (extraction-only, verbatim): 7 memo leaf components → `treatment-form/TfpFormPrimitives.jsx` + 6 item modals (lab/med/medGroup/remed/cons/consGroup) → `TfpItemModals.jsx`; TFP 5,946→5,330; state/handlers อยู่ที่เดิม (explicit props), mount-conditionals ที่ callsites (V160); buy modal ไม่ย้าย (V13 เงิน — session หน้า); V21 repoints tf2/TF3/V125/cc-row = family-union scans; execution smokes 8/0 (V163 net). ② **Reconciliation (V155/V157 residual CLOSED)**: SSOT pure `reconcileSaleCore.js` (injected fetchers) → tab `reports-reconciliation` (BS-11, drill-down, cron banner) + cron 04:15 BKK idempotent `recon-daily-YYYYMMDD`; deterministic-only discrepancies (deposit/wallet V158/cancelled V153/courses V104-class), stock+active-points = INFO; **Rule Q L2 จริง 17 ใบ → จับ false positive 1 ตัว (source:reduceRemaining audit-sale) → ฆ่าก่อน ship → 17/17 clean**; **Rule Q L1 Playwright บน prod data จริง: 39 ใบ นครราชสีมา → ตาราง+ยอดบาทจริง+all-clear+drill-down (screenshot eyeballed)**; L1 จับบั๊คจริง: tab หายจาก ALL_ITEM_IDS (deep-link whitelist) → ลงทะเบียน navConfig. ③ **CentralStockTab in-place modal** — V144/AV173 deferred instance CLOSED (`CentralStockActionModal` warehouse-scoped; CB1 flipped; AV173 both SKILL.md, SY1). ④ **extended revival** — ROOT CAUSE: vite.config เป็น FUNCTION (filler-obfuscator ~06-20) แต่ extended config spread เป็น object → jsdom หาย → .jsx ตายเงียบทั้งหมด; fix = call function (+125 เทส); 317 stale asserts/49 ไฟล์ → `quarantineStale20260707` ledger. **Wishlist ที่ stale (verify-first ได้ผล)**: chart Storage-ref ทำแล้ว 05-22 + legacy inline = 0 บน prod; movement-log มี V106 retention cron แล้ว. Backlog เหลือ → memory `project_next_model_backlog.md`. Checkpoint `.agents/sessions/2026-07-07-fable-final-batch.md`.
- **NEW (2026-07-07 EOD+2) — Instant Cold-Start (AV206+AV207) SHIPPED + DEPLOYED LIVE (deploy ships AV205 ด้วย)**: master `2cf71bdc` = prod (vercel-only, **firestore.rules UNCHANGED → no Probe-Deploy-Probe**; alias HTTP 200 + sw.js no-cache header live). User video: iPhone PWA cold-start after long gap → นัด hub "กำลังโหลด…" 7-10+s. `/brainstorming`(Q1=A SWR staff + ลูกค้า fresh-gate — REVERSES 2026-06-16 fresh-always ฝั่ง staff / Q2=A hub 2 จังหวะ / Q3=B ทั้ง staff app / Q4=B SW)→spec→plan→inline. **Fix 5 ชั้น**: `persistentLocalCache`+multi-tab+IDB-detect+storage.persist (listener SWR ฟรีทั้งแอป) · NEW `freshGate.js` (PatientForm+ClinicSchedule ลูกค้าไม่มีวันเห็น cache; ?patient==server API) · NEW `swrRead.js` swrRun/swrList + `{source:'cache'}` 16 getters + `_tagCache` `__fromCache` honesty · hub loadCore/loadEnrichment + SyncIndicator + chip skeleton · sweep 12 staff tabs (`docs/perf/swr-inventory.md` closed list; reports/stock-ops/modals SANCTIONED) · vite-plugin-pwa SW (shell precache เล็ก + /assets CacheFirst, ห้าม /api+googleapis, update toast + kill-switch, **FCM SW → dedicated scope** — 2 SW แชร์ '/' จะ replace กัน). **2 บั๊คที่ L1 จับ**: network-down getDocs คืน cache เงียบ → indicator โกหก (fix REAL snap.metadata.fromCache) + S4 `reg.active`@'activating' race (โผล่เฉพาะ prod เน็ตจริง). **Verified**: full vitest **17,485/17,486** (1 = phase15.5b flake เดิม 51/0 isolated; 2 V21 repoints) + build clean + **Rule Q L1 Playwright 4/4 บน LIVE prod** (offline SWR paint+honest indicator / server correction / customer fresh-gate / SW offline shell) + parity 34/40 + 6 dark flags = starfield noise (hub/link 0.000%) + **วัดจริง 1736→566ms (−67%) data-on-screen**. AV206/AV207 both SKILL.md (SY1). Honest gap: user L1 มือถือ/iPad จริง (batch นี้ + AV205); push re-scope self-heals on next staff load. Checkpoint `.agents/sessions/2026-07-07-instant-coldstart.md` · spec/plan `docs/superpowers/{specs,plans}/2026-07-07-instant-staff-app-cold-start*` · perf `docs/perf/instant-coldstart-report.md`.
- **NEW (2026-07-07 EOD+1) — Universal modal scroll-lock (AV205) SHIPPED local, NOT deployed → DEPLOYED EOD+2 (รวมใน deploy ข้างบน)**: master `a5761d63` (11 commits ahead of prod `92b9ba15`); **firestore.rules UNCHANGED → deploy = vercel-only, NO Probe-Deploy-Probe**. User: เปิด modal แล้ว scroll นิ้ว/ล้อเมาส์ไปเลื่อน background แทน — หลายจุดทั่วแอป (77 overlay files, containment มีแค่ 2 จุด). `/brainstorming`(Q1=lock modal+lightbox+drawer+palette / Q2=backdrop no-op)→spec→plan→inline sweep (NO agent fan-out per memory lock). **Root**: backend/admin เลื่อนด้วย INNER scroller (AdminDashboard:5065) → wheel บน backdrop chain เข้า background; body-lock อย่างเดียวไม่พอ. **Fix 3 ชั้น**: (1) NEW `src/lib/useModalScrollLock.js` — ref-counted `html[data-modal-open]` (index.css: overflow:hidden + body touch-action:none + `--scroll-lock-gutter` กัน layout shift) + `ModalScrollLock` null-component (inline hosts); (2) sweep ~68 ไฟล์: fixed inset-0 นอกสุดเติม `overflow-y-auto overscroll-contain` + panel max-h≤90vh audit; (3) **anti-confinement เจอจาก Q-vis screenshot** — V86 glow hover-lift transform = containing block → WholeSystemBackupModal โดน confine 1214×106 (probe-measured, AV117 class หลุดรอด) → `html[data-modal-open] card:has(.fixed){transform:none}` → re-probe เต็ม viewport (0,0,1280,540). Sanctioned (classifier closed list): print views + full-screen editors + dropdowns + BackendMobileDrawer (Radix) + StaffChatPanel (V82-fix7-bis เดิม ห้าม migrate). **Verified**: hook unit 9/0 + dynamic classifier 83/0 (ไฟล์ fixed-inset-0 ต้อง locked-or-sanctioned) + full vitest **17,427/17,428** (1 fail = phase15.5b flake เดิม, isolated 51/0; **0 V21 fixups**) + build clean + **Rule Q L1 Playwright trusted-wheel 4/4** (`page.mouse.wheel` CDP = native scroll: palette + WholeSystemBackupModal — background scrollers+window frozen / เนื้อหา modal เลื่อน / ปิดแล้วปลด) + Q-vis screenshots eyeballed. AV205 ทั้ง 2 SKILL.md (SY1 เขียว). Honest gap: user L1 (นิ้วจริง iPad/มือถือ); iOS<16 residual (no overscroll-behavior). Checkpoint `.agents/sessions/2026-07-07-modal-scroll-lock.md` · spec/plan `docs/superpowers/{specs,plans}/2026-07-07-modal-scroll-lock*`.
- **NEW (2026-07-07 cont.) — link-patient LCP fix (AV204) + customer-link header strip + configurable LINE id-link keywords — ALL SHIPPED + DEPLOYED LIVE**: master `92b9ba15` = prod (vercel `lover-clinic-y5fpano5s` aliased lover-clinic-app.vercel.app HTTP 200; **firestore.rules UNCHANGED → no Probe-Deploy-Probe**). Full vitest **17,336/17,336 · 0 fail** (definitive json run); build clean. **① LCP fix**: /api/patient-view needed NO auth/settings but waited behind anon-auth gate → lazy chunk → clinicSettingsLoaded (~1.2-1.8s dead serial) — NEW `patientViewEarlyFetch.js` entry-time consume-once fetch + endpoint branch-gets Promise.all (L2 payload-identical) + NARROW `/api/patient-view` vite preview/dev proxy (surface measurable for real — old 4.3s baseline was partly harness artifact). **Local 3780→2040ms (−46%) · LIVE prod 3472→2212ms (−36%)**. 2-agent adversarial review (ultracode ≤4-agent cap): warm-import module-map poisoning REMOVED (iOS Safari caches failed chunk fetch → React.lazy black screen) + B6 proxy lock made structural. Probe 24/24 (single request · failure→retry-UI→recover · 12s-slow auto-retry · route sweep) + parity 0.000% + DISABLED-branch live lifecycle 11/11 (TEST fixture → pristine). **② Header strip (brainstormed Q1=B/Q2/Q3)**: การ์ด ?patient= = ชื่อ+เบอร์กึ่งกลาง (avatar+HN ออก), "ข้อมูลลูกค้า"/"Customer Info", `hn` STRIPPED from the anon payload — LIVE L1 5/5 + screenshots eyeballed. **③ Keywords (Q4=global; spec AMENDED chat_config→NEW doc `clinic_settings/link_id_keywords` เพราะ chat_config secret-locked WS1-C2-bis; wildcard rule ครอบ → zero rules change)**: `interpretCustomerMessage(text,{idLinkKeywords})` pure layer (escape+longest-first; defaults=legacy byte-equivalent) + validate + webhook 60s-TTL cached read + hint follows first keyword + `KeywordSettingsCard` ใน LinkRequestsTab — **LIVE round-trip 22/22 on real prod** (default chips → add → save → real doc → interpret triggers → empty-list blocked → cleanup pristine). +51 tests · 3 V21 repoints. Honest gap: bot on real LINE w/ custom keyword = user L1. Checkpoint `.agents/sessions/2026-07-07-lcpfix-header-keywords.md`.
### Session 2026-07-19 EOD+3 — Infra Health Monitor + Error Beacon (AV211) + TFP #20 — SHIPPED local, NOT deployed

master `2d6ac980` (4 ahead of prod `a61ad87a`; rules UNCHANGED → deploy = vercel-only). Full vitest **17,887/0** (definitive json) + build clean. iPhone popup user-confirmed → AV210 closed.
- User: "ทำหมดเลย แต่ห้ามเพิ่มบั๊ค" → 3 งาน: health monitor + error beacon + TFP keystroke (#20).
- **Health cron** 07:30 BKK: อ่าน scheduled_task_status (SSOT เดิม) + recon doc + push tokens + error count →
  pure evaluate → alert **staff-chat card + LINE OA** (อิสระจาก FCM) เมื่อ warn/red — ปิด class ตายเงียบ
  (AV210/V122/dead-cron = repro fixtures) + classifier: cron ใหม่ต้องประกาศ coverage ไม่งั้นเทสแดง.
- **Beacon**: ทุกหน้า (staff+ลิ้งลูกค้า) → /api/client-error (cap 500/วัน, URL strip ค่า param — PHI-safe) →
  client_error_log default-deny (ศูนย์ rules change) + ErrorBoundary (จอดำ→ปุ่มโหลดใหม่) + viewer ในการ์ด
  "🩺 สุขภาพระบบ" (SystemSettingsTab) + task 12 ใน ScheduledTasksTab.
- **TFP #20**: view-filter state ย้ายเข้า TfpBuyModal — keystroke ไม่ re-render ฟอร์มเงิน; money path เดิม 100%.
- **Rule Q**: L2 จริง (diag 13/14 ok + 1 true-warn บน prod · endpoint e2e 10/0 · beacon sendBeacon proof จริง)
  + Playwright L1 10/10 (TEST fixture cleaned). AV211 both copies SY1.
- Honest gaps: alert ตัวจริง + beacon full round-trip = post-deploy (user ตั้ง LINE target + กดทดสอบ).
- Checkpoint `.agents/sessions/2026-07-19-eod3-observability-tfp20.md`.

### Session 2026-07-19 EOD+2 — AV210: fleet-wide silent push outage — FIXED + DEPLOYED + live-verified

master `fe40702f` (fix `a61ad87a`) = prod (vercel-only; rules UNCHANGED). Full vitest **17,788/0** + AV210 bank 23/0 + build clean.
- Root (พิสูจน์: console Chrome จริงของ user + curl headers + git archaeology): WS4 CSP ไม่มี gstatic → latent 27 วัน →
  AV207 scope-move = trigger → FCM SW eval fail ทุกเครื่อง; zombie subscriptions บน handler-less sw.js กลืนทุก send
  เป็น "success" → เงียบสนิท 12 วัน. SW file บริสุทธิ์ (unchanged ตั้งแต่ initial commit 03-23).
- Fix: per-path CSP (SW เท่านั้น — page hardening คงเดิม) + zombie cleanup ที่ 2 mint sites + AV210 invariant (SY1) +
  V-entry + Rule M prune script + test-send diag (`--send` = Rule Q L1 "ต้องเห็น noti เด้งจริง").
- Post-deploy: header ✓ · desktop mint token แรกใน 54 วัน · **iPhone heal เองไม่ต้องแตะ** · prune 8/8 → fresh 2/zombie 0 ·
  test push 2/2. Full-suite จับ SY1 byte-diff จาก sync script ของผมเอง → แก้ด้วย verbatim copy.
- Honest gaps: iPhone popup = user-confirm pending · dev-PC toast = Windows OS-muted (ไม่ใช่บั๊คแอป).
- Checkpoint `.agents/sessions/2026-07-19-eod2-av210-push-outage.md`.

### Session 2026-07-19 EOD+1 — Tail + /audit-all final + VIP sort + wheel guard — SHIPPED + DEPLOYED LIVE

master `2610a1a6` = prod (vercel `lover-clinic-kbqgmhp8h` aliased 200; rules UNCHANGED → vercel-only; ping 200). Full vitest **17,777/17,777 · 0 fail** + build clean.
- **AV209 tail ปิดถาวร**: writers stamp `crs-` per-row courseId + Rule M backfill `crsbf-` 523 rows/123 docs
  บน prod (idempotent 0 ก่อน+หลัง deploy; L2 17/0 re-run; real-row byId exact). add-picks strips template id.
- BranchesTab `settings.phone/address` dual-read (V51) · VIP sort chip "👑 VIP ก่อน" (`useVipIds`,
  stable sort ตรง badge; L1 Chrome 9/9 + Q-vis) · fb verify_token masked (A4).
- **/audit-all final**: 238 invariants → 0 CRITICAL/HIGH/MEDIUM; 6 stale skill docs refreshed
  (C3 sanctioned / C5 exists / F3 V144 / UC2 gold / AN4 V78 / clone-sync RETIRED + api-layer RESCOPED).
- **Wheel guard**: global safe-by-default — untagged number input = blur-on-wheel (เงิน+TFP ทุกช่อง);
  22 qty inputs = ±1 เสมอ. Playwright trusted-wheel 2/2; Chrome-MCP scroll = gesture (ยิง wheel ไม่ได้ — logger พิสูจน์).
- Cron คืนแรก: retention doc รอบแรกคืนนี้ 03:20 (เช็คพรุ่งนี้) · warmup ttfb 0.66-1.24s ✓.
- Checkpoint `.agents/sessions/2026-07-19-eod1-tail-audit-wheelguard.md`.

### Session 2026-07-19 — Full backlog sweep (9 items) + AV209 + hunt CONVERGED — SHIPPED + DEPLOYED LIVE

master `39b23d99` = prod (vercel `lover-clinic-cbq2qwbdq` aliased lover-clinic-app.vercel.app 200; rules UNCHANGED → vercel-only; post-deploy `?ping=1` 200 `{ok,ping}` + 13 crons รวม 2 ใหม่). FINAL: full vitest **17,742/17,742 · 0 fail** + extended **4,681/0** (quarantine CLEARED) + build clean.
- User: "ไล่ทำทั้งหมดอย่าให้เหลือ อย่างรอบคอบห้ามขี้เกียจ และต้องไม่มีบั๊คเพิ่มเติมแล้ว" → 9-item sweep + bug-hunt until 0.
- **AV209 (เงิน)**: `resolveCourseRowIndex` identity-first + `removeCustomerCourseRowAtomic` (Rule T) + 6 callsites +
  terminal SPLIT semantics. โบนัสจับ: reduce-audit whitelist (fail เงียบตั้งแต่ 06-09) · PermissionGroupsTab Loader2
  จอดำ (V163; lucide classifier ปิด class) · refund-on-cancelled double-reimbursement (Phase-16.5; R3).
- อื่นๆ: doctorName-edge · TFP resilient-timeout (run-seq invalidate ก่อน reconnect) · ArcBloom deep-link ·
  buy-modal extraction (L1 10/10 prod) · opd_sessions retention cron 03:20 (+guards+cursor; dry-run 0 eligible) ·
  ws1-vandal ลบ · patient-view `?ping=1` + cron */5 · extended quarantine cleared (49 ไฟล์).
- **Hunt**: R1(5 fixed จากงานตัวเอง) → R2(1 — R1 เอง redirect ไป twin; A13 rewrite) → R3(1 pre-existing) → 0 = converged.
- **Rule Q**: L2 AV209 e2e 17/0 real prod ทุก round · L1 Playwright 10/10 real prod · retention/warmup handlers รันจริง.
- Honest gaps: user L1 stack · warmup/retention effective หลัง deploy · legacy-twin tail (Rule M backfill ถ้ากัด).
- Checkpoint `.agents/sessions/2026-07-19-sweep-all-backlog.md` · V-entry "Backlog Sweep (AV209)" ใน 00-session-start.md § 2.

### Session 2026-07-18 — TFP Entry SWR cold-start fix (AV208) — SHIPPED + DEPLOYED LIVE

master = prod (vercel `lover-clinic-4hr8of3tr` aliased lover-clinic-app.vercel.app 200; rules UNCHANGED → vercel-only). full vitest **17,631/17,631 · 0 fail**; build clean; Rule Q L1 adversarial 5/5 + post-deploy LIVE probe green (chip/cache-paint/18KB delta).
- User: TFP spinner ค้างบน WiFi คลินิก (5G เร็ว, หน้าอื่นเร็ว, เครื่องใช้หนัก=ช้าสุด). Root วัดจริง: TFP หลุด
  AV206 sweep (600-doc/630KB server pull ทุกการเปิด — หน้าเดียวที่ paint ผูกเน็ท) + working set ~44MB
  ชน cache cap 40MB → LRU evict บนเครื่องใช้หนัก + WiFi แย่คูณ. ไม่ใช่ block/cookie.
- Fix 4 ชั้น: swrRun 2-pass + chip + save-gate 15s · cacheSizeBytes 200MB · idle prefetch 6 listers ·
  AV208 full-scan classifier (จับ 8 ไฟล์หลุดเพิ่ม + prove-red).
- Bug-hunt loop (≤5 agents/รอบ): R1 → 4 confirmed (ทั้งหมดเงิน/สต็อค: applyChain V101-class window /
  stale treatment snapshot / DF rate / skip flag) → R2 → 4 hardenings → R3 → 0 = CONVERGED.
- ตัวเลข: reopen ดึง 4-18KB (เดิม 630KB) · spinner ~0.5-2s แม้ 400kbps/500ms · cold ยัง server-paint ถูกต้อง.
- DEPLOYED 2026-07-18 EOD + probe บน LIVE prod ✓. Next: **user L1 เครื่องคลินิกช้าจริง + มือถือ** (ห้ามล้าง
  cache เป็น folk-fix — ยิ่งแย่). Backlog: TFP resilient-timeout · positional-rowId watchlist · doctorName-filtered edge.
- Checkpoint `.agents/sessions/2026-07-18-tfp-entry-swr.md`.

### Session 2026-07-08 — Reports-home fully functional (wire 7 + build 4 new) — SHIPPED + DEPLOYED LIVE

master = prod (deployed vercel-only `lover-clinic-n999lj1l7`, alias 200; firestore.rules UNCHANGED → no Probe-Deploy-Probe). full vitest **17,573/17,573 · 0 fail**; build clean.
- V52-class wiring gap: `ReportsHomeTab` landing grid drifted from navConfig — 7 built+registered working
  tabs shown "เร็วๆนี้"/hidden (pnl / expense-report / df-payout / remaining-course / clinic-report / payment
  / **Smart Audience** — a real 507-line Phase-16.1 tab). Wired all 7 to their real tabIds.
- Built 4 new report tabs (ReportShell + pure SSOT aggregator + BS-11 branch-scope + Rule E): alt-sales
  (online+vendor) · outstanding (ค้างชำระ) · stock-alert (expiry+low-stock, product thresholds) ·
  stock-movements → **reuses MovementLogPanel** (ponytail — don't rebuild a richer existing viewer).
  Removed ALL dead cards (Q2) → zero "เร็วๆนี้"/disabled remain.
- **Drift-guard test**: every active home card.tabId ∈ registered navConfig ids → this wiring-gap class
  can't recur (institutional lock — the V52 lesson).
- 🔬 **Rule Q L2 caught a ฿1.67M fake-receivables bug**: outstanding first read `totalPaidAmount` (undefined
  on EVERY live sale → 180/219 paid sales flagged). Real payment = Σ`payment.channels[]`; netTotal already
  nets deposit/wallet. Fixed → prod outstanding 0 (pay-at-point-of-sale). Same class as the recon FP.
- **Rule Q L1 Playwright on prod**: home grid all categories N/N active + 0 dead cards + Smart Audience live;
  stock-alert tab renders REAL data (Elonza near-expiry + 24 low-stock) via card→loader→aggregator→shell.
  Screenshots eyeballed (Q-vis). Verified: units 13/0 + reg 13/0 + drift 5/0 + Rule I flow-sim 16/0 + L2 + L1.
- 1 V21 (TAB_PERMISSION_MAP 61→65). **DEPLOYED LIVE** (vercel-only). User L1 pending. Checkpoint `.agents/sessions/2026-07-08-reports-home-wire-up.md`.

### Session 2026-07-07 EOD+2 — Instant Cold-Start (AV206+AV207) — SHIPPED + DEPLOYED LIVE

master `2cf71bdc` = prod (vercel-only; rules UNCHANGED → no Probe-Deploy-Probe; ships AV205 too). Full vitest **17,485/17,486** (1 known flake, 51/0 isolated); build clean.
- User video: PWA cold-start after long gap → นัด hub loading 7-10+s. Fix = SWR everywhere it's safe:
  persistentLocalCache (layer 0, listeners free) · freshGate (customers NEVER see cache) · swrRead
  {source:'cache'} + __fromCache honesty · hub 2-stage + SyncIndicator + chip skeletons · 12-tab
  sweep (inventory closed list) · app-shell SW (AV207: static-only, FCM re-scoped, kill-switch).
- Rule Q L1 4/4 **on LIVE prod** + measured 1736→566ms (−67%) data-on-screen + parity adjudicated.
- 2 real bugs caught by the L1 itself: indicator honesty (network-down getDocs serves cache
  silently) + SW 'activating' race (prod-only). AV206/AV207 both SKILL.md; SY1 green.
- User L1 pending: มือถือจริง cold-start + AV205 modal scroll + push still arrives (FCM self-heal).
- Checkpoint `.agents/sessions/2026-07-07-instant-coldstart.md`.

### Session 2026-07-07 EOD+1 — Universal modal scroll-lock (AV205) — SHIPPED local, NOT deployed

master `a5761d63` (11 ahead of prod `92b9ba15`); rules UNCHANGED → deploy = vercel-only. full vitest **17,427/17,428** (1 = phase15.5b flake เดิม, isolated 51/0; 0 V21 fixups); build clean.
- Fix บั๊ค class ใหญ่: เปิด modal แล้ว scroll ไปเลื่อน background (77 overlay files). 3 ชั้น:
  hook `useModalScrollLock` (ref-counted html[data-modal-open]) · sweep ~68 ไฟล์ backdrop
  `overflow-y-auto overscroll-contain` + panel max-h audit · layer-3 anti-confinement
  (`html[data-modal-open] card:has(.fixed){transform:none}` — V86 hover-lift confine ที่จับจาก Q-vis).
- Sanctioned (classifier closed list): print views · full-screen editors · dropdowns · BackendMobileDrawer (Radix) · StaffChatPanel (V82 เดิม).
- Rule Q L1 Playwright trusted-wheel 4/4 (background frozen / modal scrolls / unlock) + screenshots eyeballed; hook 9/0 + classifier 83/0; AV205 both SKILL.md (SY1). e2e helpers.js รองรับ ArcBloom new menu.
- NO agent fan-out (memory lock). User L1 pending (นิ้วจริง). Checkpoint `.agents/sessions/2026-07-07-modal-scroll-lock.md`.

### Session 2026-07-07 (cont.) — LCP fix + header strip + LINE keywords — SHIPPED + DEPLOYED LIVE

master `92b9ba15` = prod (frontend+api only, rules unchanged). Full vitest **17,336/0**; build clean.
- **link-patient LCP (AV204)**: entry-time early fetch (`patientViewEarlyFetch.js`, consume-once, retry
  loop untouched) + endpoint branch-parallel + narrow vite proxy. Local −46% · **LIVE −36% (3472→2212ms)**.
  Adversarial review killed the warm-import (module-map poisoning) + hardened the B6 proxy lock.
- **Customer-link header** (Q1=B): centered name+phone, no avatar/HN, "ข้อมูลลูกค้า"/"Customer Info";
  `hn` stripped from the anon payload. LIVE L1 + screenshots eyeballed.
- **Configurable id-link keywords** (Q4=global, AMENDED → NEW doc `clinic_settings/link_id_keywords`):
  pure interpret layer + validator + webhook 60s-TTL read + settings card in LinkRequestsTab + dynamic
  hint. LIVE round-trip 22/22 on real prod (pristine cleanup). Defaults = legacy behavior byte-equivalent.
- Verification: probes 24/24 + 11/11 + 12/12 + 22/22 + 5/5 live · parity 0.000% · L2 payload-identical ·
  +51 tests · 3 V21 repoints. User L1 pending (มือถือจริง + LINE จริง).
- Checkpoint `.agents/sessions/2026-07-07-lcpfix-header-keywords.md`.

### Session 2026-07-07 — Whole-app perf campaign (P0-P3) — SHIPPED + DEPLOYED LIVE

master = prod (`lover-clinic-lh9waq3po` aliased lover-clinic-app.vercel.app; frontend-only, rules unchanged). Final full vitest **17,287/0**; build clean.
- **P0**: reusable perf harness (`scripts/perf-*.mjs` + `npm run perf:*`) — full-surface metrics (median-of-3, dom-quiet+spinner-aware settle), bundle manifest, sharp pixel-parity gate, compare report, Rule R link discovery. Baselines local+prod + 51-finding audit → `docs/perf/punchlist.md` (29 items, verdicts).
- **P1 bundle (−44% backend JS)**: recall-chunk 903KB dissolved (had absorbed Firebase+backendClient, preloaded everywhere) · ~30 lazy conversions across both dashboards + App.jsx · preconnect · immutable cache · FOUC fade removed.
- **P2 render**: chat/presence re-render storms killed via equality guards (renderHook identity proofs) · CustomerCard/RecallRow memo · Intl hoist. 4 V21 repoints.
- **P3 data**: hub refetch debounce · chat_history client-delete → cron · **dead retention cron fixed** (Timestamp-vs-ISO-string type mismatch; V67 class) → verified live + drained 4,265→137 docs.
- Incidents (transparent): junction rm hazard nuked part of node_modules (recovered `npm ci`; memory locked) · rtk grep false-0 on prod HTML (PowerShell arbiter) · workflow fan-out halted mid-audit per user rate-limit directive (memory locked; findings salvaged).
- User L1 pending: เร็ว/ลื่นขึ้นจริง + หน้าตาเหมือนเดิม 100% + realtime ปกติ. Checkpoint `.agents/sessions/2026-07-07-perf-campaign.md`.


---

📂 **Older sessions (`2026-06-21` and earlier) + older Current-State index entries → `.agents/sessions/session-handoff-archive.md`** (cold storage, NOT read at boot).
