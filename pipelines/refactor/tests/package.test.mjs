import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import YAML from 'yaml';
import {freeze, verifySnapshot} from '../scripts/freeze.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = name => YAML.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const flow = read('flow.yaml'), config = read('config.example.yaml');
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor package '));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  return dir;
}
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], {encoding:'utf8', stdio:['ignore','pipe','pipe']});

test('package manifest, models and auth references agree with the validated AFM flow', t => {
  const manifest = read('pipeline.yaml'), metadata = read('package.json');
  assert.equal(manifest.version, metadata.version);
  assert.equal(manifest.entrypoint, 'flow.yaml');
  for (const role of manifest.setup.models) {
    assert(flow.team.some(member => member.profile === role.profile));
    assert.equal(config.collaboration.profiles[role.profile].command, role.command);
    assert.equal(config.docker.agents[role.command].model, role.model);
    const auth = config.docker.agents[role.command].auth;
    if (auth) for (const key of ['from','to']) assert.match(auth[key], /^env:[A-Za-z_][A-Za-z0-9_]*$/);
  }
  for (const skill of manifest.setup.skills) assert(fs.existsSync(path.join(root, skill.source, 'SKILL.md')));
  const project = temporary(t);fs.mkdirSync(path.join(project,'.afm'));
  fs.writeFileSync(path.join(project,'.afm/config.yaml'), YAML.stringify(config));
  const afm = process.env.AFM_BIN || 'afm';
  const result = spawnSync(afm, ['--dir',project,'validate',path.join(root,'flow.yaml')], {encoding:'utf8'});
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  const broken = structuredClone(flow);broken.team[0].profile = 'missing-test-profile-'+path.basename(project).replace(/[^a-z0-9-]/g,'');
  const file = path.join(project,'invalid.yaml');fs.writeFileSync(file,YAML.stringify(broken));
  assert.notEqual(spawnSync(afm,['--dir',project,'validate',file],{encoding:'utf8'}).status,0,'Missing architect must fail validation');
});

test('analysis gate resolves its sibling artifacts from an unrelated working directory and fails closed', t => {
  const gate = flow.stages.find(stage => stage.id === 'validate-analysis');
  assert(gate.script && gate.depends_on.includes('analyze'));
  assert(flow.stages.find(stage => stage.id === 'workshop').depends_on.includes(gate.id));
  const run = temporary(t), toolkit = path.join(run,'scope/toolkit/scripts'), analyze = path.join(run,'analyze');
  fs.mkdirSync(toolkit,{recursive:true});fs.mkdirSync(analyze);
  const receipt = JSON.stringify(path.join(analyze,'source.json'));
  fs.writeFileSync(path.join(toolkit,'workbench.mjs'), `import assert from 'node:assert/strict';assert.deepEqual(process.argv.slice(2),['check-source','--receipt',${receipt}]);`);
  fs.writeFileSync(path.join(toolkit,'consensus.cjs'), `require('node:assert/strict').deepEqual(process.argv.slice(2),['check','--stage',${JSON.stringify(analyze)}]);console.log('checked-analysis');`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('AFM_')));
  env.AFM_STAGE_DIR=path.join(run,gate.id);
  const execute=()=>spawnSync('sh',['-c',gate.script],{cwd:os.tmpdir(),env,encoding:'utf8'});
  assert.match(execute().stdout,/checked-analysis/);
  fs.writeFileSync(path.join(toolkit,'consensus.cjs'),'process.exit(17);');assert.equal(execute().status,17);
  fs.writeFileSync(path.join(toolkit,'workbench.mjs'),'process.exit(19);');
  fs.writeFileSync(path.join(toolkit,'consensus.cjs'),"console.log('must-not-run');");
  const failed=execute();assert.equal(failed.status,19);assert(!failed.stdout.includes('must-not-run'));
});

test('a relocated package freezes from the main checkout, survives updates and builds without catalog files', t => {
  const project=temporary(t);
  git(project,'init','-q');fs.writeFileSync(path.join(project,'README.md'),'Fixture project\n');git(project,'add','README.md');
  git(project,'-c','user.name=Package Test','-c','user.email=package-test@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture');
  const worktree=path.join(project,'worktree with spaces');git(project,'worktree','add','-q','-b','test-worktree',worktree);
  const installed=path.join(project,'pipelines/refactor');fs.mkdirSync(path.dirname(installed),{recursive:true});
  fs.cpSync(root,installed,{recursive:true,filter:source=>!path.relative(root,source).split(path.sep).includes('node_modules')});
  const scope=path.join(project,'.afm/runs/test/scope'),bin=path.join(project,'test-bin');fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,'strictacode'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  const env={...process.env,AFM_STAGE_DIR:scope,PATH:bin+path.delimiter+process.env.PATH};
  const hook=flow.stages.find(stage=>stage.id==='scope').script_before;
  const runHook=()=>spawnSync('sh',['-c',hook],{cwd:worktree,env,encoding:'utf8'});
  const first=runHook();assert.equal(first.status,0,first.stderr);
  const snapshot=path.join(scope,'toolkit'),receipt=verifySnapshot(snapshot);
  assert(receipt.files['ui/template.html']&&receipt.files['skills/strictacode/SKILL.md']);
  assert(!Object.keys(receipt.files).some(name=>name.startsWith('tests/')||name.includes('node_modules')));
  fs.appendFileSync(path.join(installed,'ui/template.html'),'\nsource changed');
  assert.equal(runHook().status,0);assert.deepEqual(verifySnapshot(snapshot),receipt);
  fs.rmSync(installed,{recursive:true,force:true});assert.equal(runHook().status,0,'Retry needs only the frozen package');
  const output=path.join(project,'preview.html');
  execFileSync(process.execPath,[path.join(snapshot,'scripts/workbench.mjs'),'build','--input',path.join(snapshot,'examples/example.json'),'--output',output],{cwd:os.tmpdir()});
  assert(fs.readFileSync(output,'utf8').includes('impeccable-refinement'),'Approved UI is bundled in the portable package');
  fs.appendFileSync(path.join(snapshot,'ui/template.html'),'\ncorrupt');
  const corrupt=runHook();assert.notEqual(corrupt.status,0);assert.match(corrupt.stderr,/snapshot changed/);
});

test('failed snapshots never publish partial files and refuse external symlinks', t => {
  const project=temporary(t),source=path.join(project,'source'),stage=path.join(project,'scope');fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({version:'test',afmRuntimeFiles:['first.txt','missing.txt']}));
  fs.writeFileSync(path.join(source,'first.txt'),'first');
  assert.throws(()=>freeze(stage,source),/ENOENT/);assert(!fs.existsSync(path.join(stage,'toolkit')));
  assert.deepEqual(fs.readdirSync(stage),[]);
  fs.symlinkSync(path.join(source,'first.txt'),path.join(source,'missing.txt'));
  assert.throws(()=>freeze(stage,source),/not links/);assert(!fs.existsSync(path.join(stage,'toolkit')));
  assert.throws(()=>freeze('relative stage',source),/must be absolute/);
});
