# Checkpoint 2026-07-05 LATE+1 — recall full-dates + empty-state + template realtime/portal + TFP image thumbnails

## Summary
5-feature batch from user screenshot IMG_8920 (recall date confusion) + 3 verbal bug
reports (template modal ซ้อน/แว๊ป, TFP รูปเยอะโหลดช้า, dropdown โหลดนานผิดปกติ) +
1 realtime directive. SHIPPED local, NOT deployed. Adversarial hunt converged.

## Current State
- master `18904ac8` = origin. prod `a5b45c6f` (OPD note templates + earlier batch already deployed; THIS batch NOT deployed).
- full vitest 17244/17245 (1 = known parallel flake `subtab-filters-stress`, green isolated 43/0; definitive clean re-run in flight). Build clean.
- firestore.rules UNCHANGED this batch → future deploy = **vercel-only, no Probe-Deploy-Probe**.
- Rule Q: **realtime L2 ALL PASS real prod** (`diag-opd-templates-realtime-l2.mjs`) + thumb URL live HTTP-verify 5/5 (`diag-thumb-sample.mjs`).

## Features (Q1=B / Q2=A / Q3=B + realtime + portal directives; spec+plan HTML committed)
- **① วันที่เต็ม** — `formatThaiFullDate(iso)` → "6 ก.ค. 2569" (เดือนไทย + พ.ศ.); `_formatThaiShortDate` delegates. Applied: RecallRow dateDisplay + recallDateChip, RecallSectionHeader today/tomorrow suffix (recall-bucket-date-*), RecallPairBadge (via formatPairBadge), LINE `{วันที่}` var. Date col 56→92px.
- **② empty state** — RecallList compact renders 3 sections ALWAYS + green dashed "✓ ไม่มี Recall วันนี้/ไม่มีรายการค้าง/ไม่มี Recall พรุ่งนี้" (recall-bucket-empty-*). full mode skip-empty unchanged.
- **③ portal** — TemplateEditorModal → createPortal(document.body) (transform-ancestor made position:fixed render in-slot → ซ้อน/แว๊ป).
- **④ realtime dropdown** — NEW `listenToOpdNoteTemplatesByBranch` (onSnapshot, V54 safe-by-default, V38 spread) + scopedDataLayer passthrough; OpdNoteTemplateMenu subscribes via `useBranchAwareListener` at mount (BS-4); removed all getDocs/refresh. create/edit/delete appear instantly (latency compensation).
- **⑤ thumbnails** — `processAndUploadTreatmentImage` uploads a ~320px q0.7 thumb alongside (kind `${kind}thumb`, NON-FATAL → '' fields); TFP persist (4 arrays) + removeTreatmentBlob(storagePath, thumbStoragePath) + deleteBackendTreatment cascade thread thumb fields; readers (TFP grids/lab, ReadOnlyPanel imageThumbUrl, ReadOnlyMirror object-aware imageUrl, history ImageRow) render `thumbUrl||dataUrl` + loading="lazy"; zoom/href = FULL. Backfill `scripts/backfill-treatment-image-thumbs.mjs` (Rule M, sharp devDep) **APPLIED on prod: 140 docs / 543 entries / 0 failed / 104.9MB→4.47MB thumbs**; idempotent re-run 0.

## Hunt loop (R1→R2→self-grep converged)
- **R1** (2 agents): recall/date lens + listener/portal/thumbs lens → **0 confirmed**. REFUTED: backfill-URL "HIGH" (my `diag-thumb-sample.mjs` = 5/5 HTTP 200 image/jpeg on real `.firebasestorage.app` bucket); 92px column = cosmetic (wraps, no truncate).
- **R2** (2 agents): missed-date-sites + persist/edit-load/chart lens → **1 latent fixed** (lineTemplate `{วันที่}` was raw ISO → now formatThaiFullDate; L3.1 repoint + L3.1-bis lock). REFUTED: carousel big-preview-thumb (= user's EXPLICIT "โหลดแค่ thumbnail...กดเปิด...ค่อยโหลดเต็ม" — inline=thumb, zoom=full; onZoom already passes full). CONFIRMED-SAFE: edit-load round-trip, mirror object-aware (charts=strings/photos=objects both OK), delete cascade, non-fatal fallback chain.
- **self-grep** (proportionate R3 for the 1 isolated pure-fn fix): 0 remaining raw/year-less recall date reaching user (all other recallDate uses = DateField input / storage / computed-days).

## V21 fixups (repointed to new contract)
- 4 recall date asserts (phase-29 resolvers×2 + flow-simulate + row-rtl "15 พ.ค. 2569") + L1.5/L2.4/F3.3 always-sections + D4/S7.4 thumb-fields + L3.1 lineTemplate full-date. testid rename recall-section-date-* → recall-bucket-date-* (prefix collision).

## Commits (this batch, ~15)
```
18904ac8 fix(recall): hunt R2 — {วันที่} → formatThaiFullDate
…        diag(thumbs): HTTP-verify backfilled URLs 5/5 200
…        test(l2): realtime dropdown L2 ALL PASS
…        test: 2 V21 repoints (persist + removeTreatmentBlob)
…        test(thumbs): bank U1/SG1-7/F1-3 + backfill script
…        feat(thumbs): readers sweep 5 surfaces
…        feat(thumbs): upload chokepoint + threading + cascade
…        feat(opd-templates): REALTIME + createPortal
…        test(recall): bank D1-D6 + 3 V21 repoints
…        feat(recall): full dates row/section/list + empty boxes
…        feat(recall): formatThaiFullDate
+ spec/plan HTML
```

## Files (key)
- recall: recallResolvers.js (formatThaiFullDate) · RecallRow/RecallSectionHeader/RecallList.jsx · lineTemplateRenderer.js
- templates: backendClient.js (+listener) · scopedDataLayer.js · OpdNoteTemplateMenu.jsx (portal + listener)
- thumbs: treatmentImageUpload.js · TreatmentFormPage.jsx · TreatmentReadOnlyPanel/Mirror.jsx · treatment-history/TreatmentDetailComponents.jsx · backendClient.js (cascade) · scripts/backfill-treatment-image-thumbs.mjs · scripts/diag-thumb-sample.mjs · scripts/diag-opd-templates-realtime-l2.mjs
- tests: recall-full-date-and-empty-state · tfp-image-thumbs + 8 V21 fixup files
- spec/plan: docs/superpowers/{specs,plans}/2026-07-05-recall-dates-templates-thumbs*

## Next Todo
1. User "deploy" → vercel --prod (frontend-only). Backfill already applied; no rules change.
2. Post-deploy L1: Recall full-dates + ✓-empty · dropdown realtime + portal-modal · TFP thumb-grids fast + zoom-full.

## Resume Prompt
Resume LoverClinic — 2026-07-05 LATE+1. master `18904ac8` (recall full-dates +
empty-state + template realtime/portal + TFP thumbs; SHIPPED local, NOT deployed;
prod a5b45c6f). Read CLAUDE.md → SESSION_HANDOFF.md → .agents/active.md →
.claude/rules/00-session-start.md → this checkpoint. Status: idle — awaiting
"deploy" (vercel-only, frontend). No deploy without explicit "deploy" (V18).
