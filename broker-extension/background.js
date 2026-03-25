// ─── Lover Clinic → ProClinic Broker : Background Service Worker ───────────

// Default URL (trial) — เปลี่ยนได้ผ่าน popup settings → จะเก็บใน chrome.storage.local (pc_url)
const PROCLINIC_DEFAULT_ORIGIN = 'https://trial.proclinicth.com';

let _proclinicOrigin = PROCLINIC_DEFAULT_ORIGIN;
function PROCLINIC_ORIGIN()     { return _proclinicOrigin; }
function PROCLINIC_LOGIN_URL()  { return `${_proclinicOrigin}/login`; }
function PROCLINIC_CREATE_URL() { return `${_proclinicOrigin}/admin/customer/create`; }
function PROCLINIC_LIST_URL()   { return `${_proclinicOrigin}/admin/customer`; }

// โหลด URL จาก storage ตอน service worker เริ่ม
chrome.storage.local.get(['pc_url'], (data) => {
  if (data.pc_url) _proclinicOrigin = data.pc_url.replace(/\/$/, '');
});
// อัพเดท URL เมื่อ settings เปลี่ยน (กรณี popup save ขณะ service worker ทำงานอยู่)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.pc_url?.newValue) {
    _proclinicOrigin = changes.pc_url.newValue.replace(/\/$/, '');
  }
});

// Track last status per session for popup display
const statusMap = {};

// ─── Session Keepalive (ทุก 20 นาที) ──────────────────────────────────────────
// ป้องกัน session หมดอายุโดยไม่ต้อง login ซ้ำบ่อยๆ
// chrome.alarms ทำงานได้แม้ service worker หลับ — Chrome จะปลุก SW เมื่อ alarm ดัง
chrome.alarms.create('pcKeepalive', { periodInMinutes: 20 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'pcKeepalive') return;
  try {
    const tabs = await chrome.tabs.query({ url: `${PROCLINIC_ORIGIN()}/*` });
    if (tabs.length === 0) return; // ไม่มี ProClinic tab เปิดอยู่ → ข้าม
    await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: async (origin) => {
        try { await fetch(`${origin}/admin/api/stat`, { credentials: 'include' }); } catch {}
      },
      args: [_proclinicOrigin],
    });
  } catch (e) { console.log('[pcKeepalive]', e.message); }
});

// ─── Auto-login ───────────────────────────────────────────────────────────────

/**
 * กรอก email/password แล้ว submit หน้า login ProClinic
 * Credentials อ่านจาก chrome.storage.local (pc_email, pc_password)
 */
async function doAutoLogin(tabId) {
  const creds = await chrome.storage.local.get(['pc_email', 'pc_password']);
  if (!creds.pc_email || !creds.pc_password) {
    await chrome.tabs.update(tabId, { active: true });
    throw new Error('ProClinic: session หมดอายุ — กรุณากรอก email/password ในหน้าต่าง extension ก่อน');
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (email, password) => {
      const emailEl = document.querySelector('input[name="email"], input[type="email"]');
      const passEl  = document.querySelector('input[name="password"], input[type="password"]');
      if (!emailEl || !passEl) return { error: 'ไม่พบ form login' };

      const wait = ms => new Promise(r => setTimeout(r, ms));

      // ใช้ native setter เพื่อ trigger React controlled input
      const setVal = (el, val) => {
        const setter = Object.getOwnPropertyDescriptor(
          el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
          'value'
        )?.set;
        if (setter) setter.call(el, val); else el.value = val;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // กรอก email → รอ → กรอก password → รอ
      emailEl.focus();
      setVal(emailEl, email);
      await wait(100);

      passEl.focus();
      setVal(passEl, password);
      await wait(100);

      // ติ๊ก checkbox — ใช้ native setter + events ครบ
      const checkbox = document.querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.checked) {
        const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
        if (checkedSetter) checkedSetter.call(checkbox, true); else checkbox.checked = true;
        checkbox.dispatchEvent(new Event('input',  { bubbles: true }));
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // รอ React re-render (ลดจาก 1500ms → 600ms เพราะ reCAPTCHA ใช้เวลาเองอยู่แล้ว)
      await wait(600);

      // ProClinic ใช้ type="button" ไม่ใช่ type="submit" — หาจาก btn-primary หรือปุ่มแรกในฟอร์ม
      const btn = document.querySelector('button.btn-primary')
        || document.querySelector('form button')
        || document.querySelector('button');

      if (btn) {
        btn.click();
      } else {
        const form = document.querySelector('form');
        if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); }
      }
      return { ok: true };
    },
    args: [creds.pc_email, creds.pc_password],
  });

  // รอให้ browser เริ่ม navigate จริงก่อน (btn.click() async — executeScript return ก่อน navigation start)
  await new Promise(r => setTimeout(r, 500));

  // รอ redirect หลัง login สำเร็จ (รอนานสุด 10 วิ)
  await waitForTabReady(tabId, 10000);

  const afterInfo = await chrome.tabs.get(tabId);
  if (afterInfo.url?.includes('/login')) {
    await chrome.tabs.update(tabId, { active: true });
    throw new Error('ProClinic: login ไม่สำเร็จ — ตรวจสอบ email/password ใน extension popup');
  }

  // ลอง dismiss Chrome Password Manager "Change your password" dialog (ถ้ามี)
  // dialog นี้เป็น Chrome native UI — dispatch keyboard Enter/Escape เพื่อหวังว่า Chrome จะปิดให้
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        ['keydown','keyup'].forEach(type => {
          document.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
        });
      },
    });
  } catch {}
}

