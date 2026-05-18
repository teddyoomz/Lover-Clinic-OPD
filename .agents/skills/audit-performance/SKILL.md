---
name: audit-performance
description: "Audit performance concerns: N+1 Firestore queries, listener limits, pagination on long lists, memo/bundle/lazy-load. Use when UI feels slow or Firestore cost spikes."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Performance

## Invariants (P1–P8)

### P1 — No N+1 `getDoc` in loops
**Why**: Firestore cost + latency. Use `getDocs(query)` or `Promise.all` with batched reads.
**Grep**: `for.*await.*getDoc|\\.map\\(.*await getDoc` in backendClient.

### P2 — Bounded listener count per page (< 10)
**Grep**: `onSnapshot` per file — count across components on same page (AdminDashboard has ~8 listeners).

### P3 — Pagination on long lists
**Targets**: buy modal (50+ load-more ✓), appointment history, movement log, course index (must scroll, not flatten), chat history (7-day auto-delete ✓).

### P4 — `useMemo` on 1000+ LOC components' expensive derivations
**Targets**: SaleTab, TreatmentFormPage, CustomerDetailView, DepositPanel.

### P5 — Backend bundle not pulled into patient bundle
**Check**: `src/pages/PatientForm.jsx` + `PatientDashboard.jsx` imports no `backend/*`.
**Grep**: `from.*backend/` in patient-facing pages.

### P6 — Images (signatures, charts) lazy-loaded
**Grep**: `<img` in print templates / signatures — each with `loading="lazy"` or intersection observer.

### P7 — No sync localStorage writes on hot paths
**Grep**: `localStorage.setItem` — should be debounced or off-main-thread.

### P8 — Bulk operations chunked
**Why**: Firestore batch limit is 500 writes; exceeding throws.
**Target**: cloneAllCustomers should chunk to 500-write batches.

## How to run
1. Grep patterns above.
2. For P1, manually trace hot paths (e.g., listStockMovements in audit modals).
3. For P5, run `npm run build` and inspect bundle splits (Backend should be lazy chunk).

## Priority
P1 and P8 = cost class. P2 = memory class.
