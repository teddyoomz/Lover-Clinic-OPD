---
updated_at: "2026-06-20 (cont.) — Filler v5.6 (breathe+glow split fix) + v6 (narrow cited estimate + ladder-72 + 2D dash toggles). SHIPPED local, NOT deployed."
status: "COMMITTED + PUSHED. NOT deployed (await 'deploy'). filler 98/0; full vitest 16864/0 (1 transient parallel flake, non-reproducible)."
branch: "master"
last_commit: "3d37eeca — feat(filler-sim v6): narrow + cited estimate (k 1.8–2.3) · condom ladder→72 · 2D dash toggles · stronger glow"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "UNCHANGED — filler-sim NOT deployed all session"
firestore_rules_version: "UNCHANGED (filler-sim is pure-client, no rules)"
tests: "filler 98/0 targeted; full vitest 16864/0 @ 3d37eeca (1 transient parallel flake, passed on re-run). Not re-run at EOD."
---

# Active — 2026-06-20 (cont.) — Filler v5.6 split fix + v6

## State
- master HEAD `3d37eeca` (=origin, pushed). prod UNCHANGED — **filler-sim NOT deployed** (await "deploy"; pure-client → vercel-only, no Probe-Deploy-Probe).
- Public page `?play=filler` — pure client, NO Firestore/auth/PII/rules. Single source of truth = `fillerMath.js`. Obfuscation is BUILD-only (dev + vitest run unobfuscated).
- 3 feature commits this session: 2975fce3 (v5.6 breathe+glow) → 98ed2322 (v5.6 split-fix regression) → 3d37eeca (v6).

## What this session shipped (detail → checkpoint 2026-06-20-filler-v6-narrow-estimate-toggles.md)
- **v5.6** (`2975fce3`): red dashed "หลังฉีด" outline breathe+glow (Calm, fade to opacity 0, ~3.6s, reduced-motion guard) + faint "เดิม" baseline opacity 0.5→0.25 dark / 0.42→0.21 light.
- **v5.6 split-fix** (`98ed2322`, Issue-1 regression): the red dashed line was the STROKE of the skin-filled body (one path) → opacity anim faded the WHOLE body. Fixed: split into static skin-fill + `fill="none"` red outline carrying the anim. Body stays, only the line breathes. (V21: my own v5.6 test had locked the broken combined element — rewritten + anti-regression.)
- **v6** (`3d37eeca`): (A) estimate too wide → recalibrated `k 2.37/3.32 → 1.8/2.3` anchored to HA RCT (PMC7230452); geometry confirmed correct (ISO 4074 width=½circ). 7"/30cc → "XL 60–68" → "XL 60". (B) ladder→72: 66–72 real numbered sizes; "เกินมาตรฐาน 🔥" only past 72. (C) 2D dash toggles (showAfter/showBaseline) that double as the legend + color-keys moved left + stronger glow (drop-shadow 4+9+15px) + 44px tap targets + flex-wrap auto-scale.

## Next action
- Idle / await. Deploy filler-sim on explicit "deploy" → `vercel --prod` (frontend-only, pure-client).

## Outstanding (user-triggered)
- **Deploy filler-sim** when ready (NOT deployed; pure-client, no Probe-Deploy-Probe).
- ⚠ Rotate LINE/FB secrets (AV195). · Encode customer id in LINE OA url (task_1a3ac96c).
- Honest gap (Rule Q-vis): `preview_screenshot` flaked all session → L1 verified via rendered DOM text + toggle behavior + live CSS + mobile geometry (not JPEG). Citations for the estimate in the v6 spec.
