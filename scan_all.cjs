const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROUTE_FILE = 'F:/LoverClinic-app/docs/proclinic_routes.txt';
const SCAN_DIR = 'F:/LoverClinic-app/docs/proclinic-scan';
const SCAN_MAP = 'C:/Users/oomzp/.claude/projects/F--LoverClinic-app/memory/project_proclinic_scan_map.md';

// Read routes
const routes = fs.readFileSync(ROUTE_FILE, 'utf8')
  .split('\n')
  .map(r => r.trim())
  .filter(r => r && !r.includes('change-lang') && !r.includes('change-branch'));

// Convert URL to path
function urlToPath(url) {
  return url.replace('https://trial.proclinicth.com', '');
}

// Sanitize for filename
function sanitizePath(p) {
  return p.replace(/\//g, '-').replace(/\?.*/, '').replace(/^-+/, '');
}

// Initialize map
if (!fs.existsSync(SCAN_MAP)) {
  fs.writeFileSync(SCAN_MAP, `# ProClinic Scan Map

| route | action | http_method | status | field_count | button_count | modal_count | last_scanned | notes |
|-------|--------|-------------|--------|-------------|--------------|-------------|--------------|-------|
`);
}

console.log(`Found ${routes.length} routes to scan`);

// Scan routes in parallel batches of 5
let scanCount = 0;
for (let i = 0; i < Math.min(routes.length, 50); i++) {
  const url = routes[i];
  const pathname = urlToPath(url);
  const sanitized = sanitizePath(pathname);
  const outputFile = path.join(SCAN_DIR, `${sanitized}.json`);
  
  if (fs.existsSync(outputFile)) {
    console.log(`[${i + 1}/${Math.min(routes.length, 50)}] Skipping ${pathname} (already scanned)`);
    continue;
  }
  
  try {
    console.log(`[${i + 1}/${Math.min(routes.length, 50)}] Scanning ${pathname}...`);
    const result = execSync(`node "F:/replicated/scraper/opd.js" intel "${pathname}" 2>&1`, {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    fs.writeFileSync(outputFile, result);
    scanCount++;
    
    if (scanCount % 10 === 0) {
      console.log(`Progress: ${scanCount} routes scanned`);
    }
  } catch (e) {
    console.error(`Error scanning ${pathname}: ${e.message.slice(0, 100)}`);
  }
}

console.log(`\nScanned ${scanCount} new routes. Total in scan dir: ${fs.readdirSync(SCAN_DIR).length}`);
