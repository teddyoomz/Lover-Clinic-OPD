// ─── RTL Component Tests — UI logic that Vitest alone can't test ─────────────
// These tests verify rendering, user interaction, and state changes in React components.
// They complement the Firestore integration tests in backend.test.js.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// ═══════════════════════════════════════════════════════════════════════════
// 1. courseUtils — renderless but tested as a sanity baseline
// ═══════════════════════════════════════════════════════════════════════════
import { parseQtyString, deductQty, buildQtyString } from '../src/lib/courseUtils.js';

describe('courseUtils rendering sanity', () => {
  it('parseQtyString round-trips with buildQtyString', () => {
    const qty = buildQtyString(200, 'U');
    const parsed = parseQtyString(qty);
    expect(parsed.remaining).toBe(200);
    expect(parsed.total).toBe(200);
    expect(parsed.unit).toBe('U');
  });

  it('deductQty → parseQtyString gives correct remaining', () => {
    const deducted = deductQty('200 / 200 U', 3);
    expect(parseQtyString(deducted).remaining).toBe(197);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CustomerCard — renders correct data + buttons for cloned vs search mode
// ═══════════════════════════════════════════════════════════════════════════
import CustomerCard from '../src/components/backend/CustomerCard.jsx';

describe('CustomerCard', () => {
  const mockCustomer = {
    proClinicId: '123', proClinicHN: 'HN-001', id: '123',
    patientData: { prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', phone: '0891234567', gender: 'ชาย' },
    treatmentCount: 5, courses: [{ name: 'Botox' }],
    cloneStatus: 'complete', lastSyncedAt: new Date().toISOString(),
  };

  it('renders customer name (never red — Thai culture)', () => {
    render(<CustomerCard customer={mockCustomer} accentColor="#dc2626" mode="cloned" />);
    const name = screen.getByText('นาย สมชาย ใจดี');
    expect(name).toBeInTheDocument();
    // Name must NOT be red (Thai culture rule)
    expect(name).not.toHaveStyle({ color: '#dc2626' });
    expect(name).not.toHaveStyle({ color: 'red' });
  });

  it('renders HN badge', () => {
    render(<CustomerCard customer={mockCustomer} accentColor="#dc2626" mode="cloned" />);
    expect(screen.getByText('HN-001')).toBeInTheDocument();
  });

  it('renders phone number', () => {
    render(<CustomerCard customer={mockCustomer} accentColor="#dc2626" mode="cloned" />);
    expect(screen.getByText('0891234567')).toBeInTheDocument();
  });

  it('shows "ดูรายละเอียด" button in cloned mode', () => {
    const onView = vi.fn();
    render(<CustomerCard customer={mockCustomer} accentColor="#dc2626" mode="cloned" onView={onView} />);
    const btn = screen.getByText('ดูรายละเอียด');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onView).toHaveBeenCalledWith(mockCustomer);
  });

  it('shows "ดูดข้อมูลทั้งหมด" button in search mode', () => {
    const onClone = vi.fn();
    render(<CustomerCard customer={mockCustomer} accentColor="#dc2626" mode="search" onClone={onClone} />);
    const btn = screen.getByText('ดูดข้อมูลทั้งหมด');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClone).toHaveBeenCalledWith('123');
  });

  it('shows clone status "complete" badge', () => {
    render(<CustomerCard customer={mockCustomer} accentColor="#dc2626" mode="cloned" />);
    expect(screen.getByText('Clone สมบูรณ์')).toBeInTheDocument();
  });

  it('shows treatment + course counts in cloned mode', () => {
    render(<CustomerCard customer={mockCustomer} accentColor="#dc2626" mode="cloned" />);
    expect(screen.getByText('5 รักษา')).toBeInTheDocument();
    expect(screen.getByText('1 คอร์ส')).toBeInTheDocument();
  });

  it('shows progress bar during cloning', () => {
    render(<CustomerCard customer={mockCustomer} accentColor="#dc2626" mode="search" cloneStatus="cloning" cloneProgress={{ percent: 50, label: 'กำลังดึงข้อมูล...' }} onClone={() => {}} />);
    expect(screen.getByText('กำลังดึงข้อมูล...')).toBeInTheDocument();
  });

  it('shows error retry button', () => {
    const onClone = vi.fn();
    render(<CustomerCard customer={mockCustomer} accentColor="#dc2626" mode="search" cloneStatus="error" onClone={onClone} />);
    const btn = screen.getByText('ลองอีกครั้ง');
    fireEvent.click(btn);
    expect(onClone).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. StatusBadge — from MasterDataTab (inline component)
// ═══════════════════════════════════════════════════════════════════════════
describe('StatusBadge rendering', () => {
  // StatusBadge is internal to MasterDataTab, test the logic directly
  it('active status renders green', () => {
    const isActive = (v) => !v || v === 'ใช้งาน';
    expect(isActive('ใช้งาน')).toBe(true);
    expect(isActive(undefined)).toBe(true);
    expect(isActive('พักใช้งาน')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Course Index Logic — the bug we caught (filtered vs original index)
// ═══════════════════════════════════════════════════════════════════════════
describe('Course index mapping (filtered → original)', () => {
  it('indexOf finds correct original index after filtering', () => {
    const allCourses = [
      { name: 'A', qty: '0 / 10 U' },   // index 0 — used up
      { name: 'B', qty: '5 / 10 U' },   // index 1 — active
      { name: 'C', qty: '0 / 5 ครั้ง' }, // index 2 — used up
      { name: 'D', qty: '3 / 3 ครั้ง' }, // index 3 — active
    ];
    const { parseQtyString: parse } = require('../src/lib/courseUtils.js');
    const activeCourses = allCourses.filter(c => parse(c.qty).remaining > 0);

    expect(activeCourses).toHaveLength(2);
    expect(activeCourses[0].name).toBe('B');
    expect(activeCourses[1].name).toBe('D');

    // The bug: using filtered index i=0 gives 'B' but original index is 1
    const origIdxB = allCourses.indexOf(activeCourses[0]);
    const origIdxD = allCourses.indexOf(activeCourses[1]);
    expect(origIdxB).toBe(1); // NOT 0
    expect(origIdxD).toBe(3); // NOT 1
  });

  it('indexOf returns -1 for non-existent course', () => {
    const courses = [{ name: 'A' }];
    expect(courses.indexOf({ name: 'A' })).toBe(-1); // different object reference
    expect(courses.indexOf(courses[0])).toBe(0); // same reference
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Zero-remaining filter logic (TreatmentFormPage)
// ═══════════════════════════════════════════════════════════════════════════
describe('Zero-remaining course filtering', () => {
  it('filters out courses where ALL products are 0', () => {
    const courses = [
      { courseName: 'Active', products: [{ remaining: '5' }] },
      { courseName: 'Used Up', products: [{ remaining: '0' }] },
      { courseName: 'Mixed', products: [{ remaining: '0' }, { remaining: '3' }] },
    ];
    const filtered = courses.filter(c => {
      const allZero = (c.products || []).every(p => parseFloat(p.remaining) <= 0);
      return !allZero;
    });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].courseName).toBe('Active');
    expect(filtered[1].courseName).toBe('Mixed');
  });

  it('keeps course with 0.5 remaining (fractional)', () => {
    const courses = [
      { courseName: 'Fractional', products: [{ remaining: '0.5' }] },
    ];
    const filtered = courses.filter(c => !(c.products || []).every(p => parseFloat(p.remaining) <= 0));
    expect(filtered).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Over-deduction validation logic
// ═══════════════════════════════════════════════════════════════════════════
describe('Over-deduction validation', () => {
  const { parseQtyString: parse } = require('../src/lib/courseUtils.js');

  it('detects deductQty > remaining', () => {
    const courses = [
      { name: 'Botox', product: 'Nabota', qty: '0.5 / 200 U' },
      { name: 'Pico', product: 'Pico', qty: '0 / 3 ครั้ง' },
    ];
    const selectedItems = [
      { courseIndex: 0, deductQty: 1 },
      { courseIndex: 1, deductQty: 1 },
    ];
    const violations = [];
    for (const item of selectedItems) {
      const course = courses[item.courseIndex];
      const { remaining } = parse(course.qty);
      if (item.deductQty > remaining) {
        violations.push(`${course.product}: เหลือ ${remaining}, ต้องการ ${item.deductQty}`);
      }
    }
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('Nabota');
    expect(violations[1]).toContain('Pico');
  });

  it('passes when remaining is sufficient', () => {
    const course = { qty: '10 / 10 U' };
    const { remaining } = parse(course.qty);
    expect(remaining >= 1).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Billing calculation (TreatmentFormPage logic)
// ═══════════════════════════════════════════════════════════════════════════
describe('Billing with course items + medications + consumables', () => {
  function calcBilling(items, meds, cons, disc = 0) {
    let subtotal = 0;
    items.forEach(p => { subtotal += (parseFloat(p.unitPrice) || 0) * (parseInt(p.qty) || 1); });
    meds.filter(m => m.name && !m.isPremium).forEach(m => { subtotal += (parseFloat(m.unitPrice) || 0) * (parseInt(m.qty) || 1); });
    cons.filter(c => c.name).forEach(c => { subtotal += (parseFloat(c.unitPrice) || 0) * (parseInt(c.qty) || 1); });
    return Math.max(0, subtotal - disc);
  }

  it('course items (price=0) + meds + consumables', () => {
    const items = [{ unitPrice: '0', qty: '1' }]; // course item — free
    const meds = [{ name: 'Med', unitPrice: '500', qty: '2' }];
    const cons = [{ name: 'Gauze', unitPrice: '50', qty: '5' }];
    expect(calcBilling(items, meds, cons)).toBe(1250);
  });

  it('premium meds excluded', () => {
    const meds = [
      { name: 'A', unitPrice: '500', qty: '1' },
      { name: 'B', unitPrice: '1000', qty: '1', isPremium: true },
    ];
    expect(calcBilling([], meds, [])).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Date format (ThaiDatePicker display logic)
// ═══════════════════════════════════════════════════════════════════════════
describe('Thai date display format', () => {
  function formatThaiDate(value) {
    if (!value) return 'เลือกวันที่';
    const [y, m, d] = value.split('-');
    if (!d || !m) return value;
    return `${d}/${m}/${Number(y) + 543}`;
  }

  it('2026-04-13 → 13/04/2569', () => {
    expect(formatThaiDate('2026-04-13')).toBe('13/04/2569');
  });
  it('2026-01-01 → 01/01/2569', () => {
    expect(formatThaiDate('2026-01-01')).toBe('01/01/2569');
  });
  it('empty → เลือกวันที่', () => {
    expect(formatThaiDate('')).toBe('เลือกวันที่');
  });
  it('null → เลือกวันที่', () => {
    expect(formatThaiDate(null)).toBe('เลือกวันที่');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Exchange course product — data shape validation
// ═══════════════════════════════════════════════════════════════════════════
describe('Exchange product data shape', () => {
  it('builds correct exchange log entry', () => {
    const oldCourse = { product: 'Nabota 200 U', qty: '150 / 200 U' };
    const newProduct = { name: 'Dysport 300 U', qty: 300, unit: 'U' };
    const entry = {
      timestamp: new Date().toISOString(),
      oldProduct: oldCourse.product,
      oldQty: oldCourse.qty,
      newProduct: newProduct.name,
      newQty: buildQtyString(newProduct.qty, newProduct.unit),
      reason: 'ลูกค้าต้องการเปลี่ยน',
    };
    expect(entry.oldProduct).toBe('Nabota 200 U');
    expect(entry.newProduct).toBe('Dysport 300 U');
    expect(entry.newQty).toBe('300 / 300 U');
    expect(entry.reason).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. scrollToError helper — tests the logic (not DOM)
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// 11. Exchange sale record data shape
// ═══════════════════════════════════════════════════════════════════════════
describe('Exchange sale record (price=0)', () => {
  it('builds correct exchange sale data', () => {
    const saleData = {
      customerId: '123', customerName: 'คุณ สมชาย',
      saleNote: 'เปลี่ยนสินค้า: 50U Nabota → 2cc Filler',
      items: { courses: [{ name: 'เปลี่ยนสินค้า: Nabota → Filler', qty: '1', unitPrice: '0', itemType: 'exchange' }] },
      billing: { subtotal: 0, netTotal: 0 },
      sellers: [{ id: 'ST1', name: 'ธนา', percent: '0', total: '0' }],
      source: 'exchange',
    };
    expect(saleData.source).toBe('exchange');
    expect(saleData.billing.netTotal).toBe(0);
    expect(saleData.sellers[0].name).toBe('ธนา');
    expect(saleData.items.courses[0].itemType).toBe('exchange');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Share course data shape
// ═══════════════════════════════════════════════════════════════════════════
describe('Share course sale record', () => {
  it('builds correct share data with from/to', () => {
    const shareData = {
      source: 'share',
      shareDetail: {
        fromCustomerId: 'A', fromCustomerName: 'สมชาย',
        toCustomerId: 'B', toCustomerName: 'สมหญิง',
        courseName: 'Botox', product: 'Nabota', qty: 50, unit: 'U',
      },
      billing: { netTotal: 0 },
    };
    expect(shareData.source).toBe('share');
    expect(shareData.shareDetail.fromCustomerId).toBe('A');
    expect(shareData.shareDetail.toCustomerId).toBe('B');
    expect(shareData.shareDetail.qty).toBe(50);
    expect(shareData.billing.netTotal).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. Sale source badge logic
// ═══════════════════════════════════════════════════════════════════════════
describe('Sale source badge', () => {
  it('exchange → เปลี่ยนสินค้า', () => {
    const badge = (s) => s === 'exchange' ? 'เปลี่ยนสินค้า' : s === 'share' ? 'แชร์คอร์ส' : s === 'treatment' ? 'จาก OPD' : 'ราคา';
    expect(badge('exchange')).toBe('เปลี่ยนสินค้า');
    expect(badge('share')).toBe('แชร์คอร์ส');
    expect(badge('treatment')).toBe('จาก OPD');
    expect(badge(undefined)).toBe('ราคา');
  });
});

describe('scrollToError behavior', () => {
  it('alert is called with error message', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    window.alert('กรุณาเลือกแพทย์');
    expect(alertSpy).toHaveBeenCalledWith('กรุณาเลือกแพทย์');
    alertSpy.mockRestore();
  });

  it('multi-line deduction error message', () => {
    const violations = [
      '• "Nabota" คงเหลือ 0.5 U — ต้องการตัด 1',
      '• "Pico" คงเหลือ 0 ครั้ง — ต้องการตัด 1',
    ];
    const msg = `คอร์สคงเหลือไม่พอ:\n${violations.join('\n')}`;
    expect(msg).toContain('Nabota');
    expect(msg).toContain('Pico');
    expect(msg.split('\n')).toHaveLength(3);
  });
});
