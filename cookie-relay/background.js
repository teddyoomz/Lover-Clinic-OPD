// ─── LoverClinic Cookie Relay ─────────────────────────────────────────────────
// Auto-sync ProClinic cookies to Firestore so Vercel API can use them.
// Replaces server-side login (which requires reCAPTCHA in browser).

const APP_ID = 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const SESSION_DOC_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/proclinic_session`;
const PROCLINIC_DOMAIN = '.proclinicth.com';

// ─── Sync cookies to Firestore ───────────────────────────────────────────────

async function syncCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: PROCLINIC_DOMAIN });
    if (!cookies.length) {
      console.log('[CookieRelay] No ProClinic cookies found');
      return { success: false, error: 'No ProClinic cookies — login to ProClinic first' };
    }

    // Find the origin from any cookie
    const sessionCookie = cookies.find(c => c.name === 'laravel_session');
    if (!sessionCookie) {
      console.log('[CookieRelay] No laravel_session cookie — not logged in');
      return { success: false, error: 'Not logged in to ProClinic' };
    }

    const origin = `https://${sessionCookie.domain.replace(/^\./, '')}`;

    // Convert to Set-Cookie-like strings (format expected by session.js)
    const cookieStrings = cookies.map(c => {
      let str = `${c.name}=${c.value}`;
      if (c.path) str += `; path=${c.path}`;
      if (c.secure) str += '; secure';
      if (c.httpOnly) str += '; httponly';
      if (c.sameSite && c.sameSite !== 'unspecified') str += `; samesite=${c.sameSite}`;
      return str;
    });

    // Save to Firestore REST API
    const res = await fetch(`${FIRESTORE_BASE}/${SESSION_DOC_PATH}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          origin: { stringValue: origin },
          cookies: { arrayValue: { values: cookieStrings.map(s => ({ stringValue: s })) } },
          updatedAt: { stringValue: new Date().toISOString() },
          source: { stringValue: 'cookie-relay-extension' },
        },
      }),
    });

    if (res.ok) {
      console.log(`[CookieRelay] Synced ${cookieStrings.length} cookies to Firestore`);
      return { success: true, count: cookieStrings.length };
    } else {
      const err = await res.text();
      console.error('[CookieRelay] Firestore save failed:', err);
      return { success: false, error: 'Firestore save failed' };
    }
  } catch (e) {
    console.error('[CookieRelay] syncCookies error:', e);
    return { success: false, error: e.message };
  }
}

// ─── Auto-sync on cookie change ──────────────────────────────────────────────

let syncTimeout = null;
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (!changeInfo.cookie.domain.includes('proclinicth.com')) return;
  if (changeInfo.removed) return;

  // Debounce: multiple cookies change at once during login
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    console.log('[CookieRelay] ProClinic cookie changed — syncing');
    syncCookies();
  }, 1000);
});

// ─── On-demand sync from webapp ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LC_SYNC_COOKIES') {
    syncCookies().then(result => sendResponse(result));
    return true; // async response
  }
});

// ─── Sync on install/startup ─────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[CookieRelay] Extension installed — syncing cookies');
  syncCookies();
});
