---
updated_at: "2026-05-22 EOD+1 — Lightbox race FINAL (round-5: no-gate) + Chart templates persistence rewrite. Both DEPLOYED. Open bug: 'Property detail contains an invalid nested entity' on TFP save after using newly-uploaded chart — diag script written, NOT YET RUN (user invoked /session-end before repro)."
status: "prod LIVE 1e88ed11 (chart-templates rewrite). NEW BUG INVESTIGATING — next chat: run scripts/diag-chart-template-save-shape.mjs to pinpoint Firestore field path."
branch: "master"
last_commit: "1e88ed11 — feat(chart-templates): persistence rewrite per-doc+Storage+lock+per-device sort"
tests: "47/0 targeted (chart-template-persistence + lightbox-cached-image-race + staff-chat-any-file); build 3.20s; full suite not run this session"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "1e88ed11 — vercel --prod aliased + firebase deploy --only firestore:rules,storage (P-D-P 8/8 incl. NEW probe #14 chart-templates)"
firestore_rules_version: "deployed 2026-05-22 EOD+1 — NEW be_chart_templates (read isSignedIn / write isClinicStaff) + chart-templates/{file=**} Storage (isSignedIn read / staff write / image-only 10MB)"
---

# Active Context

## State
- prod = `1e88ed11` LIVE. Two features shipped this session: (1) lightbox prev/next race-immune via REMOVING the opacity gate entirely (round-5 architectural after rounds 1-4 chased loadedSrc race through onLoad/ref/useEffect/decode/Set — see checkpoint), (2) chart templates persistence rewrite — was writing to `pc_chart_templates` with no matching rule → silent permission-denied + 1MB doc cap → uploads vanished. Now per-doc in `be_chart_templates` + Firebase Storage + lock field + localStorage sort.
- NEW bug reported, investigating: after uploading new chart template via "+ เพิ่ม" → using it in TFP chart → click ยืนยันการรักษา → Firestore error "Property detail contains an invalid nested entity". Node repro of `chartEntryForPersist + clean` showed CLEAN output (template field dropped, no Timestamps). So bug is NOT in detail.charts[] as initially hypothesized. Source unknown. Diag script ready to run.
- 47/0 targeted tests + build clean; 8 deploy probes 8/8.

## What this session shipped
- Lightbox cached-image race — rounds 1→5: ref callback / useEffect+complete / decode() Promise / Set-of-loaded-URLs / FINAL **no-state-no-gate** architecture (just two stacked `<img>`: blurred thumb keyed by idx behind + full keyed by idx front; browser handles paint). Tests `tests/staff-chat-lightbox-cached-image-race.test.jsx` (R5 contract + 200-round rapid-click stress).
- Chart template persistence rewrite — NEW `be_chart_templates` collection (per-template docs) + Firebase Storage `chart-templates/{id}.{ext}` for image bytes + `locked: true` for built-in seeds + localStorage `lover-chart-template-order-v1` for per-device sort. `src/components/ChartTemplateSelector.jsx` rewritten. `firestore.rules` + `storage.rules` extended. Tests `tests/chart-template-persistence.test.jsx`. Rule B probe list extended (probe #14).
- Detail in `.agents/sessions/2026-05-22-lightbox-r5-and-chart-templates.md`.

## Next action (NEXT CHAT — continue /systematic-debugging the new bug)
1. **Run** `node scripts/diag-chart-template-save-shape.mjs` — reads recent be_chart_templates docs (built-in vs upload sample) + simulates full TFP save with a chart entry using uploaded template + does a real setDoc to a TEST-DIAG-CHART-* doc + cleans up. Will pinpoint the EXACT Firestore field path that throws "invalid nested entity".
2. Once root cause is known: ONE-class-of-bug fix (Rule P 7-step). Likely candidates: (a) `entry.template = canvasTemplate` field with Firestore Timestamp instances flowing through React state into some OTHER save path I haven't found, (b) CORS/canvas-taint side-effect for Storage-URL templates that produces a weird fabricJson, (c) something in the save flow downstream of chartEntryForPersist that re-attaches the template. Need diag to know.
3. Add regression test + commit + deploy.

## Outstanding user-triggered actions
- Hands-on confirm round-5 lightbox feels instant after rapid clicks (deployed but only my Chromium-headless harness verified — user's real device is the gold standard).
- Hands-on test chart template persistence: upload via "+ เพิ่ม" → close+reopen TFP → image still there; built-ins locked-by-default; per-device sort persists.
- The "invalid nested entity" bug is the active blocker — first action next chat.
