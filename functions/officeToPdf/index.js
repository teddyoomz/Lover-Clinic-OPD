// functions/officeToPdf/index.js
//
// (2026-05-22 EOD+2 — T4) Firebase Cloud Function 2nd Gen — Storage
// onObjectFinalized trigger that converts Office files (Word / Excel / PPT /
// CSV) to PDF using the BUNDLED Gotenberg LibreOffice service running on
// http://localhost:3000 inside the same container (started by supervisord —
// see Dockerfile + supervisord.conf).
//
// AV108 — sanctioned exception #1: this is the ONLY code path allowed to
// invoke a doc-conversion service, AND it must use localhost ONLY. No external
// HTTP calls during conversion. PHI never leaves the GCP project. Source-grep
// test in tests/audit-av108-office-preview-exception.test.js (T7) enforces.
//
// Fire-and-forget: the sender's send() path doesn't wait on conversion. The
// initial Firestore write (T2) stamps pdfPreviewStatus='pending'. This handler
// patches to 'ready' (with pdfPreviewUrl) on success or 'failed' (with
// pdfPreviewError) on failure. The client listener picks up the patch via
// onSnapshot — UI flips ⏳ → 👁 or ⚠ automatically.

import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  isOfficeConvertible,
  OfficePreviewStatus,
  deriveOutputPath,
  deriveFailureReason,
  classifyGotenbergError,
  patchOfficeAttachment,
} from './helpers.js';
// V110 (2026-05-23 EOD+1) — font-fidelity observability. Logs which Thai fonts
// THIS docx requires + which are missing from the container's installed set.
// Pre-conversion (after download, before Gotenberg) — non-fatal: failure to
// analyze never blocks the conversion.
import { analyzeFontRequirements } from './fontDetector.js';

// (2026-05-23) When deployed via Cloud Run (gcloud run deploy) — NOT via
// `firebase deploy --only functions` — neither projectId nor bucket is auto-
// detected. Must explicitly set both.
const PROJECT_ID = 'loverclinic-opd-4c39b';
const STORAGE_BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';

initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });

const STAFF_CHAT_PREFIX = 'staff-chat-attachments/';
const GOTENBERG_URL = 'http://localhost:3000/forms/libreoffice/convert';
// (2026-05-23 EOD+1 — V109 ROOT-CAUSE FIX, Rule M canonical path discipline +
// V15 #22 bare-collection lesson). Pre-fix used the BARE collection name; the
// Cloud Function read+wrote to the WRONG Firestore root → conversion ran +
// Storage PDF cached, but Firestore patch silently no-op'd → status stayed
// 'pending' → 60s Path B fired → user-visible ⚠. Diag: 2 stuck attachments had
// `.docx.pdf` cached at expected paths with correct application/pdf
// contentType. Reference: pre-existing functions/index.js uses
// `BASE_PATH = artifacts/${APP_ID}/public/data` — same project, correct
// pattern, was right here all along. AV109 source-grep regression locks it.
const MESSAGES_COLLECTION_PATH = `artifacts/${PROJECT_ID}/public/data/be_staff_chat_messages`;

