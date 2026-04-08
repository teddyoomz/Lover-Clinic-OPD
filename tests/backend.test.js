// ─── Backend System Vitest — ครอบคลุมทุกการใช้งาน ─────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';

const app = initializeApp({ apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20', projectId: 'loverclinic-opd-4c39b', appId: '1:841626867498:web:07d226722602a082eae3b8' });
const db = getFirestore(app);
const P = ['artifacts', 'loverclinic-opd-4c39b', 'public', 'data'];
const clean = (o) => JSON.parse(JSON.stringify(o));
const TS = Date.now();

// ═══════════════════════════════════════════════════════════════════════════
// 1. CUSTOMER CRUD
// ═══════════════════════════════════════════════════════════════════════════
describe('Customer CRUD', () => {
  const CID = `TEST-CUST-${TS}`;
  const ref = () => doc(db, ...P, 'be_customers', CID);

  afterAll(async () => { try { await deleteDoc(ref()); } catch {} });

  it('create customer', async () => {
    await setDoc(ref(), clean({
      proClinicId: CID, proClinicHN: 'HN-TEST',
      patientData: { prefix: 'นาย', firstName: 'ทดสอบ', lastName: 'ระบบ', phone: '0999999999', gender: 'ชาย' },
      courses: [{ name: 'Botox 100U', product: 'Nabota 200 U', qty: '200 / 200 U', status: 'กำลังใช้งาน' }],
      expiredCourses: [], appointments: [], treatmentSummary: [], treatmentCount: 0,
      cloneStatus: 'complete', clonedAt: new Date().toISOString(),
    }));
    const snap = await getDoc(ref());
    expect(snap.exists()).toBe(true);
    expect(snap.data().patientData.firstName).toBe('ทดสอบ');
  });

  it('read customer fields', async () => {
    const d = (await getDoc(ref())).data();
    expect(d.proClinicHN).toBe('HN-TEST');
    expect(d.courses).toHaveLength(1);
    expect(d.courses[0].name).toBe('Botox 100U');
    expect(d.cloneStatus).toBe('complete');
  });

  it('update customer', async () => {
    await updateDoc(ref(), { 'patientData.phone': '0888888888' });
    const d = (await getDoc(ref())).data();
    expect(d.patientData.phone).toBe('0888888888');
    expect(d.patientData.firstName).toBe('ทดสอบ'); // other fields intact
  });

  it('delete customer', async () => {
    await deleteDoc(ref());
    expect((await getDoc(ref())).exists()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. TREATMENT CRUD + BILLING
// ═══════════════════════════════════════════════════════════════════════════
describe('Treatment CRUD + Billing', () => {
  const TID = `BT-TEST-${TS}`;
  const ref = () => doc(db, ...P, 'be_treatments', TID);

  afterAll(async () => { try { await deleteDoc(ref()); } catch {} });

  it('create treatment with all fields', async () => {
    await setDoc(ref(), clean({
      treatmentId: TID, customerId: 'TEST', createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'หมอทดสอบ',
        symptoms: 'CC', diagnosis: 'DX', treatmentInfo: 'Tx', treatmentPlan: 'Plan',
        vitals: { weight: '70', height: '175', temperature: '36.5' },
        healthInfo: { bloodType: 'O', drugAllergy: 'Aspirin' },
        beforeImages: [{ dataUrl: 'data:img/test', id: '' }],
        charts: [{ dataUrl: 'data:chart', fabricJson: '{}', templateId: 'blank' }],
        labItems: [{ productName: 'CBC', qty: '1', pdfBase64: 'LABPDF' }],
        treatmentFiles: [{ slot: 1, pdfBase64: 'FILEPDF', fileName: 'f.pdf' }],
        medications: [{ name: 'Para', dosage: '3x', qty: '10' }],
        treatmentItems: [{ name: 'Botox', qty: '1', unit: 'U' }],
        consumables: [{ name: 'Gauze', qty: '5' }],
        doctorFees: [{ name: 'Dr', fee: '3000' }],
        purchasedItems: [{ name: 'Course A', qty: '1', unitPrice: '5000', itemType: 'course' }],
        billing: { subtotal: 5000, netTotal: 5000 },
        payment: { paymentStatus: '2', channels: [{ enabled: true, method: 'เงินสด', amount: '5000' }] },
        sellers: [{ id: 's1', percent: '100', total: '5000' }],
        hasSale: true, createdBy: 'backend',
      },
    }));
    expect((await getDoc(ref())).exists()).toBe(true);
  });

  it('verify OPD fields', async () => {
    const d = (await getDoc(ref())).data().detail;
    expect(d.symptoms).toBe('CC');
    expect(d.diagnosis).toBe('DX');
    expect(d.vitals.weight).toBe('70');
    expect(d.healthInfo.drugAllergy).toBe('Aspirin');
  });

  it('verify media fields (photos, chart, lab, files)', async () => {
    const d = (await getDoc(ref())).data().detail;
    expect(d.beforeImages).toHaveLength(1);
    expect(d.charts).toHaveLength(1);
    expect(d.charts[0].fabricJson).toBe('{}');
    expect(d.labItems[0].pdfBase64).toBe('LABPDF');
    expect(d.treatmentFiles[0].fileName).toBe('f.pdf');
  });

  it('verify billing + payment + sellers', async () => {
    const d = (await getDoc(ref())).data().detail;
    expect(d.hasSale).toBe(true);
    expect(d.billing.netTotal).toBe(5000);
    expect(d.payment.paymentStatus).toBe('2');
    expect(d.payment.channels[0].method).toBe('เงินสด');
    expect(d.sellers[0].percent).toBe('100');
    expect(d.purchasedItems[0].name).toBe('Course A');
  });

  it('edit treatment', async () => {
    const d = (await getDoc(ref())).data().detail;
    await updateDoc(ref(), { detail: clean({ ...d, symptoms: 'CC updated', payment: { ...d.payment, paymentStatus: '4' } }) });
    const d2 = (await getDoc(ref())).data().detail;
    expect(d2.symptoms).toBe('CC updated');
    expect(d2.payment.paymentStatus).toBe('4');
    expect(d2.beforeImages).toHaveLength(1); // intact
  });

  it('delete treatment', async () => {
    await deleteDoc(ref());
    expect((await getDoc(ref())).exists()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. APPOINTMENT CRUD
// ═══════════════════════════════════════════════════════════════════════════
describe('Appointment CRUD', () => {
  const ids = [];
  const DATE = '2026-12-25';
  const ref = (id) => doc(db, ...P, 'be_appointments', id);

  afterAll(async () => { for (const id of ids) try { await deleteDoc(ref(id)); } catch {} });

  it('create appointments in different rooms', async () => {
    const appts = [
      { room: 'ห้อง 1', start: '10:00', end: '10:30', customer: 'A', doctor: 'Dr.1', status: 'pending' },
      { room: 'ห้อง 2', start: '14:00', end: '15:00', customer: 'B', doctor: 'Dr.2', status: 'confirmed' },
      { room: 'ห้อง 1', start: '16:00', end: '16:30', customer: 'C', doctor: 'Dr.1', status: 'done' },
    ];
    for (const a of appts) {
      const id = `BA-VT-${TS}-${Math.random().toString(36).slice(2, 6)}`;
      ids.push(id);
      await setDoc(ref(id), clean({
        appointmentId: id, customerId: 'TEST', customerName: a.customer, customerHN: 'HN',
        date: DATE, startTime: a.start, endTime: a.end,
        doctorName: a.doctor, roomName: a.room, status: a.status,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }));
    }
    expect(ids).toHaveLength(3);
  });

  it('query by date', async () => {
    const q1 = query(collection(db, ...P, 'be_appointments'), where('date', '==', DATE));
    const snap = await getDocs(q1);
    const found = snap.docs.filter(d => ids.includes(d.id));
    expect(found.length).toBe(3);
  });

  it('room grouping', async () => {
    const q1 = query(collection(db, ...P, 'be_appointments'), where('date', '==', DATE));
    const snap = await getDocs(q1);
    const rooms = [...new Set(snap.docs.filter(d => ids.includes(d.id)).map(d => d.data().roomName))];
    expect(rooms).toContain('ห้อง 1');
    expect(rooms).toContain('ห้อง 2');
  });

  it('update appointment', async () => {
    await updateDoc(ref(ids[0]), { status: 'cancelled', roomName: 'ห้อง 3' });
    const d = (await getDoc(ref(ids[0]))).data();
    expect(d.status).toBe('cancelled');
    expect(d.roomName).toBe('ห้อง 3');
    expect(d.customerName).toBe('A'); // intact
  });

  it('delete appointment', async () => {
    for (const id of ids) await deleteDoc(ref(id));
    for (const id of ids) expect((await getDoc(ref(id))).exists()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. COURSE TRANSFORM + DEDUCTION
// ═══════════════════════════════════════════════════════════════════════════
describe('Course Transform + Deduction', () => {
  const CID = `TEST-COURSE-${TS}`;
  const ref = () => doc(db, ...P, 'be_customers', CID);

  afterAll(async () => { try { await deleteDoc(ref()); } catch {} });

  it('create customer with courses', async () => {
    await setDoc(ref(), clean({
      proClinicId: CID, proClinicHN: 'HN-C',
      patientData: { firstName: 'CourseTest' },
      courses: [
        { name: 'Botox 100U', product: 'Nabota 200 U', qty: '200 / 200 U' },
        { name: 'Acne Tx', product: 'Acne Tx', qty: '12 / 12 ครั้ง' },
        { name: 'Pico', product: 'Pico', qty: '1 / 1 ครั้ง' },
      ],
    }));
    expect((await getDoc(ref())).data().courses).toHaveLength(3);
  });

  it('transform to form format', () => {
    const raw = [
      { name: 'Botox', product: 'Nabota 200 U', qty: '200 / 200 U' },
      { name: 'Acne', product: 'Acne Tx', qty: '12 / 12 ครั้ง' },
    ];
    const transformed = raw.map((c, i) => {
      const m = (c.qty || '').match(/^([\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/);
      return {
        courseId: `be-c-${i}`, courseName: c.name,
        products: [{ rowId: `be-r-${i}`, name: c.product, remaining: m ? String(parseFloat(m[1])) : '0', unit: m ? m[3].trim() : 'ครั้ง' }],
      };
    });
    expect(transformed).toHaveLength(2);
    expect(transformed[0].products[0].remaining).toBe('200');
    expect(transformed[0].products[0].unit).toBe('U');
    expect(transformed[1].products[0].remaining).toBe('12');
    expect(transformed[1].products[0].unit).toBe('ครั้ง');
  });

  it('deduct course qty', async () => {
    const courses = (await getDoc(ref())).data().courses;
    const updated = courses.map((c, i) => {
      if (i === 0) { // deduct Botox
        const m = c.qty.match(/^([\d.,]+)(\s*\/\s*.*)$/);
        if (m) return { ...c, qty: (parseFloat(m[1]) - 1) + m[2] };
      }
      return c;
    });
    await updateDoc(ref(), { courses: updated });
    const d = (await getDoc(ref())).data();
    expect(d.courses[0].qty).toMatch(/^199/);
    expect(d.courses[1].qty).toMatch(/^12/); // unchanged
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. MASTER DATA READ
// ═══════════════════════════════════════════════════════════════════════════
describe('Master Data Read', () => {
  it('read products from master_data', async () => {
    const snap = await getDocs(collection(db, ...P, 'master_data', 'products', 'items'));
    expect(snap.size).toBeGreaterThan(0);
  });

  it('read doctors from master_data', async () => {
    const snap = await getDocs(collection(db, ...P, 'master_data', 'doctors', 'items'));
    expect(snap.size).toBeGreaterThan(0);
  });

  it('read courses from master_data', async () => {
    const snap = await getDocs(collection(db, ...P, 'master_data', 'courses', 'items'));
    expect(snap.size).toBeGreaterThan(0);
  });

  it('filter products by type', async () => {
    const snap = await getDocs(collection(db, ...P, 'master_data', 'products', 'items'));
    const meds = snap.docs.filter(d => d.data().type === 'ยา');
    const services = snap.docs.filter(d => d.data().type === 'บริการ');
    const retail = snap.docs.filter(d => d.data().type === 'สินค้าหน้าร้าน');
    const consumable = snap.docs.filter(d => d.data().type === 'สินค้าสิ้นเปลือง');
    expect(meds.length + services.length + retail.length + consumable.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. UNDEFINED STRIPPING (Firestore safety)
// ═══════════════════════════════════════════════════════════════════════════
describe('Undefined Stripping', () => {
  const TID = `BT-UNDEF-${TS}`;
  const ref = () => doc(db, ...P, 'be_treatments', TID);

  afterAll(async () => { try { await deleteDoc(ref()); } catch {} });

  it('clean() removes undefined fields', () => {
    const obj = clean({ a: 1, b: undefined, c: { d: undefined, e: 'ok' } });
    expect(obj).toEqual({ a: 1, c: { e: 'ok' } });
    expect('b' in obj).toBe(false);
    expect('d' in obj.c).toBe(false);
  });

  it('save to Firestore with cleaned undefined fields', async () => {
    const data = clean({
      treatmentId: TID, customerId: 'TEST', createdBy: 'backend',
      detail: {
        doctorId: undefined, doctorName: 'Dr', roomName: undefined,
        labItems: [{ productId: undefined, productName: 'Lab', pdfBase64: 'PDF' }],
        treatmentFiles: [{ slot: 1, fileId: undefined, pdfBase64: 'F', fileName: 'f.pdf' }],
      },
    });
    await setDoc(ref(), data);
    const d = (await getDoc(ref())).data();
    expect(d.detail.doctorName).toBe('Dr');
    expect('doctorId' in d.detail).toBe(false);
    expect('roomName' in d.detail).toBe(false);
    expect(d.detail.labItems[0].productName).toBe('Lab');
    expect('productId' in d.detail.labItems[0]).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. PARSE THAI DATE
// ═══════════════════════════════════════════════════════════════════════════
describe('Parse Thai Date', () => {
  const TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  function parseThaiDate(str) {
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const m = str.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
    if (!m) return null;
    const day = m[1].padStart(2, '0');
    const mi = TH.indexOf(m[2]);
    if (mi < 0) return null;
    const month = String(mi + 1).padStart(2, '0');
    const year = parseInt(m[3]) > 2400 ? m[3] - 543 : m[3];
    return `${year}-${month}-${day}`;
  }

  it('parse "8 เมษายน 2026"', () => expect(parseThaiDate('8 เมษายน 2026')).toBe('2026-04-08'));
  it('parse "14 เมษายน 2026"', () => expect(parseThaiDate('14 เมษายน 2026')).toBe('2026-04-14'));
  it('parse "1 มกราคม 2569" (BE)', () => expect(parseThaiDate('1 มกราคม 2569')).toBe('2026-01-01'));
  it('ISO passthrough', () => expect(parseThaiDate('2026-04-08')).toBe('2026-04-08'));
  it('null returns null', () => expect(parseThaiDate(null)).toBe(null));
  it('empty returns null', () => expect(parseThaiDate('')).toBe(null));
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. PROMOTION COURSE PICKER LOGIC
// ═══════════════════════════════════════════════════════════════════════════
describe('Promotion Course Picker', () => {
  it('create promotion courses entries with promotionId', () => {
    const promoId = 33;
    const promoName = 'Nov';
    const selectedCourses = [
      { id: '1003', name: 'Filler 3900 แถมสลายแฟต', price: '3900', unit: 'คอร์ส' },
      { id: '775', name: 'Allergan กราม', price: '1000', unit: 'คอร์ส' },
    ];
    const entries = selectedCourses.map(c => ({
      courseId: `promo-${promoId}-course-${c.id}`,
      courseName: c.name,
      promotionId: promoId,
      products: [{ rowId: `promo-${promoId}-row-${c.id}`, name: c.name, remaining: '1', total: '1', unit: c.unit || 'คอร์ส' }],
    }));

    expect(entries).toHaveLength(2);
    expect(entries[0].promotionId).toBe(33);
    expect(entries[0].courseName).toBe('Filler 3900 แถมสลายแฟต');
    expect(entries[0].products[0].rowId).toBe('promo-33-row-1003');
    expect(entries[1].courseName).toBe('Allergan กราม');
  });

  it('group promotion courses by promotionId', () => {
    const allCourses = [
      { courseId: 'c1', courseName: 'Regular', promotionId: undefined, products: [{ rowId: 'r1', name: 'P1', remaining: '5' }] },
      { courseId: 'pc1', courseName: 'Filler', promotionId: 33, products: [{ rowId: 'pr1', name: 'Filler', remaining: '1' }] },
      { courseId: 'pc2', courseName: 'Allergan', promotionId: 33, products: [{ rowId: 'pr2', name: 'Allergan', remaining: '1' }] },
      { courseId: 'pc3', courseName: 'Botox', promotionId: 99, products: [{ rowId: 'pr3', name: 'Botox', remaining: '1' }] },
    ];
    const promos = [{ id: 33, promotionName: 'Nov' }, { id: 99, promotionName: 'Dec' }];

    // Regular courses (no promotionId)
    const regularCourses = allCourses.filter(c => !c.promotionId);
    expect(regularCourses).toHaveLength(1);

    // Promotion groups
    const promoCourses = allCourses.filter(c => c.promotionId);
    const groups = {};
    promoCourses.forEach(c => {
      const pid = c.promotionId;
      if (!groups[pid]) {
        const promo = promos.find(p => String(p.id) === String(pid));
        groups[pid] = { promotionId: pid, promotionName: promo?.promotionName || '', courses: [] };
      }
      groups[pid].courses.push(c);
    });
    const groupList = Object.values(groups);

    expect(groupList).toHaveLength(2);
    expect(groupList[0].promotionName).toBe('Nov');
    expect(groupList[0].courses).toHaveLength(2);
    expect(groupList[1].promotionName).toBe('Dec');
    expect(groupList[1].courses).toHaveLength(1);
  });

  it('selected course items from promotion appear in treatment items', () => {
    const selectedCourseItems = new Set(['promo-33-row-1003']); // user ticked Filler
    const allCourses = [
      { courseId: 'pc1', courseName: 'Filler 3900', promotionId: 33, products: [{ rowId: 'promo-33-row-1003', name: 'Filler Deep', remaining: '1', unit: 'cc' }] },
    ];
    // Build treatment items from selected
    const items = [];
    for (const c of allCourses) {
      for (const p of c.products) {
        if (selectedCourseItems.has(p.rowId)) {
          items.push({ rowId: p.rowId, courseName: c.courseName, productName: p.name, qty: '1', unit: p.unit });
        }
      }
    }
    expect(items).toHaveLength(1);
    expect(items[0].productName).toBe('Filler Deep');
    expect(items[0].courseName).toBe('Filler 3900');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. TREATMENT SAVE — ALL SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════
describe('Treatment Save — All Scenarios', () => {
  const CID = `SCENARIO-${TS}`;
  const tids = [];
  const custRef = () => doc(db, ...P, 'be_customers', CID);
  const txRef = (id) => doc(db, ...P, 'be_treatments', id);

  beforeAll(async () => {
    await setDoc(custRef(), clean({
      proClinicId: CID, proClinicHN: 'HN-SC',
      patientData: { firstName: 'Scenario', lastName: 'Test' },
      courses: [
        { name: 'Botox 100U', product: 'Nabota 200 U', qty: '100 / 100 U' },
        { name: 'Acne Tx', product: 'Acne Tx', qty: '5 / 5 ครั้ง' },
      ],
      cloneStatus: 'complete',
    }));
  });

  afterAll(async () => {
    for (const id of tids) try { await deleteDoc(txRef(id)); } catch {}
    try { await deleteDoc(custRef()); } catch {}
  });

  // ─── Case 1: OPD only (no sale, no photos, no files) ───
  it('Case 1: OPD only — minimal treatment', async () => {
    const id = `BT-SC1-${TS}`;
    tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.A',
        symptoms: 'ปวดหัว', diagnosis: 'Migraine',
        vitals: { weight: '70', height: '175' },
        hasSale: false, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.symptoms).toBe('ปวดหัว');
    expect(d.hasSale).toBe(false);
    expect(d.purchasedItems).toBeUndefined();
    expect(d.billing).toBeUndefined();
  });

  // ─── Case 2: OPD + Photos + Chart (no sale) ───
  it('Case 2: OPD + photos + chart — no billing', async () => {
    const id = `BT-SC2-${TS}`;
    tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.A',
        symptoms: 'Acne', diagnosis: 'Acne vulgaris',
        beforeImages: [{ dataUrl: 'data:img/before1', id: '' }, { dataUrl: 'data:img/before2', id: '' }],
        afterImages: [{ dataUrl: 'data:img/after1', id: '' }],
        otherImages: [],
        charts: [{ dataUrl: 'data:chart/1', fabricJson: '{"obj":[]}', templateId: 'tmpl1' }],
        hasSale: false, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.beforeImages).toHaveLength(2);
    expect(d.afterImages).toHaveLength(1);
    expect(d.charts).toHaveLength(1);
    expect(d.charts[0].fabricJson).toBe('{"obj":[]}');
    expect(d.hasSale).toBe(false);
  });

  // ─── Case 3: OPD + Lab + Files (no sale) ───
  it('Case 3: OPD + lab + PDF files — no billing', async () => {
    const id = `BT-SC3-${TS}`;
    tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.B',
        symptoms: 'Check up', diagnosis: 'Normal',
        labItems: [
          { productName: 'CBC', qty: '1', price: '500', pdfBase64: 'LABPDF1', information: 'Normal range' },
          { productName: 'LFT', qty: '1', price: '800', pdfBase64: 'LABPDF2', information: 'Elevated ALT' },
        ],
        treatmentFiles: [{ slot: 1, pdfBase64: 'CONSENT_PDF', fileName: 'consent.pdf' }],
        hasSale: false, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.labItems).toHaveLength(2);
    expect(d.labItems[0].pdfBase64).toBe('LABPDF1');
    expect(d.labItems[1].information).toBe('Elevated ALT');
    expect(d.treatmentFiles).toHaveLength(1);
    expect(d.treatmentFiles[0].fileName).toBe('consent.pdf');
  });

  // ─── Case 4: OPD + Tick existing courses (deduction) ───
  it('Case 4: OPD + tick existing customer courses', async () => {
    const id = `BT-SC4-${TS}`;
    tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.A',
        symptoms: 'Botox', diagnosis: 'Cosmetic',
        treatmentItems: [
          { rowId: 'be-r-0', courseName: 'Botox 100U', productName: 'Nabota 200 U', qty: '1', unit: 'U' },
          { rowId: 'be-r-1', courseName: 'Acne Tx', productName: 'Acne Tx', qty: '1', unit: 'ครั้ง' },
        ],
        hasSale: false, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.treatmentItems).toHaveLength(2);
    expect(d.treatmentItems[0].productName).toBe('Nabota 200 U');
    expect(d.treatmentItems[1].courseName).toBe('Acne Tx');
  });

  // ─── Case 5: OPD + Buy course (ซื้อคอร์สเพิ่ม) + billing ───
  it('Case 5: OPD + buy course + billing + payment', async () => {
    const id = `BT-SC5-${TS}`;
    tids.push(id);
    const purchasedCourse = { id: 'c1003', name: 'Filler 3900', qty: '1', unitPrice: '3900', itemType: 'course' };
    // Simulate: bought course adds to customerCourses with products
    const courseEntry = {
      courseId: 'purchased-course-c1003',
      courseName: 'Filler 3900',
      products: [{ rowId: 'purchased-c1003-row-self', name: 'Filler 3900', remaining: '1', total: '1', unit: 'คอร์ส' }],
    };
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.A',
        symptoms: 'Filler', diagnosis: 'Cosmetic',
        treatmentItems: [{ rowId: courseEntry.products[0].rowId, courseName: 'Filler 3900', productName: 'Filler 3900', qty: '1', unit: 'คอร์ส' }],
        purchasedItems: [purchasedCourse],
        billing: { subtotal: 3900, netTotal: 3900, medDisc: 0, billDiscAmt: 0 },
        payment: { paymentStatus: '2', channels: [{ enabled: true, method: 'เงินสด', amount: '3900' }], paymentDate: '2026-04-08' },
        sellers: [{ id: 's1', percent: '100', total: '3900' }],
        hasSale: true, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.hasSale).toBe(true);
    expect(d.purchasedItems).toHaveLength(1);
    expect(d.purchasedItems[0].itemType).toBe('course');
    expect(d.billing.netTotal).toBe(3900);
    expect(d.payment.paymentStatus).toBe('2');
    expect(d.sellers[0].percent).toBe('100');
    expect(d.treatmentItems).toHaveLength(1);
    expect(d.treatmentItems[0].productName).toBe('Filler 3900');
  });

  // ─── Case 6: OPD + Buy promotion (ซื้อโปรโมชัน) — sub-courses auto-populate ───
  it('Case 6: OPD + buy promotion — sub-courses as bundle', async () => {
    const id = `BT-SC6-${TS}`;
    tids.push(id);
    // Simulate: promotion "Nov" has courses: Filler 3900 (products: BA-ฟิลเลอร์ A) + Allergan กราม (products: Allergan 100 U)
    const promoCourseEntries = [
      { courseId: 'promo-33-course-1003', courseName: 'Filler 3900 แถมสลายแฟต', promotionId: 33,
        products: [{ rowId: 'promo-33-row-1003-277', name: 'BA - ฟิลเลอร์ A', remaining: '1', total: '1', unit: 'ซีซี' }] },
      { courseId: 'promo-33-course-775', courseName: 'Allergan กราม', promotionId: 33,
        products: [{ rowId: 'promo-33-row-775-941', name: 'Allergan 100 U', remaining: '1', total: '1', unit: 'U' }] },
    ];
    // User ticked both products from promotion
    const treatmentItems = [
      { rowId: 'promo-33-row-1003-277', courseName: 'Filler 3900 แถมสลายแฟต', productName: 'BA - ฟิลเลอร์ A', qty: '1', unit: 'ซีซี' },
      { rowId: 'promo-33-row-775-941', courseName: 'Allergan กราม', productName: 'Allergan 100 U', qty: '1', unit: 'U' },
    ];
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.A',
        symptoms: 'Promotion', diagnosis: 'Cosmetic',
        treatmentItems,
        purchasedItems: [{ id: 33, name: 'Nov', qty: '1', unitPrice: '3900', itemType: 'promotion' }],
        promotionCourses: promoCourseEntries,
        billing: { subtotal: 3900, netTotal: 3900 },
        payment: { paymentStatus: '2', channels: [{ enabled: true, method: 'โอนธนาคาร', amount: '3900' }] },
        sellers: [{ id: 's1', percent: '100', total: '3900' }],
        hasSale: true, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.purchasedItems[0].itemType).toBe('promotion');
    expect(d.purchasedItems[0].name).toBe('Nov');
    expect(d.treatmentItems).toHaveLength(2);
    expect(d.treatmentItems[0].productName).toBe('BA - ฟิลเลอร์ A');
    expect(d.treatmentItems[1].productName).toBe('Allergan 100 U');
    expect(d.promotionCourses).toHaveLength(2);
    expect(d.promotionCourses[0].promotionId).toBe(33);
  });

  // ─── Case 7: OPD + Medications + Consumables + Doctor Fees ───
  it('Case 7: OPD + meds + consumables + doctor fees', async () => {
    const id = `BT-SC7-${TS}`;
    tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.C',
        symptoms: 'Pain', diagnosis: 'Chronic pain',
        medications: [
          { name: 'Paracetamol 500mg', dosage: '3 เวลา หลังอาหาร', qty: '30', unitPrice: '2', unit: 'เม็ด' },
          { name: 'Ibuprofen 400mg', dosage: '2 เวลา', qty: '20', unitPrice: '5', unit: 'เม็ด' },
        ],
        consumables: [
          { name: 'ผ้าก๊อซ', qty: '10', unit: 'ชิ้น' },
          { name: 'ถุงมือ', qty: '2', unit: 'คู่' },
        ],
        doctorFees: [
          { doctorId: '1', name: 'Dr.C', fee: '5000' },
          { doctorId: '2', name: 'Asst.D', fee: '1000' },
        ],
        hasSale: false, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.medications).toHaveLength(2);
    expect(d.medications[0].dosage).toBe('3 เวลา หลังอาหาร');
    expect(d.consumables).toHaveLength(2);
    expect(d.doctorFees).toHaveLength(2);
    expect(d.doctorFees[0].fee).toBe('5000');
  });

  // ─── Case 8: OPD + Split payment (3 channels) + 2 sellers ───
  it('Case 8: split payment (3 channels) + 2 sellers', async () => {
    const id = `BT-SC8-${TS}`;
    tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.A',
        symptoms: 'Full', diagnosis: 'Full treatment',
        purchasedItems: [{ id: 'p1', name: 'Product A', qty: '1', unitPrice: '10000', itemType: 'product' }],
        billing: { subtotal: 10000, netTotal: 10000 },
        payment: {
          paymentStatus: '4', // split
          channels: [
            { enabled: true, method: 'เงินสด', amount: '5000' },
            { enabled: true, method: 'โอนธนาคาร', amount: '3000' },
            { enabled: true, method: 'บัตรเครดิต', amount: '2000' },
          ],
          paymentDate: '2026-04-08', paymentTime: '14:30', refNo: 'REF-001',
        },
        sellers: [
          { id: 's1', percent: '60', total: '6000' },
          { id: 's2', percent: '40', total: '4000' },
        ],
        hasSale: true, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.payment.paymentStatus).toBe('4');
    expect(d.payment.channels).toHaveLength(3);
    expect(d.payment.channels[0].method).toBe('เงินสด');
    expect(d.payment.channels[2].amount).toBe('2000');
    expect(d.payment.refNo).toBe('REF-001');
    expect(d.sellers).toHaveLength(2);
    expect(Number(d.sellers[0].total) + Number(d.sellers[1].total)).toBe(10000);
  });

  // ─── Case 9: OPD + Medical Certificate ───
  it('Case 9: OPD + medical certificate', async () => {
    const id = `BT-SC9-${TS}`;
    tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.A',
        symptoms: 'Sick', diagnosis: 'Flu',
        medCertActuallyCome: true, medCertIsRest: true, medCertPeriod: '3 วัน',
        medCertIsOther: false,
        hasSale: false, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.medCertActuallyCome).toBe(true);
    expect(d.medCertIsRest).toBe(true);
    expect(d.medCertPeriod).toBe('3 วัน');
  });

  // ─── Case 10: FULL treatment (everything combined) ───
  it('Case 10: FULL treatment — OPD + photos + chart + lab + files + courses + promotion + meds + billing + payment + sellers + medcert', async () => {
    const id = `BT-SC10-${TS}`;
    tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorId: '1', doctorName: 'Dr.A',
        assistants: [{ id: '2', name: 'Asst.B' }],
        symptoms: 'CC full', physicalExam: 'PE full', diagnosis: 'DX full',
        treatmentInfo: 'Tx full', treatmentPlan: 'Plan full', treatmentNote: 'Note full', additionalNote: 'Add note',
        vitals: { weight: '70', height: '175', bmi: '22.9', temperature: '36.5', pulseRate: '72', systolicBP: '120', diastolicBP: '80', oxygenSaturation: '99' },
        healthInfo: { bloodType: 'O', congenitalDisease: 'DM', drugAllergy: 'Pen', treatmentHistory: 'Surgery 2020' },
        beforeImages: [{ dataUrl: 'data:img/b1', id: '' }],
        afterImages: [{ dataUrl: 'data:img/a1', id: '' }],
        otherImages: [{ dataUrl: 'data:img/o1', id: '' }],
        charts: [{ dataUrl: 'data:chart1', fabricJson: '{}', templateId: 'blank' }],
        labItems: [{ productName: 'CBC', qty: '1', price: '500', pdfBase64: 'LPDF', information: 'ok' }],
        treatmentFiles: [{ slot: 1, pdfBase64: 'FPDF', fileName: 'consent.pdf' }],
        treatmentItems: [
          { rowId: 'r1', courseName: 'Botox', productName: 'Nabota', qty: '1', unit: 'U' },
          { rowId: 'promo-33-row-1', courseName: 'Filler', productName: 'Filler A', qty: '1', unit: 'cc' },
        ],
        medications: [{ name: 'Med1', dosage: '3x', qty: '10', unitPrice: '5', unit: 'tab' }],
        consumables: [{ name: 'Gauze', qty: '5', unit: 'pc' }],
        doctorFees: [{ doctorId: '1', name: 'Dr.A', fee: '5000' }],
        purchasedItems: [
          { id: 'c1', name: 'Course A', qty: '1', unitPrice: '5000', itemType: 'course' },
          { id: 33, name: 'Nov', qty: '1', unitPrice: '3900', itemType: 'promotion' },
        ],
        billing: { subtotal: 8900, medDisc: 0, billDiscAmt: 500, netTotal: 8400 },
        payment: {
          paymentStatus: '4',
          channels: [{ enabled: true, method: 'เงินสด', amount: '5000' }, { enabled: true, method: 'โอนธนาคาร', amount: '3400' }],
          paymentDate: '2026-04-08', paymentTime: '15:00', refNo: 'TRF-999', saleNote: 'VIP',
        },
        sellers: [{ id: 's1', percent: '70', total: '5880' }, { id: 's2', percent: '30', total: '2520' }],
        medCertActuallyCome: true, medCertIsRest: true, medCertPeriod: '2 วัน',
        hasSale: true, createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    // OPD
    expect(d.symptoms).toBe('CC full');
    expect(d.vitals.weight).toBe('70');
    expect(d.healthInfo.drugAllergy).toBe('Pen');
    // Media
    expect(d.beforeImages).toHaveLength(1);
    expect(d.charts[0].fabricJson).toBe('{}');
    expect(d.labItems[0].pdfBase64).toBe('LPDF');
    expect(d.treatmentFiles[0].fileName).toBe('consent.pdf');
    // Courses + Promotion
    expect(d.treatmentItems).toHaveLength(2);
    expect(d.purchasedItems).toHaveLength(2);
    expect(d.purchasedItems[1].itemType).toBe('promotion');
    // Meds + Consumables + Fees
    expect(d.medications).toHaveLength(1);
    expect(d.consumables).toHaveLength(1);
    expect(d.doctorFees[0].fee).toBe('5000');
    // Billing + Payment
    expect(d.billing.netTotal).toBe(8400);
    expect(d.payment.channels).toHaveLength(2);
    expect(d.payment.refNo).toBe('TRF-999');
    expect(d.payment.saleNote).toBe('VIP');
    expect(d.sellers).toHaveLength(2);
    // MedCert
    expect(d.medCertPeriod).toBe('2 วัน');
    expect(d.createdBy).toBe('backend');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. FORMAT THAI DATE FULL
// ═══════════════════════════════════════════════════════════════════════════
describe('Format Thai Date Full', () => {
  const TH_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  function formatThaiDateFull(dateStr) {
    if (!dateStr) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y,m,d] = dateStr.split('-').map(Number);
      return `${d} ${TH_FULL[m-1]} ${y+543}`;
    }
    if (TH_FULL.some(mn => dateStr.includes(mn))) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()} ${TH_FULL[d.getMonth()]} ${d.getFullYear()+543}`;
  }

  it('2026-04-08 → 8 เมษายน 2569', () => expect(formatThaiDateFull('2026-04-08')).toBe('8 เมษายน 2569'));
  it('2026-01-15 → 15 มกราคม 2569', () => expect(formatThaiDateFull('2026-01-15')).toBe('15 มกราคม 2569'));
  it('2026-12-31 → 31 ธันวาคม 2569', () => expect(formatThaiDateFull('2026-12-31')).toBe('31 ธันวาคม 2569'));
  it('already Thai → passthrough', () => expect(formatThaiDateFull('8 เมษายน 2569')).toBe('8 เมษายน 2569'));
  it('null → dash', () => expect(formatThaiDateFull(null)).toBe('-'));
  it('empty → dash', () => expect(formatThaiDateFull('')).toBe('-'));
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. OPD CREATE + EDIT — FULL ROUNDTRIP
// ═══════════════════════════════════════════════════════════════════════════
describe('OPD Create + Edit Roundtrip', () => {
  const CID = `RT-${TS}`;
  const custRef = () => doc(db, ...P, 'be_customers', CID);
  const tids = [];
  const txRef = (id) => doc(db, ...P, 'be_treatments', id);

  beforeAll(async () => {
    await setDoc(custRef(), clean({
      proClinicId: CID, proClinicHN: 'HN-RT',
      patientData: { firstName: 'Roundtrip', lastName: 'Test' },
      courses: [{ name: 'Botox 100U', product: 'Nabota', qty: '100 / 100 U' }],
    }));
  });
  afterAll(async () => {
    for (const id of tids) try { await deleteDoc(txRef(id)); } catch {}
    try { await deleteDoc(custRef()); } catch {}
  });

  it('create OPD with meds only (no sale) — should save without seller', async () => {
    const id = `BT-RT1-${TS}`; tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.A',
        symptoms: 'Pain', diagnosis: 'Chronic',
        medications: [{ name: 'Para', dosage: '3x', qty: '10' }],
        hasSale: false, // backend: meds alone don't force hasSale
        createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.hasSale).toBe(false);
    expect(d.medications).toHaveLength(1);
    expect(d.sellers).toBeUndefined(); // no seller required
  });

  it('create OPD + buy course → hasSale=true + seller required', async () => {
    const id = `BT-RT2-${TS}`; tids.push(id);
    await setDoc(txRef(id), clean({
      treatmentId: id, customerId: CID, createdBy: 'backend', createdAt: new Date().toISOString(),
      detail: {
        treatmentDate: '2026-04-08', doctorName: 'Dr.A',
        symptoms: 'Botox', diagnosis: 'Cosmetic',
        purchasedItems: [{ id: 'c1', name: 'Filler', qty: '1', unitPrice: '5000', itemType: 'course' }],
        billing: { subtotal: 5000, netTotal: 5000 },
        payment: { paymentStatus: '2', channels: [{ enabled: true, method: 'เงินสด', amount: '5000' }] },
        sellers: [{ id: 's1', percent: '0', total: '0' }], // default 0%
        hasSale: true,
        createdBy: 'backend',
      },
    }));
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.hasSale).toBe(true);
    expect(d.sellers[0].percent).toBe('0'); // default 0% not 100%
    expect(d.payment.channels[0].method).toBe('เงินสด');
  });

  it('edit OPD — change CC + add photo + change payment', async () => {
    const id = tids[1]; // use the one with billing
    const orig = (await getDoc(txRef(id))).data().detail;
    const updated = clean({
      ...orig,
      symptoms: 'Botox (แก้ไข)',
      beforeImages: [{ dataUrl: 'data:img/new', id: '' }],
      payment: { ...orig.payment, paymentStatus: '4', channels: [
        { enabled: true, method: 'เงินสด', amount: '3000' },
        { enabled: true, method: 'โอนธนาคาร', amount: '2000' },
      ]},
      sellers: [{ id: 's1', percent: '60', total: '3000' }, { id: 's2', percent: '40', total: '2000' }],
    });
    await updateDoc(txRef(id), { detail: updated, updatedAt: new Date().toISOString() });
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.symptoms).toBe('Botox (แก้ไข)');
    expect(d.beforeImages).toHaveLength(1);
    expect(d.payment.paymentStatus).toBe('4');
    expect(d.payment.channels).toHaveLength(2);
    expect(d.sellers).toHaveLength(2);
    expect(d.sellers[0].percent).toBe('60');
    expect(d.purchasedItems).toHaveLength(1); // intact
  });

  it('edit OPD — add lab + chart + files', async () => {
    const id = tids[1];
    const orig = (await getDoc(txRef(id))).data().detail;
    const updated = clean({
      ...orig,
      labItems: [{ productName: 'CBC', qty: '1', pdfBase64: 'LPDF' }],
      charts: [{ dataUrl: 'data:chart', fabricJson: '{}', templateId: 'blank' }],
      treatmentFiles: [{ slot: 1, pdfBase64: 'FPDF', fileName: 'consent.pdf' }],
    });
    await updateDoc(txRef(id), { detail: updated });
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.labItems[0].pdfBase64).toBe('LPDF');
    expect(d.charts[0].fabricJson).toBe('{}');
    expect(d.treatmentFiles[0].fileName).toBe('consent.pdf');
    expect(d.symptoms).toBe('Botox (แก้ไข)'); // previous edit intact
    expect(d.payment.channels).toHaveLength(2); // previous edit intact
  });

  it('edit OPD — remove photos + change meds', async () => {
    const id = tids[1];
    const orig = (await getDoc(txRef(id))).data().detail;
    const updated = clean({
      ...orig,
      beforeImages: [], // removed
      medications: [{ name: 'Ibuprofen', dosage: '2x', qty: '20' }], // changed
    });
    await updateDoc(txRef(id), { detail: updated });
    const d = (await getDoc(txRef(id))).data().detail;
    expect(d.beforeImages).toHaveLength(0);
    expect(d.medications[0].name).toBe('Ibuprofen');
    expect(d.labItems).toHaveLength(1); // intact
  });

  it('delete OPD', async () => {
    for (const id of tids) await deleteDoc(txRef(id));
    for (const id of tids) expect((await getDoc(txRef(id))).exists()).toBe(false);
  });
});
