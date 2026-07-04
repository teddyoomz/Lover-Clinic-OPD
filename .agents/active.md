---
updated_at: "2026-07-05 — recall-reason timeline + VIP system + staffchat TFP/intake/assessment cards SHIPPED local (NOT deployed); bug-hunt loop converged R1(8 fixed)→R2(0)."
status: "Feature batch complete on master (ahead of prod 49032ef0). TFP chat cards LIVE-GATED on firestore.rules deploy. Awaiting explicit 'deploy'."
branch: "master"
last_commit: "fix: bug-hunt R1 — 8 confirmed findings (recall/vip/staffchat-cards batch)"
tests: "full vitest 17146/17146 · 0 real fail (1 perf-budget flake passes isolated). Build clean. New-bank targeted 143+25/0."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "49032ef0 (2026-07-04) — this batch NOT yet deployed"
firestore_rules_version: "LOCAL CHANGE staged: be_staff_chat_messages create gains narrow tfp-vitals/tfp-doctor allowlist (probe #18). NOT deployed."
---

# Active — 2026-07-05 — recall reason + VIP + staffchat cards (6 features) + hunt loop

## State
- Spec ①-⑥ SHIPPED on master, NOT deployed: ① recall reason timeline ทุก surface ② VIP toggle + gold name + 👑 badge ~25 internal surfaces real-time (VipProvider single listener) ③④ TFP vitals/doctor saves → staff-chat system cards + เปิดบันทึกการรักษา deep link ⑤ intake card ดูข้อมูลรับเข้า (shared OpdIntakeDetailBody) ⑥ followup card ดูแบบประเมิน (EDDetailModal reuse).
- Adversarial loop CONVERGED: R1 workflow (28 agents) → 12 confirmed → deduped 8 real bugs ALL FIXED (z-9600 tier / assessLoaded gate / SystemModalHost eviction-survival / synthetic reverse-map / TFP edit branchId / useResolvedTheme / badge-sibling / useEscToClose stack). R2 inline (5 lenses, subagent limit hit → inline per user) → 0 findings.
- Rule Q: VIP L2 ALL PASS real prod (diag-vip-l2.mjs); TFP-card L2 pre-deploy ALL PASS (diag-tfp-chat-card-l2.mjs — DENIED-as-expected proves live-gating + intake/followup unforgeable). AV201/202/203 in both SKILL.md copies (SY1 green).

## Next action
- Await explicit "deploy" → V15 combined (vercel --prod + firebase deploy --only firestore:rules) + Probe-Deploy-Probe probes 1,5,6,7,8,9,12,15,16,17,**18** + rerun diag-tfp-chat-card-l2.mjs (auto post-deploy mode: staff create SUCCESS + forge DENIED + dup DENIED).
- Post-deploy user L1: (1) TFP บันทึกซักประวัติ/บันทึกแพทย์ → card โผล่ใน staff chat สาขานั้น + ปุ่มเปิด TFP ถูกใบ (2) VIP toggle ใน CDV → ชื่อทองทุกที่ทันที (3) การ์ด intake/followup กดดูข้อมูล/แบบประเมินได้เหนือ chat panel (มือถือด้วย).

## Outstanding user-triggered actions
- "deploy" for this batch (rules + frontend รวมกัน — TFP cards เงียบ non-fatal จนกว่า rules จะขึ้น).
