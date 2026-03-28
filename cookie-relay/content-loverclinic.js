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
});

// Announce extension is available
window.postMessage({ type: 'LC_COOKIE_RELAY_READY' }, '*');
