#!/usr/bin/env node
/**
 * Rule M one-shot — chat_history retention = 1 day.
 * Deletes all chat_history docs where resolvedAt < (now - 24h).
 *
 * User directive (2026-05-24): "ทำให้ chat_history ลบเหลือเก็บแค่วันเดียวพอ"
 *
 * Two-phase:
 *   node scripts/rule-m-cleanup-chat-history-1day.mjs           # dry-run
 *   node scripts/rule-m-cleanup-chat-history-1day.mjs --apply   # commit
 *
 * Idempotent: re-run with --apply yields 0 writes after cleanup.
 * Audit doc: be_admin_audit/rule-m-cleanup-chat-history-{ts}-{rand}
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ID = 'loverclinic-opd-4c39b';
const RETENTION_HOURS = 24; // 1 day

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local.prod');
  const content = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });

  const db = getFirestore();
  const BASE = `artifacts/${APP_ID}/public/data`;
  const col = db.collection(`${BASE}/chat_history`);

  const cutoffMs = Date.now() - RETENTION_HOURS * 3600 * 1000;
  const cutoffDate = new Date(cutoffMs);

  const mode = apply ? '🔥 APPLY' : '🔍 DRY-RUN';
  console.log(`\n=== ${mode} — chat_history retention = ${RETENTION_HOURS}h ===`);
  console.log(`Cutoff: ${cutoffDate.toISOString()} (anything OLDER than this gets deleted)\n`);

  // Read all chat_history
  const t0 = Date.now();
  const allSnap = await col.get();
  console.log(`Total chat_history docs: ${allSnap.size} (fetch ${Date.now() - t0}ms)`);

  // Classify: which are older than 1 day?
  const toDelete = [];
  const toKeep = [];
  const noResolvedAt = [];
  for (const d of allSnap.docs) {
    const data = d.data();
    const r = data.resolvedAt;
    let ms;
    if (r?.toMillis) ms = r.toMillis();
    else if (r?._seconds) ms = r._seconds * 1000 + (r._nanoseconds || 0) / 1e6;
    else if (typeof r === 'string') ms = Date.parse(r);
    else if (typeof r === 'number') ms = r;

    if (!ms || isNaN(ms)) {
      // No valid resolvedAt — fallback to createdAt or lastMessageAt
      const fallback = data.createdAt || data.lastMessageAt;
      if (fallback?.toMillis) ms = fallback.toMillis();
      else if (fallback?._seconds) ms = fallback._seconds * 1000;
    }

    if (!ms) {
      noResolvedAt.push(d.id);
    } else if (ms < cutoffMs) {
      toDelete.push({ id: d.id, ms, displayName: data.displayName || '(no name)' });
    } else {
      toKeep.push({ id: d.id, ms });
    }
  }

  console.log(`\nClassification:`);
  console.log(`  📋 Keep (< ${RETENTION_HOURS}h old):  ${toKeep.length}`);
  console.log(`  🗑  Delete (older):              ${toDelete.length}`);
  console.log(`  ❓ No timestamp (skipped):       ${noResolvedAt.length}`);

  if (toDelete.length > 0) {
    console.log(`\nFirst 10 to delete (oldest first):`);
    toDelete.sort((a, b) => a.ms - b.ms);
    for (const x of toDelete.slice(0, 10)) {
      console.log(`  ${new Date(x.ms).toISOString()}  ${x.id}  ${x.displayName}`);
    }
    if (toDelete.length > 10) console.log(`  ... and ${toDelete.length - 10} more`);
  }

  if (!apply) {
    console.log(`\n🔍 DRY-RUN complete. Re-run with --apply to commit.\n`);
    return;
  }

  if (toDelete.length === 0) {
    console.log(`\n✅ Nothing to delete.\n`);
    return;
  }

  // APPLY — batch delete (Firestore max 500 ops per batch)
  console.log(`\n=== APPLYING ===\n`);
  const CHUNK = 450; // leave room for audit doc
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const x of chunk) {
      batch.delete(col.doc(x.id));
    }
    // Add audit doc to last batch only
    if (i + CHUNK >= toDelete.length) {
      const auditId = `rule-m-cleanup-chat-history-1d-${Date.now()}-${randomBytes(4).toString('hex')}`;
      batch.set(db.doc(`${BASE}/be_admin_audit/${auditId}`), {
        type: 'chat-history-retention-cleanup',
        retentionHours: RETENTION_HOURS,
        cutoffISO: cutoffDate.toISOString(),
        scanned: allSnap.size,
        deleted: toDelete.length,
        kept: toKeep.length,
        noTimestamp: noResolvedAt.length,
        appliedAt: FieldValue.serverTimestamp(),
        reason: 'User directive 2026-05-24: chat_history retention = 1 day; pre-existing auto-delete logic not running; one-shot cleanup',
      });
    }
    await batch.commit();
    deleted += chunk.length;
    console.log(`  ✓ committed ${deleted}/${toDelete.length}`);
  }

  // Verify
  const verifySnap = await col.count().get();
  console.log(`\n🔥 COMMITTED ${deleted} deletes. chat_history now has ${verifySnap.data().count} docs.\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
