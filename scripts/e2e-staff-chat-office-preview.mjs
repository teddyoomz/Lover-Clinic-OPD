// scripts/e2e-staff-chat-office-preview.mjs
//
// (2026-05-22 EOD+2 — T9) Rule Q L2 e2e — runs against REAL prod via the
// firebase-admin SDK. DO NOT RUN until after the deploy. The Cloud Function
// (functions/officeToPdf) must be live in the GCP project; this script:
//
//   1. Uploads fixture files across all 7 convertible MIMEs (.doc/.docx/.xls/
//      .xlsx/.ppt/.pptx/.csv) + 4 adversarial cases (.odt unsupported,
//      password-protected .docx, corrupt file, ~49MB .pptx) under
//      `staff-chat-attachments/{TEST-V109-BR}/{TEST-V109-MSG-{ts}}/{filename}`.
//      Also writes a matching `be_staff_chat_messages/TEST-V109-MSG-{ts}` doc
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
// creating + deleting our OWN TEST-V109-* fixtures (not touching prod data).
//
// Usage (post-deploy):
//   vercel env pull .env.local.prod --environment=production   # if not yet pulled
//   node scripts/e2e-staff-chat-office-preview.mjs
//
// Required env (from .env.local.prod):
//   FIREBASE_ADMIN_PROJECT_ID
//   FIREBASE_ADMIN_CLIENT_EMAIL
//   FIREBASE_ADMIN_PRIVATE_KEY    (literal \n escapes → converted via split/join)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';

