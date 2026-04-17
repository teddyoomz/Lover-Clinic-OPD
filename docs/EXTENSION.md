# Cookie Relay Extension — Chrome Extension MV3

> ไฟล์: `cookie-relay/`
> หน้าที่: Sync ProClinic httpOnly cookies → Firestore + Auto-login เมื่อ session หมดอายุ
> **ไม่มี auto-deploy** — ต้อง reload ที่ `chrome://extensions` เอง
> อัพเดทล่าสุด: 2026-03-28

---

## ⚠️ Extension Reload Rules

| เปลี่ยนไฟล์ | ต้อง reload chrome://extensions? |
|------------|----------------------------------|
| `background.js` | ✅ ต้อง reload |
| `manifest.json` | ✅ ต้อง reload |
| `content-loverclinic.js` | ✅ ต้อง reload |
| `popup.html` / `popup.js` | ❌ ไม่ต้อง |

---

## Files

| ไฟล์ | หน้าที่ |
|------|--------|
| `background.js` | Service Worker — syncCookies(), autoLogin(), doLogin(), message handlers |
| `content-loverclinic.js` | Bridge บน lover-clinic-app.vercel.app — forward postMessage ↔ chrome.runtime.sendMessage |
| `manifest.json` | MV3 config, permissions: `cookies, scripting, tabs, storage` |
| `popup.html/js` | UI สำหรับตั้ง credentials + manual sync |

---

## ทำไมต้องมี Extension นี้

ProClinic มี **reCAPTCHA v3** (site key: `6LeNCn8oAAAAAO1J2Gd4i3_z3JqsvIlVTpp1o53p`) → server-side login ทำไม่ได้ ต้องใช้ browser จริง

Extension ใช้ `chrome.cookies` API อ่าน httpOnly cookies แล้ว sync ไป Firestore → Vercel API ใช้ cookies เหล่านั้นเพื่อ scrape ProClinic

---

## Credentials Flow (อัตโนมัติ)

```
Vercel env vars (PROCLINIC_ORIGIN, EMAIL, PASSWORD)
  → /api/proclinic/credentials (Firebase Auth protected)
  → webapp fetches credentials
  → window.postMessage('LC_SET_CREDENTIALS', { origin, email, password })
  → content-loverclinic.js forwards to chrome.runtime.sendMessage
  → background.js saves to chrome.storage.local
```

Extension รับ credentials อัตโนมัติจาก Vercel env vars — ไม่ต้องตั้งใน popup ด้วยตัวเอง
เมื่อเปลี่ยน credentials ใน Vercel → extension จะได้รับอัตโนมัติเมื่อ webapp โหลดใหม่

---

## Cookie Sync Flow

```
syncCookies():
  1. chrome.cookies.getAll({ domain: '.proclinicth.com' })
  2. หา laravel_session cookie → ถ้าไม่มี → needsLogin: true
  3. ใช้ origin จาก chrome.storage.local (ตรงกับ Vercel env var)
     ⚠️ ห้ามใช้ cookie domain — `.proclinicth.com` → `proclinicth.com` ≠ `proclinicth.com`
  4. Convert cookies เป็น Set-Cookie-like strings
  5. PATCH Firestore: artifacts/{APP_ID}/public/data/clinic_settings/proclinic_session
```

### Auto-sync on Cookie Change
```js
chrome.cookies.onChanged → debounce 1s → syncCookies()
// ทุกครั้งที่ ProClinic cookies เปลี่ยน → sync อัตโนมัติ
```

---

## Auto-login Flow

```
autoLogin():
  1. อ่าน credentials จาก chrome.storage.local
  2. chrome.windows.create({ type: 'popup', focused: false })
  3. chrome.windows.update(winId, { state: 'minimized' })
     ⚠️ ต้องสร้าง window ก่อนแล้วค่อย minimize
     ⚠️ state:'minimized' ใน create ไม่ work ทุก Chrome version
     ⚠️ left/top off-screen ถูก reject (ต้อง 50% ภายในจอ)
  4. waitForTabLoad (timeout 15s)
  5. chrome.scripting.executeScript → doLogin()
  6. waitForLoginRedirect (timeout 15s)
  7. chrome.windows.remove → syncCookies()
```

### doLogin() (injected script)

