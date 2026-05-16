// V75 Item 3 — firestore.rules be_fb_configs + Probe-Deploy-Probe #12 source-grep.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('V75 Item 3 — firestore.rules be_fb_configs match', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  it('FR1.1 — be_fb_configs match block present', () => {
    expect(rules).toMatch(/match\s+\/be_fb_configs/);
  });

  it('FR1.2 — allow read: if isClinicStaff() (mirror be_line_configs)', () => {
    const start = rules.indexOf('match /be_fb_configs');
    const block = rules.slice(start, start + 500);
    expect(block).toMatch(/allow read:\s*if\s+isClinicStaff/);
  });

  it('FR1.3 — allow write: admin OR perm_system_config_management', () => {
    const start = rules.indexOf('match /be_fb_configs');
    const block = rules.slice(start, start + 500);
    expect(block).toMatch(/admin/);
    expect(block).toMatch(/perm_system_config_management/);
  });

  it('FR1.4 — allow delete: admin only', () => {
    const start = rules.indexOf('match /be_fb_configs');
    const block = rules.slice(start, start + 500);
    expect(block).toMatch(/allow delete:\s*if\s+isSignedIn[^}]*admin\s*==\s*true/);
  });

  it('FR1.5 — V75 marker comment near be_fb_configs match', () => {
    const start = rules.indexOf('match /be_fb_configs');
    const before = rules.slice(Math.max(0, start - 600), start);
    expect(before).toMatch(/V75 Item 3/);
  });
});

describe('V75 Item 3 — Probe-Deploy-Probe #12 (be_fb_configs anon WRITE → 403)', () => {
  it('PD12.1 — probe-deploy-probe.mjs has Probe #12 function', () => {
    const src = fs.readFileSync('scripts/probe-deploy-probe.mjs', 'utf8');
    expect(src).toMatch(/probe12_beFbConfigsAnon/);
    expect(src).toMatch(/be_fb_configs/);
  });

  it('PD12.2 — Probe #12 asserts anon write returns 403', () => {
    const src = fs.readFileSync('scripts/probe-deploy-probe.mjs', 'utf8');
    const start = src.indexOf('probe12_beFbConfigsAnon');
    const block = src.slice(start, start + 800);
    expect(block).toMatch(/expect 403/);
  });

  it('PD12.3 — Probe #12 registered in runProbe orchestrator', () => {
    const src = fs.readFileSync('scripts/probe-deploy-probe.mjs', 'utf8');
    const start = src.indexOf('runProbe');
    const block = src.slice(start, start + 1000);
    expect(block).toMatch(/probe12_beFbConfigsAnon/);
  });

  it('PD12.4 — Rule B in 01-iron-clad.md documents Probe #12', () => {
    const ironclad = fs.readFileSync('.claude/rules/01-iron-clad.md', 'utf8');
    expect(ironclad).toMatch(/#12.*be_fb_configs|V75 Item 3 Per-branch FB Configs/);
  });

  it('PD12.5 — V75 marker in probe-deploy-probe.mjs near probe12 function', () => {
    const src = fs.readFileSync('scripts/probe-deploy-probe.mjs', 'utf8');
    const start = src.indexOf('probe12_beFbConfigsAnon');
    const before = src.slice(Math.max(0, start - 300), start + 200);
    expect(before).toMatch(/V75 Item 3/);
  });
});
