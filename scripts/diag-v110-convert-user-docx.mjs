// scripts/diag-v110-convert-user-docx.mjs
//
// (2026-05-23 EOD+1 — V110 verify) Re-converts the user's actual stuck .docx
// via the LIVE Cloud Function (V110-fix deployed) and downloads the resulting
// PDF for visual comparison against the prior render.
//
// Reads .tmp-docx-inspect/user-doc.docx (saved by diag-docx-font-inspect.mjs).
// Uploads to a TEST-V110-* prefix → Eventarc fires → Cloud Function runs with
// new Thai fonts + Cordia→Loma alias → PDF cached → we download it.
//
// Run: node scripts/diag-v110-convert-user-docx.mjs
// Cleanup is automatic at end (delete the TEST-prefix Storage + Firestore docs).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const TEST_BRANCH = 'TEST-V110-FONT-FIDELITY';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function main() {
  const envText = readFileSync('.env.local.prod', 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
    if (m) process.env[m[1]] = m[3];
  }
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
  const db = getFirestore();
  const bucket = getStorage().bucket();

  const localDocx = '.tmp-docx-inspect/user-doc.docx';
  if (!existsSync(localDocx)) {
    console.error(`Need ${localDocx} first. Run: node scripts/diag-docx-font-inspect.mjs`);
    process.exit(1);
  }
  const docxBuf = readFileSync(localDocx);
  console.log(`Loaded ${docxBuf.length} bytes (${(docxBuf.length/1024/1024).toFixed(2)} MB) from ${localDocx}`);

  const messageId = `TEST-V110-${Date.now()}`;
  const fileName = 'user-real-doc.docx';
  const filePath = `staff-chat-attachments/${TEST_BRANCH}/${messageId}/${fileName}`;
  const messageRef = db.doc(`artifacts/${APP_ID}/public/data/be_staff_chat_messages/${messageId}`);
  const pdfPath = filePath + '.pdf';

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  V110 verify — re-convert user docx via live Cloud Function');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  console.log(`messageId:  ${messageId}`);
  console.log(`filePath:   ${filePath}`);
  console.log(`pdfPath:    ${pdfPath}\n`);

  // 1. Write Firestore doc with attachments[] FIRST (so when Cloud Function
  //    queries, it finds the doc + the matching fullPath).
  await messageRef.set({
    id: messageId,
    branchId: TEST_BRANCH,
    displayName: 'V110 VERIFY',
    deviceId: 'diag-runner',
    text: '',
    attachments: [{
      name: fileName,
      fullUrl: `gs://${BUCKET}/${filePath}`,
      fullPath: filePath,
      size: docxBuf.length,
      mimeType: DOCX_MIME,
      pdfPreviewStatus: 'pending',
      pdfPreviewUrl: null,
      pdfPreviewError: null,
      pdfPreviewStampedAt: Date.now(),
    }],
    createdAt: FieldValue.serverTimestamp(),
    _testFixture: true,
  });
  console.log('✓ Firestore doc written at canonical path');

  // 2. Upload the docx → triggers Eventarc → Cloud Function
  await bucket.file(filePath).save(docxBuf, { contentType: DOCX_MIME });
  console.log('✓ Uploaded .docx to Storage → Eventarc should fire now');
  console.log('  Polling Firestore for status=ready...\n');

  // 3. Poll for status flip
  const TIMEOUT = 180_000;     // 3 min — covers cold start + LibreOffice
  const POLL = 2_000;
  const t0 = Date.now();
  let status = 'pending';
  let pdfUrl = null;
  while (Date.now() - t0 < TIMEOUT) {
    const snap = await messageRef.get();
    const att = (snap.data()?.attachments || [])[0];
    if (att?.pdfPreviewStatus === 'ready') {
      status = 'ready';
      pdfUrl = att.pdfPreviewUrl;
      break;
    }
    if (att?.pdfPreviewStatus === 'failed') {
      status = 'failed';
      console.log(`  ✗ status=failed: ${att.pdfPreviewError}`);
      break;
    }
    const elapsed = Math.round((Date.now() - t0) / 1000);
    process.stdout.write(`  t+${elapsed}s status=${att?.pdfPreviewStatus || '(none)'}  \r`);
    await new Promise(r => setTimeout(r, POLL));
  }
  const totalSec = Math.round((Date.now() - t0) / 1000);
  console.log(`\n  Final status: ${status} in ${totalSec}s\n`);

  // 4. Download the cached PDF
  if (status === 'ready') {
    const [pdfExists] = await bucket.file(pdfPath).exists();
    if (pdfExists) {
      const [meta] = await bucket.file(pdfPath).getMetadata();
      console.log(`✓ PDF cached: ${meta.size} bytes, contentType=${meta.contentType}`);
      const outLocal = `.tmp-docx-inspect/v110-result.pdf`;
      await bucket.file(pdfPath).download({ destination: outLocal });
      console.log(`✓ Downloaded to ${outLocal}\n`);
      if (pdfUrl) console.log(`Token URL (works in browser):\n  ${pdfUrl}\n`);
    } else {
      console.log('✗ PDF NOT in Storage despite status=ready (race?)');
    }
  }

  // 5. Cleanup (skip when --keep flag passed so the URL stays valid for user inspection)
  const KEEP = process.argv.includes('--keep');
  if (!KEEP) {
    console.log('Cleaning up TEST- fixture...');
    const [files] = await bucket.getFiles({ prefix: `staff-chat-attachments/${TEST_BRANCH}/${messageId}/` });
    for (const f of files) await f.delete().catch(() => {});
    await messageRef.delete().catch(() => {});
    console.log(`✓ Deleted ${files.length} Storage objects + Firestore doc`);
  } else {
    console.log('--keep specified — TEST fixture preserved for inspection');
    console.log(`  Delete later: node scripts/diag-cleanup-test-v110.mjs ${messageId}`);
  }

  process.exit(status === 'ready' ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
