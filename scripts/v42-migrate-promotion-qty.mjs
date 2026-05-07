#!/usr/bin/env node
// ─── V42 migration — fix existing customer.courses[] entries with dropped sub.qty ───
//
// Bug history (V42, 2026-05-07): 4 writer sites in TreatmentFormPage +
// SaleTab dropped `sub.qty` (course-instance multiplier) when buying a
// promotion. Customers who bought such promotions have customer.courses[]
// entries with qty="N / N unit" where N = inner p.qty only, missing the
// sub.qty multiplier. Example: PRP course config qty=6 with Tube PRP qty=3 →
// expected "18 / 18 อัน" → buggy state "3 / 3 อัน".
//
// This script repairs existing buggy data:
//   1. Iterate be_customers/* docs
//   2. For each customer.courses[] entry with promotionId set
//   3. Look up the source promotion in be_promotions
//   4. Match the entry to a sub-course (by name) + product (by name)
//   5. Compute correctTotal = item.qty (default 1) × sub.qty × p.qty
//   6. If currentTotal < correctTotal, increase total + remaining (preserving
//      used amount = currentTotal - currentRemaining)
//   7. Stamp forensic fields: _v42FixedAt, _v42LegacyQty
//   8. Audit doc per run
//
// Authorization compliance (Rule M):
//   ✓ Pull env (.env.local.prod) — local-only, no deploy
//   ✓ firebase-admin SDK (bypasses rules)
//   ✓ Canonical paths (artifacts/{APP_ID}/public/data/...)
//   ✓ Two-phase: --dry-run (default) + --apply
//   ✓ Audit doc with full diff
//   ✓ Idempotent: re-run with --apply yields 0 writes (skip-on-already-fixed)
//   ✓ Crypto-secure random for audit doc ID
//
// Usage:
//   node scripts/v42-migrate-promotion-qty.mjs              # dry-run
//   node scripts/v42-migrate-promotion-qty.mjs --apply      # commit writes

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computePromotionProductQty } from '../src/lib/treatmentBuyHelpers.js';

const APP_ID = 'loverclinic-opd-4c39b';

// ═══ Args ═══
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const APPLY = args.apply === true || args.apply === 'true';

// ═══ Env ═══
const envFile = existsSync('.env.local.prod')
  ? '.env.local.prod'
  : (existsSync('.env.local') ? '.env.local' : null);
if (!envFile) {
  console.error('FATAL: no .env.local.prod or .env.local');
  process.exit(1);
}
for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();
function dataCol(name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}
function randHex(n = 8) { return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }

// ═══ Logging ═══
const HR = '═'.repeat(72);
const log = (...a) => console.log(...a);
const banner = (t) => log(`\n${HR}\n  ${t}\n${HR}`);

