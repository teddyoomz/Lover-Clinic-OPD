// Rule M — nuke TEST junk recall data the user can't delete in-app.
//   - be_recall_cases  docId startsWith "TEST-CASE-"  (TEST-CASE-PHASE2922-RB1-PRP-7d, RB3-Acne-21d, …)
//   - be_recalls       docId startsWith "TEST-" | "E2E-"  (junk recall instances)
// Two-phase: DRY-RUN by default; deletes only with --apply. Idempotent (re-run = 0).
// Admin SDK (bypasses rules) + canonical path + audit doc. (The in-app "ลบเคส"
// button is fixed separately by the firestore.rules be_recall_cases delete-narrow;
// this is the one-shot cleanup of the existing junk.)
// Usage: node scripts/nuke-test-recall-cases.mjs [--apply]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const data = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

// Pure helper (also unit-tested) — is this doc-id a TEST/E2E junk id for this collection?
export function isJunkRecallId(collection, id) {
  const s = String(id || '');
  if (collection === 'be_recall_cases') return s.startsWith('TEST-CASE-') || s.startsWith('TEST-') || s.startsWith('E2E-');
  if (collection === 'be_recalls') return s.startsWith('TEST-') || s.startsWith('E2E-');
  return false;
}

async function nukeCollection(name) {
  const snap = await data().collection(name).get();
  const victims = snap.docs.filter((d) => isJunkRecallId(name, d.id));
  const sample = victims.slice(0, 8).map((d) => d.id);
  if (APPLY) {
    // Chunk deletes (batch cap 500).
    for (let i = 0; i < victims.length; i += 450) {
      const batch = db.batch();
      for (const d of victims.slice(i, i + 450)) batch.delete(d.ref);
      await batch.commit();
    }
  }
  return { scanned: snap.size, deleted: victims.length, sample };
}

async function main() {
  console.log(`═══ nuke TEST recall junk — ${APPLY ? 'APPLY' : 'DRY-RUN'} ═══`);
  const cases = await nukeCollection('be_recall_cases');
  const recalls = await nukeCollection('be_recalls');
  console.log(`be_recall_cases: scanned ${cases.scanned} | junk ${cases.deleted}`);
  cases.sample.forEach((s) => console.log('   ', s));
  console.log(`be_recalls:      scanned ${recalls.scanned} | junk ${recalls.deleted}`);
  recalls.sample.forEach((s) => console.log('   ', s));
  if (APPLY) {
    const auditId = `nuke-test-recall-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await data().collection('be_admin_audit').doc(auditId).set({
      op: 'nuke-test-recall-cases',
      recallCasesDeleted: cases.deleted, recallCasesSample: cases.sample,
      recallsDeleted: recalls.deleted, recallsSample: recalls.sample,
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log('audit:', 'be_admin_audit/' + auditId);
  } else {
    console.log('(dry-run — re-run with --apply to delete)');
  }
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
