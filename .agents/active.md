---
updated_at: "2026-07-05 LATE+1 — recall full-dates + empty-state + template realtime/portal + TFP image thumbnails SHIPPED local (NOT deployed); hunt loop converged R1(0)→R2(1 lineTemplate fixed)→self-grep(0)."
status: "Feature batch complete on master, ahead of prod 18904ac8-vs-a5b45c6f... wait prod=a5b45c6f already deployed OPD-templates; this NEW batch NOT deployed. Awaiting explicit 'deploy'."
branch: "master"
last_commit: "18904ac8 fix(recall): hunt R2 — {วันที่} LINE var → formatThaiFullDate"
tests: "full vitest 17244/17245 (1 known parallel flake subtab-filters-stress, green isolated 43/0; definitive re-run pending). Build clean. Touched-area targeted all green."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "a5b45c6f (2026-07-05) — OPD note templates + earlier batch DEPLOYED. THIS recall/thumbs batch NOT yet deployed."
firestore_rules_version: "UNCHANGED this batch (be_opd_note_templates + tfp-card rules already deployed a5b45c6f). No new rule → future deploy = vercel-only, no Probe-Deploy-Probe."
---

# Active — 2026-07-05 LATE+1 — recall dates + empty-state + template realtime/portal + TFP thumbs

## State (5 features, from IMG_8920 + 3 verbal bugs; SHIPPED local, NOT deployed)
- **① วันที่เต็ม (Q1=B)** — NEW `formatThaiFullDate` (recallResolvers) "6 ก.ค. 2569" (เดือนไทย+พ.ศ.); `_formatThaiShortDate` delegates → row date chip / snooze chip / section-header suffix / PairBadge / LINE `{วันที่}` var ทั้งหมด.
- **② empty state (Q2=A)** — RecallList compact renders today/overdue/tomorrow ALWAYS; ว่าง → กล่องเขียวประ "✓ ไม่มี..." (data-testid recall-bucket-empty-*). full mode unchanged.
- **③ modal portal** — TemplateEditorModal via createPortal(document.body) → ไม่ซ้อน/ไม่แว๊ป (transform-ancestor fix).
- **④ dropdown realtime (user directive)** — listenToOpdNoteTemplatesByBranch (onSnapshot, V54 safe-by-default + V38 spread, BSA L1/L2/L3 via useBranchAwareListener) → create/edit/delete เห็นทันที ไม่ต้อง refresh; ฆ่า slow menu-open getDocs.
- **⑤ TFP thumbnails (Q3=B)** — upload คู่ ~320px thumb (non-fatal) + persist/remove/cascade threading + readers 5 surface thumb-first||dataUrl + lazy; zoom=full. Rule M backfill รูปเก่า **543/543 patched** (idempotent re-run 0; HTTP-verify 5/5 = 200 image/jpeg 6.5-9KB).
- **Hunt loop converged**: R1 (2 agents) 0 confirmed (backfill-URL SUSPECTED→REFUTED by HTTP 200 5/5; 92px cosmetic). R2 (2 agents) 1 latent fixed (lineTemplate {วันที่}→full) + carousel-thumb REFUTED (= user's explicit inline-thumb/click-full directive) + 4 dims CONFIRMED-SAFE. self-grep = 0 remaining raw-date exposure.

## Rule Q
- **L2 realtime ALL PASS real prod** (`diag-opd-templates-realtime-l2.mjs` — cross-writer create/edit/delete stream into ONE live client subscription, 4 snapshots).
- Thumb URL-shape verified live (`diag-thumb-sample.mjs` 5/5 HTTP 200).

## Next action
- Await explicit "deploy" → vercel --prod only (frontend-only, no rules change → no Probe-Deploy-Probe). Backfill already applied.
- Post-deploy user L1: (1) หน้า Recall วันนี้ → ทุกวันที่เต็ม "6 ก.ค. 2569" + วันว่างขึ้น ✓ ไม่มี ชัด (2) dropdown template → สร้าง/แก้/ลบ เห็นทันที + modal เปิดกลางจอไม่ซ้อน (3) TFP รูปเยอะ → grid โหลดเร็ว (thumb) + กดซูมได้รูปเต็ม.

## Outstanding user-triggered actions
- "deploy" for this batch (vercel-only).