/**
 * ตรวจว่า tab อยู่หน้า login หรือเปล่า ถ้าใช่ → navigate ไป /login clean แล้ว auto-login
 * ProClinic อาจ redirect เป็น /login/admin/customer/xxx/edit (404) แทน /login
 * → ต้อง navigate ไป /login จริงๆ ก่อนเสมอ
 */
async function ensureLoggedIn(tabId) {
  const info = await chrome.tabs.get(tabId);
  if (info.url?.includes('/login')) {
    // navigate ไปหน้า login จริงๆ ก่อน (ป้องกัน /login/some/path ที่เป็น 404)
    await navigateAndWait(tabId, PROCLINIC_LOGIN_URL());
    await doAutoLogin(tabId);
  }
}

// ─── Serial queue ─────────────────────────────────────────────────────────────
let proclinicBusy = false;
const proclinicQueue = [];
// ป้องกัน update session เดิมรัวๆ: ถ้า sessionId เดียวกันกำลัง queue/ประมวลผลอยู่ → ข้าม
const syncInFlightSessions = new Set();

function enqueueProClinic(fn, sessionId = null) {
  if (sessionId && syncInFlightSessions.has(sessionId)) {
    return Promise.resolve(); // already queued/running — skip duplicate
  }
  if (sessionId) syncInFlightSessions.add(sessionId);
  return new Promise((resolve, reject) => {
    proclinicQueue.push(() =>
      fn()
        .then(resolve, reject)
        .finally(() => { if (sessionId) syncInFlightSessions.delete(sessionId); })
    );
    drainQueue();
  });
}

async function drainQueue() {
  if (proclinicBusy || proclinicQueue.length === 0) return;
  proclinicBusy = true;
  const task = proclinicQueue.shift();
  try { await task(); } finally {
    proclinicBusy = false;
    drainQueue();
  }
}

