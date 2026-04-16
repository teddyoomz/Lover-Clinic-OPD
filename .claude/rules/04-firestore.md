<important if="working with Firestore or serverTimestamp">
## Firestore Rules
1. write ที่มี `serverTimestamp()` → snapshot fires 2 ครั้ง — ใช้ JSON.stringify compare
2. REST API PATCH ต้องใส่ `updateMask.fieldPaths` เสมอ (ไม่งั้นลบ field ทั้งหมด)
3. Atomic counters ใช้ `runTransaction` (ป้องกัน race condition)
4. Base path: `artifacts/{appId}/public/data/`
</important>
