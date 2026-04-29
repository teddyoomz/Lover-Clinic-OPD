// ─── Audience Validation — Phase 16.1 (2026-04-30) ──────────────────────────
// Recursive shape validator for Smart Audience rule trees.
//
// V14 lock — `validateAudienceRule` rejects any node with `undefined` params
// (Firestore setDoc would otherwise reject the write, surfacing as a UI
// error). Also rejects unknown predicate types and malformed params.
//
// Returns null when valid; returns [path, message] tuple on first failure.

import { PREDICATE_TYPES } from './audienceRules.js';

const MAX_TREE_DEPTH = 6;             // sanity cap; UI defaults to ≤3
const MAX_CHILDREN_PER_GROUP = 50;    // UI keeps it low; this is a guard
const MAX_VALUES_PER_LIST = 200;      // for branch.branchIds + source.values

const VALID_GROUP_OPS = new Set(['AND', 'OR']);
const VALID_LASTVISIT_OPS = new Set(['>=', '<=']);
const VALID_BOUGHT_KINDS = new Set(['product', 'course']);
const VALID_GENDERS = new Set(['M', 'F']);

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Walk an arbitrary value and return true if any leaf (or its enumerable
 * descendant) is `undefined`. Used as a final pass before persisting a rule
 * to Firestore (V14 invariant: setDoc rejects `undefined` field values).
 */
export function hasUndefinedLeaves(value) {
  if (value === undefined) return true;
  if (value === null) return false;
  if (Array.isArray(value)) {
    for (const v of value) {
      if (hasUndefinedLeaves(v)) return true;
    }
    return false;
  }
  if (typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (hasUndefinedLeaves(value[k])) return true;
    }
    return false;
  }
  return false;
}

function failTuple(path, message) {
  return [path, message];
}

/** Validate predicate params per type. Returns null when valid; tuple on fail. */
function validatePredicateParams(type, params, path) {
  if (!isPlainObject(params)) return failTuple(`${path}.params`, 'params ต้องเป็น object');
  switch (type) {
    case 'age-range': {
      for (const k of ['min', 'max']) {
        const v = params[k];
        if (v == null) continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 150) {
          return failTuple(`${path}.params.${k}`, `age-range.${k} ต้องอยู่ในช่วง 0-150`);
        }
      }
      // Use NaN for missing endpoints — `Number(null)` is 0 which would
      // wrongly fire the min>max guard for open-ended ranges.
      const min = params.min == null ? NaN : Number(params.min);
      const max = params.max == null ? NaN : Number(params.max);
      if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        return failTuple(`${path}.params`, 'age-range: min > max');
      }
      if ((params.min == null) && (params.max == null)) {
        return failTuple(`${path}.params`, 'age-range ต้องระบุ min หรือ max อย่างน้อยหนึ่งค่า');
      }
      return null;
    }
    case 'gender': {
      const v = String(params.value || '').trim().toUpperCase();
      if (!VALID_GENDERS.has(v)) return failTuple(`${path}.params.value`, 'gender.value ต้องเป็น M หรือ F');
      return null;
    }
    case 'branch': {
      if (!Array.isArray(params.branchIds)) return failTuple(`${path}.params.branchIds`, 'branch.branchIds ต้องเป็น array');
      if (params.branchIds.length === 0) return failTuple(`${path}.params.branchIds`, 'branch.branchIds ว่าง');
      if (params.branchIds.length > MAX_VALUES_PER_LIST) {
        return failTuple(`${path}.params.branchIds`, `branch.branchIds เกิน ${MAX_VALUES_PER_LIST}`);
      }
      for (const id of params.branchIds) {
        if (typeof id !== 'string' || !id.trim()) {
          return failTuple(`${path}.params.branchIds`, 'branch.branchIds ต้องเป็น string ที่ไม่ว่าง');
        }
      }
      return null;
    }
    case 'source': {
      if (!Array.isArray(params.values)) return failTuple(`${path}.params.values`, 'source.values ต้องเป็น array');
      if (params.values.length === 0) return failTuple(`${path}.params.values`, 'source.values ว่าง');
      if (params.values.length > MAX_VALUES_PER_LIST) {
        return failTuple(`${path}.params.values`, `source.values เกิน ${MAX_VALUES_PER_LIST}`);
      }
      for (const v of params.values) {
        if (typeof v !== 'string' || !v.trim()) {
          return failTuple(`${path}.params.values`, 'source.values ต้องเป็น string ที่ไม่ว่าง');
        }
      }
      return null;
    }
    case 'bought-x-in-last-n': {
      const kind = String(params.kind || '').trim();
      if (!VALID_BOUGHT_KINDS.has(kind)) {
        return failTuple(`${path}.params.kind`, 'bought.kind ต้องเป็น product หรือ course');
      }
      const refId = String(params.refId || '').trim();
      if (!refId) return failTuple(`${path}.params.refId`, 'bought.refId ว่าง');
      const months = Number(params.months);
      if (!Number.isFinite(months) || months <= 0 || months > 120) {
        return failTuple(`${path}.params.months`, 'bought.months ต้องอยู่ในช่วง 1-120');
      }
      return null;
    }
    case 'spend-bracket': {
      for (const k of ['min', 'max']) {
        const v = params[k];
        if (v == null) continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) {
          return failTuple(`${path}.params.${k}`, `spend-bracket.${k} ต้องไม่ติดลบ`);
        }
      }
      // Use NaN for missing endpoints (see age-range note above).
      const min = params.min == null ? NaN : Number(params.min);
      const max = params.max == null ? NaN : Number(params.max);
      if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        return failTuple(`${path}.params`, 'spend-bracket: min > max');
      }
      if ((params.min == null) && (params.max == null)) {
        return failTuple(`${path}.params`, 'spend-bracket ต้องระบุ min หรือ max อย่างน้อยหนึ่งค่า');
      }
      return null;
    }
    case 'last-visit-days': {
      const op = String(params.op || '').trim();
      if (!VALID_LASTVISIT_OPS.has(op)) {
        return failTuple(`${path}.params.op`, 'last-visit.op ต้องเป็น >= หรือ <=');
      }
      const days = Number(params.days);
      if (!Number.isFinite(days) || days < 0 || days > 36500) {
        return failTuple(`${path}.params.days`, 'last-visit.days ต้องอยู่ในช่วง 0-36500');
      }
      return null;
    }
    case 'has-unfinished-course': {
      if (params.value !== true && params.value !== false) {
        return failTuple(`${path}.params.value`, 'has-unfinished-course.value ต้องเป็น boolean');
      }
      return null;
    }
    default:
      return failTuple(`${path}.type`, `unknown predicate type: ${type}`);
  }
}

