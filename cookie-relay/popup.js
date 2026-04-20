const $ = (id) => document.getElementById(id);
const status = (msg, ok) => { $('status').textContent = msg; $('status').className = ok ? 'ok' : 'err'; };

// Load saved credentials
chrome.storage.local.get(['proclinic_origin', 'proclinic_email', 'proclinic_password'], (data) => {
  $('origin').value = data.proclinic_origin || 'https://proclinicth.com';
  $('email').value = data.proclinic_email || '';
  $('password').value = data.proclinic_password || '';
});

// Save credentials
$('save').addEventListener('click', () => {
  const origin = $('origin').value.trim().replace(/\/+$/, '');
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!origin || !email || !password) return status('กรอกให้ครบ', false);
  chrome.storage.local.set({ proclinic_origin: origin, proclinic_email: email, proclinic_password: password }, () => {
    status('บันทึกแล้ว', true);
  });
});

// Manual sync
$('sync').addEventListener('click', () => {
  status('กำลัง sync...');
  chrome.runtime.sendMessage({ type: 'LC_SYNC_COOKIES' }, (result) => {
    if (result?.success) status(`Synced ${result.count} cookies`, true);
    else status(result?.error || 'ไม่สำเร็จ', false);
  });
});
