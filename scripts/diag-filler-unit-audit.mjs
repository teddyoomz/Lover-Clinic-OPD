#!/usr/bin/env node
// ─── diag-filler-unit-audit — READ-ONLY (Rule R) ──────────────────────────
//
// User asked 2026-05-19: "มี filler อะไรที่หน่วยเป็น CC ถูกแล้วบ้าง"
// Earlier same session: "ลบคอร์สคงเหลือ neuramis ที่หน่วยเป็นครั้งด้วย ...
// ของจริงมันหน่วยเป็น CC และฝากดูฟิลเลอร์อื่นๆด้วย มีเป็นครั้งอีกไหม ถ้ามี
// ให้ทำมาเป็น CC แล้วมีแค่ฟิลเลอร์ที่หน่วยเป็น CC ในคอร์สนั้น ถ้าเจอ
// ฟิลเลอร์ยี่ห้ออื่นมีเป็นครั้งอีกใน database คอร์สของเรา ให้แก้หน่วยเป็น
// Cc ด้วย".
//
// READS:
//   - be_products: all products + classify by filler brand regex + group by unit
//   - be_courses: courseProducts[] entries matching filler regex (group by unit)
//
// NO WRITES. Cleanup not needed.
//
// USAGE:
//   node scripts/diag-filler-unit-audit.mjs

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();

// Filler brand regex — common HA fillers in Thai market
// Source: typical aesthetic clinic inventory
const FILLER_RE = /\b(neuramis|restylane|juvederm|juvéderm|belotero|stylage|teosyal|princess|yvoire|croma|aliaxin|saypha|vivacy|prollenium|profhilo|sculptra|radiesse|ellanse)\b/i;

// Also match Thai-spelled variants
const FILLER_RE_TH = /(นิวรามิส|เนอรามิส|เรสตี้เลน|จูเวเดิม|เบโลเทโร|สไตล์เลจ|ฟิลเลอร์)/i;

function isFiller(name = '', category = '', categoryName = '') {
  const haystack = `${name} ${category} ${categoryName}`;
  return FILLER_RE.test(haystack) || FILLER_RE_TH.test(haystack);
}

function normalizeUnit(u) {
  if (!u) return '(empty)';
  const s = String(u).trim();
  if (!s) return '(empty)';
  return s;
}

async function main() {
  console.log('═══ diag-filler-unit-audit (READ-ONLY) ═══\n');

  // 1. Scan be_products
  console.log('Scanning be_products ...');
  const productsSnap = await db.collection(`${BASE}/be_products`).get();
  const fillerProducts = [];
  productsSnap.forEach(doc => {
    const d = doc.data();
    if (isFiller(d.name || d.productName, d.categoryId, d.categoryName)) {
      fillerProducts.push({
        id: doc.id,
        name: d.name || d.productName || '(unnamed)',
        unit: normalizeUnit(d.unit || d.mainUnitName),
        category: d.categoryName || d.categoryId || '',
        branchId: d.branchId || '(none)',
        skipStockDeduction: !!d.skipStockDeduction,
        trackStock: d.stockConfig?.trackStock ?? null,
      });
    }
  });

  // Group by unit
  const byUnit = {};
  for (const p of fillerProducts) {
    if (!byUnit[p.unit]) byUnit[p.unit] = [];
    byUnit[p.unit].push(p);
  }

  console.log(`\n═══ be_products — fillers found: ${fillerProducts.length} ═══\n`);
  for (const [unit, items] of Object.entries(byUnit).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n── unit="${unit}" — ${items.length} products ──`);
    items.slice(0, 50).forEach(p => {
      const tag = p.skipStockDeduction ? ' [skipStock]' : '';
      console.log(`  • ${p.name}  (id=${p.id}, branch=${p.branchId})${tag}`);
    });
    if (items.length > 50) console.log(`  ... and ${items.length - 50} more`);
  }

  // 2. Scan be_courses — flatten courseProducts[] entries matching filler regex
  console.log('\n\nScanning be_courses ...');
  const coursesSnap = await db.collection(`${BASE}/be_courses`).get();
  const fillerInCourses = [];
  coursesSnap.forEach(doc => {
    const d = doc.data();
    const courseName = d.courseName || d.name || '(unnamed)';
    const products = Array.isArray(d.courseProducts) ? d.courseProducts : (Array.isArray(d.products) ? d.products : []);
    products.forEach((p, idx) => {
      const pName = p.productName || p.name || '';
      if (isFiller(pName)) {
        fillerInCourses.push({
          courseId: doc.id,
          courseName,
          courseBranchId: d.branchId || '(none)',
          productIdx: idx,
          productName: pName,
          productId: p.productId || p.id || '',
          unit: normalizeUnit(p.unit),
        });
      }
    });
  });

  // Group by unit
  const courseByUnit = {};
  for (const c of fillerInCourses) {
    if (!courseByUnit[c.unit]) courseByUnit[c.unit] = [];
    courseByUnit[c.unit].push(c);
  }

  console.log(`\n═══ be_courses — courseProducts[] filler entries found: ${fillerInCourses.length} ═══\n`);
  for (const [unit, items] of Object.entries(courseByUnit).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n── unit="${unit}" — ${items.length} course-product entries ──`);
    items.slice(0, 50).forEach(c => {
      console.log(`  • ${c.productName}  in "${c.courseName}"  (course=${c.courseId}, idx=${c.productIdx}, branch=${c.courseBranchId})`);
    });
    if (items.length > 50) console.log(`  ... and ${items.length - 50} more`);
  }

  // 3. Summary
  console.log('\n\n═══ SUMMARY ═══');
  console.log(`be_products fillers total: ${fillerProducts.length}`);
  Object.entries(byUnit).forEach(([u, arr]) => console.log(`  unit="${u}":  ${arr.length} products`));
  console.log(`\nbe_courses filler entries total: ${fillerInCourses.length}`);
  Object.entries(courseByUnit).forEach(([u, arr]) => console.log(`  unit="${u}":  ${arr.length} entries`));

  console.log('\n(Read-only. No writes performed.)');
  process.exit(0);
}

main().catch(e => { console.error('💥 UNCAUGHT:', e.message, e.stack); process.exit(1); });
