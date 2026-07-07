---
updated_at: "2026-07-07 EOD — link-patient LCP fix + customer-link header strip + configurable LINE link keywords — ALL DEPLOYED LIVE."
status: "DEPLOYED. master 92b9ba15 = prod (lover-clinic-app.vercel.app). Awaiting user L1 hands-on only."
branch: "master"
last_commit: "92b9ba15 perf(measure): live prod link-patient after-lcpfix"
tests: "full vitest 17336/17336 · 0 fail (definitive json run this session; a 1-fail was a parallel flake). Build clean. Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "92b9ba15 (vercel lover-clinic-y5fpano5s, HTTP 200, live-verified)"
firestore_rules_version: "UNCHANGED all session → frontend+api deploy only, NO Probe-Deploy-Probe"
---

# Active — 2026-07-07 EOD — 3 ships deployed + live-verified

## State
- master = prod, everything live-verified (L1 real browser on the deployed URL + L2 payload-identical).
- link-patient LCP: local 3780→2040ms (−46%) · **LIVE prod 3472→2212ms (−36%)** — AV204, entry-time early fetch.
- Customer-link page: "ข้อมูลลูกค้า"/"Customer Info", no avatar, no HN (UI + API payload) — LIVE.

## What this session shipped
- **link-patient LCP (AV204)**: early fetch in main.jsx (consume-once, retry loop untouched) + endpoint
  branch-gets Promise.all + NARROW /api/patient-view vite proxy (measurable/devable locally) — 2-agent
  adversarial review: warm-import module-map poisoning REMOVED · B6 lock made structural. Probe 24/24 ·
  parity 0.000% · DISABLED-branch live-tested 11/11 (TEST fixture, pristine cleanup).
- **Customer-link header strip** (Q1=B): centered name+phone card · TX th/en · hn stripped from
  /api/patient-view payload (field-minimization) · L1 live 5/5 + screenshots eyeballed.
- **Configurable LINE id-link keywords**: interpretCustomerMessage(text,{idLinkKeywords}) pure layer
  (escape + longest-first; defaults = legacy byte-equivalent) + validate (1-10 คำ, no-space, not-all-digit,
  unique) + webhook 60s-TTL read of NEW doc clinic_settings/link_id_keywords (chat_config is secret-locked)
  + KeywordSettingsCard in LinkRequestsTab + hint follows first keyword. LIVE round-trip 22/22 on real prod.
- 34+17 new tests · 3 V21 repoints (F3 mirror, V33.9 C6, B2/B6) · checkpoint
  `.agents/sessions/2026-07-07-lcpfix-header-keywords.md` · spec/plan docs/superpowers/{specs,plans}/2026-07-07-*.

## Next action
- **User L1 hands-on**: (1) เปิดลิงก์ ?patient= จากมือถือจริง — เร็วขึ้น + หัว "ข้อมูลลูกค้า" ไม่มี HN/avatar;
  (2) LINE จริง: พิมพ์ `link <เลขบัตร>` → เข้าคิวคำขอผูก; เพิ่มคำใหม่ในการ์ด "คำที่ใช้ผูกบัญชี" → พิมพ์คำนั้น → เข้าคิว
  (bot ใช้คำใหม่ภายใน ~1 นาที after save).
- Deferred perf items stay parked in docs/perf/punchlist.md (cold-start ~3.5s option noted).

## Outstanding user-triggered actions
- (none — deployed; L1 feedback only)
