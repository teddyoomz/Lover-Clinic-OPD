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

// Open Graph share-preview: og:image + og:url MUST be ABSOLUTE https URLs, or
// LINE / WhatsApp / FB show a bare text card (relative og:image is not resolved).
const indexHtml = files.filter((f) => f.endsWith('index.html')).map((f) => readFileSync(f, 'utf8')).join('\n');
if (!/property="og:image"\s+content="https:\/\/loverclinic\.vercel\.app\/og-image\.png"/.test(indexHtml))
  hits.push('og:image is not the absolute https://loverclinic.vercel.app/og-image.png (relative → bare share card)');
if (/property="og:image"\s+content="\//.test(indexHtml))
  hits.push('og:image is a RELATIVE path — crawlers (LINE/WhatsApp/FB) will not fetch it');
if (!/property="og:url"\s+content="https:\/\/loverclinic\.vercel\.app\//.test(indexHtml))
  hits.push('og:url missing/relative — needed for reliable share unfurl');

// favicon = the clinic icon (same as the OPD site lover-clinic-app), NOT the generic favicon.svg (regression guard)
if (!/rel="icon"[^>]*href="\/icon-192\.png"/.test(indexHtml))
  hits.push('favicon is not /icon-192.png (the clinic icon) — filler site shows a wrong/generic icon');
if (!walk('dist-filler').some((f) => /[\\/]icon-192\.png$/.test(f)))  // walk full tree — `files` is filtered to .js/.html
  hits.push('icon-192.png not emitted into dist-filler (copy it into public-filler/)');

if (hits.length) { console.error('❌ filler bundle verification FAILED:\n  ' + hits.join('\n  ')); process.exit(1); }
console.log(`✅ dist-filler verified: ${files.length} files · no firebase/OPD · formula obfuscated · 3D present.`);
