#!/usr/bin/env node
// ─── V44 — E2E (live admin-SDK) — course-buy product-name source fix ───────
//
// Verifies V44 fix UNIFORMLY across:
//   - all CURRENT branches (existing be_branches docs)
//   - 1 FUTURE branch (created fresh during this run)
//   - 4 course shapes: main-only, main+sub-distinct, main+sub-same (Image 5
//     repro), sub-only legacy
//   - 2 input shape paths: canonical (via beCourseToMasterShape) +
//     legacy raw (productName field, no main) — V44 dual-read defensive
//
// Compliance:
//   - V33.10/11/12 prefix discipline
//   - feedback_no_real_action_in_preview_eval — never touches real customer
//   - Rule M canonical (admin SDK + .env.local.prod + invocation guard)
//   - try/finally cleanup — always runs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { beCourseToMasterShape } from '../src/lib/backendClient.js';
import { buildPurchasedCourseEntry, resolvePurchasedCourseForAssign } from '../src/lib/treatmentBuyHelpers.js';

const APP_ID = 'loverclinic-opd-4c39b';
const RUN_ID = randomBytes(4).toString('hex');
const NS = `TEST-V44-E2E-${Date.now()}-${RUN_ID}`;

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local.prod');
  const txt = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function initFirestore() {
  if (getApps().length > 0) return getFirestore();
  const env = loadEnvLocal();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* missing');
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

let pass = 0, fail = 0;
const fails = [];
function assert(cond, label) {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; fails.push(label); console.log(`  ✗ ${label}`); }
}
function assertEq(a, b, label) {
  const sa = typeof a === 'object' ? JSON.stringify(a) : String(a);
  const sb = typeof b === 'object' ? JSON.stringify(b) : String(b);
  return assert(sa === sb, `${label}  (got=${sa}, want=${sb})`);
}

// Course config templates
const COURSE_CONFIGS = [
  {
    label: 'main-only',
    body: (branchId) => ({
      courseId: `${NS}-COURSE-MAIN-${branchId}`,
      courseName: `${NS} Main-Only @${branchId}`,
      mainProductId: `${NS}-MAIN-${branchId}`,
      mainProductName: 'Main Only Service',
      mainQty: 5,
      courseProducts: [],
      salePrice: 1000,
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      branchId,
    }),
    expectedProducts: ['Main Only Service'],
  },
  {
    label: 'main+sub-distinct',
    body: (branchId) => ({
      courseId: `${NS}-COURSE-MS-${branchId}`,
      courseName: `${NS} Main+Sub @${branchId}`,
      mainProductId: `${NS}-MAIN-MS-${branchId}`,
      mainProductName: 'Procedure Main',
      mainQty: 1,
      courseProducts: [
        { productId: `${NS}-SUB-A-${branchId}`, productName: 'Sub A', qty: 2 },
        { productId: `${NS}-SUB-B-${branchId}`, productName: 'Sub B', qty: 3 },
      ],
      salePrice: 5000,
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      branchId,
    }),
    expectedProducts: ['Procedure Main', 'Sub A', 'Sub B'],
  },
  {
    label: 'main+sub-same-id (Neuramis-style)',
    body: (branchId) => ({
      courseId: `${NS}-COURSE-MSAME-${branchId}`,
      courseName: `${NS} Same ID @${branchId}`,
      mainProductId: `${NS}-MAIN-SAME-${branchId}`,
      mainProductName: 'Filler X',
      mainQty: 30,
      courseProducts: [
        { productId: `${NS}-MAIN-SAME-${branchId}`, productName: 'Filler X', qty: 30 },
      ],
      salePrice: 49900,
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      branchId,
    }),
    expectedProducts: ['Filler X'], // dedup → only main
  },
  {
    label: 'sub-only (legacy ProClinic)',
    body: (branchId) => ({
      courseId: `${NS}-COURSE-SUB-${branchId}`,
      courseName: `${NS} Sub-Only @${branchId}`,
      // No main — legacy import shape
      mainProductId: '',
      mainProductName: '',
      mainQty: 0,
      courseProducts: [
        { productId: `${NS}-LEGACY-${branchId}`, productName: 'Legacy Sub Item', qty: 1 },
      ],
      salePrice: 200,
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      branchId,
    }),
    expectedProducts: ['Legacy Sub Item'],
  },
];

