#!/usr/bin/env node
// ─── V51 — Per-branch settings migration (Rule M canonical) ────────────────
//
// Migrates 13 fields from global `clinic_settings/main` → per-branch
// `be_branches[*].settings`. Per Spec #2 §3 + §8.
//
// Reads (1):
//   - clinic_settings/main
//   - all be_branches docs (universal collection)
//
// Writes (per branch, atomic batch):
//   - settings sub-object (13 fields, per cascade in spec §8)
//   - DELETE flat top-level: branch.{phone, licenseNo, taxId, address, addressEn}
//     after verifying settings has them
//   - Forensic: settings._migratedAt + settings._migratedFromCs (snapshot)
//
// Writes (after all branches succeed):
//   - DELETE clinic_settings/main migrated fields (10 fields):
//     {clinicEmail, lineOfficialAccountUrl, patientSyncCooldownMins,
//      openHoursMonFri, openHoursSatSun, chatHoursAlwaysOn,
//      chatHoursMonFri, chatHoursSatSun, doctorHoursMonFri, doctorHoursSatSun}
//
// Audit doc: be_admin_audit/v51-migrate-clinic-settings-{ts}-{rand}
//
// Idempotent: re-run with --apply yields 0 writes. Branches with
// `settings._migratedAt` already set are skipped.
//
// Usage:
//   node scripts/v51-migrate-clinic-settings-to-branch.mjs           # DRY
//   node scripts/v51-migrate-clinic-settings-to-branch.mjs --apply   # COMMIT

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');

// ProClinic-aligned default open/chat hour shapes (used as final fallback
// when neither be_branches nor clinic_settings carries the field).
const DEFAULT_OPEN_HOURS_WEEKDAY = { open: '10:00', close: '20:30' };
const DEFAULT_OPEN_HOURS_WEEKEND = { open: '10:00', close: '19:30' };
const DEFAULT_CHAT_HOURS_WEEKDAY = { open: '10:00', close: '20:45' };
const DEFAULT_CHAT_HOURS_WEEKEND = { open: '10:00', close: '19:45' };
const DEFAULT_COOLDOWN_MINS = 10;

// Migrated clinic_settings field names — top-level fields to delete from
// the global doc after every branch has been backfilled.
const CS_MIGRATED_FIELDS = Object.freeze([
  'clinicEmail',
  'lineOfficialUrl',          // legacy var name — see also lineOfficialAccountUrl
  'lineOfficialAccountUrl',
  'clinicPhone',
  'clinicLicenseNo',
  'clinicTaxId',
  'clinicAddress',
  'clinicAddressEn',
  'patientSyncCooldownMins',
  // Legacy clinic_settings.* time-fields stored as flat strings
  'clinicOpenTime',
  'clinicCloseTime',
  'clinicOpenTimeWeekend',
  'clinicCloseTimeWeekend',
  'doctorStartTime',
  'doctorEndTime',
  'doctorStartTimeWeekend',
  'doctorEndTimeWeekend',
  'chatAlwaysOn',
  'chatOpenTime',
  'chatCloseTime',
  'chatOpenTimeWeekend',
  'chatCloseTimeWeekend',
  // Spec §8 named map-shape variants (forward-compat cleanup)
  'openHoursMonFri',
  'openHoursSatSun',
  'chatHoursAlwaysOn',
  'chatHoursMonFri',
  'chatHoursSatSun',
  'doctorHoursMonFri',
  'doctorHoursSatSun',
]);

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local.prod');
  const txt = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function init() {
  if (getApps().length > 0) return getFirestore();
  const env = loadEnvLocal();
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
  }) });
  return getFirestore();
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

// ─── Pure helpers (testable) ──────────────────────────────────────────────

/**
 * Resolve a flat clinic_settings field shape into a nested {open, close}
 * map. Spec §8 supports BOTH legacy flat (clinicOpenTime + clinicCloseTime)
 * AND nested (openHoursMonFri: {open, close}) shapes from prior data.
 */
export function resolveHoursPair(cs, namedKey, flatOpen, flatClose, defaults) {
  // Prefer nested shape if present + valid
  const nested = cs?.[namedKey];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const open = String(nested.open || '').trim();
    const close = String(nested.close || '').trim();
    if (open && close) return { open, close };
  }
  // Fallback to flat shape
  const open = String(cs?.[flatOpen] || '').trim();
  const close = String(cs?.[flatClose] || '').trim();
  if (open && close) return { open, close };
  return defaults;
}

