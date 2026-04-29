// ─── Clinic Report Metric Specs — Phase 16.2-bis (2026-04-29 session 33) ────
//
// Single source of truth for every metric rendered on `tab=clinic-report`.
// Each entry pairs UI label + Thai explanation + data-source string +
// computation contract + branchAware flag.
//
// Used by:
//   - ClinicReportTab.jsx — passes spec[id] to KpiTile / RankedTableWidget /
//     ChartTile via the `metricSpec` prop.
//   - tests/phase16.2-bis-metric-explanations.test.jsx — asserts every
//     widget rendered in the tab has a matching spec entry.
//   - tests/phase16.2-bis-branch-awareness-audit.test.js — uses
//     spec.branchAware as the contract that filterSalesForReport,
//     filterExpensesForReport, and the 4 fixed helpers must respect.
//
// Iron-clad refs:
//   C1 — frozen object (readonly). Mutating it at runtime should throw.
//   D  — every metric carries computation string that the per-metric audit
//        test asserts matches the helper/aggregator wiring.
//   I  — full-flow simulate uses spec.branchAware as the test oracle.
//
// **Adding a new metric**: add a key here + add it to the matching widget
// in ClinicReportTab.jsx (or your new tab) + extend the test bank to assert
// the spec is referenced.

/**
 * @typedef {Object} ClinicReportMetricSpec
 * @property {string} id              — matches the render key (e.g. 'revenueYtd')
 * @property {string} label           — Thai label shown next to value
 * @property {string} explanation     — 1-2 sentence Thai description; shown inside popover
 * @property {string} dataSource      — Thai data-source description (which collections feed it)
 * @property {string} computation     — Thai computation contract (formula in plain words)
 * @property {boolean} branchAware    — TRUE iff metric respects filter.branchIds
 */

