import { readFileSync } from 'node:fs';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
const APP_ID='loverclinic-opd-4c39b';
function loadEnvLocal(){const txt=readFileSync(path.resolve(process.cwd(),'.env.local.prod'),'utf8');const out={};for(const line of txt.split(/\r?\n/)){if(!line||line.startsWith('#'))continue;const eq=line.indexOf('=');if(eq<0)continue;const k=line.slice(0,eq).trim();let v=line.slice(eq+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);out[k]=v;}return out;}
function initAdmin(){if(adminApps().length)return adminFirestore();const env=loadEnvLocal();adminInit({credential:cert({projectId:env.FIREBASE_ADMIN_PROJECT_ID||APP_ID,clientEmail:env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:(env.FIREBASE_ADMIN_PRIVATE_KEY||'').split(String.fromCharCode(92)+'n').join(String.fromCharCode(10))})});return adminFirestore();}
const base=(db)=>db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const db=initAdmin();const data=base(db);
const snap=await data.collection('be_stock_movements').limit(60).get();
const withTx=snap.docs.map(d=>({id:d.id,x:d.data()})).filter(m=>m.x.linkedTreatmentId||m.x.linkedSaleId);
console.log(`scanned ${snap.size}, with linkedTreatment/Sale: ${withTx.length}`);
for(const m of withTx.slice(0,3)){
  console.log(`\n[${m.id}] type=${m.x.type} keys=${Object.keys(m.x).sort().join(',')}`);
  console.log(`   linkedTreatmentId=${m.x.linkedTreatmentId||''} linkedSaleId=${m.x.linkedSaleId||''} customerId=${m.x.customerId??'(none)'} customerName=${m.x.customerName??'(none)'}`);
}
// Does be_treatments + be_sales carry customerId + customerName?
if(withTx[0]){
  const tid=withTx.find(m=>m.x.linkedTreatmentId)?.x.linkedTreatmentId;
  const sid=withTx.find(m=>m.x.linkedSaleId)?.x.linkedSaleId;
  if(tid){const t=await data.collection('be_treatments').doc(tid).get();console.log(`\nbe_treatments[${tid}] exists=${t.exists} customerId=${t.data()?.customerId} customerName=${t.data()?.customerName??t.data()?.detail?.customerName??'(none)'}`);}
  if(sid){const s=await data.collection('be_sales').doc(sid).get();console.log(`be_sales[${sid}] exists=${s.exists} customerId=${s.data()?.customerId} customerName=${s.data()?.customerName??'(none)'}`);}
}
process.exit(0);