export const officeToPdf = onObjectFinalized(
  {
    region: 'asia-southeast1',
    bucket: STORAGE_BUCKET,           // REQUIRED when not deployed via firebase
    memory: '1GiB',
    timeoutSeconds: 540,
    concurrency: 1,
  },
  async (event) => {
    const obj = event.data;
    const filePath = obj.name || '';
    const contentType = obj.contentType || '';

    // ── Gates ─────────────────────────────────────────────────
    // Gate 1: only files under the staff-chat prefix
    if (!filePath.startsWith(STAFF_CHAT_PREFIX)) return;
    // Gate 2: skip already-converted PDFs (recursion protection)
    if (filePath.endsWith('.pdf')) return;
    // Gate 3: MIME whitelist (Q3=C scope)
    if (!isOfficeConvertible(contentType)) return;

    // filePath shape: staff-chat-attachments/{branchId}/{messageId}/{file}
    const parts = filePath.slice(STAFF_CHAT_PREFIX.length).split('/');
    if (parts.length < 3) return;
    const messageId = parts[1];

    const bucket = getStorage().bucket();
    const db = getFirestore();
    // V109: production data lives at the Rule M canonical path. The pre-fix
    // bare-collection read returned !snap.exists for every real message; the
    // function logged 'message not found' + returned without patching → status
    // stayed 'pending' forever (4 stuck attachments confirmed in prod diag).
    const messageRef = db.doc(`${MESSAGES_COLLECTION_PATH}/${messageId}`);

    // Patch ONLY the matching attachments[i] entry. Uses a Firestore
    // transaction for atomic read-modify-write — without this, concurrent
    // Cloud Function instances (one per uploaded Office file) would each
    // read the SAME attachments[] then write back their patched copies,
    // clobbering each other (race condition caught in 2026-05-23 stress
    // testing where 3/10 parallel uploads stayed 'pending' forever).
    // The V73 normalizer preserves fullPath; we use that as the join key.
    //
    // NOTE: FieldValue.serverTimestamp() CANNOT be nested inside an array
    // element. patchOfficeAttachment uses a plain Date (→ Timestamp via admin SDK).
    //
    // (2026-06-03 EOD+4 — S2 race fix) The patch now RETRIES when the message doc
    // doesn't exist yet: the composer creates the doc only AFTER every upload in
    // the batch finishes, so a fast Office conversion sent alongside a large file
    // could patch BEFORE the doc was created → the patch was silently lost →
    // status stuck 'pending' → ⚠. The bounded retry (~6×/2s) covers the late
    // setDoc; 'no-attachment' (doc exists w/o this attachment) does NOT retry.
    const stampAttachment = async (patch) => {
      const outcome = await patchOfficeAttachment({ db, messageRef, filePath, patch });
      if (outcome === 'no-attachment') {
        console.warn('[officeToPdf] attachment not found in doc', { messageId, filePath });
      } else if (outcome === 'no-doc-timeout') {
        console.warn('[officeToPdf] message doc not created within retry window — patch lost', { messageId, filePath });
      }
    };

    try {
      // 1. Download the original from Storage
      const file = bucket.file(filePath);
      const [buf] = await file.download();

      // V110 (2026-05-23 EOD+1) — Font requirements analysis (non-fatal
      // observability). Logs the fonts this docx specifies + which are
      // installed/aliased/missing. When `missing` is non-empty, conversion
      // still runs but layout may drift vs MS Word. Logs let us decide which
      // fonts to bake into future Docker image builds. Only runs on Office
      // Open XML (.docx/.xlsx/.pptx) — legacy .doc/.xls binaries use a
      // different font-spec mechanism (not zip-based).
      try {
        if (contentType.includes('wordprocessingml')
            || contentType.includes('spreadsheetml')
            || contentType.includes('presentationml')) {
          const report = analyzeFontRequirements(buf);
          if (report.error) {
            console.warn('[officeToPdf] font-analysis skipped', {
              filePath, error: report.error,
            });
          } else {
            console.log('[officeToPdf] font-requirements', {
              filePath,
              declared: report.declared,
              theme: report.theme,
              missing: report.missing,
              aliased: report.aliased,
              installedCount: report.installed.length,
            });
          }
        }
      } catch (e) {
        console.warn('[officeToPdf] font-analysis threw (continuing)', String(e).slice(0, 200));
      }

      // 2. POST to bundled Gotenberg → PDF buffer (LOCAL ONLY — AV108)
      const fd = new FormData();
      fd.append('files', new Blob([buf], { type: contentType }), parts[2]);
      const resp = await fetch(GOTENBERG_URL, { method: 'POST', body: fd });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        const kind = classifyGotenbergError(txt);
        await stampAttachment({
          pdfPreviewStatus: OfficePreviewStatus.FAILED,
          pdfPreviewUrl: null,
          pdfPreviewError: deriveFailureReason({ kind }),
        });
        return;
      }
      const pdfArrayBuf = await resp.arrayBuffer();
      const pdfBuf = Buffer.from(pdfArrayBuf);

      // 3. Upload PDF to the same prefix (so V73 30d retention sweep cleans
      //    both files together — zero new cron).
      const outPath = deriveOutputPath(filePath);
      const outFile = bucket.file(outPath);

      // Crypto-secure download token (Rule C2 — no Math.random for URL tokens).
      // We use this token-style URL (not a 7d signed URL) so the PDF is
      // accessible for the FULL V73 30d retention lifetime without needing
      // re-signing on each listener pickup.
      const tokenBytes = new Uint8Array(16);
      (globalThis.crypto || (await import('node:crypto')).webcrypto).getRandomValues(tokenBytes);
      const downloadToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      await outFile.save(pdfBuf, {
        contentType: 'application/pdf',
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            generatedBy: 'officeToPdf',
            sourcePath: filePath,
          },
        },
      });
      const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(outPath)}?alt=media&token=${downloadToken}`;

      // 4. Patch Firestore — status=ready + URL
      await stampAttachment({
        pdfPreviewStatus: OfficePreviewStatus.READY,
        pdfPreviewUrl: pdfUrl,
        pdfPreviewError: null,
      });
    } catch (err) {
      console.error('[officeToPdf] conversion failed', { filePath, err: String(err) });
      await stampAttachment({
        pdfPreviewStatus: OfficePreviewStatus.FAILED,
        pdfPreviewUrl: null,
        pdfPreviewError: deriveFailureReason({ kind: 'unknown' }),
      });
    }
  }
);