// ─── Message router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const lcTabId = sender.tab?.id;

  if (msg.type === 'LC_FILL_PROCLINIC') {
    enqueueProClinic(() => handleFillRequest(msg, lcTabId));
    sendResponse({ received: true });
  }
  if (msg.type === 'LC_DELETE_PROCLINIC') {
    enqueueProClinic(() => handleDeleteRequest(msg, lcTabId));
    sendResponse({ received: true });
  }
  if (msg.type === 'LC_UPDATE_PROCLINIC') {
    enqueueProClinic(() => handleUpdateRequest(msg, lcTabId), msg.sessionId);
    sendResponse({ received: true });
  }
  if (msg.type === 'LC_OPEN_EDIT_PROCLINIC') {
    const { proClinicId } = msg;
    const editUrl = `${PROCLINIC_ORIGIN()}/admin/customer/${proClinicId}/edit`;
    getOrCreateProclinicTab().then(tab => {
      chrome.tabs.update(tab.id, { url: editUrl, active: true });
    });
    sendResponse({ received: true });
  }
  if (msg.type === 'LC_GET_COURSES') {
    enqueueProClinic(() => handleGetCoursesRequest(msg, lcTabId));
    sendResponse({ received: true });
  }
  if (msg.type === 'LC_GET_STATUS')   sendResponse(statusMap);
  if (msg.type === 'LC_CLEAR_STATUS') {
    Object.keys(statusMap).forEach(k => delete statusMap[k]);
    sendResponse({ ok: true });
  }
  return true;
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── HANDLER: Create new customer ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function handleFillRequest(msg, loverclinicTabId) {
  const { patient, sessionId } = msg;
  setStatus(sessionId, 'pending', null);
  updateBadge('⏳');

  try {
    const pcTab = await getOrCreateProclinicTab();
    await navigateAndWait(pcTab.id, PROCLINIC_CREATE_URL());

    const tabInfo = await chrome.tabs.get(pcTab.id);
    if (tabInfo.url?.includes('/login')) {
      await navigateAndWait(pcTab.id, PROCLINIC_LOGIN_URL());
      await doAutoLogin(pcTab.id);
      await navigateAndWait(pcTab.id, PROCLINIC_CREATE_URL());
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: pcTab.id },
      world: 'MAIN',
      func: fillAndSubmitProClinicForm,
      args: [patient],
    });
    const fillResult = results?.[0]?.result;
    if (fillResult?.error) throw new Error(fillResult.error);

    await waitForNavAwayFromCreate(pcTab.id);

    const afterTab = await chrome.tabs.get(pcTab.id);
    const success  = !afterTab.url?.includes('/customer/create');

    if (!success) {
      const errResults = await chrome.scripting.executeScript({
        target: { tabId: pcTab.id },
        world: 'MAIN',
        func: () => {
          const el = document.querySelector('.invalid-feedback:not([style*="none"]), .alert-danger, .text-danger');
          return el ? el.textContent.trim().substring(0, 300) : 'ProClinic ไม่ยอมรับข้อมูล';
        },
      });
      throw new Error(errResults?.[0]?.result || 'ProClinic ไม่ยอมรับข้อมูล');
    }

    const proClinicId = extractCustomerId(afterTab.url);

    // ── ดูด HN จาก edit page ของ customer ที่เพิ่งสร้าง ─────────────────────
    let proClinicHN = null;
    if (proClinicId) {
      try {
        await navigateAndWait(pcTab.id, `${PROCLINIC_ORIGIN()}/admin/customer/${proClinicId}/edit`);
        const hnResults = await chrome.scripting.executeScript({
          target: { tabId: pcTab.id },
          world: 'MAIN',
          func: () => document.querySelector('input[name="hn_no"]')?.value || null,
        });
        proClinicHN = hnResults?.[0]?.result || null;
      } catch (_) { /* HN extraction failure is non-fatal */ }
    }

    setStatus(sessionId, 'done', null);
    updateBadge('✓');
    reportBack(loverclinicTabId, { type: 'LC_BROKER_RESULT', sessionId, success: true, proClinicId, proClinicHN });

  } catch (err) {
    setStatus(sessionId, 'failed', err.message);
    updateBadge('✗');
    reportBack(loverclinicTabId, { type: 'LC_BROKER_RESULT', sessionId, success: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── HANDLER: Delete customer ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function handleDeleteRequest(msg, loverclinicTabId) {
  const { sessionId, proClinicId, proClinicHN, patient } = msg;

  try {
    const pcTab = await getOrCreateProclinicTab();

    // ── Resolve customer ID: stored ID → HN search → phone/name fallback ─────
    let targetId = proClinicId;
    if (!targetId) {
      if (!patient && !proClinicHN) throw new Error('ไม่มีข้อมูลสำหรับค้นหา ProClinic');
      targetId = await searchAndResolveId(pcTab, patient || {}, proClinicHN, 'delete');
    } else {
      // Navigate to list page to get fresh CSRF token
      await navigateAndWait(pcTab.id, PROCLINIC_LIST_URL());
    }

    // ── Delete via POST _method=DELETE ────────────────────────────────────────
    const results = await chrome.scripting.executeScript({
      target: { tabId: pcTab.id },
      world: 'MAIN',
      func: async (customerId, origin) => {
        try {
          const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
          if (!csrf) return { error: 'ไม่พบ CSRF token' };
          const res = await fetch(`${origin}/admin/customer/${customerId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrf },
            body: `_method=DELETE&_token=${encodeURIComponent(csrf)}`,
            credentials: 'include',
          });
          return { ok: res.ok, status: res.status };
        } catch(e) { return { error: e.message }; }
      },
      args: [targetId, PROCLINIC_ORIGIN()],
    });

    const r = results?.[0]?.result;
    if (r?.error) throw new Error(r.error);
    if (!r?.ok) throw new Error(`Server ตอบกลับ status ${r?.status}`);

    reportBack(loverclinicTabId, { type: 'LC_DELETE_RESULT', sessionId, success: true });

  } catch(err) {
    reportBack(loverclinicTabId, { type: 'LC_DELETE_RESULT', sessionId, success: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── HANDLER: Update customer data ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function handleUpdateRequest(msg, loverclinicTabId) {
  const { sessionId, proClinicId, proClinicHN, patient } = msg;

  try {
    const pcTab = await getOrCreateProclinicTab();

    // ── Resolve customer ID: stored ID → HN search → phone/name fallback ─────
    let targetId = proClinicId;
    if (!targetId) {
      if (!patient && !proClinicHN) throw new Error('ไม่มีข้อมูลสำหรับค้นหา ProClinic');
      targetId = await searchAndResolveId(pcTab, patient || {}, proClinicHN, 'update');
    }

    // ── Navigate to edit page เพื่อดึง CSRF token + form values ปัจจุบัน ────
    // (ไม่ต้องรอ redirect หลัง save — ใช้ fetch แทน)
    const editUrl = `${PROCLINIC_ORIGIN()}/admin/customer/${targetId}/edit`;
    await navigateAndWait(pcTab.id, editUrl);

    const tabInfo = await chrome.tabs.get(pcTab.id);
    if (tabInfo.url?.includes('/login')) {
      await navigateAndWait(pcTab.id, PROCLINIC_LOGIN_URL());
      await doAutoLogin(pcTab.id);
      await navigateAndWait(pcTab.id, editUrl);
    }

    // ── ส่ง form ผ่าน fetch (ไม่ navigate tab → ป้องกัน redirect loop + CAPTCHA) ──
    // ProClinic ALWAYS redirects กลับ /edit หลัง save → ตรวจ URL ไม่ได้
    // ใช้ redirect:'manual' แทน: opaqueredirect = บันทึกสำเร็จ, basic 200 = validation error
    const results = await chrome.scripting.executeScript({
      target: { tabId: pcTab.id },
      world: 'MAIN',
      func: submitProClinicEditViaFetch,
      args: [patient, targetId, PROCLINIC_ORIGIN()],
    });
    const r = results?.[0]?.result;
    if (r?.error) throw new Error(r.error);
    if (!r?.ok) throw new Error(r?.validationError || `ProClinic ไม่ยอมรับการแก้ไข (status: ${r?.status})`);

    reportBack(loverclinicTabId, { type: 'LC_UPDATE_RESULT', sessionId, success: true });

  } catch(err) {
    reportBack(loverclinicTabId, { type: 'LC_UPDATE_RESULT', sessionId, success: false, error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SEARCH ENGINE: ค้นหาลูกค้าใน ProClinic ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ค้นหาลูกค้าใน ProClinic แล้วคืน ProClinic customer ID
 * กลยุทธ์: HN (ไม่เปลี่ยน) → phone → name → throw ถ้าไม่เจอ
 */
async function searchAndResolveId(pcTab, patient, proClinicHN, operation) {
  // Round 1: search by HN — แม่นที่สุด ไม่เปลี่ยนแปลง
  if (proClinicHN) {
    const byHN = await searchProClinicCustomers(pcTab, proClinicHN);
    if (byHN.length > 0) return byHN[0].id; // HN unique — เอาตัวแรกเลย
  }

  // Round 2: search by phone
  if (patient.phone) {
    const byPhone = await searchProClinicCustomers(pcTab, patient.phone);
    const match = findBestMatch(byPhone, patient);
    if (match) return match.id;
  }

  // Round 3: search by firstname + lastname
  const query = [patient.firstName, patient.lastName].filter(Boolean).join(' ');
  if (!query.trim()) throw new Error('ไม่มีข้อมูล HN / เบอร์ / ชื่อ สำหรับค้นหา ProClinic');

  const byName = await searchProClinicCustomers(pcTab, query);
  const match = findBestMatch(byName, patient);
  if (match) return match.id;

  throw new Error(`ค้นหา HN:"${proClinicHN}" / ชื่อ:"${query}" ใน ProClinic ไม่พบ (${operation})`);
}

/**
 * Navigate to search URL แล้ว extract customer list จากหน้าผลลัพธ์
 */
async function searchProClinicCustomers(pcTab, query) {
  const searchUrl = `${PROCLINIC_ORIGIN()}/admin/customer?q=${encodeURIComponent(query)}`;
  // delay 1200ms — รอ search results render ใน DOM ให้ครบก่อน execute script
  await navigateAndWait(pcTab.id, searchUrl, 1200);

  const results = await chrome.scripting.executeScript({
    target: { tabId: pcTab.id },
    world: 'MAIN',
    func: extractCustomersFromSearchResults,
  });

  return results?.[0]?.result || [];
}

/**
 * ── Runs inside ProClinic page context ──
 * Extracts { id, name, phone } for every customer row in the current search results page.
 */
function extractCustomersFromSearchResults() {
  const customers = [];

  // btn-delete has data-url="/admin/customer/{id}" — most reliable ID source
  const deleteBtns = [...document.querySelectorAll('button.btn-delete[data-url]')];

  for (const btn of deleteBtns) {
    const dataUrl = btn.getAttribute('data-url') || '';
    const m = dataUrl.match(/\/customer\/(\d+)$/);
    if (!m) continue;
    const id = m[1];

    // Walk up DOM until we find a container unique to this customer
    let row = btn.parentElement;
    for (let i = 0; i < 12; i++) {
      if (!row) break;
      // Stop when we reach a container that wraps exactly one delete button
      if (row.querySelectorAll('button.btn-delete').length === 1) break;
      row = row.parentElement;
    }

    let name = null, phone = null;
    if (row) {
      const text = row.innerText || row.textContent || '';

      // Extract Thai-prefixed full name
      const prefixRx = /(?:นาย|นาง(?:สาว)?|ด\.(?:ช|ญ)\.|Mr\.|Ms\.|Mrs\.|Miss|ดร\.|คุณ)\s+[\u0E00-\u0E7Fa-zA-Z0-9]+(?:\s+[\u0E00-\u0E7Fa-zA-Z0-9]+)*/;
      const nm = text.match(prefixRx);
      if (nm) name = nm[0].replace(/\s+/g, ' ').trim();

      // Extract phone (0xxxxxxxxx)
      const ph = text.match(/0\d{8,9}/);
      if (ph) phone = ph[0];
    }

    customers.push({ id, name, phone });
  }

  return customers;
}

/**
 * เลือก customer ที่ตรงกันที่สุดกับข้อมูล patient ใน LoverClinic
 */
function findBestMatch(customers, patient) {
  if (!customers || customers.length === 0) return null;
  if (customers.length === 1) return customers[0];

  const normalPhone = (s) => (s || '').replace(/\D/g, '').replace(/^66/, '0');

  const scored = customers.map(c => {
    let score = 0;

    // Phone match: +100 (most reliable)
    const cp = normalPhone(c.phone);
    const pp = normalPhone(patient.phone);
    if (cp && pp && cp === pp) score += 100;

    // Name match: +10 per token found
    const cName = (c.name || '').toLowerCase().replace(/\s+/g, ' ');
    const tokens = [patient.firstName, patient.lastName].filter(Boolean).map(t => t.toLowerCase());
    tokens.forEach(t => { if (cName.includes(t)) score += 10; });

    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0] : customers[0]; // fallback to first result
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── FORM FILLER: สร้างลูกค้าใหม่ (runs inside ProClinic page) ───────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function fillAndSubmitProClinicForm(patient) {
  try {
    function setNativeVal(el, value) {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function fillInput(name, value) {
      if (!value && value !== 0) return;
      const el = document.querySelector(`input[name="${name}"], textarea[name="${name}"]`);
      if (el) setNativeVal(el, String(value));
    }
    function fillSelect(name, value) {
      if (!value) return;
      const el = document.querySelector(`select[name="${name}"]`);
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function fillTextarea(name, value) {
      if (!value) return;
      const el = document.querySelector(`textarea[name="${name}"]`);
      if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    function clickRadio(id) {
      const el = document.getElementById(id);
      if (el) { el.checked = true; el.click(); }
    }

    const VALID_PREFIXES = ['นาย','นาง','นางสาว','ด.ช.','ด.ญ.','Mr.','Ms.','Mrs.','Miss','ดร.','คุณ'];
    const prefix = VALID_PREFIXES.includes(patient.prefix) ? patient.prefix : '';
    if (prefix) fillSelect('prefix', prefix);

    fillInput('firstname', patient.firstName);
    fillInput('lastname',  patient.lastName);
    fillInput('telephone_number', patient.phone);
    fillInput('address', patient.address);

    const genderMap = {
      'นาย':'ชาย','ด.ช.':'ชาย','Mr.':'ชาย',
      'นาง':'หญิง','นางสาว':'หญิง','ด.ญ.':'หญิง','Ms.':'หญิง','Mrs.':'หญิง','Miss':'หญิง',
    };
    const gender = genderMap[patient.prefix] || '';
    if (gender) fillSelect('gender', gender);

    // วันเกิด: ใช้ dob จริงถ้ามี, fallback ใช้ age ประมาณ
    const dobInput = document.querySelector('[name="birthdate"]');
    if (dobInput) {
      // flatpickr wrap mode → instance อยู่บน parent (div.input-with-icon.right.datepicker)
      // รอให้ flatpickr initialize ก่อน (สูงสุด 3 วินาที)
      let fp = dobInput._flatpickr
        || dobInput.parentElement?._flatpickr
        || dobInput.closest('.datepicker, .flatpickr-wrapper, [data-wrap]')?._flatpickr;
      if (!fp) {
        await new Promise(resolve => {
          let attempts = 0;
          const check = setInterval(() => {
            fp = dobInput._flatpickr
              || dobInput.parentElement?._flatpickr
              || dobInput.closest('.datepicker, .flatpickr-wrapper, [data-wrap]')?._flatpickr;
            if (fp || ++attempts >= 30) { clearInterval(check); resolve(); }
          }, 100);
        });
      }

      let dobDate = null;
      if (patient.dobDay && patient.dobMonth && patient.dobYear) {
        let year = parseInt(patient.dobYear);
        if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
        dobDate = new Date(year, parseInt(patient.dobMonth) - 1, parseInt(patient.dobDay));
      } else if (patient.age && !isNaN(parseInt(patient.age))) {
        dobDate = new Date(new Date().getFullYear() - parseInt(patient.age), 0, 1);
      }
      if (dobDate) {
        if (fp) {
          fp.setDate(dobDate, true);
        } else {
          // fallback: set value directly (YYYY-MM-DD)
          const yyyy = dobDate.getFullYear();
          const mm = String(dobDate.getMonth() + 1).padStart(2, '0');
          const dd = String(dobDate.getDate()).padStart(2, '0');
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(dobInput, `${yyyy}-${mm}-${dd}`);
          dobInput.dispatchEvent(new Event('input', { bubbles: true }));
          dobInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    // ที่มาของลูกค้า → source dropdown + source_detail text
    if (patient.howFoundUs?.length) {
      const HOW_MAP = {
        'Facebook':'Facebook','Google':'Google','Line':'Line',
        'AI':'ChatGPT','ป้ายตามที่ต่างๆ':'อื่นๆ','รู้จักจากคนรู้จัก':'เพื่อนแนะนำ',
      };
      const mapped = HOW_MAP[patient.howFoundUs[0]] || patient.howFoundUs[0];
      fillSelect('source', mapped);
      fillInput('source_detail', patient.howFoundUs.join(', '));
    }

    // ช่องที่มีความหมายตรงกัน
    if (patient.reasons?.length) fillTextarea('symptoms', patient.reasons.join(', '));
    if (patient.underlying)      fillTextarea('congenital_disease', patient.underlying);
    if (patient.allergies)       fillTextarea('history_of_drug_allergy', patient.allergies);

    // หมายเหตุ → Clinical Summary ทั้งดุ้น
    fillTextarea('note', patient.clinicalSummary || '');

    fillInput('contact_1_firstname',        patient.emergencyName);
    fillInput('contact_1_lastname',         patient.emergencyRelation);
    fillInput('contact_1_telephone_number', patient.emergencyPhone);

    clickRadio('customer_type-1');    // คนไทย
    clickRadio('customer_type_2-1'); // ลูกค้าทั่วไป

    window.confirm = () => true;

    setTimeout(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    }, 400);

    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── FETCH SUBMIT: แก้ไขลูกค้าผ่าน fetch (runs inside ProClinic page) ────────
// ═══════════════════════════════════════════════════════════════════════════════
// ProClinic ALWAYS redirects กลับ /edit หลัง save → ตรวจ URL ไม่ได้
// ใช้ redirect:'manual' → opaqueredirect = บันทึกสำเร็จ, basic 200 = validation error
async function submitProClinicEditViaFetch(patient, customerId, origin) {
  try {
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!csrf) return { error: 'ไม่พบ CSRF token' };

    const form = document.querySelector('form');
    if (!form) return { error: 'ไม่พบ form ในหน้า edit' };

    // อ่านค่า form ทั้งหมดจากหน้าปัจจุบัน (เก็บ hidden fields, hn_no, customer_id ฯลฯ)
    const formData = new FormData(form);
    formData.set('_method', 'PUT');
    formData.set('_token', csrf);

    // Override ด้วย patient data ของเรา
    const VALID_PREFIXES = ['นาย','นาง','นางสาว','ด.ช.','ด.ญ.','Mr.','Ms.','Mrs.','Miss','ดร.','คุณ'];
    const prefix = VALID_PREFIXES.includes(patient.prefix) ? patient.prefix : null;
    if (prefix)            formData.set('prefix', prefix);
    if (patient.firstName) formData.set('firstname', patient.firstName);
    if (patient.lastName)  formData.set('lastname',  patient.lastName);
    if (patient.phone)     formData.set('telephone_number', patient.phone);
    if (patient.address)   formData.set('address', patient.address);

    const genderMap = {
      'นาย':'ชาย','ด.ช.':'ชาย','Mr.':'ชาย',
      'นาง':'หญิง','นางสาว':'หญิง','ด.ญ.':'หญิง','Ms.':'หญิง','Mrs.':'หญิง','Miss':'หญิง',
    };
    const gender = genderMap[patient.prefix];
    if (gender) formData.set('gender', gender);

    // วันเกิด: ใช้ dob จริงถ้ามี, fallback ใช้ age ประมาณ
    if (patient.dobDay && patient.dobMonth && patient.dobYear) {
      let year = parseInt(patient.dobYear);
      if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
      const mm = String(parseInt(patient.dobMonth)).padStart(2, '0');
      const dd = String(parseInt(patient.dobDay)).padStart(2, '0');
      formData.set('birthdate', `${year}-${mm}-${dd}`);
    } else if (patient.age && !isNaN(parseInt(patient.age))) {
      const year = new Date().getFullYear() - parseInt(patient.age);
      formData.set('birthdate', `${year}-01-01`);
    }

    // ที่มาของลูกค้า → source dropdown + source_detail text
    if (patient.howFoundUs?.length) {
      const HOW_MAP = {
        'Facebook':'Facebook','Google':'Google','Line':'Line',
        'AI':'ChatGPT','ป้ายตามที่ต่างๆ':'อื่นๆ','รู้จักจากคนรู้จัก':'เพื่อนแนะนำ',
      };
      formData.set('source', HOW_MAP[patient.howFoundUs[0]] || patient.howFoundUs[0]);
      formData.set('source_detail', patient.howFoundUs.join(', '));
    }

    // ช่องที่มีความหมายตรงกัน
    if (patient.reasons?.length) formData.set('symptoms',               patient.reasons.join(', '));
    if (patient.underlying)      formData.set('congenital_disease',     patient.underlying);
    if (patient.allergies)       formData.set('history_of_drug_allergy', patient.allergies);

    // หมายเหตุ → Clinical Summary ทั้งดุ้น
    if (patient.clinicalSummary) formData.set('note', patient.clinicalSummary);

    if (patient.emergencyName)     formData.set('contact_1_firstname',        patient.emergencyName);
    if (patient.emergencyRelation) formData.set('contact_1_lastname',         patient.emergencyRelation);
    if (patient.emergencyPhone)    formData.set('contact_1_telephone_number', patient.emergencyPhone);

    const body = new URLSearchParams(formData).toString();

    const res = await fetch(`${origin}/admin/customer/${customerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrf },
      body,
      credentials: 'include',
      redirect: 'manual',  // ← key: ไม่ follow redirect ทำให้เห็น type จาก server ตรง ๆ
    });

    if (res.type === 'opaqueredirect') {
      // Server ส่ง 3xx redirect = บันทึกสำเร็จ ✓
      return { ok: true };
    }

    // Server ส่ง 200 ตรง ๆ = validation error (ไม่มี redirect)
    // Tab ยังอยู่ที่ edit page → ดึง error message จาก DOM
    const errEl = document.querySelector('.invalid-feedback:not([style*="none"]), .alert-danger, .text-danger');
    const errMsg = errEl ? errEl.textContent.trim().substring(0, 200) : 'ข้อมูลไม่ผ่าน validation';
    return { ok: false, status: res.status, type: res.type, validationError: errMsg };
  } catch(e) {
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── UTILITIES ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Tab helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate tab to URL แล้วรอให้โหลดเสร็จ
 * ตั้ง listener ก่อน navigate เพื่อกำจัด race condition:
 * หาก navigation เสร็จเร็วมาก จะไม่พลาด event
 */
function navigateAndWait(tabId, url, delayMs = 800, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) { done = true; setTimeout(resolve, delayMs); }
    };

    // ตั้ง listener ก่อนเสมอ
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        finish();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // แล้วค่อย navigate
    chrome.tabs.update(tabId, { url }).catch(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      finish();
    });

    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      finish();
    }, timeoutMs);
  });
}

/**
 * รอ tab ที่กำลัง loading ให้โหลดเสร็จ (สำหรับ tab ที่เพิ่งสร้าง)
 */
function waitForTabReady(tabId, timeoutMs = 15000) {
  return new Promise(async (resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; setTimeout(resolve, 500); } };

    // ตั้ง listener ก่อน
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        finish();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // ตรวจว่า tab โหลดเสร็จแล้วหรือยัง
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        finish();
        return;
      }
    } catch (_) {}

    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      finish();
    }, timeoutMs);
  });
}

