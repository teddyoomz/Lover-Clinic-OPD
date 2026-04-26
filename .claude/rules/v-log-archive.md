# V-log Archive — full V-entry detail (V1 → V32-tris-quater)

> **This file is NOT auto-loaded.** It exists so the compressed
> `00-session-start.md` § 2 can keep one-line summaries while preserving
> the full lessons + reasoning for each violation. Read this file when
> investigating a specific V-entry.

---

## 2. PAST VIOLATIONS (anti-example catalog — DO NOT repeat)

### V1 — 2026-04-19 — Broke webhook + calendar via strict firestore rules
- Commit `8fc2ed9` tightened pc_*/chat_conversations write rules → chat + calendar 403
- Root cause: no probe-deploy-probe. Fix created iron-clad B.

### V9 — 2026-04-20 — Phase 11.2 rules deploy broke cookie-relay (V1 repeat)
- Commit `5636eb4` (Phase 11.2 Product Groups CRUD + firestore.rules) deploy overwrote a Console-side permissive edit for `clinic_settings/proclinic_session*`.
- Chrome cookie-relay extension writes cached ProClinic cookies to those docs via Firestore REST PATCH **without Firebase auth token**. Live rule had `clinic_settings/{settingId}: write: if isClinicStaff()` — extension's unauth PATCH → **403 silent**.
- Consequence: extension popup sync appeared to succeed (grabbed cookies from browser) but `res.ok = false` on PATCH → `syncCookiesToDoc` returned false → `synced = 0` → extension reported failure OR (worse) looked OK while Firestore never got the cookies. Backend frontend "ทดสอบการเชื่อมต่อ" → Session หมดอายุ ทุกครั้ง.
- **Worst part**: I DID run Probe-Deploy-Probe. Pre+post probes returned 200/200. But **probe list only covered `chat_conversations` + `pc_appointments`**. The cookie-relay endpoint was never in the probe list → regression invisible.
- User (after hours of debugging cookie-relay code changes): "มึงไปยุ่งไรกะ firebase หรือยังไม่ได้ deploy firebase rules อะไรจยมันพังหรือเปล่า" — spotted the root cause immediately.
- Fix: commit `34ef493` added explicit rules for `clinic_settings/proclinic_session` + `proclinic_session_trial` (allow read, write: if true). Probe list in rule B extended to 4 endpoints + post-deploy strip.
- Lesson: Probe list in Rule B is the ONLY guard against this. Every new unauth-write path MUST land in the probe list at the same time it lands in `firestore.rules`. Forget that = regression waits 2 commits and then bites.

### V2 — 2026-04-19 — Phase 9 backend tabs linked to ProClinic
- PromotionTab/CouponTab/VoucherTab imported `brokerClient.createPromotion/Coupon/Voucher` → POSTed to `/admin/promotion` etc on ProClinic
- Also created `api/proclinic/promotion.js` + `coupon.js` + `voucher.js`
- Also added `pc_promotions` + `pc_coupons` + `pc_vouchers` to `firestore.rules`
- Root cause: forgot rule E (Backend = Firestore only). Fixed by removing all the above; creating rule E as an explicit iron-clad + this anti-example + new audit skill.

### V3 — 2026-04-19 — Phase 9 edit bug from guessing URL
- `handleUpdate` used `/admin/promotion/{id}/edit` + `_method=PUT` — ProClinic returned 404 (no such route)
- Root cause: violated Triangle Rule — guessed URL without `opd.js click` to capture real edit modal behavior. Fixed by deleting the API entirely per V2 fix.

### V4 — 2026-04-19 — Multiple `vercel --prod` without per-turn authorization
- User said "ถ้าจำเป็น ก็ deploy" once → I deployed 3-4 times in the session
- Root cause: violated rule 02 "Prior authorization ไม่ roll over". Each deploy = new explicit ask.

### V5 — 2026-04-19 — Over-simplified rules and lost context
- Collapsed 8 rule files → 4. Removed anti-examples. I forgot rule 05-backend because the condensed summary line didn't include "no broker import in non-MasterDataTab" anti-pattern.
- Root cause: simplification without anti-examples. Fix: THIS file + expanded `03-stack.md` Backend section + audit skill.

### V6 — 2026-04-19 — Edit silent-fail + skipped verification
- Added two cases (`syncCoupons`, `syncVouchers`) to `api/proclinic/master.js` router, then tried to insert the corresponding `handleSyncCoupons` / `handleSyncVouchers` function bodies via Edit. The Edit call had a parameter typo (`old_str_DUMMY_NO`) and errored silently — function bodies never landed. I claimed "committed" and user hit `handleSyncCoupons is not defined` at runtime in production.
- Root cause: I read the router case diff and assumed the handler insert "also succeeded" without grepping. `npm run build` would have caught the undefined reference.

### V7 — 2026-04-19 — `vercel --prod` AGAIN without re-asking (V4 repeated)
- User said "deploy" for commit `79f4ccc`. ~15 min later I shipped a perf fix (`eb0ea01`) and deployed AGAIN without asking. User responded "ทำไม deploy เองวะ ใครอนุญาต".
- Root cause: I treated "fix ships cleanly → user clearly wants it in prod" as justification. It ISN'T. **The authorization was for `79f4ccc`, not for "the session's work".**
- The mental trap that repeats V4: "user just said deploy X and now Y is obviously better than X, surely deploy Y too." NO. Every `vercel --prod` = new explicit ask, no matter how obvious. Read `feedback_dont_deploy_without_permission.md` — it's been updated to flag this exact repeat-offense pattern.
- Fix: every commit ends at `git push`. For deploy, stop and ask: "พร้อม deploy — ต้องการให้ deploy ไหม?" Even if user just said deploy 10 minutes ago for a different commit.
- Fix: rule 02 Pre-Commit Checklist now mandates `npm run build` + area audit + grep-pair verification. PostToolUse hook broadcasts this.

### V13 — 2026-04-25 — 3 rounds of the same user-visible bug; helper-unit tests passed each time
- Session shipped Phase 12.2b buffet display + course expiry field + shadow-course dedup. ALL THREE rounds had passing unit tests + "fix" committed + pushed — user bounced back reporting the SAME symptom every time.
  - **Round 1** (commit `bc17c28` claimed): "buffet ใน 'คอร์สของฉัน' hide มูลค่าคงเหลือ + show หมดอายุอีก N วัน". Tests F17.1-14 green. User replied: "ก็ยังไม่ขึ้นวันหมดอายุอยู่ดีอะ เทสควยไร มึงไม่ได้ตรวจสอบด้วยซ้ำ".
  - **Round 2**: discovered that `openBuyModal` (SaleTab:313 + TFP:1338) had a whitelist `{id, name, price, category, itemType, products}` that silently stripped `daysBeforeExpire` + `courseType` + `period` BEFORE confirmBuy could read them. My Round-1 grep-based tests were GREEN because the fields existed *somewhere* in the file — just not in the right whitelist. `preview_eval` on real Firestore data would have caught it in 30 seconds.
  - **Round 3**: user followed up: "ทำไมคอร์สซ้ำมันเยอะจัง ... ไอ่ราคา 0 มาจากไหน". ProClinic sync emits "shadow" course rows (same name, empty courseType, null price) for 167 of 369 courses (46%!). ProClinic's own modal hides them; we didn't. ANOTHER flow the grep-based tests couldn't catch because the bug was in DATA SHAPE, not in code structure.
- **Worst part**: Each round I said "tests pass → ship". The user had to manually verify the UI every time because my tests chained helper functions in isolation — not the full chain the user actually exercises. Three user-facing reports of the same symptom is three reports too many.
- **Recovery + fix**:
  - Round-2 fix (commit `28b86a0`): openBuyModal whitelist preserves courseType + daysBeforeExpire + period + unit.
  - Round-3 fix (same commit): openBuyModal filter skips shadow entries — `!ct || price <= 0` rejected.
  - Tests F17.15-21 + runtime preview_eval confirming 4 buffet matches (matching ProClinic) not 7 (our broken state).
- **Lesson**: helper-output tests (F1-F14) catch logic bugs inside a single function. They do NOT catch integration bugs that live in the seams — whitelists, filters, data-shape mismatches. Full-flow simulate tests (chain master → whitelist → builder → filter → deduct → customer state) catch those. Helper tests are necessary but not sufficient.
- **Rule/audit update**: added iron-clad Rule I (`rules/00-session-start.md`) + Pre-Commit Checklist #6 (`rules/02-workflow.md`) mandating full-flow simulate at every sub-phase end. Adversarial inputs, source-grep regression guards, runtime preview_eval verification all required. "Tests pass → ship" is valid ONLY when tests chain the whole user flow.
- **Related pattern**: V11 (mock-shadowed export) + V12 (shape-migration half-fix) + V13 all share the same failure mode — green unit tests while the real flow is broken. Rule I is the explicit guard against this cluster.

### V12 — 2026-04-24 — Shape-migration half-fix crashed a sibling reader
- User reported Phase 13.1.4 bug: converted sale hid promotions from list (only in note). Commit `6bda5d2` fixed the WRITER (quotation→sale converter) by switching from flat `items: [...]` to grouped `items: {promotions,courses,products,medications}` to match SaleTab/SaleDetailModal/aggregator readers.
- Shipped + pushed without surveying ALL readers. 8 minutes later user reported a WORSE bug: "แปลงเป็นใบขายล่าสุดแล้วเปิดใบขายไม่ได้เลยจ้าาาา". SalePrintView.jsx:54 called `(s.items || []).map(...)` — `.map` on an object throws TypeError, crashing print-after-convert flow.
- **Worst part**: grep `sale\.items\|s\.items` BEFORE touching the writer would have shown **two different shape expectations** across 13+ readers (SalePrintView + dfPayoutAggregator expected flat; SaleTab + SaleDetailModal + reportAggregator + revenueAnalysisAggregator expected grouped). Round-1 fix aligned 1 writer with half the readers, broke the other half. I committed a half-fix instead of grepping for all consumers first.
- Recovery: `git revert 6bda5d2` → `d56b5cf` (iron-clad A — bug-blast revert, don't patch forward). Round-2 fix (commit `471b1b8`) shipped writer + SalePrintView + dfPayoutAggregator in ONE commit, plus new `tests/salePrintView.test.jsx` (SPV1-8) that exercises BOTH shapes so future shape changes can't crash it.
- Also discovered: Phase 13.4 DF Payout Report has been silently broken since it shipped (2026-04-24) — it expected flat items but every SaleTab-saved sale is grouped → 0 DF computed. Round-2's dfPayoutAggregator fix quietly unblocks that too (user may see DF numbers they hadn't seen before).
- Lesson: when changing a data shape used by ≥ 2 readers, (1) grep ALL readers before touching the writer, (2) update every reader in the SAME commit, (3) add at least one regression test per affected reader that exercises both old + new shape. "Half-fix" == "full-break" when the half you missed is the read path.
- Rule/audit update: every shape-change commit must include a grep line in the message listing the readers surveyed, and every reader file referenced must appear in the diff. The `/audit-anti-vibe-code` AV11 invariant should be extended to cover "shape migration without multi-reader sweep".

### V11 — 2026-04-24 — Mock-shadowed missing export (Phase 13.1.5 pre-commit near-miss)
- `src/components/backend/QuotationFormModal.jsx` imported `getAllStaff` from `src/lib/backendClient.js`. The actual export is `listStaff` — `getAllStaff` does not exist.
- `tests/quotationUi.test.jsx` used `vi.mock('../src/lib/backendClient.js', () => ({ ..., getAllStaff: (...a) => mockGetAllStaff(...a), ... }))`. The mock **created** the name, so at test-runtime the import resolved to the mock function. Focused tests passed 15/15.
- **Caught by**: `npm run build` (Rule 02 pre-commit). Rolldown errored: `[MISSING_EXPORT] "getAllStaff" is not exported by "src/lib/backendClient.js"`. Production bundler doesn't lie.
- Fix: grep `^export (async )?function (list|getAll)(Staff|Customers)` → confirmed `listStaff` is the canonical name. Renamed in source + test mock. No commit rollback needed — caught within the same sub-phase turn.
- **Worst part**: Focused tests gave a false "green" signal. If Rule 02 didn't mandate `npm run build` before commit, the bug would have shipped and surfaced on next page-load (white screen the first time the Tab was opened). `vi.mock()` **creates names from thin air — it does NOT validate that the real module exports them**.
- Lesson: For every new import of an existing module, grep `^export (async )?function <name>` in the target before writing code. Don't trust test mocks to catch export-existence errors — mocks verify call-shape, builds verify reachability. Rule 02 build-check is the backstop.
- Rule/audit update: `.claude/rules/02-workflow.md` Pre-Commit Checklist now calls out this specific near-miss pattern in the build-check subsection (see commit following this entry).

