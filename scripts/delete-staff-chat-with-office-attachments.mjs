// scripts/delete-staff-chat-with-office-attachments.mjs
//
// (2026-05-23 EOD+1 LATE) Rule M two-phase data op — delete EVERY staff-chat
// message that has ≥1 Office attachment (Word/Excel/PowerPoint/CSV, per the
// V108 OFFICE_CONVERTIBLE_MIMES whitelist) + its Storage objects (source files
// AND any cached .pdf preview alongside).
//
// User directive 2026-05-23 EOD+1 LATE: "dryrun ลบแชทที่อัพไฟล์ .doc ทิ้งให้หมด"
// → broad interpretation = all Office formats (default). Narrow per-format
// filtering available via flags.
//
// DRY-RUN by default. --apply commits writes + writes an audit doc.
// Mirrors scripts/delete-staff-chat-today.mjs pattern (Rule of 3).
//
// Usage:
//   node scripts/delete-staff-chat-with-office-attachments.mjs                    # broad dry-run
//   node scripts/delete-staff-chat-with-office-attachments.mjs --scope=word       # only .doc + .docx
//   node scripts/delete-staff-chat-with-office-attachments.mjs --scope=excel      # only .xls + .xlsx
//   node scripts/delete-staff-chat-with-office-attachments.mjs --apply            # COMMIT (after explicit user OK)
//
// SAFETY NOTES (per feedback_surprising_destructive_scope_callout.md):
//   - Only touches be_staff_chat_messages where attachments[].mimeType matches.
//   - Does NOT touch opd_sessions, chat_conversations, chat_history,
//     be_appointments, be_customers, or anything else.
//   - Per-MIME breakdown printed so admin can verify scope before --apply.
//   - Logs every msg's text/displayName so admin can spot "important" chats
//     that happen to have a docx attachment.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { storagePrefixForMessage, extractStoragePathFromUrl } from '../src/lib/staffChatRetentionCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const MSG_COL = `artifacts/${APP_ID}/public/data/be_staff_chat_messages`;
const AUDIT_COL = `artifacts/${APP_ID}/public/data/be_admin_audit`;

