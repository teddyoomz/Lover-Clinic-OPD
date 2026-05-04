// V33.3 — Edit Customer flow tests.
// Covers: buildFormFromCustomer reverse mapper + updateCustomerFromForm
// orchestrator + round-trip integrity (form → patientData → form preserves
// every field).

import { describe, it, expect, vi, beforeEach } from 'vitest';

let writtenPayload = null;
let writtenDocPath = null;

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));

vi.mock('firebase/firestore', () => ({
  doc: (db, ...path) => ({ __doc: path.join('/') }),
  collection: () => ({}),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(async (ref, data) => {
    writtenDocPath = ref.__doc;
    writtenPayload = data;
  }),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  writeBatch: vi.fn(() => ({ commit: vi.fn() })),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('../src/lib/storageClient.js', () => ({
  uploadFile: vi.fn(async (file, path) => ({ url: `https://storage.test/${path}`, storagePath: path })),
  buildStoragePath: (col, id, field, name) => `uploads/${col}/${id}/${field}.jpg`,
  compressImage: vi.fn(async (f) => f),
  deleteFile: vi.fn(),
}));

beforeEach(() => {
  writtenPayload = null;
  writtenDocPath = null;
});

describe('V33.II — buildFormFromCustomer reverse mapper', () => {
  it('II1 — handles V33-shape doc (root flat fields populated)', async () => {
    const { buildFormFromCustomer } = await import('../src/lib/backendClient.js');
    const customer = {
      id: 'LC-26000001',
      hn_no: 'LC-26000001',
      firstname: 'จอห์น', lastname: 'โด', nickname: 'จอย',
      citizen_id: '1234567890123', telephone_number: '0812345678', email: 'a@b.com',
      gender: 'M', blood_type: 'O', birthdate: '1990-05-15',
      address: '99/1', province: 'กรุงเทพมหานคร', district: 'พระนคร', sub_district: 'ชนะสงคราม', postal_code: '10200',
      patientData: {},
    };
    const form = buildFormFromCustomer(customer);
    expect(form.firstname).toBe('จอห์น');
    expect(form.lastname).toBe('โด');
    expect(form.citizen_id).toBe('1234567890123');
    expect(form.telephone_number).toBe('0812345678');
    expect(form.gender).toBe('M');
    expect(form.blood_type).toBe('O');
    expect(form.birthdate).toBe('1990-05-15');
    expect(form.province).toBe('กรุงเทพมหานคร');
    expect(form.sub_district).toBe('ชนะสงคราม');
    expect(form.postal_code).toBe('10200');
    expect(form.hn_no).toBe('LC-26000001');
  });

  it('II2 — handles cloned-customer shape (patientData camelCase, no root flat)', async () => {
    const { buildFormFromCustomer } = await import('../src/lib/backendClient.js');
    const customer = {
      id: '13857',
      proClinicHN: 'H013857',
      patientData: {
        firstName: 'มาลี', lastName: 'ใจดี', phone: '0898765432', nationalId: '5555555555555',
        prefix: 'นาง', gender: 'F', bloodType: 'A',
        province: 'เชียงใหม่', subDistrict: 'ช้างเผือก', postalCode: '50300',
        passport: 'AA1234567', nationalityCountry: 'ไทย',
      },
    };
    const form = buildFormFromCustomer(customer);
    // camelCase → lowercase mapping
    expect(form.firstname).toBe('มาลี');
    expect(form.lastname).toBe('ใจดี');
    expect(form.telephone_number).toBe('0898765432');
    expect(form.citizen_id).toBe('5555555555555');
    expect(form.passport_id).toBe('AA1234567');
    expect(form.country).toBe('ไทย');
    expect(form.prefix).toBe('นาง');
    expect(form.blood_type).toBe('A');
    expect(form.sub_district).toBe('ช้างเผือก');
    expect(form.postal_code).toBe('50300');
    expect(form.hn_no).toBe('H013857');
  });

  it('II3 — birthdate from dobYear/Month/Day (BE) reconstructs CE ISO', async () => {
    const { buildFormFromCustomer } = await import('../src/lib/backendClient.js');
    const customer = {
      id: 'X',
      patientData: {
        firstName: 'A',
        dobYear: '2528',  // BE
        dobMonth: '6',
        dobDay: '20',
      },
    };
    const form = buildFormFromCustomer(customer);
    expect(form.birthdate).toBe('1985-06-20');  // CE
  });

  it('II4 — birthdate root ISO wins over dobYear', async () => {
    const { buildFormFromCustomer } = await import('../src/lib/backendClient.js');
    const customer = {
      id: 'X',
      birthdate: '1990-01-01',
      patientData: { dobYear: '2533', dobMonth: '1', dobDay: '1' },
    };
    const form = buildFormFromCustomer(customer);
    expect(form.birthdate).toBe('1990-01-01');
  });

  it('II5 — null/undefined customer → null', async () => {
    const { buildFormFromCustomer } = await import('../src/lib/backendClient.js');
    expect(buildFormFromCustomer(null)).toBeNull();
    expect(buildFormFromCustomer(undefined)).toBeNull();
    expect(buildFormFromCustomer('string')).toBeNull();
  });

  it('II6 — gallery_upload reads from root array OR patientData.gallery', async () => {
    const { buildFormFromCustomer } = await import('../src/lib/backendClient.js');
    const c1 = { id: 'X', gallery_upload: ['https://x/1', 'https://x/2'] };
    expect(buildFormFromCustomer(c1).gallery_upload).toEqual(['https://x/1', 'https://x/2']);
    const c2 = { id: 'X', patientData: { gallery: ['https://y/1'] } };
    expect(buildFormFromCustomer(c2).gallery_upload).toEqual(['https://y/1']);
  });

  it('II7 — consent block defaults to all-false when missing', async () => {
    const { buildFormFromCustomer } = await import('../src/lib/backendClient.js');
    const form = buildFormFromCustomer({ id: 'X' });
    expect(form.consent).toEqual({ marketing: false, healthData: false, imageMarketing: false });
  });

  it('II8 — consent.imageMarketing falls back to flat is_image_marketing_allowed when consent has no key', async () => {
    const { buildFormFromCustomer } = await import('../src/lib/backendClient.js');
    const c = {
      id: 'X',
      is_image_marketing_allowed: true,
      consent: { marketing: false, healthData: false },  // legacy: no imageMarketing key
    };
    expect(buildFormFromCustomer(c).consent.imageMarketing).toBe(true);
  });
});

describe('V33.JJ — buildFormFromCustomer round-trip with buildPatientDataFromForm', () => {
  it('JJ1 — form → patientData → form preserves every key', async () => {
    const { buildFormFromCustomer, buildPatientDataFromForm } = await import('../src/lib/backendClient.js');
    const sourceForm = {
      hn_no: 'LC-26000099',
      firstname: 'จอห์น', lastname: 'โด', nickname: 'จอย',
      prefix: 'นาย', gender: 'M',
      birthdate: '1990-05-15', blood_type: 'O',
      citizen_id: '1234567890123', passport_id: 'AA1234567', country: 'ไทย',
      telephone_number: '0812345678', email: 'jd@example.com',
      line_id: 'jdoe', facebook_link: 'https://facebook.com/jd',
      address: '99/1', province: 'กรุงเทพมหานคร', district: 'พระนคร', sub_district: 'ชนะสงคราม', postal_code: '10200',
      occupation: 'Eng', source: 'Facebook',
      symptoms: 'A', congenital_disease: 'B', history_of_drug_allergy: 'C', history_of_food_allergy: 'D',
      receipt_type: 'personal', personal_receipt_name: 'X', personal_receipt_tax_id: '111',
      gallery_upload: ['https://x/1'],
      pregnanted: false,
    };
    // Forward: form → patientData mirror (what a sale doc gets)
    const pd = buildPatientDataFromForm(sourceForm);
    // Backward: synthesize a customer doc with this patientData + minimal root,
    // then rebuild the form. Keys that came from form should round-trip.
    const synthCustomer = { id: sourceForm.hn_no, hn_no: sourceForm.hn_no, patientData: pd };
    const rebuilt = buildFormFromCustomer(synthCustomer);
    // Spot-check key fields
    expect(rebuilt.firstname).toBe(sourceForm.firstname);
    expect(rebuilt.lastname).toBe(sourceForm.lastname);
    expect(rebuilt.telephone_number).toBe(sourceForm.telephone_number);
    expect(rebuilt.citizen_id).toBe(sourceForm.citizen_id);
    expect(rebuilt.passport_id).toBe(sourceForm.passport_id);
    expect(rebuilt.country).toBe(sourceForm.country);
    expect(rebuilt.gender).toBe(sourceForm.gender);
    expect(rebuilt.blood_type).toBe(sourceForm.blood_type);
    expect(rebuilt.line_id).toBe(sourceForm.line_id);
    expect(rebuilt.facebook_link).toBe(sourceForm.facebook_link);
    expect(rebuilt.province).toBe(sourceForm.province);
    expect(rebuilt.sub_district).toBe(sourceForm.sub_district);
    expect(rebuilt.postal_code).toBe(sourceForm.postal_code);
    expect(rebuilt.gallery_upload).toEqual(sourceForm.gallery_upload);
  });
});

describe('V33.KK — updateCustomerFromForm orchestrator', () => {
  it('KK1 — writes to be_customers/{id} via updateDoc', async () => {
    const { updateCustomerFromForm } = await import('../src/lib/backendClient.js');
    const result = await updateCustomerFromForm('LC-26000001', { firstname: 'จอห์น', hn_no: 'LC-26000001' });
    expect(result.id).toBe('LC-26000001');
    expect(writtenDocPath).toContain('be_customers/LC-26000001');
  });

  it('KK2 — writes patientData mirror with camelCase keys', async () => {
    const { updateCustomerFromForm } = await import('../src/lib/backendClient.js');
    await updateCustomerFromForm('LC-26000001', {
      firstname: 'จอห์น', lastname: 'โด', telephone_number: '0812345678', hn_no: 'LC-26000001',
    });
    expect(writtenPayload.patientData.firstName).toBe('จอห์น');
    expect(writtenPayload.patientData.lastName).toBe('โด');
    expect(writtenPayload.patientData.phone).toBe('0812345678');
  });

  it('KK3 — sets lastUpdatedAt + lastUpdatedBy', async () => {
    const { updateCustomerFromForm } = await import('../src/lib/backendClient.js');
    await updateCustomerFromForm('LC-26000001', { firstname: 'A', hn_no: 'LC-26000001' }, { updatedBy: 'admin-uid' });
    expect(typeof writtenPayload.lastUpdatedAt).toBe('string');
    expect(writtenPayload.lastUpdatedBy).toBe('admin-uid');
  });

  it('KK4 — empty firstname throws with field marker', async () => {
    const { updateCustomerFromForm } = await import('../src/lib/backendClient.js');
    await expect(updateCustomerFromForm('LC-26000001', { firstname: '' })).rejects.toMatchObject({
      message: 'กรุณากรอกชื่อ',
      field: 'firstname',
    });
    expect(writtenPayload).toBeNull();
  });

  it('KK5 — invalid email rejected', async () => {
    const { updateCustomerFromForm } = await import('../src/lib/backendClient.js');
    await expect(updateCustomerFromForm('LC-26000001', {
      firstname: 'A', email: 'bad', hn_no: 'LC-26000001',
    })).rejects.toMatchObject({ field: 'email' });
  });

  it('KK6 — preserves existing hn_no (does NOT call counter)', async () => {
    const { updateCustomerFromForm } = await import('../src/lib/backendClient.js');
    await updateCustomerFromForm('LC-26000001', { firstname: 'A', hn_no: 'LC-26000001' });
    expect(writtenPayload.hn_no).toBe('LC-26000001');
    // Counter would have set a NEW LC-26###### value if invoked
    expect(writtenPayload.hn_no).not.toMatch(/^LC-26000(?!001$)/);
  });

  it('KK7 — branchId IS IMMUTABLE on update (Phase BS — was: injected when provided)', async () => {
    // Phase BS (2026-05-06) — branchId is "สาขาที่สร้างรายการ", set ONCE
    // on CREATE (addCustomer / cloneOrchestrator) and NEVER overwritten on
    // edit. updateCustomerFromForm strips branchId from both opts AND form
    // before writing. Backfill happens via /api/admin/customer-branch-
    // baseline endpoint, NOT through edit. This test was originally locked
    // pre-Phase-BS as "branchId injected when provided" — flipped to assert
    // the new immutability contract.
    const { updateCustomerFromForm } = await import('../src/lib/backendClient.js');
    await updateCustomerFromForm(
      'LC-26000001',
      { firstname: 'A', hn_no: 'LC-26000001', branchId: 'BR-MUTATION-ATTEMPT' },
      { branchId: 'BR-OPT-ATTEMPT' },
    );
    // branchId must NOT be in the written patch (immutability strip).
    expect(writtenPayload).not.toHaveProperty('branchId');
  });

  it('KK8 — empty customerId throws', async () => {
    const { updateCustomerFromForm } = await import('../src/lib/backendClient.js');
    await expect(updateCustomerFromForm('', { firstname: 'A' })).rejects.toThrow('customerId required');
  });
});

describe('V33.LL — source-grep regression guards (V33.3 wiring)', () => {
  it('LL1 — buildFormFromCustomer + updateCustomerFromForm exported', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf-8');
    expect(src).toMatch(/export \{ buildFormFromCustomer \}/);
    expect(src).toMatch(/export async function updateCustomerFromForm/);
  });
  it('LL2 — CustomerCreatePage supports mode + initialCustomer props', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/CustomerCreatePage.jsx', 'utf-8');
    expect(src).toMatch(/mode = 'create'/);
    expect(src).toMatch(/initialCustomer = null/);
    expect(src).toMatch(/buildFormFromCustomer\(initialCustomer\)/);
    expect(src).toMatch(/updateCustomerFromForm\(/);
    expect(src).toMatch(/แก้ไขข้อมูลลูกค้า/);
    expect(src).toMatch(/บันทึกการแก้ไข/);
  });
  it('LL3 — BackendDashboard wires editingCustomer takeover', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(src).toMatch(/editingCustomer/);
    expect(src).toMatch(/setEditingCustomer/);
    expect(src).toMatch(/mode="edit"/);
    expect(src).toMatch(/initialCustomer=\{editingCustomer\}/);
    expect(src).toMatch(/onEditCustomer=\{\(\) => setEditingCustomer/);
  });
  it('LL4 — CustomerDetailView renders Edit + LINE buttons in profile card', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/CustomerDetailView.jsx', 'utf-8');
    expect(src).toMatch(/data-testid="edit-customer-btn"/);
    expect(src).toMatch(/data-testid="link-line-btn"/);
    expect(src).toMatch(/onEditCustomer/);
  });
  it('LL5 — CustomerDetailView REMOVED EditCustomerIdsModal usage (V33.3)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/CustomerDetailView.jsx', 'utf-8');
    expect(src).not.toMatch(/import EditCustomerIdsModal/);
    expect(src).not.toMatch(/<EditCustomerIdsModal/);
    expect(src).not.toMatch(/data-testid="edit-customer-ids-btn"/);
    expect(src).not.toMatch(/setEditIdsOpen/);
  });
  it('LL6 — Profile card reads BOTH legacy + canonical shapes for nationalId/nationality', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/backend/CustomerDetailView.jsx', 'utf-8');
    // V33.4 multi-line InfoRow value expression — collapse whitespace before
    // matching so newlines + indentation don't break the regex.
    const collapsed = src.replace(/\s+/g, ' ');
    // nationalId InfoRow includes both canonical (pd.nationalId) + legacy (pd.idCard)
    expect(collapsed).toMatch(/pd\.nationalId \|\| pd\.idCard/);
    // สัญชาติ InfoRow includes both canonical (pd.nationalityCountry) + legacy (pd.nationality)
    expect(collapsed).toMatch(/pd\.nationalityCountry \|\| pd\.nationality/);
    // V33.4 (D1) — derives 'ไทย' from customer_type='thai' fallback
    expect(collapsed).toMatch(/customer_type === 'thai'/);
  });
});