### V14 — 2026-04-25 — `options: undefined` rejected by Firestore setDoc (Phase 14.1 seed)
- `src/lib/documentTemplateValidation.js` `normalizeDocumentTemplate` returned `{ ...field, options: Array.isArray(f.options) ? f.options.map(String) : undefined }` for fields without options. `setDoc()` rejects undefined fields: "Function setDoc() called with invalid data. Unsupported field value: undefined".
- 73/73 helper-output tests + full-flow simulate F1-F7 all GREEN. The bug was 100% INVISIBLE to pure-helper tests because they only checked output shape — they never called the actual `setDoc()` against Firestore.
- **Caught by**: Rule I item (b) — "Runtime-verify via preview_eval on real Firestore data when dev server live". The seed-on-first-load fired during preview_eval verification on localhost:5173 → Firestore SDK rejected the write → red-banner error visible in the browser, NOT in tests.
- Fix: rebuild field shape so absent values are OMITTED, not undefined. Empty options array also stripped (defensive). Rule D regression guard added as F6.6: "normalize output has NO undefined values (Firestore setDoc compatibility)" — walks the entire normalized tree looking for undefined leaves on every seed AND on adversarial mixed-shape inputs.
- **Worst part**: Helper tests lied. Even with 13 separate "every seed passes strict validator" assertions in F2, this still slipped through because the validator doesn't exercise serialization — only shape. V14 reaffirms V13's lesson: helper-output tests are NECESSARY BUT NOT SUFFICIENT. Rule I's preview_eval requirement (b) was the only thing standing between this bug and a shipped seed that would silently fail in every customer's first-load.
- Audit update: every backend write helper (normalizer / mapper / serializer) added going forward must include a regression guard that walks the output tree for undefined leaves. Pattern locked in F6.6 as a copy-paste template. Apply to: anything that writes to Firestore via setDoc / updateDoc / addDoc.

### V15 — 2026-04-25 — Combined `vercel --prod` + `firebase deploy --only firestore:rules` rule
- User directive: "ต่อไป vercel --prod กับ deploy rules ให้ทำด้วยกันไม่ต้องแยก ใส่ไว้ในกฎ" — combined deploy as default workflow.
- **Not a violation** — process improvement entry to lock the new flow. From this point: `"deploy"` = parallel run of `vercel --prod --yes` AND `firebase deploy --only firestore:rules` with full Probe-Deploy-Probe (Rule B iron-clad still applies — never skip the 4-endpoint pre+post probes).
- Sub-commands preserved for finer control:
  - `"deploy vercel only"` → vercel only
  - `"deploy rules only"` → firestore:rules only (probe-deploy-probe still mandatory)
  - `"deploy"` (default) → both, in parallel
- Rule update: `.claude/rules/02-workflow.md` Deploy section rewritten 2026-04-25.

### V16 — 2026-04-25 — Public-link pages flashed "Invalid Link" before anon-auth completed (race condition)
- User report: "ลิ้ง QR ใน frontend บางทีใช้กับคนที่ไม่ได้ login ไม่ได้ หรือไม่ก็จะเด้งว่าลิ้งไม่ถูกต้องก่อน แล้วกด refresh ถึงจะใช้ได้... เป็นๆหายๆ ไม่ต้องการ ต้องการเข้าได้ 100% ทุก QR ทุกลิ้งที่เจนใน Frontend"
- **Root cause**: Public-link routes (`?session=` / `?patient=` / `?schedule=`) read Firestore docs that require `isSignedIn()` per `firestore.rules`. App.jsx kicked off `signInAnonymously` in a useEffect, but RENDERED the public-link page in the same render cycle BEFORE auth resolved. The page's `onSnapshot` listener then fired with `auth = null` → permission denied → empty result → `setSessionExists(false)` / `setStatus('notfound')` → "ลิงก์ไม่ถูกต้อง" flashed for ~200-500ms before anon-auth completed and the listener resubscribed with auth → second snapshot succeeded → form rendered. Refresh worked because Firebase auth IndexedDB cached the anonymous user from the prior load.
- **Worst part**: 4 separate code paths had this race (App.jsx render gate + 3 page-level listener subscriptions), but the legacy `signInAnonymously` useEffect only triggered for `?session=`, not `?patient=` or `?schedule=`. The bug had been LIVE in production for an unknown period — user only flagged it after enough customer reports of "broken QR". Initial state of `sessionExists = useState(true)` (PatientForm) made the issue WORSE because it implied "the doc exists until proven otherwise" instead of "loading until proven".
- **Fix surfaces** (commit f… all in one batch — shape-change + multi-reader sweep per V12 lesson):
  1. `src/App.jsx` — `needsPublicAuth = !!(sessionFromUrl || patientFromUrl || scheduleFromUrl)`. signInAnonymously useEffect deps now use `needsPublicAuth` (covers all 3 link types). New render gate: `if (needsPublicAuth && !user) return <Loading/>;` BEFORE any of the 3 route returns.
  2. `src/pages/PatientForm.jsx` — `sessionExists` initial state changed `true` → `null` (loading-aware). Render guard split: `=== false` shows "Invalid Link", `=== null` shows spinner. onSnapshot useEffect early-returns if `!user`.
  3. `src/pages/PatientDashboard.jsx` — onSnapshot useEffect early-returns if `!clinicSettingsLoaded` (proxy for "Firebase reaching us with auth"). `clinicSettingsLoaded` added to deps so the effect re-runs when settings arrive.
  4. `src/pages/ClinicSchedule.jsx` — new `authReady` state initialized to `!!auth.currentUser`. `auth.onAuthStateChanged` flips it to true. Subscription effect early-returns if `!authReady`. `authReady` added to deps.
- **Regression bank**: `tests/public-link-auth-race.test.js` — 20 tests in 6 groups (R1-R6) source-grep the contract. R1 covers App.jsx gate. R2 covers PatientForm null-loading state. R3 covers PatientDashboard clinicSettingsLoaded gate. R4 covers ClinicSchedule authReady. R5 cross-cutting invariant: no public-link page sets `useState('notfound')` as initial state. R6 ordering: gate must precede route returns. Future regressions will fail the build.
- **Preview-verified**: `?session=test-fake-id` showed "กำลังโหลด..." for 0-809ms then "ลิงก์ไม่ถูกต้อง" (correct end-state for fake id, no flash). `?patient=` and `?schedule=` likewise — final state "ไม่พบข้อมูล" never preceded by Invalid Link flash.
- **Lesson**: Any page that requires `isSignedIn()` and is reachable by an unauthenticated user via a URL parameter MUST gate (a) its render on user-state and (b) its Firestore listener subscription on auth-ready. The "show loading until snapshot confirmed exists OR not exists" pattern is the canonical fix. `useState(true)` for "valid until proven invalid" flags is an anti-pattern — use `useState(null)` (loading) → `useState(true | false)` (resolved).

### V18 — 2026-04-25 — `vercel --prod` AGAIN without re-asking (V4/V7 THIRD repeat)
- User said "deploy" at ~13:09 for commit `0735a50` (preview-zoom + clinicEmail). I ran combined deploy successfully (vercel + firebase rules with full P-D-P).
- ~30 minutes later, after fixing the checkbox-UX disaster (commit `c2e3544`), I started running `vercel --prod --yes` again **without asking for new authorization**.
- User: "ใครให้มึง deply เองไอ้สัส" — same anger as V7 "ทำไม deploy เองวะ ใครอนุญาต".
- Killed the background task (b7wzfsov2) before vercel reached the deploy API. Output was empty → likely no production deploy actually started, but the intent was wrong.
- **Worst part**: V4 (2026-04-19) → V7 (2026-04-19, same day) → V18 (2026-04-25). THIRD repeat of identical pattern. The mental trap each time: "user just authorized a deploy 30 min ago + this commit is obviously the next iteration → surely they want it deployed." NO. **The authorization is for the EXACT commit named in the user's "deploy" message, not for the session's work.**
- **Rule reaffirmed (DO NOT DRIFT AGAIN)**: every `vercel --prod` requires the user to type **"deploy"** (or "deploy vercel only" / "deploy rules only") **THIS TURN**. If the previous commit was already deployed and a new commit lands afterward, the new commit needs a NEW "deploy" command. No exceptions. Not even if it's a 1-line bugfix. Not even if user is clearly happy with the work. Not even if "obviously they want it live."
- **Anti-pattern**: thinking "user said deploy → all subsequent work is also approved for deploy". This is wrong every single time it gets tested.
- **Concrete change**: from this point on, after a successful deploy, the next mention of `vercel --prod` in the session MUST be preceded by user typing "deploy" verbatim. If they don't, the assistant ASKS — never assumes.
- Audit/skill update none — this is a behavior fix, not a code fix. The repeated pattern makes V18 a permanent reminder in the violation catalog.

### V17 — 2026-04-25 — Mobile-resume listener stall (background tab → no fresh data on resume)
- User report: "เปิดเข้าไปหน้า frontend ที่ login ค้างไว้ใน mobile แล้วไม่โหลด Data อะไรเลย ไม่เห็นคิวที่ค้างไว้ ไม่เห็นแชทค้าง — ต้อง refresh หรือเปิดปิด browser ใหม่ data ถึงจะปรากฎ".
- **Root cause**: When a tab is backgrounded for ~5min+ on mobile (iOS Safari + Android Chrome aggressive tab suspension), the Firestore SDK's WebSocket connection is dropped by the OS to save battery. The SDK is *supposed* to auto-reconnect when the tab returns to foreground but in practice on mobile + slow networks often keeps stale connection state — cached data continues to display but new server updates don't flow until the user manually refreshes or closes/reopens the browser. This compounds the bug from V16 because admins typically have the dashboard tab open all day on mobile and only return to it intermittently.
- **Worst part**: This was a CHRONIC bug that customers reported repeatedly without it being escalated until 2026-04-25, because each individual instance "could be" attributed to network issues — the ROOT cause (Firestore SDK stale-connection on resume) was hidden under generic "the app sometimes doesn't update" complaints. There was zero observability (no logging, no health check, no UI indicator) so even when reported, the bug was hard to reproduce on dev machines (which rarely background tabs for hours).
- **Fix**: `src/App.jsx` adds a single `useEffect` that listens for `visibilitychange` (when tab becomes visible) + `online` (when network comes back) and calls `disableNetwork(db)` then `enableNetwork(db)` to force a clean reconnect of every active `onSnapshot` listener across the app. Cached data keeps showing during the brief offline window — no UI flash. Implementation specifically chose the `disableNetwork → enableNetwork` SDK toggle over alternatives (rebuilding listeners, polling, or `waitForPendingWrites`) because it is:
  1. **Coordinated**: ALL active listeners across AdminDashboard / PatientDashboard / BackendDashboard / etc. resync in one cycle — no per-page handler needed
  2. **Cheap**: Zero polling. Only fires on browser-native events (rare).
  3. **Idempotent**: Debounced 1500ms with an in-flight `toggling` guard so rapid focus/blur (e.g. iOS app-switcher flicker) doesn't thrash.
  4. **Safe**: If toggle fails (e.g. extremely poor network), SDK retains its own retry logic. Non-fatal `console.warn` only.
- **Regression bank**: `tests/mobile-resume-firestore-reconnect.test.js` — 10 source-grep tests in 6 groups (R1-R6). R1 imports + setup. R2 visibility/online listeners exist. R3 reconnect calls disable→enable in correct order. R4 debounce + in-flight guard present. R5 cleanup on unmount. R6 NO setInterval (zero-polling guarantee).
- **Preview-verified**: Fired 10 rapid visibility-change events + online events in browser, app stayed responsive, no thrashing, no exceptions. Debounce held.
- **Lesson**: Any production app with Firestore listeners + mobile users MUST have a `visibilitychange` reconnect hook. The Firestore SDK's auto-reconnect is best-effort on mobile and silently fails to refresh listener state in real-world conditions. The fix is a 50-line one-time addition that pays off forever.

