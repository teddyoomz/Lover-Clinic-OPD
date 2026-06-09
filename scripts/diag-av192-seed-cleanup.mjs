// scripts/diag-av192-seed-cleanup.mjs — Rule Q L1 fixture for the "แก้คงเหลือ"
// parseQtyString-not-defined fix (AV192). TEST-prefixed customer ONLY (never a
// real one — feedback_no_real_action_in_preview_eval). Commands:
//   node scripts/diag-av192-seed-cleanup.mjs seed     → create TEST customer w/ a 6/12 course
//   node scripts/diag-av192-seed-cleanup.mjs read     → print courses[0].qty
//   node scripts/diag-av192-seed-cleanup.mjs cleanup  → delete the TEST customer
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const CID = 'TEST-AV192-COURSE';
function loadEnv(){const e={};for(const l of readFileSync('.env.local.prod','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)e[m[1]]=m[2].replace(/^"|"$/g,'');}return e;}

async function db(){
  const env=loadEnv();
  if(!getApps().length) initializeApp({credential:cert({projectId:APP_ID,clientEmail:env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:(env.FIREBASE_ADMIN_PRIVATE_KEY||'').split('\\n').join('\n')})});
  return getFirestore();
}
const ref = (d) => d.doc(`${PREFIX}/be_customers/${CID}`);

async function seed(){
  const d=await db();
  await ref(d).set({
    branchId: 'BR-1777873556815-26df6480',   // นครราชสีมา (be_customers is universal; set for realism)
    hn: 'AV192',
    firstname: 'เทส', lastname: 'คงเหลือ',
    patientData: { firstName: 'เทส', lastName: 'คงเหลือ', prefix: 'นาย' },
    courses: [{
      name: 'Shock Wave 12 ครั้ง + ติดตามอาการกับแพทย์ 2 ครั้ง',
      product: 'Shock wave',
      qty: '6 / 12 ครั้ง',
    }],
    _av192Fixture: true,
    createdAt: new Date(),
  }, { merge: false });
  console.log(`SEEDED ${CID} → courses[0].qty = "6 / 12 ครั้ง"`);
}
async function read(){
  const d=await db(); const s=await ref(d).get();
  if(!s.exists){ console.log(`${CID} MISSING`); return; }
  const c=s.data();
  console.log(`${CID} courses:`, JSON.stringify(c.courses));
}
async function cleanup(){
  const d=await db(); await ref(d).delete();
  console.log(`DELETED ${CID}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  ({ seed, read, cleanup }[cmd] || (()=>{console.log('usage: seed|read|cleanup');}))()
    .then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
}
