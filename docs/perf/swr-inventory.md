# SWR Inventory — staff-app read-strategy classification (AV206.b)

> C1 (2026-07-07 instant cold-start, spec Q3=B). Every staff surface with a
> mount-time one-shot load is classified here. The classifier test
> `tests/instant-coldstart-av206-classifier.test.js` enforces this table:
> ADOPT files must import `swrList`/`swrRun`/`useSwrLoad`; SANCTIONED files
> carry their reason here (no marker comment needed — this table IS the
> closed list). New staff tabs with mount-time one-shot loads must be added
> to one of the groups or the classifier fails.

## LISTENER — SWR free via persistentLocalCache (layer 0, no code change)

Every `onSnapshot`/`useBranchAwareListener` surface fires a cache snapshot
instantly since A1. Includes (not exhaustive — listener surfaces are
inherently covered): AdminDashboard opd_sessions queue + chat panels +
calendar month listener, CustomerDetailView 6 listeners, StockBalancePanel
products map, StaffChat, recall tabs, branch/system-config/clinic-settings
listeners.

## ADOPT — mount-blocking one-shot list loads → swrList (cache paint + server correct + SyncIndicator)

| ไฟล์ | Loads adopted |
|---|---|
| `src/components/admin/AppointmentHubView.jsx` | loadCore + loadEnrichment (B2 — swrRun, the reported pain) |
| `src/components/backend/SaleTab.jsx` | loadSales (getAllSales) |
| `src/components/backend/CustomerListTab.jsx` | mount customers+branches (getAllCustomers + listBranches) |
| `src/components/backend/ProductsTab.jsx` | reload (listProducts) |
| `src/components/backend/CoursesTab.jsx` | reload (listCourses) |
| `src/components/backend/MembershipPanel.jsx` | loadMemberships + loadCardTypes + loadCustomers |
| `src/components/backend/DepositPanel.jsx` | loadList (getAllDeposits) |
| `src/components/backend/WalletPanel.jsx` | loadCustomers + wallet types |
| `src/components/backend/PointsPanel.jsx` | loadCustomers |
| `src/components/backend/MovementLogPanel.jsx` | movements list (listStockMovements) |
| `src/components/backend/DoctorSchedulesTab.jsx` | listDoctors + loadSchedules |
| `src/components/backend/EmployeeSchedulesTab.jsx` | listStaff + loadSchedules |
| `src/components/TreatmentFormPage.jsx` | fetchFormData 2-pass ผ่าน swrRun (AV208 — hydration-once + save-gate; ดู tests/tfp-entry-swr-contract.test.js) |

## SANCTIONED — deliberately server-first (reason = the contract)

| กลุ่ม | ไฟล์ (ตัวแทน) | เหตุผล |
|---|---|---|
| Reports ทุก tab | `src/components/backend/reports/**` | ตัวเลขเงิน/สถิติที่ admin อ่านแล้วตัดสินใจ — ห้ามโชว์ค่า cache แม้ชั่วคราว (V52 BS-11 surface) |
| Stock OPERATION panels | OrderPanel, StockAdjustPanel, StockTransferPanel, StockWithdrawalPanel, CentralStockOrderPanel, CentralStockTab, CentralWarehousePanel, StockSeedPanel, OrderDetailModal, StockActionModal | operator อ่านยอดเพื่อสั่ง/ปรับ/โอน — decision-read ต้อง server-fresh (การเขียนมี tx คุ้มอยู่แล้ว แต่จอที่ใช้ตัดสินใจไม่ควร stale) |
| Modal-open loads | AppointmentFormModal, ProductGroupFormModal, QuotationFormModal, ExchangeCourseModal, CourseFormModal, DoctorFormModal, ProductFormModal, StaffFormModal, DeleteCustomerCascadeModal, ฯลฯ (ทุก modal) | action-scoped: โหลดตอน user เปิด modal เพื่อทำรายการ — ขนาดเล็ก + ต้อง fresh ณ จุดตัดสินใจ |
| Admin/destructive | BackupManagerTab, LinkRequestsTab, ScheduledTasksTab, SystemSettingsTab, SystemConfigAuditPanel, RecallCasesAdminPanel | รายการที่นำไปสู่ destructive/approval action — server truth เท่านั้น |
| Master-data small tabs | ProductGroupsTab, ProductUnitsTab, MedicalInstrumentsTab, HolidaysTab, BranchesTab, ExamRoomsTab, StaffTab, DoctorsTab, DfGroupsTab, PromotionTab, CouponTab, VoucherTab, QuotationTab, FinanceMasterTab, DocumentTemplatesTab, LineReminderHistoryPanel, OnlineSalesTab, VendorSalesTab, SmartAudienceTab | โหลดเล็ก+เร็ว + เข้าไม่บ่อย — cost/benefit ไม่คุ้ม regression risk; รอบหน้า adopt ได้ถ้า pain จริง (3 ตัวท้าย = AV208 full-scan catch 2026-07-18) |
| AdminDashboard action awaits | `src/pages/AdminDashboard.jsx` (5 จุด) | action-scoped loads (กดปุ่มแล้วค่อยโหลด) — ไม่ block cold-start paint; คิว/แชท/ปฏิทิน = listeners (ฟรีจาก layer 0) |

## กติกากลาง (AV206.c)

ห้ามใช้ข้อมูลจาก `{source:'cache'}` ใน read→decide→WRITE flow ใดๆ — เขียนเงิน/สต็อค
อ่านใน `runTransaction` (server-only, Rule T) เสมอ. `source:'cache'` ปรากฏได้เฉพาะ
ใน swrRead.js / useSwrLoad.js / display-load callsites ที่ apply → setState เท่านั้น.
