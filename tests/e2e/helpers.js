// ─── E2E Helpers — Navigation functions (not a test file) ───────────────────

/**
 * Wait for Firebase auth to be ready (user logged in).
 */
async function waitForAuth(page) {
  await page.waitForFunction(() => {
    const auth = window.__auth;
    return auth && auth.currentUser && !auth.currentUser.isAnonymous;
  }, { timeout: 15000 });
}

/**
 * Navigate to backend dashboard (already authenticated via storageState).
 */
export async function goToBackend(page) {
  // Go to root first to let Firebase hydrate auth from localStorage
  await page.goto('/');
  await waitForAuth(page);
  await page.goto('/?backend=1');
  await page.waitForSelector('text=ระบบหลังบ้าน', { timeout: 15000 });
}

/**
 * Navigate to a specific customer detail page.
 */
export async function goToCustomer(page, customerId) {
  await page.goto('/');
  await waitForAuth(page);
  await page.goto(`/?backend=1&customer=${customerId}`);
  await page.waitForTimeout(4000);
}
