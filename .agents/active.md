---
updated_at: "2026-07-07 EOD+2 — Instant Cold-Start (AV206+AV207) SHIPPED + DEPLOYED LIVE (ships AV205 too)."
status: "master = prod. Awaiting user L1 (มือถือ/iPad จริง) for BOTH instant-coldstart + AV205 scroll-lock."
branch: "master"
last_commit: "aff4d496 docs: EOD+2 instant cold-start V-entry + handoff/active/checkpoint"
tests: "full vitest 17,485/17,486 (1 = phase15.5b flake เดิม, 51/0 isolated) + Playwright L1 4/4 on LIVE prod + AV206 classifier 18/0 + SW config 8/0. Build clean. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "2cf71bdc (= master code; deploy 2026-07-07 EOD+2 รวม AV205 + instant-coldstart)"
firestore_rules_version: "UNCHANGED — vercel-only deploy, no Probe-Deploy-Probe"
---

# Active — 2026-07-07 EOD+2 — Instant Cold-Start (AV206+AV207)

## State
- master `aff4d496` = prod LIVE (alias 200; sw.js no-cache header live). rules UNCHANGED.
- User pain (วีดีโอ): PWA เปิดหลังเว้นนาน → นัด hub โหลด 7-10+วิ → แก้แล้ว, วัดจริง 1736→566ms (−67%).
- Q1=A SWR staff + ลูกค้า fresh-gate (REVERSES 2026-06-16 fresh-always เฉพาะฝั่ง staff).

## What this session shipped
- Layer 0: `persistentLocalCache` + multi-tab + IDB-detect + `storage.persist()` (listener SWR ฟรีทั้งแอป)
- Layer 1: NEW `freshGate.js` — PatientForm+ClinicSchedule ลูกค้าไม่มีวันเห็น cache
- Layer 2-3: NEW `swrRead.js` + `{source:'cache'}` 16 getters + `__fromCache` honesty · hub 2 จังหวะ
  + `SyncIndicator` + chip skeleton · sweep 12 staff tabs (`docs/perf/swr-inventory.md` closed list)
- SW: vite-plugin-pwa shell precache + /assets CacheFirst, ห้าม /api+googleapis, update toast,
  kill-switch, FCM → dedicated scope (AV207)
- L1 จับบั๊คจริง 2: indicator โกหกตอนเน็ตตาย + S4 SW 'activating' race (prod-only)
- AV206+AV207 both SKILL.md (SY1) · perf report `docs/perf/instant-coldstart-report.md`
- Detail → checkpoint `.agents/sessions/2026-07-07-instant-coldstart.md`

## Next action
- **User L1 มือถือ/iPad จริง**: ① เปิดแอปหลังทิ้งนาน → นัด ขึ้นทันที + "กำลังซิงค์…" แว๊บ
  ② modal scroll (AV205) ③ ลิงก์ลูกค้าสด/เร็วปกติ ④ push ยังเข้า (FCM re-scope self-heals).

## Outstanding user-triggered actions
- (none — prod = master)
