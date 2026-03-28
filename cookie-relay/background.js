// ─── LoverClinic Cookie Relay ─────────────────────────────────────────────────
// Auto-sync ProClinic cookies to Firestore so Vercel API can use them.
// Auto-login via hidden tab when cookies expire (reCAPTCHA runs in real browser).

const APP_ID = 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const SESSION_DOC_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/proclinic_session`;
const PROCLINIC_DOMAIN = '.proclinicth.com';
const RECAPTCHA_SITE_KEY = '6LeNCn8oAAAAAO1J2Gd4i3_z3JqsvIlVTpp1o53p';

// ─── Sync cookies to Firestore ───────────────────────────────────────────────

async function syncCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: PROCLINIC_DOMAIN });
    if (!cookies.length) {
      console.log('[CookieRelay] No ProClinic cookies found');
      return { success: false, error: 'No ProClinic cookies', needsLogin: true };
    }

    const sessionCookie = cookies.find(c => c.name === 'laravel_session');
    if (!sessionCookie) {
      console.log('[CookieRelay] No laravel_session cookie — not logged in');
      return { success: false, error: 'Not logged in to ProClinic', needsLogin: true };
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
      return { success: false, error: 'Firestore save failed' };
    }
  } catch (e) {
    console.error('[CookieRelay] syncCookies error:', e);
    return { success: false, error: e.message };
  }
}

// ─── Auto-login via hidden tab ───────────────────────────────────────────────

let loginInProgress = false;

async function autoLogin() {
  if (loginInProgress) return { success: false, error: 'Login already in progress' };

  const stored = await chrome.storage.local.get(['proclinic_origin', 'proclinic_email', 'proclinic_password']);
  const origin = stored.proclinic_origin;
  const email = stored.proclinic_email;
  const password = stored.proclinic_password;

  if (!origin || !email || !password) {
    return { success: false, error: 'ยังไม่ได้ตั้ง credentials — เปิด popup ของ extension แล้วกรอก' };
  }

  loginInProgress = true;
  console.log('[CookieRelay] Starting auto-login via hidden tab');

  try {
    // Create a hidden tab
    const tab = await chrome.tabs.create({ url: `${origin}/login`, active: false });

    // Wait for page to load
    await waitForTabLoad(tab.id);

    // Inject login script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: doLogin,
      args: [email, password, RECAPTCHA_SITE_KEY],
    });

    const loginResult = results?.[0]?.result;
    console.log('[CookieRelay] Login script result:', loginResult);

    // Wait for redirect to /admin
    const success = await waitForLoginRedirect(tab.id, origin, 15000);

    // Close the tab
    await chrome.tabs.remove(tab.id).catch(() => {});

    if (success) {
      console.log('[CookieRelay] Auto-login succeeded — syncing cookies');
      // Small delay for cookies to settle
      await new Promise(r => setTimeout(r, 500));
      return await syncCookies();
    } else {
      return { success: false, error: 'Login ไม่สำเร็จ — ตรวจสอบ credentials ใน popup' };
    }
  } catch (e) {
    console.error('[CookieRelay] autoLogin error:', e);
    return { success: false, error: e.message };
  } finally {
    loginInProgress = false;
  }
}

// Script injected into ProClinic login page
function doLogin(email, password, siteKey) {
  return new Promise((resolve) => {
    try {
      // Check if already on admin page (already logged in)
      if (window.location.pathname.startsWith('/admin') && !window.location.pathname.includes('login')) {
        return resolve({ status: 'already_logged_in' });
      }

      // Fill form fields
      const emailInput = document.querySelector('input[name="email"]');
      const passwordInput = document.querySelector('input[name="password"]');
      const acceptCheckbox = document.querySelector('#accept');

      if (!emailInput || !passwordInput) {
        return resolve({ status: 'form_not_found' });
      }

      // Use native setters for React compatibility
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSet.call(emailInput, email);
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      nativeSet.call(passwordInput, password);
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Check accept checkbox
      if (acceptCheckbox && !acceptCheckbox.checked) {
        acceptCheckbox.checked = true;
        acceptCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Wait for reCAPTCHA to be ready then submit
      setTimeout(() => {
        if (typeof grecaptcha !== 'undefined') {
          grecaptcha.ready(() => {
            grecaptcha.execute(siteKey, { action: 'login' }).then((token) => {
              const tokenInput = document.querySelector('#form-token');
              if (tokenInput) tokenInput.value = token;

              const actionInput = document.querySelector('#form-action');
              if (actionInput) actionInput.value = 'login';

              // Submit form
              const form = document.querySelector('#form-login');
              if (form) {
                form.submit();
                resolve({ status: 'submitted' });
              } else {
                resolve({ status: 'form_not_found' });
              }
            }).catch(e => resolve({ status: 'recaptcha_error', error: e.message }));
          });
        } else {
          // No reCAPTCHA — try direct submit
          const form = document.querySelector('#form-login');
          if (form) { form.submit(); resolve({ status: 'submitted_no_recaptcha' }); }
          else resolve({ status: 'no_recaptcha_no_form' });
        }
      }, 600); // Wait 600ms for checkbox + reCAPTCHA
    } catch (e) {
      resolve({ status: 'error', error: e.message });
    }
  });
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new Error('Tab load timeout')); }, 15000);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function waitForLoginRedirect(tabId, origin, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);

    function listener(id, info, tab) {
      if (id !== tabId) return;
      // Check if navigated to admin (login success)
      if (tab.url && tab.url.startsWith(origin) && tab.url.includes('/admin') && !tab.url.includes('/login')) {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve(true);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ─── Auto-sync on cookie change ──────────────────────────────────────────────

let syncTimeout = null;
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (!changeInfo.cookie.domain.includes('proclinicth.com')) return;
  if (changeInfo.removed) return;

  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    console.log('[CookieRelay] ProClinic cookie changed — syncing');
    syncCookies();
  }, 1000);
});

// ─── On-demand sync/login from webapp ────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LC_SYNC_COOKIES') {
    // Try sync first, if no cookies → auto-login
    syncCookies().then(async (result) => {
      if (result.needsLogin) {
        console.log('[CookieRelay] No valid cookies — attempting auto-login');
        const loginResult = await autoLogin();
        sendResponse(loginResult);
      } else {
        sendResponse(result);
      }
    });
    return true; // async
  }

  if (msg.type === 'LC_AUTO_LOGIN') {
    autoLogin().then(result => sendResponse(result));
    return true;
  }
});

// ─── Sync on install/startup ─────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[CookieRelay] Extension installed — syncing cookies');
  syncCookies();
});
