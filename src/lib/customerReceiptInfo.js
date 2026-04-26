// V33-customer-create — Customer receipt-info resolver.
//
// Customer doc carries receipt_type + 4 personal_receipt_* + 4 company_receipt_*
// fields (set via CustomerCreatePage / EditCustomerForm). This helper produces
// a flat snapshot of {type, name, taxId, phone, address} that gets stored on
// the sale doc at creation time so the print view + future audit calls have
// what they need without re-querying the customer.
//
// Snapshot pattern (not live-link): once a sale is created, the receipt info
// is frozen. If the customer later changes their receipt config, EXISTING
// sales keep their original info. This matches accounting standards (the
// receipt represents the transaction at that moment in time).
//
// Three modes by `receipt_type`:
//   'personal' → use personal_receipt_* fields (custom name / tax-id / etc.)
//   'company'  → use company_receipt_* fields (juristic person)
//   '' or null → INHERIT from customer's regular profile (firstname/lastname
//                + address + telephone_number + citizen_id-as-tax-id)

const TYPES = Object.freeze({
  PERSONAL: 'personal',
  COMPANY: 'company',
  INHERIT: '',
});

function pickFromCustomer(customer, key, patientDataKey) {
  if (!customer || typeof customer !== 'object') return '';
  // Try root flat field first (post-V33 docs), then patientData camelCase mirror.
  const root = customer[key];
  const pd = patientDataKey ? customer.patientData?.[patientDataKey] : null;
  return String(root || pd || '').trim();
}

/**
 * Resolve the receipt info to embed on a new sale / quotation doc.
 * Returns a flat snapshot — never reads back to the customer at print time.
 */
export function resolveCustomerReceiptInfo(customer) {
  if (!customer || typeof customer !== 'object') {
    return { type: TYPES.INHERIT, name: '', taxId: '', phone: '', address: '' };
  }

  const type = String(customer.receipt_type || customer.patientData?.receiptType || '').trim();

  if (type === TYPES.PERSONAL) {
    return {
      type: TYPES.PERSONAL,
      name: pickFromCustomer(customer, 'personal_receipt_name'),
      taxId: pickFromCustomer(customer, 'personal_receipt_tax_id'),
      phone: pickFromCustomer(customer, 'personal_receipt_phonenumber'),
      address: pickFromCustomer(customer, 'personal_receipt_address'),
    };
  }

  if (type === TYPES.COMPANY) {
    return {
      type: TYPES.COMPANY,
      name: pickFromCustomer(customer, 'company_receipt_name'),
      taxId: pickFromCustomer(customer, 'company_receipt_tax_id'),
      phone: pickFromCustomer(customer, 'company_receipt_phonenumber'),
      address: pickFromCustomer(customer, 'company_receipt_address'),
    };
  }

  // INHERIT — derive from customer's regular profile.
  const prefix = pickFromCustomer(customer, 'prefix', 'prefix');
  const first = pickFromCustomer(customer, 'firstname', 'firstName');
  const last = pickFromCustomer(customer, 'lastname', 'lastName');
  const fullName = `${prefix} ${first} ${last}`.replace(/\s+/g, ' ').trim();
  return {
    type: TYPES.INHERIT,
    name: fullName,
    taxId: pickFromCustomer(customer, 'citizen_id', 'nationalId'),  // citizen ID doubles as tax ID for individuals
    phone: pickFromCustomer(customer, 'telephone_number', 'phone'),
    address: pickFromCustomer(customer, 'address', 'address'),
  };
}

/**
 * Format the receipt-info block for print. Returns a multi-line array suitable
 * for rendering as `<div>{lines.map(l => <div>{l}</div>)}</div>`.
 */
export function formatReceiptInfoLines(receiptInfo) {
  if (!receiptInfo || typeof receiptInfo !== 'object') return [];
  const lines = [];
  if (receiptInfo.name) lines.push(receiptInfo.name);
  if (receiptInfo.taxId) lines.push(`เลขประจำตัวผู้เสียภาษี: ${receiptInfo.taxId}`);
  if (receiptInfo.address) lines.push(receiptInfo.address);
  if (receiptInfo.phone) lines.push(`โทร. ${receiptInfo.phone}`);
  return lines;
}

export const RECEIPT_TYPES = TYPES;
