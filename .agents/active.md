---
updated_at: "2026-07-07 EOD+2 — Instant Cold-Start (AV206+AV207) SHIPPED + DEPLOYED LIVE (ships AV205 too)."
status: "master = prod. Awaiting user L1 (มือถือ/iPad จริง) for BOTH instant-coldstart + AV205 scroll-lock."
branch: "master"
last_commit: "2cf71bdc test(e2e): S4 SW-activation race fix — 4/4 on LIVE prod"
tests: "full vitest 17,485/17,486 (1 = phase15.5b flake เดิม, 51/0 isolated) + Playwright L1 4/4 on LIVE prod + AV206 classifier 18/0 + SW config 8/0. Build clean. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "2cf71bdc (= master; deploy 2026-07-07 EOD+2 รวม AV205 + instant-coldstart)"
firestore_rules_version: "UNCHANGED — vercel-only deploy, no Probe-Deploy-Probe"
---

# Active — 2026-07-07 EOD+2 — Instant Cold-Start (AV206+AV207)

## State
- User report (วีดีโอ iPhone PWA): เปิดแอปหลังเว้นนาน → หน้า นัด กำลังโหลด 7-10+วิ → แก้ 5 ชั้น:
  persistentLocalCache (SWR listener ฟรีทั้งแอป) · freshGate ลูกค้า (ไม่มีวันเห็น cache) ·
  swrRead {source:'cache'} 16 getters · hub 2 จังหวะ + SyncIndicator + chip skeleton ·
  sweep 12 staff tabs (inventory closed list) · Service Worker shell (AV207, FCM แยก scope).
- วัดจริง: hub data-on-screen 1736→566ms (−67% desktop); L1 4/4 บน LIVE prod (offline SWR paint /
  server correction / customer fresh-gate / SW offline shell).
- 2 บั๊คที่ L1 จับเอง: __fromCache honesty (network-down getDocs คืน cache เงียบๆ) + S4 SW activating race.
- Deploy ครั้งนี้ ships AV205 modal scroll-lock ด้วย (ค้างจาก EOD+1).

## Next action
- **User L1 hands-on บนมือถือ/iPad จริง**: ① เปิดแอปหลังทิ้งไว้นาน → หน้า นัด ควรขึ้นข้อมูลทันที (<1วิ)
  + จุดเหลือง "กำลังซิงค์…" แว๊บแล้วหาย ② modal scroll (AV205) ③ ลิงก์ลูกค้า ?patient=/?session= ยังสด/เร็วปกติ
  ④ push notification ยังมา (FCM scope ใหม่ — self-heal อัตโนมัติรอบ load แรก).

## Outstanding user-triggered actions
- (none — prod = master)
