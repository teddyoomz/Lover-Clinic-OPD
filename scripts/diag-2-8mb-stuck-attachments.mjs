// scripts/diag-2-8mb-stuck-attachments.mjs
//
// (2026-05-23 EOD+1) Rule R — read-only diagnostic for user-reported bug:
// 3 staff-chat messages with ~2.8 MB Office attachments show ⚠ (timeout or
// failed) instead of 👁 (preview ready). Reproduces on both local + prod.
//
// Goal: identify WHICH STATE each attachment is actually in:
//   - pdfPreviewStatus 'pending' (Cloud Function never ran OR is still running)
//   - pdfPreviewStatus 'failed'  (Cloud Function ran but errored)
//   - pdfPreviewStatus 'ready' but URL broken / cached PDF missing
//   - status undefined           (never stamped 'pending' at upload — client bug)
//
// PLUS check:
//   - source .docx exists in Storage at fullPath
//   - contentType matches the MIME whitelist
//   - cached PDF exists at {fullPath}.pdf
//
// Run: node scripts/diag-2-8mb-stuck-attachments.mjs
// Read-only. No --apply. No mutations.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

const OFFICE_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
]);

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

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Rule R DIAG — Office preview stuck attachments (2.8 MB user repro)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Find recent staff_chat_messages with office-mime attachments.
  // No composite index on attachments — fetch recent + filter in JS.
  // Rule M canonical path — client writes here (backendClient.js:2704).
  // Bare 'be_staff_chat_messages' is the Cloud Function's WRONG path (the bug).
  const CANONICAL = `artifacts/${APP_ID}/public/data/be_staff_chat_messages`;
  const snap = await db.collection(CANONICAL)
    .orderBy('createdAt', 'desc')
    .limit(120)
    .get();

  console.log(`Scanned ${snap.size} recent messages from be_staff_chat_messages\n`);

  const officeAtts = [];
  snap.forEach(d => {
    const data = d.data() || {};
    const atts = Array.isArray(data.attachments) ? data.attachments : [];
    atts.forEach((a, idx) => {
      if (!a || typeof a !== 'object') return;
      const mime = String(a.mimeType || '').toLowerCase();
      if (!OFFICE_MIMES.has(mime)) return;
      officeAtts.push({
        msgId: d.id,
        branchId: data.branchId,
        displayName: data.displayName,
        createdAt: data.createdAt?.toDate?.() || null,
        idx,
        name: a.name,
        size: a.size,
        mime,
        fullPath: a.fullPath,
        fullUrl: a.fullUrl,
        pdfPreviewStatus: a.pdfPreviewStatus,
        pdfPreviewUrl: a.pdfPreviewUrl,
        pdfPreviewError: a.pdfPreviewError,
        pdfPreviewStampedAt: a.pdfPreviewStampedAt,
        pdfPreviewedAt: a.pdfPreviewedAt?.toDate?.() || null,
      });
    });
  });

  console.log(`Found ${officeAtts.length} Office attachments in recent 120 messages\n`);

  // Sort newest-first
  officeAtts.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));

  // For each, cross-check Storage state
  for (let i = 0; i < officeAtts.length; i++) {
    const a = officeAtts[i];
    const sizeMB = (a.size / 1024 / 1024).toFixed(2);
    const ageS = a.createdAt ? Math.round((Date.now() - a.createdAt.getTime()) / 1000) : null;
    const stampedAge = a.pdfPreviewStampedAt ? Math.round((Date.now() - a.pdfPreviewStampedAt) / 1000) : null;

    console.log(`─── #${i + 1} ─────────────────────────────────────────────────────`);
    console.log(`  msgId:          ${a.msgId}`);
    console.log(`  createdAt:      ${a.createdAt?.toISOString() || '(none)'}  (${ageS}s ago)`);
    console.log(`  branchId:       ${a.branchId}`);
    console.log(`  displayName:    ${a.displayName}`);
    console.log(`  name:           ${a.name}`);
    console.log(`  size:           ${a.size} (${sizeMB} MB)`);
    console.log(`  mime:           ${a.mime}`);
    console.log(`  fullPath:       ${a.fullPath}`);
    console.log(`  status:         ${a.pdfPreviewStatus ?? '(undefined)'}`);
    if (a.pdfPreviewStatus === 'failed') {
      console.log(`  pdfPreviewError: ${a.pdfPreviewError || '(none)'}`);
    }
    if (a.pdfPreviewUrl) {
      console.log(`  pdfPreviewUrl:   ${a.pdfPreviewUrl.slice(0, 120)}...`);
    }
    console.log(`  stampedAt:      ${a.pdfPreviewStampedAt || '(none)'}  (${stampedAge}s ago)`);
    if (a.pdfPreviewedAt) {
      console.log(`  pdfPreviewedAt: ${a.pdfPreviewedAt.toISOString()}`);
    }

    // Check Storage state
    try {
      const [srcExists] = await bucket.file(a.fullPath).exists();
      if (srcExists) {
        const [meta] = await bucket.file(a.fullPath).getMetadata();
        console.log(`  src in Storage: ✓ contentType=${meta.contentType} size=${meta.size}`);
        if (String(meta.contentType || '').toLowerCase() !== a.mime) {
          console.log(`     ⚠ MIME MISMATCH — attachment.mime=${a.mime} Storage.contentType=${meta.contentType}`);
        }
      } else {
        console.log(`  src in Storage: ✗ MISSING at ${a.fullPath}`);
      }
    } catch (e) {
      console.log(`  src in Storage: ! err ${String(e).slice(0, 80)}`);
    }
    try {
      const pdfPath = a.fullPath + '.pdf';
      const [pdfExists] = await bucket.file(pdfPath).exists();
      if (pdfExists) {
        const [meta] = await bucket.file(pdfPath).getMetadata();
        console.log(`  cached PDF:     ✓ ${pdfPath}  contentType=${meta.contentType} size=${meta.size}`);
      } else {
        console.log(`  cached PDF:     ✗ MISSING at ${pdfPath}`);
      }
    } catch (e) {
      console.log(`  cached PDF:     ! err ${String(e).slice(0, 80)}`);
    }
    console.log('');
  }

  // Summary by status
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY by pdfPreviewStatus');
  console.log('═══════════════════════════════════════════════════════════════════');
  const counts = {};
  for (const a of officeAtts) {
    const k = String(a.pdfPreviewStatus ?? '(undefined)');
    counts[k] = (counts[k] || 0) + 1;
  }
  for (const [k, v] of Object.entries(counts).sort()) {
    console.log(`  ${k.padEnd(15)} ${v}`);
  }
  console.log('');

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
