// ─── System Config Client — Phase 16.3 (2026-04-29) ───────────────────────
//
// Single doc `clinic_settings/system_config` storing clinic-wide admin
// settings: per-tab visibility overrides, defaults (deposit %, points-per-
// baht, date range), feature flags. Audit-emit on every write per Q3-A.
//
// Permission gate: NEW key `system_config_management` (Q2-C) + admin bypass
// via existing `request.auth.token.admin == true` claim.
//
// Schema:
//   tabOverrides: { [tabId]: { hidden?, requires?, adminOnly? } }
//   defaults:     { depositPercent, pointsPerBaht, dateRange }
//   featureFlags: { allowNegativeStock }
//   _updatedBy, _updatedAt, _version
//
// Default values (used when doc/field missing — preserves install-time
// behaviour matching Phase 15.7 negative-stock contract):
//   allowNegativeStock = true
//   depositPercent = 0
//   pointsPerBaht = 0
//   dateRange = '30d'
//   tabOverrides = {} (empty — TAB_PERMISSION_MAP defaults apply)

import { doc, getDoc, onSnapshot, writeBatch, serverTimestamp, collection } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { getTask } from './scheduledTasksRegistry.js';

const SYSTEM_CONFIG_DOC_ID = 'system_config';

const VALID_DATE_RANGES = Object.freeze(['7d', '30d', '90d', '180d', '1y', 'mtd', 'qtd', 'ytd']);

// V86-followup-2 (2026-05-18 EOD+10) — Universal red glow + intensity
// multiplier. Admin tunes via SystemSettingsTab "เอฟเฟกต์แสงเรือง" section.
export const V86_GLOW_DEFAULTS = Object.freeze({
  enabled: true,
  c1: '#dc2626',           // red-600 border + outer ring
  c2: '#ef4444',           // red-500 halo
  intensityPercent: 45,    // 0-150 (% — 0=off, 100=full V86 v1 baseline, 150=brighter)
});

const V86_HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * V86-followup-2 — validate + normalize a v86Glow patch. Returns a fully-
 * populated v86Glow object with defaults filled for any missing/invalid fields.
 * Used by both validateSystemConfigPatch (error reporting) and as a standalone
 * helper for callers that want auto-fixed values.
 */
export function validateV86Glow(patch) {
  const out = { ...V86_GLOW_DEFAULTS };
  if (typeof patch?.enabled === 'boolean') out.enabled = patch.enabled;
  if (typeof patch?.c1 === 'string' && V86_HEX_RE.test(patch.c1)) {
    out.c1 = patch.c1.toLowerCase();
  }
  if (typeof patch?.c2 === 'string' && V86_HEX_RE.test(patch.c2)) {
    out.c2 = patch.c2.toLowerCase();
  }
  if (Number.isFinite(patch?.intensityPercent)) {
    out.intensityPercent = Math.max(0, Math.min(150, Math.round(patch.intensityPercent)));
  }
  return out;
}

// ─── Infra Health (2026-07-19) — alert-routing config for the daily
// infra-health-sweep cron. Enable/threshold live on scheduledTasks
// .infraHealthSweep (the existing rail); this key holds ONLY routing:
// LINE targets ({branchId,lineUserId,label} — per-branch OA constraint) +
// the staff-chat card branch. Cap 5 targets.
export const INFRA_HEALTH_DEFAULTS = Object.freeze({
  lineTargets: Object.freeze([]),
  staffChatBranchId: '',
});
const INFRA_MAX_LINE_TARGETS = 5;

/** Normalize an infraHealth slice — drops malformed targets, caps at 5. */
export function normalizeInfraHealth(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const targets = (Array.isArray(r.lineTargets) ? r.lineTargets : [])
    .filter(t => t && typeof t === 'object'
      && typeof t.branchId === 'string' && t.branchId
      && typeof t.lineUserId === 'string' && t.lineUserId)
    .slice(0, INFRA_MAX_LINE_TARGETS)
    .map(t => ({
      branchId: t.branchId,
      lineUserId: t.lineUserId,
      label: typeof t.label === 'string' ? t.label.slice(0, 60) : '',
    }));
  return {
    lineTargets: targets,
    staffChatBranchId: typeof r.staffChatBranchId === 'string' ? r.staffChatBranchId : '',
  };
}

