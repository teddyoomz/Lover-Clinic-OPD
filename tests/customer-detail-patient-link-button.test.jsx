import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const CDV = readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf8');

describe('CustomerDetailView — patient-link button (Layout A)', () => {
  it('B1: imports CustomerPatientLinkModal + Link icon', () => {
    expect(CDV).toMatch(/import CustomerPatientLinkModal from '\.\/CustomerPatientLinkModal\.jsx'/);
    expect(CDV).toMatch(/ClipboardCheck, Link\b|\bLink\b[^L]*from 'lucide-react'/s);
  });
  it('B2: 🔗 patient-link button (purple theme) present', () => {
    expect(CDV).toMatch(/data-testid="patient-link-btn"/);
    expect(CDV).toMatch(/ลิงก์ดูข้อมูล/);
    expect(CDV).toMatch(/168,85,247|c084fc/);
  });
  it('B3: Layout A — action group wrapper + divider before ลบลูกค้า', () => {
    expect(CDV).toMatch(/data-testid="customer-detail-action-group"/);
    // divider div between action group and delete button
    expect(CDV).toMatch(/w-3\/4 h-px/);
  });
  it('B4: opens modal on click (state + render)', () => {
    expect(CDV).toMatch(/setShowPatientLinkModal\(true\)/);
    expect(CDV).toMatch(/showPatientLinkModal &&/);
    expect(CDV).toMatch(/const \[showPatientLinkModal, setShowPatientLinkModal\] = useState\(false\)/);
  });
  it('B5: label flips to "ลิงก์ ✓" when token exists', () => {
    expect(CDV).toMatch(/customer\?\.patientLinkToken \? 'ลิงก์ ✓'/);
  });
  it('B6: existing แก้ไข / ผูก LINE / ลบลูกค้า buttons preserved (no regression)', () => {
    expect(CDV).toMatch(/data-testid="edit-customer-btn"/);
    expect(CDV).toMatch(/data-testid="link-line-btn"/);
    expect(CDV).toMatch(/data-testid="customer-detail-delete-button"/);
  });
});
