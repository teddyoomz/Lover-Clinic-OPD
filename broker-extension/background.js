// ─── Lover Clinic → ProClinic Broker : Background Service Worker ───────────

const PROCLINIC_CREATE_URL = 'https://trial.proclinicth.com/admin/customer/create';
const PROCLINIC_ORIGIN    = 'https://trial.proclinicth.com';

// Track last status per session for popup display
const statusMap = {};

// ─── Serial queue: ทำได้ทีละ operation เท่านั้น (ป้องกัน race condition บน ProClinic tab) ──
let proclinicBusy = false;
const proclinicQueue = [];

function enqueueProClinic(fn) {
  return new Promise((resolve, reject) => {
    proclinicQueue.push(() => fn().then(resolve).catch(reject));
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LC_FILL_PROCLINIC') {
    const loverclinicTabId = sender.tab?.id;
    enqueueProClinic(() => handleFillRequest(msg, loverclinicTabId));
    sendResponse({ received: true });
  }
  if (msg.type === 'LC_GET_STATUS') {
    sendResponse(statusMap);
  }
  if (msg.type === 'LC_CLEAR_STATUS') {
    Object.keys(statusMap).forEach(k => delete statusMap[k]);
    sendResponse({ ok: true });
  }
  if (msg.type === 'LC_DELETE_PROCLINIC') {
    const loverclinicTabId = sender.tab?.id;
    enqueueProClinic(() => handleDeleteRequest(msg, loverclinicTabId));
    sendResponse({ received: true });
  }
  if (msg.type === 'LC_OPEN_EDIT_PROCLINIC') {
    const { proClinicId } = msg;
    const editUrl = `${PROCLINIC_ORIGIN}/admin/customer/${proClinicId}/edit`;
    getOrCreateProclinicTab().then(tab => {
      chrome.tabs.update(tab.id, { url: editUrl, active: true });
    });
    sendResponse({ received: true });
  }
  if (msg.type === 'LC_UPDATE_PROCLINIC') {
    const loverclinicTabId = sender.tab?.id;
    enqueueProClinic(() => handleUpdateRequest(msg, loverclinicTabId));
    sendResponse({ received: true });
  }
  return true;
});

// ─── Main handler ────────────────────────────────────────────────────────────
async function handleFillRequest(msg, loverclinicTabId) {
  const { patient, sessionId } = msg;

  setStatus(sessionId, 'pending', null);
  updateBadge('⏳');

  try {
    // 1. Find or open ProClinic tab
    const pcTab = await getOrCreateProclinicTab();

    // 2. Navigate to create page (fresh form)
    await chrome.tabs.update(pcTab.id, { url: PROCLINIC_CREATE_URL });
    await waitForTabLoad(pcTab.id);

    // 3. Check if logged in
    const tabInfo = await chrome.tabs.get(pcTab.id);
    if (tabInfo.url?.includes('/login')) {
      await chrome.tabs.update(pcTab.id, { active: true });
      throw new Error('ProClinic: ยังไม่ได้ login — กรุณา login ใน tab ProClinic ก่อน');
    }

    // 4. Fill and submit
    const results = await chrome.scripting.executeScript({
      target: { tabId: pcTab.id },
      world: 'MAIN',
      func: fillAndSubmitProClinicForm,
      args: [patient],
    });

    const fillResult = results?.[0]?.result;
    if (fillResult?.error) throw new Error(fillResult.error);

    // 5. Wait for redirect (form submit)
    await waitForNavAwayFromCreate(pcTab.id);

    const afterTab = await chrome.tabs.get(pcTab.id);
    const success  = !afterTab.url?.includes('/customer/create');

    if (!success) {
      // Still on create page → grab error text from page
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

    // ✓ Success — extract ProClinic customer ID from redirect URL
    const proClinicId = extractCustomerId(afterTab.url);

    setStatus(sessionId, 'done', null);
    updateBadge('✓');
    reportBack(loverclinicTabId, { type: 'LC_BROKER_RESULT', sessionId, success: true, proClinicId });

  } catch (err) {
    setStatus(sessionId, 'failed', err.message);
    updateBadge('✗');
    reportBack(loverclinicTabId, {
      type: 'LC_BROKER_RESULT',
      sessionId,
      success: false,
      error: err.message,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function getOrCreateProclinicTab() {
  const tabs = await chrome.tabs.query({ url: `${PROCLINIC_ORIGIN}/*` });
  if (tabs.length > 0) return tabs[0];
  return chrome.tabs.create({ url: PROCLINIC_CREATE_URL, active: false });
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    let done = false;
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        done = true;
        setTimeout(resolve, 600);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { if (!done) { chrome.tabs.onUpdated.removeListener(listener); resolve(); } }, 15000);
  });
}

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
    // Timeout after 8s (form might stay on same page if error)
    setTimeout(() => { if (!done) { chrome.tabs.onUpdated.removeListener(listener); resolve(); } }, 8000);
  });
}