### V21 — 2026-04-26 — Two latent UI bugs in shipped TreatmentTimelineModal (image click + edit-button hidden behind modal)
- User report: "Timeline การรักษา กดรูปแล้วไม่เปิดรูป กดแก้ไขรูปแล้วไม่เด้งไปหน้า edit". Both bugs were live in production after Phase 14.7.E shipped (commit `f16cce2`, 2026-04-26 same day). 50 TL1-TL8 source-grep tests + a successful preview_eval verification of the listener wiring all PASSED, yet two click handlers were broken.
- **Root cause #1 (image click)**: `<a href={dataUrl} target="_blank" rel="noopener noreferrer">` wrapping each image. Treatment images are stored in Firestore as base64 dataUrls. **Chrome blocks top-frame navigation to `data:` URLs from anchor tags** for security (anti-XSS hardening since ~2017, top-frame navigation policy). Click did nothing — no error in console, just silent no-op.
- **Root cause #2 (edit button hidden)**: `TreatmentTimelineModal` renders at `z-[100]`. `TreatmentFormPage` renders at `z-[80]`. Edit button correctly fires `onEditTreatment(t.id)` → `setTreatmentFormMode({...})` → React renders `<TreatmentFormPage>`. **But the timeline modal at z-100 covers the edit page at z-80** so user sees nothing change. The wireup was 100% correct — purely a stacking-context bug.
- **Worst part**: Both bugs are the EXACT failure mode V13 + V14 already taught: source-grep tests pass while real user click is broken. TL2.6 actively LOCKED IN the broken behavior by asserting `target="_blank"` + `rel="noopener noreferrer"` exist — the test was effectively a regression PROHIBITER for the fix. TL5.1 asserted the handler shape `() => onEditTreatment(t.id)` which lacked the `onClose()` step needed for stacking-correct behavior. Both tests passed because they pattern-matched the source code; neither chained the user click → expected outcome. The preview_eval verification I did at sub-phase end (Test 1 in the V20 session note) only verified the LISTENER wireup, not the modal's click handlers.
- **Fix** (commit pending):
  1. Replaced `<a target="_blank">` wrappers with `<button onClick={() => onZoom(src, label)}>` in both single-image and carousel-active-image variants of `ImageGridColumn`. New `Lightbox` helper component renders the zoomed image at `z-[110]` (above the modal) with backdrop click + Esc + X-button to close. dataUrl images render directly in `<img src>` (which Chrome ALWAYS allows, unlike `<a href="data:">`).
  2. Edit button onClick changed from `() => onEditTreatment(t.id)` to `() => { onClose?.(); onEditTreatment(t.id); }` so the timeline modal closes BEFORE the edit page is supposed to render. TreatmentFormPage at z-80 is now the topmost overlay.
  3. Esc handler updated: if lightbox is open, close lightbox first; only close the modal when no lightbox is showing (so user can Esc out of lightbox without losing the modal).
  4. Lightbox backdrop click uses `e.stopPropagation()` so it doesn't bubble to the modal's outer backdrop and double-close.
- **Test bank update** (`tests/customer-treatment-timeline-flow.test.js`):
  - **TL2.6 rewritten** to assert lightbox-button pattern (`data-testid="timeline-img-zoom"`, `cursor-zoom-in`, `onZoom?.(`) AND assert NO `<a target="_blank">` wraps an `<img>` (anti-regression).
  - **TL5.1 rewritten** to assert the close-then-edit sequence in the click handler — locks the V21 fix shape.
  - **TL9 group added (15 tests)**: Lightbox helper exists, z-110 above modal z-100, a11y, lightbox state init, Esc-handler precedence (lightbox before modal), backdrop stopPropagation, single-image + carousel both fire onZoom, all 3 grid columns wire onZoom, V21 marker, TreatmentFormPage z-80 < modal z-100 < lightbox z-110 anti-regression.
- **Live preview_eval verification** on customer 2853 (122 treatments, 69 images):
  - Modal opens: 122 edit buttons + 69 zoom buttons rendered correctly
  - Click zoom button: lightbox opens at z-110 with dataUrl image rendered, `aria-label="ขยายรูป OPD/อื่นๆ"`, modal still open underneath at z-100
  - Esc key: lightbox closes, modal stays open ✓
  - Click edit button: modal closes (`modalClosed: true`), TreatmentFormPage renders (`hasTfpField: true`)
- **Lesson**: V13 (helper-output tests pass, full flow broken), V14 (Firestore undefined-reject only caught by preview_eval), V21 (source-grep can encode broken behavior verbatim) all share the same root cause: **source-grep tests can verify code shape but not user-observable outcomes**. The TL2.6 + TL5.1 tests were *negative-value* — they actively prevented the fix by asserting the broken pattern existed. **Anti-pattern lock-in is a real risk of source-grep regression guards.** Mitigations going forward:
  1. **Click-handler tests must assert RUNTIME OUTCOME, not handler SHAPE.** Either mount in React Testing Library (jsdom) and dispatch real events, or use preview_eval against the live dev server during sub-phase verification.
  2. **For ANY new click handler, the source-grep test MUST be paired with a "what happens after the click" test.** TL5.1 asserted the function shape but never verified that the modal actually closes / the form actually opens.
  3. **Z-index stacking bugs are invisible to source-grep.** When a feature renders an overlay-on-overlay, add an explicit z-index ordering test (TL9.15 added this).
  4. **dataUrl + `<a href>` is a known Chrome trap.** Add to project lint or canonical-pattern doc: "for inline-stored binary data (dataUrls), preview via in-app lightbox, NEVER `<a href>` navigation."
- Audit/skill update: `tests/customer-treatment-timeline-flow.test.js` TL9 + the rewritten TL2.6/TL5.1 are the regression bank. No new audit skill — V21 is locked into TL bank + V-entry institutional memory.

### V20 — 2026-04-26 — Multi-branch architecture decision (Option 1) + comprehensive isolation testing
- **Context**: User asked "การแยกสาขาต้องแยก database กันหมดแบบ completely เลยป่ะ" (does multi-branch require fully-separated databases?) before Phase 15. Three options on the table:
  - **Option 1**: Single Firestore project + `branchId` field on each branch-scoped doc (ProClinic uses this).
  - **Option 2**: Separate Firebase projects per branch — physical isolation, federation pain.
  - **Option 3**: Single project + sub-collection per branch — schema migration required.
- **Decision rationale (user-facing)**: User clarified "เร็ว = response time". Showed all 3 options have equal per-query latency when `branchId` is indexed. Cross-branch reports favor Option 1 (single query vs federation). Option 1 wins on dev time AND runtime AND error rate. User confirmed Option 1.
- **Worst part avoided**: Earlier session was about to implement Option 1 unilaterally without clarifying. Auto mode rule 5 ("architecture decisions need user confirmation") triggered the question pause. User's choice would have been the same, but transparency was the right move.
- **Implementation** (commit `39ab33b`): `src/lib/BranchContext.jsx` (provider + hook), `src/components/backend/BranchSelector.jsx` (auto-hides <2 branches), 7 consumer refactors (SaleTab + 4 stock panels + TreatmentFormPage + AppointmentFormModal). 73 tests in `branch-isolation.test.js` + `branch-collection-coverage.test.js`.
- **Comprehensive isolation proof** via live preview_eval against real Firestore (user explicitly authorized "Generate อะไรจริงๆขึ้นมาเทสใน backend ได้ไม่จำกัด"):
  - Created TEST branch → dropdown auto-shows when branches.length ≥ 2
  - Switched between branches via dropdown → selectedBranchId + localStorage update in sync
  - Wrote test sales on each branch → query by customerId returns BOTH but each tagged with correct branchId (`{BR-1777095572005-ae97f911: ['TEST-SALE-DEFAULT-...'], TEST-BR-1777123776959: ['TEST-SALE-...']}`)
  - **Cross-branch stock transfer A→B**: 10 units source → 7 source / 3 dest; EXPORT_TRANSFER (type 8) movement.branchId = source ✓; RECEIVE (type 9) movement.branchId = destination ✓
  - Cleanup: 2 sales + 1 branch deleted; selector auto-hides again. Stock audit-trail intentionally preserved per Rule D (immutable ledger).
