const fs = require('fs');
const path = require('path');

const SCAN_DIR = 'F:/LoverClinic-app/docs/proclinic-scan';
const SCAN_MAP = 'C:/Users/oomzp/.claude/projects/F--LoverClinic-app/memory/project_proclinic_scan_map.md';
const AUDIT_FILE = 'C:/Users/oomzp/.claude/projects/F--LoverClinic-app/memory/project_proclinic_full_parity_audit_v2.md';

function analyzeAllScans() {
  const files = fs.readdirSync(SCAN_DIR).filter(f => f.endsWith('.json'));
  
  let totalStats = {
    routes: files.length,
    fields: 0,
    buttons: 0,
    modals: 0,
    forms: 0,
    links: 0,
    apis: 0
  };
  
  const entityData = {};
  const mapRows = [];
  
  files.forEach(file => {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(SCAN_DIR, file), 'utf8'));
      const route = content.meta?.url || 'unknown';
      const routeName = route.replace(/^\/admin\//, '').split('/')[0];
      
      const fieldCount = (content.forms || []).reduce((sum, form) => sum + (form.fields || []).length, 0);
      const buttonCount = (content.buttons || []).length;
      const modalCount = (content.modals || []).length;
      const formCount = (content.forms || []).length;
      const linkCount = (content.connections?.linksTo || []).length;
      const apiCount = (content.api?.onPageLoad || []).length + (content.api?.onInteraction || []).length;
      
      totalStats.fields += fieldCount;
      totalStats.buttons += buttonCount;
      totalStats.modals += modalCount;
      totalStats.forms += formCount;
      totalStats.links += linkCount;
      totalStats.apis += apiCount;
      
      if (!entityData[routeName]) {
        entityData[routeName] = {
          routes: 0,
          totalFields: 0,
          totalButtons: 0,
          totalModals: 0,
          routeList: []
        };
      }
      
      entityData[routeName].routes += 1;
      entityData[routeName].totalFields += fieldCount;
      entityData[routeName].totalButtons += buttonCount;
      entityData[routeName].totalModals += modalCount;
      entityData[routeName].routeList.push(route);
      
      let action = 'list';
      if (route.includes('/create')) action = 'create';
      else if (route.includes('/edit')) action = 'edit';
      else if (route.includes('/show')) action = 'show';
      
      mapRows.push({
        route: route.replace(/^\/admin\//, ''),
        action: action,
        fieldCount: fieldCount,
        buttonCount: buttonCount,
        modalCount: modalCount,
        hasForm: formCount > 0,
        hasModal: modalCount > 0
      });
    } catch (e) {
      console.error(`Parse error ${file}: ${e.message.slice(0, 60)}`);
    }
  });
  
  return { totalStats, entityData, mapRows };
}

const { totalStats, entityData, mapRows } = analyzeAllScans();

let scanMap = `# ProClinic Scan Map

**Scan Date:** ${new Date().toISOString().split('T')[0]}
**Rounds Completed:** 2 (Discovery + Deep Scan)
**Status:** In Progress

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total Routes Scanned | ${totalStats.routes} |
| Total Form Fields | ${totalStats.fields} |
| Total Buttons/Links | ${totalStats.buttons} |
| Total Modals Detected | ${totalStats.modals} |
| Total Forms | ${totalStats.forms} |

## Routes Table

| Route | Action | Fields | Buttons | Modals | Status |
|-------|--------|--------|---------|--------|--------|
`;

mapRows.sort((a, b) => a.route.localeCompare(b.route)).forEach(row => {
  scanMap += `| ${row.route} | ${row.action} | ${row.fieldCount} | ${row.buttonCount} | ${row.modalCount} | scanned |\n`;
});

fs.writeFileSync(SCAN_MAP, scanMap);

let auditText = `# ProClinic Full Parity Audit v2

**Date:** ${new Date().toISOString()}

## Executive Summary

- **Total Routes:** ${totalStats.routes}
- **Total Fields:** ${totalStats.fields}
- **Total Buttons:** ${totalStats.buttons}
- **Modals Found:** ${totalStats.modals}

## Top Entities

| Entity | Routes | Fields | Buttons |
|--------|--------|--------|---------|
`;

Object.entries(entityData)
  .sort((a, b) => b[1].totalFields - a[1].totalFields)
  .slice(0, 20)
  .forEach(([entity, data]) => {
    auditText += `| ${entity} | ${data.routes} | ${data.totalFields} | ${data.totalButtons} |\n`;
  });

fs.writeFileSync(AUDIT_FILE, auditText);

console.log(`✓ Generated outputs`);
console.log(`Routes: ${totalStats.routes}`);
console.log(`Fields: ${totalStats.fields}`);
console.log(`Buttons: ${totalStats.buttons}`);
