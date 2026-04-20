const $ = (id) => document.getElementById(id);
const status = (msg, ok) => { $('status').textContent = msg; $('status').className = ok ? 'ok' : 'err'; };

// Load saved credentials — both sets.
chrome.storage.local.get([
  'proclinic_origin', 'proclinic_email', 'proclinic_password',
  'proclinic_trial_origin', 'proclinic_trial_email', 'proclinic_trial_password',
], (data) => {
  $('originProd').value    = data.proclinic_origin        || 'https://proclinicth.com';
  $('emailProd').value     = data.proclinic_email         || '';
  $('passwordProd').value  = data.proclinic_password      || '';
  $('originTrial').value   = data.proclinic_trial_origin  || 'https://trial.proclinicth.com';
  $('emailTrial').value    = data.proclinic_trial_email   || '';
  $('passwordTrial').value = data.proclinic_trial_password || '';
});

// Save production credentials.
$('saveProd').addEventListener('click', () => {
  const origin = $('originProd').value.trim().replace(/\/+$/, '');
  const email = $('emailProd').value.trim();
  const password = $('passwordProd').value;
  if (!origin || !email || !password) return status('กรอก production ให้ครบ', false);
  chrome.storage.local.set({
    proclinic_origin: origin,
    proclinic_email: email,
    proclinic_password: password,
  }, () => status('บันทึก Production แล้ว', true));
});

// Save trial credentials.
$('saveTrial').addEventListener('click', () => {
  const origin = $('originTrial').value.trim().replace(/\/+$/, '');
  const email = $('emailTrial').value.trim();
  const password = $('passwordTrial').value;
  if (!origin || !email || !password) return status('กรอก trial ให้ครบ', false);
  chrome.storage.local.set({
    proclinic_trial_origin: origin,
    proclinic_trial_email: email,
    proclinic_trial_password: password,
  }, () => status('บันทึก Trial แล้ว', true));
});

// Manual sync — grabs current browser cookies for both domains (syncCookies()
// in background.js auto-splits them into trial vs production buckets).
$('sync').addEventListener('click', () => {
  status('กำลัง sync...');
  chrome.runtime.sendMessage({ type: 'LC_SYNC_COOKIES' }, (result) => {
    if (result?.success) status(`Synced ${result.count} cookies`, true);
    else status(result?.error || 'ไม่สำเร็จ', false);
  });
});
