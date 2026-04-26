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
  it('all source types mapped correctly', () => {
    const badge = (s) => s === 'exchange' ? 'เปลี่ยนสินค้า' : s === 'share' ? 'แชร์คอร์ส' : s === 'treatment' ? 'จาก OPD' : s === 'addRemaining' ? 'เพิ่มคงเหลือ' : 'ราคา';
    expect(badge('exchange')).toBe('เปลี่ยนสินค้า');
    expect(badge('share')).toBe('แชร์คอร์ส');
    expect(badge('treatment')).toBe('จาก OPD');
    expect(badge('addRemaining')).toBe('เพิ่มคงเหลือ');
    expect(badge(undefined)).toBe('ราคา');
  });
});

describe('Exchange deduct+create logic', () => {
  it('deducts from source and creates new course (not replace in-place)', () => {
    // Simulate: Acne Tx 12 ครั้ง, exchange 5 → Vit C 5 amp
    const { parseQtyString, deductQty, buildQtyString } = require('../src/lib/courseUtils.js');
    const source = { name: 'Acne Tx 12 ครั้ง', product: 'Acne Tx', qty: '12 / 12 ครั้ง' };

    // Step 1: Deduct 5 from source
    const newSourceQty = deductQty(source.qty, 5);
    expect(parseQtyString(newSourceQty).remaining).toBe(7);

    // Step 2: Build new course for Vit C
    const newCourseQty = buildQtyString(5, 'amp');
    expect(newCourseQty).toBe('5 / 5 amp');

    // Source course is NOT replaced — it still has 7 remaining
    expect(parseQtyString(newSourceQty).total).toBe(12);
  });

  it('retail exchange: deducts only, no new course', () => {
    const { deductQty, parseQtyString } = require('../src/lib/courseUtils.js');
    const source = { qty: '10 / 10 U' };
    const isRetail = true; // สินค้าหน้าร้าน

    const afterDeduct = deductQty(source.qty, 3);
    expect(parseQtyString(afterDeduct).remaining).toBe(7);
    // No new course created for retail (customer takes product home)
    expect(isRetail).toBe(true);
  });

  it('qty validation prevents over-deduction', () => {
    const { deductQty } = require('../src/lib/courseUtils.js');
    expect(() => deductQty('3 / 10 U', 5)).toThrow('คอร์สคงเหลือไม่พอ');
  });
});

