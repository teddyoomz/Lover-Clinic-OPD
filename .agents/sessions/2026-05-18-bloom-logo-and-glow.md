# 2026-05-18 EOD+7 — ClinicLogo at bloom center + slow glow + iterative size tune

## Summary

Added `<ClinicLogo>` rendered inside the BackendArcBloom overlay (desktop centered 50%/50%, mobile top-center at 14%) with theme-aware variant picking + slow 4.5s breathing glow animation. Wired clinicSettings + theme props through BackendShellNew. Then 5 quick mobile logo size-tune rounds per user feedback (final 195px at vw=375).

## Current State

- master = `033a1101` · ~20 commits ahead of prod (`ef4bd5c3`)
- Backend Menu D pyramid: 136/136 PASS
- Build clean 3.55s
- Preview verification via `preview_eval` only (`preview_screenshot` timing out at 30s — Chrome MCP installed but extension not connected this turn)
- No deploy this session

## Commits (this session)

```
033a1101 fix(backend-menu-d EOD+6 round 7): mobile logo -2% tune (53vw/252 → 52vw/247 · 199→195px at 375)
d8ec1274 fix(backend-menu-d EOD+6 round 6): mobile logo +5% (50.5vw/240 → 53vw/252 · 189→199px at 375)
df6fbd6e fix(backend-menu-d EOD+6 round 5): mobile logo +5% (48vw/230 → 50.5vw/240 · 180→189px at 375)
1184d835 fix(backend-menu-d EOD+6 round 4): mobile logo +10% again (44vw/210 → 48vw/230 · 165→180px at 375)
969f853e fix(backend-menu-d EOD+6 round 3): mobile logo +10% (40vw/190 → 44vw/210 · 150→165px at 375)
e9967303 feat(backend-menu-d EOD+6 round 2): enlarge logo (desktop 25vw / mobile 40vw) + scatter headroom
5db7d4d6 feat(backend-menu-d EOD+6): ClinicLogo at center of bloom (theme-aware + slow glow) + widen desktop scatter
```

## Files Touched

- `src/components/backend/shell/BackendArcBloom.jsx` — props clinicSettings + theme, ClinicLogo render, DESKTOP_POSITION widen + finance/reports push down
- `src/components/backend/shell/BackendShellNew.jsx` — pass clinicSettings + theme to ArcBloom
- `src/index.css` — `.bloom-logo-wrap` desktop/mobile CSS + 4 breath keyframes (dark/light × desktop/mobile) + reduced-motion stop. clamp() sizes iterated over rounds 2-7.
- `tests/backend-menu-d-bugfix-orb-and-mode-toggle.test.jsx` — B1.4 + B1.4-bis V21 fixups for new desktop scatter coords (customers 19/34 → 14/32, stock 65/88 → 70/92).

## Decisions

- Logo centered at 50%/50% on desktop, top-center 14% on mobile (no orb overlap risk on mobile — orbs are at bottom-right; logo at top-center).
- Theme-aware via existing ClinicLogo component (`logoUrl` for dark, `logoUrlLight` for light). Glow color matches palette: dark = ember red `(220,38,38)`, light = sakura pink `(236,72,153)`.
- Breath animation: 4.5s ease-in-out infinite, scale 0.985↔1.015 (very gentle), drop-shadow blur 14↔28 / 24↔52 px. Slow and subtle per user "ไม่ต้องเร็ว ส่องแสงว่าบๆ".
- Final mobile size 52vw with clamp(180, 247) — landed after 5 size-tune rounds. Each round was a 1-line clamp() change, committed + pushed immediately, no test impact (no source-grep test pins logo sizes).
- 42×3 px corner brush between customers orb + desktop logo accepted as visually invisible (within drop-shadow blur radius). Per `preview_eval` true AABB overlap check.
- Preview workflow lesson: skip `preview_screenshot` (30s timeout). Stick with `preview_eval` (DOM/style queries, ~500ms). Logged for Chrome MCP retry next session.

## Next Todo

1. **Deploy when user types "deploy"** — combined queue is large now (V82-Phone + sub-tab picker T1-T7 + EOD+5 Arc Fan rounds + EOD+6 logo polish), all vercel-only (no firestore rules change since V82-Phone).
2. After deploy: user L1 hands-on tests for (a) mouse-follow tilt with real cursor, (b) Arc Fan tap test on real phone, (c) ClinicLogo glow on real phone (light + dark theme switch).
3. Chrome MCP extension reconnect (sign in + active tab in user's Chrome).
4. V82 Menu V2 mobile L1 re-test (carryover).

## Resume Prompt

Resume LoverClinic — continue from 2026-05-18 EOD+7.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=`033a1101`, prod=`ef4bd5c3` LIVE)
3. .agents/active.md
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-18-bloom-logo-and-glow.md (this checkpoint)

Status: master=`033a1101`, Backend Menu D pyramid 136/136 PASS, prod=`ef4bd5c3` LIVE
Next: idle until user types "deploy" (combined queue: V82-Phone + sub-tab picker T1-T7 + Arc Fan rounds + ClinicLogo polish rounds 1-7, vercel-only · no rules change)

Outstanding (user-triggered): deploy verb · Chrome MCP extension reconnect · V82 Menu V2 mobile L1 re-test · Playwright L1 mouse-follow tilt run (E11) when admin creds env set.

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe; cosmetic-shell ห้ามแตะ wiring; Rule Q V66 L1 Playwright real-browser mandatory for mouse-follow contract.

/session-start
