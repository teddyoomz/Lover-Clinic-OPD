#!/usr/bin/env node
// E2E: live admin-SDK round-trip on real prod for V41 staff/doctor hide.
// Pattern mirrors scripts/e2e-branch-backup-restore.mjs (V40).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();

const TS = Date.now();
const TEST_STAFF_ID = `TEST-STAFF-V41-${TS}`;
const TEST_DOCTOR_ID = `TEST-DOCTOR-V41-${TS}`;
const TEST_ASSISTANT_ID = `TEST-ASSISTANT-V41-${TS}`;

const cleanup = [];

async function main() {
  console.log('═══ E2E: V41 staff/doctor hide round-trip ═══');
  console.log(`Test fixtures: ${TEST_STAFF_ID} / ${TEST_DOCTOR_ID} / ${TEST_ASSISTANT_ID}\n`);

  const staffRef = db.collection(`${BASE_PATH}/be_staff`).doc(TEST_STAFF_ID);
  const doctorRef = db.collection(`${BASE_PATH}/be_doctors`).doc(TEST_DOCTOR_ID);
  const assistantRef = db.collection(`${BASE_PATH}/be_doctors`).doc(TEST_ASSISTANT_ID);

  // Phase 1 — create TEST fixtures (visible)
  await staffRef.set({
    staffId: TEST_STAFF_ID,
    firstname: 'V41 Test',
    lastname: 'Staff',
    name: 'V41 Test Staff',
    position: 'ที่ปรึกษา',
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  cleanup.push(staffRef);
  await doctorRef.set({
    doctorId: TEST_DOCTOR_ID,
    firstname: 'V41 Test',
    lastname: 'Doctor',
    name: 'V41 Test Doctor',
    position: 'แพทย์',
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  cleanup.push(doctorRef);
  await assistantRef.set({
    doctorId: TEST_ASSISTANT_ID,
    firstname: 'V41 Test',
    lastname: 'Assistant',
    name: 'V41 Test Assistant',
    position: 'ผู้ช่วยแพทย์',
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  cleanup.push(assistantRef);
  console.log('✓ Created 3 TEST fixtures (1 staff + 1 doctor + 1 assistant)');

  // Phase 2 — verify present in default lister query (admin-SDK direct query)
  const staffDoc = await staffRef.get();
  if (!staffDoc.exists || staffDoc.data().isHidden !== false) {
    throw new Error('Phase 2 FAIL: staff fixture not visible at write time');
  }
  console.log('✓ Phase 2: TEST staff present + isHidden=false');

  // Phase 3 — toggle isHidden=true via direct admin-SDK update + audit-stamp
  await staffRef.update({
    isHidden: true,
    hiddenAt: FieldValue.serverTimestamp(),
    hiddenBy: 'e2e-script',
    updatedAt: new Date().toISOString(),
  });
  await doctorRef.update({
    isHidden: true,
    hiddenAt: FieldValue.serverTimestamp(),
    hiddenBy: 'e2e-script',
    updatedAt: new Date().toISOString(),
  });
  await assistantRef.update({
    isHidden: true,
    hiddenAt: FieldValue.serverTimestamp(),
    hiddenBy: 'e2e-script',
    updatedAt: new Date().toISOString(),
  });
  console.log('✓ Phase 3: 3 fixtures updated to isHidden=true with audit stamps');

  // Phase 4 — verify audit fields stamped on all 3
  for (const [label, ref] of [['staff', staffRef], ['doctor', doctorRef], ['assistant', assistantRef]]) {
    const d = (await ref.get()).data();
    if (d.isHidden !== true) throw new Error(`Phase 4 FAIL ${label}: isHidden !== true`);
    if (!d.hiddenAt) throw new Error(`Phase 4 FAIL ${label}: hiddenAt missing`);
    if (d.hiddenBy !== 'e2e-script') throw new Error(`Phase 4 FAIL ${label}: hiddenBy mismatch`);
  }
  console.log('✓ Phase 4: audit stamps verified on all 3 (hiddenAt + hiddenBy present)');

  // Phase 5 — verify Firestore where-filter excludes hidden by default
  // (mirrors listStaff() default behavior — query with implicit non-hidden)
  // Using Node admin SDK we query for `where isHidden == false` to simulate.
  const visibleStaffSnap = await db.collection(`${BASE_PATH}/be_staff`)
    .where('isHidden', '==', false).get();
  const visibleDocIds = visibleStaffSnap.docs.map(d => d.id);
  if (visibleDocIds.includes(TEST_STAFF_ID)) {
    throw new Error('Phase 5 FAIL: hidden staff appears in where(isHidden==false) query');
  }
  console.log('✓ Phase 5: hidden TEST staff EXCLUDED from where(isHidden==false) query (default-filter semantic)');

  // Phase 6 — toggle back isHidden=false + clear audit stamps
  await staffRef.update({
    isHidden: false,
    hiddenAt: null,
    hiddenBy: null,
    updatedAt: new Date().toISOString(),
  });
  const restored = (await staffRef.get()).data();
  if (restored.isHidden !== false) throw new Error('Phase 6 FAIL: unhide did not stick');
  if (restored.hiddenAt !== null) throw new Error('Phase 6 FAIL: hiddenAt not cleared');
  if (restored.hiddenBy !== null) throw new Error('Phase 6 FAIL: hiddenBy not cleared');
  console.log('✓ Phase 6: unhide round-trip succeeded — audit stamps cleared');

  console.log('\n═══ ✓ E2E PASS — V41 staff/doctor hide round-trip ═══');
}

async function doCleanup() {
  console.log('\n🧹 Cleanup...');
  for (const ref of cleanup) {
    try { await ref.delete(); } catch (e) { console.log(`  ! cleanup error: ${e.message}`); }
  }
  console.log(`   ✓ ${cleanup.length} TEST fixtures cleaned`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(doCleanup)
    .then(() => process.exit(0))
    .catch(async (e) => { console.error('FATAL:', e); await doCleanup(); process.exit(1); });
}
