# Checkpoint 2026-07-20 (PM) — Machine-Degradation Matrix (AV212): 2 latent crash classes found + closed

> User: mini PC ยังชนการ์ด TFP "การเชื่อมต่อช้ากว่าปกติ" (เครื่องอื่น+มือถือหาย) →
> "เช็คว่ายังเป็นที่ระบบเราหรือเปล่า ... จำลองความห่วยของเครื่องมาทุกรูปแบบให้ครบ
> แล้วให้รู้ว่าโปรแกรมเรา survival ยังแสดงผลได้ดีแบบ god tier". `/systematic-debugging`.
> Mini PC ตัวจริง = BMAX B6 Turbo (i5-8257U / 16GB / SATA SSD) — ไม่ใช่เครื่องอ่อน.

## What happened
Built a 14-cell Playwright+CDP degradation matrix (`tests/e2e/machine-degradation-matrix.spec.js`,
opt-in `E2E_DEGRADE=1`) driving the LIVE prod bundle + real prod Firestore with a TEST- customer:
CPU ×6/×20 · net 1.5Mbps/400kbps/offline · IDB absent/broken/quota-5MB · warm/cold · HELL combo ·
offline-flap recovery · typing latency. Found TWO latent crash classes prod had never yet hit,
plus quantified every survival envelope.

## Matrix numbers (LIVE prod bundle, round 1)
| Cell | entry | card | verdict |
|---|---|---|---|
| M0 control | 1.6s | - | ✅ |
| M1 CPU×6 | 6.0-6.6s | - | ✅ |
| M2 CPU×20 cold | 48-51s | Y | ✅ survives, honest |
| M3 net1.5M cold | 2.6-3.1s | - | ✅ |
| M4 net400k cold | 5.8-6.2s | - | ✅ (เน็ตอย่างเดียวไม่ทำให้ชนการ์ด) |
| M5 warm+net400k | **0.56s** | - | ✅ AV208 สมบูรณ์ |
| M6 no-IDB net1.5M | 1.6-2.7s | - | ✅ |
| M7 IDB-broken | **CRASH** | - | 🔴 → fixed → 12s PASS local |
| M8 quota 5MB | 2.1s | - | ✅ |
| M9 HELL ×20+400k+no-IDB (ทั้ง journey) | **11.9s** | - | ✅ ไม่ชนการ์ดด้วยซ้ำ |
| M10 offline chunk | **CRASH (boundary ทั้งแอป)** | - | 🔴 → fixed → panel+recovery PASS |
| M11 typing @×20 | 88ms/key | - | ✅ TFP#20 works |
| M12 warm+CPU×20 | 35.2s | Y | ✅ — cache ไม่ช่วย CPU |
| M13 warm+×20+net400 | 33.5s | Y | ✅ — เน็ตไม่เพิ่มทับ CPU |

**Insights**: (1) network ไม่ใช่ตัวการ (Firestore wire compression); (2) IDB persistence
คือ cost หลักบนเครื่อง CPU อ่อนมาก (M9 no-IDB 12s < M12 warm-IDB 35s @×20) → **ตัด
bundle-endpoint idea** (ไม่คุ้ม); (3) i5-8257U จริงอยู่แถบ M1-M5 (≤7s) → ถ้ายังชนการ์ด
= cache ไม่ persist (profile/cleaner/quota) หรือ WiFi จุดนั้น → telemetry ใหม่จะตอบเอง.

## 🔴 Crash class #1 (M7): sync-throwing IndexedDB
`open()` throw (โปรไฟล์เสีย/ดิสก์เต็ม/AV) → `FIRESTORE INTERNAL ASSERTION b815` → React ตายทั้งต้น
(SDK fallback รับแค่ async-error). **AV211 beacon จับ stack เอง = คืนทุนใน 1 วัน.**
Fix: `idbHealthy()` pre-flight probe ใน firebase.js (sync-catch ทันที + async onerror stamp
`lover.idbBroken` → โหลดหน้าถัดไป boot memory-cache = self-heal 1 reload) + stickerLibrary guard.

