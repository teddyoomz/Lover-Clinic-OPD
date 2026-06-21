---
updated_at: "2026-06-22 EOD — Filler simulator big batch: research glans + 2D Model-B + Inferno bold redesign + neon-green outline — ALL DEPLOYED both sites."
status: "All filler work LIVE on both lover-clinic-app.vercel.app (?play=filler) + loverclinic.vercel.app (standalone). 6 commits shipped + deployed this session. firestore.rules UNCHANGED all session → frontend-only, no Probe-Deploy-Probe. Idle."
branch: "master"
last_commit: "423159cc — style(filler): หลังฉีด outline -> neon green"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "423159cc DEPLOYED both sites this session (OPD lover-clinic-app.vercel.app + filler loverclinic.vercel.app). HEAD == prod, nothing pending."
firestore_rules_version: "UNCHANGED this session (all changes frontend-only → vercel-only, no Probe-Deploy-Probe)"
tests: "full vitest 16971/0 (last run this turn, pre-deploy gate) + filler targeted 148/0; build clean; verify:filler ✅. Not re-run after (no-tests-at-session-end)."
---

# Active — 2026-06-22 EOD — Filler simulator big batch (ALL DEPLOYED)

## State
- Penile-filler simulator got a full visual + math overhaul this session — ALL DEPLOYED to both sites (HEAD 423159cc == prod).
- firestore.rules untouched all session → every deploy was frontend-only via `npm run deploy:filler` (no Probe-Deploy-Probe).
- master `423159cc`; HEAD == prod, nothing pending.

## What this session shipped (detail → checkpoint 2026-06-22-filler-redesign-batch.md) — all DEPLOYED
- **Research-anchored glans** (`c9e6077a`): cube-root volume model (Moon 2015 / PMC4550597 anchor, +0.45/+0.53cm @2cc), 15cc head-cc cap, durable→peak Ø readout, 2D Model-B smart auto-scale (length auto-fills + thickness/cross grow with value), marching-ants baseline, 1s red-breathe, theme dash widths, "กดเพื่อ เปิด/ปิด" caption, favicon = OPD clinic icon, PDF regen.
- **Light-theme a11y** (`10d63575`): 2D legend red/amber → theme-aware (light failed AA 3.4→6.2:1); review-CTA hover/active.
- **Condom card baseline** (`79f00ae1`): hero card now shows "เดิม {X} มม. → {new}"; new SSOT `estimate().condomWidth0` (= selected rung in condom-mode). Reverses the 2026-06-21 "no เดิม" spec.
- **Inferno bold redesign** (`45c89f80`, cosmetic-only): ember atmosphere + glass cards + glowing borders + glowing title + bold sliders + pulsing hero showpiece + CTA sheen; reduced-motion safe. ZERO logic change.
- **Red dashed +20%** (`560eee76`): mobile visibility (light 1.2903 / dark 1.02).
- **Neon-green outline** (`423159cc`): "หลังฉีด" red→green (dark #4ade80 / light #15803d) — red blended into Inferno warm-dark bg. g2dLegKey wording แดง→เขียว. Verified both themes rendered.

## Next action
- Idle / await. Filler simulator complete + live on both sites.

## Outstanding user-triggered actions
- None. (Optional: user may tweak the light-theme green shade if #15803d reads too dark.)
