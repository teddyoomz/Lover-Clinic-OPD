// Dedicated Vitest config for the opt-in EXTENDED test suite (tests/extended/**).
//
// `npm test` (vite.config.js) only includes tests/*.test.* (1 level deep) per the
// session-11 EOD-2 directive that keeps the default suite lean. This config flips
// `test.include` to tests/extended/** so `npm run test:extended` actually runs them.
//
// Why a separate config instead of `vitest run --include ...`? This Vitest version's
// CAC-based CLI rejects `--include` as an unknown option — it is a config-only field,
// not a CLI flag. `--config <file>` is the supported path.
//
// Reuses the base vite.config.js (react plugin for JSX transform, jsdom env, globals,
// tests/setup.js); only `test.include` is overridden and `test.exclude` is re-scoped
// to the extended tree.

import baseConfig from './vite.config.js';

const base = baseConfig;

// Firestore-dependent integration tests under tests/extended/ hit live Firestore with
// no auth context (tests/setup.js has no Firebase signin) → PERMISSION_DENIED. Mirror
// the base config's opt-in convention: excluded unless TEST_FIRESTORE=1.
const firestoreExtended = [
  'tests/extended/backend.test.js',
  'tests/extended/phase7-integration.test.js',
  'tests/extended/phase8-adv-batches.test.js',
  'tests/extended/phase8-adv-orders.test.js',
  'tests/extended/phase8-adv-sales.test.js',
  'tests/extended/phase8-adv-transfer.test.js',
  'tests/extended/phase8-adv-treatments.test.js',
  'tests/extended/phase8-adv-warehouses.test.js',
  'tests/extended/phase8-adv-withdrawal.test.js',
  'tests/extended/phase8-adv-xsubsystem.test.js',
  'tests/extended/phase8-primitives.test.js',
  'tests/extended/phase8-sale-stock.test.js',
  'tests/extended/phase8-treatment-stock.test.js',
];

// QUARANTINED — these import/readFileSync modules deleted by the V50 ProClinic
// strip (src/lib/brokerClient.js, src/lib/phase9Mappers.js, api/proclinic/**).
// They exercise functionality that was intentionally removed, so they can never
// load. Cannot be fixed without resurrecting deleted code; parked here (rather
// than deleted) so the decision stays visible + reversible. Triaged 2026-05-28.
const quarantineDeadV50 = [
  'tests/extended/courseSync.test.js',            // api/proclinic/master.js
  'tests/extended/dfGroupScraper.test.js',        // api/proclinic/_lib/scraper.js
  'tests/extended/phase9-sync-scraper.test.js',   // api/proclinic/master.js
  'tests/extended/retry-helper.test.js',          // api/proclinic/_lib/retry.js
  'tests/extended/proclinic-schedule-sync.test.js', // api/proclinic/master.js
  'tests/extended/phase12.2b-scenarios.test.js',  // api/proclinic/master.js
  'tests/extended/phase9-wiring-crosscut.test.jsx', // src/lib/phase9Mappers.js
  'tests/extended/phase12.2b-flow-simulate.test.js', // readFileSync api/proclinic/master.js
];

export default {
  ...base,
  test: {
    ...base.test,
    include: ['tests/extended/*.test.js', 'tests/extended/*.test.jsx'],
    exclude: [
      'node_modules/**',
      ...quarantineDeadV50,
      ...(process.env.TEST_FIRESTORE === '1' ? [] : firestoreExtended),
    ],
  },
};
