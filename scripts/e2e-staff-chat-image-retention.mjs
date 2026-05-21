// scripts/e2e-staff-chat-image-retention.mjs — Rule Q L2 real-prod proof for the
// staff-chat multi-image feature. Generates distinct solid-color PNGs, uploads
// them to real Storage under the per-message folder, writes a real message doc,
// then proves the contracts against REAL prod (not mocks).
//
//   node scripts/e2e-staff-chat-image-retention.mjs retention   # ลบจริงหายจริง proof (default)
//   node scripts/e2e-staff-chat-image-retention.mjs seed-ui      # seed a CURRENT msg for browser preview test
//   node scripts/e2e-staff-chat-image-retention.mjs cleanup <messageId> <branchId>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { sweepStaffChatRetention } from '../api/cron/staff-chat-retention-sweep.js';
import { storagePrefixForMessage } from '../src/lib/staffChatRetentionCore.js';
import { staffChatImagePaths, extForMime } from '../src/lib/staffChatImageResize.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const P = `artifacts/${APP_ID}/public/data`;
const COL = `${P}/be_staff_chat_messages`;

function loadEnv(p) { const o = {}; for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2].replace(/^"(.*)"$/, '$1'); } return o; }

// ── minimal solid-color PNG encoder (no deps) ────────────────────────────────
const CRC_TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); }
function solidPng(w, h, [r, g, b]) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), ...Array.from({ length: w }, () => Buffer.from([r, g, b]))]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
const COLORS = [[245, 158, 11], [16, 185, 129], [99, 102, 241], [236, 72, 153], [6, 182, 212]];

function init() {
  const env = loadEnv('.env.local.prod');
  if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }), storageBucket: BUCKET });
  return { db: getFirestore(), bucket: getStorage().bucket() };
}