## 🔴 Crash class #2 (M10): offline lazy-chunk fetch
เน็ตหลุด + เปิด lazy view ที่ยังไม่โหลด → React.lazy reject → AppErrorBoundary แทนทั้งแอป
("Failed to fetch dynamically imported module"). React กลืน error → beacon-capture ใน harness
route-block คือที่เดียวที่เห็น message. Fix: `src/lib/lazyRetry.jsx` chokepoint (retry ×2 backoff →
in-place panel `chunk-load-retry` + reload recovery + beacon) — alias `lazyRetry as lazy` ที่
4 host files (App/AdminDashboard/BackendDashboard/FillerSimulator) = **79 callsites ศูนย์แก้**.

## Hardening เพิ่ม
- `swrRun` legs **ขนาน** (swrRead.js): IDB ช้า/ค้างไม่ block server truth; late-cache = no-op
  (ห้าม stale-over-fresh); server error ยัง propagate; A1-A6 execution locks.
- **Staged escape card** (TFP): 15s = "กำลังโหลดต่อ กรุณารออีกสักครู่" (ใจเย็น ไม่มีปุ่ม — ฆ่า
  doom-loop restart ของ pull ที่ 75%) / 30s = ปุ่มลองใหม่ (`loadStuck`, testid `tfp-load-retry-btn`).
- **Telemetry kind:'telemetry'** (ไม่นับใน errorCount24h แต่โชว์ใน health-card viewer):
  `[tfp-slow]` bucketed >10s entry + `[client-env]` เครื่อง degraded (main.jsx 8s deferred).
  sweep เปลี่ยน aggregate→windowed fetch (limit 1200) กัน legacy-doc undercount จาก `!=` query.

## Verified
M7 fix-proof local PASS (12s paint, no crash) · M10 panel→recovery PASS · hardening bank
`tests/machine-degradation-hardening.test.js` 24/0 (รวม F fast-paint locks) · RT repoint 6/0 ·
tfp-entry-swr banks 40/0 (4 fixture repoints — parallel legs ต้องให้ server ช้ากว่า cache
ใน mock) · collateral 98/98 · build + `verify:filler` clean · AV212 both SKILL copies
byte-identical (SY1) · sim-beacon pollution 6 รายการลบจาก prod + harness beacon-capture
route-block กันรอบหน้า.

## FINAL numbers (LOCAL PROD BUNDLE + ทุก fix — 14/14 PASS)
| Cell | ก่อน (prod เดิม) | หลัง (fast-paint + ทุก fix) |
|---|---|---|
| M0 control | 1.6s | **0.58s** |
| M1 CPU×6 | 6.0-6.6s | **1.26s** ✅ ≤5s |
| M2 CPU×20 cold | 48-51s | 35-52s (synthetic สุดขั้ว — honest card; วิ่ง SDK-boot bound) |
| M3 net1.5M cold | 2.6-3.1s | 2.1s ✅ |
| M4 net400 cold | 5.8-6.2s | **2.6-3.7s** ✅ |
| M5 warm+net400 | 0.56s | 0.55s ✅ |
| M6/M7/M8 (no-IDB/broken-IDB/quota) | 2.7s/CRASH/2.1s | **1.2s/1.2s/2.1s** ✅ |
| M9 HELL ทั้ง journey | 11.9s | ~14-17s (net-bound ด้วย — survive + honest) |
| M10 offline chunk | CRASH ทั้งแอป | **panel + recovery 1.6s** ✅ |
| M11 typing @×20 | 88ms/key | 53-106ms/key ✅ |
| M12 warm+×20 | 35.2s | **14.3-17.8s** (-50%) |
| M13 warm+×20+net400 | 33.5s | **14.4-16.7s** (-50%) |

