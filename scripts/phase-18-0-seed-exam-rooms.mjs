#!/usr/bin/env node
// ─── Phase 18.0 — Seed exam rooms for นครราชสีมา + smart backfill ─────────
// One-shot script. Run via:
//   node scripts/phase-18-0-seed-exam-rooms.mjs              (default --dry-run)
//   node scripts/phase-18-0-seed-exam-rooms.mjs --apply      (commits writes)
//
// Operations:
//   1. Resolve นครราชสีมา branchId (be_branches.where('name','==','นครราชสีมา'))
//   2. Survey existing be_exam_rooms for that branch
//   3. Plan SEED_ROOMS: queue CREATE for each new name; reuse existing by
//      case-insensitive name match (idempotent re-run)
//   4. Survey be_appointments at target branch; plan BACKFILL where the
//      appt's existing roomName matches one of the seeded room names
//   5. --apply: chunked atomic batch writes + audit doc to be_admin_audit
//
// Idempotent: re-running on clean state finds 0 new ops + exits clean.
//
// Pre-flight: same as phase-17-2 — .env.local.prod must contain
//   FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY
//   (pull via: vercel env pull .env.local.prod --environment=production --yes)

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const envText = readFileSync(envFile, 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const TARGET_BRANCH_NAME = 'นครราชสีมา';

// ─── Pure helpers (exported for tests) ──────────────────────────────────

export function normalizeRoomName(s) {
  if (typeof s !== 'string') return '';
  return s.trim().toLowerCase();
}

export const SEED_ROOMS = Object.freeze([
  Object.freeze({ name: 'ห้องแพทย์/ห้องผ่าตัด', sortOrder: 0 }),
  Object.freeze({ name: 'ห้องช็อคเวฟ',          sortOrder: 1 }),
  Object.freeze({ name: 'ห้องดริป',              sortOrder: 2 }),
]);

/**
 * Plan which seed rooms need CREATE vs reuse-existing (idempotent via
 * case-insensitive NAME lookup, not ID).
 */
export function buildSeedPlan(existing, branchId, idGen) {
  const existingByNorm = new Map();
  for (const r of (existing || [])) {
    existingByNorm.set(normalizeRoomName(r.name), r);
  }
  const toCreate = [];
  const skippedExisting = [];
  const nameToId = {};
  for (const seed of SEED_ROOMS) {
    const norm = normalizeRoomName(seed.name);
    const hit = existingByNorm.get(norm);
    if (hit) {
      skippedExisting.push(hit);
      nameToId[seed.name] = hit.examRoomId || hit.id;
    } else {
      const id = idGen();
      toCreate.push({
        examRoomId: id,
        branchId,
        name: seed.name,
        nameEn: '',
        note: '',
        status: 'ใช้งาน',
        sortOrder: seed.sortOrder,
      });
      nameToId[seed.name] = id;
    }
  }
  return { toCreate, skippedExisting, nameToId };
}

/**
 * Plan which appointments need a roomId backfill. Skip appts that
 * already have roomId (idempotent re-run safe).
 */
export function buildBackfillPlan(appts, nameToId) {
  const lookupByNorm = new Map();
  for (const [name, id] of Object.entries(nameToId)) {
    lookupByNorm.set(normalizeRoomName(name), id);
  }
  const toUpdate = [];
  const unmatched = [];
  const skippedAlreadyLinked = [];
  const matchCounts = {};

  for (const a of (appts || [])) {
    if (a.roomId) {
      skippedAlreadyLinked.push({ id: a.id, roomId: a.roomId });
      continue;
    }
    const norm = normalizeRoomName(a.roomName);
    const matchedId = lookupByNorm.get(norm);
    if (matchedId) {
      toUpdate.push({ id: a.id, roomId: matchedId });
      const matchedName = Object.keys(nameToId).find(n => normalizeRoomName(n) === norm);
      matchCounts[matchedName] = (matchCounts[matchedName] || 0) + 1;
    } else {
      unmatched.push({ id: a.id, roomName: a.roomName });
    }
  }
  return { toUpdate, unmatched, skippedAlreadyLinked, matchCounts };
}

function makeExamRoomId() {
  return `EXR-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

function chunkOps500(items) {
  const out = [];
  for (let i = 0; i < items.length; i += 500) out.push(items.slice(i, i + 500));
  return out;
}

// ─── Main (only runs when invoked from CLI) ─────────────────────────────

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply;

  if (getApps().length === 0) {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!clientEmail || !privateKey) {
      throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY required (pull via: vercel env pull .env.local.prod --environment=production --yes)');
    }
    initializeApp({
      credential: cert({ projectId: APP_ID, clientEmail, privateKey }),
    });
  }
  const db = getFirestore();
  const basePath = `artifacts/${APP_ID}/public/data`;

  // 1. Resolve target branch
  const branchSnap = await db
    .collection(`${basePath}/be_branches`)
    .where('name', '==', TARGET_BRANCH_NAME)
    .limit(2)
    .get();
  if (branchSnap.empty) {
    console.error(`[phase-18-0] Branch "${TARGET_BRANCH_NAME}" not found — create it via BranchesTab first.`);
    process.exit(1);
  }
  const branches = branchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const target = branches.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))[0];
  console.log(`[phase-18-0] Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`[phase-18-0] Target branch: ${target.name} (id=${target.id})`);
  if (branches.length > 1) {
    console.warn(`[phase-18-0] WARNING: ${branches.length} branches named "${TARGET_BRANCH_NAME}" — using oldest by createdAt (${target.id}).`);
  }

  // 2. Survey existing exam rooms for the target branch
  const existingRoomsSnap = await db
    .collection(`${basePath}/be_exam_rooms`)
    .where('branchId', '==', target.id)
    .get();
  const existing = existingRoomsSnap.docs.map(d => ({ id: d.id, examRoomId: d.id, ...d.data() }));
  const seedPlan = buildSeedPlan(existing, target.id, makeExamRoomId);

  // 3. Survey appointments + plan backfill
  const apptsSnap = await db
    .collection(`${basePath}/be_appointments`)
    .where('branchId', '==', target.id)
    .get();
  const appts = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const backfillPlan = buildBackfillPlan(appts, seedPlan.nameToId);

  // 4. Print preview
  console.log(`\n[phase-18-0] Rooms to create: ${seedPlan.toCreate.length}`);
  for (const r of seedPlan.toCreate) {
    console.log(`  + ${r.name} (id=${r.examRoomId}, sortOrder=${r.sortOrder})`);
  }
  console.log(`[phase-18-0] Rooms already exist: ${seedPlan.skippedExisting.length}`);
  for (const r of seedPlan.skippedExisting) {
    console.log(`  = ${r.name} (id=${r.examRoomId || r.id}) — reusing for backfill`);
  }
  console.log(`\n[phase-18-0] Appts to backfill (roomId): ${backfillPlan.toUpdate.length}`);
  for (const [name, n] of Object.entries(backfillPlan.matchCounts)) {
    console.log(`  - ${name}: ${n}`);
  }
  console.log(`[phase-18-0] Appts unmatched (stay in ไม่ระบุห้อง column): ${backfillPlan.unmatched.length}`);
  console.log(`[phase-18-0] Appts already had roomId (skip): ${backfillPlan.skippedAlreadyLinked.length}`);

  if (dryRun) {
    console.log('\n[phase-18-0] DRY RUN — re-run with --apply to commit.');
    return;
  }

  // 5. Apply
  const allOps = [];
  for (const r of seedPlan.toCreate) {
    allOps.push({
      ref: db.doc(`${basePath}/be_exam_rooms/${r.examRoomId}`),
      type: 'set',
      data: {
        examRoomId: r.examRoomId,
        branchId: r.branchId,
        name: r.name,
        nameEn: r.nameEn,
        note: r.note,
        status: r.status,
        sortOrder: r.sortOrder,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }
  for (const u of backfillPlan.toUpdate) {
    allOps.push({
      ref: db.doc(`${basePath}/be_appointments/${u.id}`),
      type: 'update',
      data: { roomId: u.roomId, updatedAt: FieldValue.serverTimestamp() },
    });
  }

  if (allOps.length === 0) {
    console.log('\n[phase-18-0] Nothing to apply — already idempotent.');
    return;
  }

  const batches = chunkOps500(allOps);
  console.log(`\n[phase-18-0] Committing ${allOps.length} ops in ${batches.length} batch(es)...`);
  for (let i = 0; i < batches.length; i++) {
    const batch = db.batch();
    for (const op of batches[i]) {
      if (op.type === 'set') batch.set(op.ref, op.data);
      else batch.update(op.ref, op.data);
    }
    await batch.commit();
    console.log(`[phase-18-0]   batch ${i + 1}/${batches.length} committed (${batches[i].length} ops)`);
  }

  // Audit doc
  const auditId = `phase-18-0-seed-exam-rooms-${Date.now()}-${randomUUID()}`;
  await db.doc(`${basePath}/be_admin_audit/${auditId}`).set({
    phase: 'phase-18-0-seed-exam-rooms',
    branchId: target.id,
    branchName: target.name,
    seededRooms: seedPlan.toCreate.map(r => ({ examRoomId: r.examRoomId, name: r.name, sortOrder: r.sortOrder })),
    existingRoomsSkipped: seedPlan.skippedExisting.map(r => ({ examRoomId: r.examRoomId || r.id, name: r.name, reason: 'name-match' })),
    backfillCounts: backfillPlan.matchCounts,
    unmatchedAppts: backfillPlan.unmatched.length,
    skippedAlreadyLinkedAppts: backfillPlan.skippedAlreadyLinked.length,
    ranAt: FieldValue.serverTimestamp(),
    ranBy: process.env.USER || 'admin-script',
    mode: 'apply',
  });
  console.log(`\n[phase-18-0] Audit doc written: be_admin_audit/${auditId}`);
  console.log('[phase-18-0] DONE');
}

// Only run when invoked directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[phase-18-0] FAILED:', err);
    process.exit(1);
  });
}
