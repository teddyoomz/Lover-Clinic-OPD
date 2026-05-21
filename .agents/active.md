---
updated_at: "2026-05-21 EOD+1 LATE+1 — Tablet Chart more-tools: ALL 3 symptoms FIXED + verified via full-relay Playwright e2e (template renders + pen+rect draw + save 123KB PNG→PC). storage.rules json fix awaits deploy."
status: "more-tools complete; 2 post-ship bugs fixed (init-once + storage.rules/onSave save); full-relay e2e GREEN on real prod; full vitest 13929/0; NOT deployed — awaiting 'deploy' (vercel + storage.rules Probe-Deploy-Probe)"
branch: "master"
last_commit: "fix(tablet-chart): SAVE — storage.rules denied result.json client upload → save threw; allow json + non-fatal json upload + visible save error; full-relay e2e"
tests: "full vitest GREEN (13929/0) · build clean · full-relay Playwright e2e GREEN (real prod, trusted events)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "d750c725 — ratio fix LIVE. more-tools + 2 post-ship fixes (~16 commits) NOT deployed."
firestore_rules_version: "be_chart_* unchanged. storage.rules: NEW uploads/chart-edit-sessions match allows application/json — NEEDS `firebase deploy --only storage` (Probe-Deploy-Probe #13)."
---

# Active Context

## State — ALL 3 user symptoms FIXED + verified e2e (real prod, trusted events)
The user's on-device L1 found the more-tools editor broken (template ไม่ขึ้น / วาดไม่ติด / กดบันทึกไม่ได้). `/systematic-debugging` × 2 rounds → **2 distinct root causes**, both fixed + proven by a **full-relay Playwright e2e** (`tests/e2e/tablet-chart-more-tools-relay.spec.js`): admin-SDK PC uploads the real face-male.svg → authed Playwright tablet pops → draws with TRUSTED mouse → save → PC reads result.
- **Bug 1 (init re-init destroyed the canvas)** → fixed: init ONCE + template on the live canvas. e2e: **template renders (205 px), pen draws (52 px), rect draws (52→164 px)**.
- **Bug 2 (save) — storage.rules denied result.json (application/json) client upload** → `uploadTransportJson` threw → onSave rejected → silent fail. (Admin-SDK L2 e2e missed it — admin bypasses rules; V66 blind spot 3rd time.) Fixed: storage.rules allows json for the chart path + onSave makes the json upload **non-fatal** (PNG always saves) + visible save error. e2e: **save works — 123KB PNG (template+pen+rect) → PC**.
- json (lossless re-edit) gracefully deferred until storage.rules deploys.

## Lesson (V66, reinforced)
Ref-inspection ("exportDataUrl returns a string") is NOT verification. Only a real user-flow e2e proves a relay feature. **Any client upload/relay feature needs a CLIENT-SDK or real-browser e2e — admin-SDK e2e can't see rule denials.**

## Next action
- **DEPLOY** (user-triggered): `vercel --prod` (more-tools + both fixes — makes template/draw/save work; ~16 commits) **+** `firebase deploy --only storage` (storage.rules → enables the lossless json; **Probe-Deploy-Probe** #13: anon write to `uploads/chart-edit-sessions/...` → 403, staff json write → 200). [⚠ CLI 15.x: `--only storage`, NOT `storage:rules`.]
- After deploy: user on-device re-test on the iPad → template shows + draw each tool + save → PC merges. Then re-run the relay e2e → STEP6 should now verify the json carries Image+Path.

## Outstanding user-triggered
- **deploy** (vercel + storage.rules, Probe-Deploy-Probe).
- on-device re-test (iPad).
- (carryover) V106 cron 03:30 BKK first drain; calendar-density / Recall / V108 list-visual L1.
