---
updated_at: "2026-05-17 EOD+2 — V81-fix3 archiver runtime-dep + SESSION_HANDOFF shrink + AV67"
status: "V81 + V81-fix1 LIVE; V81-fix2 + V81-fix3 patched (NOT deployed). Awaiting USER deploy verb."
branch: "master"
last_commit: "1686b32 docs+fix(V81-fix2): EOD+1 — Replace ack-gate + emergency owner-restore + AV66"
tests: "172 V81-family tests green (168 prior + 4 NEW V81-fix3 / AV67)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "9107fd0 V81 + V81-fix1 LIVE; 2 fixes ahead of prod (V81-fix2 ack-gate + V81-fix3 archiver runtime-dep)"
firestore_rules_version: "v35 + 5 V78 composite indexes (unchanged this session)"
---

# Active Context

## State
- V81-fix3 (this turn): backup Download 500 root cause fixed — `archiver` moved from `devDependencies` to `dependencies` in `package.json`. Vercel `npm install --production` skips devDeps → endpoint module-load was failing → HTML "A server error..." → client JSON.parse threw on "A". Single-line fix.
- AV67 invariant codified (audit-anti-vibe-code): every `api/**` import MUST resolve to a runtime dependency. 4 regression tests (tests/v81-fix3-archiver-runtime-dependency.test.js) PASS.
- SESSION_HANDOFF.md shrunk 317.5 KB → 44.1 KB by archiving 140+ older session blocks to `.agents/sessions/session-handoff-archive.md` (276 KB). 200 KB hard-cap rule + script enforcement (`session-apply.mjs` throws SESSION_HANDOFF_TOO_LARGE post-surgery) installed.
- Local `scripts/.tmp-final-roundtrip-backup-*` cleaned (7 MB freed). Storage Backups A/B/C still preserved as recovery references.

## What this session shipped
- V81-fix3 — `archiver` deps↔devDeps swap in `package.json` (single edit fixes prod Download 500)
- AV67 — NEW audit invariant + 4 regression tests in `tests/v81-fix3-archiver-runtime-dependency.test.js`
- SESSION_HANDOFF.md hard 200 KB cap rule:
  - Banner at top of SESSION_HANDOFF.md
  - Hard cap + procedure documented in `.agents/skills/session-end/SKILL.md`
  - Script enforcement in `.agents/scripts/session-apply.mjs` (throws SESSION_HANDOFF_TOO_LARGE if post-surgery > 200 KB; warns at > 180 KB)
- Archive — NEW `.agents/sessions/session-handoff-archive.md` (276 KB; 140+ blocks from V67 saga down to V32-tris 2026-04-26)
- Cleanup — deleted local `scripts/.tmp-final-roundtrip-backup-1778961439997/` folder

## Next action
USER `deploy` verb → commit + push + `vercel --prod` ships **V81-fix2 ack-gate + V81-fix3 archiver runtime-dep** (2 fixes, 1 deploy). Post-deploy Rule Q L1 confirmation: click backup Download button → verify JSON `downloadUrl` returned (NOT "A server error...").

## Outstanding user-triggered actions
- `deploy` verb → vercel --prod (V81-fix2 + V81-fix3 both pending live)
- Post-deploy: click backup Download button to L1-verify V81-fix3 fix (Rule Q gate)
- 352 staff still need password reset (use "ลืมรหัสผ่าน" on login page) — Firebase sends reset emails
- Cleanup Storage Backups A/B/C from final-roundtrip-proof when comfortable (still preserved as recovery)
- (Future) Java/Node 24 SDK compat for emulator E.2-E.11
- (Future) gcloud clone-verify secondary-DB setup

## Files touched this turn (uncommitted)
- `package.json` — archiver deps↔devDeps swap
- `tests/v81-fix3-archiver-runtime-dependency.test.js` — NEW (4 tests)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV67 invariant added
- `.agents/skills/session-end/SKILL.md` — 200 KB hard cap rule
- `.agents/scripts/session-apply.mjs` — SESSION_HANDOFF_TOO_LARGE enforcement
- `SESSION_HANDOFF.md` — shrunk 317.5 → 44.1 KB + banner + new session block
- `.agents/sessions/session-handoff-archive.md` — NEW (276 KB, 140+ blocks)
- `.agents/active.md` — this file
