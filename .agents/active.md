---
updated_at: "2026-07-05 LATE — OPD Note Templates SHIPPED + DEPLOYED (ships the pending recall/VIP/staffchat-cards batch too); hunt loop converged R1(2 fixed)→R2(0)."
status: "Master = prod. All L2 post-deploy ALL PASS. Awaiting user L1 hands-on."
branch: "master"
last_commit: "a5b45c6f hardening(opd-templates): hunt R2 close — length caps"
tests: "full vitest 17209/17209 · 0 fail (865 files). Build clean 3.41s. New bank 63/63."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "a5b45c6f (2026-07-05) — vercel lover-clinic-34gimvsyy ● Ready, alias HTTP 200"
firestore_rules_version: "DEPLOYED 2026-07-05: TFP-card tfp-vitals/tfp-doctor allowlist (probe #18) + be_opd_note_templates staff-only (probe #19). Probe-Deploy-Probe PRE 16/16 + POST 15/15."
---

# Active — 2026-07-05 LATE — OPD Note Templates (deployed) + batch ①-⑥ LIVE

## State
- **OPD Note Templates** (จากไฟล์ .docx user): ปุ่ม "📄 template จดประวัติ ▾" ใน OPD Card header ของ TFP → built-in บังคับ "สมรรถภาพทางเพศ" + template สาขา (สร้าง/✎/🗑 ใน dropdown, modal AV78) → เลือกแล้ว append เข้า CC. Collection ใหม่ `be_opd_note_templates` (BSA เต็ม + rules staff-only + probe #19). Q1=A/Q2=A/Q3=A.
- **Batch ก่อนหน้า (recall reason ① / VIP gold ② / TFP-intake-assessment cards ③-⑥) DEPLOYED พร้อมกัน** — TFP chat cards ตอนนี้ LIVE (rules allowlist ขึ้นแล้ว, L2 post-deploy: CREATE SUCCESS + dup DENIED + forge DENIED).
- Hunt loop converged: R1 (2 agents) → 2 confirmed fixed (refresh-on-every-open + Thai permission copy) / 5 refuted-with-evidence; R2 (2 agents) → 0 confirmed + hardening (name 100 / content 10,000 caps).
- Rule Q: **L2 post-deploy ALL PASS ×2 จริงบน prod** — `diag-opd-note-templates-l2.mjs` (staff CRUD + cross-branch isolation + tabs/Thai verbatim + zero orphans) + `diag-tfp-chat-card-l2.mjs`.

## Next action
- **User L1 hands-on**: (1) TFP → เปิดเมนู template → เลือก "สมรรถภาพทางเพศ" → ข้อความลง CC + save แล้วอยู่ครบ (2) สร้าง/แก้/ลบ template สาขา → เห็นผลทันที (3) TFP บันทึกซักประวัติ/แพทย์ → card โผล่ใน staff chat สาขา + เปิดบันทึกการรักษาถูกใบ (4) VIP toggle → ชื่อทองทันที (5) card modals เปิดเหนือ chat panel (มือถือด้วย).
- ถ้า L1 เจอบั๊ค → `/systematic-debugging` + Rule P.

## Outstanding user-triggered actions
- (none — deploy เสร็จแล้ว; รอผล L1 จาก user เท่านั้น)
