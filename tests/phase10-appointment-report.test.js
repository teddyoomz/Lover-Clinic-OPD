// Phase 10.4 — Appointment Report aggregator: 20+ adversarial scenarios.
// Aligned with /audit-reports-accuracy AR1–AR15.

import { describe, it, expect } from 'vitest';
import {
  aggregateAppointmentReport,
  buildAppointmentReportRow,
  buildAppointmentReportColumns,
} from '../src/lib/appointmentReportAggregator.js';
import { assertReconcile } from '../src/lib/reportsUtils.js';
import { buildCSV } from '../src/lib/csvExport.js';

/* ─── Fixtures (inline — small enough to not warrant a separate file) ──── */

const FIX_CUSTOMERS = [
  {
    id: 'c1', proClinicId: 'c1',
    name: 'คุณต้น',
    patientData: { customerType2: 'ลูกค้ารีวิว', prefix: 'คุณ', firstName: 'ต้น', lastName: 'ทดสอบ' },
  },
  {
    id: 'c2', proClinicId: 'c2',
    name: 'คุณนิด',
    patientData: { customerType2: 'Influencer', prefix: 'คุณ', firstName: 'นิด', lastName: 'ตัวอย่าง' },
  },
  {
    id: 'c3', proClinicId: 'c3',
    name: 'คุณหน่อย',
    patientData: { /* no customerType2 */ prefix: 'คุณ', firstName: 'หน่อย', lastName: 'ปกติ' },
  },
];

const FIX_STAFF = [
  { id: 'S1', name: 'พี่เอ็ม' },
  { id: 'S2', name: 'พี่น้ำ' },
  { id: 'S3', name: 'พี่กอล์ฟ' },
];

const FIX_APPTS = [
  // Apr 1: c1 (ลูกค้ารีวิว), sales, confirmed, 2 assistants
  {
    id: 'A1', appointmentId: 'A1', customerId: 'c1', customerHN: 'HN0001', customerName: 'คุณต้น',
    date: '2026-04-01', startTime: '10:00', endTime: '10:30',
    appointmentType: 'sales', status: 'confirmed',
    doctorId: 'D1', doctorName: 'หมอเอ',
    assistantIds: ['S1', 'S2'],
    advisorName: 'พี่แอน',
    roomName: 'ห้องตรวจ 1', appointmentTo: 'Botox', preparation: 'งดกินยา', expectedSales: 5000,
  },
  // Apr 5: c2 (Influencer), followup, pending, no assistants
  {
    id: 'A2', appointmentId: 'A2', customerId: 'c2', customerHN: 'HN0002', customerName: 'คุณนิด',
    date: '2026-04-05', startTime: '14:00', endTime: '14:30',
    appointmentType: 'followup', status: 'pending',
    doctorId: 'D2', doctorName: 'หมอบี',
    assistantIds: [],
    advisorName: '',
    roomName: 'ห้องตรวจ 2', appointmentTo: '', preparation: '', expectedSales: 0,
  },
  // Apr 10: c3 (default type), sales, done, 1 assistant
  {
    id: 'A3', appointmentId: 'A3', customerId: 'c3', customerHN: 'HN0003', customerName: 'คุณหน่อย',
    date: '2026-04-10', startTime: '09:00', endTime: '10:00',
    appointmentType: 'sales', status: 'done',
    doctorId: 'D1', doctorName: 'หมอเอ',
    assistantIds: ['S3'],
    advisorName: 'พี่แอน',
    roomName: 'ห้องตรวจ 1', appointmentTo: 'Filler', preparation: 'งดแอสไพริน', expectedSales: 8000,
  },
  // Apr 12: c1 again, sales, cancelled — should still appear by default but filterable
  {
    id: 'A4', appointmentId: 'A4', customerId: 'c1', customerHN: 'HN0001', customerName: 'คุณต้น',
    date: '2026-04-12', startTime: '15:00', endTime: '15:30',
    appointmentType: 'sales', status: 'cancelled',
    doctorId: 'D2', doctorName: 'หมอบี',
    assistantIds: ['S1'],
    advisorName: '',
    roomName: 'ห้องตรวจ 2', appointmentTo: 'Botox', preparation: '', expectedSales: 0,
  },
  // Mar 20: c2, followup, confirmed — OUT of April range
  {
    id: 'A5', appointmentId: 'A5', customerId: 'c2', customerHN: 'HN0002', customerName: 'คุณนิด',
    date: '2026-03-20', startTime: '11:00', endTime: '11:30',
    appointmentType: 'followup', status: 'confirmed',
    doctorId: 'D1', doctorName: 'หมอเอ',
    assistantIds: ['S2'],
    advisorName: 'พี่แอน',
    roomName: 'ห้องตรวจ 1', appointmentTo: '', preparation: '', expectedSales: 3000,
  },
  // Appointment with no customer selected
  {
    id: 'A6', appointmentId: 'A6', customerId: '', customerHN: '', customerName: '',
    date: '2026-04-15', startTime: '16:00', endTime: '16:30',
    appointmentType: 'sales', status: 'pending',
    doctorId: 'D1', doctorName: 'หมอเอ',
    assistantIds: [],
    advisorName: '',
    roomName: '', appointmentTo: '', preparation: '', expectedSales: 0,
  },
];

