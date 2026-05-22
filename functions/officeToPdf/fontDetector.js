// functions/officeToPdf/fontDetector.js
//
// (2026-05-23 EOD+1 — V110 font-fidelity observability) Extracts the list of
// fonts an Office docx requires + checks which are installed in the container.
// Run BEFORE invoking Gotenberg so we can:
//   (a) log what fonts THIS doc needs (analytics for future baked-in additions)
//   (b) catch font-mismatch issues PROACTIVELY in the function logs
//   (c) prepare runtime-download (Phase 2, deferred)
//
// Pure JS — no firebase deps. Tested via tests/v110-font-detector.test.js.
//
// Inputs: a `.docx` file's bytes (Buffer) — the same buffer we send to Gotenberg.
// Outputs:
//   {
//     declared: ['Cordia New', 'TH Sarabun PSK', ...],   // from fontTable.xml + theme1.xml
//     theme: { Thai: 'Cordia New', Arab: 'Times New Roman', ... },  // theme map
//     installed: ['Loma', 'Garuda', 'TH Sarabun PSK', ...],  // fc-list result (cached)
//     missing: ['Cordia New'],                            // declared - installed - aliased
//     aliased: ['Cordia New→Loma', ...],                  // resolved via fontconfig
//   }

import { unzipSync, strFromU8 } from 'fflate';
import { execSync } from 'child_process';

// Cache fc-list output per warm instance — Cloud Run instances are reused so
// the list rarely changes within an instance lifetime.
let _installedFontsCache = null;

export function listInstalledFonts() {
  if (_installedFontsCache) return _installedFontsCache;
  try {
    // `fc-list : family` outputs one font family per line. Some are
    // comma-separated for aliases (e.g., "Loma,Loma:style=Regular"). We split
    // on comma + dedupe.
    const out = execSync('fc-list : family', { encoding: 'utf-8', timeout: 5000 });
    const set = new Set();
    out.split('\n').forEach(line => {
      line.split(',').forEach(name => {
        const trimmed = name.trim();
        if (trimmed) set.add(trimmed);
      });
    });
    _installedFontsCache = [...set].sort();
  } catch {
    _installedFontsCache = []; // graceful: if fc-list fails, return empty
  }
  return _installedFontsCache;
}

// Resolve a font name through fontconfig — returns the actual font fontconfig
// would substitute. e.g., "Cordia New" → "Loma" (via our 99-thai-substitute.conf).
// If fontconfig isn't available or the lookup fails, returns null.
export function resolveFontAlias(name) {
  if (!name || typeof name !== 'string') return null;
  // fc-match -s '<family>' prints the substitution chain. The first non-input
  // line is the resolved family. fc-match -f '%{family}\n' returns just the name.
  try {
    const safe = name.replace(/[^A-Za-z0-9 _.-]/g, '');
    if (!safe) return null;
    const out = execSync(`fc-match -f "%{family}" "${safe}"`, {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// Parse fontTable.xml + theme1.xml from a docx Buffer.
// Returns { declared: string[], theme: {[script]: family} }
export function extractFontsFromDocxBuffer(buf) {
  if (!buf || !Buffer.isBuffer(buf)) {
    return { declared: [], theme: {}, error: 'invalid-buffer' };
  }
  let entries;
  try {
    entries = unzipSync(new Uint8Array(buf));
  } catch (e) {
    return { declared: [], theme: {}, error: `unzip-failed: ${e.message}` };
  }

  const declared = new Set();
  const theme = {};

  // 1. word/fontTable.xml — explicitly declared fonts
  const fontTable = entries['word/fontTable.xml'];
  if (fontTable) {
    const xml = strFromU8(fontTable);
    const matches = xml.matchAll(/<w:font\s+w:name="([^"]+)"/g);
    for (const m of matches) declared.add(m[1]);
  }

  // 2. word/theme/theme1.xml — theme font definitions (the `minorBidi` /
  //    `majorBidi` scheme references for CTL scripts; this is where Thai's
  //    actual font is specified for theme-driven docs).
  const themeXml = entries['word/theme/theme1.xml'];
  if (themeXml) {
    const xml = strFromU8(themeXml);
    const matches = xml.matchAll(/<a:font\s+script="([^"]+)"\s+typeface="([^"]+)"/g);
    for (const m of matches) {
      theme[m[1]] = m[2];
      declared.add(m[2]);
    }
    // Major/minor latin (the default body font) — typically in <a:latin typeface="..."/>
    const latinMatches = xml.matchAll(/<a:latin\s+typeface="([^"]+)"/g);
    for (const m of latinMatches) declared.add(m[1]);
  }

  return { declared: [...declared].sort(), theme };
}

// Top-level diagnostic — returns the full report shape.
export function analyzeFontRequirements(buf) {
  const { declared, theme, error } = extractFontsFromDocxBuffer(buf);
  if (error) return { declared: [], theme: {}, installed: [], missing: [], aliased: [], error };
  const installed = listInstalledFonts();
  const installedLower = new Set(installed.map(f => f.toLowerCase()));
  const missing = [];
  const aliased = [];
  for (const name of declared) {
    if (installedLower.has(name.toLowerCase())) continue;
    // Not directly installed — check fontconfig alias resolution
    const resolved = resolveFontAlias(name);
    if (resolved && resolved.toLowerCase() !== name.toLowerCase()
        && installedLower.has(resolved.toLowerCase())) {
      aliased.push(`${name}→${resolved}`);
    } else {
      missing.push(name);
    }
  }
  return { declared, theme, installed, missing, aliased };
}

// For test injection only. Reset the installed-fonts cache.
export function _resetInstalledFontsCache() {
  _installedFontsCache = null;
}
