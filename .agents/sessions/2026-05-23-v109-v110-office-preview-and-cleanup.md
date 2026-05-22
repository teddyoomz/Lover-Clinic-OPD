# 2026-05-23 EOD+1 LATE — V109 canonical path + V110 Thai font fidelity + Rule M cleanup

## Summary
After V108 office preview shipped EOD, user re-tested 2.8MB .docx + reported stuck ⚠. `/systematic-debugging` Iron Law identified V109 (bare Firestore collection path in Cloud Function) + V110 (Thai font metric mismatch). Both fixed + deployed; user accepted engine-bound LibreOffice ≠ Word limit. Cleaned 5 debugging-era .docx chats via Rule M.

## Current State
- master = `97385d0d`; pushed to origin/master
- Cloud Run `office-to-pdf-00007-tfb` LIVE (V110-bis: fonts + alias + Word-compat XCU)
- Vercel UNCHANGED (`0dda0eae`) — no V109/V110/cleanup touched `src/`/`api/`/`firestore.rules`/`vercel.json`; current bundle byte-identical to what re-deploying would produce
- vitest **14161/0** GREEN; build clean
- 0 stuck .docx chats remaining (idempotency-verified)

## Commits this session
```
97385d0d chore(scripts): Rule M two-phase delete-staff-chat-with-office-attachments
3d56b1f8 feat(office-preview): V110 — Thai font fidelity (fonts-thai-tlwg + Cordia→Loma alias + LO Word-compat XCU)
33d5eea6 fix(office-preview): V109 — Cloud Function canonical Firestore path + heal stuck docs
```

## Files Touched
- NEW: `functions/officeToPdf/{fontconfig-thai.conf,libreoffice-compat.xcu,fontDetector.js}`
- NEW scripts: `diag-2-8mb-stuck-attachments.mjs`, `diag-docx-font-inspect.mjs`, `diag-v110-convert-user-docx.mjs`, `diag-compare-pre-post-v110.mjs`, `diag-cleanup-test-v110.mjs`, `v109-heal-stuck-office-attachments.mjs`, `delete-staff-chat-with-office-attachments.mjs`
- NEW tests: `tests/v109-office-preview-canonical-path.test.js` (10/0), `tests/v110-font-detector.test.js` (23/0)
- MOD: `functions/officeToPdf/{Dockerfile,index.js,package.json,package-lock.json}`, `scripts/{diag-office-preview-comprehensive,diag-office-preview-deploy-verify,e2e-staff-chat-office-preview}.mjs`
- MOD docs: `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV109 + AV110), `.claude/rules/00-session-start.md` (V109 + V110 rows), `SESSION_HANDOFF.md`, `.agents/active.md`, `.gitignore` (`.tmp-docx-inspect/` excluded — real PHI)

## Decisions (1-line each — full reasoning to .claude/rules/00-session-start.md § 2)
- V109 fix = canonical `db.doc(\`${PATH}/${id}\`)` constant; 3 L2 scripts adopt same path to eliminate V66 mirror.
- V109 heal applies only to docs with cached PDF; 2 docs without cache require user re-upload (script reports both classes).
- V110 ships **fonts-thai-tlwg + Cordia→Loma fontconfig alias** as the headline fix (~85-95% improvement); MS proprietary fonts cannot be installed.
- V110-bis adds LO Word-compat XCU; user verdict "เหมือนเดิม" — kept anyway for defensive correctness on other docs.
- Engine-bound limit ACCEPTED + documented; LibreOffice ≠ Word for Thai CTL is industry-wide.
- Cleanup script default scope = all-office (Word+Excel+PPT+CSV); per-MIME narrow flags available. Per-MIME breakdown printed pre-delete (surprising-scope callout).
- Cleanup `--apply` deleted 5 messages + 8 Storage objects. Audit `be_admin_audit/delete-staff-chat-office-attachments-1779479146560-a60d0ab9`. Idempotent.

## Verification (Rule Q L2 with REAL user data, no synthetic)
- `scripts/diag-2-8mb-stuck-attachments.mjs`: confirmed 4 stuck pending docs at canonical Firestore path; 2/4 had cached `.docx.pdf` at correct Storage paths → proves Cloud Function ran successfully + only Firestore patch failed.
- V109 L2 re-verify: `diag-office-preview-comprehensive.mjs` 11/11 PASS with canonical-path fixtures (would have caught the bug pre-fix).
- V110 L2 verify: re-converted user's real 2.77MB docx 3x; md5 differs across pre-V110 / V110-fonts-only / V110-bis. Cloud Run log captured `'Cordia New → Loma'` alias resolution.
- Targeted regression batch (V109 + V110 + AV108): 38/0 PASS.
- Full vitest: 14161/0 PASS.

## Lessons (locked permanent — link to V-entries)
- **V109 / AV109** — Cloud Functions touching `be_staff_chat_messages` MUST use Rule M canonical `artifacts/${APP_ID}/public/data` path. Test fixtures must use the SAME path the REAL CLIENT uses, not the code-under-test's path (V66 mirror trap).
- **V110 / AV110** — every redeploy of office-to-pdf MUST install fonts-thai-tlwg + Cordia→Loma fontconfig alias + LO Word-compat XCU + font-detection observability. Sanctioned exception: NONE.
- Honest scope discipline: ~85-95% visual match is the realistic ceiling for LibreOffice-based Office preview; 100% is engine-bound, never font-bound.

## Next Todo
- (User-triggered) L1 hands-on: upload fresh .docx → 👁 in ~10s → preview should use Loma + TH Sarabun PSK + Word-compat XCU.
- (User-triggered) Revoke "Owner" role from firebase-adminsdk-fbsvc SA via Cloud Console (carried over from 2026-05-23 EOD).
- No pending deploy work — Cloud Run + Vercel both in sync with intent.

## Resume Prompt
See `SESSION_HANDOFF.md` § Current State + this checkpoint § Next Todo.
