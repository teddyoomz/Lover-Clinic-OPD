---
name: opd-inspect
description: "Inspect the original ProClinic OPD system. Use BEFORE building any page/API/form to see how the original works. Provides full page intel, forms, tables, APIs, CSS, screenshots, cross-module connections."
user-invocable: true
argument-hint: "<command> [args]"
allowed-tools: "Bash(node *), Read(*)"
---

# OPD Inspector — God Weapon

```bash
OPD="node F:\replicated\scraper\opd.js"

# === ดูภาพรวม ===
$OPD routes                              # ดู menu + routes ทั้งระบบ
$OPD intel /admin/stock                  # GOD MODE: ทุกอย่างในคำสั่งเดียว (structure+forms+API+CSS+logic+connections)

# === ดูหน้าตา ===
$OPD look /admin/stock                   # ถ่ายหน้าจออัจฉริยะ (full+content+forms+tables+modals+mobile) แล้ว Read รูปได้
$OPD screenshot /admin/dashboard         # ถ่ายหน้าจอเดี่ยว
$OPD mobile /admin/stock                 # ดู mobile view (375x812)

# === ดูโครงสร้าง ===
$OPD peek /admin/stock                   # โครงสร้างหน้า (forms, tables, buttons, tabs)
$OPD forms /admin/customer/create        # form fields ละเอียด (name, type, label, required, options, validation)
$OPD tables /admin/treatment             # table columns + sample data + pagination
$OPD css /admin/stock ".sidebar"         # computed CSS ของ element
$OPD source /admin/stock                 # HTML ดิบ

# === ทดสอบ + กรอก ===
$OPD fill /admin/stock-change/create     # กรอกฟอร์ม + submit + จับ API response + validation errors
$OPD click /admin/stock "ปรับสต็อค"       # กดปุ่ม ดูว่า navigate/modal/อะไร
$OPD api GET /admin/api/appointment?date=2026-04-16  # ยิง API ตรง ดู response schema จริง

# === วิเคราะห์ลึก ===
$OPD xray /admin/stock                   # Deep: framework, source maps, tokens, JS functions, error format
$OPD map /admin/sale/create              # ดูว่าเชื่อมกับ module/entity ไหน (foreign keys, links, form actions)
$OPD network /admin/appointment          # ดักจับทุก API ที่ถูกเรียกตอนเปิดหน้า
$OPD spy /admin/appointment              # คลิกทุกปุ่ม + จับทุก API ที่เกิด
$OPD search stock                        # ค้นหา keyword ในทุก route + content + JS
$OPD dump /admin/customer/create         # ดึง master data จาก dropdowns (= ข้อมูลใน DB จริง)
$OPD trace /admin/stock-change/create /admin/stock  # ทำ action ที่หน้า A → ดูหน้า B เปลี่ยนไหม
$OPD print /admin/treatment/123          # จับ print template (ใบเสร็จ, ใบนัด)
$OPD storage                             # ดู localStorage + cookies + session
$OPD scan --fast                         # Full autopilot scan ทั้งระบบ
```

Output เป็น JSON ทุกคำสั่ง (ยกเว้น source=HTML, look=screenshots)
Claude อ่านรูป screenshot ได้ผ่าน Read tool: `Read F:\\replicated\\output\\screenshots\\look-admin_stock-full.png`
Session หมดอายุ → `node F:\\replicated\\scraper\\quick-login.js`
