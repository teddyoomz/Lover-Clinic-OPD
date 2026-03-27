// ─── Shared ProClinic auth & HTTP helpers for Vercel serverless functions ─────

const PROCLINIC_BASE = 'https://trial.proclinicth.com';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
};

// ─── Cookie helpers ──────────────────────────────────────────────────────────

function parseCookies(response) {
  const cookies = {};
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const header of raw) {
    const m = header.match(/^([^=]+)=([^;]*)/);
    if (m) cookies[m[1].trim()] = m[2];
  }
  return cookies;
}

function formatCookies(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ─── CSRF extraction from HTML ───────────────────────────────────────────────

function extractCsrf(html) {
  const m = html.match(/name="_token"\s*value="([^"]+)"/)
    || html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/)
    || html.match(/content="([^"]+)"\s+name="csrf-token"/);
  return m ? m[1] : null;
}

// ─── Login to ProClinic, returns authenticated cookies ───────────────────────

async function login() {
  const email = process.env.PROCLINIC_EMAIL;
  const password = process.env.PROCLINIC_PASSWORD;
  if (!email || !password) {
    throw new Error('Missing PROCLINIC_EMAIL or PROCLINIC_PASSWORD environment variables');
  }

  // 1) GET /login → CSRF token + initial session cookie
  const page = await fetch(`${PROCLINIC_BASE}/login`, {
    headers: BROWSER_HEADERS,
    redirect: 'manual',
  });
  const pageHtml = await page.text();
  const csrf = extractCsrf(pageHtml);
  if (!csrf) throw new Error('Cannot find CSRF token on login page');

  let cookies = parseCookies(page);

  // 2) POST /login → authenticate
  const loginRes = await fetch(`${PROCLINIC_BASE}/login`, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': `${PROCLINIC_BASE}/login`,
    },
    body: new URLSearchParams({ _token: csrf, email, password }).toString(),
    redirect: 'manual',
  });

  cookies = { ...cookies, ...parseCookies(loginRes) };

  const location = loginRes.headers.get('location') || '';
  if (location.includes('/login')) {
    throw new Error('Login failed — wrong email or password');
  }

  // 3) Follow redirect to pick up final session cookies
  if (loginRes.status >= 300 && loginRes.status < 400 && location) {
    const url = location.startsWith('http') ? location : `${PROCLINIC_BASE}${location}`;
    const follow = await fetch(url, {
      headers: { ...BROWSER_HEADERS, 'Cookie': formatCookies(cookies) },
      redirect: 'manual',
    });
    cookies = { ...cookies, ...parseCookies(follow) };
  }

  return cookies;
}

// ─── GET an authenticated page and extract CSRF token ────────────────────────

async function getPageWithCsrf(url, cookies) {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, 'Cookie': formatCookies(cookies) },
    redirect: 'manual',
  });

  const loc = res.headers.get('location') || '';
  if (loc.includes('/login')) throw new Error('Session expired — redirected to login');

  const html = await res.text();
  const csrf = extractCsrf(html);
  if (!csrf) throw new Error(`Cannot find CSRF token on ${url}`);

  return { csrf, cookies: { ...cookies, ...parseCookies(res) }, html };
}

// ─── Build patient notes string ──────────────────────────────────────────────

function buildNotes(patient) {
  const notes = [];
  if (patient.reasons?.length) notes.push('เหตุผลที่มา: ' + patient.reasons.join(', '));
  if (patient.allergies) notes.push('แพ้: ' + patient.allergies);
  if (patient.underlying) notes.push('โรคประจำตัว: ' + patient.underlying);
  return notes.join('\n');
}

// ─── Map prefix → gender ────────────────────────────────────────────────────

function inferGender(prefix) {
  const map = {
    'นาย': 'ชาย', 'ด.ช.': 'ชาย', 'Mr.': 'ชาย',
    'นาง': 'หญิง', 'นางสาว': 'หญิง', 'ด.ญ.': 'หญิง',
    'Ms.': 'หญิง', 'Mrs.': 'หญิง', 'Miss': 'หญิง',
  };
  return map[prefix] || '';
}

// ─── Estimate birthdate from age ─────────────────────────────────────────────

function estimateBirthdate(age) {
  if (!age || isNaN(parseInt(age))) return '';
  const birthYear = new Date().getFullYear() - parseInt(age);
  return `${birthYear}-01-01`;
}

// ─── Build form body for create/update ───────────────────────────────────────

function buildPatientForm(csrf, patient, extraFields = {}) {
  return new URLSearchParams({
    _token: csrf,
    prefix: patient.prefix || '',
    firstname: patient.firstName || '',
    lastname: patient.lastName || '',
    telephone_number: patient.phone || '',
    gender: inferGender(patient.prefix),
    birthdate: estimateBirthdate(patient.age),
    note: buildNotes(patient),
    customer_type: '1',
    customer_type_2: '1',
    ...extraFields,
  }).toString();
}

export {
  PROCLINIC_BASE,
  BROWSER_HEADERS,
  login,
  getPageWithCsrf,
  parseCookies,
  formatCookies,
  extractCsrf,
  buildPatientForm,
};
