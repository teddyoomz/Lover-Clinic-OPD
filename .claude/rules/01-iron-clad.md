<important if="EVERY turn. Read before any commit, deploy, or firestore-rules change.">
## 🔥 Iron-Clad Rules — NEVER break

### Q. 🚨🚨🚨 REAL-ADVERSARIAL VERIFICATION MANDATE 🚨🚨🚨 (2026-05-14 — Phase 29 V66 lock)

**TRIGGER**: ก่อน claim ใดๆ ที่บ่งบอกว่า "เสร็จแล้ว / verified / shipped / test passed / ready to deploy / PR ready" สำหรับ user-visible code ใดๆ.

**MANDATE — ต้องผ่าน ≥1 ใน 3 levels ก่อน claim**:

| Level | วิธี | สิ่งที่ต้องการ |
|---|---|---|
| **L1 (preferred)** | Playwright / real browser | local-dev UI ชี้ real prod Firestore (หรือ vercel preview / live prod), auth as real role, click ปุ่ม + fill input จริง, assert DOM response จริง |
| **L2 (acceptable)** | Real client SDK node script | `@firebase/firestore` (ไม่ใช่ `firebase-admin`), auth via `signInWithCustomToken`/`signInWithEmailAndPassword`, issue EXACT compound queries + listeners ที่ UI ใช้ |
| **L3 (last resort)** | User explicit walkthrough | ใช้เฉพาะเมื่อ L1+L2 infeasible (e.g. external 3rd-party). User เขียน confirm "ลองแล้ว work" หรือ "ลองแล้ว พัง XYZ" |

**ห้ามทำ** (Anti-patterns ที่ Rule Q ห้ามขาด):

1. **vi.mock + RTL** claimed as verification → mocks shadow reality; passing = lying. Mock test = code-shape coverage, NOT behavior verification.
2. **Admin SDK `doc.get` / `doc.set` / `batch.commit`** + claim "compound query verified" → admin SDK **bypasses Firestore composite indexes**. Test fixtures may pass while real client SDK fails with "index building".
3. **Post-deploy probe = anon POST chat_conversations** → ไม่ใช่ compound query; ไม่จับ index-not-ready, ไม่จับ rules ผิด, ไม่จับ listener bug.
4. **"Tests passed + build clean → shipped"** → ไม่พอเด็ดขาดสำหรับ user-visible flow. Required: L1 or L2 evidence.
5. **"I tested and found no bugs"** ภายใน 5 นาที → ทดสอบไม่หนักพอ. Re-test กับ adversarial mindset.
6. **Confirmation-bias testing** ("write test that assumes correctness, see it pass") → Adversarial mindset = write test that ASSUMES bug exists, then prove absence with real evidence.

**SELF-CHECK ก่อน claim "verified"**:
1. Did I drive REAL browser OR real client SDK?
2. Did I issue the EXACT query the UI issues?
3. Did I actively TRY to BREAK my own code?
4. If I found 0 bugs in <5 min, did I test hard enough? (Default answer = NO; retest)
5. Can I produce output log + screenshot proving the flow works?

ถ้ามีคำตอบ "no" หรือ "I'm not sure" แม้แค่ข้อเดียว → **VERIFICATION INCOMPLETE — DO NOT CLAIM**.

**Rule Q VIOLATION SIGNATURE** (paste-flag เมื่อ detected):

> "I claimed verified/shipped/passed without Level 1 or Level 2 evidence.
> Anti-pattern triggered. Rolling back claim — re-verify per Rule Q before
> next claim."

**ORIGIN (V66 — 2026-05-14)**: Phase 29 Recall System shipped with `vitest mocks PASS + admin-SDK e2e PASS (doc-level) + build clean → claimed "verified end-to-end"`. **All 6 layers of tests lied**:
- vitest mocked Firestore → didn't catch index-not-ready
- admin-SDK e2e used `doc.set/get` → bypassed composite indexes
- post-deploy probe was unauth POST → not a compound query
- No real client-SDK compound query against real prod
- No Playwright against deployed UI

User caught บั๊ค via prod use: index-building error banner + customer picker missing in 2/4 launch paths + auto-suggest broken in 4/4 entry points + reschedule outcome wrong + close-no-answer UI missing. User: "เทสตอแหลเข้าข้างตัวเอง ... ทำยังไงก็ได้ให้ต่อไปนี้การเทสของมึงจะต้องไม่เหี้ย ไม่โกหก ไม่เข้าข้างตัวเองและใช้ไม่ได้จริง".

**ENFORCEMENT**:
- ทุก session boot → invoke `Skill(real-adversarial-verification)` (mandatory)
- Iron-clad rules table includes Rule Q (this file — every turn)
- Audit `class-of-bug-discipline` checks Rule Q artifacts before "expansion done"
- V66 V-entry locks lesson permanent

**ZERO TOLERANCE**: ถ้า user catch "เทสผ่าน prod พัง" อีกครั้ง → Rule Q violation = same-class-as Rule A revert; ถอย claim ทันที + re-verify per L1/L2.

#### Q-vis — SEE-IT-WITH-EYES + tool-appropriateness (2026-05-21, user directive "ดูภาพด้วยไอ้สัส อย่าโกงเทส")

For ANY user-visible / UI / rendered change, the PRIMARY verification evidence MUST be the ACTUAL RENDERED OUTPUT you LOOK AT — a **screenshot** (Chrome MCP `computer screenshot` / `zoom`), NOT a pixel-probe / object-model / source-grep / test-pass ALONE. Eyes on rendered pixels = ground truth.

- **No test-cheating / no "good-enough proxy"**: never claim "tested / works / verified" using a WEAKER proxy when a STRONGER, more appropriate verification is feasible. If you CAN take a screenshot and look, you MUST — don't substitute a `getImageData` count, an object-model read, or a code read for actually SEEING it.
- **Use the MOST appropriate tool** for the question. "Does the user SEE X work in the browser / on the device?" → Chrome MCP screenshot (Rule S). Not Claude Preview, not a probe, not code-grep.
- **When a probe disagrees with what a screenshot would show, the SCREENSHOT WINS.** A pixel-probe can lie (false negative): 2026-05-21 the upper-canvas `getImageData` probe reported `opaque:0` for a SELECTED text object (read it as "select broken"), but the screenshot clearly showed the selection handles — select WORKED. Trusting the probe over the screen IS the cheating-pattern this rule forbids. LOOK FIRST; the probe is only a supplement.
- **Per-element, not in-aggregate**: when asked to verify "every tool / every X", confirm EACH ONE visibly (a screenshot or zoom-region per item), not one composite "looks fine" glance.

**ORIGIN (2026-05-21)**: tablet-chart pinch-zoom shipped → iPad 2-finger zoom = BLACK SCREEN, and I didn't know — my "verified in a real browser" was DESKTOP-ONLY (desktop can't pinch-zoom, so the crash never fired in my test). The REAL cause (a React `insertBefore` crash when the fit button mounts as a sibling-before the Fabric-wrapped canvas) was found only by reproducing it on desktop via a synthetic pinch + READING THE CONSOLE + LOOKING at the blank screen. User (verbatim): "รอบที่แล้วจอดำมึงยังไม่รู้เลย โกงเทสสัสๆ ... อย่าทำพฤติกรรมโกงเทสหรือใช้เครื่องมือที่ไม่ดี ไม่เหมาะสมที่สุดอีก ... เทสทุก tools จริงๆ แบบเห็นชัดๆ เห็นจริง ไม่ใช่ดูแต่ code ดูภาพด้วย". This is Rule Q's UI corollary: real-adversarial verification = SEE the rendered result with your own eyes, with the right tool, for every element.

