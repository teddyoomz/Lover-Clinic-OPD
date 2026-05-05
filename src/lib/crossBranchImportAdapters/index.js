// ─── Cross-branch import adapter registry ─────────────────────────────────
// Phase 17.1. Single entry point — modal + button look up the adapter for
// a given entityType. Server endpoint imports the same registry to apply
// dedupKey + fkRefs + clone consistently between client preview and
// server-side write.

import productsAdapter from './products.js';
import productGroupsAdapter from './product-groups.js';
import productUnitsAdapter from './product-units.js';
import medicalInstrumentsAdapter from './medical-instruments.js';
import holidaysAdapter from './holidays.js';
import coursesAdapter from './courses.js';
import dfGroupsAdapter from './df-groups.js';

export const ADAPTERS = {
  'products': productsAdapter,
  'product-groups': productGroupsAdapter,
  'product-units': productUnitsAdapter,
  'medical-instruments': medicalInstrumentsAdapter,
  'holidays': holidaysAdapter,
  'courses': coursesAdapter,
  'df-groups': dfGroupsAdapter,
};

export const ENTITY_TYPES = Object.keys(ADAPTERS);

export function getAdapter(entityType) {
  const adapter = ADAPTERS[entityType];
  if (!adapter) {
    throw new Error(`Unknown entityType: ${entityType}. Known: ${ENTITY_TYPES.join(', ')}`);
  }
  return adapter;
}

export function isKnownEntityType(entityType) {
  return entityType in ADAPTERS;
}
