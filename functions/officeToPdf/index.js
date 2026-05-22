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
} from './helpers.js';

// (2026-05-23) When deployed via Cloud Run (gcloud run deploy) — NOT via
// `firebase deploy --only functions` — neither projectId nor bucket is auto-
// detected. Must explicitly set both.
const PROJECT_ID = 'loverclinic-opd-4c39b';
const STORAGE_BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';

initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });

const STAFF_CHAT_PREFIX = 'staff-chat-attachments/';
const GOTENBERG_URL = 'http://localhost:3000/forms/libreoffice/convert';
const MESSAGES_COLLECTION = 'be_staff_chat_messages';

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
    const messageRef = db.collection(MESSAGES_COLLECTION).doc(messageId);

    // Patch ONLY the matching attachments[i] entry. Uses a Firestore
    // transaction for atomic read-modify-write — without this, concurrent
    // Cloud Function instances (one per uploaded Office file) would each
    // read the SAME attachments[] then write back their patched copies,
    // clobbering each other (race condition caught in 2026-05-23 stress
    // testing where 3/10 parallel uploads stayed 'pending' forever).
    // The V73 normalizer preserves fullPath; we use that as the join key.
    //
    // NOTE: FieldValue.serverTimestamp() CANNOT be nested inside an array
    // element. Use a plain Date (becomes a Timestamp via admin SDK conversion).
    const stampAttachment = async (patch) => {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(messageRef);
        if (!snap.exists) {
          console.warn('[officeToPdf] message not found', { messageId, filePath });
          return;
        }
        const data = snap.data() || {};
        const atts = Array.isArray(data.attachments) ? data.attachments.slice() : [];
        const idx = atts.findIndex(a => a && a.fullPath === filePath);
        if (idx === -1) {
          console.warn('[officeToPdf] attachment not found in doc', { messageId, filePath });
          return;
        }
        atts[idx] = { ...atts[idx], ...patch, pdfPreviewedAt: new Date() };
        tx.update(messageRef, { attachments: atts });
      });
    };

    try {
      // 1. Download the original from Storage
      const file = bucket.file(filePath);
      const [buf] = await file.download();

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
