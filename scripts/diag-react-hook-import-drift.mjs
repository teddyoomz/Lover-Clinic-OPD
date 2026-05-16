#!/usr/bin/env node
// Rule R diagnostic — V80 (2026-05-16 NIGHT+4) class-of-bug expansion for
// `useMemo not defined` ChatPanel.jsx crash. Scans every .js/.jsx/.ts/.tsx
// under src/ + api/ for React hooks that are USED but NOT imported from 'react'.
//
// Catches the exact class as ChatPanel.jsx V78 saga — V78 added useMemo() calls
// inside useChatUnread() but forgot to add useMemo to the line-1 import.
// Build passes (Vite doesn't static-check identifiers); runtime ReferenceError
// crashes the component which (without ErrorBoundary) takes down the whole tree.
//
// Read-only — exits non-zero if any drift found.
import fs from 'node:fs';
import path from 'node:path';

const HOOKS = [
  'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo',
  'useLayoutEffect', 'useId', 'useTransition', 'useDeferredValue',
  'useSyncExternalStore', 'useContext', 'useReducer',
  'useImperativeHandle', 'useDebugValue', 'useInsertionEffect',
];

const ROOTS = ['src', 'api'];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = path.join(dir, entry);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const files = [];
for (const root of ROOTS) walk(root, files);
const issues = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  // Match BOTH `import { X } from 'react'` AND `import React, { X } from 'react'`.
  const reactImport = src.match(/^import(?:\s+\w+\s*,)?\s*\{([^}]+)\}\s*from\s*['"]react['"]/m);
  const imported = reactImport
    ? reactImport[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)
    : [];
  const codeOnly = stripComments(src);
  for (const hook of HOOKS) {
    const re = new RegExp(`\\b${hook}\\s*\\(`, 'g');
    if (re.test(codeOnly) && !imported.includes(hook)) {
      // Also skip files that destructure from React.X pattern (rare)
      const dotForm = new RegExp(`React\\.${hook}\\s*\\(`).test(codeOnly);
      if (dotForm) continue;
      issues.push({ file, hook, importedFromReact: imported });
    }
  }
}

console.log(`Scanned: ${files.length} files`);
console.log(`Drift instances found: ${issues.length}`);
for (const i of issues) {
  console.log(`  ${i.file} :: uses ${i.hook} but imports only [${i.importedFromReact.join(', ')}]`);
}

if (issues.length > 0) process.exit(1);
process.exit(0);
