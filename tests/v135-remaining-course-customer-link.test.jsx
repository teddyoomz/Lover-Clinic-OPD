// V135 (2026-05-31) — reports-remaining-course customer name is now a link →
// opens ?backend=1&customer=<id> in a new tab (like every other report tab:
// SaleReportTab / CustomerReportTab / Appointment*Tab / CRMInsightTab).
//
// User report (verbatim): "ทำให้ชื่อลูกค้าหน้านี้กดเข้าไปแล้วเปิด tab
// หน้าดูข้อมูลลูกค้าได้เหมือนที่อื่นๆ".
//
// Class-of-bug (Rule P sweep): of the 8 files in src/components/backend/
// reports/ that reference `customerName`, only RemainingCourseTab+Row were
// missing the click-to-open wiring. Single-surface fix.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import RemainingCourseRow from '../src/components/backend/reports/RemainingCourseRow.jsx';

// Real row shape — mirrors flattenCustomerCourses() output (the only producer
// of RemainingCourseRow rows in production).
const baseRow = {
  customerId: 'LC-26000123',
  customerHN: 'HN001234',
  customerName: 'นาย ทดสอบ ระบบ',
  courseId: 'CRS-1',
  courseIndex: 0,
  courseName: 'คอร์ส X 10 ครั้ง',
  courseType: 'ฉีดยา',
  purchaseDate: '2026-05-01',
  qtyTotal: 10,
  qtyUsed: 3,
  qtyRemaining: 7,
  qtyUnit: 'ครั้ง',
  totalSpent: 15000,
  lastUsedDate: '2026-05-20',
  status: 'กำลังใช้งาน',
  staffName: '',
};

// <tr> must live inside <tbody> inside <table>; wrap for valid React DOM.
function renderRow(props) {
  return render(
    <table><tbody>
      <RemainingCourseRow row={baseRow} {...props} />
    </tbody></table>,
  );
}

describe('V135.R RemainingCourseRow clickable customer name', () => {
  it('R1: onOpenCustomer + customerId → name is a BUTTON; click calls onOpenCustomer with customerId', () => {
    const onOpen = vi.fn();
    renderRow({ onOpenCustomer: onOpen });
    const link = screen.getByTestId('remaining-course-customer-link-LC-26000123');
    expect(link.tagName).toBe('BUTTON');
    expect(link.textContent).toBe('นาย ทดสอบ ระบบ');
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith('LC-26000123');
  });

  it('R2: no onOpenCustomer → plain DIV, not clickable (back-compat for tests)', () => {
    renderRow({});
    expect(screen.queryByTestId('remaining-course-customer-link-LC-26000123')).toBeNull();
    expect(screen.getByText('นาย ทดสอบ ระบบ').tagName).toBe('DIV');
  });

  it('R3: no customerId → plain DIV even with onOpenCustomer (defensive)', () => {
    const onOpen = vi.fn();
    render(
      <table><tbody>
        <RemainingCourseRow row={{ ...baseRow, customerId: '' }} onOpenCustomer={onOpen} />
      </tbody></table>,
    );
    expect(screen.queryByTestId('remaining-course-customer-link-')).toBeNull();
    expect(screen.getByText('นาย ทดสอบ ระบบ').tagName).toBe('DIV');
  });

  it('R4: link uses cyan (NEVER red on a patient name — Thai-culture)', () => {
    const onOpen = vi.fn();
    renderRow({ onOpenCustomer: onOpen });
    const link = screen.getByTestId('remaining-course-customer-link-LC-26000123');
    expect(link.className).toMatch(/text-cyan-/);
    expect(link.className).not.toMatch(/text-red-/);
  });

  it('R5: title attr surfaces "เปิดข้อมูลลูกค้าในแท็บใหม่" UX hint', () => {
    const onOpen = vi.fn();
    renderRow({ onOpenCustomer: onOpen });
    const link = screen.getByTestId('remaining-course-customer-link-LC-26000123');
    expect(link.getAttribute('title')).toMatch(/เปิดข้อมูลลูกค้าในแท็บใหม่/);
  });

  it('R6: click calls stopPropagation so a future row-onClick wouldn\'t double-fire', () => {
    const onOpen = vi.fn();
    const rowClicked = vi.fn();
    render(
      <table><tbody onClick={rowClicked}>
        <RemainingCourseRow row={baseRow} onOpenCustomer={onOpen} />
      </tbody></table>,
    );
    fireEvent.click(screen.getByTestId('remaining-course-customer-link-LC-26000123'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(rowClicked).not.toHaveBeenCalled();
  });
});

describe('V135.SG source-grep — Tab + Row wiring', () => {
  const TAB = readFileSync('src/components/backend/reports/RemainingCourseTab.jsx', 'utf8');
  const ROW = readFileSync('src/components/backend/reports/RemainingCourseRow.jsx', 'utf8');

  it('SG1: Tab imports openCustomerInNewTab from canonical customerNavigation.js', () => {
    expect(TAB).toMatch(/import \{ openCustomerInNewTab \} from ['"][^'"]*customerNavigation\.js['"]/);
  });

  it('SG2: Tab defines handleOpenCustomer that delegates to openCustomerInNewTab', () => {
    expect(TAB).toMatch(/handleOpenCustomer\s*=\s*useCallback\(/);
    expect(TAB).toMatch(/openCustomerInNewTab\(customerId\)/);
  });

  it('SG3: Tab passes onOpenCustomer={handleOpenCustomer} to RemainingCourseRow', () => {
    expect(TAB).toMatch(/onOpenCustomer=\{handleOpenCustomer\}/);
  });

  it('SG4: Row accepts onOpenCustomer prop in destructure', () => {
    expect(ROW).toMatch(/function RemainingCourseRow\(\{[^}]*onOpenCustomer[^}]*\}/);
  });

  it('SG5: Row guards on typeof === function && row.customerId (canOpen)', () => {
    expect(ROW).toMatch(/typeof onOpenCustomer === 'function'/);
    expect(ROW).toMatch(/row\.customerId/);
  });

  it('SG6: Row\'s click handler calls stopPropagation before firing onOpenCustomer', () => {
    expect(ROW).toMatch(/stopPropagation\?\.\(\)/);
    expect(ROW).toMatch(/onOpenCustomer\?\.\(row\.customerId\)/);
  });

  it('SG7: Row data-testid follows remaining-course-customer-link-<id> shape', () => {
    expect(ROW).toMatch(/data-testid=\{`remaining-course-customer-link-\$\{row\.customerId\}`\}/);
  });

  it('SG8: V135 marker comment present in both files (institutional memory)', () => {
    expect(TAB).toMatch(/V135/);
    expect(ROW).toMatch(/V135/);
  });
});
