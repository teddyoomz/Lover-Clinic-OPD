# LINE OA Live QA Checklist — 2026-04-27 EOD

**Production version**: V33.9 (post-orphan-QR cleanup, awaiting deploy authorization)
**Carried-over verification**: V33.6 + V33.7 + V33.8 (already deployed)

Ticking instructions: paste this whole file back into chat, replace `[ ]` with `[x]` (pass) or `[!]` (issue), add notes inline. Or paste only the failed sections back if everything else passed.

---

## 🔧 Pre-flight (admin-side, one-time)

- [ ] **LineSettingsTab credentials filled** (carry-over from s12 — won't work without)
  - Channel ID
  - Channel Secret (paste; UI hides it as password)
  - Channel Access Token (paste; UI hides it)
  - Bot Basic ID (must start with `@`)
  - `enabled = true` toggle
  - Click **บันทึก** → no validation error
- [ ] **Test connection** button → result `line-settings-test-ok`
- [ ] **Webhook URL pasted into LINE Developer Console** (`https://lover-clinic-app.vercel.app/api/webhook/line`)
  - LINE Console → Messaging API → Webhook URL → save → click "Verify" → 200 OK
  - Webhook usage: ON
- [ ] **Bot enabled** (LINE Console → Messaging API → Auto-reply messages: OFF; Greeting messages: optional)

If any of the above fails: bot can't deliver replies. Stop here, report which step failed.

---

## 📱 V33.6 mobile Flex no-truncation (deployed earlier)

Send these from your smartphone LINE app to the OA. Confirm full text visible (no `…`):

- [ ] DM **`คอร์ส`** → see "📋 คอร์สคงเหลือ · N รายการ" (red header, white text)
- [ ] Course rows show full name + `คงเหลือ X / Y · หมดอายุ Z` inline (no truncation on smallest mobile width)
- [ ] DM **`นัด`** → see "📅 นัดหมายล่วงหน้า · N นัด"
- [ ] Appointment date shows on its OWN line (not on same line as time)
- [ ] Time shows on its OWN line (e.g. `🕐 10:00–10:30` — full string visible)
- [ ] Doctor name color = NEUTRAL DARK (NOT red)

---

## 🌍 V33.7 i18n + full-date format

- [ ] DM `คอร์ส` from a Thai-default customer → header "📋 คอร์สคงเหลือ · N รายการ" (Thai)
- [ ] DM `นัด` from a Thai customer → date renders as **"อังคาร 28 เมษายน 2569"** (full Thai weekday + month + พ.ศ.)
- [ ] DM `นัด` from a Thai customer → if appointment exists, time renders fully (e.g. "🕐 10:00–10:30")
- [ ] **English customer auto-detect**: in LinkRequestsTab "ผูกแล้ว" tab, find a customer with `customer_type === 'foreigner'` → toggle pill shows **EN** active (red) by default
  - If none exists: temporarily flip a customer to EN via the toggle for this test
- [ ] DM `courses` from that customer → English bubble: **"📋 Active Courses · N items"** + "Remaining X / Y · Expires Z"
- [ ] DM `appointments` from that customer → English bubble: **"📅 Upcoming Appointments · N appts"** + "**Tuesday 28 April 2026**"
- [ ] Doctor name still neutral dark (Rule 04 spirit) regardless of language
- [ ] Switch toggle TH → EN → DM again → next reply switches language immediately (no cache)

---

## 🚫 V33.8 zero-remaining filter

- [ ] DM `คอร์ส` for a customer that has 1+ courses with 0 remaining (e.g. "Acne Tx 12 ครั้ง · qty 0/3") → those courses are **NOT** in the list
- [ ] Header count `N รายการ` matches the displayed rows (not over-counting)
- [ ] Buffet courses (`เหมาตามจริง`) STILL show through (no count to compare)
- [ ] All-consumed customer → empty-state bubble "ไม่พบคอร์สที่ยังใช้ได้"

---

## 🧹 V33.9 orphan QR cleanup (this session — verify no regression)

- [ ] DM a fake `LINK-ABC123XYZ7` token to OA → bot **silent ignore** (no reply, message just stored in chat)
  - **Expected**: this is intentional; pre-V33.4 QR-token consumer was stripped. Customers with old QR codes who scan today get nothing back. Admin-mediated id-link via "ผูก [ID]" is the sole flow now.
- [ ] DM `1234567890123` (valid 13-digit national ID) → bot replies with **acknowledgement** ("✅ ระบบได้รับคำขอแล้ว ...") — same-reply anti-enumeration
- [ ] LinkRequestsTab "รอตรวจสอบ" tab shows the new request (if ID matched a real customer)
- [ ] Click **อนุมัติ** → push to customer with success message — customer sees "🎉 อนุมัติการผูกบัญชี LINE สำเร็จ ..."
- [ ] After approval: customer DM `คอร์ส` → bot replies with their courses (proves linking writes lineUserId correctly)
- [ ] LinkRequestsTab "ผูกแล้ว" tab shows the customer with status `active` + language pill active

---

## 🔄 Admin actions in "ผูกแล้ว" tab

- [ ] Click **ปิดชั่วคราว** (suspend) on a linked customer → confirm dialog → confirm
- [ ] Customer DMs `คอร์ส` → bot **silent** (no reply because suspended)
- [ ] Click **เปิดใหม่** (resume) → customer DMs `คอร์ส` again → bot replies normally
- [ ] Click **ยกเลิก** (unlink) → confirm dialog → confirm → row's lineUserId cleared
- [ ] Customer DMs `คอร์ส` → bot replies with "บัญชี LINE นี้ยังไม่ได้ผูกกับลูกค้าในระบบ" (NOT_LINKED message)
- [ ] **Language toggle persists across actions** — if customer is on EN, suspend+resume doesn't reset to TH

---

## 🚨 Smoke (everything-still-works)

- [ ] Production root https://lover-clinic-app.vercel.app loads
- [ ] Backend `?backend=1` loads
- [ ] Customer link `?customer=LC-26000001` loads
- [ ] Patient form via `?session=...` link still submits
- [ ] PatientDashboard via `?patient=...` link still loads

---

## 🐛 If anything fails

Paste the failed item back in chat with:
1. **What you did** (verbatim message text or click sequence)
2. **What you expected** (the checklist line)
3. **What you got** (screenshot or text of the bot reply)
4. **Customer ID** (so we can replicate)

I'll diagnose + ship V33.x.bis cleanly.

---

## ✅ When all green

Tell me "QA pass" and we're cleared to start Phase 15 (Central Stock Conditional). Or report "skip 15" if clinic stays single-branch — we'd jump to Phase 16 (Documents Phase 14 finishup) instead.
