// Dual-deploy: OPD project + standalone filler project, in one command.
// Gate: verify the public bundle (no firebase/OPD + 3D present) BEFORE deploying.
// Needs: vercel CLI authed; for the standalone, VERCEL_ORG_ID + VERCEL_FILLER_PROJECT_ID
// in the env (set after creating the loverclinic project — see the plan Task 6).
// Run: `set -a; . ./.env.filler-deploy; set +a; npm run deploy:filler`
import { execSync } from 'node:child_process';
const run = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

console.log('▶ 1/3  verify public bundle (no firebase/OPD + 3D present)…');
run('node scripts/verify-filler-bundle.mjs');

console.log('▶ 2/3  deploy OPD project (lover-clinic-app)…');
run('vercel --prod --yes');   // uses .vercel/project.json (lover-clinic-app)

console.log('▶ 3/3  deploy standalone (loverclinic)…');
const { VERCEL_ORG_ID, VERCEL_FILLER_PROJECT_ID } = process.env;
if (!VERCEL_ORG_ID || !VERCEL_FILLER_PROJECT_ID) {
  console.error('Set VERCEL_ORG_ID + VERCEL_FILLER_PROJECT_ID (from the loverclinic project) before deploying the standalone.');
  process.exit(1);
}
run('vercel --prod --yes --local-config vercel.filler.json',
    { VERCEL_ORG_ID, VERCEL_PROJECT_ID: VERCEL_FILLER_PROJECT_ID });
console.log('✅ both deployed.');
