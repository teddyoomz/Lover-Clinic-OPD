# Checkpoint 2026-07-18 — TFP Entry SWR cold-start fix (AV208) — SHIPPED local, NOT deployed

## Summary
User (verbatim): *"หน้า TFP มีการกดเข้าแล้วโหลดหมุนๆค้างกับอินเตอร์เน็ทที่คลินิก พอลองเน็ท 5g แล้ว ก็เร็วขึ้น ...
ช้าหน้าเดียวคือการกดเข้า TFP ... เครื่องที่ช้ามักเป็นเครื่องที่เปิดหน้า TFP บ่อยซ้ำไปซ้ำมา ... แก้ให้หายขาด ...
ถ้าเจอบั๊คใดๆให้ทำ loop bug hunt จนกว่าจะหมดบั๊คแบบไม่แตก agent เกิน 5 ตัวต่อรอบ"*.
`/systematic-debugging` Phase 1 วัดจริงบน LIVE prod จากเครื่องนี้ (เน็ทคลินิกเดียวกัน — user อนุญาต) →
`/brainstorming` (Q1=ก / Q2=A / Q3=A) → spec → plan → `/executing-plans` inline → bug-hunt loop R1→R3 converged.

## Root cause (3 ชั้น — ทุกชั้นมีตัวเลขวัดจริง)
1. **TFP หลุดจาก AV206 SWR sweep** (ไม่อยู่ทั้ง ADOPT/SANCTIONED — classifier เช็คเฉพาะไฟล์ที่ประกาศ)
   → หน้า staff เดียวที่ first paint ผูก network 100%: ดึง products(354)+courses(239)+doctors+staff+
   dfGroups+dfRates ≈ **600 docs / 520-630KB จาก server ทุกการเปิด**.
2. **Working set ~17.6MB raw ≈ ~44MB IDB ชนเพดาน cache default 40MB** → เครื่องใช้หนักทั้งวัน
   LRU-evict TFP query targets → เปิดซ้ำ = cold pull เต็ม (ตรงกับ "เครื่องที่เปิดบ่อย = ช้า").
3. **WiFi คลินิกเป็นตัวคูณ**: cold 2.4s (เน็ทดี) / 7.2s (1.5Mbps/200ms) / 23.8s (0.4Mbps/500ms);
   warm (resume-token delta ~4KB) ≤3.2s เสมอ. Congestion+loss จริง → 30-60s+ = "หมุนๆค้าง".
- **ไม่ใช่ IP block** (เครื่องนี้ IP เดียวกันเร็ว; Firestore ไม่มีกลไกนั้น) · **ไม่ใช่ cookie** (IDB ไม่ใช่ cookie;
  การล้าง cache/temp ยิ่งแย่ = บังคับ cold pull).

## Shipped (10 commits, pushed; rules UNCHANGED → deploy รอบหน้า = vercel-only)
1. **T1-T2**: `_getDocBySource` + `{source:'cache'}` บน listDfGroups/listDfStaffRates/getCustomer/getTreatment
   (+`_tagCache`) · `cacheSizeBytes: 200MB` ใน firebase.js.
2. **T3-T4**: TFP load effect → swrRun 2-pass — `fetchFormData` (fetch-only + 3 cache-MISS gates) +
   `applyFormData` (verbatim-move + hydration/prefill-once) + SyncIndicator chip + save-gate
   `serverFreshRef` bounded 15s ใน handleSubmit.
3. **T6**: `tfpPrefetch.js` idle-warm 6 listers ที่ BackendDashboard + AdminDashboard (once/session).
4. **T7**: AV208 full-scan classifier (ทุก `Promise.all([list*` ใน src/components+pages ต้อง classified;
   จับ 8 ไฟล์ unclassified ตั้งแต่รันแรก; prove-red ✓) + swr-inventory + AV208 SKILL.md ×2 (SY1 ✓).
5. **Bug-hunt loop (T10)**: R1 (5 lenses) → 4 confirmed fixed · R2 (2 agents โจมตี R1 fixes) → 4 hardenings ·
   R3 → **0 confirmed = CONVERGED**. รายละเอียดใน V-entry + commit messages (R1/R2 commits).

## Verification (Rule Q)
- Full vitest **17,631/17,631 · 0 fail** (definitive json run) + AV208 bank 76/0 + build clean.
- **L1 adversarial 5/5 บน local build vs REAL prod Firestore**: typing ระหว่าง sync window ไม่โดน server ทับ ·
  กด save ตอน chip ยังโชว์ → gate อั้น → doc ถูกต้อง (TEST fixture, cleanup pristine) · Q-vis screenshots eyeballed.
- **Probes** (committed `scripts/diag-tfp-*.mjs`): TFP reopen ดึง Firestore **4-18KB** (เดิม ~630KB);
  spinner window ~0.5-2s แม้ throttle 400kbps/500ms; cold-open ยังทำงานถูก (MISS → server paint).
- 4 V21 repoints (persistentLocalCache literal ×2, includeHidden trailing-opts, TAB slice windows).

## Honest gaps / watchlist
- **User L1 บนเครื่องคลินิกที่ช้าจริง = acceptance สุดท้าย** (หลัง deploy) — คาด: เปิด TFP ≤1-2s ทุกเครื่อง;
  เครื่อง cache เย็นจะเร็วตั้งแต่ครั้งที่ 2 (+prefetch อุ่นให้ตั้งแต่เปิด shell).
- Half-dead-network hang = pre-AV208 parity (autoDetectLongPolling คุมชั้น global; TFP resilient-timeout = backlog).
- Positional-rowId TOCTOU (courses[] identity) = pre-existing class — backlog/watchlist.
- Server-pass lister transient throw → degrade เป็น empty list (pre-AV208 `.catch(()=>[])` semantics เดิม; reach = permission/index เท่านั้น).
- `canPersist` misclassify (Firefox/old-Safari private) = pre-existing soft (degraded persistence เฉยๆ).

## Next Todo
1. **User สั่ง "deploy"** → vercel-only (rules UNCHANGED) → re-run probes บน PROD + user L1 บนเครื่องคลินิกช้าจริง
   (เปิด TFP ซ้ำๆ + ดู chip ⟳ + เข้า 5G เทียบ) + มือถือ.
2. Backlog: TFP resilient-timeout (half-dead) · positional-rowId identity · doctorName '' on filtered-doctor save.

## Resume Prompt
Resume LoverClinic — 2026-07-18. TFP Entry SWR cold-start fix (AV208) SHIPPED local (master, 10 commits pushed,
NOT deployed — รอ "deploy"; rules UNCHANGED → vercel-only). Root cause = TFP หลุด AV206 sweep (600-doc server pull
ทุกการเปิด) + cache 40MB eviction + WiFi แย่. Fix = swrRun 2-pass + 200MB + prefetch + AV208 classifier.
Bug-hunt R1(4 fixed)→R2(4 hardenings)→R3(0)=converged. Full vitest 17,631/0 + L1 5/5. Read CLAUDE.md →
SESSION_HANDOFF.md → .agents/active.md → 00-session-start.md → this checkpoint.
