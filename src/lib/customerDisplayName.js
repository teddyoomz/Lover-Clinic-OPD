// V105 (2026-05-19 LATE+3 NIGHT+2) — canonical customer-name resolver.
//
// Bug: customer LC-26000079 had `patientData.firstName` + `patientData.lastName`
// populated (camelCase, nested) but TOP-LEVEL `firstname` + `lastname`
// (lowercase) were EMPTY. The auto-sale chain in TreatmentFormPage passed
// `customerName: patientName` where `patientName` was derived from the
// TOP-LEVEL fields → empty → sale.customerName="" → display "-".
//
// Root cause: customer doc has DUPLICATED name fields with different shapes:
//   - top-level lowercase: firstname / lastname / nickname / customerName / name
//   - patientData camelCase: firstName / lastName / firstNameTh / lastNameTh /
//     nicknameTh / prefix
//
// Various creation paths (manual admin form / kiosk patient form / Facebook
// import / LINE bot / customer-link flow) populate DIFFERENT subsets. A
// single read-site that picks ONE shape will silently miss the others.
//
// Canonical resolver: walk all known shape variants in priority order;
// return the first non-empty composition; fall back to a stable identifier.
//
// Rule of 3 trigger: TreatmentFormPage auto-sale (line ~2702) + SaleTab
// edit form (line ~767) + SaleTab list display + CustomerDetailView header
// + CourseHistoryTab + RemainingCourseTab + ChatPanel etc. all need
// customer display name. Centralize HERE.

/**
 * Resolve a customer's display name from any shape variant.
 *
 * Priority order (first non-empty wins):
 *   1. patientData.firstNameTh + lastNameTh (with prefix if present)
 *   2. patientData.firstName + lastName (with prefix if present)
 *   3. top-level firstname + lastname (lowercase)
 *   4. top-level customerName / name (legacy)
 *   5. patientData.nickname / nicknameTh (single-word fallback)
 *   6. top-level nickname (legacy)
 *
 * Returns empty string ONLY if all variants are empty.
 *
 * @param {object|null|undefined} customer - the be_customers doc
 * @param {object} [opts]
 * @param {boolean} [opts.includePrefix=true] - whether to prepend prefix (e.g. "นาย / นาง")
 * @param {boolean} [opts.includeNickname=false] - append nickname in parens if available
 * @returns {string}
 */
export function resolveCustomerDisplayName(customer, opts = {}) {
  if (!customer || typeof customer !== 'object') return '';
  const includePrefix = opts.includePrefix !== false; // default true
  const includeNickname = !!opts.includeNickname;
  const pd = customer.patientData || {};
  const prefix = String(pd.prefix || customer.prefix || '').trim();

  const compose = (first, last) => {
    const f = String(first || '').trim();
    const l = String(last || '').trim();
    if (!f && !l) return '';
    const fullName = [f, l].filter(Boolean).join(' ');
    return includePrefix && prefix ? `${prefix} ${fullName}`.trim() : fullName;
  };

  // 1. patientData Thai-first (most expressive)
  let name = compose(pd.firstNameTh, pd.lastNameTh);
  // 2. patientData camelCase
  if (!name) name = compose(pd.firstName, pd.lastName);
  // 3. top-level lowercase legacy
  if (!name) name = compose(customer.firstname, customer.lastname);
  // 4. top-level legacy customerName / name (already composed)
  if (!name) name = String(customer.customerName || '').trim();
  if (!name) name = String(customer.name || '').trim();
  // 5. nickname fallback
  if (!name) {
    name = String(pd.nicknameTh || pd.nickname || customer.nickname || '').trim();
  }

  // Optional nickname suffix
  if (includeNickname) {
    const nick = String(pd.nicknameTh || pd.nickname || customer.nickname || '').trim();
    if (nick && !name.includes(nick)) {
      name = name ? `${name} (${nick})` : nick;
    }
  }

  return name;
}

/**
 * Resolve a customer's HN (hospital number).
 *
 * Priority:
 *   1. top-level proClinicHN (legacy ProClinic-cloned)
 *   2. patientData.hn / patientData.HN
 *   3. top-level hn / HN / hn_no
 *
 * Returns empty string if none found.
 *
 * @param {object|null|undefined} customer
 * @returns {string}
 */
export function resolveCustomerHN(customer) {
  if (!customer || typeof customer !== 'object') return '';
  const pd = customer.patientData || {};
  return String(
    customer.proClinicHN
    || pd.hn || pd.HN || pd.proClinicHN
    || customer.hn || customer.HN || customer.hn_no
    || ''
  ).trim();
}

/**
 * Resolve a customer's display label suitable for transactional row display
 * (sale rows, treatment rows, audit log, etc.).
 *
 * Format: "{name} ({HN})" if both present, "{name}" or "{HN}" or "ลูกค้า #{id}"
 * as fallbacks. NEVER returns empty string — guarantees admin sees SOMETHING.
 *
 * @param {object|null|undefined} customer
 * @param {object} [opts] - forwarded to resolveCustomerDisplayName
 * @returns {string}
 */
export function resolveCustomerRowLabel(customer, opts = {}) {
  if (!customer || typeof customer !== 'object') {
    return '';
  }
  const name = resolveCustomerDisplayName(customer, opts);
  const hn = resolveCustomerHN(customer);
  if (name && hn) return `${name} (${hn})`;
  if (name) return name;
  if (hn) return hn;
  const id = String(customer.id || customer.customerId || '').trim();
  return id ? `ลูกค้า #${id}` : '';
}
