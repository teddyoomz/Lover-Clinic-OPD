---
updated_at: "2026-07-07 EOD+1 — universal modal scroll-lock (AV205) SHIPPED local, NOT deployed."
status: "AV205 complete on master (9 commits ahead of prod 92b9ba15). Awaiting user L1 (นิ้วจริง) + explicit \"deploy\"."
branch: "master"
last_commit: "dc8c232a test(e2e)+fix(css): AV205 L1 trusted-wheel spec 4/4 + layer-3 anti-confinement"
tests: "full vitest 17,427/17,428 (1 fail = phase15.5b flake เดิม, 51/0 isolated; 0 V21 fixups) + hook 9/0 + classifier 83/0 + Playwright L1 4/4. Build clean. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "92b9ba15 (prod ยังไม่มี AV205 — รอ user สั่ง deploy)"
firestore_rules_version: "UNCHANGED — frontend-only change → deploy = vercel only, NO Probe-Deploy-Probe"
---

# Active — 2026-07-07 EOD+1 — AV205 universal modal scroll-lock

## State
- User report: เปิด modal แล้ว scroll นิ้ว/ล้อเมาส์ไปเลื่อน background — แก้ครบทุกที่แล้ว (77 overlay files).
- 3 ชั้น: useModalScrollLock (ref-counted html[data-modal-open]) · backdrop `overflow-y-auto
  overscroll-contain` sweep ~68 ไฟล์ + panel max-h audit · layer-3 anti-confinement
  (`html[data-modal-open] card:has(.fixed){transform:none}` — V86 hover-lift confine ที่จับได้จาก Q-vis).
- Sanctioned (classifier closed list): print views, full-screen editors, dropdowns,
  BackendMobileDrawer (Radix), StaffChatPanel (V82-fix7-bis เดิม).
- Rule Q: Playwright trusted-wheel 4/4 (background frozen / modal scrolls / unlock) + screenshots eyeballed.
- e2e helpers.js goToBackend รองรับ ArcBloom new menu แล้ว (text เดิมหายไป).

## Next action
- **User L1 hands-on**: เปิด modal ตามจุดที่เคยเจอ (backend tabs / TFP / หน้า frontend / มือถือ+iPad นิ้วจริง)
  → scroll บน modal = เลื่อนเนื้อหา modal, background นิ่ง 100%, ปิดแล้วหน้าเลื่อนต่อได้ตำแหน่งเดิม.
- ถ้าโอเค → user พิมพ์ "deploy" (vercel only — rules ไม่เปลี่ยน).

## Outstanding user-triggered actions
- deploy AV205 (9 commits ahead of prod).
