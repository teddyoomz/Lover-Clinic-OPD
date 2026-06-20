// scripts/diag-filler-logo-extract.mjs — Rule R — decode clinic_settings logo data-URLs → PNG files.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
function loadEnv() {
  const raw = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of raw.split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  return env;
}
function getDb() {
  if (getApps().length) return getFirestore();
  const env = loadEnv();
  initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
  return getFirestore();
}
function pngDims(buf) {
  // IHDR width/height at bytes 16-23 (big-endian)
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
async function main() {
  const db = getDb();
  const snap = await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('clinic_settings').doc('main').get();
  const d = snap.data() || {};
  for (const [field, out] of [['logoUrl', 'C:/tmp/logo-dark'], ['logoUrlLight', 'C:/tmp/logo-light']]) {
    const v = d[field];
    if (!v || typeof v !== 'string') { console.log(`${field}: EMPTY`); continue; }
    const m = v.match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) { console.log(`${field}: not a data-URL (len ${v.length}) head=${v.slice(0, 40)}`); continue; }
    const ext = m[1].split('/')[1] || 'png';
    const buf = Buffer.from(m[2], 'base64');
    const path = `${out}.${ext}`;
    writeFileSync(path, buf);
    const dims = ext === 'png' ? pngDims(buf) : null;
    console.log(`${field}: ${m[1]} ${buf.length} bytes ${dims ? dims.w + 'x' + dims.h : '(dims n/a)'} → ${path}`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
