---
name: audit-ui-cultural-a11y
description: "Audit Thai cultural rules (no red on names/HN, dd/mm/yyyy พ.ศ.), WCAG 2.2 accessibility, keyboard nav, color contrast. Use before release and whenever UI changes."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit UI — Thai Cultural + Accessibility

Thai cultural taboos + WCAG 2.2 (HHS May 2026 healthcare deadline) + keyboard/screen-reader support.

## Invariants (UC1–UC8)

### UC1 — No red text/bg/border on patient name or HN
**Why**: CLAUDE.md rule 4 — สีแดง = คนตาย in Thai culture.
**Grep**: `text-red|bg-red|border-red|text-rose|bg-rose` near patient name/HN components.
**Scope**: ~165 red-class usages across 26 backend files — narrow to name/HN display only.
**Targets**: CustomerCard avatar initials + HN badge, CustomerDetailView header, PatientDashboard, PatientForm.

### UC2 — No gold/yellow
**Why**: CLAUDE.md rule 4 — user dislikes.
**Grep**: `text-yellow|text-amber-3|bg-yellow|text-gold|#FFD700` — should be zero or documented accent usage only.

### UC3 — Date inputs are dd/month/yyyy with พ.ศ. (not native mm/dd)
**Why**: feedback_date_picker_rule.md + CLAUDE.md rule 4.
**Grep**: `type="date"` in forms — every instance should be DateField component (custom).

### UC4 — 24-hour time format
**Grep**: `format.*h:mm|AM|PM` — should be zero.

### UC5 — Color contrast ≥ 4.5:1 (WCAG AA)
**Tool**: use marketplace `/audit` skill for axe-core-style scan.

### UC6 — Keyboard nav: logical tab order, focus-visible, no traps
**Grep**: `tabIndex={-1}|outline-none` — audit that `outline-none` is paired with `focus-visible:` classes.

### UC7 — `aria-label`/`aria-describedby` on icon-only buttons
**Grep**: `<button>.*<[A-Z][a-z]+\\s.*/></button>` then check for `aria-label`.

### UC8 — LINE-green accent used per palette; no rogue brand colors
**Why**: CLAUDE.md brand — แดง ดำ ขาว ไฟ + LINE green.

## How to run
1. Run each grep; classify matches.
2. For UC5, delegate to `/audit` marketplace skill or axe-core.
3. For UC6, tab through main flows manually (CustomerList → Detail → SaleTab → Save) and note focus state.

## Priority
UC1 = cultural sensitivity (user-visible, embarrassing). UC5-UC7 = WCAG compliance (legal risk in US deployments).
