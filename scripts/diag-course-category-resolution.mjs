// scripts/diag-course-category-resolution.mjs — Rule R (READ-ONLY, real prod)
// WHY does tab=reports-revenue show หมวดหมู่ = "ไม่ระบุ" for all rows?
// Confirms: (1) canonical be_courses field is courseCategory (not category/_name),
// (2) courseCategory is actually POPULATED on real courses (else nothing to show),
// (3) the join succeeds (procedureType resolves) while category fails,
// (4) the canonical fix would surface the REAL categories.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { aggregateRevenueByProcedure } from '../src/lib/revenueAnalysisAggregator.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env.local.prod', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();

  // ── be_courses field shape ───────────────────────────────────────────────
  const courses = (await db.collection(`${PREFIX}/be_courses`).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const f = { courseCategory:0, category:0, category_name:0, procedureType:0, procedure_type_name:0, courseName:0, name:0 };
  const realCats = new Set();
  const realTypes = new Set();
  for (const c of courses) {
    if ((c.courseCategory||'').trim()) { f.courseCategory++; realCats.add(c.courseCategory.trim()); }
    if ((c.category||'').trim()) f.category++;
    if ((c.category_name||'').trim()) f.category_name++;
    if ((c.procedureType||'').trim()) { f.procedureType++; realTypes.add(c.procedureType.trim()); }
    if ((c.procedure_type_name||'').trim()) f.procedure_type_name++;
    if ((c.courseName||'').trim()) f.courseName++;
    if ((c.name||'').trim()) f.name++;
  }
  console.log(`\n=== be_courses: ${courses.length} docs ===`);
  console.log('field presence (non-empty):', f);
  console.log(`distinct REAL courseCategory values (${realCats.size}):`, [...realCats].sort());
  console.log(`distinct REAL procedureType values (${realTypes.size}):`, [...realTypes].sort());
  console.log('\nsample 6 courses (id | courseName | courseCategory | category | category_name | procedureType):');
  courses.slice(0, 6).forEach(c =>
    console.log(`  ${c.id} | ${c.courseName||''} | cc="${c.courseCategory||''}" | cat="${c.category||''}" | cat_name="${c.category_name||''}" | pt="${c.procedureType||''}"`));

  // ── CURRENT (broken) aggregator output over real data (all branches) ──────
  const sales = (await db.collection(`${PREFIX}/be_sales`).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const out = aggregateRevenueByProcedure(sales, courses, {});
  const catDist = {}, ptDist = {};
  for (const r of out.rows) {
    catDist[r.category] = (catDist[r.category]||0) + 1;
    ptDist[r.procedureType] = (ptDist[r.procedureType]||0) + 1;
  }
  console.log(`\n=== CURRENT aggregateRevenueByProcedure over ${sales.length} sales → ${out.rows.length} rows ===`);
  console.log('row CATEGORY distribution (current code):', catDist);
  console.log('row PROCEDURE-TYPE distribution (current code):', ptDist);

  // ── Canonical join: what the fix WOULD surface ────────────────────────────
  // Build id-index of raw be_courses, join each sale course-line by id.
  const byId = new Map(courses.map(c => [String(c.id), c]));
  const byName = new Map(courses.filter(c=>(c.courseName||'').trim()).map(c => [`N:${c.courseName.trim()}`, c]));
  let lines=0, joinedById=0, joinedByName=0, notJoined=0;
  const fixedCatDist = {}, fixedPtDist = {};
  for (const s of sales) {
    if (s.status === 'cancelled') continue;
    const items = Array.isArray(s?.items?.courses) ? s.items.courses : [];
    for (const it of items) {
      lines++;
      const id = String(it.id || it.courseId || '');
      const nm = (it.name||'').trim();
      let doc = id ? byId.get(id) : null;
      if (doc) joinedById++;
      else if (nm && byName.get(`N:${nm}`)) { doc = byName.get(`N:${nm}`); joinedByName++; }
      else notJoined++;
      const cat = (doc?.courseCategory || '').trim() || 'ไม่ระบุ';
      const pt  = (doc?.procedureType || '').trim() || 'ไม่ระบุ';
      fixedCatDist[cat] = (fixedCatDist[cat]||0) + 1;
      fixedPtDist[pt]  = (fixedPtDist[pt]||0) + 1;
    }
  }
  console.log(`\n=== CANONICAL join (what the fix surfaces) — ${lines} sale course-lines ===`);
  console.log(`joined by id=${joinedById}, by name=${joinedByName}, NOT joined=${notJoined}`);
  console.log('line CATEGORY distribution (canonical courseCategory):', fixedCatDist);
  console.log('line PROCEDURE-TYPE distribution (canonical procedureType):', fixedPtDist);

  // also: does the aggregator's NAME-key fallback (c.name) work on raw be_courses?
  const namedKeysFromRaw = courses.filter(c => (c.name||'').trim()).length;
  console.log(`\nnote: aggregator buildCourseIndex NAME-key uses c.name → present on only ${namedKeysFromRaw}/${courses.length} raw be_courses (canonical is courseName). 0 ⇒ name-fallback join is dead for raw docs.`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
