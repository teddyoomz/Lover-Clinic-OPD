// Dual-deploy: OPD project + standalone filler project, in one command.
// The standalone is deployed as a PREBUILT STATIC directory (dist-filler) so
// ONLY the built files upload — api/ + src/ + any OPD code literally never reach
// the public project (the security boundary holds at the deploy layer too).
// Needs: vercel CLI authed; VERCEL_ORG_ID + VERCEL_FILLER_PROJECT_ID (loaded from
// .env.filler-deploy, gitignored). Run: `npm run deploy:filler`.
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync } from 'node:fs';
const run = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

// Load .env.filler-deploy if present.
try {
  for (const line of readFileSync('.env.filler-deploy', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch { /* no env file yet */ }

console.log('▶ 1/4  verify public bundle (builds dist-filler, no firebase/OPD, 3D present)…');
run('node scripts/verify-filler-bundle.mjs');

console.log('▶ 2/4  stage static deploy config into dist-filler…');
copyFileSync('vercel.filler.json', 'dist-filler/vercel.json');

console.log('▶ 3/4  deploy OPD project (lover-clinic-app)…');
run('vercel --prod --yes');   // full repo build, OPD .vercel link

console.log('▶ 4/4  deploy standalone (loverclinic) — STATIC dist-filler only…');
const { VERCEL_ORG_ID, VERCEL_FILLER_PROJECT_ID } = process.env;
if (!VERCEL_ORG_ID || !VERCEL_FILLER_PROJECT_ID) {
  console.error('Set VERCEL_ORG_ID + VERCEL_FILLER_PROJECT_ID in .env.filler-deploy before deploying the standalone.');
  process.exit(1);
}
run('vercel deploy dist-filler --prod --yes', { VERCEL_ORG_ID, VERCEL_PROJECT_ID: VERCEL_FILLER_PROJECT_ID });
console.log('✅ both deployed.');
