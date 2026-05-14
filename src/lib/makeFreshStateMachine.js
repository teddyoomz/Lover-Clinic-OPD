// ─── Shared 3-step Make-Fresh state machine (Rule C1 extraction) ──────────
// Used by:
//   - src/components/backend/MakeFreshModal.jsx (branch scope)
//   - src/components/backend/CentralMakeFreshModal.jsx (central stock scope)
//
// 2026-05-15 — extracted from MakeFreshModal local state per Q3=B brainstorming
// decision. Both modals now thin wrappers (~80 LOC each) consuming this hook.
//
// State machine phases:
//   idle → previewing → preview-ready → confirming → backing-up → wiping → done | error

import { useState, useCallback } from 'react';

/**
 * @param {Object} opts
 * @param {string} opts.exportEndpoint — POST URL for backup-export
 * @param {string} opts.makeFreshEndpoint — POST URL for make-fresh wipe
 * @param {Object} opts.bucketDefaults — { bucketId: boolean } initial check state
 * @param {(url: string, body: Object) => Promise<Response>} opts.fetcher — wraps auth + JSON
 * @param {Object} opts.scopeBody — scope-specific request fields (e.g. {branchId} or {warehouseIds})
 * @param {string} opts.confirmName — string user must type verbatim to confirm
 */
export function useMakeFreshStateMachine({
  exportEndpoint,
  makeFreshEndpoint,
  bucketDefaults,
  fetcher,
  scopeBody,
  confirmName,
}) {
  const [checkedBuckets, setCheckedBuckets] = useState(bucketDefaults);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [autoBackupRef, setAutoBackupRef] = useState(null);
  const [bodyHash, setBodyHash] = useState(null);
  const [result, setResult] = useState(null);

  const tickedBucketIds = Object.keys(checkedBuckets).filter((id) => checkedBuckets[id]);
  const matches = confirmText.trim() === String(confirmName || '').trim();

  const handleBucketToggle = useCallback((id) => {
    setCheckedBuckets((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handlePreview = useCallback(async () => {
    if (tickedBucketIds.length === 0) return;
    setPhase('previewing');
    setError('');
    try {
      const res = await fetcher(exportEndpoint, {
        ...scopeBody,
        bucketIds: tickedBucketIds,
        dryRun: true,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'preview failed');
      setPreview(json);
      setPhase('preview-ready');
    } catch (e) {
      setError(e.message || 'preview failed');
      setPhase('error');
    }
  }, [exportEndpoint, fetcher, scopeBody, tickedBucketIds]);

  const handleRun = useCallback(async () => {
    if (!matches) return;
    setPhase('backing-up');
    setError('');
    try {
      // Phase 1: auto-pre-fresh backup (emits bodyHash)
      const r1 = await fetcher(exportEndpoint, {
        ...scopeBody,
        bucketIds: tickedBucketIds,
        isAutoPreFresh: true,
      });
      const j1 = await r1.json();
      if (!r1.ok || !j1.ok) throw new Error(j1.error || 'auto-backup failed');
      setAutoBackupRef(j1.storagePath);
      setBodyHash(j1.bodyHash);

      // Phase 2: make-fresh (server verifies hash before deleting)
      setPhase('wiping');
      const r2 = await fetcher(makeFreshEndpoint, {
        ...scopeBody,
        bucketIds: tickedBucketIds,
        autoBackupRef: j1.storagePath,
        expectedBodyHash: j1.bodyHash,
      });
      const j2 = await r2.json();
      if (!r2.ok || !j2.ok) throw new Error(j2.error || 'make-fresh failed');

      setResult(j2);
      setPhase('done');
    } catch (e) {
      setError(e.message || 'failed');
      setPhase('error');
    }
  }, [matches, exportEndpoint, makeFreshEndpoint, fetcher, scopeBody, tickedBucketIds]);

  return {
    phase,
    checkedBuckets,
    advancedOpen,
    confirmText,
    preview,
    autoBackupRef,
    bodyHash,
    result,
    error,
    matches,
    tickedBucketIds,
    handleBucketToggle,
    setAdvancedOpen,
    setConfirmText,
    handlePreview,
    handleRun,
    setPhase,
    setPreview,
  };
}