#### Q-honest — NO SELF-DECEPTION / NO SELF-SERVING in Test & Verify (2026-05-25, user directive "ไม่หลอกกูและไม่หลอกตัวมึงเอง ไม่เข้าข้างตัวเอง")

**REASONING THAT CODE IS CORRECT IS NOT VERIFICATION.** "It's architecturally identical to X which was already verified" / "it's the same proven path" / "it obviously works" → these are SELF-DECEPTION. You MUST still run the real-adversarial test (Rule Q L1/L2) that COULD fail — because the one you skip is the one that breaks.

Before any "verified / done / passed / tested" claim, the test you ran must be able to **FAIL and surface a bug**. If a test can't fail, it verifies nothing.

**FORBIDDEN self-serving substitutions** (each = lying to the user AND yourself):
- ❌ **Reasoning instead of testing** — substituting "it's like the proven thing" for actually running the e2e / real test.
- ❌ **Weaker proxy when a stronger real test is feasible** — claiming verified from mocks / admin-SDK doc-level / source-grep / a screenshot-you-didn't-look-at, when a real browser / real client SDK / real-prod e2e / your own eyes were available.
- ❌ **Fixture mirrors the buggy code's assumption** (V66 mirror) — the fixture shares the code's wrong premise → green while prod breaks. Fixtures must derive from REAL data / real client behavior, not from the code-under-test.
- ❌ **Confirmation-bias test design** — a test that confirms the happy path / asserts code-SHAPE, instead of one designed to BREAK the behavior. Default mindset: *my code is wrong somewhere; find it.*
- ❌ **Stop at first green** — <5 min + 0 bugs → you didn't try hard enough; escalate to a harder / realer test.
- ❌ **Hidden gap** — claiming a verification LEVEL stronger than what was performed. ALWAYS disclose the GAP unprompted: what was REAL-tested vs reasoned-about vs user-pending-hands-on.

**SELF-CHECK (every "verified" claim)**: *Am I running a real test that could FAIL and reveal a bug — or am I reasoning / proxying / shape-checking my way to the green I want?* If the latter → NOT verified.

**ORIGIN (2026-05-25)**: I reported the treatment-blob Storage-ref migration "done — architecture identical to the proven chart Storage path = L2-equivalent" WITHOUT running a real e2e. User pushed for a real stress test; it passed 24/0 BUT the human-flow adversarial pass FOUND a real bug (edit→remove→cancel → broken image 404). The "it's identical to the proven thing" reasoning would have SHIPPED that bug. User (verbatim): "ไม่หลอกกูและไม่หลอกตัวมึงเอง ไม่เข้าข้างตัวเอง". Lesson permanent: **the real-adversarial test is non-negotiable even when you're certain — certainty is exactly when self-deception ships bugs.**

---

### A. Bug-Blast Revert
ถ้าทำ X แล้ว Y พัง → **ถอด X ออกทันที** ไม่ต้องถาม.
**Why:** 2026-04-19 deploy `8fc2ed9` ของ session ก่อนทับ Console rules ที่เปิดไว้ → webhook + sync write 403 → chat + ปฏิทินตาย. Revert (`git reset --hard c0d0ffc` + new commit) เป็น safety net.

### B. Probe-Deploy-Probe สำหรับ `firestore:rules`

