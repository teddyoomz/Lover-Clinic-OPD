// ─── BSA leak-sweep #2 — marketing + deposits branchId baseline ─────────
// 2026-05-04 user reports (verbatim):
//   "โปรโมชั่น คูปอง Voucher หายไปหมดเลย migrate ที่เคยมีกลับมาเข้าสาขา
//    นครราชสีมาด้วย ใช้ pull env จาก vercel แล้วทำเองไม่ต้องผ่านผม"
//   "อย่าลืม migrate มัดจำที่มีอยู่ไปเข้า data ของสาขานครราชสีมาด้วย"
//
// Why these were missed:
//   - Phase BSA Task 1 (commit e13f3c5) added `_listWithBranchOrMerge` to
//     listPromotions / listCoupons / listVouchers. The 2-query OR-merge
//     filters by `branchId == current` OR `allBranches == true`. Existing
//     pre-Phase-BSA docs have NEITHER → both queries return empty → docs
//     invisible to UI even though they're still in Firestore.
//   - be_deposits is now branch-scoped writer-side + reader-side (this
//     same commit). Pre-fix docs lack the `branchId` field entirely →
//     `where('branchId','==',X)` skips them.
//
// Migration policy mirrors branch-merge-apply.mjs (locked 2026-05-06):
//   - empty / missing / 'main' / 'BR-1777095572005-ae97f911' (V35 phantom)
//     → backfill to TARGET (นครราชสีมา = BR-1777873556815-26df6480)
//   - all other branchId values → SKIP (intentional pre-existing scope,
//     e.g. พระราม 3 = BR-1777885958735-38afbdeb shouldn't be touched)
//
// Per-collection writeBatch ≤ 500 ops. Each write also stamps
// `_branchBaselineMigratedAt` + `_branchBaselineMigratedBy` for forensics.
// One audit doc summarizes counts + sample IDs.
//
// Usage: node scripts/bsa-leak-sweep-2-marketing-deposits-baseline.mjs
//
// Pre-flight:
//   - .env.local.prod must contain FIREBASE_ADMIN_CLIENT_EMAIL +
//     FIREBASE_ADMIN_PRIVATE_KEY. Pull via:
//       vercel env pull .env.local.prod --environment=production --yes

import { readFileSync, existsSync } from 'fs';
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (!existsSync(envFile)) {
  console.error(`Env file not found: ${envFile}`);
  console.error('Pull via: vercel env pull .env.local.prod --environment=production --yes');
  process.exit(1);
}
const envText = readFileSync(envFile, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const TARGET_BRANCH = 'BR-1777873556815-26df6480'; // "นครราชสีมา"

// branchId values that we MIGRATE to TARGET (mirror branch-merge-apply.mjs)
const MIGRATABLE = (bid) => {
  if (bid === undefined || bid === null) return true;          // missing field
  if (typeof bid !== 'string') return true;                    // non-string  (V22-style noise)
  const s = bid.trim();
  if (s === '') return true;                                   // empty string
  if (s === 'main') return true;                               // pre-V20 default
  if (s === 'BR-1777095572005-ae97f911') return true;          // V35 phantom
  return false;                                                // anything else stays put
};

const COLLECTIONS = [
  // Phase BSA Task 1 OR-merge (allBranches doc-field aware) — but only
  // pre-existing docs get backfilled; new docs flow through writer stamp.
  'be_promotions',
  'be_coupons',
  'be_vouchers',
  // Phase BSA leak-sweep-2 (this commit) — deposits now branch-scoped.
  'be_deposits',
];

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
  const beforeBuckets = new Map();
  const targets = [];
  for (const d of snap.docs) {
    const dt = d.data();
    const before = dt.branchId === undefined ? '<missing>' : (dt.branchId === null ? '<null>' : String(dt.branchId));
    beforeBuckets.set(before, (beforeBuckets.get(before) || 0) + 1);
    if (MIGRATABLE(dt.branchId)) targets.push(d);
  }
  summary[col] = {
    total: snap.size,
    migrated: targets.length,
    skipped: snap.size - targets.length,
    sampleIds: targets.slice(0, 5).map(d => d.id),
    beforeBuckets: Object.fromEntries(beforeBuckets.entries()),
  };
  if (targets.length === 0) return;

  let batch = db.batch();
  let inBatch = 0;
  for (const d of targets) {
    batch.update(d.ref, {
      branchId: TARGET_BRANCH,
      _branchBaselineMigratedAt: ts,
      _branchBaselineMigratedBy: 'admin-script-2026-05-04-bsa-leak-sweep-2-marketing-deposits',
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
    const after = dt.branchId === undefined ? '<missing>' : (dt.branchId === null ? '<null>' : String(dt.branchId));
    afterBuckets.set(after, (afterBuckets.get(after) || 0) + 1);
  }
  summary[col].afterBuckets = Object.fromEntries(afterBuckets.entries());
}

async function main() {
  const ts = new Date().toISOString();
  console.log(`=== BSA leak-sweep-2: marketing + deposits branchId baseline ===`);
  console.log(`Target branchId: ${TARGET_BRANCH} ("นครราชสีมา")`);
  console.log(`Time: ${ts}`);
  console.log('');

  const summary = {};
  for (const col of COLLECTIONS) {
    process.stdout.write(`  ${col.padEnd(20)} `);
    try {
      await migrateCollection(col, ts, summary);
      const r = summary[col];
      console.log(`migrated ${r.migrated}/${r.total} (skipped ${r.skipped})`);
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
      console.log(`AFTER buckets: ${JSON.stringify(r.afterBuckets)}`);
    } catch (e) {
      console.log(`ERR: ${e.message}`);
    }
  }
  console.log('');

  // Audit doc
  const auditId = `bsa-leak-sweep-2-marketing-deposits-baseline-${Date.now()}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    type: 'bsa-leak-sweep-2-marketing-deposits-baseline',
    targetBranch: TARGET_BRANCH,
    rule: 'empty / missing / main / BR-1777095572005-ae97f911 → TARGET; collections: ' + COLLECTIONS.join(','),
    summary,
    callerEmail: 'admin-script-2026-05-04-bsa-leak-sweep-2',
    callerUid: 'admin-script',
    createdAt: ts,
  });
  console.log(`Audit: be_admin_audit/${auditId}`);

  const totalMigrated = Object.values(summary).reduce((a, r) => a + (r.migrated || 0), 0);
  console.log('');
  console.log(`=== ${totalMigrated} docs migrated to ${TARGET_BRANCH} ===`);
  console.log(`=== Audit ID: ${auditId} ===`);
  process.exit(0);
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
