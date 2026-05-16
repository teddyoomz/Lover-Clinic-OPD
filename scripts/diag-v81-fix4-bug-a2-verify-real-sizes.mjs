#!/usr/bin/env node
// scripts/diag-v81-fix4-bug-a2-verify-real-sizes.mjs
//
// Rule R diag — verify V81-fix4 Bug A2 fix on real prod Storage:
//   - Mirror the list endpoint's folder-size computation logic
//   - Confirm current V81 backups have realistic MB sizes (not 0)
//   - Report per-folder totalBytes + fileCount

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  for (const name of ['.env.local.prod', '.env.local', '.env']) {
    try {
      const path = resolve(REPO_ROOT, name);
      const txt = readFileSync(path, 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (!m) continue;
        const [, k, v] = m;
        if (!process.env[k]) process.env[k] = v.replace(/^"|"$/g, '');
      }
      return;
    } catch { /* try next */ }
  }
}

function initAdmin() {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

async function main() {
  loadEnv();
  initAdmin();
  const bucket = getStorage().bucket();

  console.log('\n=== Rule R diag — Bug A2 verification (real V81 backup sizes) ===\n');

  const [files] = await bucket.getFiles({ prefix: 'backups/whole-system/' });
  const folders = new Map();
  for (const f of files) {
    const m = f.name.match(/^backups\/whole-system\/([^/]+)\//);
    if (!m) continue;
    const folder = m[1];
    const sizeBytes = parseInt(f.metadata?.size || '0', 10);
    if (!folders.has(folder)) folders.set(folder, { count: 0, bytes: 0 });
    const entry = folders.get(folder);
    entry.count += 1;
    entry.bytes += sizeBytes;
  }

  if (folders.size === 0) {
    console.log('No whole-system backups currently on Storage.');
    return;
  }

  console.log('Folder                        | Files | Size');
  console.log('-'.repeat(60));
  let allRealistic = true;
  const sorted = [...folders.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  for (const [name, entry] of sorted) {
    const mb = (entry.bytes / 1024 / 1024).toFixed(2);
    const kb = (entry.bytes / 1024).toFixed(1);
    const display = entry.bytes >= 1024 * 1024 ? `${mb} MB` : `${kb} KB`;
    console.log(`${name.padEnd(30)} | ${String(entry.count).padStart(5)} | ${display}`);
    if (entry.bytes < 1024) allRealistic = false; // <1KB is suspicious
  }

  console.log('\n=== Conclusion ===');
  console.log(`Total folders: ${folders.size}`);
  console.log(`All realistic sizes (>1 KB each): ${allRealistic ? '✅ YES — Bug A2 fix verified' : '❌ NO — some folders are suspiciously small'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