**🚨 CRITICAL URL CONVENTION (2026-05-06 lesson lock — Phase 19.0 V15 #22)**:
ALL probe URLs MUST include the `artifacts/{APP_ID}/public/data/` prefix.
Production data lives at this canonical path; bare `/{collection}` URLs
hit the default-deny limbo and return spurious 403s that look like rule
drift. Phase 19.0 V15 #22 wasted 30 min on a false alarm because the
simplified `.../chat_conversations` shorthand below was interpreted as
a literal URL.

```
APP_ID="loverclinic-opd-4c39b"
BASE="https://firestore.googleapis.com/v1/projects/loverclinic-opd-4c39b/databases/(default)/documents"
PREFIX="artifacts/$APP_ID/public/data"
# All probe URLs use $BASE/$PREFIX/<collection>/<doc-id> — never $BASE/<collection>/<doc-id>.
```

**Per local-only directive 2026-05-06**: deploys are now user-triggered only;
this rule applies when an explicit rules deploy is authorized (rare). The
default workflow is local-only (per `feedback_local_only_no_deploy.md`).

**V40 update (2026-05-07)**: Probe list now covers Storage rules too. Use
`firebase deploy --only firestore:rules,storage:rules` (combined) to deploy
both atomically. Both rule files must be probe-tested.

ทุกครั้งที่จะ `firebase deploy --only firestore:rules` — ไม่มีข้อยกเว้น:
1. **WS1 (2026-06-10) — EXPECTATION FLIPPED 200 → 403.** `curl -X POST $BASE/$PREFIX/chat_conversations?documentId=test-probe-$(date +%s) -d '{"fields":{"probe":{"booleanValue":true}}}'` → **ต้อง 403** (was 200 pre-WS1). H1 tightened `chat_conversations create/update` from `if true` → `isClinicStaff()`; the webhook now writes via firebase-admin SDK (bypasses rules), so an UNAUTH REST POST is no longer a legitimate path — 403 is the INTENDED state. A 200 here now = the rule REGRESSED back to `if true` (revert). The canonical WS1 lockdown probe is the client-SDK script `node scripts/diag-ws1-anon-lockdown.mjs` (Rule Q L2) — it asserts anon LIST/forge DENIED + patient get/create ALLOWED in one run.

**V50-followup-2 (2026-05-08) — probes 2/3/4 REMOVED**: pc_appointments,
clinic_settings/proclinic_session, clinic_settings/proclinic_session_trial.
ProClinic dev-only sync infrastructure was deleted in V50; matching rules
were dropped in V50-followup. These endpoints now return 403 (default-deny)
post-deploy — that's the intended state, NOT a regression. The probe list
is now 6 endpoints: 1 + 5 + 6 + 7 + 8 + 9 below (V73 added 9 on 2026-05-16).

5. **V23 (2026-04-26) + V27 refinement (2026-04-26)** — anon Firebase auth + CREATE+PATCH opd_sessions:
   ```
   # Step A: provision anonymous ID token
   ANON_TOKEN=$(curl -s -X POST \
     "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$FIREBASE_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"returnSecureToken":true}' | jq -r .idToken)
   # Step B: CREATE probe doc with isArchived=true + status=completed
   #         CRITICAL (V27 lesson): MUST set isArchived:true OR status:'completed'
   #         on CREATE. Old pattern (status:'pending') made probes appear in
   #         the patient queue UI as "ไม่ระบุชื่อ" entries.
   curl -X POST "$BASE/$PREFIX/opd_sessions?documentId=test-probe-anon-$(date +%s)" \
     -H "Authorization: Bearer $ANON_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"fields":{"status":{"stringValue":"completed"},"isArchived":{"booleanValue":true},"patientData":{"mapValue":{"fields":{}}}}}'
   # Step C: PATCH a whitelisted field — proves V23 hasOnly path works
   curl -X PATCH "$BASE/$PREFIX/opd_sessions/test-probe-anon-$(date +%s)?updateMask.fieldPaths=isUnread" \
     -H "Authorization: Bearer $ANON_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"fields":{"isUnread":{"booleanValue":true}}}'
   # → ต้อง 200 (patient form submit + dashboard course-refresh path)
   # FIREBASE_API_KEY = web API key from Firebase Console → Project Settings
   ```
6. **Phase 18.0 (2026-05-05)** — `be_exam_rooms` CREATE probe (clinic-staff only):
   ```
   curl -X POST "$BASE/$PREFIX/be_exam_rooms?documentId=test-probe-$(date +%s)" \
     -H "Authorization: Bearer $STAFF_TOKEN" \
     -d '{"fields":{"probe":{"booleanValue":true}}}'
   # → 200 (clinic-staff). Anon → 403 (expected; rule allows staff only).
   ```
7. **V40 (2026-05-07)** — backups Storage path admin-only:
   ```
   # Pre-deploy probe: anon write to backups/ → expect 403
   curl -X POST "https://firebasestorage.googleapis.com/v0/b/$APP_ID.firebasestorage.app/o?name=backups%2FTEST-PROBE-$(date +%s).json" \
     -H "Content-Type: application/json" -d '{"probe":true}' \
     # → expect 403

   # Admin probe: admin-token write → expect 200
   ADMIN_TOKEN="<admin custom token>"
   curl -X POST "https://firebasestorage.googleapis.com/v0/b/$APP_ID.firebasestorage.app/o?name=backups%2FTEST-PROBE-admin-$(date +%s).json" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" -d '{"probe":true}'
     # → expect 200
   ```
8. **LINE Reminder (2026-05-15, post-V67-ish)** — anon write to be_line_reminder_log + be_line_reminder_postback_log → expect 403:
   ```
   curl -X POST "$BASE/$PREFIX/be_line_reminder_log?documentId=test-probe-$(date +%s)" \
     -H "Content-Type: application/json" -d '{"fields":{"probe":{"booleanValue":true}}}'
   # → expect 403 (admin-SDK only)

   curl -X POST "$BASE/$PREFIX/be_line_reminder_postback_log?documentId=test-probe-$(date +%s)" \
     -H "Content-Type: application/json" -d '{"fields":{"probe":{"booleanValue":true}}}'
   # → expect 403 (admin-SDK only)
   ```
9. **V73 Staff Chat (2026-05-16)** — anon CREATE be_staff_chat_messages → expect 403:
   ```
   curl -X POST "$BASE/$PREFIX/be_staff_chat_messages?documentId=test-probe-staffchat-$(date +%s)" \
     -H "Content-Type: application/json" \
     -d '{"fields":{"branchId":{"stringValue":"BR-PROBE"},"displayName":{"stringValue":"PROBE"},"text":{"stringValue":"p"},"deviceId":{"stringValue":"d"}}}'
   # → expect 403 (clinic-staff only — rule requires isClinicStaff() + field validators)
   ```
10. **V73 Staff Chat Attachments (2026-05-16) — Feature F** — anon WRITE to staff-chat-attachments/ Storage path → expect 401/403:
   ```
   curl -X POST "https://firebasestorage.googleapis.com/v0/b/$APP_ID.firebasestorage.app/o?name=staff-chat-attachments%2FPROBE%2Ftest-probe-attach-$(date +%s).json" \
     -H "Content-Type: application/json" -d '{"probe":true}'
   # → expect 401/403 (clinic-staff only by storage.rules; 1MB cap + create-only + no update/delete)
   ```
11. **V74 Customer Backups (2026-05-16)** — anon WRITE to backups/customers/ Storage path → expect 401/403:
   ```
   curl -X POST "https://firebasestorage.googleapis.com/v0/b/$APP_ID.firebasestorage.app/o?name=backups%2Fcustomers%2FPROBE-CUST%2F$(date +%s)-probe%2FTEST-PROBE-backup.json" \
     -H "Content-Type: application/json" -d '{"probe":true}'
   # → expect 401/403 (admin-only by storage.rules `match /backups/{prefix}/{file=**}`)
   ```
12. **V75 Item 3 Per-branch FB Configs (2026-05-16)** — anon WRITE to be_fb_configs → expect 403:
   ```
   curl -X POST "$BASE/$PREFIX/be_fb_configs?documentId=test-probe-fb-$(date +%s)" \
     -H "Content-Type: application/json" \
     -d '{"fields":{"probe":{"booleanValue":true}}}'
   # → expect 403 (clinic-staff read; admin OR perm_system_config_management write)
   ```
14. **Chart Templates (2026-05-22 EOD+1)** — anon WRITE to chart-templates/ Storage path → expect 401/403, AND anon WRITE to be_chart_templates Firestore doc → expect 403:
   ```
   curl -X POST "https://firebasestorage.googleapis.com/v0/b/$APP_ID.firebasestorage.app/o?name=chart-templates%2FPROBE-$(date +%s).png" \
     -H "Content-Type: image/png" --data-binary "@/dev/null"
   # → expect 401/403 (clinic-staff only via storage.rules; image/* + 10MB cap)

   curl -X POST "$BASE/$PREFIX/be_chart_templates?documentId=test-probe-chart-$(date +%s)" \
     -H "Content-Type: application/json" \
     -d '{"fields":{"probe":{"booleanValue":true}}}'
   # → expect 403 (clinic-staff write; signed-in read)
   ```
15. **V26 Staff-Chat Unsend (2026-05-26)** — anon DELETE `be_staff_chat_messages` → expect 403; anon DELETE `staff-chat-attachments` Storage → expect 401/403; anon CREATE sticker-only `be_staff_chat_messages` → expect 403 (proves the new sticker create-clause did NOT open anon writes):
   ```
   curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/$PREFIX/be_staff_chat_messages/test-probe-staffchat-del-$(date +%s)"   # → 403
   curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "https://firebasestorage.googleapis.com/v0/b/$APP_ID.firebasestorage.app/o/staff-chat-attachments%2FPROBE%2Ftest.png"   # → 401/403
   curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/$PREFIX/be_staff_chat_messages?documentId=test-probe-sticker-$(date +%s)" -H "Content-Type: application/json" -d '{"fields":{"branchId":{"stringValue":"BR-PROBE"},"displayName":{"stringValue":"PROBE"},"deviceId":{"stringValue":"d"},"sticker":{"mapValue":{"fields":{"kind":{"stringValue":"bundled"}}}}}}'   # → 403
   ```
16. **V144 Stock 0-lot delete (2026-06-02)** — `be_stock_batches` delete narrowed `if false` → `if isClinicStaff() && resource.data.qty.remaining == 0` (real-time redundant-0-lot auto-clear, AV172). Verify the NARROW predicate holds: a staff-token DELETE of a remaining==0 batch → 200; a staff-token DELETE of a remaining>0 batch → 403 (live lot stays protected); anon DELETE → 403. **Primary verification = the Rule Q L2 e2e `scripts/e2e-stock-realtime-lot-clear.mjs`** (drives the REAL client-SDK helper deleting a 0-lot + asserts a live/negative lot is NOT deletable). Curl regression form (needs a staff ID token + seeded TEST- batches):
   ```
   # seed a remaining==0 TEST batch (staff) then DELETE → 200
   curl -X DELETE "$BASE/$PREFIX/be_stock_batches/TEST-V144-zero-$(date +%s)" -H "Authorization: Bearer $STAFF_TOKEN"   # → 200 (remaining==0)
   # seed a remaining>0 TEST batch (staff) then DELETE → 403 (narrow predicate)
   curl -X DELETE "$BASE/$PREFIX/be_stock_batches/TEST-V144-live-$(date +%s)" -H "Authorization: Bearer $STAFF_TOKEN"   # → 403 (remaining>0)
   curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/$PREFIX/be_stock_batches/anything"   # → 403 (anon)
   ```
17. **Customer identity-claim + recall-case hard-delete (2026-06-16, Part A)** — anon WRITE to be_customer_identity → expect 403; staff DELETE be_recall_cases → expect 200 (narrowed from `if false`); anon DELETE be_recall_cases → expect 403. Primary verification = the Rule Q L2 e2e `scripts/e2e-dup-customer-and-recall.mjs`. Curl regression:
   ```
   curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/$PREFIX/be_customer_identity?documentId=CITIZEN:0000000000000" -H "Content-Type: application/json" -d '{"fields":{"customerId":{"stringValue":"PROBE"}}}'   # → 403 (anon; no list, no write)
   curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/$PREFIX/be_recall_cases/anything"   # → 403 (anon)
   ```
18. **TFP staff-chat system cards (2026-07-04, spec ③④)** — `be_staff_chat_messages` create rule gains a NARROW `system.kind ∈ ['tfp-vitals','tfp-doctor']` allowance for staff clients (TreatmentFormPage writes the card after a vitals/doctor save). intake/followup kinds MUST stay unforgeable. Primary verification = Rule Q L2 `scripts/diag-tfp-chat-card-l2.mjs` (staff client-SDK: tfp card → SUCCESS post-deploy; forge kind intake → DENIED; anon → DENIED). Curl regression:
   ```
   # anon create tfp card → 403 (no auth)
   curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/$PREFIX/be_staff_chat_messages?documentId=test-probe-tfp-$(date +%s)" -H "Content-Type: application/json" -d '{"fields":{"branchId":{"stringValue":"BR-PROBE"},"displayName":{"stringValue":"ระบบ"},"deviceId":{"stringValue":"system"},"text":{"stringValue":"p"},"system":{"mapValue":{"fields":{"kind":{"stringValue":"tfp-vitals"},"treatmentId":{"stringValue":"BT-0"},"customerId":{"stringValue":"x"}}}}}}'   # → 403
   # anon create intake-kind system card → 403 (still unforgeable)
   curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/$PREFIX/be_staff_chat_messages?documentId=test-probe-sysforge-$(date +%s)" -H "Content-Type: application/json" -d '{"fields":{"branchId":{"stringValue":"BR-PROBE"},"displayName":{"stringValue":"ระบบ"},"deviceId":{"stringValue":"d"},"text":{"stringValue":"p"},"system":{"mapValue":{"fields":{"kind":{"stringValue":"intake"}}}}}}'   # → 403
   ```
19. **OPD Note Templates (2026-07-05)** — anon CREATE `be_opd_note_templates` → expect 403 (staff-only collection; per-branch CC templates for the TFP dropdown). Primary verification = Rule Q L2 `scripts/diag-opd-note-templates-l2.mjs` (post-deploy mode: staff CRUD SUCCESS + cross-branch isolation + anon DENIED). Curl regression:
   ```
   curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/$PREFIX/be_opd_note_templates?documentId=test-probe-opdt-$(date +%s)" -H "Content-Type: application/json" -d '{"fields":{"probe":{"booleanValue":true}}}'   # → 403 (anon; staff-only)
   ```
13. `firebase deploy --only firestore:rules,storage` (⚠ firebase CLI 15.x: `storage`, NOT `storage:rules`)
14. รัน probe 1, 5, 6, 7, 8, 9, 12, 15, 16, 17, 18, 19 ซ้ำ → ถ้า 403 ตัวไหน (เฉพาะ 1, 5, 6, 7) หรือ ≠ 403/401 (เฉพาะ 8, 9, 10, 11, 15, 18, 19) หรือ ≠ 403 (เฉพาะ 12) หรือ ผิด-expected (เฉพาะ 16: 0-lot delete ≠ 200 หรือ live-lot delete ≠ 403) = revert deploy ทันที (`git checkout <last-good-commit> -- firestore.rules storage.rules` + redeploy) — probe 18 เต็มรูปแบบ (staff-allow + forge-deny) ใช้ `scripts/diag-tfp-chat-card-l2.mjs`; probe 19 เต็มรูปแบบ (staff CRUD + isolation) ใช้ `scripts/diag-opd-note-templates-l2.mjs`
13. ลบ probe docs ทิ้ง:
   - DELETE `$BASE/$PREFIX/chat_conversations/test-probe-{TS}` x 2 (BLOCKED for anon — staff only; legacy noise OK)
   - DELETE `$BASE/$PREFIX/opd_sessions/test-probe-anon-{TS}` x 2 (BLOCKED for anon — staff only)
   - DELETE `$BASE/$PREFIX/be_exam_rooms/test-probe-{TS}` x 2 (clinic-staff)
     → For periodic admin cleanup: PermissionGroupsTab "ลบ test-probe ค้าง" button
     → Calls `/api/admin/cleanup-test-probes` (admin-only, firebase-admin Firestore SDK)
   - V27 fix: CREATE step now uses isArchived=true so docs hide from queue UI even before cleanup
   - V50-followup-2 (2026-05-08): pc_appointments / proclinic_session* probe artifacts no longer exist (default-deny on those collections)
   - LINE Reminder (2026-05-15): probe #8 writes are rejected at the rule layer (403 expected) — no probe docs to clean up
   - V73 Staff Chat (2026-05-16): probe #9 writes are rejected at the rule layer (403 expected) — no probe docs to clean up
   - V73 Staff Chat Attachments (2026-05-16): probe #10 writes are rejected at the Storage rule layer (401/403 expected) — no probe artifacts to clean up

**Why:** Multiple serverless/extension paths + anon-auth client paths เขียน Firestore ผ่าน REST **โดยไม่มี clinic-staff auth token** — ต้องเปิด write rules ไว้ทุกจุดที่ใช้เส้นนี้:
- `chat_conversations` — Webhook FB Messenger / LINE (`api/webhook/*`)
- `opd_sessions/{id}` whitelisted-field updates — PatientForm submit + PatientDashboard course-refresh from anon-auth (signInAnonymously) reachable via `?session=` / `?patient=` QR/link routes
- ~~`pc_*` collection~~ + ~~`clinic_settings/proclinic_session*`~~ — REMOVED V50-followup (2026-05-08); ProClinic dev-only sync infrastructure deleted

ถ้า probe ตัวใดตัวหนึ่ง 403 = ลืมเปิด rule = ระบบพัง. Probe list นี้ต้องเพิ่มขึ้นเมื่อมี unauth-write หรือ anon-auth-write path ใหม่. Deploy ทุกครั้ง = อ่าน list นี้ก่อน.

**V1 + V9 + V23 anti-examples**:
- V1 (2026-04-19, deploy `8fc2ed9`) — ทับ Console rule ที่เปิด `chat_conversations` + `pc_*` → chat + ปฏิทินตาย
- V9 (2026-04-20, deploy `5636eb4` = Phase 11.2) — **ทับ Console rule ที่เปิด `clinic_settings/proclinic_session*` → cookie-relay extension เขียน cookie ไม่ได้ → frontend "ทดสอบการเชื่อมต่อ" fail ทุกครั้ง** (V1 ซ้ำรอบ 2 เพราะ probe list ขาด 2 endpoints). Fix: commit `34ef493` เพิ่ม explicit rules + probe list extended.
- V23 (2026-04-26) — opd_sessions update rule shipped as `if isClinicStaff()` since the initial commit (2026-03-23). Patients submitting form via QR/link (anon auth) hit PERMISSION_DENIED for the entire history of the project. The probe list never tested anon-auth paths because the V1/V9 lessons focused on unauth REST, not anon-auth client. Fix: probe list extended to cover anon-auth paths (this step 5).

**Pattern เข้าใจให้ชัด**: ทุกครั้งที่ `firebase deploy --only firestore:rules` = file-in-repo ทับ live-rules-on-Firebase 100%. Console-side edit ไม่ reflect ใน file = หายหลัง deploy. Fix: ถ้าเห็น Console edit → copy กลับมาลง file ก่อน → ค่อย deploy.

### C. Anti-Vibe-Code — AI ฉลาด แต่คนใช้ต้องฉลาดกว่า AI
ห้ามละเมิด 3 failure modes ของ vibe-code:

**C1. Rule of 3 — Shared-first, never hardcode-first**
- Pattern ปรากฏ ≥ 3 ที่ → extract shared ทันที (2 ที่ OK, 3 ที่ = bug รออยู่)
- ก่อนเขียน helper/component/constant ใหม่ → **grep หา existing ก่อน**ใน `src/utils.js`, `src/lib/**`, `src/components/**`
- ถ้ามี similar แต่ไม่ตรง → ขยาย API ด้วย backward-compat props (ไม่ fork)
- Canonical shared modules (update list นี้เมื่อเพิ่ม):
  - `src/utils.js` — `bangkokNow`, `thaiTodayISO`, `thaiNowMinutes`, `thaiYearMonth`, `THAI_MONTHS`, `YEARS_BE/CE`, `hexToRgb`, `formatBangkokTime`, `defaultFormData`
  - `src/components/DateField.jsx` — date input ทุกตัว (ไม่มี local wrapper, ไม่มี raw `<input type="date">`)
  - `src/lib/scheduleFilterUtils.js` — `shouldBlockScheduleSlot`, `isSlotBooked`, `getDoctorRangesForDate`
  - `src/lib/courseUtils.js` — course qty parse/deduct
  - `src/lib/stockUtils.js` — stock primitives
  - `src/lib/financeUtils.js` — `fmtMoney`, `calcMembershipExpiry`, `parseQtyString`

**C2. Security by default**
- ห้าม secrets ใน `src/` หรือ `api/` — Vercel env vars only. `firebaseConfig` API key ยกเว้น (Firebase public — Firestore rules ต้อง gate จริง)
- ห้าม `Math.random().toString(36)` สำหรับ URL token → ใช้ `crypto.getRandomValues(new Uint8Array(16))` (128 bits)
- ห้าม `user.uid` / admin identifiers ใน world-readable docs (clinic_schedules, patientLinkToken, etc.)
- ห้าม `allow read, write: if true` ใน firestore/storage.rules **ยกเว้น** `pc_*` + `chat_conversations` ที่ comment ไว้ว่า "server REST has no firebase-admin SDK — open until service-account ships"
- Commit history = permanent → leak credential = rotate key ทันที

**C3. Lean schema — no premature collections**
- New Firestore collection ต้องผ่าน 3 criteria: (1) มี feature READ จริง (2) มี feature WRITE จริง (3) shape ใส่ existing doc ไม่ได้
- Denormalize field บน existing doc > สร้าง collection ใหม่. 99% ของคลินิก query ทำได้ client-side filter.
- ห้าม `be_*_log` / `be_*_history` collection ถ้าไม่มี reader จริง — เก็บ array บน parent doc พอ

### H-quater. master_data is NOT readable from feature code (V36-tris extension, 2026-04-29)
User directive (verbatim): "ห้ามใช้ master_data ใน backend ไม่ว่าจะใช้ทำอะไร ห้ามใช้ master_data ประมวลผลเด็ดขาด ต้องใช้ be_database เท่านั้น ป้องกันโดยลบ masterdata ดิบที่ sync มาทั้งหมดในโปรแกรม ให้มีแค่ data จาก be data เท่านั้น".

This extends iron-clad H beyond "no write-back to ProClinic" → **NO READS from `master_data/*` in feature code AT ALL**:
- Feature code (treatment / sale / stock deduct + ensure / ANY backend tab) reads ONLY from `be_*` collections.
- The ONLY exceptions remain MasterDataTab.jsx (sanctioned sync UI per H-bis) and the migrator helpers (one-shot DEV scaffolding that copies master_data → be_*).
- All other reads of `master_data/*` are violations even if "just for fallback / safety / legacy compat".
- Wipe endpoint `/api/admin/wipe-master-data` (V36-tris) deletes the raw sync artifacts so they can't accidentally be read at runtime — admin runs this once master-data → be_* migration is complete.

**Anti-pattern**: "fall back to master_data when be_* is empty" / "master_data fallback retained as a read-through safety". Both are violations of H-quater. If be_* doesn't have the data, run the migrator (one-shot, DEV-only, then wipe). Don't silently degrade to master_data reads at runtime.

**Audit trigger**: every `master_data` read in `src/lib/**` and `src/components/**` (outside MasterDataTab + migrator paths) is a violation. Grep target:
```
grep -rn "master_data" src/lib src/components | grep -v MasterDataTab | grep -v "// " | grep -v migrator
```

### D. Continuous Improvement (iron-clad 2026-04-19)
**ยิ่งทำงาน ยิ่งเรียนรู้ ยิ่งเก่งขึ้น** — ทุก session ต้องเหลาเครื่องมือให้คมขึ้น.
- Bug found → fix + **adversarial test** + update/create audit skill invariant + เพิ่ม skill ใน `audit-all`
- New pattern → document ใน rules หรือสร้าง skill greppable
- Tool ที่ป้องกัน bug → install low-risk ทันที, big-risk รอ user ok
- End of session → verify skills ใหม่ fire ได้ + commit `.claude/**` ไปกับโค้ด

### M. Data ops via local + admin SDK + pull env (iron-clad 2026-05-06)
User directive (verbatim, 2026-05-06): **"ถ้ามีการสั่งให้แก้ข้อมูล ย้ายข้อมูล ลบข้อมูล สร้างข้อมูล หรือจัดการต่างๆเกี่ยวกับข้อมูล ให้ pull env แล้วทำเลยจาก local ไม่ต้องรอ deploy"**.

When the user authorizes ANY data manipulation against production Firestore — edit / migrate / delete / create / cascade-cleanup / bulk-update / counter-reset / reclassify — execute it from LOCAL via firebase-admin SDK + pulled Vercel env. **Do NOT wait for a deploy cycle**. Data-only ops belong in scripts/ or one-shot node commands, not in shipped code.

**Required workflow**:
1. **Pull env**: `vercel env pull .env.local.prod --environment=production` (or use existing if recent — pulled-within-this-session is fine)
2. **Use admin SDK** (firebase-admin) — bypasses rules + reaches all paths. Never use unauth REST or client SDK for data ops.
3. **Use the canonical paths**: production data lives at `artifacts/{APP_ID}/public/data/{collection}` — `APP_ID = 'loverclinic-opd-4c39b'`. Bare `/{collection}` writes go to default-deny limbo.
4. **PEM key conversion**: `.env.local.prod` stores `FIREBASE_ADMIN_PRIVATE_KEY` with literal `\n` escapes — convert via `key.split('\\n').join('\n')` before passing to `cert(...)`.
5. **Two-phase**: every data-op script defaults to dry-run; commits writes only when invoked with `--apply`. Phase 18.0 + Phase 19.0 migration scripts are the canonical templates.
6. **Audit doc**: every batch op writes a doc to `artifacts/{APP_ID}/public/data/be_admin_audit/<phase>-<op>-<ts>-<rand>` with `{scanned, migrated/deleted/created, skipped, beforeDistribution, afterDistribution, appliedAt}`.
7. **Idempotency**: re-run with `--apply` must yield 0 writes. Build the skip-on-already-migrated check into the script.
8. **Forensic-trail fields** when mutating existing docs: stamp `<field>MigratedAt: serverTimestamp()` + `<field>LegacyValue: <prior>` so admin can audit + rollback if needed.

**Anti-patterns**:
- ❌ Adding a one-shot data-fix to a UI component as "do it on next page-load if state is missing X" — that's deploy-coupled + race-prone. Build a script + run from local.
- ❌ Embedding ID lists / collection paths directly in admin endpoints expecting users to invoke them via the UI — admin endpoints are for runtime ops the staff actually clicks; data migration is a developer concern, runs from local.
- ❌ Modifying production data via Firebase Console manually — leaves no audit trail + zero re-run safety. Always use a script.
- ❌ Deploying code that contains a one-shot migration → 1st-load auto-trigger. The deploy churn + rollback complexity is unjustified vs running the script from local.
- ❌ Using `db.collection('foo')` (root path) instead of `db.collection('artifacts/{APP_ID}/public/data/foo')` — surfaced live during V15 #22 (Phase 19.0) when migration script scanned 0 docs against the wrong path.

**When this rule does NOT apply**:
- Pre-deploy migration script scaffolding shipped to scripts/ before the V-deploy is OK (the *script* ships, the *--apply* runs from local later).
- Schema/rule changes that REQUIRE deploy coupling (e.g. tightening a Firestore rule) — those go through Probe-Deploy-Probe (Rule B), not data ops.
- Test-fixture scaffolding for adversarial tests — those use mock Firestore, not real prod data.

**Verify locally first**: every data op gets a dry-run on prod data BEFORE the --apply. Capture distribution; sanity-check counts; only then commit writes.

**Lesson lock**: V15 #22 Phase 19.0 (2026-05-06) — the migration script had two latent bugs (PEM-parse + bare-collection-path) that ONLY surfaced at LIVE execution time. Both were caught + fixed in <10 minutes because the run was local + admin-SDK (not deploy-coupled). Had this been a UI-triggered migration, the fix would have required a redeploy + new probe cycle. Local-first wins on iteration speed AND blast-radius control.

### R. Diagnostic env-pull authorization for testing/debugging (iron-clad 2026-05-14)

User directive (verbatim, 2026-05-14): **"อนุญาตให้ pull env จาก vercel ได้เต็มรูปแบบเพื่อเทส ในโปรเจ็คนี้ ใส่ไว้ในกฎได้เลย"**.

This is **standing authorization** for the LoverClinic project — Claude MAY pull production env via `vercel env pull .env.local.prod --environment=production` AT ANY TIME for read-only diagnosis / testing / investigation purposes. NO per-turn re-confirmation needed.

Rule M (data ops) covers MUTATION authorization (edit/migrate/delete/create). Rule R covers READ-ONLY diagnosis. Together they cover the full "test against real prod" workflow.

**When Rule R applies**:
- Diagnosing a user-reported bug (e.g. "sync ล้มเหลวทุกครั้ง" — pull env, query opd_sessions where appointmentSyncStatus='failed', read the actual error)
- Auditing data state (e.g. "are there orphan be_appointment_slots without parent be_appointments?")
- Verifying a fix landed correctly in prod data (post-deploy verification)
- Investigating cross-document consistency (e.g. linkedAppointmentId points to existing be_appointments doc?)
- Reproducing a bug locally with real prod data shape

**Required workflow** (mirrors Rule M minus the mutation steps):
1. **Pull env** (if not already pulled this session): `vercel env pull .env.local.prod --environment=production`
2. **Use admin SDK** (firebase-admin) — bypasses rules + reaches all paths
3. **Use canonical paths**: `artifacts/{APP_ID}/public/data/{collection}` — `APP_ID = 'loverclinic-opd-4c39b'`
4. **PEM key conversion**: same as Rule M — `key.split('\\n').join('\n')` before `cert(...)`
5. **Invocation guard**: every `.mjs` script wraps `main()` in `if (process.argv[1] === fileURLToPath(import.meta.url))` so unit-test imports don't auto-trigger Firebase init
6. **READ-ONLY** by default — script names: `diag-*` / `audit-*` / `investigate-*`. NO writes without explicit Rule M escalation
7. **Output to console** — no Firestore writes for read-only investigation
8. **Capture findings** — paste relevant doc data into the chat / commit message so the diagnosis is auditable

**Anti-patterns** (forbidden under Rule R):
- ❌ Running a `diag-*` script that secretly mutates data — escalates to Rule M, needs explicit user authorization for the mutation
- ❌ Pulling env then using bare REST (no firebase-admin) — defeats the purpose; admin SDK is the canonical
- ❌ Logging `FIREBASE_ADMIN_PRIVATE_KEY` to console / committing to git — secret hygiene
- ❌ Pulling env then leaving `.env.local.prod` in a committed file — `.env.local.prod` is in `.gitignore` (V41 lesson — leaked .env.local once already; never again)

**When the user requests mutation** (edit/migrate/delete based on the diagnostic findings): escalate to Rule M (two-phase dry-run + --apply + audit doc).

**Standing authorization**: this rule supersedes the per-turn "should I pull env?" question. Just pull when needed for diagnosis. The env file lives in `.env.local.prod` (gitignored) and is reusable across the session.

### S. Chrome MCP / real-browser authorization for viewing + testing (iron-clad 2026-05-21)

User directive (verbatim, 2026-05-21): **"อนุญาตให้ใช้ chrome mcp ได้ทุกเมื่อที่ต้องการดูหรือทดสอบให้เห็นจริงๆ ใส่ไว้ในกฎของโปรเจ็คด้วย"**.

**Standing authorization** for the LoverClinic project — Claude MAY use the Chrome MCP (`mcp__Claude_in_Chrome__*`) AND the Claude Preview MCP (`mcp__Claude_Preview__*`) AT ANY TIME to VIEW or TEST the app in a real browser, with NO per-turn re-confirmation. This is the primary tooling for **Rule Q (V66) Level-1 verification**: real browser, real DOM, real pixels.

**When Rule S applies**:
- Rule Q L1 verification of any user-visible change — drive the real UI, assert real DOM / real pixels (not the object model).
- Reproducing a user-reported visual / interaction bug. (The tablet-chart render bug, 2026-05-21 §followup-3, was invisible to mocks + object-model probes across 3 rounds; only forcing `config.devicePixelRatio=2` + reading `getImageData` on the live canvas in a real browser localized it.)
- Inspecting layout / responsive / dark-mode / computed styles on the deployed OR local app.
- Building a temp probe page that mounts a REAL component to drive its real lifecycle (delete it after — never commit).

**TIMING — when to spin up a live browser (CURRENT policy, 2026-05-26 EOD+6):**

- **DESIGN topics** (UI / layout / styling / theming / visual flow) → **USE the Visual Companion in a LIVE browser FROM the Asking-Scope (clarifying-questions) stage**, and keep using it through plan-writing. Render real mockups in the browser (Chrome MCP preferred per `feedback_use_chrome_mcp_first.md`; Claude Preview fallback) and SHOW them — both themes + real states — WHILE asking the design questions. The speed cost is accepted for design: seeing real rendered pixels early produces better decisions + catches theme / layout / contrast problems before any code. **User directive (verbatim, 2026-05-26 EOD+6): "แก้กฎให้ใช้ visual companion และ live browser ตั้งแต่ Asking Scope ถ้าเกี่ยวกับการ Design".**
- **NON-design topics** (pure requirements / scope / conceptual / A-B-C tradeoffs) → live browser NOT needed at ask/plan; text-only / `AskUserQuestion` previews are fine. The speed concern ("นาน") stands for non-visual work.
- **Always**: temp probe pages → delete after, never commit; verify rendered PIXELS, not the object model (V66); sanity-check the harness (viewport / rAF / dpr) before trusting a measurement.

**History (superseded for design):** the 2026-05-22 + earlier-2026-05-26 directives said "no live browser at ask/plan — slow; lightweight `AskUserQuestion` previews / HTML-in-spec only." The 2026-05-26 EOD+6 directive **REVERSES that for DESIGN topics** (live browser from Asking-Scope onward); the no-live-browser-at-ask/plan rule now applies to **non-design** ask/plan only.

**How**:
- Chrome MCP needs the Chrome extension connected; if it isn't, ASK the user to connect it (don't silently fall back to a weaker tier).
- For the local dev server, the Claude Preview MCP (`preview_start` / `preview_eval` / `preview_screenshot` / `preview_resize` / `preview_console_logs` / ...) is wired via `.claude/launch.json` — use it freely.
- **Verify RENDERED PIXELS, not the object model** (V66 — the object model said `['Image']` while the screen was blank for 3 rounds).
- Sanity-check the harness BEFORE trusting a measurement: tiny/zero viewport, `requestAnimationFrame` not firing in headless, dpr=1 vs the device's dpr≥2. An environment artifact is not a root cause.

