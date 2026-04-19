<important if="writing UI; working with colors, dates, patient names, or Thai text">
## Thai Clinic UI — Culture · Dates · Palette

### Colors (วัฒนธรรมไทย — non-negotiable)
1. **สีแดงห้ามใช้กับตัวอักษรชื่อ/HN ผู้ป่วย** — สีแดง = ชื่อคนตายในวัฒนธรรมไทย
2. **สีทองห้ามใช้** — user บอก "สีทองนี่ขัดใจมาก"
3. Avatar initials + HN badge: **white/gray** (`#e5e5e5`, `#d4d4d4`) เท่านั้น
4. Palette หลัก: **แดง · ดำ · ขาว · ไฟ** + LINE green (`#06C755`) accent
5. Glowing red border OK — **แค่ตัวอักษรชื่อ/HN ห้ามแดง**
6. Aesthetic: dark, premium, masculine (fire/ember). Light theme map ผ่าน CSS var (`--bg-card`, `--tx-heading` ใน `index.css`)

### Date format (iron-clad)
1. **ทุก date input ต้องใช้ shared `DateField`** จาก `src/components/DateField.jsx`
   - ห้าม raw `<input type="date">` — renders mm/dd/yyyy ใน US locale = bug
   - ห้าม local wrapper — ขยาย `DateField` API ถ้าต้องการ feature ใหม่
2. **Display: dd/mm/yyyy** ทุกที่
3. **Year**:
   - Admin/Backend UI (SaleTab, DepositPanel, finance) = **ค.ศ.**
   - Patient-facing UI (TreatmentFormPage, OPD print) = **พ.ศ.**
4. **เวลา 24hr เสมอ** — ห้าม AM/PM
5. **Thai timezone helpers** จาก `src/utils.js` (ห้ามใช้ raw `new Date()`):
   - `bangkokNow()` — Date object ใน Bangkok TZ
   - `thaiTodayISO()` — "YYYY-MM-DD" format (ห้ามใช้ `new Date().toISOString().slice(0,10)` → UTC → Thai 00:00-07:00 → prev day)
   - `thaiNowMinutes()`, `thaiYearMonth()`
   - `THAI_MONTHS` array, `YEARS_BE` / `YEARS_CE` option lists
6. **Contact buttons**: LINE (green `#06C755`) + Call (red accent) separated by divider
7. **Sync success button**: สีเขียว — เข้มพอเห็นทั้ง dark/light theme

### Thai copy (UX writing)
- Error messages: Thai, polite, actionable ("กรุณากรอก..." / "ไม่พบข้อมูล" / "ลองอีกครั้ง")
- Labels: concise, specific ("เลขบัตรประชาชน" ไม่ใช่ "เลข ID")
- CTA buttons: verb-first ("บันทึก", "ส่งข้อมูล", "ยกเลิก")
</important>
