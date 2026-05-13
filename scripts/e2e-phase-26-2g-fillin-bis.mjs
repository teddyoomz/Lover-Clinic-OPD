#!/usr/bin/env node
// scripts/e2e-phase-26-2g-fillin-bis.mjs
//
// Phase 26.2g-fillin-bis — live admin-SDK end-to-end script.
// Rule M canonical pattern: pull env, init firebase-admin, canonical paths,
// dry-run/apply two-phase, audit doc emit, TEST-prefix discipline (V33.10).
//
// 6 scenarios exercise the FULL data chain:
//   opd_session.patientData (kiosk-shape) → kioskPatientToCanonical →
//     buildPatientDataFromForm-equivalent projection → write be_customers via
//       admin SDK → read back → resolvePatient* → assert expected display strings
//
// SC1-SC3: kiosk paths (chronic / allergy / pregnancy)
// SC4-SC5: admin paths (direct canonical fields)
// SC6: empty patientData (negative case)
//
// Invocation:
//   node scripts/e2e-phase-26-2g-fillin-bis.mjs            # dry-run
//   node scripts/e2e-phase-26-2g-fillin-bis.mjs --apply    # write + cleanup

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';
import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
} from '../src/lib/patientHealthMapping.js';

const APP_ID = 'loverclinic-opd-4c39b';
const CANONICAL_BASE = `artifacts/${APP_ID}/public/data`;
const APPLY = process.argv.includes('--apply');

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local.prod');
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  } catch {
    console.error('❌ .env.local.prod missing. Run: vercel env pull .env.local.prod --environment=production');
    process.exit(1);
  }
}

function initAdmin() {
  if (getApps().length > 0) return;
  loadEnv();
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '')
    .split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

// Simulate the relevant slice of buildPatientDataFromForm needed for the test.
// Full version lives in src/lib/backendClient.js but pulls Firestore imports
// that interfere with the admin-SDK import. For e2e we project directly.
function projectPatientData(form) {
  const pd = {};
  if (form.firstname) pd.firstName = form.firstname;
  if (form.lastname) pd.lastName = form.lastname;
  if (form.blood_type) pd.bloodType = form.blood_type;
  if (form.congenital_disease) pd.congenitalDisease = form.congenital_disease;
  if (form.history_of_drug_allergy) pd.drugAllergy = form.history_of_drug_allergy;
  if (form.history_of_food_allergy) pd.foodAllergy = form.history_of_food_allergy;
  if (form.before_treatment) pd.beforeTreatment = form.before_treatment;
  if (typeof form.pregnanted === 'boolean') pd.pregnanted = form.pregnanted;
  return pd;
}

