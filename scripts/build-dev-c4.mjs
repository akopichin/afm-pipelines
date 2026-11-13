import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destination = path.join(root,'pipelines/dev-pipeline/planning/vendor/c4');
fs.mkdirSync(destination,{recursive:true});
for (const [source,name] of [
  ['elkjs/lib/elk.bundled.js','elk.cjs'], ['elkjs/LICENSE.md','elk-LICENSE.txt'],
  ['@resvg/resvg-wasm/index.mjs','resvg.mjs'], ['@resvg/resvg-wasm/index_bg.wasm','resvg.wasm'],
]) fs.copyFileSync(path.join(root,'node_modules',source),path.join(destination,name));
console.log('Copied locked C4 layout and rasterizer bundles; font and license provenance is in vendor/c4/README.md.');
