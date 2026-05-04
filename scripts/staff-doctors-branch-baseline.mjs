// ─── Staff + Doctors branchIds baseline ─────────────────────────────────
// 2026-05-04 user directive: "ทำให้พนักงาน แพทย์ ผู้ช่วย ทุกๆคนตอนนี้สามารถ
//   เข้าถึงสาขานครราชสีมาได้ ก็คือเหมือนติ๊กสีแดงที่สาขานครราชสีมาทุกคน
//   และไม่ต้องติ๊กเข้าถึงสาขาพระราม 3 เพราะจะเอามา Debug ตรวจสอบว่า
//   พอเปลี่ยนเป็นสาขาพระราม 3 แล้ว จะยังมีการเรียกพนักงานจากสาขานครราชสีมาอีกไหม"
//
// What this script does:
//   - For every doc in be_staff and be_doctors:
//       branchIds: ['BR-1777873556815-26df6480']   // นครราชสีมา ONLY
//     Replaces the field entirely (overwrites whatever was there).
//   - Stamps _branchIdsBaselineMigratedAt + _branchIdsBaselineMigratedBy
//     for forensics.
//   - Writes audit doc be_admin_audit/staff-doctors-branch-baseline-<ts>
//
// After this:
//   - Switch BranchSelector to นครราชสีมา → all staff/doctors visible
//     (filterStaffByBranch / filterDoctorsByBranch passes — branchIds[]
//      contains current branch)
//   - Switch to พระราม 3 → ALL staff/doctors hidden (no one has BR-RAMA3
//     in their branchIds[]) → if any UI surface still shows staff from
//     นครราชสีมา when branch=พระราม 3, that's a BSA bug to fix
//
// Usage:
//   node scripts/staff-doctors-branch-baseline.mjs
//
// Pre-flight:
//   - .env.local.prod must contain FIREBASE_ADMIN_CLIENT_EMAIL +
//     FIREBASE_ADMIN_PRIVATE_KEY (same env Phase BS scripts use)

import { readFileSync, existsSync } from 'fs';
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
const envText = readFileSync(envFile, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const NAKHON_ID = 'BR-1777873556815-26df6480'; // "นครราชสีมา" — verified against active.md migration audit
const TARGET_BRANCHIDS = [NAKHON_ID];           // ← every staff/doctor gets THIS

const COLLECTIONS = ['be_staff', 'be_doctors'];

const app = initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);
const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function migrateCollection(col, ts, summary) {
  const snap = await data.collection(col).get();
  if (snap.empty) {
    summary[col] = { total: 0, migrated: 0, sampleIds: [] };
    return;
  }
  const beforeBuckets = new Map(); // diagnostic: distinct branchIds[] shapes BEFORE
  const targets = [];
  for (const d of snap.docs) {
    const dt = d.data();
    const before = Array.isArray(dt.branchIds) ? [...dt.branchIds].sort().join('|') : '<missing>';
    beforeBuckets.set(before, (beforeBuckets.get(before) || 0) + 1);
    targets.push(d);
  }
  summary[col] = {
    total: snap.size,
    migrated: targets.length,
    sampleIds: targets.slice(0, 5).map(d => d.id),
    beforeBuckets: Object.fromEntries(beforeBuckets.entries()),
  };

  let batch = db.batch();
  let inBatch = 0;
  for (const d of targets) {
    batch.update(d.ref, {
      branchIds: TARGET_BRANCHIDS,
      _branchIdsBaselineMigratedAt: ts,
      _branchIdsBaselineMigratedBy: 'admin-script-2026-05-04-debug-baseline',
    });
    inBatch += 1;
    if (inBatch >= 500) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();
}

async function verifyCollection(col, summary) {
  const snap = await data.collection(col).get();
  const afterBuckets = new Map();
  for (const d of snap.docs) {
    const dt = d.data();
    const after = Array.isArray(dt.branchIds) ? [...dt.branchIds].sort().join('|') : '<missing>';
    afterBuckets.set(after, (afterBuckets.get(after) || 0) + 1);
  }
  summary[col].afterBuckets = Object.fromEntries(afterBuckets.entries());
  // EXPECTED: afterBuckets has exactly one key = NAKHON_ID, count = total
  const keys = [...afterBuckets.keys()];
  const allMigrated = keys.length === 1 && keys[0] === NAKHON_ID;
  summary[col].allMigrated = allMigrated;
}

async function main() {
  const ts = new Date().toISOString();
  console.log(`=== Staff + Doctors branchIds Baseline ===`);
  console.log(`Target branchIds: ${JSON.stringify(TARGET_BRANCHIDS)} (นครราชสีมา ONLY)`);
  console.log(`Time: ${ts}`);
  console.log('');

  const summary = {};
  for (const col of COLLECTIONS) {
    process.stdout.write(`  ${col.padEnd(20)} `);
    try {
      await migrateCollection(col, ts, summary);
      const r = summary[col];
      console.log(`migrated ${r.migrated}/${r.total}`);
      console.log(`    BEFORE buckets: ${JSON.stringify(r.beforeBuckets)}`);
    } catch (e) {
      summary[col] = { error: e.message };
      console.log(`ERR: ${e.message}`);
    }
  }
  console.log('');

  // Verify pass
  console.log(`=== Verify ===`);
  for (const col of COLLECTIONS) {
    if (summary[col].error) continue;
    process.stdout.write(`  ${col.padEnd(20)} `);
    try {
      await verifyCollection(col, summary);
      const r = summary[col];
      console.log(`AFTER buckets: ${JSON.stringify(r.afterBuckets)} → allMigrated=${r.allMigrated}`);
    } catch (e) {
      console.log(`ERR: ${e.message}`);
    }
  }
  console.log('');

  // Audit doc
  const auditId = `staff-doctors-branch-baseline-${Date.now()}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    type: 'staff-doctors-branch-baseline',
    targetBranchIds: TARGET_BRANCHIDS,
    rule: 'every be_staff + be_doctors → branchIds = [นครราชสีมา]; debug baseline',
    summary,
    callerEmail: 'admin-script-2026-05-04-debug',
    callerUid: 'admin-script',
    createdAt: ts,
  });
  console.log(`Audit: be_admin_audit/${auditId}`);

  const totalMigrated = Object.values(summary).reduce((a, r) => a + (r.migrated || 0), 0);
  const allOk = COLLECTIONS.every(c => summary[c]?.allMigrated === true);
  console.log('');
  console.log(`=== ${totalMigrated} docs migrated. allMigrated=${allOk} ===`);
  if (!allOk) {
    console.error('WARNING: verify pass found docs that are NOT exactly [NAKHON]. Check buckets above.');
    process.exit(2);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
