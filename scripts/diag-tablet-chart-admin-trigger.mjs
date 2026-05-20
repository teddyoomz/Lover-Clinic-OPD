// scripts/diag-tablet-chart-admin-trigger.mjs — Rule R diag (ADMIN SDK variant).
// Drives the PC side of the tablet chart-editor relay WITHOUT client-SDK staff
// creds, by writing the session + presence + Storage template via firebase-admin.
// The tablet's onSnapshot compound-query listener fires on the write regardless of
// who authored it, so this pops a real browser tablet identically to a real PC send.
// Use when E2E_STAFF_* client creds aren't handy (companion to diag-tablet-chart-trigger.mjs).
//
// Reads .env.local.prod (Rule M/R: FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY).
// Usage:
//   node scripts/diag-tablet-chart-admin-trigger.mjs create <tabletDeviceId> <branchId>  → prints SESSION
//   node scripts/diag-tablet-chart-admin-trigger.mjs verify <sessionId>
//   node scripts/diag-tablet-chart-admin-trigger.mjs cleanup <sessionId> <tabletDeviceId>
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const APP_ID = 'loverclinic-opd-4c39b';
const P = `artifacts/${APP_ID}/public/data`;
const BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';
// tiny 1x1 transparent PNG (matches existing diag/e2e transport fixtures)
const TPL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

const [, , action, a1, a2] = process.argv;
const env = loadEnv('.env.local.prod');
initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
  }),
  storageBucket: BUCKET,
});
const db = getFirestore();
const bucket = getStorage().bucket();

async function main() {
  if (action === 'create') {
    const tablet = a1, branchId = a2;
    if (!tablet || !branchId) throw new Error('usage: create <tabletDeviceId> <branchId>');
    const sessionId = `TEST-CES-ADMIN-${Date.now()}`;
    const presRef = db.doc(`${P}/be_chart_tablet_presence/${tablet}`);
    const sesRef = db.doc(`${P}/be_chart_edit_sessions/${sessionId}`);
    const pres = await presRef.get();
    if (!pres.exists) throw new Error('tablet presence not found — is the tablet standing by?');
    // TX guard mirror: claim the tablet (busy)
    await presRef.set({ status: 'busy', updatedAt: Date.now() }, { merge: true });
    // upload template with a download token (same URL shape getDownloadURL returns)
    const token = randomBytes(16).toString('hex');
    const objPath = `uploads/chart-edit-sessions/${sessionId}/template.png`;
    const file = bucket.file(objPath);
    await file.save(Buffer.from(TPL_B64, 'base64'), {
      contentType: 'image/png',
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objPath)}?alt=media&token=${token}`;
    await sesRef.set({
      sessionId, branchId, pcDeviceId: 'DIAG-ADMIN-PC', tabletDeviceId: tablet,
      status: 'requested', cancelledBy: null,
      template: { id: 'ใบหน้าผู้หญิง', name: 'ใบหน้าผู้หญิง', category: 'head' },
      patientLabel: 'คุณ มะลิ (HN 0042)',
      templateImageUrl: url, resultImageUrl: null,
      pcHeartbeatAt: Date.now(), tabletHeartbeatAt: null,
      createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + 3600000,
    });
    console.log('SESSION=' + sessionId);
  } else if (action === 'verify') {
    const snap = await db.doc(`${P}/be_chart_edit_sessions/${a1}`).get();
    const d = snap.data() || {};
    console.log(JSON.stringify({ exists: snap.exists, status: d.status, cancelledBy: d.cancelledBy, hasResult: !!d.resultImageUrl, tabletHeartbeatAt: d.tabletHeartbeatAt }));
  } else if (action === 'presence') {
    const snap = await db.doc(`${P}/be_chart_tablet_presence/${a1}`).get();
    const d = snap.data() || {};
    const lhb = typeof d.lastHeartbeatAt === 'number' ? d.lastHeartbeatAt : 0;
    console.log(JSON.stringify({ exists: snap.exists, status: d.status, ageMs: Date.now() - lhb }));
  } else if (action === 'cleanup') {
    await db.doc(`${P}/be_chart_edit_sessions/${a1}`).delete().catch(() => {});
    if (a2) await db.doc(`${P}/be_chart_tablet_presence/${a2}`).set({ status: 'idle', updatedAt: Date.now() }, { merge: true }).catch(() => {});
    await bucket.deleteFiles({ prefix: `uploads/chart-edit-sessions/${a1}/` }).catch(() => {});
    console.log('cleaned ' + a1);
  } else {
    throw new Error('action must be create | verify | presence | cleanup');
  }
  process.exit(0);
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
