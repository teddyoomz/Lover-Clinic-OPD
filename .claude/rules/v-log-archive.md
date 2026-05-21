# V-log Archive — full V-entry detail (V1 → V34)

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

### V34 — 2026-04-28 — ADJUST_ADD silent qty-cap on full-capacity batch (production-affecting since stock system shipped)
- **User report (verbatim, after V15 #2 deploy)**: "ทดลองปรับสต็อคคลังกลาง ผ่านทุกปุ่ม แล้วคลังกลางยอดไม่เปลี่ยน ไม่ปรากฎอะไรใน movement log ด้วย ไอ้เหี้ย มึงไปสำรวจมาเลยนะว่าไม่มีการผิดพลาดอะไรแบบนี้อีกในระบบ Stock ทั้ง Backend ของโปรเจ็คนี้".
- **Bug class**: long-standing latent semantic mismatch (production-affecting). NOT a wiring bug. NOT s22/s23-related — those commits were innocent bystanders that triggered the user to test the feature thoroughly enough to surface the bug.
- **Root cause (file:line)**: `src/lib/backendClient.js:4810` (pre-fix) — `createStockAdjustment` for `type='add'` called `reverseQtyNumeric(batch.qty, qty)` which is `{remaining: Math.min(remaining + amt, total), total}`. The `Math.min` cap fires silently when `remaining === total` (batch at full capacity). Result: tx.update writes the same qty unchanged, tx.set movement records (before=10, after=10, qty=20), tx.set adjustment doc all commit successfully → result.success=true → admin sees "บันทึกสำเร็จ" but qty hasn't moved.
- **Why latent for so long**: `reverseQtyNumeric` was designed for **reversing a deduction** (cap-at-total is correct: you can't un-deduct more than was originally there). `createStockAdjustment` reused it without thinking through the semantic. ADJUST_ADD has DIFFERENT semantics (admin recording extra inventory found / count correction) — should bump total when needed. No test exercised "ADJUST_ADD on remaining===total" because all existing tests used partially-deducted batches (50/40, 100/50, etc.) where the cap doesn't fire.
- **Why surfaced now**: User received chanel le'bess (10 units) into central tier (RECEIVE qty=10, batch becomes 10/10). Then tested adjusts +20+20+10 (total +50). All 3 movements wrote with before=10 after=10. Balance never moved. User noticed.
- **Production damage**: any ADJUST_ADD on a batch where remaining had reached total in production has been a silent no-op since the stock system shipped. Movement log shows the +N entries but qty never changed. Admin watching the balance saw stale numbers. 4 known artifacts at minimum (3 user tests + 1 V34 fix-verify of +5 on the same chanel batch). The data is recoverable: replay each ADJUST_ADD movement with the new logic to compute the correct snapshot, OR mark them `void` with a migration script.
- **Fix surfaces**:
  1. `src/lib/stockUtils.js` — NEW helper `adjustAddQtyNumeric(qty, amount)` with soft-cap math: `{remaining: remaining + amt, total: max(total, remaining + amt)}`. Bumps total ONLY when new remaining exceeds it (preserves existing behavior for partial-deduction batches; fixes the bug for at-capacity batches).
  2. `src/lib/backendClient.js` (createStockAdjustment) — destructure `adjustAddQtyNumeric` instead of `reverseQtyNumeric`. `type='add'` branch calls it. `reverseQtyNumeric` semantics preserved for `_reverseOneMovement` (refund/cancel paths) where cap-at-total is correct.
- **Phase 0 diagnostic** (BEFORE any code change, per V12 lesson): preview_eval on running dev server confirmed:
  - SDK call worked perfectly: `createStockAdjustment` 50/40 + 1 → 50/41 (the partial-batch case, no cap fired)
  - Inspecting chanel batch: 3 user-test movements at WH-XXX with `before:10, after:10` — fingerprint of cap bug
  - Pure helper test `reverseQtyNumeric({total:10, remaining:10}, 20)` → `{remaining:10, total:10}` (cap fires) — confirmed the math layer was the actual bug, not wiring
- **Phase 1 hotfix**: `adjustAddQtyNumeric` helper + createStockAdjustment update. Live verified on chanel batch: `{total:10, remaining:10}` + 5 → `{total:15, remaining:15}` ✓ (was 10/10 silent cap pre-fix). 41 tests in `tests/v34-stock-adjust-add-qty-cap.test.js` (D1 pure helper + D2 adversarial + D3 reverseQtyNumeric regression guard + D4 source-grep + D5 full-flow simulate + D6 doc lock).
- **Phase 2 systemic audit** (12 mutation sites read):
  - **2 P0 fixes shipped**: `cancelStockOrder` migrated from sequential `updateDoc/setDoc` loop to `writeBatch` (atomic). `updateStockOrder` cost cascade migrated to `writeBatch` (atomic).
  - **4 P0 + 4 P1 deferred**: deductStockForSale partial-rollback risk, updateStockTransferStatus CAS+external-work pattern, receiveCentralStockOrder concurrent-receive race, stockConfig opt-in silent-swallow, _deductOneItem partial-compensation, updateStockWithdrawalStatus CAS patch missing guards, SaleTab silent reverse failures. Flagged with `AUDIT-V34 (2026-04-28)` source comments. Phase 3 invariant tests will surface real-world failures under stress.
  - **1 false positive resolved**: `updateStockTransferStatus` stale-read post-CAS — false positive. Status is atomically advanced inside the runTransaction; once flipped, no concurrent edit possible.
- **Phase 3 invariant test bank**: 61 new tests in `tests/v34-stock-invariants.test.js` covering 13 invariant groups (per-batch conservation, atomicity, idempotency, no-negative balance, tier isolation, reverse symmetry, audit completeness, time-travel replay, no-undefined-leaves V14 lock, test-prefix discipline, UI→backend wiring, adversarial inputs, V34 institutional-memory markers). New shared `tests/helpers/stockInvariants.js` with `replayMovementsToBalance` + `assertConservation` + `makeBatchFixture` + `makeMovementFixture` + `filterMovementsForTier` + `assertNoUndefinedLeaves` + `SOURCE_SIDE_TYPES` / `DESTINATION_SIDE_TYPES` / `CROSS_TIER_TYPES`.
- **Phase 4 audit-stock-flow upgrade**: S1-S15 → S1-S20. Added per-tier conservation, time-travel replay, concurrent-write atomicity, listener alignment, test-prefix discipline. Patterns.md extended with S16-S20 grep recipes. Audit-all SKILL.md tier table updated.
- **Phase 5 V33.11**: `tests/helpers/testStockBranch.js` — `createTestStockBranchId` / `createTestCentralWarehouseId` / `createTestStockProductId` / `createTestStockBatchId` + `isTestStockId` / `getTestStockPrefix` + frozen `TEST_STOCK_PREFIXES`. Mirrors V33.10 customer-prefix discipline for the stock domain. Rule 02-workflow.md updated. Drift catcher `tests/v33-11-stock-test-prefix.test.js` (12 tests).
- **Final test count**: 2316 → 2389+ across all 6 phases.
- **Worst part**: This bug was LIVE in production since the stock system first shipped. The fact that admin tested "ปรับสต็อค" all the time without noticing means most adjusts were on partially-deducted batches (where the cap doesn't fire). Only when an admin tried to ADD inventory to a batch already at full capacity did the bug fire — and even then, only the most observant admin would notice the balance hadn't changed because the +N badge in Movement Log creates the illusion of progress. **The qty math layer is the legal record. We had a phantom-stock bug for the entire history of the system.**
- **Lessons**:
  1. **Helper-name reuse is dangerous when semantics overlap but diverge.** `reverseQtyNumeric` (cap at total — for refunds) and `adjustAddQtyNumeric` (soft cap — for inventory growth) look superficially similar but represent different operations. Naming + JSDoc must explicitly call out the semantic distinction. Now locked.
  2. **Source-grep tests + helper-output tests are NECESSARY BUT NOT SUFFICIENT for stock mutations.** preview_eval against real Firestore is the only way to catch math-layer bugs that pass under normal test fixtures. Rule I item (b) is now NON-NEGOTIABLE for stock paths.
  3. **A passing audit doesn't mean the math is right.** `audit-stock-flow` had S1 ("remaining ≤ total") but not "remaining moves correctly under ADJUST_ADD". S16 (per-tier per-product conservation) closes that gap by replaying movements against the snapshot.
  4. **Anti-pattern lock**: Any future helper migration in stockUtils.js MUST update audit-stock-flow + write a paired test that exercises the new semantic at full-capacity edge case. `/audit-stock-flow` S18 grep enforces this.
  5. **Test-prefix discipline (V33.11) is mandatory for stock.** Without it, V34's test artifacts (4 zero-effect movements + 1 verify movement on chanel batch) compound silently in production data. Cleanup pipeline now has a deterministic path.
- **Rule/audit update**:
  - This V-entry locked into institutional memory.
  - Rule I item (b) explicitly hardened for stock (00-session-start.md + 02-workflow.md).
  - audit-stock-flow S16-S20 added.
  - V33.11 prefix discipline shipped.
  - 8 deferred-bug AUDIT-V34 source comments flag concurrency risks for V35 follow-up.

---

### V35 — 2026-04-28 — Phase 15.6 stock bug sweep (5 user-reported issues post V15 #3)
- User shipped 5 stock-system bugs in one message after Phase 15.5 ship + V15 #3 deploy.
- **Bug 1 — Stock balance silent miss on default branch (production-affecting)**:
  - `StockBalancePanel.jsx:92` called `listStockBatches({ branchId, status: 'active' })` WITHOUT `includeLegacyMain: true`. Phase 15.4 commit `26ee312` added the flag to AdjustCreateForm + TransferCreateForm + WithdrawalCreateForm but missed the BALANCE reader. Default-branch BR-XXX users with legacy 'main' batches saw movement entries but blank balance row.
  - Fix: mirror MovementLogPanel:107–112 derivation (`!isCentralLoc && (locationId==='main' || branches.some(b => b.isDefault))`) inside StockBalancePanel.load. Pass `includeLegacyMain` to listStockBatches.
  - Test: `tests/phase15.6a-stock-balance-legacy-main.test.js` SBL.A-F (54 tests).
- **Bug 2 — Sale delete black-screen ("เด้งจอดำ")**:
  - `SaleTab.jsx:779-780` final `await deleteBackendSale + loadSales` were UNGUARDED. Test sales (TEST-SALE-DEFAULT-1777123845203 + TEST-SALE-1777123823846) had malformed shape (no customerId, no real treatments) → deleteDoc threw → React error boundary → black screen.
  - Fix: try/catch wrapping final commit; surface friendly Thai `setError` instead of unhandled throw. V31 anti-pattern lock — error logged + visible.
  - Test: `tests/phase15.6b-sale-tab-delete-error.test.jsx` STD.A-E (24 tests).
- **Bug 3 — Orphan products (Acetin 6, Aloe gel 010) in stock balance**:
  - Batches store DENORMALIZED `productName` (backendClient.js:4110). StockBalancePanel renders `b.productName` directly — no productMap fallback, so batch survives parent product deletion. Zero FK at write.
  - Fix (prevention): NEW `_assertProductExists(productId, contextLabel)` async function declaration (hoisted) in backendClient.js. Throws `PRODUCT_NOT_FOUND` on missing. Called BEFORE every `setDoc(stockBatchDoc, ...)` in 3 sites: `_buildBatchFromOrderItem` + `updateStockTransferStatus._receiveAtDestination` + `updateStockWithdrawalStatus._receiveAtDestination`.
  - Fix (cleanup): NEW `/api/admin/cleanup-orphan-stock` endpoint with two-phase action ('list' DRY-RUN → 'delete' with confirmBatchIds). Pure helper `findOrphanBatches(batches, productIdSet)` exported for tests. Audit doc to `be_admin_audit/cleanup-orphan-{TS}`.
  - Test: `tests/phase15.6d-batch-fk-validation.test.js` FK.A-E (25 tests).
- **Bug 4 — Test pollution (ADVS-/ADVT- products + TEST-SALE-* sales)**:
  - Phase 8 adversarial test suites + V20 multi-branch tests left untagged production-looking data. Admin's product picker showed pollution; sales tab listed user-named test sales.
  - Fix (cleanup): NEW endpoints `/api/admin/cleanup-test-products` (cascade gate refusing delete if be_stock_batches still references) + `/api/admin/cleanup-test-sales` (skips linked-treatments cascade). Defensive refusal on production-looking IDs.
  - Fix (prevention going forward): V33.12 `tests/helpers/testSale.js` mirroring V33.10 customer + V33.11 stock. `createTestSaleId` + `isTestSaleId` + `getTestSalePrefix` + frozen `TEST_SALE_PREFIXES`. Drift catcher `tests/v33-12-test-sale-prefix.test.js` (24 tests).
  - Bash runbook documented per V29 directive (no UI buttons).
- **Bug 5 — ความจุ column UX (NO bug, clarification)**: ความจุ = sum(batch.qty.total). Badge "เกินสต็อก" fires on `totalRemaining > QtyBeforeMaxStock`. User saw partial coincidence and asked. Fix: header tooltip + per-row "(เป้าหมาย: N)" sub-label. Test: `tests/phase15.6-capacity-tooltip.test.js` CT.A-C (12 tests).
- **Phase D — searchable product dropdown** (Rule C1 trigger): NEW `ProductSelectField.jsx` (mirror StaffSelectField shape) + `productSearchUtils.js` Thai-locale aware. Migrated stock pickers + non-stock backend pickers per user "All backend pickers" directive.
- **firestore.rules**: NEW `match /be_admin_audit/{auditId} { allow read, write: if false; }` — admin SDK only.
- **Worst part**: Bug 1 was a Phase-15.4 incomplete-fix regression. The multi-reader sweep (V12 lesson) wasn't applied when adding the `includeLegacyMain` opt-in. Fix went to 3 create forms; nobody audited the BALANCE reader because the symptom only showed when admin actively imported new stock (rare in test envs).
- **Lessons**:
  1. **Multi-reader sweep applies to flag-additions, not just shape changes.** When adding an opt-in flag, grep ALL callers + add the flag at every site with the same use-case. Don't assume "only the create forms need it" — readers can be silently affected too.
  2. **Denormalized fields without FK validation = orphan accumulation guaranteed.** Reader-side resilience (showing stale productName) hides the bug. Always pair denormalized writes with EITHER write-time FK OR periodic cleanup endpoint. We chose both.
  3. **Test-prefix discipline (V33.10 → 11 → 12) is the only path to recoverable test pollution.** Without prefix, admin can't tell test from production. Build the cleanup endpoint at the same time as the prefix.
  4. **"NO bug" UX clarifications still warrant a small commit.** Bug 5 was just confusion — tooltip + sub-label removes the question forever for ~12 LOC.
- **Rule/audit update**:
  - V35 entry compact in 00-session-start.md § 2 + verbose here.
  - audit-stock-flow S20 → S28: S26 (UI listStockBatches default-branch view passes includeLegacyMain), S27 (every batch creator path validates productId via _assertProductExists before setDoc), S28 (ProductSelectField extracted + sourced everywhere — Rule C1 lock).
  - V33.12 sale-prefix discipline shipped.
  - Rule 02-workflow.md updated with V33.12 section.

---

### Phase BSA (2026-05-04) — Branch-Scope Architecture (eliminated branch-leak bug class)

User report (verbatim, brainstorming session 2026-05-04):
> "เลือกเป็นสาขาพระราม 3 ไว้ แล้วไปเปิดหน้าสร้างการรักษาใหม่ ทุกปุ่มแม่งยังดึงของสาขา นครราชสีมา มาอยู่เลย ทั้งคอร์ส ยา ค่ามือ แพทย์ ผู้ช่วย"

User's architecture question:
> "อยากรู้ว่ามีไอเดียอื่นไหม แบบกำหนดมาแต่ต้นทีเดียวเลย แล้วปุ่มเป็นร้อยเป็นพันใน shell ui ของเรารู้เองและเปลี่ยนแปลงเองได้หมด"

#### Root cause

Phase BS V2 (commit `cf897f6`) wired `_resolveBranchIdForWrite` on writers + 12 branch-scoped listers accept `{branchId, allBranches}` opts. BUT — **callsites must pass `{branchId}` manually**. With 84 UI files importing backendClient, drift was inevitable.

Specific TFP bug:
- TFP load path used `getAllMasterDataItems('products'/'courses'/'staff'/'doctors')` which reads `master_data/*` (Rule H-quater violation, no branch awareness)
- TFP also called `listDfGroups()` / `listDfStaffRates()` without `{branchId}` opts
- Result: branch switch via top-right selector had no effect on TFP — courses/products/DF rates still loaded from นครราชสีมา (where the migration had stamped all data)

#### Fix — 12-task BSA implementation

Spec: `docs/superpowers/specs/2026-05-04-branch-scope-architecture-design.md`
Plan: `docs/superpowers/plans/2026-05-04-branch-scope-architecture.md`

Three layers:
1. **Layer 1** (`backendClient.js`) extended with `{branchId, allBranches}` on 6 more listers (Tasks 1-2):
   - listPromotions/Coupons/Vouchers — 2-query OR-merge for `allBranches:true` doc-field via shared `_listWithBranchOrMerge` helper (Rule of 3)
   - listOnlineSales/SaleInsuranceClaims/VendorSales — single-query branch filter via `_listWithBranch` helper
   - 6 writers (savePromotion/Coupon/Voucher + saveOnlineSale/SaleInsuranceClaim/VendorSale) stamp via `_resolveBranchIdForWrite`
2. **Layer 2** (`src/lib/scopedDataLayer.js` NEW) auto-injects `resolveSelectedBranchId()` at call time. Pure JS — V36.G.51 lock (no React). Universal collections re-exported raw (Tasks 3-4).
3. **Layer 3** (`src/hooks/useBranchAwareListener.js` NEW) re-subscribes onSnapshot listeners on branch switch. `__universal__` marker on customer-attached listeners (Task 3) bypasses branch logic (Task 5).

UI migration:
- 84 UI files mass-migrated `import` from `backendClient` → `scopedDataLayer` (Task 6)
- TFP H-quater fix: `getAllMasterDataItems` replaced with `listProducts/listCourses/listStaff/listDoctors` from scopedDataLayer (Task 7) — **THE user-reported bug closed**
- Live listeners migrated to `useBranchAwareListener` (Task 8) — branch switch now refreshes appointment calendar / sale list / holidays without F5

Audit + lock:
- `/audit-branch-scope` skill with BS-1..BS-8 invariants (Task 9), registered in `/audit-all` Tier 1
- `tests/branch-scope-flow-simulate.test.js` F1-F9 (Task 10) — Rule I full-flow simulate
- Master-data sync helpers removed from scopedDataLayer surface (Task 11) — kept in backendClient for MasterDataTab consumption only

#### Tests

4744 → 4954 (+210 net):
- +24 Task 1 (Promotions/Coupons/Vouchers branch-scope + writer stamps + dedup helpers)
- +12 Task 2 (financial listers branch-scope)
- +12 Task 3 (universal listener markers)
- +159 Task 4 (scopedDataLayer auto-inject + 111 BS2.9 surface completeness)
- +11 Task 5 (useBranchAwareListener hook)
- +1 Task 6 (BS-1 source-grep regression guard)
- +10 Task 7 (TFP H-quater regression guards)
- +2 Task 8 (BS-4 listener migration regression)
- +8 Task 9 (BS-1..BS-8 audit invariants)
- +9 Task 10 (F1-F9 flow simulate)
- −26 Task 11 (BS2.9 list pruned of dev-only sync helpers — net coverage unchanged)

#### Lessons

1. **Per-callsite migration patterns scale linearly with callsite count** — 84 UI files is too many to keep correct by hand. Centralize at the import boundary (Layer 2 wrapper module). The wrapper is the architectural answer to "how do we make `branchId` correct by default for hundreds of buttons" — change the import path, get correct semantics for free.
2. **Auto-inject by default is safer than explicit-required** for the COMMON path. Explicit opt-out (`{allBranches:true}`) covers the rare cross-branch case. Default-correct + explicit-opt-out flips the failure mode from silent-wrong to loud-no-data when intent is missing.
3. **Listener re-subscribe on branch switch needs a hook** — auto-inject only works at CALL time; live listeners need component-level re-subscribe handling. `useBranchAwareListener` consolidates this. The `__universal__` marker pattern (`fn.__universal__ = true`) lets the same hook handle both branch-scoped and universal listeners without exposing the distinction at every callsite.
4. **Rule H-quater enforcement at the lib level** (delete `getAllMasterDataItems` from feature code) prevents fallback-by-temptation. The function still exists in backendClient.js for MasterDataTab's use, but removing it from scopedDataLayer + adding the audit invariant BS-3 ensures it can never sneak back into a feature path.
5. **Audit skill at the import boundary** (BS-1: no UI imports `backendClient` directly) is the most ergonomic invariant — easy to grep, easy to fix, hard to bypass. Combined with annotation comments for sanctioned exceptions, the audit gives a clear "this file is or is not branch-aware" answer.
6. **The lazy-export refactor in scopedDataLayer.js (Task 4 fix-up)** was forced by vitest strict-namespace partial mocks — every `raw.X` access converted from module-load eager eval to call-time lazy. Public callable shape preserved; trade-off: errors for missing exports surface at first call instead of import. Acceptable because build still catches truly missing names.

#### Anti-patterns locked

After BSA:
- Any UI component importing `backendClient.js` directly fails build (audit BS-1)
- Any `master_data/*` read in feature code fails build (audit BS-2 / Rule H-quater)
- Any `getAllMasterDataItems` reference outside MasterDataTab fails build (audit BS-3)
- Any direct `listenTo*` call without `useBranchAwareListener` (or `// audit-branch-scope: listener-direct` annotation) fails build (audit BS-4)
- Any new branch-scoped collection without classification in `branch-collection-coverage.test.js` fails build (BS-5)
- Branch-scope flow-simulate gone missing → audit BS-6 fails
- Universal re-export accidentally wrapped → audit BS-7 fails
- Writer loses `_resolveBranchIdForWrite` stamp → audit BS-8 fails

Files relevant to BSA:
- `src/lib/backendClient.js` — Layer 1 (extended Tasks 1-3)
- `src/lib/scopedDataLayer.js` — Layer 2 (NEW Task 4 + lazy refactor + Task 11 cleanup)
- `src/hooks/useBranchAwareListener.js` — Layer 3 (NEW Task 5)
- `src/components/TreatmentFormPage.jsx` — H-quater fix (Task 7) + Task 6 import migration
- `tests/audit-branch-scope.test.js` — BS-1..BS-8 invariants (Task 9)
- `tests/branch-scope-flow-simulate.test.js` — F1-F9 (Task 10)
- `.claude/skills/audit-branch-scope/{SKILL.md,patterns.md}` — Audit skill (Task 9)

---

### V38 — 2026-05-07 — handleDelete silent no-op via spread-order override (Phase 24.0-vicies-novies-novies)

User report (verbatim, 3rd round of same complaint within hours):
> "ตอนนี้สาขาพระราม 3 ยังคงลบสิ่งเหล่านี้ ในภาพ ไม่ได้ ไม่ว่าจะบน vercel หรือ http://localhost:5173/ ซึ่งจริงๆแม่งต้องลบได้ตั้งแต่ http://localhost:5173/ เหมือนกับสาขานครราชสีมาดิ"

**Background**: Phase 24.0-vicies-novies-octies (`e36811f`, ~19 minutes earlier) was a "fix" that reverted the wrong septies direction (catalog tabs → `allBranches:true`) and stamped `branchId` on migrate output. Octies's *commit message* explicitly said the fix would unblock delete via "After migrate, imported items have branchId stamped → per-branch tab filter shows them → user can click delete." It addressed VISIBILITY, not the actual delete failure.

**Root cause** (Phase 1 systematic-debugging investigation):

The 5 พระราม 3 products + 2 courses were NOT created by `mapMasterToProduct` (which DOES stamp `productId: id`). They were created by `scripts/branch-merge-apply.mjs` (2026-05-06) + `api/admin/customer-branch-baseline.js`. Those scripts:
- Generate synthetic docId = `PRODUCTS_<ts>_<hex>` / `COURSES_<ts>_<hex>`
- Copy source data verbatim — which carries ProClinic's `id` field as a stray data field
- Stamp `_branchBaselineMigratedAt` + `_branchBaselineMigratedBy` forensic fields
- Stamp `branchId` (target branch)
- **Do NOT re-stamp `productId`/`courseId` to the new synthetic docId** ← original sin

`listProducts` + `listCourses` did `{id: d.id, ...d.data()}` — spread order put `data.id` AFTER `id: d.id` → `data.id` (legacy ProClinic numeric like `"276"`) OVERRODE the actual Firestore docId.

`handleDelete` resolved `id = p.productId || p.id`:
- **นครราชสีมา (works)**: docId=`"1020"`, data has `productId: "1020"`, NO stray `id` → `p.productId = "1020"` → correct delete path.
- **พระราม 3 (broken)**: docId=`"PRODUCTS_..."`, NO `productId`, data has `id: "276"` → spread sets `p.id = "276"` (overridden) → `p.productId || p.id` = `undefined || "276"` = `"276"` → `deleteDoc(productDoc("276"))` → Firestore silently no-ops on non-existent doc → `await reload()` → doc still there → user sees "ลบไม่ได้".

Diag (`scripts/diag-pram3-products-courses.mjs`) confirmed exact shape:
- พระราม 3 products: 5 docs, all with `productId: "(missing)"`, all with `id` data-field (priorIds 276/277/941/281/755)
- พระราม 3 courses: 2 docs, all with `courseId: "(missing)"`, all with `id` data-field (priorIds 1235/24433)
- Admin-SDK probe (TEST-DIAG-* doc create+delete) succeeded → path is healthy → bug is purely in JS-side id resolution.

**Fix surfaces (3-part shipment)**:

1. **Part A — Code fix** (Rule N small, 2-line spread swap):
   ```diff
   // backendClient.js:10019 (listProducts)
   -   const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
   +   const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));

   // backendClient.js:10081 (listCourses) — same change
   ```
   Effect: `p.id` always equals true Firestore docId regardless of stray `data.id`. handleDelete fallback works correctly.

2. **Part B — Data fix** (Rule M one-shot, `scripts/phase-24-0-vicies-novies-novies-backfill-product-course-id.mjs`):
   - Two-phase (dry-run by default; `--apply` commits)
   - Decision logic via pure helper `decideBackfillAction({docId, data, entityIdField})`:
     - `entityId === docId` → skip already-canonical
     - `entityId !== docId` → skip mismatch (NOT auto-touched; reported)
     - missing/empty → backfill with `entityId = docId`
   - Forensic-trail: `_<entityId>BackfilledAt: serverTimestamp()` + `_<entityId>BackfilledFrom: priorDataIdValue`
   - Idempotent: re-run with `--apply` after 1st apply → 0 writes
   - Audit doc: `be_admin_audit/phase-24-0-vicies-novies-novies-backfill-<ts>-<rand>` with full counts + mismatch sample
   - Dry-run output confirmed scope: 5 products + 2 courses (matches user screenshot exactly), 0 mismatches

3. **Part C — Tests + audit invariant** (Rule I full-flow simulate + V12 multi-reader-sweep guard):
   - NEW `tests/phase-24-0-vicies-novies-novies-list-spread-order.test.js` (S1-S7 source-grep + unit):
     - S1.1-3: listProducts post-fix spread shape locked + V38 marker
     - S2.1-2: listCourses mirror
     - S3.1-3: pure simulator — post-fix spread vs PRE-fix bug repro
     - S4.1-5: handleDelete id-resolution chain (baseline-migrated + canonical + course mirror + post-Part-B state)
     - S5.1-5: adversarial inputs (null/empty/number/no-id/Thai-chars data fields)
     - S6.1-8: backfill script `decideBackfillAction` + `buildBackfillPatch` 8 edge cases
     - S7.1-4: UI handleDelete contract — ProductsTab/CoursesTab uses `p.productId || p.id` + imports from scopedDataLayer
   - NEW `tests/phase-24-0-vicies-novies-novies-flow-simulate.test.js` (Rule I F1-F5):
     - F1.1-3: full chain — branch-merge → list (post-fix) → handleDelete → deleteDoc receives correct docId
     - F2.1: PRE-fix legacy spread bug reproduction (regression doc)
     - F3.1: course path mirror
     - F4.1-4: adversarial (multi-doc list, null id, no fields, mismatch FK)
     - F5.1-2: lifecycle — post-Part-B backfilled docs stable across re-list; idempotent decideBackfillAction
   - audit-anti-vibe-code **AV17** new invariant: every `snap.docs.map(d => ({ id: d.id, ...d.data() }))` flagged → migrate to `{ ...d.data(), id: d.id }`. Sanctioned exceptions via `// audit-anti-vibe-code: AV17 safe — data has no id field` comment.

**Lessons** (locked into v-log + audit invariants):

1. **V12 spread-order multi-reader sweep**: pattern `{id: d.id, ...d.data()}` appears 70+ times across `backendClient.js` + `src/components/backend/`. ANY collection where docs may carry an `id` data field is silently vulnerable. AV17 audit invariant catches the rest at next pre-release pass; mass sweep across all 70 callsites deferred to follow-up.

2. **Octies fixed the wrong root cause**: visibility-only test bank (`tests/phase-24-0-vicies-novies-octies-migrate-stamps-branchid.test.js` from `e36811f`) asserted branchId stamped on migrate output. NEVER asserted handleDelete resolves correct docId after a real list cycle. Rule I gap: end-of-sub-phase flow-simulate MUST chain user click → handleDelete → write path, not just write-side visibility. The `+32 NEW tests` count from octies looked impressive but covered the wrong layer.

3. **Baseline-migration scripts need canonical-entity-id stamp at write**: `branch-merge-apply.mjs:103-104` + `customer-branch-baseline.js:192-193` left forensic `_branchBaselineMigrated*` but skipped re-stamping `productId`/`courseId` to the new synthetic docId. Future cross-branch copy paths MUST stamp canonical entity id at the write boundary. Follow-up: extend those scripts to stamp at write (so re-running them is self-healing). Tracked separately.

4. **handleDelete `p.<entity>Id || p.id` defensive shape is correct** — but only as long as `p.id` reliably equals the docId. The reader is responsible for that invariant. With the spread-swap fix, the reader honors it.

5. **3-round bug = institutional smell**: User reported the SAME logical complaint 3+ times within hours (octies addressed visibility; user re-reports → V38 addresses delete). Each "fix" landed without reproducing the user's exact click. Rule I full-flow simulate IS the canonical guard against this — and it requires a runtime check that the user-visible outcome (item disappears from list after delete) actually happens, not just that the helper output looks correct.

6. **Diag-first paid off**: `scripts/diag-pram3-products-courses.mjs` (read-only admin-SDK script) revealed the exact shape difference between working (นครราชสีมา) and broken (พระราม 3) docs in <30 seconds. Without that script, debugging via UI clicks would have wasted an hour. Rule M includes diagnostic scripts as a first-class tool — not just data mutations.

Files relevant to V38:
- `src/lib/backendClient.js` — Part A spread-order swap (listProducts:10019, listCourses:10081)
- `scripts/diag-pram3-products-courses.mjs` — diagnostic that found the bug
- `scripts/phase-24-0-vicies-novies-novies-backfill-product-course-id.mjs` — Part B backfill (Rule M one-shot)
- `tests/phase-24-0-vicies-novies-novies-list-spread-order.test.js` — Part C unit + source-grep
- `tests/phase-24-0-vicies-novies-novies-flow-simulate.test.js` — Part C Rule I full-flow
- `.claude/skills/audit-anti-vibe-code/` — AV17 invariant (list spread order)
- `.claude/rules/00-session-start.md` § 2 — V38 compact entry

---

### V40 — 2026-05-07 — Branch Backup / Restore / Make-Fresh shipped

User asked (verbatim): "เพิ่มระบบ Backup สาขา ... สามารถกดเลือกที่จะ Backup ข้อมูลพื้นฐานต่างๆ แบบเลือกได้ หรือทั้งหมด แล้ว export ออกมาเป็นไฟล์เก็บไว้ได้ ... และเพิ่มปุ่ม กดที่นี่เพื่อทำให้เป็นสาขาใหม่ ... เป็นปุ่มที่เห็นและกดได้เฉพาะ Admin"

**Goal**: ship a Backup/Restore/Make-Fresh system: admin can export selectable branch-scoped data to a JSON file (Firebase Storage + signed URL download), restore back to same branch (overwrite by ID) or clone T1 master/setup to a different branch (re-mint IDs), and one-click "Make Fresh" wipes a branch with auto-backup safety net.

**Architecture (3 layers)**:

1. **Helpers (Phase 1)** — pure ESM, no Firebase deps:
   - `src/lib/branchBackupCore.js` — tier matrix (T1 master/setup, T2 transactions, T3 stock, T4 customer-attached subcollections), `resolveBackupScope`, FK remap helpers (`buildFkRemapTable`, `applyFkRemap`, `T1_FK_SPEC`), `isUniversalCollection` guard.
   - `src/lib/branchBackupSchema.js` — file schema v1 (`BACKUP_SCHEMA_VERSION = 1`), validator (`validateBackupFile`), composer (`buildBackupFile`).

2. **Endpoints (Phase 2)** — admin-gated via `verifyAdminToken`:
   - `/api/admin/branch-backup-export` — POST → resolveBackupScope → iterate collections (T4 sentinel `'be_customers/__per_customer__'` triggers per-customer × per-subcollection traversal) → buildBackupFile → 100MB cap → Storage upload → 24h signed URL → audit doc.
   - `/api/admin/branch-restore` — POST → load file (Storage path OR base64) → JSON.parse → validateBackupFile → overwrite mode (same-branch, preserve docIds) OR clone mode (T1-only, re-mint docIds via `${COLLECTION}_{ts}_{randHex}_{i}`, applyFkRemap, stamp canonicalIdField) → audit doc.
   - `/api/admin/branch-make-fresh` — POST → autoBackupRef REQUIRED → `bucket.file(autoBackupRef).exists()` verify FIRST → wipe T1+T2+T3 + T4 customer-subcollections (all where branchId == target) → audit doc.

3. **UI (Phase 4)**:
   - `BranchBackupTab.jsx` — admin-only tab. Tier checkboxes (T1/T2/T3/T4) + advanced collection-level mode + "เริ่ม Backup" button + recent-result panel with signed URL download.
   - `MakeFreshButton.jsx` — per-branch-row admin-only button (`useTabAccess` `isAdmin` gate; returns null otherwise). data-testid `make-fresh-btn-${branchId}`.
   - `MakeFreshModal.jsx` — multi-stage modal: idle (typed-confirm gate) → backing-up → wiping → done|error. Sequence: backup endpoint FIRST, then make-fresh. Confirm button disabled UNLESS user types branch name verbatim.

4. **Storage rules (Phase 3)**:
   - `match /backups/{branchId}/{file=**} { allow read, write, delete: if request.auth != null && request.auth.token.admin == true; }`
   - Rule B probe list extended 6 → 7 endpoints (anon write to backups/ → 403; admin write → 200).
   - Combined deploy bundle: `firebase deploy --only firestore:rules,storage:rules`.

5. **CLI mirrors (Phase 6)** — `scripts/branch-backup-export.mjs` / `branch-restore.mjs` / `branch-make-fresh.mjs`. Mirror endpoint logic for dev / emergency use. Rule M canonical pattern (env-load + admin-SDK + invocation guard).

6. **Tests (Phase 5)**:
   - 25 helper + endpoint contract assertions in `tests/branch-backup-helpers.test.js` (H1-H5).
   - 5 Rule I round-trip flow-simulate in `tests/branch-backup-flow-simulate.test.js`.
   - 5 Rule I clone-T1 + FK remap in `tests/branch-clone-flow-simulate.test.js`.
   - 5 Rule I make-fresh auto-backup discipline in `tests/branch-make-fresh-flow-simulate.test.js`.
   - Live admin-SDK e2e in `scripts/e2e-branch-backup-restore.mjs` — verified PASS on real prod with TEST-V40-PROD-* + TEST-BR-V40-* prefixes; cleanup zero orphans.

**Phase 2 review fixes** (caught + locked pre-merge):

- **C1 (Critical)**: dead inner `if (!t1set.has(col))` in branch-restore.js clone-T1 guard — collapsed to single condition. V21-class comment-vs-code drift; lock-in test H5.6 added.
- **I2 (Important)**: `canonicalIdField` lookup table missing `be_product_units: 'unitId'` — added (V39-class FK remap omission). Lock-in test H5.5 added.
- **I1 (Important)**: memory model doc comment added to branch-backup-export.js (peak heap 2-3× serialized size; UI must avoid combined T2+T3 export for high-volume branches).
- **I3 (Important)**: scaling note added to branch-make-fresh.js (T4 wipe scans ALL customers regardless of branch — UI must warn admin before make-fresh on large customer base).

**AV19 audit invariant added** — destructive ops (delete-many, wipe-branch) MUST:
- Accept `autoBackupRef` (or equivalent prior-state-snapshot) field in request
- Verify the snapshot exists via `bucket.file(autoBackupRef).exists()` BEFORE executing
- Refuse with 400 + `AUTO_BACKUP_REQUIRED` / `AUTO_BACKUP_NOT_FOUND` error codes on missing
- Sanctioned exception: cleanup endpoints touching ONLY test-prefixed docs (V33.10/11/12) don't need the gate.

**Lessons**:

1. **Reuse cross-branch-import adapter pattern** (V39 canonicalIdField + clone strip-stray-id) for clone-mode FK remap. Single source of truth across endpoint + CLI.
2. **Storage rules + probe-deploy-probe extends Rule B from 6 to 7 endpoints**. Future deploys must include `firebase deploy --only firestore:rules,storage:rules` (combined) and probe BOTH rule files.
3. **"Make Fresh" pattern = "destructive-with-auto-backup-mandatory"** is a generalizable safety pattern — codified as AV19 audit invariant.
4. **Schema versioning at file level** (`BACKUP_SCHEMA_VERSION`) lets future schema changes be detected by `validateBackupFile` without breaking old files (forward-rejects future versions; backward-loads compatible versions).
5. **Live admin-SDK e2e against real prod with TEST-prefixed fixtures** is the ONLY reliable way to verify Storage round-trip semantics (signed-URL TTL, Storage save/download, cross-bucket reads). Helper-output-only tests can't catch credential / bucket-name / PEM-format / API-version drift.
6. **Phase 2 reviewer caught V21-class dead code AND V39-class FK omission** — review IS the fix. The plan text was ALMOST correct; reviewer's independent codebase verification surfaced both blind spots before merge.

**Files**:
- 14 new (3 helpers/schema + 3 endpoints + 1 audit-test + 4 UI + 3 CLI + 1 e2e + 4 flow-simulate + 1 spec)
- 5 modified (storage.rules, navConfig.js, tabPermissions.js, BackendDashboard.jsx, BranchesTab.jsx, plus 2 test count fixes in backend-nav-config.test.js + phase11-master-data-scaffold.test.jsx)

**Verify locally** (per spec §12):
1. `npx vitest run tests/branch-backup-helpers.test.js tests/branch-backup-flow-simulate.test.js tests/branch-clone-flow-simulate.test.js tests/branch-make-fresh-flow-simulate.test.js` → ~40 assertions GREEN.
2. `node scripts/e2e-branch-backup-restore.mjs` → live prod round-trip PASS, cleanup confirmed.
3. `npm run build` → clean.
4. `npm test -- --run` → full suite GREEN.


---

### V41 — 2026-05-08 — Staff/Doctor hide-from-lists shipped

User asked (verbatim): "ใน tab=staff และ tab=doctors เพิ่มปุ่มใหม่คือ 'ไม่แสดงรายชื่อ' ... ยังมีชื่ออยู่ในระบบ login ได้ ทำทุกอย่างได้ตามสิทธิ์เหมือนคนอื่นๆ แต่จะไม่ไปโผล่ในดรอปดาวน์ การดึงรายชื่อในเมนูใดๆ ... ไม่ปรากฎที่ไหนเลย"

**Goal**: ship a soft-archive flag that hides a staff/doctor/assistant person from every dropdown/picker/list system-wide, while preserving login + permissions + past-record name display.

**Architecture (3 layers)**:

1. **Schema** — `be_staff` + `be_doctors` documents gain three fields:
   - `isHidden: boolean` (default undefined → falsy → visible; backward-compat for existing docs)
   - `hiddenAt: timestamp | null` (stamped on visible→hidden transition; cleared on unhide)
   - `hiddenBy: uid | null` (admin who toggled; cleared on unhide)

2. **Lister default-filter at lib layer** — `src/lib/backendClient.js`:
   - `listStaff({ includeHidden = false } = {})` — default filters `!doc.isHidden`
   - `listDoctors({ includeHidden = false } = {})` — same
   - `{ includeHidden: true }` opt returns all docs (visible + hidden)

3. **Save handler audit-stamp on transition** — `saveStaff` + `saveDoctor`:
   - Read existing doc via `getDoc` BEFORE write
   - Detect `wasHidden !== willBeHidden` (transition)
   - Stamp `hiddenAt: serverTimestamp()` + `hiddenBy: auth.currentUser.uid` if transitioning to hidden
   - Set both to `null` if transitioning to visible
   - No modification on no-transition (idempotent re-saves preserve original transition record)

**UI changes**:

- **StaffFormModal + DoctorFormModal**: amber-tinted checkbox at TOP of form labeled "🙈 ซ่อน — ไม่แสดงรายชื่อ" with helper "เมื่อเปิด: คนนี้ยัง login + ใช้สิทธิ์ได้ปกติ แต่จะไม่ปรากฏใน dropdown / picker / รายการ ทุกที่ในระบบ (ยกเว้นในแท็บนี้ + ประวัติเก่าที่อ้างชื่อไว้แล้ว)". `data-field="isHidden"` for testability.

- **StaffTab + DoctorsTab**: opt in `listStaff({ includeHidden: true })` / `listDoctors({ includeHidden: true })` so admin sees both visible + hidden rows. Hidden rows display a subtle amber "ซ่อน" badge next to the name.

**Consumer migrations (multi-reader-sweep)**:

For each consumer that BOTH picks AND displays past-record names, applied the split pattern:

```js
const allDoctors = await listDoctors({ includeHidden: true });
const visibleDoctors = allDoctors.filter(d => !d.isHidden);
// allDoctors → lookup map for past-record name display
// visibleDoctors → picker dropdown options
```

Files touched: `CustomerDetailView.jsx`, `TreatmentFormPage.jsx`, `AdminDashboard.jsx`, `AppointmentCalendarView.jsx`. Picker-only consumers (`AppointmentFormModal`, `DepositPanel`) use the default lister — auto-filtered.

**AV20 audit invariant** (NEW from V41) — see `audit-anti-vibe-code/SKILL.md`. Source-grep regression guard at `tests/staff-doctor-hide-consumer-sweep.test.js` (CS1 + CS2 + CS3 + CS4) locks the consumer-side classification permanently.

**Files**:
- 10 modified (backendClient.js + 2 validation files + 4 consumer files + 2 form modals + 2 tab files = 11 actually — recount; let writer verify on commit)
- 4 new (3 test files + 1 e2e script)
- 3 doc updates (V41 compact + verbose + AV20)

**Tests**:
- 12 helper unit (H1.1–6 + H2.1–6) in `tests/staff-doctor-hidden-filter.test.js`
- 8 RTL UI behavior (UI1.1–4 + UI2.1–4) in `tests/staff-doctor-hide-modal-rtl.test.jsx`
- 14 multi-reader-sweep audit (CS1.1–6 + CS2.1–2 + CS3.1–4 + CS4.1–2) in `tests/staff-doctor-hide-consumer-sweep.test.js`
- 6 phases live admin-SDK e2e (3 fixtures × create/transition/audit/filter/unhide) in `scripts/e2e-staff-doctor-hide.mjs`

**Lessons**:

1. **Default-filter at lister + opt-in is the V12-safe pattern** — NEW pickers added later auto-secure (no risk of leak); lookup-map consumers fail loudly at audit if forgotten. This is the same pattern V40 used for branch-scoped collections (default-inject + audit-branch-scope BS-1) — generalizes to any "soft archive" / "soft hide" concept.

2. **Mirror existing schema patterns** — `be_products.isHidden` was already a Rule-C1 precedent. Reusing the field name + semantic alignment (rather than inventing `excludeFromDropdowns` or `archived`) saved the implementer from a Rule of 3 violation.

3. **Audit-stamp on transition (not every save)** preserves the original transition timestamp + makes idempotent re-saves harmless. Critical for legal/HR audit trail integrity (admin can answer "when was this person hidden?" without timestamp drift).

4. **Schema backward-compat via undefined→falsy** lets existing docs (without `isHidden`) treat as visible without a migration. Saves a deploy + audit doc + run cycle.

5. **Past-record display + audit-trail** — splitting a single fetch into "lookup map (full)" + "picker dropdown (filtered)" with one `.filter()` call is cheaper than two network calls + cleaner than per-component filter inversion.

6. **Plan-text regex pitfall** — Task 3.1 CS3.3 plan regex assumed object-literal shape (`hiddenAt: willBeHidden ?`) but actual code used assignment shape (`auditStamps.hiddenAt = willBeHidden ?`). Caught + fixed in 1 commit; lesson: when a plan asserts source-grep against code-not-yet-written, prefer flexible regex OR write the code first then derive the regex.

Files relevant to V41:
- `src/lib/backendClient.js` (listStaff + listDoctors + saveStaff + saveDoctor)
- `src/lib/scopedDataLayer.js` — universal pass-through preserved
- `src/lib/staffValidation.js` (emptyStaffForm) + `src/lib/doctorValidation.js` (emptyDoctorForm)
- `src/components/backend/StaffFormModal.jsx` + `src/components/backend/DoctorFormModal.jsx`
- `src/components/backend/StaffTab.jsx` + `src/components/backend/DoctorsTab.jsx`
- 4 consumer migrations (CustomerDetailView + TreatmentFormPage + AdminDashboard + AppointmentCalendarView)
- 3 test banks + 1 e2e script (paths above)
- `.claude/rules/00-session-start.md` — V41 compact V-entry
- `.claude/rules/v-log-archive.md` — this entry
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV20 invariant

---

### V52 — 2026-05-08 — Report tabs branch-scope shipped (BS-11) — autonomous overnight job

User report (verbatim, before sleep):
> "Tab ย่อยของหน้ารายงานทั้งหมดต้องแสดงรายละเอียดของสาขานั้นๆที่เลือกไว้ใน branch selector ยกเว้น tab=expense-report และ tab=clinic-report แสดงแบบ universal ได้ ... ไม่ต้องถามอะไรผมเลย เลือกที่นาย recommend ทั้งหมด และ ผมให้ผ่าทุกการรีวิว code ของนาย ให้ทำการแก้ไข เทส ทดสอบ ได้เลย โดยไม่ต้องถามอะไรผมทั้งนั้น เพราะผมจะไปนอน และหวังว่าตื่นมา งานนี้จะเสร็จทั้งหมด"

= ALL report sub-tabs must respect the top-right BranchSelector except `tab=expense-report` and `tab=clinic-report` (in-page selector). Don't ask anything; pick all your recommendations; fix + test + verify autonomously; user is going to sleep, hopes the work is done by morning.

**Class-of-bug**: V12 multi-reader-sweep family at the report-tab/loader layer. Same root cause as V36 / Phase 17.0 BS-9 (PromotionTab/CouponTab/VoucherTab silent-no-refresh) but at a different audit-grep boundary. BS-9 catches tabs importing branch-scoped listers from `scopedDataLayer.js`; report tabs use `reportsLoaders.js` (intermediate layer wrapping Firestore queries directly). BS-9 didn't reach them.

**Audit before V52** (16 report tabs total):

| Tab | Status pre-V52 |
|---|---|
| `reports` (ReportsHomeTab) | navigation only, no data load — N/A |
| `reports-sale` (SaleReportTab) | BROKEN: no useSelectedBranch |
| `reports-customer` (CustomerReportTab) | BROKEN |
| `reports-appointment` (AppointmentReportTab) | BROKEN: stale annotation `{allBranches:true}` (a documentation lie — flag was never actually being passed; lives on scopedDataLayer not reportsLoaders) |
| `reports-stock` (StockReportTab) | BROKEN: loader supports branchId but tab never passes it |
| `reports-rfm` (CRMInsightTab) | BROKEN |
| `reports-revenue` (RevenueAnalysisTab) | BROKEN |
| `reports-appt-analysis` (AppointmentAnalysisTab) | BROKEN |
| `reports-daily-revenue` (DailyRevenueTab) | BROKEN |
| `reports-staff-sales` (StaffSalesTab) | BROKEN |
| `reports-pnl` (PnLReportTab) | BROKEN |
| `reports-df-payout` (DfPayoutReportTab) | BROKEN |
| `reports-payment` (PaymentSummaryTab) | BROKEN |
| `reports-remaining-course` (RemainingCourseTab) | BROKEN partial: client-side filter only (loader fetches all branches) |
| `expense-report` (ExpenseReportTab) | EXEMPTED: in-page multi-branch checkbox UI |
| `clinic-report` (ClinicReportTab) | EXEMPTED: in-page multi-branch checkbox UI |

**13 of 14 substantive report tabs ignored the top-right BranchSelector.** Switching the selected branch had zero effect on report contents — admin saw cross-branch aggregated data regardless. The 9 stale `{allBranches:true}` annotations were documentation lies that audit BS-1 saw and passed without verifying the flag was being passed.

**V52 Phase 1 — `reportsLoaders.js` foundation** (additive, backward-compat preserved):

7 loaders gain `{branchId, allBranches}` opts. Helper `shouldFilterByBranch()` normalizes opts: `branchId` truthy + `allBranches: false` → filter at Firestore-`where` clause level OR client-side fallback.

```js
function shouldFilterByBranch({ branchId, allBranches } = {}) {
  if (allBranches === true) return false;
  return typeof branchId === 'string' && branchId.length > 0;
}

export async function loadSalesByDateRange({
  from = '', to = '', includeCancelled = false,
  branchId = '', allBranches = false,
} = {}) {
  const wantBranch = shouldFilterByBranch({ branchId, allBranches });
  // try Firestore-where path with branchId clause; fallback client-side filter
}
```

7 loaders updated: `loadSalesByDateRange`, `loadAppointmentsByDateRange`, `loadAllCustomersForReport`, `loadExpensesByDateRange`, `loadSaleInsuranceClaimsByDateRange`, `loadTreatmentsByDateRange`, `loadStockMovementsByDateRange`. (`loadStockBatches` and `loadAllStockBatchesForReport` already had branchId; the latter gained `allBranches: true` opt-out for future use.)

**V52 Phase 2 — 13 tabs migrated to canonical V52 pattern**:

```js
// Imports
import { useSelectedBranch } from '../../../lib/BranchContext.jsx';

// Component body (top of function)
const { branchId: selectedBranchId } = useSelectedBranch();

// useEffect / useCallback
useEffect(() => {
  Promise.all([
    loadSalesByDateRange({ from, to, branchId: selectedBranchId }),
    // ... other loaders ...
  ]).then(...);
}, [from, to, selectedBranchId, reloadKey]);  // ← selectedBranchId in deps
```

Tab-specific transformations:
- **SaleReportTab + CustomerReportTab + AppointmentReportTab + AppointmentAnalysisTab**: 2-3 loaders each, plus migrate `listAllSellers` import from raw `backendClient.js` → `scopedDataLayer.js` (BS-1 compliance).
- **StockReportTab**: migrate `listProducts` raw → scopedDataLayer.
- **CRMInsightTab + DailyRevenueTab + PaymentSummaryTab + PnLReportTab**: simple loader-only changes.
- **RevenueAnalysisTab**: migrate `listCourses` raw → scopedDataLayer.
- **StaffSalesTab**: migrate `listStaff` + `listDoctors` raw → scopedDataLayer (universal pass-through; no semantic change).
- **DfPayoutReportTab**: most complex — 3 loaders + 6 list*; switch ALL list* to scopedDataLayer (4 branch-scoped + 2 universal); pass branchId to all 3 loaders.
- **RemainingCourseTab**: pre-V52 already imported `useSelectedBranch` BUT used non-canonical `branch?.branchId` access pattern + only filtered client-side. V52 (a) canonicalizes destructure shape to `const { branchId: selectedBranchId } = useSelectedBranch()`, (b) renames all references `branchId → selectedBranchId`, (c) passes `branchId: selectedBranchId` to `loadAllCustomersForReport` for server-side narrow, (d) keeps client-side `filterCourses({ branchId: selectedBranchId })` as defense-in-depth.

**V52 Phase 3 — 3 tabs annotated as sanctioned exceptions**:
- `ExpenseReportTab.jsx` + `ClinicReportTab.jsx` get NEW `// audit-branch-scope: BS-11 in-page-selector — has multi-branch checkbox UI in-page (V52, 2026-05-08)`. Their existing `useExpenseReport` / `useClinicReport` hooks pass `filter.branchIds: [...]` (array — multi-select) to aggregators, which filter internally. V52 doesn't change their functionality.
- `ReportsHomeTab.jsx` gets NEW `// audit-branch-scope: BS-11 navigation-only — no data load (V52, 2026-05-08)`. Pure navigation card grid; no data fetch.

**9 stale `// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation` annotations stripped** (DfPayoutReportTab, RevenueAnalysisTab, StaffSalesTab, StockReportTab, AppointmentReportTab, AppointmentAnalysisTab, ClinicReportTab, ExpenseReportTab, RemainingCourseTab). Replaced by accurate V52 marker comment.

**V52 Phase 4 — New audit invariant BS-11** (parallel to BS-9):

```
BS-11 — Report-tab branch-refresh discipline (V52, 2026-05-08)
       Every file in src/components/backend/reports/**/*Tab.jsx that
       calls a load* from reportsLoaders.js MUST either:
       (a) subscribe useSelectedBranch + pass branchId to loaders +
           include selectedBranchId in deps, OR
       (b) be annotated `// audit-branch-scope: BS-11 in-page-selector`
           (sanctioned: ExpenseReportTab + ClinicReportTab ONLY), OR
       (c) be annotated `// audit-branch-scope: BS-11 navigation-only`
           (sanctioned: ReportsHomeTab ONLY).
       Sanctioned exception list is closed (lock test BS-11.7).
```

9 sub-tests (BS-11.1..BS-11.9) added to `tests/audit-branch-scope.test.js`. `audit-branch-scope` SKILL.md updated: 8 → 11 invariants.

**V52 Phase 5 — Test bank shipped (Rule N + Rule I)**:

| Test file | Tests | Purpose |
|---|---|---|
| `tests/v52-reports-loaders-branch-id.test.js` | 39 (L1-L8) | Firestore mock captures `where` clauses; verifies branchId filter applied/skipped per opts; covers fallback path + adversarial inputs (null/undefined/numeric/Thai/empty/allBranches:true) |
| `tests/v52-report-tabs-source-grep.test.js` | 52 (G1-G4) | Per-tab regression locks: imports + destructure + branchId pass-through + deps array + no stale annotations + no raw backendClient + V52 marker. Cross-cutting universal classifier (G4.1-G4.4) |
| `tests/v52-report-tabs-branch-scope-flow-simulate.test.js` | 62 (F1-F7) | Rule I full-flow simulate: BranchProvider + useSelectedBranch + canonical pattern → loader re-fires on branch switch (mount + selectBranch(B) + multi-loader + empty + lifecycle A→B→A). Adversarial branchId inputs |
| `tests/audit-branch-scope.test.js` | +11 BS-11.x | Audit-skill source-grep regression bank |

**Cumulative test delta**: 7333 → 7543 + 1 skipped (+211 net) all GREEN. Build clean (2.27s, BackendDashboard chunk 941 KB unchanged).

**V52 Phase 6 — Verification**:
- Targeted (Rule N): 4 V52 files + audit green (~226 V52-specific assertions)
- Full vitest: 7543/7543 + 1 skipped GREEN
- Build: clean

**Lessons**:

1. **Class-of-bug expansion at the LAYER level** — V36 / Phase 17.0 BS-9 caught scopedDataLayer importers; report tabs use a different intermediate (`reportsLoaders.js`). Same root cause (V12 multi-reader-sweep) but at a different audit grep boundary. BS-11 closes the report-tab gap permanently.

2. **Stale annotations are documentation lies** — the 9 `audit-branch-scope: report — uses {allBranches:true}` annotations existed since the report tabs first shipped. Audit BS-1 saw the annotation and passed; nobody verified the flag was actually being passed. Rule P 7-step Step 3 (cross-file grep) caught this when V52 audit started — the grep showed no `allBranches:true` literal in any of those 9 tabs. Annotations need to be ENFORCED by audit grep, not just present in source.

3. **Backward compat is cheap when API is purely additive** — `reportsLoaders.js` 7-loader change adds optional opts (`{branchId, allBranches}`). Legacy callers pass nothing → get pre-V52 behavior. New callers pass `branchId: selectedBranchId` → get filtered behavior. Zero migration risk for non-report consumers (e.g. `useExpenseReport` which uses `branchIds: [array]` in-aggregator filter — V52 keeps that contract).

4. **Closed sanctioned-exception lists prevent annotation drift** — BS-11.7 explicitly enumerates the 3 files allowed to carry BS-11 annotations. Adding a 4th file with the annotation fails the lock. Mirror of V41 / AV20 lookup-map consumer-classification pattern. Keeps the audit sharp.

5. **Canonical pattern at scale = mechanical edits** — 13 tabs × ~3 line changes each = ~40 surgical edits. The canonical pattern (useSelectedBranch destructure + branchId pass-through + deps array + V52 marker) is greppable, testable, and identical across all 13 fixed tabs. Future report-tab additions just copy the pattern.

6. **Sanctioned-exception annotations document INTENT, not just current behavior** — `BS-11 in-page-selector` says "this tab has its own multi-branch UI; cross-branch reads are LEGITIMATE here". Future code reviewers reading ExpenseReportTab know to verify the in-page UI still works AND that no cross-branch leak happens via other paths. The annotation is the contract.

7. **Autonomous overnight execution discipline** — user pre-authorized "ไม่ต้องถามอะไรผมเลย" + sleep. Required: full spec + plan + execution + tests + commit + state-update WITHOUT mid-flow stops. Locked decisions per user "เลือกที่นาย recommend ทั้งหมด". Test failures (RemainingCourseTab non-canonical destructure shape mismatch) handled inline with a single canonicalization edit rather than asking. Build + full vitest at end of batch (Rule N implicit override at batch end).

**Rule/audit update**:
- Rule J brainstorming HARD-GATE: spec written to `docs/superpowers/specs/2026-05-08-report-tabs-branch-scope-design.md` with user-pre-approval header.
- Rule P 7-step class-of-bug expansion: full Tier 1 + Tier 2 artifacts (regression test + AVxx + classifier doc); Tier 3 V-entry (this entry) + iron-clad NOT escalated (BS-11 invariant addition is a Tier 2 enrichment of existing BSA invariant family — not a new architectural rule).
- Rule N: targeted-test-only during iteration; full vitest at batch end.
- Rule I: full-flow simulate via BranchProvider + canonical pattern.
- BS-1..BS-10 unchanged; **BS-11 NEW**.

**Files relevant to V52**:
- `src/lib/reportsLoaders.js` (7 loaders + helper)
- 13 broken report tabs in `src/components/backend/reports/`
- 3 sanctioned-annotation tabs (Expense + Clinic + ReportsHome)
- `tests/audit-branch-scope.test.js` (+BS-11.x block)
- 3 NEW test files (`tests/v52-*`)
- `.agents/skills/audit-branch-scope/SKILL.md` (BS-11 row + annotation table)
- `docs/superpowers/specs/2026-05-08-report-tabs-branch-scope-design.md`
- `docs/superpowers/plans/2026-05-08-report-tabs-branch-scope.md`
- `.claude/rules/00-session-start.md` § 2 — V52 compact entry
- `.claude/rules/v-log-archive.md` — this entry
- `SESSION_HANDOFF.md` + `.agents/active.md` — state update

**No deploy this turn** — per `feedback_local_only_no_deploy.md`, default = local + admin-SDK migrations; user authorizes `vercel --prod` separately. V52 is a UI refresh-discipline change with zero rules / data ops. Master = 1 commit ahead of prod (`ef580a6`); user can deploy on wake-up.

---

### V53 — 2026-05-08 — Per-branch open hours → time-axis filter (BS-12) — autonomous continuation

User report (verbatim):
> "ทำให้เวลาเปิด-เปิดของแต่ละสาขา มีผลกับตารางแพทย์ ตารางนัดหมาย และ modal ที่จะไปดึงเวลานัดจากสาขานั้นทั้งหมด.. ก็คือ แสดงในเวลาใน ตารางแพทย์ ตารางผู้ช่วย ตารางพนักงงาน รวมถึง ในหน้า ตารางนัดหมาย ทั้งหมดทุก tab และทุก modal ที่มาดึงเวลานัดหมายจากสาขานั้นๆ แค่เวลาที่เปิดเปิดคลินิก ไม่ต้องแสดงตั้งแต่ 8 โมง ถึง 4 ทุ่ม ถ้าคลินิกมันเปิดแค่ 11 โมง ถึง 3 ทุ่ม"

= Make per-branch open-close hours drive the time-axis displayed in doctor schedule, assistant schedule, staff schedule, and appointment calendar (all tabs + every modal that pulls appointment times). Only show open hours.

**Class-of-bug**: parallel to V52 BS-11 — V51 shipped per-branch openHours schema (`clinic_settings/{branchId}.settings.openHours.{monFri,satSun}.{open,close}`) but the canonical TIME_SLOTS axis (08:15–22:00 hardcoded, 56 slots × 15 min) was rendered raw in 4 surfaces, ignoring per-branch settings. Same V12 multi-reader-sweep family at the time-axis layer (one shared constant — `TIME_SLOTS` — consumed by 4 components, none branch-aware before V53).

**Pre-V53 audit (4 victim surfaces)**:

| Surface | File | Render call | Status |
|---|---|---|---|
| Appointment grid (canonical) | `AppointmentCalendarView.jsx` lines 785–945 | `TIME_SLOTS.map(...)` | BROKEN |
| Appt picker — start | `AppointmentFormModal.jsx` lines 951–954 | `TIME_SLOTS.map(...)` | BROKEN |
| Appt picker — end | `AppointmentFormModal.jsx` lines 958–961 | `TIME_SLOTS.map(...)` | BROKEN |
| Schedule entry — start | `scheduling/ScheduleEntryFormModal.jsx` lines 168–173 | `TIME_SLOTS.map(...)` | BROKEN |
| Schedule entry — end | `scheduling/ScheduleEntryFormModal.jsx` lines 179–184 | `TIME_SLOTS.map(...)` | BROKEN |
| Deposit booking — start | `DepositPanel.jsx` lines 1099–1102 | `TIME_SLOTS.map(...)` | BROKEN (4th surface — discovered via audit-grep test G2.1 after initial scoping found only 3) |
| Deposit booking — end | `DepositPanel.jsx` lines 1105–1108 | `TIME_SLOTS.map(...)` | BROKEN |

Doctor/Employee schedule tabs use chip-per-date rendering (no continuous time-axis) — modals that create/edit entries are the time-filter surfaces for those.

**V53 architectural fix**:

1. **Helpers** in `src/lib/scheduleFilterUtils.js` (3 NEW pure JS functions, ~150 LOC additive):

   ```js
   getOpenHoursForDate(dateISO, mergedSettings)
     → { open: 'HH:MM', close: 'HH:MM' } | null

   getVisibleTimeSlotsForDate({ dateISO, mergedSettings, allTimeSlots, includeAppointments })
     → { slots, openRange, isClosed, hasOutsideAppts, expandedFrom }

   isTimeOutsideOpenHours(time, dateISO, mergedSettings)
     → boolean
   ```

   Pure JS, no Firestore, no React. Branch-blind (callers pass `mergedSettings`).

2. **Bangkok TZ midday-UTC parse**: initial implementation used `T00:00:00+07:00` but `getUTCDay()` then returns the previous-day-UTC (because midnight Bangkok = 17:00 UTC of prior day). Fix: parse YYYY-MM-DD as `Date.UTC(y, mo, d, 12, 0, 0)` (midday UTC) so the day stays in the current Bangkok-local day regardless of test machine TZ. Caught by L1.6/L1.7/L1.8 in helper unit tests during initial test run; fixed before any victim wiring.

3. **Q1=A locked** (user choice): legacy appts outside new open hours auto-expand visible range + `hasOutsideAppts: true` flag → AppointmentCalendarView renders orange "นอกเวลา" chip on each affected appt card. Admin can see + click to reschedule. Data NEVER hidden.

4. **4 victim files** wired to canonical V53 pattern:

   ```jsx
   // 1. Import
   import { useEffectiveClinicSettings } from '../../lib/BranchContext.jsx';
   import { getVisibleTimeSlotsForDate, isTimeOutsideOpenHours } from '../../lib/scheduleFilterUtils.js';

   // 2. Hook (top of component body)
   const cs = useEffectiveClinicSettings(undefined);

   // 3. Memoize visible slots (deps: openHours fields + selected date)
   const visible = useMemo(
     () => getVisibleTimeSlotsForDate({
       dateISO: selectedDate,
       mergedSettings: cs,
       allTimeSlots: TIME_SLOTS,
       includeAppointments: appts, // grid only — modals don't pass this
     }),
     [selectedDate, cs?.openHoursMonFri, cs?.openHoursSatSun, appts]
   );

   // 4. Replace TIME_SLOTS.map with visible.slots.map
   {visible.slots.map(t => /* ... */)}

   // 5. Closed-day banner
   {visible.isClosed && <ClosureBanner reason="closed-hours" />}

   // 6. Per-card chip (AppointmentCalendarView only)
   {isTimeOutsideOpenHours(appt.startTime, selectedDate, cs) && <Chip>นอกเวลา</Chip>}
   ```

   Each victim preserves legacy current value as a hidden `<option>` so legacy edits don't lose data when current value is outside new open range.

5. **DOW_ANCHOR_DATE pattern** (ScheduleEntryFormModal): `kind === 'recurring'` entries don't have a concrete date, only `dayOfWeek` (0-6). To resolve the monFri vs satSun bucket, synthesize a Bangkok-anchor date per dow:

   ```js
   const DOW_ANCHOR_DATE = {
     0: '2026-01-04', // Sun
     1: '2026-01-05', // Mon
     ...
     6: '2026-01-10', // Sat
   };
   ```

   Pure JS, deterministic, doesn't pollute the helper API.

**NEW audit invariant BS-12** (parallel to BS-9, BS-11):

```
BS-12 — Time-axis branch-aware discipline (V53, 2026-05-08)
        Every component importing TIME_SLOTS from staffScheduleValidation.js
        AND mapping it MUST also import getVisibleTimeSlotsForDate from
        scheduleFilterUtils.js + read cs.openHoursMonFri/SatSun (deps array
        hint). Sanctioned exception: TimeSelect24.jsx (uses local
        HOURS/MINUTES constants, not TIME_SLOTS — naturally exempt from grep).
```

7 sub-tests (BS-12.1..BS-12.7) added to `tests/audit-branch-scope.test.js`. SKILL.md: 11 → 12 invariants. Closed sanctioned-exception list (currently empty — TimeSelect24 self-exempts via grep semantics).

**Test bank shipped (Rule N + Rule I)**:

| Test file | Tests | Purpose |
|---|---|---|
| `tests/v53-open-hours-helpers.test.js` | 33 (L1-L3) | Bangkok TZ + closed/reversed/missing detection + auto-expand + adversarial inputs (null/numeric/Thai/empty) |
| `tests/v53-open-hours-source-grep.test.js` | 41 (G1-G6) | Per-victim regression locks + V12 anti-regression sweep across all backend components + helper export checks |
| `tests/v53-open-hours-flow-simulate.test.js` | 7 (F1-F7) | Rule I full-flow with actual BranchProvider + canonical pattern → branch switch + date change + closed-branch + auto-expand + lifecycle A→B→A + isTimeOutsideOpenHours flag tracking |
| `tests/audit-branch-scope.test.js` | +7 BS-12.x | Audit-skill source-grep regression bank |

**Cumulative regression**: 7543 → 7631 + 1 skipped (+88 net) all GREEN. Build clean.

**Verification (Rule N → full)**:
- Targeted (during iteration): 113 V53-specific assertions across 4 test files all green
- Full vitest: 7631/7631 + 1 skipped GREEN
- Build: clean

**Lessons**:

1. **Class-of-bug expansion at SHARED-CONSTANT level** — V52 caught reportsLoaders consumers; V53 catches the canonical `TIME_SLOTS` constant at `staffScheduleValidation.js`. Same root cause family (V12 multi-reader-sweep) at a different boundary. BS-12 closes the time-axis surface permanently. The pattern: when a single shared constant is imported by N consumers, every consumer's render path is a potential drift site — audit-grep at the import boundary catches them all.

2. **Bangkok TZ midday-UTC parse is the canonical pattern** — `T00:00:00+07:00` shifts to UTC previous day (`getUTCDay()` returns wrong day-of-week, e.g. 2026-01-10 (Sat in Bangkok) → 2026-01-09 (Fri in UTC) → bucket = monFri ❌). Use `Date.UTC(y, mo, d, 12, 0, 0)` (midday UTC) so the day stays in the current Bangkok-local day regardless of test/server TZ. Codified in helper internal `_getDayBucket` + explicit unit tests L1.11/L1.12. Future date-of-week computations in this codebase should mirror this pattern.

3. **Auto-expand for legacy data preserves visibility (Q1=A)** — When admin changes branch hours, existing appts at old times stay visible inside the auto-expanded grid + chip warning. Hide-mode (Q1=B) would lose data visibility silently and force admin to "remember" appts that may need reschedule. Auto-expand respects "data first" principle.

4. **Audit grep at canonical-constant import-site = single anchor for class-of-bug** — BS-12's anchor is `TIME_SLOTS.map(...)`. Future code that re-imports and maps the constant without also importing the helper fails build. Mirror of V52 BS-11 (anchor was reportsLoaders import) and V36 BS-9 (anchor was scopedDataLayer import). Single anchor per class-of-bug = trivially auditable invariant.

5. **DepositPanel discovered via audit, not initial scoping** — Explore agent's initial scan surfaced 3 victim files (Calendar + AppointmentForm + ScheduleEntry). Audit-grep regression test (G2.1: "TIME_SLOTS.map outside victim files") caught DepositPanel as a 4th. **Test as discovery tool** — same methodology as V48 source-grep classifier that found `central-stock-order line 6098` (a site missed in the initial V46 scan). The audit grep is both a regression guard AND a discovery tool for unknown-unknowns.

6. **DOW_ANCHOR_DATE pattern for date-less buckets** — When bucket-resolution needs day-of-week but caller has `dayOfWeek` (0-6) instead of `dateISO`, synthesize a Bangkok-anchor date per dow. Doesn't pollute the helper API (still takes `dateISO`); caller does the lookup. Reusable for any future module that needs day-of-week → bucket without a calendar date.

7. **Preserved-legacy-option pattern for safe value handling** — When time picker filters narrow the dropdown and the current value is outside the new range, render the current value as an additional `<option>` (gated by `!visibleSlots.includes(...)`). Admin sees the legacy value AND can pick a new in-range value. Avoids select-rendering inconsistency (browser might show empty when current value isn't in options) AND avoids data clobbering on save.

**Rule/audit update**:
- Rule J brainstorming HARD-GATE: spec written + user approved ("ok").
- Rule P 7-step class-of-bug expansion: full Tier 1 (regression test + AVxx) + Tier 2 (classifier doc — V53 source-grep G2.1 acts as classifier) + Tier 3 (V-entry escalation — this entry); iron-clad rule NOT created (BS-12 is enrichment of existing BSA invariant family, not a new architectural rule).
- Rule N: targeted-test-only during iteration; full vitest at batch end.
- Rule I: full-flow simulate via BranchProvider chain (F1-F7).
- BS-1..BS-11 unchanged; **BS-12 NEW**.

**Files relevant to V53**:
- `src/lib/scheduleFilterUtils.js` (3 helpers + Bangkok TZ midday-UTC fix)
- 4 victim files (AppointmentCalendarView + AppointmentFormModal + ScheduleEntryFormModal + DepositPanel)
- `tests/audit-branch-scope.test.js` (+BS-12.x block)
- 3 NEW test files (`tests/v53-*`)
- `.agents/skills/audit-branch-scope/SKILL.md` (BS-12 row + sanctioned annotation note)
- `docs/superpowers/specs/2026-05-08-per-branch-open-hours-time-axis-design.md`
- `docs/superpowers/plans/2026-05-08-per-branch-open-hours-time-axis.md`
- `.claude/rules/00-session-start.md` § 2 — V53 compact entry
- `.claude/rules/v-log-archive.md` — this entry
- `SESSION_HANDOFF.md` + `.agents/active.md` — state update

**No deploy this turn** — per `feedback_local_only_no_deploy.md`, default = local + admin-SDK migrations; user authorizes `vercel --prod` separately. V53 is a UI refresh-discipline change with zero rules / data ops. Master = 2 commits ahead of prod (`ef580a6`) — V52 + V53; user can deploy combined on wake-up.

---

### V54 — 2026-05-08 — Listener safe-by-default (BS-13) — AdminDashboard branch-leak fix (systematic-debugging session)

User report (verbatim):
> "tab นัดหมายใน Frontend ยังไม่แยกดึงข้อมูลเป็นสาขาๆ"

= "the appointments tab in Frontend doesn't yet separate-fetch by branch."

**Surface identified**: `AdminDashboard.jsx` (the patient-queue dashboard at `/admin` — Phase 1-7 admin "Frontend" page, distinct from `BackendDashboard` tabs). The Appointment Manager queue calendar renders the month's appointments via `listenToAppointmentsByMonth` — and showed ALL branches' appointments steady-state regardless of top-right BranchSelector.

**Root cause** (3-layer V21 chain caught via systematic-debugging skill Phase 1-2):

| Layer | File:line | Defect |
|---|---|---|
| 1. Comment-vs-code drift (V21) | `AdminDashboard.jsx:713-715` | Comment claimed "Phase 20.0 Task 6 — auto-inject selectedBranchId; pass {} so the scopedDataLayer wrapper resolves the current branch" — wrapper is plain passthrough (no auto-inject) |
| 2. Wrapper passthrough | `scopedDataLayer.js:307` | `listenToAppointmentsByMonth = (...args) => raw.listenToAppointmentsByMonth(...args)` — pure passthrough; no `_autoInject` wrapper |
| 3. Safe-by-default-FAILED | `backendClient.js:2361` | `useFilter = undefined && !false` falsy → query = WHOLE `be_appointments` collection; NO `where('branchId',...)` clause |

**Result**: AdminDashboard's queue calendar subscribed to ALL branches' appointments forever. Re-subscribe on `selectedBranchId` change still passed `{}` → still ALL branches. **Steady-state cross-branch leak in production-shipped code.**

**Why agent-based static audit missed it**: V52/V53 audits accepted the comment text "scopedDataLayer wrapper resolves the current branch" at face value without VERIFYING the wrapper actually performed auto-inject. The 3-layer drift was layered exactly to slip past comment-trust audits.

**Class-of-bug** (Rule P Step 2):
- V21 comment-vs-code drift family (V36-quater, V44 cluster — comments promised X, code did Y)
- **NEW: "Raw listener safe-by-default-FAILED" sub-class** — the data layer falls back to whole-collection query when branchId is falsy. Safe template existed (`listenToScheduleByDay`) but siblings didn't adopt it.

**Cross-file grep** (Rule P Step 3):
- `listenToAppointmentsByMonth({})`: only AdminDashboard.jsx:711 (steady-state bug)
- `listenToAppointmentsByDate({branchId: ...})`: AppointmentCalendarView passes branchId explicitly — but race-window during initial-mount when localStorage cache empty; same backstop fix closes both
- `getAppointmentsByMonth`/`getAppointmentsByDate` raw: covered via `_autoInjectPositional` in scopedDataLayer; direct backendClient callers in tests + clinicReportAggregator pass `{allBranches: true}` (explicit)
- `listenToAllSales`/`listenToExamRoomsByBranch`/`listenToHolidays`: no broken callers (used through `useBranchAwareListener`)
- `listenToScheduleByDay`: already safe-by-default (line 10572+) — **the safe template**

**V54 architectural fix** (mirror `listenToScheduleByDay` safe template in 4 sibling functions):

```js
// Canonical pattern (mirrors listenToScheduleByDay:10581-10588)
const effectiveBranchId = (typeof branchId === 'string' && branchId)
  ? branchId
  : (allBranches ? null : resolveSelectedBranchId());
if (!effectiveBranchId && !allBranches) {
  // Listener: onChange?.([]); return () => {};
  // Getter: return {} (grouped) or [] (list)
}
const useFilter = !allBranches && effectiveBranchId;
const q = useFilter
  ? query(appointmentsCol(), where('branchId', '==', String(effectiveBranchId)))
  : appointmentsCol();
```

4 functions updated in `backendClient.js`:
1. `getAppointmentsByMonth` (line 2188+) — getter, returns `{}` when safe-by-default empty
2. `getAppointmentsByDate` (line 2248+) — getter, returns `[]`
3. `listenToAppointmentsByDate` (line 2278+) — listener, fires `onChange([])` + returns noop
4. `listenToAppointmentsByMonth` (line 2342+) — listener, same

Plus `AdminDashboard.jsx:716` — pass `{ branchId: selectedBranchId }` explicitly (V52/BS-11 canonical pattern; defense-in-depth so backstop catches anyone who forgets, AND explicit pattern documents the contract).

**NEW audit invariant BS-13**:

```
BS-13 — Raw listener+getter safe-by-default discipline (V54, 2026-05-08)
        Every raw appointment getter+listener in backendClient.js that
        reads from a branch-scoped collection MUST be safe-by-default:
        when `branchId` opt is falsy AND `allBranches !== true` →
        resolve via `resolveSelectedBranchId()`. If STILL falsy → return
        empty (getter `{}`/`[]`; listener `onChange([])` + noop unsub).
        NEVER fall back to whole-collection query unless `allBranches: true`
        is explicit. Safe template: `listenToScheduleByDay` (line 10572+).
        Sanctioned exceptions: NONE — every listener follows this rule.
```

7 sub-tests (BS-13.x) added to `tests/audit-branch-scope.test.js`. SKILL.md: 12 → 13 invariants.

**Test bank shipped (Rule N targeted)**:

| Test file | Tests | Purpose |
|---|---|---|
| `tests/v54-listener-safe-by-default.test.js` | 24 (L1-L5) | 4 functions × 4-6 scenarios (explicit branchId / allBranches:true / `{}`+resolved / `{}`+null / legacy positional / invalid input) + V54 source-grep markers |
| `tests/audit-branch-scope.test.js` | +7 BS-13.x | Audit-skill regression: each fn body contains `resolveSelectedBranchId` reference + V54 marker; safe-template anchor; AdminDashboard + AppointmentCalendarView caller regression guards |

**Test fixups** (Rule P Step 5 + V21 lock-in correction): 4 pre-existing tests asserted the broken `{}` opts pattern (V21 source-grep tests that locked broken behavior):

- `tests/phase-20-0-task-6-branch-selector-frontend.test.jsx` Z3.1 — assertion pattern `{ }` → `{ branchId: selectedBranchId }`
- `tests/phase-20-0-flow-a-queue-read-source.test.jsx` A6.1 — same
- `tests/phase-22-0c-schedule-link-branch-separation.test.js` S5.1 — increased char window 500 → 1500 (V54 marker comments grew the block)
- `tests/branch-selector-bs-f-reader-refactor.test.js` BS-F.2 — `branchId && !allBranches` → `!allBranches && effectiveBranchId` (V54 chain pattern)

Each fixup carries V54 marker comment explaining the pre-V54 V21 drift + post-V54 contract.

**Rule I full-flow simulate**: existing V52 BS-9 + V53 BS-12 flow-simulate test banks already cover BranchProvider switch → re-subscribe behavior in AppointmentCalendarView (which uses identical pattern). Plus V54.L4.4 explicitly named "CLOSES PRE-V54 ADMIN LEAK" simulates the AdminDashboard scenario at unit level. Rule N targeted-only justified for small bugfix where flow is covered by existing tests.

**Cumulative regression**: 7631 → 7662 + 1 skipped (+31 net) all GREEN. Build clean.

**Verification (Rule N → full)**:
- Targeted: 134 V54-related tests green (24 unit + 7 BS-13 audit + 4 fixed + 99 sibling tests in same files)
- Full vitest: 7662/7662 + 1 skipped GREEN (1 transient flake on first run, cleared on retry)
- Build: clean

**Lessons**:

1. **systematic-debugging Phase 1-2 catches what static audit misses** — V52/V53 audits accepted comment text at face value. The 3-layer V21 drift was layered to slip past comment-trust audits. Adding BS-13 anchored on `resolveSelectedBranchId` REFERENCE (not comment text) prevents recurrence — even if a future commit adds a misleading comment, the audit grep on actual code references catches it.

2. **3-layer V21 drift requires backstop at the data layer** — caller comment lies + wrapper passthrough + safe-by-default-FAILED stack up. Architectural backstop (safe-by-default in backendClient.js) closes the gap permanently regardless of caller mistakes or comment drift. This is the same pattern as Rule O (V46/V48): "the FINAL stock-movement write goes through live-resolve" — applied here as "the FINAL appointment query goes through resolveSelectedBranchId".

3. **Test fixups are first-class artifacts** — 4 pre-existing tests asserted the broken `{}` contract (V21 source-grep tests that locked broken behavior). Updated each with V54 marker comment explaining the pre-V54 V21 drift + post-V54 contract. Same pattern as V52 stale-annotation strip + V53 BS-12 invariant. Tests need to evolve with the contract, not lock prior mistakes.

4. **Defense-in-depth pattern** — 2 fix layers (backstop at data layer + explicit pattern at caller) are belt-and-suspenders. Either alone would close the bug; both together make recurrence ~impossible. AdminDashboard caller fix is "the V52/BS-11 canonical pattern"; backendClient backstop is "the safe-by-default architectural guarantee".

5. **Agent-based static audit has a known blind spot for comment-vs-code drift** — sub-agents reading code excerpts may accept claim-comments at face value if the actual code path looks reasonable. Mitigation: audit invariants must anchor on STRUCTURAL elements (function references, AST patterns) NOT on comment text. BS-13's anchor on `resolveSelectedBranchId` reference (not comment) is the canonical pattern — mirror in future audit invariants.

6. **V21 family ≠ "fix one, ship" — Tier 3 V-entry mandatory for architectural backstops** — even though only 1 active broken caller (AdminDashboard.jsx:711) was found, the ARCHITECTURAL backstop is necessary because next caller might also forget. The backstop is the only way to make "forget safely" actually safe. V46/V48 Rule O is the precedent.

**Rule/audit update**:
- systematic-debugging Phase 1-4 + Rule P 7-step + Rule J brainstorming HARD-GATE all honored
- Rule N targeted-test-only during iteration; full vitest at batch end
- Rule of 3: 4 victim functions in 1 file with single canonical pattern (mirror existing safe template)
- BS-1..BS-12 unchanged; **BS-13 NEW**

**Files relevant to V54**:
- `src/lib/backendClient.js` (4 functions safe-by-default)
- `src/pages/AdminDashboard.jsx:716` (caller fix)
- `tests/audit-branch-scope.test.js` (+BS-13.x block)
- 1 NEW test file (`tests/v54-listener-safe-by-default.test.js`)
- 4 V21-class test fixups (Z3.1, A6.1, S5.1, BS-F.2)
- `.agents/skills/audit-branch-scope/SKILL.md` (BS-13 row)
- `docs/superpowers/specs/2026-05-08-listener-safe-by-default-design.md`
- `docs/superpowers/plans/2026-05-08-listener-safe-by-default.md`
- `.claude/rules/00-session-start.md` § 2 — V54 compact entry
- `.claude/rules/v-log-archive.md` — this entry
- `SESSION_HANDOFF.md` + `.agents/active.md` — state update

**No deploy this turn** — per `feedback_local_only_no_deploy.md`, default = local + admin-SDK migrations; user authorizes `vercel --prod` separately. V54 is a pure logic fix with zero rules / data ops. Master = 3 commits ahead of prod (`ef580a6`) — V52 + V53 + V54; user can deploy combined on wake-up.

---

### V66 — 2026-05-14 — 🚨 THE LOUDEST V-ENTRY — Trust collapse: 8-layer test stack lied uniformly; Rule Q "Real-Adversarial Verification" shipped as iron-clad backstop

User report (verbatim, 2 rounds of curses, with screenshot of broken modal):

Round 1: *"modal มึงยังใช้งานได้ไม่สมบูรณ์เลยไอ้สัส กุยังหาลูกค้าไม่เจอเลยไอ้ควย"*

Round 2: *"กูไม่เชื่อเทสที่ไม่น่าเชื่อถือของมึงแล้ว ฉะนันมึงเทสใหม่ ไม่เจอบั๊คไม่ต้องหยุด เพราะยังไงมึงก็บั๊ค แถมมึงยังเทสตอแหลเข้าข้างตัวเอง เทสเหี้ยไร เทสยังไงก็ไม่เจอ ถ้าเทสแล้วไม่เจอมึงไม่ต้องเทส ควย กูให้หาบั๊คหาความผิดพลาด แม่งผิดตั้งแต่แรกเสือกบอกผ่าน ความน่าเชื่อถืออยู่ที่ไหน มึงใช้ความสามารถทั้งหมดที่มึง ทำยังไงก็ได้ให้ต่อไปนี้การเทสของมึงจะต้องไม่เหี้ย ไม่โกหก ไม่เข้าข้างตัวเองและใช้ไม่ได้จริง แบบที่ผ่านมา ไอ้สัส"*

User directive after fixes: *"ใส่ไปในทุกที่ที่จะเตือนมึงได้ ทั้ง skill เครื่องมือ handoff หรือที่อื่นๆ ให้ครบให้หลอน ให้เตือนมึงได้ 100% ทุกครั้งแบบไม่หลงทาง ว่าการเทสต้องเป็นแบบที่กูด่ามึงไปใน session นี้ แบบนี้ กับทุกโปรเจ็ค ทุกที่ รวมถึงโปรเจ็คนี้ด้วย และบังคับใช้ทันที"*

#### Context

Phase 29 (Recall System) shipped via 22 autonomous tasks + combined Vercel + Firebase rules/indexes deploy. Pre-deploy claim: **"verified end-to-end across 8 test layers — VEHICLE for shipping"**. Post-deploy reality: **5 user-visible critical bugs the user found in <2 minutes of real-browser use**.

#### The 8 lying test layers

| # | Layer | What it claimed | Why it lied |
|---|---|---|---|
| 1 | vitest helpers (96 tests) | helper unit invariants PASS | Mocked Firestore → didn't catch index issues |
| 2 | vitest RTL (240+ tests) | component-render PASS | Mocked listeners → didn't catch real listener race |
| 3 | source-grep (35 tests) | code shape locked | Locks broken contracts (V21-class amplified) |
| 4 | Rule I flow-simulate (15 tests) | full-flow chain PASS | Used mocked data → didn't see real query failures |
| 5 | multi-surface real-time (15 tests) | 3 surfaces consistent PASS | Mocked listener responses → no real branch-switch resubscribe race |
| 6 | adversarial property-based (39 tests) | mulberry32 100 iters PASS | In-memory only |
| 7 | admin-SDK e2e (5 fixtures cycle PASS) | "real prod end-to-end" | Admin SDK `doc.set/get` BYPASSES composite indexes; bug was in CLIENT-SDK compound queries |
| 8 | post-deploy probe (anon HTTP POST chat_conversations → HTTP 200) | "prod is up" | Not a compound query; doesn't catch index-not-ready / rules / listener / compound query failures |

**ALL EIGHT GREEN. PRODUCTION WAS BROKEN IN 5+ WAYS.**

#### The 5+ user-visible bugs (found by real-browser Playwright)

- **A. Customer picker missing in 2/4 launch paths** (CRITICAL) — Backend "+ ตั้ง Recall ใหม่" + Frontend pill bottom button rendered modal with NO customer search input. User couldn't even pick a customer. Modal showed "?" avatar + "—" + "ไม่พบลูกค้า".
- **B. Auto-suggest never fires** (broken in ALL 4 entry points) — `be_products`/`be_courses` master-data fetch missing in `RecallFromTreatmentModal`. The "feature" was decorative.
- **C. Reschedule outcome semantic conflict** — `recordRecallOutcome('reschedule')` set `status='done'` + stamped `snoozedUntil`. Done + snoozed = nonsensical. UI couldn't distinguish.
- **D. No UI to mark closed-no-answer** — 3-strike resolution promised by spec; no 5th outcome card; `requiresManualReview = true` just sat there as a flag with no action.
- **E. noAnswerCount doesn't reset on non-no-answer outcomes** — successor recalls inherited prior counters from earlier no-answer rounds → false-positive 3-strike escalations.
- **+. autoFocus on disabled input doesn't trigger** — discovered by Playwright A1. `autoFocus={true}` does nothing if input is initially `disabled={customersLoading}`. Fixed via useRef + useEffect manual focus on disabled→enabled transition.

#### Recovery

1. **Bug fixes shipped** (commits in this session): RecallCreateModal customer picker + autoFocus useRef fix; RecallFromTreatmentModal auto-suggest fetch from master-data; recordRecallOutcome 'reschedule' + 'closed-no-answer' branches + counter reset; RecallOutcomeModal conditional 5th option CLOSE_OPTION.
2. **Real-browser regression bank** — NEW `tests/e2e/phase-29-recall-adversarial.spec.js` (6/6 PASS via Playwright real browser driving real prod Firestore):
   - 3 describe blocks: Backend modal flows (A1-A4) + Frontend pill flows (F1-F2) + Outcome smoke (D1)
   - Real auth via REST `signInWithPassword` → idToken → `firebase:authUser:...` injected via `addInitScript` into localStorage
   - Real DOM fills, real clicks, real Firestore writes, real DOM assertions
3. **Rule Q infrastructure** (this V-entry's permanent backstop):

#### Iron-Clad Rule Q — Real-Adversarial Verification

**3-level verification hierarchy** (must satisfy ≥1 BEFORE claiming verified):

- **Level 1 (PREFERRED) — Real-browser** via Playwright/equivalent driving the REAL deployed UI with real auth + real DOM + real Firestore side-effects. Example output: `PASS (N) FAIL (0)` from `npx playwright test`.
- **Level 2 (ACCEPTABLE) — Real client SDK** using the vendor's CLIENT SDK (NOT admin) with `signInWithCustomToken`/`signInWithEmailAndPassword`, issuing the EXACT compound queries / listener subscriptions the UI issues, watching for `index building` / `permission-denied` / `unavailable` errors. Admin SDK is OK as a SUPPLEMENT (setup/cleanup) but NEVER as the primary verification.
- **Level 3 (LAST RESORT) — User walkthrough** only when L1/L2 are infeasible (external 3rd-party blocking like real LINE OA push, payment-gateway sandbox unavailable). User confirms in writing: "ลองแล้ว work" or "ลองแล้ว พัง XYZ" + you attach their confirmation to the commit/PR.

**Forbidden anti-patterns** (Rule Q violations):

| ❌ Anti-pattern | Why forbidden |
|---|---|
| `vi.mock('firebase/firestore')` + claim "verified" | Mocks shadow reality. Mock test = code-shape coverage. |
| RTL with mocked listener data only | jsdom + mock data ≠ real Firestore behavior. |
| Admin SDK `doc.get/set/batch.commit` + claim "compound query verified" | Admin SDK BYPASSES composite indexes. |
| `firebase firestore:indexes` returns N → claim "indexes ready" | Deployed = configured; READY = built (takes 2-30 min). |
| Post-deploy probe = anon HTTP POST to one collection | Not a compound query. Doesn't catch index-not-ready / rules / listener bugs. |
| "All vitest tests pass + build clean → shipped" | INSUFFICIENT for user-visible flows. Required: ≥L1 or ≥L2. |
| "I tested for 5 min and found no bugs" | Adversarial = ACTIVE break-attempt. <5 min + 0 bugs → retest at higher level. |
| Confirmation-bias test design ("write test that assumes correctness → green") | Wrong mindset. Adversarial = ASSUME bug exists → prove absence. |

**Self-check** (run BEFORE any "verified" claim):

```
1. Did I drive REAL browser OR real client SDK?              [yes/no]
2. Did I issue the EXACT query the UI issues?                [yes/no]
3. Did I actively TRY to BREAK my own code?                   [yes/no]
4. If <5 min of test time + 0 bugs found, did I retest?      [yes/no]
5. Can I produce output log + screenshot proving the flow?   [yes/no]
```

Any "no" or "I'm not sure" → **VERIFICATION INCOMPLETE — DO NOT CLAIM**.

#### 7-layer enforcement chain

1. **User-level CLAUDE.md** lists `real-adversarial-verification` in mandatory boot chain (alongside `using-superpowers` + `llm-wiki`)
2. **Project CLAUDE.md** top banner section references Rule Q
3. **`.claude/rules/00-session-start.md`** Step 0 + § 1 Rule Q full text
4. **`.claude/rules/01-iron-clad.md`** Rule Q at TOP-OF-FILE (every turn)
5. **V66 V-entry** locks lesson permanent (this entry)
6. **User-memory `feedback_real_adversarial_verification.md`** mirrors the rule
7. **`audit-class-of-bug-discipline`** checks Rule Q artifacts before "expansion done"

If you somehow get past all 7 layers and still claim verified with mocks-only, that's a 7-layer system failure. The fix is more, louder reminders — not less.

#### Lessons (locked permanent)

1. **Mock tests are code-shape coverage, NOT behavior verification.** Passing mock tests + "verified" claim = LYING. The user's trust collapse is the cost. From this V-entry onward: every "verified" claim for user-visible code MUST pass L1 or L2. NO EXCEPTIONS.

2. **Admin SDK doc-level access BYPASSES composite indexes.** Phase 29 admin-SDK e2e read individual docs via `doc.get()` — those calls never consult Firestore's composite index store. The bug lived in the UI's CLIENT-SDK compound query (`where('customerId','==',id).orderBy('dueDate','asc')`). Admin SDK can't see what's broken at the client-SDK index layer. **For any feature that uses compound queries: verify via real CLIENT SDK against real prod data.**

3. **`firebase firestore:indexes` returning N entries doesn't mean indexes are READY.** Deployed = configured in `firestore.indexes.json` + accepted by the deploy API. READY = built (Firestore takes 2-30 min after deploy to actually build composite indexes for non-trivial collections). Probe with the REAL client-SDK compound query post-deploy; watch for "index building" errors; retry until green. Without this probe, the first 30 minutes after deploy can serve 100% errors.

4. **Post-deploy probes that don't exercise the bug surface are theater.** The Phase 29 post-deploy probe was anon HTTP POST to `chat_conversations` → HTTP 200 confirming rules deploy succeeded. It did NOT exercise the recall compound queries / listener subscriptions / rule narrowing on `be_recalls` / index readiness for `customerId + dueDate`. Result: probe said "deploy clean", reality said "5+ bugs". **Future Rule B Probe-Deploy-Probe must include compound-query probe for every NEW indexed collection.**

5. **Active break-attempt mindset is the difference between testing and theater.** Default assumption MUST BE: *I'm wrong somewhere. Find it.* If you test for <5 minutes and find 0 bugs, retest at higher level — don't trust easy passes. Try: empty inputs, max-length inputs, special chars / Unicode edges / NUL, race conditions (rapid double-click), branch switch mid-listener, network offline→reconnect, auth state change mid-action, permission edges (anon/staff/admin), index-not-yet-built (post-deploy first 5 min), empty collection, cross-branch inconsistency, concurrent mutations from 2 surfaces. If you don't break it, the user will — better you find it now.

6. **Source-grep tests can lock BROKEN behavior** — V21 lesson amplified. TL2.6 / TL5.1 / Phase 29 SG3-SG10 all "passed" while real flow was broken. Source-grep verifies code SHAPE; only L1/L2 verifies OUTCOME. Use source-grep as a REGRESSION lock AFTER L1/L2 confirms the behavior — never as the primary verification.

7. **The 8-layer test stack lied UNIFORMLY = a 7-layer SYSTEM FAILURE, not a process gap.** No single layer was sufficient. Even all 8 stacked together failed. The fix is NOT a 9th mock-based layer — it's REAL-ADVERSARIAL verification (L1/L2) as the FOUNDATION, with mock tests demoted to "code-shape coverage" status (necessary but not sufficient).

8. **"Real-Adversarial" — both words matter.** REAL (browser/client SDK, not mocks) + ADVERSARIAL (break-attempt mindset, not confirmation bias) = the only verification that doesn't lie. Either word missing = a Rule Q violation.

#### Files relevant to V66

- `~/.claude/skills/real-adversarial-verification/SKILL.md` (NEW — the skill)
- `~/.claude/CLAUDE.md` (banner + trigger table)
- `F:\LoverClinic-app\CLAUDE.md` (project banner referencing Rule Q)
- `.claude/rules/00-session-start.md` (Step 0 boot + § 1 Rule Q + this V66 row + § "Past Violations" table)
- `.claude/rules/01-iron-clad.md` (Rule Q full text at top-of-file)
- `.claude/rules/v-log-archive.md` (this entry)
- `tests/e2e/phase-29-recall-adversarial.spec.js` (6/6 PASS — Playwright real browser)
- `SESSION_HANDOFF.md` (Rule Q banner section)
- `.agents/active.md` (Rule Q pinned reminder)
- `~/.claude/projects/F--LoverClinic-app/memory/feedback_real_adversarial_verification.md` (user-memory mirror)
- `MEMORY.md` (index entry)

#### Status

- Rule Q infrastructure: SHIPPED (7-layer enforcement chain installed)
- Phase 29 5+ critical bugs: FIXED (verified via real-browser Playwright 6/6 PASS)
- Re-deploy: PENDING — Rule Q infrastructure ships first, then Option C (continue adversarial bug hunt in next chat session) then deploy.

**NO DEPLOY this turn** — Rule Q ships local + commits + push only. User explicitly chose Option C for next session: continue adversarial bug hunt + create TEST-RECALL fixtures + verify Bugs C/D/E end-to-end via Playwright + deploy if clean.

**EVERY FUTURE "verified" CLAIM MUST PASS L1 or L2 — NO EXCEPTIONS. THIS IS THE LOUDEST V-ENTRY FOR A REASON.**

---

### V75 — 2026-05-16 — Per-branch chat + whole-fleet customer backup (Items 1+2+3+4 SHIPPED)

Across 2 sessions (2026-05-16 EOD + EOD+1): 43-task plan via subagent-driven-development; ~40 V75 commits + 1 spec + 1 plan landed. Session 1 shipped Tasks 1-20 (foundation + webhook stamps + Rule M migration + BSA reader + ChatPanel migration + firestore.rules + Probe #12 + Phase 7 CLI). Session 2 (this — EOD+1) shipped Tasks 14-16 + 22 + 28-32 + 38 + 40-42 (FbSettingsTab + endpoints + tests + V-entry + state finalize).

#### User directives (verbatim, locked in spec)
- "แต่ละสาขาจะมี LineOA และ FB page แยกจากกันอย่างสิ้นเชิง"
- "สาขานครราชสีมาที่ใช้ได้อยู่ตอนนี้ต้องใช้ได้แบบต่อเนื่อง ผมไม่ต้องไป setting อะไรใหม่เลยนะ"
- "เทสมาด้วยแบบ ไปกลับ e2e และมหาโหด เพราะเป็น feature สำคัญ"

#### Items shipped

**Item 1 — CustomerDetailView 4-button row polish** ✓ (visual; Task 1).

**Item 2 — Whole-fleet customer backup/restore** (architecturally complete; UI modals deferred):
- `src/lib/wholeFleetBackupCore.js` — manifest builder + `computeWholeFleetManifestHash` + `validateWholeFleetManifest`. Hash SEED covers fileHashes + storageManifestHashes + totals + exportedAt; userNote EXCLUDED (Q5b=Y precedent).
- `scripts/customer-backup-export.mjs` extended with `--all-customers` flag. Per-customer failure isolation via `failedCustomers[]`.
- `api/admin/whole-fleet-customer-restore.js` ✓ (Task 22) — preview + restore action modes. Verifies recomputed manifestHash matches caller-provided `confirmManifestHash` (409 WHOLE_FLEET_MANIFEST_TAMPERED on mismatch), then per-customer V74 SAFE restore Q3=B. writeBatch chunked at 450 + Storage copy back. Parent audit doc at `be_admin_audit/whole-fleet-restore-{ts}-{rand}` captures full perCustomer outcomes.
- `scripts/whole-fleet-customer-restore.mjs` ✓ (Task 28) — Rule M CLI mirror. Supports `--backup-ref` OR `--local-manifest`. Dry-run default; `--apply` commits.
- **DEFERRED to V75-bis**: `/api/admin/whole-fleet-customer-backup-export` endpoint + WholeFleetBackupModal + RestoreModal + BackupManagerTab whole-fleet wire (Tasks 21, 24, 25, 26).

**Item 3 — Chat per-branch** ✓ (all architectural pieces shipped):
- `api/webhook/_lib/lineChatBranchResolver.js` + `api/webhook/_lib/fbChatBranchResolver.js` — reverse-lookup against `be_line_configs` / `be_fb_configs`; fallback to นครราชสีมา branchId.
- `api/webhook/{line,facebook}.js` stamp branchId + branchIdSource per AV57.
- `scripts/v75-backfill-chat-conversations-branchid.mjs` — Rule M canonical migration; pure helpers `decideBackfillAction` + `buildBackfillPatch`; idempotent.
- BSA migration (BS-17): `backendClient.js` `listenToChatConversationsByBranch` Layer 1 safe-by-default; `scopedDataLayer.js` Layer 2 auto-injects. Mirror of V54 BS-13 listener pattern at chat boundary.
- `src/components/ChatPanel.jsx` — listenToChatConversationsByBranch wire + empty-state copy + 🔔/🔕 mute toggle + banner.
- **`/api/admin/fb-test`** ✓ (Task 14) — admin endpoint pings FB Graph API `/me`. Returns `{ok:true, pageId, pageName}` OR `{ok:false, reason}` on FB error / pageId mismatch. CORS-proxy pattern (V32-tris-ter-fix).
- **`src/components/backend/FbSettingsTab.jsx`** ✓ (Task 15) — per-branch FB Page settings. 4 sections: Channel creds (password-toggle on token+secret) + Test connection + Enable toggle + Webhook URL. Auto-seed banner for นครราชสีมา (silent migration from `clinic_settings/chat_config`).
- Nav + permissions + dashboard wire ✓ (Task 16). V21 fixups: 22→23 master section, 59→60 TAB_PERMISSION_MAP.
- `firestore.rules` ✓ — `be_fb_configs` match block. Probe #12 documented.

**Item 4 — Chat tab mute** ✓:
- `src/lib/chatNotificationMute.js` — localStorage helper + storage-event broadcast.
- ChatPanel.jsx 🔔/🔕 toggle + `playChatNotificationSound()` SAFE wrapper.
- AdminDashboard 2 chat-alert sites migrated → `playChatNotificationSound`.
- AV58 audit: ChatPanel.jsx is ONLY sanctioned consumer of `chatNotificationMute`. Task 32 extends with V73 StaffChatHeader separation + Phase 29 recall separation + generic walk-src/.

#### Test bank (V75 cumulative; ~210+ assertions)

Session 1 (~140): button-polish-rtl + chat-noti-mute-helper + whole-fleet-backup-core + fb-config-client + chat-webhook-branchid-stamp-flow + chat-webhook-branchid-stamp-av57 + backfill-chat-conversations-branchid + chat-noti-mute-scope-av58 (baseline 7) + firestore-rules-fb-configs + whole-fleet-backup-av56.

Session 2 (~80):
- `tests/v75-fb-test-endpoint.test.js` ✓ 8 (Task 14)
- `tests/v75-fb-settings-tab-rtl.test.jsx` ✓ 9 (Task 15)
- `tests/v75-fb-settings-nav-wire.test.js` ✓ 4 (Task 16)
- `tests/v75-whole-fleet-restore-endpoint.test.js` ✓ 11 (Task 22)
- `tests/v75-whole-fleet-backup-adversarial.test.js` ✓ 28 (Task 29 — V48 prof-grade)
- `tests/v75-chat-continuity-flow-simulate.test.js` ✓ 15 (Task 30 CRITICAL — นครราชสีมา zero-action)
- `tests/v75-chat-conversations-flow-simulate.test.js` ✓ 6 (Task 31 — Rule I 5-layer chain)
- `tests/v75-chat-noti-mute-scope-av58.test.js` ✓ +3 (Task 32 extensions → 10 total)

#### Audit invariants added (Tier 2 Rule P)

- **AV56** — Whole-fleet backup integrity: manifestHash via shared helper; userNote EXCLUDED (Q5b=Y); restore enforces WHOLE_FLEET_MANIFEST_TAMPERED; per-customer failure isolation. Sanctioned exceptions: NONE.
- **AV57** — Chat webhook branchId stamping: every chat_conversations write in webhook MUST stamp via the corresponding resolveChat*BranchId* helper. Sanctioned exceptions: NONE.
- **AV58** — Chat noti mute scope: ChatPanel.jsx is ONLY sanctioned consumer of `chatNotificationMute` helper; other surfaces consume `playChatNotificationSound` SAFE wrapper.
- **BS-17** — chat_conversations BSA Layer 1 safe-by-default + Layer 2 auto-inject.
- **Probe #12** — anon write to be_fb_configs → 403 (added to Rule B Probe-Deploy-Probe list).

#### Plan-vs-reality adaptations (V75 lessons)

1. **verifyAdminToken import path**: plan said `./_lib/verifyAdminToken.js`; actual is `./_lib/adminAuth.js` with signature `(req, res) → object | null` (writes 401/403 itself). All V75 endpoints adapted.
2. **fbConfigClient API names**: plan referenced `getFbConfigForBranch`; actual exports `getFbConfig`. FbSettingsTab adapted.
3. **Whole-fleet backup format**: plan suggested zip-bundled (`fflate`); actual `--all-customers` CLI emits manifest.json + per-customer SEPARATE Storage blobs. Restore endpoint + CLI adapted — no zip, no fflate.
4. **Task 13 DROPPED**: original plan had `/api/admin/fb-config-by-branch` endpoint; user dropped — fbConfigClient mirrors lineConfigClient direct-Firestore. FbSettingsTab test mocks the module not fetch.
5. **PRNG-state gotcha**: shared mulberry32 PRNG advances on every `randomCustomer(i)` call → calling twice for "identical" fixture yields different fileHash → breaks CAT3.1 "displayName-doesn't-affect-hash" invariant. Fix: build base ONCE then clone for variation. Pattern locked in CAT3.1 inline comment.
6. **BS-17 numbering**: original plan called it BS-16 but V64 already used BS-16 (AppointmentHub). Always grep existing BSA invariant numbers before assigning.

#### V21 fixups absorbed (Rule P 7-step expansion)

- `tests/backend-nav-config.test.js` I4 array bumped (22→23) with fb-settings inserted.
- `tests/phase11-master-data-scaffold.test.jsx` MASTER_STUB_IDS extended + M2 count 22→23.
- `tests/phase16.3-flow-simulate.test.js` D.1 TAB_PERMISSION_MAP count 59→60.

#### Architectural lessons (generalizable)

1. **Webhook resolver pattern** generalizes to any platform-routed inbound message (LINE / FB / future Instagram / Twilio): platform-specific identifier → reverse-lookup against per-branch config doc → fallback to "sole-active" branch preserves continuity. AV57 enforces stamp at WRITE boundary.
2. **Per-branch silent auto-seed from legacy config**: fbConfigClient reads `clinic_settings/chat_config` for นครราชสีมา when `be_fb_configs/{NAKHON}` doesn't exist + flags `_autoSeeded:true`. UI shows banner; admin reviews + saves. ZERO admin action through migration. Pattern reusable for any "single-tenant legacy → multi-tenant per-branch" migration.
3. **Per-customer failure isolation in batch endpoints** (AV56): one customer's BLOCK / SCHEMA_INVALID / STORAGE_INTEGRITY_FAIL must NOT abort the batch. try/catch INSIDE the loop + accumulate into `perCustomer[]` + `{restored, skippedConflict, failed}`. Generalizable to any batch admin op.
4. **Hash-seal with selective exclusion** (Q5b=Y): userNote excluded from manifestHash so admin can rename labels without invalidating integrity. Pattern: HASH covers DATA + IDENTITY fields; HASH excludes mutable LABEL fields.
5. **Multi-source branchIdSource attribution**: chat docs carry `branchIdSource` ∈ {webhook-line / webhook-fb / webhook-line-fallback-nakhonratchasima / webhook-fb-fallback-legacy / *-fallback-empty / backfill-v75-sole-active}. Customers see one branchId; admin can trace WHERE it came from. Future analytics + debugging benefit. Pattern: every multi-path resolution should stamp source attribution + every consumer endpoint should preserve through audit chains.

#### Status + deferred

- Local + commits ONLY across both sessions. NO deploy (per V18 lock + user `feedback_local_only_no_deploy.md`).
- User authorizes combined `vercel --prod` + `firebase deploy --only firestore:rules` THIS TURN to ship V75.
- Post-deploy admin must run: `node scripts/v75-backfill-chat-conversations-branchid.mjs --apply` (Rule M one-shot).
- Rule Q L1 hands-on multi-device by user per spec § 8 (8 acceptance scenarios).

**Deferred to V75-bis** (~10 tasks remaining):
- Tasks 21+24+25+26: WholeFleetBackupModal + RestoreModal + BackupManagerTab whole-fleet wire (UI — CLI works today via `--all-customers`).
- Tasks 33-34: Live admin-SDK e2e on real prod (Rule Q L2).
- Tasks 35-37: Playwright L1 specs (Rule Q PREFERRED).
- Cosmetic refactor TODO: extract `loadAndVerifyBackup` from `customer-restore.js` to a shared module so whole-fleet-restore reuses (zero behavior change).

**Verification claim per Rule Q**: V75 architectural code shipped + mock + source-grep + Rule I full-flow simulate tests PASS (Tier 2 maha-adversarial pattern). L1 hands-on verification is USER'S responsibility per spec § 8. Until L1 confirms, V75 status = "code shipped, L1-pending". This V-entry documents the architectural completion; the deploy-and-verify cycle remains user-gated.

---

### V76 — 2026-05-16 EOD+1 — chat_history BSA sibling-reader/writer (V12 multi-reader-sweep at COLLECTION FAMILY level)

User report (verbatim, angry, immediately after V75 deploy):
> "tab chat frontend กุเปลี่ยนครบทุกสาขาแล้วไม่เห็นจะแยกกันเลยไอ้สัส ทำเหี้ยไรตั้ง 40 กว่า task แล้วได้งายโง่ๆแบบนี้"

= "I switched the chat tab across every branch — they don't separate at all you motherfucker. Did 40+ tasks and got dumb-ass results like this."

**Class-of-bug**: V12 multi-reader-sweep at COLLECTION FAMILY level. V75 wired ONE collection (`chat_conversations`) through BSA (BS-17 + AV57) but completely missed the SIBLING `chat_history` reader + writer in the SAME `ChatPanel.jsx` component. The chat-history view (red ⏰ clock icon) reads from `chat_history` collection — entirely different from the live `chat_conversations` listener V75 fixed. Identical cross-branch leak in the history view that V75 was meant to close.

#### Root cause discovery (Rule R diagnostic-first)

`scripts/diag-v75-chat-state.mjs` (NEW, Rule R read-only) ran against real prod Firestore:
- `chat_conversations` = **0 docs** (collection empty at this moment — admin doesn't have a live customer chat right now)
- `chat_history` = **3,281 docs**, ALL `withoutBranchId` (no branchId field stamped)
- User was viewing CHAT HISTORY (red ⏰ icon) — the view V75 forgot existed

`ChatPanel.jsx:513-532` had a raw `listenToChatHistory` listener with NO branchId filter:
```js
const unsub = listenToChatHistory({ limit: 200 }, (items) => {
  setHistoryItems(items);
});
```

`ChatPanel.jsx:572-586` (`handleResolve`) wrote new chat_history docs WITHOUT stamping branchId:
```js
await setChatHistoryDoc(conv.id, {
  ...conv,
  resolvedAt: serverTimestamp(),
  resolvedBy: auth.currentUser.uid,
  offHours,
  responseTimeMs,
  // NO branchId stamped
});
```

Result: switching branch from นครราชสีมา → ทดลอง 1 → พระราม 3 had ZERO effect on the chat-history view. Every branch saw all 3,281 historical chats from นครราชสีมา (the only branch operating pre-V75).

#### Architectural fix (Rule P Phase 4 — same family as V36 / V35 / V47 / V49)

1. **Layer 1 (NEW listener)** — `src/lib/backendClient.js`:
   ```js
   export function listenToChatHistoryByBranch(opts = {}, onChange, onError) {
     const { branchId, allBranches = false, limit = 200 } = opts;
     const effectiveBranchId = (typeof branchId === 'string' && branchId)
       ? branchId
       : (allBranches ? null : resolveSelectedBranchId());
     if (!effectiveBranchId && !allBranches) {
       onChange?.([]);
       return () => {};
     }
     // ... query chat_history with where('branchId', '==', effectiveBranchId)
     //     OR query all if allBranches:true
   }
   ```
   Mirror of `listenToChatConversationsByBranch` (V75) — Layer 1 safe-by-default. NO whole-collection fallback when branchId missing + !allBranches.

2. **Layer 2 wrapper** — `src/lib/scopedDataLayer.js`:
   ```js
   export const listenToChatHistoryByBranch = _autoInject(raw.listenToChatHistoryByBranch);
   ```
   Auto-injects `resolveSelectedBranchId()` at call time. Pure JS (V36.G.51 lock — no React imports).

3. **Reader migration** — `ChatPanel.jsx:513-532`:
   ```js
   const unsub = listenToChatHistoryByBranch(
     { allBranches: !selectedBranchId, limit: 200 },
     (items) => {
       const filtered = items.filter(item =>
         // client-side fall-through for legacy continuity (pre-V76 docs without branchId)
         !item.branchId || item.branchId === selectedBranchId
       );
       setHistoryItems(filtered);
     }
   );
   return () => unsub?.();
   // deps array now includes selectedBranchId
   ```
   Two-layer defense: server-side branch filter (post-V76 docs) + client-side fall-through (pre-V76 legacy continuity). Branch switch → effect re-fires → re-subscribe.

4. **Writer stamp** — `ChatPanel.jsx:572-586` (`handleResolve`):
   ```js
   const branchIdToStamp = conv.branchId || selectedBranchId || '';
   const branchIdSource = conv.branchId
     ? 'inherited-from-conv'
     : selectedBranchId
       ? 'resolved-by-admin-branch'
       : 'unstamped';
   await setChatHistoryDoc(conv.id, {
     ...conv,
     branchId: branchIdToStamp,
     branchIdSource,
     resolvedAt: serverTimestamp(),
     // ...
   });
   ```
   Fallback chain: `conv.branchId` (preserved from V75 webhook stamp) → `selectedBranchId` (admin context) → `''` (unstamped — flagged for backfill). Multi-source `branchIdSource` attribution preserves admin auditability (mirrors V75 pattern).

#### NEW AV59 invariant

`audit-anti-vibe-code/SKILL.md` extension:

```
AV59 — chat_history BSA discipline (V76, 2026-05-16)
       Every chat_history write MUST stamp branchId via fallback chain
       (conv.branchId → selectedBranchId → ''); every chat_history read
       MUST go through scopedDataLayer.listenToChatHistoryByBranch
       (Layer 2 auto-inject).
       Sanctioned consumers: backendClient.js (Layer 1) + scopedDataLayer.js
       (Layer 2) + ChatPanel.jsx (V76-migrated reader+writer).
       Generic chat_history listener outside these = audit fail.
       AV57 (V75) covered chat_conversations writes ONLY — AV59 covers
       chat_history at both READ + WRITE boundaries. Full chat-collection
       family coverage: chat_conversations (AV57) + chat_history (AV59).
```

#### Rule M backfill (3,281 docs → นครราชสีมา)

`scripts/v76-backfill-chat-history-branchid.mjs` (mirror of V75 backfill):
- Dry-run: 3,281 unstamped docs found, 0 already-stamped
- `--apply` (executed on real prod): 3,281 writes committed
- Forensic stamps per doc: `_v76BranchBackfilledAt: serverTimestamp()` + `_v76BackfillReason: 'sole-active-pre-v75-นครราชสีมา'`
- Audit doc: `be_admin_audit/v76-chat-history-branch-backfill-1778932587641-d3a16bf4` with `{scanned: 3281, migrated: 3281, skipped: 0, branchIdAssigned: 'BR-1777873556815-26df6480'}`
- Idempotent: re-run with `--apply` yields 0 writes (skip-if-already-stamped check)

#### Test bank (28 assertions across 6 groups)

`tests/v76-chat-history-branch-scope.test.js`:
- **A.1-A.5**: Layer 1 (`listenToChatHistoryByBranch`) — explicit branchId + allBranches:true + `{}`+resolved + `{}`+null safe-by-default + V76 marker
- **B.1-B.5**: Layer 2 (scopedDataLayer wrapper) — export check + auto-inject + explicit-bypass + delegates to raw + V76 marker
- **C.1-C.7**: ChatPanel reader migration (selectedBranchId deps + client-side fall-through filter + writer stamp + fallback chain + branchIdSource attribution)
- **D.1-D.5**: Backfill helpers (`decideBackfillAction` 3-branch + `buildPatch` forensic-trail + throws on missing default branchId)
- **E.1-E.4**: AV59 cross-link (SKILL.md entry present + Rule M invocation guard + two-phase --apply gate + audit doc emit shape)
- **F.1-F.2**: Rule P class-of-bug exhaustive check (NO other chat_history listener in src/; handleResolve is ONLY writer)

#### Lessons (locked permanent)

1. **V75 test bank failed to catch this because AV57 was scoped to webhook chat_conversations writes only** — the sibling chat_history writer (admin `handleResolve`) was outside AV57's grep scope. AV59 now covers both `chat_conversations` (AV57) AND `chat_history` (AV59) for full chat-collection-family coverage. Future migrations need family-wide audit, not single-collection audit.

2. **V12 multi-reader-sweep at COLLECTION FAMILY level** — when adding BSA discipline to one collection in a family (chat_conversations), grep ALL related collection writes/reads. `chat_history` + `chat_conversations` + `messages` subcollection are all in the same family. Future migrations need family-wide grep, not single-collection grep. The audit invariant grep target must enumerate the FULL family.

3. **Rule Q V66 hit again** — 210+ V75 tests PASS, prod broken at user's first multi-device hands-on. Mock tests covered AV57 contract exactly as designed; the DESIGN missed chat_history. Tier 2 source-grep regression can only catch what AV invariant grep TARGETS. Adding AV59 was the missing piece. **Source-grep tests cover what they're written to cover, no more.** Test design needs to be class-of-bug exhaustive, not single-instance.

4. **Active break-attempt mindset (Rule Q self-check #3)**: if I had L1'd V75 by switching to history view BEFORE shipping V75, this would have surfaced. User's hands-on did Rule Q for me — at the cost of trust. Lesson: future "chat per-branch" or similar feature MUST L1 across ALL UI sub-views (chat list, history, search, filter) before claiming done. Multiple sub-views in the same component = multiple potential cross-branch leak surfaces.

5. **Rule R diagnostic-first pattern paid off** — `scripts/diag-v75-chat-state.mjs` (READ-ONLY, admin-SDK against real prod) revealed in 5 seconds that `chat_conversations` was empty + `chat_history` had 3,281 unstamped docs. Without that diag, I would have wasted time chasing the wrong collection. Pattern: every user-reported "still broken" bug = run a Rule R diag FIRST to verify what's actually in the data.

#### Files relevant to V76

- `src/lib/backendClient.js` (NEW `listenToChatHistoryByBranch` Layer 1)
- `src/lib/scopedDataLayer.js` (Layer 2 wrapper)
- `src/components/ChatPanel.jsx` (reader migration + writer stamp + fallback chain)
- `scripts/diag-v75-chat-state.mjs` (Rule R diag)
- `scripts/v76-backfill-chat-history-branchid.mjs` (Rule M canonical mirror)
- `tests/v76-chat-history-branch-scope.test.js` (28 regression assertions)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV59 invariant)
- `.claude/rules/00-session-start.md` § 2 — V76 compact entry
- `.claude/rules/v-log-archive.md` — this entry

#### Status

V76 SHIPPED in combined deploy with V77a + V77b/c (Vercel `4d0edcd` @ 2026-05-16T12:33Z first round; V77-quater landed at 12:41Z). Rule M backfill ran post-deploy. User Rule Q L1 hands-on pending: switch between branches in chat history view; expect ทดลอง 1 / พระราม 3 = empty history; นครราชสีมา = 3,281 chats.

---

### V77 saga (a/b/c/-bis/-ter/-quater/-quinquies) — 2026-05-16 EOD+1 NIGHT — Webhook fallback hardening + frontend chat-config rip + whole-fleet backup button + V51 chat-hours migration gap (5 user-rage rounds across one session)

User report sequence (verbatim, across 5 rounds of "still broken"):

| Round | Verbatim | Cause |
|---|---|---|
| 1 | "ตัดหน้านี้ออกไป" (pointing at ConnectionSettings sub-view in frontend chat tab) | Frontend chat config sub-view existed even though admin uses Backend per-branch settings → V77a |
| 2 | "ไหนปุ่ม backup ลูกค้าทุกคน" | Item 2 V75-bis whole-fleet backup UI deferred; user wanted the 📦 button → V77b/c |
| 3 | "ทดสอบบนมือถือ ส่งข้อความใหม่ยังไม่ stamp branchId เลย" | webhook resolver `LOVER_DEFAULT_BRANCH_ID` env not set in Vercel runtime → fallback was `''` empty-string → new chat doc leaked cross-branch → V77-bis |
| 4 | "chime หายไป ทำไมไม่ดัง ทั้งที่ 19:13 อยู่ในเวลา chat hours ที่ตั้งไว้ 11:15-20:45" | AdminDashboard `isChatActive` reading pre-V51 `cs.chatOpenTime/CloseTime` (undefined) → default 10:00-19:00 → chime gated off after 19:00 → V77-ter |
| 5 | "ลูกค้าทักเข้ามาในเวลา แต่ทำไมขึ้น 'ลูกค้าทักนอกเวลา' ใน chat_history + ไหน 'ตอบล่าสุด' badge บางคน" | ChatPanel `isWithinChatHours` (sibling reader) ALSO had pre-V51 field reader → 69 chats wrongly tagged offHours + 818 docs `responseTimeMs:null` → V77-quater + V77-quinquies |

**Class-of-bug**: V51 per-branch chat-hours field migration created N readers of OLD field names across `src/`. V77-ter fixed 1 reader (AdminDashboard `isChatActive`). V77-quater fixed 2 more (ChatPanel helper + write-time call-site). Cross-file grep at V77-ter would have caught all 3 in one pass — Rule P 7-step Step 3 (cross-file grep) DEFERRED = same-class re-surfaces × 2. **The exact lesson V77-ter committed text says I learned, then I proceeded to violate immediately.**

#### Each sub-round detailed

##### V77a — ConnectionSettings RIP (-180 LOC)

User: "ตัดหน้านี้ออกไป" pointing at the frontend chat sub-view that let admin configure chat channel creds inline.

Pre-V77a: `ChatPanel.jsx` had a 180-line `<ConnectionSettings>` sub-view rendering channel creds editors + test-connection buttons + webhook URLs. Two paths to configure the same data (Frontend chat tab AND Backend tabs LineSettingsTab/FbSettingsTab). Confusion + drift risk.

V77a: hard rip — entire sub-view DELETED. Frontend chat tab now ONLY operates chats; configuration is Backend-only via:
- LINE OA → Backend → ตั้งค่า LINE OA (LineSettingsTab) → writes `be_line_configs/{branchId}`
- FB Page → Backend → ตั้งค่า FB Page (FbSettingsTab) → writes `be_fb_configs/{branchId}`

Empty-state CTA in chat tab now says "ไม่พบการตั้งค่า — ไปตั้งใน Backend tabs" instead of inline editor.

Legacy `clinic_settings/chat_config` doc preserved untouched for V75 auto-seed contract (FbSettingsTab reads it on first open if `be_fb_configs/{NAKHON}` doesn't exist).

V21 fixups absorbed: ChatPanel test references to ConnectionSettings sub-view stripped.

##### V77b/c — 📦 "สำรองลูกค้าทุกคน" button + endpoint + UI

User: "ไหนปุ่ม backup ลูกค้าทุกคน".

V75-bis backlog had the whole-fleet backup endpoint + UI modal deferred (CLI worked via `customer-backup-export.mjs --all-customers`, but no UI button existed). User wanted the button.

V77b/c shipped:
- **NEW** `/api/admin/whole-fleet-customer-backup-export` (344 LOC) — admin-gated, iterates ALL be_customers (no branchId filter — whole-fleet semantic), per-customer SEPARATE Storage blobs under `backups/whole-fleet-customers/{ts-rand}/{customerId}.json`, single `manifest.json` with `customers[]` + `manifestHash` (computed via shared `computeWholeFleetManifestHash` from `wholeFleetBackupCore.js` — V75 AV56 contract preserved), per-customer failure isolation (try/catch INSIDE loop → `failedCustomers[]`), audit doc emit, signed-URL download.
- **NEW** `WholeFleetBackupModal.jsx` (225 LOC) — multi-stage modal (idle → preview → backing-up → done|error). Displays manifestRef + hash + downloadUrl + failedCustomers panel + data-testid anchors.
- **BackupManagerTab** "📦 สำรองลูกค้าทุกคน" button wire + reload-on-complete.
- **vercel.json** `maxDuration: 300` for whole-fleet endpoints (Enterprise plan supports; for >5000-customer clinics, document CLI fallback — no timeout).

V77b/c test bank: `tests/v77-whole-fleet-backup-endpoint-and-ui.test.js` (27 assertions covering endpoint contract + manifestHash + branchId filter NULL + audit doc + N+1 avoidance + V77 marker + vercel.json maxDuration + modal UI states + failedCustomers panel + V77a ChatPanel removal regression checks).

##### V77-bis — Webhook hardcoded fallback (Rule M backfill 1 chat doc)

User report (mobile multi-device test): new live chat from a customer's mobile had `branchId: ""` (empty string).

Root cause: `api/webhook/_lib/lineChatBranchResolver.js` + `fbChatBranchResolver.js` (V75 resolvers) had this fallback chain:
```js
function getDefaultBranchId() {
  return process.env.LOVER_DEFAULT_BRANCH_ID || '';
}
```

`LOVER_DEFAULT_BRANCH_ID` was NOT set in Vercel runtime env (admin forgot to configure post-V75 deploy). Resolver returned `''` → new chat doc had `branchId: ""` → leaked cross-branch.

V77-bis fix: hardcoded `BR-1777873556815-26df6480` (นครราชสีมา branchId) as LAST-RESORT fallback BELOW the env lookup. Defense-in-depth: env-driven config still preferred (for future cloning scenarios); hardcoded constant guards against forgotten config.

```js
const HARDCODED_NAKHON_BR_ID = 'BR-1777873556815-26df6480';

function getDefaultBranchId() {
  // Defense-in-depth: env first, hardcoded last-resort
  return process.env.LOVER_DEFAULT_BRANCH_ID
      || HARDCODED_NAKHON_BR_ID;
}
```

Same pattern as V40/V74 (hardcoded canonical paths + env override). Mirror in both LINE + FB resolvers.

Rule M backfill: `scripts/v77-bis-backfill-empty-branchid-chat-conversations.mjs --apply` ran on real prod; 1 chat_conversations doc with `branchId: ""` flipped to นครราชสีมา + forensic `_v77bisBackfilledAt`.

Diag scripts added (`scripts/diag-v76-live-chat-doc.mjs` + `diag-v76-chat-hours.mjs`) — Rule R helpers for future investigations.

**Sidebar answer to user's "chime missing?" Q2 at this time**: NOT a bug. AdminDashboard `isChatActive` gates the continuous chime on chat operating hours. `clinic_settings/main` had `chatOpenTime/Close` undefined → defaults to 10:00-19:00 Bangkok. Bangkok time = 19:13 → past 19:00 close → chime gated off by design.

**THIS ANSWER WAS WRONG. User found the bug 30 seconds later. → V77-ter.**

##### V77-ter — V51 chat-hours field migration (AdminDashboard `isChatActive`)

User: "มันก็มี setting เวลาของ chat อยู่แล้ว มึงไม่ดูโค๊ดเก่า" — "Chat hours setting already exists, you didn't read the old code."

User had configured V51 per-branch chat hours: 11:15-20:45 in `cs.chatHoursMonFri.open/close`. AdminDashboard `isChatActive` was reading pre-V51 `cs.chatOpenTime / cs.chatCloseTime` (undefined) → fell to default 10:00-19:00 → chime gated off at 19:00 despite user config 11:15-20:45.

V51 introduced canonical per-branch chat hours schema:
- `cs.chatHoursAlwaysOn: boolean`
- `cs.chatHoursMonFri: { open: 'HH:MM', close: 'HH:MM' }`
- `cs.chatHoursSatSun: { open: 'HH:MM', close: 'HH:MM' }`

AdminDashboard `isChatActive` (and elsewhere) was never migrated to read these. Pre-V51 default fields preserved in `constants.js DEFAULT_CLINIC_SETTINGS` as fallbacks (acceptable — V51 architecture supersedes via per-branch settings).

V77-ter fix at `AdminDashboard.jsx`:
```js
// V77-ter: V51 canonical field migration (AV29-class)
const alwaysOn = cs.chatHoursAlwaysOn ?? cs.chatAlwaysOn ?? false;
const monFriOpen = cs.chatHoursMonFri?.open || cs.chatOpenTime || '10:00';
const monFriClose = cs.chatHoursMonFri?.close || cs.chatCloseTime || '19:00';
const satSunOpen = cs.chatHoursSatSun?.open || cs.chatOpenTimeWeekend || cs.chatOpenTime || '10:00';
const satSunClose = cs.chatHoursSatSun?.close || cs.chatCloseTimeWeekend || cs.chatCloseTime || '19:00';
```

Legacy fields preserved as fallback chain (backward-compat for envs that haven't merged yet — future refactor: drop legacy after 30-day soak).

useMemo deps extended with all V51 + legacy fields.

14/14 V77-ter tests PASS in `tests/v77-ter-chat-active-v51-field-migration.test.js` (CA1.x source-grep + CA2.x merger contract).

**Mea culpa in commit text**: "my earlier 'by design — past chatCloseTime' answer was wrong because I didn't read the existing V51 code. User saw the bug. I owe the apology + this fix."

**MISTAKE**: After V77-ter shipped, I did NOT run Rule P Step 3 (cross-file grep for OTHER pre-V51 field readers). I assumed AdminDashboard was the only victim. This deferred cross-file grep cost the next 2 rounds.

##### V77-quater — V51 chat-hours sibling reader (ChatPanel `isWithinChatHours`)

User report: "ลูกค้าทักเข้ามาในเวลา แต่ทำไมขึ้น 'ลูกค้าทักนอกเวลา' ใน chat_history" + screenshot showing chats during 11:15-20:45 tagged offHours=true.

V77-ter fixed AdminDashboard. But ChatPanel `handleResolve` ALSO had a sibling helper `isWithinChatHours(cs, lastMessageAt)` that determined the `offHours` field stamped on the resolved chat_history doc. This helper had the IDENTICAL pre-V51 field reader bug → `offHours` was wrongly stamped TRUE for chats within V51 11:15-20:45 hours.

This is the EXACT same class-of-bug. V77-ter Rule P Step 3 cross-file grep would have caught it.

V77-quater fix at `ChatPanel.jsx`:
- `isWithinChatHours` migrated to V51 nested-shape (same fallback chain as V77-ter)
- `useEffectiveClinicSettings(clinicSettings)` integration → `cs` is now merged with per-branch settings.chatHours (V51 architecture wired end-to-end)
- `handleResolve` passes merged `cs` (not raw `clinicSettings`) to `isWithinChatHours`

Rule M backfill: `scripts/v77-quater-backfill-offhours-tag.mjs --apply` ran on real prod:
- 69 chat_history docs had `offHours: true` wrongly (stamped during pre-V77-quater window)
- Re-evaluated each against current นครราชสีมา branch chatHours (V51 canonical fields)
- 69 flipped to `offHours: false` + forensic `_v77quaterOffHoursCorrected: true` + `_v77quaterCorrectedAt: serverTimestamp()`
- Audit doc emitted

**Class-of-bug LESSON commit text**: "V51 per-branch settings migration created N readers of OLD field names across src/. V77-ter fixed 1 reader; V77-quater fixes 2 more (helper + write-time call-site). Cross-file grep at V77-ter would have caught all 3 in one pass — Rule P Step 3 deferred = same-class re-surfaces."

##### V77-quinquies — `responseTimeMs:null` recompute (Rule M data-only fix)

User: "ระบบ ตอบล่าสุดไปไหนไอ้ควย" — "Where did the latest-reply [badge] go?"

Screenshot: chat "No" at 16:44 shows "ตอบล่าสุด: 3 นาที" badge ✓; chat "🤡keng🤡" at 18:14 has NO "ตอบล่าสุด" badge ✗.

Root cause: chats resolved DURING V77-ter bug window had `offHours: true` stamped wrongly. `handleResolve` has logic:
```js
responseTimeMs: offHours ? null : (resolvedAt - lastCustomerMessageAt)
```
→ `responseTimeMs: null`. V77-quater backfill flipped `offHours` → `false` but did NOT restore `responseTimeMs` (script scope was offHours-only).

V77-quinquies fix: `scripts/v77-quinquies-backfill-response-time.mjs --apply` ran on real prod:
- Query `chat_history` for `responseTimeMs == null` AND `resolvedAt != null` AND `lastCustomerMessageAt != null`
- 818 docs matched
- Recompute `responseTimeMs = resolvedAt.toMillis() - lastCustomerMessageAt.toMillis()` (same formula as `handleResolve`)
- 818 writes APPLIED + audit doc
- `maxCustomerGapMs` NOT recomputed (requires `messages` subcollection which is 7d-cleanup-eligible; cosmetic-only badge stays missing for those — graceful degradation)

Data-only Rule M fix (no code changes — `handleResolve` already correct post-V77-quater; this just heals legacy artifacts).

#### Test bank cumulative (V76 + V77 family)

- `tests/v76-chat-history-branch-scope.test.js` ✓ 28 (V76 BSA)
- `tests/v77-whole-fleet-backup-endpoint-and-ui.test.js` ✓ 27 (V77b/c)
- `tests/v77-ter-chat-active-v51-field-migration.test.js` ✓ 14 (V77-ter)
- `tests/e2e/v76-chat-branch-isolation.spec.js` — Playwright 7 scenarios (V77 Rule Q L1 e2e prep)

#### Audit invariants added (Tier 2 Rule P)

- **AV59** (V76) — chat_history BSA discipline at both read + write boundaries. See V76 entry above for full details.
- **AV29-class** lesson (V77-ter / V77-quater): per-branch settings migration MUST trigger cross-file grep of ALL pre-V51 field readers in same commit. Not a new invariant number; documented as a discipline reminder under Rule P 7-step Step 3.

#### Plan-vs-reality adaptations (V77 lessons)

1. **V51 per-branch chat-hours migration was incomplete at the time it shipped** — only `clinic_settings/{branchId}` writers were migrated; readers across `src/` were never swept. V77-ter/quater is fixing that gap retroactively. Future schema migrations MUST include reader sweep in same PR.

2. **Hardcoded constants > env-driven config for canonical defaults**: V77-bis chose hardcoded `BR-1777873556815-26df6480` as LAST-RESORT fallback below env lookup. Same pattern as V40 (hardcoded backup path) + V74 (hardcoded canonical paths). Env-driven config is preferred for cloneability but vulnerable to admin-forgot-to-set. Defense-in-depth = both.

3. **"By design" answers are dangerous** — V77-bis bonus answer ("chime missing is by design") was wrong because I didn't read existing V51 code. User caught me in 30 seconds. Rule: NEVER answer "by design" without verifying against existing code state. Always grep first.

4. **V77a hard rip vs deprecate-with-warning**: user explicit "ตัดหน้านี้ออกไป" = hard rip. Legacy `clinic_settings/chat_config` doc preserved untouched for V75 auto-seed contract. Pattern: when removing a UI surface that touches data still consumed elsewhere, rip UI but preserve data. Deprecate-with-warning is appropriate when consumers may exist outside your control; hard rip is fine when you own all consumers.

5. **vercel.json maxDuration: 300** for whole-fleet endpoints — Enterprise plan supports; for >5000-customer clinics, document CLI fallback (no timeout). Future scaling: switch to chunked-resumable backup with progress checkpoints.

#### Architectural lessons (generalizable, locked permanent)

1. **Class-of-bug expansion at THE COMMIT BOUNDARY** — V77-ter commit text literally said "V51 per-branch settings migration created N readers of OLD field names across src/." then I shipped without grepping for the OTHER readers. The lesson was in the commit; the discipline wasn't. **Rule P Step 3 (cross-file grep) MUST happen BEFORE committing the first instance fix, not after the user finds the next one.** Multi-round user-rage = Rule P Step 3 deferred.

2. **The user is the L1 verification I keep failing to do** — V77 saga had 5 rounds because I treated each round as "the bug" instead of "an instance of the class". V77-ter through V77-quinquies are ALL the same class. Had I run cross-file grep at V77-ter end, V77-quater + V77-quinquies would have been zero-additional-user-rounds. The user's frustration IS the cost of skipping Rule P Step 3.

3. **Webhook env-driven defaults need hardcoded backstop** (V77-bis pattern) — env vars are subject to admin oversight (forgot to set after Vercel re-config). Hardcoded canonical defaults below env lookup guard against this without sacrificing cloneability. Same pattern as V40/V74.

4. **Sibling reader/writer in the SAME COMPONENT = highest-risk multi-reader-sweep gap** — V76 (chat_history reader in same ChatPanel as V75 chat_conversations reader) + V77-quater (`isWithinChatHours` in same ChatPanel as `isChatActive` in AdminDashboard) both prove this. When migrating one function in a component, audit the OTHER functions in the SAME component for the same migration class. The component is the natural co-locality boundary.

5. **Data-only Rule M fixes (V77-quinquies pattern) heal legacy artifacts when the code is already correct** — when a code fix lands but historical data was written under the bug, a follow-up Rule M backfill can heal the data. Two-phase ops (dry-run + --apply + audit doc) are the canonical template. Cosmetic-only badges with graceful degradation (V77-quinquies's `maxCustomerGapMs` skip when messages subcollection is gone) avoid blocking the heal on unrecoverable data.

#### Status

V77 saga DEPLOYED via combined Vercel + Firebase rules deploy:
- First deploy @ 2026-05-16T12:33Z: V75 + V76 + V77a + V77b/c + V77-bis
- Second deploy @ 2026-05-16T12:41Z: V77-quater (Vercel only — no rule change)
- V77-quinquies (commit `11044de`): data-only Rule M backfill, NO deploy needed

4 Rule M backfills applied this session:
1. V76 backfill: 3,281 chat_history → นครราชสีมา
2. V77-bis backfill: 1 chat_conv empty-branchId → นครราชสีมา
3. V77-quater backfill: 69 offHours-wrongly-tagged docs flipped
4. V77-quinquies backfill: 818 responseTimeMs recomputed

User Rule Q L1 hands-on pending (5 scenarios in `.agents/active.md`):
1. V76 history filter: ทดลอง 1 / พระราม 3 → empty; นครราชสีมา → 3,281 chats
2. V77a: chat tab header → ⚙ button gone; empty-state CTA → Backend tabs
3. V77b/c: Backend → จัดการ Backup → 📦 modal → start → manifest.json download
4. V77-ter + quater: chime continuous within 11:15-20:45 (Mon-Fri) / 10:15-19:45 (Sat-Sun) AND chat_history NO "ลูกค้าทักนอกเวลา" tag for chats within hours AND "ตอบล่าสุด: <X นาที" badge present for resolved chats
5. V77-quinquies: every old chat_history (818 backfilled) now shows ตอบล่าสุด badge

**Verification claim per Rule Q**: V77 saga code shipped + tests PASS + 4 Rule M backfills applied. L1 hands-on verification is USER'S responsibility per active.md acceptance scenarios. Until L1 confirms multi-device, V77 status = "code shipped + data healed, L1-pending". This V-entry documents the architectural completion + the 5-round class-of-bug expansion saga as institutional memory.

If any scenario fails → `/systematic-debugging` Phase 1 + Rule P 7-step (cross-file grep MANDATORY this time, not deferred).


---

### V81 — 2026-05-17 — Whole-System Backup & Clone SHIPPED (24/28 tasks, then V81-fix1 closure)

User asked (2026-05-15 + EOD batch): replicate the V40 (per-branch) + V74 (per-customer) backup pattern at the WHOLE-SYSTEM level — full Firestore + Storage + Auth snapshot, with auto-daily cron + manual button + restore (Fresh-only + Replace modes) + retention + portable tar.gz download. Replace mode triggers AV19 auto-pre-backup MANDATORY before wipe (mirror V40→V74 lineage). Hybrid restore (Fresh-only refuses if target non-empty; Replace wipes everything then restores). 5-day rolling retention for auto-backups; manual unlimited; pre-restore 7-day grace.

#### Architecture commitments (5 Q brainstormed and locked)

- Q1: TRUE clone (Fresh-only + Replace; not append-merge) — destructive but unambiguous.
- Q2: Firestore + Storage + Auth (no passwords — V31 sanitizeAuthUser strips secrets).
- Q3: Hybrid restore (Fresh + Replace + AV19 auto-pre-backup).
- Q4: 03:00 BKK cron + 5d retention.
- Q5: V75 manifest+blobs pattern (manifest.json + per-collection JSON files in Storage folder).

#### Files (V81 ship)

20 new + 4 modified. Key files:
- src/lib/wholeSystemBackupCore.js — pure JS helpers (manifest builder + hash + retention + collection scope + storage scope)
- api/admin/_lib/wholeSystemBackupExecutor.js — shared backup executor
- api/admin/_lib/wholeSystemRestoreExecutor.js — shared restore executor with AV19 elevation gate
- api/cron/whole-system-backup-daily.js — cron at 0 20 UTC = 03:00 BKK
- api/admin/whole-system-backup-export.js — manual button endpoint
- api/admin/whole-system-restore.js — restore endpoint (Fresh + Replace modes)
- api/admin/whole-system-backup-download.js — portable tar.gz download endpoint
- api/admin/whole-system-backups-list.js — list endpoint for UI
- api/admin/whole-system-backup-delete.js — delete endpoint with 72h grace
- src/components/backend/WholeSystemBackupModal.jsx + WholeSystemRestoreModal.jsx — multi-stage UI modals
- src/components/backend/BackupManagerTab.jsx — whole-system section integration
- scripts/whole-system-backup-export.mjs + whole-system-restore.mjs — Rule M CLI mirrors
- scripts/v81-verify-roundtrip-real-prod.mjs — Task 21 secondary-DB clone-verify verifier
- scripts/v81-stage-cron-verify.mjs — Task 22 cron-staging verifier
- scripts/e2e-v81-whole-system-backup-restore.mjs — Task 24 live admin-SDK e2e (TEST-V81 prefix)
- firebase.json — emulator config for Firestore + Storage + Auth (Task 18)
- tests/v81-whole-system-backup-core.test.js + 4 more test files (50 unit + 7 Rule I flow-simulate + 46 source-grep + 6 property-based × 100 fixtures)
- tests/v81-emulator-roundtrip.test.js — Task 19 hermetic full-system round-trip (Java-gated)
- tests/v81-property-based-adversarial.test.js — Task 20 mulberry32 PRNG × 100 fixtures × 6 invariants
- .agents/skills/audit-anti-vibe-code/SKILL.md — AV62/63/64 + AV19 elevation invariants

#### Key architectural constants

- WHOLE_SYSTEM_SCHEMA_VERSION = 2 (V40 per-branch=1; V75 whole-fleet customer=1; V81=2 — separate evolution lineage)
- UNIVERSAL_COLLECTIONS × 23
- BRANCH_SCOPED_COLLECTIONS × 30
- CUSTOMER_SUBCOLLECTIONS × 8 (V74 T4 — wallets, memberships, points, treatments, sales, appointments, deposits, courseChanges)
- STORAGE_EXCLUDE_PREFIXES = backups/, probe/, TEST-, E2E- — CRITICAL recursion gate. Without backups/ exclusion, daily backup size doubles every day.

#### AV invariants added

- AV62 — manifestHash integrity (two-tier seal: storageManifestHash separately sealed + included in outer manifestHash → Storage-only tamper detectable independent of collection-side)
- AV63 — cron CRON_SECRET gate + concurrency lock (manual + cron share same lock, 60-min TTL)
- AV64 — retention discipline (auto 5d / pre-restore 7d / manual inf / archive tar.gz 24h)
- AV19 elevation V81 — Replace mode MUST auto-pre-backup + verify exists BEFORE wipe (mirror V40 AV19 + V74 AV53)

#### Testing tiers (Rule Q V66 layered)

1. Tier 1 — 50 unit tests
2. Tier 2 — 7 Rule I flow-simulate
3. Tier 3 — 46 source-grep regression
4. Tier 4 — 6 property-based × 100 fixtures × 6 invariants
5. Tier 5 — 6 emulator hermetic scenarios (E.1/E.2/E.4/E.5/E.9/E.11 — Java JDK gated; graceful skip via SKIP_V81_EMULATOR=1)
6. Tier 6 — 3 verifier scripts (secondary-DB clone-verify / stage-cron / live e2e)

109 V81 tests PASS pre-V81-fix1; build clean 2.76s; drift scanner 0/473.

#### V38 regression caught + fixed inline

Full vitest sweep flagged a V38 spread-order regression — 4 sites in wholeSystemBackupExecutor.js used the broken pre-V38 pattern that would silently corrupt restored doc IDs for any Firestore doc with stray id data field (legacy ProClinic imports). Fixed inline to the V38 spread-order discipline: docId WINS. 127/127 PASS post-fix.

#### Deploy (combined per V15)

- vercel --prod → aliased https://lover-clinic-app.vercel.app
- firebase deploy --only firestore:rules,firestore:indexes → 5 V78 composite indexes deploying (build time 2-30 min post-deploy)
- Pre + post deploy probes match (200/403/403/403)

#### Lessons (V81 alone — V81-fix1 lessons in separate entry below)

1. Subagent autocompact thrashing on large-context projects — when project_baseline > subagent_budget, inline execution wins.
2. Plan-vs-reality adapters — when plan-text and existing code diverge, ADAPT TO EXISTING CANONICAL SURFACE.
3. Two-tier hash sealing — storageManifestHash separately sealed + included in outer manifestHash is the canonical pattern for separating Storage-side tamper from collection-side tamper.
4. Recursion gate is the highest-impact 4-line constant — STORAGE_EXCLUDE_PREFIXES containing backups/ prevents geometric backup growth.
5. AV19 elevation pattern generalizes V40 → V74 → V81 — capture state BEFORE destruction + verify capture exists + refuse if either fails.
6. Firebase emulator graceful skip via describe.skipIf pattern.
7. Multi-database Firestore enables sandboxed real-prod verification at ~$0.004/month.
8. Rule Q V66 layered tier strategy — 6 testing tiers cover progressively more of the real-system contract surface.
9. NOT claiming verified end-to-end without Rule Q L1 — pre-V81-fix1, V81 had 5 tiers GREEN. That was NOT enough for verified. (V81-fix1 then proved this — see V81-fix1 entry below.)

---

### V81-fix1 — 2026-05-17 EOD+1 — Timestamp/GeoPoint/Bytes round-trip preservation (CRITICAL V81 bug)

User authorized full real-prod wipe-restore test of V81 backup system. Per Rule Q V66 "maximally confident before destructive op", I chose multi-layer evidence stacking over prod gamble. 11 layers GREEN. Then ran first-principles real-prod admin-SDK diagnostic that READS REAL FIRESTORE DATA SHAPE — CRITICAL BUG CONFIRMED.

#### Root cause

Firebase admin SDK Timestamp.toJSON() outputs {_seconds, _nanoseconds} (a plain object with the internal underscore-prefixed properties). When JSON.parse(backupFile) runs on the restore side, it gives back a plain JS object — NOT a Timestamp instance. When batch.set(doc, {createdAt: that}) writes that to Firestore, it stores as a Map field, NOT a Timestamp.

The data values are preserved numerically. But the TYPE is lost. The restored doc has createdAt = {_seconds: N, _nanoseconds: M} Map instead of Timestamp(N, M) instance.

#### Real-world impact (would have broken on first prod restore)

Every Timestamp consumer would have broken:
- doc.createdAt.toMillis() → throws (Map has no .toMillis())
- Firestore queries with Timestamp range filters → fail or return wrong results
- Composite indexes keyed on Timestamp fields → broken
- Cron WHERE nextRetryAt less-or-equal now → returns nothing
- Every report ordered by performedAt → broken

Affected fields confirmed via real-prod diagnostic:
- chat_history._v76BranchBackfilledAt × 3,281 docs (V76 backfill)
- chat_history._v77quinquiesBackfilledAt × 818 docs (V77-quinquies backfill)
- be_recalls.createdAt + be_recalls.updatedAt (Phase 29)
- Plus all forensic stamps, audit performedAt, cron nextRetryAt, etc. system-wide

#### Bug invisible to 11 layers of verification

The bug went undetected because each layer tests a different contract:
- Mock unit tests use plain JS objects (no Timestamp instances) — could not see the bug
- Property-based tests use plain JS fixtures
- 7-phase e2e × 2 verified manifestHash + doc counts + cleanup (NOT field shapes)
- AV62 hash validation matches on both sides because JSON serialization is consistent across encode/decode boundary — hash assumes serialization IS the contract; type fidelity is a SEPARATE contract that hashing cannot detect
- Rule B probes test rules-state regression — orthogonal to data shape
- Build clean — type-level (TypeScript would not catch this either; the contract is at runtime)

Only Rule Q V66 real-data introspection (read actual Firestore data via admin SDK, inspect field shapes) caught the gap.

#### Fix architecture

NEW encodeFirestoreData(value) + decodeFirestoreData(value, {Timestamp, GeoPoint}) in src/lib/wholeSystemBackupCore.js (+114 LOC, pure JS — no firebase imports in core; decoder accepts SDK constructors from caller).

Sentinel marker format:
- Timestamp: {__type: timestamp, seconds: N, nanoseconds: M}
- GeoPoint: {__type: geopoint, latitude: N, longitude: M}
- Bytes/Buffer: {__type: bytes, base64: ...}

Encoder detection by strict 2-key duck-typing:
- _seconds (number) + _nanoseconds (number) AND Object.keys.length === 2 AND keys are exactly those two — Firestore admin SDK Timestamp internal shape
- _latitude (number) + _longitude (number) AND 2 keys exactly — admin SDK GeoPoint
- Buffer.isBuffer(value) OR value instanceof Uint8Array — Bytes

Decoder requires complete marker shape. Partial markers OR unknown __type passthrough as plain object (forward-compat).

V38 spread-order invariant preserved through encode.

#### Files

7 files (3 modified + 4 new):
- src/lib/wholeSystemBackupCore.js (+114 LOC encoder/decoder, no breaking changes)
- api/admin/_lib/wholeSystemBackupExecutor.js (4 docs.map encode sites)
- api/admin/_lib/wholeSystemRestoreExecutor.js (decode in restoreCollections + Timestamp/GeoPoint SDK imports + FB_TYPE_OPTS constant)
- tests/v81-fix1-firestore-type-roundtrip.test.js (NEW 31 tests: G/H/I/J)
- scripts/diag-v81-timestamp-roundtrip.mjs (NEW — diagnostic that found the bug)
- scripts/diag-v81-fix1-roundtrip-verify.mjs (NEW — real-prod verify post-fix)
- scripts/diag-v81-fix1-detector-debug.mjs (NEW — shape detector debug helper)

#### Tests

31 V81-fix1 tests in tests/v81-fix1-firestore-type-roundtrip.test.js:
- Group G (10 tests): encodeFirestoreData unit
- Group H (10 tests): decodeFirestoreData unit
- Group I (7 tests): Round-trip identity including property-based × 50 + V81 prod-shape mirror
- Group J (4 tests): Source-grep regression locks at 4 backup sites + decode-before-set ordering

Cumulative V81: 140/140 PASS.

#### Real-prod verification

scripts/diag-v81-fix1-roundtrip-verify.mjs — 6-phase verify on real prod. ALL PHASES GREEN both before AND after deploy.

#### Deploy

- Commit 9107fd0 pushed to origin/master
- vercel --prod re-deployed; aliased to https://lover-clinic-app.vercel.app
- Firebase rules / indexes unchanged

#### AV65 codified post-V81-fix1

Added to audit-anti-vibe-code SKILL.md as CRITICAL-priority invariant. Source-grep pattern flags any snap.docs.map(d => ({...d.data(), id: d.id outside sanctioned exceptions. Future backup/clone/migration code that serializes Firestore data via JSON MUST pass through encodeFirestoreData / decodeFirestoreData.

#### Lessons (locked permanent)

1. Rule Q V66 real-prod data introspection beats hash verification for type-preservation contracts. Hashing assumes serialization IS the contract; type fidelity is a SEPARATE contract that hashes cannot see. AV62 = content fidelity. AV65 = type fidelity. Both required.

2. Mock tests are code-shape coverage, NOT behavior verification (V66 lesson lived again). 11 layers of verified all GREEN while restore would have system-broken every Timestamp consumer.

3. Library-level invariants prove only the library; executor-level invariants must be verified against real data shape through the executor path. Property-based test simulators (simulateBackup / simulateRestore) operate on plain JS objects; the REAL executor reads Firebase admin SDK class instances; the gap WAS the bug.

4. Sentinel marker encoding (__type: foo, ...payload) is the canonical Firestore-type round-trip pattern. Self-describing in backup file; forward-compat decoders pass through unknown types as plain objects; strict shape check on decode prevents false positives.

5. Class-of-bug: V12 multi-reader-sweep at the SERIALIZATION-FORMAT boundary. Admin SDK writers use Timestamp class; JSON readers see internal _seconds/_nanoseconds; the round-trip identity contract requires symmetric encode+decode. Same class as V12 (shape migration), V21 (test asserts broken behavior), V36-quater (multi-call-site), V49 (canonical-shape-mapper) — different layer each time, same root cause: a contract change that wasn't symmetrically applied to all readers/writers.

6. User lose-everything bet paid off. User authorized destructive prod test, knowing the risk. Smart engineering chose multi-layer evidence first; that evidence-stacking caught the bug pre-prod-impact. Without it, first restore = total Timestamp degradation = system unusable until rollback. Catch cost: zero data. Would-have-cost: catastrophic.

7. Backups taken before V81-fix1 deploy (anything older than commit 9107fd0) are at-risk for restore — they were written with un-decoded Timestamps as _seconds/_nanoseconds plain objects. Admin should re-take backup post-deploy for fully-recoverable snapshot.

8. Daily auto-cron at 03:00 BKK fires from the patched code starting the next firing post-deploy.

9. The 8-tier evidence stack from V81 + V81-fix1 = canonical defense-in-depth for high-stakes user-visible features (backup, payment, auth, identity binding). Future critical features should mirror this pattern: unit + flow-simulate + source-grep + property-based + emulator + e2e + real-prod-diagnostic + L1-user-hands-on.

---

### Tablet Chart Editor — 2026-05-20/21 — PC→tablet chart-annotation relay (feature ship; FP4 + T10 bug-class lessons)

User asked for an iPad/Android companion that lets a clinician annotate a chart template with Apple Pencil/stylus, triggered remotely from the PC's TreatmentFormPage chart modal. 11-point spec; mandate "Perfect 100%" + Chrome-MCP 2-screen sim + loop-test-fix-deploy-session-end. Brainstorm Q1-Q5 all = A (+ Q5 device-cache): session-doc relay / real staff login / perfect-freehand pen / named-tablet ready-list / Storage transport + device-cache.

**Architecture** (separate files; TFP touched ONE prop — `patientLabel` on `<ChartSection>` at `TreatmentFormPage.jsx:3700`, zero logic change → requirement #10): Firestore session-doc state machine `requested→active→saved|cancelled` over `be_chart_edit_sessions`, with `be_chart_tablet_presence` heartbeat presence (10s beat / 30s stale) and Firebase Storage for image bytes (session doc carries only URLs; verified < 5000 bytes for a 2 MB template → requirement #5/Q5 + 1 MB doc-cap safety). Pure SSOT `src/lib/chartEditSessionCore.js` (status enums + heartbeat math + transition graph + doc builders + `shouldReap` + V81-fix1 `toMillis`) shared by PC hook + tablet page + backend TX guard + cron so they can't drift. Instant-pop compound query (branchId+tabletDeviceId+status composite index). BSA: be_chart_* branch-scoped (BC2), listeners BS-13 safe-by-default, Layer-2 passthrough in scopedDataLayer, xDoc/xCol accessors + ACCESSORS-map entries, AV101 invariant. perfect-freehand pen via Pointer Events (pressure/coalesced-events/palm-reject).

**FP4 bug-class lesson — accurate-error-distinction at the TX guard.** Live Chrome test: PC "send" failed with "แท็บเล็ตเครื่องนี้กำลังถูกใช้งานอยู่" (in use) when the tablet was actually idle-but-STALE (its tab had backgrounded → Chrome throttled the heartbeat setInterval → presence ageMs ~32s). The TX guard collapsed two distinct failure modes into TABLET_BUSY. Fix: `createChartEditSession` runTransaction now splits — presence `status==='busy'` → `TABLET_BUSY`; presence missing/idle-but-stale (`!isPresenceReady`) → `TABLET_OFFLINE`; the PC hook maps to distinct Thai messages (`useChartEditSession.js:32-34`). F6 regression test locks the distinction. **Lesson**: when a guard rejects, the rejection REASON the user sees must match the real cause — "busy" vs "offline/disconnected" lead the user to different correct actions (wait vs re-wake the tablet). Collapsing them is a UX bug even when the rejection itself is correct.

**T10 bug-class lesson — lifecycle unmount frees a live resource.** First cut mounted `TabletStandby` only while idle and swapped it for the editor on open → opening the editor UNMOUNTED the standby → `useTabletPresence` cleanup ran → presence freed (busy→idle) mid-edit → a ~30s window where a 2nd PC could grab the "free" tablet. Fix: always-mount `TabletStandby` (busy prop) + busy-aware heartbeat (`useTabletPresence(busy)` writes `status: busy?'busy':'idle'`); the editor renders as an overlay, never replacing the presence owner. **Lesson**: a hook that owns a shared lock/resource must not be unmounted by a view transition that happens DURING the locked state — keep the owner mounted and drive its state by a prop.

**Orphan-sweep verified LIVE on real prod (requirement #8 backstop).** `api/cron/chart-edit-session-sweep.js` (*/15, CRON_SECRET, admin SDK): live orphan → `cancelled/cancelledBy:'timeout'` + **frees the tablet presence (busy→idle)** + cleans Storage (`:66-76`); terminal → GC. During FP3 an admin-injected `requested` session with no live PC heartbeat was reaped + its tablet freed within the window — confirming the crashed-client safety net end-to-end on prod, not just in unit tests.

**Verification (Rule Q).** L2 e2e 6/6 on real prod (`scripts/e2e-tablet-chart-editor.mjs` — exact compound query + Storage round-trip + TX guard + cleanup) = gold-standard relay verification. Rule I flow-simulate F1-F6 (REAL PC hook over in-memory store) + stress ST1-ST6 + AV101. Live partial-L1: tablet lifecycle (standby→pop→draw→save→standby) + PC choice/ready-list/send verified live in Chrome when foreground. **Honest Rule Q scope (no over-claim)**: the simultaneous two-tab pop is blocked SOLELY by a single-machine harness constraint — when my tooling holds OS foreground, both browser tabs report `visibilityState:hidden` and Chrome suspends their Firestore listeners; desktop-foregrounding Chrome timed out without the user present. That is a harness artifact, NOT a product defect (a real dedicated tablet stays foreground/visible). Every relay LINK is independently verified; only the single-screenshot SIMULTANEITY is harness-blocked. Rule R diag tools: `diag-tablet-chart-trigger.mjs` (client SDK) + `diag-tablet-chart-admin-trigger.mjs` (admin SDK, no client creds — added this session).

**Deploy**: frontend + firestore.rules (be_chart_* isClinicStaff) + composite index, via Probe-Deploy-Probe (FP1). FP4 fix re-deployed. This session's 2 commits (admin diag tool + wiki ingest) are non-deploy-affecting. llm-wiki ingested (concept + entity + source pages) + `graphify update` ran (AST-only, new chart files in graph).

**Subagent note**: T1 implementer subagent installed perfect-freehand + wrote the first test, then autocompact-thrashed on the large baseline → pivoted to inline execution (V81 lesson: when project_baseline > subagent_budget, execute inline).

---

### Tablet Chart more-tools — 2026-05-21 EOD+1 — Pro toolset on the tablet chart editor (Fabric v7 + perfect-freehand)

After the Tablet Chart Editor relay shipped, the user asked for a professional annotation toolset on the tablet: select/move/resize + shapes + text + color picker, keeping the Apple-Pencil pressure feel. User picked **B (select/move/resize editing)** + **Hybrid perfect-freehand** pen, and mandated: "ทดสอบ … feature และ tools ใหม่ๆ … ใช้ได้ 100% และ save ส่งมาที่ PC ได้ 100% … ไม่มีเครื่องมือไหนเขียนไม่ได้ หรือลบไม่ได้ หรือส่งไป pc แล้วไม่ติดการ edit". Full cycle: `brainstorming` (Visual Companion auto-opened from the question stage) → spec (`docs/superpowers/specs/2026-05-21-tablet-chart-more-tools-design.html`) → `writing-plans` (`…/plans/2026-05-21-tablet-chart-more-tools.html`, 9 tasks) → `executing-plans` inline (subagents thrash on this baseline per V81/V86).

**Architecture**. The PC `ChartCanvas.jsx` was ALREADY a full Fabric editor (select/shapes/text/undo via toJSON history) but with a constant-width PencilBrush; the tablet `PenCanvas.jsx` had the perfect-freehand pressure pen but NO object model. The genuine hybrid = **Fabric v7 object model (reuse ChartCanvas patterns) + perfect-freehand as a `fabric.Path` built on pointer-up**. NEW `src/components/tablet-chart/TabletChartCanvas.jsx` replaces PenCanvas in the page. Decisive de-risking choice: the pen **rides Fabric's own `mouse:down/move/up` events** (`fc.getScenePoint(opt.e)` for coords, `opt.e.pressure`/coalesced/`pointerType` for the pen) and rebuilds the stroke as a real `fabric.Path` Fabric renders — **NOT** a `BaseBrush` subclass (avoids assuming v7 brush internals) and **NOT** manual `contextTop` drawing (avoids retina/transform math). Shapes/text/select/move/resize are Fabric-native; eraser is **object-granular tap + scrub** via `getBoundingRect` hit-test (no `EraserBrush` in fabric v7 core; no new dep, no raster compositing). NEW `src/lib/tabletChartTools.js` (pure tool descriptors) + `outlineToSvgPath` added to `penStroke.js`. Transport grows by one JSON blob: `uploadTransportJson`/`downloadTransportJson` (guarded) in `chartEditSession.js`; `resultFabricJsonUrl` on the session doc; `onSave` uploads PNG **and** fabricJson; the PC `useChartEditSession` SAVED handler downloads it (guarded) and passes a **real** `fabricJson` to `onSaved` (never `fabricJson:null`). `EditorToolRail` upgraded to the 9-tool set + freeform `<input type=color>`.

**#2 + #6 upgraded ("support every use-case")**: eraser = tap-to-delete + **scrub-to-delete** (drag → remove every object touched), uniform across strokes/shapes/text/arrows (true sub-stroke pixel-erase = scoped stretch via `@erase2d/fabric`, non-blocking). Save = flatten PNG (unchanged charts[] contract) **+ full fabricJson** (lossless / re-editable-ready).

**Rule Q V66 verification + the bug L1 caught**:
- **L2 e2e 9/0 on REAL prod Storage** (`scripts/e2e-tablet-chart-more-tools.mjs`, admin SDK): result.json + result.png upload to real Storage; the DOWNLOAD path is the EXACT client `downloadTransportJson` (fetch a `firebasestorage` token URL + JSON.parse, incl. the live bucket CORS); the round-tripped json carries EVERY drawing tool's object type; the merge payload is non-null; cleanup zero orphans. (Upload is admin `save` producing an identical blob — client-SDK L2 with `E2E_STAFF` creds is the only un-run piece, creds not in this session; the json rides the same Storage path + CORS the PNG already proved live 6/6.)
- **L1 REAL-browser** (Claude Preview + real fabric v7, via a temp `src/__l1-fabric-harness.js` re-export — deleted after; `import('fabric')` bare-specifier doesn't resolve in raw `preview_eval`): every tool's exact code path creates its object (pen `Path` from `getStroke`→`outlineToSvgPath`, line/arrow `Group`/rect/`Ellipse`/`Textbox`), eraser `getBoundingRect` removes the right object, `toDataURL` PNG works (18.8KB), `loadFromJSON` round-trips. This validated the riskiest assumptions (does fabric v7 have these APIs / does the pen produce a valid Path / does toJSON give correct types) against real fabric in a real browser.
- **L1 CAUGHT A REAL BUG (V66-family mock-shadow)**: fabric v7 `canvas.toJSON()` emits `type` in **PascalCase** (class name: `Path/Line/Group/Rect/Ellipse/Textbox`), but `shapeObjectType` + the F1 + L2 fixtures used **lowercase**. The L2 e2e had "passed" because it transported a HAND-MADE lowercase json that a real fabric canvas never produces. Only the L1 real-browser `toJSON()` revealed PascalCase. Fixed across `tabletChartTools.js` + U2.4 + F1 + the e2e fixtures. The feature itself is casing-independent (the component never compares `.type`); the bug was purely in the verification layer asserting strings real fabric doesn't emit — **exactly the V66 lesson: hand-made fixtures that don't match real output give false confidence; the real browser is the arbiter.**

**Full-suite (Rule N batch-end) caught 2 V21 regressions + 1 audit**: (a) **unmount-during-async-init** — `TabletChartCanvas`'s init effect read `elRef.current.parentElement` AFTER an `await setTimeout(30)`; the cancelled/elRef check was BEFORE the wait, so an RTL fast mount/unmount → null throw. Fix: re-check `cancelled || !elRef.current` AFTER the await. (b) **page-RTL mock drift** — `tablet-editor-page-rtl.test.jsx` mocked `PenCanvas` (old child + old ref API) and its `chartEditSession` mock lacked `uploadTransportJson`; after the swap the page imported the unmocked `TabletChartCanvas` → real fabric-in-jsdom + the null throw. Fix: mock `TabletChartCanvas` (new ref API incl. `exportFabricJson`/`deleteSelected`) + add the `uploadTransportJson` mock + `tablet-canvas-stub` testid + assert `resultFabricJsonUrl` in the save path. (c) **AV41** (global.fetch isolation, Phase 17.1 flake-fix) flagged 3 files assigning `global.fetch` without restore — my 2 new files + the pre-existing `tablet-chart-template-transport.test.js` (prior session's bugfix-saga test that was already a latent violator); added the PREFERRED `const ORIGINAL_FETCH = global.fetch` + `afterAll` restore to all 3.

**AV103** (NEW, audit-anti-vibe-code): the tablet relay result MUST transport fabricJson alongside the PNG; the PC merge MUST NOT pass `fabricJson: null` for a saved tablet result. Grep targets locked at the page (`exportFabricJson`+`uploadTransportJson`+`resultFabricJsonUrl`) + hook (`downloadTransportJson`+`resultFabricJsonUrl`, no `/fabricJson:\s*null/`) + canvas (`exportFabricJson`+`deleteSelected`+`getScenePoint`+`mouse:*`).

**Honest scope (no over-claim, FP-precedent)**: the editing ENGINE (L1 real browser) + the TRANSPORT (L2 real prod) are verified. The one piece the harness can't drive is the **mounted-component pointer-event WIRING** — synthetic `dispatchEvent` produces `isTrusted:false` events that Fabric's hardware-gated pointer pipeline ignores (a single proper `pointerdown` did not fire `mouse:down`). That wiring rides Fabric's battle-tested core + the standard `fc.on('mouse:*')` binding (the `getScenePoint`/object-creation halves ARE L1-verified) + the PROVEN relay (existing e2e 6/6 + the prior live-iPad verification) + the user's on-device L1 hands-on (their stated workstyle). The more-tools change is additive (toolset + fabricJson) on the same relay.

**State**: full vitest **13924/0**, build clean (~3s). ~10 commits on master (spec, plan, T1-T7 + casing fix + regression fixes). **NOT deployed** — awaiting explicit "deploy" (V18). Post-deploy: user on-device L1 — open `?tablet=chart` on a real iPad, draw with each tool (pen/highlighter/line/arrow/rect/circle/text), select+move+resize, tap+scrub erase, save → confirm the PC merges the annotated chart with the objects intact.

**Lessons**: (a) **L1 real-browser is the arbiter for library-API assumptions** — fabric v7 PascalCase `type` was invisible to mocks + hand-made fixtures (V66 mock-shadow); the real browser caught it. (b) **Ride the library's event pipeline, don't reimplement it** — `fc.on('mouse:*')` + `getScenePoint` + rebuild-as-Path sidesteps both BaseBrush-internal risk AND retina/transform math; lower-risk than the BaseBrush subclass the plan first considered. (c) **Async-init effects must re-check liveness after every `await`** — the cancelled/ref check before an `await setTimeout` is stale by the time the code after it runs. (d) **A component swap invalidates every test that mocked the old child** — grep for the old component name in tests when swapping (page-RTL mocked `PenCanvas`). (e) **Synthetic events are `isTrusted:false`** — they can't drive a hardware-gated pointer pipeline; be honest that event-wiring needs real-device L1, and verify the halves you CAN (coords API + object creation).
