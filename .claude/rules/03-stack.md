<important if="editing src/ or api/; working with Firestore, Vite, React, backend dashboard, or ProClinic">
## Stack Gotchas — Firestore · Vite · React · Backend · ProClinic · Chat

### Firestore
1. **`serverTimestamp()` → snapshot fires 2x** (local estimate + server confirm). **ห้าม compare timestamps** — ใช้ `JSON.stringify(data)` เทียบเอา.
2. **REST API PATCH ต้องมี `updateMask.fieldPaths`** — ไม่ใส่ = Firestore ลบ field ทุกตัวที่ไม่ได้ส่งไป (PATCH = replace entire doc):
   ```js
   const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
   fetch(`${FIRESTORE_BASE}/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
   ```
3. **Atomic counter → `runTransaction`** (ป้องกัน race condition). Bug 2026-04-09: 2 sales same second → same INV number → overwrite.
4. Base path: `artifacts/{appId}/public/data/`
5. Document size ≤ 1 MB — split เฉพาะเมื่อใกล้เต็มจริง

### Vite OXC parser
**ห้าม IIFE `{(() => {...})()}` ใน JSX** → parser crash. ใช้ pre-computed variable หรือ extract เป็น component. (Bug: course list IIFE click handlers blocked buttons.)

### React
1. **Stale closure**: `useEffect` ที่ขึ้นกับ async-loaded props → ใช้ `useRef` หรือ `clinicSettingsLoaded` flag
2. **scrollToError**: `data-field="fieldName"` attribute + `alert()` popup. เพิ่ม `data-field` ทุก input ที่มี validation
3. **Course deduction**: lookup by `name + product` (ไม่ใช่ array index — form dedup courses 156→unique)
4. **Purchased items**: deduct **AFTER** assign (ไม่ใช่ก่อน)
5. **Payment status map**: `'2'` → `'paid'`, `'4'` → `'split'`, `'0'` → `'unpaid'`
6. **Buy modal**: max 50 items + "โหลดเพิ่ม" (performance)

### Backend Dashboard (กฎเหล็ก)
1. **Backend ใช้ข้อมูลจาก Firestore เท่านั้น** — ห้าม fetch ProClinic ขณะใช้งาน
2. Sync ทุกอย่างผ่านหน้า **ข้อมูลพื้นฐาน** หน้าเดียว (ปุ่ม sync ใหม่ → หน้านี้)
3. **Flow ทางเดียว**: ProClinic → sync/clone → Firestore (`be_*`, `master_data/*`) → Backend UI
4. ข้อมูลไม่มี → ไป sync มาเก็บก่อน → แล้วค่อยใช้จากที่ดูดมา
5. **Fully replicate ProClinic** — ห้าม simplified version

### ProClinic integration
1. **Credentials**: Vercel env vars (`PROCLINIC_ORIGIN`, `PROCLINIC_EMAIL`, `PROCLINIC_PASSWORD`) — ห้ามอยู่ใน source
2. **Localhost**: `fetchCoursesViaApi` error = ปกติ (รันบน Vercel prod เท่านั้น)
3. **429 rate limit**: wait 5-10s → retry (ProClinic + Vercel มี rate limit)
4. **OPD inspector** — ใช้ก่อนสร้าง page/API/form **ทุกครั้ง** (triangulate ProClinic + plan + เราเอง):
   ```bash
   node F:\replicated\scraper\opd.js intel /admin/xxx     # god mode
   node F:\replicated\scraper\opd.js look /admin/xxx       # screenshot
   node F:\replicated\scraper\opd.js forms /admin/xxx      # form fields
   node F:\replicated\scraper\opd.js api GET /admin/api/xxx
   node F:\replicated\scraper\opd.js network /admin/xxx    # capture bg APIs
   node F:\replicated\scraper\opd.js dump /admin/xxx       # dropdown master data
   # session หมดอายุ → node F:\replicated\scraper\quick-login.js
   ```

### Chat system (FB + LINE)
1. **FB**: subscribe `message_echoes` ทั้ง App Webhook Settings + `POST /{PAGE_ID}/subscribed_apps`. Reply จาก app เรา = OK (echo เห็น).
2. **LINE**: ไม่มี echo, reply จาก app ไม่ได้ → show "ตอบแชท LINE ผ่าน LINE OA Chat เท่านั้น"
3. **`lastMessage`**: อัพเดทตามข้อความล่าสุด ใครส่งก็ได้ (customer / echo / admin)
4. **`displayName` + `pictureUrl`**: เก็บของ**ลูกค้า**เท่านั้น — ห้ามเปลี่ยนตามคนตอบ
5. Chat history: หน้าละ 20 + auto-delete > 7 วัน
6. FB App ID: `959596076718659`, Page ID: `431688823362798`, Graph API: `v25.0`

### Import from ProClinic (duplicate check)
- ค้นหาจาก HN / เบอร์โทร / เลขบัตร ปชช → ดึง edit page → `reverseMapPatient()` → patientData
- ซ้ำ + sync ปกติ → เตือน + บล็อก
- ซ้ำ + หลุด sync (`brokerStatus !== 'done'`) → auto resync
- ไม่ซ้ำ → สร้าง session `IMP-XXXXXX`
- **ห้าม `isPermanent: true`** ใน imported session (จะถูก filter ออกจากประวัติ)

### Extension (cookie-relay)
- แก้ `cookie-relay/*.js` → reload ที่ `chrome://extensions` เอง (ไม่ auto)
- **ต้อง reload**: `background.js`, `manifest.json`, `content-loverclinic.js`
- **ไม่ต้อง reload**: `popup.html`, `popup.js`
</important>
