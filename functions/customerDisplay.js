// functions/customerDisplay.js — PURE CJS mirror of src/lib/customerDisplayName.js
// (resolveCustomerDisplayName + resolveCustomerHN). The Cloud Function is a SEPARATE
// CJS deploy package (Cloud Run) and CANNOT import the ESM src/lib module, so this is
// the sanctioned duplicate. KEEP IN SYNC with the canonical ESM resolver — parity is
// covered by tests/notification-content.test.js (N9). Resolvers are stable (V105/V131).

// Walk all known name-shape variants in priority order (matches the ESM canonical):
// patientData Thai → patientData camelCase → top-level lowercase → customerName/name → nickname.
function resolveCustomerName(customer) {
  if (!customer || typeof customer !== 'object') return '';
  const pd = customer.patientData || {};
  const prefix = String(pd.prefix || customer.prefix || '').trim();
  const compose = (first, last) => {
    const f = String(first || '').trim();
    const l = String(last || '').trim();
    if (!f && !l) return '';
    const full = [f, l].filter(Boolean).join(' ');
    return prefix ? `${prefix} ${full}`.trim() : full;
  };
  let n = compose(pd.firstNameTh, pd.lastNameTh);
  if (!n) n = compose(pd.firstName, pd.lastName);
  if (!n) n = compose(customer.firstname, customer.lastname);
  if (!n) n = String(customer.customerName || '').trim();
  if (!n) n = String(customer.name || '').trim();
  if (!n) n = String(pd.nicknameTh || pd.nickname || customer.nickname || '').trim();
  return n;
}

// HN walk (V131: real HN lives in hn_no; proClinicHN is empty for all real customers).
function resolveCustomerHN(customer) {
  if (!customer || typeof customer !== 'object') return '';
  const pd = customer.patientData || {};
  return String(
    customer.proClinicHN
    || pd.hn || pd.HN || pd.proClinicHN
    || customer.hn || customer.HN || customer.hn_no
    || ''
  ).trim();
}

module.exports = { resolveCustomerName, resolveCustomerHN };
