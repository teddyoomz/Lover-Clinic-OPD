#!/usr/bin/env node
/**
 * diag-missing-customers-after-permanent-restore.mjs (Rule R read-only)
 *
 * User report 2026-05-17 EOD+3 LATE+3:
 *   "ใน frontend tab ประวัติ เมื่อกดปุ่มกลับเข้าคิวแล้วเลือกคิวถาวร กลายเป็น
 *    list ลูกค้านั้นหายไปเลย ไม่ยอมกลับเข้ามาหน้าคิวหน้าคลินิก แล้วก็หายไป
 *    จากหน้าประวัติด้วย"
 *
 * 2 named customers to recover:
 *   - นาย แป้น โอนสันเทียะ
 *   - นาย วิชยุตม์ ธนวัฒน์โอฬาร
 *
 * Goals:
 *   1. Locate the 2 opd_session docs by patientData.firstName / lastName /
 *      sessionName / firstNameTh / lastNameTh
 *   2. Print their CURRENT state (all flags relevant to tab routing)
 *   3. Classify which tab they should appear in given current state
 *   4. Print the same for ALL opd_sessions with isPermanent=true to
 *      cross-check tab-routing assumption.
 *
 * Read-only diag — no writes. Per Rule R standing authorization (LoverClinic).
 */

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const APP_ID = 'loverclinic-opd-4c39b';
const PATH = `artifacts/${APP_ID}/public/data`;

function initAdmin() {
  const env = loadEnv();
  const pk = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: pk,
    }),
  });
  return getFirestore();
}

