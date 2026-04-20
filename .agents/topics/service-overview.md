# Service Overview — LoverClinic OPD

## What is this project?
OPD (out-patient department) clinic management system for LoverClinic — appointment booking, treatment recording, sale/receipt issuing, deposit + wallet + membership + points, stock management, chat inbox (FB Messenger + LINE), and a reporting suite. Replicates the ProClinic SaaS UI + adds OUR Firestore-backed backend so data ownership is ours (rule H).

## Where is it running?
- **Local dev**: `http://localhost:5173` (Vite dev server — `npm run dev`)
- **Production**: https://lover-clinic-app.vercel.app
- **Preview**: `npm run preview` after `npm run build`
- **Firebase project**: `loverclinic-opd-4c39b`
- **Staging ProClinic**: `https://trial.proclinicth.com` (dev-only seed source per rule H-bis)

## How to run locally?
```bash
# Dev server (HMR, warmup-optimized for admin + backend tabs)
npm run dev

# Unit + integration tests (Vitest 4.1.3, 2850 tests)
npm test -- --run

# Production build (catches Vite OXC parser issues etc)
npm run build

# E2E (Playwright)
npm run test:e2e

# Regen .agents/index/repo-tree.md (Windows; Linux/macOS use python3)
python scripts/update_repo_context.py --max-depth 4
```

## Important things to know

### Stack
- **React 19.2** + **Vite 8.0** + **Tailwind 3.4** + **Firebase 12.11** (Firestore + Auth + FCM) + **firebase-admin 13.7** (server-side)
- **Vercel Serverless** for `/api/proclinic/*` (dev-only scraper bridge per rule H-bis), `/api/webhook/*` (FB + LINE chat), `/api/admin/*` (Firebase Admin SDK — Phase 12.0+)

### Database
- Firestore root path: `artifacts/{appId}/public/data/` where `{appId} = 'loverclinic-opd-4c39b'`
- **be_*** collections = OUR data (canonical; edit via backend UI)
- **pc_*** collections = ProClinic mirrors for features like chat conversation history (runtime, production)
- **master_data/{type}/items/*** = dev-only seed from ProClinic scraper (Phase 11.8 / H-bis; stripped before prod release)
- **opd_sessions/*** = patient intake sessions (frontend-side, production)

### Key env vars (Vercel)
- `PROCLINIC_ORIGIN` / `PROCLINIC_EMAIL` / `PROCLINIC_PASSWORD` — ProClinic trial login (dev-only seed)
- `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` — service account for `/api/admin/users` (Phase 12.0+)
- `FIREBASE_ADMIN_BOOTSTRAP_UIDS` — optional comma-separated UID list granted admin without custom claim
- Firebase client config: inline in `src/firebase.js` (public API key, rule-gated in Firestore)

### Deploy flow
- `git push origin master` — every commit, no exceptions
- `vercel --prod` — **user must authorize THIS TURN every time** (no rolling permission; V4/V7/V8 precedent)
- `firebase deploy --only firestore:rules` — **Probe-Deploy-Probe 4 endpoints** per rule B (V1 + V9 precedent). Probes: chat_conversations POST, pc_appointments PATCH, clinic_settings/proclinic_session PATCH, clinic_settings/proclinic_session_trial PATCH.
- `firebase deploy --only functions` — Cloud Function (FCM push on patient intake)

## Canonical references

Source of truth per topic — read these first when working on related code:

| Topic | File |
|-------|------|
| Iron-clad rules (A-H + H-bis) | `.claude/rules/00-session-start.md` |
| Character + workflow + tool decision tree | `.claude/rules/00-session-start.md` |
| Bug-Blast Revert + Probe-Deploy-Probe + Anti-Vibe-Code | `.claude/rules/01-iron-clad.md` |
| Commit + push + deploy checklist | `.claude/rules/02-workflow.md` |
| Firestore / Vite / React / Backend / ProClinic / Chat gotchas | `.claude/rules/03-stack.md` |
| Thai UI culture (no red on names/HN, dd/mm/yyyy, 24hr) | `.claude/rules/04-thai-ui.md` |
| Codebase file + function map | `CODEBASE_MAP.md` |
| Cross-session memory index | `C:\Users\oomzp\.claude\projects\F--LoverClinic-app\memory\MEMORY.md` |
| Current session state | `.agents/active.md` |
| Latest master plan | Memory: `project_proclinic_full_parity_audit_v5.md` |

## Phase status (2026-04-20)

- **Phase 1-6**: DONE (customer clone, patient intake, treatment form, appointment calendar, sale, stock)
- **Phase 7-9**: DONE (finance = deposit/wallet/points/membership, stock advanced, marketing = promo/coupon/voucher)
- **Phase 10**: DONE (10 report tabs + daily-revenue + staff-sales)
- **Phase 11**: DONE (master-data suite — 6 CRUD tabs + H-bis strip list)
- **Phase 12**: DONE this session (11 sub-tasks, +477 tests → 2850 total; Firebase Admin SDK + be_staff/doctors/products/courses/customers/deposits/bank/expense_cat/expense/online_sales/sale_insurance_claims/sale validators + P&L + payment summary reports + adapter + debug delete)
- **Phase 13**: pending (quotations, staff schedules, DF groups, DF report, permission tab-gate wiring, treatment validator — ~23h)
- **Phase 14-16**: pending (documents, central stock conditional, polish)

## Audit skills (24 registered; run via `/audit-<name>` or `/audit-all`)

Tier 1 backend integrity: money-flow, stock-flow, cascade-logic
Tier 2 data integrity: referential-integrity, firestore-correctness, clone-sync, api-layer
Tier 3 UI: treatment-form, appointment-calendar, react-patterns, ui-cultural-a11y, performance
Tier 4 frontend: frontend-timezone, frontend-links, frontend-forms
Tier 5 hygiene: anti-vibe-code, backend-firestore-only, firebase-admin-security (12.0), finance-completeness (12.10)
Tier 6 legal: privacy-pdpa
Tier 7 reports: reports-accuracy
Plus: master-data-ownership (11.8d), reports-accuracy (Phase 10)
