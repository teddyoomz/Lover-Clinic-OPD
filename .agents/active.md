---
updated_at: "2026-06-16 — ED follow-up v2 (confirm card / latest-link-only / round dates + intake-date preserve B) + 🔴 province fix — SHIPPED local, backfill APPLIED, NOT deployed. 16542/0."
status: "Feature complete on master (=origin). NOT deployed (awaiting 'deploy'). Frontend-only — no firestore.rules / CF change. Rule-M backfill (assessmentDate ×154) APPLIED to prod."
branch: "master"
last_commit: "6d3b35fc — feat(ed-followup): R4 consistency — CDV ED box also shows round date + วันนี้"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = 019df953 (PRE-v2). ED follow-up v2 NOT yet deployed. (be_customers.assessmentDate backfill is LIVE data, but the date display needs the v2 deploy.)"
firestore_rules_version: "unchanged (WS1 + C2-bis + be_assessments). v2 needs NO rules change."
tests: "16542 / 0 (full suite; intermittent load-flakes pass on re-run per V161)."
---

# Active — 2026-06-16 — ED follow-up v2 + province bug-fix (SHIPPED local, NOT deployed)

## What shipped (brainstorm→spec→plan→8 tasks→Rule Q L1+L2)
- **R1** read-only confirm card on the follow-up link (ชื่อ-สกุล + อายุ + เบอร์ปิดกลาง, passive, neutral colors) — `confirmInfo` snapshotted into the opd_session at generation (anon can `get` session, can't read be_customers → no rule change). Fallback to editable fields when no confirmInfo (pre-ship links don't break).
- **R2** session pill (`FW-ED-…`) removed from all PatientForm modes.
- **R3** `supersedePendingFollowups({customerId,branchId})` — on "สร้างลิงก์" deletes prior PENDING follow-up session + its linked pending round → only the latest link per customer+branch is valid.
- **R4** TFP "หมายเหตุทั่วไป" ED-Score strip shows each round's date (dd/mm/yyyy พ.ศ.) + **"วันนี้"** badge when == today. Intake-round date = `patientData.assessmentDate || customer.createdAt` (diag: saved customers lack assessmentDate → createdAt fallback REQUIRED).
- **🔴 BUG-FIX** `PatientForm.jsx` province check was UNconditional → blocked follow-up submit ("กรุณาเลือกจังหวัด") → **customers could never submit a follow-up** (live on prod). Gated to `isIntake && !province`.

## Verification (Rule Q — "perfect 100%")
- **L1 real browser (real prod data)**: confirm card renders (name/age/masked-phone, NO inputs, NO pill); customer filled + **submitted → "ส่งข้อมูลสำเร็จ"** (province fix proven end-to-end). TEST session cleaned up.
- **L2 e2e real prod 13/0**: supersede deletes exactly the matching pending (completed/other-branch/other-customer survive) + confirmInfo round-trip + submit-no-date→materialize-dated-today + intake 20/05/2569 + zero orphans.
- Full vitest **16531/0** (2 clean runs) + build clean + Rule I flow-simulate 6/0 + pure helpers 26/0.
- **Honest L1 gap**: the R4 "วันนี้" badge in the BACKEND TFP note was NOT pixel-rendered in a browser (needs staff login + open LC-26000082 in TFP) — covered by formatRoundDate unit + flow-sim + L2 (round-dated-today) + source-grep. = USER hands-on if wanted.

## B — intake-date accuracy (เอาแม่นๆ, 2026-06-16)
- `patientData.assessmentDate` was dropped by the kiosk→customer projection (0/40 had it). Now PRESERVED: kioskPatientToCanonical → snake `assessment_date` → buildPatientDataFromForm renames → camelCase; buildFormFromCustomer round-trips (edit-safe); addCustomer stamps `thaiTodayISO()` once at CREATE. (AV194/V141 class.)
- **Backfill APPLIED** (Rule M, audit `backfill-assessmentdate-1781546629477-…`): 154 customers — 29 from EXACT intake-session date, 125 from createdAt; idempotent (re-run 0). LC-26000082 → `2026-05-20`. Proven: the intake date IS findable (LC-82 intake session `BL-1779253531712` assessmentDate "2026-05-20" === createdAt).
- R4 now shows the date in BOTH the TFP note AND the CDV ED box (dd/mm/yyyy พ.ศ. + วันนี้).

## Next action
- **DEPLOY** when you say "deploy" (V18): frontend-only `vercel --prod` — NO firestore.rules change → NO Probe-Deploy-Probe. (Backfill data is already LIVE; the date DISPLAY needs this deploy.)
- Honest L1 gap: backend-authed pixel render (CDV box + TFP "วันนี้") = USER hands-on after deploy (no staff creds for an automated backend L1; confirm-card + province-submit WERE L1-verified via the anon link).
- Candidate V-entries (session-end): (1) "L2/admin-SDK e2e BYPASSES client handleSubmit validation → unsubmittable province-block shipped; only L1 real-browser submit caught it." (2) "patientData field-drop in the customer projection recurs (assessmentDate, after AV194 perf + V141 visit_reasons) — projection needs a preserved-field audit." Rule Q / AV194 class.

## Outstanding (carried)
- ⚠ ROTATE LINE/FB secrets (AV195).
- ภูดิท LC-26000151 unrecoverable → clinical re-assessment.
