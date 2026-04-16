<important if="writing or modifying code">
## Testing Rules
1. ทุก feature ใหม่ → เพิ่ม test (Vitest/RTL/Playwright ตาม scope)
2. `npm test` ALL PASS ก่อน commit เสมอ
3. E2E: ใช้ Playwright + Firebase REST API token injection
4. Vitest: ใช้ `TS = Date.now()` unique IDs + `afterAll` cleanup
5. ทดสอบไม่ผ่าน ไม่หยุดรัน → แก้จนกว่าจะผ่าน
</important>
