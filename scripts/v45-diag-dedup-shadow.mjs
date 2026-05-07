#!/usr/bin/env node
// ─── V45 — Diag — beCourseToMasterShape dedup-shadow flag drop ──────────────
//
// Read-only diagnostic per Rule M. Counts be_courses where main product is
// ALSO present in courseProducts[] with same productId — the dedup-shadow
// trigger condition. For each such course, classifies whether per-row flags
// (skipStockDeduction / isHidden / isRequired) on the dup-of-main entry
// would be SILENTLY DROPPED by line 3193 of backendClient.js.
//
// Scope: any course where admin added a sub-row with the same product as the
// main, with INTENT to set per-row flags — system silently ignores those
// flags due to dedup logic.
//
// Companion fix (V45): OR-merge per-row flags from dup-of-main sub into the
// already-pushed main entry, then continue dedup. Pure mapper fix.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

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

async function main() {
  const db = initFirestore();
  const data = dataPath(db);

  console.log('[v45-diag] reading be_courses ...');
  const snap = await data.collection('be_courses').get();
  console.log(`[v45-diag]   ${snap.size} be_courses\n`);

  let totalCourses = 0;
  let coursesWithMain = 0;
  let coursesWithDupOfMain = 0;
  let coursesWithDupAndPerRowSkipTrue = 0;
  let coursesWithDupAndAnyPerRowFlag = 0;
  const sampleDupSkip = [];
  const sampleDupAnyFlag = [];

  for (const d of snap.docs) {
    const c = d.data();
    if (!c?.courseName) continue;
    totalCourses += 1;
    const mainId = String(c.mainProductId || '').trim();
    if (!mainId) continue;
    coursesWithMain += 1;

    const subs = Array.isArray(c.courseProducts) ? c.courseProducts : [];
    const dupOfMain = subs.find(s => String(s?.productId || s?.id || '').trim() === mainId);
    if (!dupOfMain) continue;
    coursesWithDupOfMain += 1;

    const topSkip = !!c.skipStockDeduction;
    const subSkip = !!dupOfMain.skipStockDeduction;
    const subHidden = !!dupOfMain.isHidden;
    const subRequired = !!dupOfMain.isRequired;
    const subDfNonDefault = (dupOfMain.isDf === false); // default true; explicit false = user intent

    const driftSkip = subSkip && !topSkip; // user wants skip on this product only, top doesn't
    const driftAny = subSkip || subHidden || subRequired || subDfNonDefault;

    if (driftSkip) {
      coursesWithDupAndPerRowSkipTrue += 1;
      if (sampleDupSkip.length < 8) {
        sampleDupSkip.push({
          courseId: d.id,
          courseName: c.courseName,
          mainProductId: mainId,
          mainProductName: c.mainProductName,
          topSkip,
          subSkip,
          subHidden,
          subRequired,
          branchId: c.branchId || '',
        });
      }
    }
    if (driftAny) coursesWithDupAndAnyPerRowFlag += 1;
    if (driftAny && !driftSkip && sampleDupAnyFlag.length < 5) {
      sampleDupAnyFlag.push({
        courseId: d.id,
        courseName: c.courseName,
        topSkip,
        subSkip,
        subHidden,
        subRequired,
        subDfNonDefault,
        branchId: c.branchId || '',
      });
    }
  }

  console.log('[v45-diag] === REPORT ===');
  console.log(`  Total courses scanned:                      ${totalCourses}`);
  console.log(`  Courses with mainProductId set:             ${coursesWithMain}`);
  console.log(`  Courses where main is ALSO in courseProducts (dedup fires):  ${coursesWithDupOfMain}`);
  console.log(`  ⚠ Courses where dedup DROPS per-row skip flag:               ${coursesWithDupAndPerRowSkipTrue}`);
  console.log(`  ⚠ Courses where dedup drops ANY per-row flag (skip/hide/req): ${coursesWithDupAndAnyPerRowFlag}`);

  if (sampleDupSkip.length) {
    console.log(`\n  --- SKIP drift sample (showing ${sampleDupSkip.length}) ---`);
    for (const s of sampleDupSkip) {
      console.log(`    course="${s.courseName}"`);
      console.log(`      docId=${s.courseId}  branchId=${s.branchId}`);
      console.log(`      main pid=${s.mainProductId} name="${s.mainProductName}"`);
      console.log(`      top.skip=${s.topSkip}  sub.skip=${s.subSkip}  sub.hidden=${s.subHidden}  sub.required=${s.subRequired}`);
    }
  }
  if (sampleDupAnyFlag.length) {
    console.log(`\n  --- ANY-flag drift (non-skip) sample (showing ${sampleDupAnyFlag.length}) ---`);
    for (const s of sampleDupAnyFlag) {
      console.log(`    course="${s.courseName}"  flags: skip=${s.subSkip} hidden=${s.subHidden} req=${s.subRequired} df-flipped=${s.subDfNonDefault}`);
    }
  }
  console.log('\n[v45-diag] DONE');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('[v45-diag] FATAL:', err); process.exit(1); });
}