/** @type {Readonly<Record<string, ClinicReportMetricSpec>>} */
export const CLINIC_REPORT_METRIC_SPECS = Object.freeze({
  // ─── Row 1: Revenue + customer KPIs ──────────────────────────────────────
  revenueYtd: Object.freeze({
    id: 'revenueYtd',
    label: 'รายได้ YTD',
    explanation: 'รายได้รวมจากใบขายในช่วงเวลาที่เลือก หลังจากหักส่วนลดและภาษีแล้ว ใช้ field billing.netTotal บนใบขาย',
    dataSource: 'be_sales (กรองตามวันที่ + สาขา; ไม่นับใบที่ยกเลิก)',
    computation: 'รวม(sale.billing.netTotal) ของใบขายในช่วง [from, to] ที่ branchId อยู่ใน filter.branchIds',
    branchAware: true,
  }),
  momGrowth: Object.freeze({
    id: 'momGrowth',
    label: 'M-o-M %',
    explanation: 'อัตราการเติบโตของรายได้เดือนปัจจุบันเมื่อเทียบกับเดือนก่อนหน้า แสดง — เมื่อเดือนก่อนไม่มีรายได้',
    dataSource: 'be_sales (เดือนสุดท้ายของช่วง vs เดือนก่อนหน้า)',
    computation: '(รายได้เดือนล่าสุด − รายได้เดือนก่อน) ÷ รายได้เดือนก่อน × 100; null เมื่อเดือนก่อน = 0',
    branchAware: true,
  }),
  newCustomersPerMonth: Object.freeze({
    id: 'newCustomersPerMonth',
    label: 'ลูกค้าใหม่/ด.',
    explanation: 'จำนวนลูกค้าใหม่เฉลี่ยต่อเดือน คำนวณจากลูกค้าที่ลงทะเบียน (createdAt) ในช่วง หารด้วยจำนวนเดือน',
    dataSource: 'be_customers (กรองตามวันที่ลงทะเบียน + สาขา)',
    computation: 'นับลูกค้าที่ createdAt อยู่ใน [from, to] + branchId ใน filter.branchIds ÷ จำนวนเดือนของช่วง',
    branchAware: true,
  }),
  retentionRate: Object.freeze({
    id: 'retentionRate',
    label: 'Retention',
    explanation: 'อัตราการกลับมาใช้บริการของลูกค้า คำนวณจาก cohort ที่มีโอกาสกลับมาได้อย่างน้อย 1 เดือนหลังลงทะเบียน',
    dataSource: 'be_customers × be_sales (cohort matrix)',
    computation: '(จำนวนลูกค้าที่ซื้อ ≥ 2 เดือน ÷ จำนวนลูกค้า cohort ที่มี offset ≥ 1) × 100',
    branchAware: true,
  }),

  // ─── Row 2: Operations KPIs ──────────────────────────────────────────────
  avgTicket: Object.freeze({
    id: 'avgTicket',
    label: 'Avg ticket',
    explanation: 'มูลค่าเฉลี่ยต่อใบขายในช่วงเวลาที่เลือก ใช้ดูว่าลูกค้าจ่ายเฉลี่ยครั้งละเท่าไร',
    dataSource: 'be_sales (กรองตามวันที่ + สาขา)',
    computation: 'รายได้รวม ÷ จำนวนใบขายที่ไม่ยกเลิก',
    branchAware: true,
  }),
  courseUtilization: Object.freeze({
    id: 'courseUtilization',
    label: 'Course Util',
    explanation: 'อัตราการใช้คอร์สที่ลูกค้าซื้อแล้ว คำนวณจาก qty ที่ใช้ไปแล้วเทียบกับ qty ที่ซื้อ ไม่นับคอร์สที่ยกเลิก/คืนเงิน/แลกเปลี่ยน',
    dataSource: 'be_customers[].courses[] (qty string parse จาก courseUtils.parseQtyString)',
    computation: '((total − remaining) ÷ total) × 100; ข้ามคอร์ส status ที่ตรง /cancel|refund|exchang/',
    branchAware: true,
  }),
  noShowRate: Object.freeze({
    id: 'noShowRate',
    label: 'No-show %',
    explanation: 'อัตราการไม่มาตามนัด คำนวณจาก be_appointments ที่ status เป็น noshow / cancelled / missed',
    dataSource: 'be_appointments × be_sales (appointmentAnalysisAggregator)',
    computation: 'จำนวน noshow ÷ จำนวนนัดทั้งหมด × 100 ในช่วงเวลาที่เลือก',
    branchAware: true,
  }),
  expenseRatio: Object.freeze({
    id: 'expenseRatio',
    label: 'Expense %',
    explanation: 'อัตราส่วนรายจ่ายต่อรายได้ ค่าน้อยกว่า 100% = มีกำไร ค่ามากกว่า = ขาดทุน',
    dataSource: 'be_expenses ÷ be_sales (ทั้งคู่กรองตามวันที่ + สาขา)',
    computation: '(รวม(expense.amount) ÷ รวม(sale.billing.netTotal)) × 100',
    branchAware: true,
  }),

  // ─── Charts ─────────────────────────────────────────────────────────────
  revenueTrend: Object.freeze({
    id: 'revenueTrend',
    label: 'Revenue trend M-o-M',
    explanation: 'แนวโน้มรายได้รายเดือนตลอดช่วงที่เลือก ใช้ดู seasonality และ growth pattern',
    dataSource: 'be_sales (bucket per month, กรองตามสาขา)',
    computation: 'รวม sale.billing.netTotal ตามเดือน YYYY-MM',
    branchAware: true,
  }),
  newCustomersTrend: Object.freeze({
    id: 'newCustomersTrend',
    label: 'New customers M-o-M',
    explanation: 'แนวโน้มจำนวนลูกค้าใหม่รายเดือน ใช้ดูประสิทธิภาพการตลาดและ acquisition',
    dataSource: 'be_customers (bucket by createdAt month, กรองตามสาขา)',
    computation: 'นับลูกค้าที่ createdAt ตกในเดือน YYYY-MM แต่ละเดือน',
    branchAware: true,
  }),
  cashFlow: Object.freeze({
    id: 'cashFlow',
    label: 'Cash flow',
    explanation: 'กระแสเงินสดสุทธิรายเดือน (รายได้ − รายจ่าย) ค่าบวก = เงินเข้ามากกว่าออก',
    dataSource: 'be_sales − be_expenses (ทั้งคู่ bucket per month, กรองตามสาขา)',
    computation: 'รวม(sale.billing.netTotal) − รวม(expense.amount) แต่ละเดือน',
    branchAware: true,
  }),
  retentionCohort: Object.freeze({
    id: 'retentionCohort',
    label: 'Retention cohort',
    explanation: 'แผนภาพ cohort retention แต่ละแถว = ลูกค้าที่ลงทะเบียนเดือนนั้น แต่ละช่อง = % ที่กลับมาในเดือนถัดไป',
    dataSource: 'be_customers × be_sales (cohort matrix)',
    computation: 'แต่ละ cohort คำนวณ (returned ÷ cohort size) × 100 ทุก offset เดือน',
    branchAware: true,
  }),
  branchComparison: Object.freeze({
    id: 'branchComparison',
    label: 'Branch comparison',
    explanation: 'เปรียบเทียบรายได้และจำนวนใบขายแต่ละสาขา จัดอันดับสาขาที่ทำยอดสูงสุด',
    dataSource: 'be_sales group by branchId (กรองสาขาที่อยู่ใน filter.branchIds)',
    computation: 'รวม sale.billing.netTotal + นับใบขาย ต่อ branchId; เรียงตาม revenue desc',
    branchAware: true,
  }),

  // ─── Ranked tables ──────────────────────────────────────────────────────
  topServices: Object.freeze({
    id: 'topServices',
    label: 'Top-10 services',
    explanation: 'คอร์ส 10 อันดับแรกที่สร้างรายได้สูงสุด รวมยอดข้าม procedureType + category เดียวกัน (กัน duplicates)',
    dataSource: 'be_sales × be_courses (revenueAnalysisAggregator)',
    computation: 'group ตาม courseName, รวม lineTotal + qty ทุกแถวที่ชื่อตรงกัน, sort desc',
    branchAware: true,
  }),
  topDoctors: Object.freeze({
    id: 'topDoctors',
    label: 'Top-10 doctors',
    explanation: 'แพทย์ 10 อันดับที่สร้างยอดขายสูงสุด ดึง doctorId จาก treatment ที่เชื่อมกับใบขายผ่าน linkedSaleId แล้ว aggregate',
    dataSource: 'be_sales × be_treatments × be_doctors (staffSalesAggregator)',
    computation: 'enrich sale.doctorId จาก treatment.detail.linkedSaleId join → group ตาม doctorId → รวม netTotal → top 10',
    branchAware: true,
  }),
  topProducts: Object.freeze({
    id: 'topProducts',
    label: 'Top-10 products',
    explanation: 'สินค้าและยา 10 อันดับที่ขายดีที่สุดในช่วงเวลาที่เลือก คำนวณจาก line item บนใบขาย',
    dataSource: 'be_sales[].items.products[] + be_sales[].items.medications[]',
    computation: 'group ตาม productName, รวม lineTotal + qty, sort desc; ข้ามใบขายที่ยกเลิก',
    branchAware: true,
  }),
});

/**
 * Look up a metric spec by id with safe fallback.
 *
 * Returns `null` if the id is unknown — caller treats this as "no popover"
 * (graceful degradation; widget still renders, just without explanation).
 *
 * @param {string} id
 * @returns {ClinicReportMetricSpec|null}
 */
export function getMetricSpec(id) {
  if (!id || typeof id !== 'string') return null;
  return CLINIC_REPORT_METRIC_SPECS[id] || null;
}

/**
 * List of all metric ids — useful for tests that iterate every spec.
 *
 * @returns {string[]}
 */
export function listMetricIds() {
  return Object.keys(CLINIC_REPORT_METRIC_SPECS);
}
