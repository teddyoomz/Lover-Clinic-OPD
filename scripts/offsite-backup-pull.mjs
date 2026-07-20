// ─── offsite-backup-pull.mjs (2026-07-21) — OFF-PROJECT backup copy ─────────
// Downloads the LATEST manifest-valid whole-system backup folder from the prod
// Firebase Storage bucket to a LOCAL directory — because every backup lives in
// the SAME Firebase project as production: loss/suspension/compromise of that
// one project destroys prod data AND all backups simultaneously. This script
// is the off-site leg. Run weekly (manually or via Windows Task Scheduler):
//
//   node scripts/offsite-backup-pull.mjs                 → F:\LoverClinic-backups
//   node scripts/offsite-backup-pull.mjs --dest D:\bk    → custom destination
//
// Verifies BEFORE trusting: manifestHash recomputed via the SAME core helper
// the backup writer uses + per-collection sha256 of every downloaded file.
// Keeps the newest 4 local copies (prunes older). READ-ONLY vs prod (Rule R).
import { readFileSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { computeWholeSystemManifestHash } from '../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';
const PREFIX = 'backups/whole-system';
const KEEP_LOCAL = 4;
const destArg = process.argv.indexOf('--dest');
const DEST_ROOT = destArg > -1 ? process.argv[destArg + 1] : 'F:\\LoverClinic-backups';

function loadEnv() {
  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) return;
  const raw = readFileSync(new URL('../.env.local.prod', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const sha256 = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

async function main() {
  loadEnv();
  if (!getApps().length) {
    const pk = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: pk }),
      storageBucket: BUCKET,
    });
  }
  const bucket = getStorage().bucket();

  // 1. Find the newest folder that HAS a manifest.json
  const [files] = await bucket.getFiles({ prefix: `${PREFIX}/` });
  const folders = new Map(); // name → {files: [], hasManifest}
  for (const f of files) {
    const m = f.name.match(/^backups\/whole-system\/([^/]+)\/(.+)$/);
    if (!m) continue;
    if (!folders.has(m[1])) folders.set(m[1], { files: [], hasManifest: false });
    const e = folders.get(m[1]);
    e.files.push(f);
    if (m[2] === 'manifest.json') e.hasManifest = true;
  }
  // Sort by the EMBEDDED datetime, not the raw name — lexicographic name-sort
  // ranks every `manual-*` after every `auto-*` ('m' > 'a'), which made the
  // first run of this script pick a 2-month-old manual backup over last
  // night's auto (self-caught 2026-07-21). `<type>-YYYYMMDD-HHMM` → numeric key.
  const dtKey = (name) => {
    const m = name.match(/-(\d{8})-(\d{4})$/);
    return m ? Number(m[1] + m[2]) : 0;
  };
  const valid = [...folders.entries()].filter(([, e]) => e.hasManifest).map(([name]) => name)
    .sort((a, b) => dtKey(a) - dtKey(b));
  if (!valid.length) { console.error('✗ NO manifest-valid backup folder found — investigate the backup cron NOW'); process.exit(1); }
  const target = valid[valid.length - 1];
  const entry = folders.get(target);
  console.log(`latest valid backup: ${target} (${entry.files.length} files)`);

  if (existsSync(join(DEST_ROOT, target, 'manifest.json'))) {
    console.log(`✓ already pulled to ${join(DEST_ROOT, target)} — nothing to do (idempotent)`);
    prune();
    process.exit(0);
  }

  // 2. Download all files
  const destDir = join(DEST_ROOT, target);
  let bytes = 0;
  for (const f of entry.files) {
    const rel = f.name.replace(`${PREFIX}/${target}/`, '');
    const local = join(destDir, rel);
    mkdirSync(dirname(local), { recursive: true });
    const [buf] = await f.download();
    writeFileSync(local, buf);
    bytes += buf.length;
  }
  console.log(`downloaded ${entry.files.length} files · ${(bytes / 1024 / 1024).toFixed(1)} MB → ${destDir}`);

  // 3. Verify: manifestHash (same core helper as the writer) + per-file sha256
  const manifest = JSON.parse(readFileSync(join(destDir, 'manifest.json'), 'utf8'));
  const recomputed = computeWholeSystemManifestHash(manifest);
  if (recomputed !== manifest.manifestHash) {
    console.error(`✗ manifestHash MISMATCH — stored ${manifest.manifestHash} vs recomputed ${recomputed}`);
    process.exit(1);
  }
  let hashOk = 0, hashFail = 0;
  for (const c of manifest.collections || []) {
    try {
      const buf = readFileSync(join(destDir, c.path));
      if (sha256(buf) === c.fileHash) hashOk += 1;
      else { hashFail += 1; console.error(`  ✗ hash mismatch: ${c.path}`); }
    } catch { hashFail += 1; console.error(`  ✗ missing file: ${c.path}`); }
  }
  console.log(`per-collection sha256: ${hashOk} ok / ${hashFail} fail`);
  if (hashFail) { console.error('✗ VERIFY FAILED — do not trust this copy'); process.exit(1); }

  prune();
  console.log(`✓ OFF-SITE COPY VERIFIED — ${target} (${manifest.collections?.length || 0} collections, manifestHash ok)`);
  process.exit(0);

  function prune() {
    try {
      const local = readdirSync(DEST_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^(auto|manual)-/.test(d.name))
        .map((d) => d.name).sort();
      for (const old of local.slice(0, Math.max(0, local.length - KEEP_LOCAL))) {
        rmSync(join(DEST_ROOT, old), { recursive: true, force: true });
        console.log(`pruned old local copy: ${old}`);
      }
    } catch { /* dest may not exist yet */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
}