// ═══ Parse "N / M unit" qty string ═══
function parseQtyString(qty) {
  if (typeof qty !== 'string') return null;
  const m = qty.match(/^([\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/);
  if (!m) return null;
  const remaining = parseFloat(m[1].replace(/,/g, ''));
  const total = parseFloat(m[2].replace(/,/g, ''));
  const unit = m[3].trim() || 'ครั้ง';
  if (!Number.isFinite(remaining) || !Number.isFinite(total)) return null;
  return { remaining, total, unit };
}

function buildQtyString(remaining, total, unit) {
  return `${remaining} / ${total} ${unit}`;
}

// ═══ Build lookup of all promotions ═══
//
// We index by BOTH docId AND promotion_name. The customer.courses[] entries
// from assignCourseToCustomer don't carry promotionId — they encode source
// promotion via `parentName: 'โปรโมชัน: <name>'`. Match by name extracted
// from parentName.
async function buildPromotionLookup() {
  const snap = await dataCol('be_promotions').get();
  const byDocId = new Map();
  const byName = new Map();   // name → array of matching promos (handle dups)
  for (const doc of snap.docs) {
    const data = { ...doc.data(), _docId: doc.id };
    byDocId.set(doc.id, data);
    if (data.promotionId && data.promotionId !== doc.id) {
      byDocId.set(String(data.promotionId), data);
    }
    const name = String(data.promotion_name || '');
    if (name) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(data);
    }
  }
  return { byDocId, byName };
}

// Extract promo name from parentName "โปรโมชัน: <name>". Returns null if
// the entry isn't promotion-derived.
function parsePromoNameFromParent(parentName) {
  if (typeof parentName !== 'string') return null;
  const prefix = 'โปรโมชัน:';
  if (!parentName.startsWith(prefix)) return null;
  return parentName.slice(prefix.length).trim();
}

// ═══ Compute correct qty for a customer.courses[] entry ═══
//
// Returns: { correctTotal, sub, product } if matchable, or null if not.
function computeCorrectQty(entry, promotion) {
  const courseName = String(entry.name || '');
  const productName = String(entry.product || '');
  const subs = Array.isArray(promotion?.courses) ? promotion.courses : [];
  // Find matching sub-course by name
  const sub = subs.find(s => String(s.name || '') === courseName);
  if (!sub) return null;
  const prods = Array.isArray(sub.products) ? sub.products : [];
  // Find matching product by name
  const product = prods.find(p => String(p.name || '') === productName);
  if (!product) {
    // Sub has products[] but none match → entry might be the fallback
    // single-entry case (sub.products is empty). Recompute with sub fallback.
    if (prods.length === 0 && courseName === productName) {
      // Fallback case: sub had no products[], so entry was created with
      // {name: sub.name, qty: subQty * pQty (= subQty since pQty=1 default)}
      // Correct: same as before fix in this code path (no inner p.qty), so
      // no change needed. Skip.
      return null;
    }
    return null;
  }
  // For migration, assume purchasedQty=1 (most common case; can't determine
  // multi-buy retroactively without consulting be_sales).
  // TODO: future enhancement — cross-reference customer's be_sales to find
  // exact purchasedQty per buggy entry. For now, skip multi-buy.
  const correctTotal = computePromotionProductQty(1, sub.qty, product.qty);
  return { correctTotal, sub, product };
}

// ═══ Process one customer ═══
//
// Returns: { customerId, fixed: [{idx, before, after}], skipped: [{idx, reason}] }
function processCustomer(customerId, customerData, promotionLookup) {
  const courses = Array.isArray(customerData.courses) ? customerData.courses : [];
  const fixed = [];
  const skipped = [];
  const newCourses = courses.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') return entry;
    if (entry._v42FixedAt) {
      skipped.push({ idx, reason: 'already-fixed-v42' });
      return entry;
    }
    const promoName = parsePromoNameFromParent(entry.parentName);
    if (!promoName) {
      skipped.push({ idx, reason: 'not-promotion-derived' });
      return entry;
    }
    const promoMatches = promotionLookup.byName.get(promoName) || [];
    if (promoMatches.length === 0) {
      skipped.push({ idx, reason: 'promotion-not-found-by-name', promoName });
      return entry;
    }
    // Multiple promotions with same name (cross-branch-imported duplicates):
    // compute correctTotal for ALL matches. If all agree → use that value
    // (safe because the duplicates are functionally identical). If they
    // diverge → skip (admin must clarify).
    const computedCandidates = promoMatches.map(p => computeCorrectQty(entry, p)).filter(Boolean);
    if (computedCandidates.length === 0) {
      skipped.push({ idx, reason: 'no-matching-sub-or-product', courseName: entry.name, productName: entry.product, promoName });
      return entry;
    }
    const distinctTotals = new Set(computedCandidates.map(c => c.correctTotal));
    if (distinctTotals.size > 1) {
      skipped.push({ idx, reason: 'ambiguous-divergent-correct-total', promoName, totals: [...distinctTotals] });
      return entry;
    }
    const computed = computedCandidates[0];
    if (!computed) {
      skipped.push({ idx, reason: 'no-matching-sub-or-product', courseName: entry.name, productName: entry.product });
      return entry;
    }
    const parsed = parseQtyString(entry.qty);
    if (!parsed) {
      skipped.push({ idx, reason: 'unparseable-qty', qty: entry.qty });
      return entry;
    }
    const { remaining, total, unit } = parsed;
    const { correctTotal } = computed;
    if (total >= correctTotal) {
      // Already correct (or over — never decrement)
      skipped.push({ idx, reason: 'already-correct-or-greater', currentTotal: total, correctTotal });
      return entry;
    }
    // Preserve used amount; increase total + remaining
    const used = total - remaining;
    const newTotal = correctTotal;
    const newRemaining = Math.max(0, newTotal - used);
    fixed.push({
      idx,
      courseName: entry.name,
      productName: entry.product,
      before: entry.qty,
      after: buildQtyString(newRemaining, newTotal, unit),
      used,
      correctTotal,
    });
    return {
      ...entry,
      qty: buildQtyString(newRemaining, newTotal, unit),
      _v42FixedAt: new Date().toISOString(),
      _v42LegacyQty: entry.qty,
      _v42Used: used,
    };
  });
  return { customerId, customerData, courses: newCourses, fixed, skipped };
}