/**
 * Build the settings sub-object for a single branch. Pure; no side effects.
 * Spec §8 cascade: branch.X (flat) || cs.X || ''
 */
export function buildBranchSettingsFromCascade(branchData, cs) {
  const cooldownRaw = cs?.patientSyncCooldownMins;
  const cooldown = cooldownRaw == null || cooldownRaw === ''
    ? DEFAULT_COOLDOWN_MINS
    : Number(cooldownRaw);
  return {
    phone:     branchData?.phone        || cs?.clinicPhone           || '',
    licenseNo: branchData?.licenseNo    || cs?.clinicLicenseNo       || '',
    taxId:     branchData?.taxId        || cs?.clinicTaxId           || '',
    address:   branchData?.address      || cs?.clinicAddress         || '',
    addressEn: branchData?.addressEn    || cs?.clinicAddressEn       || '',
    email:                                  cs?.clinicEmail          || '',
    lineOaUrl:                              cs?.lineOfficialAccountUrl || cs?.lineOfficialUrl || '',
    patientSyncCooldownMins: Number.isFinite(cooldown) ? cooldown : DEFAULT_COOLDOWN_MINS,
    openHours: {
      monFri: resolveHoursPair(cs, 'openHoursMonFri', 'clinicOpenTime',         'clinicCloseTime',         DEFAULT_OPEN_HOURS_WEEKDAY),
      satSun: resolveHoursPair(cs, 'openHoursSatSun', 'clinicOpenTimeWeekend',  'clinicCloseTimeWeekend',  DEFAULT_OPEN_HOURS_WEEKEND),
    },
    chatHours: {
      alwaysOn: !!(cs?.chatHoursAlwaysOn ?? cs?.chatAlwaysOn),
      monFri:   resolveHoursPair(cs, 'chatHoursMonFri', 'chatOpenTime',         'chatCloseTime',         DEFAULT_CHAT_HOURS_WEEKDAY),
      satSun:   resolveHoursPair(cs, 'chatHoursSatSun', 'chatOpenTimeWeekend',  'chatCloseTimeWeekend',  DEFAULT_CHAT_HOURS_WEEKEND),
    },
  };
}

/**
 * Snapshot of clinic_settings fields used as forensic-trail. Stored on
 * branch.settings._migratedFromCs so an admin can audit the migration
 * source values per branch.
 */
export function pickMigratedCsFields(cs) {
  if (!cs || typeof cs !== 'object') return {};
  const out = {};
  for (const k of CS_MIGRATED_FIELDS) {
    if (cs[k] !== undefined) out[k] = cs[k];
  }
  return out;
}

// ─── Main migration logic ─────────────────────────────────────────────────