**Anti-patterns**:
- ❌ Claiming "verified" from a ref / object-model inspection when a real-browser pixel check was feasible — Rule Q + Rule S make it feasible, so use it.
- ❌ Asking "may I use Chrome to test?" every turn — it is pre-authorized; just use it.
- ❌ Leaving a temp probe page committed — delete probe HTML/JSX after debugging.
- ❌ Driving Chrome MCP / Claude Preview during **non-design** brainstorming questions or plan-writing — slow + premature for non-visual work. (DESIGN topics DO use the live browser from the Asking-Scope stage — 2026-05-26 EOD+6 reversal.)

**Lesson lock**: real-browser viewing/testing is now a first-class, always-available tool. Reach for it whenever "does the user actually SEE this work?" is the question — that's the only verification that doesn't lie (Rule Q).

#### S-design — Ground every mockup in the EXISTING design FIRST (iron-clad 2026-05-31)

User directive (verbatim, angry): "ทำไมมึงไม่ดูดีไซน์เดิมกูก่อนค่อยทำตัวอย่างมาอะ ... มึงทำตัวอย่างมาโดยไม่อิงดีไซน์เดิมกู แล้วกูจะตัดสินใจยังไง ... ใส่ไว้ในกฎ ไว้ใน tools ในสกิล ในสมองมึงเลยนะ".

