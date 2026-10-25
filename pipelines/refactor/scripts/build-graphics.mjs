import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';

const directory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-graphics-'));
try {
  for (const name of ['package.json', 'package-lock.json', 'graphics.mjs', 'layout.cjs', 'diagram.mjs', 'relations.mjs'])
    fs.copyFileSync(path.join(directory, name.endsWith('.json') ? name : 'ui/' + name), path.join(temp, name));
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: temp, stdio: 'inherit'});
  const {build} = await import(pathToFileURL(path.join(temp, 'node_modules/esbuild/lib/main.js')));
  const output = path.join(directory, 'ui/vendor');
  fs.mkdirSync(output, {recursive: true});
  await build({entryPoints: [path.join(temp, 'graphics.mjs')], bundle: true, minify: true,
    format: 'iife', globalName: 'RefactorGraphics', target: 'es2020', legalComments: 'inline',
    outfile: path.join(output, 'graph.js')});
  const licenses = [];
  function collect(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(filename);
      else if (/^(license|copying)(\.|$)/i.test(entry.name))
        licenses.push(path.relative(path.join(temp, 'node_modules'), filename) + '\n' + fs.readFileSync(filename, 'utf8'));
    }
  }
  collect(path.join(temp, 'node_modules'));
  fs.writeFileSync(path.join(output, 'LICENSES.txt'), licenses.join('\n\n----------------\n\n'));
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