// V108 OFFICE_CONVERTIBLE_MIMES — same whitelist the Cloud Function uses.
const OFFICE_MIMES = {
  'application/msword':                                                                  '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':             '.docx',
  'application/vnd.ms-excel':                                                            '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':                   '.xlsx',
  'application/vnd.ms-powerpoint':                                                       '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':           '.pptx',
  'text/csv':                                                                            '.csv',
};
const WORD_MIMES = new Set(['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const EXCEL_MIMES = new Set(['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const PPT_MIMES = new Set(['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']);

function loadEnv(p) {
  const o = {};
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) o[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return o;
}

function parseScope() {
  const scope = (process.argv.find((a) => a.startsWith('--scope='))?.split('=')[1] || 'all').toLowerCase();
  if (scope === 'word') return { name: 'word (.doc + .docx)', match: (mime) => WORD_MIMES.has(mime) };
  if (scope === 'excel') return { name: 'excel (.xls + .xlsx)', match: (mime) => EXCEL_MIMES.has(mime) };
  if (scope === 'ppt' || scope === 'powerpoint') return { name: 'powerpoint (.ppt + .pptx)', match: (mime) => PPT_MIMES.has(mime) };
  if (scope === 'csv') return { name: 'csv', match: (mime) => mime === 'text/csv' };
  return { name: 'all-office (Word + Excel + PowerPoint + CSV)', match: (mime) => mime in OFFICE_MIMES };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const scope = parseScope();
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

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  delete-staff-chat-with-office-attachments  [${apply ? 'APPLY' : 'DRY-RUN'}]`);
  console.log(`  Scope: ${scope.name}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Fetch ALL recent staff-chat messages (no date filter — user said "ทิ้งให้หมด").
  // We then filter in-JS by attachment MIME. Firestore can't query nested
  // array-of-map attributes efficiently without a where('attachments', 'array-contains', X)
  // which won't match by .mimeType field. So we scan recent ~1000 and filter.
  const snap = await db.collection(MSG_COL).orderBy('createdAt', 'desc').limit(1000).get();
  console.log(`Scanned ${snap.size} most-recent messages from ${MSG_COL}\n`);

  const candidates = [];
  const mimeCounts = {};
  let scannedWithAtts = 0;

  for (const doc of snap.docs) {
    const m = doc.data() || {};
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    if (atts.length === 0 && !m.attachmentUrl && !m.attachmentMimeType) continue;
    scannedWithAtts++;

    // Match if ANY attachment has an Office MIME in scope
    const matchingAtts = atts.filter((a) => a && typeof a.mimeType === 'string' && scope.match(a.mimeType));
    // Also check legacy scalar attachmentMimeType (V73 backward-compat)
    const legacyMatch = (typeof m.attachmentMimeType === 'string' && scope.match(m.attachmentMimeType));
    if (matchingAtts.length === 0 && !legacyMatch) continue;

    // Count per-MIME for the breakdown
    for (const a of matchingAtts) {
      const ext = OFFICE_MIMES[a.mimeType] || a.mimeType;
      mimeCounts[ext] = (mimeCounts[ext] || 0) + 1;
    }
    if (legacyMatch) {
      const ext = OFFICE_MIMES[m.attachmentMimeType] || m.attachmentMimeType;
      mimeCounts[ext] = (mimeCounts[ext] || 0) + 1;
    }

    const branchId = m.branchId || '';
    const created = m.createdAt?.toDate ? m.createdAt.toDate() : null;
    const prefix = storagePrefixForMessage(branchId, doc.id);
    const [files] = await bucket.getFiles({ prefix });
    const paths = files.map((f) => f.name);
    if (m.attachmentUrl) {
      const p = extractStoragePathFromUrl(m.attachmentUrl);
      if (p && !paths.includes(p)) paths.push(p);
    }

    candidates.push({
      id: doc.id,
      branchId,
      created,
      displayName: m.displayName || '',
      text: m.text || '',
      attCount: atts.length,
      matchingAttCount: matchingAtts.length,
      matchingAttNames: matchingAtts.map((a) => a.name || '(unnamed)'),
      otherAttNames: atts.filter((a) => !matchingAtts.includes(a)).map((a) => a.name || '(unnamed)'),
      storagePaths: paths,
    });
  }

  console.log(`Candidates: ${candidates.length} messages (out of ${scannedWithAtts} with attachments)\n`);

  // Print per-MIME breakdown
  console.log('── Per-MIME breakdown of office attachments inside candidates ─────');
  for (const [ext, n] of Object.entries(mimeCounts).sort()) {
    console.log(`  ${ext.padEnd(8)} ${n}`);
  }
  console.log('');

  // Sort newest-first
  candidates.sort((a, b) => (b.created?.getTime?.() || 0) - (a.created?.getTime?.() || 0));

  // Print each candidate
  console.log('── Candidates (newest-first) ─────────────────────────────────────');
  let totalStorage = 0;
  for (const c of candidates) {
    totalStorage += c.storagePaths.length;
    const when = c.created ? c.created.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) : '?';
    console.log(`  ${c.id}`);
    console.log(`    when:        ${when} (Bangkok)`);
    console.log(`    branchId:    ${c.branchId}`);
    console.log(`    displayName: ${c.displayName}`);
    if (c.text) console.log(`    text:        ${c.text.slice(0, 80)}`);
    console.log(`    attachments: ${c.attCount} total (${c.matchingAttCount} in scope)`);
    for (const n of c.matchingAttNames) console.log(`      ⚠ in-scope:  ${n}`);
    for (const n of c.otherAttNames) console.log(`      ✓ kept:      ${n}`);
    console.log(`    storage:     ${c.storagePaths.length} object(s) under staff-chat-attachments/${c.branchId}/${c.id}/`);
    for (const p of c.storagePaths) console.log(`      • ${p}`);
    console.log('');
  }

  // SAFETY callout (per feedback_surprising_destructive_scope_callout.md)
  const messagesWithOther = candidates.filter((c) => c.otherAttNames.length > 0);
  const messagesWithText = candidates.filter((c) => (c.text || '').trim().length > 0);
  if (messagesWithOther.length > 0 || messagesWithText.length > 0) {
    console.log('⚠  SURPRISING-SCOPE CALLOUT (per feedback_surprising_destructive_scope_callout.md):');
    if (messagesWithOther.length > 0) {
      console.log(`   • ${messagesWithOther.length} message(s) also have non-office attachments that would be DELETED with the message.`);
      console.log(`     If you want to preserve those, this script needs an "edit-only-the-attachment" mode (not implemented; --apply deletes the WHOLE message).`);
    }
    if (messagesWithText.length > 0) {
      console.log(`   • ${messagesWithText.length} message(s) have non-empty text body that would be DELETED too.`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  TOTAL ${apply ? 'WILL DELETE' : 'WOULD DELETE'}: ${candidates.length} messages + ${totalStorage} Storage objects`);
  console.log('═══════════════════════════════════════════════════════════════════');

  if (apply) {
    // Two-phase: confirm-by-flag passed; commit deletes
    let deletedMsgs = 0, deletedFiles = 0;
    for (const c of candidates) {
      for (const p of c.storagePaths) {
        try { await bucket.file(p).delete(); deletedFiles++; } catch { /* already gone */ }
      }
      await db.collection(MSG_COL).doc(c.id).delete().catch(() => {});
      deletedMsgs++;
    }
    const auditId = `delete-staff-chat-office-attachments-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(AUDIT_COL).doc(auditId).set({
      op: 'delete-staff-chat-with-office-attachments',
      scope: scope.name,
      deletedMessages: deletedMsgs,
      deletedStorageObjects: deletedFiles,
      candidateMsgIds: candidates.map((c) => c.id),
      mimeBreakdown: mimeCounts,
      appliedAt: FieldValue.serverTimestamp(),
      ranAt: new Date().toISOString(),
    });
    console.log(`\nAPPLIED. Deleted ${deletedMsgs} messages + ${deletedFiles} Storage objects.`);
    console.log(`Audit doc: be_admin_audit/${auditId}`);
  } else {
    console.log('\nDRY-RUN only — NOTHING deleted.');
    console.log('Re-run with --apply (after explicit user OK) to commit deletes.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