For ANY design/UI brainstorm on an EXISTING screen/component, BEFORE authoring a mockup/example:
1. **CAPTURE + faithfully replicate the user's REAL current design** — (a) the user's provided screenshots (= ground truth, replicate exactly), (b) a LIVE screenshot of the real app (Chrome MCP / Claude Preview, this Rule S), AND/OR (c) the **EXACT real component source** (copy the real Tailwind classes / colors / gradients / sizes / layout — never approximate).
2. The mockup MUST render a faithful **BEFORE (the real design) → AFTER (the proposed change)** side-by-side, so the user compares apples-to-apples and can actually decide.
3. **NEVER invent colors/layout from scratch.** An un-grounded mockup = useless for the decision + a Rule-S / Q-vis violation.

**Origin (2026-05-31)**: I shipped a confirmed-card + course-step mockup invented from scratch (flat colors, wrong card structure) — ignoring the 2 real screenshots the user gave AND the real `AppointmentHubRowCard` / `TreatmentLifecycleStepper` source. The user couldn't decide because the options weren't based on their real design. Memory: `feedback_ground_mockups_in_existing_design.md`. Extends Rule F (Triangle — look at the real thing first) into the mockup-authoring step.

### T. Atomic read-modify-write for concurrent-mutation-prone Firestore docs (iron-clad 2026-06-02, after V147+V148 concurrency saga)

