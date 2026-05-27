#!/usr/bin/env node
/**
 * 2026-05-28 — V124 follow-up: refine the bg-tint dark:-clobber fix.
 *
 * v1 (fix-light-theme-bg-tint-dark-clobber.mjs) added :not([class*=":bg-X/"]) to
 * exclude variant-prefixed (dark:) classes. But that was TOO BROAD: an element with
 * BOTH a base `bg-orange-900/20` AND a variant `hover:bg-orange-900/40` (e.g. the
 * stock ปรับ/เพิ่ม/แก้ไข outline buttons) contains ":bg-orange-900/" (from hover:) →
 * the :not wrongly EXCLUDED it → the pale-tint remap stopped firing → raw dark tint
 * (3.64:1, sub-AA regression caught by post-deploy re-scan).
 *
 * Correct fix: match the BASE utility only — preceded by a space or string-start,
 * never a colon. `[class*=" bg-X/"]` (space) + `[class^="bg-X/"]` (start) fires for a
 * base `bg-orange-900/20` (despite a hover:/dark: variant on the same element) AND
 * does NOT match a dark:-ONLY badge (`bg-amber-600 ... dark:bg-amber-900/30`), so the
 * finance white-on-pale fix is preserved.
 *
 * Converts each `[data-theme="X"] [class*="bg-Y/"]:not([class*=":bg-Y/"])`
 *           → `[data-theme="X"] [class*=" bg-Y/"], [data-theme="X"] [class^="bg-Y/"]`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS_PATH = fileURLToPath(new URL('../src/index.css', import.meta.url));
const APPLY = process.argv.includes('--apply');
const src = readFileSync(CSS_PATH, 'utf8');

const RE = /\[data-theme="(light|auto)"\] \[class\*="(bg-[a-z]+-(?:700|800|900|950))\/"\]:not\(\[class\*=":[^"]*"\]\)/g;

let count = 0;
const out = src.replace(RE, (m, theme, key) => {
  count++;
  return `[data-theme="${theme}"] [class*=" ${key}/"], [data-theme="${theme}"] [class^="${key}/"]`;
});

console.log(`[v2-base-match] selectors converted: ${count}`);
const sample = out.split('\n').find((l) => l.includes('bg-amber-900/') && l.includes('[class^='));
console.log(`[v2-base-match] sample: ${sample ? sample.trim() : '(none)'}`);

if (!APPLY) console.log('[v2-base-match] DRY RUN — pass --apply to write.');
else { writeFileSync(CSS_PATH, out, 'utf8'); console.log(`[v2-base-match] WROTE ${CSS_PATH}`); }
