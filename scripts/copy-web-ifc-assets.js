// scripts/copy-web-ifc-assets.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'node_modules', 'web-ifc');
const dstDir = path.join(__dirname, '..', 'public', 'web-ifc');

fs.mkdirSync(dstDir, { recursive: true });

const files = ['web-ifc.wasm', 'web-ifc-mt.wasm', 'web-ifc.worker.js'];

let copied = 0;
for (const f of files) {
  const src = path.join(srcDir, f);
  const dst = path.join(dstDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    copied++;
    console.log(`[web-ifc] copied ${f}`);
  }
}

if (copied === 0) {
  console.warn('[web-ifc] No assets copied. Check node_modules/web-ifc contents.');
}
