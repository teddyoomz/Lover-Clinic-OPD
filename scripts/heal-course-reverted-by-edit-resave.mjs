#!/usr/bin/env node
// ─── V142 Rule M heal — restore course balances wrongly reverted by the ────────
//     edit-resave bug (reverse-without-rededuct).
//
// Bug (V142): a 2nd+ save of a treatment that deducted a purchased course
// REVERSED the deduction but failed to re-apply it → the course balance reverted
// to full while be_course_changes keeps the stale `use` entry (qtyAfter "0/…").
//
// Heal (conservative + precise): for each customer course, if the LATEST matching
// `kind='use'` audit (by course name + product) has a qtyAfter whose remaining is
// BELOW the current remaining — and NO legit balance-raising audit
// (add/exchange/refund/share/buy) exists for that course AFTER that use — restore
// the course's remaining to that use's qtyAfter. Total is preserved.
//
// Safety: dry-run by default; `--apply` commits. Skips ambiguous duplicate
// (same name+product) courses → printed for manual review. Forensic stamps
// `_v142HealedAt` + `_v142HealedFrom`. Idempotent (re-run --apply → 0 writes).
// Audit doc to be_admin_audit. Rule M + Rule R (canonical path, admin SDK).
//
// Run:   node scripts/heal-course-reverted-by-edit-resave.mjs            (dry-run)
//        node scripts/heal-course-reverted-by-edit-resave.mjs --apply    (commit)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a;
}, {});
if (getApps().length === 0) initializeApp({ credential: cert({
  projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
}), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const APPLY = process.argv.includes('--apply');

const parseQty = (s) => {
  const m = String(s || '').match(/^([\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/);
  if (!m) return null;
  return { remaining: parseFloat(m[1].replace(/,/g, '')), total: parseFloat(m[2].replace(/,/g, '')), unit: m[3].trim() };
};
const fmtQty = (r, t, u) => {
  const R = Number.isInteger(r) ? r : r.toFixed(1); const T = Number.isInteger(t) ? t : t.toFixed(1);
  return u ? `${R} / ${T} ${u}` : `${R} / ${T}`;
};
const ms = (v) => { try { return v?.toDate ? v.toDate().getTime() : (typeof v === 'string' ? Date.parse(v) : 0); } catch { return 0; } };
const RAISE_KINDS = new Set(['add', 'exchange', 'refund', 'share', 'buy', 'assign', 'transfer-in']);

async function main() {
  console.log(`\n===== V142 heal — course balances reverted by edit-resave (${APPLY ? 'APPLY' : 'DRY-RUN'}) =====\n`);
  const customers = await db.collection(`${BASE}/be_customers`).get();
  let scanned = 0, candidates = 0, healed = 0, ambiguous = 0, skippedRaise = 0;
  const proposals = [];

  for (const doc of customers.docs) {
    const courses = doc.data()?.courses;
    if (!Array.isArray(courses) || courses.length === 0) continue;
    scanned++;
    // course-changes for this customer
    const cc = await db.collection(`${BASE}/be_course_changes`).where('customerId', '==', doc.id).get();
    const changes = cc.docs.map(d => d.data());
    if (changes.length === 0) continue;

    // group changes by (course name || product)
    const keyOf = (name, product) => `${String(name || '').trim()}||${String(product || '').trim()}`;

    // duplicate-key guard: courses sharing name||product are ambiguous to heal
    const courseKeyCount = {};
    courses.forEach(c => { const k = keyOf(c.name, c.product); courseKeyCount[k] = (courseKeyCount[k] || 0) + 1; });

    const newCourses = courses.map(c => ({ ...c }));
    let docChanged = false;

    for (let i = 0; i < newCourses.length; i++) {
      const c = newCourses[i];
      const q = parseQty(c.qty);
      if (!q || q.total <= 0) continue;
      const k = keyOf(c.name, c.product);
      // matching use entries (by course name AND product)
      const matches = changes.filter(ch =>
        keyOf(ch.fromCourse?.name ?? ch.courseName, ch.productName) === k);
      const uses = matches.filter(ch => ch.kind === 'use').sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
      if (uses.length === 0) continue;
      const latestUse = uses[uses.length - 1];
      const after = parseQty(latestUse.qtyAfter);
      if (!after) continue;
      // any legit balance-raising change AFTER the latest use → leave alone
      const raisedAfter = matches.some(ch => RAISE_KINDS.has(ch.kind) && ms(ch.createdAt) > ms(latestUse.createdAt));
      if (q.remaining <= after.remaining) continue; // already correct (or lower)
      candidates++;
      if (raisedAfter) { skippedRaise++; continue; }
      if (courseKeyCount[k] > 1) {
        ambiguous++;
        proposals.push({ cust: doc.id, idx: i, key: k, cur: c.qty, target: 'AMBIGUOUS (dup) — manual', kind: 'ambiguous' });
        continue;
      }
      const target = fmtQty(after.remaining, q.total, q.unit);
      proposals.push({ cust: doc.id, idx: i, key: k, cur: c.qty, target, kind: 'heal' });
      newCourses[i] = {
        ...c, qty: target,
        _v142HealedAt: new Date().toISOString(),
        _v142HealedFrom: c.qty,
      };
      docChanged = true;
      healed++;
    }

    if (docChanged && APPLY) {
      await doc.ref.update({ courses: newCourses });
    }
  }

  console.log(`scanned customers (with courses): ${scanned}`);
  console.log(`candidates (current remaining > latest use qtyAfter): ${candidates}`);
  console.log(`  → healable (unambiguous, no legit raise after): ${healed}`);
  console.log(`  → skipped (legit add/exchange/refund after use): ${skippedRaise}`);
  console.log(`  → ambiguous (duplicate name+product — manual): ${ambiguous}\n`);
  for (const p of proposals) {
    console.log(`  [${p.kind === 'heal' ? '✔' : '?'}] ${p.cust} course[${p.idx}] "${p.key}"  ${p.cur}  →  ${p.target}`);
  }

  if (APPLY && healed > 0) {
    const auditId = `v142-heal-course-reverted-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(`${BASE}/be_admin_audit`).doc(auditId).set({
      op: 'v142-heal-course-reverted-by-edit-resave',
      scanned, candidates, healed, skippedRaise, ambiguous,
      proposals: proposals.filter(p => p.kind === 'heal'),
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(`\nAPPLIED ${healed} course heal(s). audit: ${auditId}`);
  } else if (!APPLY) {
    console.log(`\nDRY-RUN — re-run with --apply to commit ${healed} heal(s).`);
  }
  console.log('\n===== END =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
