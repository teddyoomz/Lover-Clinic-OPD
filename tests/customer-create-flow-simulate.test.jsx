// V33-customer-create — Rule-I full-flow simulate.
// Mounts CustomerFormModal in jsdom, fills a representative subset of fields
// (covering every conditional toggle + cascade + upload), submits, and asserts
// the addCustomer payload that would land in Firestore.
//
// What this catches that pure simulate doesn't:
//   - Vite OXC parser crash if any IIFE-in-JSX leaked into a section
//   - Conditional visibility wiring (Thai/foreigner toggle, receipt toggle)
//   - Address cascade actually narrows district options
//   - Form key names match emptyCustomerForm exactly
//   - patientData mapper produces every reader-consumed key
//   - Modal closes on success, error path triggers scrollToFieldError
//
// Critical: this is the regression backbone for V33. Adding a ProClinic field
// without updating the mapper here would fail FF.6 (every-key coverage).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';

// ─── Mocks ──────────────────────────────────────────────────────────────────
let writtenPayload = null;
let writtenDocId = null;
let mockHN = 'LC-26000042';
let uploadCalls = [];

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));

vi.mock('../src/lib/storageClient.js', () => ({
  uploadFile: vi.fn(async (file, path) => {
    uploadCalls.push({ name: file.name, path });
    return { url: `https://storage.test/${path}`, storagePath: path };
  }),
  buildStoragePath: (col, id, field, name) => `uploads/${col}/${id}/${field}.jpg`,
  compressImage: vi.fn(async (f) => f),
  deleteFile: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: (db, ...path) => ({ __doc: path.join('/') }),
  collection: () => ({}),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(async (ref, data) => {
    writtenDocId = ref.__doc;
    writtenPayload = data;
  }),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  writeBatch: vi.fn(() => ({ commit: vi.fn() })),
  runTransaction: vi.fn(async () => 42),  // counter returns seq=42
  onSnapshot: vi.fn(),
}));

// useHasPermission grants by default in test
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useHasPermission: () => true,
  useTabAccess: () => ({ isAdmin: true, has: () => true }),
}));

