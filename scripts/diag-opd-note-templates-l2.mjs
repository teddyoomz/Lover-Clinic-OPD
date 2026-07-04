// scripts/diag-opd-note-templates-l2.mjs — OPD note templates (2026-07-05,
// probe #19) Rule Q L2 verify. REAL CLIENT SDK issuing the EXACT per-branch
// query the UI issues (where branchId ==) + REAL normalize helper (no fixture
// divergence — V66/V109 lesson).
//
// Dual-mode (rules ship with the feature commit but deploy later — V18):
//   PRE-deploy : staff create → PERMISSION_DENIED = expected (collection
//                default-deny; menu degrades to built-ins, never blocks)
//   POST-deploy: create at ทดลอง 1 → SUCCESS; list(ทดลอง 1) sees it;
//                list(นครราชสีมา) does NOT (cross-branch isolation); edit →
//                read-back carries the new content; delete → gone (zero
//                orphans). TEST-OPDT- prefix per V33 discipline.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, collection, query, where, getDocs, setDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { normalizeOpdNoteTemplate, validateOpdNoteTemplate } from '../src/lib/opdNoteTemplateValidation.js';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5';   // ทดลอง 1
const OTHER_BRANCH_ID = 'BR-1777873556815-26df6480';  // นครราชสีมา (isolation check)

const app = initializeApp({ apiKey: FIREBASE_API_KEY, authDomain: `${APP_ID}.firebaseapp.com`, projectId: APP_ID });
const auth = getAuth(app);
const db = getFirestore(app);

const PASS = (m) => console.log(`  ✓ ${m}`);
const FAIL = (m) => { console.log(`  ✗ FAIL: ${m}`); process.exitCode = 1; };
const INFO = (m) => console.log(`  · ${m}`);

const COL = `artifacts/${APP_ID}/public/data/be_opd_note_templates`;
const isDenied = (e) => (e && (e.code === 'permission-denied' || /permission/i.test(e.message || '')));

// EXACT query shape the UI issues (listOpdNoteTemplates → where branchId ==)
async function listByBranch(branchId) {
  const q = query(collection(db, COL), where('branchId', '==', String(branchId)));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

// Mirror of saveOpdNoteTemplate's persisted shape, through the REAL normalizer.
function buildDocPayload(id, { name, content, branchId, createdAt, createdBy }) {
  const normalized = normalizeOpdNoteTemplate({ name, content });
  const fail = validateOpdNoteTemplate(normalized);
  if (fail) throw new Error(fail[1]);
  const now = new Date().toISOString();
  return {
    ...normalized,
    branchId,
    templateId: id,
    createdAt: createdAt || now,
    createdBy: createdBy || auth.currentUser?.uid || '',
    updatedAt: now,
    updatedBy: auth.currentUser?.uid || '',
  };
}

async function main() {
  console.log('=== OPD note templates Rule Q L2 (probe #19) — real client SDK, real prod ===');
  await signInWithEmailAndPassword(auth, 'loverclinic@loverclinic.com', 'Lover2024');
  PASS('signed in as staff');

  const ts = Date.now();
  const id = `TEST-OPDT-${ts}`;
  let deployed = false;

  // 1) staff create at ทดลอง 1
  try {
    await setDoc(doc(db, COL, id), buildDocPayload(id, {
      name: `L2 ทดสอบ ${ts}`,
      content: 'หัวข้อ L2\n-รายการ\t: ____ นาที\n-สถานะ : ไม่มี/มี',
      branchId: TEST_BRANCH_ID,
    }), { merge: false });
    deployed = true;
    PASS(`POST-DEPLOY mode: staff template CREATED (${id})`);
  } catch (e) {
    if (isDenied(e)) {
      PASS('PRE-DEPLOY mode: create DENIED as expected (rules not yet deployed — menu degrades to built-ins, never blocks)');
    } else {
      FAIL(`unexpected error on create: ${e.code || e.message}`);
    }
  }

  if (deployed) {
    // 2) EXACT UI query — ทดลอง 1 sees the doc
    const mine = await listByBranch(TEST_BRANCH_ID);
    const found = mine.find(t => t.id === id);
    if (found) PASS(`list(ทดลอง 1) sees the template (${mine.length} doc(s) in branch)`);
    else FAIL('list(ทดลอง 1) does NOT see the created template');
    if (found && found.content === 'หัวข้อ L2\n-รายการ\t: ____ นาที\n-สถานะ : ไม่มี/มี') {
      PASS('content round-trips verbatim (tabs + Thai preserved)');
    } else if (found) {
      FAIL(`content mismatch after round-trip: ${JSON.stringify(found.content)}`);
    }

    // 3) cross-branch isolation — นครราชสีมา must NOT see it
    const theirs = await listByBranch(OTHER_BRANCH_ID);
    if (theirs.some(t => t.id === id)) FAIL('CROSS-BRANCH LEAK: นครราชสีมา sees ทดลอง 1 template');
    else PASS('cross-branch isolation holds (นครราชสีมา does not see it)');

    // 4) edit (same id, new content, preserved createdAt) → read-back has new content
    const before = found || {};
    await setDoc(doc(db, COL, id), buildDocPayload(id, {
      name: `L2 ทดสอบ ${ts} v2`,
      content: 'เนื้อหาแก้ไขแล้ว : __',
      branchId: TEST_BRANCH_ID,
      createdAt: before.createdAt,
      createdBy: before.createdBy,
    }), { merge: false });
    const afterEdit = (await listByBranch(TEST_BRANCH_ID)).find(t => t.id === id);
    if (afterEdit?.content === 'เนื้อหาแก้ไขแล้ว : __' && afterEdit?.name === `L2 ทดสอบ ${ts} v2`) {
      PASS('edit effect is REAL — read-back carries the new name+content');
    } else {
      FAIL(`edit did not take effect: ${JSON.stringify(afterEdit?.content)}`);
    }
    if (afterEdit?.createdAt === before.createdAt) PASS('createdAt preserved through edit');
    else FAIL('createdAt was clobbered by edit');

    // 5) delete → gone from the UI query (zero orphans)
    await deleteDoc(doc(db, COL, id));
    const afterDelete = (await listByBranch(TEST_BRANCH_ID)).find(t => t.id === id);
    if (afterDelete) FAIL('delete did not take effect — orphan TEST doc remains');
    else PASS('delete effect is REAL — template gone from the branch list (zero orphans)');
  }

  console.log(process.exitCode === 1
    ? '\n⚠️  OPD-templates L2: at least one FAIL'
    : `\n✅ OPD-templates L2: ALL PASS (${deployed ? 'post-deploy' : 'pre-deploy'} mode)`);
  process.exit(process.exitCode || 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
