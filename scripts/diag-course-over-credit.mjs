#!/usr/bin/env node
// Rule R diag (READ-ONLY) — quantify V142-quater OVER-CREDIT victims on prod.
//
// Over-credit signature: a course whose CURRENT remaining is HIGHER than its
// audited `use` deductions imply — i.e. more `kind='use'` entries exist than the
// balance reflects. Caused by the doctor-save persisting courseItems (not
// deducted) → finalize reverse refunds a non-deduction → net no drop.
//
// Detection per course: expected_remaining = total + Σ(qtyDelta of matching
// 'use' entries)  [qtyDelta is negative].  Flag if current_remaining >
// expected_remaining AND the course has NO legit balance-raising audit
// (add/exchange/refund/share) that would explain a higher balance.
//
// READ-ONLY. Healing over-credit is NOT auto-safe (re-deducting needs the exact
// intended deduction) → this only QUANTIFIES; review candidates manually.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a; }, {});
if (getApps().length === 0) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b', clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n') }), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const parse = (s) => { const m = String(s || '').match(/^([\d.,]+)\s*\/\s*([\d.,]+)/); return m ? { r: parseFloat(m[1].replace(/,/g, '')), t: parseFloat(m[2].replace(/,/g, '')) } : null; };
const RAISE = new Set(['add', 'exchange', 'refund', 'share', 'buy', 'assign', 'transfer-in']);
async function main() {
  console.log('\n===== V142-quater over-credit diag (READ-ONLY) =====\n');
  const customers = await db.collection(`${BASE}/be_customers`).get();
  let scanned = 0, candidates = 0; const rows = [];
  for (const doc of customers.docs) {
    const courses = doc.data()?.courses; if (!Array.isArray(courses) || !courses.length) continue;
    scanned++;
    const cc = await db.collection(`${BASE}/be_course_changes`).where('customerId', '==', doc.id).get();
    const changes = cc.docs.map(d => d.data());
    const key = (n, p) => `${String(n || '').trim()}||${String(p || '').trim()}`;
    courses.forEach((c, i) => {
      const q = parse(c.qty); if (!q || q.t <= 0) return;
      const k = key(c.name, c.product);
      const matches = changes.filter(ch => key(ch.fromCourse?.name ?? ch.courseName, ch.productName) === k);
      const uses = matches.filter(ch => ch.kind === 'use');
      if (uses.length === 0) return;
      const sumDelta = uses.reduce((s, u) => s + (Number(u.qtyDelta) || 0), 0); // negative
      const expected = q.t + sumDelta; // total minus uses
      const hasRaise = matches.some(ch => RAISE.has(ch.kind));
      if (q.r > expected && !hasRaise) {
        candidates++;
        rows.push({ cust: doc.id, idx: i, key: k, cur: c.qty, uses: uses.length, expected, over: q.r - expected });
      }
    });
  }
  console.log(`scanned customers (with courses): ${scanned}`);
  console.log(`OVER-CREDIT candidates (current remaining > total - Σuses, no legit raise): ${candidates}\n`);
  for (const r of rows) console.log(`  ${r.cust} course[${r.idx}] "${r.key}"  current=${r.cur}  uses=${r.uses}  expected_remaining=${r.expected}  over-by=${r.over}`);
  console.log('\n(over-credit healing is NOT auto-safe — review each candidate)\n===== END =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
