// scripts/diag-v73-l1-bug-report.mjs
// Rule R env-pull diag for V73 L1 hands-on bug report (2026-05-18 — user-curse incident).
// User-reported issues:
//   1. แชทไม่ส่งถึงกัน (chats not reaching each other — 2 tabs, 2nd is incognito)
//   2. สาขาตรงหัวแชทไม่ขึ้น (branch name "—" in chat header instead of branch label)
//   3. ชื่อของคนส่งไม่แสดง (sender name doesn't show in chat)
//   4. ลบ placeholder hint ในช่องกรอกข้อความ (UX cleanup; not data issue)
//
// READ-ONLY admin-SDK diagnostic. Per Rule R, no mutations.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

const APP_ID = 'loverclinic-opd-4c39b';
const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || '';
const privateKey = rawKey.split('\\n').join('\n');

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const db = getFirestore();
const DATA = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

console.log('=== V73 L1 Bug Diag — 2026-05-18 ===\n');

// 1) Last 10 staff chat messages — full shape
console.log('--- be_staff_chat_messages (last 10 by createdAt desc) ---');
const msgsSnap = await DATA.collection('be_staff_chat_messages')
  .orderBy('createdAt', 'desc')
  .limit(10)
  .get();

if (msgsSnap.empty) {
  console.log('  (NO MESSAGES IN COLLECTION — Firestore empty)');
} else {
  console.log(`  Found ${msgsSnap.size} message(s):`);
  for (const d of msgsSnap.docs) {
    const data = d.data();
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : String(data.createdAt);
    console.log(JSON.stringify({
      id: d.id,
      branchId: data.branchId,
      displayName: data.displayName,
      deviceId: data.deviceId,
      text: data.text,
      textLen: (data.text || '').length,
      createdAt,
      hasMentions: !!data.mentions?.length,
      hasReplyTo: !!data.replyTo,
      hasAttachment: !!data.attachmentUrl,
    }, null, 2));
  }
}

// 2) be_branches — to see what branchId "นครราชสีมา" maps to
console.log('\n--- be_branches (all) ---');
const brSnap = await DATA.collection('be_branches').get();
console.log(`  Found ${brSnap.size} branch(es):`);
for (const d of brSnap.docs) {
  const data = d.data();
  console.log(JSON.stringify({
    id: d.id,
    docIdField: data.id,
    name: data.name,
    branchName: data.branchName,
    isDefault: data.isDefault,
    status: data.status,
  }, null, 2));
}

// 3) be_staff for current user — verify isClinicStaff custom claim eligibility
console.log('\n--- be_staff sample (looking for owner email) ---');
const staffSnap = await DATA.collection('be_staff')
  .where('email', '==', 'oomz.peerapat@gmail.com')
  .limit(5)
  .get();

if (staffSnap.empty) {
  console.log('  No staff doc for oomz.peerapat@gmail.com — checking fallback');
  const fallbackSnap = await DATA.collection('be_staff').limit(3).get();
  for (const d of fallbackSnap.docs) {
    const data = d.data();
    console.log(JSON.stringify({
      id: d.id,
      email: data.email,
      firebaseUid: data.firebaseUid,
      permissionGroupId: data.permissionGroupId,
      branchIds: data.branchIds,
    }, null, 2));
  }
} else {
  for (const d of staffSnap.docs) {
    const data = d.data();
    console.log(JSON.stringify({
      id: d.id,
      email: data.email,
      firebaseUid: data.firebaseUid,
      permissionGroupId: data.permissionGroupId,
      branchIds: data.branchIds,
    }, null, 2));
  }
}

console.log('\n=== Diag complete ===');