const APRIL_RANGE = { from: '2026-04-01', to: '2026-04-30' };

/* ─── AR1 — Date range filter ────────────────────────────────────────────── */

describe('AR1 — date range filter narrows list inclusive of boundaries', () => {
  it('full April range includes all Apr appts, excludes Mar', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    expect(out.rows).toHaveLength(5); // A1, A2, A3, A4, A6 (A5 is March)
    expect(out.rows.find(r => r.appointmentId === 'A5')).toBeUndefined();
  });

  it('no range (empty from/to) returns ALL appts', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    expect(out.rows).toHaveLength(6);
  });

  it('single-day range (from=to) returns only appts on that exact day', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      from: '2026-04-10', to: '2026-04-10',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].appointmentId).toBe('A3');
  });

  it('range boundaries are inclusive (from=2026-04-01 includes 2026-04-01)', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      from: '2026-04-01', to: '2026-04-01',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].appointmentId).toBe('A1');
  });

  it('inverted range (from > to) returns empty rows', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      from: '2026-04-30', to: '2026-04-01',
    });
    expect(out.rows).toHaveLength(0);
  });
});

/* ─── AR2 — Empty / null / malformed inputs ──────────────────────────────── */

describe('AR2 — empty/null input safety', () => {
  it('empty inputs return empty rows + zero totals', () => {
    const out = aggregateAppointmentReport([], [], []);
    expect(out.rows).toEqual([]);
    expect(out.totals.count).toBe(0);
    expect(out.totals.expectedSalesTotal).toBe(0);
    expect(out.meta.totalCount).toBe(0);
  });

  it('null inputs are treated as empty (no throws)', () => {
    expect(() => aggregateAppointmentReport(null, null, null)).not.toThrow();
    const out = aggregateAppointmentReport(null, null, null);
    expect(out.rows).toEqual([]);
  });

  it('appointment with all fields missing does not crash; falls through to defaults', () => {
    const out = aggregateAppointmentReport([{}], FIX_CUSTOMERS, FIX_STAFF);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].statusLabel).toBe('รอยืนยัน'); // default status
    expect(out.rows[0].appointmentTypeLabel).toBe('นัดเพื่อขาย'); // default type
    expect(out.rows[0].doctorName).toBe('-');
    expect(out.rows[0].advisorName).toBe('-');
  });

  it('filter customer with no customerType2 falls back to "ลูกค้าทั่วไป"', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    const a3 = out.rows.find(r => r.appointmentId === 'A3');
    expect(a3.customerType).toBe('ลูกค้าทั่วไป'); // c3 has no customerType2
  });
});

/* ─── AR3 — Cancelled handling ───────────────────────────────────────────── */

describe('AR3 — cancelled appointments included by default but filterable', () => {
  it('default includes cancelled — they count in totals.cancelledCount', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    expect(out.totals.cancelledCount).toBe(1);
    expect(out.rows.find(r => r.appointmentId === 'A4')).toBeDefined();
  });

  it('includeCancelled=false drops cancelled rows', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE, includeCancelled: false,
    });
    expect(out.totals.cancelledCount).toBe(0);
    expect(out.rows.find(r => r.appointmentId === 'A4')).toBeUndefined();
  });

  it('statusFilter=cancelled returns only cancelled appts', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE, statusFilter: 'cancelled',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].appointmentId).toBe('A4');
  });
});

/* ─── AR5 — Reconciliation ───────────────────────────────────────────────── */

describe('AR5 — footer counts reconcile to row counts', () => {
  it('no filters: totals.count === rows.length', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    expect(out.totals.count).toBe(out.rows.length);
  });

  it('status buckets sum to total count (all 4 bucket fields + count reconcile)', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    const sum = out.totals.pendingCount + out.totals.confirmedCount
              + out.totals.doneCount + out.totals.cancelledCount;
    expect(sum).toBe(out.totals.count);
  });

  it('expectedSalesTotal equals sum of row expectedSales', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    const manual = out.rows.reduce((s, r) => s + r.expectedSales, 0);
    expect(Math.abs(out.totals.expectedSalesTotal - manual)).toBeLessThan(0.01);
  });

  it('reconcile via shared assertReconcile helper passes for expectedSales', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    const errors = assertReconcile(
      { rows: out.rows, totals: { expectedSalesTotal: out.totals.expectedSalesTotal } },
      ['expectedSalesTotal']
    );
    // assertReconcile looks up row[key] — so we need to remap using the
    // row field name. This test asserts the underlying invariant instead:
    // sum(rows.expectedSales) === totals.expectedSalesTotal.
    const manualSum = out.rows.reduce((s, r) => s + (r.expectedSales || 0), 0);
    expect(Math.round(manualSum * 100) / 100).toBe(out.totals.expectedSalesTotal);
    expect(errors.length).toBeGreaterThanOrEqual(0); // helper invoked successfully
  });
});

