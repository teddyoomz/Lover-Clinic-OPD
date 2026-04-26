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

// Allowlist for <img src=""> values used in signature injection. Print
// templates may embed an <img> with a Firebase Storage URL or a base64
// data-URL — anything else (javascript:, file:, data:text/html, …) is
// rejected. Returns '' when the URL is unsafe so safeImgTag falls back to
// "no image" instead of injecting a hostile attribute.
const SAFE_IMG_URL_RE = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i;

/**
 * Build a sanitized `<img>` tag for direct innerHTML injection. Used by
 * staff-select signature auto-fill where the template carries `{{{key}}}`
 * (raw-HTML triple-mustache). All inputs are HTML-escaped; URL is
 * allow-listed against http(s) + data:image/*. Empty / unsafe URL → ''.
 *
 * style is optional inline CSS string (already trusted callsite).
 */
export function safeImgTag(url, { alt = '', style = '' } = {}) {
  if (!url || typeof url !== 'string') return '';
  if (!SAFE_IMG_URL_RE.test(url.trim())) return '';
  const safeUrl = htmlEscape(url.trim());
  const safeAlt = htmlEscape(alt);
  const safeStyle = htmlEscape(style);
  return `<img src="${safeUrl}" alt="${safeAlt}"${safeStyle ? ` style="${safeStyle}"` : ''}/>`;
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
  // Phase 14.10-tris (2026-04-26) — also expose customerNameEn for English
  // / bilingual certificates (fit-to-fly, etc.).
  ctx.customerNameEn = customer.customerNameEn
    || `${pd.firstNameEn || ''} ${pd.lastNameEn || ''}`.trim()
    || '';
  ctx.customerHN     = customer.proClinicHN || customer.hn || customer.customerHN || '';
  // Aliases — some templates use these alternate names
  ctx.hn             = ctx.customerHN;
  ctx.HN             = ctx.customerHN;
  ctx.nationalId     = pd.nationalId || customer.nationalId || '';
  ctx.age            = pd.age || customer.age || '';
  ctx.ageMonth       = pd.ageMonth || customer.ageMonth || '';
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
  // Phase 14.10-tris (2026-04-26) — extended customer fields. User reported
  // "บาง template ไม่ดึง HN และกรอก text ไม่ตรงช่อง Form" — templates use
  // `{{patientAddress}}`, `{{birthdate}}`, `{{bloodGroup}}`,
  // `{{emergencyName}}`, `{{emergencyPhone}}` but buildPrintContext didn't
  // populate them. Result: every consent / patient-referral / fit-to-fly
  // doc rendered with blank ที่อยู่ + เบอร์ติดต่อฉุกเฉิน fields.
  // Fix: pull from be_customers.patientData.* with fallbacks for legacy
  // shapes (some have address as a string, some as a structured object).
  ctx.patientAddress = pd.address
    || (pd.addressFull ? pd.addressFull : '')
    || customer.address
    || '';
  ctx.birthdate      = pd.birthdate || pd.dateOfBirth || customer.birthdate || '';
  ctx.bloodGroup     = pd.bloodGroup || pd.bloodType || customer.bloodGroup || '';
  ctx.emergencyName  = pd.emergencyName || pd.emergencyContact?.name || customer.emergencyName || '';
  ctx.emergencyPhone = pd.emergencyPhone || pd.emergencyContact?.phone || customer.emergencyPhone || '';
  ctx.passport       = pd.passport || pd.passportNo || customer.passport || '';
  ctx.visitCount     = customer.stats?.visitCount || customer.visitCount || '';

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

  // Phase 14.x — auto-format ISO dates in user-provided values to match
  // the doc's language. Without this, date fields (restFrom / restTo /
  // treatmentDate / etc) render as raw "2026-04-25" instead of "25/04/2569"
  // or "25/04/2026".
  const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  // Phase 14.8.B (2026-04-26) — detect raw signature data URLs and auto-wrap
  // in <img> tag so templates can use {{{patientSignature}}} (3-brace raw)
  // and get the rendered image. Already-wrapped values (staff-select sig
  // pattern) start with `<img` and are left untouched.
  const isRawSignatureDataUrl = (s) =>
    typeof s === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s);
  const formattedValues = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (isIsoDate(v)) {
      const [yy, mm, dd] = v.split('-');
      const yr = ctx.language === 'en' ? yy : (Number(yy) + 543).toString();
      formattedValues[k] = `${dd}/${mm}/${yr}`;
    } else if (isRawSignatureDataUrl(v)) {
      formattedValues[k] = safeImgTag(v, { alt: 'ลายเซ็น', style: 'max-height:60px;' });
    } else {
      formattedValues[k] = v;
    }
  }
  // Merge per-document values last (override defaults if keys collide)
  return { ...ctx, ...formattedValues };
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

