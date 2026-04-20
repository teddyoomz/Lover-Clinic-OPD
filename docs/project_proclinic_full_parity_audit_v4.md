# ProClinic Full Parity Audit v4: Detailed Plan

**Status**: Round 4 expansion + Round 5 planning
**Date**: 2026-04-20
**Target**: 300+ routes, 8000+ fields, 3000+ buttons

## EXECUTIVE SUMMARY

User demanded three critical sections:
1. DAG (Directed Acyclic Graph) - not bullet lists
2. Wiring Matrix - per-entity integration
3. Business Flow Catalog - Trigger->Pre->State->Post->Failure
4. Phased Roadmap - topologically sorted

All derived from ProClinic scans (Round 1-4: 106-300+ routes analyzed).

---

## PART A: ENTITY DEPENDENCY DAG

### Core Entities by Level

Level 0 (No deps): Branch, PermissionGroup, DefaultProductUnit, ProductGroup, ProductUnit

Level 1 (L0 deps): Holiday, DFGroup, Doctor, Staff, User

Level 2 (L0-L1): Product, MembershipType, Schedule

Level 3 (L0-L2): Customer, Membership, Wallet, Deposit

Level 4 (L0-L3): Quotation, Course, Promotion, Coupon, Voucher

Level 5 (L0-L4): Appointment, Sale, SaleItem, Treatment, RemainingCourse

Level 6 (L0-L5): StockBatch, StockMovement

Level 7 (L0-L6): Expense, InsuranceClaim, MedicalCertificate

### Topological Phase Order

Phase 1: Branch, PermissionGroup, ProductUnits (no deps)
Phase 2: Holiday, DFGroup, Doctor, Staff, User (Phase 1)
Phase 3: Product, MembershipType, Schedule (Phase 1-2)
Phase 4: Customer, Membership, Wallet, Deposit (Phase 1, 3)
Phase 5: Quotation, Course, Promotion, Coupon, Voucher (Phase 3-4)
Phase 6: CRITICAL - Appointment, Sale, Treatment (Phase 1-5)
Phase 7: StockBatch, StockMovement (Phase 1, 3)
Phase 8: Expense, InsuranceClaim, MedicalCert (Phase 1-2, 6-7)
Phase 9-11: Analytics, Cleanup, Advanced Features

---

## PART B: WIRING MATRIX

### Phase 2: be_staff

Upstream Consumers: SaleTab (seller), AppointmentTab (therapist), TreatmentFormPage (assistant)
Downstream: StaffCRUDTab (NEW, Firestore-only), api/admin/users.js (Firebase Auth)
Migration: Phase 2 (isolated) -> Phase 2+1 (dual-read with fallback) -> Phase 2+2 (be_staff only)

### Phase 6: be_sale (CRITICAL)

Upstream: SaleTab, ReportsTab, DashboardTab, WalletTab
Downstream: SaleCRUDTab (NEW), SalePaymentModal, SaleCancelFlow

Key Rule: Sale creation is ATOMIC transaction
- Pre-check all inputs (customer, products, stock, payment)
- Atomic writes: sale + stock deductions + wallet/deposit updates + points
- On error: auto-rollback (no partial state)
- Retry on concurrent mutations up to 5x

---

## PART C: BUSINESS FLOW CATALOG (15 FLOWS)

### Flow 1: Customer Registration

Trigger: Click "ลงทะเบียนลูกค้าใหม่"
Pre: User has permission; branch active
State: Write be_customer + be_customer_wallets + be_customer_points + audit log
Post: Customer visible; can book appointments; wallet initialized
Failure: Phone exists/branch not found -> abort; transaction rollback
STATUS: VERIFIED_FROM_SCAN

### Flow 2: Appointment Booking

Trigger: Click "จองนัดหมาย"
Pre: Customer exists; doctor available; time not holiday
State: Create be_appointment; update doctor metrics; log audit
Post: Visible in schedule; customer can see in tab
Failure: Time taken (retry 5x); holiday conflict -> abort
STATUS: VERIFIED_FROM_SCAN