const SCENARIOS = [
  {
    id: 'TEST-PHASE-26-2G-BIS-K1',
    name: 'SC1 kiosk hasUnderlying+ud_diabetes+ud_hypertension',
    path: 'kiosk',
    opdSession: {
      firstName: 'TESTK1', lastName: 'BIS',
      hasUnderlying: 'มี',
      ud_diabetes: true, ud_hypertension: true,
      bloodType: 'O+',
    },
    expectedCanonical: {
      congenitalDisease: 'ความดันโลหิตสูง, เบาหวาน',
      bloodType: 'O+',
    },
    expectedResolverOutput: {
      congenital: 'ความดันโลหิตสูง, เบาหวาน',
      allergy: '',
      history: '',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-K2',
    name: 'SC2 kiosk hasAllergies+allergiesDetail',
    path: 'kiosk',
    opdSession: {
      firstName: 'TESTK2', lastName: 'BIS',
      hasAllergies: 'มี', allergiesDetail: 'shrimp',
    },
    expectedCanonical: { drugAllergy: 'shrimp' },
    expectedResolverOutput: {
      congenital: '',
      allergy: 'shrimp',
      history: '',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-K3',
    name: 'SC3 kiosk ud_other+ud_otherDetail',
    path: 'kiosk',
    opdSession: {
      firstName: 'TESTK3', lastName: 'BIS',
      hasUnderlying: 'มี', ud_other: true, ud_otherDetail: 'Migraine',
    },
    expectedCanonical: { congenitalDisease: 'Migraine' },
    expectedResolverOutput: {
      congenital: 'Migraine',
      allergy: '',
      history: '',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-A1',
    name: 'SC4 admin direct canonical (chronic+drug+food)',
    path: 'admin',
    adminForm: {
      firstname: 'TESTA1', lastname: 'BIS',
      congenital_disease: 'ง่วง',
      history_of_drug_allergy: 'พารา',
      history_of_food_allergy: 'ขนมถ้วย',
    },
    expectedCanonical: {
      congenitalDisease: 'ง่วง',
      drugAllergy: 'พารา',
      foodAllergy: 'ขนมถ้วย',
    },
    expectedResolverOutput: {
      congenital: 'ง่วง',
      allergy: 'แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย',
      history: '',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-A2',
    name: 'SC5 admin beforeTreatment+pregnanted',
    path: 'admin',
    adminForm: {
      firstname: 'TESTA2', lastname: 'BIS',
      before_treatment: 'X-ray',
      pregnanted: true,
    },
    expectedCanonical: {
      beforeTreatment: 'X-ray',
      pregnanted: true,
    },
    expectedResolverOutput: {
      congenital: '',
      allergy: '',
      history: 'การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-E1',
    name: 'SC6 empty patientData (negative case)',
    path: 'admin',
    adminForm: { firstname: 'TESTE1', lastname: 'BIS' },
    expectedCanonical: {},
    expectedResolverOutput: { congenital: '', allergy: '', history: '' },
  },
];

async function main() {
  console.log(`\n🔬 Phase 26.2g-fillin-bis live e2e — mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`   ${SCENARIOS.length} scenarios; canonical path=${CANONICAL_BASE}`);
  console.log(`   Cleanup TEST-prefixed customer docs after each scenario.\n`);

  initAdmin();
  const db = getFirestore();

  const results = [];
  let allPass = true;

  for (const sc of SCENARIOS) {
    console.log(`\n── ${sc.name} (${sc.id}) ──`);
    const docRef = db.collection(`${CANONICAL_BASE}/be_customers`).doc(sc.id);
    let patientData;

    if (sc.path === 'kiosk') {
      // Step 1: synthesize opd_session.patientData → run kioskPatientToCanonical
      const canonicalForm = kioskPatientToCanonical(sc.opdSession);
      console.log(`   kioskPatientToCanonical output: congenital_disease=${JSON.stringify(canonicalForm.congenital_disease)}`);
      // Step 2: project to be_customers.patientData shape
      patientData = projectPatientData(canonicalForm);
    } else {
      // Direct admin path
      patientData = projectPatientData(sc.adminForm);
    }

    // Step 3: assert canonical shape matches expectation BEFORE write
    let canonicalOk = true;
    for (const [key, expected] of Object.entries(sc.expectedCanonical)) {
      if (patientData[key] !== expected) {
        console.log(`   ❌ canonical mismatch: ${key}=${JSON.stringify(patientData[key])} expected=${JSON.stringify(expected)}`);
        canonicalOk = false;
      }
    }
    if (canonicalOk) console.log(`   ✓ canonical fields landed correctly`);

    // Step 4: write be_customers doc (if --apply)
    if (APPLY) {
      await docRef.set({
        firstname: patientData.firstName || sc.id,
        hn_no: sc.id,
        branchId: 'TEST-BRANCH-PHASE-26-2G-BIS',
        patientData,
        _phase26_2gFillinBisE2eAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      });
      console.log(`   ✓ wrote be_customers/${sc.id}`);

      // Step 5: read back + verify
      const snap = await docRef.get();
      const stored = snap.data()?.patientData || {};
      let readBackOk = true;
      for (const [key, expected] of Object.entries(sc.expectedCanonical)) {
        if (stored[key] !== expected) {
          console.log(`   ❌ read-back mismatch: ${key}=${JSON.stringify(stored[key])} expected=${JSON.stringify(expected)}`);
          readBackOk = false;
        }
      }
      if (readBackOk) console.log(`   ✓ read-back matches`);
      patientData = stored;
    }

    // Step 6: apply resolvers + verify output
    const congenitalOut = resolvePatientCongenitalDisease(patientData);
    const allergyOut = resolvePatientDrugAllergy(patientData);
    const historyOut = resolvePatientTreatmentHistory(patientData);

    let resolverOk = true;
    if (congenitalOut !== sc.expectedResolverOutput.congenital) {
      console.log(`   ❌ resolveCongenital mismatch: ${JSON.stringify(congenitalOut)} expected ${JSON.stringify(sc.expectedResolverOutput.congenital)}`);
      resolverOk = false;
    }
    if (allergyOut !== sc.expectedResolverOutput.allergy) {
      console.log(`   ❌ resolveAllergy mismatch: ${JSON.stringify(allergyOut)} expected ${JSON.stringify(sc.expectedResolverOutput.allergy)}`);
      resolverOk = false;
    }
    if (historyOut !== sc.expectedResolverOutput.history) {
      console.log(`   ❌ resolveHistory mismatch: ${JSON.stringify(historyOut)} expected ${JSON.stringify(sc.expectedResolverOutput.history)}`);
      resolverOk = false;
    }
    if (resolverOk) {
      console.log(`   ✓ resolver outputs match expected:`);
      console.log(`     congenital: ${JSON.stringify(congenitalOut)}`);
      console.log(`     allergy:    ${JSON.stringify(allergyOut)}`);
      console.log(`     history:    ${JSON.stringify(historyOut)}`);
    }

    const scenarioOk = canonicalOk && resolverOk;
    results.push({ id: sc.id, name: sc.name, ok: scenarioOk });
    if (!scenarioOk) allPass = false;
  }

  // Cleanup
  if (APPLY) {
    console.log(`\n── Cleanup ──`);
    for (const sc of SCENARIOS) {
      await db.collection(`${CANONICAL_BASE}/be_customers`).doc(sc.id).delete();
      console.log(`   ✓ deleted be_customers/${sc.id}`);
    }
  }

  // Audit doc
  if (APPLY) {
    const auditId = `phase-26-2g-fillin-bis-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(`${CANONICAL_BASE}/be_admin_audit`).doc(auditId).set({
      phase: 'Phase 26.2g-fillin-bis',
      type: 'e2e-canonical-resolver',
      scenarios: results,
      allPass,
      appliedAt: Timestamp.now(),
    });
    console.log(`\n   ✓ audit doc: be_admin_audit/${auditId}`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Summary: ${results.filter(r => r.ok).length}/${results.length} PASS`);
  console.log(`Status: ${allPass ? '✅ ALL GREEN' : '❌ SOME FAILED'}`);
  console.log(`${'='.repeat(70)}\n`);
  process.exit(allPass ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal:', err);
    process.exit(2);
  });
}