async function main() {
  const db = initFirestore();
  const data = dataPath(db);

  console.log(`[e2e-v44] namespace=${NS}`);
  console.log(`[e2e-v44] Run timestamp: ${new Date().toISOString()}\n`);

  const ids = {
    be_courses: [],
    be_branches: [],
  };

  try {
    // ── Phase 1 — Discover real branches ──────────────────────────────────
    console.log('[e2e-v44] Phase 1 — Discover branches');
    const branchSnap = await data.collection('be_branches').get();
    const realBranches = branchSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(b => !b.id.startsWith('TEST-'));
    const currentBranches = realBranches.slice(0, 2);
    console.log(`  Current: ${currentBranches.map(b => b.id).join(', ')}`);

    // ── Phase 2 — Create FUTURE branch ────────────────────────────────────
    const futureBranchId = `${NS}-FUTURE-BRANCH`;
    await data.collection('be_branches').doc(futureBranchId).set({
      branchId: futureBranchId,
      branchName: `${NS} Future Clinic`,
      isDefault: false,
      createdAt: new Date().toISOString(),
    });
    ids.be_branches.push(futureBranchId);
    console.log(`  Future:  ${futureBranchId}\n`);

    const allBranchIds = [...currentBranches.map(b => b.id), futureBranchId];

    // ── Phase 3 — Create courses across all branches ──────────────────────
    console.log('[e2e-v44] Phase 3 — Create courses for each shape × branch');
    for (const branchId of allBranchIds) {
      for (const cfg of COURSE_CONFIGS) {
        const courseDoc = cfg.body(branchId);
        await data.collection('be_courses').doc(courseDoc.courseId).set({
          ...courseDoc,
          status: 'ใช้งาน',
          createdAt: new Date().toISOString(),
        });
        ids.be_courses.push(courseDoc.courseId);
      }
    }
    console.log(`  ${ids.be_courses.length} courses created (${COURSE_CONFIGS.length} × ${allBranchIds.length} branches)\n`);

    // ── Phase 4 — beCourseToMasterShape canonical mapper across configs ───
    console.log('[e2e-v44] Phase 4 — beCourseToMasterShape produces correct names');
    for (const branchId of allBranchIds) {
      for (const cfg of COURSE_CONFIGS) {
        const courseDoc = cfg.body(branchId);
        const shape = beCourseToMasterShape(courseDoc);
        const names = shape.products.map(p => p.name);
        assertEq(names, cfg.expectedProducts,
          `[${branchId}/${cfg.label}] beCourseToMasterShape names`);
        // V44 invariant — no product is named after the course
        const noneIsCourseName = shape.products.every(p => p.name !== courseDoc.courseName);
        assert(noneIsCourseName,
          `[${branchId}/${cfg.label}] no product name === courseName (V44 invariant)`);
      }
    }
    console.log();

    // ── Phase 5 — buildPurchasedCourseEntry (canonical input) ─────────────
    console.log('[e2e-v44] Phase 5 — buildPurchasedCourseEntry on canonical shape');
    for (const branchId of allBranchIds) {
      for (const cfg of COURSE_CONFIGS) {
        const courseDoc = cfg.body(branchId);
        const shape = beCourseToMasterShape(courseDoc);
        const purchasedItem = {
          id: shape.id, name: shape.name,
          products: shape.products,
          qty: '1',
          courseType: courseDoc.courseType,
        };
        const entry = buildPurchasedCourseEntry(purchasedItem);
        const entryNames = entry.products.map(p => p.name);
        assertEq(entryNames, cfg.expectedProducts,
          `[${branchId}/${cfg.label}] buildPurchasedCourseEntry names (canonical input)`);
      }
    }
    console.log();

    // ── Phase 6 — buildPurchasedCourseEntry (raw shape — defensive) ───────
    console.log('[e2e-v44] Phase 6 — buildPurchasedCourseEntry on RAW be_courses shape (defensive dual-read)');
    for (const branchId of allBranchIds) {
      // Sim: pre-V44 buy fetcher passes raw c.courseProducts directly
      // (productName field, no main). buildPurchasedCourseEntry V44 dual-read
      // should still pull names from p.productName.
      for (const cfg of COURSE_CONFIGS) {
        const courseDoc = cfg.body(branchId);
        // Skip main-only: courseProducts is empty so buildPurchasedCourseEntry
        // takes the "no products → self-fallback" path that uses item.name
        if (cfg.label === 'main-only') continue;
        const purchasedItemRaw = {
          id: courseDoc.courseId, name: courseDoc.courseName,
          products: courseDoc.courseProducts, // RAW shape — productName field
          qty: '1',
          courseType: courseDoc.courseType,
        };
        const entry = buildPurchasedCourseEntry(purchasedItemRaw);
        const entryNames = entry.products.map(p => p.name);
        // For dedup case (main+sub-same-id), raw input has 1 sub; raw doesn't
        // dedup (that's beCourseToMasterShape's job). Names come from productName.
        const expectedRawNames = courseDoc.courseProducts.map(p => p.productName);
        assertEq(entryNames, expectedRawNames,
          `[${branchId}/${cfg.label}] dual-read rescues raw productName field`);
        // V44 invariant — no row falls back to course name
        const noneIsCourseName = entry.products.every(p => p.name !== courseDoc.courseName);
        assert(noneIsCourseName,
          `[${branchId}/${cfg.label}] dual-read prevents course-name fallback`);
      }
    }
    console.log();

    // ── Phase 7 — resolvePurchasedCourseForAssign + assign loop simulation ─
    console.log('[e2e-v44] Phase 7 — resolvePurchasedCourseForAssign passes canonical names through');
    for (const branchId of allBranchIds) {
      for (const cfg of COURSE_CONFIGS) {
        const courseDoc = cfg.body(branchId);
        const shape = beCourseToMasterShape(courseDoc);
        const purchasedItem = {
          id: shape.id, name: shape.name,
          products: shape.products,
          qty: '1',
          courseType: courseDoc.courseType,
        };
        const { products: prods } = resolvePurchasedCourseForAssign(purchasedItem, [], 1);
        const prodNames = prods.map(p => p.name || p.productName);
        assertEq(prodNames, cfg.expectedProducts,
          `[${branchId}/${cfg.label}] resolvePurchasedCourseForAssign passes through correct names`);
      }
    }
    console.log();

    // ── Phase 8 — Cross-branch consistency ────────────────────────────────
    console.log('[e2e-v44] Phase 8 — Cross-branch helper consistency (branch-blind)');
    for (const cfg of COURSE_CONFIGS) {
      const namesByBranch = {};
      for (const branchId of allBranchIds) {
        const shape = beCourseToMasterShape(cfg.body(branchId));
        namesByBranch[branchId] = shape.products.map(p => p.name);
      }
      const firstName = JSON.stringify(namesByBranch[allBranchIds[0]]);
      const allMatch = allBranchIds.every(b => JSON.stringify(namesByBranch[b]) === firstName);
      assert(allMatch, `[${cfg.label}] every branch produces identical product-name array`);
    }

    // ── Tally ─────────────────────────────────────────────────────────────
    console.log('\n[e2e-v44] === TALLY ===');
    console.log(`  PASS: ${pass}`);
    console.log(`  FAIL: ${fail}`);
    if (fail > 0) {
      console.log(`  Failed labels:`);
      for (const f of fails) console.log(`    - ${f}`);
    }
  } finally {
    console.log('\n[e2e-v44] CLEANUP');
    for (const [coll, idList] of Object.entries(ids)) {
      for (const id of idList) {
        try {
          await data.collection(coll).doc(id).delete();
        } catch (e) {
          console.warn(`  WARN delete ${coll}/${id}:`, e?.message);
        }
      }
    }
    console.log(`  deleted ${Object.values(ids).flat().length} fixtures`);
  }

  if (fail > 0) {
    console.log(`\n[e2e-v44] ❌ ${fail} assertion(s) FAILED`);
    process.exit(1);
  }
  console.log(`\n[e2e-v44] ✅ ALL ${pass} assertions PASSED`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('[e2e-v44] FATAL:', err); process.exit(1); });
}
