// Dual-deploy: OPD project + standalone filler project, in one command.
// The standalone is deployed as a PREBUILT STATIC directory (dist-filler) with a
// dedicated config (vercel.filler.json — no functions/crons) so ONLY the built
// files upload and NO OPD serverless function ever reaches the public project.
// Needs: vercel CLI authed; VERCEL_ORG_ID + VERCEL_FILLER_PROJECT_ID (+ optional
// VERCEL_SCOPE) loaded from .env.filler-deploy (gitignored). Run: `npm run deploy:filler`.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const run = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

// Load .env.filler-deploy if present.
try {
  for (const line of readFileSync('.env.filler-deploy', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch { /* no env file yet */ }

console.log('▶ 1/3  verify public bundle (builds dist-filler, no firebase/OPD, 3D present)…');
run('node scripts/verify-filler-bundle.mjs');

console.log('▶ 2/3  deploy OPD project (lover-clinic-app)…');
run('vercel --prod --yes');   // full repo build, OPD .vercel link + OPD vercel.json

console.log('▶ 3/3  deploy standalone (loverclinic) — prebuilt static dist-filler only…');
const { VERCEL_ORG_ID, VERCEL_FILLER_PROJECT_ID, VERCEL_SCOPE } = process.env;
if (!VERCEL_ORG_ID || !VERCEL_FILLER_PROJECT_ID) {
  console.error('Set VERCEL_ORG_ID + VERCEL_FILLER_PROJECT_ID in .env.filler-deploy before deploying the standalone.');
  process.exit(1);
}
// `vercel deploy <dir>` uploads <dir> but reads vercel.json from the CWD (the OPD
// one, with its functions block) → must override with --local-config so the static
// config (no functions) is used. Env vars target the loverclinic project.
const scope = VERCEL_SCOPE ? ` --scope ${VERCEL_SCOPE}` : '';
run(`vercel deploy dist-filler --prod --yes --local-config vercel.filler.json${scope}`,
    { VERCEL_ORG_ID, VERCEL_PROJECT_ID: VERCEL_FILLER_PROJECT_ID });
console.log('✅ both deployed.');