Any read-modify-write of a Firestore doc that MULTIPLE flows can mutate concurrently — `be_customers.courses[]`, stock batches (`be_stock_batches`), INV/HN counters, appointment slots — MUST be atomic. A plain `getDoc → updateDoc/updateCustomer` or `getDoc → writeBatch` on such a doc is **FORBIDDEN**: two concurrent callers read the same state, last write wins → a use/buy/deduction/reverse is silently LOST (course over-credit / stock over-deduct), OR a stale-plan race throws a cryptic save failure.

**Required patterns**:
- **Single-doc RMW** (a course array, one batch, a counter) → `runTransaction(tx.get(ref) → mutate in place → tx.update(ref))`. Firestore OCC serializes; the loser aborts + auto-retries against the re-read state → applies on top, never lost. Canonical helper for customer courses = `_mutateCustomerCoursesAtomic` (V148, `backendClient.js`); multi-field/filter writers use an inline `runTransaction` with `tx.get` of the doc.
- **Multi-doc / set-read RMW** (multi-batch FIFO allocation, where the candidate SET must be queried OUTSIDE the tx) → the per-item tx MUST re-verify inside the tx AND, on a contention/race throw, **RE-FETCH + RE-PLAN** (bounded retry) rather than propagate a stale-plan race as a save failure. Canonical = `_deductOneItem` retry loop (V147, transient throws tagged `STOCK_RACE_RETRY`).
- **A user-thrown error inside a Firestore tx is NOT auto-retried** (only commit-time contention is). So a stale-plan guard that throws must be caught + re-planned by your OWN bounded retry loop — never let it fail the user's save when the app's purpose is "always succeed" (e.g. Phase 15.7 negative-stock).

