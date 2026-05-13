// src/lib/treatmentDisplayResolvers.js
//
// Phase 27.0 (2026-05-14) — live-resolve doctor/assistant/branch display
// names for treatment doc readers. Mirrors Rule O productName live-resolve
// pattern (V46/AV24) — fallback chain LIVE map → cached name → empty.
// NEVER returns a raw doc ID (DOC-/STAFF-/BR- prefix).
//
// Pure JS. Branch-blind. No Firestore deps — caller passes pre-built Maps.
//
// Audit: AV42 (audit-anti-vibe-code) — every component displaying treatment
// doctorId / assistants[].id / branchId MUST use these helpers. Direct reads
// (detail.doctorId || / a.name || a.id) outside this module are forbidden.

function _trimmedString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Live-resolve a doctor display name.
 *
 * Fallback chain:
 *   1. doctorMap.get(doctorId).name (LIVE — from listDoctors({includeHidden:true}))
 *   2. cachedName (denormalized snapshot from save time)
 *   3. ''  — caller renders '—' or placeholder
 *
 * NEVER returns the raw doctorId. NEVER returns object/undefined/null.
 */
export function resolveDoctorDisplayName(doctorId, doctorMap, cachedName) {
  if (doctorId && doctorMap && typeof doctorMap.get === 'function') {
    const live = _trimmedString(doctorMap.get(String(doctorId))?.name);
    if (live) return live;
  }
  return _trimmedString(cachedName);
}

/**
 * Live-resolve a single assistant entry. Cross-collection lookup: try
 * doctorMap first (doctors CAN be assistants), then staffMap, then cache.
 *
 * Accepts entry as either string id or {id, name?}.
 */
export function resolveAssistantDisplayName(entry, doctorMap, staffMap) {
  if (!entry) return '';
  const id = typeof entry === 'string' ? entry : entry?.id;
  if (id) {
    if (doctorMap && typeof doctorMap.get === 'function') {
      const live = _trimmedString(doctorMap.get(String(id))?.name);
      if (live) return live;
    }
    if (staffMap && typeof staffMap.get === 'function') {
      const live = _trimmedString(staffMap.get(String(id))?.name);
      if (live) return live;
    }
  }
  if (entry && typeof entry === 'object') {
    return _trimmedString(entry.name);
  }
  return '';
}

/**
 * Live-resolve a branch display name.
 */
export function resolveBranchDisplayName(branchId, branchMap, cachedName) {
  if (branchId && branchMap && typeof branchMap.get === 'function') {
    const live = _trimmedString(branchMap.get(String(branchId))?.name);
    if (live) return live;
  }
  return _trimmedString(cachedName);
}

/**
 * Compose a comma-joined display string for assistant list.
 * Empty resolutions filtered out.
 */
export function resolveAssistantsDisplay(assistants, doctorMap, staffMap) {
  if (!Array.isArray(assistants)) return '';
  return assistants
    .map((a) => resolveAssistantDisplayName(a, doctorMap, staffMap))
    .filter(Boolean)
    .join(', ');
}