/**
 * Recursive shape validator. Path uses dot notation:
 *   'rule.children[0].params.min'
 *
 * @param {object} node
 * @param {string} path
 * @param {number} depth
 * @returns {[string, string] | null}
 */
function validateNode(node, path = 'rule', depth = 0) {
  if (depth > MAX_TREE_DEPTH) return failTuple(path, `tree depth > ${MAX_TREE_DEPTH}`);
  if (!isPlainObject(node)) return failTuple(path, 'node ต้องเป็น object');
  if (node.kind === 'group') {
    if (!VALID_GROUP_OPS.has(node.op)) {
      return failTuple(`${path}.op`, 'group.op ต้องเป็น AND หรือ OR');
    }
    if (!Array.isArray(node.children)) {
      return failTuple(`${path}.children`, 'group.children ต้องเป็น array');
    }
    if (node.children.length > MAX_CHILDREN_PER_GROUP) {
      return failTuple(`${path}.children`, `group.children เกิน ${MAX_CHILDREN_PER_GROUP}`);
    }
    for (let i = 0; i < node.children.length; i++) {
      const fail = validateNode(node.children[i], `${path}.children[${i}]`, depth + 1);
      if (fail) return fail;
    }
    return null;
  }
  if (node.kind === 'predicate') {
    const type = String(node.type || '').trim();
    if (!PREDICATE_TYPES.includes(type)) {
      return failTuple(`${path}.type`, `unknown predicate type: ${type || '(empty)'}`);
    }
    return validatePredicateParams(type, node.params, path);
  }
  return failTuple(`${path}.kind`, `unknown node kind: ${node?.kind || '(missing)'}`);
}

/**
 * Top-level validator. Validates the full rule tree + V14 no-undefined-leaves.
 *
 * @param {object} rule
 * @returns {[string, string] | null}  null = valid; tuple on first failure
 */
export function validateAudienceRule(rule) {
  if (!isPlainObject(rule)) return failTuple('rule', 'rule ต้องเป็น object');
  if (rule.kind !== 'group') return failTuple('rule.kind', 'root rule ต้องเป็น group');
  const fail = validateNode(rule, 'rule', 0);
  if (fail) return fail;
  if (hasUndefinedLeaves(rule)) {
    return failTuple('rule', 'rule มี undefined ในข้อมูล (V14)');
  }
  return null;
}

/** Empty rule tree — the UI starting point (single AND group, no children). */
export function emptyAudienceRule() {
  return { kind: 'group', op: 'AND', children: [] };
}
