// Rule Q L2 proof for the standalone public filler bundle.
// Builds dist-filler then asserts:
//   (1) ZERO firebase/OPD code in the public bundle (the security boundary),
//   (2) the formula constants are obfuscated away (R9 IP parity),
//   (3) three / the 3D lazy chunk IS present (regression guard — the obfuscator
//       must NOT mangle the Filler3D dynamic import, or 3D 404s at runtime).
// Exit 1 on any violation. Run manually + as the pre-deploy gate in deploy:filler.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Direct vite binary (npx gets rewritten by the rtk shell hook).
execSync('node node_modules/vite/bin/vite.js build --config vite.filler.config.js', { stdio: 'inherit' });

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk('dist-filler').filter((f) => f.endsWith('.js') || f.endsWith('.html'));
const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n');

const FORBIDDEN = [
  /firebaseConfig/, /getFirestore/, /signInWith/, /firebase\/app/, /firebase\/firestore/,
  /AdminDashboard/, /BackendDashboard/, /backendClient/,
];
const FORMULA = [/K_REALISTIC/, /K_OPTIMISTIC/, /condomIndexForGirth/, /dCgeo/, /CONDOM_LADDER/];

const hits = [];
for (const re of FORBIDDEN) if (re.test(blob)) hits.push('FORBIDDEN OPD/firebase token present: ' + re);
for (const re of FORMULA) if (re.test(blob)) hits.push('Formula constant NOT obfuscated: ' + re);

// Positive: the 3D engine must be bundled (own lazy chunk).
const has3D = /WebGLRenderer/.test(blob) && files.some((f) => /Filler3D/.test(f));
if (!has3D) hits.push('3D MISSING — three.js / Filler3D lazy chunk not emitted (dynamic import broken?)');

if (hits.length) { console.error('❌ filler bundle verification FAILED:\n  ' + hits.join('\n  ')); process.exit(1); }
console.log(`✅ dist-filler verified: ${files.length} files · no firebase/OPD · formula obfuscated · 3D present.`);
