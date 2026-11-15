import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync, execFileSync} from 'node:child_process';
import YAML from 'yaml';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=file=>YAML.parse(fs.readFileSync(file,'utf8'));
const afm=process.env.AFM_BIN||'afm';
function temporary(t) {const p=fs.mkdtempSync(path.join(os.tmpdir(),'pipeline v2 '));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
function inspect(project,source,options) {
  const args=['--dir',project,'pipelines','inspect',source,'--json'];
  if(options)args.push('--pipeline-options',options);
  const result=spawnSync(afm,args,{encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);
  return JSON.parse(result.stdout);
}
for(const name of ['dev-pipeline','refactor']) {
  test(`${name} v2 resolves complete roles and options without installation`,t=>{
    const project=temporary(t),source=path.join(root,'pipelines',name),manifest=read(path.join(source,'pipeline.yaml'));
    const config=read(path.join(source,'agents.yaml')),flow=read(path.join(source,'flow.yaml'));
    assert.equal(manifest.schema_version,2);assert.equal(manifest.version,'2.0.1');
    assert.deepEqual(Object.keys(config).sort(),['collaboration','docker']);
    for(const section of ['docker','collaboration']) assert.deepEqual(Object.keys(config[section]),[section==='docker'?'agents':'profiles']);
    const report=inspect(project,source);
    assert.equal(report.package.name,name);assert.equal(report.roles.length,Object.keys(manifest.roles).length);
    for(const [id,role] of Object.entries(manifest.roles)) {
      assert(role.command.startsWith(name+'-'));assert(role.profile.startsWith(name+'-'));
      assert.equal(config.collaboration.profiles[role.profile].command,role.command);
      assert.equal(report.roles.find(r=>r.id===id).model,config.docker.agents[role.command].model);
    }
    for(const member of flow.team)assert(config.collaboration.profiles[member.profile]);
    const chosen=Object.values(manifest.roles)[0].command,options=path.join(project,'options.yaml');
    fs.writeFileSync(options,YAML.stringify({docker:{agents:{[chosen]:{type:'codex',model:'test-override-model',reasoning:'high'}}}}));
    const customized=inspect(project,source,options);
    assert.equal(customized.roles.find(r=>r.command===chosen).model,'test-override-model');
    assert.equal(customized.snapshot.sha256,report.snapshot.sha256);
    assert(!fs.existsSync(path.join(project,'.afm/config.yaml')));assert(!fs.existsSync(path.join(project,'pipelines')));
    assert(!JSON.stringify(flow).match(/__[A-Z_]+__/));
  });
}
test('Git loading pins a revision and includes runtime resources without catalog dependencies',t=>{
  const repo=temporary(t),project=temporary(t),name='dev-pipeline';
  const source=path.join(root,'pipelines',name),manifest=read(path.join(source,'pipeline.yaml'));
  const pkg=path.join(repo,'pipelines',name);fs.mkdirSync(pkg,{recursive:true});
  for(const file of ['pipeline.yaml',manifest.entrypoint,manifest.agents,...manifest.resources])fs.cpSync(path.join(source,file),path.join(pkg,file),{recursive:true});
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
  git('init','-q');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','Fixture');
  const commit=git('rev-parse','HEAD'),report=inspect(project,`file://${repo}//pipelines/${name}@${commit}`);
  assert.equal(report.commit,commit);assert.equal(report.package.schema_version,2);
  assert(report.snapshot.dir);assert(!fs.existsSync(path.join(project,'pipelines')));
});
test('dev bootstrap runs in a linked worktree with only AFM_PIPELINE_DIR',t=>{
  const project=temporary(t),run=path.join(project,'.afm/runs/test'),stage=path.join(run,'bootstrap');
  const git=(...args)=>execFileSync('git',['-C',project,...args],{encoding:'utf8'}).trim();
  git('init','-q');fs.writeFileSync(path.join(project,'README.md'),'Fixture');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','Fixture');
  const worktree=path.join(project,'linked worktree');git('worktree','add','-qb','fixture',worktree);fs.mkdirSync(stage,{recursive:true});
  const source=path.join(root,'pipelines/dev-pipeline'),flow=read(path.join(source,'flow.yaml'));
  const result=spawnSync('sh',['-c',flow.stages[0].script],{cwd:worktree,env:{...process.env,AFM_PIPELINE_DIR:source,AFM_STAGE_DIR:stage},encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);
  for(const file of ['helper.py','flow.yaml','metadata.json','project-contract.md','planning/workbench.mjs'])assert(fs.existsSync(path.join(stage,file)),file);
  assert(!fs.existsSync(path.join(project,'pipelines')));
});