**Verify (Rule Q)**: every confirmed concurrency fix needs a REAL-PROD L2 e2e firing the concurrent pair via `Promise.allSettled` + asserting conservation / no-lost-update / no-spurious-failure (mocks CANNOT expose a race). Templates: `scripts/e2e-stock-concurrency-race.mjs`, `scripts/e2e-course-deduct-concurrency.mjs`, `scripts/e2e-course-mutation-concurrency.mjs`.

**Origin**: V147 (concurrent treatment/sale stock deduction → one save failed with "Batch X raced", violating Phase 15.7 "ตัดได้เสมอ"; 6/6 rounds on real prod) + V148 (5 concurrent course uses applied as 1 → course over-credited; 6/6 rounds) + V149 (concurrent loyalty-points earn/deduct lost-updated `finance.loyaltyPoints` → points lost / over-credited; 6/6 rounds). All three were `getDoc → write` with NO tx. The codebase's OTHER money paths were already atomic in prior sessions (WALLET = M5 `runTransaction`; DEPOSITS = M1 `applyDepositToSale runTransaction`+idempotency; INV/HN counters = `runTransaction`) — stock/courses/points were the missed instances, now closed. Audits: AV177 (courses) + AV178 (points) + audit-stock-flow S32 (stock). **Known residual (negligible, Rule Q-honest)**: `renewMembership` does a `renewals[]` array RMW outside a tx, but membership renewal is manual/annual (effectively zero concurrency) + not a balance → left as-is. User loop directive 2026-06-02: "ระบบ Stock สำคัญมากๆ ... วนลูปจนไม่เจอบั๊ค".

### Anti-patterns (all 4 rules)
- Fix bug แต่ไม่เพิ่ม test + skill → regression guaranteed
- Skill ไม่มี grep patterns / invariant numbers → documentation ไม่ใช่ audit
- Parallel rule files แก้ขนานกัน → edit THIS file แทน

