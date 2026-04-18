// ─── Backend System Vitest — ครอบคลุมทุกการใช้งาน ─────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, runTransaction } from 'firebase/firestore';

// Match src/firebase.js config EXACTLY (including measurementId) so dynamic
// imports of src/lib/backendClient.js don't conflict with our default app.
const firebaseConfig = {
  apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20',
  authDomain: 'loverclinic-opd-4c39b.firebaseapp.com',
  projectId: 'loverclinic-opd-4c39b',
  storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app',
  messagingSenderId: '653911776503',
  appId: '1:653911776503:web:9e23f723d3ed877962c7f2',
  measurementId: 'G-TB3Q9BZ8R5',
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
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
// 4B. COURSE DEDUCTION SYSTEM (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════
describe('Course Deduction System', () => {
  const CID = `TEST-COURSE-DEDUCT-${TS}`;
  const ref = () => doc(db, ...P, 'be_customers', CID);
  const { deductQty, reverseQty, addRemaining, parseQtyString } = require('../src/lib/courseUtils.js');

  beforeAll(async () => {
    await setDoc(ref(), clean({
      proClinicId: CID, proClinicHN: 'HN-CD',
      patientData: { firstName: 'ตัดคอร์ส', lastName: 'ทดสอบ' },
      courses: [
        { name: 'Botox 100U', product: 'Nabota 200 U', qty: '200 / 200 U', status: 'กำลังใช้งาน' },
        { name: 'Acne Tx', product: 'Acne Treatment', qty: '12 / 12 ครั้ง', status: 'กำลังใช้งาน' },
        { name: 'Pico Laser', product: 'Pico', qty: '3 / 3 ครั้ง', status: 'กำลังใช้งาน' },
      ],
      treatmentSummary: [], treatmentCount: 0, cloneStatus: 'complete',
    }));
  });

  afterAll(async () => { try { await deleteDoc(ref()); } catch {} });

  it('deduct single course', async () => {
    const d = (await getDoc(ref())).data();
    const courses = d.courses.map((c, i) => {
      if (i === 0) return { ...c, qty: deductQty(c.qty, 1) };
      return c;
    });
    await updateDoc(ref(), { courses });
    const updated = (await getDoc(ref())).data();
    expect(parseQtyString(updated.courses[0].qty).remaining).toBe(199);
    expect(parseQtyString(updated.courses[1].qty).remaining).toBe(12); // unchanged
  });

  it('deduct multiple courses in one operation', async () => {
    const d = (await getDoc(ref())).data();
    const deductions = [{ courseIndex: 0, deductQty: 5 }, { courseIndex: 1, deductQty: 2 }];
    const courses = d.courses.map((c, i) => {
      const ded = deductions.find(d => d.courseIndex === i);
      if (ded) return { ...c, qty: deductQty(c.qty, ded.deductQty) };
      return c;
    });
    await updateDoc(ref(), { courses });
    const updated = (await getDoc(ref())).data();
    expect(parseQtyString(updated.courses[0].qty).remaining).toBe(194); // 199-5
    expect(parseQtyString(updated.courses[1].qty).remaining).toBe(10); // 12-2
  });

  it('reverse deduction', async () => {
    const d = (await getDoc(ref())).data();
    const courses = d.courses.map((c, i) => {
      if (i === 0) return { ...c, qty: reverseQty(c.qty, 6) }; // restore 6 (should cap at 200)
      return c;
    });
    await updateDoc(ref(), { courses });
    const updated = (await getDoc(ref())).data();
    expect(parseQtyString(updated.courses[0].qty).remaining).toBe(200); // capped at total
  });

  it('deduct to zero', async () => {
    const d = (await getDoc(ref())).data();
    const courses = d.courses.map((c, i) => {
      if (i === 2) return { ...c, qty: deductQty(c.qty, 3) }; // Pico: 3-3=0
      return c;
    });
    await updateDoc(ref(), { courses });
    const updated = (await getDoc(ref())).data();
    expect(parseQtyString(updated.courses[2].qty).remaining).toBe(0);
  });

  it('throws on over-deduction', () => {
    expect(() => deductQty('0 / 3 ครั้ง', 1)).toThrow('คอร์สคงเหลือไม่พอ');
  });

  it('add remaining increases both remaining and total', async () => {
    const d = (await getDoc(ref())).data();
    const courses = d.courses.map((c, i) => {
      if (i === 2) return { ...c, qty: addRemaining(c.qty, 5) }; // Pico: 0/3 + 5 = 5/8
      return c;
    });
    await updateDoc(ref(), { courses });
    const updated = (await getDoc(ref())).data();
    const pico = parseQtyString(updated.courses[2].qty);
    expect(pico.remaining).toBe(5);
    expect(pico.total).toBe(8);
  });

  it('full cycle: deduct → reverse → verify', async () => {
    // Reset Acne to 10/12
    const d1 = (await getDoc(ref())).data();
    const c1 = d1.courses.map((c, i) => i === 1 ? { ...c, qty: deductQty(c.qty, 3) } : c); // 10-3=7
    await updateDoc(ref(), { courses: c1 });
    expect(parseQtyString((await getDoc(ref())).data().courses[1].qty).remaining).toBe(7);

    // Reverse 3
    const d2 = (await getDoc(ref())).data();
    const c2 = d2.courses.map((c, i) => i === 1 ? { ...c, qty: reverseQty(c.qty, 3) } : c); // 7+3=10
    await updateDoc(ref(), { courses: c2 });
    expect(parseQtyString((await getDoc(ref())).data().courses[1].qty).remaining).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4C. MASTER COURSE CRUD (Phase 6.3)
// ═══════════════════════════════════════════════════════════════════════════
describe('Master Course CRUD', () => {
  const MCID = `MC-TEST-${TS}`;
  const ref = () => doc(db, ...P, 'master_data', 'courses', 'items', MCID);

  afterAll(async () => { try { await deleteDoc(ref()); } catch {} });

  it('create master course with products', async () => {
    await setDoc(ref(), clean({
      id: MCID, name: 'Botox Package', code: 'BTX-001',
      category: 'Botox', courseType: 'fixed bundle', price: 15000, validityDays: 365,
      products: [
        { id: 'p1', name: 'Nabota 200 U', qty: 200, unit: 'U' },
        { id: 'p2', name: 'Topical Anesthesia', qty: 1, unit: 'ครั้ง' },
      ],
      status: 'ใช้งาน', _createdBy: 'backend', _createdAt: new Date().toISOString(),
    }));
    const snap = await getDoc(ref());
    expect(snap.exists()).toBe(true);
    expect(snap.data().name).toBe('Botox Package');
    expect(snap.data().products).toHaveLength(2);
    expect(snap.data()._createdBy).toBe('backend');
  });

  it('update master course price + add product', async () => {
    const d = (await getDoc(ref())).data();
    await updateDoc(ref(), {
      price: 18000,
      products: [...d.products, { id: 'p3', name: 'Aftercare Cream', qty: 1, unit: 'หลอด' }],
    });
    const updated = (await getDoc(ref())).data();
    expect(updated.price).toBe(18000);
    expect(updated.products).toHaveLength(3);
  });

  it('delete master course', async () => {
    await deleteDoc(ref());
    expect((await getDoc(ref())).exists()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4D. COURSE ASSIGNMENT TO CUSTOMER (Phase 6.3)
// ═══════════════════════════════════════════════════════════════════════════
describe('Course Assignment to Customer', () => {
  const CID = `TEST-ASSIGN-${TS}`;
  const ref = () => doc(db, ...P, 'be_customers', CID);
  const { buildQtyString, parseQtyString } = require('../src/lib/courseUtils.js');

  beforeAll(async () => {
    await setDoc(ref(), clean({
      proClinicId: CID, proClinicHN: 'HN-ASSIGN',
      patientData: { firstName: 'ทดสอบ', lastName: 'คอร์ส' },
      courses: [], treatmentSummary: [], treatmentCount: 0, cloneStatus: 'complete',
    }));
  });
  afterAll(async () => { try { await deleteDoc(ref()); } catch {} });

  it('assign 2-product course → courses grows by 2', async () => {
    const masterCourse = {
      name: 'Botox Package',
      products: [
        { name: 'Nabota 200 U', qty: 200, unit: 'U' },
        { name: 'Topical Cream', qty: 1, unit: 'ครั้ง' },
      ],
      validityDays: 365,
      price: 15000,
    };
    const d = (await getDoc(ref())).data();
    const newCourses = [...d.courses];
    for (const p of masterCourse.products) {
      newCourses.push({
        name: masterCourse.name,
        product: p.name,
        qty: buildQtyString(p.qty, p.unit),
        status: 'กำลังใช้งาน',
      });
    }
    await updateDoc(ref(), { courses: newCourses });
    const updated = (await getDoc(ref())).data();
    expect(updated.courses).toHaveLength(2);
    expect(updated.courses[0].product).toBe('Nabota 200 U');
    expect(parseQtyString(updated.courses[0].qty)).toEqual({ remaining: 200, total: 200, unit: 'U' });
  });

  it('each entry has correct format', async () => {
    const d = (await getDoc(ref())).data();
    expect(d.courses[1].product).toBe('Topical Cream');
    expect(d.courses[1].qty).toBe('1 / 1 ครั้ง');
    expect(d.courses[0].status).toBe('กำลังใช้งาน');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4E. PRODUCT EXCHANGE (Phase 6.5)
// ═══════════════════════════════════════════════════════════════════════════
describe('Product Exchange', () => {
  const CID = `TEST-EXCHANGE-${TS}`;
  const ref = () => doc(db, ...P, 'be_customers', CID);
  const { buildQtyString, parseQtyString } = require('../src/lib/courseUtils.js');

  beforeAll(async () => {
    await setDoc(ref(), clean({
      proClinicId: CID, proClinicHN: 'HN-EX',
      patientData: { firstName: 'เปลี่ยน', lastName: 'สินค้า' },
      courses: [
        { name: 'Botox', product: 'Nabota 200 U', qty: '200 / 200 U', status: 'กำลังใช้งาน' },
        { name: 'Filler', product: 'Juvederm 1cc', qty: '3 / 3 cc', status: 'กำลังใช้งาน' },
      ],
      courseExchangeLog: [],
      treatmentSummary: [], treatmentCount: 0, cloneStatus: 'complete',
    }));
  });
  afterAll(async () => { try { await deleteDoc(ref()); } catch {} });

  it('exchange Nabota → Dysport', async () => {
    const d = (await getDoc(ref())).data();
    const courses = [...d.courses];
    const newProduct = { name: 'Dysport 300 U', qty: 300, unit: 'U' };
    const exchangeEntry = {
      timestamp: new Date().toISOString(),
      oldProduct: courses[0].product, oldQty: courses[0].qty,
      newProduct: newProduct.name, newQty: buildQtyString(newProduct.qty, newProduct.unit),
      reason: 'ลูกค้าต้องการเปลี่ยน',
    };
    courses[0] = { ...courses[0], product: newProduct.name, qty: buildQtyString(newProduct.qty, newProduct.unit) };
    await updateDoc(ref(), { courses, courseExchangeLog: [...d.courseExchangeLog, exchangeEntry] });

    const updated = (await getDoc(ref())).data();
    expect(updated.courses[0].product).toBe('Dysport 300 U');
    expect(parseQtyString(updated.courses[0].qty)).toEqual({ remaining: 300, total: 300, unit: 'U' });
    expect(updated.courses[1].product).toBe('Juvederm 1cc'); // unchanged
  });

  it('exchange log has entry', async () => {
    const d = (await getDoc(ref())).data();
    expect(d.courseExchangeLog).toHaveLength(1);
    expect(d.courseExchangeLog[0].oldProduct).toBe('Nabota 200 U');
    expect(d.courseExchangeLog[0].newProduct).toBe('Dysport 300 U');
    expect(d.courseExchangeLog[0].reason).toBe('ลูกค้าต้องการเปลี่ยน');
  });

  it('second exchange → log has 2 entries', async () => {
    const d = (await getDoc(ref())).data();
    const courses = [...d.courses];
    const newProduct = { name: 'Botulax 200 U', qty: 200, unit: 'U' };
    courses[0] = { ...courses[0], product: newProduct.name, qty: buildQtyString(newProduct.qty, newProduct.unit) };
    await updateDoc(ref(), {
      courses,
      courseExchangeLog: [...d.courseExchangeLog, {
        timestamp: new Date().toISOString(),
        oldProduct: 'Dysport 300 U', oldQty: '300 / 300 U',
        newProduct: newProduct.name, newQty: buildQtyString(newProduct.qty, newProduct.unit),
        reason: 'เปลี่ยนอีกครั้ง',
      }],
    });
    const updated = (await getDoc(ref())).data();
    expect(updated.courseExchangeLog).toHaveLength(2);
    expect(updated.courses[0].product).toBe('Botulax 200 U');
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

// ═══════════════════════════════════════════════════════════════════════════
// 12. SALE CRUD + BILLING
// ═══════════════════════════════════════════════════════════════════════════
describe('Sale CRUD + Billing', () => {
  const sids = [];
  const saleRef = (id) => doc(db, ...P, 'be_sales', id);
  const counterRef = () => doc(db, ...P, 'be_sales_counter', 'counter');

  afterAll(async () => {
    for (const id of sids) try { await deleteDoc(saleRef(id)); } catch {}
    try { await deleteDoc(counterRef()); } catch {}
  });

  it('generate invoice number format INV-YYYYMMDD-XXXX', async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    // Simulate generateInvoiceNumber
    await setDoc(counterRef(), { date: dateStr, seq: 0, updatedAt: new Date().toISOString() });
    const snap = await getDoc(counterRef());
    const data = snap.data();
    const seq = (data.date === dateStr ? (data.seq || 0) : 0) + 1;
    const invNo = `INV-${dateStr}-${String(seq).padStart(4,'0')}`;
    expect(invNo).toMatch(/^INV-\d{8}-\d{4}$/);
    expect(invNo).toContain(dateStr);
  });

  it('create sale with items + billing + payment + sellers', async () => {
    const id = `INV-TEST-${TS}`;
    sids.push(id);
    await setDoc(saleRef(id), clean({
      saleId: id, customerId: 'CUST1', customerName: 'นุ่น อิอิ', customerHN: 'HN000229',
      saleDate: '2026-04-08', saleNote: 'VIP customer',
      items: {
        promotions: [{ id: 33, name: 'Nov', qty: '1', unitPrice: '3900', itemType: 'promotion' }],
        courses: [{ id: 'c1', name: 'Filler 3900', qty: '1', unitPrice: '3900', itemType: 'course' }],
        products: [{ id: 'p1', name: 'ครีม', qty: '2', unitPrice: '500', itemType: 'product' }],
        medications: [{ name: 'Paracetamol', dosage: '3x หลังอาหาร', qty: '30', unitPrice: '2', unit: 'เม็ด' }],
      },
      billing: { subtotal: 8360, billDiscount: 360, discountType: 'amount', netTotal: 8000 },
      payment: {
        status: 'paid',
        channels: [{ enabled: true, method: 'เงินสด', amount: '5000' }, { enabled: true, method: 'โอนธนาคาร', amount: '3000' }],
        date: '2026-04-08', time: '14:30', refNo: 'TRF-001',
      },
      sellers: [{ id: 's1', name: 'Staff A', percent: '60', total: '4800' }, { id: 's2', name: 'Staff B', percent: '40', total: '3200' }],
      status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }));
    const s = await getDoc(saleRef(id));
    expect(s.exists()).toBe(true);
    const d = s.data();
    expect(d.saleId).toBe(id);
    expect(d.items.promotions).toHaveLength(1);
    expect(d.items.courses).toHaveLength(1);
    expect(d.items.products).toHaveLength(1);
    expect(d.items.medications).toHaveLength(1);
    expect(d.billing.netTotal).toBe(8000);
    expect(d.payment.status).toBe('paid');
    expect(d.payment.channels).toHaveLength(2);
    expect(d.sellers).toHaveLength(2);
  });

  it('read sale — verify all fields', async () => {
    const d = (await getDoc(saleRef(sids[0]))).data();
    expect(d.customerName).toBe('นุ่น อิอิ');
    expect(d.saleDate).toBe('2026-04-08');
    expect(d.saleNote).toBe('VIP customer');
    expect(d.items.promotions[0].name).toBe('Nov');
    expect(d.items.medications[0].dosage).toBe('3x หลังอาหาร');
    expect(d.payment.refNo).toBe('TRF-001');
    expect(d.sellers[0].percent).toBe('60');
  });

  it('billing calculation logic', () => {
    const items = [
      { unitPrice: '3900', qty: '1' },
      { unitPrice: '3900', qty: '1' },
      { unitPrice: '500', qty: '2' },
    ];
    const meds = [{ unitPrice: '2', qty: '30', name: 'Para' }];
    let subtotal = 0;
    items.forEach(p => { subtotal += (parseFloat(p.unitPrice) || 0) * (parseInt(p.qty) || 1); });
    meds.forEach(m => { if (m.name) subtotal += (parseFloat(m.unitPrice) || 0) * (parseInt(m.qty) || 1); });
    expect(subtotal).toBe(8860); // 3900+3900+1000+60

    // Discount amount
    const discAmt = 860;
    expect(Math.max(0, subtotal - discAmt)).toBe(8000);

    // Discount percent
    const discPct = 10;
    expect(Math.max(0, subtotal - subtotal * discPct / 100)).toBe(7974);
  });

  it('update sale — change payment status + add item', async () => {
    const id = sids[0];
    const orig = (await getDoc(saleRef(id))).data();
    await updateDoc(saleRef(id), clean({
      'payment.status': 'split',
      'items.products': [...orig.items.products, { id: 'p2', name: 'เซรั่ม', qty: '1', unitPrice: '1500', itemType: 'product' }],
      'billing.subtotal': 9860,
      'billing.netTotal': 9500,
      updatedAt: new Date().toISOString(),
    }));
    const d = (await getDoc(saleRef(id))).data();
    expect(d.payment.status).toBe('split');
    expect(d.items.products).toHaveLength(2);
    expect(d.billing.netTotal).toBe(9500);
    expect(d.items.promotions).toHaveLength(1); // intact
  });

  it('query sales by customer', async () => {
    const id2 = `INV-TEST2-${TS}`;
    sids.push(id2);
    await setDoc(saleRef(id2), clean({
      saleId: id2, customerId: 'CUST1', customerName: 'นุ่น อิอิ', saleDate: '2026-04-09',
      items: { promotions: [], courses: [], products: [{ name: 'Test', qty: '1', unitPrice: '100' }], medications: [] },
      billing: { subtotal: 100, netTotal: 100 }, payment: { status: 'paid' }, sellers: [], status: 'active',
      createdAt: new Date().toISOString(),
    }));
    const q1 = query(collection(db, ...P, 'be_sales'), where('customerId', '==', 'CUST1'));
    const snap = await getDocs(q1);
    const found = snap.docs.filter(d => sids.includes(d.id));
    expect(found.length).toBe(2);
  });

  it('list all sales sorted by date desc', async () => {
    const snap = await getDocs(collection(db, ...P, 'be_sales'));
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    all.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
    const testSales = all.filter(s => sids.includes(s.saleId || s.id));
    expect(testSales.length).toBe(2);
    expect(testSales[0].saleDate >= testSales[1].saleDate).toBe(true);
  });

  it('delete sale', async () => {
    for (const id of sids) await deleteDoc(saleRef(id));
    for (const id of sids) expect((await getDoc(saleRef(id))).exists()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. SALE MANAGEMENT — CANCEL + PAYMENT UPDATE + PURCHASE HISTORY
// ═══════════════════════════════════════════════════════════════════════════
describe('Sale Management (5C)', () => {
  const sids = [];
  const saleRef = (id) => doc(db, ...P, 'be_sales', id);

  afterAll(async () => {
    for (const id of sids) try { await deleteDoc(saleRef(id)); } catch {}
  });

  it('create test sale for management', async () => {
    const id = `INV-5C-${TS}`;
    sids.push(id);
    await setDoc(saleRef(id), clean({
      saleId: id, customerId: 'CUST-5C', customerName: 'Test 5C', customerHN: 'HN-5C',
      saleDate: '2026-04-10',
      items: { promotions: [], courses: [{ name: 'Course A', qty: '1', unitPrice: '5000' }], products: [], medications: [{ name: 'Para', dosage: '3x', qty: '10', unitPrice: '5' }] },
      billing: { subtotal: 5050, billDiscount: 50, discountType: 'amount', netTotal: 5000 },
      payment: { status: 'unpaid', channels: [] },
      sellers: [{ id: 's1', name: 'Staff A', percent: '100' }],
      status: 'active', createdAt: new Date().toISOString(),
    }));
    expect((await getDoc(saleRef(id))).exists()).toBe(true);
  });

  it('cancel sale with reason + refund tracking', async () => {
    const id = sids[0];
    await updateDoc(saleRef(id), clean({
      status: 'cancelled',
      cancelled: { at: new Date().toISOString(), reason: 'ลูกค้าเปลี่ยนใจ', refundMethod: 'เงินสด', refundAmount: 5000 },
      'payment.status': 'cancelled',
    }));
    const d = (await getDoc(saleRef(id))).data();
    expect(d.status).toBe('cancelled');
    expect(d.cancelled.reason).toBe('ลูกค้าเปลี่ยนใจ');
    expect(d.cancelled.refundMethod).toBe('เงินสด');
    expect(d.cancelled.refundAmount).toBe(5000);
    expect(d.payment.status).toBe('cancelled');
  });

  it('create another sale for payment tests', async () => {
    const id = `INV-5C2-${TS}`;
    sids.push(id);
    await setDoc(saleRef(id), clean({
      saleId: id, customerId: 'CUST-5C', customerName: 'Test 5C', customerHN: 'HN-5C',
      saleDate: '2026-04-11',
      items: { promotions: [], courses: [], products: [{ name: 'Product B', qty: '1', unitPrice: '10000' }], medications: [] },
      billing: { subtotal: 10000, netTotal: 10000 },
      payment: { status: 'unpaid', channels: [] },
      sellers: [{ id: 's1', name: 'Staff A', percent: '100' }],
      status: 'active', createdAt: new Date().toISOString(),
    }));
    expect((await getDoc(saleRef(id))).exists()).toBe(true);
  });

  it('add first payment → status becomes split', async () => {
    const id = sids[1];
    const snap = await getDoc(saleRef(id));
    const sale = snap.data();
    const newChannels = [...(sale.payment?.channels || []), { enabled: true, method: 'เงินสด', amount: '6000', date: '2026-04-11' }];
    const totalPaid = newChannels.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    const newStatus = totalPaid >= (sale.billing?.netTotal || 0) ? 'paid' : 'split';
    await updateDoc(saleRef(id), { 'payment.channels': newChannels, 'payment.status': newStatus });
    const d = (await getDoc(saleRef(id))).data();
    expect(d.payment.status).toBe('split');
    expect(d.payment.channels).toHaveLength(1);
    expect(d.payment.channels[0].amount).toBe('6000');
  });

  it('add second payment → total >= netTotal → status becomes paid', async () => {
    const id = sids[1];
    const snap = await getDoc(saleRef(id));
    const sale = snap.data();
    const newChannels = [...sale.payment.channels, { enabled: true, method: 'โอนธนาคาร', amount: '4000', date: '2026-04-12' }];
    const totalPaid = newChannels.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    const newStatus = totalPaid >= (sale.billing?.netTotal || 0) ? 'paid' : 'split';
    await updateDoc(saleRef(id), { 'payment.channels': newChannels, 'payment.status': newStatus });
    const d = (await getDoc(saleRef(id))).data();
    expect(d.payment.status).toBe('paid'); // 6000+4000=10000 >= 10000
    expect(d.payment.channels).toHaveLength(2);
  });

  it('query purchase history by customer', async () => {
    const q1 = query(collection(db, ...P, 'be_sales'), where('customerId', '==', 'CUST-5C'));
    const snap = await getDocs(q1);
    const found = snap.docs.filter(d => sids.includes(d.id));
    expect(found.length).toBe(2);
    // Check one is cancelled, one is paid
    const statuses = found.map(d => d.data().status || d.data().payment?.status);
    expect(statuses).toContain('cancelled');
  });

  it('sale with medications included in billing', async () => {
    const id = `INV-5C3-${TS}`;
    sids.push(id);
    await setDoc(saleRef(id), clean({
      saleId: id, customerId: 'CUST-5C', customerName: 'Test 5C',
      saleDate: '2026-04-12',
      items: {
        promotions: [], courses: [], products: [],
        medications: [
          { name: 'Paracetamol', dosage: '3x หลังอาหาร', qty: '30', unitPrice: '2', unit: 'เม็ด' },
          { name: 'Ibuprofen', dosage: '2x', qty: '20', unitPrice: '5', unit: 'เม็ด' },
        ],
      },
      billing: { subtotal: 160, netTotal: 160 }, // 2*30 + 5*20
      payment: { status: 'paid', channels: [{ enabled: true, method: 'เงินสด', amount: '160' }] },
      sellers: [{ id: 's1', name: 'Staff', percent: '0' }],
      status: 'active', createdAt: new Date().toISOString(),
    }));
    const d = (await getDoc(saleRef(id))).data();
    expect(d.items.medications).toHaveLength(2);
    expect(d.items.medications[0].dosage).toBe('3x หลังอาหาร');
    expect(d.billing.netTotal).toBe(160);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE NUMBER UNIQUENESS — no duplicates, no overwrites
// ═══════════════════════════════════════════════════════════════════════════
describe('Invoice Number Uniqueness', () => {
  const createdIds = [];

  afterAll(async () => {
    for (const id of createdIds) { try { await deleteDoc(doc(db, ...P, 'be_sales', id)); } catch {} }
  });

  it('3 sequential sales get unique invoice numbers', async () => {
    // Use Firestore transaction directly (same logic as backendClient.generateInvoiceNumber)
    const { runTransaction } = await import('firebase/firestore');
    const counterRef = doc(db, ...P, 'be_sales_counter', 'counter');
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

    for (let i = 0; i < 3; i++) {
      const seq = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        let nextSeq = 1;
        if (snap.exists() && snap.data().date === dateStr) nextSeq = (snap.data().seq || 0) + 1;
        tx.set(counterRef, { date: dateStr, seq: nextSeq });
        return nextSeq;
      });
      const saleId = `INV-${dateStr}-${String(seq).padStart(4, '0')}`;
      createdIds.push(saleId);
      await setDoc(doc(db, ...P, 'be_sales', saleId), clean({
        saleId, customerId: `UNIQ-TEST-${i}`, customerName: `Unique ${i}`,
        saleDate: today.toISOString().split('T')[0],
        items: { courses: [], promotions: [], products: [], medications: [] },
        billing: { subtotal: (i + 1) * 1000, netTotal: (i + 1) * 1000 },
        payment: { status: 'paid', channels: [] }, sellers: [],
        createdAt: new Date(Date.now() + i).toISOString(),
      }));
    }

    // All 3 must have different saleIds
    const uniqueIds = new Set(createdIds);
    expect(uniqueIds.size).toBe(3);
  });

  it('each sale has its own data (not overwritten)', async () => {
    for (let i = 0; i < createdIds.length; i++) {
      const snap = await getDoc(doc(db, ...P, 'be_sales', createdIds[i]));
      expect(snap.exists()).toBe(true);
      expect(snap.data().customerName).toBe(`Unique ${i}`);
      expect(snap.data().billing.netTotal).toBe((i + 1) * 1000);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SALE RETRIEVAL — getAllSales must return ALL docs, no limit
// ═══════════════════════════════════════════════════════════════════════════
describe('Sale Retrieval — no limit', () => {
  const prefix = `INV-BULK-${TS}`;
  const ids = [];
  const sources = ['normal', 'exchange', 'share', 'addRemaining', 'treatment', 'normal', 'exchange', 'share', 'normal', 'normal', 'normal'];

  beforeAll(async () => {
    // Create 11 sales with different sources
    for (let i = 0; i < sources.length; i++) {
      const id = `${prefix}-${String(i).padStart(3, '0')}`;
      ids.push(id);
      await setDoc(doc(db, ...P, 'be_sales', id), clean({
        saleId: id, customerId: `CUST-BULK-${i % 3}`, customerName: `Customer ${i}`,
        saleDate: '2026-04-09', saleNote: `Test sale ${i}`,
        items: { courses: [], promotions: [], products: [], medications: [] },
        billing: { subtotal: i * 1000, netTotal: i * 1000 },
        payment: { status: 'paid', channels: [] },
        sellers: [],
        source: sources[i],
        status: 'active', createdAt: new Date(Date.now() + i * 1000).toISOString(),
      }));
    }
  });

  afterAll(async () => {
    for (const id of ids) { try { await deleteDoc(doc(db, ...P, 'be_sales', id)); } catch {} }
  });

  it('getAllSales returns all 11 test sales (no limit)', async () => {
    const snap = await getDocs(collection(db, ...P, 'be_sales'));
    const allSales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const testSales = allSales.filter(s => s.saleId?.startsWith(prefix));
    expect(testSales.length).toBe(11);
  });

  it('includes all source types', async () => {
    const snap = await getDocs(collection(db, ...P, 'be_sales'));
    const allSales = snap.docs.map(d => d.data());
    const testSales = allSales.filter(s => s.saleId?.startsWith(prefix));
    const foundSources = [...new Set(testSales.map(s => s.source))];
    expect(foundSources).toContain('normal');
    expect(foundSources).toContain('exchange');
    expect(foundSources).toContain('share');
    expect(foundSources).toContain('addRemaining');
    expect(foundSources).toContain('treatment');
  });

  it('sorted by createdAt desc — latest first', async () => {
    const snap = await getDocs(collection(db, ...P, 'be_sales'));
    const allSales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const testSales = allSales.filter(s => s.saleId?.startsWith(prefix));
    testSales.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    // Last created should be first
    expect(testSales[0].saleId).toBe(`${prefix}-010`);
  });

  it('query by customer returns correct subset', async () => {
    const q = query(collection(db, ...P, 'be_sales'), where('customerId', '==', 'CUST-BULK-0'));
    const snap = await getDocs(q);
    const found = snap.docs.filter(d => d.data().saleId?.startsWith(prefix));
    // customers 0, 3, 6, 9 → 4 sales for CUST-BULK-0
    expect(found.length).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DEPOSIT CRUD — Phase 7 be_deposits
// ═══════════════════════════════════════════════════════════════════════════
describe('Deposit CRUD', () => {
  const CUST_ID = `DEP-CUST-${TS}`;
  const depRef = (id) => doc(db, ...P, 'be_deposits', id);
  const custRef = () => doc(db, ...P, 'be_customers', CUST_ID);
  let createdId = null;

  beforeAll(async () => {
    await setDoc(custRef(), clean({
      proClinicId: CUST_ID, proClinicHN: 'HN-DEP', patientData: { firstName: 'Dep', lastName: 'Test' },
      finance: { depositBalance: 0 }, courses: [], treatmentSummary: [],
    }));
  });

  afterAll(async () => {
    try { await deleteDoc(custRef()); } catch {}
    // Clean up any deposit docs that reference this customer
    const q = query(collection(db, ...P, 'be_deposits'), where('customerId', '==', CUST_ID));
    const snap = await getDocs(q);
    for (const d of snap.docs) { try { await deleteDoc(d.ref); } catch {} }
  });

  it('createDeposit — sets remainingAmount = amount, status = active', async () => {
    const { createDeposit } = await import('../src/lib/backendClient.js');
    const res = await createDeposit({
      customerId: CUST_ID, customerName: 'Dep Test', customerHN: 'HN-DEP',
      amount: 5000, paymentChannel: 'เงินสด', paymentDate: '2026-04-18',
      sellers: [{ id: 's1', name: 'Staff', percent: '100', total: '5000' }],
      note: 'test',
    });
    createdId = res.depositId;
    expect(res.success).toBe(true);
    const d = (await getDoc(depRef(createdId))).data();
    expect(d.amount).toBe(5000);
    expect(d.usedAmount).toBe(0);
    expect(d.remainingAmount).toBe(5000);
    expect(d.status).toBe('active');
    expect(d.usageHistory).toEqual([]);
    expect(d.sellers).toHaveLength(1);
  });

  it('createDeposit — updates customer finance.depositBalance', async () => {
    const c = (await getDoc(custRef())).data();
    expect(c.finance?.depositBalance).toBe(5000);
  });

  it('updateDeposit — change amount recalculates remainingAmount', async () => {
    const { updateDeposit } = await import('../src/lib/backendClient.js');
    await updateDeposit(createdId, { amount: 7000, note: 'bumped' });
    const d = (await getDoc(depRef(createdId))).data();
    expect(d.amount).toBe(7000);
    expect(d.usedAmount).toBe(0);
    expect(d.remainingAmount).toBe(7000);
    expect(d.note).toBe('bumped');
  });

  it('updateDeposit — ignores direct usedAmount override', async () => {
    const { updateDeposit } = await import('../src/lib/backendClient.js');
    await updateDeposit(createdId, { usedAmount: 999 });
    const d = (await getDoc(depRef(createdId))).data();
    expect(d.usedAmount).toBe(0); // unchanged
  });

  it('getAllDeposits — returns our deposit', async () => {
    const { getAllDeposits } = await import('../src/lib/backendClient.js');
    const list = await getAllDeposits();
    const found = list.find(d => d.depositId === createdId);
    expect(found).toBeTruthy();
  });

  it('getCustomerDeposits — filters by customer', async () => {
    const { getCustomerDeposits } = await import('../src/lib/backendClient.js');
    const list = await getCustomerDeposits(CUST_ID);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].customerId).toBe(CUST_ID);
  });

  it('getActiveDeposits — includes active status', async () => {
    const { getActiveDeposits } = await import('../src/lib/backendClient.js');
    const list = await getActiveDeposits(CUST_ID);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.every(d => d.status === 'active' || d.status === 'partial')).toBe(true);
  });

  it('cancelDeposit — sets status=cancelled, clears remaining, updates customer', async () => {
    const { cancelDeposit } = await import('../src/lib/backendClient.js');
    // Create a fresh one to cancel (so apply tests can reuse createdId)
    const { createDeposit } = await import('../src/lib/backendClient.js');
    const fresh = await createDeposit({
      customerId: CUST_ID, customerName: 'Dep Test', customerHN: 'HN-DEP',
      amount: 2000, paymentChannel: 'เงินสด',
    });
    await cancelDeposit(fresh.depositId, { cancelNote: 'no reason' });
    const d = (await getDoc(depRef(fresh.depositId))).data();
    expect(d.status).toBe('cancelled');
    expect(d.cancelNote).toBe('no reason');
    expect(d.remainingAmount).toBe(0);
    expect(d.cancelledAt).toBeTruthy();
    try { await deleteDoc(depRef(fresh.depositId)); } catch {}
  });

  it('refundDeposit — partial refund reduces remaining', async () => {
    const { refundDeposit, createDeposit } = await import('../src/lib/backendClient.js');
    const fresh = await createDeposit({
      customerId: CUST_ID, customerName: 'Dep Test', customerHN: 'HN-DEP', amount: 3000,
    });
    await refundDeposit(fresh.depositId, { refundAmount: 1000, refundChannel: 'โอน' });
    const d = (await getDoc(depRef(fresh.depositId))).data();
    expect(d.refundAmount).toBe(1000);
    expect(d.remainingAmount).toBe(2000);
    expect(d.status).not.toBe('refunded'); // partial only
    try { await deleteDoc(depRef(fresh.depositId)); } catch {}
  });

  it('refundDeposit — full refund sets status=refunded', async () => {
    const { refundDeposit, createDeposit } = await import('../src/lib/backendClient.js');
    const fresh = await createDeposit({
      customerId: CUST_ID, customerName: 'Dep Test', customerHN: 'HN-DEP', amount: 1500,
    });
    await refundDeposit(fresh.depositId, { refundAmount: 1500, refundChannel: 'เงินสด' });
    const d = (await getDoc(depRef(fresh.depositId))).data();
    expect(d.refundAmount).toBe(1500);
    expect(d.remainingAmount).toBe(0);
    expect(d.status).toBe('refunded');
    try { await deleteDoc(depRef(fresh.depositId)); } catch {}
  });

  it('refundDeposit — throws when amount > remaining', async () => {
    const { refundDeposit } = await import('../src/lib/backendClient.js');
    await expect(refundDeposit(createdId, { refundAmount: 999999 })).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DEPOSIT APPLY + REVERSE — transactional usage tracking
// ═══════════════════════════════════════════════════════════════════════════
describe('Deposit Apply + Reverse', () => {
  const CUST_ID = `DEP-APPLY-${TS}`;
  const depRef = (id) => doc(db, ...P, 'be_deposits', id);
  const custRef = () => doc(db, ...P, 'be_customers', CUST_ID);
  let DEP_ID = null;

  beforeAll(async () => {
    await setDoc(custRef(), clean({
      proClinicId: CUST_ID, patientData: { firstName: 'Apply' },
      finance: { depositBalance: 0 },
    }));
    const { createDeposit } = await import('../src/lib/backendClient.js');
    const res = await createDeposit({
      customerId: CUST_ID, customerName: 'Apply Test', customerHN: 'HN-AP',
      amount: 10000, paymentChannel: 'โอน',
    });
    DEP_ID = res.depositId;
  });

  afterAll(async () => {
    try { if (DEP_ID) await deleteDoc(depRef(DEP_ID)); } catch {}
    try { await deleteDoc(custRef()); } catch {}
  });

  it('apply deposit to sale — partial usage → status=partial', async () => {
    const { applyDepositToSale } = await import('../src/lib/backendClient.js');
    const res = await applyDepositToSale(DEP_ID, 'INV-TEST-1', 3000);
    expect(res.success).toBe(true);
    const d = (await getDoc(depRef(DEP_ID))).data();
    expect(d.usedAmount).toBe(3000);
    expect(d.remainingAmount).toBe(7000);
    expect(d.status).toBe('partial');
    expect(d.usageHistory).toHaveLength(1);
    expect(d.usageHistory[0].saleId).toBe('INV-TEST-1');
    expect(d.usageHistory[0].amount).toBe(3000);
  });

  it('apply another sale — cumulative usage', async () => {
    const { applyDepositToSale } = await import('../src/lib/backendClient.js');
    await applyDepositToSale(DEP_ID, 'INV-TEST-2', 2000);
    const d = (await getDoc(depRef(DEP_ID))).data();
    expect(d.usedAmount).toBe(5000);
    expect(d.remainingAmount).toBe(5000);
    expect(d.usageHistory).toHaveLength(2);
  });

  it('apply exceeding remaining — throws', async () => {
    const { applyDepositToSale } = await import('../src/lib/backendClient.js');
    await expect(applyDepositToSale(DEP_ID, 'INV-TEST-X', 999999)).rejects.toThrow();
  });

  it('apply fully — status becomes used', async () => {
    const { applyDepositToSale } = await import('../src/lib/backendClient.js');
    await applyDepositToSale(DEP_ID, 'INV-TEST-FULL', 5000);
    const d = (await getDoc(depRef(DEP_ID))).data();
    expect(d.remainingAmount).toBe(0);
    expect(d.status).toBe('used');
  });

  it('reverseDepositUsage — restores used amount + removes entry', async () => {
    const { reverseDepositUsage } = await import('../src/lib/backendClient.js');
    const res = await reverseDepositUsage(DEP_ID, 'INV-TEST-1');
    expect(res.restored).toBe(3000);
    const d = (await getDoc(depRef(DEP_ID))).data();
    expect(d.usedAmount).toBe(7000);
    expect(d.remainingAmount).toBe(3000);
    expect(d.status).toBe('partial');
    expect(d.usageHistory.find(u => u.saleId === 'INV-TEST-1')).toBeUndefined();
  });

  it('reverseDepositUsage — non-existent sale → no change', async () => {
    const { reverseDepositUsage } = await import('../src/lib/backendClient.js');
    const before = (await getDoc(depRef(DEP_ID))).data();
    const res = await reverseDepositUsage(DEP_ID, 'INV-NONEXISTENT');
    expect(res.restored).toBe(0);
    const after = (await getDoc(depRef(DEP_ID))).data();
    expect(after.usedAmount).toBe(before.usedAmount);
  });

  it('cannot cancel deposit with usage', async () => {
    const { cancelDeposit } = await import('../src/lib/backendClient.js');
    await expect(cancelDeposit(DEP_ID, { cancelNote: 'nope' })).rejects.toThrow();
  });

  it('customer finance.depositBalance reflects current state', async () => {
    const c = (await getDoc(custRef())).data();
    // After all apply/reverse: used = 7000, remaining = 3000 (status = partial → counted)
    expect(c.finance?.depositBalance).toBe(3000);
  });
});
