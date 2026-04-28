// ─── V33-customer-id-resolution — 2026-04-28 ────────────────────────────────
//
// User report:
//   1. "ลูกค้าใหม่ที่สร้างผ่านระบบเรา ไม่สามารถกดบันทึกการรักษาได้"
//   2. "ผู้ช่วยแพทย์ (สูงสุด 5 คน) ใน modal สร้างนัดหมายทุกที่ ไม่มีรายชื่อ
//      ผู้ช่วยปรากฎ"
//   3. "ฝากเช็คลูกค้าใหม่ที่สร้างผ่านระบบเราว่าจะมีบั๊คทำอะไรไม่ได้อีกไหม"
//   4. "ใน list ใบเสร็จ ในหน้า tab=sales เปลี่ยนคำว่า จาก OPD เป็น จาก OPD Card"
//
// Root cause for (1) + (3): V33 customer-create writes be_customers/{LC-YY######}
// with proClinicId=null (born inside our system, no ProClinic ID). But many
// code paths hardcoded `customer.proClinicId` as the customer-identity →
// null for V33 customers → silent failures (empty appointment lists,
// blocked treatment save, modals operating on null id).
//
// Fix: use `customer.id || customer.proClinicId` fallback (Firestore doc id
// is canonical; proClinicId is denormalized for ProClinic clones).
//
// Root cause for (2): AppointmentFormModal rendered ALL doctors as
// "ผู้ช่วยแพทย์" picker — no position filter. TreatmentFormPage had the
// correct filter logic. Single-source-of-truth applied.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const backendDashboardSrc = read('src/pages/BackendDashboard.jsx');
const customerDetailSrc = read('src/components/backend/CustomerDetailView.jsx');
const apptModalSrc = read('src/components/backend/AppointmentFormModal.jsx');
const saleTabSrc = read('src/components/backend/SaleTab.jsx');

// ============================================================================
describe('V33CR.A — BackendDashboard onCreateTreatment + onEditTreatment fallback', () => {
  it('A.1 onCreateTreatment uses customer.id || customer.proClinicId', () => {
    const block = backendDashboardSrc.match(/onCreateTreatment=\{[\s\S]+?\}\)\}/);
    expect(block?.[0]).toMatch(/customerId:\s*viewingCustomer\.id\s*\|\|\s*viewingCustomer\.proClinicId/);
  });

  it('A.2 onEditTreatment uses same fallback', () => {
    const block = backendDashboardSrc.match(/onEditTreatment=\{[\s\S]+?\}\)\}/);
    expect(block?.[0]).toMatch(/customerId:\s*viewingCustomer\.id\s*\|\|\s*viewingCustomer\.proClinicId/);
  });

  it('A.3 customerHN uses 3-tier fallback (proClinicHN → hn → hn_no)', () => {
    expect(backendDashboardSrc).toMatch(/customerHN:\s*viewingCustomer\.proClinicHN\s*\|\|\s*viewingCustomer\.hn\s*\|\|\s*viewingCustomer\.hn_no\s*\|\|\s*['"]['"]/);
  });

  it('A.4 V33 institutional-memory comment present', () => {
    expect(backendDashboardSrc).toMatch(/V33-created customers|2026-04-28.*V33|customer-null guard/);
  });
});

// ============================================================================
describe('V33CR.B — CustomerDetailView customerId fallback', () => {
  it('B.1 single resolved customerId const at top of component', () => {
    expect(customerDetailSrc).toMatch(/const customerId\s*=\s*customer\?\.id\s*\|\|\s*customer\?\.proClinicId/);
  });

  it('B.2 listener guards use the resolved customerId (not bare customer?.proClinicId)', () => {
    // 4 listener useEffects (appointments / treatments / finance / sales)
    // should all use `if (!customerId) return` after the fix
    const listenerEarlyReturns = customerDetailSrc.match(/if \(!customerId\) return;/g) || [];
    expect(listenerEarlyReturns.length).toBeGreaterThanOrEqual(4);
  });

  it('B.3 modals (AddQty/Exchange/Share) pass resolved customerId prop', () => {
    // Anti-regression: modals must not pass customer.proClinicId directly
    expect(customerDetailSrc).not.toMatch(/customerId=\{customer\.proClinicId\}/);
    // Affirmative: should use the resolved customerId const
    expect(customerDetailSrc).toMatch(/customerId=\{customerId\}/);
    expect(customerDetailSrc).toMatch(/fromCustomerId=\{customerId\}/);
  });

  it('B.4 getCustomer refresh calls use customerId not customer.proClinicId', () => {
    // Anti-regression: no `getCustomer(customer.proClinicId)` left
    expect(customerDetailSrc).not.toMatch(/getCustomer\(customer\.proClinicId\)/);
    // Affirmative
    expect(customerDetailSrc).toMatch(/getCustomer\(customerId\)/);
  });

  it('B.5 ShareModal customer-list filter uses (cust.id || cust.proClinicId) compare', () => {
    expect(customerDetailSrc).toMatch(/\(cust\.id\s*\|\|\s*cust\.proClinicId\)\s*!==\s*fromCustomerId/);
  });
});

// ============================================================================
describe('V33CR.C — AppointmentFormModal assistants filter by position', () => {
  it('C.1 assistants useMemo filters doctors by position === ผู้ช่วยแพทย์', () => {
    expect(apptModalSrc).toMatch(/const assistants\s*=\s*useMemo\(/);
    expect(apptModalSrc).toMatch(/d\?\.position[\s\S]+?===\s*['"]ผู้ช่วยแพทย์['"]/);
  });

  it('C.2 assistants render uses filtered list (assistants), not raw doctors', () => {
    // Find the JSX section between the assistants <label> and its closing </div>
    const block = apptModalSrc.match(/ผู้ช่วยแพทย์ \(สูงสุด 5 คน\)<\/label>[\s\S]+?(?=\{\/\* Channel)/);
    expect(block?.[0]).toMatch(/\{assistants\.map\(d\s*=>/);
    // Anti-regression: must NOT iterate raw `doctors.map(...)` for assistants
    expect(block?.[0]).not.toMatch(/\{doctors\.map\(d\s*=>/);
  });

  it('C.3 empty-state hint surfaces when no assistants configured', () => {
    expect(apptModalSrc).toMatch(/assistants\.length\s*===\s*0/);
    expect(apptModalSrc).toMatch(/ยังไม่มีผู้ช่วยแพทย์ใน be_doctors/);
  });
});

// ============================================================================
describe('V33CR.D — SaleTab "จาก OPD Card" label', () => {
  it('D.1 OPD badge text is "จาก OPD Card" (anti-regression on rename)', () => {
    expect(saleTabSrc).toMatch(/จาก OPD Card/);
    // Anti-regression: lone "จาก OPD" (without " Card") in the badge JSX
    // must NOT exist. Use a more specific pattern.
    const badgeBlock = saleTabSrc.match(/sale\.source === 'treatment' &&[\s\S]+?<\/span>/);
    expect(badgeBlock?.[0]).toMatch(/จาก OPD Card/);
  });
});
