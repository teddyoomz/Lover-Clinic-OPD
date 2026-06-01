// Task 10 — permission key + tab gate + nav/emoji/render-case wiring.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TAB_PERMISSION_MAP, canAccessTab } from '../src/lib/tabPermissions.js';
import { ALL_PERMISSION_KEYS } from '../src/lib/permissionGroupValidation.js';

describe('Scheduled Tasks · nav + permission wiring', () => {
  it('registers the scheduled_task_management permission key', () => {
    expect(ALL_PERMISSION_KEYS).toContain('scheduled_task_management');
  });

  it('gates tab=scheduled-tasks by the permission', () => {
    expect(TAB_PERMISSION_MAP['scheduled-tasks']).toEqual({ requires: ['scheduled_task_management'] });
  });

  it('canAccessTab — 4 personas', () => {
    expect(canAccessTab('scheduled-tasks', {}, true)).toBe(true);                              // admin bypass
    expect(canAccessTab('scheduled-tasks', { scheduled_task_management: true }, false)).toBe(true);  // has perm
    expect(canAccessTab('scheduled-tasks', {}, false)).toBe(false);                            // no perm
    expect(canAccessTab('scheduled-tasks', { system_config_management: true }, false)).toBe(false); // wrong perm
  });

  it('nav entry + emoji + BackendDashboard render case present', () => {
    expect(readFileSync('src/components/backend/nav/navConfig.js', 'utf8')).toMatch(/id: 'scheduled-tasks'/);
    expect(readFileSync('src/components/backend/shell/subTabEmoji.js', 'utf8')).toMatch(/'scheduled-tasks':\s*'⏱️'/);
    const bd = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
    expect(bd).toMatch(/activeTab === 'scheduled-tasks'/);
    expect(bd).toMatch(/ScheduledTasksTab\s*\/>/);
    expect(bd).toMatch(/lazy\(\(\) => import\('\.\.\/components\/backend\/ScheduledTasksTab\.jsx'\)\)/);
  });
});