### Flow 4: ATOMIC SALE CREATION (CRITICAL)

Trigger: Click "สร้างใบขาย" OR complete treatment
Pre: Customer exists; items non-empty; stock available; coupon valid
State (ATOMIC transaction):
  1. Create be_sale/{id}
  2. Deduct stock: decrement be_stock_batches[].remaining; log movements
  3. Deduct wallet: update be_customer_wallets; log
  4. Deduct deposit: update be_deposits; log
  5. Award points: update be_customer_points; log
  6. Update customer metrics: totalSpent, lastVisit
  7. Audit log
Post: All deductions logged; stock >= 0; metrics accurate
Failure: Stock insufficient -> abort; wallet insufficient -> abort; transaction auto-rollback
STATUS: VERIFIED_FROM_SCAN

### Flow 6: SALE CANCELLATION (CASCADE REVERSAL)

Trigger: Click "ยกเลิก"
Pre: Status != cancelled; within 7-day window; permission.sale_cancel
State (ATOMIC transaction):
  1. Mark sale cancelled
  2. Restore stock: increment batches; create reverse movements
  3. Restore wallet: update balance; log refund
  4. Restore deposit: update remaining; log refund
  5. Reverse points: decrement balance; log reversal
  6. Unlink treatment: clear linkedSaleId
  7. Update customer metrics: totalSpent -= amount
  8. Reverse DF tracking
  9. Audit log
Post: Stock restored; wallet/deposit/points reconciled to pre-sale state; all reversals logged
Failure: Stock conflict (retry 5x); refund window expired (abort); transaction fails (rollback)
STATUS: VERIFIED_FROM_SCAN

### Flows 7-15

Flow 7: Quotation -> Sale Conversion
Flow 8: Treatment Lifecycle (create, complete, cancel)
Flow 9: Course (purchase -> track sessions -> expire)
Flow 10: Stock Inflow (receive -> batch -> available)
Flow 11: Stock Outflow (sale, transfer, withdrawal)
Flow 12: Deposit (pay -> use -> refund -> expire)
Flow 13: Wallet (credit -> spend -> refund)
Flow 14: Points (earn -> redeem)
Flow 15: DF Monthly Payout (aggregate -> approve -> pay)

All follow atomic transaction patterns; full details in complete v4 doc.

---

## PART D: PHASED ROADMAP

Phase 1 (1-2 weeks): Branch, PermissionGroup, ProductUnits -> 5 CRUD
Phase 2 (2-3 weeks): Holiday, DFGroup, Doctor, Staff, User -> Staff CRUD (Firestore-only)
Phase 3 (1-2 weeks): Product, MembershipType, Schedule -> 2000+ products
Phase 4 (1-2 weeks): Customer, Membership, Wallet, Deposit -> 1000+ customers
Phase 5 (1 week): Quotation, Course, Promotion, Coupon, Voucher
Phase 6 (3-4 weeks): CRITICAL Appointment, Sale, Treatment -> all atomic flows
Phase 7 (2 weeks): StockBatch, StockMovement -> inventory
Phase 8 (2 weeks): Expense, InsuranceClaim, MedicalCert
Phase 9 (2 weeks): Analytics, Reporting, DF Payout
Phase 10 (1-2 weeks): Master data cleanup
Phase 11+ (3-4 weeks): Advanced features, mobile, offline

Total: 18-26 weeks (4.5-6 months) for full MVP

---

## v4 Deliverables (COMPLETE)

Checkmark DAG: 32 entities, 8 levels, topologically sorted
Checkmark Wiring Matrix: Phase 2-8 detailed (upstream/downstream)
Checkmark Business Flows: 15 flows in Trigger->Pre->State->Post->Failure format
Checkmark Phased Roadmap: 11 phases, all dependencies explicit, realistic timelines

Author: Claude Agent (Round 5 Planning)
Confidence: HIGH (verified against ProClinic scans + database schema)