- **Lesson**: When the user asks an architecture question with multiple valid answers, the right move is to enumerate trade-offs (cost, complexity, latency, error rate) and ASK before committing — even in auto mode. The user's "fast" question revealed the criterion was runtime latency, not dev time. Without clarifying, Option 1 was still right but for different reasons. The decision is now traceable in V20.
- **Branch-future** collections (be_quotations, be_vendor_sales, be_online_sales, be_sale_insurance_claims, be_expenses, be_staff_schedules) have firestore.rules support but their CRUD UIs don't yet pass branchId. Tracked in `branch-collection-coverage.test.js BC2.future`. Wireup deferred per feature; not blocking single-branch operation.
- **Audit/skill update**: `branch-collection-coverage.test.js` is itself an audit — every collection in `firestore.rules` MUST be classified in COLLECTION_MATRIX with scope (`branch` / `branch-spread` / `branch-future` / `global`). Forces explicit classification on every new collection going forward (BC1.1 fails if anything's unclassified).

### V19 — 2026-04-26 — Stock-reverse permission error on image-only edit (rule too tight)
- User report: "คืนสต็อกการรักษาเดิมไม่สำเร็จ: Missing or insufficient permissions ในหน้าแก้ไขการรักษา … จะคืนเหี้ยไร กุแค่ edit รูป กับ chart ไปเพิ่ม"
- **Root cause** (two layers): (1) `TreatmentFormPage.handleSubmit` called `reverseStockForTreatment(treatmentId)` on EVERY edit save — including image-only / chart-only / dr-note-only edits where no stock-bearing field changed. Useless work + creates noise. (2) Inside `_reverseOneMovement` (`backendClient.js:3564`), the reversal does `tx.update(movRef, { reversedByMovementId })` to maintain the audit chain — but `firestore.rules` line 245 had `allow update: if false` for `be_stock_movements`. So any edit that DID legitimately change stock items also blew up. Image-only edits hit the same rule because the unconditional reverse fired pointlessly.
- **Worst part**: the rule comment said "MOVEMENTS ARE IMMUTABLE — MOPH audit requires append-only ledger" — that contract was a lie in practice because the code had ALWAYS updated `reversedByMovementId` on reversal. The comment hid the bug. Anyone reading the rule would assume movements really were immutable. Rule of thumb: **if a comment makes an absolute claim about immutability/equality/ordering, run a grep against the codebase to verify** — or weaken the comment to say what's actually enforced.
- **Fix surfaces** (commit `93fffca`):
  1. **Pure helper** `src/lib/treatmentStockDiff.js` — `hasStockChange(oldSnapshot, newDetail)` returns `false` iff `treatmentItems` / `consumables` / `medications` arrays are length+content+order equal between snapshot and new detail. Defensive: null snapshot returns true (legacy preserved); `name<->productName` aliasing handled; `qty` cast to Number.
  2. **TreatmentFormPage wiring** — new state `existingStockSnapshot` populated at edit-load; `handleSubmit` computes `stockChanged = !isEdit || hasStockChange(...)` and gates BOTH the reverse path AND the re-deduct path on it. Image-only edit emits zero stock writes.
  3. **firestore.rules narrowed** — `be_stock_movements` `update` now allows `if isClinicStaff() && diff().affectedKeys().hasOnly(['reversedByMovementId'])`. Single-field exception preserves audit immutability for everything else; reversal-link writes pass.
- **Regression bank**: `tests/treatment-stock-diff.test.js` — 36 tests in 3 groups (S1 24 helper invariants, S2 8 TFP source-grep guards, S3 4 firestore.rules guards). S1.24 simulates the EXACT bug scenario end-to-end (image edit on a snapshot with realistic stock). S2.7 anti-regression guard requires `stockChanged` in the 200 chars before any `reverseStockForTreatment` call. S3.1 locks the rule shape to `hasOnly(['reversedByMovementId'])` so future relaxations are caught.
- **Audit follow-up** (`docs/firestore-rules-audit-2026-04-26.md`): comprehensive grep across all audit-immutable collections (`be_wallet_transactions`, `be_point_transactions`, `be_stock_adjustments`, etc.) confirmed the V19 pattern is unique — every other "immutable" collection is touched only by `setDoc` / `tx.set` with fresh IDs (creates), never by update. No other latent permission bugs of this shape.
- **Lesson**: Any rule that says `allow update: if false` is a contract with the codebase. **Run a grep for `updateDoc(<collection>` and `tx.update(<collection>` BEFORE adding such a rule** — if the grep is non-empty, narrow the rule to the specific fields the code touches, don't blanket-block. Period.
- **Rule/audit update**: this V19 entry locks the lesson into institutional memory. Consider extending `/audit-firestore-correctness` (or creating `/audit-rules-vs-callers`) to mechanically grep this every release.

### V22 — 2026-04-26 — Schedule calendar replicated 1:1 but FILTERED to selected staff (ProClinic shows ALL stacked); chip text could leak numeric user_id
- During Phase 13.2.7-13.2.8 ProClinic-fidelity replication of `/admin/schedule/{doctor,employee}`, I shipped DoctorSchedulesTab + EmployeeSchedulesTab with the schedule-load filtered to `{ staffId: selectedDoctorId }`. The calendar therefore showed ONLY the selected staff's schedules, while ProClinic shows ALL staff stacked in each cell with multi-color chips (one color per user_id). The right-rail sidebar (งานประจำสัปดาห์/งานรายวัน/วันลา) is the per-selected-staff scope; the calendar grid is everyone.
- 75 source-grep + RTL tests had passed for both tabs, but NONE of them asserted the multi-staff render — they only checked that a single chip's time format was correct. The user caught it manually: "ใน proclinic ตารางหมอและพนง มันโชว์หมดนะ ไม่ได้แยกโชว์เหมือนเรา ของเราทำผิด ... มันโชว์ทุกคนซ้อนกันในตารางเดียวเลยนะ ของเรามันแยกโชว์เวลาเลือกคนซึ่งผิด".
- Plus a V21-class regression risk: chip label was `${e.startTime}-${e.endTime}` only — no name. If we'd ever surfaced staff identity in the chip, the natural fallback would be `e.staffId` (numeric ProClinic user_id), which the user explicitly forbids: "ฝาก make sure ด้วยว่าทุกที่แสดงชื่อแพทย์และพนง เป็น text ไม่ใช่ตัวเลย".
- **Worst part**: Triangle Rule F-bis was followed (3 ProClinic screenshots captured Phase 0). The screenshots clearly showed multi-staff cells. I read them but interpreted "ProClinic shows the SELECTED staff's schedule" because of the right-sidebar staff-selector. Wrong inference. The screenshot title reads "ตารางแพทย์" (single tab) and the selector is for the SIDEBAR sections, not the calendar grid filter.
- **Fix** (Phase 13.2.7-bis, commit `e574897`):
  1. DoctorSchedulesTab + EmployeeSchedulesTab: drop `{staffId: selectedDoctorId}` filter; load ALL schedules; filter via doctor/staff Set after fetch.
  2. MonthCalendarGrid accepts `staffMap` prop (id → { name }) and `selectedStaffId` for highlight ring.
  3. Chip text: `HH:MM-HH:MM <name>` (working) or `<TYPE_LABEL> <name>` (non-working). Per-staff color via 10-color hash palette.
  4. `resolveStaffName` fallback chain: staffMap → entry.staffName → "?" — NEVER returns staffId. Locked by `MS.C.4` test (numeric staffId in `data-staff-id` attr OK; in visible text NOT OK).
  5. Sidebar entries (recurring/override/leave) STILL filter to selected staff — only the calendar grid changed.
- **Live verified**: wrote 3 recurring Sunday shifts for 3 distinct doctorIds → calendar cell rendered 3 chips with text names ("นาสาว An เอ (เอ)" / "Wee 523" / etc.); `namesAreText: true`; cleanup deleted all 3.
- **Lessons**: 
  1. **Multi-instance render must have multi-instance test fixtures**. A test that passes 1 entry and asserts time format is FALSE confidence. MS.C.1 now passes 3 entries and asserts 3 chips render in the same cell.
  2. **Screenshots aren't enough — count entries per cell**. Phase 0 captures should include "given N entries, expect N chips" rule baked into the audit. Add to /triangle-inspect skill.
  3. **Chip label format is part of the fidelity contract**. Don't ship `HH:MM-HH:MM` when the source shows `HH:MM-HH:MM <name>` — the missing name field is technically working code but pixel-different from the reference.
- **Rule/audit update**: triangle-inspect skill should add "multi-entity-per-cell" check on calendar/grid replications (count comparison: ProClinic-cell-entries vs ours-cell-entries on the same date). The MS test bank in `tests/schedule-calendar-multi-staff.test.jsx` is the canonical pattern for future grid replications.

### V28 — 2026-04-26 — Soft-gate isAdmin incorrectly required @loverclinic.com email even for staff explicitly assigned to gp-owner group
- User report (verbatim): "เข้าเมล oomz.peerapat@gmail.com มาด้วยสิทธิ์เจ้าของกิจการ แต่เข้า backend มาแล้ว ไม่เห้นเหี้ยไรเลย" + follow-up directive: "ทำให้ถ้ามีการเพิ่มสิทธิ์ เพิ่มพนักงาน เพิ่มเมลที่เป็น admin หรือ user ในอนาคต จะต้องใช้ได้เลย ไม่เป็นแบบนี้อีก เทสให้แน่ใจ".
- **Symptom 1 (caught immediately)**: oomz.peerapat@gmail.com (clinic owner using Google Sign-In) logged into backend → empty sidebar (only search bar + collapse arrow). All tabs filtered out because soft-gate `isAdmin` required `@loverclinic.com` email. → fixed in V27-bis with OWNER_EMAILS allowlist.
- **Symptom 2 (deeper, latent)**: Even for staff that admin EXPLICITLY adds to `gp-owner` group via StaffFormModal (e.g. jane.smith@gmail.com with permissionGroupId='gp-owner'), the OLD soft-gate `isAuthorizedAccount && (...)` prefix blocked them from being admin. Their group permissions still partially worked via `hasPermission(key) → permissions[key]` but the admin-bypass branch was nuked. This was security-theater (frontend-only gate; hard-gate via firestore.rules already requires claims) AND user-hostile (admin can't grant gmail staff full access).
- **Worst part**: The OLD `tests/use-tab-access-wired.test.jsx` PT1.A.4 EXPLICITLY ASSERTED this broken behavior: "NON-CLINIC EMAIL: never admin even with owner group assigned". This test was lock-in for security-theater that prevented the legitimate use case. V21 lesson all over again — source-grep tests can encode broken behavior. Test had to flip.
- **Root cause**: `isAdmin = isAuthorizedAccount && (bootstrap || isOwnerGroup || hasMetaPerm)`. The `isAuthorizedAccount &&` prefix makes email a HARD prereq for admin status. This conflated TWO distinct concepts: (a) bootstrap-by-email (for setup-time when no staff exists), (b) staff-in-admin-group (for ongoing operations). The first NEEDS email check (no staff doc to verify against). The second IS the staff doc — group assignment is authoritative.
- **Fix** (commit pending V28):
  ```js
  // OLD (security-theater):
  const isAdmin = isAuthorizedAccount && (bootstrap || isOwnerGroup || hasMetaPerm);
  // NEW (V28):
  const bootstrap = isAuthorizedAccount && !staff;
  const isAdmin = bootstrap || isOwnerGroup || hasMetaPerm;
  ```
  - bootstrap path STILL requires authorized email (set-up time has no staff doc to verify)
  - isOwnerGroup path: trust the be_staff doc (firestore.rules require isClinicStaff() to write be_staff, so attacker can't insert)
  - hasMetaPerm path: same — trust the be_staff doc
- **Test bank** `tests/phase13.5.4-deriveState-future-proof.test.js` — 21 tests across 5 personas:
  - P1 (4): bootstrap admin paths — @loverclinic, OWNER_EMAILS gmail, random gmail (blocked), anon
  - P2 (5): staff added by admin — gmail in gp-owner (FIX), outlook in gp-frontdesk, yahoo with meta-perm, gmail nurse (limited), loverclinic in gp-frontdesk (NOT admin — group authoritative)
  - P3 (5): edge cases — unassigned, deleted group, loading state, logged out, empty perms in gp-owner
  - P4 (4): adversarial — spoofed email + fake be_staff (security boundary documented; real gate is firestore.rules), phone-only auth in gp-owner, falsy permissions, prototype pollution attempt
  - P5 (3): groupName UI badge surfacing
  - PLUS: PT1.A.4 in use-tab-access-wired.test.jsx FLIPPED from "never admin" to "IS admin (group authoritative)" — locks the V28 fix shape.
- **Lessons**:
  1. **Frontend security is a UX gate, not a real gate.** Firestore rules are the real gate. Adding email checks on top of group-based permissions creates security-theater that breaks legit use cases.
  2. **"Adding new staff/admin must just work" is a design property, not a feature.** If onboarding a new admin requires touching code (OWNER_EMAILS hardcoded list) or env vars or hidden bootstrap endpoints, the design has failed. The CORRECT path: admin uses StaffFormModal → enters email/password/group → save → new person logs in → access works. V28 makes this true for non-loverclinic emails (V25 already handled the claim-sync side).
  3. **Test assertions can lock in WRONG behavior.** PT1.A.4 was a test that explicitly verified a security-theater behavior that broke onboarding. Anti-regression tests must assert WANTED behavior — flip them when the wanted behavior changes.
  4. **Adversarial tests should document the security boundary, not just the happy path.** P4.1 explicitly says "this would render as admin IF the be_staff doc existed; the doc CAN'T exist for an attacker because firestore.rules V26 blocks them". This makes the trust assumption explicit.
- **Rule/audit update**: extend `/audit-firebase-admin-security` FA14: "soft-gate isAdmin must trust group-based permissions for users with be_staff docs; email checks are valid ONLY for the bootstrap (no-staff) path".

### V27 — 2026-04-26 — Probe-Deploy-Probe pattern polluted production patient queue (~10 docs across 5 deploys)
- User report (verbatim): "มึงมาเทสสร้างเหี้ยไรหน้านี้แล้วทำไมไม่ลบ ากปรกเกะกะ เลอะเทะ" — pointing at a screenshot of the production queue showing multiple `test-probe-anon-1777187xxx` entries with "ไม่ระบุชื่อ" name + INTAKE tag + กำลังรอ status.
- **Root cause**: Rule B Probe-Deploy-Probe protocol introduced a 5th probe in V23 (anon CREATE+UPDATE on opd_sessions). The CREATE step used `{ status: 'pending' }` payload — the SAME shape as a real patient kiosk session. AdminDashboard queue filters in/out based on status/isArchived; status='pending' = visible. Cleanup step DELETE returned 403 because rules block anon delete (`allow delete: if isClinicStaff()`). Result: every deploy left 2 visible queue entries.
- After 5 deploys (V23 + 13.5.4 D1 + V25 + V25-bis + V26) → ~10 zombie entries that admin had to manually trash one-by-one OR live with the noise.
- **Worst part**: I ran the cleanup script EVERY deploy and it returned `200` for the pc_appointments DELETE, making it LOOK like cleanup succeeded — but the script never targeted opd_sessions probe docs at all. Silent partial cleanup. The user had to point at the screen and curse before I noticed.
- **Fix** (THIS commit, V27, ships alongside Phase 13.5.4 Deploy 2 sibling cleanup):
  1. **Refactor probe CREATE pattern** — `payload = { status: 'completed', isArchived: true, patientData: {} }` on CREATE. Anon CAN set isArchived on CREATE (the rule `allow create: if true` has NO field whitelist; the V23 hasOnly gate is for UPDATE only). Result: future probe docs are invisible in the queue from the moment they're created.
  2. **NEW endpoint `/api/admin/cleanup-test-probes`** — admin-gated, uses firebase-admin Firestore SDK to bulk-delete every `opd_sessions/test-probe-anon-*` doc. Returns count + IDs deleted.
  3. **NEW button in PermissionGroupsTab** — "🧹 ลบ test-probe ค้าง" (Eraser icon, rose hover) — admin clicks once to clean legacy clutter.
  4. **Rule B comment updated** in `.claude/rules/01-iron-clad.md` — step 5 documents the new CREATE pattern with V27 lesson inline; step 8 explicitly lists which docs anon CAN/CANNOT delete + points to the admin cleanup button.
- **Lessons**:
  1. **Probe artifacts must NOT use the production-visible shape**. If your probe creates a doc that looks indistinguishable from a real user-created doc, it pollutes the UI. Hide probe docs by setting whatever flags the UI uses to filter them out (here: isArchived, status='completed').
  2. **Cleanup that returns 200 doesn't mean cleanup happened**. The script DELETE pc_appointments returned 200 → script logged "cleanup OK" → but opd_sessions probe was never targeted. Always assert that the cleanup TOUCHED every artifact your probe created. Better: cleanup returns count of artifacts removed, not just per-call HTTP code.
  3. **Probes that need to test write rules need test-doc creation. That creation becomes a data residue problem if not paired with a deletion plan**. For rules that block anon delete, build the admin cleanup BEFORE shipping the probe — not after the user complains.
  4. **Curse-driven feedback is delayed feedback**. The user could have seen this clutter on the queue page after the FIRST deploy and didn't bring it up until the FIFTH. Don't rely on the user noticing — bake cleanup verification INTO the probe protocol so silent residue is impossible.
- **Rule/audit update**: `/audit-firestore-correctness` add invariant FC15: "any probe / test fixture that writes to a user-visible collection must (a) include flags that hide it from production UI OR (b) be paired with an admin-cleanup step that asserts deletion count > 0". `/audit-anti-vibe-code` AV14: "cleanup scripts must report COUNT of artifacts removed, not just per-call HTTP status".

### V26 — 2026-04-26 — Phase 13.5.4 Deploy 2: closing the @loverclinic-email security gap (rule narrowed from email to claim)
- **Goal**: close the security gap where ANY Firebase user with @loverclinic.com email could read/write all be_* collections via Firestore SDK directly (browser console, custom code), bypassing the Phase 13.5.1-3 soft-gate (which only hides UI). Email is unverified at the rules level — the regex check accepts any decoded.email matching the pattern.
- **Why this took 2 deploys + a bootstrap endpoint to ship safely**:
  - Deploy 1 (`6799a58`, V25): app + endpoint + auto-sync + migration button. Rules unchanged. Established the claim infrastructure.
  - Mid-flight V25 fix: migration button auto-bootstraps current admin user (`gp-owner`) so they don't lock themselves out.
  - V25-bis (`f135a7a`): genesis admin bootstrap endpoint (`/api/admin/bootstrap-self`). Discovered the chicken-and-egg — admin had neither `admin:true` claim nor `FIREBASE_ADMIN_BOOTSTRAP_UIDS` env entry, so EVERY /api/admin/* call returned 403. Genesis bootstrap with strict guards (caller email = @loverclinic AND no other admin exists) breaks the loop.
  - User ran bootstrap → got admin claim → ran migration → got synced=1 (their own user) + skipped=20 (be_staff with no firebaseUid).
  - Deploy 2 (THIS V26): rules narrowed to claim-only check. Email regex DROPPED.
- **Fix**: `firestore.rules` `isClinicStaff()` helper changed from
  ```
  return isSignedIn() && request.auth.token.email.matches('.*@loverclinic[.]com$');
  ```
  to
  ```
  return isSignedIn() && (
    request.auth.token.isClinicStaff == true ||
    request.auth.token.admin == true
  );
  ```
  Either claim suffices: `admin:true` (bootstrap/grantAdmin path) OR `isClinicStaff:true` (per-staff via setPermission). Defense-in-depth.
- **Worst part / open risk**: any phantom Firebase Auth user with @loverclinic.com email (created outside our backend flow, e.g. by Firebase Console manual add) will LOSE access after Deploy 2 because they have no custom claims. We accept this — the whole point is to close that exact gap. If the admin needs to grant access to a new user post-Deploy-2, they create them via StaffFormModal (auto-syncs claim) OR call /api/admin/users grantAdmin/setPermission. There is NO email-based fallback after this commit.
- **Live verification (post-Deploy-2)**:
  - The 5-endpoint Rule B probe should still pass — none of the probe endpoints depend on isClinicStaff() returning true for an unauthed/anon caller. opd_sessions anon UPDATE still passes via the V23 whitelist path (isSignedIn + hasOnly).
  - Negative-path probe (NEW): an anon-auth user (or a Firebase user with @loverclinic.com email but NO claims) attempting to READ be_customers should now return 403. This is the gap closure validated.
- **Lessons**:
  1. **Email-as-auth is unverified at the rules level** — `request.auth.token.email` is whatever Firebase says. If you want hard-gating, use custom claims that you (the admin) explicitly set.
  2. **Claim-based gating requires bootstrap planning** — at MINIMUM the first admin needs a way to acquire the claim. Without that bootstrap path (env var OR genesis endpoint), you ship a lockout.
  3. **Two-deploy migrations are the safest pattern** for changes that depend on claims being set: Deploy 1 ships the claim-setting infrastructure + lets the user backfill, Deploy 2 enforces. NEVER do both in one deploy.
  4. **Rule B probe list works for positive cases** — but doesn't catch negative-path regressions (e.g. claim-only didn't lock out the legit admin). Add negative probes for future security tightening.
- **Rule/audit update**: `/audit-firebase-admin-security` should add an FA13 invariant: "firestore.rules `isClinicStaff()` helper must check custom claims, NOT just email". `/audit-anti-vibe-code` AV13 already covered "long-lived auth-write-blocked silent failures" — extend to "auth-by-email is not authentication".

### V24 — 2026-04-26 — ProClinic schedule sync only fetched doctor data (employee schedule empty since shipping)
- User report (verbatim): "ตอนนี้ทำไม sync หรือ นำเข้า ตารางมาได้แค่แพทย์ ช่องตารางพนักงานเหมือนไม่มีข้อมูลเลย ฝากแก้ตรงนี้ก่อน deploy".
- **Symptom**: After Phase 13.2.13/13.2.14 shipped (2026-04-26 session 5), admin clicks MasterDataTab "ดูดตารางหมอ + พนักงาน" → master_data populated → migrate to be_staff_schedules → DoctorSchedulesTab calendar shows real data. **EmployeeSchedulesTab calendar empty**. Migrator orphan reports (if any) might explain partial gaps but not 100% empty employee data.
- **Root cause**: `api/proclinic/master.js` `handleSyncSchedules` fetched `/admin/api/schedule/today` — single endpoint comment said "covers ALL staff (doctors + employees)". But ProClinic actually exposes TWO separate FullCalendar feeds, one per role:
  - `/admin/api/schedule/แพทย์?start=...&end=...` (doctor schedule page)
  - `/admin/api/schedule/พนักงาน?start=...&end=...` (employee schedule page)
  The path segment is the URL-encoded Thai role name. `/admin/api/schedule/today` either returns only doctor data or returns nothing useful (the `today` slug is wrong — confirmed via `docs/proclinic-scan/detailed-adminscheduleemployee.json` capture showing the actual URL pattern).
- **Why it slipped through**: Phase 13.2.15 (synced-data wiring E2E) verified the consumer paths via preview_eval against **hand-crafted test data in be_staff_schedules**. Nobody live-tested the actual sync button against real ProClinic — the test data bypassed the sync API entirely. V21 + V13 lessons: source-grep + UI tests cannot catch API endpoint mismatches; only end-to-end real-data verification can.
- **Worst part**: The bug shipped + V15 deploy completed (production at `9169363`). Doctor sync coincidentally worked (probably because `/admin/api/schedule/today` defaulted to doctors), masking the employee gap. User caught it manually only when actually exercising the sync flow in production.
- **Fix** (commit pending V24, to be deployed alongside Phase 13.5.4 Deploy 1):
  1. `buildScheduleDateRange()` helper — generates `start=...&end=...` query window (-180d back, +365d forward) so per-date overrides + leave entries come through. Recurring entries return regardless of range.
  2. `handleSyncSchedules` rewritten:
     - Build doctor URL: `/admin/api/schedule/${encodeURIComponent('แพทย์')}?{range}`
     - Build employee URL: `/admin/api/schedule/${encodeURIComponent('พนักงาน')}?{range}`
     - `Promise.all` parallel fetch with `.catch(()=>null)` per endpoint (one failure does not block the other)
     - Throw only when BOTH endpoints fail (returns non-array)
     - Merge + dedup by `proClinicId` via `Set` (defensive against overlap)
     - Return shape adds `rawDoctor` + `rawEmployee` count fields for diagnostics
- **Test bank** (`tests/proclinic-schedule-sync.test.js`): SC.E.2 + SC.E.3 updated for new URL pattern + new return shape. **NEW SC.G group (7 tests)** locks V24 fix:
  - SC.G.1 buildScheduleDateRange helper exists with start+end params
  - SC.G.2 date range covers > 6 months (-180d, +365d, +07:00 TZ)
  - SC.G.3 Promise.all parallel fetch (not serial)
  - SC.G.4 each fetch has `.catch(()=>null)` (one failure does not block other)
  - SC.G.5 throws ONLY when both endpoints fail
  - SC.G.6 dedup by proClinicId via Set
  - SC.G.7 V24 marker in code (institutional memory grep)
- **Lessons**:
  1. **End-to-end real-data verification ≠ synthetic-data verification**. Phase 13.2.15 SD test bank simulated be_staff_schedules with hand-crafted data. The pipeline downstream of be_staff_schedules worked perfectly. The pipeline UPSTREAM (sync API → master_data → migrate) was never tested with real ProClinic responses. Always trace the data the user actually sees from origin to destination — never trust mid-pipeline simulators alone.
  2. **API endpoint path comments lie when written without verification**. The "single endpoint covers all staff" comment in `handleSyncSchedules` was aspirational, not factual. Comments based on guesses ship bugs. If you can't verify the comment is true via opd.js / curl, mark it `// TODO verify endpoint scope` instead.
  3. **One-endpoint fits all is a code smell**. ProClinic exposes per-role pages — they're VERY likely to expose per-role APIs too. When a sync API URL doesn't include the obvious discriminator (role / type / scope), suspect it's wrong.
  4. **URL-encoded Thai path segments are easy to miss in greps**. `encodeURIComponent('แพทย์')` = `%E0%B9%81%E0%B8%9E%E0%B8%97%E0%B8%A2%E0%B9%8C` — capture files contain the encoded form. Searching for "แพทย์" in capture files won't match. Decode first OR search for the encoded prefix `/admin/api/schedule/%E0%B9`.
- **Rule/audit update**: `/triangle-inspect` skill should add "verify the sync endpoint URL via opd.js network capture" to the Phase 0 audit. Add a new audit invariant to `/audit-anti-vibe-code` AV13: "any sync endpoint with no role/scope discriminator must be reviewed against the real ProClinic page's network feed". Capture the FullCalendar feed URL pattern in `docs/proclinic-feed-urls.md` for future Phase work.

### V23 — 2026-04-26 — Patient form submit via QR/link blocked by opd_sessions firestore rule for anon-auth users (live since 2026-03-23 — entire project history)
- User report (verbatim): "ตอนนี้กดส่งข้อมูลคนไข้ผ่านลิ้งหรือ QR code แล้วขึ้นผิดพลาดตลอดส่งไม่ได้" + "กรอก patientform แล้วกดส่งแล้วผิดพลาด เกิดอะไรขึ้น ทำไมไม่เทสและทดสอบให้ผ่าน หลุดไปได้ยังไง" + "ดูที่อื่นที่หน้าจะพังเหมือนกันนี้ หรือคล้ายๆกันมาด้วย" + "เช็คให้หมดทั้ง frontend แบบ 100% จริงๆ ว่าจะไม่มีบั๊คแบบนี้หรือใกล้เคียงกับแบบนี้อีกแล้ว".
- **Symptom**: alert "เกิดข้อผิดพลาดของระบบ" (PatientForm.jsx:386) on form submit when accessed via `?session=...` QR/link from non-logged-in device. Plus 2 silent-fail course-refresh writes on `?patient=...` that never surfaced because of `.catch(() => {})` swallow.
- **Root cause**: `firestore.rules` lines 56-60 (UNCHANGED since initial commit `554506b`, 2026-03-23) had:
  ```
  match /opd_sessions/{sessionId} {
    allow read: if isSignedIn();
    allow create: if true;  // Patients can submit forms without login
    allow update, delete: if isClinicStaff();
  }
  ```
  The comment is wrong — patients hit `updateDoc` (PatientForm.jsx:372), not `create`. Original kiosk-only design assumed admin was always logged in on the device, so `isClinicStaff()` was true. Once a patient opens the QR/link on their OWN device, `signInAnonymously` runs (App.jsx:89) — anon users have no `@loverclinic.com` email → `isClinicStaff()` returns false → PERMISSION_DENIED.
- **Why it slipped through (V11/V13/V14/V21 cluster repeated)**:
  - V16 (2026-04-25) fix focused on RENDERING (gate render until anon-auth resolves). Nobody tested the WRITE path with anon auth.
  - `tests/public-link-auth-race.test.js` (V16 lock spec) only asserts source shape (sessionExists init, gate ordering, listener gating). Never simulates a write.
  - `tests/e2e/public-links-no-auth.spec.js` (commit `2001aa6`) only asserts page RENDER + "Invalid Link" doesn't flash. Never fills + submits.
  - This is the V21 lesson exactly — source-grep + render tests can encode broken WRITE behavior. Pair with runtime write probes.
- **Worst part**: this bug was LIVE in production since the initial commit (2026-03-23) — over a month — but only surfaced as widespread customer reports recently. The clinic operated for the entire window because patient submissions usually happen on kiosks where admin is already logged in (so the user IS clinic staff per the rule). QR/link from patient's own device = anon auth = silent failure (or visible alert). The "test once, ship forever" pattern misses these. **The Probe-Deploy-Probe rule (B) had 4 endpoints — none tested anon-auth client writes.** That's the gap that allowed this to slip past V1, V9, AND every subsequent rules deploy.
- **Comprehensive 100%-frontend sweep result** (per user "ดูที่อื่นที่หน้าจะพังเหมือนกันนี้ + เช็คให้หมดทั้ง frontend แบบ 100%"): EXACTLY 3 anon-reachable Firestore write sites exist. All 3 target the same collection (`opd_sessions`):
  1. `src/pages/PatientForm.jsx:372` — visible alert (handleSubmit)
  2. `src/pages/PatientDashboard.jsx:403` — silent fail (.catch fire-and-forget)
  3. `src/pages/PatientDashboard.jsx:410` — silent fail (console.warn caught at 420)
  Adjacent risk surfaces verified safe: storage.rules locked to clinic-staff email; Cloud Functions use firebase-admin SDK (bypass rules); /api/proclinic/* runs server-side (Vercel + ProClinic creds). No upload paths or other anon-write paths exist.
- **Fix** (single rule narrow + V21-paired test bank):
  1. firestore.rules opd_sessions block — narrow `update` to `isClinicStaff()` OR (`isSignedIn()` AND `affectedKeys().hasOnly([11-field whitelist])`); mirrors V19 pattern.
  2. `.claude/rules/01-iron-clad.md` Rule B — extend probe list 4 → 5 endpoints (NEW: anon-auth PATCH opd_sessions whitelisted field). Future rules deploys catch this regression class permanently.
  3. NEW `tests/firestore-rules-anon-patient-update.test.js` — A1-A5 source-grep regression bank (24 tests).
  4. EXTEND `tests/public-link-auth-race.test.js` — R7 group (5 tests) covering writer-side patterns.
  5. EXTEND `tests/e2e/public-links-no-auth.spec.js` — V23-lock test (Playwright fill + submit + assert success — runtime, not just shape).
- **Lessons**:
  1. **Probe list must cover EVERY auth state that writes** — unauth REST (V1/V9), anon-auth client (V23), service account, custom claims. One probe per auth state. Add NEW probe whenever a new auth-state-write-path is introduced.
  2. **Render tests aren't write tests**. V16 made the page LOAD without flashing. The fix didn't verify that the page actually WORKED for anon users. Always pair load tests with action tests.
  3. **Source-grep tests can lock in working OR broken behavior** (V21 cluster). Patient form passing source-grep tests doesn't mean it's functional. Fill + submit + assert success in a real environment OR a faithful jsdom simulation.
  4. **Long-lived bugs are the most dangerous** — they pass every audit because they were never tested. New audit category: "long-lived auth-write-blocked silent failures". Add to `/audit-anti-vibe-code` AV13.
- **Rule/audit update**: Rule B probe list extended permanently (5 endpoints). Future deploys catch this. The new test bank locks the fix shape so re-tightening can't ship without breaking tests.

### V31 — 2026-04-26 — Orphaned Firebase Auth users on staff/doctor delete (silent-swallow) + missing token revocation on credential change + no self-delete protection
- User report (verbatim, sequence): "เจอบั๊ค ลบพนักงานทิ้งไป แล้วอีเมลยัง login ได้ และลองมาสร้างพนักงานใหม่ใช้อีเมลเดิม มันบอกว่ามีเมลอยู่ในระบบแล้ว" + "ทำแล้วเทสเรื่องลบ id มาด้วยนะ อย่าให้พลาดอีก" + "เวลามีการเปลี่ยน id ในพนักงานคนเดิม id เดิม ก็ต้องใช้ไม่ได้ด้วยนะ" + "การเปลี่ยนรหัส หรือแก้ไขอื่นๆก็ต้องรองรับและทำงานได้สมบูรณ์ด้วยนะ เขียน test ให้รองรับจุดนี้แล้ว test มาให้ผ่านให้หมด" + "และไม่อนุญาติให้ไอดีตัวเองลบพนักงานที่เป็นไอดีตัวเองได้ คือห้ามลบตัวเองนั่นแหละ ป้องกันปัญหา" + "เมล mymild.tn@gmail.com ยังค้างในระบบนะ สร้างใหม่ไม่ได้" + "ยัง login ได้อยุเลย ทั้งๆที่ลบไปแล้ว".
- **Symptom 1 (orphan creation on delete)**: Admin deletes a staff via StaffTab → `handleDelete` calls `deleteAdminUser` then `deleteStaff`. The Firebase Auth deletion was wrapped in `try { await deleteAdminUser(...); } catch (e) { console.warn('Firebase delete failed (continuing with Firestore delete)'); }` — ANY error swallowed silently. Network blip, race, transient 5xx — all hidden. Then `deleteStaff` removes the be_staff doc. Result: orphan Firebase Auth user (login still works, email blocks recreation).
- **Symptom 2 (credential change leaves window)**: Admin changes a staff's email or password via StaffFormModal → `updateAdminUser` → `auth.updateUser`. Firebase auth doesn't auto-revoke refresh tokens on credential change. Old session ID tokens remain valid for ~1h after change. Stolen sessions could continue past credential rotation. Same gap on `revokeAdmin`/`clearPermission`/`setPermission` — old claims persist for ~1h after admin removes/changes them.
- **Symptom 3 (self-delete possible)**: StaffTab.handleDelete had no client-side identity check — only server-side `if (uid === caller.uid) throw 'cannot delete own account'`. Admin clicking the delete button on their OWN row would hit the server, get 400, see error in UI, but only AFTER the confirm dialog and unnecessary network round-trip. UX-wise the button should be disabled + tooltip explanatory, not "click → confirm → fail".
- **Worst part**: Bug Symptom 1 had been LIVE since Phase 12.1 shipped (2026 Q1) — every staff deletion since then had probability of leaving an orphan. User's specific orphan (mymild.tn@gmail.com) blocked re-creation. The silent-swallow was rationalized as "letting admin complete Firestore cleanup if Firebase is broken" — but in practice it created a worse state (orphan Firebase + missing be_staff link) than just failing loudly.
- **Fix** (multi-surface, single commit):
  1. **NEW** `api/admin/_lib/orphanRecovery.js` — pure decision helper `decideOrphanRecovery({email, existingUid, crossRef, ownerEmails, clinicEmailRegex})` returning `'no-existing'|'block-owner'|'block-clinic'|'block-cross-ref'|'recover'`. Plus `decisionToErrorMessage(decision, {email, crossRef})` for Thai user-facing copy.
  2. **api/admin/users.js handleCreate** — try/catch on `auth.createUser`; on `auth/email-already-exists`, look up by email + cross-reference be_staff/be_doctors via Firestore Admin SDK + apply `decideOrphanRecovery` decision. If `'recover'`: `deleteUser(existing.uid)` + retry `createUser`. If `'block-*'`: throw with Thai message identifying owner/clinic/cross-ref reason.
  3. **api/admin/users.js handleUpdate** — try/catch around `auth.updateUser`; `auth/user-not-found` → throws helpful Thai message ("ล้างค่า firebaseUid ในข้อมูลพนักงาน/แพทย์"); `auth/email-already-exists` → mirror handleCreate orphan-recovery flow. AFTER successful update, if `email`/`password`/`disabled` changed → `auth.revokeRefreshTokens(uid)` so old sessions are invalidated within ~1h ID-token TTL.
  4. **api/admin/users.js handleDelete** — try/catch around `auth.deleteUser`; tolerate `auth/user-not-found` with `{ deleted: false, alreadyGone: true }` so admin can complete Firestore cleanup of orphan be_staff/be_doctors docs whose firebaseUid no longer resolves.
  5. **api/admin/users.js handleRevokeAdmin / handleClearPermission / handleSetPermission** — all add `auth.revokeRefreshTokens(uid)` AFTER `setCustomUserClaims`. Forces removed/changed claims to take effect within 1h TTL (without revoke, old claims persist invisibly). `handleGrantAdmin` does NOT revoke (granting access — let user keep their session, claim refreshes naturally).
  6. **src/components/backend/StaffTab.jsx + DoctorsTab.jsx handleDelete** — replace silent `try/catch console.warn` with proper error classification: regex-detect `auth/user-not-found` patterns and proceed (already-gone is success-no-op); ANY other Firebase error throws a Thai-translated "ลบ Firebase account ล้มเหลว" → outer catch sets error UI → admin can retry.
  7. **src/components/backend/StaffTab.jsx + DoctorsTab.jsx self-delete protection** — import `auth` from firebase.js, compute `currentUid = auth?.currentUser?.uid || ''` and `isSelfRow = !!(s.firebaseUid && currentUid && s.firebaseUid === currentUid)`. Delete button: `disabled={busy || !canDelete || isSelfRow}`, `data-self-row={isSelfRow ? 'true' : undefined}`, tooltip falls back to "ไม่สามารถลบบัญชีของตัวเองได้" when `canDelete` is true but isSelfRow. handleDelete also early-returns with `setError('ไม่สามารถลบบัญชีของตัวเองได้')` BEFORE the `confirm()` dialog.
- **Test bank** (`tests/v31-firebase-auth-orphan-recovery.test.js` — 111 tests across 14 groups):
  - **V31.A** (8) — `decideOrphanRecovery` 5-branch coverage (no-existing / block-owner / block-clinic / block-cross-ref staff / block-cross-ref doctor / recover gmail / recover outlook / owner-precedes-clinic)
  - **V31.B** (6) — `decisionToErrorMessage` Thai copy
  - **V31.C** (6) — full handleCreate orphan-recovery flow simulator
  - **V31.D** (9) — adversarial inputs (empty/null/case/whitespace/empty-crossRef-object)
  - **V31.E** (12) — server-side source-grep regression guards (handleCreate try-catch shape, OWNER_EMAILS, LOVERCLINIC_EMAIL_RE, findStaffOrDoctorByFirebaseUid, V31 markers)
  - **V31.F** (8) — client-side StaffTab/DoctorsTab error-surfacing guards (no `continuing with Firestore delete` swallow, alreadyGone classification, Thai error message)
  - **V31.G** (5) — OWNER_EMAILS three-list sync (src/lib/ownerEmails.js + bootstrap-self.js + users.js) — anti-drift catcher
  - **V31.H** (8) — handleUpdate orphan recovery on email change (try/catch, email-already-exists branch, findStaffOrDoctorByFirebaseUid, decideOrphanRecovery, self-collision skip, user-not-found tolerance, deleteUser before retry)
  - **V31.I** (5) — credential-change `revokeRefreshTokens` (call exists, gated on credentialsChanged, covers email+password+disabled, runs AFTER updateUser)
  - **V31.J** (7) — admin/permission claim-change `revokeRefreshTokens` (revokeAdmin + clearPermission + setPermission revoke; grantAdmin does NOT revoke; revoke is AFTER setCustomUserClaims)
  - **V31.K** (6) — full delete-id flow simulator (delete → login fails → re-create works; pre-V31 BUG REPRO; V31 orphan recovery accepts orphan + refuses cross-ref)
  - **V31.L** (7) — credential-change flow simulator (change email → old fails new works; change password → old fails new works; disable → existing tokens revoked; combined email+password; orphan-recovery on email-collision; displayName-only does NOT revoke; pre-V31 vulnerability documented)
  - **V31.M** (6) — V31 marker + comment audit (institutional memory grep)
  - **V31.N** (18) — self-delete protection three-layer defense (UX disabled button + client guard + server backstop + functional simulator)
- **Pre-existing failures fixed in same commit** (per user "test ให้ผ่านให้หมด"):
  1. `tests/phase11-master-data-scaffold.test.jsx` M2 — master section count 15 → 16 (added `doctor-schedules` from Phase 13.2.7 split)
  2. `tests/backend-nav-config.test.js` I4 — same master section count update
  3. `tests/phase11-wiring.test.jsx` W1-W5 — added `listDoctors` + `listenToScheduleByDay` to AppointmentTab mock (these tests had been failing on master for unknown duration since Phase 13.2.6 onSnapshot wiring landed)
  4. `tests/customer-appointments-flow.test.js` F6.3 — relaxed regex to only assert FORM state hooks gone (not `doctors`/`staff` display state which legitimately remains for TodaysDoctorsPanel sidebar)
- **Lessons**:
  1. **Silent-swallow is anti-V21 in disguise** — `try { ... } catch (e) { console.warn('continuing'); }` is the same anti-pattern as source-grep tests that lock in broken behavior. Both rationalize "the broken case is fine" and let it become permanent state. Replace with explicit error classification (already-gone vs real-error).
  2. **Credential-change without token revoke = security gap** — Firebase admin SDK does NOT auto-revoke on `updateUser({email,password,disabled})`. Old sessions remain valid for ~1h ID-token TTL. Same applies to `setCustomUserClaims` — old claims persist. Always pair credential/claim mutations with `auth.revokeRefreshTokens(uid)` when access is REMOVED or CHANGED. Granting NEW access is OK (token refreshes naturally pick it up).
  3. **Self-delete must be defended in 3 layers** — UX (disabled button + tooltip) + client-side handler guard + server-side identity check. Layer 1 prevents normal users from clicking. Layer 2 catches keyboard/programmatic activation. Layer 3 catches direct API curl bypass. All three are mandatory because a missing layer = a bypass path.
  4. **Long-lived silent-swallow bugs sleep until they bite** — V31's bug had been live since Phase 12.1 (~Q1 2026) but only surfaced now because deletion-then-re-creation with the same email is a rare flow. Other dormant variants in the codebase: any `catch (e) { console.warn(...); /* continue */ }` pattern. Audit grep: `grep -rn "console.warn.*continuing\|catch.*console.warn.*continue" src/`.
  5. **Three-list sync drift catcher** — V31 introduced `OWNER_EMAILS` to a THIRD file (api/admin/users.js, joining src/lib/ownerEmails.js + api/admin/bootstrap-self.js). Test V31.G.3 locks parity across all three. Any future addition of a fourth file must extend the test set OR fail.
- **Rule/audit update**:
  - V31 patterns added permanently to `audit-anti-vibe-code` AV15 (silent-swallow + missing-token-revoke).
  - `audit-firebase-admin-security` should add FA15: "credential-change actions (updateUser email/password/disabled, setCustomUserClaims that REMOVES privilege) MUST call revokeRefreshTokens".

### V32-tris-ter (session 11 LINE OA shipment, 2026-04-26) — full LINE Official Account integration (Q&A bot + QR linking + comprehensive settings tab)
- **User chain (3 directives in same session)**:
  1. "SMTP ไม่ต้องทำ ไม่ต้องมีระบบรับส่งเมล มีแค่ระบบ line official" → strip email path entirely
  2. "ระบบไลน์แจ้งเตือนนัด ถามคอร์สคงเหลือ ถามวันนัดหมาย เราตั้งค่ายังไง... ProClinic ใช้ QR Code ผูก line id" → build the full LINE-Q&A + QR-link flow that ProClinic has
  3. "ทำหน้า setting line ต่างหากมาใน backend... รองรับทุกสถานการณ์" → comprehensive LineSettingsTab
  4. "ทำแล้ว test มาทุกแบบเท่าที่จะแน่ใจว่า flow ถูก wiring ถูก logic ถูก... จั๊บบั๊คให้ได้ก่อนที่ผมจะจับได้ในฐานะ user จริง"
  5. "ถ้าจำเป็นต้อง deploy เท่านั้นเพื่อการเทส อนุญาตให้ deploy ได้เลย" — conditional deploy approval
- **Strip email FIRST**: removed `nodemailer`, `getEmailConfig`, `sendEmail`, `sendDocumentEmail`, `blobToBase64`, "ส่ง Email" button + handler. server now rejects type !== 'line'. Test suite updated (26 tests → 23 tests; 3 email-only dropped).
- **NEW LINE Q&A bot + QR linking pipeline** (8 new files):
  - `src/lib/lineBotResponder.js` — pure helpers: `interpretCustomerMessage` (intent: link/courses/appointments/help), `formatCoursesReply`, `formatAppointmentsReply`, `formatHelpReply`, `formatLinkSuccessReply`, `formatLinkFailureReply` (3 reasons: invalid/expired/already-linked), `formatNotLinkedReply`, `formatThaiDate`, `generateLinkToken` (RFC4648 base32, 24 chars, 120-bit entropy)
  - `api/admin/customer-link.js` — admin-gated POST, mints one-time link tokens stored in `be_customer_link_tokens/{token}` with customerId + expiresAt + createdBy + createdAt; TTL clamped [1, 7 days]; deepLink built as `https://line.me/R/oaMessage/<botBasicId>/?LINK-<token>` when configured, fallback to bare `LINK-<token>` otherwise
  - `api/webhook/line.js` extended — `consumeLinkToken` (validates expiry + collision detection + writes lineUserId/lineLinkedAt + deletes token after success), `findCustomerByLineUserId`, `findUpcomingAppointmentsForCustomer`, `maybeEmitBotReply` orchestrator. Bot replies fire AFTER chat-message storage + try/catch swallow so bot errors never block webhook
  - `src/lib/customerLinkClient.js` — Firebase ID-token wrapper for the admin endpoint
  - `src/components/backend/LinkLineQrModal.jsx` — modal that mints token + renders QR code (uses existing `generateQrDataUrl` from documentPrintEngine); copy-token + regen + 24h TTL
  - `src/components/backend/CustomerDetailView.jsx` — "ผูก LINE" button next to "พิมพ์เอกสาร"; label flips to "LINE ✓" when customer.lineUserId is set
  - `src/components/backend/LineSettingsTab.jsx` — comprehensive admin settings (380 LOC): 3 sections (Channel creds + Bot Q&A + Customer Linking), webhook URL with copy, test-connection button (calls `api.line.me/v2/bot/info`), password-toggle on Channel Secret + Access Token, validates `enabled=true` requires creds + botBasicId starts with `@`, clamps maxCoursesInReply / maxAppointmentsInReply / tokenTtlMinutes
  - `firestore.rules` — `be_customer_link_tokens/{token}` is `read,write: if false` (client SDK blocked entirely; admin mints via firebase-admin SDK; webhook reads/writes via REST without auth — token-as-secret + LINE signature IS the gate)
- **82-test adversarial suite** (`tests/v32-tris-ter-line-bot-flow.test.js`): L1-L13 covering intent routing edge cases (LINK case-insensitive, surrounded by Thai punct, too-short rejection, invalid char rejection, intent priority), formatThaiDate boundary cases, formatCoursesReply (refunded/cancelled filtering, default-status active treatment, 20-item truncation), formatAppointmentsReply (past filtering, status filtering, sort, 10-item truncation, alternative date field name), formatLinkFailureReply 3 reasons, generateLinkToken (24-char base32, 1000 unique, alphabet check), admin endpoint shape, webhook bot integration ordering (bot AFTER storage), customer-not-linked edge case, anti-spam (length>=2 for help fallback), settings tab data-fields + clamps + validation, modal cancelRef pattern, firestore rule lockdown, nav + dashboard wiring, customer-detail button label flip.
- **4 legacy tests fixed** (cascade from new collection + nav item):
  - `branch-collection-coverage.test.js BC1.1` — added `be_customer_link_tokens` to COLLECTION_MATRIX (scope:global)
  - `phase11-master-data-scaffold.test.jsx M2` + `MASTER_STUB_IDS` — count 16 → 17, added `'line-settings'`
  - `backend-nav-config.test.js I4` — same count update + array
  - `permission-sidebar-filter.test.jsx PS1.C.1+2` — fixed by adding `'line-settings': { adminOnly: true }` to `tabPermissions.js TAB_PERMISSION_MAP`
- **Final tally**: 6125 → 6205 vitest passing (+82 new); build clean (BackendDashboard ~963 KB, +LineSettingsTab + LinkLineQrModal lazy-loaded). 9/9 e2e public-links pass.
- **Lessons**:
  1. **LINE-only Q&A bot is a thin wrapper around 3 things**: webhook intent detection (keyword match) + Firestore lookup by `lineUserId` field + LINE Reply API push. The complexity is in the FIRESTORE REST runQuery (since webhook can't use the Firebase SDK without admin creds — and chat_config token is the only secret it has).
  2. **One-time tokens MUST live in a client-blocked collection** — `be_customer_link_tokens` rule `if false` for client SDK; only firebase-admin SDK on the server can mint. Otherwise leaked tokens become identity bypass. Same lesson as Rule C2 (no `Math.random` for URL tokens).
  3. **QR linking is the missing piece for messaging-platform-customer-binding** — without it, a chatbot is decorative. With it, the platform becomes a real self-service surface. The flow: Admin generates QR with deep-link → customer opens LINE → bot sees `LINK-<token>` → server consumes + writes `lineUserId` field → Q&A queries always filter by `lineUserId`. Mirrors the ProClinic pattern user described.
  4. **Comprehensive settings UI is the difference between "deployed feature" and "usable feature"** — without LineSettingsTab, admin would need to hand-edit `clinic_settings/chat_config` in Firebase Console. With it, the channel creds, bot keywords, reply templates, token TTL, and connection test all live in one tab. User explicitly asked for "ทุกสถานการณ์" — answered with a 380-LOC tab covering every config knob the integration exposes.
  5. **Webhook bot reply MUST happen AFTER chat-message storage** — order matters because admin still needs to see the customer's incoming message in the chat panel even after bot auto-replies. Putting bot BEFORE storage would either block storage on bot errors OR make storage conditional on bot success. Current pattern: storage always runs → bot wrapped in try/catch swallow → admin sees everything; bot is best-effort.
- **Test patterns reinforced**: source-grep + RTL + adversarial inputs + boundary edge cases. The L1-L13 test bank has 82 tests across 13 dimensions because the LINE flow has many integration seams (webhook → Firestore → LINE API → admin endpoint → UI → settings). Each seam needs its own coverage. Helper-only tests (L1-L6) are foundation; integration tests (L7-L8) cover wiring; UI tests (L9-L13) cover surface.

### V32-tris-bis (session 11 follow-on, 2026-04-26) — P1-P3 batch shipment (T3.e + T4 + T5.b + T5.a)
- After V32-tris ship in session 10, user instructed "ทำทั้งหมด" (do all P1-P3 from queue). Shipped 4 deferred Tier 3 features in one session — T3.e email/LINE delivery (was BLOCKED on user config), T4 G5 customer-product-change, T5.b TFP refactor, T5.a visual designer MVP.
- **No regressions, no V-class bugs found** — V32-tris methodology held. Pure helpers + source-grep + RTL coverage = +121 tests (5984 → 6126), build clean, e2e public-links 9/9.
- **Pattern reinforced**: when user says "ทำทั้งหมด" on a queue with mixed scope (S/M/L/XL), prioritize unblocking + valuable+small first (T3.e config-missing scaffolding works without admin running prompts; T4 audit log; T5.b extract-helper; T5.a feature-on-existing-modal). Defer mega XL scopes to follow-on (drag-drop designer would have eaten the whole session).
- **Single test fix needed**: `branch-collection-coverage.test.js BC1.1` — added new collection (be_course_changes) to COLLECTION_MATRIX. Pattern: every new `be_*` collection MUST be classified in this matrix or CI fails. Cheap, prevents drift.
- **Lesson**: T3.e's "config-missing 503 with friendly error" pattern is the right way to ship a feature that depends on user-side config. Don't block the feature; ship the UI + endpoint + test path; surface a clear "config not set up — go here to fix" error. Admin can configure later without redeploy. Mirror for any future feature that depends on admin-only setup (SMS gateway, signed-URL bucket, OAuth provider).

### V32-tris (final, 2026-04-26) — wrapper-positioned text + smart staff-picker shared module + M9 admin reconciler
- After V32 base + V32-bis (inline-flex column), user STILL reported "วันที่รักษายังไม่ตรง" (rounds 3 + 4) plus "ให้ Auto ดึง field แพทย์... ทำแบบฉลาดๆ smart อะ" (BulkPrintModal had plain text inputs for staff fields, not the smart dropdown DocumentPrintModal already had).
- **Two distinct user complaints folded into one V32-tris ship**:
  1. Date alignment: V32-bis inline-flex worked in jsdom + real Chrome but html2canvas didn't render it consistently (line still crossed text). Fixed by SWITCHING TO ABSOLUTE-POSITIONED INNER WRAPPER for the PDF render path: `applyPdfAlignmentInline` now creates an inner `<span position:absolute bottom:10px>` inside each dotted-underline outer span. position:absolute is rock-solid in html2canvas. For the print window + DocumentPrintModal preview (CSS-only paths), switched to `padding-bottom: 10px` + tall composite that produces the same ~10px gap.
  2. Smart staff picker missing in BulkPrintModal: extracted `StaffSelectField` (dropdown) + `composeStaffDisplayName` / `composeStaffSubtitle` / `filterStaffByQuery` / `computeStaffAutoFill` (auto-fill helper) into `src/lib/documentFieldAutoFill.js` + `src/components/backend/StaffSelectField.jsx`. Both DocumentPrintModal AND BulkPrintModal now use the same component. **Bonus latent-bug fix**: original DocumentPrintModal version called `onChange(displayName)` with ONE arg, so the smart auto-fill (license/phone/email/position/EnglishName/signature) NEVER FIRED. New shared component emits `(displayName, record)` so auto-fill works in both modals.
- **M9 admin reconciler** (P1 polish from SESSION_HANDOFF queue): `reconcileAllCustomerSummaries` helper had been shipped previously but lacked an admin button. Added "สรุปยอดลูกค้าใหม่ทั้งหมด" card in PermissionGroupsTab (admin-gated via `useTabAccess.isAdmin`), with progress + success/failure UI states.
- **User progression in chat (4 rounds)**:
  1. "บั๊ค Bulk PDF ที่สร้างเกินมา 1 หน้า + วางตัวอักษรไม่ตรงเส้น" → V32 base
  2. "สร้างหน้าเดียวแล้ว แต่วันที่รักษายังไม่ตรง" → V32-bis (inline-flex)
  3. "วันที่รักษายังไม่ตรง ทำเสร็จแล้วกลับมาแก้ด้วย" → V32-tris first attempt (wrap + bottom:4px)
  4. "วันที่รักษาไม่ตรง ต้องเอาขึ้นอีกนิด" → V32-tris round 2 (bottom:10px + padding-bottom:10px)
- **Test bank** (this session, ALL GREEN):
  - 49 tests in `tests/v32-pdf-single-page-and-alignment.test.js` (V32.A wrapper helper, V32.B all 16 templates, V32.C source-grep, V32.D adversarial)
  - 35 tests in `tests/v32-tris-shared-staff-select.test.js` (T1 displayName, T2 subtitle, T3 filter, T4 autoFill 15 cases, T5 component grep, T6 DocumentPrintModal refactor, T7 BulkPrintModal wiring, T8 V32-tris round 2 markers)
  - 6 tests in `tests/bulk-print-staff-select-rtl.test.jsx` (full RTL flow: pick template → search → click → auto-fill verified)
  - 14 tests in `tests/m9-reconciler-admin-button.test.jsx` (M9.A source-grep, M9.B RTL with admin gate + confirm + run + success/error states)
  - 1 fixed test in `tests/document-print-xss.test.jsx` (PX1.C.4 updated to follow safeImgTag location into shared autofill module)
  - 1 fixed test in `tests/permission-button-gates.test.jsx` (PB1.B import regex relaxed to allow `useHasPermission, useTabAccess` together)
  - 1 fixed test in `tests/phase14.8c-pdf-export-flow.test.js` (E.2 updated to assert direct html2canvas + jspdf imports vs old html2pdf wrapper)
  - **Total this session: 5984 → 6005 vitest passing (+105 new tests, all green); build clean; 9/9 e2e public-links pass (no regression)**
- **Lessons** (round-3-4 specific, additive to base V32 lessons):
  1. **html2canvas's CSS engine has SILENT GAPS even for "supported" properties** — inline-flex column + justify-content: flex-end works in real Chrome AND jsdom but NOT consistently in html2canvas. When alignment matters in a PDF render, use `position: absolute; bottom: Npx` — that primitive is rock-solid across all renderers. `display: flex` works for SOME use cases (multi-line div content boxes) but is risky for spans with vertical-align constraints.
  2. **CSS-only fixes can't restructure DOM** — if your fix needs a structural change (wrap text in inner positioned span), the JS path can do it but the parallel CSS path (print window's `<style>` block, modal preview's scoped `<style>`) must use whatever CSS-only equivalent produces the same VISUAL output. Don't assume both paths can use the same fix — design the JS fix + the CSS fix together, with the visual end-state as the contract.
  3. **Latent bugs hide behind unused features** — DocumentPrintModal's smart auto-fill block had been shipped but never fired because the inner StaffSelectField only emitted `onChange(displayName)`. Nobody noticed because the original UI didn't ALSO have linked fields visible alongside the dropdown — admin would manually re-enter license number after picking doctor. The bug surfaced only when extracting + reusing the component in BulkPrintModal where the linked fields ARE visible. Lesson: when extracting shared code, audit the ENTIRE call signature contract, not just the component shape.
  4. **User feedback 4 rounds in same session means the test gap is structural** — V32 base + bis + tris all had passing source-grep tests. The user found bugs each time because tests asserted CODE SHAPE not VISUAL OUTCOME. The ONLY tests that caught real visual bugs were the runtime preview_eval measurements (gap = 2px round 1, 5.9px round 2, 10px round 4). For visual outputs (PDF, canvas, print) ALWAYS pair source-grep with runtime measurement.
  5. **Round-2 user feedback "ต้องเอาขึ้นอีกนิด" is the gold-standard requirement signal** — instead of "fix the bug" (vague), they said "push it up MORE" (specific direction + degree). Match feedback granularity in the fix: round 1 = 2px gap, round 2 = 4px, round 3 (after this entry) = 10px. The round-N gap should be 2-3x the round-(N-1) gap until the user stops complaining.
- **Rule/audit update**:
  - V32-tris locked permanently into institutional memory (this entry).
  - `audit-anti-vibe-code` AV16 already added: source-grep visual tests insufficient — pair with runtime measurement.
  - NEW Rule of 3 enforced: StaffSelectField + computeStaffAutoFill now shared. Future BulkPrint/Print flows REUSE these — DO NOT re-inline.

### V32 — 2026-04-26 — Bulk PDF blank 2nd page + text floating above dotted underline (3rd-round V21-class repeat across 16 templates)
- User report (verbatim, 2 rounds in same session): "บั๊ค Bulk PDF ที่สร้างเกินมา 1 หน้า และวางตัวอักษรไม่ตรงเส้นในหน้ากระดาษยังอยู่นะ" → after fixing only the page count: "สร้างหน้าเดียวแล้ว แต่วันที่รักษายังไม่ตรง แบบในรูป และดูที่อื่นที่จะบั๊คแบบเดียวกันแล้วแก้มาให้หมดทุก template ด้วย".
- **Two distinct bugs in one feature** — both shipped in commit `5b74bcb` (Phase 14.10-bis "PDF padding silently dropped + bulk-PDF blank-page fix") and persisted across `7312679` and `3e8b9d8` despite tests passing each time.
- **Bug 1 — Blank 2nd page**: html2pdf.js's pagebreak orchestration silently emitted a ghost page even when content fit in 1 page AND `pagebreak: { mode: 'avoid-all' }` was set. The 2026-04-25 alignment commit shipped with `pagebreak: { mode: 'avoid-all' }` claiming "force single-page render" — but the test suite only source-grepped that the option was passed; never decoded a real PDF blob to count pages. V21 lock-in (test asserted shape, not user-observable outcome).
- **Bug 2 — Text floating above the line**: `span[border-bottom:1px dotted][display:inline-block] { line-height: 1; padding-top: 6px; padding-bottom: 2px; vertical-align: bottom }` looked correct in vitest's jsdom (computed style returned exactly `lineHeight: 14px`, `paddingTop: 6px`, etc.) but **html2canvas in real Chrome did NOT honor unitless `line-height: 1` reliably** — it computed line-height ≈ 1.5 (default) so content area was ~21px instead of 14px, then padding-top: 6px pushed the text to the TOP of the box, leaving 14-15px gap above the dotted underline. User saw value text floating WAY above the line for every cert/chart/consent/treatment template.
- **Worst part**: Both bugs share the same failure mode — V21-class regression where the test bank verified CODE SHAPE but not USER-OBSERVABLE OUTCOME. The 2026-04-25 alignment commit had passing tests (`getComputedStyle` returned `paddingTop: '6px'`). The 2026-04-26 single-page commit had passing tests (`pagebreak: 'avoid-all'` source-grep). Neither tested what a HUMAN sees in the rendered PDF. User had to manually inspect the PDF → file 2 separate complaints in the same session → cycle wasted.
- **Recovery + fix** (commit `<this>`):
  1. **Bug 1 fix — DIRECT html2canvas + jsPDF (no html2pdf orchestration)**: rewrote `exportDocumentToPdf` in `src/lib/documentPrintEngine.js` to:
     - Lazy-import `html2canvas` + `jspdf` directly (transitive deps from html2pdf.js promoted to direct deps in package.json)
     - Pass EXPLICIT `width: sz.wPx, height: sz.hPx` to html2canvas (was only `windowWidth/windowHeight` which let scrollHeight drive canvas size)
     - Render via `pdf.addImage(imgData, 'JPEG', 0, 0, sz.wMm, sz.hMm)` — exactly 1 PDF page guaranteed; no `pdf.addPage()` ever called
     - Removed all `pagebreak: { mode: ... }` config
  2. **Bug 2 fix — switch from line-height+padding to inline-flex column justify-end**: `applyPdfAlignmentInline` now sets `display: inline-flex; flex-direction: column; justify-content: flex-end; align-items: flex-start; min-height: 20px; line-height: 1; padding-top: 0; padding-bottom: 2px; vertical-align: bottom` on every dotted-underline `span[display:inline-block]`. Same flex-column pattern that worked for divs (user already confirmed CC content "ทท" sits correctly on its line). flex layout is solid in html2canvas; vertical-align + line-height interpretation is not.
  3. **Mirrored fix in 3 places** (Rule of 3 enforced):
     - `src/lib/documentPrintEngine.js` — `applyPdfAlignmentInline` helper (PDF export path)
     - `src/lib/documentPrintEngine.js` — `<style>` block in `buildPrintDocument` (print window path)
     - `src/components/backend/DocumentPrintModal.jsx` — preview `<style>` block (in-modal preview)
- **Survey complete** (per user "ดูที่อื่นที่จะบั๊คแบบเดียวกันแล้วแก้มาให้หมดทุก template ด้วย"):
  - `SalePrintView.jsx` + `QuotationPrintView.jsx` use TABLE-BASED layout (no `border-bottom: dotted` underlines) → not affected
  - `BulkPrintModal.jsx` reuses `exportDocumentToPdf` → fix flows through
  - 14/16 seed templates have dotted-underline spans (verified by V32.B test) — ALL receive the inline-flex treatment now
  - 2/16 templates (`medicine-label`, `treatment-history`) use other layouts (no underlines) — correctly not touched
- **Test bank** (`tests/v32-pdf-single-page-and-alignment.test.js`, 48 tests):
  - V32.A (13) — `applyPdfAlignmentInline` pure helper unit tests (inline-flex assertion, idempotency, adversarial, V32-bis lock asserting `display: inline-flex`)
  - V32.B (17) — every seed template — alignment helper applies to ALL dotted spans/divs (loops the SEED_TEMPLATES array; 14 templates expect ≥1 match, 2 whitelisted no-underline)
  - V32.C (10) — engine source-grep regression guards (`html2canvas` import present, `jspdf` import present, NO `html2pdf.js` import, NO `pagebreak` config, `addImage` with exact mm dimensions, `applyPdfAlignmentInline` called BEFORE html2canvas, V32 marker comment present)
  - V32.D (8) — adversarial inputs (empty body, multi-style spans, Thai text, deep nesting, border-top vs border-bottom, % / em / px units, undefined attributes)
  - Updated `tests/phase14.8c-pdf-export-flow.test.js` E.2 to assert direct html2canvas + jspdf imports (was: lazy html2pdf import) and assert NO html2pdf.js import remains
- **Live preview_eval verification** on running dev server (localhost:5173):
  - All 14 templates with values: `textBelowSpanByPx = 2` (text bottom sits 2px above span border-bottom — exactly the desired 2px padding-bottom)
  - Span computed style: `display: inline-flex, flexDirection: column, justifyContent: flex-end, lineHeight: 14px, minHeight: 20px, paddingTop: 0px, paddingBottom: 2px, verticalAlign: bottom` — all correct
- **Lessons**:
  1. **html2canvas does NOT faithfully render `line-height: 1` unitless OR `vertical-align: bottom` on inline-block** — these CSS features work in real Chrome but the html2canvas reimplementation has gaps. When alignment matters in a PDF render, use FLEX LAYOUT (display: flex/inline-flex + justify-content: flex-end). flex is solid in html2canvas across all major builds.
  2. **html2pdf.js's `pagebreak: 'avoid-all'` does NOT guarantee a single page** — even if content fits, html2pdf's internal page-walk heuristic can emit a blank trailing page. For guaranteed single-page output, use `html2canvas` + `jsPDF.addImage` directly with paper-sized dimensions and NO `addPage()` calls.
  3. **Source-grep tests are false confidence for visual output** — V32 had passing tests for both bugs (`getComputedStyle.paddingTop === '6px'` ✓, `code.includes("pagebreak: 'avoid-all'")` ✓) while the rendered PDF was visibly broken. Visual outputs need either (a) a real-browser preview_eval that decodes the actual artifact (PDF page count, computed text-vs-line geometry) OR (b) the user has to verify and report. NEVER trust source-grep alone for "the rendered output looks right".
  4. **3-place mirror means 3 places to fix** — alignment CSS rules live in (a) the engine's `<style>` block for the print window (b) `applyPdfAlignmentInline` for the PDF render path (c) DocumentPrintModal preview's scoped `<style>` block. All three must change in lockstep OR the preview WYSIWYG promise breaks. Future audit should grep that all 3 carry the same flex pattern.
- **Rule/audit update**:
  - V32 entry locked into institutional memory (this V-entry).
  - `audit-anti-vibe-code` should extend AV16: "Source-grep tests for visual output (PDF, canvas, screenshot) MUST be paired with at least one runtime/preview_eval check that measures the actual rendered geometry — text-vs-line distance, page count, computed colors. Source-grep alone is insufficient for visual contracts."

---

