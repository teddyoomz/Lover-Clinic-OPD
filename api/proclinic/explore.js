// Temporary exploration endpoint — fetch ProClinic pages and return HTML structure
// DELETE THIS FILE after exploration is complete

import * as cheerio from 'cheerio';

const TRIAL_ORIGIN = 'https://trial.proclinicth.com';
const TRIAL_EMAIL = 'demo12@proclinic.com';
const TRIAL_PASSWORD = 'qqqqqq';

let sessionCookies = [];

function cookieHeader() { return sessionCookies.map(c => c.split(';')[0]).join('; '); }
function parseSetCookies(res) { return res.headers.getSetCookie?.() || []; }
function mergeCookies(nc) {
  for (const c of nc) {
    const n = c.split('=')[0].trim();
    const i = sessionCookies.findIndex(x => x.split('=')[0].trim() === n);
    if (i >= 0) sessionCookies[i] = c; else sessionCookies.push(c);
  }
}

async function login() {
  const lp = await fetch(`${TRIAL_ORIGIN}/login`, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
  mergeCookies(parseSetCookies(lp));
  const html = await lp.text();
  const $ = cheerio.load(html);
  const csrf = $('meta[name="csrf-token"]').attr('content') || $('input[name="_token"]').val();
  const body = new URLSearchParams({ _token: csrf, email: TRIAL_EMAIL, password: TRIAL_PASSWORD, remember: 'on' });
  const res = await fetch(`${TRIAL_ORIGIN}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(), 'User-Agent': 'Mozilla/5.0' },
    body: body.toString(), redirect: 'manual',
  });
  mergeCookies(parseSetCookies(res));
  const loc = res.headers.get('location') || '';
  if (loc && !loc.includes('/login')) {
    const rUrl = loc.startsWith('http') ? loc : `${TRIAL_ORIGIN}${loc}`;
    const r = await fetch(rUrl, { headers: { Cookie: cookieHeader(), 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    mergeCookies(parseSetCookies(r));
    return true;
  }
  return false;
}

async function fetchPage(path) {
  const url = path.startsWith('http') ? path : `${TRIAL_ORIGIN}${path}`;
  const res = await fetch(url, { headers: { Cookie: cookieHeader(), 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
  mergeCookies(parseSetCookies(res));
  return await res.text();
}

function analyzePage(html, pageName) {
  const $ = cheerio.load(html);
  const result = { page: pageName, title: $('title').text().trim() };

  // Tabs
  const tabs = [];
  $('.nav-link, .nav-item a, a[data-toggle="tab"], a[data-bs-toggle="tab"], a[role="tab"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text && text.length < 80) tabs.push({ text, href });
  });
  result.tabs = [...new Map(tabs.map(t => [t.text + t.href, t])).values()];

  // Tab panes
  const panes = [];
  $('.tab-pane').each((_, p) => {
    const id = $(p).attr('id') || '';
    panes.push({
      id,
      cards: $(p).find('.card').length,
      tables: $(p).find('table').length,
      forms: $(p).find('form').length,
      links: $(p).find('a[href]').length,
      preview: $(p).text().trim().replace(/\s+/g, ' ').substring(0, 300),
    });
  });
  result.tabPanes = panes;

  // Tables
  const tables = [];
  $('table').each((_, tbl) => {
    const headers = [];
    $(tbl).find('th').each((_, th) => headers.push($(th).text().trim()));
    const rows = $(tbl).find('tbody tr').length;
    if (headers.length) tables.push({ headers, rows });
  });
  result.tables = tables;

  // Forms
  const forms = [];
  $('form').each((_, form) => {
    const action = $(form).attr('action') || '';
    const method = $(form).attr('method') || 'GET';
    const fields = [];
    $(form).find('input, textarea, select').each((_, el) => {
      const name = $(el).attr('name');
      if (!name || name === '_token' || name === '_method') return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') {
        const opts = [];
        $(el).find('option').each((_, o) => { const v = $(o).val(); if (v) opts.push({ v, l: $(o).text().trim().substring(0, 40) }); });
        fields.push({ name, type: 'select', optionCount: opts.length, sampleOptions: opts.slice(0, 5) });
      } else {
        fields.push({ name, type: $(el).attr('type') || tag });
      }
    });
    if (fields.length) forms.push({ action, method: method.toUpperCase(), fields });
  });
  result.forms = forms;

  // Buttons
  const buttons = [];
  $('button, a.btn').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ').substring(0, 60);
    const href = $(el).attr('href') || '';
    const onclick = $(el).attr('onclick') || '';
    const dataUrl = $(el).attr('data-url') || '';
    if (text) buttons.push({ text, href: href.substring(0, 100), onclick: onclick.substring(0, 100), dataUrl: dataUrl.substring(0, 100) });
  });
  result.buttons = buttons.slice(0, 30);

  // API endpoints in scripts
  const apis = new Set();
  $('script').each((_, s) => {
    const c = $(s).html() || '';
    const m = c.match(/\/admin\/api\/[^\s'"]+/g);
    if (m) m.forEach(u => apis.add(u));
    // Also look for ajax/fetch URLs
    const ajaxUrls = c.match(/url\s*:\s*['"]([^'"]*admin[^'"]*)['"]/g);
    if (ajaxUrls) ajaxUrls.forEach(u => apis.add(u));
  });
  result.apiEndpoints = [...apis];

  // Links containing customer or key paths
  const adminLinks = new Set();
  $('a[href*="/admin/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    adminLinks.add(href);
  });
  result.adminLinks = [...adminLinks].sort().slice(0, 50);

  // Modals
  const modals = [];
  $('.modal').each((_, m) => {
    const id = $(m).attr('id') || '';
    const title = $(m).find('.modal-title').text().trim();
    const bodyPreview = $(m).find('.modal-body').text().trim().replace(/\s+/g, ' ').substring(0, 200);
    modals.push({ id, title, bodyPreview });
  });
  result.modals = modals;

  return result;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '*'); return res.status(200).end(); }

  const { path, paths } = req.body || {};

  try {
    sessionCookies = [];
    const loggedIn = await login();
    if (!loggedIn) return res.status(500).json({ error: 'Login failed' });

    // If multiple paths, fetch all
    const pagePaths = paths || [path || '/admin/customer/12963'];
    const results = [];

    for (const p of pagePaths) {
      const html = await fetchPage(p);
      const analysis = analyzePage(html, p);
      results.push(analysis);
    }

    return res.status(200).json({ success: true, results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
