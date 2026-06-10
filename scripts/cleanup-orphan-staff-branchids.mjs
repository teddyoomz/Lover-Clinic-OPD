// ─── cleanup-orphan-staff-branchids.mjs — Rule M two-phase data heal ─────────
// 2026-06-10: OoMz + Mild be_staff docs carry an ORPHAN branchId
// `TEST-V81-TS-BR-1778958484080` (V81 test-fixture branch, doc deleted) →
// StaffTab showed "สาขา: 4 สาขา" while only 3 branches exist. Branch deletion
// does not cascade-clean branchIds (Rule H soft-keep) — this one-shot strips
// branchIds entries that do NOT resolve in be_branches, on be_staff +
// be_doctors.
//
// Two-phase: DRY-RUN by default; pass --apply to write.
// Forensic trail per mutated doc: _branchIdsOrphanCleanedAt (serverTimestamp)
//   + _branchIdsOrphanRemoved (the stripped ids).
// Audit doc: be_admin_audit/cleanup-orphan-staff-branchids-<ts>-<rand>.
// Idempotent: re-run --apply → 0 writes (no orphans remain).
//
// Usage: node scripts/cleanup-orphan-staff-branchids.mjs [--apply]

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

/**
 * Pure decision helper (unit-testable): which branchIds survive, which are
 * stripped. Orphan = id not present in liveBranchIds. Order preserved;
 * duplicates of a LIVE id are collapsed (a duplicate is one membership).
 */
export function decideBranchIdsCleanup(branchIds, liveBranchIds) {
  const ids = Array.isArray(branchIds) ? branchIds : [];
  const live = new Set(Array.from(liveBranchIds || []).map(String));
  const keep = [];
  const removed = [];
  const seen = new Set();
  for (const raw of ids) {
    const id = String(raw ?? '');
    if (!id) { removed.push(raw); continue; }
    if (!live.has(id)) { removed.push(id); continue; }
    if (seen.has(id)) { removed.push(id); continue; } // duplicate live id
    seen.add(id);
    keep.push(id);
  }
  return { keep, removed, changed: removed.length > 0 };
}

async function sweepCollection(data, colName, liveBranchIds) {
  const snap = await data.collection(colName).get();
  const plans = [];
  for (const d of snap.docs) {
    const x = d.data();
    if (!Array.isArray(x.branchIds) || x.branchIds.length === 0) continue;
    const { keep, removed, changed } = decideBranchIdsCleanup(x.branchIds, liveBranchIds);
    if (!changed) continue;
    plans.push({ col: colName, id: d.id, name: x.nickname || x.name || x.firstname || '?', before: x.branchIds, keep, removed });
  }
  return plans;
}

async function main() {
  const db = initAdmin();
  const data = base(db);
  console.log(`═══ orphan staff/doctor branchIds cleanup — ${APPLY ? 'APPLY (will write)' : 'DRY-RUN (no writes)'} ═══\n`);

  const brSnap = await data.collection('be_branches').get();
  const liveBranchIds = new Set(brSnap.docs.map((d) => d.id));
  console.log(`live be_branches (${liveBranchIds.size}): ${[...liveBranchIds].join(', ')}\n`);
  if (liveBranchIds.size === 0) { console.error('ABORT — be_branches is EMPTY; refusing to strip every membership.'); process.exit(1); }

  const plans = [
    ...(await sweepCollection(data, 'be_staff', liveBranchIds)),
    ...(await sweepCollection(data, 'be_doctors', liveBranchIds)),
  ];

  for (const p of plans) {
    console.log(`⚠ ${p.col}/${p.id} ("${p.name}")`);
    console.log(`   before : ${JSON.stringify(p.before)}`);
    console.log(`   keep   : ${JSON.stringify(p.keep)}`);
    console.log(`   removed: ${JSON.stringify(p.removed)}`);
  }
  if (plans.length === 0) console.log('clean — no orphan/duplicate branchIds found (idempotent no-op).');

  if (!APPLY || plans.length === 0) {
    console.log(`\n═══ ${APPLY ? 'APPLY' : 'DRY-RUN'} summary: ${plans.length} doc(s) would change ═══`);
    return;
  }

  const batch = db.batch();
  for (const p of plans) {
    batch.update(data.collection(p.col).doc(p.id), {
      branchIds: p.keep,
      _branchIdsOrphanCleanedAt: FieldValue.serverTimestamp(),
      _branchIdsOrphanRemoved: p.removed,
    });
  }
  const auditId = `cleanup-orphan-staff-branchids-${Date.now()}-${randomBytes(4).toString('hex')}`;
  batch.set(data.collection('be_admin_audit').doc(auditId), {
    op: 'cleanup-orphan-staff-branchids',
    scanned: { liveBranches: liveBranchIds.size },
    changed: plans.map((p) => ({ col: p.col, id: p.id, removed: p.removed })),
    changedCount: plans.length,
    appliedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  console.log(`\n✓ APPLIED — ${plans.length} doc(s) cleaned. audit: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
