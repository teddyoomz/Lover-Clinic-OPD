// V64 — single-load aggregation (Q3=C). Pure JS; no Firestore.
// Builds a Map<customerId, summary> from already-fetched lists so per-card
// rendering is O(1).

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(fromISO, nowDate) {
  if (typeof fromISO !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(fromISO)) return 0;
  const [y, m, d] = fromISO.slice(0, 10).split('-').map(Number);
  const targetMs = Date.UTC(y, m - 1, d, 12, 0, 0);
  const nowMs = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate(),
    12, 0, 0,
  );
  return Math.round((targetMs - nowMs) / (24 * 60 * 60 * 1000));
}

/**
 * Build per-customer summary map.
 *
 * V64 schema note (composite wallet doc IDs): be_customer_wallets uses
 * `${customerId}__${walletTypeId}` doc IDs and stores customerId as a
 * field. A customer with N wallet types yields N docs in `wallets`; we
 * SUM `balance` per customerId to get total wallet liquidity.
 *
 * @param {Object} args
 * @param {Array}  args.customers   list of be_customers docs
 * @param {Array}  args.deposits    list of be_deposits docs
 * @param {Array}  args.sales       list of be_sales docs
 * @param {Array}  args.memberships list of be_memberships docs
 * @param {Array}  args.wallets     list of be_customer_wallets docs (N per customerId)
 * @param {Date}   args.now
 * @returns {Map<string, Object>}
 */
export function buildCustomerSummaryMap({ customers = [], deposits = [], sales = [], memberships = [], wallets = [], now } = {}) {
  const nowDate = now instanceof Date ? now : new Date();
  const out = new Map();

  // Index customers
  // V64-fix2 (2026-05-09): real be_customers schema is FLAT snake_case
  // (verified via preview_eval against prod). The earlier `patientData.*`
  // chain returned empty for all rows because patientData object exists
  // but is empty in our schema. Fall through to flat fields with patient
  // legacy fallback for forward-compat.
  for (const c of customers) {
    const id = String(c?.id || '');
    if (!id) continue;
    const pd = c?.patientData || {};
    const prefix = c?.prefix || pd.prefix || '';
    const first = c?.firstname || c?.firstName || pd.firstName || '';
    const last = c?.lastname || c?.lastName || pd.lastName || '';
    const fullName = [prefix, first, last].filter(Boolean).join(' ').trim();
    out.set(id, {
      hn: c?.hn_no || c?.hn || c?.proClinicHN || id,
      name: fullName || first || '',
      gender: c?.gender || pd.gender || '',
      phone: c?.telephone_number || c?.contact_1_telephone_number || c?.phone || pd.phone || '',
      customerType: (c?.customer_type_2 || c?.customer_type || pd.customerType2 || '').trim() || 'ลูกค้าทั่วไป',
      membershipTier: '',
      membershipDaysLeft: 0,
      walletBalance: 0,
      activeDepositTotal: 0,
      outstandingTotal: 0,
      lifetimeSaleTotal: 0,
    });
  }

  // Aggregate deposits — only active counted
  for (const d of deposits) {
    if (d?.status !== 'active') continue;
    const id = String(d?.customerId || '');
    const summary = out.get(id);
    if (!summary) continue;
    summary.activeDepositTotal += safeNum(d.amount);
  }

  // Aggregate sales — void sales excluded
  for (const s of sales) {
    if (s?.isVoid === true) continue;
    const id = String(s?.customerId || '');
    const summary = out.get(id);
    if (!summary) continue;
    summary.lifetimeSaleTotal += safeNum(s.totalAmount);
    if (s.paymentStatus !== 'paid') {
      summary.outstandingTotal += safeNum(s.totalRemaining);
    }
  }

  // Aggregate memberships — only active + non-expired counted
  for (const m of memberships) {
    if (m?.status !== 'active') continue;
    const id = String(m?.customerId || '');
    const summary = out.get(id);
    if (!summary) continue;
    const days = daysBetween(m.expiresAt, nowDate);
    if (days <= 0) continue;
    summary.membershipTier = m.tier || '';
    summary.membershipDaysLeft = days;
  }

  // Aggregate wallets (V64 schema: composite doc-id; key by customerId FIELD; SUM balances)
  for (const w of wallets) {
    const id = String(w?.customerId || '');
    const summary = out.get(id);
    if (!summary) continue;
    summary.walletBalance += safeNum(w.balance);
  }

  return out;
}
