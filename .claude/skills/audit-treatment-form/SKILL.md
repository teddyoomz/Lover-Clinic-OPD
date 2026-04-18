---
name: audit-treatment-form
description: "Audit the TreatmentFormPage (3200+ LOC — biggest UI file) for field completeness, edit-mode restore fidelity, auto-sale trigger correctness, stale closures, and scrollToError coverage. Use after any change to treatment form."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Treatment Form (Phase 3)

The largest single file. History of 6+ subtle bugs (course index mismatch, purchased-not-deducted, payment status, IIFE click handlers, overflow-hidden, qty input width). This skill codifies what we've learned.

## Invariants (TF1–TF10)

### TF1 — Edit-restore fidelity
**Check**: load existing treatment → re-serialize form state → deep-equal to stored doc. No field lost.
**Grep**: useEffect blocks that load form data; confirm every form field has a restore line.
**Known gap**: `selectedCourseItems` restoration may have stale rowIds (per codebase scan finding #5).

### TF2 — `data-field` attribute coverage
**Why**: scrollToError needs `data-field` on every validated field (CLAUDE.md bug #8).
**Grep**: `data-field=` in TreatmentFormPage vs the fields listed in validation errors.
**Current state**: zero matches in treatment form per scan — gap.

### TF3 — `aria-invalid` / `aria-describedby` on error fields
**Why**: WCAG 2.2 accessibility.
**Grep**: `aria-invalid|aria-describedby` in treatment form.

### TF4 — Auto-sale trigger complete on edit
**Why**: hasSale transitions false→true / true→false / true→true all need handling.
**Where**: `TreatmentFormPage.jsx` around lines 1333 (hasSale def) + 1723 (edit saga).
**Known gap**: false→true on edit doesn't create sale (scan finding #3).

### TF5 — Course deduction by name+product, not raw index
**Why**: CLAUDE.md bug #2 — form dedups 156→50; index unsafe.
**Grep**: `deductCourseItems` callers; confirm pass name+product keys.

### TF6 — Purchased course deduction AFTER assign
**Why**: CLAUDE.md bug #3.
**Check**: assignCourseToCustomer call order vs deductCourseItems.

### TF7 — Payment status map: '2'→'paid', '4'→'split', '0'→'unpaid'
**Why**: CLAUDE.md bug #4.
**Grep**: `pmStatusMap` definition + usage.

### TF8 — No IIFE JSX (Vite OXC crash)
**Why**: CLAUDE.md rule 2.
**Grep**: `{\\s*\\(\\s*\\(\\s*\\)\\s*=>` in TreatmentFormPage.
**Expected**: zero matches.

### TF9 — Stale closure on async-loaded props
**Why**: CLAUDE.md rule 6 — clinic settings load async; effects depending on them need `loaded` flag or ref.
**Grep**: `useEffect` with deps including clinicSettings/settings.

### TF10 — Signature/chart image refs cleared on unmount
**Why**: canvas refs + image URLs hold memory; long admin sessions leak.
**Grep**: `useEffect` returning cleanup for canvas/image refs.

## Deep scan targets (known problem areas)

- Line ~1333: hasSale definition + transitions
- Line ~1560: treatment create + deductStockForTreatment
- Line ~1594–1688: create-path auto-sale
- Line ~1723–1820: edit-path saga (now includes C5 + Scenario-J fixes)
- Line ~3200+: buy modal + course selection

## Report format standard.

## Priority
TF1 (edit-restore) and TF4 (auto-sale on edit) are highest — silent data loss class.
