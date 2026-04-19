import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'
import { visualizer } from 'rollup-plugin-visualizer'

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
export default defineConfig({
  plugins: [
    react(),
    versionPlugin(),
    ...(analyze ? [visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true, open: false })] : []),
  ],
  server: {
    // Pre-compile common entry points at dev server start so the first
    // navigation to these routes/tabs doesn't pay the ESM-transform cost.
    // Cuts cold-start "click tab → see content" time from ~10s to ~1s in
    // practice (measured with Claude Preview MCP 2026-04-19).
    warmup: {
      clientFiles: [
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
        './src/components/backend/AppointmentTab.jsx',
        './src/components/backend/StockTab.jsx',
        './src/components/backend/FinanceTab.jsx',
        './src/components/backend/MasterDataTab.jsx',
        './src/components/backend/CustomerListTab.jsx',
        './src/components/backend/CloneTab.jsx',
      ],
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
    include: ['tests/*.test.js', 'tests/*.test.jsx'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'vendor-firebase';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/fabric')) return 'vendor-fabric';
        },
      },
    },
  },
})
