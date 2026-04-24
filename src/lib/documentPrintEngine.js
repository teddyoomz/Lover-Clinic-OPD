// ─── Document Print Engine — Phase 14.1 ────────────────────────────────────
// Renders `be_document_templates` HTML with {{placeholder}} replacement and
// opens the browser print dialog. Pure (no React imports) so it can be
// unit-tested + reused from non-React contexts.
//
// Placeholder strategy: whitelist-based replacement. Any {{key}} token
// matched against the flat `values` object is replaced with the
// HTML-escaped string value. Unknown tokens are replaced with the empty
// string (intentional — staff can leave fields blank for per-print fill-in
// by hand on the printed paper).
//
// Paper sizes map to @page + body dimensions:
//   A4        → 210 × 297 mm
//   A5        → 148 × 210 mm
//   label-57x32 → 57 × 32 mm (zebra/brother medicine-label printer)
//
// The engine does NOT sanitize the HTML template — the template is
// authored by staff via the CRUD UI, which is gated by Firestore rules
// (isClinicStaff() only). Treat templates as trusted input.

import { thaiTodayISO, bangkokNow } from '../utils.js';

/** HTML-escape a string value for safe replacement. */
export function htmlEscape(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the union of default context values (customer/clinic/today) + the
 * per-document fill values. Per-document values win on collision.
 * Exported for unit test.
 */
export function buildPrintContext({ clinic = {}, customer = {}, values = {} } = {}) {
  const ctx = {};

  // Clinic defaults
  ctx.clinicName     = clinic.clinicName || clinic.name || 'คลินิก';
  ctx.clinicAddress  = clinic.address || '';
  ctx.clinicPhone    = clinic.phone || '';
  ctx.clinicEmail    = clinic.email || '';
  ctx.clinicTaxId    = clinic.taxId || '';

  // Customer defaults
  const pd = customer.patientData || {};
  ctx.customerName   = customer.customerName || customer.name
    || `${pd.prefix || ''} ${pd.firstName || ''} ${pd.lastName || ''}`.trim()
    || '';
  ctx.customerHN     = customer.proClinicHN || customer.hn || customer.customerHN || '';
  ctx.nationalId     = pd.nationalId || customer.nationalId || '';
  ctx.age            = pd.age || customer.age || '';
  ctx.gender         = pd.gender || '';
  ctx.phone          = pd.phone || '';

  // Today (Bangkok TZ)
  const today = thaiTodayISO();
  const [y, m, d] = today.split('-');
  ctx.today = `${d}/${m}/${y}`; // dd/mm/yyyy CE
  ctx.todayISO = today;

  // Bilingual convenience: buddhist year
  const be = (Number(y) + 543).toString();
  ctx.todayBE = `${d}/${m}/${be}`;

  // Merge per-document values last (override defaults if keys collide)
  return { ...ctx, ...values };
}

/**
 * Replace {{key}} tokens in the template with context values. Unknown
 * placeholders are emptied (not left as literal `{{key}}`).
 *
 * @param {string} template
 * @param {Record<string, any>} context
 * @returns {string}
 */
export function renderTemplate(template, context = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, key) => {
    const v = context[key];
    if (v == null || v === '') return '';
    return htmlEscape(v);
  });
}

/** Build full HTML document (DOCTYPE + head + body) for print. */
export function buildPrintDocument({ template, context, paperSize = 'A4', language = 'th', title = 'Document' }) {
  const bodyHtml = renderTemplate(template, context);
  const sizeMap = {
    'A4':         { w: '210mm', h: '297mm', padding: '18mm' },
    'A5':         { w: '148mm', h: '210mm', padding: '12mm' },
    'label-57x32':{ w: '57mm',  h: '32mm',  padding: '2mm' },
  };
  const sz = sizeMap[paperSize] || sizeMap['A4'];
  const lang = language === 'en' ? 'en' : language === 'bilingual' ? 'th' : 'th';
  const fontFamily = paperSize === 'label-57x32'
    ? "'Sarabun', 'Noto Sans Thai', sans-serif"
    : "'Sarabun', 'TH Sarabun New', 'Noto Sans Thai', Tahoma, sans-serif";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${htmlEscape(title)}</title>
<style>
  @page { size: ${sz.w} ${sz.h}; margin: 0; }
  html, body { margin: 0; padding: 0; font-family: ${fontFamily}; font-size: 14px; color: #000; background: #fff; }
  body { width: ${sz.w}; min-height: ${sz.h}; padding: ${sz.padding}; box-sizing: border-box; }
  @media print { body { padding: ${sz.padding}; } }
  h1, h2, h3 { margin-top: 0; }
  hr { border: 0; border-top: 1px solid #000; }
  ul { padding-left: 20px; }
  p { margin: 6px 0; line-height: 1.5; }
</style>
</head>
<body>
${bodyHtml}
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 200);
  });
  window.addEventListener('afterprint', function () {
    setTimeout(function () { window.close(); }, 100);
  });
</script>
</body>
</html>`;
}

/**
 * Open a new browser window, write the print HTML, and trigger print.
 * Returns a reference to the new window (null if popup blocked). The
 * window auto-closes after `afterprint` fires. This is a side-effectful
 * function — tests exercise buildPrintDocument instead.
 */
export function openPrintWindow({ template, context, paperSize, language, title }) {
  if (typeof window === 'undefined') return null;
  const doc = buildPrintDocument({ template, context, paperSize, language, title });
  const win = window.open('', '_blank', 'width=800,height=900,menubar=no,toolbar=no');
  if (!win) return null;
  win.document.open();
  win.document.write(doc);
  win.document.close();
  return win;
}

/**
 * High-level: render + print a template doc with merged context.
 *
 * @param {object} opts
 * @param {object} opts.template — be_document_templates record
 * @param {object} [opts.clinic] — clinic_settings
 * @param {object} [opts.customer] — be_customers record
 * @param {object} [opts.values] — per-document fillable values (from form)
 */
export function printDocument({ template, clinic, customer, values } = {}) {
  if (!template || typeof template !== 'object') throw new Error('template required');
  const context = buildPrintContext({ clinic, customer, values });
  return openPrintWindow({
    template: template.htmlTemplate || '',
    context,
    paperSize: template.paperSize || 'A4',
    language: template.language || 'th',
    title: template.name || 'Document',
  });
}
