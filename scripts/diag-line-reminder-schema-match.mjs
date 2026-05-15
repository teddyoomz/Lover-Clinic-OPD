// Rule R diagnostic — verify LINE reminder pipeline field names ⊆ real prod schema.
//
// Use this BEFORE adding new field reads to api/cron/line-reminder-* /
// api/admin/line-reminder-* / src/lib/lineReminderTemplate.js to confirm the
// field exists on real be_appointments / be_branches / be_customers docs.
//
// V67 (2026-05-15) origin: Wave 1 implementer used invented `appointmentDate` /
// `branchName` field names that did not exist in real prod. 152 mock tests
// PASSED but pipeline returned 0/0/0. Mock-shadow drift (V66 family).
//
// Run: node scripts/diag-line-reminder-schema-match.mjs
//
// Output:
//   - Sample real-prod field set per collection (10 most recent docs)
//   - Pipeline-required field set
//   - Diff: missing-in-prod (POTENTIAL BUG), extra-in-prod (informational)

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

function getDb() {
  if (getApps().length === 0) {
    const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
    });
  }
  return getFirestore();
}

// Fields the LINE reminder pipeline reads from each collection.
// MUST be kept in sync with actual reads in:
//   - api/cron/line-reminder-fire.js
//   - api/cron/line-reminder-retry.js
//   - api/admin/line-reminder-debug-fire.js
//   - src/lib/lineReminderTemplate.js (resolveTokens)
//   - src/lib/lineReminderClient.js (getCustomerLineUserIdAtBranch)
const PIPELINE_FIELDS = {
  be_appointments: {
    required: ['date', 'startTime', 'branchId', 'customerId', 'status', 'notifyChannel'],
    optionalDenorm: ['customerName', 'customerHN', 'doctorName', 'doctorId', 'endTime', 'treatments'],
    backwardCompat: ['appointmentDate'], // V67 fallback — flag if ONLY this exists, not `date`
  },
  be_branches: {
    required: ['name'],
    optionalDenorm: ['nameEn', 'settings'],
    backwardCompat: ['branchName'], // V67 fallback
  },
  be_customers: {
    required: ['branchId'],
    optionalDenorm: ['firstname', 'lastname', 'fullName', 'name', 'patientData', 'lineUserId', 'lineUserId_byBranch', 'notifyOptOut', '_lineStale'],
    backwardCompat: [],
  },
  be_line_configs: {
    required: ['enabled', 'channelAccessToken'],
    optionalDenorm: ['channelSecret', 'botBasicId', 'lineReminder'],
    backwardCompat: [],
  },
};

async function sampleCollection(db, name, limit = 10) {
  const snap = await db.collection(`${BASE}/${name}`).limit(limit).get();
  const fieldsByDoc = new Map();
  const allFields = new Set();
  for (const d of snap.docs) {
    const data = d.data();
    const keys = Object.keys(data);
    fieldsByDoc.set(d.id, new Set(keys));
    for (const k of keys) allFields.add(k);
  }
  return { sampled: snap.size, fieldsByDoc, allFields };
}

function checkPipelineFields(collection, sample) {
  const spec = PIPELINE_FIELDS[collection];
  if (!spec) return { collection, status: 'NO_SPEC' };
  const out = {
    collection,
    sampled: sample.sampled,
    canonical_present: [],
    canonical_MISSING: [],
    backward_compat_present: [],
    extra_in_prod: [],
  };
  // Required: must appear in at least 1 sampled doc (denorm fields may be missing on some)
  for (const f of spec.required) {
    if (sample.allFields.has(f)) out.canonical_present.push(f);
    else out.canonical_MISSING.push(f);
  }
  // Backward-compat: flag if present (suggests pipeline still has legacy reads)
  for (const f of spec.backwardCompat) {
    if (sample.allFields.has(f)) out.backward_compat_present.push(f);
  }
  // Extra: fields in prod not declared by pipeline (informational)
  const declared = new Set([
    ...spec.required, ...spec.optionalDenorm, ...spec.backwardCompat,
  ]);
  for (const f of sample.allFields) {
    if (!declared.has(f) && !f.startsWith('_')) out.extra_in_prod.push(f);
  }
  return out;
}

async function main() {
  const db = getDb();
  console.log('================================================');
  console.log('LINE Reminder Pipeline ↔ Real-Prod Schema Match');
  console.log('================================================');
  console.log(`Sample size: 10 most recent docs per collection.\n`);

  let anyMissing = false;
  for (const collection of Object.keys(PIPELINE_FIELDS)) {
    console.log(`\n--- ${collection} ---`);
    try {
      const sample = await sampleCollection(db, collection);
      const check = checkPipelineFields(collection, sample);
      console.log(`  sampled: ${check.sampled} docs`);
      console.log(`  canonical_present: ${check.canonical_present.join(', ') || '(none)'}`);
      console.log(`  canonical_MISSING: ${check.canonical_MISSING.join(', ') || '(none)'}`);
      console.log(`  backward_compat_present: ${check.backward_compat_present.join(', ') || '(none)'}`);
      console.log(`  extra_in_prod: ${check.extra_in_prod.slice(0, 10).join(', ')}${check.extra_in_prod.length > 10 ? ` ... +${check.extra_in_prod.length - 10} more` : ''}`);
      if (check.canonical_MISSING.length > 0) {
        anyMissing = true;
        console.log(`  ⚠️  WARNING: pipeline reads fields NOT in real schema — V66 mock-shadow risk`);
      }
      if (check.backward_compat_present.length > 0) {
        console.log(`  ℹ️  INFO: legacy fields still present in real prod — backward-compat fallback in pipeline OK to keep`);
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }

  console.log('\n================================================');
  console.log(anyMissing ? 'RESULT: ⚠️  Schema drift detected — see WARNINGs above' : 'RESULT: ✅ Pipeline schema matches real prod');
  console.log('================================================');
  console.log('\nIf you see canonical_MISSING for a field your pipeline queries:');
  console.log('  1. Check backendClient.js writers — what is the actual field name?');
  console.log('  2. Update PIPELINE_FIELDS spec in this file to reflect new shape');
  console.log('  3. Add backward-compat fallback chain in pipeline (||)');
  console.log('  4. Update mock fixtures to use the canonical name');
  console.log('  5. Add AV46 source-grep regression test for the new field name');
  process.exit(anyMissing ? 2 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
