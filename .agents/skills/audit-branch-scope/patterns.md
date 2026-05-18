# patterns.md — concrete BS-1..BS-8 grep recipes

Each invariant has a Bash recipe (preferred — `git grep` works identically on Windows + Linux + macOS) and a PowerShell variant for sessions where the user is on a Windows-only shell. The Vitest bank in `tests/audit-branch-scope.test.js` automates all 8; the recipes below are for interactive investigation.

---

## BS-1 — UI imports only from scopedDataLayer.js

### Bash
```bash
git grep -nE "from ['\"](\\.\\./)+lib/backendClient" -- \
  "src/components/" "src/pages/" "src/hooks/" "src/contexts/" \
  | while IFS= read -r line; do
      file="${line%%:*}"
      grep -q "audit-branch-scope:" "$file" 2>/dev/null || echo "$line"
    done
```

### PowerShell
```powershell
git grep -nE "from ['\""](\.\./)+lib/backendClient" -- "src/components/" "src/pages/" "src/hooks/" "src/contexts/" |
  ForEach-Object {
    $file = ($_ -split ':', 2)[0]
    $content = Get-Content -Path $file -Raw -ErrorAction SilentlyContinue
    if ($content -notmatch "audit-branch-scope:") { $_ }
  }
```

**Expected**: empty. Annotated files (MasterDataTab, BackendDashboard, the 7 report tabs, SmartAudienceTab) are filtered out by the `audit-branch-scope:` annotation check.

**If non-empty**: the new file is importing backendClient directly. Either (a) migrate the import to `scopedDataLayer.js` so branchId is auto-injected, or (b) if the file legitimately needs cross-branch data, add a file-header annotation (see SKILL.md table).

---

## BS-2 — No master_data/* reads in feature code

### Bash
```bash
git grep -nE "['\"]master_data/" -- "src/components/" "src/pages/" "src/lib/" \
  | grep -v MasterDataTab \
  | grep -v "audit-branch-scope: BS-2"
```

### PowerShell
```powershell
git grep -nE "['\""]master_data/" -- "src/components/" "src/pages/" "src/lib/" |
  Where-Object { $_ -notmatch "MasterDataTab" -and $_ -notmatch "audit-branch-scope: BS-2" }
```

**Expected**: empty (or the legacy migrator + backendClient internal lookups, which the Vitest bank filters by file path).

**If non-empty**: Rule H-quater violation — feature code MUST read from `be_*` collections via scopedDataLayer, not the `master_data/*` legacy pool. Replace with the appropriate `be_*` lister (e.g. `listProducts`, `listCourses`, `listStaff`).

---

## BS-3 — getAllMasterDataItems removed from feature code

### Bash
```bash
git grep -nE "getAllMasterDataItems\(" -- \
  "src/components/" "src/pages/" "src/hooks/" "src/contexts/" \
  | grep -v MasterDataTab \
  | grep -v "audit-branch-scope: BS-3" \
  | grep -vE "^[^:]+:[0-9]+:[[:space:]]*//"
```

### PowerShell
```powershell
git grep -nE "getAllMasterDataItems\(" -- "src/components/" "src/pages/" "src/hooks/" "src/contexts/" |
  Where-Object {
    $_ -notmatch "MasterDataTab" -and
    $_ -notmatch "audit-branch-scope: BS-3" -and
    $_ -notmatch ":\s*//"
  }
```

**Expected**: empty.

**If non-empty**: BSA Task 7 lock violated. `getAllMasterDataItems` reads the universal master_data pool (branch-blind). Replace with `listProducts/listCourses/listStaff/listDoctors` per type via scopedDataLayer, OR add `// audit-branch-scope: BS-3 dev-only` if the call legitimately needs dev-only sync data.

---

## BS-4 — Branch-scoped listenTo* wrapped in useBranchAwareListener

### Bash
```bash
for fn in listenToAppointmentsByDate listenToAllSales listenToHolidays listenToScheduleByDay; do
  echo "--- $fn ---"
  git grep -nE "${fn}\(" -- "src/components/" "src/pages/" \
    | while IFS= read -r line; do
        file="${line%%:*}"
        # Comment line — skip
        case "$line" in *:[0-9]*://*) continue;; esac
        # File uses the hook — OK
        grep -q "useBranchAwareListener" "$file" 2>/dev/null && continue
        # File has the annotation — OK
        grep -q "audit-branch-scope: listener-direct" "$file" 2>/dev/null && continue
        echo "$line"
      done
done
```

### PowerShell
```powershell
$listeners = @('listenToAppointmentsByDate','listenToAllSales','listenToHolidays','listenToScheduleByDay')
foreach ($fn in $listeners) {
  Write-Host "--- $fn ---"
  git grep -nE "${fn}\(" -- "src/components/" "src/pages/" |
    Where-Object {
      $file = ($_ -split ':', 2)[0]
      $content = Get-Content -Path $file -Raw -ErrorAction SilentlyContinue
      $isComment = $_ -match ':\s*//'
      $hasHook = $content -match "useBranchAwareListener"
      $hasAnnot = $content -match "audit-branch-scope: listener-direct"
      -not ($isComment -or $hasHook -or $hasAnnot)
    }
}
```

**Expected**: empty per listener.

**If non-empty**: branch-scoped listener missing both hook + annotation. Either wire through `useBranchAwareListener` (preferred — auto re-subscribes on branch switch) or annotate `// audit-branch-scope: listener-direct — <fn> uses positional args incompatible with hook` if the listener's argument shape is positional and incompatible with the hook contract.

---

