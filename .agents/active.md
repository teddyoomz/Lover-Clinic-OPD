---
updated_at: "2026-05-24 EOD — V122 + V123 + V123-fix1 LOCAL · awaits commit + deploy"
status: "V115+V116 LIVE @ 3612d8ae. V117-V123-fix1 SHIPPED local (V122 + V123 + V123-fix1 uncommitted) — combined deploy pending."
branch: "master"
last_commit: "docs(agents): EOD 2026-05-23 LATE+9 — V118+V119+V120+V121 LOCAL stack (V122 + V123 + V123-fix1 uncommitted source)"
tests: "Full vitest 14544/14544 GREEN · V123 + V123-fix1 self 35/35 · BS-F.8 + SG2.4 V21 flipped · build clean 3.01s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "3612d8ae (V115+V116 LIVE) · office-to-pdf-00007-tfb (Cloud Run V110-bis)"
firestore_rules_version: "unchanged (V117-V123 all client-only — no Probe-Deploy-Probe needed)"
---

# Active Context

## State
- **8 V-features SHIPPED LOCAL** — all client-only (V117 + V118 + V119 + V120 + V121 + V122 + V123 + V123-fix1). 5 committed; V122 + V123 + V123-fix1 uncommitted on local master.
- **Prod unchanged** at `3612d8ae` (V115+V116 LIVE on Vercel).
- **V123 list-empty browser-state confirmed (not code)**: my preview (same auth/UID/branch/code) renders the นัดหมาย tab fully (today=8, รายการนัดหมาย 8 คน, real customer names). User's session has zombie state from many HMR full-reloads triggered by "mapDepositPayloadToBe export incompatible" Fast Refresh fail.

## What this session shipped
- **V122** — per-branch doctor-collision + per-branch slot-key suffix + empty-time guard. AV122 + 32 tests + BS-F.8 V21 fixup. Root cause: cross-branch `allBranches:true` scan + slot keys w/o branchId blocked pระราม 3 (3/3 fail). Diag: `scripts/diag-pram3-no-deposit-create.mjs`. Detail: `.agents/sessions/2026-05-24-v122-v123.md`.
- **V123** — desktop นัดหมาย tab bubble: `needsAdminSave` predicate (hasPatientData + !isOpdSessionSaved) replaces V121's silently-dead `cardFlowUnreadCount` (V121's bubble walked arrays that excluded its target Card-flow sessions → always 0). AV123 + 21 tests + SG2.4 V21 fixup.
- **V123-fix1** — user-reported "4 are cancelled" false-positives: added `!isArchived && !serviceCompleted` gates to needsAdminSave + isCardFlowUnread (class-of-bug mirror). Bubble dropped 4 → 1 (user confirmed correct). +4 tests A9-A12.
- **Tier 2 artifacts** all landed: regression tests + AV122 + AV123 + V-entries + class-of-bug classifier inline.
- Full vitest **14544/14544** GREEN (+31 net across all 3 fixes); build clean 3.01s.

## Next action
1. **User authorizes commit + deploy** → commit V122 + V123 + V123-fix1 source then `vercel --prod` (combined V117-V123-fix1 — all client-only).
2. **Rule Q L1 hands-on post-deploy** — iPhone + desktop scenarios per V118/V121 spec + V122 (Pram3 booking) + V123 (purple bubble on filled-unsaved appt + clears on 🔴 บันทึก OPD click).
3. **V123 list-empty browser-state recovery (user-side, not code fix)** — close all localhost:5173 tabs · open fresh tab · wait 10s. If still stuck → restart `npm run dev` + hard refresh.

## Outstanding user-triggered actions
- V122 + V123 + V123-fix1 commit authorization (all uncommitted on local master).
- Combined V117-V123-fix1 deploy authorization (when ready).
- Post-deploy iPhone + desktop L1 hands-on per V118/V121/V122/V123 acceptance criteria.
- V123 zombie-browser-state recovery (Steps 1-3 above) if persists.

## Notes
- V18: deploy auth never carries forward — every "deploy" verb is per-turn.
- 3 diag scripts NEW this session: diag-pram3 + diag-v123-today-appts + diag-v123-false-positive-sessions (Rule R read-only).
