---
name: audit-react-patterns
description: "Audit React anti-patterns across all LoverClinic UI: IIFE JSX (Vite OXC crash), stale closures, listener leaks, silent catches, memo opportunities. Use before any release and on any new component."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit React Patterns

Comprehensive hygiene scan. React 19 is less forgiving than 18 on effect cleanup; Vite OXC crashes on IIFE JSX; stale closures silently show outdated state. These are the top 10 patterns worth scanning for.

## Invariants (RP1–RP10)

### RP1 — No IIFE in JSX
**Why**: Vite OXC parser crashes on `{(() => {...})()}` (CLAUDE.md rule 2).
**Grep**: `\\{\\s*\\(\\s*\\(\\s*\\)\\s*=>` in src/
**Expected**: zero matches.

### RP2 — Every `onSnapshot` returns `unsubscribe` in useEffect cleanup
**Why**: leak → memory bloat + stale state over long admin sessions.
**Grep**: `onSnapshot` — 28 matches across 8 files (AdminDashboard, ChatPanel, PatientForm, etc.)
**Check**: each paired with cleanup function.

### RP3 — Every `setTimeout`/`setInterval` cleaned up
**Grep**: `setTimeout|setInterval` — 14 matches across backend files.
**Check**: cleanup or justified one-shot.

### RP4 — Stale closure guard on async-loaded props
**Why**: CLAUDE.md rule 6.
**Grep**: `useEffect` with deps including late-loaded props (clinicSettings, backendActiveMembership, etc.).
**Check**: `loaded` flag or ref pattern.

### RP5 — No silent `catch(e){}`
**Why**: silent error = audit gap. Must log or propagate.
**Grep**: `catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}` in mutation paths — 36+ matches across 13 files.
**Note**: some are intentional (non-critical display fetches); audit each site.

### RP6 — Pre-computed variables, not IIFE (duplicate of RP1 for defensive depth)

### RP7 — Large lists use virtualization or `max-h + overflow-y-auto`
**Why**: CLAUDE.md bug #6 — 128 courses clipped.
**Targets**: buy modal (50 + load-more), course index, chat history, movement log.

### RP8 — Stable `key` prop (not array index) in re-orderable lists
**Why**: React reconciliation bugs on reorder.
**Grep**: `.map\\(.*index\\)` then `key={index}`.

### RP9 — `useMemo`/`useCallback` on expensive derivations in 1000+ LOC components
**Targets**: SaleTab (1469 LOC), TreatmentFormPage (3200+), CustomerDetailView (1239), DepositPanel (1049).

### RP10 — No `addEventListener` on `window`/`document` without cleanup
**Grep**: `addEventListener` in src/ — each paired with removeEventListener.

## How to run
1. Run each grep pattern.
2. For RP2/RP3, Read the file around each match to confirm cleanup.
3. For RP5, classify each match: mutation vs display; flag mutation sites.
4. For RP9, profile component render cost (manually, via react-devtools Profiler during user smoke test).

## Report format standard.

## Priority
RP1 (IIFE) = crash class. RP2 (listener leak) = memory class. RP4 (stale closure) = silent-correctness class.
