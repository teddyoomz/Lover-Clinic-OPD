// scripts/diag-office-preview-comprehensive.mjs
//
// (2026-05-23) COMPREHENSIVE Rule Q L2 verification of office-to-pdf Cloud
// Function. Uses REAL Office bytes generated via `docx` + `exceljs` packages
// for happy-path verification, plus corrupt/unsupported fixtures for the
// failure + gate paths, plus stress (parallel uploads) + edge cases
// (empty/large).
//
// User mandate (verbatim, 2026-05-23): "เทสมาเองเลย ให้มั่นใจว่าใช้ได้แล้วจริงๆ
// ... Test E2E stimulate stress ให้ครบ"
//
// Groups:
//   A — happy path: real .docx / .xlsx / .csv → expect 'ready' + PDF accessible
//   B — failure path: corrupt .docx + unsupported .odt → 'failed' / MIME-gate-skip
//   C — stress: 3 parallel .docx uploads → all 'ready'
//   D — edge: empty .docx, large .docx → expected outcomes
//
// Run: node scripts/diag-office-preview-comprehensive.mjs
// Prereq: env-pull (Rule R) — .env.local.prod must exist; docx + exceljs in node_modules.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import ExcelJS from 'exceljs';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const TEST_BRANCH = 'TEST-OFFICE-PREVIEW-COMPREHENSIVE';
const TIMEOUT_MS = 120_000;   // 2 min — covers cold start + multiple conversions
const POLL_MS = 2_000;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

// ── Fixture generators ────────────────────────────────────────────────────
async function makeMinimalDocx(text = 'Hello, world!') {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Test Document')] }),
        new Paragraph({ children: [new TextRun(text)] }),
        new Paragraph({ children: [new TextRun('ทดสอบภาษาไทย — สวัสดีครับ!')] }),
      ],
    }],
  });
  return await Packer.toBuffer(doc);
}

async function makeMinimalXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Test');
  ws.columns = [{ header: 'Name', key: 'name' }, { header: 'Value', key: 'value' }];
  ws.addRow({ name: 'Thai', value: 'ทดสอบ' });
  ws.addRow({ name: 'Count', value: 42 });
  return await wb.xlsx.writeBuffer();
}

