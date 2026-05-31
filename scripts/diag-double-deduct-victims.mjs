#!/usr/bin/env node
// Rule R diag (READ-ONLY) — quantify V142-quinquies DOUBLE-DEDUCT victims on prod.
//
// Signature: within ONE treatment (linkedTreatmentId) + ONE course (name+product),
// the double-deduct produces 2+ kind='use' entries whose qtyBefore DECREASES
// consecutively (e.g. 5/5→4/5 then 4/5→3/5) because the 2nd finalize SKIPPED the
// reverse. A CORRECT V142 edit-resave also produces 2+ 'use' entries but the 2nd's
// qtyBefore RESETS to the 1st's qtyBefore (e.g. 5/5→4/5 then 5/5→4/5) because the
// reverse ran. So: monotonic-decreasing qtyBefore across same-treatment+course
// 'use' entries = double-deduct; repeated qtyBefore = correct.
//
// READ-ONLY. Healing (restoring the over-deducted balance) is NOT auto-safe (needs
// the intended use-count) → this QUANTIFIES only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a; }, {});
if (getApps().length === 0) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b', clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n') }), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const remOf = (s) => { const m = String(s || '').match(/^([\d.,]+)\s*\//); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };
const ms = (t) => (t?.toMillis ? t.toMillis() : (typeof t === 'number' ? t : 0));
async function main() {
  console.log('\n===== V142-quinquies double-deduct victim diag (READ-ONLY) =====\n');
  const cc = await db.collection(`${BASE}/be_course_changes`).where('kind', '==', 'use').get();
  console.log(`scanned kind=use entries: ${cc.docs.length}`);
  // group by (linkedTreatmentId, courseName||productName)
  const groups = new Map();
  for (const d of cc.docs) {
    const v = d.data();
    const tid = v.linkedTreatmentId; if (!tid) continue;
    const key = `${tid}||${String(v.courseName || v.fromCourse?.name || '').trim()}||${String(v.productName || '').trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ before: remOf(v.qtyBefore), after: remOf(v.qtyAfter), at: ms(v.createdAt), cust: v.customerId, tid });
  }
  let victims = 0; const rows = [];
  for (const [key, arr] of groups) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.at - b.at);
    // double-deduct iff consecutive qtyBefore strictly decreases (no reset to a prior before)
    let monotonicDrop = true; let anyDrop = false;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].before == null || arr[i - 1].before == null) { monotonicDrop = false; break; }
      if (arr[i].before < arr[i - 1].before) anyDrop = true;
      else if (arr[i].before >= arr[i - 1].before) { monotonicDrop = false; } // reset → correct V142
    }
    if (monotonicDrop && anyDrop) {
      victims++;
      rows.push({ cust: arr[0].cust, tid: arr[0].tid, key: key.split('||').slice(1).join(' '), uses: arr.length, befores: arr.map(a => a.before).join('→') });
    }
  }
  console.log(`groups (treatment×course with ≥2 'use'): ${[...groups.values()].filter(a => a.length >= 2).length}`);
  console.log(`DOUBLE-DEDUCT candidates (monotonic-decreasing qtyBefore = reverse skipped): ${victims}\n`);
  for (const r of rows) console.log(`  cust=${r.cust} tid=${r.tid} "${r.key}"  uses=${r.uses}  qtyBefore ${r.befores}  (extra-deduct=${r.uses - 1})`);
  console.log('\n(correct V142 edit-resave = qtyBefore RESETS each time, excluded. Healing needs intended use-count → review.)\n===== END =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
