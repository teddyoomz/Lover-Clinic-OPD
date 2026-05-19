#!/usr/bin/env node
/**
 * V104 diag — read-only Rule R against real prod Firestore.
 *
 * Goal: investigate "ซื้อคอร์สใน TFP แล้วใช้ทันที แต่ไม่ตัด" bug reported
 * 2026-05-19 LATE+3 EOD+1 after V101+V102+V103 ship.
 *
 * Symptoms (user-reported):
 * - Treatment saved successfully at ~20:13 BKK 2026-05-19
 * - รายการรักษา shows Shock wave 12 ครั้ง + ติดตามอาการกับแพทย์ 2 ครั้ง
 *   (treatment doc + courseItems[] payload persisted ✓)
 * - customer.courses["Shock Wave 12 ครั้ง + ติดตามอาการกับแพทย์ 1 ครั้ง"]
 *   still 12/12 + 2/2 (NEVER decremented) ✗
 *
 * Per Rule R: read-only diag. Per Rule M: no mutations. NO --apply path.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENV_PATH = resolve(__dirname, '..', '.env.local.prod');
const APP_ID = 'loverclinic-opd-4c39b';
const COL = (name) => `artifacts/${APP_ID}/public/data/${name}`;

function loadEnv(envPath) {
  return readFileSync(envPath, 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

function getDb() {
  const env = loadEnv(ENV_PATH);
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
    }),
    ignoreUndefinedProperties: true,
  });
  return getFirestore();
}

function isPurchasedSessionRowId(rowId) {
  if (typeof rowId !== 'string' || !rowId) return false;
  return rowId.startsWith('purchased-') || rowId.startsWith('promo-') || rowId.startsWith('picked-');
}

async function main() {
  const db = getDb();
  const targetDate = '2026-05-19';

  console.log(`\n=== V104 DIAG ===`);
  console.log(`Looking for treatments on ${targetDate} with PURCHASED-this-visit courseItems...`);

  // Pull treatments by treatmentDate
  const treatmentsCol = await db.collection(COL('be_treatments'))
    .where('detail.treatmentDate', '==', targetDate)
    .get();

  console.log(`Found ${treatmentsCol.size} treatments for ${targetDate}`);

  const candidates = [];
  for (const doc of treatmentsCol.docs) {
    const t = doc.data();
    const courseItems = t?.detail?.courseItems || [];
    const purchasedItems = (courseItems || []).filter(ci => isPurchasedSessionRowId(ci.rowId));
    if (purchasedItems.length > 0) {
      candidates.push({
        treatmentId: doc.id,
        customerId: t.customerId,
        customerName: t.customerName || t?.detail?.customerName || '',
        treatmentDate: t?.detail?.treatmentDate || '',
        createdAt: t.createdAt?.toDate?.() || null,
        purchasedItems,
        courseItems,
        branchId: t?.detail?.branchId || t.branchId || '',
        status: t?.status || '',
        hasSale: t?.detail?.hasSale || false,
        linkedSaleId: t?.linkedSaleId || t?.detail?.linkedSaleId || '',
      });
    }
  }

  console.log(`\n${candidates.length} treatments HAVE purchased-session courseItems on ${targetDate}\n`);

  // Sort newest first
  candidates.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

  // Investigate the 5 latest
  for (let i = 0; i < Math.min(candidates.length, 5); i++) {
    const c = candidates[i];
    console.log(`\n--- Candidate ${i + 1}/${Math.min(candidates.length, 5)} ---`);
    console.log(`treatmentId: ${c.treatmentId}`);
    console.log(`customerId: ${c.customerId}`);
    console.log(`customerName: ${c.customerName}`);
    console.log(`branchId: ${c.branchId}`);
    console.log(`createdAt: ${c.createdAt?.toISOString()}`);
    console.log(`hasSale: ${c.hasSale}`);
    console.log(`linkedSaleId: ${c.linkedSaleId}`);
    console.log(`status: ${c.status}`);

    console.log(`\n  PURCHASED courseItems[] in treatment.detail.courseItems:`);
    for (const ci of c.purchasedItems) {
      console.log(`    rowId="${ci.rowId}"`);
      console.log(`      courseName="${ci.courseName}"`);
      console.log(`      productName="${ci.productName}"`);
      console.log(`      courseIndex=${ci.courseIndex}`);
      console.log(`      deductQty=${ci.deductQty}`);
      console.log(`      unit="${ci.unit || ''}"`);
      console.log(`      _v101AutoLinked=${ci._v101AutoLinked || false}`);
    }

    // Fetch customer doc
    const custSnap = await db.collection(COL('be_customers')).doc(c.customerId).get();
    if (!custSnap.exists) {
      console.log(`  ⚠ customer doc not found`);
      continue;
    }
    const cust = custSnap.data();
    const courses = cust.courses || [];

    // Find courses linked to this treatment (via linkedTreatmentId OR matching name)
    const linkedCourses = courses
      .map((cc, idx) => ({ ...cc, _idx: idx }))
      .filter(cc => cc.linkedTreatmentId === c.treatmentId);

    console.log(`\n  customer.courses[] entries linked to this treatment (linkedTreatmentId=${c.treatmentId}):`);
    if (linkedCourses.length === 0) {
      console.log(`    ⚠ NONE — auto-sale assignCourseToCustomer did NOT run OR linkedTreatmentId not stamped`);
    }
    for (const lc of linkedCourses) {
      console.log(`    [idx=${lc._idx}] name="${lc.name}" product="${lc.product}" qty="${lc.qty}" status="${lc.status}" productId=${lc.productId}`);
    }

    // Also find courses by NAME match (in case linkedTreatmentId missing)
    if (c.purchasedItems.length > 0) {
      const courseName = c.purchasedItems[0].courseName;
      const nameMatches = courses
        .map((cc, idx) => ({ ...cc, _idx: idx }))
        .filter(cc => cc.name === courseName);
      console.log(`\n  customer.courses[] entries matching courseName="${courseName}" (regardless of linkedTreatmentId):`);
      for (const nm of nameMatches) {
        console.log(`    [idx=${nm._idx}] name="${nm.name}" product="${nm.product}" qty="${nm.qty}" status="${nm.status}" linkedTreatmentId=${nm.linkedTreatmentId || '(none)'} linkedSaleId=${nm.linkedSaleId || '(none)'}`);
      }
    }

    // Check be_course_changes audit for this treatmentId
    const changes = await db.collection(COL('be_course_changes'))
      .where('linkedTreatmentId', '==', c.treatmentId)
      .get();
    console.log(`\n  be_course_changes for linkedTreatmentId=${c.treatmentId}: ${changes.size} entries`);
    for (const chDoc of changes.docs) {
      const ch = chDoc.data();
      console.log(`    kind="${ch.kind}" productName="${ch.productName}" qtyDelta=${ch.qtyDelta} qtyBefore="${ch.qtyBefore}" qtyAfter="${ch.qtyAfter}"`);
    }

    // Check the linked sale (if any)
    if (c.linkedSaleId) {
      const saleSnap = await db.collection(COL('be_sales')).doc(c.linkedSaleId).get();
      if (saleSnap.exists) {
        const s = saleSnap.data();
        console.log(`\n  Linked sale ${c.linkedSaleId}:`);
        console.log(`    branchId=${s.branchId || s?.detail?.branchId || '(MISSING)'}`);
        console.log(`    items.courses.length=${(s?.detail?.items?.courses || []).length}`);
        for (const sc of (s?.detail?.items?.courses || [])) {
          console.log(`      course: name="${sc.name}" qty=${sc.qty} unitPrice=${sc.unitPrice}`);
        }
      }
    }

    // V104 conclusion
    console.log(`\n  --- DIAGNOSIS ---`);
    const anyDecremented = linkedCourses.some(lc => {
      const q = String(lc.qty || '');
      const m = q.match(/^(\d+)\s*\/\s*(\d+)/);
      if (!m) return false;
      const rem = Number(m[1]);
      const tot = Number(m[2]);
      return rem < tot; // remaining < total = decremented
    });
    if (linkedCourses.length === 0) {
      console.log(`  ❌ NO assignCourseToCustomer entry — autoSale block did not run`);
    } else if (!anyDecremented) {
      console.log(`  ❌ Courses ASSIGNED but NOT DECREMENTED — deductCourseItems either threw (silent-swallow TFP:3134) OR returned no-op due to matchesDed mismatch`);
      console.log(`  ❌ be_course_changes (kind='use') count: ${changes.docs.filter(d => d.data().kind === 'use').length}`);
    } else {
      console.log(`  ✓ Decremented OK — bug NOT reproduced for this candidate`);
    }
  }

  console.log(`\n=== END V104 DIAG ===\n`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('DIAG FAILED:', e);
    process.exit(1);
  });
}
