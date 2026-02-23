// scripts/copy-web-ifc-assets.js
// Copy web-ifc WASM/worker assets to public for browser (SetWasmPath('/web-ifc/')).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const nodeModules = path.join(root, 'node_modules', 'web-ifc');

const candidates = [
  path.join(nodeModules),
  path.join(nodeModules, 'dist'),
  path.join(nodeModules, 'build'),
];

const assetNames = [
  'web-ifc.wasm',
  'web-ifc-api.js',
  'web-ifc-mt.wasm',
  'web-ifc-mt.worker.js',
  'web-ifc-mt.worker.mjs',
  'web-ifc.worker.js',
];

const dstDir = path.join(root, 'public', 'web-ifc');
fs.mkdirSync(dstDir, { recursive: true });

const copied = [];
for (const name of assetNames) {
  for (const dir of candidates) {
    const src = path.join(dir, name);
    if (fs.existsSync(src)) {
      const dst = path.join(dstDir, name);
      fs.copyFileSync(src, dst);
      copied.push(name);
      console.log(`[web-ifc] copied ${name}`);
      break;
    }
  }
}

if (copied.length > 0) {
  console.log(`[web-ifc] Copied ${copied.length} file(s): ${copied.join(', ')}`);
} else {
  console.warn('[web-ifc] No assets copied. Check node_modules/web-ifc (and dist/build) contents.');
}
