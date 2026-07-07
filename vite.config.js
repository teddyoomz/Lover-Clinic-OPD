import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'
import { visualizer } from 'rollup-plugin-visualizer'
import obfuscator from 'vite-plugin-javascript-obfuscator'
import { VitePWA } from 'vite-plugin-pwa'

function versionPlugin() {
  return {
    name: 'version-json',
    closeBundle() {
      writeFileSync('dist/version.json', JSON.stringify({ v: Date.now().toString() }))
    },
  }
}

// Bundle visualizer — set ANALYZE=1 to generate dist/stats.html for inspection.
// Off by default so normal builds stay fast + don't commit a 1MB HTML artifact.
const analyze = process.env.ANALYZE === '1'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    versionPlugin(),
    // Obfuscate ONLY the filler-simulator FORMULA files on `vite build` (command === 'build').
    // Vitest runs command === 'serve' → this plugin is skipped → fillerMath is tested UNobfuscated →
    // all tests unaffected. Scope = the formula-bearing files (constants K_REALISTIC / K_OPTIMISTIC /
    // dCgeo / CONDOM_LADDER live in fillerMath.js; shape geometry in FillerGraphic2D.jsx).
    // FillerSimulator.jsx + Filler3D.jsx are EXCLUDED ON PURPOSE: obfuscating FillerSimulator mangles
    // its `import('../components/Filler3D.jsx')` literal into a string-array call → Rollup can't code-
    // split the 3D lazy chunk → `three` never bundles and the 3D view 404s. (2026-06-20 — found while
    // building the standalone filler site; mirrors vite.filler.config.js.) DO NOT widen this include.
    ...(command === 'build' ? [obfuscator({
      include: ['**/fillerMath.js', '**/FillerGraphic2D.jsx'],
      exclude: ['node_modules/**', 'tests/**'],
      options: {
        compact: true,
        identifierNamesGenerator: 'hexadecimal',
        numbersToExpressions: true,
        simplify: true,
        transformObjectKeys: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        stringArray: true,
        stringArrayThreshold: 1,
        stringArrayEncoding: ['base64'],
        stringArrayCallsTransform: true,
        splitStrings: true,
        splitStringsChunkLength: 6,
      },
    })] : []),
    ...(analyze ? [visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true, open: false })] : []),
    // D1 (2026-07-07 instant cold-start, spec Q4=B) — app-shell Service Worker.
    // AV207 contract: precache the SMALL static shell only (entry + css + icons —
    // NOT the 900KB lazy backend chunks, they runtime-cache on first use);
    // NEVER intercept /api/* (navigateFallbackDenylist) and NEVER any
    // *.googleapis.com traffic (no cross-origin runtimeCaching → Firestore/auth
    // stay network-only, data-freshness + rules semantics untouched).
    // manifest:false — public/manifest.json stays canonical (iOS install identity).
    // injectRegister:false — registration lives in src/main.jsx (bundled module;
    // the inline-script CSP hashes in vercel.json stay untouched).
    // Kill-switch (AV207): to disable in the field, deploy a sw.js that calls
    // self.registration.unregister() — vercel serves /sw.js no-cache so it lands
    // on every client within one visibilitychange update check.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      workbox: {
        inlineWorkboxRuntime: true, // single sw.js file → one no-cache header covers it
        globPatterns: ['index.html', 'assets/index-*.js', 'assets/*.css', 'icon-192.png', 'favicon.svg', 'manifest.json'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{
          // hashed immutable build assets (lazy chunks / fonts) — CacheFirst on
          // FIRST USE keeps install light while enabling offline shell + fast repeats
          urlPattern: /^https?:\/\/[^/]+\/assets\/.+\.(?:js|css|woff2|png|svg)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'assets-v1',
            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
          },
        }],
      },
    }),
  ],
  server: {
    // link-patient dev/preview: vite has no /api runtime, so proxy ONLY the
    // read-only public patient-view GET to prod (real endpoint, real latency —
    // used by scripts/perf-baseline.mjs link-patient measurement). Deliberately
    // NARROW: never proxy all of /api (admin endpoints + webhooks would hit prod).
    proxy: {
      '/api/patient-view': { target: 'https://lover-clinic-app.vercel.app', changeOrigin: true },
    },
    // Pre-compile common entry points at dev server start so the first
    // navigation to these routes/tabs doesn't pay the ESM-transform cost.
    // Cuts cold-start "click tab → see content" time from ~10s to ~1s in
    // practice (measured with Claude Preview MCP 2026-04-19).
    warmup: {
      clientFiles: [
        // perf P1.9 (2026-07-06) — dropped V50-DELETED files (AppointmentTab /
        // MasterDataTab / CloneTab) that errored at every dev-server start.
        './src/App.jsx',
        './src/pages/AdminDashboard.jsx',
        './src/pages/BackendDashboard.jsx',
        './src/components/backend/PromotionTab.jsx',
        './src/components/backend/CouponTab.jsx',
        './src/components/backend/VoucherTab.jsx',
        './src/components/backend/MarketingTabShell.jsx',
        './src/components/backend/MarketingFormShell.jsx',
        './src/components/backend/nav/BackendNav.jsx',
        './src/components/backend/nav/BackendSidebar.jsx',
        './src/components/backend/nav/BackendMobileDrawer.jsx',
        './src/components/backend/nav/BackendTopBar.jsx',
        './src/components/backend/nav/BackendCmdPalette.jsx',
        './src/components/backend/SaleTab.jsx',
        './src/components/backend/StockTab.jsx',
        './src/components/backend/FinanceTab.jsx',
        './src/components/backend/CustomerListTab.jsx',
      ],
    },
  },
  preview: {
    // Same narrow proxy for `vite preview` (perf-baseline local-preview target).
    proxy: {
      '/api/patient-view': { target: 'https://lover-clinic-app.vercel.app', changeOrigin: true },
    },
  },
  optimizeDeps: {
    // Pre-bundle heavy deps so Firestore/auth calls during cold start don't
    // stall on per-module ESM conversion.
    include: [
      'react',
      'react-dom',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
      'lucide-react',
      'cmdk',
      '@radix-ui/react-dialog',
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    // Default include: tests/*.test.* (1 level deep only). Tests in
    // tests/extended/ are EXCLUDED by default per session-11 EOD-2 user
    // directive "ลดลงเหลือแต่ที่สำคัญไม่เกิน 1000 test ก่อนในตอนนี้".
    // Run extended tests via `npm run test:extended` (opt-in, ~5000 tests).
    include: ['tests/*.test.js', 'tests/*.test.jsx'],
    // Firestore-dependent integration tests — they hit live Firestore with
    // no auth context (tests/setup.js has no Firebase signin), so every
    // read/write fails with PERMISSION_DENIED. Document them as opt-in via
    // the env flag and exclude by default so `npm test` stays 100% green
    // for local dev + CI. Run them with `TEST_FIRESTORE=1 npm test`.
    exclude: [
      ...(process.env.TEST_FIRESTORE === '1' ? [] : [
        'tests/backend.test.js',
        'tests/phase7-integration.test.js',
        'tests/phase8-adv-batches.test.js',
        'tests/phase8-adv-orders.test.js',
        'tests/phase8-adv-sales.test.js',
        'tests/phase8-adv-transfer.test.js',
        'tests/phase8-adv-treatments.test.js',
        'tests/phase8-adv-warehouses.test.js',
        'tests/phase8-adv-withdrawal.test.js',
        'tests/phase8-adv-xsubsystem.test.js',
        'tests/phase8-primitives.test.js',
        'tests/phase8-sale-stock.test.js',
        'tests/phase8-treatment-stock.test.js',
      ]),
      // V81 emulator round-trip (tests/v81-emulator-roundtrip.test.js) needs a
      // provisioned Firebase emulator (Java JDK + firebase-tools + jars). It's a
      // real Rule Q V66 backup-verification gate — kept in the repo but excluded
      // from the default run so `npm test` stays 0-skip. Run it in a provisioned
      // emulator job via `RUN_V81_EMULATOR=1 npm test`.
      ...(process.env.RUN_V81_EMULATOR === '1' ? [] : ['tests/v81-emulator-roundtrip.test.js']),
      'node_modules/**',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'vendor-firebase';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/fabric')) return 'vendor-fabric';
          // Phase 29 (2026-05-14) — recall components bucketed into their own
          // chunk as a workaround for a Rolldown panic (byte-boundary slice
          // error in hash_placeholder.rs). REMOVED 2026-07-06 (perf P1 #1):
          // the bucket had absorbed the Firebase SDK + backendClient core into
          // a 903KB chunk modulepreloaded on EVERY route (incl. patient links),
          // and the panic no longer reproduces on Vite 8.0.16 Rolldown
          // (verified by clean ANALYZE=1 build this date). If the panic ever
          // returns, re-add a NARROW bucket — never let it capture shared core.
        },
      },
    },
  },
}))
