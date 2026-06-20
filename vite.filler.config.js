import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscator from 'vite-plugin-javascript-obfuscator'
import { renameSync, existsSync } from 'fs'

// Entry file is filler.html, but emit it as index.html so `/` serves it
// everywhere (vite preview + Vercel default) with no rewrite dependency.
function emitAsIndex() {
  return {
    name: 'filler-emit-index',
    closeBundle() {
      const from = 'dist-filler/filler.html'
      if (existsSync(from)) renameSync(from, 'dist-filler/index.html')
    },
  }
}

// Standalone PUBLIC build of the filler simulator → dist-filler/.
// Entry = filler.html → src/filler-main.jsx → <FillerSimulator/> ONLY.
// publicDir = public-filler (only the assets the public page needs — no OPD chart/stickers).
//
// Obfuscator scope = the FORMULA-bearing files ONLY: fillerMath.js (all the
// secret constants K_REALISTIC/K_OPTIMISTIC/dCgeo/CONDOM_LADDER + the geometry
// functions) + FillerGraphic2D.jsx (shape geometry). FillerSimulator.jsx is
// EXCLUDED on purpose: obfuscating it mangles its `import('../components/Filler3D.jsx')`
// literal into a string-array call, so Rollup can't code-split the 3D lazy chunk
// → `three` would never bundle and the 3D view would 404. Filler3D.jsx has no
// formula + must stay statically importable. (verify-filler-bundle.mjs asserts
// both the formula constants are gone AND three IS present.)
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    emitAsIndex(),
    ...(command === 'build' ? [obfuscator({
      include: ['**/fillerMath.js', '**/FillerGraphic2D.jsx'],
      exclude: ['node_modules/**', 'tests/**'],
      options: {
        compact: true, identifierNamesGenerator: 'hexadecimal', numbersToExpressions: true,
        simplify: true, transformObjectKeys: true, controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75, stringArray: true, stringArrayThreshold: 1,
        stringArrayEncoding: ['base64'], stringArrayCallsTransform: true, splitStrings: true,
        splitStringsChunkLength: 6,
      },
    })] : []),
  ],
  publicDir: 'public-filler',
  build: {
    outDir: 'dist-filler',
    emptyOutDir: true,
    rollupOptions: { input: 'filler.html' },
  },
}))