### Enforcement
- Audit: `/audit-anti-vibe-code` (AV1–AV12, อยู่ใน `/audit-all`)
- Project rule: this file
- User memory mirrors: `feedback_continuous_improvement.md` + `feedback_anti_vibe_code.md` (don't let diverge)

### Rule P — Class-of-bug expansion at every bug discovery (added 2026-05-08, after V42-V49 saga)

User directive (verbatim, 2026-05-08): "ถ้า Test แล้วเจอ Failed อย่าแก้แค่ failed นั้นๆ
แล้วจบ ให้เอา failed นั้นมาขยายผล และหาสิ่งที่เป็นไปได้ที่คล้ายๆกันเพื่อขยายผลการ
หาบั๊คที่คล้ายๆกันหรือต่อเนื่องกันในจุดอื่นๆของโปรเจ็ค และเทสจนจบ แก้บั๊คจนหมด
ถึงหยุด test และหยุดทำงานได้".

When ANY bug surfaces — test red / user-reported / claude-noticed / audit-red — the fix
workflow MUST follow this 7-step expansion discipline. Quick fix-and-ship of a single
instance is **FORBIDDEN**.

#### Trigger scope (broad)

- **Test red**: any `npm test` / `npm run test:e2e` / focused vitest fail
- **User-reported**: chat repro ("ไม่ตัดสต็อค" / "ไม่ขึ้น" / "เด้งจอดำ" / image)
- **Claude-noticed**: spotting a pattern during code-read / refactor / inspection
- **Audit-red**: any `/audit-*` skill flagging an invariant violation

#### Trigger discrimination (strict)

- No exception for TDD / WIP / mid-refactor reds
- Pre-existing-known reds tracked separately in SESSION_HANDOFF "known failures" list
  (deferred but flagged — not exempt from Rule P, just temporarily parked)
- "Expected red" is rationalization; treat every red as a real signal

#### The 7-step expansion discipline

1. **Diagnose root cause** — understand the broken contract / pattern. Pure investigation;
   NO fix proposal yet.

2. **Classify class-of-bug** — match against existing AV1-AVxx in
   `audit-anti-vibe-code` SKILL.md OR name a new class. Common classes (post-V50 baseline):

   | Class | V-entry origin | AVxx |
   |-------|----------------|------|
   | Multi-reader-sweep (shape change broke other readers) | V12 | (uses pre-AV20 cluster) |
   | Source-grep lock-in (test asserts broken behavior) | V21 | (uses pre-AV20 cluster) |
   | Multi-call-site (one fix site, sibling broken) | V36-quater | (uses pre-AV20 cluster) |
   | Staff/Doctor hide-from-lists (lookup-map opt-in) | V41 | AV20 |
   | Promotion bundle qty multiplier | V42 | (no own AV — folded into AV21-AV23 cluster; CB-5 sanctioned exception) |
   | Skip-stock-deduction overlay | V43 | AV21 |
   | Buy-fetcher canonical-mapper-bypass | V44 | AV22 |
   | Dedup-shadow OR-merge | V45 | AV23 |
   | Rule O productName live-resolve | V46 | AV24 |
   | Display-layer multi-reader-sweep | V47 | AV25 |
   | Rule O universal extension | V48 | AV26 |
   | Canonical-shape-mapper multi-reader-sweep | V49 | AV27 |
   | No-broker-imports-post-strip | V50 | AV28 |

3. **Cross-file grep** — find ALL instances of the same broken pattern PROJECT-WIDE
   (not just same file). Examples:
   ```bash
   # V12 spread-order class:
   grep -rn '{ id: d\.id, \.\.\.d\.data() }' src/lib/

   # V46 denormalization class:
   grep -rn 'productName: <doc>\.productName' src/lib/

   # V49 canonical-shape class:
   grep -rn 'list\(Courses\|Products\|Promotions\)(' src/components/backend/ | \
     grep -v ForPicker
   ```

4. **Fix all in single batch** — single commit fixes every match. Partial fix is forbidden.
   "Single fix" = single ROOT-CAUSE-ADDRESSING fix; spans all class instances. ONE
   class-of-bug at a time (not multiple unrelated). No "while I'm here" improvements
   OUTSIDE the class.

5. **Source-grep regression test** — `tests/<area>-<class>.test.js` locks post-fix shape.
   Future drift fails build. Test must:
   - Assert post-fix shape exists at every fixed callsite
   - Assert PRE-fix bug shape DOES NOT exist (regression guard)
   - Assert sanctioned exceptions are explicitly tagged (not silent skips)

6. **AVxx invariant** — add entry to `audit-anti-vibe-code` SKILL.md OR relevant audit
   skill (audit-stock-flow, audit-money-flow, etc.). Permanent grep guard. Each AV entry must include:
   - Description (1-2 lines)
   - Grep pattern
   - Sanctioned exceptions list
   - Cross-link to test file

7. **Iron-clad rule escalation when architectural** — IF the class is architectural
   (denormalization → live-resolve like Rule O; ID-vs-name confusion → live-resolve;
   secret-leak class → architectural rule), file:
   - (a) NEW iron-clad rule letter (next available after current set)
   - (b) V-entry in `.claude/rules/00-session-start.md` § 2 with verbose lessons archive
     in `.claude/rules/v-log-archive.md`
   - (c) MEMORY.md cross-link if user-level (e.g. new `feedback_*.md`)

   **Threshold for "architectural"**: pattern affects ≥3 sub-systems (e.g. stock + sale
   + treatment), or fixing one instance requires changing the WRITE-TIME contract (not
   just READ-TIME), or pattern returns across multiple V-entries (saga signal).

#### Stop condition (Tier 2 default)

- **Tier 1 (always)**: regression test (Step 5) + AV invariant (Step 6) lands in commit
- **Tier 2 (always)**: + classifier doc / classifier test that enumerates all instances +
  sanctioned categories (V49 CAT8 universal classifier pattern). Auditable trail.
- **Tier 3 (architectural-only)**: + V-entry + iron-clad rule entry (Step 7)

The expansion is "**done**" when ALL of:

1. Audit `/audit-class-of-bug-discipline` reports green for the new AVxx + classifier doc
2. Cross-file grep shows zero remaining unfixed instances
3. Originally-failing tests + the new regression test ALL go green
4. Full `npm test -- --run` green (Rule N implicit override at end of expansion)

#### Interaction with other rules

- **Rule N** (targeted-test-only): Rule N permits targeted runs for small bugfixes.
  **Rule P expansion REQUIRES a full `npm test -- --run` AT THE END** to verify no other
  tests turned red. Targeted runs OK during the fix iterations; full run mandatory before
  claiming done. **Rule N implicit override at expansion end.**
- **Rule D** (continuous improvement): Rule D says "fix + adversarial test + audit
  invariant". Rule P EXTENDS D with explicit cross-file grep + Tier 2 artifacts +
  iron-clad escalation. Rule D = policy; Rule P = operational protocol.
- **Rule I** (full-flow simulate): Rule I mandates flow-simulate at end of every
  sub-phase. When Rule P fires DURING a sub-phase, the flow-simulate test MUST cover
  the class-of-bug expansion path (every instance fixed) — not just the originally-
  surfaced instance.
- **Skill J** (Superpowers Auto-Trigger): `systematic-debugging` invocation MUST include
  Phase 2 Step 5 + Phase 4 Sub-step 6; `verification-before-completion` invocation MUST
  verify Tier 2 artifacts present.

#### Anti-patterns

- ❌ Fix one red, push, "done" — V12/V46-class failure mode
- ❌ Skip class-of-bug grep because "the file in question is small"
- ❌ Add regression test only without AV invariant — drift catcher missing
- ❌ Add AV invariant only without classifier doc — auditable trail missing
- ❌ Skip iron-clad escalation when architectural — V-entry/Rule O lessons unwritten
- ❌ Self-attest "expansion done" without running `/audit-class-of-bug-discipline`
- ❌ "Other instances aren't broken yet, no need to fix preemptively" — same broken
  pattern = latent bugs

#### Lesson lock (V42-V49 saga, 7 rounds)

Each round practiced this discipline ad-hoc. 698 cumulative verification points across 7
V-entries is empirical evidence that this discipline pays for itself. The saga was
ARCHITECTURALLY CLOSED only after Rule O escalation (Tier 3 V46/V48) — proving that
Tier 3 escalation is essential for class-of-bug elimination, not optional polish.

#### Audit + Verify

- **Audit**: `/audit-class-of-bug-discipline` (CB-1..CB-5 invariants).
  Registered in `/audit-all` Tier 1.
- **Verify**: `npm test -- --run tests/audit-class-of-bug-discipline.test.js` —
  must be GREEN pre-deploy.
</important>