export const SYSTEM_CONFIG_DEFAULTS = Object.freeze({
  tabOverrides: {},
  // 2026-06-02 — per-scheduled-task { enabled, params } (Scheduled Tasks tab).
  // Empty = every task runs with its hardcoded core defaults (preserves behaviour).
  scheduledTasks: {},
  defaults: Object.freeze({
    depositPercent: 0,
    pointsPerBaht: 0,
    dateRange: '30d',
  }),
  featureFlags: Object.freeze({
    // Phase 15.7 contract: ALWAYS-ON until admin explicitly disables.
    // Q4-C semantic: false → block NEW negatives, repay existing.
    allowNegativeStock: true,
  }),
  v86Glow: V86_GLOW_DEFAULTS,
  infraHealth: INFRA_HEALTH_DEFAULTS,
});

function basePath() {
  return ['artifacts', appId, 'public', 'data'];
}

function systemConfigDoc() {
  return doc(db, ...basePath(), 'clinic_settings', SYSTEM_CONFIG_DOC_ID);
}

function adminAuditCol() {
  return collection(db, ...basePath(), 'be_admin_audit');
}

/**
 * Pure helper: merge a Firestore-fetched system_config doc with defaults.
 * Missing fields fall through to SYSTEM_CONFIG_DEFAULTS so callers always
 * receive a fully-populated object.
 *
 * @param {object|null} raw Firestore doc data (null if missing)
 * @returns {object} fully-populated config
 */
export function mergeSystemConfigDefaults(raw) {
  const r = raw || {};
  return {
    tabOverrides: r.tabOverrides && typeof r.tabOverrides === 'object' ? r.tabOverrides : {},
    scheduledTasks: (r.scheduledTasks && typeof r.scheduledTasks === 'object' && !Array.isArray(r.scheduledTasks)) ? r.scheduledTasks : {},
    defaults: {
      depositPercent: typeof r.defaults?.depositPercent === 'number'
        ? r.defaults.depositPercent
        : SYSTEM_CONFIG_DEFAULTS.defaults.depositPercent,
      pointsPerBaht: typeof r.defaults?.pointsPerBaht === 'number'
        ? r.defaults.pointsPerBaht
        : SYSTEM_CONFIG_DEFAULTS.defaults.pointsPerBaht,
      dateRange: VALID_DATE_RANGES.includes(r.defaults?.dateRange)
        ? r.defaults.dateRange
        : SYSTEM_CONFIG_DEFAULTS.defaults.dateRange,
    },
    featureFlags: {
      allowNegativeStock: typeof r.featureFlags?.allowNegativeStock === 'boolean'
        ? r.featureFlags.allowNegativeStock
        : SYSTEM_CONFIG_DEFAULTS.featureFlags.allowNegativeStock,
    },
    // V86-followup-2 — validateV86Glow auto-fills missing/invalid fields
    v86Glow: validateV86Glow(r.v86Glow),
    // 2026-07-19 — infra-health alert routing (auto-normalized)
    infraHealth: normalizeInfraHealth(r.infraHealth),
    _updatedBy: r._updatedBy || '',
    _updatedAt: r._updatedAt || null,
    _version: typeof r._version === 'number' ? r._version : 0,
  };
}

/**
 * One-shot getter. Returns merged config (defaults applied) or null on
 * permission error. Used by non-React callers (e.g. _deductOneItem in
 * backendClient.js for the negative-stock toggle gate).
 */
export async function getSystemConfig() {
  try {
    const snap = await getDoc(systemConfigDoc());
    return mergeSystemConfigDefaults(snap.exists() ? snap.data() : null);
  } catch (e) {
    console.warn('[getSystemConfig] read failed; returning defaults:', e?.message);
    return mergeSystemConfigDefaults(null);
  }
}

/**
 * Real-time listener. Calls `onChange(config)` on every doc change and
 * once on initial subscribe. Returns unsubscribe.
 */
export function listenToSystemConfig(onChange, onError) {
  return onSnapshot(systemConfigDoc(), (snap) => {
    onChange(mergeSystemConfigDefaults(snap.exists() ? snap.data() : null));
  }, onError || (() => {}));
}

/**
 * Pure helper: validate a partial patch before writing. Returns first error
 * message or null when valid.
 */
