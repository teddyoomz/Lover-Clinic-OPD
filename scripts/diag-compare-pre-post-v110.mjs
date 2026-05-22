// scripts/diag-compare-pre-post-v110.mjs
// Download one of the pre-V110 cached PDFs (from the user's stuck attachments)
// and compute md5 + size for diff vs the v110-result.pdf.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

async function main() {
  const envText = readFileSync('.env.local.prod', 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
    if (m) process.env[m[1]] = m[3];
  }
  if (getApps().length === 0) {
    const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
      storageBucket: BUCKET,
    });
  }
  const bucket = getStorage().bucket();

  const PRE_PATH = 'staff-chat-attachments/BR-1777873556815-26df6480/CHAT-1779474473885-958a715e/29c09b39-o.docx.pdf';
  console.log(`Downloading pre-V110 PDF from ${PRE_PATH}`);
  const localPre = '.tmp-docx-inspect/pre-v110-result.pdf';
  await bucket.file(PRE_PATH).download({ destination: localPre });
  const preBuf = readFileSync(localPre);
  const preMd5 = createHash('md5').update(preBuf).digest('hex');
  console.log(`  size: ${preBuf.length}  md5: ${preMd5}\n`);

  const postBuf = readFileSync('.tmp-docx-inspect/v110-result.pdf');
  const postMd5 = createHash('md5').update(postBuf).digest('hex');
  console.log(`Post-V110 (just converted): .tmp-docx-inspect/v110-result.pdf`);
  console.log(`  size: ${postBuf.length}  md5: ${postMd5}\n`);

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Identical bytes? ${preMd5 === postMd5 ? '⚠  YES — V110 had NO effect' : '✓ NO — V110 produced different output'}`);
  console.log('═══════════════════════════════════════════════════════════════════');

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
