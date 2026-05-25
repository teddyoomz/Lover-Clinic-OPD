// DIAG (Rule R, READ-ONLY) — quantify the "รูปภาพการรักษา save sometimes/laggy"
// report. Measures be_treatments doc sizes + locates EVERY inline `data:` base64
// blob (photos / lab images / PDFs) vs Firebase Storage URLs (`http`). Confirms
// whether inline-base64 photos push docs toward the 1 MiB Firestore doc cap.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.argv[1] !== fileURLToPath(import.meta.url)) { process.exit(1); }
const APP_ID = 'loverclinic-opd-4c39b';
const CAP = 1048576; // 1 MiB Firestore doc cap
const env = (await readFile('.env.local.prod', 'utf8'))
  .split('\n').filter(Boolean).reduce((acc, line) => {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/); if (m) acc[m[1]] = m[2]; return acc;
  }, {});
initializeApp({ credential: cert({
  projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
}) });
const db = getFirestore();
const base = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

// Recursively find every inline base64 `data:` string + its path + length.
function findInlineBlobs(obj, path = '', out = []) {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    if (obj.startsWith('data:')) out.push({ path, len: obj.length });
    return out;
  }
  if (Array.isArray(obj)) { obj.forEach((v, i) => findInlineBlobs(v, `${path}[${i}]`, out)); return out; }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) findInlineBlobs(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

const snap = await base.collection('be_treatments').orderBy('createdAt', 'desc').limit(400).get();
console.log(`Scanned ${snap.size} most-recent be_treatments.\n`);

const rows = [];
let inlinePhotoDocs = 0, storagePhotoDocs = 0;
let over800k = 0, over1mb = 0;
const groupKeyAgg = {}; // path-prefix → {docs, totalLen, maxLen}

snap.forEach(d => {
  const data = d.data();
  const size = Buffer.byteLength(JSON.stringify(data), 'utf8');
  const blobs = findInlineBlobs(data);
  const inlineBytes = blobs.reduce((s, b) => s + b.len, 0);

  const detail = data.detail || {};
  const before = (detail.beforeImages || data.beforeImages || []);
  const after = (detail.afterImages || data.afterImages || []);
  const other = (detail.otherImages || data.otherImages || []);
  const photoEntries = [...before, ...after, ...other];
  const hasInlinePhoto = photoEntries.some(p => typeof p?.dataUrl === 'string' && p.dataUrl.startsWith('data:'));
  const hasStoragePhoto = photoEntries.some(p => typeof p?.dataUrl === 'string' && p.dataUrl.startsWith('http'));
  if (hasInlinePhoto) inlinePhotoDocs++;
  if (hasStoragePhoto) storagePhotoDocs++;
  if (size > 800 * 1024) over800k++;
  if (size > CAP) over1mb++;

  // aggregate by top-level blob group (beforeImages / labItems / treatmentFiles / charts ...)
  blobs.forEach(b => {
    const key = b.path.replace(/\[\d+\]/g, '[]').split('.').slice(0, 2).join('.');
    const g = groupKeyAgg[key] || (groupKeyAgg[key] = { docs: new Set(), totalLen: 0, maxLen: 0, count: 0 });
    g.docs.add(d.id); g.totalLen += b.len; g.count++; g.maxLen = Math.max(g.maxLen, b.len);
  });

  rows.push({ id: d.id, date: data.createdAt, size, inlineBytes, nBlobs: blobs.length,
    before: before.length, after: after.length, other: other.length, hasInlinePhoto, hasStoragePhoto });
});

const kb = n => (n / 1024).toFixed(0) + 'KB';
const pct = n => ((n / CAP) * 100).toFixed(0) + '% of cap';

console.log('=== TOP 12 LARGEST be_treatments docs ===');
rows.sort((a, b) => b.size - a.size).slice(0, 12).forEach(r => {
  console.log(`  ${r.id}  size=${kb(r.size)} (${pct(r.size)})  inlineBlobs=${r.nBlobs} (${kb(r.inlineBytes)})  photos[B/A/O]=${r.before}/${r.after}/${r.other}  ${r.hasInlinePhoto ? 'INLINE' : r.hasStoragePhoto ? 'storage-url' : '-'}`);
});

console.log('\n=== INLINE-BLOB GROUPS (where the base64 lives) ===');
Object.entries(groupKeyAgg).sort((a, b) => b[1].totalLen - a[1].totalLen).forEach(([k, g]) => {
  console.log(`  ${k.padEnd(28)} docs=${g.docs.size}  blobs=${g.count}  total=${kb(g.totalLen)}  maxSingle=${kb(g.maxLen)}`);
});

console.log('\n=== SUMMARY ===');
console.log(`  docs scanned:            ${snap.size}`);
console.log(`  docs w/ INLINE photos:   ${inlinePhotoDocs}`);
console.log(`  docs w/ Storage-URL photos: ${storagePhotoDocs}`);
console.log(`  docs > 800KB:            ${over800k}`);
console.log(`  docs > 1 MiB (over cap): ${over1mb}`);
const largest = rows[0];
console.log(`  largest doc:             ${largest?.id} = ${kb(largest?.size || 0)} (${pct(largest?.size || 0)})`);
console.log(`\nNOTE: JSON byte-length ~= Firestore doc size (proxy). A treatment that adds`);
console.log(`a few more inline photos to a near-cap doc will be REJECTED on save.`);
process.exit(0);
