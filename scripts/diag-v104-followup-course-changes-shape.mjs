#!/usr/bin/env node
// V104-followup diag — read-only Rule R against be_course_changes
// Find garbage audit entries (missing fromCourse.name) + report shape distribution
// Sort by customer + by createdAt desc

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';

async function main() {
  const snap = await db.collection(`${BASE}/be_course_changes`).get();
  console.log(`Total be_course_changes docs: ${snap.size}\n`);

  let withFromCourse = 0;
  let withoutFromCourse = 0;
  let v101Backfill = 0;
  let unique_shapes = new Set();
  const garbageByCustomer = new Map();
  const allDocs = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    allDocs.push({ id: doc.id, ...d });
    const hasFromCourse = !!(d.fromCourse && typeof d.fromCourse === 'object' && d.fromCourse.name);
    if (hasFromCourse) withFromCourse++;
    else withoutFromCourse++;
    if (d._v101Backfill) v101Backfill++;
    const topKeys = Object.keys(d).filter(k => !k.startsWith('_') && k !== 'timestamp').sort().join('|');
    unique_shapes.add(topKeys);
    if (!hasFromCourse) {
      const cid = d.customerId || '(no-customer)';
      if (!garbageByCustomer.has(cid)) garbageByCustomer.set(cid, []);
      garbageByCustomer.get(cid).push({ id: doc.id, kind: d.kind, courseName: d.courseName || '', productName: d.productName || '', _v101Backfill: !!d._v101Backfill });
    }
  }

  console.log(`Shape distribution:`);
  console.log(`  WITH fromCourse.name (CANONICAL): ${withFromCourse}`);
  console.log(`  WITHOUT fromCourse.name (GARBAGE): ${withoutFromCourse}`);
  console.log(`  Carry _v101Backfill flag: ${v101Backfill}`);
  console.log(`\nUnique top-level key signatures: ${unique_shapes.size}`);
  for (const s of unique_shapes) {
    console.log(`  - ${s}`);
  }

  console.log(`\nGarbage entries by customer:`);
  for (const [cid, entries] of garbageByCustomer.entries()) {
    console.log(`  ${cid}: ${entries.length} entries`);
    for (const e of entries.slice(0, 3)) {
      console.log(`    ${e.id}: kind="${e.kind}" courseName="${e.courseName}" productName="${e.productName}" _v101Backfill=${e._v101Backfill}`);
    }
    if (entries.length > 3) console.log(`    ... +${entries.length - 3} more`);
  }

  // Sample of canonical entry for shape reference
  const sample = allDocs.find(d => d.fromCourse?.name);
  if (sample) {
    console.log(`\nCanonical sample (${sample.id}):`);
    console.log(JSON.stringify({
      changeId: sample.changeId,
      customerId: sample.customerId,
      kind: sample.kind,
      fromCourse: sample.fromCourse,
      qtyDelta: sample.qtyDelta,
      qtyBefore: sample.qtyBefore,
      qtyAfter: sample.qtyAfter,
      productName: sample.productName,
      linkedTreatmentId: sample.linkedTreatmentId,
      staffId: sample.staffId,
      staffName: sample.staffName,
    }, null, 2));
  }

  // Sample of garbage entry
  const garbageSample = allDocs.find(d => !d.fromCourse?.name && d._v101Backfill);
  if (garbageSample) {
    console.log(`\nGarbage V101-backfill sample (${garbageSample.id}):`);
    console.log(JSON.stringify(garbageSample, null, 2));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
