import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
const APP_ID = 'loverclinic-opd-4c39b';
function loadEnvLocal(){const txt=readFileSync(path.resolve(process.cwd(),'.env.local.prod'),'utf8');const out={};for(const line of txt.split(/\r?\n/)){if(!line||line.startsWith('#'))continue;const eq=line.indexOf('=');if(eq<0)continue;const k=line.slice(0,eq).trim();let v=line.slice(eq+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);out[k]=v;}return out;}
function initAdmin(){if(adminApps().length)return adminFirestore();const env=loadEnvLocal();adminInit({credential:cert({projectId:env.FIREBASE_ADMIN_PROJECT_ID||APP_ID,clientEmail:env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:(env.FIREBASE_ADMIN_PRIVATE_KEY||'').split(String.fromCharCode(92)+'n').join(String.fromCharCode(10))})});return adminFirestore();}
const base=(db)=>db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const ts=(v)=>(v&&v.toDate?v.toDate().toISOString():v)||'';
async function main(){
  const db=initAdmin();const data=base(db);const cid='LC-26000114';
  const c=await data.collection('be_customers').doc(cid).get();
  const x=c.data()||{};
  console.log(`customer ${cid}: treatmentCount=${x.treatmentCount}  treatmentSummary.length=${Array.isArray(x.treatmentSummary)?x.treatmentSummary.length:'(not array)'}`);
  if(Array.isArray(x.treatmentSummary)){
    x.treatmentSummary.forEach((t,i)=>console.log(`  summary[${i}] id=${t.id} status="${t.status||''}" cc="${t.cc||''}" createdAt=${ts(t.createdAt)} editedAt=${ts(t.editedAt)}`));
  }
  const tr=await data.collection('be_treatments').where('customerId','==',cid).get();
  console.log(`\nbe_treatments docs where customerId==${cid}: ${tr.size}`);
  tr.docs.forEach(d=>{const t=d.data();console.log(`  [${d.id}] status="${t.status||''}" cc="${t.cc||''}" createdAt=${ts(t.createdAt)} deleted=${t.deleted===true} isDeleted=${t.isDeleted===true}`);});
}
main().then(()=>process.exit(0)).catch(e=>{console.error('ERR',e.message);process.exit(1);});
