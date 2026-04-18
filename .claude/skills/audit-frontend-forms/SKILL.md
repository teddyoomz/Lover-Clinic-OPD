---
name: audit-frontend-forms
description: "Audit every input form across the frontend for DateField usage (no native mm/dd/yyyy), scrollToError coverage (data-field attrs + focus transfer), required-field validation with Thai error copy, submit-button disable during async, and edit-mode restore fidelity. Use before release and after any form-touching change."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Frontend Forms — DateField / scrollToError / Validation / Edit-mode

Forms are the primary data-entry surface in this clinic app (intake,
treatment, sale, deposit, membership, wallet, appointment). Historically,
form bugs are 60% of user-reported issues (CLAUDE.md bug list — index
mismatch, overflow-hidden, IIFE click handlers, scrollToError missing).

This skill generalizes the narrower `audit-treatment-form` to every form.

## Invariants (FF1–FF10)

### FF1 — No native `<input type="date" />` anywhere
**Why**: mm/dd/yyyy in US locale; fails Thai cultural rule + feedback_date_picker_rule.md.
**Grep**: `type="date"` in `src/` — must be zero.
**Allowed**: inside `DateField.jsx` itself (the hidden input that powers the custom picker).
**Fix**: import `DateField` from `src/components/DateField.jsx`.

### FF2 — Every DateField displays dd/mm with Thai พ.ศ. (backend uses ค.ศ.)
**Why**: CLAUDE.md rule 4.
**Grep**: `<DateField` usage sites — verify `buddhist={true}` or default matches context (TreatmentFormPage/PatientForm use พ.ศ.; SaleTab/DepositPanel/etc. may use ค.ศ.).
**Check**: render sample form, inspect the displayed text.

### FF3 — `scrollToError` has `data-field` attribute on every required input
**Why**: CLAUDE.md bug #8 fix — without `data-field`, scrollToError can't focus the field.
**Grep**: every `<input required` or `<select required` in a form — nearby `data-field` attr.
**Check**: the handleSubmit catch path uses `scrollToError('fieldName')` that matches the data-field value.

### FF4 — Submit button disabled during async submit
**Why**: double-click creates duplicate sale / double-charged deposit.
**Grep**: `onClick=.*handleSubmit|handleSave|handleCreate` — surrounding button has `disabled={isLoading || isSaving}`.
**Targets**: SaleTab "บันทึก", DepositPanel "สร้างมัดจำ", TreatmentFormPage "บันทึก", MembershipPanel "ขาย".

### FF5 — Required-field validation has Thai error copy (not English)
**Why**: customer-facing UX.
**Grep**: `alert\(.*required|toast.*required|please|must` — should be Thai: `กรุณา...`, `จำเป็น`, etc.
**Anti-pattern**: `alert('Field is required')` — should be `alert('กรุณากรอก...')`.

### FF6 — Edit-mode restore fidelity (all fields populated from existing record)
**Why**: losing a field on edit = silent data wipe on next save.
**Grep**: `if (isEdit|mode === 'edit')` — for each field set during create, verify matching `setX(existing.X)` in edit path.
**Targets**: TreatmentFormPage (biggest), DepositPanel, SaleTab, MembershipPanel.

### FF7 — No form resets state on submit error
**Why**: user rages when they fill out a 20-field form and a save fails → blank form.
**Grep**: `setState.*initial|resetForm|clearForm` near catch blocks.
**Fix**: keep form state, show error toast, let user retry.

### FF8 — File uploads gate on MIME + size BEFORE upload
**Grep**: `<input type="file"` — surrounding code checks `file.size <` and `file.type.startsWith('image/')` before dispatch.
**Anti-pattern**: upload first, rely on server 413 — wastes bandwidth.

### FF9 — Number inputs coerce decimal / thousand-separator safely
**Why**: Thai users type `1,000.50`. Raw `parseFloat("1,000.50")` → 1 (truncates at comma).
**Grep**: `parseFloat\(|parseInt\(|Number\(` on form inputs — should strip `,` first: `parseFloat(val.replace(/,/g, ''))`.

### FF10 — Form-level aria-label or `<h2>` title for screen readers
**Grep**: each form's outer `<form>` or container has `aria-labelledby` or a preceding heading element.

## How to run
1. List all forms: `find src -name "*.jsx" -exec grep -l "handleSubmit\\|handleSave\\|handleCreate" {} \;`
2. For each form, run FF1 → FF10 checklist.
3. For FF6 (edit-mode fidelity), open the component in a browser, create a record, reopen in edit mode, verify every original value is pre-filled.

## Priority
**FF1, FF4, FF6** = CRITICAL — data loss / double-charge risk.
**FF3, FF5, FF9** = HIGH — UX + correctness.
**FF2, FF7, FF8** = MEDIUM — polish + cost.
**FF10** = LOW — a11y.

## Example violations from historical commits
- `TreatmentFormPage.jsx` missing `data-field` on seller/payment → fixed by CLAUDE.md bug fix #8.
- Age calc used browser local → fixed `71e513f` (falls under TZ not forms, but same family).
- SaleTab default dates used `new Date().toISOString().split('T')[0]` → fixed `71e513f`.
