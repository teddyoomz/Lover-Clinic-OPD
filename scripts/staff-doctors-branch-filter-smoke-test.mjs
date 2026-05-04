// ─── Smoke test — filterStaffByBranch / filterDoctorsByBranch ───────────
// Verifies that after staff-doctors-branch-baseline migration, switching
// the selected branch filters correctly:
//   - branch=นครราชสีมา → all staff/doctors visible
//   - branch=พระราม 3 → 0 staff/doctors visible
//   - branch=<unknown> → 0 visible
// If any branch unexpectedly shows staff/doctors → BSA filter bug.

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
import { getFirestore } from 'firebase-admin/firestore';
import { filterStaffByBranch, filterDoctorsByBranch } from '../src/lib/branchScopeUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';

const app = initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);
const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function fetchAll(col) {
  const snap = await data.collection(col).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function main() {
  const staff = await fetchAll('be_staff');
  const doctors = await fetchAll('be_doctors');
  const branches = await fetchAll('be_branches');

  console.log(`be_staff total: ${staff.length}`);
  console.log(`be_doctors total: ${doctors.length}`);
  console.log(`be_branches total: ${branches.length}`);
  console.log('');
  console.log('Branches:');
  for (const b of branches) {
    console.log(`  ${b.id}  branchId=${b.branchId || '(none)'}  name=${b.name || ''}  isDefault=${!!b.isDefault}`);
  }
  console.log('');

  // Smoke per-branch
  const failures = [];
  for (const b of branches) {
    const branchId = b.branchId || b.id;
    const staffFiltered = filterStaffByBranch(staff, branchId);
    const doctorsFiltered = filterDoctorsByBranch(doctors, branchId);
    const isNakhon = branchId === 'BR-1777873556815-26df6480';
    console.log(`Branch "${b.name}" (${branchId}):`);
    console.log(`  staff visible: ${staffFiltered.length}/${staff.length}`);
    console.log(`  doctor visible: ${doctorsFiltered.length}/${doctors.length}`);
    if (isNakhon) {
      if (staffFiltered.length !== staff.length || doctorsFiltered.length !== doctors.length) {
        failures.push(`Nakhon should show ALL but only ${staffFiltered.length}/${staff.length} staff, ${doctorsFiltered.length}/${doctors.length} doctors`);
      }
    } else {
      if (staffFiltered.length > 0 || doctorsFiltered.length > 0) {
        failures.push(`Branch ${b.name} (${branchId}) should show 0 but showed ${staffFiltered.length} staff, ${doctorsFiltered.length} doctors — BSA FILTER LEAK`);
      }
    }
  }

  // Defensive: unknown branchId
  console.log('');
  console.log('Defensive — unknown branchId "BR-DOES-NOT-EXIST":');
  const sUnk = filterStaffByBranch(staff, 'BR-DOES-NOT-EXIST');
  const dUnk = filterDoctorsByBranch(doctors, 'BR-DOES-NOT-EXIST');
  console.log(`  staff visible: ${sUnk.length}/${staff.length}`);
  console.log(`  doctor visible: ${dUnk.length}/${doctors.length}`);
  if (sUnk.length > 0 || dUnk.length > 0) {
    failures.push(`Unknown branch should show 0 but showed ${sUnk.length} staff, ${dUnk.length} doctors`);
  }

  console.log('');
  if (failures.length === 0) {
    console.log('=== SMOKE OK ===');
    console.log('Filter behaves correctly:');
    console.log('  - นครราชสีมา → all staff/doctors visible');
    console.log('  - other branches → 0 visible');
    console.log('  - unknown branchId → 0 visible');
    process.exit(0);
  } else {
    console.log('=== SMOKE FAILED ===');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(2);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
