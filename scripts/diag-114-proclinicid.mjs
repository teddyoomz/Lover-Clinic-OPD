import { readFileSync } from 'node:fs';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
const APP_ID='loverclinic-opd-4c39b';
function loadEnvLocal(){const txt=readFileSync(path.resolve(process.cwd(),'.env.local.prod'),'utf8');const out={};for(const line of txt.split(/\r?\n/)){if(!line||line.startsWith('#'))continue;const eq=line.indexOf('=');if(eq<0)continue;const k=line.slice(0,eq).trim();let v=line.slice(eq+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);out[k]=v;}return out;}
function initAdmin(){if(adminApps().length)return adminFirestore();const env=loadEnvLocal();adminInit({credential:cert({projectId:env.FIREBASE_ADMIN_PROJECT_ID||APP_ID,clientEmail:env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:(env.FIREBASE_ADMIN_PRIVATE_KEY||'').split(String.fromCharCode(92)+'n').join(String.fromCharCode(10))})});return adminFirestore();}
const base=(db)=>db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
async function main(){
  const db=initAdmin();const data=base(db);const cid='LC-26000114';
  const c=await data.collection('be_customers').doc(cid).get();const x=c.data()||{};
  console.log(`LC-26000114 fields: id(docId)=${c.id}  proClinicId="${x.proClinicId??'(undefined)'}"  customerId="${x.customerId??'(undefined)'}"  customerHN="${x.customerHN??'(undefined)'}"  hn="${x.hn??'(undefined)'}"  treatmentCount=${x.treatmentCount}`);
  // Rule P: how many LC-* / self-created customers have empty proClinicId but treatmentCount>0 (potential same drift)?
  const all=await data.collection('be_customers').get();
  let lcNoPc=0, lcNoPcWithTx=0, mismatchSummary=0, samples=[];
  for(const d of all.docs){const y=d.data();const pc=y.proClinicId;const isLc=/^LC-/i.test(d.id);const noPc=(pc===undefined||pc===null||pc==='');
    if(isLc&&noPc){lcNoPc++; if((y.treatmentCount||0)>0)lcNoPcWithTx++;}
    // summary length vs treatmentCount internal mismatch (cheap signal)
    const sl=Array.isArray(y.treatmentSummary)?y.treatmentSummary.length:null;
    if(sl!=null && sl!==(y.treatmentCount||0)){mismatchSummary++; if(samples.length<8)samples.push(`${d.id}: count=${y.treatmentCount} summary=${sl} proClinicId="${pc??''}"`);}
  }
  console.log(`\nRule P sweep (be_customers=${all.size}):`);
  console.log(`  LC-* customers with empty proClinicId: ${lcNoPc}  (of which treatmentCount>0: ${lcNoPcWithTx})`);
  console.log(`  customers where treatmentSummary.length !== treatmentCount: ${mismatchSummary}`);
  samples.forEach(s=>console.log(`    ${s}`));
}
main().then(()=>process.exit(0)).catch(e=>{console.error('ERR',e.message);process.exit(1);});
