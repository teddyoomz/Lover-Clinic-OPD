#!/usr/bin/env node
// ─── Rule M — prune legacy pre-AV210 push tokens (dry-run default) ───────────
//
// AV210 (2026-07-19): every token minted BEFORE the CSP fix deploy is a zombie —
// its push subscription is stranded on the app-shell sw.js registration at
// scope '/' (no push handler), so FCM sends "succeed" but display nothing and
// the sender's not-registered prune never fires. Devices re-mint fresh tokens
// on next app open via the (now-working) self-heal.
//
// Two-phase: dry-run lists would-prune; --apply rewrites push_config/tokens
// keeping only tokens with createdAt >= CUTOFF + emits an audit doc. Idempotent.
//
// Run AFTER the AV210 fix is deployed (else devices cannot re-mint):
//   node scripts/prune-legacy-push-tokens.mjs           # dry-run
//   node scripts/prune-legacy-push-tokens.mjs --apply
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Tokens created before this instant predate the AV210 CSP fix → zombies.
const CUTOFF_ISO = '2026-07-19T08:00:00.000Z';

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
  loadEnvLocal();
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { randomBytes } = await import('node:crypto');

  const APP_ID = 'loverclinic-opd-4c39b';
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const tokensRef = db.doc(`artifacts/${APP_ID}/public/data/push_config/tokens`);
  const snap = await tokensRef.get();
  const entries = snap.exists ? (snap.data().tokens || []) : [];

  const keep = [], prune = [];
  for (const t of entries) {
    // legacy string-shaped entries have no createdAt → definitionally pre-cutoff
    const createdAt = typeof t === 'string' ? '' : (t.createdAt || '');
    (createdAt >= CUTOFF_ISO ? keep : prune).push(t);
  }

  console.log(`── legacy push-token prune (${APPLY ? 'APPLY' : 'DRY-RUN'}) · cutoff ${CUTOFF_ISO} ──`);
  console.log(`total ${entries.length} · keep ${keep.length} · prune ${prune.length}`);
  for (const t of prune) {
    const tk = typeof t === 'string' ? t : t.token;
    console.log(`  prune ...${tk.slice(-16)} · created=${typeof t === 'string' ? '(legacy string)' : t.createdAt} · UA=${(typeof t === 'string' ? '' : t.userAgent || '').slice(0, 60)}`);
  }

  if (!APPLY) { console.log('\nDRY-RUN only. Re-run with --apply to prune.'); return; }
  if (prune.length === 0) { console.log('nothing to prune — idempotent no-op.'); return; }

  await tokensRef.set({ tokens: keep });
  const auditId = `push-legacy-token-prune-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`artifacts/${APP_ID}/public/data/be_admin_audit/${auditId}`).set({
    op: 'push-legacy-token-prune',
    reason: 'AV210 — pre-CSP-fix tokens deliver into handler-less app-shell SW (no display, never auto-pruned)',
    cutoff: CUTOFF_ISO,
    scanned: entries.length,
    pruned: prune.length,
    kept: keep.length,
    prunedCreatedAts: prune.map(t => (typeof t === 'string' ? '(legacy string)' : t.createdAt)),
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`APPLIED — audit ${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
