<important if="working on backend dashboard or ProClinic integration">
## Backend Rules
1. Backend Dashboard ใช้ข้อมูลจาก Firestore เท่านั้น — ห้าม fetch ProClinic ขณะใช้งาน
2. Sync ทุกอย่างผ่านหน้าข้อมูลพื้นฐานเท่านั้น
3. Flow: ProClinic → sync → Firestore → Backend UI (ทางเดียว)
4. ทุกหน้า Backend ต้อง fully replicate ProClinic ห้ามทำ simplified
5. ห้ามใช้ IIFE `{(() => {...})()}` ใน JSX — Vite OXC crash
6. อัพเดท CODEBASE_MAP.md ทุกครั้งที่แก้โค้ด
</important>
