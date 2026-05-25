// Rule Q — invoke the REAL api/patient-view.js handler with a mock req/res
// against real prod (env from .env.local.prod). Proves the endpoint returns
// correct JSON for a given token — independent of Vercel runtime.
//   node scripts/diag-patient-view-handler-invoke.mjs [token]
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

for (const l of readFileSync('.env.local.prod', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

async function main() {
  const token = process.argv[2] || '23b147df82da642975ac6de01ca8218c';
  const { default: handler } = await import('../api/patient-view.js');
  const req = { method: 'GET', query: { token } };
  let _status = 200, _json = null;
  const res = {
    setHeader: () => {},
    status: (c) => { _status = c; return res; },
    json: (o) => { _json = o; return res; },
    end: () => res,
  };
  await handler(req, res);
  console.log('=== HTTP', _status, '===');
  console.log(JSON.stringify(_json, null, 2));
  process.exit(_status === 200 && _json?.ok ? 0 : 1);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
