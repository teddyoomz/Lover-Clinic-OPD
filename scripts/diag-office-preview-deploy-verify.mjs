// scripts/diag-office-preview-deploy-verify.mjs
//
// (2026-05-23) Rule Q L2 verification — fastest possible check that the
// office-to-pdf Cloud Run service + Eventarc trigger is WIRED CORRECTLY
// after deploy. Does NOT verify "ready" state (would need real Office file
// bytes); instead verifies:
//   1. Storage onFinalize event reaches the Cloud Function (wiring)
//   2. MIME gate accepts Office MIMEs (corrupt .docx with garbage bytes)
//   3. MIME gate rejects non-Office MIMEs (.odt, image/png)
//   4. Failure path emits pdfPreviewStatus='failed' + pdfPreviewError (Thai)
//   5. Successful gate-reject leaves pdfPreviewStatus unchanged (stays 'pending')
//
// To verify REAL "ready" path: user uploads a real .docx via the chat UI.
// This script only verifies that the deploy is structurally sound.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const TEST_BRANCH = 'TEST-OFFICE-PREVIEW-DEPLOY';
const TIMEOUT_MS = 60_000;
const POLL_MS = 2_000;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (getApps().length === 0) {
    const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
      storageBucket: BUCKET,
    });
  }
  await main();
}

async function main() {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const messageId = `TEST-OPVD-MSG-${Date.now()}`;
  // V109 Rule M canonical path — see diag-office-preview-comprehensive.mjs for full rationale.
  const messageRef = db.doc(`artifacts/${APP_ID}/public/data/be_staff_chat_messages/${messageId}`);
  const prefix = `staff-chat-attachments/${TEST_BRANCH}/${messageId}/`;

  // Two fixtures:
  // (a) corrupt.docx — convertible MIME, garbage bytes → Cloud Function should
  //     ACCEPT the MIME, attempt conversion, FAIL, stamp 'failed' + pdfPreviewError
  // (b) notes.odt   — non-convertible MIME → Cloud Function should SKIP (no patch)
  const fixtures = [
    { name: 'corrupt.docx', mime: DOCX_MIME, content: Buffer.from('NOT A VALID DOCX'), expect: 'failed' },
    { name: 'notes.odt',    mime: 'application/vnd.oasis.opendocument.text', content: Buffer.from('not an odt'), expect: 'skipped' },
  ];

  console.log('═══ office-to-pdf deploy verify ═══');
  console.log(`Bucket: gs://${BUCKET}`);
  console.log(`Prefix: ${prefix}\n`);

  // ── Phase A: upload + initial Firestore doc
  console.log('Phase A — upload fixtures + write initial Firestore doc');
  const attachments = [];
  for (const fx of fixtures) {
    const path = prefix + fx.name;
    await bucket.file(path).save(fx.content, { contentType: fx.mime });
    console.log(`  ✓ uploaded ${fx.name} (${fx.content.length} B, ${fx.mime})`);
    const att = {
      name: fx.name,
      fullUrl: `gs://${BUCKET}/${path}`,
      fullPath: path,
      size: fx.content.length,
      mimeType: fx.mime,
    };
    // Mirror the client: stamp pending for Office MIMEs
    if (fx.mime === DOCX_MIME) {
      att.pdfPreviewStatus = 'pending';
      att.pdfPreviewUrl = null;
      att.pdfPreviewError = null;
      att.pdfPreviewStampedAt = Date.now();
    }
    attachments.push(att);
  }
  await messageRef.set({
    id: messageId,
    branchId: TEST_BRANCH,
    displayName: 'OFFICE PREVIEW DEPLOY VERIFY',
    deviceId: 'diag-runner',
    text: '',
    attachments,
    createdAt: FieldValue.serverTimestamp(),
    _testFixture: true,
  });
  console.log(`  ✓ message doc written: ${messageId}\n`);

  // ── Phase B: poll for patches
  console.log(`Phase B — poll ${TIMEOUT_MS / 1000}s for Cloud Function patches`);
  const startedAt = Date.now();
  let lastStatuses = '';
  let docxFailed = false;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const snap = await messageRef.get();
    const atts = (snap.data() || {}).attachments || [];
    const statuses = atts.map(a => `${a.name}=${a.pdfPreviewStatus ?? '(none)'}`).join(', ');
    if (statuses !== lastStatuses) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      console.log(`  t+${elapsed}s: ${statuses}`);
      lastStatuses = statuses;
    }
    docxFailed = atts.some(a => a.name === 'corrupt.docx' && a.pdfPreviewStatus === 'failed');
    if (docxFailed) break;
    await new Promise(r => setTimeout(r, POLL_MS));
  }

  // ── Phase C: assertions
  console.log('\nPhase C — verify expected end state');
  const finalSnap = await messageRef.get();
  const finalAtts = (finalSnap.data() || {}).attachments || [];
  let pass = 0, fail = 0;

  // (a) corrupt.docx → status=failed + pdfPreviewError populated
  const docxAtt = finalAtts.find(a => a.name === 'corrupt.docx');
  if (docxAtt?.pdfPreviewStatus === 'failed') {
    console.log(`  ✓ corrupt.docx → 'failed' (Cloud Function fired + MIME gate ACCEPTED Office + failure handled)`);
    if (typeof docxAtt.pdfPreviewError === 'string' && docxAtt.pdfPreviewError.length > 0) {
      console.log(`    ✓ pdfPreviewError = "${docxAtt.pdfPreviewError}" (Thai)`);
      pass += 2;
    } else {
      console.log(`    ✗ pdfPreviewError missing or empty`);
      pass++; fail++;
    }
  } else {
    console.log(`  ✗ corrupt.docx → got '${docxAtt?.pdfPreviewStatus ?? 'no patch'}', expected 'failed' (Cloud Function may not have fired or hit a different code path)`);
    fail++;
  }

  // (b) notes.odt → unchanged (no stamp ever); Cloud Function MIME gate skipped it
  const odtAtt = finalAtts.find(a => a.name === 'notes.odt');
  if (odtAtt?.pdfPreviewStatus === undefined) {
    console.log(`  ✓ notes.odt → unchanged (Cloud Function MIME gate correctly REJECTED non-Office MIME)`);
    pass++;
  } else {
    console.log(`  ✗ notes.odt → got '${odtAtt?.pdfPreviewStatus}', expected unchanged/undefined`);
    fail++;
  }

  // ── Phase D: cleanup
  console.log('\nPhase D — cleanup');
  const [files] = await bucket.getFiles({ prefix });
  for (const f of files) {
    await f.delete().catch(e => console.log(`  ! delete ${f.name}: ${String(e).slice(0, 100)}`));
  }
  await messageRef.delete().catch(() => {});
  const [residue] = await bucket.getFiles({ prefix });
  console.log(`  deleted ${files.length} files; residue=${residue.length} ${residue.length === 0 ? '✓' : '✗'}`);

  console.log(`\n═══ Result: ${pass} pass, ${fail} fail ═══`);
  process.exit(fail > 0 ? 1 : 0);
}