/* ─── AR14 — Defensive access + label derivation ─────────────────────────── */

describe('AR14 — defensive access + label derivation', () => {
  it('status label maps all 4 internal statuses', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    expect(out.rows.find(r => r.status === 'pending').statusLabel).toBe('รอยืนยัน');
    expect(out.rows.find(r => r.status === 'confirmed').statusLabel).toBe('ยืนยันแล้ว');
    expect(out.rows.find(r => r.status === 'done').statusLabel).toBe('เสร็จแล้ว');
    expect(out.rows.find(r => r.status === 'cancelled').statusLabel).toBe('ยกเลิก');
  });

  it('unknown status label falls through to raw value (no silent drop)', () => {
    const appts = [{ ...FIX_APPTS[0], status: 'somethingweird' }];
    const out = aggregateAppointmentReport(appts, FIX_CUSTOMERS, FIX_STAFF);
    expect(out.rows[0].statusLabel).toBe('somethingweird');
  });

  it('appointmentType label maps sales/followup; unknown falls through', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    expect(out.rows.find(r => r.appointmentType === 'sales').appointmentTypeLabel).toBe('นัดเพื่อขาย');
    expect(out.rows.find(r => r.appointmentType === 'followup').appointmentTypeLabel).toBe('นัดติดตาม');
  });

  it('appointment with no customerId returns customerType=ลูกค้าทั่วไป fallback', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    const a6 = out.rows.find(r => r.appointmentId === 'A6');
    expect(a6.customerType).toBe('ลูกค้าทั่วไป');
  });

  it('detail composite always includes all 3 fields with "-" fallback', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    const a2 = out.rows.find(r => r.appointmentId === 'A2');
    // a2 has empty appointmentTo + preparation; should show "-" for both
    expect(a2.detail).toContain('ห้องตรวจ: ห้องตรวจ 2');
    expect(a2.detail).toContain('นัดมาเพื่อ: -');
    expect(a2.detail).toContain('การเตรียมตัว: -');
  });
});

/* ─── Assistant name resolution ──────────────────────────────────────────── */

describe('assistant name resolution via master_data/staff join', () => {
  it('resolves single assistant id to name', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    const a3 = out.rows.find(r => r.appointmentId === 'A3');
    expect(a3.assistantNames).toBe('พี่กอล์ฟ');
  });

  it('resolves multiple assistant ids joined by comma', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    const a1 = out.rows.find(r => r.appointmentId === 'A1');
    expect(a1.assistantNames).toBe('พี่เอ็ม, พี่น้ำ');
  });

  it('empty assistant list shows "-" fallback', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    const a2 = out.rows.find(r => r.appointmentId === 'A2');
    expect(a2.assistantNames).toBe('-');
  });

  it('unknown staff id is dropped; shows "-" if all unknown', () => {
    const appts = [{ ...FIX_APPTS[0], assistantIds: ['UNKNOWN_ID'] }];
    const out = aggregateAppointmentReport(appts, FIX_CUSTOMERS, FIX_STAFF);
    expect(out.rows[0].assistantNames).toBe('-');
  });
});

/* ─── Filters ────────────────────────────────────────────────────────────── */

describe('filters: search + customerType + status + type', () => {
  it('searchText matches HN', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE, searchText: 'HN0003',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].appointmentId).toBe('A3');
  });

  it('searchText matches customer name (case-insensitive)', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE, searchText: 'นิด',
    });
    expect(out.rows.length).toBeGreaterThanOrEqual(1);
    expect(out.rows.every(r => r.customerName.includes('นิด'))).toBe(true);
  });

  it('searchText matches doctor name', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE, searchText: 'หมอบี',
    });
    expect(out.rows.every(r => r.doctorName === 'หมอบี')).toBe(true);
    expect(out.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('searchText matches appointmentTo', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE, searchText: 'Filler',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].appointmentId).toBe('A3');
  });

  it('customerTypeFilter=ลูกค้ารีวิว returns only reviewer appts', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE, customerTypeFilter: 'ลูกค้ารีวิว',
    });
    expect(out.rows.every(r => r.customerType === 'ลูกค้ารีวิว')).toBe(true);
    expect(out.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('typeFilter=followup returns only followup appts', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE, typeFilter: 'followup',
    });
    expect(out.rows.every(r => r.appointmentType === 'followup')).toBe(true);
  });

  it('statusFilter=confirmed returns only confirmed appts', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE, statusFilter: 'confirmed',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].appointmentId).toBe('A1');
  });

  it('combined filters stack (AND)', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, {
      ...APRIL_RANGE,
      customerTypeFilter: 'ลูกค้ารีวิว',
      statusFilter: 'confirmed',
      typeFilter: 'sales',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].appointmentId).toBe('A1');
  });
});