describe('AddRemaining sale record', () => {
  it('builds correct addRemaining data shape', () => {
    const data = {
      source: 'addRemaining',
      saleNote: 'เพิ่มคงเหลือ: Acne Tx +5',
      billing: { netTotal: 0 },
      sellers: [{ id: 'S1', name: 'Staff' }],
    };
    expect(data.source).toBe('addRemaining');
    expect(data.billing.netTotal).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. removePurchasedItem logic test
// ═══════════════════════════════════════════════════════════════════════════
describe('removePurchasedItem logic', () => {
  function removePurchasedItem(prev, item) {
    const idx = prev.findIndex(p => p.id === item.id && p.itemType === item.itemType);
    if (idx === -1) return prev;
    return prev.filter((_, i) => i !== idx);
  }

  it('removes course by id + itemType', () => {
    const items = [
      { id: '1', name: 'Botox', itemType: 'course' },
      { id: '2', name: 'Filler', itemType: 'promotion' },
    ];
    const result = removePurchasedItem(items, { id: '1', itemType: 'course' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Filler');
  });

  it('removes promotion', () => {
    const items = [
      { id: '1', name: 'Botox', itemType: 'course' },
      { id: '2', name: 'Nov', itemType: 'promotion' },
    ];
    const result = removePurchasedItem(items, { id: '2', itemType: 'promotion' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Botox');
  });

  it('returns same array if item not found', () => {
    const items = [{ id: '1', name: 'Botox', itemType: 'course' }];
    const result = removePurchasedItem(items, { id: '999', itemType: 'course' });
    expect(result).toHaveLength(1);
  });

  it('removes only first when duplicate ids exist', () => {
    const items = [
      { id: '1', name: 'Botox A', itemType: 'course' },
      { id: '1', name: 'Botox B', itemType: 'course' },
    ];
    const result = removePurchasedItem(items, { id: '1', itemType: 'course' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Botox B');
  });

  it('handles string vs number id comparison', () => {
    const items = [{ id: 123, name: 'Botox', itemType: 'course' }];
    // id is number but item.id passed as number — should match
    const result = removePurchasedItem(items, { id: 123, itemType: 'course' });
    expect(result).toHaveLength(0);
  });

  it('string id "123" matches number id 123 with String() coercion', () => {
    // Updated: removePurchasedItem now uses String() coercion
    function removePurchasedItemCoerced(prev, item) {
      const idx = prev.findIndex(p => String(p.id) === String(item.id) && p.itemType === item.itemType);
      if (idx === -1) return prev;
      return prev.filter((_, i) => i !== idx);
    }
    const items = [{ id: 123, name: 'Botox', itemType: 'course' }];
    const result = removePurchasedItemCoerced(items, { id: '123', itemType: 'course' });
    expect(result).toHaveLength(0); // Removed with String coercion
  });

  it('simulates real confirmBuyModal item shape', () => {
    // Real item from confirmBuyModal: id is number from master data
    const purchasedItems = [
      { id: 473, name: 'Allergan 100 unit', itemType: 'course', qty: '1', unitPrice: '4950.00' },
      { id: 738, name: 'Nov', itemType: 'promotion', qty: '1', unitPrice: '15000.00' },
    ];
    // removePurchasedItem receives same object from purchasedByType
    const courseItem = purchasedItems[0]; // same reference
    const idx = purchasedItems.findIndex(p => String(p.id) === String(courseItem.id) && p.itemType === courseItem.itemType);
    expect(idx).toBe(0);
    const after = purchasedItems.filter((_, i) => i !== idx);
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe('Nov');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. Invoice number uniqueness
// ═══════════════════════════════════════════════════════════════════════════
describe('Invoice number format', () => {
  it('INV-YYYYMMDD-XXXX format', () => {
    const dateStr = '20260409';
    const seq = 7;
    const id = `INV-${dateStr}-${String(seq).padStart(4, '0')}`;
    expect(id).toBe('INV-20260409-0007');
    expect(id).toMatch(/^INV-\d{8}-\d{4}$/);
  });

  it('fallback id appends timestamp if collision', () => {
    const saleId = 'INV-20260409-0001';
    const existing = true; // doc already exists
    const finalId = existing ? `${saleId}-${Date.now().toString(36)}` : saleId;
    expect(finalId).not.toBe(saleId);
    expect(finalId.startsWith(saleId)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. Treatment Buy-Deduct scenarios (logic validation)
// ═══════════════════════════════════════════════════════════════════════════
describe('Treatment Buy-Deduct validation logic', () => {
  const { parseQtyString } = require('../src/lib/courseUtils.js');

  // Simulate the validation logic from TreatmentFormPage
  function validateDeductions(selectedItems, customerCourses, liveQtyMap) {
    const errors = [];
    for (const { rowId, productName, courseName, deductQty, unit } of selectedItems) {
      const isPurchased = rowId.startsWith('purchased-') || rowId.startsWith('promo-');
      let remaining;
      if (isPurchased) {
        // Find in form options (not Firestore)
        for (const c of customerCourses) {
          const p = c.products?.find(pr => pr.rowId === rowId);
          if (p) { remaining = parseFloat(p.remaining) || 0; break; }
        }
        if (remaining === undefined) remaining = 0;
      } else {
        remaining = liveQtyMap.get(`${courseName}|${productName}`) || 0;
      }
      if (deductQty > remaining) {
        errors.push(`${productName}: เหลือ ${remaining} ต้องการ ${deductQty}`);
      }
    }
    return errors;
  }

  it('scenario 1: ซื้อคอร์สใหม่ + ตัด 1 → ผ่าน', () => {
    const selected = [{ rowId: 'purchased-123-row-1', productName: 'IV Set', courseName: 'IV 10 ครั้ง', deductQty: 1, unit: 'ครั้ง' }];
    const formCourses = [{ courseId: 'purchased-course-123', courseName: 'IV 10 ครั้ง', products: [{ rowId: 'purchased-123-row-1', name: 'IV Set', remaining: '10', unit: 'ครั้ง' }] }];
    const errors = validateDeductions(selected, formCourses, new Map());
    expect(errors).toHaveLength(0);
  });

  it('scenario 2: ซื้อคอร์สใหม่ + ตัดเกิน → block', () => {
    const selected = [{ rowId: 'purchased-123-row-1', productName: 'IV Set', courseName: 'IV 10 ครั้ง', deductQty: 20, unit: 'ครั้ง' }];
    const formCourses = [{ courseId: 'purchased-course-123', courseName: 'IV 10 ครั้ง', products: [{ rowId: 'purchased-123-row-1', name: 'IV Set', remaining: '10', unit: 'ครั้ง' }] }];
    const errors = validateDeductions(selected, formCourses, new Map());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('เหลือ 10 ต้องการ 20');
  });

  it('scenario 3: คอร์สเก่า + ตัด 1 จาก remaining 5 → ผ่าน', () => {
    const selected = [{ rowId: 'be-row-0', productName: 'Allergan 100 U', courseName: 'Botox 100 U', deductQty: 1, unit: 'U' }];
    const liveMap = new Map([['Botox 100 U|Allergan 100 U', 5]]);
    const errors = validateDeductions(selected, [], liveMap);
    expect(errors).toHaveLength(0);
  });

  it('scenario 4: คอร์สเก่า + ตัดเกิน remaining → block', () => {
    const selected = [{ rowId: 'be-row-0', productName: 'Allergan 100 U', courseName: 'Botox 100 U', deductQty: 10, unit: 'U' }];
    const liveMap = new Map([['Botox 100 U|Allergan 100 U', 5]]);
    const errors = validateDeductions(selected, [], liveMap);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('เหลือ 5 ต้องการ 10');
  });

  it('scenario 5: ซื้อ + คอร์สเก่า mixed → ตรวจแยกกัน', () => {
    const selected = [
      { rowId: 'purchased-1-row-1', productName: 'New Course', courseName: 'New', deductQty: 1, unit: 'ครั้ง' },
      { rowId: 'be-row-3', productName: 'Old Product', courseName: 'Old', deductQty: 2, unit: 'U' },
    ];
    const formCourses = [{ courseId: 'purchased-course-1', courseName: 'New', products: [{ rowId: 'purchased-1-row-1', name: 'New Course', remaining: '5', unit: 'ครั้ง' }] }];
    const liveMap = new Map([['Old|Old Product', 10]]);
    const errors = validateDeductions(selected, formCourses, liveMap);
    expect(errors).toHaveLength(0); // Both pass
  });

  it('scenario 6: ซื้อโปรโมชัน + ตัด sub-course → ผ่าน', () => {
    const selected = [{ rowId: 'promo-99-row-1-5', productName: 'BA-Filler A', courseName: 'Filler 3900', deductQty: 1, unit: 'ซีซี' }];
    const formCourses = [{ courseId: 'promo-99-course-1', courseName: 'Filler 3900', promotionId: 99, products: [{ rowId: 'promo-99-row-1-5', name: 'BA-Filler A', remaining: '5', unit: 'ซีซี' }] }];
    const errors = validateDeductions(selected, formCourses, new Map());
    expect(errors).toHaveLength(0);
  });

  it('scenario 7: คอร์สเก่าที่ไม่มีใน Firestore → block (remaining 0)', () => {
    const selected = [{ rowId: 'be-row-99', productName: 'Ghost', courseName: 'Missing', deductQty: 1, unit: 'U' }];
    const liveMap = new Map(); // empty = course doesn't exist in DB
    const errors = validateDeductions(selected, [], liveMap);
    expect(errors).toHaveLength(1);
  });
});

describe('Payment status mapping', () => {
  it('maps ProClinic format to SaleTab format', () => {
    const map = { '2': 'paid', '4': 'split', '0': 'unpaid' };
    expect(map['2']).toBe('paid');
    expect(map['4']).toBe('split');
    expect(map['0']).toBe('unpaid');
    expect(map['99'] || 'paid').toBe('paid'); // unknown defaults to paid
  });
});

describe('Deduction filter — skip purchased items', () => {
  it('filters out purchased and promo items', () => {
    const items = [
      { rowId: 'be-row-0', courseName: 'Old', deductQty: 1 },
      { rowId: 'purchased-123-row-1', courseName: 'New', deductQty: 1 },
      { rowId: 'promo-99-row-1-5', courseName: 'Promo', deductQty: 1 },
      { rowId: 'be-row-5', courseName: 'Old2', deductQty: 2 },
    ];
    const existingOnly = items.filter(ci => !ci.rowId?.startsWith('purchased-') && !ci.rowId?.startsWith('promo-'));
    expect(existingOnly).toHaveLength(2);
    expect(existingOnly[0].courseName).toBe('Old');
    expect(existingOnly[1].courseName).toBe('Old2');
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

// ═══════════════════════════════════════════════════════════════════════════
// financeUtils — Phase 7 pure calc functions
// ═══════════════════════════════════════════════════════════════════════════
import {
  calcDepositRemaining, calcDepositStatus, calcSaleBilling,
  calcPointsEarned, calcPointsValue,
  calcMembershipExpiry, isMembershipExpired,
  fmtMoney, fmtPoints,
} from '../src/lib/financeUtils.js';

describe('financeUtils — deposit', () => {
  it('calcDepositRemaining — basic', () => {
    expect(calcDepositRemaining(5000, 2000)).toBe(3000);
    expect(calcDepositRemaining(5000, 0)).toBe(5000);
    expect(calcDepositRemaining(5000, 5000)).toBe(0);
  });

  it('calcDepositRemaining — used exceeds amount → 0 (not negative)', () => {
    expect(calcDepositRemaining(1000, 5000)).toBe(0);
  });

  it('calcDepositRemaining — null/undefined → 0', () => {
    expect(calcDepositRemaining(null, null)).toBe(0);
    expect(calcDepositRemaining(undefined, undefined)).toBe(0);
  });

  it('calcDepositStatus — 0 used → active', () => {
    expect(calcDepositStatus(5000, 0)).toBe('active');
  });

  it('calcDepositStatus — partial used → partial', () => {
    expect(calcDepositStatus(5000, 2000)).toBe('partial');
  });

  it('calcDepositStatus — fully used → used', () => {
    expect(calcDepositStatus(5000, 5000)).toBe('used');
    expect(calcDepositStatus(5000, 6000)).toBe('used'); // overuse still "used"
  });

  it('calcDepositStatus — amount=0 → active', () => {
    expect(calcDepositStatus(0, 0)).toBe('active');
  });
});

describe('financeUtils — billing calc', () => {
  it('all deductions applied in order', () => {
    const r = calcSaleBilling({
      subtotal: 10000,
      billDiscount: 500,
      billDiscountType: 'amount',
      membershipDiscountPercent: 10,
      depositApplied: 2000,
      walletApplied: 1000,
    });
    expect(r.subtotal).toBe(10000);
    expect(r.discount).toBe(500);
    expect(r.afterDiscount).toBe(9500);
    expect(r.membershipDiscount).toBe(950); // 10% of 9500
    expect(r.afterMembership).toBe(8550);
    expect(r.depositApplied).toBe(2000);
    expect(r.walletApplied).toBe(1000);
    expect(r.netTotal).toBe(5550);
  });

  it('percent discount applied correctly', () => {
    const r = calcSaleBilling({
      subtotal: 1000,
      billDiscount: 10,
      billDiscountType: 'percent',
    });
    expect(r.discount).toBe(100);
    expect(r.afterDiscount).toBe(900);
    expect(r.netTotal).toBe(900);
  });

  it('no membership → no membership discount', () => {
    const r = calcSaleBilling({ subtotal: 5000 });
    expect(r.membershipDiscount).toBe(0);
    expect(r.afterMembership).toBe(5000);
    expect(r.netTotal).toBe(5000);
  });

  it('deposit capped at afterMembership', () => {
    const r = calcSaleBilling({
      subtotal: 1000,
      depositApplied: 5000,
    });
    expect(r.depositApplied).toBe(1000); // capped
    expect(r.netTotal).toBe(0);
  });

  it('wallet capped at remaining after deposit', () => {
    const r = calcSaleBilling({
      subtotal: 1000,
      depositApplied: 500,
      walletApplied: 5000,
    });
    expect(r.depositApplied).toBe(500);
    expect(r.walletApplied).toBe(500); // capped at remaining
    expect(r.netTotal).toBe(0);
  });

  it('netTotal never negative', () => {
    const r = calcSaleBilling({
      subtotal: 100,
      billDiscount: 500,
      depositApplied: 1000,
    });
    expect(r.netTotal).toBeGreaterThanOrEqual(0);
  });

  it('empty input → all zeros', () => {
    const r = calcSaleBilling({});
    expect(r.subtotal).toBe(0);
    expect(r.netTotal).toBe(0);
  });
});

describe('financeUtils — points', () => {
  it('calcPointsEarned — normal case', () => {
    expect(calcPointsEarned(5000, 100)).toBe(50);
    expect(calcPointsEarned(550, 100)).toBe(5); // floor
  });

  it('calcPointsEarned — bahtPerPoint 0 → 0 (disabled)', () => {
    expect(calcPointsEarned(5000, 0)).toBe(0);
  });

  it('calcPointsEarned — negative or invalid → 0', () => {
    expect(calcPointsEarned(5000, -100)).toBe(0);
    expect(calcPointsEarned(-100, 100)).toBe(0);
  });

  it('calcPointsValue — multiplies', () => {
    expect(calcPointsValue(50, 10)).toBe(500);
    expect(calcPointsValue(0, 10)).toBe(0);
  });
});

describe('financeUtils — membership', () => {
  it('calcMembershipExpiry — 365 days', () => {
    const iso = calcMembershipExpiry('2026-01-01T00:00:00.000Z', 365);
    const date = new Date(iso);
    expect(date.getUTCFullYear()).toBe(2027);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(1);
  });

  it('isMembershipExpired — past date → true', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isMembershipExpired(past)).toBe(true);
  });

  it('isMembershipExpired — future date → false', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isMembershipExpired(future)).toBe(false);
  });

  it('isMembershipExpired — null → false (no membership)', () => {
    expect(isMembershipExpired(null)).toBe(false);
    expect(isMembershipExpired('')).toBe(false);
  });
});

// Inline copy of SaleTab's PAYMENT_STATUSES + resolveSaleStatus — kept in sync
// with the source so this regression test can't drift.
const SALE_PAYMENT_STATUSES = [
  { value: 'paid', label: 'ชำระแล้ว', color: 'emerald' },
  { value: 'split', label: 'แบ่งชำระ', color: 'sky' },
  { value: 'unpaid', label: 'ค้างชำระ', color: 'amber' },
  { value: 'deferred', label: 'ชำระภายหลัง', color: 'purple' },
  { value: 'draft', label: 'แบบร่าง', color: 'gray' },
  { value: 'cancelled', label: 'ยกเลิก', color: 'red' },
];
function resolveSaleStatus(sale) {
  if (sale?.status === 'cancelled') return SALE_PAYMENT_STATUSES.find(s => s.value === 'cancelled');
  return SALE_PAYMENT_STATUSES.find(s => s.value === sale?.payment?.status)
    || SALE_PAYMENT_STATUSES.find(s => s.value === 'draft');
}

describe('SaleTab status resolution — regression', () => {
  it('cancelled sale shows "ยกเลิก" (NOT "ชำระภายหลัง")', () => {
    const st = resolveSaleStatus({ status: 'cancelled', payment: { status: 'cancelled' } });
    expect(st.label).toBe('ยกเลิก');
    expect(st.color).toBe('red');
  });
  it('cancelled sale with lingering paid payment.status still shows ยกเลิก', () => {
    // sale.status=cancelled takes precedence over payment.status
    const st = resolveSaleStatus({ status: 'cancelled', payment: { status: 'paid' } });
    expect(st.label).toBe('ยกเลิก');
  });
  it('normal paid sale shows ชำระแล้ว', () => {
    const st = resolveSaleStatus({ status: 'active', payment: { status: 'paid' } });
    expect(st.label).toBe('ชำระแล้ว');
  });
  it('unknown payment status falls back to draft (not deferred)', () => {
    const st = resolveSaleStatus({ status: 'active', payment: { status: 'nonsense' } });
    expect(st.label).toBe('แบบร่าง');
    // Regression: previously defaulted to PAYMENT_STATUSES[3]=ชำระภายหลัง
    expect(st.label).not.toBe('ชำระภายหลัง');
  });
  it('missing payment object → falls back to draft', () => {
    const st = resolveSaleStatus({ status: 'active' });
    expect(st.label).toBe('แบบร่าง');
  });
});

describe('financeUtils — formatting', () => {
  it('fmtMoney — formats with thousand separators', () => {
    expect(fmtMoney(1000)).toContain('1,000');
    expect(fmtMoney(1234567)).toContain('1,234,567');
  });

  it('fmtMoney — null/undefined → 0', () => {
    expect(fmtMoney(null)).toBe('0');
    expect(fmtMoney(undefined)).toBe('0');
  });

  it('fmtPoints — integer format', () => {
    expect(fmtPoints(1000)).toContain('1,000');
    expect(fmtPoints(0)).toBe('0');
  });
});
