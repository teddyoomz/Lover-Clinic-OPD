// ─── Expense Report Metric Specs — Phase 16.7 (2026-04-29 session 33) ─────
//
// Mirrors the Phase 16.2-bis ClinicReport metric-spec pattern. Each section
// + summary tile + key column carries Thai explanation + computation contract
// + branchAware flag for the inline MetricExplanationPopover.
//
// Used by:
//   - ExpenseReportTab.jsx — passes spec[id] to ExpenseSectionTable + summary tiles
//   - tests/phase16.7-* — assert every rendered surface has a matching spec
//
// Rule C1 — frozen object. Rule D — every metric carries computation contract
// for the audit test bank. Rule I — branchAware flag is the test oracle for
// flow-simulate.

/** @type {Readonly<Record<string, import('./clinicReportMetricSpecs.js').ClinicReportMetricSpec>>} */
export const EXPENSE_REPORT_METRIC_SPECS = Object.freeze({
  // ─── Summary tiles ──────────────────────────────────────────────────────
  totalAll: Object.freeze({
    id: 'expenseTotalAll',
    label: 'รายจ่ายรวม',
    explanation: 'รายจ่ายทั้งหมดในช่วงเวลาที่เลือก รวมทุกหมวดหมู่ ไม่นับรายการที่ยกเลิก (status=void)',
    dataSource: 'be_expenses (กรองตามวันที่ + สาขา; status≠void)',
    computation: 'รวม(expense.amount) ของทุก expense ที่อยู่ในช่วง [from, to] + branchId ใน filter.branchIds',
    branchAware: true,
  }),
  totalDoctorDf: Object.freeze({
    id: 'expenseTotalDoctorDf',
    label: 'ค่ามือแพทย์รวม',
    explanation: 'ค่ามือแพทย์ทั้งหมด คำนวณจาก be_treatments.detail.dfEntries[] ผ่าน dfPayoutAggregator (canonical Phase 14 source)',
    dataSource: 'be_treatments × be_doctors × be_df_groups (dfPayoutAggregator)',
    computation: 'รวม totalDf ของทุก doctorRow ที่ position="แพทย์" จาก dfPayoutAggregator',
    branchAware: true,
  }),
  totalStaffDf: Object.freeze({
    id: 'expenseTotalStaffDf',
    label: 'ค่ามือผู้ช่วย+พนักงานรวม',
    explanation: 'ค่ามือผู้ช่วยแพทย์ทั้งหมด + ค่ามือพนักงาน (booked แบบ manual ใน be_expenses category="ค่ามือ")',
    dataSource: 'be_treatments × be_doctors (ผู้ช่วยแพทย์) + be_expenses category=ค่ามือ',
    computation: 'รวม df column ของทุก staff row ที่ position="ผู้ช่วยแพทย์" หรือ position other',
    branchAware: true,
  }),
  totalCount: Object.freeze({
    id: 'expenseTotalCount',
    label: 'จำนวนรายการ',
    explanation: 'จำนวนรายการรายจ่ายทั้งหมดในช่วงเวลาที่เลือก หลังกรองสาขาแล้ว',
    dataSource: 'be_expenses count',
    computation: 'นับ expense ที่ status≠void + อยู่ในช่วง [from, to] + branchId ตรง',
    branchAware: true,
  }),

  // ─── Section headers ────────────────────────────────────────────────────
  sectionDoctors: Object.freeze({
    id: 'expenseSectionDoctors',
    label: 'รายจ่ายแพทย์',
    explanation: 'แสดงค่ามือ + ค่านั่ง + เงินเดือน + รายจ่ายอื่นๆ ของแพทย์ทุกคนในระบบ (be_doctors.position="แพทย์")',
    dataSource: 'be_doctors (position=แพทย์) × be_treatments × be_expenses',
    computation: 'แต่ละแถวรวมจาก: ค่านั่ง (categoryName matches /ค่านั่ง/) + ค่ามือ DF (dfEntries) + เงินเดือน (categoryName matches /เงินเดือน|โบนัส/) + รายจ่ายอื่นๆ; กรองตาม branchId',
    branchAware: true,
  }),
  sectionStaff: Object.freeze({
    id: 'expenseSectionStaff',
    label: 'รายจ่ายพนักงาน + ผู้ช่วย',
    explanation: 'แสดงค่ามือ + เงินเดือน + รายจ่ายอื่นๆ ของพนักงาน (be_staff) + ผู้ช่วยแพทย์ (be_doctors.position="ผู้ช่วยแพทย์")',
    dataSource: 'be_staff + be_doctors (position=ผู้ช่วยแพทย์) × be_treatments × be_expenses',
    computation: 'รวม df + salary + other ต่อคน; ผู้ช่วยแพทย์อ่าน DF จาก dfEntries เหมือนแพทย์ พนักงานทั่วไปอ่านจาก be_expenses category=ค่ามือ',
    branchAware: true,
  }),
  sectionCategories: Object.freeze({
    id: 'expenseSectionCategories',
    label: 'รายจ่ายตามหมวดหมู่',
    explanation: 'รวมรายจ่ายตามหมวดหมู่ (categoryName) เช่น Lab, ค่านั่งแพทย์, สินค้าสิ้นเปลือง พร้อมจำนวนรายการและยอดรวม',
    dataSource: 'be_expenses group by categoryName',
    computation: 'group ตาม categoryName, นับจำนวน + รวม amount',
    branchAware: true,
  }),
  sectionProducts: Object.freeze({
    id: 'expenseSectionProducts',
    label: 'ต้นทุนสินค้า',
    explanation: 'ต้นทุนสินค้านำเข้าสะสมในช่วงเวลาที่เลือก (deferred to Phase 16.7-bis — ต้องมี cost cascade audit ก่อน)',
    dataSource: 'be_central_stock_orders / be_stock_movements (DEFERRED)',
    computation: 'จะเปิดในรุ่นถัดไป',
    branchAware: true,
  }),
});
