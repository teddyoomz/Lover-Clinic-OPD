# LoverClinic Design Audit — 2026-04-26

> Pre-launch design pass. 5 parallel Explore agents reviewed 95 backend
> component files (77 in src/components/backend/ + 18 in reports/) for
> visual polish, UX consistency, a11y, and Thai cultural rules.

## Top finding (P0): :focus-visible gap across 145 inputs

All 5 agents flagged the same root issue — `focus:outline-none` used
WITHOUT a `focus:ring-*` companion at 145 sites. Keyboard users had no
visible focus state.

**Fix shipped (`24b82ac`)**: Single CSS rule in `src/index.css` adds
`:focus-visible` outline to every input/button/select/textarea/role-button
at the document level. Uses `:focus-visible` so MOUSE clicks don't show
the ring (preserves design); KEYBOARD focus shows the branded `--accent`
outline. Disabled / readonly elements skip. Covers all 145 sites with
zero per-component edits.

## Other findings by domain

### Customer + Sale + Finance (CustomerListTab, SaleTab, FinanceTab, DepositPanel, etc)
- 5 CRITICAL: `focus:outline-none` without ring at DepositPanel:63/387/390,
  CustomerListTab:69, CentralWarehousePanel:130, CloneTab:181 → ✅ fixed
  by global CSS rule
- 3 HIGH: aria-labelledby cross-ref missing on cancel/refund modals,
  filter rows missing data-field attrs, FinanceTab tab color clashing risk
- 5 MEDIUM: modal scroll header overlap risk, focus ring on cards,
  edit/delete icon button labels, sub-tab focus rings

### Master data (16 tabs + form modals)
- 2 CRITICAL: shell focus rings (covered by global CSS) + Google Maps link
  needs descriptive aria-label
- 3 HIGH: edit-mode disabled-input UX inconsistency, indeterminate
  checkbox via DOM ref (PermissionGroupFormModal:198 — fragile),
  type-toggle buttons use orange not clinic accent
- 7 MEDIUM: ID generation should use crypto, missing submit-disable
  during async, dynamic row UX clarity, geo validation feedback,
  handler consistency, locale verification

### Marketing + Appointment + Quotation (12 tabs + modals)
- 3 CRITICAL: focus rings (covered), red asterisk on required marker
  (Thai cultural — should be amber/orange not red), date inputs to verify
- 5 HIGH: currency formatting (`.toLocaleString('th-TH')` without
  fractional digits drops cents), AppointmentFormModal Esc handler,
  SaleInsuranceClaimsTab pay modal missing role="dialog"
- 8 MEDIUM: price color consistency, icon button labels, form layout
  responsive, date format mismatch, soft warning styling, focus ring
  pattern drift

### Reports (18 tabs)
- 2 CRITICAL: SummaryBars (DailyRevenueTab:159) + RevenueAnalysisTab:274
  amber gradient on PRIMARY chart data — violates user "no gold/yellow"
  rule. Note: SummaryBars is currently unused per comment but exported
  and could be activated.
- 2 HIGH: ReportShell:134 export icon button missing aria-label,
  promotion column display formatting
- 8 MEDIUM: empty-state UX, threshold colors acceptable, CSS var fallbacks,
  hardcoded Thai DOW abbreviations OK, status badge colors OK

### Documents + DF + Treatment misc (13 files)
- 4 CRITICAL: hardcoded `accent-red-600` checkbox in DocumentPrintModal:535,
  signature image without alt text, ChartTemplateSelector hardcoded colors
  bypassing CSS vars, ClinicLogo hardcoded `text-black`
- 6 HIGH: `dangerouslySetInnerHTML` without sanitization (DOMPurify or
  iframe needed), TreatmentTimelineModal accent color cultural risk,
  DateField Esc binding scope, PickProductsModal a11y gaps,
  FileUploadField memory leak (URL.createObjectURL not revoked),
  TreatmentTimelineModal edit-then-close race
- 9 MEDIUM: amber lock badge, contrast verification, DateField locale
  default, duplicated date formatter, redundant icons, keyboard nav
  in modal lists, image alt context, name concat trim, zoom button
  ARIA toggle state

## Triaged categories

### P0 (shipped this session)
- :focus-visible global rule (covers 145 sites)

### P1 (worth doing next session)
- DocumentPrintModal `dangerouslySetInnerHTML` sanitization (XSS risk)
- FileUploadField URL.createObjectURL revoke (memory leak)
- Required-field markers: red asterisk → amber (Thai cultural)
- ReportShell:134 export button missing aria-label
- Currency formatting: `.toLocaleString('th-TH')` → `fmtMoney` everywhere

### P2 (defer until next pre-launch sweep)
- ChartTemplateSelector hardcoded colors → CSS vars
- ClinicLogo hardcoded text-black → respect theme
- DocumentTemplatesTab amber lock badge → neutral gray
- SummaryBars amber gradient → cyan/blue or theme accent
- PermissionGroupFormModal indeterminate checkbox → controlled state
- AppointmentFormModal Esc handler verification
- Modal aria-labelledby cross-ref consistency

### P3 (cosmetic / nice-to-have)
- Empty-state messages with friendlier suggestions
- Geo validation visual feedback in BranchFormModal
- Handler pattern consistency across master-data tabs

## Verification

41 of 41 backend tabs verified loading without console errors via
`preview_eval` programmatic click-test. E2E spec
`tests/e2e/backend-all-tabs-smoke.spec.js` locks the result with one
test per tab (41 tests).

Companion E2E specs added:
- `marketing-tabs-actions.spec.js` (3 tests: open + create + cancel)
- `reports-tabs-render.spec.js` (13 tests: lazy chunk + heading)
- `master-data-actions.spec.js` (12 tests: list + modal + cancel)

Total new E2E coverage: **69 tests** across 4 spec files.
