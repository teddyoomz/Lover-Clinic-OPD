# 🚨 RUNBOOK — กู้ระบบ LoverClinic (ฉบับอ่านตอนไฟไหม้)

> เขียน 2026-07-21 สำหรับ "คนอ่านตอนเครียด" — ทำตามบนลงล่าง ไม่ต้องเดา
> ทุก script รันจาก `F:\LoverClinic-app` และใช้ `.env.local.prod`
> (ถ้าไฟล์หาย: `vercel env pull .env.local.prod --environment=production`)

## สถานการณ์ 1 — Deploy แล้วแอปพัง (บั๊คจาก build ใหม่)

```
git log --oneline -5                # หา commit ก่อนหน้าที่ดี
git revert <commit เสีย> && git push
vercel --prod                       # deploy กลับ
```
หรือเร็วกว่า: เปิด vercel.com → Project → Deployments → กด "Promote to Production" บน deployment เก่าที่ยังดี

⚠️ ถ้าแตะ `firestore.rules` ต้องทำ Probe-Deploy-Probe เต็ม (`.claude/rules/01-iron-clad.md` Rule B)

## สถานการณ์ 2 — ข้อมูลเสีย/หาย (ต้อง restore จาก backup)

Backup อัตโนมัติทุกคืน 03:00 อยู่ที่ Storage `backups/whole-system/` (เก็บ 5 วัน)

**ทาง UI (ง่ายสุด)**: Backend → จัดการ Backup (BackupManagerTab) → เลือก backup →
Restore (ระบบบังคับ auto-pre-backup ก่อนเสมอ — AV19 ห้ามข้าม)

**ทาง CLI**:
```
node scripts/whole-system-restore.mjs            # dry-run ก่อนเสมอ
node scripts/whole-system-restore.mjs --apply    # ตามคำแนะนำใน dry-run
```
กู้เฉพาะส่วน: `scripts/branch-restore.mjs` (รายสาขา) · `scripts/customer-restore.mjs` (รายลูกค้า)

หลัง restore: เช็คการ์ดสุขภาพระบบ + เปิดดูลูกค้า 2-3 คน + ยอดขายวันล่าสุด

## สถานการณ์ 3 — Vercel หาย (บัญชีล่ม/พลาดบิล)

โค้ดอยู่บน GitHub: `github.com/teddyoomz/Lover-Clinic-OPD` — ไม่หายตาม Vercel
1. สมัคร/กู้บัญชี Vercel → Import repo จาก GitHub
2. ใส่ env vars กลับ (มีสำเนาใน `.env.local.prod` บนเครื่องนี้ — copy ทีละตัวลง Vercel dashboard)
3. ตั้ง domain alias `lover-clinic-app.vercel.app` + เช็คว่า plan เป็น Pro (crons 14 ตัวต้องใช้)
4. Deploy → เช็ค `?ping=1` = 200 + crons ขึ้นครบใน dashboard

## สถานการณ์ 4 — Firebase project หาย (หนักสุด)

นี่คือเหตุผลที่มี **สำเนานอกบ้าน**: `F:\LoverClinic-backups\` (ดึงด้วย
`node scripts/offsite-backup-pull.mjs` — **ทำเป็น ritual ทุกสัปดาห์**)

1. สร้าง Firebase project ใหม่ (Firestore + Storage + Auth + FCM)
2. อัพเดท config: `src/firebase.js` + env `FIREBASE_ADMIN_*` + `APP_ID` ทุกจุด
3. Deploy rules + indexes: `firebase deploy --only firestore:rules,firestore:indexes,storage`
4. Restore จากสำเนา local: ใช้ `scripts/whole-system-restore.mjs` ชี้ไปที่โฟลเดอร์ local
   (ไฟล์ JSON ครบทุก collection + manifest — hash ตรวจแล้วตอน pull)
5. Auth users: อยู่ใน `auth/users.json` ของ backup (ไม่มีรหัสผ่าน — พนักงานต้อง reset password)
6. LINE/FB webhook URL ไม่เปลี่ยน (อยู่ฝั่ง Vercel) แต่ต้องเช็ค token/secret ใน configs

## เช็คลิสต์รายสัปดาห์ (กันเรื่องข้างบนทั้งหมด)

- [ ] `node scripts/offsite-backup-pull.mjs` → ต้องจบด้วย "OFF-SITE COPY VERIFIED"
- [ ] การ์ดสุขภาพระบบ (Backend → ตั้งค่า → 🩺) = เขียวหมด
- [ ] healthchecks.io ไม่มี alert (dead-man's switch ของ health sweep)

## เช็คลิสต์รายไตรมาส

- [ ] Restore drill: `node scripts/e2e-whole-system-backup-restore-v122.mjs`
      (round-trip ลง namespace แยก — ไม่แตะข้อมูลจริง ต้องจบ 10/0)