async function getOrCreateProclinicTab() {
  const tabs = await chrome.tabs.query({ url: `${PROCLINIC_ORIGIN()}/*` });
  if (tabs.length > 0) {
    // รอ tab ที่มีอยู่ให้พร้อมก่อน (กรณี tab กำลัง loading อยู่)
    const tab = tabs[0];
    const info = await chrome.tabs.get(tab.id);
    if (info.status !== 'complete') await waitForTabReady(tab.id);
    return tabs[0];
  }

  // สร้าง tab ใหม่ แล้วรอให้โหลดเสร็จก่อน return
  const newTab = await chrome.tabs.create({ url: PROCLINIC_LOGIN_URL(), active: false });
  await waitForTabReady(newTab.id);

  // auto-login ถ้าจำเป็น (session หมดอายุ หรือยังไม่ได้ login)
  await ensureLoggedIn(newTab.id);

  // navigate ไป list page หลัง login สำเร็จ
  const afterInfo = await chrome.tabs.get(newTab.id);
  if (!afterInfo.url?.includes('/login')) {
    await navigateAndWait(newTab.id, PROCLINIC_LIST_URL());
  }

  return newTab;
}

// ── waitForTabLoad: compat wrapper ──────────────────────────────────────────
function waitForTabLoad(tabId) { return waitForTabReady(tabId); }

