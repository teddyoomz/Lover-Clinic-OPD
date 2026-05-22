// scripts/diag-docx-font-inspect.mjs
//
// (2026-05-23 EOD+1) Rule R — read-only diagnostic for office preview LAYOUT
// fidelity. User reported the converted PDF's line-wrapping differs from MS
// Word's. Most likely cause: font metric mismatch (LibreOffice substituting
// the docx's specified font with a fallback because the font isn't installed
// in the Gotenberg Docker image).
//
// This script:
//   1. Lists recent Office attachments in canonical staff-chat collection
//   2. Downloads the chosen source .docx from Storage
//   3. Unzips it (a .docx IS a ZIP)
//   4. Parses word/fontTable.xml + word/document.xml for font references
//   5. Reports the font names the user's doc actually uses
//
// Output: list of font names the docx specifies (so we know what to install).
//
// Run: node scripts/diag-docx-font-inspect.mjs                    # list candidates + pick first
//      node scripts/diag-docx-font-inspect.mjs --msg-id <ID>     # specific message

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

const argv = process.argv.slice(2);
const idIdx = argv.indexOf('--msg-id');
const targetMsgId = idIdx >= 0 ? argv[idIdx + 1] : null;

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
  const db = getFirestore();
  const bucket = getStorage().bucket();

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Rule R — docx font inspection');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const CANONICAL = `artifacts/${APP_ID}/public/data/be_staff_chat_messages`;
  const snap = await db.collection(CANONICAL)
    .orderBy('createdAt', 'desc')
    .limit(120)
    .get();

  let chosenPath = null;
  let chosenName = null;
  snap.forEach(d => {
    if (chosenPath) return;
    const data = d.data() || {};
    const atts = Array.isArray(data.attachments) ? data.attachments : [];
    for (const a of atts) {
      if (!a || typeof a !== 'object') continue;
      const mime = String(a.mimeType || '').toLowerCase();
      if (!mime.includes('wordprocessingml.document') && !mime.includes('msword')) continue;
      if (targetMsgId && d.id !== targetMsgId) continue;
      chosenPath = a.fullPath;
      chosenName = a.name;
      console.log(`Picking: msg ${d.id} att "${chosenName}" ${(a.size/1024/1024).toFixed(2)} MB`);
      console.log(`Path:    ${chosenPath}\n`);
      return;
    }
  });

  if (!chosenPath) {
    console.log('No matching docx found.');
    process.exit(1);
  }

  // Download
  const tmpDir = '.tmp-docx-inspect';
  if (!existsSync(tmpDir)) mkdirSync(tmpDir);
  const localPath = join(tmpDir, 'user-doc.docx');
  await bucket.file(chosenPath).download({ destination: localPath });
  const sz = readFileSync(localPath).length;
  console.log(`Downloaded ${sz} bytes to ${localPath}\n`);

  // Unzip via `unzip` (Git Bash) — extract to .tmp-docx-inspect/extracted/
  const extractDir = join(tmpDir, 'extracted');
  spawnSync('rm', ['-rf', extractDir]);
  mkdirSync(extractDir);
  const unzipRes = spawnSync('unzip', ['-q', '-o', localPath, '-d', extractDir]);
  if (unzipRes.status !== 0) {
    console.error('unzip failed:', unzipRes.stderr?.toString());
    process.exit(1);
  }

  // Read word/fontTable.xml
  const fontTablePath = join(extractDir, 'word', 'fontTable.xml');
  if (existsSync(fontTablePath)) {
    const xml = readFileSync(fontTablePath, 'utf-8');
    console.log('── word/fontTable.xml ─────────────────────────────────────────');
    // Extract <w:font w:name="..."> entries
    const fontMatches = [...xml.matchAll(/<w:font\s+w:name="([^"]+)"/g)];
    const fonts = fontMatches.map(m => m[1]);
    console.log(`Declared fonts (${fonts.length}):`);
    for (const f of fonts) console.log(`  • ${f}`);
    console.log('');
  } else {
    console.log('No word/fontTable.xml found.\n');
  }

  // Read word/document.xml — look for actual rFonts in use
  const docPath = join(extractDir, 'word', 'document.xml');
  if (existsSync(docPath)) {
    const xml = readFileSync(docPath, 'utf-8');
    console.log('── word/document.xml — rFonts references (sample) ────────────');
    // Match <w:rFonts ... /> tags. Could have w:ascii, w:cs (complex script), w:eastAsia, w:hAnsi attrs.
    const rFontsMatches = [...xml.matchAll(/<w:rFonts\b[^/]*?\/>/g)];
    const inUseSet = new Set();
    for (const m of rFontsMatches) {
      const tag = m[0];
      const cs = tag.match(/w:cs="([^"]+)"/)?.[1];
      const ascii = tag.match(/w:ascii="([^"]+)"/)?.[1];
      const hAnsi = tag.match(/w:hAnsi="([^"]+)"/)?.[1];
      const ea = tag.match(/w:eastAsia="([^"]+)"/)?.[1];
      if (cs) inUseSet.add(`cs: ${cs}`);
      if (ascii) inUseSet.add(`ascii: ${ascii}`);
      if (hAnsi) inUseSet.add(`hAnsi: ${hAnsi}`);
      if (ea) inUseSet.add(`eastAsia: ${ea}`);
    }
    console.log(`Found ${rFontsMatches.length} <w:rFonts /> tags. Unique attribute->font mappings:`);
    for (const k of [...inUseSet].sort()) console.log(`  • ${k}`);
    console.log('');

    // Also look at styles.xml — that's where default fonts live
    const stylesPath = join(extractDir, 'word', 'styles.xml');
    if (existsSync(stylesPath)) {
      console.log('── word/styles.xml — default + style font definitions ────────');
      const styleXml = readFileSync(stylesPath, 'utf-8');
      const styleRFonts = [...styleXml.matchAll(/<w:rFonts\b[^/]*?\/>/g)];
      const styleSet = new Set();
      for (const m of styleRFonts) {
        const tag = m[0];
        const cs = tag.match(/w:cs="([^"]+)"/)?.[1];
        const ascii = tag.match(/w:ascii="([^"]+)"/)?.[1];
        const hAnsi = tag.match(/w:hAnsi="([^"]+)"/)?.[1];
        if (cs) styleSet.add(`cs: ${cs}`);
        if (ascii) styleSet.add(`ascii: ${ascii}`);
        if (hAnsi) styleSet.add(`hAnsi: ${hAnsi}`);
      }
      console.log(`Found ${styleRFonts.length} style <w:rFonts /> tags. Unique:`);
      for (const k of [...styleSet].sort()) console.log(`  • ${k}`);
      console.log('');
    }
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Local copy preserved at:', localPath);
  console.log('  Extracted to:', extractDir);
  console.log('═══════════════════════════════════════════════════════════════════');

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
