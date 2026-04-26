const fs = require('fs');
const path = require('path');

const SCAN_DIR = 'F:/LoverClinic-app/docs/proclinic-scan';
const SCAN_MAP = 'C:/Users/oomzp/.claude/projects/F--LoverClinic-app/memory/project_proclinic_scan_map.md';

function analyzeScans() {
  const files = fs.readdirSync(SCAN_DIR).filter(f => f.endsWith('.json'));
  
  let totalFields = 0;
  let totalButtons = 0;
  let totalModals = 0;
  let totalLinks = 0;
  let totalForms = 0;
  
  const mapRows = [];
  
  files.forEach(file => {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(SCAN_DIR, file), 'utf8'));
      const route = content.meta?.url || 'unknown';
      
      const fieldCount = (content.forms || []).reduce((sum, form) => sum + (form.fields || []).length, 0);
      const buttonCount = (content.buttons || []).length;
      const modalCount = (content.modals || []).length;
      const formCount = (content.forms || []).length;
      const linkCount = (content.connections?.linksTo || []).length;
      
      totalFields += fieldCount;
      totalButtons += buttonCount;
      totalModals += modalCount;
      totalLinks += linkCount;
      totalForms += formCount;
      
      // Detect action type
      let action = 'list';
      if (route.includes('/create')) action = 'create';
      else if (route.includes('/edit')) action = 'edit';
      else if (route.includes('/show')) action = 'show';
      
      const hasForm = formCount > 0;
      const hasModal = modalCount > 0;
      
      mapRows.push({
        route: route.replace(/^\/admin\//, ''),
        action,
        status: 'scanned',
        fieldCount,
        buttonCount,
        modalCount,
        hasForm,
        hasModal,
        file
      });
    } catch (e) {
      console.error(`Error parsing ${file}: ${e.message}`);
    }
  });
  
  // Sort by route
  mapRows.sort((a, b) => a.route.localeCompare(b.route));
  
  // Generate markdown table
  let mapMarkdown = `# ProClinic Scan Map (Round 1 Complete)

Generated: ${new Date().toISOString()}
Total routes scanned: ${files.length}
Total fields: ${totalFields}
Total buttons: ${totalButtons}
Total modals: ${totalModals}
Total forms: ${totalForms}
Total links: ${totalLinks}

| route | action | status | fields | buttons | modals | form? | modal? | last_scanned |
|-------|--------|--------|--------|---------|--------|-------|--------|--------------|
`;
  
  mapRows.forEach(row => {
    mapMarkdown += `| ${row.route} | ${row.action} | ${row.status} | ${row.fieldCount} | ${row.buttonCount} | ${row.modalCount} | ${row.hasForm ? '✓' : ''} | ${row.hasModal ? '✓' : ''} | ${new Date().toISOString().split('T')[0]} |\n`;
  });
  
  fs.writeFileSync(SCAN_MAP, mapMarkdown);
  
  console.log(`\n=== SCAN ANALYSIS ===`);
  console.log(`Routes scanned: ${files.length}`);
  console.log(`Total fields: ${totalFields}`);
  console.log(`Total buttons: ${totalButtons}`);
  console.log(`Total modals: ${totalModals}`);
  console.log(`Avg fields/route: ${(totalFields / files.length).toFixed(1)}`);
  console.log(`Avg buttons/route: ${(totalButtons / files.length).toFixed(1)}`);
  console.log(`Routes with forms: ${mapRows.filter(r => r.hasForm).length}`);
  console.log(`Routes with modals: ${mapRows.filter(r => r.hasModal).length}`);
  console.log(`\nMap written to: ${SCAN_MAP}`);
}

analyzeScans();