function reportBack(tabId, msg) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, msg).catch(() => {}); // ignore if tab closed
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

function extractCustomerId(url) {
  if (!url) return null;
  // /admin/customer/13585 → "13585"
  const m = url.match(/\/admin\/customer\/(\d+)/);
  return m ? m[1] : null;
}

// ─── Delete handler ───────────────────────────────────────────────────────────
async function handleDeleteRequest(msg, loverclinicTabId) {
  const { sessionId, proClinicId } = msg;
  if (!proClinicId) {
    reportBack(loverclinicTabId, { type: 'LC_DELETE_RESULT', sessionId, success: false, error: 'ไม่พบ ProClinic customer ID' });
    return;
  }
  try {
    const pcTab = await getOrCreateProclinicTab();
    // Navigate to customer list to get a fresh CSRF token
    await chrome.tabs.update(pcTab.id, { url: `${PROCLINIC_ORIGIN}/admin/customer` });
    await waitForTabLoad(pcTab.id);

    // Get CSRF token and send DELETE via fetch inside the page
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
      args: [proClinicId, PROCLINIC_ORIGIN],
    });

    const r = results?.[0]?.result;
    if (r?.error) throw new Error(r.error);
    if (!r?.ok) throw new Error(`Server ตอบกลับ status ${r?.status}`);

    reportBack(loverclinicTabId, { type: 'LC_DELETE_RESULT', sessionId, success: true });
  } catch(err) {
    reportBack(loverclinicTabId, { type: 'LC_DELETE_RESULT', sessionId, success: false, error: err.message });
  }
}

// ─── Update handler ──────────────────────────────────────────────────────────
async function handleUpdateRequest(msg, loverclinicTabId) {
  const { sessionId, proClinicId, patient } = msg;
  if (!proClinicId) {
    reportBack(loverclinicTabId, { type: 'LC_UPDATE_RESULT', sessionId, success: false, error: 'ไม่พบ ProClinic ID' });
    return;
  }
  try {
    const pcTab = await getOrCreateProclinicTab();
    const editUrl = `${PROCLINIC_ORIGIN}/admin/customer/${proClinicId}/edit`;
    await chrome.tabs.update(pcTab.id, { url: editUrl });
    await waitForTabLoad(pcTab.id);

    const tabInfo = await chrome.tabs.get(pcTab.id);
    if (tabInfo.url?.includes('/login')) {
      throw new Error('ProClinic: ยังไม่ได้ login — กรุณา login ใน tab ProClinic ก่อน');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: pcTab.id },
      world: 'MAIN',
      func: fillAndSubmitProClinicEditForm,
      args: [patient],
    });

    const fillResult = results?.[0]?.result;
    if (fillResult?.error) throw new Error(fillResult.error);

    // Wait for nav away from edit page
    await waitForNavAwayFromEdit(pcTab.id, proClinicId);

    const afterTab = await chrome.tabs.get(pcTab.id);
    const stillOnEdit = afterTab.url?.includes(`/customer/${proClinicId}/edit`);
    if (stillOnEdit) {
      const errResults = await chrome.scripting.executeScript({
        target: { tabId: pcTab.id },
        world: 'MAIN',
        func: () => {
          const el = document.querySelector('.invalid-feedback:not([style*="none"]), .alert-danger, .text-danger');
          return el ? el.textContent.trim().substring(0, 300) : 'ProClinic ไม่ยอมรับการแก้ไข';
        },
      });
      throw new Error(errResults?.[0]?.result || 'ProClinic ไม่ยอมรับการแก้ไข');
    }

    reportBack(loverclinicTabId, { type: 'LC_UPDATE_RESULT', sessionId, success: true });
  } catch(err) {
    reportBack(loverclinicTabId, { type: 'LC_UPDATE_RESULT', sessionId, success: false, error: err.message });
  }
}

function waitForNavAwayFromEdit(tabId, proClinicId) {
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
    setTimeout(() => { if (!done) { chrome.tabs.onUpdated.removeListener(listener); resolve(); } }, 10000);
  });
}

