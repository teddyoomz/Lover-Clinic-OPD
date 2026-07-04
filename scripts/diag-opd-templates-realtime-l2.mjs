// scripts/diag-opd-templates-realtime-l2.mjs — Rule Q L2 for the REALTIME
// template dropdown (2026-07-05, user directive: "แสดงผลการเปลี่ยนแปลงทันที").
// REAL CLIENT SDK subscribes the EXACT listener query the menu uses
// (where branchId ==, onSnapshot); the admin SDK then creates → edits →
// deletes a TEST-OPDT doc and we assert the client snapshot fires with the
// change each time (create appears / edit's new name appears / delete gone)
// WITHOUT re-subscribing — proving the no-refresh contract on real prod.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5'; // ทดลอง 1

const app = initializeApp({ apiKey: FIREBASE_API_KEY, authDomain: `${APP_ID}.firebaseapp.com`, projectId: APP_ID });
const auth = getAuth(app);
const db = getFirestore(app);

const PASS = (m) => console.log(`  ✓ ${m}`);
const FAIL = (m) => { console.log(`  ✗ FAIL: ${m}`); process.exitCode = 1; };

const COL = `artifacts/${APP_ID}/public/data/be_opd_note_templates`;

function waitForSnapshot(predicate, label, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, label }), timeoutMs);
    check.pending.push({ predicate, resolve: (items) => { clearTimeout(t); resolve({ ok: true, items }); } });
    // re-check against the latest snapshot immediately (may already satisfy)
    if (check.latest && predicate(check.latest)) {
      clearTimeout(t);
      const p = check.pending.pop();
      p.resolve(check.latest);
    }
  });
}
const check = { latest: null, pending: [] };

async function main() {
  console.log('=== OPD templates REALTIME Rule Q L2 — real client listener, real prod ===');
  await signInWithEmailAndPassword(auth, 'loverclinic@loverclinic.com', 'Lover2024');
  PASS('signed in as staff');

  // EXACT query the menu's listener issues
  const q = query(collection(db, COL), where('branchId', '==', TEST_BRANCH_ID));
  let snapshotCount = 0;
  const unsub = onSnapshot(q, (snap) => {
    snapshotCount += 1;
    const items = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    check.latest = items;
    for (let i = check.pending.length - 1; i >= 0; i--) {
      if (check.pending[i].predicate(items)) {
        const p = check.pending.splice(i, 1)[0];
        p.resolve(items);
      }
    }
  }, (e) => FAIL(`listener error: ${e.code || e.message}`));

  // admin SDK for the mutation side (a DIFFERENT writer — proves cross-client realtime)
  const { initializeApp: adminInit, cert } = await import('firebase-admin/app');
  const { getFirestore: adminFs } = await import('firebase-admin/firestore');
  const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  const adminApp = adminInit({
    credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: key }),
  }, `rt-${Date.now()}`);
  const adb = adminFs(adminApp);

  const ts = Date.now();
  const id = `TEST-OPDT-RT-${ts}`;
  const docRef = adb.doc(`${COL}/${id}`);

  // 1) initial snapshot
  const init = await waitForSnapshot(() => true, 'initial snapshot');
  init.ok ? PASS(`initial snapshot fired (${(init.items || []).length} docs in branch)`) : FAIL('initial snapshot never fired');

  // 2) CREATE from another writer → appears without re-subscribe
  await docRef.set({
    name: `RT ทดสอบ ${ts}`, content: 'realtime : __', branchId: TEST_BRANCH_ID,
    templateId: id, createdAt: new Date().toISOString(), createdBy: 'rt-admin',
    updatedAt: new Date().toISOString(), updatedBy: 'rt-admin',
  });
  const created = await waitForSnapshot(items => items.some(t => t.id === id), 'create');
  created.ok ? PASS('CREATE appeared in the live snapshot (no refresh, no re-open)') : FAIL('create never appeared');

  // 3) EDIT → new name appears
  await docRef.update({ name: `RT ทดสอบ ${ts} v2`, updatedAt: new Date().toISOString() });
  const edited = await waitForSnapshot(items => items.some(t => t.id === id && t.name === `RT ทดสอบ ${ts} v2`), 'edit');
  edited.ok ? PASS('EDIT appeared live (new name in the same subscription)') : FAIL('edit never appeared');

  // 4) DELETE → gone
  await docRef.delete();
  const deleted = await waitForSnapshot(items => !items.some(t => t.id === id), 'delete');
  deleted.ok ? PASS('DELETE removed the row live (zero orphans)') : FAIL('delete never propagated');

  PASS(`total snapshots on ONE subscription: ${snapshotCount} (≥4 = init+create+edit+delete)`);
  if (snapshotCount < 4) FAIL('snapshot count < 4 — some mutation did not stream');

  unsub();
  console.log(process.exitCode === 1 ? '\n⚠️  REALTIME L2: at least one FAIL' : '\n✅ REALTIME L2: ALL PASS');
  process.exit(process.exitCode || 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
