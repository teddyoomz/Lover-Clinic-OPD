# Checkpoint 2026-07-05 LATE — OPD Note Templates (TFP CC dropdown) SHIPPED + DEPLOYED

## Summary
Built + deployed the "template จดประวัติ" dropdown in the TFP OPD Card header per the
user's .docx spec. The deploy (V15 combined) also shipped the pending 19-commit
recall/VIP/staffchat-cards batch → TFP chat cards are now LIVE. Bug-hunt loop
converged: R1 (2 agents, 2 confirmed fixed) → R2 (2 agents, 0 confirmed).

## Current State
- master `a5b45c6f` = prod. Vercel `lover-clinic-34gimvsyy` ● Ready, alias lover-clinic-app.vercel.app HTTP 200. firestore.rules RELEASED (TFP-card allowlist #18 + be_opd_note_templates #19).
- full vitest **17209/17209 · 0 fail** (865 files) + build clean 3.41s + 63 new tests.
- Probe-Deploy-Probe: PRE 16/16 + POST 15/15 all expected (1,5,8,9,12,15,17,18,19 anon subset; 18/19 full-form via L2 scripts).
- **Rule Q L2 post-deploy ALL PASS ×2 real prod**: `diag-opd-note-templates-l2.mjs` (staff CRUD + cross-branch isolation + tabs/Thai verbatim round-trip + zero orphans) + `diag-tfp-chat-card-l2.mjs` (CREATE SUCCESS + dup DENIED + forge DENIED).

## Feature (Q1=A / Q2=A / Q3=A, spec + plan HTML committed)
- Pill "📄 template จดประวัติ ▾" in SectionHeader "OPD Card" children slot (no column-height change → เขียว/ม่วง save buttons stay aligned; locked by test F5).
- Menu: built-in บังคับ **"สมรรถภาพทางเพศ"** (frozen constant, verbatim from .docx incl. tabs; no ✎/🗑) → branch templates (✎ edit / 🗑 delete-confirm) → "+ สร้าง template ใหม่…" (modal, AV78 + useEscToClose LIFO).
- Pick → **append** to CC: `appendTemplateToCc` + functional `setOpd` (blur commits via flushSync before menu click → no race); OPDFieldWithPrev `[value]` sync-in delivers to textarea.
- Storage: NEW `be_opd_note_templates` — Layer 1 (V54 safe-by-default list + save stamps `_resolveBranchIdForWrite` + V38 spread) / Layer 2 auto-inject / BC1.1 `branch-spread` / rules `isClinicStaff()` / probe #19.

## Hunt loop (user directive: ≤2 agents per round)
- R1-A (correctness): 3 findings ALL REFUTED (ESC-double-close — element-level onKeyDown needs focus-in-subtree + overlays make pill unreachable; merge:false — full re-stamp, saveHoliday convention; branch-pin-on-edit — intended).
- R1-B (adversarial-UX): 2 CONFIRMED FIXED — (1) lazy-once list went stale on branch switch + other-staff mutations → **refresh on EVERY open** (C2-bis lock); (2) raw English Firebase permission error → Thai copy (C10-bis lock). REFUTED: AA #7c3aed (agent said 3.8:1; V125 measured 5.2:1 — symmetric pair), edit-after-delete recreate (harmless last-write-wins).
- R2-A (fix-regression): all clean; regex over-match REFUTED (catch scope only receives Firestore errors).
- R2-B (save-path/full-flow): all clean (symptoms persists in ALL saveModes + edit-restore; whitespace-pre-wrap on all render surfaces; test mirror faithful). Accepted hardening: name 100 / content 10,000 length caps (A2.5 lock).
- **Converged: R2 = 0 confirmed.**

## Files
- NEW: `src/lib/opdNoteTemplateValidation.js` · `src/components/OpdNoteTemplateMenu.jsx` · `scripts/diag-opd-note-templates-l2.mjs` · 4 test files (`tests/opd-note-template*`, 63 asserts)
- Modified: `backendClient.js` (+3 fns) · `scopedDataLayer.js` (+3 wrappers) · `TreatmentFormPage.jsx` (import + handler + header slot) · `firestore.rules` · `.claude/rules/01-iron-clad.md` (probe #19) · `tests/branch-collection-coverage.test.js` (BC1.1)
- Spec/plan: `docs/superpowers/{specs,plans}/2026-07-05-opd-note-templates*`

## Decisions
- Built-in = hardcoded constant (DEFAULT_RECALL_TEMPLATES precedent) — every branch, undeletable, not seeded.
- Append (never replace) — no data loss, stackable templates, no confirm interruption.
- Refresh-on-every-open > lazy-once — freshness beats one tiny query.
- Storage = collection (not clinic_settings — that doc is world-readable; internal medical templates must not be public).

## Next Todo
1. **User L1 hands-on**: TFP → เมนู template → เลือก → CC ได้ข้อความ + save อยู่ครบ · สร้าง/แก้/ลบ template สาขา · TFP vitals/doctor save → card ใน staff chat + deep link · VIP toggle → ทองทันที · card modals เหนือ chat panel (มือถือ).
2. ถ้าเจอบั๊ค → `/systematic-debugging` + Rule P 7-step.

## Resume Prompt
Resume LoverClinic — 2026-07-05 LATE. master `a5b45c6f` = prod (deployed: OPD note
templates + recall/VIP/staffchat-cards batch; rules #18+#19 released; L2 ×2 ALL PASS).
Read: CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md → .claude/rules/00-session-start.md
→ .agents/sessions/2026-07-05-opd-note-templates.md. Status: idle — awaiting user L1
results. No deploy without explicit "deploy" (V18).
