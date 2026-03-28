// ─── Content Script: Bridge between LoverClinic webapp and Cookie Relay extension ──

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.type === 'LC_SYNC_COOKIES') {
    chrome.runtime.sendMessage({ type: 'LC_SYNC_COOKIES' }, (result) => {
      window.postMessage({
        type: 'LC_SYNC_COOKIES_RESULT',
        result: result || { success: false, error: 'Extension not responding' },
      }, '*');
    });
  }

  // Auto-receive credentials from webapp (fetched from Vercel env vars)
  if (event.data?.type === 'LC_SET_CREDENTIALS') {
    chrome.runtime.sendMessage({
      type: 'LC_SET_CREDENTIALS',
      origin: event.data.origin,
      email: event.data.email,
      password: event.data.password,
    });
  }
});

// Announce extension is available — send immediately + after React mounts
function announce() {
  window.postMessage({ type: 'LC_COOKIE_RELAY_READY' }, '*');
}
announce();
setTimeout(announce, 1000);
setTimeout(announce, 3000);
