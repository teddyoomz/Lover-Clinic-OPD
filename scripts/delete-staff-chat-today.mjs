// scripts/delete-staff-chat-today.mjs — Rule M two-phase data op.
// Delete ALL of TODAY's (Asia/Bangkok) staff-chat messages + their Storage
// attachments. DRY-RUN by default; --apply commits + writes an audit doc.
// Reuses staffChatRetentionCore helpers (Rule of 3 — same prefix/url logic the
// retention cron uses).
//   vercel env pull .env.local.prod --environment=production   # once
//   node scripts/delete-staff-chat-today.mjs                   # dry-run (report only)
//   node scripts/delete-staff-chat-today.mjs --apply           # delete (after explicit user OK)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { storagePrefixForMessage, extractStoragePathFromUrl } from '../src/lib/staffChatRetentionCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const MSG_COL = `artifacts/${APP_ID}/public/data/be_staff_chat_messages`;
const AUDIT_COL = `artifacts/${APP_ID}/public/data/be_admin_audit`;

function loadEnv(p) {
  const o = {};
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) o[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return o;
}

// Asia/Bangkok (UTC+7) calendar-day window for `now` → [startMs, endMs) in UTC ms.
function bangkokDayWindow(now = new Date()) {
  const bkk = new Date(now.getTime() + 7 * 3600 * 1000);
  const y = bkk.getUTCFullYear(), mo = bkk.getUTCMonth(), d = bkk.getUTCDate();
  const startMs = Date.UTC(y, mo, d, 0, 0, 0) - 7 * 3600 * 1000;
  return { startMs, endMs: startMs + 24 * 3600 * 1000, label: `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv('.env.local.prod');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const { startMs, endMs, label } = bangkokDayWindow();

  console.log(`[delete-staff-chat-today] ${apply ? 'APPLY (DELETING)' : 'DRY-RUN (report only)'}`);
  console.log(`Day (Bangkok): ${label}   window UTC [${new Date(startMs).toISOString()} .. ${new Date(endMs).toISOString()})`);

  const snap = await db.collection(MSG_COL)
    .where('createdAt', '>=', Timestamp.fromMillis(startMs))
    .where('createdAt', '<', Timestamp.fromMillis(endMs))
    .get();

  let totalAtt = 0, totalStorage = 0;
  const rows = [];
  for (const doc of snap.docs) {
    const m = doc.data();
    const branchId = m.branchId || '';
    const created = m.createdAt?.toDate ? m.createdAt.toDate() : null;
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    totalAtt += atts.length;
    const prefix = storagePrefixForMessage(branchId, doc.id);
    const [files] = await bucket.getFiles({ prefix });
    const paths = files.map((f) => f.name);
    if (m.attachmentUrl) {
      const p = extractStoragePathFromUrl(m.attachmentUrl);
      if (p && !paths.includes(p)) paths.push(p);
    }
    totalStorage += paths.length;
    rows.push({
      id: doc.id,
      time: created ? created.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) : '?',
      name: (m.displayName || '').slice(0, 14),
      text: (m.text || '').replace(/\s+/g, ' ').slice(0, 22),
      att: atts.length,
      files: paths.length,
    });
    if (apply) {
      for (const p of paths) { try { await bucket.file(p).delete(); } catch { /* already gone */ } }
      await doc.ref.delete();
    }
  }

  console.table(rows);
  console.log(`TOTAL today: ${snap.size} messages | ${totalAtt} attachments | ${totalStorage} Storage objects`);

  if (apply) {
    const id = `delete-staff-chat-today-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(AUDIT_COL).doc(id).set({
      op: 'delete-staff-chat-today', dayBangkok: label,
      deletedMessages: snap.size, deletedAttachments: totalAtt, deletedStorageObjects: totalStorage,
      appliedAt: FieldValue.serverTimestamp(), ranAt: new Date().toISOString(),
    });
    console.log('APPLIED. audit:', id);
  } else {
    console.log('DRY-RUN only — NOTHING deleted. Re-run with --apply (after explicit user OK) to delete.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
