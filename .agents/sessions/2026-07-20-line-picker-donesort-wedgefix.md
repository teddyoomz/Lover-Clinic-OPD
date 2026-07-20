# Checkpoint 2026-07-20 NIGHT — LINE Friend Picker (AV213) + done-sort + mobile wedge fix (AV214) — ALL DEPLOYED

## Summary
Brainstorm→spec→plan→execute 2 features แล้ว deploy combined (rules เปลี่ยนครั้งแรกตั้งแต่ 06-16):
① LINE Friend Picker — เลือก userId จากรายชื่อเพื่อน real-time (แอด/ทักปุ๊ปโผล่ปั๊บ) ใช้ 2 ที่
(การ์ดสุขภาพ lineTargets + ผูกลูกค้าใน LinkLineInstructionsModal) ② วันนี้·เสร็จแล้ว เรียงคนกดล่าสุดบนสุด.
จากนั้น /systematic-debugging บั๊คมือถือค้าง (retry ไม่หาย ต้องฆ่าแอป) → AV214 wedge-escalation → deploy รอบ 2.

## Current State
- prod = `lover-clinic-o1abzsdk8` aliased lover-clinic-app.vercel.app 200 (master `31d67b68`+)
- rules DEPLOYED: `be_line_friends` read=staff/write=deny + **Rule B probe #20** (full probe set green pre+post;
  probe5 403 หนึ่งจังหวะ = harness token artifact — พิสูจน์ด้วย body-level rerun 200/200 ก่อนตัดสิน ไม่ revert มั่ว)
- **Korat roster PRE-SEEDED 2,087/2,087** — OA โคราช = VERIFIED (Followers API ok; ชื่อ 100%, รูป 97%;
  idempotent rerun 0 writes; `scripts/diag-line-friends-backfill.mjs --branch BR-xxx` สำหรับสาขาอื่น)
- Full vitest exit-0 ×2 วันนี้ (319s/324s) + ~119 เทสใหม่ 0 fail + build clean
- AV213 + AV214 ทั้ง 2 SKILL copies (SY1 byte-identical)

## Feature ① architecture (AV213)
- Webhook `api/webhook/line.js`: follow/unfollow → `be_line_friends/{branchId}_{userId}` (best-effort,
  return ก่อน chat path เสมอ, resolveChatFallbackBranchId per V78 lesson); pure decision =
  `src/lib/lineFriendRoster.js` (decideFollowEventUpdate/mergeFriendRoster/searchRoster — shared client+server)
- `/api/admin/line-friends`: `list` = Followers-API backfill (403 unverified → 'unavailable' ไม่ error;
  unknown-only profile resolve, mapWithConcurrency 10, cap 300, cache 60s/branch; เขียนกลับ be_line_friends →
  listener คือ render path เดียว) · `bind` = mirror link-requests handleApprove byte-for-byte (collision guard →
  Thai error ศูนย์ write; batch: lineUserId + lineLinkedAt + lineUserId_byBranch.{bid} dotted + audit doc
  `line-friend-bind-*` source:'friend-picker' + push best-effort)
- `LineFriendPickerModal.jsx` (shared ตัวเดียว 2 surfaces — กัน V12 drift): 2 onSnapshot listeners
  (`listenToLineFriendsByBranch` BS-13 equality-only NO orderBy + chat conversations listener) + backfill
  trigger once/open+branch + search + AV78 + scroll-lock; bind mode = confirm-first, parent ยิง endpoint
- **บั๊คที่ post-deploy e2e จับสด**: legacy-token fallback → backfill ติด branchId ผิด (300 docs pollution บน
  TEST branch) → guard `source==='be_line_configs' OR (chat_config AND branchId===fallback)` + sweep + E1.3 lock

## Feature ② (done-sort)
- `sortApptsByServiceCompletedDesc` + `svcCompletedMs` (timestamp-shape-safe) ใน appointmentHubFilters.js;
  HubView ใช้เฉพาะ `activeTab==='today' && todaySubPill==='completed'` — 3 branch เดิมคงเดิม (collateral 697/0)

## AV214 — mobile wedged-client escalation (บั๊คmูือถือค้าง)
- Evidence chain: beacon log EMPTY = silent hang (ไม่ใช่ crash) → iOS freeze แท็บถือ primary lease
  (multi-tab persistence) → ทุก Firestore op ค้างรวม cache → `reconnectFirestore` await ไม่ settle →
  `toggling` latch ค้างถาวร → heal ทุกเส้น (V17/auto-retry/manual/branch-aware/TFP — latch เดียว) no-op
- Fix: timebox 4s (latch เคลียร์เสมอ) + wedge marker + `[conn-wedge]` telemetry · `retry()` press#1 =
  reconnect ทันที; wedged/press-after-fail = `hardReloadApp()` (user-initiated only) · markReady reset ladder
- **Harness lesson (4 รอบ)**: IDB absent/empty จำลองไม่ได้ (cache ตอบทันที → markReady กลบ banner);
  faithful wedge = IDB open() "ไม่ตอบ" เฉพาะชื่อ firestore* + branch inject (BS-13 no-branch = [] ทันที)
- L1 บน LIVE bundle: banner replica ตรงรูป user ทุกพิกเซล → กดลองใหม่ → reload จริง PASS

## Verification (Rule Q)
- L2 `scripts/e2e-line-friends-realtime.mjs`: pre-rules 16/0 → **--full 20/0 หลัง rules deploy**
  (client listener realtime 173ms · read ALLOWED/write DENIED · live HTTP 200/401 · zero-orphan sweep)
- L1 Playwright: picker (conv seed กลาง modal โผล่สด + friend-leg หลัง rules live) · done-sort
  (กด B→A→C จริง → C,A,B) · wedge-ladder — Q-vis screenshots ดูด้วยตาทุกใบ
- Probe-Deploy-Probe เต็ม: 403-set 9/9 + anon path 200/200 + probe #20; probe docs cleaned

## Commits
```
57 tasks → ~20 commits: spec/plan · roster lib · done-sort · webhook follow · rules+matrix+probe20 ·
listener BSA · endpoint · picker modal · integrations ·flow-simulate · L2 e2e · L1 specs · AV213 ·
backfill diag+2087 · pollution guard fix · AV214 wedge fix · active.md ×3
head = 31d67b68
```

## Next Todo
1. User L1: เปิด picker → ค้นชื่อเจ้าของ → ผูก target → "ทดสอบแจ้งเตือน" (ปิด backlog LINE alert เดิมด้วย)
2. User L1: แอดเพื่อน OA จากมือถือจริง → ชื่อโผล่ใน picker (follow-event เต็มทางจาก LINE จริง — ชิ้นเดียวที่เหลือ)
3. มือถือ: สังเกต 1-2 วัน — ค้างอีก = กดลองใหม่ ≤2 ครั้งต้องหาย + การ์ดสุขภาพนับ `[conn-wedge]`
   (ถี่มาก → พิจารณา tab-manager ฝั่งมือถือเป็น architectural ขั้นถัดไป — ตัดสินด้วย telemetry ไม่เดา)
4. พรุ่งนี้หลัง 07:30: `node scripts/diag-infra-health.mjs` (health cron sweep ใหม่รอบแรก)
5. ค้างเดิม: desktop toast Windows · laptop 10 ปี TFP ratchet · standing L1 stack