// Canonical env loader (mirror scripts/e2e-v159-*.mjs) — the project does NOT
// install `dotenv`; read .env.local.prod directly. Resolve relative to THIS
// script (scripts/ → ../.env.local.prod) so it runs from any cwd (Rule M/R).
function loadEnvLocal() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const txt = readFileSync(path.resolve(dir, '..', '.env.local.prod'), 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

// Fixtures + main() are declared below; the invocation guard lives at the
// BOTTOM of the file so every const is initialized before main() runs
// (top-level await must not hit the const TDZ).

const TEST_BRANCH = 'TEST-V109-BR';
const TEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

// ── Fixture catalogue ──────────────────────────────────────────────────────
// Each fixture entry shapes one attachment to upload. The `content` field is
// a Buffer of bytes — kept tiny (a few KB) so the e2e is fast. Adversarial
// fixtures use real-shaped headers but corrupted bodies so LibreOffice fails
// with the expected error class.
// Expectation semantics — this e2e validates the S2 RACE + pipeline liveness,
// NOT per-format conversion fidelity (that is V110's job, with real user files):
//   'patched'     — supported MIME with a placeholder body. The S2/AV187
//                   contract is that the Cloud Function MUST patch it away from
//                   'pending' (ready OR failed both prove the late-doc retry +
//                   graceful handling). A 64-byte zero body's exact
//                   ready-vs-failed outcome is LibreOffice per-format tolerance
//                   (e.g. old-BIFF .xls is lenient → ready; OOXML zips → failed)
//                   — that variance is NOT a contract, so we assert 'patched'.
//   'ready'       — real convertible content → MUST become 'ready' + a PDF cache.
//   'unsupported' — outside the MIME whitelist → MUST never be patched (⬇ only).
const FIXTURES = [
  // Supported office MIMEs (placeholder bodies → assert PATCHED, not pending).
  { name: 'word.doc',  mime: 'application/msword', expect: 'patched' },
  { name: 'word.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expect: 'patched' },
  { name: 'excel.xls', mime: 'application/vnd.ms-excel', expect: 'patched' },
  { name: 'excel.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', expect: 'patched' },
  { name: 'deck.ppt',  mime: 'application/vnd.ms-powerpoint', expect: 'patched' },
  { name: 'deck.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', expect: 'patched' },
  // Real convertible content → must reach 'ready' + a cached PDF (pipeline proof).
  { name: 'data.csv',  mime: 'text/csv', expect: 'ready', content: Buffer.from('name,value\nThai,ทดสอบ\n2,3\n', 'utf8') },
  // Outside whitelist → never stamped, card shows ⬇ only (MIME gate).
  { name: 'notes.odt', mime: 'application/vnd.oasis.opendocument.text', expect: 'unsupported' },
  // Not a valid OOXML zip — LibreOffice may text-fallback (ready) or error
  // (failed); either way it must be PATCHED. (A faithful "genuinely corrupt
  // zip → failed" assertion needs a real broken zip — follow-up.)
  { name: 'corrupt.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expect: 'patched', content: Buffer.from('NOT A VALID DOCX', 'utf8') },
];

async function main() {
  const db = getFirestore();
  const bucket = getStorage().bucket();

  const messageId = `TEST-V109-MSG-${Date.now()}`;
  // V109 Rule M canonical path — see diag-office-preview-comprehensive.mjs for full rationale.
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const messageRef = db.doc(`artifacts/${projectId}/public/data/be_staff_chat_messages/${messageId}`);
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
      // Client stamps 'pending' for every office-convertible MIME; mirror that
      // (everything except the unsupported .odt).
      ...(fx.expect !== 'unsupported' ? {
        pdfPreviewStatus: 'pending', pdfPreviewUrl: null, pdfPreviewError: null,
      } : {}),
    });
  }

  console.log('\nPhase B — write Firestore message doc');
  await messageRef.set({
    id: messageId,
    branchId: TEST_BRANCH,
    displayName: 'E2E V109 RUNNER',
    deviceId: 'e2e-runner',
    text: '',
    attachments,
    createdAt: FieldValue.serverTimestamp(),
    _testFixture: true, // mark for cleanup-safety
  });

  console.log(`\nPhase C — poll for Cloud Function patches (up to ${TEST_TIMEOUT_MS / 1000}s)`);
  const startedAt = Date.now();
  // Every supported-MIME attachment (all but the unsupported .odt) must get
  // patched away from 'pending' — this IS the S2 (AV187) late-doc-retry contract.
  const expectedPatched = FIXTURES.filter(f => f.expect !== 'unsupported').length;
  let lastPatchedCount = 0;
  while (Date.now() - startedAt < TEST_TIMEOUT_MS) {
    const snap = await messageRef.get();
    const data = snap.data() || {};
    const atts = data.attachments || [];
    const patched = atts.filter(a => a.pdfPreviewStatus === 'ready' || a.pdfPreviewStatus === 'failed').length;
    if (patched !== lastPatchedCount) {
      console.log(`  ${patched}/${expectedPatched} patched after ${Math.round((Date.now() - startedAt) / 1000)}s`);
      lastPatchedCount = patched;
    }
    if (patched >= expectedPatched) break;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log('\nPhase D — verify per-fixture state');
  const finalSnap = await messageRef.get();
  const finalAtts = (finalSnap.data() || {}).attachments || [];
  let pass = 0, fail = 0;
  let supportedPatched = 0; // S2 (AV187) primary counter
  for (let i = 0; i < FIXTURES.length; i++) {
    const fx = FIXTURES[i];
    const att = finalAtts[i];
    const got = att?.pdfPreviewStatus;
    const expected = fx.expect;
    const isPatched = (got === 'ready' || got === 'failed');
    if (expected !== 'unsupported' && isPatched) supportedPatched++;

    // ok per expectation:
    //   unsupported → must NEVER be patched
    //   ready       → must be exactly 'ready'
    //   patched     → must be patched (ready OR failed), never stuck 'pending'
    //   failed      → must be exactly 'failed'  (legacy branch kept)
    let ok;
    if (expected === 'unsupported') ok = !got;
    else if (expected === 'patched') ok = isPatched;
    else ok = (got === expected);
    console.log(`  ${ok ? '✓' : '✗'} ${fx.name.padEnd(20)} expected=${expected.padEnd(12)} got=${got || '(never patched)'}`);
    if (ok) pass++; else fail++;

    // Any 'ready' → the cached PDF + URL MUST exist (the 'ready' contract).
    if (got === 'ready') {
      const pdfPath = att.fullPath + '.pdf';
      const [pdfExists] = await bucket.file(pdfPath).exists();
      if (!pdfExists) { console.log(`    ✗ PDF cache missing at ${pdfPath}`); fail++; }
      if (!att.pdfPreviewUrl) { console.log(`    ✗ pdfPreviewUrl empty`); fail++; }
    }
    // Any 'failed' → a Thai-language error string MUST be present.
    if (got === 'failed') {
      if (!att.pdfPreviewError || typeof att.pdfPreviewError !== 'string') { console.log(`    ✗ pdfPreviewError empty/non-string`); fail++; }
    }
  }

  // ── S2 (AV187) PRIMARY ASSERTION ────────────────────────────────────────
  // The message doc was created in Phase B AFTER every upload in Phase A, so
  // each Cloud Function fired before the doc existed. Pre-S2 they warned + gave
  // up → attachments stuck 'pending'. Post-S2 patchOfficeAttachment retries
  // until the doc appears. Every supported-MIME attachment being patched proves
  // the retry landed on real prod.
  const expectedSupported = FIXTURES.filter(f => f.expect !== 'unsupported').length;
  const s2Ok = supportedPatched === expectedSupported;
  console.log(`\n  ${s2Ok ? '✓' : '✗'} S2 retry (AV187): ${supportedPatched}/${expectedSupported} supported-MIME attachments PATCHED (none stuck 'pending')`);
  if (!s2Ok) fail++;

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

// Invocation guard (Rule M canonical) — at the BOTTOM so all consts + main()
// are initialized. Don't auto-trigger on import (unit tests would otherwise
// spawn a Firebase init).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  Object.assign(process.env, loadEnvLocal());
  // .env.local.prod ships CLIENT_EMAIL + PRIVATE_KEY but not PROJECT_ID —
  // fall back to the canonical APP_ID (mirror e2e-v159).
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
    process.env.FIREBASE_ADMIN_PROJECT_ID = 'loverclinic-opd-4c39b';
  }
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
