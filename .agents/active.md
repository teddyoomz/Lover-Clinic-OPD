---
updated_at: "2026-04-27 (s12 EOD — V32-tris-ter-fix + V32-tris-quater LINE OA DEPLOYED)"
status: "Production = cb387c3 LIVE. LINE OA flow end-to-end working. master = 0c0ae28 (post-session-end docs)."
current_focus: "Idle. All s12 work deployed + verified. Ready for user QA / next feature."
branch: "master"
last_commit: "0c0ae28"
tests: 1096
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "cb387c3"
firestore_rules_version: 16
---

# Active Context

## State
- master = `0c0ae28`, 1096 focused vitest pass (~5200 in `tests/extended/` opt-in)
- Production = `cb387c3` LIVE. Rules v16 LIVE (be_course_changes + be_customer_link_tokens + be_link_requests + be_link_attempts all admin-SDK only)
- Working tree clean. Build clean. Last deploy: V15 combined, all probes 200/403 as expected.

## What this session shipped
4 commits (`203581f` → `0c0ae28`). Detail in
`.agents/sessions/2026-04-27-session12-line-oa-completion.md`.

- **V32-tris-ter-fix** (203581f) — CORS proxy `/api/admin/line-test` + webhook switched to firebase-admin SDK for be_* paths. Fixes 2 production bugs (test connection failed-to-fetch + LINK token always invalid).
- **V32-tris-quater** (cb387c3) — admin-mediated ID-link approval flow. Customer DM `ผูก <ID>` → bot rate-limit + admin SDK lookup + same-reply anti-enumeration → admin queue (LinkRequestsTab) → batch atomic approve. NEW EditCustomerIdsModal (focused nationalId/passport editor reachable from CustomerDetailView "เลขบัตร" button).
- **107 new tests** (1025 → 1096): `tests/v32-tris-ter-line-bot-fix.test.js` (36) + `tests/v32-tris-quater-id-link-request.test.jsx` (71).

## Next action
None pending. If user wants to continue:
- **P1 polish**: LinkLineQrModal warning when botBasicId empty + LineSettingsTab help text + wire welcomeMessage override
- **P2 XL**: T5.a full drag-drop designer OR TFP 3200 LOC refactor

## Outstanding user-triggered actions (NOT auto-run)
- Admin: fill LineSettingsTab credentials (Channel Secret + Access Token + Bot Basic ID) ONCE
- Admin: paste webhook URL into LINE Console: `https://lover-clinic-app.vercel.app/api/webhook/line`
- Admin: backfill customer IDs via "เลขบัตร" button (ProClinic-cloned customers may have empty nationalId)

## Key decisions (s12 only — full context in checkpoint)
1. Webhook + admin SDK hybrid for be_* (rules stay locked; defense-in-depth)
2. Same-reply anti-enumeration on id-link-request (bot must NOT confirm matches)
3. "ผูก" prefix REQUIRED (anti false-positive vs random 13-digit numbers)
4. Customer doc edits use Firestore dotted-path (`'patientData.X': Y`) — preserves siblings
5. Approval is BATCH atomic (customer.lineUserId + request.status='approved' can't diverge)
6. Last-4 of ID stored in audit only (privacy)
