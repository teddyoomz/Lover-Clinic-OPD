---
name: audit-firebase-admin-security
description: Audit Firebase Admin SDK usage in serverless endpoints (api/admin/**). Enforces token verification, admin gating, self-protection, input validation, and credential hygiene. Required on any change to api/admin/** or addition of new privileged server endpoints. Phase 12.0+.
user-invocable: true
allowed-tools: "Read, Grep, Glob, Bash"
---

# Audit: Firebase Admin SDK security

## Context

**Scope**: `api/admin/**/*.js` — privileged serverless endpoints that use `firebase-admin` SDK (Auth / Firestore privileged). Created Phase 12.0 (2026-04-20) as infrastructure for Phase 12.1 be_staff/be_doctors CRUD.

**NOT @dev-only** (rule H-bis): `api/admin/*` is production infrastructure. Unlike `api/proclinic/*` (dev-only scraper bridge) these endpoints serve real production traffic — creating Firebase Auth users for real staff/doctors.

**Rule E exception**: Backend UI (`src/components/backend/**`) IS allowed to call `/api/admin/*`. The Rule E restriction targets `/api/proclinic/*` (write-back to ProClinic) — `/api/admin/*` writes to OUR Firebase project only. Document this exception in `03-stack.md` Backend section.

**Credentials**: Admin SDK private key is HIGHLY sensitive. Exfiltration = full Firebase project compromise (create admin users, bypass all rules, read all Firestore, delete everything).

## Invariants (run on any change to api/admin/**)

### FA1 — Admin SDK private key NEVER in source
```bash
grep -rn "FIREBASE_ADMIN_PRIVATE_KEY" api/ src/ | grep -v "process.env"
grep -rnE "BEGIN (RSA )?PRIVATE KEY" api/ src/
```
**Expected**: empty for both. Only `process.env.FIREBASE_ADMIN_PRIVATE_KEY` reference allowed. Any literal `-----BEGIN PRIVATE KEY-----` in committed code = **CRITICAL violation** — rotate the key immediately, remove from history.

### FA2 — Admin SDK init gated on env vars present
```bash
grep -rn "initializeApp\s*(\s*{" api/admin/
```
Expected: every `initializeApp(` call is preceded by env-var existence check OR throws descriptive error. Bare `initializeApp()` without env-check = config-drift landmine (silent auth bypass if env missing).

### FA3 — Every api/admin/** endpoint verifies token via Admin SDK verifyIdToken
```bash
grep -rLE "verifyIdToken|verifyAdminToken" api/admin/*.js
```
**Expected**: empty (every .js file in api/admin/ root calls one of these). Endpoints without token verification = **CRITICAL** — publicly callable privileged ops.

### FA4 — verifyIdToken called with checkRevoked=true
```bash
grep -rnE "verifyIdToken\s*\([^,)]+,\s*false\s*\)" api/admin/
grep -rnE "verifyIdToken\s*\([^,)]+\)" api/admin/ | grep -v "true"
```
**Expected**: empty. `verifyIdToken(token)` without second arg = default `checkRevoked=false` = disabled users can still call admin endpoints until their tokens expire (up to 1 hour). For admin endpoints, always pass `true`.

### FA5 — Admin gate requires custom claim OR bootstrap UID (not just "any authed user")
```bash
grep -rnE "verifyAdminToken|isBootstrapAdmin|customClaims?\?\.admin|\.admin\s*===?\s*true" api/admin/
```
**Expected**: every endpoint checks `decoded.admin === true` OR `isBootstrapAdmin(uid)`. An endpoint that only checks `decoded.uid` (any signed-in user) = **CRITICAL** privilege escalation bug.

### FA6 — Self-protection: no delete-self, no revoke-own-admin (unless bootstrap)
```bash
grep -rnE "deleteUser|setCustomUserClaims" api/admin/users.js
```
Read each call site. For `deleteUser`: there MUST be a check rejecting `uid === caller.uid`. For `setCustomUserClaims` that REMOVES admin: there MUST be a check allowing this only when caller is in bootstrap UID list OR the target is someone else. Missing = admin can accidentally lock themselves out OR malicious script can nuke all admins.

### FA7 — Input validation for email + password + uid on mutation paths
```bash
grep -rnE "createUser|updateUser" api/admin/
```
Every call site must validate:
- `email`: regex check (`EMAIL_RE` in users.js)
- `password`: min length (Firebase minimum 6, prefer 8+)
- `uid`: non-empty trimmed string
Unvalidated input = Firebase SDK throws generic errors → 500s leak internal state.

### FA8 — Error messages do not leak service-account info
```bash
grep -rnE "privateKey|clientEmail|projectId" api/admin/
```
Every reference to these fields must be in init code only. Never echoed in error messages. `res.json({ error: err.message })` can leak `err.message` containing env values if Admin SDK throws on bad cert. Sanitize or map to generic "admin service misconfigured".

### FA9 — CORS on api/admin/** restricted or token-gated
```bash
grep -rn "Access-Control-Allow-Origin" api/admin/
```
`*` is acceptable ONLY because endpoint is token-gated (Bearer ID token required). Any endpoint without token gate + `*` CORS = **CRITICAL**. If endpoint uses `*`, there MUST be a `verifyAdminToken`/`verifyIdToken` call in the same handler.

### FA10 — Tests exist + cover adversarial cases
```bash
ls tests/api-admin-*.test.js
grep -cE "^\s*it\(" tests/api-admin-users.test.js
```
Every `api/admin/*.js` endpoint must have a `tests/api-admin-<name>.test.js` file with ≥ 15 tests covering: missing token, invalid token, non-admin caller, input validation, self-protection cases, CORS + method + action dispatch. Phase 12.0 ships 28 tests — new endpoints should aim for similar depth.

### FA11 — No `firebase-admin` import in client (src/**)
```bash
grep -rn "from ['\"]firebase-admin" src/
```
**Expected**: empty. `firebase-admin` is server-only. Client uses `firebase/auth` + `firebase/firestore` (public SDK). `firebase-admin` in client bundle = private key exposure risk AND bundle bloat.

### FA12 — Admin SDK init singleton (no re-init thrash on Vercel hot instances)
```bash
grep -rnE "getApps\s*\(\s*\)\s*\.length|getApp\s*\(" api/admin/
```
Expected: at least one call site. The singleton pattern prevents `FirebaseAppError: app/duplicate-app` on Vercel warm invocations.

## Severity mapping

- **CRITICAL** (FA1, FA3, FA5, FA9 without token-gate) — private key leak, unauthenticated privileged endpoint, broken admin gate. Block release. Rotate credentials.
- **HIGH** (FA4, FA6, FA11) — disabled-user bypass window, admin lockout, client bundle leak. Fix before release.
- **MEDIUM** (FA2, FA7, FA8, FA12) — silent misconfig, error-message leaks, init thrash.
- **LOW** (FA10) — test coverage gap.

## Priority

P0 — any new `api/admin/*` endpoint must pass FA1-FA12 before ship. Privileged endpoints without audit = CRITICAL Vercel-wide security risk (one misauth endpoint = breach the whole Firebase project).

## Integration

- Runs inside `/audit-all` Tier 5 (hygiene / anti-vibe-code).
- Run on every Edit/Write touching `api/admin/**` (PostToolUse hook candidate).
- Runs on every new privileged endpoint addition.

## Env vars (reference — set in Vercel project settings)

- `FIREBASE_ADMIN_PROJECT_ID` — optional (defaults to `loverclinic-opd-4c39b`)
- `FIREBASE_ADMIN_CLIENT_EMAIL` — **required** (service account email, e.g. `firebase-adminsdk-xxx@loverclinic-opd-4c39b.iam.gserviceaccount.com`)
- `FIREBASE_ADMIN_PRIVATE_KEY` — **required** (paste with `\n` literal; code unescapes to real newlines)
- `FIREBASE_ADMIN_BOOTSTRAP_UIDS` — optional comma-separated UID list; these UIDs are treated as admin even without custom claim (seeding + recovery)

Setup workflow:
1. Firebase Console → Project Settings → Service Accounts → Generate new private key → download JSON
2. `vercel env add FIREBASE_ADMIN_CLIENT_EMAIL` → paste `client_email`
3. `vercel env add FIREBASE_ADMIN_PRIVATE_KEY` → paste `private_key` (include `\n` escapes literally — app unescapes)
4. Optionally `vercel env add FIREBASE_ADMIN_BOOTSTRAP_UIDS` → paste `uid1,uid2` (get UIDs from Firebase Auth users list)
5. Redeploy so new env vars attach

After first admin created + `grantAdmin` claim set, remove bootstrap UIDs (reduce attack surface).
