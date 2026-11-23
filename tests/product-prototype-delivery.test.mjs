import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import YAML from 'yaml';

const packageDir = fileURLToPath(new URL('../pipelines/product-prototype-build/', import.meta.url));
const exportScript = path.join(packageDir, 'scripts/export-delivery.py');

function write(dir, name, contents) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
}

function read(dir, name) {
  return fs.readFileSync(path.join(dir, name), 'utf8');
}

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prototype project '));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

function setupRun(dir, id, prototype) {
  const run = path.join(dir, '.afm/runs', id);
  const delivery = path.join(run, 'delivery');
  write(run, 'live-qa/check result.md', '# QA\n');
  write(delivery, 'behavior.md', '[QA](../live-qa/check%20result.md#qa) [Prototype](prototype/index.html)\n');
  write(delivery, 'design-system.md', '# Design system\n');
  write(delivery, 'design-system/index.html', '<a href="../prototype/index.html">Prototype</a>');
  write(delivery, 'prototype/index.html', prototype);
  write(delivery, 'execution_summary.md', '# Complete\n');
  write(delivery, 'artifacts/checks.md', '# Checks\n');
  write(delivery, 'verify/v-pass/report.md', '# Pass\n');
  write(delivery, 'verify/v-pass/agent.log', 'Internal output');
  write(delivery, 'autonomous.log', 'Internal output');
  return run;
}

test('publishes results after delivery, preserves evidence links and keeps previous bundles', t => {
  const flow = YAML.parse(read(packageDir, 'flow.yaml'));
  const stage = flow.stages.at(-1);
  assert.deepEqual(stage.depends_on, ['delivery']);
  const dir = project(t);
  const run = setupRun(dir, 'run-1', '<h1>One</h1>');
  const target = path.join(dir, 'delivery');
  const invoke = runDir => execFileSync('sh', ['-eu', '-c', stage.script], {
    env: {...process.env, AFM_PIPELINE_DIR: packageDir, AFM_STAGE_DIR: path.join(runDir, stage.id)},
    encoding: 'utf8',
  });

  assert.match(invoke(run), /Delivery saved to/);
  assert.equal(read(target, 'prototype/index.html'), '<h1>One</h1>');
  assert.equal(read(target, 'verify/v-pass/report.md'), '# Pass\n');
  assert.equal(read(target, 'artifacts/checks.md'), '# Checks\n');
  assert(!fs.existsSync(path.join(target, 'verify/v-pass/agent.log')));
  assert(!fs.existsSync(path.join(target, 'autonomous.log')));
  assert.equal(read(target, 'behavior.md'),
    '[QA](../.afm/runs/run-1/live-qa/check%20result.md#qa) [Prototype](prototype/index.html)\n');
  assert.match(read(run, 'delivery/behavior.md'), /\]\(\.\.\/live-qa\//);

  invoke(run);
  assert(!fs.existsSync(path.join(target, 'run-1')));
  const nextRun = setupRun(dir, 'run-2', '<h1>Two</h1>');
  invoke(nextRun);
  assert.equal(read(target, 'prototype/index.html'), '<h1>One</h1>');
  assert.equal(read(target, 'run-2/prototype/index.html'), '<h1>Two</h1>');
  assert.match(read(target, 'run-2/behavior.md'), /\]\(\.\.\/\.\.\/\.afm\/runs\/run-2\//);
});

test('fails without creating a partial bundle when a required file is missing', t => {
  const dir = project(t);
  const run = setupRun(dir, 'run-1', '<h1>One</h1>');
  fs.unlinkSync(path.join(run, 'delivery/behavior.md'));
  const result = spawnSync('python3', ['-B', exportScript, run], {encoding: 'utf8'});
  assert.equal(result.status, 1, result.error?.message);
  assert.match(result.stderr, /Missing delivery file.*behavior\.md/);
  assert.deepEqual(fs.readdirSync(dir), ['.afm']);
});
