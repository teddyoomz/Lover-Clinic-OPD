#!/usr/bin/env node
// ═══ Rule R READ-ONLY diagnostic ═══
// User report (systematic-debugging, 2026-06-09): addRemaining ("เพิ่มคงเหลือ")
//   - course-USE history (be_course_changes, image 1) shows CORRECT names
//     (Shock Wave + Nebido) but the SALES list (be_sales, image 2) shows BOTH
//     as Nebido. Customer LC-26000114 (นาย เกรียงศักดิ์ โชควรกุล).
// Goal: prove whether the SALE records' stored items.courses[].name is wrong
//   at the DATA layer (creation) or whether display reads wrong. Dump:
//     1. customer.courses[] — index, name, product, qty, courseId, status
//     2. be_sales (source=addRemaining or saleNote~เพิ่มคงเหลือ) — items.courses, saleNote, source, createdAt
//     3. be_course_changes (kind=add) — fromCourse.name, qtyBefore/After, staffName/actor/staffId, createdAt
// NO WRITES. Admin SDK per Rule R.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const HN = process.argv[2] || 'LC-26000114';
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const ts = (v) => (v && v.toDate ? v.toDate().toISOString() : v) || '';

async function findCustomer(data, hn) {
  // try doc-id == hn first (V33 LC-* customers use HN as doc id)
  const direct = await data.collection('be_customers').doc(hn).get();
  if (direct.exists) return { id: direct.id, x: direct.data() };
  // fallback: search by HN field
  for (const field of ['customerHN', 'hn', 'HN']) {
    try { const q = await data.collection('be_customers').where(field, '==', hn).limit(1).get(); if (!q.empty) return { id: q.docs[0].id, x: q.docs[0].data() }; } catch {}
  }
  // fallback: patientData.hn
  try { const q = await data.collection('be_customers').where('patientData.hn', '==', hn).limit(1).get(); if (!q.empty) return { id: q.docs[0].id, x: q.docs[0].data() }; } catch {}
  return null;
}

async function main() {
  const db = initAdmin();
  const data = base(db);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  CUSTOMER ${HN} — addRemaining data-layer dump`);
  console.log('═══════════════════════════════════════════════════════════════');

  const cust = await findCustomer(data, HN);
  if (!cust) { console.log(`  ✗ customer ${HN} NOT FOUND`); return; }
  const cid = cust.id;
  const name = cust.x.customerName || cust.x.name || `${cust.x.firstname || ''} ${cust.x.lastname || ''}`.trim();
  console.log(`\n  customer doc id = ${cid}  name="${name}"  branchId=${cust.x.branchId || ''}`);

  // ── 1. customer.courses[] ──
  const courses = Array.isArray(cust.x.courses) ? cust.x.courses : [];
  console.log(`\n──── customer.courses[]  (${courses.length} entries, RAW order) ────`);
  courses.forEach((c, i) => {
    console.log(`  [${i}] name="${c?.name || ''}" product="${c?.product || ''}" qty="${c?.qty || ''}" status="${c?.status || ''}" courseId="${c?.courseId || ''}" linkedSaleId="${c?.linkedSaleId || ''}" isAddon=${c?.isAddon === true} needsPick=${c?.needsPickSelection === true} courseType="${c?.courseType || ''}"`);
  });
  // which are filtered OUT of "active" (terminal status OR remaining<=0, non-buffet/non-pick)
  console.log(`\n  (active filter mirror — which indices the UI would show)`);
  courses.forEach((c, i) => {
    const term = c?.status === 'คืนเงิน' || c?.status === 'ยกเลิก';
    const m = String(c?.qty || '').match(/(-?\d+)\s*\/\s*(-?\d+)/);
    const remaining = m ? Number(m[1]) : (c?.needsPickSelection ? 1 : 0);
    const buffet = String(c?.courseType || '').trim() === 'บุฟเฟต์';
    const pick = c?.needsPickSelection === true;
    const active = !term && (pick || buffet || remaining > 0);
    console.log(`     raw[${i}] active=${active ? 'YES' : 'no '} (term=${term} remaining=${remaining} buffet=${buffet} pick=${pick}) name="${c?.name || ''}"`);
  });

  // ── 2. be_sales (addRemaining) ──
  console.log(`\n──── be_sales for ${cid}  (addRemaining + recent) ────`);
  let salesSnap;
  try { salesSnap = await data.collection('be_sales').where('customerId', '==', cid).get(); }
  catch (e) { console.log(`  (query error: ${e.message})`); salesSnap = { docs: [] }; }
  const sales = salesSnap.docs.map(d => ({ id: d.id, x: d.data() })).filter(s => {
    const src = s.x.source || '';
    const note = s.x.saleNote || '';
    return src === 'addRemaining' || /เพิ่มคงเหลือ/.test(note) || /เพิ่มคงเหลือ/.test(JSON.stringify(s.x.items || {}));
  });
  console.log(`  ${salesSnap.docs.length} total sales, ${sales.length} addRemaining-related`);
  sales.sort((a, b) => String(a.x.invoiceNumber || a.id).localeCompare(String(b.x.invoiceNumber || b.id)));
  for (const s of sales) {
    const courses0 = (s.x.items && Array.isArray(s.x.items.courses)) ? s.x.items.courses : [];
    console.log(`\n  INV=${s.x.invoiceNumber || s.id}  source="${s.x.source || ''}"  createdAt=${ts(s.x.createdAt) || ts(s.x.saleDate) || s.x.saleDate || ''}`);
    console.log(`     saleNote = "${s.x.saleNote || ''}"`);
    console.log(`     items.courses = ${JSON.stringify(courses0.map(c => ({ name: c?.name, qty: c?.qty, itemType: c?.itemType, courseId: c?.courseId })))}`);
    console.log(`     sellers = ${JSON.stringify((s.x.sellers || []).map(x => ({ id: x.id, name: x.name })))}`);
  }

  // ── 3. be_course_changes (kind=add) ──
  console.log(`\n──── be_course_changes for ${cid}  (kind=add) ────`);
  let chSnap;
  try { chSnap = await data.collection('be_course_changes').where('customerId', '==', cid).get(); }
  catch (e) { console.log(`  (query error: ${e.message})`); chSnap = { docs: [] }; }
  const changes = chSnap.docs.map(d => ({ id: d.id, x: d.data() })).filter(c => c.x.kind === 'add');
  changes.sort((a, b) => String(ts(a.x.createdAt)).localeCompare(String(ts(b.x.createdAt))));
  console.log(`  ${chSnap.docs.length} total changes, ${changes.length} kind=add`);
  for (const c of changes) {
    console.log(`\n  changeId=${c.id}  createdAt=${ts(c.x.createdAt)}`);
    console.log(`     fromCourse.name = "${c.x.fromCourse?.name || ''}"  product="${c.x.fromCourse?.product || ''}"`);
    console.log(`     qty: "${c.x.qtyBefore || ''}" → "${c.x.qtyAfter || ''}"  delta=${c.x.qtyDelta}`);
    console.log(`     staffName="${c.x.staffName || ''}" staffId="${c.x.staffId || ''}" actor="${c.x.actor || ''}" reason="${c.x.reason || ''}"`);
  }

  console.log('\n═══ DIAGNOSTIC COMPLETE (read-only, no writes) ═══');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('DIAG ERROR:', e); process.exit(1); });
}
