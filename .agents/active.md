---
updated_at: "2026-05-23 EOD+1 LATE — V110 Office preview Thai font fidelity fix (Cordia→Loma alias + fonts-thai-tlwg)"
status: "DEPLOY IN PROGRESS — Cloud Run V110 build running (gcloud run deploy --source). Local code+tests GREEN; pending post-deploy L2 verify with user's actual stuck .docx."
branch: "master"
last_commit: "33d5eea6 (V109 — Cloud Function canonical Firestore path). V110 pending commit (12 files staged after L2 verify)."
tests: "vitest +17 V110 + 17 V109 = 14178/0 PASS targeted; full-suite pending end-of-batch"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0dda0eae (Vercel UNCHANGED — no client change) · office-to-pdf rev N+1 (Cloud Run, redeploying NOW with V110 fix)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- **Root cause**: User's .docx specifies `script="Thai" typeface="Cordia New"` via document theme. Cordia New is MS-proprietary (CANNOT redistribute). Gotenberg base ships only Noto Sans Thai → LibreOffice substitutes → different character widths → line-wrap doesn't match Word.
- **Fix architecture (V110)**: Install free Thai fonts (`fonts-thai-tlwg` ships TH Sarabun PSK + Loma + Garuda + Norasi + 7 more) + fontconfig alias mapping Cordia/Browallia/Angsana + UPC variants → Loma/Garuda/Norasi (metric-similar free equivalents) + font-detection observability so we know which fonts each docx needs.
- **Honest scope**: ~85-95% visual fidelity, NOT 100% (LibreOffice render engine ≠ Word's engine for Thai CTL even with identical fonts). User authorized this approach + added the auto-load directive.

## What this session shipped (LOCAL — pending post-deploy L2 verify)
- `functions/officeToPdf/Dockerfile`: +fonts-thai-tlwg + fonts-thai-tlwg-otf + fontconfig + COPY of fontconfig-thai.conf + fc-cache refresh
- NEW `functions/officeToPdf/fontconfig-thai.conf`: 13 strong-binding aliases (Cordia/Browallia/Angsana + UPC variants → free fonts) + generic sans-serif/serif preference chain
- NEW `functions/officeToPdf/fontDetector.js`: pure JS (fflate-based) docx unzip + fontTable.xml + theme1.xml parser + fc-list/fc-match wrappers with cache; returns {declared, theme, installed, missing, aliased}
- `functions/officeToPdf/index.js`: imports analyzeFontRequirements + pre-conversion font-requirements log (non-fatal, try/catch — never blocks Gotenberg call)
- `functions/officeToPdf/package.json`: +fflate dependency
- NEW `tests/v110-font-detector.test.js` (17 PASS): Dockerfile font install + fontconfig alias map + detector pure-JS + index.js wiring + package.json
- NEW `scripts/diag-docx-font-inspect.mjs` (Rule R): downloads user's stuck .docx, unzips, lists declared + theme fonts
- NEW `scripts/diag-v110-convert-user-docx.mjs`: post-deploy verify — uploads user's actual docx to TEST-V110-* prefix → live Eventarc → Cloud Function → downloads result PDF for visual diff

## Deploy + L2 verify (in progress)
- Background task: `gcloud run deploy --source functions/officeToPdf` (running ~10 min)
- Post-deploy: `node scripts/diag-v110-convert-user-docx.mjs` → uploads user's REAL 2.77MB docx → live conversion → downloads `v110-result.pdf` for visual comparison against the pre-V110 cached PDF (the one currently in Storage with mismatched line-wraps)
- Show user the side-by-side, get sign-off

## Outstanding (user-triggered)
- L1 (after V110 deploy + verify): user re-uploads a fresh .docx → expect 👁 → click → preview should now visually match Word ~85-95%
- The 2 already-healed docs from V109 will keep their existing cached PDFs (V110 affects ONLY future conversions, not past ones — user can delete + re-upload to get the V110 quality if desired)
- Security: revoke "Owner" role from firebase-adminsdk-fbsvc SA via Cloud Console (carried over)

## Honest limits (locked permanent)
- 100% pixel-match between LibreOffice + Word is **engine-bound**, not font-bound. No amount of font work bridges this. Industry-wide reality.
- Cordia New cannot be installed (Microsoft proprietary license).
- For truly Word-identical output: only Word itself can produce that. The download button remains the source-of-truth for exact formatting.