// ── รอ navigation ถัดไป (หลังกด submit) — ต้องรอ next event ไม่ใช่ current state ──
function waitForNavAwayFromCreate(tabId) {
  return new Promise((resolve) => {
    let done = false;
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        done = true;
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { if (!done) { chrome.tabs.onUpdated.removeListener(listener); resolve(); } }, 8000);
  });
}


function reportBack(tabId, msg) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

function setStatus(sessionId, status, error) {
  statusMap[sessionId] = { status, error, at: new Date().toISOString() };
}

function updateBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({
    color: text === '✓' ? '#16a34a' : text === '✗' ? '#dc2626' : '#f59e0b',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── HANDLER: ดึงคอร์ส/บริการคงเหลือจาก ProClinic ───────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function handleGetCoursesRequest(msg, loverclinicTabId) {
  const { sessionId, proClinicId } = msg;
  try {
    if (!proClinicId) throw new Error('ไม่พบ ProClinic ID — กรุณาบันทึกลง ProClinic ก่อน');
    const pcTab = await getOrCreateProclinicTab();
    const customerUrl = `${PROCLINIC_ORIGIN()}/admin/customer/${proClinicId}`;
    await navigateAndWait(pcTab.id, customerUrl);

    const tabInfo = await chrome.tabs.get(pcTab.id);
    if (tabInfo.url?.includes('/login')) {
      await navigateAndWait(pcTab.id, PROCLINIC_LOGIN_URL());
      await doAutoLogin(pcTab.id);
      await navigateAndWait(pcTab.id, customerUrl);
    }

    async function scrape() {
      const r = await chrome.scripting.executeScript({ target: { tabId: pcTab.id }, world: 'MAIN', func: scrapeProClinicCourses });
      return r?.[0]?.result;
    }

    // ── Page 1 ────────────────────────────────────────────────────────────────
    const page1 = await scrape();
    if (page1?.error) throw new Error(page1.error);

    let allCourses = page1.courses || [];
    let allExpired = page1.expiredCourses || [];
    const patientName = page1.patientName || '';

    // ── Additional course pages ───────────────────────────────────────────────
    // page1.courseParam = ชื่อ query param ที่ ProClinic ใช้ เช่น 'course_page'
    if (page1.courseParam && page1.courseMaxPage > 1) {
      for (let p = 2; p <= page1.courseMaxPage; p++) {
        await navigateAndWait(pcTab.id, `${customerUrl}?${page1.courseParam}=${p}`);
        const pageN = await scrape();
        if (pageN?.courses) allCourses = [...allCourses, ...pageN.courses];
      }
    }

    // ── Additional expired-course pages ──────────────────────────────────────
    if (page1.expiredParam && page1.expiredMaxPage > 1) {
      for (let p = 2; p <= page1.expiredMaxPage; p++) {
        await navigateAndWait(pcTab.id, `${customerUrl}?${page1.expiredParam}=${p}`);
        const pageN = await scrape();
        if (pageN?.expiredCourses) allExpired = [...allExpired, ...pageN.expiredCourses];
      }
    }

    reportBack(loverclinicTabId, {
      type: 'LC_COURSES_RESULT', sessionId,
      success: true,
      patientName,
      courses: allCourses,
      expiredCourses: allExpired,
    });
  } catch(err) {
    reportBack(loverclinicTabId, { type: 'LC_COURSES_RESULT', sessionId, success: false, error: err.message });
  }
}

// ─── SCRAPER: รันใน ProClinic page context ────────────────────────────────────
function scrapeProClinicCourses() {
  // ── ดึง courses จาก cards ────────────────────────────────────────────────
  function extractCourses(tabSelector) {
    const tab = document.querySelector(tabSelector);
    if (!tab) return [];
    return Array.from(tab.querySelectorAll('.card')).map(card => {
      const body = card.querySelector('.card-body') || card;
      const lis = body.querySelectorAll('li');
      const li0 = lis[0], li1 = lis[1];
      const h6 = li0?.querySelector('h6');
      const nameNode = h6 ? Array.from(h6.childNodes).find(n => n.nodeType === 3) : null;
      const name    = nameNode ? nameNode.textContent.trim() : (h6 ? h6.innerText.split('\n')[0].trim() : '');
      const expiry  = li0?.querySelector('p.small')?.innerText?.trim() || '';
      const value   = li0?.querySelector('.text-gray-2.small.mt-1')?.innerText?.trim() || '';
      const status  = li0?.querySelector('.badge')?.innerText?.trim() || '';
      const product = li1 ? li1.innerText.trim().split('\n')[0].trim() : '';
      const qty     = li1?.querySelector('.float-end')?.innerText?.trim() || '';
      return { name, expiry, value, status, product, qty };
    }).filter(c => c.name);
  }

  // ── ตรวจ pagination: คืน { param, maxPage } ──────────────────────────────
  // อ่าน param name จาก href จริงใน DOM ไม่ hard-code เผื่อ ProClinic เปลี่ยน URL pattern
  function getPaginationInfo(tabSelector) {
    const tab = document.querySelector(tabSelector);
    if (!tab) return { param: null, maxPage: 1 };
    // pagination อาจอยู่ใน tab pane, sibling, หรือ parent
    const pane = tab.closest('.tab-pane') || tab;
    const candidates = [
      pane.querySelector('ul.pagination'),
      pane.nextElementSibling?.matches?.('ul.pagination') ? pane.nextElementSibling : null,
      pane.parentElement?.querySelector('ul.pagination'),
    ];
    const pag = candidates.find(Boolean);
    if (!pag) return { param: null, maxPage: 1 };

    let param = null, maxPage = 1;
    pag.querySelectorAll('a[href]').forEach(a => {
      // จับ query param แรกที่ลงท้ายด้วย _page หรือ page เช่น course_page, expired_course_page
      const m = a.href.match(/[?&]([a-z_]*page)=(\d+)/i);
      if (m) { param = param || m[1]; maxPage = Math.max(maxPage, parseInt(m[2])); }
    });
    return { param, maxPage };
  }

  try {
    const patientName = (
      document.querySelector('h5.mb-0')?.innerText?.trim() ||
      document.querySelector('.customer-name')?.innerText?.trim() ||
      document.title.split('|')[0].trim()
    );
    const coursePag  = getPaginationInfo('#course-tab');
    const expiredPag = getPaginationInfo('#expired-course-tab');
    return {
      patientName,
      courses:        extractCourses('#course-tab'),
      courseParam:    coursePag.param,
      courseMaxPage:  coursePag.maxPage,
      expiredCourses: extractCourses('#expired-course-tab'),
      expiredParam:   expiredPag.param,
      expiredMaxPage: expiredPag.maxPage,
    };
  } catch(e) {
    return { error: e.message };
  }
}

function extractCustomerId(url) {
  if (!url) return null;
  const m = url.match(/\/admin\/customer\/(\d+)/);
  return m ? m[1] : null;
}
