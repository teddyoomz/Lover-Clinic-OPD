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

    // Use stored origin from credentials (matches Vercel env var exactly)
    // Fallback to cookie domain if credentials not set yet
    const stored = await chrome.storage.local.get(['proclinic_origin']);
    const origin = stored.proclinic_origin || `https://${sessionCookie.domain.replace(/^\./, '')}`;
    console.log('[CookieRelay] Using origin:', origin);

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
  console.log('[CookieRelay] Starting auto-login via hidden window');

  let winId = null;
  try {
    // Create a small window then immediately minimize it
    const win = await chrome.windows.create({
      url: `${origin}/login`,
      type: 'popup',
      width: 400,
      height: 400,
      focused: false,
    });
    // Minimize after creation (workaround: state:'minimized' in create doesn't work on all Chrome versions)
    await chrome.windows.update(win.id, { state: 'minimized' }).catch(() => {});
    winId = win.id;
    const tab = win.tabs[0];

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

    // Close the entire window
    await chrome.windows.remove(winId).catch(() => {});
    winId = null;

    if (success) {
      console.log('[CookieRelay] Auto-login succeeded — syncing cookies');
      // Small delay for cookies to settle
      await new Promise(r => setTimeout(r, 200));
      return await syncCookies();
    } else {
      return { success: false, error: 'Login ไม่สำเร็จ — ตรวจสอบ credentials ใน popup' };
    }
  } catch (e) {
    console.error('[CookieRelay] autoLogin error:', e);
    if (winId) await chrome.windows.remove(winId).catch(() => {});
    return { success: false, error: e.message };
  } finally {
    loginInProgress = false;
  }
}

// Script injected into ProClinic login page
function doLogin(email, password, siteKey) {
  return new Promise((resolve) => {
    try {
      const log = (msg) => console.log('[CookieRelay:doLogin] ' + msg);
      log('URL: ' + window.location.href);

      // Check if already on admin page (already logged in)
      if (window.location.pathname.startsWith('/admin') && !window.location.pathname.includes('login')) {
        return resolve({ status: 'already_logged_in' });
      }

      // Fill form fields using multiple selector strategies
      const emailInput = document.querySelector('input[name="email"]') || document.querySelector('input[type="email"]');
      const passwordInput = document.querySelector('input[name="password"]') || document.querySelector('input[type="password"]');
      const acceptCheckbox = document.querySelector('#accept') || document.querySelector('input[name="accept"]');

      log('emailInput: ' + !!emailInput + ', passwordInput: ' + !!passwordInput + ', acceptCheckbox: ' + !!acceptCheckbox);

      if (!emailInput || !passwordInput) {
        // Dump available inputs for debugging
        const inputs = Array.from(document.querySelectorAll('input')).map(i => i.name + '|' + i.type + '|' + i.id);
        return resolve({ status: 'form_not_found', inputs });
      }

      // Use native setters for React/Vue compatibility
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSet.call(emailInput, email);
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));

      nativeSet.call(passwordInput, password);
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));

      // Check accept checkbox
      if (acceptCheckbox && !acceptCheckbox.checked) {
        acceptCheckbox.checked = true;
        acceptCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        acceptCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
      }

      log('Form filled, waiting before submit...');

      // Wait for form JS to process + reCAPTCHA to be ready
      setTimeout(() => {
        // Set hidden fields
        const tokenInput = document.querySelector('#form-token') || document.querySelector('input[name="token"]');
        const actionInput = document.querySelector('#form-action') || document.querySelector('input[name="action"]');
        if (actionInput) actionInput.value = 'login';

        // Try reCAPTCHA if available, then submit
        const doSubmit = () => {
          // Strategy 1: Click the submit button (preferred — triggers ProClinic's own JS handler)
          const submitBtn = document.querySelector('#form-submit') || document.querySelector('button[type="submit"]') || document.querySelector('form button');
          log('submitBtn: ' + (submitBtn ? submitBtn.id + '|' + submitBtn.type + '|' + submitBtn.textContent.trim().substring(0, 20) : 'null'));

          if (submitBtn) {
            submitBtn.click();
            log('Clicked submit button');
            resolve({ status: 'clicked_submit' });
          } else {
            // Strategy 2: Native form submit
            const form = document.querySelector('#form-login') || document.querySelector('form');
            if (form) {
              form.submit();
              log('Called form.submit()');
              resolve({ status: 'form_submitted' });
            } else {
              resolve({ status: 'no_submit_element' });
            }
          }
        };

        if (typeof grecaptcha !== 'undefined') {
          log('reCAPTCHA found — executing');
          grecaptcha.ready(() => {
            grecaptcha.execute(siteKey, { action: 'login' }).then((token) => {
              if (tokenInput) tokenInput.value = token;
              log('reCAPTCHA token set');
              doSubmit();
            }).catch(e => {
              log('reCAPTCHA error: ' + e.message + ' — submitting anyway');
              doSubmit();
            });
          });
        } else {
          log('No reCAPTCHA — submitting directly');
          doSubmit();
        }
      }, 500);
    } catch (e) {
      resolve({ status: 'error', error: e.message });
    }
  });
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve();
      }
    }
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, 15000);
    chrome.tabs.onUpdated.addListener(listener);
    // Check if already loaded (race condition fix)
    chrome.tabs.get(tabId).then(tab => {
      if (tab?.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve();
      }
    }).catch(() => {});
  });
}

function waitForLoginRedirect(tabId, origin, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      // Check final URL before giving up
      chrome.tabs.get(tabId).then(tab => {
        const url = tab?.url || '';
        console.log('[CookieRelay] Redirect timeout — final URL:', url);
        // If we're no longer on /login, it probably worked
        resolve(url && url.startsWith(origin) && !url.includes('/login'));
      }).catch(() => resolve(false));
    }, timeoutMs);

    function listener(id, info, tab) {
      if (id !== tabId) return;
      if (!tab.url || !tab.url.startsWith(origin)) return;
      // Success = navigated anywhere that's NOT /login
      if (info.status === 'complete' && !tab.url.includes('/login')) {
        console.log('[CookieRelay] Redirect detected:', tab.url);
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
    if (msg.forceLogin) {
      // Server says cookies are stale — skip sync, force fresh login
      console.log('[CookieRelay] Force login requested — auto-login first');
      autoLogin().then(result => sendResponse(result));
    } else {
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
    }
    return true; // async
  }

  if (msg.type === 'LC_AUTO_LOGIN') {
    autoLogin().then(result => sendResponse(result));
    return true;
  }

  // Auto-receive credentials from webapp (synced from Vercel env vars)
  if (msg.type === 'LC_SET_CREDENTIALS') {
    chrome.storage.local.set({
      proclinic_origin: msg.origin,
      proclinic_email: msg.email,
      proclinic_password: msg.password,
    }, () => {
      console.log('[CookieRelay] Credentials synced from webapp');
      sendResponse({ success: true });
    });
    return true;
  }
});

// ─── Sync on install/startup ─────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[CookieRelay] Extension installed — syncing cookies');
  syncCookies();
});
