import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const main = readFileSync('src/filler-main.jsx', 'utf8');
const cfg = readFileSync('vite.filler.config.js', 'utf8');
const html = readFileSync('filler.html', 'utf8');

describe('filler standalone — isolation contract', () => {
  it('filler-main imports ONLY FillerSimulator (no App/firebase/index.css)', () => {
    expect(main).toMatch(/from '\.\/pages\/FillerSimulator\.jsx'/);
    // strip comments — assert on real code, not the explanatory comment
    const code = main.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/App\.jsx/);
    expect(code).not.toMatch(/firebase/i);
    expect(code).not.toMatch(/index\.css/);
  });

  it('vite.filler.config builds -> dist-filler from filler.html with public-filler assets', () => {
    expect(cfg).toMatch(/outDir:\s*'dist-filler'/);
    expect(cfg).toMatch(/input:\s*'filler\.html'/);
    expect(cfg).toMatch(/publicDir:\s*'public-filler'/);
  });

  it('obfuscator scope = formula files ONLY; FillerSimulator/Filler3D EXCLUDED so the 3D lazy import stays literal', () => {
    const incMatch = cfg.match(/include:\s*\[([^\]]*)\]/);
    expect(incMatch).toBeTruthy();
    const include = incMatch[1];
    expect(include).toContain('fillerMath.js');        // the formula constants
    expect(include).toContain('FillerGraphic2D.jsx');  // shape geometry
    // FillerSimulator hosts import('Filler3D.jsx'); obfuscating it mangles the
    // literal -> three never code-splits -> 3D 404s. Both MUST stay unobfuscated.
    expect(include).not.toContain('FillerSimulator.jsx');
    expect(include).not.toContain('Filler3D.jsx');
  });

  it('filler.html has share meta + favicon, and NO inline JS (keeps CSP script-src self)', () => {
    expect(html).toMatch(/og:image/);
    expect(html).toMatch(/og:title/);
    expect(html).toMatch(/og:description/);
    expect(html).toMatch(/<link rel="icon"/);
    // the only <script> is the module entry (has attributes); no bare inline <script>JS
    expect(html).not.toMatch(/<script>[^<]/);
  });
});
