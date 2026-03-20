#!/usr/bin/env node
// Fail if any api/ TypeScript file uses a relative import without explicit .js extension.
// Required for Vercel Node ESM (ERR_MODULE_NOT_FOUND on extensionless specifiers).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, '..', 'api');

const REL_IMPORT = /from\s+['"](\.\.?\/[^'"]+)['"]/g;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (name.isFile() && name.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const issues = [];
if (!fs.existsSync(apiRoot)) {
  console.error('check-api-esm-imports: api/ not found');
  process.exit(1);
}

for (const file of walk(apiRoot)) {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  REL_IMPORT.lastIndex = 0;
  while ((m = REL_IMPORT.exec(text)) !== null) {
    const spec = m[1];
    if (!spec.endsWith('.js')) {
      issues.push({ file, spec, line: text.slice(0, m.index).split('\n').length });
    }
  }
}

if (issues.length) {
  console.error('check-api-esm-imports: relative imports must use .js extension for Node ESM on Vercel:\n');
  for (const { file, spec, line } of issues) {
    console.error(`  ${path.relative(process.cwd(), file)}:${line}  from '${spec}'`);
  }
  process.exit(1);
}

console.log('check-api-esm-imports: OK (all relative imports use .js)');
