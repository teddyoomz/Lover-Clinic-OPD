---
updated_at: "2026-05-23 EOD+1 LATE — V109 canonical path + V110 Thai font fidelity + cleanup"
status: "Cloud Run office-to-pdf rev 00007-tfb LIVE (V110-bis); Vercel UNCHANGED (no client touch needed); 5 stale .docx chats Rule M deleted"
branch: "master"
last_commit: "97385d0d chore(scripts): delete-staff-chat-with-office-attachments (Rule M)"
tests: "vitest 14161/0 PASS (14138 full-suite + 23 V110 + 10 V109 — overlapping)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0dda0eae (Vercel — no V109/V110 client change required) · office-to-pdf-00007-tfb (Cloud Run, V110-bis fonts + alias + Word-compat XCU)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- V109 (canonical Firestore path) + V110 (Thai font fidelity) BOTH shipped, pushed, deployed (Cloud Run × 2 redeploys). Vercel UNCHANGED — no client code touched; current Vercel prod bundle byte-identical to what V109/V110/script-chore would produce.
- 4 stuck/healed .docx chats from the debugging session deleted via Rule M two-phase (`delete-staff-chat-with-office-attachments.mjs`). Idempotent re-run confirms 0 candidates. Audit doc emitted.
- Engine-bound limit accepted by user: LibreOffice ≠ MS Word render even with identical fonts. V110 closes the font-substitution gap (~85-95% similarity); 100% pixel-match unachievable industry-wide.

## What this session shipped
- V109 fix + AV109 + V109 regression test + Rule M heal (2 docs pending→ready). Detail: `.claude/rules/00-session-start.md` V109 row.
- V110 + V110-bis: fonts-thai-tlwg + fontconfig-thai.conf alias + libreoffice-compat.xcu + fontDetector.js observability + AV110 + 23 regression tests. Detail: `.claude/rules/00-session-start.md` V110 row.
- Cloud Run deploys: rev 00005-q54 → 00006-xxd (V110 fonts) → 00007-tfb (V110-bis + compat XCU).
- 4 diag scripts (Rule R): `diag-2-8mb-stuck-attachments`, `diag-docx-font-inspect`, `diag-v110-convert-user-docx`, `diag-compare-pre-post-v110`. Cleanup: `diag-cleanup-test-v110.mjs`.
- Rule M batch delete: `scripts/delete-staff-chat-with-office-attachments.mjs` (broad or per-MIME scope). 5 messages + 8 Storage objects deleted on `--apply`.
- Detail: `.agents/sessions/2026-05-23-v109-v110-office-preview-and-cleanup.md`

## Next action
- Idle (await user). No pending deploy work (all surfaces in sync with intent).

## Outstanding user-triggered actions
- L1 hands-on: upload fresh .docx → 👁 in ~10s → click → preview now via Loma + TH Sarabun PSK + Word-compat XCU.
- Security: revoke "Owner" role from firebase-adminsdk-fbsvc SA via Cloud Console (carried over from 2026-05-23 EOD).
