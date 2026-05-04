---
title: "BSA Design Spec (2026-05-04)"
type: source
date-created: 2026-05-04
date-updated: 2026-05-04
date-ingested: 2026-05-04
source-type: design-spec
location: docs/superpowers/specs/2026-05-04-branch-scope-architecture-design.md
tags: [bsa, branch, multi-branch, refactor, layer]
---

# BSA Design Spec — Branch-Scope Architecture

> The design document that scoped Phase BSA. Spec lives at [`docs/superpowers/specs/2026-05-04-branch-scope-architecture-design.md`](../../docs/superpowers/specs/2026-05-04-branch-scope-architecture-design.md). This wiki source-page is a summary + cross-reference, not a duplicate.

## Problem (verbatim from spec)

> The clinic now runs multiple branches (current: นครราชสีมา default + พระราม 3). Top-right BranchSelector switches the active branchId. Every read/write/listener that touches branch-scoped data must respect this selection — but today only **partial** wiring exists.

User-reported bug: "เลือกเป็นสาขาพระราม 3 ไว้ แล้วไปเปิดหน้าสร้างการรักษาใหม่ ทุกปุ่มแม่งยังดึงของสาขา นครราชสีมา มาอยู่เลย ทั้งคอร์ส ยา ค่ามือ แพทย์ ผู้ช่วย".

## Bug class to eliminate

Any data path in UI code that returns docs from a non-selected branch when the user has clearly chosen a branch. Includes:
1. New callsite forgetting `{branchId}` → silently wrong
2. Snapshot listener not re-subscribing on branch change → stale until F5
3. Direct `master_data/*` read bypassing the be_* layer (Rule H-quater violation)
4. Server endpoint reading collections without honoring caller's branchId

## Design — 3 layers + audit

| Layer | File | Purpose |
|---|---|---|
| 1 | `src/lib/backendClient.js` | Raw, parameterized — every lister accepts `{branchId, allBranches}` |
| 2 | `src/lib/scopedDataLayer.js` (NEW) | UI-only wrapper. Auto-injects `resolveSelectedBranchId()`. Pure JS. |
| 3 | `src/hooks/useBranchAwareListener.js` (NEW) | onSnapshot listeners auto-resubscribe on branch switch |
| Audit | `/audit-branch-scope` BS-1..BS-8 | Build-blocking source-grep regressions |

## Key decisions captured in spec

- **Universal collections** (NOT branch-scoped): be_staff, be_doctors, **be_customers** + customer-attached, be_branches, be_permission_groups, be_document_templates, be_audiences, be_admin_audit, be_central_stock_*, be_vendors, system_config, chat_conversations
- **Branch-scoped collections** (filtered): be_treatments, be_sales, be_appointments, be_quotations, be_vendor_sales, be_online_sales, be_sale_insurance_claims, all be_stock_*, be_products, be_courses, all master-data tabs, be_holidays, be_df_*, be_bank_accounts, be_expense_*, be_staff_schedules, be_link_requests, be_promotions/coupons/vouchers (with `allBranches:true` doc-field OR-merge)
- **Server endpoints stay parameterized as-is** — UI scope only
- **Live listener migration in same round** as the wrapper — single Phase

## Cross-references

- Implements: [Branch-Scope Architecture concept](../concepts/branch-scope-architecture.md)
- Sibling: [BSA implementation plan](bsa-plan.md)
- Enforces: [Rule H-quater](../concepts/rule-h-quater.md) (no master_data reads)
- Related rule cluster: [Iron-clad rules A-L](../concepts/iron-clad-rules.md) — Rule L is BSA codified

## History

- 2026-05-04 — Spec written via brainstorming session. User chose "Implicit + audit" over per-callsite migration after reviewing 3 approaches.
- 2026-05-04 — Approved + migrated to plan; plan executed in 12 tasks across the same session.
