<important if="deploying or committing code">
## Deploy Workflow
1. `git add <files>` → `git commit` → `npm run build` → `vercel --prod`
2. ห้าม deploy โดยไม่ commit ก่อน
3. Backend files (`src/components/backend/`, `BackendDashboard.jsx`) → commit อย่างเดียว ไม่ deploy
4. `cookie-relay/` → commit เฉยๆ ไม่ deploy
5. ทุกครั้งที่แก้โค้ดเสร็จ → commit + deploy อัตโนมัติ (ยกเว้น backend)
</important>
