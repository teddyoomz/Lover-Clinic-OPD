// ─── Broker Popup Script ──────────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function render(statusMap) {
  const list  = document.getElementById('list');
  const empty = document.getElementById('empty');
  const count = document.getElementById('count');
  const footer = document.getElementById('footer');
  const dot   = document.getElementById('dot');

  const entries = Object.entries(statusMap || {});
  count.textContent = `${entries.length} รายการ`;

  if (entries.length === 0) {
    empty.style.display = 'block';
    footer.style.display = 'none';
    dot.style.background = '#16a34a';
    dot.style.boxShadow  = '0 0 6px #16a34a';
    return;
  }

  empty.style.display = 'none';
  footer.style.display = 'flex';

  // Sort newest first
  entries.sort((a, b) => new Date(b[1].at) - new Date(a[1].at));

  // Check if any pending
  const anyPending = entries.some(([, v]) => v.status === 'pending');
  if (anyPending) {
    dot.style.background = '#f59e0b';
    dot.style.boxShadow  = '0 0 6px #f59e0b';
  } else {
    dot.style.background = '#16a34a';
    dot.style.boxShadow  = '0 0 6px #16a34a';
  }

  // Build HTML
  list.innerHTML = entries.map(([sessionId, v]) => {
    const badgeClass = `badge badge-${v.status}`;
    const label = v.status === 'pending' ? '⏳ กำลังส่ง' : v.status === 'done' ? '✓ สำเร็จ' : '✗ ล้มเหลว';
    const errHtml = v.error ? `<span style="color:#ef4444;font-size:9px;display:block;margin-top:2px">${v.error.substring(0, 60)}</span>` : '';
    return `<div class="entry">
      <span class="${badgeClass}">${label}</span>
      <span class="session-id" title="${sessionId}">${sessionId}</span>
      <span class="at">${formatTime(v.at)}</span>
      ${errHtml ? `</div><div style="padding:0 0 6px 0;border-bottom:1px solid #1e1e1e">${errHtml}` : ''}
    </div>`;
  }).join('');
}

// Load status from background
chrome.runtime.sendMessage({ type: 'LC_GET_STATUS' }, (response) => {
  render(response || {});
});

// Clear button
document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LC_CLEAR_STATUS' }, () => {
    render({});
  });
});

// ─── Settings Panel ───────────────────────────────────────────────────────────

const settingsBtn   = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const pcUrl         = document.getElementById('pcUrl');
const pcEmail       = document.getElementById('pcEmail');
const pcPassword    = document.getElementById('pcPassword');
const togglePass    = document.getElementById('togglePass');
const saveBtn       = document.getElementById('saveBtn');
const saveMsg       = document.getElementById('saveMsg');
const credStatus    = document.getElementById('credStatus');

// Toggle settings panel
settingsBtn.addEventListener('click', () => {
  const isOpen = settingsPanel.classList.toggle('open');
  settingsBtn.style.color = isOpen ? '#aaa' : '#555';
});

// Show/hide password
togglePass.addEventListener('click', () => {
  const isText = pcPassword.type === 'text';
  pcPassword.type = isText ? 'password' : 'text';
  togglePass.textContent = isText ? '👁' : '🙈';
});

// Load saved settings on open
chrome.storage.local.get(['pc_url', 'pc_email', 'pc_password'], (data) => {
  if (data.pc_url)      pcUrl.value      = data.pc_url;
  if (data.pc_email)    pcEmail.value    = data.pc_email;
  if (data.pc_password) pcPassword.value = data.pc_password;
  updateCredStatus(!!data.pc_email && !!data.pc_password);
});

function updateCredStatus(hasCreds) {
  if (hasCreds) {
    credStatus.textContent = '✓ บันทึก settings แล้ว';
    credStatus.className = 'cred-status saved';
  } else {
    credStatus.textContent = 'ยังไม่มี credentials — extension จะ auto-login ไม่ได้';
    credStatus.className = 'cred-status';
  }
}

// Save settings
saveBtn.addEventListener('click', () => {
  const url      = pcUrl.value.trim().replace(/\/$/, '');
  const email    = pcEmail.value.trim();
  const password = pcPassword.value;

  if (!email || !password) {
    saveMsg.textContent = '⚠ กรุณากรอก email และ password';
    saveMsg.style.color = '#f59e0b';
    return;
  }
  if (url && !/^https?:\/\/.+/.test(url)) {
    saveMsg.textContent = '⚠ URL ต้องขึ้นต้นด้วย https://';
    saveMsg.style.color = '#f59e0b';
    return;
  }

  const toSave = { pc_email: email, pc_password: password };
  if (url) toSave.pc_url = url;

  chrome.storage.local.set(toSave, () => {
    saveMsg.textContent = '✓ บันทึกแล้ว';
    saveMsg.style.color = '#16a34a';
    updateCredStatus(true);
    setTimeout(() => { saveMsg.textContent = ''; }, 2000);
  });
});
