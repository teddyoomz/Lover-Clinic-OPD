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
 *
 * Phase 14.2 — accepts `language` ('th' | 'en' | 'bilingual') and `toggles`
 * (Object<key, bool>) so {{#lang}} and {{#if/unless}} blocks in the
 * template render correctly. Both are surfaced as top-level context keys.
 *
 * Exported for unit test.
 */
export function buildPrintContext({ clinic = {}, customer = {}, values = {}, language = '', toggles = {} } = {}) {
  const ctx = {};

  // Language selector — used by {{#lang th}}/{{#lang en}}/{{#lang bilingual}}.
  ctx.language = ['th', 'en', 'bilingual'].includes(language) ? language : 'th';

  // Toggles — boolean keys spliced into context so {{#if showCertNumber}}
  // works without nested objects.
  if (toggles && typeof toggles === 'object') {
    for (const [k, v] of Object.entries(toggles)) {
      if (k && typeof k === 'string') ctx[k] = !!v;
    }
  }

  // Clinic defaults — Phase 14.2: full ProClinic-cert header set.
  // Accept both legacy keys (address/phone/taxId/email) and the new
  // ClinicSettingsPanel keys (clinicAddress / clinicPhone / clinicTaxId /
  // clinicEmail / clinicLicenseNo / clinicNameEn / clinicAddressEn).
  ctx.clinicName     = clinic.clinicName || clinic.name || 'คลินิก';
  ctx.clinicNameEn   = clinic.clinicNameEn || clinic.nameEn || '';
  ctx.clinicAddress  = clinic.clinicAddress || clinic.address || '';
  ctx.clinicAddressEn = clinic.clinicAddressEn || clinic.addressEn || '';
  ctx.clinicPhone    = clinic.clinicPhone || clinic.phone || '';
  ctx.clinicEmail    = clinic.clinicEmail || clinic.email || '';
  ctx.clinicTaxId    = clinic.clinicTaxId || clinic.taxId || '';
  ctx.clinicLicenseNo = clinic.clinicLicenseNo || clinic.licenseNo || '';

  // Customer defaults
  const pd = customer.patientData || {};
  ctx.customerName   = customer.customerName || customer.name
    || `${pd.prefix || ''} ${pd.firstName || ''} ${pd.lastName || ''}`.trim()
    || '';
  ctx.customerHN     = customer.proClinicHN || customer.hn || customer.customerHN || '';
  ctx.nationalId     = pd.nationalId || customer.nationalId || '';
  ctx.age            = pd.age || customer.age || '';
  // Gender — translated when doc language is English (fit-to-fly etc).
  // Thai source values: ชาย / หญิง / อื่นๆ → Male / Female / Other.
  const rawGender = pd.gender || '';
  if (ctx.language === 'en') {
    const map = { 'ชาย': 'Male', 'หญิง': 'Female', 'อื่นๆ': 'Other', 'อื่น': 'Other' };
    ctx.gender = map[rawGender] || rawGender;
  } else {
    ctx.gender = rawGender;
  }
  ctx.phone          = pd.phone || '';

  // Today (Bangkok TZ). Phase 14.x — language-aware year:
  //   th       → Buddhist year (พ.ศ.) e.g. 25/04/2569
  //   en       → CE year e.g. 25/04/2026
  //   bilingual → Buddhist year (Thai cultural default; EN block can use {{todayCE}})
  const today = thaiTodayISO();
  const [y, m, d] = today.split('-');
  const ce = y;
  const be = (Number(y) + 543).toString();
  ctx.todayCE = `${d}/${m}/${ce}`;
  ctx.todayBE = `${d}/${m}/${be}`;
  ctx.today   = (ctx.language === 'en') ? ctx.todayCE : ctx.todayBE;
  ctx.todayISO = today;

  // Merge per-document values last (override defaults if keys collide)
  return { ...ctx, ...values };
}

/**
 * Render a template with {{key}} replacement + conditional blocks.
 *
 * Phase 14.2 (2026-04-25): added `{{#if key}}...{{/if}}` blocks to
 * support ProClinic-style toggles (เลขที่ on/off · ลายเซ็นคนไข้ on/off ·
 * etc.). Blocks render their inner content ONLY if `context[key]` is
 * truthy; otherwise the entire block is dropped. Unknown {{key}} tokens
 * still empty out as before.
 *
 * Token grammar:
 *  - Replacement: {{name}} where name = /[a-zA-Z_][a-zA-Z0-9_]*  /
 *  - Conditional block: {{#if name}}...{{/if}}
 *  - Conditional inverse: {{#unless name}}...{{/unless}} (rendered when key falsy)
 *  - Language block: {{#lang th}}...{{/lang}} renders only when context.language === 'th'
 *    (or 'bilingual'). Same for {{#lang en}}.
 *
 * Conditional blocks may NOT be nested in this implementation — keeps the
 * parser simple. If nesting becomes necessary, switch to a real template
 * lib (Mustache/Handlebars) in a follow-up.
 *
 * @param {string} template
 * @param {Record<string, any>} context
 * @returns {string}
 */
export function renderTemplate(template, context = {}) {
  if (typeof template !== 'string') return '';

  // 1) Strip conditional blocks first (so any {{key}} they contain is also
  //    dropped). Order: lang → unless → if.
  let out = template;

  out = out.replace(/\{\{#lang\s+(th|en|bilingual)\}\}([\s\S]*?)\{\{\/lang\}\}/g, (_m, blockLang, body) => {
    const lang = String(context.language || 'th');
    if (blockLang === 'bilingual') return body;
    if (lang === 'bilingual') return body; // bilingual context renders both blocks
    return blockLang === lang ? body : '';
  });

  out = out.replace(/\{\{#unless\s+([a-zA-Z_][a-zA-Z0-9_]*)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_m, key, body) => {
    return context[key] ? '' : body;
  });

  out = out.replace(/\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_]*)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, key, body) => {
    return context[key] ? body : '';
  });

  // 2) Phase 14.2.C — raw-HTML placeholder `{{{key}}}` (3 braces). Used for
  //    pre-rendered table rows / lists where the value IS HTML and must NOT
  //    be escaped. Bypasses htmlEscape entirely. Use sparingly — only for
  //    fields built by app code (never user input).
  out = out.replace(/\{\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}\}/g, (_m, key) => {
    const v = context[key];
    if (v == null || v === '') return '';
    return String(v);
  });

  // 3) Then simple replacements — escape values, drop unknowns.
  out = out.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, key) => {
    const v = context[key];
    if (v == null || v === '') return '';
    return htmlEscape(v);
  });

  return out;
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
 * @param {string} [opts.language] — override language ('th' | 'en' | 'bilingual'),
 *                                   defaults to template.language
 * @param {Record<string, boolean>} [opts.toggles] — show/hide gate values
 */
export function printDocument({ template, clinic, customer, values, language, toggles } = {}) {
  if (!template || typeof template !== 'object') throw new Error('template required');
  const finalLang = language || template.language || 'th';
  const context = buildPrintContext({ clinic, customer, values, language: finalLang, toggles });
  return openPrintWindow({
    template: template.htmlTemplate || '',
    context,
    paperSize: template.paperSize || 'A4',
    language: finalLang,
    title: template.name || 'Document',
  });
}
