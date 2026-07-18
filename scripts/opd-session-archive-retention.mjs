#!/usr/bin/env node
// ─── Rule M CLI — archived opd_sessions retention (dry-run default) ──────────
//
// Mirrors api/cron/opd-session-archive-retention.js via the SHARED sweep
// export (one decision core — no drift). Dry-run prints the would-delete set
// grouped by reason; --apply commits (user-authorized policy: archived >180d,
// guarded: isPermanent / live patient link / booking-referenced / no-timestamp).
//
// Run: node scripts/opd-session-archive-retention.mjs [--apply] [--days N]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = v;
  }
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const daysArg = process.argv.indexOf('--days');
  loadEnvLocal();

  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { randomBytes } = await import('node:crypto');
  const { sweepOpdSessionArchiveRetention } = await import('../api/cron/opd-session-archive-retention.js');
  const { ARCHIVE_RETENTION_DAYS } = await import('../src/lib/opdSessionCleanupCore.js');

  const APP_ID = 'loverclinic-opd-4c39b';
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const retentionDays = daysArg > -1 ? Number(process.argv[daysArg + 1]) : ARCHIVE_RETENTION_DAYS;

  const result = await sweepOpdSessionArchiveRetention({ db, apply: APPLY, retentionDays });
  console.log(`── opd_sessions archive retention (${APPLY ? 'APPLY' : 'DRY-RUN'}) · >${retentionDays}d ──`);
  console.log(`scanned ${result.scanned} · would-delete/deleted ${result.deleted} · skipped ${result.skipped} · capped ${result.capped}`);
  console.log('reasons:', JSON.stringify(result.reasons, null, 2));
  if (result.deleted > 0) console.log('ids:', result.deletedIds.join(', '));

  if (APPLY) {
    const auditId = `opd-session-archive-retention-cli-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(`artifacts/${APP_ID}/public/data/be_admin_audit`).doc(auditId).set({
      op: 'opd-session-archive-retention',
      source: 'cli',
      ...result,
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(`audit ${auditId}`);
  } else {
    console.log('\nDRY-RUN only. Re-run with --apply to delete.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