// ─── Form filler (runs in ProClinic page context via executeScript) ───────────
function fillAndSubmitProClinicForm(patient) {
  try {
    // Native value setter — works even with Vue/React input handlers
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

    // ── Prefix mapping ──────────────────────────────────────────────────────
    const VALID_PREFIXES = ['นาย','นาง','นางสาว','ด.ช.','ด.ญ.','Mr.','Ms.','Mrs.','Miss','ดร.','คุณ'];
    const prefix = VALID_PREFIXES.includes(patient.prefix) ? patient.prefix : '';
    if (prefix) fillSelect('prefix', prefix);

    // ── Name ────────────────────────────────────────────────────────────────
    fillInput('firstname', patient.firstName);
    fillInput('lastname',  patient.lastName);

    // ── Phone ───────────────────────────────────────────────────────────────
    fillInput('telephone_number', patient.phone);

    // ── Gender (infer from prefix) ───────────────────────────────────────────
    const genderMap = {
      'นาย':'ชาย','ด.ช.':'ชาย','Mr.':'ชาย',
      'นาง':'หญิง','นางสาว':'หญิง','ด.ญ.':'หญิง','Ms.':'หญิง','Mrs.':'หญิง','Miss':'หญิง',
    };
    const gender = genderMap[patient.prefix] || '';
    if (gender) fillSelect('gender', gender);

    // ── Birthdate (estimate from age → Jan 1, birth year CE) ────────────────
    if (patient.age && !isNaN(parseInt(patient.age))) {
      const birthYearCE = new Date().getFullYear() - parseInt(patient.age);
      const dobInput = document.querySelector('input.flatpickr-input[name="birthdate"]');
      if (dobInput?._flatpickr) {
        dobInput._flatpickr.setDate(new Date(birthYearCE, 0, 1), true);
      }
    }

    // ── Note (visit reason + medical info) ──────────────────────────────────
    const notes = [];
    if (patient.reasons?.length) notes.push('เหตุผลที่มา: ' + patient.reasons.join(', '));
    if (patient.allergies)        notes.push('แพ้: ' + patient.allergies);
    if (patient.underlying)       notes.push('โรคประจำตัว: ' + patient.underlying);
    if (notes.length) fillTextarea('note', notes.join('\n'));

    // ── Radios: คนไทย + ลูกค้าทั่วไป ─────────────────────────────────────
    clickRadio('customer_type-1');
    clickRadio('customer_type_2-1');

    // ── Override confirm dialog → always OK ──────────────────────────────────
    window.confirm = () => true;

    // ── Submit ───────────────────────────────────────────────────────────────
    setTimeout(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    }, 400);

    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Edit form filler (same fields, used for update) ─────────────────────────
function fillAndSubmitProClinicEditForm(patient) {
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

    const VALID_PREFIXES = ['นาย','นาง','นางสาว','ด.ช.','ด.ญ.','Mr.','Ms.','Mrs.','Miss','ดร.','คุณ'];
    const prefix = VALID_PREFIXES.includes(patient.prefix) ? patient.prefix : '';
    if (prefix) fillSelect('prefix', prefix);

    fillInput('firstname', patient.firstName);
    fillInput('lastname',  patient.lastName);
    fillInput('telephone_number', patient.phone);

    const genderMap = {
      'นาย':'ชาย','ด.ช.':'ชาย','Mr.':'ชาย',
      'นาง':'หญิง','นางสาว':'หญิง','ด.ญ.':'หญิง','Ms.':'หญิง','Mrs.':'หญิง','Miss':'หญิง',
    };
    const gender = genderMap[patient.prefix] || '';
    if (gender) fillSelect('gender', gender);

    if (patient.age && !isNaN(parseInt(patient.age))) {
      const birthYearCE = new Date().getFullYear() - parseInt(patient.age);
      const dobInput = document.querySelector('input.flatpickr-input[name="birthdate"]');
      if (dobInput?._flatpickr) dobInput._flatpickr.setDate(new Date(birthYearCE, 0, 1), true);
    }

    const notes = [];
    if (patient.reasons?.length) notes.push('เหตุผลที่มา: ' + patient.reasons.join(', '));
    if (patient.allergies)        notes.push('แพ้: ' + patient.allergies);
    if (patient.underlying)       notes.push('โรคประจำตัว: ' + patient.underlying);
    if (notes.length) fillTextarea('note', notes.join('\n'));

    // Auto-confirm and submit
    window.confirm = () => true;
    setTimeout(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    }, 400);

    return { ok: true };
  } catch(e) {
    return { error: e.message };
  }
}
