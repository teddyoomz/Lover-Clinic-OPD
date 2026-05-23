---
updated_at: "2026-05-23 EOD+1 LATE+5 — V118 Card-Level OPD Lifecycle Row LOCAL"
status: "V115+V116+V116-followup LIVE on prod @ 3612d8ae. V117 lightbox-portal + V118 card-OPD-row SHIPPED local — awaiting deploy authorization."
branch: "master"
last_commit: "feat(opd-card): V118 — Card-level OPD lifecycle row [AV118]"
tests: "V118 self 83/83 · V87+V116 sibling 32/32 · full vitest 14438/14438 GREEN · build clean 2.81s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "3612d8ae (V115+V116+V116-followup LIVE) · office-to-pdf-00007-tfb (Cloud Run V110-bis)"
firestore_rules_version: "unchanged (V118 client-only)"
---

# Active Context

## State
- **V118 LOCAL** — Card-level OPD lifecycle row pushed to master. Admin can now drive ✏️ link send/view + 🩺 OPD save/view from every appointment Card in the Frontend นัดหมาย tab without leaving for the OPD sub-tabs.
- **V117 LOCAL** — Lightbox createPortal mandate (5 fullscreen lightboxes) — still pending deploy.
- **V116 LIVE on prod** — Link survives queue-delete + auto-regen + un-hide on re-engage.

## What this session shipped (V118)
- 5-state visibility model: A (has HN) / B (no link) / C (link sent, waiting) / D (filled, REVIEW + SAVE) / E (saved transient → A).
- `src/lib/opdSessionState.js` — pure helpers (`isOpdSessionSaved`, `hasPatientData`, `resolveCardOpdState`, `synthesizeSessionFromCustomer`). AV118 sole sanctioned home.
- `src/components/admin/OpdLifecycleRow.jsx` — presentational 5-state row (3 buttons in State D: 🟢 ดูลิ้งค์ + 🟢 ดูข้อมูล review + 🔴 บันทึก).
- `AppointmentHubRowCard.jsx` — embed row between status pill and existing action row + 📥 ready-to-save chip near HN.
- `AppointmentHubView.jsx` — per-row state derivation + customersById Map for synth-session fallback when State A has no linkedOpdSessionId.
- `AdminDashboard.jsx` — `sessionsById` memo spanning 5 session state arrays + `lazyFetchedSessionsRef` for ก่อนหน้า sub-tab + 3 handlers (handleSendOrViewOpdLink, handleSaveOpdFromCard wraps handleOpdClick, viewing via setViewingSession). `SendCustomerLinkModal` mounted at root. 3 destructive viewingSession-modal buttons gated on `!viewingSession.__synthetic`.
- AV118 invariant — every OPD-save-state derivation in src/ MUST go through opdSessionState helpers (closed sanctioned-list of 4).
- 78 V118 tests across 4 files + 2 V21 fixups absorbed (phase-22-0b + phase-24-0-quinquiesdecies — locked older import-shape and gating-regex; updated with V118 marker comments).
- Spec + plan HTML written with Mockup + Flow sections (mandatory per 2026-05-19/20 directive).

## Next action
1. **User authorizes deploy** → `vercel --prod` (client-only — no rules/indexes/Cloud Run change, no Probe-Deploy-Probe needed). Optionally combine V117+V118 into one deploy.
2. **User Rule Q L1 hands-on post-deploy**:
   - Frontend นัดหมาย tab → State A card (has HN) → click 🟢 ดูข้อมูล OPD → modal renders synth-session view with customer's patientData.
   - State B card (no HN, no link) → click 🔵 ส่งลิ้งค์ → SendCustomerLinkModal opens → URL + QR display.
   - State D card (after customer fills via QR) → click 🟢 ดูข้อมูล (review) → modal opens → close → click 🔴 บันทึก → toast "บันทึก OPD สำเร็จ" → card transitions to State A.
   - ก่อนหน้า sub-tab cards (past month) → first render ⏳ briefly while lazy-fetch resolves → final state correct.
   - ยกเลิก sub-tab → no OPD lifecycle row visible.

## Outstanding user-triggered actions
- V117 + V118 deploy authorization (when ready).
- Post-deploy iPhone/desktop L1 hands-on (V118 acceptance scenarios above + V117 mobile lightbox scenarios).

## Notes
- V18 deploy authorization never carries forward — every "deploy" verb is per-turn.
- V118 preserved V87/AV84 (patient-link trigger closed list of 2) + V116/AV116 (link survives queue-delete + un-hide) — no regression.
- Phase 17.1 RTL test continues to be a known full-suite flake under load (isolated runs always pass).
