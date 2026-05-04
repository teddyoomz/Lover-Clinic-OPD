// ─── Audit fix-up — write the audit doc that staff-doctors-branch-baseline
// failed to write (empty-string key in summary map; Firestore rejects).
// Verify-after pass: re-read be_staff + be_doctors, confirm all docs have
// branchIds = [NAKHON_ID].

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

const APP_ID = 'loverclinic-opd-4c39b';
const NAKHON_ID = 'BR-1777873556815-26df6480';

const app = initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);
const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function bucketsAfter(col) {
  const snap = await data.collection(col).get();
  const counts = {};
  let exactNakhon = 0;
  let other = 0;
  for (const d of snap.docs) {
    const dt = d.data();
    if (Array.isArray(dt.branchIds) && dt.branchIds.length === 1 && dt.branchIds[0] === NAKHON_ID) {
      exactNakhon++;
    } else {
      other++;
    }
  }
  return { total: snap.size, exactNakhon, other };
}

async function main() {
  const ts = new Date().toISOString();
  const result = {};
  for (const col of ['be_staff', 'be_doctors']) {
    result[col] = await bucketsAfter(col);
    console.log(col, result[col]);
  }

  const auditId = `staff-doctors-branch-baseline-${Date.now()}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    type: 'staff-doctors-branch-baseline',
    targetBranchIds: [NAKHON_ID],
    rule: 'every be_staff + be_doctors → branchIds = [นครราชสีมา]; debug baseline (BSA verification)',
    summary: result,
    callerEmail: 'admin-script-2026-05-04-debug',
    callerUid: 'admin-script',
    createdAt: ts,
    note: 'previous run completed migration but audit-doc write failed with empty-string key; this fix-up audit replaces it',
  });
  console.log(`Audit: be_admin_audit/${auditId}`);

  const allOk = Object.values(result).every(r => r.other === 0);
  console.log(`allOk=${allOk}`);
  process.exit(allOk ? 0 : 2);
}
main().catch(e => { console.error(e); process.exit(1); });
