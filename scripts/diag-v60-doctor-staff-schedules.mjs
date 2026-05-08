#!/usr/bin/env node
// V60 diagnostic: read be_staff_schedules for the selected doctor in the
// failing schedule link's branch — verify whether be_staff_schedules has
// May 2026 working entries (architectural fix viability check).
//
// Read-only — no writes.
//
// Run: node --env-file=.env.local.prod scripts/diag-v60-doctor-staff-schedules.mjs

import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID    = 'loverclinic-opd-4c39b';
const BRANCH_ID = 'BR-1777873556815-26df6480';
const DOCTOR_ID = 'DOC-mov2p9c0-a79c20370455d9f9';

async function main() {
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
  const db = getFirestore();
  const col = db.collection(`artifacts/${APP_ID}/public/data/be_staff_schedules`);
  const snap = await col
    .where('branchId', '==', BRANCH_ID)
    .where('staffId', '==', DOCTOR_ID)
    .get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Also pull all branch-scoped staff_schedules (no doctor filter) to gauge
  // overall data presence in this branch.
  const branchSnap = await col.where('branchId', '==', BRANCH_ID).get();
  const branchAll = branchSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const out = {
    docCountForDoctor: all.length,
    docCountForBranch: branchAll.length,
    distinctStaffInBranch: [...new Set(branchAll.map(e => e.staffId))],
    typesForDoctor: [...new Set(all.map(e => e.type))],
    recurringForDoctor: all.filter(e => e.type === 'recurring').map(e => ({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
      startTime: e.startTime,
      endTime: e.endTime,
      roomIds: e.roomIds,
    })),
    perDateForDoctor: all.filter(e => e.type !== 'recurring').map(e => ({
      id: e.id,
      type: e.type,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      roomIds: e.roomIds,
    })).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
  };
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('Diag failed:', e.message); process.exit(1); });
}
