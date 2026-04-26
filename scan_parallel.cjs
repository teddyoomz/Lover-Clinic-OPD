const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROUTE_FILE = 'F:/LoverClinic-app/docs/proclinic_routes.txt';
const SCAN_DIR = 'F:/LoverClinic-app/docs/proclinic-scan';

const routes = fs.readFileSync(ROUTE_FILE, 'utf8')
  .split('\n')
  .map(r => r.trim())
  .filter(r => r && !r.includes('change-lang') && !r.includes('change-branch'));

function urlToPath(url) {
  return url.replace('https://trial.proclinicth.com', '');
}

function sanitizePath(p) {
  return p.replace(/\//g, '-').replace(/\?.*/, '').replace(/^-+/, '');
}

const existing = fs.readdirSync(SCAN_DIR).length;
console.log(`Already scanned: ${existing}, Routes to scan: ${routes.length}`);

// Get remaining routes
const toScan = routes.filter(url => {
  const pathname = urlToPath(url);
  const sanitized = sanitizePath(pathname);
  return !fs.existsSync(path.join(SCAN_DIR, `${sanitized}.json`));
});

console.log(`Remaining: ${toScan.length}`);

// Scan in batches
let scanned = 0;
for (let i = 0; i < toScan.length; i += 5) {
  const batch = toScan.slice(i, i + 5);
  
  batch.forEach((url, idx) => {
    const pathname = urlToPath(url);
    const sanitized = sanitizePath(pathname);
    const outputFile = path.join(SCAN_DIR, `${sanitized}.json`);
    
    try {
      console.log(`[${existing + scanned + idx + 1}/${routes.length}] ${pathname}`);
      const result = execSync(`node "F:/replicated/scraper/opd.js" intel "${pathname}" 2>&1`, {
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024
      });
      fs.writeFileSync(outputFile, result);
    } catch (e) {
      console.error(`  ERR: ${e.message.slice(0, 80)}`);
    }
  });
  
  scanned += batch.length;
  if (i + 5 < toScan.length) {
    console.log(`Batch done, waiting...`);
    try {
      execSync('sleep 2');
    } catch (e) {}
  }
}

console.log(`\nTotal scanned: ${existing + scanned}`);