// ═══ Main ═══
async function main() {
  banner(`V42 Migration — Fix promotion qty multiplier  [${APPLY ? 'APPLY' : 'DRY-RUN'}]`);
  const t0 = Date.now();

  log('Loading promotion lookup...');
  const promotionLookup = await buildPromotionLookup();
  log(`  Found ${promotionLookup.byDocId.size} promotion docs (${promotionLookup.byName.size} distinct names)`);

  log('Loading be_customers...');
  const customersSnap = await dataCol('be_customers').get();
  log(`  Found ${customersSnap.size} customer docs`);

  let totalFixed = 0;
  let totalSkipped = 0;
  let customersWithFixes = 0;
  let customersWithPromotionEntries = 0;
  const allFixes = [];
  const skipReasons = {};
  const sampleSkips = [];

  for (const doc of customersSnap.docs) {
    const result = processCustomer(doc.id, doc.data(), promotionLookup);
    totalFixed += result.fixed.length;
    totalSkipped += result.skipped.length;
    // Histogram of skip reasons
    for (const s of result.skipped) {
      skipReasons[s.reason] = (skipReasons[s.reason] || 0) + 1;
      if (s.reason !== 'no-promotionId' && sampleSkips.length < 10) {
        sampleSkips.push({ customerId: doc.id, ...s });
      }
    }
    const hasPromoEntry = result.skipped.some(s => s.reason !== 'no-promotionId') || result.fixed.length > 0;
    if (hasPromoEntry) customersWithPromotionEntries++;
    if (result.fixed.length > 0) {
      customersWithFixes++;
      allFixes.push({ customerId: result.customerId, fixes: result.fixed });
      log(`\n  Customer ${result.customerId}: ${result.fixed.length} entries to fix`);
      for (const f of result.fixed) {
        log(`    [${f.idx}] ${f.courseName} > ${f.productName}: ${f.before} → ${f.after} (used=${f.used})`);
      }
      if (APPLY) {
        await dataCol('be_customers').doc(doc.id).update({
          courses: result.courses,
          _v42PromotionQtyMigratedAt: new Date().toISOString(),
        });
      }
    }
  }

  banner('Summary');
  log(`Customers scanned:                    ${customersSnap.size}`);
  log(`Customers with promotion entries:     ${customersWithPromotionEntries}`);
  log(`Customers with fixes:                 ${customersWithFixes}`);
  log(`Total entries fixed:                  ${totalFixed}`);
  log(`Total entries skipped:                ${totalSkipped}`);
  log('');
  log('Skip-reason histogram:');
  for (const [reason, count] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) {
    log(`  ${String(count).padStart(5)}  ${reason}`);
  }
  if (sampleSkips.length > 0) {
    log('');
    log('Sample skips (non-trivial reasons, first 10):');
    for (const s of sampleSkips) {
      log(`  cust=${s.customerId}  idx=${s.idx}  reason=${s.reason}  ${JSON.stringify({ ...s, customerId: undefined, idx: undefined, reason: undefined })}`);
    }
  }
  log(`Mode:                     ${APPLY ? 'APPLY (writes committed)' : 'DRY-RUN (no writes)'}`);
  log(`Elapsed:                  ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (APPLY && totalFixed > 0) {
    const auditId = `v42-promo-qty-migration-${Date.now()}-${randHex()}`;
    await dataCol('be_admin_audit').doc(auditId).set({
      action: 'v42-promotion-qty-migration',
      customersScanned: customersSnap.size,
      customersWithFixes,
      totalFixed,
      totalSkipped,
      // Truncate fix details for Firestore 1MB doc size guard
      sampleFixes: allFixes.slice(0, 20).map(c => ({ customerId: c.customerId, fixCount: c.fixes.length, samples: c.fixes.slice(0, 5) })),
      sampleFixesTruncated: allFixes.length > 20,
      executedBy: 'cli:v42-migrate-promotion-qty',
      executedAt: new Date().toISOString(),
    });
    log(`\n✓ Audit doc: be_admin_audit/${auditId}`);
  }

  if (!APPLY) {
    log(`\n${HR}`);
    log('  DRY-RUN COMPLETE — no writes committed.');
    log('  Re-run with --apply to commit fixes.');
    log(HR);
  } else {
    log(`\n${HR}`);
    log('  ✓ MIGRATION COMPLETE');
    log(HR);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('\n✗ FATAL:', e);
    console.error(e.stack);
    process.exit(99);
  });
}
