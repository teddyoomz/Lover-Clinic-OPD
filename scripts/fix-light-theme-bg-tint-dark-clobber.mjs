#!/usr/bin/env node
/**
 * 2026-05-28 — One-shot CSS transform.
 *
 * Bug: the light-theme alert/badge bg-tint remap selectors
 *   [data-theme="light"|"auto"] [class*="bg-{c}-{700|800|900|950}/"]
 * use an attribute-SUBSTRING match. That substring also appears inside the
 * Tailwind DARK-VARIANT class `dark:bg-{c}-{shade}/XX`, so an element like
 *   class="bg-amber-600 text-white dark:bg-amber-900/30"
 * (a solid white-on-color badge in light theme) had its SOLID bg clobbered to
 * the pale {c}-50 tint by the !important rule → white text on pale = INVISIBLE
 * (finance/deposit panel: "ลูกค้าจอง", "ดูลิ้งค์", "ส่งลิ้งค์", ~1.05:1).
 *
 * Fix: append `:not([class*=":bg-{c}-{shade}/"])` to every such selector. A
 * variant-prefixed class (`dark:`, `hover:`, `sm:`, …) always has a COLON
 * immediately before `bg-`, so `:not([class*=":bg-..."])` excludes them while
 * still matching a genuine BASE alpha-tint utility (`bg-amber-900/20`, which is
 * preceded by space/start, never a colon). Idempotent: the inserted
 * `[class*=":bg-..."]` is itself colon-prefixed so a re-run won't re-match.
 *
 * CSS/theme-config ONLY — no wiring/flow/logic.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS_PATH = fileURLToPath(new URL('../src/index.css', import.meta.url));
const APPLY = process.argv.includes('--apply');

const src = readFileSync(CSS_PATH, 'utf8');

// Match: [data-theme="light"|"auto"] [class*="bg-{color}-{700|800|900|950}/"]
// Capture g1 = full selector token, g2 = `bg-{color}-{shade}`.
const RE = /(\[data-theme="(?:light|auto)"\] \[class\*="(bg-[a-z]+-(?:700|800|900|950))\/"\])(?!:not)/g;

let count = 0;
const out = src.replace(RE, (m, full, key) => {
  count++;
  return `${full}:not([class*=":${key}/"])`;
});

console.log(`[fix-bg-tint] selectors matched + rewritten: ${count}`);
const sample = out.split('\n').find((l) => l.includes('bg-amber-900/') && l.includes(':not'));
console.log(`[fix-bg-tint] sample: ${sample ? sample.trim() : '(none)'}`);

if (!APPLY) {
  console.log('[fix-bg-tint] DRY RUN — pass --apply to write. No file changed.');
} else {
  writeFileSync(CSS_PATH, out, 'utf8');
  console.log(`[fix-bg-tint] WROTE ${CSS_PATH}`);
}