**เป้า ≤5s (เน็ตโอเค)**: ✅ ทุกเงื่อนไขบนเครื่องระดับจริง (i5-8257U ≈ ×2-4 → 0.6-3.8s;
แม้ ×6 ก็ 1.26s; แม้ cold + เน็ต 400kbps ก็ ≤3.7s). ข้อยกเว้นที่รายงานตรงๆ: แถบ synthetic
CPU×20 (อ่อนกว่า mini PC จริง 5-10 เท่า) = 14-52s แบบ survive + การ์ด honest + typing ลื่น.
S4 honesty margin ปรับ 15.5s→18s-from-loading (poll-cycle slack — การ์ดพิสูจน์ทำงานที่ M2).
AV212 sequencing: full pipeline รอ fast-paint (race cap 10s — cap 3s สร้าง starvation ซ้ำ
บนเครื่องที่มันตั้งใจช่วย; timer การ์ด 15s เริ่มก่อน race เสมอ).

## Files
- NEW: `src/lib/lazyRetry.jsx` · `src/lib/envTelemetry.js` · `tests/machine-degradation-hardening.test.js` · `tests/e2e/machine-degradation-matrix.spec.js`
- MOD: `src/firebase.js` (idbHealthy probe + export) · `src/lib/swrRead.js` (parallel legs) ·
  `src/components/TreatmentFormPage.jsx` (staged card + slow beacon) · `src/lib/stickerLibrary.js` ·
  `src/lib/clientErrorCore.js` + `src/lib/errorBeacon.js` (kind) · `api/cron/infra-health-sweep.js` ·
  `src/main.jsx` + 4 lazy hosts · repoints: `tests/tfp-resilient-timeout.test.js` ·
  `tests/instant-coldstart-persistence.test.js` (A1.2) · `tests/client-error-core.test.js` (C5.1)

## ≤5s directive (mid-session user order) + fast-paint
User: "ในกรณีที่เน็ตไม่ได้เป็นปัญหา ผมอยากให้ไม่เกิน 5 วินาทีทุกกรณี ... research ทุกวิธี
optimize ที่ดีที่สุดในโลก". Research ([Firestore best-practices](https://firebase.google.com/docs/firestore/best-practices):
**local cache ไม่มี index — ทุก cache query unpack ทุก doc**; [React useTransition](https://react.dev/reference/react/useTransition))
→ ตัวการคือ 600 docs บน critical path ทั้งที่ first paint ใช้ ~15. **Fix = TFP fast-paint
pre-stage** (AV212 rule 7): CREATE-mode paint จาก doctors+staff+customer เท่านั้น (cache-first,
server fallback) → enrichment 595 docs ตามหลัง chip. ความปลอดภัย: `fullApplied` guard
(late fast-paint = no-op) · save-gate ยัง await full pipeline (เงินไม่เคยอ่าน subset) ·
prefill once-only ทำที่ fast-paint (กัน clobber typing ใน enrichment window) · edit-mode
ไม่แตะ (full blocking เดิม — hydration deps). Pipeline เดิม verbatim ไม่เปลี่ยน 1 บรรทัด.
startTransition ตัดทิ้ง (M11 พิสูจน์ typing 88ms/key อยู่แล้ว — YAGNI + เสถียรก่อน).
Fixture repoints: tfp-entry-swr-flow-simulate 4 เทส (parallel legs ต้องให้ server ช้ากว่า
cache ใน mock เพื่อคง intent "cache paints first") + hardening F1-F6 lock fast-paint.

## Honest gaps
- การ์ด/beacon ตัวจริงบน mini PC = หลัง deploy (ยังไม่ deploy — รอ "deploy") → หลังนั้น
  health card จะโชว์ [tfp-slow]/[client-env] ของเครื่องนั้นเอง = คำตอบ "เครื่องหรือระบบ".
- CPU×20 คือ paranoia band (Atom/Celeron); i5-8257U อยู่ ~×2-4.
- Slow-IDB sim = open-delay proxy (ไม่ wrap transaction reads) — CPU throttle ครอบพฤติกรรมจริงแทน.

## Next
1. Full-matrix local re-run green + full vitest green → commit + push.
2. User สั่ง "deploy" → หลัง deploy: เปิด TFP บน mini PC จริง 1 ครั้ง → ดู health card
   error viewer → จะเห็น [tfp-slow]/[client-env] ระบุสาเหตุเครื่องนั้น.
3. (ยังค้างจากเช้า) user L1 การ์ดสุขภาพระบบ: LINE target + ทดสอบแจ้งเตือน.
