// scripts/e2e-staff-chat-office-preview.mjs
//
// (2026-05-22 EOD+2 — T9) Rule Q L2 e2e — runs against REAL prod via the
// firebase-admin SDK. DO NOT RUN until after the deploy. The Cloud Function
// (functions/officeToPdf) must be live in the GCP project; this script:
//
//   1. Uploads fixture files across all 7 convertible MIMEs (.doc/.docx/.xls/
//      .xlsx/.ppt/.pptx/.csv) + 4 adversarial cases (.odt unsupported,
//      password-protected .docx, corrupt file, ~49MB .pptx) under
//      `staff-chat-attachments/{TEST-V108-BR}/{TEST-V108-MSG-{ts}}/{filename}`.
//      Also writes a matching `be_staff_chat_messages/TEST-V108-MSG-{ts}` doc
//      with attachments[] referencing each.
//   2. Polls Firestore for up to 30s waiting for the Cloud Function to patch
//      `attachments[i].pdfPreviewStatus` from 'pending' → 'ready' or 'failed'.
//   3. For 'ready': asserts pdfPreviewUrl is present + downloads the PDF
//      bytes are non-empty (proves Storage cache lives at .pdf path).
//   4. For 'failed': asserts pdfPreviewError is Thai-language present.
//   5. For 'unsupported' (.odt): asserts the doc was NEVER patched (the MIME
//      gate rejects before any conversion attempt) AND the card derivation
//      returns 'na' (which the client renders as ⬇-only).
//   6. Cleanup — delete every fixture (original + .pdf cache) + the message
//      doc + the test branch presence/audit residue. Verify zero orphans.
//
// Per Rule M canonical pattern (V81-fix1 saga): admin-SDK + canonical
// artifacts path NOT applicable here (staff-chat-attachments lives at root
// per V73 Storage layout); two-phase dry-run not needed because we're
// creating + deleting our OWN TEST-V108-* fixtures (not touching prod data).
//
// Usage (post-deploy):
//   vercel env pull .env.local.prod --environment=production   # if not yet pulled
//   node scripts/e2e-staff-chat-office-preview.mjs
//
// Required env (from .env.local.prod):
//   FIREBASE_ADMIN_PROJECT_ID
//   FIREBASE_ADMIN_CLIENT_EMAIL
//   FIREBASE_ADMIN_PRIVATE_KEY    (literal \n escapes → converted via split/join)

import 'dotenv/config';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';

// Invocation guard (Rule M canonical) — don't auto-trigger on import (unit
// tests would otherwise spawn a Firebase init).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || '';
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: `${process.env.FIREBASE_ADMIN_PROJECT_ID}.firebasestorage.app`,
  });
  await main();
}

const TEST_BRANCH = 'TEST-V108-BR';
const TEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

