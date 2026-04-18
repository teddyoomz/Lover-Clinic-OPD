<important if="writing ANY new code, refactoring, or reviewing a change before commit">
## Anti-Vibe-Code (iron-clad, set 2026-04-19)

**AI ฉลาด แต่คนใช้ต้อง "ฉลาดกว่า" AI.** ความเร็ววันนี้ห้ามกลายเป็นภาระวันหน้า.
3 อันตรายของ vibe-code ที่โปรเจคนี้ต้องไม่ติดกับ — ทั้งปัจจุบันและอนาคต.

### 1. Shared-first, NEVER hardcode-first

**Rule of 3**: ถ้าเห็น pattern เดียวกันปรากฏ ≥ 3 ที่ → extract เป็น shared ทันที. 2 ที่ OK. 3 ที่เป็น bug รออยู่.

**Before writing ANY new helper/component/constant**:
1. Grep for existing one in `src/utils.js`, `src/lib/**`, `src/components/**`.
2. ถ้ามี → reuse. ถ้าคล้ายแต่ไม่ตรง → ขยาย API ของตัวเดิม (ด้วย backward-compat props).
3. ถ้ายังไม่มี → สร้าง 1 ที่ เดียวที่ re-exportable. ห้ามคัดลอก inline.

**Canonical shared modules** (update this list when you add one):
- `src/utils.js` — `bangkokNow`, `thaiTodayISO`, `thaiNowMinutes`, `thaiYearMonth`, `hexToRgb`, `formatBangkokTime`, `THAI_MONTHS`, `YEARS_BE/CE`, `defaultFormData`
- `src/components/DateField.jsx` — every date input (no local wrappers, no raw `<input type="date">`)
- `src/lib/scheduleFilterUtils.js` — `shouldBlockScheduleSlot`, `shouldBlockDoctorSlot`, `isSlotBooked`, `getDoctorRangesForDate`
- `src/lib/courseUtils.js` — course qty parse/deduct
- `src/lib/stockUtils.js` — stock primitives
- `src/lib/financeUtils.js` — `fmtMoney`, `calcMembershipExpiry`, `parseQtyString`

**Red flags**:
- Two files with the same 20+ line function copied verbatim.
- "I'll just inline it here since it's small" — NO. Extract.
- Component with props nearly identical to an existing one → rename and merge.

### 2. Security by default, not by afterthought

**Hardcoded secrets**: never in `src/` or `api/`. ProClinic / Firebase / FB Page tokens live in Vercel env vars only. `firebaseConfig` in `firebase.js` is the one exception (Firebase public API key — safe per Firebase security model, but Firestore rules must still gate actual reads).

**Firestore security rules** (`firestore.rules`):
- Default `allow read, write: if false;` — whitelist explicitly.
- World-readable docs (patient-link-by-token, schedule-link-by-token) must NOT store internal admin identifiers. User bug 2026-04-19: `createdBy: user.uid` leaked admin UID into public schedule doc. Removed.
- No collection-wide `allow read: if true` without token/session gate.

**Firebase Storage** (`storage.rules`):
- Patient images, treatment photos, signatures, charts → auth-required rules. Never `allow read, write: if true`.
- When adding a new uploadable asset type, write the rule BEFORE the UI.

**Tokens and identifiers**:
- Patient-link / schedule-link / any customer-facing URL token → `crypto.getRandomValues(new Uint8Array(16))` (128 bits). Never `Math.random().toString(36)`.
- Firebase user ids (`user.uid`) are internal — never write them into docs readable by unauthenticated callers.

**Credentials in commit history**: if you accidentally commit an API key, rotate the key immediately — `git` history is effectively permanent on public repos.

### 3. Lean schema — no premature Firestore collections

**No new collection until all three are true**:
1. An existing feature needs to READ it.
2. An existing or imminent feature needs to WRITE it.
3. Its shape is wrong or too big to live inside an existing doc.

**Prefer denormalizing on existing docs** over creating a parallel collection. Most clinic data fits on the customer/sale/treatment/deposit/appointment docs we already have.

**Document size** up to 1 MB is fine. Only split when a doc genuinely approaches that, AND the split is needed for transactional access or listener scoping.

**When in doubt**: don't add the collection. Add the field. A query like "aggregate all X by Y" doesn't need a dedicated collection — client-side filtering of an existing list handles 99 % of clinic-scale queries.

**Red flags**:
- Planning a `be_*_log` collection when an audit trail on the parent doc would do.
- Making a collection to store "what the UI will need later" — build it when you need it.
- Copying a collection for "one more variant" — extend the existing doc instead.

### Enforcement

- **Audit skill**: `/audit-anti-vibe-code` grep-checks for these patterns. Runs as part of `/audit-all`.
- **Workflow hook**: the `PostToolUse` hook on Edit/Write reminds you of the Rule of 3 after every change.
- **Session**: the `feedback_anti_vibe_code.md` memory keeps the rule across sessions; `.claude/rules/08-anti-vibe-code.md` is this file.

### Meta

**This rule itself obeys Rule of 3.** Before adding a 4th pillar, see if one of the three covers it. Before creating a parallel rule file, see if this one should be extended.
</important>
