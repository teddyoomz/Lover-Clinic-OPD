// ─── Content Script: Bridge between LoverClinic webapp and Cookie Relay extension ──

function sendToBackground(msg, callback) {
  try {
    chrome.runtime.sendMessage(msg, callback);
  } catch (e) {
    // Extension was reloaded — context invalidated, page needs refresh
    if (callback) callback({ success: false, error: 'Extension reloaded — refresh page' });
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.type === 'LC_SYNC_COOKIES') {
    // 2026-04-20 bug fix: forward `useTrial` flag to background. Without
    // this, backend (which sets useTrial=true) was getting routed to the
    // REAL ProClinic login because msg.useTrial arrived undefined on the
    // background side → autoLogin(false) → real creds → real login window.
    // User: "backend แม่ง login ผิดป่าวไอ้สัส มันต้อง login trial
    // proclinic ไม่ใช่ proclinic จริง".
    sendToBackground({
      type: 'LC_SYNC_COOKIES',
      forceLogin: !!event.data.forceLogin,
      useTrial: !!event.data.useTrial,
    }, (result) => {
      window.postMessage({
        type: 'LC_SYNC_COOKIES_RESULT',
        result: result || { success: false, error: 'Extension not responding' },
      }, '*');
    });
  }

  if (event.data?.type === 'LC_SET_CREDENTIALS') {
    sendToBackground({
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
