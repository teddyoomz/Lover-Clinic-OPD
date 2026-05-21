// scripts/cleanup-chart-fabricjson-null-string.mjs
// Rule M data-op (admin SDK, canonical path, two-phase). Cleans the data-pollution found in the
// Rule Q adversarial pass: be_treatments detail.charts[].fabricJson === "null" (the 4-char STRING,
// produced by the old ChartSection.handleSave doing JSON.stringify(<JS null>)). Sets it to JS null —
// the canonical "no object data" shape that the FIXED handleSave + chartEntryForPersist now produce.
// FUNCTIONALLY IDENTICAL on read (both → raster re-edit fallback); this is data hygiene only.
//
// DRY-RUN by default; pass --apply to commit. Idempotent (re-run --apply → 0 writes). Audit doc +
// doc-level forensic stamp. Reads .env.local.prod (Rule M).
//   node scripts/cleanup-chart-fabricjson-null-string.mjs           # dry-run
//   node scripts/cleanup-chart-fabricjson-null-string.mjs --apply   # commit
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const DATA = `artifacts/${APP_ID}/public/data`;
const APPLY = process.argv.includes('--apply');

function loadEnv(p) { const o = {}; for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2].replace(/^"(.*)"$/, '$1'); } return o; }

async function main() {
  const env = loadEnv('.env.local.prod');
  initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
  const db = getFirestore();

  const snap = await db.collection(`${DATA}/be_treatments`).get();
  let scanned = 0, affectedDocs = 0, affectedCharts = 0;
  const plan = [];
  for (const d of snap.docs) {
    scanned++;
    const charts = d.data()?.detail?.charts;
    if (!Array.isArray(charts)) continue;
    const indices = [];
    const next = charts.map((c, i) => {
      if (c && c.fabricJson === 'null') { indices.push(i); affectedCharts++; return { ...c, fabricJson: null }; }
      return c;
    });
    if (indices.length) { affectedDocs++; plan.push({ id: d.id, indices, next }); }
  }

  console.log(`[${APPLY ? 'APPLY' : 'DRY-RUN'}] scanned=${scanned} treatments | affectedDocs=${affectedDocs} | affectedCharts=${affectedCharts}`);
  for (const p of plan) console.log(`  ${p.id} → chart idx [${p.indices.join(',')}] : "null"(string) → null`);
  if (!affectedDocs) { console.log('Nothing to clean (idempotent — already clean).'); process.exit(0); }
  if (!APPLY) { console.log('\nDRY-RUN only. Re-run with --apply to commit.'); process.exit(0); }

  for (const p of plan) {
    await db.doc(`${DATA}/be_treatments/${p.id}`).update({
      'detail.charts': p.next,
      _chartFabricJsonNullStringCleanedAt: FieldValue.serverTimestamp(),
      _chartFabricJsonNullStringCleanedCount: p.indices.length,
    });
    console.log(`  ✓ cleaned ${p.id} (${p.indices.length} chart(s))`);
  }
  const auditId = `chart-fabricjson-null-string-cleanup-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${DATA}/be_admin_audit/${auditId}`).set({
    op: 'chart-fabricjson-null-string-cleanup',
    reason: 'Rule Q adversarial pass found persisted fabricJson === "null" (string) from the pre-fix ChartSection.handleSave JSON.stringify(null) bug',
    scanned, affectedDocs, affectedCharts, treatmentIds: plan.map(p => p.id),
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`\nAPPLIED. audit=${auditId}`);
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error('FATAL', e); process.exit(1); });
