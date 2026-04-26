const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROUTE_FILE = 'F:/LoverClinic-app/docs/proclinic_routes.txt';
const SCAN_DIR = 'F:/LoverClinic-app/docs/proclinic-scan';

const routes = fs.readFileSync(ROUTE_FILE, 'utf8').split('\n').map(r => r.trim()).filter(r => r && !r.includes('change-lang') && !r.includes('change-branch'));

function urlToPath(url) {
  return url.replace('https://trial.proclinicth.com', '');
}

function sanitizePath(p) {
  return p.replace(/\//g, '-').replace(/\?.*/, '').replace(/^-+/, '');
}

const scanned = new Set(fs.readdirSync(SCAN_DIR).map(f => f.replace('.json', '')));
const toScan = routes.filter(url => !scanned.has(sanitizePath(urlToPath(url))));

console.log(`Scanning ${toScan.length} remaining routes...`);

let count = 0;
toScan.forEach((url, idx) => {
  const pathname = urlToPath(url);
  const sanitized = sanitizePath(pathname);
  const outputFile = path.join(SCAN_DIR, `${sanitized}.json`);
  
  try {
    const result = spawnSync('node', ['F:/replicated/scraper/opd.js', 'intel', pathname], {
      encoding: 'utf8',
      timeout: 25000,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024
    });
    
    if (result.status === 0) {
      fs.writeFileSync(outputFile, result.stdout);
      count++;
      if (count % 10 === 0) process.stdout.write(`.\n`);
      else process.stdout.write(`.`);
    } else {
      process.stdout.write(`!`);
    }
  } catch (e) {
    process.stdout.write(`E`);
  }
});

console.log(`\n✓ Scanned: ${count}/${toScan.length}`);
