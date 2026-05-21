// api/cron/staff-chat-retention-sweep.js
// Staff Chat image attachments (2026-05-22) — auto-retention sweep. Q1=auto-only,
// Q3=delete whole message + images, Q4=30 days. Fires daily.
//
// Pass A (age-out): messages older than RETENTION_DAYS → delete the per-message
//   Storage folder (prefix-sweep, so no file is left behind) + the legacy scalar
//   attachmentUrl file + the Firestore doc.
// Pass B (orphan-sweep): {messageId} folders with NO message doc + older than the
//   grace window (upload finished but send never completed / client crashed) →
//   delete the folder. This is the backstop that guarantees "ลบจริงหายจริง".
//
// Cron-only · CRON_SECRET-gated · idempotent · admin SDK (client delete is
// rule-blocked by design). Mirrors chart-edit-session-sweep.js.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'node:crypto';
import {
  RETENTION_DAYS,
  STAFF_CHAT_STORAGE_ROOT,
  storagePrefixForMessage,
  extractStoragePathFromUrl,
  isExpired,
  isOrphanFolder,
} from '../../src/lib/staffChatRetentionCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const MESSAGES_COL = `${PREFIX}/be_staff_chat_messages`;
const AUDIT_COL = `${PREFIX}/be_admin_audit`;
const SWEEP_LIMIT = 500;

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

// Delete every Storage object under a prefix. Returns count deleted (or that
// WOULD be deleted in dry-run). Tolerates per-file delete failures.
async function deletePrefix(storage, prefix, apply) {
  const [files] = await storage.getFiles({ prefix });
  if (apply) await Promise.all(files.map(f => f.delete().catch(() => {})));
  return files.length;
}

function createdAtMs(data) {
  const c = data && data.createdAt;
  if (c && typeof c.toMillis === 'function') { try { return c.toMillis(); } catch { return null; } }
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  return null;
}

// Shared sweep — used by the cron handler AND scripts/staff-chat-retention-sweep.mjs
// (Rule of 3). `apply=false` = dry-run (count only, no writes).
export async function sweepStaffChatRetention({ db, storage, now = Date.now(), limit = SWEEP_LIMIT, apply = true }) {
  let scannedMessages = 0, deletedMessages = 0, deletedFiles = 0;
  let orphanFolders = 0, orphanFiles = 0, skippedUnknownAge = 0;

  // ── Pass A · age-out ──────────────────────────────────────────────────────
  const cutoff = Timestamp.fromMillis(now - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const snap = await db.collection(MESSAGES_COL).where('createdAt', '<', cutoff).limit(limit).get();
  scannedMessages = snap.size;
  for (const d of snap.docs) {
    const data = d.data();
    // Guard with the pure predicate too (defensive vs clock skew / odd shapes).
    const ms = createdAtMs(data);
    if (ms != null && !isExpired(ms, now, RETENTION_DAYS)) continue;
    if (data.branchId) {
      deletedFiles += await deletePrefix(storage, storagePrefixForMessage(data.branchId, d.id), apply);
    }
    if (data.attachmentUrl) {
      const p = extractStoragePathFromUrl(data.attachmentUrl);
      if (p) { if (apply) await storage.file(p).delete().catch(() => {}); deletedFiles++; }
    }
    if (apply) await d.ref.delete();
    deletedMessages++;
  }

  // ── Pass B · orphan-sweep ─────────────────────────────────────────────────
  // List image files; group by {branchId}/{messageId}; a folder with no doc and
  // older than the grace window is an abandoned upload → delete it.
  const [allFiles] = await storage.getFiles({ prefix: `${STAFF_CHAT_STORAGE_ROOT}/`, maxResults: limit * 4 });
  const folders = new Map(); // key "branchId/messageId" → { messageId, files[], maxMs }
  for (const f of allFiles) {
    const parts = f.name.split('/'); // [root, branchId, X, ...]
    if (parts.length < 4) continue;  // legacy 3-segment {branchId}/{file} → handled in Pass A
    const branchId = parts[1], messageId = parts[2];
    const key = `${branchId}/${messageId}`;
    const tc = Date.parse((f.metadata && f.metadata.timeCreated) || '') || 0;
    const e = folders.get(key) || { messageId, files: [], maxMs: 0 };
    e.files.push(f);
    if (tc > e.maxMs) e.maxMs = tc;
    folders.set(key, e);
  }
  for (const e of folders.values()) {
    const docSnap = await db.collection(MESSAGES_COL).doc(e.messageId).get();
    if (docSnap.exists) continue;
    if (!e.maxMs) { skippedUnknownAge++; continue; } // conservative: never nuke unknown-age folder
    if (!isOrphanFolder({ docExists: false, folderCreatedMs: e.maxMs, nowMs: now })) continue;
    if (apply) await Promise.all(e.files.map(f => f.delete().catch(() => {})));
    orphanFolders++;
    orphanFiles += e.files.length;
  }

  return { scannedMessages, deletedMessages, deletedFiles, orphanFolders, orphanFiles, skippedUnknownAge, apply };
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const provided = authHeader.replace(/^Bearer\s+/i, '') || req.headers['x-cron-secret'];
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'CRON_SECRET mismatch' });
  }

  initAdmin();
  const db = getFirestore();
  const storage = getStorage().bucket();

  try {
    const result = await sweepStaffChatRetention({ db, storage, now: Date.now() });
    const auditId = `staff-chat-retention-sweep-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(AUDIT_COL).doc(auditId).set({
      op: 'staff-chat-retention-sweep',
      ...result,
      ranAt: new Date().toISOString(),
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: 'SWEEP_FAILED', message: e.message });
  }
}
