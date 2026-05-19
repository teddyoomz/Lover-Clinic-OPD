---
updated_at: "2026-05-19 — V96+V97+V98+V99+V100 stack LIVE · session-end (exhaustive TFP wiring verification)"
status: "🚀 V100 LIVE. master = prod. Combined deploy complete. All audit batch + comprehensive e2e + safeNumber defense + adversarial stress GREEN."
branch: "master"
last_commit: "feat(V100): safeNumber defense-in-depth + AV87 + V99 reverify (0 real bugs)"
tests: "V93 35 + V94 41 + V95 21 + V96 15 + V98 29 + V99-iter2 164 + V100 safeNumber-defense = 305 audit/e2e cumulative GREEN · V8x 158/158 GREEN · 0 real bugs"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "V100 LIVE — lover-clinic-rg0by1t0a-... aliased 2026-05-19"
firestore_rules_version: "unchanged (idempotent since V82-Phone — V96-V100 zero rule changes)"
storage_rules_version: "unchanged"
---

# Active Context

## 🚀 V100 LIVE — Complete TFP CORE verification stack

End of session 2026-05-19. User authorized via "deploy แล้ว session end เลย".

## Full stack live

V84+V85+AV82+V86 v1+V86-followup-2+V87+V88+V89+V90+V91+V92 + V93/V94/V95 audit batch + **V96** (TFP create-mode deleteField fix) + **V97** (filler-unit data cleanup) + **V98** (wallet+deposit wiring verify) + **V99** (randomized adversarial stress) + **V100** (safeNumber + AV87)

## What this session shipped

- **V96** (5 commits): TFP `status: deleteField()` gated on isEdit + backendClient `setDoc({merge:true})` defense-in-depth + AV86 + 15 source-grep + 54 admin-SDK e2e
- **V97** (4 scripts): Rule M data fix — วันเพ็ญ Neuramis-ครั้ง removed + 53 be_courses master `courseProducts[].unit` "" → "CC"
- **V98** (1 script · 29 e2e): wallet topup/fetch/deduct/refund + deposit create/fetch/applyPartial/applyFull + insufficient gates + conservation
- **V99 iter2** (1 script · 164 PASS): 100 randomized scenarios × 4 branches (3 real + 1 future) × 4 save modes × 4 course types + 50 concurrent + 14 adversarial buckets
- **V100** (3 files): NEW `api/_lib/safeNumber.js` (safeNumber/strictNumber/isFiniteNumber) + AV87 invariant + backup-manager-list.js migration

## Verification matrix

| Dimension | Coverage |
|---|---|
| Real branches | นครราชสีมา + พระราม 3 + ทดลอง 1 |
| Future branch | TEST-V99-BR-NEW (zero-master provisioned) |
| Save modes | staff-create + staff-edit + doctor + vitals |
| Course types | regular + บุฟเฟต์ + เหมาตามจริง + pick-at-treatment |
| Concurrency | 50 parallel saves — 0 errors, 0 races |
| Conservation invariants | stock/course/wallet/deposit/branch-isolation — all held |
| Treatment ↔ Sale links | bidirectional verified |
| Wallet roundtrip | topup → fetch → deduct → insufficient gate → refund — conservation OK |
| Deposit roundtrip | create → fetch → applyPartial → applyFull → status transitions → insufficient gate |
| Adversarial | NaN/Infinity (safeNumber defense) · Unicode NFC/NFD · NUL · 10K-char · deleted refs · concurrent same-wallet race · empty-master · cross-branch · duplicate-id · promo multiplier · over-deduct |

## Audit docs on real prod (institutional memory)

- `be_admin_audit/v96-tfp-full-save-chain-1779182566085-ef99635e` (54/54)
- `be_admin_audit/v97-filler-unit-fix-1779184463108-336ba780` (verify)
- `be_admin_audit/v98-wallet-deposit-tfp-wiring-1779184776834-d259532c` (29/29)
- `be_admin_audit/v99-randomized-adversarial-stress-*` (multiple iterations · final 164/164)

## Deploy

- Vercel: `lover-clinic-rg0by1t0a-teddyoomz-4523s-projects.vercel.app` → aliased `https://lover-clinic-app.vercel.app` HTTP 200 ✓
- Firebase rules + storage: ✓ idempotent (V96-V100 zero rule changes)
- Probe-Deploy-Probe 4/4 IDENTICAL pre+post

## Outstanding

- **L1 hands-on user verification** (Rule Q V66 gold standard) — ลอง TFP save + deposit + wallet + course in real browser
- **V96 Playwright spec** committed but navigation timeout on test fixture (future regression artifact)
- Filler-unit drift catcher (optional): add a Phase 14 audit invariant for unit="CC" on filler products at master save time
- 17× backend-menu-d V90 test-debt (pre-existing — separate session)
- v81 emulator Java-gated skip (intentional)
