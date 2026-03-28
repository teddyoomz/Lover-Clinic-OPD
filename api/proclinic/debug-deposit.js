// ─── TEMPORARY DEBUG: Deposit Form Analysis ─────────────────────────────────
// Shows exactly what the deposit form expects vs what we send
// DELETE THIS FILE after debugging is complete
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF } from './_lib/scraper.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { proClinicId, deposit, testSubmit, listDeposits } = req.body || {};
    const session = await createSession();
    const base = session.origin;

    // List mode: show deposit entries with delete buttons
    if (listDeposits) {
      const html = await session.fetchText(`${base}/admin/deposit`);
      const $ = cheerio.load(html);
      const deleteButtons = [];
      $('button.btn-delete[data-url], a.btn-delete[data-url], [data-url*="deposit"]').each((_, btn) => {
        deleteButtons.push({
          tag: btn.tagName,
          dataUrl: $(btn).attr('data-url'),
          classes: $(btn).attr('class'),
          text: $(btn).text().trim().substring(0, 50),
        });
      });
      // Also look for any delete/cancel links/forms
      const deleteLinks = [];
      $('a[href*="deposit"], form[action*="deposit"]').each((_, el) => {
        const href = $(el).attr('href') || $(el).attr('action') || '';
        if (href.includes('delete') || href.includes('cancel') || href.includes('destroy')) {
          deleteLinks.push({ tag: el.tagName, href, text: $(el).text().trim().substring(0, 50) });
        }
      });
      // Look for table rows or cards with deposit info
      const depositEntries = [];
      $('tr, .card, .deposit-item').each((_, el) => {
        const text = $(el).text().trim();
        if (text.includes('HN') || text.includes('฿') || text.includes('บาท')) {
          const delBtn = $(el).find('[data-url]');
          if (delBtn.length) {
            depositEntries.push({
              dataUrl: delBtn.attr('data-url'),
              snippet: text.replace(/\s+/g, ' ').substring(0, 200),
            });
          }
        }
      });
      // Raw: find ALL data-url attributes on the page
      const allDataUrls = [];
      $('[data-url]').each((_, el) => {
        allDataUrls.push({ tag: el.tagName, dataUrl: $(el).attr('data-url'), classes: $(el).attr('class')?.substring(0, 50) });
      });
      // Find all links/buttons related to deposits
      const depositLinks = [];
      $('a[href*="deposit"], button[onclick*="deposit"]').each((_, el) => {
        depositLinks.push({
          tag: el.tagName,
          href: $(el).attr('href') || $(el).attr('onclick') || '',
          text: $(el).text().trim().substring(0, 80),
          classes: ($(el).attr('class') || '').substring(0, 60),
        });
      });
      // Find deposit IDs in page (links like /deposit/123 or /deposit/123/edit)
      const depositIdLinks = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/deposit\/(\d+)/);
        if (m) depositIdLinks.push({ id: m[1], href, text: $(el).text().trim().substring(0, 80) });
      });
      // Look for edit/cancel/delete buttons/icons per row
      const actionButtons = [];
      $('a[href*="edit"], a[href*="cancel"], button[title], a[title]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const title = $(el).attr('title') || '';
        if (href.includes('deposit') || title.toLowerCase().includes('delete') || title.toLowerCase().includes('cancel') || title.includes('ลบ') || title.includes('ยกเลิก')) {
          actionButtons.push({ tag: el.tagName, href, title, text: $(el).text().trim().substring(0, 50) });
        }
      });
      return res.status(200).json({ success: true, deleteButtons, deleteLinks, depositEntries, allDataUrls, depositLinks: depositLinks.slice(0, 20), depositIdLinks: depositIdLinks.slice(0, 20), actionButtons });
    }

    // Step 1: GET /admin/deposit
    const html = await session.fetchText(`${base}/admin/deposit`);
    const $ = cheerio.load(html);
    const csrf = extractCSRF(html);

    // Find the modal form
    const modalForm = $('#createDepositModal form');
    const formAction = modalForm.attr('action') || 'NOT FOUND';
    const formMethod = modalForm.attr('method') || 'NOT FOUND';
    const formEnctype = modalForm.attr('enctype') || 'NOT FOUND';

    // Extract ALL fields from the modal
    const fields = [];
    const selector = modalForm.length
      ? '#createDepositModal input, #createDepositModal textarea, #createDepositModal select'
      : 'form input, form textarea, form select';

    $(selector).each((_, el) => {
      const name = $(el).attr('name');
      if (!name) return;
      const tag = el.tagName.toLowerCase();
      const type = $(el).attr('type') || tag;
      const val = $(el).val() || '';
      const required = $(el).attr('required') !== undefined;
      const checked = $(el).is(':checked');
      fields.push({ name, type, value: String(val).substring(0, 50), required, checked });
    });

    // Look for payment_method data sources (datalist, script data, hidden elements)
    const paymentMethodInput = $('#createDepositModal input[name="payment_method"]');
    const paymentMethodParent = paymentMethodInput.parent().parent().html() || '';
    const paymentMethodId = paymentMethodInput.attr('id') || '';
    const paymentMethodClass = paymentMethodInput.attr('class') || '';
    const paymentMethodList = paymentMethodInput.attr('list') || '';

    // Check for datalist
    const datalistOptions = [];
    if (paymentMethodList) {
      $(`#${paymentMethodList} option`).each((_, opt) => {
        datalistOptions.push($(opt).val() || $(opt).text().trim());
      });
    }

    // Search all datalists on the page
    const allDatalists = {};
    $('datalist').each((_, dl) => {
      const dlId = $(dl).attr('id') || 'unknown';
      const opts = [];
      $(dl).find('option').each((_, opt) => {
        opts.push($(opt).val() || $(opt).text().trim());
      });
      allDatalists[dlId] = opts;
    });

    // Search for JS arrays/objects containing payment methods in script tags
    const scriptPaymentData = [];
    $('script').each((_, s) => {
      const text = $(s).html() || '';
      if (text.includes('payment') || text.includes('Payment') || text.includes('KBank') || text.includes('SCB')) {
        // Extract relevant snippet
        const lines = text.split('\n').filter(l =>
          l.includes('payment') || l.includes('Payment') ||
          l.includes('KBank') || l.includes('SCB') || l.includes('Voucher')
        );
        scriptPaymentData.push(...lines.map(l => l.trim().substring(0, 200)));
      }
    });

    // Look for any select or list near payment_method
    const nearbySelects = [];
    paymentMethodInput.closest('.form-group, .col, .row, div').find('select, datalist').each((_, el) => {
      const opts = [];
      $(el).find('option').each((_, opt) => {
        opts.push({ value: $(opt).val(), text: $(opt).text().trim() });
      });
      nearbySelects.push({ tag: el.tagName, id: $(el).attr('id'), name: $(el).attr('name'), opts });
    });

    const result = {
      success: true,
      modalFound: modalForm.length > 0,
      formAction,
      formMethod,
      formEnctype,
      csrfFound: !!csrf,
      totalFields: fields.length,
      fields,
      paymentMethodDebug: {
        id: paymentMethodId,
        className: paymentMethodClass,
        listAttr: paymentMethodList,
        datalistOptions,
        allDatalists,
        scriptPaymentData,
        nearbySelects,
        parentHtml: paymentMethodParent.substring(0, 500),
      },
    };

    // If testSubmit flag is set and we have proClinicId, do a test POST
    if (testSubmit && proClinicId) {
      const params = new URLSearchParams();
      params.set('_token', csrf);

      // Set ALL defaults first
      for (const f of fields) {
        if (f.name === '_token') continue;
        if (f.type === 'checkbox' && !f.checked) continue;
        if (f.type === 'radio' && !f.checked) continue;
        params.set(f.name, f.value);
      }

      // Override with our deposit data
      params.set('customer_option', '2');
      params.set('customer_id', proClinicId);
      params.set('firstname', '');
      params.set('lastname', '');
      params.set('nickname', '');
      params.set('telephone_number', '');

      if (deposit) {
        if (deposit.paymentChannel) params.set('payment_method', deposit.paymentChannel);
        if (deposit.paymentAmount != null) params.set('deposit', String(deposit.paymentAmount));
        if (deposit.depositDate) params.set('payment_date', deposit.depositDate);
        if (deposit.depositTime) params.set('payment_time', deposit.depositTime);
        if (deposit.salesperson) {
          params.set('hasSeller1', 'on');
          params.set('seller_1_id', deposit.salesperson);
          params.set('sale_percent_1', '100');
          params.set('sale_total_1', String(deposit.paymentAmount || '0'));
        }
        params.set('hasAppointment', deposit.hasAppointment ? '1' : '0');
      }

      // Determine POST URL
      let postUrl = formAction;
      if (postUrl && !postUrl.startsWith('http')) {
        postUrl = postUrl.startsWith('/') ? `${base}${postUrl}` : `${base}/${postUrl}`;
      }
      if (!postUrl || postUrl === 'NOT FOUND') postUrl = `${base}/admin/deposit`;

      const sentKeys = [...params.keys()];

      const submitRes = await session.fetch(postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': csrf,
          'Referer': `${base}/admin/deposit`,
        },
        body: params.toString(),
        redirect: 'manual',
      });

      const status = submitRes.status;
      const location = submitRes.headers?.get?.('location') || '';
      const bodyText = await submitRes.text();

      // Try to extract error details from response
      const $resp = cheerio.load(bodyText);
      const exceptionMsg = $resp('.exception-message, .exception_message').text().trim();
      const exceptionClass = $resp('.exception_title, .exception-class').text().trim();
      const h1Text = $resp('h1').first().text().trim();
      const traceFirst = $resp('.trace-details, .trace-code, pre').first().text().trim().substring(0, 300);

      // Extract validation errors
      const validationErrors = [];
      $resp('.invalid-feedback, .alert-danger li, .text-danger').each((_, el) => {
        const t = $resp(el).text().trim();
        if (t) validationErrors.push(t.substring(0, 100));
      });

      result.testSubmit = {
        postUrl,
        sentParamCount: sentKeys.length,
        sentKeys,
        responseStatus: status,
        responseLocation: location,
        exceptionClass,
        exceptionMsg,
        h1Text,
        traceFirst,
        validationErrors,
        bodySnippet: bodyText.substring(0, 2000),
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