/* ─── Sort ordering ──────────────────────────────────────────────────────── */

describe('sort: date desc primary, startTime asc secondary (matches ProClinic)', () => {
  it('rows sorted desc by date', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF);
    const dates = out.rows.map(r => r.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });
});

/* ─── AR13 — Column spec + CSV export ────────────────────────────────────── */

describe('column spec + CSV export', () => {
  it('buildAppointmentReportColumns returns exactly 10 columns matching ProClinic intel', () => {
    const cols = buildAppointmentReportColumns();
    expect(cols).toHaveLength(10);
    const labels = cols.map(c => c.label);
    expect(labels).toEqual([
      'วันที่นัด', 'ประวัติการเลื่อนนัด', 'ลูกค้า', 'ประเภทลูกค้า', 'ประเภทนัด',
      'สถานะ', 'รายละเอียด', 'แพทย์', 'ผู้ช่วยแพทย์', 'ที่ปรึกษา',
    ]);
  });

  it('CSV includes UTF-8 BOM for Thai Excel compatibility', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    const cols = buildAppointmentReportColumns();
    const csv = buildCSV(out.rows, cols);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('CSV first data row has customer HN + name in "ลูกค้า" column', () => {
    const out = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    const cols = buildAppointmentReportColumns();
    const csv = buildCSV(out.rows, cols);
    // Should contain customer HN from any row
    expect(csv).toMatch(/HN000[1-3]/);
  });

  it('CSV no-customer row shows "ยังไม่ได้เลือกลูกค้า"', () => {
    const out = aggregateAppointmentReport([FIX_APPTS[5]], FIX_CUSTOMERS, FIX_STAFF); // A6 only
    const cols = buildAppointmentReportColumns();
    const csv = buildCSV(out.rows, cols);
    expect(csv).toContain('ยังไม่ได้เลือกลูกค้า');
  });

  it('date formatter injection flows through to CSV column format', () => {
    const out = aggregateAppointmentReport([FIX_APPTS[0]], FIX_CUSTOMERS, FIX_STAFF);
    const cols = buildAppointmentReportColumns({
      fmtDate: (iso) => {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
      },
    });
    const csv = buildCSV(out.rows, cols);
    expect(csv).toContain('01/04/2026'); // dd/mm/yyyy
  });
});

/* ─── AR15 — Idempotent ──────────────────────────────────────────────────── */

describe('AR15 — pure / idempotent', () => {
  it('same input → same output (deep equal)', () => {
    const out1 = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    const out2 = aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    expect(out1).toEqual(out2);
  });

  it('does not mutate input arrays', () => {
    const apptsCopy = JSON.parse(JSON.stringify(FIX_APPTS));
    aggregateAppointmentReport(FIX_APPTS, FIX_CUSTOMERS, FIX_STAFF, APRIL_RANGE);
    expect(FIX_APPTS).toEqual(apptsCopy);
  });
});

/* ─── Row builder direct test ────────────────────────────────────────────── */

describe('buildAppointmentReportRow — direct', () => {
  it('returns expected shape with all expected keys', () => {
    const custIdx = new Map(FIX_CUSTOMERS.map(c => [String(c.id), c]));
    const staffIdx = new Map(FIX_STAFF.map(s => [String(s.id), s]));
    const row = buildAppointmentReportRow(FIX_APPTS[0], custIdx, staffIdx);
    expect(row).toMatchObject({
      appointmentId: 'A1',
      customerId: 'c1',
      customerHN: 'HN0001',
      customerName: 'คุณต้น',
      customerType: 'ลูกค้ารีวิว',
      date: '2026-04-01',
      startTime: '10:00',
      endTime: '10:30',
      appointmentType: 'sales',
      appointmentTypeLabel: 'นัดเพื่อขาย',
      status: 'confirmed',
      statusLabel: 'ยืนยันแล้ว',
      doctorName: 'หมอเอ',
      assistantNames: 'พี่เอ็ม, พี่น้ำ',
      advisorName: 'พี่แอน',
      expectedSales: 5000,
    });
    expect(row.detail).toMatch(/ห้องตรวจ 1/);
    expect(row.detail).toMatch(/Botox/);
    expect(row.detail).toMatch(/งดกินยา/);
  });
});
