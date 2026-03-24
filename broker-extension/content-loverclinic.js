// ─── Lover Clinic Content Script : Bridge (LoverClinic page ↔ Extension) ─────
// Runs on: https://lover-clinic-app.vercel.app/*

const FORWARD_TYPES = ['LC_FILL_PROCLINIC', 'LC_DELETE_PROCLINIC', 'LC_OPEN_EDIT_PROCLINIC'];

// 1. Forward postMessage from the web page → background service worker
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!FORWARD_TYPES.includes(event.data?.type)) return;

  chrome.runtime.sendMessage(event.data, (response) => {
    if (chrome.runtime.lastError && event.data.type === 'LC_FILL_PROCLINIC') {
      // Extension not available — notify page with failure
      window.postMessage({
        type: 'LC_BROKER_RESULT',
        sessionId: event.data.sessionId,
        success: false,
        error: 'Extension not responding — กรุณาติดตั้ง/เปิดใช้งาน Broker Extension',
      }, '*');
    }
  });
});

// 2. Forward background results → web page
chrome.runtime.onMessage.addListener((msg) => {
  if (['LC_BROKER_RESULT', 'LC_DELETE_RESULT'].includes(msg.type)) {
    window.postMessage(msg, '*');
  }
});