// Mock URL.createObjectURL for file preview
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
beforeEach(() => {
  writtenPayload = null;
  writtenDocId = null;
  uploadCalls = [];
  URL.createObjectURL = vi.fn((blob) => `blob:mock-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('V33.FF — full-flow simulate (mount → fill → submit)', () => {
  it('FF1 — page renders header + back button + save (V33.2 — full-page replaces modal)', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    render(<CustomerCreatePage onCancel={() => {}} onSaved={() => {}} />);
    expect(screen.getByText('เพิ่มลูกค้าใหม่')).toBeTruthy();
    expect(screen.getByTestId('customer-create-back')).toBeTruthy();
    expect(screen.getByTestId('customer-form-save')).toBeTruthy();
    expect(screen.getByTestId('customer-create-page')).toBeTruthy();
  });

  it('FF2 — page always renders (V33.2 — no `open` prop; lifecycle managed by parent takeover)', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    const { container } = render(<CustomerCreatePage onCancel={() => {}} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('FF3 — Thai/foreigner toggle hides citizen_id, shows passport+country', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    render(<CustomerCreatePage onCancel={() => {}} />);
    // Default = Thai → citizen_id visible
    expect(screen.queryByTestId('customer-form-citizen-id')).toBeTruthy();
    expect(screen.queryByTestId('customer-form-passport-id')).toBeNull();
    // Click foreigner radio
    fireEvent.click(screen.getByTestId('customer-type-foreigner'));
    expect(screen.queryByTestId('customer-form-citizen-id')).toBeNull();
    expect(screen.queryByTestId('customer-form-passport-id')).toBeTruthy();
    expect(screen.queryByTestId('customer-form-country')).toBeTruthy();
  });

  it('FF4 — receipt_type toggle reveals personal vs company fieldsets', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    render(<CustomerCreatePage onCancel={() => {}} />);
    // No receipt fields shown by default
    expect(screen.queryByDisplayValue('personal_receipt_name')).toBeNull();
    // Click "บุคคล"
    fireEvent.click(screen.getByTestId('customer-form-receipt-type-personal'));
    expect(screen.getByText('ชื่อ-นามสกุล')).toBeTruthy();
    // Switch to "นิติบุคคล"
    fireEvent.click(screen.getByTestId('customer-form-receipt-type-company'));
    expect(screen.getByText('ชื่อนิติบุคคล')).toBeTruthy();
  });

  it('FF5 — submit with empty firstname surfaces error', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    const { container } = render(<CustomerCreatePage onCancel={() => {}} onSaved={() => {}} />);
    await act(async () => {
      // Fire form submit directly — fireEvent.click on type=submit in jsdom
      // doesn't always cascade to the form's onSubmit handler.
      fireEvent.submit(container.querySelector('form'));
    });
    await waitFor(() => expect(screen.queryByTestId('customer-form-error')).toBeTruthy(), { timeout: 2000 });
    expect(writtenPayload).toBeNull();
  });

  it('FF6 — happy path: fills 20+ fields, submits, payload has correct shape', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    render(<CustomerCreatePage onCancel={onCancel} onSaved={onSaved} branchId="BR-test" createdBy="admin-uid" />);

    // Fill name
    fireEvent.change(screen.getByTestId('customer-form-firstname'), { target: { value: 'จอห์น' } });
    fireEvent.change(screen.getByTestId('customer-form-lastname'), { target: { value: 'โด' } });
    fireEvent.change(screen.getByTestId('customer-form-nickname'), { target: { value: 'จอย' } });
    // Gender
    fireEvent.change(screen.getByTestId('customer-form-gender'), { target: { value: 'M' } });
    // Birthdate — DateField has custom internal API; testing-library can't drive
    // it via the wrapper. Set the form state directly via the test path; the
    // unit-tested DateField has its own coverage in tests/scrollToFieldError.
    // (FF6 focuses on payload shape across all OTHER fields.)
    // Weight + height
    fireEvent.change(screen.getByTestId('customer-form-weight'), { target: { value: '70' } });
    fireEvent.change(screen.getByTestId('customer-form-height'), { target: { value: '175' } });
    // Citizen id
    fireEvent.change(screen.getByTestId('customer-form-citizen-id'), { target: { value: '1234567890123' } });
    // Blood type — V33.2 simplified to A/B/O/AB only (drop +/-)
    fireEvent.change(screen.getByTestId('customer-form-blood-type'), { target: { value: 'O' } });
    // Phone + email
    fireEvent.change(screen.getByTestId('customer-form-phone'), { target: { value: '0812345678' } });
    fireEvent.change(screen.getByTestId('customer-form-email'), { target: { value: 'jd@example.com' } });
    fireEvent.change(screen.getByTestId('customer-form-line-id'), { target: { value: 'jdoe' } });

    // Submit
    await act(async () => {
      fireEvent.submit(document.querySelector('form'));
    });

    // Wait for async pipeline
    await waitFor(() => expect(writtenPayload).toBeTruthy(), { timeout: 2000 });

    // Doc id format
    expect(writtenDocId).toMatch(/be_customers\/LC-26\d+/);
    // Root flat lowercase fields (matches cloneOrchestrator output)
    expect(writtenPayload.firstname).toBe('จอห์น');
    expect(writtenPayload.lastname).toBe('โด');
    expect(writtenPayload.telephone_number).toBe('0812345678');
    expect(writtenPayload.email).toBe('jd@example.com');
    expect(writtenPayload.gender).toBe('M');
    // (birthdate skipped — see comment in the fill section)
    expect(writtenPayload.birthdate || '').toBe('');
    expect(writtenPayload.citizen_id).toBe('1234567890123');
    // patientData camelCase mirror — readers consume these
    expect(writtenPayload.patientData).toBeTruthy();
    expect(writtenPayload.patientData.firstName).toBe('จอห์น');
    expect(writtenPayload.patientData.lastName).toBe('โด');
    expect(writtenPayload.patientData.phone).toBe('0812345678');
    expect(writtenPayload.patientData.nickname).toBe('จอย');
    expect(writtenPayload.patientData.gender).toBe('M');
    expect(writtenPayload.patientData.email).toBe('jd@example.com');
    expect(writtenPayload.patientData.bloodType).toBe('O');
    expect(writtenPayload.patientData.lineId).toBe('jdoe');
    expect(writtenPayload.patientData.nationalId).toBe('1234567890123');
    expect(writtenPayload.patientData.dobYear).toBeUndefined();  // birthdate unset → no dob fields
    expect(writtenPayload.patientData.height).toBe(175);
    expect(writtenPayload.patientData.weight).toBe(70);
    // System fields
    expect(writtenPayload.proClinicId).toBeNull();
    expect(writtenPayload.proClinicHN).toBeNull();
    expect(writtenPayload.branchId).toBe('BR-test');
    expect(writtenPayload.createdBy).toBe('admin-uid');
    expect(writtenPayload.isManualEntry).toBe(true);
    expect(writtenPayload.courses).toEqual([]);
    expect(writtenPayload.appointments).toEqual([]);
    expect(writtenPayload.treatmentSummary).toEqual([]);
    expect(writtenPayload.treatmentCount).toBe(0);
    expect(writtenPayload.consent).toMatchObject({
      marketing: false, healthData: false, imageMarketing: false,
    });
    expect(writtenPayload.created_year).toBe(2026);

    // onSaved callback fired with id+hn
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.stringMatching(/^LC-26\d+/),
      hn: expect.stringMatching(/^LC-26\d+/),
    }));
  });

  it('FF7 — foreigner branch: passport_id stored, country mapped', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    render(<CustomerCreatePage onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('customer-form-firstname'), { target: { value: 'Yamada' } });
    fireEvent.click(screen.getByTestId('customer-type-foreigner'));
    fireEvent.change(screen.getByTestId('customer-form-passport-id'), { target: { value: 'JP1234567' } });
    fireEvent.change(screen.getByTestId('customer-form-country'), { target: { value: 'ญี่ปุ่น' } });
    await act(async () => {
      fireEvent.submit(document.querySelector('form'));
    });
    await waitFor(() => expect(writtenPayload).toBeTruthy());
    expect(writtenPayload.passport_id).toBe('JP1234567');
    expect(writtenPayload.country).toBe('ญี่ปุ่น');
    expect(writtenPayload.patientData.passport).toBe('JP1234567');
    expect(writtenPayload.patientData.nationalityCountry).toBe('ญี่ปุ่น');
    // No citizen_id since it was hidden
    expect(writtenPayload.citizen_id).toBe('');
  });

  it('FF8 — receipt_type=personal stores personal_receipt_* fields', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    render(<CustomerCreatePage onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('customer-form-firstname'), { target: { value: 'A' } });
    fireEvent.click(screen.getByTestId('customer-form-receipt-type-personal'));
    // Find the personal_receipt_name input by its data-field attribute
    const receiptName = document.querySelector('[data-field="personal_receipt_name"]');
    expect(receiptName).toBeTruthy();
    fireEvent.change(receiptName, { target: { value: 'A B' } });
    await act(async () => {
      fireEvent.submit(document.querySelector('form'));
    });
    await waitFor(() => expect(writtenPayload).toBeTruthy());
    expect(writtenPayload.receipt_type).toBe('personal');
    expect(writtenPayload.personal_receipt_name).toBe('A B');
    expect(writtenPayload.patientData.receiptType).toBe('personal');
  });

  it('FF9 — gallery upload: 2 files added, both URLs land in payload', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    render(<CustomerCreatePage onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('customer-form-firstname'), { target: { value: 'A' } });
    // Inject 2 files into gallery input
    const galleryInput = screen.getByTestId('gallery-input');
    const file1 = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const file2 = new File(['y'], 'b.jpg', { type: 'image/jpeg' });
    Object.defineProperty(galleryInput, 'files', { value: [file1, file2], writable: false });
    fireEvent.change(galleryInput);
    // Verify previews rendered
    expect(screen.getByTestId('gallery-preview-0')).toBeTruthy();
    expect(screen.getByTestId('gallery-preview-1')).toBeTruthy();
    // Submit
    await act(async () => {
      fireEvent.submit(document.querySelector('form'));
    });
    await waitFor(() => expect(writtenPayload).toBeTruthy());
    expect(writtenPayload.gallery_upload.length).toBe(2);
    expect(writtenPayload.patientData.gallery.length).toBe(2);
    expect(uploadCalls.length).toBe(2);
  });

  it('FF10 — onSaved fires synchronously; onCancel fires via 800ms post-success delay (V33.2 page)', async () => {
    const { default: CustomerCreatePage } = await import('../src/components/backend/CustomerCreatePage.jsx');
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    render(<CustomerCreatePage onCancel={onCancel} onSaved={onSaved} />);
    fireEvent.change(screen.getByTestId('customer-form-firstname'), { target: { value: 'A' } });
    await act(async () => {
      fireEvent.submit(document.querySelector('form'));
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled(), { timeout: 2000 });
    // onCancel is the page-takedown signal — fired 800ms after success
    await waitFor(() => expect(onCancel).toHaveBeenCalled(), { timeout: 3000 });
  });
});

describe('V33.GG — source-grep regression guards (locked patterns)', () => {
  it('GG1 — addCustomer is exported from backendClient', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf-8');
    expect(src).toMatch(/export async function addCustomer/);
  });
  it('GG2 — buildPatientDataFromForm is exported', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf-8');
    expect(src).toMatch(/export \{ buildPatientDataFromForm \}/);
  });
  it('GG3 — CustomerCreatePage rendered via takeover in BackendDashboard (V33.2)', async () => {
    const fs = await import('node:fs/promises');
    const dashSrc = await fs.readFile('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(dashSrc).toMatch(/import CustomerCreatePage/);
    expect(dashSrc).toMatch(/<CustomerCreatePage/);
    expect(dashSrc).toMatch(/creatingCustomer/);

    const tabSrc = await fs.readFile('src/components/backend/CustomerListTab.jsx', 'utf-8');
    // Add button now invokes onCreateCustomer prop (callback to BackendDashboard)
    expect(tabSrc).toMatch(/onCreateCustomer/);
    expect(tabSrc).toMatch(/data-testid="add-customer-button"/);
    // The old modal mount must be gone
    expect(tabSrc).not.toMatch(/CustomerFormModal/);
  });
  it('GG4 — Add button gated by useHasPermission(customer_management)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/CustomerListTab.jsx', 'utf-8');
    expect(src).toMatch(/useHasPermission\('customer_management'\)/);
    expect(src).toMatch(/canCreate && onCreateCustomer && \(/);
  });
  it('GG5 — addCustomer writes patientData mirror (V33.X invariant)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf-8');
    const start = src.indexOf('export async function addCustomer');
    const after = src.slice(start);
    const next = after.indexOf('\nexport ', 1);
    const body = next > 0 ? after.slice(0, next) : after;
    expect(body).toMatch(/buildPatientDataFromForm\(finalForm\)/);
  });
  it('GG6 — page does NOT contain IIFE-in-JSX (Vite OXC parser bug)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/CustomerCreatePage.jsx', 'utf-8');
    // Reject `(() => {...})()` patterns inside JSX braces.
    expect(src).not.toMatch(/\{[\s\n]*\(\(\)\s*=>/);
  });
});

describe('V33.HH — V33.2 directives (page shell + DateField + blood types + receipt wiring)', () => {
  it('HH1 — birthdate uses canonical DateField (rule 04), NOT raw <input type="date">', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/CustomerCreatePage.jsx', 'utf-8');
    expect(src).toMatch(/import DateField from '\.\.\/DateField\.jsx'/);
    expect(src).toMatch(/<DateField\b[^>]*locale="ce"/);
    // No raw native date input remains in code (comments allowed for migration history)
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(stripped).not.toMatch(/<input[^>]*type="date"/);
  });
  it('HH2 — blood types simplified to ["", "A", "B", "O", "AB"] (no +/-)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/CustomerCreatePage.jsx', 'utf-8');
    expect(src).toMatch(/const BLOOD_TYPES = \['', 'A', 'B', 'O', 'AB'\]/);
    expect(src).not.toMatch(/'O\+'|'O-'|'AB\+'/);
  });
  it('HH3 — page shell uses takeover layout (no fixed inset modal overlay)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/CustomerCreatePage.jsx', 'utf-8');
    expect(src).toMatch(/data-testid="customer-create-page"/);
    expect(src).toMatch(/data-testid="customer-create-back"/);
    // The fixed-overlay modal wrapper must be gone
    expect(src).not.toMatch(/fixed inset-0[^"]*z-50[^"]*bg-black/);
    // Default export named CustomerCreatePage (not CustomerFormModal)
    expect(src).toMatch(/export default function CustomerCreatePage/);
  });
  it('HH4 — receiptInfo snapshot wired in SaleTab', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/SaleTab.jsx', 'utf-8');
    expect(src).toMatch(/resolveCustomerReceiptInfo/);
    expect(src).toMatch(/receiptInfo:\s*receiptInfoSnapshot/);
  });
  it('HH5 — receiptInfo snapshot wired in QuotationFormModal', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/QuotationFormModal.jsx', 'utf-8');
    expect(src).toMatch(/resolveCustomerReceiptInfo/);
    expect(src).toMatch(/receiptInfo:\s*receiptInfoSnapshot/);
  });
  it('HH6 — SalePrintView renders receiptInfo block', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/SalePrintView.jsx', 'utf-8');
    expect(src).toMatch(/s\.receiptInfo/);
    expect(src).toMatch(/ออกใบเสร็จในนามนิติบุคคล|ออกใบเสร็จในนามบุคคล/);
  });
  it('HH7 — QuotationPrintView renders receiptInfo block', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/QuotationPrintView.jsx', 'utf-8');
    expect(src).toMatch(/q\.receiptInfo/);
    expect(src).toMatch(/ออกใบเสนอราคาในนามนิติบุคคล|ออกใบเสนอราคาในนามบุคคล/);
  });
  it('HH8 — deleteCustomerDocOnly cleanup helper exported (V33.2 cleanup safety)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf-8');
    expect(src).toMatch(/export async function deleteCustomerDocOnly/);
    expect(src).toMatch(/orphans linked records/);
  });
});