## BS-5 — branch-collection-coverage.test.js exists with COLLECTION_MATRIX

### Bash
```bash
test -f tests/branch-collection-coverage.test.js && \
  grep -q "COLLECTION_MATRIX" tests/branch-collection-coverage.test.js && \
  echo "BS-5 OK" || echo "BS-5 FAIL"
```

### PowerShell
```powershell
if ((Test-Path tests/branch-collection-coverage.test.js) -and
    (Select-String -Path tests/branch-collection-coverage.test.js -Pattern "COLLECTION_MATRIX" -Quiet)) {
  Write-Host "BS-5 OK"
} else { Write-Host "BS-5 FAIL" }
```

**Expected**: `BS-5 OK`.

**If FAIL**: the COLLECTION_MATRIX is the single source-of-truth for which Firestore collections are branch-scoped, branch-spread, branch-future, or global. A new collection added without a classification entry will silently violate BSA. Re-add the matrix.

---

## BS-6 — branch-scope-flow-simulate.test.js exists (Task 10)

### Bash
```bash
test -f tests/branch-scope-flow-simulate.test.js \
  && echo "BS-6 OK" \
  || echo "BS-6 PENDING (Task 10)"
```

### PowerShell
```powershell
if (Test-Path tests/branch-scope-flow-simulate.test.js) {
  Write-Host "BS-6 OK"
} else { Write-Host "BS-6 PENDING (Task 10)" }
```

**Expected after Task 10 ships**: `BS-6 OK`. Until then, the audit soft-passes with a TODO note.

---

## BS-7 — scopedDataLayer universal re-exports point to raw.X

### Bash
```bash
for n in listStaff listDoctors listBranches getCustomer listAudiences listMembershipTypes; do
  if grep -qE "export\s+const\s+${n}\s*=\s*raw\.${n}\b" src/lib/scopedDataLayer.js \
     || grep -qE "export\s+const\s+${n}\s*=\s*\([^)]*\)\s*=>\s*raw\.${n}" src/lib/scopedDataLayer.js; then
    echo "BS-7 ${n} OK"
  else
    echo "BS-7 ${n} FAIL — universal re-export missing or wrapped"
  fi
done
```

### PowerShell
```powershell
$names = @('listStaff','listDoctors','listBranches','getCustomer','listAudiences','listMembershipTypes')
$src = Get-Content src/lib/scopedDataLayer.js -Raw
foreach ($n in $names) {
  $re1 = "export\s+const\s+${n}\s*=\s*raw\.${n}\b"
  $re2 = "export\s+const\s+${n}\s*=\s*\([^)]*\)\s*=>\s*raw\.${n}"
  if ($src -match $re1 -or $src -match $re2) { "BS-7 ${n} OK" } else { "BS-7 ${n} FAIL" }
}
```

**Expected**: all OK.

**If FAIL**: a universal collection got accidentally wrapped with branchId injection. Universal collections (Staff, Doctors, Branches, Audiences, MembershipTypes, Customer) must NOT receive branchId from scopedDataLayer — they're cross-branch by design. Revert to raw re-export.

---

## BS-8 — _resolveBranchIdForWrite call sites preserved

### Bash
```bash
COUNT=$(git grep -nE "_resolveBranchIdForWrite" src/lib/backendClient.js | wc -l)
if [ "$COUNT" -ge 17 ]; then
  echo "BS-8 OK ($COUNT lines)"
else
  echo "BS-8 FAIL — only $COUNT lines, expected ≥17. A writer lost its branchId stamp?"
fi
```

### PowerShell
```powershell
$count = (git grep -nE "_resolveBranchIdForWrite" src/lib/backendClient.js | Measure-Object -Line).Lines
if ($count -ge 17) { "BS-8 OK ($count lines)" } else { "BS-8 FAIL — only $count lines" }
```

**Expected**: `BS-8 OK (19 lines)` (1 def + 17 call sites + 1 JSDoc reference as of commit 131e378).

**If FAIL**: a Phase BS or BSA writer is missing its `branchId: _resolveBranchIdForWrite(data),` stamp. The writer's setDoc body should set this field on every create. Without it, the doc lands without a branchId → fails to show in any branch view.

---

## Run all 8 in one shot

```bash
npm test -- --run tests/audit-branch-scope.test.js
```

Expected: 8 pass (or 7 + 1 soft-pass for BS-6 until Task 10).

---

## Investigation tips

| Symptom | Likely violator |
|---|---|
| Branch switch leaves stale data on a tab | BS-1 (direct backendClient import bypassing scopedDataLayer's branch injection) OR BS-4 (listener stuck on old branch) |
| New record doesn't appear in any branch | BS-8 (writer missing branchId stamp) |
| Same data shows across all branches when it shouldn't | BS-7 (universal export accidentally wrapped) OR scopedDataLayer call-path lost the branchId |
| Old master_data items showing despite being deleted | BS-2 OR BS-3 (feature code reading legacy pool) |
| New collection's branch behavior is undocumented | BS-5 (missing COLLECTION_MATRIX entry) |
| Layer 2/3 has no end-to-end test | BS-6 (waiting on Task 10) |

## Cross-references

- BSA architecture: commits `dabd8e8` (Layer 2) + `df48944` (Layer 3) + `2c236d2` (UI migration) + `131e378` (listener migration)
- Phase BS: commits `aecf3a1` + `cf897f6` (multi-branch foundation, V20 lessons)
- Iron-clad H-quater: feature code reads `be_*` only, never `master_data/*`
- Companion audits: `/audit-master-data-ownership` (data ownership rule), `/audit-backend-firestore-only` (Rule E)