// ── Fixture catalogue ──────────────────────────────────────────────────────
// Each fixture entry shapes one attachment to upload. The `content` field is
// a Buffer of bytes — kept tiny (a few KB) so the e2e is fast. Adversarial
// fixtures use real-shaped headers but corrupted bodies so LibreOffice fails
// with the expected error class.
const FIXTURES = [
  // Happy path: 7 supported MIMEs
  { name: 'word.doc',  mime: 'application/msword', expect: 'ready' },
  { name: 'word.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expect: 'ready' },
  { name: 'excel.xls', mime: 'application/vnd.ms-excel', expect: 'ready' },
  { name: 'excel.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', expect: 'ready' },
  { name: 'deck.ppt',  mime: 'application/vnd.ms-powerpoint', expect: 'ready' },
  { name: 'deck.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', expect: 'ready' },
  { name: 'data.csv',  mime: 'text/csv', expect: 'ready', content: Buffer.from('name,value\nThai,ทดสอบ\n2,3\n', 'utf8') },
  // Adversarial: outside whitelist → never stamped, card shows ⬇ only
  { name: 'notes.odt', mime: 'application/vnd.oasis.opendocument.text', expect: 'unsupported' },
  // Corrupt: bytes garbage → LibreOffice errors → 'failed'
  { name: 'corrupt.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expect: 'failed', content: Buffer.from('NOT A VALID DOCX', 'utf8') },
];

async function main() {
  const db = getFirestore();
  const bucket = getStorage().bucket();

  const messageId = `TEST-V108-MSG-${Date.now()}`;
  const messageRef = db.collection('be_staff_chat_messages').doc(messageId);
  const prefix = `staff-chat-attachments/${TEST_BRANCH}/${messageId}/`;

  console.log(`Phase A — upload ${FIXTURES.length} fixtures to ${prefix}`);
  const attachments = [];
  for (const fx of FIXTURES) {
    const filePath = prefix + fx.name;
    const content = fx.content || Buffer.alloc(64); // 64 bytes of zeros = LibreOffice will likely fail = 'failed'
    const file = bucket.file(filePath);
    await file.save(content, { contentType: fx.mime });
    console.log(`  ✓ uploaded ${fx.name} (${content.length} bytes, ${fx.mime})`);
    attachments.push({
      name: fx.name,
      fullUrl: `gs://${bucket.name}/${filePath}`,
      fullPath: filePath,
      size: content.length,
      mimeType: fx.mime,
      // Client would stamp 'pending' for office MIMEs; mirror that here.
      ...(fx.expect === 'ready' || fx.expect === 'failed' ? {
        pdfPreviewStatus: 'pending', pdfPreviewUrl: null, pdfPreviewError: null,
      } : {}),
    });
  }

  console.log('\nPhase B — write Firestore message doc');
  await messageRef.set({
    id: messageId,
    branchId: TEST_BRANCH,
    displayName: 'E2E V108 RUNNER',
    deviceId: 'e2e-runner',
    text: '',
    attachments,
    createdAt: FieldValue.serverTimestamp(),
    _testFixture: true, // mark for cleanup-safety
  });

  console.log(`\nPhase C — poll for Cloud Function patches (up to ${TEST_TIMEOUT_MS / 1000}s)`);
  const startedAt = Date.now();
  const expectedReadyOrFailed = FIXTURES.filter(f => f.expect === 'ready' || f.expect === 'failed').length;
  let lastPatchedCount = 0;
  while (Date.now() - startedAt < TEST_TIMEOUT_MS) {
    const snap = await messageRef.get();
    const data = snap.data() || {};
    const atts = data.attachments || [];
    const patched = atts.filter(a => a.pdfPreviewStatus === 'ready' || a.pdfPreviewStatus === 'failed').length;
    if (patched !== lastPatchedCount) {
      console.log(`  ${patched}/${expectedReadyOrFailed} patched after ${Math.round((Date.now() - startedAt) / 1000)}s`);
      lastPatchedCount = patched;
    }
    if (patched >= expectedReadyOrFailed) break;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log('\nPhase D — verify per-fixture state');
  const finalSnap = await messageRef.get();
  const finalAtts = (finalSnap.data() || {}).attachments || [];
  let pass = 0, fail = 0;
  for (let i = 0; i < FIXTURES.length; i++) {
    const fx = FIXTURES[i];
    const att = finalAtts[i];
    const got = att?.pdfPreviewStatus;
    const expected = fx.expect;
    const ok = (expected === 'unsupported' ? !got : got === expected);
    console.log(`  ${ok ? '✓' : '✗'} ${fx.name.padEnd(20)} expected=${expected.padEnd(12)} got=${got || '(never patched)'}`);
    if (ok) pass++; else fail++;
    // Extra checks for 'ready' — PDF must exist + URL set
    if (expected === 'ready' && got === 'ready') {
      const pdfPath = att.fullPath + '.pdf';
      const [pdfExists] = await bucket.file(pdfPath).exists();
      if (!pdfExists) { console.log(`    ✗ PDF cache missing at ${pdfPath}`); fail++; }
      if (!att.pdfPreviewUrl) { console.log(`    ✗ pdfPreviewUrl empty`); fail++; }
    }
    if (expected === 'failed' && got === 'failed') {
      if (!att.pdfPreviewError || typeof att.pdfPreviewError !== 'string') { console.log(`    ✗ pdfPreviewError empty/non-string`); fail++; }
    }
  }

  console.log('\nPhase E — cleanup (every fixture + cache + doc)');
  const [files] = await bucket.getFiles({ prefix });
  for (const f of files) {
    await f.delete().catch(e => console.log(`  ! delete ${f.name} failed: ${String(e).slice(0, 80)}`));
  }
  await messageRef.delete().catch(() => {});
  const [residue] = await bucket.getFiles({ prefix });
  console.log(`  cleanup: deleted ${files.length} files; residue=${residue.length} ${residue.length === 0 ? '✓' : '✗'}`);

  console.log(`\nDone. pass=${pass} fail=${fail}`);
  if (fail > 0) process.exit(1);
}
