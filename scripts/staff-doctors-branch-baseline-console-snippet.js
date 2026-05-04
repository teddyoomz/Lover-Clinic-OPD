// ─── In-page console snippet — staff + doctors branchIds = [นครราชสีมา] ───
// 2026-05-04 — paste this into DevTools console while logged in as admin
// on https://lover-clinic-app.vercel.app/ (or localhost dev server pointing
// at prod Firestore). Uses the already-loaded firebase modular SDK.
//
// What it does:
//   1. Lists all be_staff + be_doctors via Firestore SDK
//   2. For each doc: updateDoc({ branchIds: ['BR-1777873556815-26df6480'],
//                                _branchIdsBaselineMigratedAt: <ISO>,
//                                _branchIdsBaselineMigratedBy: 'console-snippet' })
//   3. Logs BEFORE / AFTER bucket distributions for sanity check
//   4. Writes audit doc be_admin_audit/staff-doctors-branch-baseline-<ts>
//
// Auth: relies on Firestore rule allowing isClinicStaff() to write be_staff
// + be_doctors. Caller must be logged in with admin / clinic-staff claim.
// Audit doc write: be_admin_audit allows admin via narrow rule.
//
// Verification: after run, switch BranchSelector top-right to "พระราม 3".
// Open StaffTab / DoctorsTab / TreatmentForm. Staff/doctor pickers should
// be EMPTY (no one has BR-RAMA3 in branchIds[]). Switch back to นครราชสีมา
// → all visible. If RAMA3 view shows ANY staff/doctor, that's a BSA bug.

(async () => {
  const { collection, doc, getDocs, getFirestore, setDoc, updateDoc, writeBatch } =
    await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
  // Use the already-initialized app — same one the React app uses
  const firebase = (await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'));
  const db = getFirestore(firebase.getApp());

  const APP_ID = 'loverclinic-opd-4c39b';
  const NAKHON_ID = 'BR-1777873556815-26df6480';
  const TARGET_BRANCHIDS = [NAKHON_ID];
  const COLLECTIONS = ['be_staff', 'be_doctors'];
  const ts = new Date().toISOString();

  const dataPath = (col) => collection(db, 'artifacts', APP_ID, 'public', 'data', col);

  const summary = {};

  for (const col of COLLECTIONS) {
    console.log(`%c=== ${col} ===`, 'font-weight:bold;color:#0aa');
    const snap = await getDocs(dataPath(col));
    if (snap.empty) {
      summary[col] = { total: 0, migrated: 0, before: {}, after: null, allMigrated: true };
      console.log(`  empty`);
      continue;
    }

    // BEFORE
    const before = {};
    for (const d of snap.docs) {
      const dt = d.data();
      const k = Array.isArray(dt.branchIds) ? [...dt.branchIds].sort().join('|') : '<missing>';
      before[k] = (before[k] || 0) + 1;
    }
    console.log(`  BEFORE buckets:`, before);

    // APPLY (writeBatch — chunk 500)
    let batch = writeBatch(db);
    let inBatch = 0;
    let total = 0;
    for (const d of snap.docs) {
      batch.update(d.ref, {
        branchIds: TARGET_BRANCHIDS,
        _branchIdsBaselineMigratedAt: ts,
        _branchIdsBaselineMigratedBy: 'console-snippet-2026-05-04-debug-baseline',
      });
      inBatch++;
      total++;
      if (inBatch >= 500) {
        await batch.commit();
        batch = writeBatch(db);
        inBatch = 0;
      }
    }
    if (inBatch > 0) await batch.commit();
    console.log(`  migrated ${total}/${snap.size}`);

    // AFTER
    const snap2 = await getDocs(dataPath(col));
    const after = {};
    for (const d of snap2.docs) {
      const dt = d.data();
      const k = Array.isArray(dt.branchIds) ? [...dt.branchIds].sort().join('|') : '<missing>';
      after[k] = (after[k] || 0) + 1;
    }
    const keys = Object.keys(after);
    const allMigrated = keys.length === 1 && keys[0] === NAKHON_ID;
    console.log(`  AFTER buckets:`, after, `→ allMigrated=`, allMigrated);

    summary[col] = { total: snap.size, migrated: total, before, after, allMigrated };
  }

  // Audit doc
  const auditId = `staff-doctors-branch-baseline-${Date.now()}`;
  await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'be_admin_audit', auditId), {
    type: 'staff-doctors-branch-baseline',
    targetBranchIds: TARGET_BRANCHIDS,
    rule: 'every be_staff + be_doctors → branchIds = [นครราชสีมา]; debug baseline (BSA verification)',
    summary,
    callerEmail: '<console-snippet — caller is the logged-in admin>',
    createdAt: ts,
  });
  console.log(`%cAudit: be_admin_audit/${auditId}`, 'color:#0aa');

  const totalMigrated = Object.values(summary).reduce((a, r) => a + (r.migrated || 0), 0);
  const allOk = COLLECTIONS.every(c => summary[c]?.allMigrated === true);
  console.log(`%c=== ${totalMigrated} docs migrated. allMigrated=${allOk} ===`, 'font-weight:bold;color:' + (allOk ? '#0a0' : '#a00'));

  // Final smoke check: switch to RAMA3 and assert BSA filters them out
  console.log('');
  console.log('%cNEXT STEPS — manual verify:', 'font-weight:bold;color:#06c');
  console.log('1. Click top-right BranchSelector → switch to "พระราม 3"');
  console.log('2. Open StaffTab + DoctorsTab + TreatmentForm assistant picker');
  console.log('3. EXPECTED: empty lists (no one has BR-RAMA3 in branchIds[])');
  console.log('4. If any staff/doctor shows up there = BSA filter bug. Report it.');
  console.log('5. Switch back to "นครราชสีมา" → all visible (sanity check).');
})();
