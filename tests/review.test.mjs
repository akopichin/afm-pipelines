import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync, execFileSync} from 'node:child_process';
import YAML from 'yaml';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg=path.join(root,'pipelines/review');
const script=path.join(pkg,'scripts/scope.py');
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review scope '));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const repo=path.join(dir,'project'),out=path.join(repo,'.afm/runs/review/scope');
  fs.mkdirSync(repo);
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
  git('init','-q','-b','master');
  fs.writeFileSync(path.join(repo,'code.txt'),'baseline\n');
  fs.writeFileSync(path.join(repo,'.gitignore'),'ignored.txt\n');
  git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','Baseline');
  const capture=(...args)=>spawnSync('python3',[script,'--root',repo,'--output',out,...args],{encoding:'utf8'});
  const check=()=>spawnSync('python3',[script,'check','--scope',path.join(out,'scope.json')],{encoding:'utf8'});
  return {repo,out,git,capture,check};
}
function ok(result) {assert.equal(result.status,0,result.stderr || result.stdout);}

test('uncommitted scope combines index/worktree, includes untracked binary and excludes run artifacts',t=>{
  const f=fixture(t),file=path.join(f.repo,'code.txt');
  fs.writeFileSync(file,'staged\n');f.git('add','code.txt');fs.writeFileSync(file,'working\n');
  fs.writeFileSync(path.join(f.repo,'new file.txt'),'untracked\n');
  fs.writeFileSync(path.join(f.repo,'blob.bin'),Buffer.from([0,255,1]));
  fs.writeFileSync(path.join(f.repo,'ignored.txt'),'excluded');
  fs.mkdirSync(f.out,{recursive:true});fs.writeFileSync(path.join(f.out,'brief.md'),'task');
  const before=f.git('diff','--cached');
  ok(f.capture('--mode','uncommitted'));
  const files=JSON.parse(fs.readFileSync(path.join(f.out,'files.json')));
  assert.deepEqual(files.map(x=>x.path),['blob.bin','code.txt','new file.txt']);
  const patch=fs.readFileSync(path.join(f.out,'changes.patch'),'utf8');
  assert.match(patch,/working/);assert.match(patch,/untracked/);assert.match(patch,/Binary untracked file/);
  assert.equal(f.git('diff','--cached'),before);
  ok(f.check());
  fs.writeFileSync(path.join(f.out,'another-artifact.md'),'artifact');ok(f.check());
  fs.writeFileSync(path.join(f.repo,'later.txt'),'late input');assert.notEqual(f.check().status,0);
});

test('branch review uses merge base and rejects a dirty candidate or invalid ref',t=>{
  const f=fixture(t),base=f.git('rev-parse','HEAD');
  f.git('checkout','-qb','feature');fs.writeFileSync(path.join(f.repo,'code.txt'),'feature\n');
  f.git('add','.');f.git('-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','Feature');
  ok(f.capture('--mode','branch','--base','master'));
  const scope=JSON.parse(fs.readFileSync(path.join(f.out,'scope.json')));
  assert.equal(scope.merge_base,base);assert.notEqual(scope.head,base);assert.equal(scope.file_count,1);
  ok(f.check());
  fs.writeFileSync(path.join(f.repo,'code.txt'),'changed after review\n');assert.notEqual(f.check().status,0);
  fs.rmSync(f.out,{recursive:true});assert.match(f.capture('--mode','branch','--base','master').stderr,/clean checkout/);
  f.git('checkout','--','code.txt');assert.notEqual(f.capture('--mode','branch','--base','missing-ref').status,0);
});

test('file-set review supports non-Git roots and detects changed or added inputs',t=>{
  const f=fixture(t);fs.rmSync(path.join(f.repo,'.git'),{recursive:true});
  ok(f.capture('--mode','files','--path','code.txt'));ok(f.check());
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out,'scope.json'))).head,null);
  fs.writeFileSync(path.join(f.repo,'code.txt'),'updated');assert.notEqual(f.check().status,0);
  fs.rmSync(f.out,{recursive:true});
  assert.notEqual(f.capture('--mode','files','--path','../').status,0);
});

test('review candidate handles deleted paths and symlinks without reading outside the project',t=>{
  const f=fixture(t);fs.unlinkSync(path.join(f.repo,'code.txt'));
  fs.symlinkSync('/does/not/exist',path.join(f.repo,'link'));
  ok(f.capture('--mode','uncommitted'));
  const files=JSON.parse(fs.readFileSync(path.join(f.out,'files.json')));
  assert.equal(files.find(x=>x.path==='code.txt').kind,'missing');
  assert.equal(files.find(x=>x.path==='link').kind,'symlink');ok(f.check());
  assert.notEqual(f.capture('--mode','uncommitted').status,0,'capture cannot overwrite an agreed scope');
});

test('review collects exactly five declared stage helpers and publishes the final report without worktrees',()=>{
  const flow=YAML.parse(fs.readFileSync(path.join(pkg,'flow.yaml'),'utf8'));
  const config=YAML.parse(fs.readFileSync(path.join(pkg,'agents.yaml'),'utf8'));
  assert.equal(flow.worktrees,false);assert.equal(flow.team,undefined);
  assert.deepEqual(flow.stages.map(s=>s.id),['scope','review','report']);
  assert.deepEqual(flow.stages[1].depends_on,['scope']);assert.deepEqual(flow.stages[2].depends_on,['review']);
  const helpers=flow.stages[1].assistants;assert.equal(new Set(helpers.map(h=>h.profile)).size,5);
  for(const helper of helpers) {
    assert.equal(helper.trigger,'on_message');assert.equal(helper.mode,'advisory');
    assert.equal(config.collaboration.profiles[helper.profile].delegate,false);
  }
  assert(flow.stages.every(s=>s.browser===false));
  assert(flow.stages[2].artifacts.some(a=>a.path==='./report.md'));
});

test('file-set directory scope detects additions and refuses symlink traversal',t=>{
  const f=fixture(t),source=path.join(f.repo,'src');fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,'one.txt'),'one');
  ok(f.capture('--mode','files','--path','src'));ok(f.check());
  fs.writeFileSync(path.join(source,'two.txt'),'two');assert.notEqual(f.check().status,0);
  fs.rmSync(f.out,{recursive:true});
  const outside=path.join(path.dirname(f.repo),'external');fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside,'secret.txt'),'must not read');
  fs.symlinkSync(outside,path.join(f.repo,'external-link'));
  assert.notEqual(f.capture('--mode','files','--path','external-link/secret.txt').status,0);
});