async function main() {
  const db = init();
  const data = dataPath(db);

  console.log(`[v51-migrate] mode = ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  // 1. Read clinic_settings/main
  console.log('[v51-migrate] reading clinic_settings/main ...');
  const csSnap = await data.collection('clinic_settings').doc('main').get();
  if (!csSnap.exists) {
    console.log('[v51-migrate] clinic_settings/main does NOT exist — nothing to migrate');
    return;
  }
  const cs = csSnap.data();
  console.log(`[v51-migrate]   ${Object.keys(cs).length} fields on clinic_settings/main`);

  // 2. Read all be_branches
  console.log('[v51-migrate] reading be_branches ...');
  const branchSnap = await data.collection('be_branches').get();
  console.log(`[v51-migrate]   ${branchSnap.size} branches\n`);

  if (branchSnap.size === 0) {
    console.log('[v51-migrate] no branches — nothing to migrate');
    return;
  }

  // 3. Build per-branch payload + classify
  const plans = [];
  let alreadyMigrated = 0;
  for (const b of branchSnap.docs) {
    const branchData = b.data();
    if (branchData.settings && branchData.settings._migratedAt) {
      alreadyMigrated += 1;
      continue;
    }
    const settings = buildBranchSettingsFromCascade(branchData, cs);
    const csSnapshot = pickMigratedCsFields(cs);
    plans.push({
      branchId: b.id,
      branchName: branchData.name || '(no name)',
      settings,
      csSnapshotKeys: Object.keys(csSnapshot),
      csSnapshot,
      flatFieldsToDelete: ['phone', 'licenseNo', 'taxId', 'address', 'addressEn'].filter(
        (k) => branchData[k] != null
      ),
    });
  }

  console.log('[v51-migrate] === PLAN ===');
  console.log(`  Total branches:               ${branchSnap.size}`);
  console.log(`  Already migrated (skip):      ${alreadyMigrated}`);
  console.log(`  Pending migration:            ${plans.length}`);

  if (plans.length > 0) {
    console.log('\n  --- PLAN samples (showing up to 3) ---');
    for (const p of plans.slice(0, 3)) {
      console.log(`    branch=${p.branchId}  name=${p.branchName}`);
      console.log(`      settings.phone="${p.settings.phone}"`);
      console.log(`      settings.email="${p.settings.email}"`);
      console.log(`      settings.lineOaUrl="${p.settings.lineOaUrl}"`);
      console.log(`      settings.patientSyncCooldownMins=${p.settings.patientSyncCooldownMins}`);
      console.log(`      settings.openHours.monFri=${JSON.stringify(p.settings.openHours.monFri)}`);
      console.log(`      settings.chatHours.alwaysOn=${p.settings.chatHours.alwaysOn}`);
      console.log(`      flatFieldsToDelete=[${p.flatFieldsToDelete.join(',')}]`);
      console.log(`      csSnapshotKeys.length=${p.csSnapshotKeys.length}`);
    }
  }

  if (!APPLY) {
    console.log('\n[v51-migrate] DRY RUN — no writes. Re-run with --apply to commit.');
    return;
  }

  if (plans.length === 0) {
    console.log('\n[v51-migrate] all branches already migrated — nothing to apply');
    return;
  }

  // 4. APPLY phase — atomic per-branch writes
  console.log(`\n[v51-migrate] APPLYING ${plans.length} branch migrations ...`);
  let applied = 0;
  let batchOp = db.batch();
  let inBatch = 0;
  const appliedIds = [];
  for (const p of plans) {
    const ref = data.collection('be_branches').doc(p.branchId);
    // Build update payload. Use nested settings sub-object + forensic trail.
    const update = {
      settings: {
        ...p.settings,
        _migratedAt: FieldValue.serverTimestamp(),
        _migratedFromCs: p.csSnapshot,
      },
    };
    // Delete flat top-level fields that have been promoted to settings.X
    for (const k of p.flatFieldsToDelete) {
      update[k] = FieldValue.delete();
    }
    batchOp.update(ref, update);
    appliedIds.push(p.branchId);
    inBatch += 1;
    if (inBatch >= 400) {
      await batchOp.commit();
      applied += inBatch;
      console.log(`[v51-migrate]   committed ${applied}/${plans.length} ...`);
      batchOp = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) {
    await batchOp.commit();
    applied += inBatch;
  }
  console.log(`[v51-migrate]   committed ${applied}/${plans.length} branches TOTAL`);

  // 5. Clean clinic_settings/main migrated fields (after all branches succeed)
  console.log('\n[v51-migrate] cleaning clinic_settings/main migrated fields ...');
  const csCleanup = {};
  let csFieldsDeleted = 0;
  for (const k of CS_MIGRATED_FIELDS) {
    if (cs[k] !== undefined) {
      csCleanup[k] = FieldValue.delete();
      csFieldsDeleted += 1;
    }
  }
  if (csFieldsDeleted > 0) {
    await data.collection('clinic_settings').doc('main').update(csCleanup);
    console.log(`[v51-migrate]   deleted ${csFieldsDeleted} fields from clinic_settings/main`);
  } else {
    console.log('[v51-migrate]   no migrated fields remain on clinic_settings/main (idempotent)');
  }

  // 6. Audit doc emit
  const auditId = `v51-migrate-clinic-settings-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    type: 'v51-migrate-clinic-settings-to-branch',
    branchesScanned: branchSnap.size,
    alreadyMigrated,
    branchesMigrated: applied,
    csFieldsDeleted,
    sampleBranchIds: appliedIds.slice(0, 50),
    appliedAt: FieldValue.serverTimestamp(),
    invokedFrom: 'scripts/v51-migrate-clinic-settings-to-branch.mjs',
  });
  console.log(`\n[v51-migrate] audit doc: be_admin_audit/${auditId}`);
  console.log('[v51-migrate] DONE');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('[v51-migrate] FATAL:', err); process.exit(1); });
}
