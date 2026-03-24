// ─── Lover Clinic Content Script : Bridge (LoverClinic page ↔ Extension) ─────
// Runs on: https://lover-clinic-app.vercel.app/*

// 1. Forward postMessage from the web page → background service worker
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'LC_FILL_PROCLINIC') return;

  chrome.runtime.sendMessage(event.data, (response) => {
    if (chrome.runtime.lastError) {
      // Extension not available — notify page
      window.postMessage({
        type: 'LC_BROKER_RESULT',
        sessionId: event.data.sessionId,
        success: false,
        error: 'Extension not responding — กรุณาติดตั้ง/เปิดใช้งาน Broker Extension',
      }, '*');
    }
  });
});

// 2. Forward background result → web page
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LC_BROKER_RESULT') {
    window.postMessage(msg, '*');
  }
});