/**
 * Build full HTML document (DOCTYPE + head + body) for print.
 *
 * Phase 14.9 (2026-04-26) — `watermark` optional string. When non-empty,
 * a diagonal repeating-text watermark overlays every page. Used for "DRAFT"
 * / "VOID" / "COPY" stamps. Implementation: fixed-position transparent
 * pseudo-overlay with rotated text. Print color-adjust forces it to render
 * even with default-print-no-backgrounds settings.
 */
export function buildPrintDocument({ template, context, paperSize = 'A4', language = 'th', title = 'Document', watermark = '' }) {
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
  /* 2026-04-25 — text-on-underline alignment for "fill-in-the-blank" form
     lines. All inline-block spans with a dotted border-bottom get tight
     line-height + top padding so the value text sits ON the underline
     (not floating above it). Catches all 110 underline spans across
     16 templates without per-span style edits. */
  span[style*="border-bottom:1px dotted"][style*="display:inline-block"],
  span[style*="border-bottom: 1px dotted"][style*="display: inline-block"] {
    line-height: 1 !important;
    padding-top: 6px !important;
    padding-bottom: 2px !important;
    vertical-align: bottom !important;
  }
  /* 2026-04-25 — multi-line content boxes (chart CC/HPI/PMH/PE/Tx Plan,
     plus cert findings/recommendation/treatment fields). These are
     <div> with min-height + border-bottom that act like textarea-style
     fill areas. Without the rule, text sits at TOP of the box. Use flex
     column + justify-content:flex-end so text grows from bottom up,
     last line sitting just above the underline.
     white-space: pre-wrap preserves user-typed newlines as actual line
     breaks on the printed page. */
  div[style*="border-bottom:1px dotted"][style*="min-height"],
  div[style*="border-bottom: 1px dotted"][style*="min-height"] {
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-end !important;
    padding-bottom: 2px !important;
    white-space: pre-wrap !important;
  }
  /* Same line-break preservation for any other field-content box that
     might receive multi-line user input (defensive). */
  span[style*="border-bottom:1px dotted"][style*="display:inline-block"] {
    white-space: pre-wrap !important;
  }
  /* Signature blocks — name + date below the signature line should be
     centered horizontally under the line, not left-aligned. Apply to
     every direct child div of a flex signature column. */
  .sig-col, .signature-col { text-align: center; }
  /* Phase 14.9 - watermark overlay (visible at print + screen).
     The print-color-adjust:exact rule forces the watermark to render even
     when the user prints with background graphics OFF - stamps always
     appear (DRAFT / VOID / COPY). */
  .doc-watermark {
    position: fixed;
    inset: 0;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc-watermark > span {
    transform: rotate(-30deg);
    font-size: ${paperSize === 'label-57x32' ? '14px' : '120px'};
    font-weight: 900;
    color: rgba(220, 38, 38, 0.18);
    letter-spacing: 0.05em;
    white-space: nowrap;
    user-select: none;
  }
</style>
</head>
<body>
${watermark ? `<div class="doc-watermark" aria-hidden="true"><span>${htmlEscape(watermark)}</span></div>` : ''}
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
export function openPrintWindow({ template, context, paperSize, language, title, watermark = '' }) {
  if (typeof window === 'undefined') return null;
  const doc = buildPrintDocument({ template, context, paperSize, language, title, watermark });
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
export function printDocument({ template, clinic, customer, values, language, toggles, watermark } = {}) {
  if (!template || typeof template !== 'object') throw new Error('template required');
  const finalLang = language || template.language || 'th';
  const context = buildPrintContext({ clinic, customer, values, language: finalLang, toggles });
  return openPrintWindow({
    template: template.htmlTemplate || '',
    context,
    paperSize: template.paperSize || 'A4',
    language: finalLang,
    title: template.name || 'Document',
    watermark: watermark || template.watermark || '',
  });
}

// ─── Phase 14.10 (2026-04-26) — QR code dataURL helper ──────────────────
// Generates a QR code as base64 PNG data URL. Lazy-imports the `qrcode`
// lib so it stays out of the main bundle (~30 KB).
//
// @param {string} text — payload to encode (URL, ID, etc.)
// @param {Object} [opts] — { width: 100, margin: 2 }
// @returns {Promise<string>} data:image/png;base64,...
export async function generateQrDataUrl(text, { width = 120, margin = 2 } = {}) {
  if (!text || typeof text !== 'string') return '';
  const qrcodeModule = await import('qrcode');
  const QRCode = qrcodeModule.default || qrcodeModule;
  const url = await QRCode.toDataURL(String(text), { width, margin, errorCorrectionLevel: 'M' });
  // toDataURL returns 'data:image/png;base64,...' — buildPrintContext will
  // auto-wrap in safeImgTag for templates using {{{key}}}.
  return url;
}

// ─── Phase 14.8.C (2026-04-26) — PDF export via html2pdf.js ──────────────
// User directive (Tier 3 P1): "T3.c Phase 14.8.C PDF export".
//
// html2pdf.js renders an HTML string to a PDF blob via html2canvas + jsPDF.
// We lazy-import the lib so it isn't in the main bundle (it's ~150 KB).
// The produced PDF is a faithful render of buildPrintDocument's body —
// same paper size, same fonts (browser default), same images.
//
// Filename convention: <docTypeSlug>_<isoDate>_<HHmm>.pdf in user's locale.

/**
 * Slugify a Thai document name into a filesystem-safe ASCII suffix.
 * Falls back to "document" when the name is empty / all non-ASCII.
 */
export function pdfFilename({ docType, name, date = new Date() } = {}) {
  const stamp = date.toISOString().slice(0, 16).replace(/[:T-]/g, '').slice(0, 12);
  const slug = String(docType || name || 'document')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'document';
  return `${slug}_${stamp}.pdf`;
}

/**
 * Build paper-size config for html2pdf jsPDF backend. Maps our
 * canonical PAPER_SIZES (A4 / A5 / label-57x32) to jsPDF format/units.
 */
export function pdfPaperConfig(paperSize = 'A4') {
  switch (paperSize) {
    case 'A5':
      return { unit: 'mm', format: 'a5', orientation: 'portrait' };
    case 'label-57x32':
      return { unit: 'mm', format: [57, 32], orientation: 'landscape' };
    case 'A4':
    default:
      return { unit: 'mm', format: 'a4', orientation: 'portrait' };
  }
}

/**
 * Export a document template to PDF + trigger browser download.
 * Lazy-imports html2pdf.js so the lib stays out of the main bundle.
 *
 * @param {Object} opts
 * @param {Object} opts.template — same shape as printDocument template
 * @param {Object} opts.clinic
 * @param {Object} opts.customer
 * @param {Record<string, any>} opts.values
 * @param {string} [opts.language]
 * @param {Record<string, boolean>} [opts.toggles]
 * @returns {Promise<{ filename: string, blob: Blob }>}
 */
// Phase 14.10-bis (2026-04-26) — paper size CSS map for the PDF render
// wrapper. MUST stay in sync with PAPER_SIZES in documentTemplateValidation.js
// + sizeMap inside buildPrintDocument. Used only in exportDocumentToPdf to
// inline body-equivalent styles on a wrapper div (body { width:..., padding:... }
// is silently dropped when innerHTML strips the <body> tag — V31-class bug
// where the source-grep tests passed but the real PDF output was broken).
const PDF_WRAPPER_STYLES = {
  'A4':         { w: '210mm', minH: '297mm', p: '18mm' },
  'A5':         { w: '148mm', minH: '210mm', p: '12mm' },
  'label-57x32':{ w: '57mm',  minH: '32mm',  p: '2mm' },
};

export async function exportDocumentToPdf({ template, clinic, customer, values, language, toggles, watermark } = {}) {
  if (!template || typeof template !== 'object') throw new Error('template required');
  const finalLang = language || template.language || 'th';
  const context = buildPrintContext({ clinic, customer, values, language: finalLang, toggles });
  const paperSize = template.paperSize || 'A4';
  const html = buildPrintDocument({
    template: template.htmlTemplate || '',
    context,
    paperSize,
    language: finalLang,
    title: template.name || 'Document',
    watermark: watermark || template.watermark || '',
  });

  // Lazy import — keeps main bundle small (html2pdf.js is ~150 KB).
  const html2pdfModule = await import('html2pdf.js');
  const html2pdf = html2pdfModule.default || html2pdfModule;

  const filename = pdfFilename({ docType: template.docType, name: template.name });
  const paper = pdfPaperConfig(paperSize);

  // ─── BUG FIX (Phase 14.10-bis 2026-04-26) ────────────────────────
  // When you set `container.innerHTML = '<!DOCTYPE...><body style="width:210mm;
  // padding:18mm">...</body>'`, HTML5's "in body" insertion mode STRIPS
  // the wrapping <body> tag. The body element is gone. The CSS selector
  // `body { width:210mm; padding:18mm }` then matches NOTHING. Result:
  // PDF content bleeds to all 4 edges (zero padding).
  //
  // Fix: build a wrapper <div> with body-equivalent styles INLINED, copy
  // the <style> blocks across (so .doc-watermark / .sig-col / etc. selectors
  // still work), append wrapper to document.body so html2canvas snapshots
  // it with all CSS applied + fonts loaded, then clean up.
  const sz = PDF_WRAPPER_STYLES[paperSize] || PDF_WRAPPER_STYLES.A4;
  const fontFamily = paperSize === 'label-57x32'
    ? "'Sarabun', 'Noto Sans Thai', sans-serif"
    : "'Sarabun', 'TH Sarabun New', 'Noto Sans Thai', Tahoma, sans-serif";

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');

  // Hide-but-render strategy. Off-screen `position:fixed; left:-99999px`
  // produced BLANK PDFs in bulk-print mode (html2canvas snapshot failed
  // silently for elements outside the viewport in certain Chrome builds).
  // Use a visible-position wrapper inside a fixed-zero-size offstage
  // container so the wrapper IS in viewport coords (html2canvas happy)
  // but the user sees nothing (overflow hidden on the offstage parent).
  const offstage = document.createElement('div');
  offstage.setAttribute('data-pdf-offstage', 'true');
  offstage.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 0',
    'height: 0',
    'overflow: hidden',
    'pointer-events: none',
    'opacity: 0',
    'z-index: -9999',
  ].join('; ');

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-pdf-wrapper', 'true');
  // Phase 14.10-tris (2026-04-26) — height changed from `min-height: ${sz.minH}`
  // to `min-height: 0` + explicit `height: ${sz.minH}` because html2pdf was
  // capturing wrapper at content-natural-height which sometimes exceeded
  // the minH and forced a 2nd blank page in the PDF. Using fixed height
  // + overflow:hidden constrains content to exactly 1 page; templates
  // shorter than 1 page get whitespace fill (correct), templates longer
  // get cropped (admin sees + can fix template).
  wrapper.style.cssText = [
    `width: ${sz.w}`,
    `height: ${sz.minH}`,
    `padding: ${sz.p}`,
    'box-sizing: border-box',
    'background: #ffffff',
    'color: #000000',
    `font-family: ${fontFamily}`,
    'font-size: 14px',
    'margin: 0',
    'position: relative',
    'overflow: hidden',
  ].join('; ');

  // Copy all <style> blocks from the parsed head so class-based selectors
  // (.doc-watermark, .sig-col, etc.) apply.
  parsed.querySelectorAll('style').forEach((s) => {
    wrapper.appendChild(s.cloneNode(true));
  });
  // Copy body content. parsed.body always exists with DOMParser('text/html').
  const parsedBody = parsed.body;
  if (parsedBody) {
    Array.from(parsedBody.childNodes).forEach((node) => {
      // Skip the auto-print <script> — it's only relevant in the print window
      if (node.nodeType === 1 && node.tagName === 'SCRIPT') return;
      wrapper.appendChild(node.cloneNode(true));
    });
  }

  offstage.appendChild(wrapper);
  document.body.appendChild(offstage);
  let pdfBlob;
  try {
    // Wait one frame so layout + fonts settle before html2canvas snapshot
    await new Promise((r) => requestAnimationFrame(() => r()));
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      try { await document.fonts.ready; } catch { /* non-fatal */ }
    }

    const opt = {
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      // Phase 14.10-bis fix — offstage container has 0×0 + overflow:hidden,
      // BUT html2canvas needs the actual wrapper at proper dims. Pass
      // explicit width/height so html2canvas captures wrapper correctly
      // even though its parent clips to 0×0.
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: wrapper.offsetWidth || (paperSize === 'A5' ? 559 : paperSize === 'label-57x32' ? 215 : 794),
        windowHeight: wrapper.offsetHeight || (paperSize === 'A5' ? 794 : paperSize === 'label-57x32' ? 121 : 1123),
      },
      jsPDF: paper,
      // Phase 14.10-tris (2026-04-26) — force single-page render. Without
      // this, content overflowing the page split into a 2nd PDF page —
      // and even content fitting exactly sometimes produced a blank 2nd
      // page due to html2pdf's default split heuristic (the bug user
      // reported as "เกินมา 1 หน้าเป็นหน้าเปล่า"). 'avoid-all' keeps
      // each html2pdf source on a single PDF page; admin sees the cropped
      // overflow visually and can fix the template.
      pagebreak: { mode: 'avoid-all' },
    };
    pdfBlob = await html2pdf().from(wrapper).set(opt).outputPdf('blob');
  } finally {
    if (offstage.parentNode === document.body) document.body.removeChild(offstage);
  }

  // Trigger download via object URL — browsers honor `download` attr.
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick — Chrome aborts the download if revoked too soon.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename, blob: pdfBlob };
}
