#!/usr/bin/env node
// Rule R diag (READ-ONLY) — ③ (2026-05-31) verify the SHIPPED resolveCourseDeducted
// predicate against REAL prod be_treatments. Confirms the SSOT splits deducted
// (violet ✓ "คอร์ส") vs not-deducted (muted "ไม่ตัดคอร์ส") correctly, AND the
// V139/V104 trap is closed: the predicate must read detail.courseItems /
// detail.treatmentItems on the raw doc — NOT top-level (which the CDV mapper strips).
// Imports the REAL src predicate (no reimplementation — Rule Q-honest).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCourseDeducted } from '../src/lib/treatmentDisplayResolvers.js';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a;
}, {});
if (getApps().length === 0) initializeApp({ credential: cert({
  projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
}), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const LIMIT = Number(process.argv[2] || 25);

async function main() {
  console.log(`\n===== DIAG ③: resolveCourseDeducted on ${LIMIT} recent be_treatments =====\n`);
  let snap;
  try {
    snap = await db.collection(`${BASE}/be_treatments`).orderBy('createdAt', 'desc').limit(LIMIT).get();
  } catch (e) {
    console.log(`(orderBy createdAt failed: ${e.message}; unordered fallback)`);
    snap = await db.collection(`${BASE}/be_treatments`).limit(LIMIT).get();
  }
  let deducted = 0, notDeducted = 0, trapOnly = 0;
  for (const d of snap.docs) {
    const t = d.data();
    const ded = resolveCourseDeducted(t);                      // SHIPPED predicate
    const ci = Array.isArray(t.detail?.courseItems) ? t.detail.courseItems.length : 0;
    const ti = Array.isArray(t.detail?.treatmentItems) ? t.detail.treatmentItems.length : 0;
    const topCi = Array.isArray(t.courseItems) ? t.courseItems.length : 0;     // V139/V104 trap probe
    const topTi = Array.isArray(t.treatmentItems) ? t.treatmentItems.length : 0;
    if (ded) deducted++; else notDeducted++;
    if ((topCi > 0 || topTi > 0) && ci === 0 && ti === 0) trapOnly++;
    console.log(`  ${d.id}  deducted=${ded ? 'TRUE ' : 'false'}  detail.ci=${ci} detail.ti=${ti}  (top-level ci=${topCi} ti=${topTi})  cust=${t.customerId || '-'}`);
  }
  console.log(`\n── SPLIT: deducted=${deducted}  not-deducted=${notDeducted}  (of ${snap.size})`);
  console.log(`── trap-check: ${trapOnly} doc(s) have ONLY top-level courseItems/treatmentItems — these MUST be NOT-deducted (proves predicate reads detail.* only).`);
  console.log('\n===== END =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
