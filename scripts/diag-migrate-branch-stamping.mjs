#!/usr/bin/env node
// ─── DIAG (read-only): all migrate paths' branchId stamping verification ───
//
// User report 2026-05-07: "นำเข้าสินค้า, คอร์ส, โปรโมชั่น จากหน้า tab=masterdata
// เข้าสาขาพระราม 3 ไม่ได้ แต่ใน ui ขึ้นว่าสำเร็จตามภาพ"
//
// Phase 1 evidence: 3 promotion/coupon/voucher migrate fns DO NOT accept
// {branchId} opt (line 8133/8202/8279); 7 catalog migrate fns DO (post-octies).
// This diag verifies the actual Firestore state to:
//   1. Confirm post-octies products + courses migrate is stamping correctly
//   2. Identify zombies (no branchId) per collection — pre-octies stale or
//      post-octies-but-fix-misses
//   3. Show updatedAt of representative zombies to determine timing
//
// Pure read-only. No writes.
//
// Run: node scripts/diag-migrate-branch-stamping.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const envText = readFileSync(envFile, 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!clientEmail || !privateKey) {
    console.error('Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY in env');
    process.exit(1);
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

// Targets — every migrate-from-masterdata destination collection.
// For each: classify whether branchId stamping is REQUIRED per current spec.
const TARGETS = [
  { col: 'be_promotions',         requireBranchId: true,  classification: 'branch-scoped via _listWithBranchOrMerge', migrateAcceptsBranchId: false /* BUG */ },
  { col: 'be_coupons',            requireBranchId: true,  classification: 'branch-scoped via _listWithBranchOrMerge', migrateAcceptsBranchId: false },
  { col: 'be_vouchers',           requireBranchId: true,  classification: 'branch-scoped via _listWithBranchOrMerge', migrateAcceptsBranchId: false },
  { col: 'be_products',           requireBranchId: true,  classification: 'branch-scoped',                            migrateAcceptsBranchId: true  /* octies-fixed */ },
  { col: 'be_courses',            requireBranchId: true,  classification: 'branch-scoped',                            migrateAcceptsBranchId: true  },
  { col: 'be_product_groups',     requireBranchId: true,  classification: 'branch-scoped',                            migrateAcceptsBranchId: true  },
  { col: 'be_product_units',      requireBranchId: true,  classification: 'branch-scoped',                            migrateAcceptsBranchId: true  },
  { col: 'be_medical_instruments',requireBranchId: true,  classification: 'branch-scoped',                            migrateAcceptsBranchId: true  },
  { col: 'be_holidays',           requireBranchId: true,  classification: 'branch-scoped',                            migrateAcceptsBranchId: true  },
  { col: 'be_df_groups',          requireBranchId: true,  classification: 'branch-scoped',                            migrateAcceptsBranchId: true  },
  { col: 'be_df_staff_rates',     requireBranchId: true,  classification: 'branch-scoped (lister accepts branchId)',  migrateAcceptsBranchId: false /* BUG */ },
  { col: 'be_staff_schedules',    requireBranchId: true,  classification: 'branch-spread (writer stamps src.branchId post-ter-filter)', migrateAcceptsBranchId: 'pass-through' },
  { col: 'be_wallet_types',       requireBranchId: false, classification: 'global (universal)',                       migrateAcceptsBranchId: false },
  { col: 'be_membership_types',   requireBranchId: false, classification: 'global (universal)',                       migrateAcceptsBranchId: false },
  { col: 'be_medicine_labels',    requireBranchId: false, classification: 'global (universal)',                       migrateAcceptsBranchId: false },
  { col: 'be_branches',           requireBranchId: false, classification: 'universal (branches table itself)',         migrateAcceptsBranchId: false },
  { col: 'be_permission_groups',  requireBranchId: false, classification: 'universal',                                migrateAcceptsBranchId: false },
  { col: 'be_staff',              requireBranchId: false, classification: 'universal',                                migrateAcceptsBranchId: false },
  { col: 'be_doctors',            requireBranchId: false, classification: 'universal',                                migrateAcceptsBranchId: false },
];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' DIAG: migrate→be_* branch stamping coverage');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Resolve branch IDs first
  const branchSnap = await db.collection(`${BASE_PATH}/be_branches`).get();
  let pram3Id = null, nakhornId = null;
  for (const doc of branchSnap.docs) {
    const data = doc.data();
    const name = data.branchName || data.name || '';
    if (name.includes('พระราม')) pram3Id = doc.id;
    if (name.includes('นครราชสีมา')) nakhornId = doc.id;
  }
  console.log(`Branch IDs: พระราม 3 = ${pram3Id || '(?)'}, นครราชสีมา = ${nakhornId || '(?)'}\n`);

  const verdicts = [];

  for (const target of TARGETS) {
    const snap = await db.collection(`${BASE_PATH}/${target.col}`).get();
    const total = snap.size;

    const byBranch = {};
    const noBranch = [];
    let withAllBranchesTrue = 0;
    for (const doc of snap.docs) {
      const d = doc.data();
      const bid = d.branchId;
      const allB = d.allBranches === true;
      if (allB) withAllBranchesTrue++;
      if (!bid) noBranch.push({ id: doc.id, updatedAt: d.updatedAt, name: d.productName || d.courseName || d.promotion_name || d.coupon_name || d.voucher_name || d.name || '?' });
      else byBranch[bid] = (byBranch[bid] || 0) + 1;
    }

    // Recent updatedAt sample of zombies
    const zombiesByRecency = noBranch
      .filter(z => z.updatedAt)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 5);

    const verdict = {
      col: target.col,
      total,
      pram3Count: byBranch[pram3Id] || 0,
      nakhornCount: byBranch[nakhornId] || 0,
      otherBranchCount: Object.entries(byBranch)
        .filter(([k]) => k !== pram3Id && k !== nakhornId)
        .reduce((a, [, v]) => a + v, 0),
      noBranchCount: noBranch.length,
      withAllBranchesTrue,
      classification: target.classification,
      migrateAcceptsBranchId: target.migrateAcceptsBranchId,
      requireBranchId: target.requireBranchId,
      mostRecentZombies: zombiesByRecency,
    };
    verdicts.push(verdict);
  }

  // Print summary table
  console.log('═══ SUMMARY ═══\n');
  console.log('Collection                     Total   Pram3  Nakhorn  Other   NoBID   AllBr  MigrateOpt  Verdict');
  console.log('─'.repeat(120));
  for (const v of verdicts) {
    const verdict = (() => {
      if (!v.requireBranchId) {
        return v.noBranchCount === v.total ? '✓ universal (no branchId expected)' : '⚠ has branchId stamps but classified universal';
      }
      // requireBranchId
      if (v.noBranchCount === 0) return '✓ all stamped';
      if (v.noBranchCount === v.total) return `✗ NONE stamped (migrate ${v.migrateAcceptsBranchId === false ? 'BUG: missing arg' : 'unknown'})`;
      return `⚠ ${v.noBranchCount}/${v.total} unstamped (zombies)`;
    })();
    console.log(
      v.col.padEnd(30) +
      String(v.total).padStart(6) +
      String(v.pram3Count).padStart(7) +
      String(v.nakhornCount).padStart(9) +
      String(v.otherBranchCount).padStart(7) +
      String(v.noBranchCount).padStart(8) +
      String(v.withAllBranchesTrue).padStart(7) +
      '  ' + String(v.migrateAcceptsBranchId).padEnd(10) +
      '  ' + verdict
    );
  }

  console.log('\n═══ DETAIL: collections with zombies (most-recent updatedAt sample) ═══\n');
  for (const v of verdicts.filter(v => v.requireBranchId && v.noBranchCount > 0)) {
    console.log(`▸ ${v.col} — ${v.noBranchCount} zombies (out of ${v.total})`);
    for (const z of v.mostRecentZombies) {
      const truncName = String(z.name || '?').slice(0, 30);
      console.log(`    docId="${z.id}"  name="${truncName}"  updatedAt=${z.updatedAt}`);
    }
    console.log('');
  }

  console.log('═══ END ═══\n');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
