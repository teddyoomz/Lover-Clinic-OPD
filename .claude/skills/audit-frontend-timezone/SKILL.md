---
name: audit-frontend-timezone
description: "Audit Thai (Asia/Bangkok, GMT+7) time correctness across the frontend. Catches `new Date().toISOString().slice(0,10)` (emits UTC → prev day 00:00–07:00 Thai), naked `new Date().getMonth()/.getDay()` for display, and bypasses of the canonical `bangkokNow`/`thaiTodayISO` helpers. Must-run before every release since TZ bugs are invisible in dev (admin machines usually in GMT+7) but fire on Vercel."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Frontend Timezone — Thai (GMT+7) Correctness

Prod bug 2026-04-19: Vercel-served admin dashboard showed "today = April 18"
while actual Thai today was April 19. Root cause: `new Date().toISOString()`
emits UTC, and between 00:00–07:00 Thai, the UTC day is still yesterday.
Canonical helpers live in `src/utils.js` (`bangkokNow`, `thaiTodayISO`,
`thaiNowMinutes`, `thaiYearMonth`). Every display of "today / this month /
current time" must route through them.

## Invariants (TZ1–TZ8)

### TZ1 — No `new Date().toISOString().slice(0,10)` / `.substring(0,10)` / `.split('T')[0]` for display
**Why**: emits UTC date, drifts to previous day 00:00–07:00 Thai.
**Grep**: `new Date\(\)\.toISOString\(\)\.(slice|substring|split)` under `src/`.
**Allowed**: audit timestamps like `{ createdAt: new Date().toISOString() }`
stored to Firestore and rendered via `formatBangkokTime()` later — verify
the code path doesn't display the raw string.
**Fix**: replace with `thaiTodayISO()` from `src/utils.js`.

### TZ2 — No `new Date().getFullYear() / .getMonth() / .getDate()` for display
**Why**: browser-local; incorrect for any user not in GMT+7 (Vercel edge, overseas admins, mobile tests).
**Grep**: `new Date\(\)\.get(FullYear|Month|Date|Day|Hours|Minutes)` under `src/`.
**Allowed**: `Date.now()` millisecond deltas / IDs (timezone-agnostic).
**Fix**: `bangkokNow().getUTCFullYear()/.getUTCMonth()/.getUTCDate()` or higher-level helpers.

### TZ3 — No `new Date("YYYY-MM-DD").getDay()` for weekday detection
**Why**: `new Date("2026-04-19")` parses UTC-midnight; `.getDay()` returns local weekday → wrong in UTC-negative browsers.
**Grep**: `new Date\([^)]*\)\.getDay` under `src/`.
**Fix**: `new Date(Date.UTC(y, m-1, d)).getUTCDay()` — TZ-invariant.

### TZ4 — No naked `new Date()` as "now" parameter to a display formatter
**Why**: `.toLocaleDateString()` / `.toLocaleTimeString()` without `timeZone: 'Asia/Bangkok'` uses browser TZ.
**Grep**: `toLocale(Date|Time|)String\([^{]*$` (no options object) under `src/`.
**Fix**: pass `{ timeZone: 'Asia/Bangkok', ... }`.

### TZ5 — Canonical helpers in utils.js stay canonical (no local duplicates)
**Why**: AdminDashboard previously had its own `bangkokNow`/`todayISO` — drift risk.
**Grep**: `function\s+(bangkokNow|todayISO|getThai|thaiNow)` — should return 4 defs in `src/utils.js` only.
**Note**: AdminDashboard has a `const bangkokNow = bangkokNowUtil` alias — that's OK.

### TZ6 — `YEARS_BE` / `YEARS_CE` in utils derived from Thai today, not browser-local
**Why**: year boundary (Dec 31 → Jan 1 Bangkok) shows wrong year for 7h in UTC-negative browsers.
**Grep**: `currentYearCE` definition in `src/utils.js` must use `bangkokNow().getUTCFullYear()`.
**Expected**: one line, correct pattern.

### TZ7 — Age / birthday calculations use Thai today
**Why**: off-by-one year on customer birthday when browser lags Thai by 7h.
**Grep**: `getFullYear\(\)\s*-\s*birth|calculatedAge` under `src/pages/PatientForm.jsx` and any age-calc helper.
**Fix**: `bangkokNow().getUTCFullYear()` as the reference.

### TZ8 — Date default values for form inputs use Thai today
**Why**: treatment-date / sale-date / payment-date defaults would otherwise show previous-day YYYY-MM-DD in off-TZ browsers → confusing audit trail.
**Grep**: `useState\(\(\) => new Date\(\)\.|setState\(new Date\(\)\.` under `src/components/**` and `src/pages/**`.
**Fix**: `useState(() => thaiTodayISO())`.

## How to run
1. Run each grep across `src/` (exclude `tests/`, `functions/`, `api/`).
2. Classify matches:
   - Display path? → **violation**, recommend helper replacement.
   - Audit timestamp stored to Firestore + rendered via `formatBangkokTime`? → OK.
   - Millisecond delta / ID generator? → OK.
3. For TZ4, review each `.toLocale*` call and check the options object for `timeZone: 'Asia/Bangkok'`.
4. For TZ5, confirm there are no orphaned copies of `function bangkokNow` outside utils.

## Priority
**TZ1, TZ2, TZ3** = CRITICAL — user-visible "today is wrong" bugs on prod.
**TZ4, TZ7, TZ8** = HIGH — data-integrity (date stamps on records).
**TZ5, TZ6** = MEDIUM — drift prevention.

## Example violations from historical commits
- `ClinicSchedule.jsx:188` had `new Date().toISOString().substring(0,10)` → fixed `71e513f`.
- `AdminDashboard.jsx:298` had `apptMonth = {now.getFullYear()}-...` → fixed `71e513f`.
- `PatientForm.jsx:208` had age calc via `today.getFullYear()` → fixed `71e513f`.
- Full list: `git log --all --source --grep="timezone"` since 2026-04-19.