function matchesName(pd, sessionName, namePatterns) {
  if (!namePatterns?.length) return false;
  const haystack = [
    pd?.firstName,
    pd?.lastName,
    pd?.firstNameTh,
    pd?.lastNameTh,
    pd?.firstNameEn,
    pd?.lastNameEn,
    pd?.prefix,
    pd?.nickname,
    sessionName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return namePatterns.some(p => haystack.includes(p.toLowerCase()));
}

function classifyTab(s) {
  const isArchived = !!s.isArchived;
  const isPermanent = !!s.isPermanent;
  const isDeposit = s.formType === 'deposit';
  const isServiced = !!s.serviceCompleted;
  const hasResetStamp = !!s._v82FollowupOpdResetAt;

  // Mirror AdminDashboard.jsx filters EXACTLY (lines 2243-2287)
  // archivedSessions (history tab, normal):
  if (
    isArchived &&
    (!isDeposit || isServiced) &&
    !(isPermanent && !isDeposit && !isServiced)
  )
    return 'ประวัติ (history)';

  // archivedNoDepositSessions (จองไม่มัดจำ archived sub-list):
  if (isArchived && isPermanent && !isDeposit && !isServiced)
    return 'จองไม่มัดจำ (archived sub-list)';

  // noDepositSessions (จองไม่มัดจำ active):
  if (!isArchived && isPermanent && !isDeposit && !isServiced)
    return 'จองไม่มัดจำ (ACTIVE) ← restored-permanent intake lands here';

  // Active queue (คิวหน้าคลินิก):
  if (!isArchived) {
    if (isDeposit && !isServiced) return 'จองมัดจำ (deposit booking)';
    if (isPermanent) return 'คิวหน้าคลินิก (queue — permanent deposit)';
    if (isDeposit && isServiced) return 'คิวหน้าคลินิก (queue — deposit serviced)';
    if (hasResetStamp) return 'คิวหน้าคลินิก (queue — V82-followup opt-out)';
    return 'คิวหน้าคลินิก (queue — normal age check)';
  }

  return 'UNKNOWN / orphan';
}

async function main() {
  const db = initAdmin();
  const col = db.collection(`${PATH}/opd_sessions`);
  const snap = await col.get();
  console.log(`\n=== Scanning ${snap.size} opd_sessions ===\n`);

  const namePatterns = ['แป้น', 'โอนสัน', 'วิชยุตม์', 'ธนวัฒน์โอฬาร'];

  const matched = [];
  const allPermanentNonDeposit = [];
  const allWithResetStamp = [];
  let withResetStampHiddenByPermanentFilter = 0;

  snap.forEach(d => {
    const s = { id: d.id, ...d.data() };
    const pd = s.patientData || {};

    if (matchesName(pd, s.sessionName, namePatterns)) matched.push(s);

    if (s.isPermanent && s.formType !== 'deposit' && !s.serviceCompleted) {
      allPermanentNonDeposit.push(s);
      if (s._v82FollowupOpdResetAt) withResetStampHiddenByPermanentFilter++;
    }
    if (s._v82FollowupOpdResetAt) allWithResetStamp.push(s);
  });

  // --- Section 1: name matches ---
  console.log(`--- SECTION 1: NAME-MATCHED CUSTOMERS (${matched.length}) ---`);
  matched.forEach(s => {
    const pd = s.patientData || {};
    console.log(`\n[${s.id}]`);
    console.log(`  name: ${pd.prefix || ''} ${pd.firstName || pd.firstNameTh || ''} ${pd.lastName || pd.lastNameTh || ''}  / sessionName: ${s.sessionName || ''}`);
    console.log(`  formType:               ${s.formType}`);
    console.log(`  isArchived:             ${!!s.isArchived}`);
    console.log(`  isPermanent:            ${!!s.isPermanent}`);
    console.log(`  serviceCompleted:       ${!!s.serviceCompleted}`);
    console.log(`  _v82FollowupOpdResetAt: ${s._v82FollowupOpdResetAt ? 'YES' : 'no'}`);
    console.log(`  branchId:               ${s.branchId || '(none)'}`);
    console.log(`  createdAt:              ${s.createdAt?.toDate?.()?.toISOString?.() || s.createdAt || 'null'}`);
    console.log(`  updatedAt:              ${s.updatedAt?.toDate?.()?.toISOString?.() || s.updatedAt || 'null'}`);
    console.log(`  archivedAt:             ${s.archivedAt?.toDate?.()?.toISOString?.() || s.archivedAt || 'null'}`);
    console.log(`  → CURRENT TAB: ${classifyTab(s)}`);
  });

  // --- Section 2: all isPermanent + non-deposit + !serviced ---
  console.log(`\n--- SECTION 2: ALL "PERMANENT NON-DEPOSIT UNSERVICED" (${allPermanentNonDeposit.length}) ---`);
  console.log(`These are routed to จองไม่มัดจำ tab by line 2275 filter.`);
  console.log(`Of these, ${withResetStampHiddenByPermanentFilter} also have _v82FollowupOpdResetAt stamp`);
  console.log(`(meaning the V82-followup opt-out should keep them in queue, but the permanent filter overrides).`);
  allPermanentNonDeposit.forEach(s => {
    const pd = s.patientData || {};
    const name = `${pd.prefix || ''} ${pd.firstName || pd.firstNameTh || ''} ${pd.lastName || pd.lastNameTh || ''}`.trim();
    console.log(`  [${s.id}]  ${name || s.sessionName || '(no name)'}  archived=${!!s.isArchived}  resetStamp=${s._v82FollowupOpdResetAt ? 'Y' : 'n'}  → ${classifyTab(s)}`);
  });

  // --- Section 3: all V82-followup stamp count ---
  console.log(`\n--- SECTION 3: ALL _v82FollowupOpdResetAt-STAMPED SESSIONS (${allWithResetStamp.length}) ---`);
  const byTab = {};
  allWithResetStamp.forEach(s => {
    const tab = classifyTab(s);
    byTab[tab] = (byTab[tab] || 0) + 1;
  });
  console.log(`Distribution across tabs:`);
  Object.entries(byTab)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tab, n]) => console.log(`  ${n.toString().padStart(3)} | ${tab}`));

  console.log(`\n=== DONE — read-only diag complete ===\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('diag failed:', e);
    process.exit(1);
  });
}