```js
doLogin(email, password, siteKey):
  1. หา input[name="email"], input[name="password"], #accept checkbox
  2. Native value setter (HTMLInputElement.prototype.value.set) + dispatch input/change events
  3. Check accept checkbox + dispatch change/click events
  4. setTimeout 500ms → reCAPTCHA execute + set #form-token, #form-action
  5. Click #form-submit button (type="button" ไม่ใช่ type="submit")
     ⚠️ form.submit() ไม่ trigger ProClinic JS handler — ต้อง click ปุ่ม!
```

### waitForLoginRedirect()

```js
// Success = URL เปลี่ยนจาก /login ไปที่อื่น (ไม่จำกัดแค่ /admin)
// Timeout: ตรวจ final URL — ถ้าไม่ใช่ /login ถือว่าสำเร็จ
```

---

## Message Types (Webapp ↔ Extension)

| Type | ทิศทาง | คำอธิบาย |
|------|--------|-----------|
| `LC_SYNC_COOKIES` | Webapp → Extension | Sync cookies (+ forceLogin flag) |
| `LC_SYNC_COOKIES_RESULT` | Extension → Webapp | ผล sync |
| `LC_SET_CREDENTIALS` | Webapp → Extension | ส่ง credentials จาก Vercel env vars |
| `LC_COOKIE_RELAY_READY` | Extension → Webapp | Extension พร้อม (ส่ง 3 ครั้ง: 0s, 1s, 3s) |
| `LC_AUTO_LOGIN` | Manual → Extension | Force auto-login |

---

## brokerClient.js Integration

```js
// เมื่อ API returns extensionNeeded:true (cookies expired):
1. ensureExtensionHasCredentials()  // fetch /api/proclinic/credentials → send to extension
2. requestExtensionSync(forceLogin=true)  // LC_SYNC_COOKIES → extension auto-login
3. timeout 30s → retry API call
```

> ⚠️ `forceLogin: true` บังคับ extension login ใหม่ แทนที่จะ re-sync cookies เดิมที่หมดอายุ

---

## content-loverclinic.js — Bridge

```js
sendToBackground(msg, callback):
  // try-catch wrapper สำหรับ "Extension context invalidated" error
  // เกิดเมื่อ extension reload แต่หน้าเว็บไม่ refresh

// Re-announce ที่ 0s, 1s, 3s — ป้องกัน React mount ไม่ทัน
announce() → window.postMessage('LC_COOKIE_RELAY_READY')
```

---

## Firestore Cookie Storage

```
Path: artifacts/{APP_ID}/public/data/clinic_settings/proclinic_session
Fields:
  origin: "https://proclinicth.com"  ← ต้องตรงกับ PROCLINIC_ORIGIN env var
  cookies: ["laravel_session=xxx; path=/; secure; httponly", ...]
  updatedAt: ISO string
  source: "cookie-relay-extension"
```

---

## Bug History

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| "Invalid value for state" | `state:'minimized'` ใน windows.create ไม่ support ทุก Chrome | สร้าง window ก่อน → update minimize ทีหลัง |
| "Invalid value for bounds" | off-screen position ถูก reject | ใช้ create + minimize แทน |
| Cookies synced แต่ server ยังใช้ไม่ได้ | Origin mismatch: cookie domain ≠ Vercel env var | ใช้ `proclinic_origin` จาก credentials |
| Login สำเร็จแต่ timeout | brokerClient timeout 20s < auto-login time | เพิ่มเป็น 30s |
| form.submit() ไม่ trigger login | ProClinic ใช้ type="button" มี JS handler | click #form-submit button แทน |
| "Extension context invalidated" | Extension reload, content script เก่า | try-catch wrapper sendToBackground() |
| Extension ไม่รับ credentials | ready ส่งก่อน React mount | re-announce 3 ครั้ง + ensureExtensionHasCredentials() |

---

## ⚠️ Legacy: broker-extension/

`broker-extension/` คือ Extension เดิมที่ทำ browser automation (fill forms, scrape DOM)
ถูกแทนที่ด้วย API layer (Vercel Serverless) + cookie-relay/ (cookie sync เท่านั้น)
**ห้ามอ้างอิง** broker-extension/ สำหรับ features ใหม่