export function validateSystemConfigPatch(patch) {
  if (!patch || typeof patch !== 'object') return 'patch must be an object';
  if (patch.tabOverrides !== undefined) {
    if (typeof patch.tabOverrides !== 'object' || Array.isArray(patch.tabOverrides)) {
      return 'tabOverrides must be an object';
    }
    for (const [tabId, override] of Object.entries(patch.tabOverrides)) {
      if (!override || typeof override !== 'object') {
        return `tabOverrides.${tabId} must be an object`;
      }
      if (override.hidden !== undefined && typeof override.hidden !== 'boolean') {
        return `tabOverrides.${tabId}.hidden must be boolean`;
      }
      if (override.adminOnly !== undefined && typeof override.adminOnly !== 'boolean') {
        return `tabOverrides.${tabId}.adminOnly must be boolean`;
      }
      if (override.requires !== undefined) {
        if (!Array.isArray(override.requires)) {
          return `tabOverrides.${tabId}.requires must be an array`;
        }
        for (const k of override.requires) {
          if (typeof k !== 'string' || !k) {
            return `tabOverrides.${tabId}.requires must contain non-empty strings`;
          }
        }
      }
    }
  }
  if (patch.defaults !== undefined) {
    if (typeof patch.defaults !== 'object' || Array.isArray(patch.defaults)) {
      return 'defaults must be an object';
    }
    if (patch.defaults.depositPercent !== undefined) {
      const n = Number(patch.defaults.depositPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return 'defaults.depositPercent must be 0-100';
      }
    }
    if (patch.defaults.pointsPerBaht !== undefined) {
      const n = Number(patch.defaults.pointsPerBaht);
      if (!Number.isFinite(n) || n < 0) {
        return 'defaults.pointsPerBaht must be ≥ 0';
      }
    }
    if (patch.defaults.dateRange !== undefined && !VALID_DATE_RANGES.includes(patch.defaults.dateRange)) {
      return `defaults.dateRange must be one of: ${VALID_DATE_RANGES.join('|')}`;
    }
  }
  if (patch.featureFlags !== undefined) {
    if (typeof patch.featureFlags !== 'object' || Array.isArray(patch.featureFlags)) {
      return 'featureFlags must be an object';
    }
    if (patch.featureFlags.allowNegativeStock !== undefined &&
        typeof patch.featureFlags.allowNegativeStock !== 'boolean') {
      return 'featureFlags.allowNegativeStock must be boolean';
    }
  }
  // V86-followup-2 — v86Glow validation
  if (patch.v86Glow !== undefined) {
    if (typeof patch.v86Glow !== 'object' || Array.isArray(patch.v86Glow)) {
      return 'v86Glow must be an object';
    }
    if (patch.v86Glow.enabled !== undefined && typeof patch.v86Glow.enabled !== 'boolean') {
      return 'v86Glow.enabled must be boolean';
    }
    if (patch.v86Glow.c1 !== undefined &&
        (typeof patch.v86Glow.c1 !== 'string' || !V86_HEX_RE.test(patch.v86Glow.c1))) {
      return 'v86Glow.c1 must be 7-char hex string (e.g. #dc2626)';
    }
    if (patch.v86Glow.c2 !== undefined &&
        (typeof patch.v86Glow.c2 !== 'string' || !V86_HEX_RE.test(patch.v86Glow.c2))) {
      return 'v86Glow.c2 must be 7-char hex string (e.g. #ef4444)';
    }
    if (patch.v86Glow.intensityPercent !== undefined) {
      const n = Number(patch.v86Glow.intensityPercent);
      if (!Number.isFinite(n) || n < 0 || n > 150) {
        return 'v86Glow.intensityPercent must be 0-150';
      }
    }
  }
  // 2026-07-19 — infraHealth alert-routing validation
  if (patch.infraHealth !== undefined) {
    if (typeof patch.infraHealth !== 'object' || Array.isArray(patch.infraHealth)) {
      return 'infraHealth must be an object';
    }
    if (patch.infraHealth.staffChatBranchId !== undefined
        && typeof patch.infraHealth.staffChatBranchId !== 'string') {
      return 'infraHealth.staffChatBranchId must be a string';
    }
    if (patch.infraHealth.lineTargets !== undefined) {
      if (!Array.isArray(patch.infraHealth.lineTargets)) {
        return 'infraHealth.lineTargets must be an array';
      }
      if (patch.infraHealth.lineTargets.length > INFRA_MAX_LINE_TARGETS) {
        return `infraHealth.lineTargets must have at most ${INFRA_MAX_LINE_TARGETS} entries`;
      }
      for (const t of patch.infraHealth.lineTargets) {
        if (!t || typeof t !== 'object' || Array.isArray(t)
            || typeof t.branchId !== 'string' || !t.branchId
            || typeof t.lineUserId !== 'string' || !t.lineUserId) {
          return 'infraHealth.lineTargets entries must be {branchId, lineUserId} non-empty strings';
        }
        if (t.label !== undefined && typeof t.label !== 'string') {
          return 'infraHealth.lineTargets label must be a string';
        }
      }
    }
  }
  // 2026-06-02 — scheduledTasks: known-task check + per-param min/max from registry
  if (patch.scheduledTasks !== undefined) {
    if (typeof patch.scheduledTasks !== 'object' || Array.isArray(patch.scheduledTasks)) {
      return 'scheduledTasks must be an object';
    }
    for (const [taskId, cfg] of Object.entries(patch.scheduledTasks)) {
      const task = getTask(taskId);
      if (!task) return `scheduledTasks.${taskId} is unknown`;
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
        return `scheduledTasks.${taskId} must be an object`;
      }
      if (cfg.enabled !== undefined && typeof cfg.enabled !== 'boolean') {
        return `scheduledTasks.${taskId}.enabled must be boolean`;
      }
      if (cfg.params !== undefined) {
        if (typeof cfg.params !== 'object' || Array.isArray(cfg.params)) {
          return `scheduledTasks.${taskId}.params must be an object`;
        }
        for (const [pk, pv] of Object.entries(cfg.params)) {
          const spec = task.params.find((p) => p.key === pk);
          if (!spec) return `scheduledTasks.${taskId}.params.${pk} is unknown`;
          const n = Number(pv);
          if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
            return `scheduledTasks.${taskId}.params.${pk} must be ${spec.min}-${spec.max}`;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Pure helper: compute a list of changed-field paths between before + after
 * configs. Used by audit emit to record exactly what mutated.
 */
export function computeChangedFields(before, after) {
  const out = [];
  const b = before || {};
  const a = after || {};

  // tabOverrides — diff per-key
  const bTab = b.tabOverrides || {};
  const aTab = a.tabOverrides || {};
  const tabKeys = new Set([...Object.keys(bTab), ...Object.keys(aTab)]);
  for (const k of tabKeys) {
    const beforeStr = JSON.stringify(bTab[k] || null);
    const afterStr = JSON.stringify(aTab[k] || null);
    if (beforeStr !== afterStr) out.push(`tabOverrides.${k}`);
  }

  // defaults
  for (const k of ['depositPercent', 'pointsPerBaht', 'dateRange']) {
    if ((b.defaults || {})[k] !== (a.defaults || {})[k]) {
      out.push(`defaults.${k}`);
    }
  }

  // featureFlags
  for (const k of ['allowNegativeStock']) {
    if ((b.featureFlags || {})[k] !== (a.featureFlags || {})[k]) {
      out.push(`featureFlags.${k}`);
    }
  }

  // V86-followup-2 — v86Glow per-field diff
  for (const k of ['enabled', 'c1', 'c2', 'intensityPercent']) {
    if ((b.v86Glow || {})[k] !== (a.v86Glow || {})[k]) {
      out.push(`v86Glow.${k}`);
    }
  }

  // 2026-07-19 — infraHealth diff (deep-equal per field)
  for (const k of ['lineTargets', 'staffChatBranchId']) {
    if (JSON.stringify((b.infraHealth || {})[k] ?? null) !== JSON.stringify((a.infraHealth || {})[k] ?? null)) {
      out.push(`infraHealth.${k}`);
    }
  }

  // 2026-06-02 — scheduledTasks per-task diff (deep-equal each task slice)
  const bST = b.scheduledTasks || {}, aST = a.scheduledTasks || {};
  for (const k of new Set([...Object.keys(bST), ...Object.keys(aST)])) {
    if (JSON.stringify(bST[k] ?? null) !== JSON.stringify(aST[k] ?? null)) {
      out.push(`scheduledTasks.${k}`);
    }
  }

  return out;
}

/**
 * Save a partial patch + emit an audit doc atomically (writeBatch).
 *
 * Q3-A: every write writes a `be_admin_audit/system-config-{ts}` doc with
 * the changed-fields list + before/after values. Audit doc is created in
 * the SAME batch as the system_config update so they commit atomically.
 *
 * Q2-C: write gate is enforced at firestore.rules layer
 * (admin OR perm_system_config_management claim). Client-side this fn
 * does NOT pre-check the claim — Firestore rejects with PERMISSION_DENIED
 * which the caller surfaces.
 *
 * @param {object} args
 * @param {object} args.patch — partial system_config (only changed fields)
 * @param {string} args.executedBy — caller email or uid (for audit denorm)
 * @param {string} [args.reason] — optional admin-supplied reason
 * @returns {Promise<{auditId: string, version: number}>}
 */
export async function saveSystemConfig({ patch, executedBy, reason } = {}) {
  if (!patch || typeof patch !== 'object') {
    throw new Error('saveSystemConfig: patch object required');
  }
  if (!executedBy || typeof executedBy !== 'string') {
    throw new Error('saveSystemConfig: executedBy (email or uid) required');
  }
  const validationErr = validateSystemConfigPatch(patch);
  if (validationErr) throw new Error(`saveSystemConfig: ${validationErr}`);

  // Read current state for audit before/after.
  const beforeMerged = await getSystemConfig();

  // Build the next state (defaults-merged) by applying patch over the current.
  const nextRaw = {
    tabOverrides: patch.tabOverrides !== undefined ? patch.tabOverrides : beforeMerged.tabOverrides,
    scheduledTasks: patch.scheduledTasks !== undefined ? patch.scheduledTasks : beforeMerged.scheduledTasks,
    defaults: {
      ...beforeMerged.defaults,
      ...(patch.defaults || {}),
    },
    featureFlags: {
      ...beforeMerged.featureFlags,
      ...(patch.featureFlags || {}),
    },
    // V86-followup-2 — normalize v86Glow via validator on merge
    v86Glow: patch.v86Glow !== undefined
      ? validateV86Glow({ ...beforeMerged.v86Glow, ...patch.v86Glow })
      : beforeMerged.v86Glow,
    // 2026-07-19 — infraHealth (normalized on merge, same pattern as v86Glow)
    infraHealth: patch.infraHealth !== undefined
      ? normalizeInfraHealth({ ...beforeMerged.infraHealth, ...patch.infraHealth })
      : beforeMerged.infraHealth,
  };
  const afterMerged = mergeSystemConfigDefaults(nextRaw);

  const changedFields = computeChangedFields(beforeMerged, afterMerged);
  if (changedFields.length === 0) {
    // No-op save — short-circuit. Don't pollute audit log with empty diffs.
    return { auditId: null, version: beforeMerged._version || 0, noop: true };
  }

  const ts = Date.now();
  const auditId = `system-config-${ts}`;
  const nextVersion = (beforeMerged._version || 0) + 1;

  const batch = writeBatch(db);
  batch.set(systemConfigDoc(), {
    ...nextRaw,
    _updatedBy: executedBy,
    _updatedAt: serverTimestamp(),
    _version: nextVersion,
  }, { merge: true });

  batch.set(doc(adminAuditCol(), auditId), {
    auditId,
    action: 'system_config_update',
    executedBy,
    executedAt: serverTimestamp(),
    changedFields,
    beforeValues: changedFields.reduce((acc, path) => {
      acc[path] = readPath(beforeMerged, path);
      return acc;
    }, {}),
    afterValues: changedFields.reduce((acc, path) => {
      acc[path] = readPath(afterMerged, path);
      return acc;
    }, {}),
    reason: typeof reason === 'string' ? reason.slice(0, 500) : '',
    version: nextVersion,
  });

  await batch.commit();
  return { auditId, version: nextVersion };
}

/**
 * Pure helper: dotted-path read with safe null-walk. Used internally by
 * saveSystemConfig to capture before/after slices for the audit doc.
 */
export function readPath(obj, path) {
  if (!obj || !path) return null;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return cur === undefined ? null : cur;
}

export const __SYSTEM_CONFIG_VALID_DATE_RANGES = VALID_DATE_RANGES;
