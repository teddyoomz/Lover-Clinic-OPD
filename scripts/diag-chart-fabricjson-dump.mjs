// scripts/diag-chart-fabricjson-dump.mjs — Rule R read-only: dump every persisted chart's
// fabricJson SHAPE so we understand why the adversarial probe classified 0 of N (parse fail?
// unexpected shape? double-encoded?). No writes.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const APP_ID = 'loverclinic-opd-4c39b';
const P = `artifacts/${APP_ID}/public/data`;
function loadEnv(p){const o={};for(const l of readFileSync(p,'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^"(.*)"$/,'$1');}return o;}
const env = loadEnv('.env.local.prod');
initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const snap = await db.collection(`${P}/be_treatments`).limit(1000).get();
let n = 0;
for (const d of snap.docs) {
  const charts = d.data()?.detail?.charts;
  if (!Array.isArray(charts)) continue;
  charts.forEach((c, i) => {
    if (typeof c?.fabricJson !== 'string' || !c.fabricJson) return;
    n++;
    const fj = c.fabricJson;
    let parsed = null, perr = '';
    try { parsed = JSON.parse(fj); } catch (e) { perr = e.message; }
    const reparsed = (typeof parsed === 'string') ? (() => { try { return JSON.parse(parsed); } catch { return null; } })() : null;
    const obj = reparsed || parsed;
    const objects = obj && Array.isArray(obj.objects) ? obj.objects : null;
    const img = objects ? objects.find(o => /image/i.test(o.type || '')) : null;
    console.log(`\n[#${n}] treatment=${d.id} chartIdx=${i} templateId=${c.templateId}`);
    console.log(`  dataUrl.len=${(c.dataUrl||'').length}  fabricJson.len=${fj.length}  combined=${((c.dataUrl||'').length+fj.length)} (cap 716800)`);
    console.log(`  JSON.parse: ${perr ? 'THREW: '+perr : 'ok (typeof '+typeof parsed+')'}${reparsed ? ' → double-encoded! re-parsed ok' : ''}`);
    console.log(`  first 110 chars: ${fj.slice(0,110).replace(/\n/g,' ')}`);
    if (obj) console.log(`  keys=${Object.keys(obj).join(',')}  canvasW=${obj.canvasWidth} canvasH=${obj.canvasHeight} objects=${objects ? objects.length : 'NONE'}`);
    if (objects) console.log(`  object types: [${objects.map(o=>o.type).join(', ')}]`);
    if (img) console.log(`  template img src prefix: ${(img.src||'').slice(0,60)}`);
    else if (objects) console.log(`  NO image-type object found (template missing from json?)`);
  });
}
console.log(`\nTotal charts-with-fabricJson: ${n}`);
process.exit(0);