async function uploadImage(bucket, branchId, messageId, i, color) {
  const ext = extForMime('image/png');
  const { thumbPath, fullPath } = staffChatImagePaths(branchId, messageId, `img${i}`, ext);
  const thumb = solidPng(64, 64, color);
  const full = solidPng(640, 480, color);
  const mk = async (path, buf) => {
    const token = randomBytes(16).toString('hex');
    await bucket.file(path).save(buf, { contentType: 'image/png', metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  };
  const thumbUrl = await mk(thumbPath, thumb);
  const fullUrl = await mk(fullPath, full);
  return { thumbUrl, fullUrl, thumbPath, fullPath, size: full.length, mimeType: 'image/png', w: 640, h: 480 };
}

async function seedMessage(db, bucket, { branchId, messageId, createdAtMs, count }) {
  const attachments = [];
  for (let i = 0; i < count; i++) attachments.push(await uploadImage(bucket, branchId, messageId, i, COLORS[i % COLORS.length]));
  await db.collection(COL).doc(messageId).set({
    id: messageId, branchId, displayName: 'E2E ทดสอบ', deviceId: 'E2E-DEV',
    text: `E2E multi-image ${count} รูป`, attachments,
    createdAt: Timestamp.fromMillis(createdAtMs),
  });
  return attachments;
}

async function findFiles(bucket, prefix) { const [f] = await bucket.getFiles({ prefix }); return f.map(x => x.name); }

async function modeRetention() {
  const { db, bucket } = init();
  const branchId = `TEST-BR-${Date.now()}`;
  const messageId = `TEST-CHAT-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const prefix = storagePrefixForMessage(branchId, messageId);
  const DAY = 86400000;
  console.log(`\n=== PHASE A · RETENTION DELETION PROOF ===`);
  console.log(`seed: ${messageId} (branch ${branchId}), createdAt = 31 days ago`);
  await seedMessage(db, bucket, { branchId, messageId, createdAtMs: Date.now() - 31 * DAY, count: 3 });
  const before = await findFiles(bucket, prefix);
  const docBefore = (await db.collection(COL).doc(messageId).get()).exists;
  console.log(`uploaded: ${before.length} files (expect 6 = 3×[thumb+original]); doc exists: ${docBefore}`);
  console.log('files:', before);
  console.log(`\nrunning sweep --apply (real prod)...`);
  const r = await sweepStaffChatRetention({ db, storage: bucket, now: Date.now(), apply: true });
  console.log('sweep result:', JSON.stringify(r));
  const after = await findFiles(bucket, prefix);
  const docAfter = (await db.collection(COL).doc(messageId).get()).exists;
  console.log(`\nAFTER SWEEP → files under prefix: ${after.length} (expect 0); doc exists: ${docAfter} (expect false)`);
  const pass = before.length === 6 && docBefore === true && after.length === 0 && docAfter === false;
  console.log(pass ? '\n✅ PASS — ลบจริงหายจริง (0 files, doc gone)' : '\n❌ FAIL');
  // safety net: if anything left, force-clean the test fixture
  if (after.length > 0) { await Promise.all((await bucket.getFiles({ prefix }))[0].map(f => f.delete().catch(() => {}))); }
  if (docAfter) await db.collection(COL).doc(messageId).delete().catch(() => {});
  process.exitCode = pass ? 0 : 1;
}

async function modeSeedUi() {
  const { db, bucket } = init();
  // resolve นครราชสีมา branchId from be_branches (must match the chat's selected branch)
  const branches = await db.collection(`${P}/be_branches`).get();
  let branchId = null;
  branches.forEach(d => { const n = d.data().name || d.data().branchName || ''; if (!branchId && /นครราช/.test(n)) branchId = d.id; });
  if (!branchId && !branches.empty) branchId = branches.docs[0].id;
  const messageId = `E2E-UI-CHAT-${Date.now()}-${randomBytes(3).toString('hex')}`;
  console.log(`\n=== SEED-UI · branch ${branchId} ===`);
  await seedMessage(db, bucket, { branchId, messageId, createdAtMs: Date.now(), count: 5 });
  console.log(`✅ seeded 5-image message for browser preview test`);
  console.log(`MESSAGE_ID=${messageId}`);
  console.log(`BRANCH_ID=${branchId}`);
  console.log(`cleanup later: node scripts/e2e-staff-chat-image-retention.mjs cleanup ${messageId} ${branchId}`);
}

async function modeCleanup(messageId, branchId) {
  const { db, bucket } = init();
  const prefix = storagePrefixForMessage(branchId, messageId);
  const [files] = await bucket.getFiles({ prefix });
  await Promise.all(files.map(f => f.delete().catch(() => {})));
  await db.collection(COL).doc(messageId).delete().catch(() => {});
  console.log(`✅ cleaned ${messageId}: ${files.length} files + doc removed`);
}

async function modeGenFiles(dir = '.tmp-staffchat-test') {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  mkdirSync(dir, { recursive: true });
  const specs = [[800, 600, [239, 68, 68]], [1024, 768, [34, 197, 94]], [900, 700, [59, 130, 246]]];
  const paths = specs.map(([w, h, c], i) => { const p = resolve(`${dir}/staffchat-test-${i}.png`); writeFileSync(p, solidPng(w, h, c)); return p; });
  console.log('wrote test images:');
  paths.forEach(p => console.log('  ' + p));
}

async function modeListRecent(branchId, minutes = 20) {
  const { db } = init();
  const since = Timestamp.fromMillis(Date.now() - minutes * 60000);
  const snap = await db.collection(COL).where('createdAt', '>=', since).get();
  console.log(`recent messages (<=${minutes}min) in branch ${branchId} with attachments:`);
  snap.forEach(d => {
    const x = d.data();
    if (x.branchId !== branchId) return;
    const n = (x.attachments || []).length;
    if (n === 0) return;
    console.log(`  ${d.id} | atts:${n} | name:${x.displayName} | text:${JSON.stringify(x.text || '')}`);
  });
}

async function main() {
  const mode = process.argv[2] || 'retention';
  if (mode === 'retention') await modeRetention();
  else if (mode === 'seed-ui') await modeSeedUi();
  else if (mode === 'genfiles') await modeGenFiles(process.argv[3]);
  else if (mode === 'list-recent') await modeListRecent(process.argv[3], Number(process.argv[4]) || 20);
  else if (mode === 'cleanup') await modeCleanup(process.argv[3], process.argv[4]);
  else { console.error('unknown mode'); process.exitCode = 1; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(process.exitCode || 0)).catch(e => { console.error(e); process.exit(1); });
}
