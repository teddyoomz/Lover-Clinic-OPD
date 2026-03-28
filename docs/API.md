# API Layer — Vercel Serverless Functions

> Path: `api/proclinic/` | Runtime: Node.js | maxDuration: 30s
> อัพเดทล่าสุด: 2026-03-28

---

## Overview

Server-side scraping ProClinic CRM ผ่าน HTTP — ใช้ cheerio parse HTML, ไม่ใช้ browser automation
ทำงานบน **Vercel production เท่านั้น** — localhost dev server ไม่มี API routes → error ปกติ

### Architecture
```
brokerClient.js (frontend) → fetch /api/proclinic/* → Vercel Serverless Function
  → createSession() (login + cookie cache) → scrape ProClinic → return JSON
```

---

## Endpoints

| Endpoint | Method | คำอธิบาย | Return |
|----------|--------|-----------|--------|
| `/api/proclinic/create` | POST | สร้าง customer ใหม่ | `{ success, proClinicId, proClinicHN }` |
| `/api/proclinic/update` | POST | แก้ไข customer (resolve by ID/HN/name) | `{ success, notFound? }` |
| `/api/proclinic/delete` | POST | ลบ customer (verify existence first) | `{ success, notFound? }` |
| `/api/proclinic/courses` | POST | ดึง courses + appointments | `{ success, courses, expiredCourses, appointments }` |
| `/api/proclinic/search` | POST | ค้นหา customers | `{ success, customers: [{id, name, phone}] }` |
| `/api/proclinic/login` | POST | ทดสอบ connection | `{ success }` |

| `/api/proclinic/credentials` | POST | ส่ง ProClinic credentials ให้ extension | `{ success, origin, email, password }` |

### Common response flags
- `extensionNeeded: true` → cookies หมดอายุ + server login ล้มเหลว → ต้องการ Cookie Relay Extension
- `sessionExpired: true` → ProClinic session หมด ต้อง re-login
- `notFound: true` → customer ไม่เจอ (ถูกลบไปแล้ว) → frontend ถอด HN/OPD

---

## _lib/ (Shared utilities)

### session.js — Session Management
- `createSession(origin, email, password)` — Factory function
  - Priority: Vercel env vars → request body params
  - Cookie caching: Firestore REST API (`proclinic_session/cookies`)
  - Auto re-login: `fetchText()` detects login page → re-authenticate
- `handleCors(req, res)` — CORS headers

### scraper.js — HTML Parsing (Cheerio)
- `extractCSRF(html)` — `meta[name="csrf-token"]`
- `extractSearchResults(html)` — Parse customer list with Thai name/phone
- `findBestMatch(customers, patient)` — Scoring: phone (100pts) + name tokens (10pts each)
- `extractCourses(html, tabSelector)` — Course cards: name, expiry, value, status
- `extractAppointments(html)` — Modal appointments: date, time, doctor, branch
- `extractFormFields(html)` — All form input/select values for update
- `extractValidationErrors(html)` — `.invalid-feedback` or `.alert-danger`

### fields.js — Form Field Mapping
- `VALID_PREFIXES` — Thai/English titles (นาย, นาง, Mr., Mrs., etc.)
- `GENDER_MAP` — prefix → gender
- `computeBirthdate(patient)` — DOB from dobDay/Month/Year or age
- `buildCreateFormData(patient, csrf, defaultFields)` — URLSearchParams for POST create
- `buildUpdateFormData(patient, existingFields, csrf)` — Merge existing + new patient data

---

## Customer Resolution Flow (update/delete)

```
1. มี proClinicId → ใช้ตรง + verify via edit page (ถ้าไม่เจอ → notFound)
2. มี proClinicHN → search by HN → เอาตัวแรก
3. มี phone → search by phone → findBestMatch
4. มี name → search by "firstName lastName" → findBestMatch
5. ไม่เจอเลย → throw notFound error
```

---

## Cookie Relay Extension Integration

เมื่อ server login ล้มเหลว (ProClinic มี reCAPTCHA) → API returns `extensionNeeded: true`

```
brokerClient.js auto-retry flow:
  1. API returns extensionNeeded → fetch /api/proclinic/credentials
  2. Send credentials to Cookie Relay Extension via postMessage
  3. Extension auto-login (minimized window) → sync cookies to Firestore
  4. brokerClient retries API call → success (server uses synced cookies)
```

> Timeout: 30s (auto-login ~7-15s)
> Extension ดู `docs/EXTENSION.md`

---

## Frontend Client (src/lib/brokerClient.js)

```js
apiFetch(action, data)  // wrapper → fetch('/api/proclinic/{action}', { body: data })
                        // auto-retry via extension when extensionNeeded
fillProClinic(patient)
updateProClinic(proClinicId, proClinicHN, patient)
deleteProClinic(proClinicId, proClinicHN, patient)
getCourses(proClinicId)
searchCustomers(query)
testLogin()
getProClinicCredentials()  // GET credentials for extension
// Extension helpers
sendMessageToExtension(type, extra)
requestExtensionSync(forceLogin)
ensureExtensionHasCredentials()
```