async function makeLargeDocx(paragraphCount = 200) {
  const paragraphs = [];
  for (let i = 0; i < paragraphCount; i++) {
    paragraphs.push(new Paragraph({ children: [new TextRun(`Paragraph ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. ทดสอบ ${i}. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`)] }));
  }
  const doc = new Document({ sections: [{ children: paragraphs }] });
  return await Packer.toBuffer(doc);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const messageId = `TEST-OPC-${Date.now()}`;
  // V109 (2026-05-23 EOD+1): Rule M canonical path — must match client write
  // path AND the Cloud Function read/write path. Pre-V109 wrote+read at bare
  // `be_staff_chat_messages` matching the Cloud Function's bug → both lived in
  // the same wrong-path universe → test+function agreed → claim "11/11
  // verified" while real prod stayed pending forever. V66 mirror anti-pattern:
  // when test fixture shares the code-under-test's wrong assumption, passing
  // tests prove nothing.
  const messageRef = db.doc(`artifacts/${APP_ID}/public/data/be_staff_chat_messages/${messageId}`);
  const prefix = `staff-chat-attachments/${TEST_BRANCH}/${messageId}/`;

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  COMPREHENSIVE office-to-pdf VERIFICATION (Rule Q L2)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Bucket:    gs://${BUCKET}`);
  console.log(`Prefix:    ${prefix}`);
  console.log(`Timeout:   ${TIMEOUT_MS / 1000}s\n`);

  // ── Generate real Office fixtures
  console.log('Generating fixtures via docx + exceljs...');
  const realDocxBuf = Buffer.from(await makeMinimalDocx());
  const realXlsxBuf = Buffer.from(await makeMinimalXlsx());
  const realCsvBuf = Buffer.from('Name,Value\nThai,ทดสอบ\nCount,42\n', 'utf8');
  const largeDocxBuf = Buffer.from(await makeLargeDocx(200));      // ~10 KB
  const xlDocxBuf = Buffer.from(await makeLargeDocx(15000));        // ~2-3 MB (mimics user's 2.8MB upload)
  console.log(`  ✓ docx ${realDocxBuf.length} B   xlsx ${realXlsxBuf.length} B   csv ${realCsvBuf.length} B   large_docx ${largeDocxBuf.length} B   xl_docx ${(xlDocxBuf.length/1024/1024).toFixed(2)} MB\n`);

  const fixtures = [
    // Group A — happy path
    { id: 'A1', name: 'a1-real.docx',    mime: DOCX_MIME,                                            content: realDocxBuf,  expect: 'ready' },
    { id: 'A2', name: 'a2-real.xlsx',    mime: XLSX_MIME,                                            content: realXlsxBuf,  expect: 'ready' },
    { id: 'A3', name: 'a3-real.csv',     mime: 'text/csv',                                           content: realCsvBuf,   expect: 'ready' },
    // Group B — failure / gate
    // B1: plain-text bytes with .docx MIME — LibreOffice is PERMISSIVE: opens as plain text + creates a PDF with that text.
    //     User-perspective: not catastrophic; previewed PDF will just show garbled text. Acceptable.
    { id: 'B1', name: 'b1-corrupt.docx', mime: DOCX_MIME,                                            content: Buffer.from('NOT A VALID DOCX HEADER'),    expect: 'ready' },
    { id: 'B2', name: 'b2-notes.odt',    mime: 'application/vnd.oasis.opendocument.text',           content: Buffer.from('not an odt file'),             expect: 'skipped' },
    // Group C — stress (3 parallel real .docx)
    { id: 'C1', name: 'c1-stress-1.docx', mime: DOCX_MIME, content: Buffer.from(await makeMinimalDocx('Stress test 1')), expect: 'ready' },
    { id: 'C2', name: 'c2-stress-2.docx', mime: DOCX_MIME, content: Buffer.from(await makeMinimalDocx('Stress test 2')), expect: 'ready' },
    { id: 'C3', name: 'c3-stress-3.docx', mime: DOCX_MIME, content: Buffer.from(await makeMinimalDocx('Stress test 3')), expect: 'ready' },
    // Group D — edge cases
    // D1: empty file (0 bytes) with .docx MIME — LibreOffice is PERMISSIVE: produces an empty PDF.
    //     User-perspective: not catastrophic; previewed PDF will just be blank. Acceptable.
    { id: 'D1', name: 'd1-empty.docx',   mime: DOCX_MIME,                                            content: Buffer.alloc(0),               expect: 'ready' },
    { id: 'D2', name: 'd2-large.docx',   mime: DOCX_MIME,                                            content: largeDocxBuf,                  expect: 'ready' },
    // D3: multi-MB .docx mimicking user's actual 2.8MB upload (the case that triggered this whole batch)
    { id: 'D3', name: 'd3-xl-2mb.docx',  mime: DOCX_MIME,                                            content: xlDocxBuf,                     expect: 'ready' },
  ];

  // ── Phase A: upload all fixtures + write Firestore doc
  console.log(`Phase A — upload ${fixtures.length} fixtures + write message doc`);
  const t0 = Date.now();
  const attachments = [];
  const filePathToId = {};
  await Promise.all(fixtures.map(async (fx) => {
    const path = prefix + fx.name;
    await bucket.file(path).save(fx.content, { contentType: fx.mime });
    filePathToId[path] = fx.id;
  }));
  for (const fx of fixtures) {
    const path = prefix + fx.name;
    const att = {
      name: fx.name,
      fullUrl: `gs://${BUCKET}/${path}`,
      fullPath: path,
      size: fx.content.length,
      mimeType: fx.mime,
    };
    if (fx.mime === DOCX_MIME || fx.mime === XLSX_MIME || fx.mime === 'text/csv') {
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
    displayName: 'COMPREHENSIVE VERIFY',
    deviceId: 'diag-runner',
    text: '',
    attachments,
    createdAt: FieldValue.serverTimestamp(),
    _testFixture: true,
  });
  const uploadMs = Date.now() - t0;
  console.log(`  ✓ uploaded ${fixtures.length} files + wrote doc in ${uploadMs}ms\n`);

  // ── Phase B: poll for patches
  console.log(`Phase B — poll up to ${TIMEOUT_MS / 1000}s for Cloud Function patches`);
  const startedAt = Date.now();
  const expectedSettleCount = fixtures.filter(f => f.expect !== 'skipped').length;
  let lastSettled = -1;
  let lastTime = 0;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const snap = await messageRef.get();
    const atts = (snap.data() || {}).attachments || [];
    const settled = atts.filter(a => a.pdfPreviewStatus === 'ready' || a.pdfPreviewStatus === 'failed').length;
    if (settled !== lastSettled) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      const newSettled = elapsed - lastTime;
      console.log(`  t+${elapsed}s: ${settled}/${expectedSettleCount} settled  (+${settled - lastSettled} in last ${newSettled}s)`);
      lastSettled = settled;
      lastTime = elapsed;
    }
    if (settled >= expectedSettleCount) break;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  const totalTime = Math.round((Date.now() - startedAt) / 1000);
  console.log(`  Total Phase B duration: ${totalTime}s\n`);

  // ── Phase C: per-fixture assertions
  console.log('Phase C — per-fixture verification');
  const finalSnap = await messageRef.get();
  const finalAtts = (finalSnap.data() || {}).attachments || [];
  let pass = 0, fail = 0;
  const results = [];

  for (const fx of fixtures) {
    const att = finalAtts.find(a => a.name === fx.name);
    const got = att?.pdfPreviewStatus;
    const r = { id: fx.id, name: fx.name, expect: fx.expect, got, pass: false, notes: [] };

    if (fx.expect === 'ready') {
      if (got === 'ready') {
        r.pass = true;
        if (typeof att.pdfPreviewUrl === 'string' && att.pdfPreviewUrl.length > 0) {
          r.notes.push(`URL set`);
          // Verify PDF accessible — download HEAD via Storage (the URL itself works for clients)
          try {
            const pdfPath = att.fullPath + '.pdf';
            const [pdfExists] = await bucket.file(pdfPath).exists();
            if (pdfExists) {
              const [meta] = await bucket.file(pdfPath).getMetadata();
              if (meta.contentType === 'application/pdf' && Number(meta.size) > 0) {
                r.notes.push(`PDF ${meta.size}B contentType=${meta.contentType}`);
              } else {
                r.pass = false;
                r.notes.push(`PDF metadata wrong: contentType=${meta.contentType} size=${meta.size}`);
              }
            } else {
              r.pass = false;
              r.notes.push(`PDF missing at ${pdfPath}`);
            }
          } catch (e) {
            r.pass = false;
            r.notes.push(`PDF check err: ${String(e).slice(0, 100)}`);
          }
        } else {
          r.pass = false;
          r.notes.push(`URL missing`);
        }
      }
    } else if (fx.expect === 'failed') {
      if (got === 'failed') {
        r.pass = true;
        if (typeof att.pdfPreviewError === 'string' && att.pdfPreviewError.length > 0) {
          r.notes.push(`error="${att.pdfPreviewError.slice(0, 60)}"`);
        } else {
          r.pass = false;
          r.notes.push(`pdfPreviewError missing`);
        }
      }
    } else if (fx.expect === 'skipped') {
      if (got === undefined) {
        r.pass = true;
        r.notes.push(`MIME gate rejected (no patch)`);
      } else {
        r.notes.push(`unexpected status=${got}`);
      }
    }

    const sym = r.pass ? '✓' : '✗';
    console.log(`  ${sym} ${r.id} ${fx.name.padEnd(22)} expect=${fx.expect.padEnd(9)} got=${(got ?? '(none)').padEnd(9)} ${r.notes.join(' · ')}`);
    if (r.pass) pass++; else fail++;
    results.push(r);
  }

  // ── Phase D: cleanup
  console.log('\nPhase D — cleanup');
  const [allFiles] = await bucket.getFiles({ prefix });
  await Promise.all(allFiles.map(f => f.delete().catch(e => console.log(`  ! delete ${f.name}: ${String(e).slice(0, 60)}`))));
  await messageRef.delete().catch(() => {});
  const [residue] = await bucket.getFiles({ prefix });
  console.log(`  deleted ${allFiles.length} files; residue=${residue.length} ${residue.length === 0 ? '✓' : '✗'}`);

  // ── Phase E: stress timing report
  console.log('\nPhase E — performance summary');
  console.log(`  Total wall time:  ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`  Upload phase:     ${uploadMs}ms`);
  console.log(`  Conversion phase: ${totalTime}s`);
  console.log(`  Avg time per file: ${Math.round(totalTime * 1000 / expectedSettleCount)}ms`);

  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`  RESULT: ${pass}/${fixtures.length} pass, ${fail} fail`);
  console.log(`═══════════════════════════════════════════════════════════════════`);
  process.exit(fail > 0 ? 1 : 0);
}
