// scripts/v108-heal-stuck-office-attachments.mjs
//
// (2026-05-23 EOD+1) V109 ONE-SHOT HEAL — Rule M two-phase (dry-run / --apply).
//
// Heals office attachments that are stuck `pending` in Firestore but
// already have their PDF correctly cached at `{fullPath}.pdf` in Storage.
// These are the docs the Cloud Function successfully converted before the
// canonical-path code fix (the pre-V109 Cloud Function ran fine, just
// patched the WRONG Firestore collection root → patch lost → status
// stayed pending → 60s Path B → ⚠).
//
// Strategy:
//   1. List be_staff_chat_messages at canonical path
//   2. For each office attachment with status='pending':
//      a. Check if `{fullPath}.pdf` exists in Storage
//      b. If yes → patch status='ready' + pdfPreviewUrl (heal)
//      c. If no  → leave alone (user can re-upload to trigger conversion)
//   3. Forensic-trail: stamp _v108HealedAt + _v108HealedFromStatus on the attachment
//
// Usage:
//   node scripts/v108-heal-stuck-office-attachments.mjs                  # dry-run
//   node scripts/v108-heal-stuck-office-attachments.mjs --apply          # commit writes
//
// Idempotent: re-run with --apply yields 0 writes (skip-if-status-not-pending).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const APPLY = process.argv.includes('--apply');

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
  console.log(`  V109 HEAL stuck office attachments  [${APPLY ? 'APPLY' : 'DRY-RUN'}]`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const CANONICAL = `artifacts/${APP_ID}/public/data/be_staff_chat_messages`;
  const snap = await db.collection(CANONICAL)
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();
  console.log(`Scanned ${snap.size} recent messages`);

  let healable = 0;       // pending + cached PDF exists → will heal
  let needsReupload = 0;  // pending + no cached PDF → user must re-upload
  let alreadyReady = 0;
  let nonOffice = 0;

  const tasks = [];
  snap.forEach(d => {
    const data = d.data() || {};
    const atts = Array.isArray(data.attachments) ? data.attachments : [];
    atts.forEach((a, idx) => {
      if (!a || typeof a !== 'object') return;
      const mime = String(a.mimeType || '').toLowerCase();
      if (!OFFICE_MIMES.has(mime)) { nonOffice++; return; }
      if (a.pdfPreviewStatus === 'ready') { alreadyReady++; return; }
      if (a.pdfPreviewStatus !== 'pending' && a.pdfPreviewStatus !== undefined) return;
      tasks.push({ docId: d.id, idx, att: a, msgRef: d.ref });
    });
  });

  console.log(`\nFound ${tasks.length} candidate attachments (status pending/undefined + office MIME)`);
  console.log(`  ${alreadyReady} attachments already 'ready' (no action)`);
  console.log(`  ${nonOffice} non-office attachments (skipped)\n`);

  for (const t of tasks) {
    const pdfPath = t.att.fullPath + '.pdf';
    let pdfExists = false;
    let pdfMeta = null;
    try {
      const [exists] = await bucket.file(pdfPath).exists();
      pdfExists = exists;
      if (exists) {
        const [meta] = await bucket.file(pdfPath).getMetadata();
        pdfMeta = meta;
      }
    } catch (e) {
      console.log(`  ! Storage err on ${pdfPath}: ${String(e).slice(0, 80)}`);
    }

    if (!pdfExists) {
      needsReupload++;
      console.log(`  ⚠  ${t.docId} [#${t.idx}] ${t.att.name}`);
      console.log(`     NO cached PDF → user must re-upload to convert`);
      continue;
    }

    healable++;
    // Reconstruct the public download URL the same way the Cloud Function does.
    // Need the firebaseStorageDownloadTokens metadata field.
    const tokens = pdfMeta?.metadata?.firebaseStorageDownloadTokens;
    if (!tokens) {
      // Older cached PDFs may lack the token (different signing path). Generate
      // a fresh one + write it back to Storage metadata so the URL is stable.
      const newToken = randomBytes(16).toString('hex');
      console.log(`  ✓  ${t.docId} [#${t.idx}] ${t.att.name}`);
      console.log(`     cached PDF exists at ${pdfPath} (${pdfMeta.size} B)`);
      console.log(`     no download token → will mint ${newToken.slice(0, 8)}...`);
      if (APPLY) {
        await bucket.file(pdfPath).setMetadata({
          metadata: {
            ...(pdfMeta.metadata || {}),
            firebaseStorageDownloadTokens: newToken,
            v108HealedAt: new Date().toISOString(),
          },
        });
      }
      var downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(pdfPath)}?alt=media&token=${newToken}`;
    } else {
      // First token (may be comma-separated)
      const token = String(tokens).split(',')[0].trim();
      console.log(`  ✓  ${t.docId} [#${t.idx}] ${t.att.name}`);
      console.log(`     cached PDF exists at ${pdfPath} (${pdfMeta.size} B), token=${token.slice(0, 8)}...`);
      var downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(pdfPath)}?alt=media&token=${token}`;
    }

    if (APPLY) {
      // Atomic patch using Firestore transaction (matches Cloud Function's stampAttachment)
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(t.msgRef);
        if (!fresh.exists) return;
        const fdata = fresh.data() || {};
        const fatts = Array.isArray(fdata.attachments) ? fdata.attachments.slice() : [];
        const i = fatts.findIndex(a => a && a.fullPath === t.att.fullPath);
        if (i === -1) return;
        if (fatts[i].pdfPreviewStatus === 'ready') return; // idempotent
        fatts[i] = {
          ...fatts[i],
          pdfPreviewStatus: 'ready',
          pdfPreviewUrl: downloadUrl,
          pdfPreviewError: null,
          pdfPreviewedAt: new Date(),
          _v108HealedAt: new Date(),
          _v108HealedFromStatus: fatts[i].pdfPreviewStatus || 'undefined',
        };
        tx.update(t.msgRef, { attachments: fatts });
      });
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  SUMMARY (${APPLY ? 'APPLIED' : 'DRY-RUN'})`);
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  healable (pending + cached PDF):   ${healable}`);
  console.log(`  needs re-upload (no cached PDF):   ${needsReupload}`);
  console.log(`  already ready (skipped):           ${alreadyReady}`);
  console.log(`  non-office (skipped):              ${nonOffice}`);
  console.log('');
  if (APPLY) {
    // Audit doc
    const auditId = `v108-heal-stuck-office-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const auditRef = db.doc(`artifacts/${APP_ID}/public/data/be_admin_audit/${auditId}`);
    await auditRef.set({
      kind: 'v108-heal-stuck-office-attachments',
      performedAt: new Date(),
      scanned: snap.size,
      healable,
      needsReupload,
      alreadyReady,
      nonOffice,
    });
    console.log(`  audit doc: be_admin_audit/${auditId}\n`);
  } else {
    console.log(`  Re-run with --apply to commit writes.\n`);
  }

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
