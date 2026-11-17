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
for(const name of ['dev-pipeline','dev-spec','refactor','review']) {
  test(`${name} v2 resolves complete roles and options without installation`,t=>{
    const project=temporary(t),source=path.join(root,'pipelines',name),manifest=read(path.join(source,'pipeline.yaml'));
    const config=read(path.join(source,'agents.yaml')),flow=read(path.join(source,'flow.yaml'));
    assert.equal(manifest.schema_version,2);assert.equal(manifest.version,JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8')).version);
    assert.deepEqual(Object.keys(config).sort(),['collaboration','docker']);
    for(const section of ['docker','collaboration']) assert.deepEqual(Object.keys(config[section]),[section==='docker'?'agents':'profiles']);
    const report=inspect(project,source);
    assert.equal(report.package.name,name);assert.equal(report.roles.length,Object.keys(manifest.roles).length);
    for(const [id,role] of Object.entries(manifest.roles)) {
      assert(role.command.startsWith(name+'-'));assert(role.profile.startsWith(name+'-'));
      assert.equal(config.collaboration.profiles[role.profile].command,role.command);
      assert.equal(report.roles.find(r=>r.id===id).model,config.docker.agents[role.command].model);
    }
    for(const member of flow.team || [])assert(config.collaboration.profiles[member.profile]);
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
test('dev escalation binds Fabula separately and bounds its change from verifier to writer',t=>{
  const source=path.join(root,'pipelines/dev-pipeline');
  const config=read(path.join(source,'agents.yaml')),flow=read(path.join(source,'flow.yaml'));
  const report=inspect(temporary(t),source);
  const role=report.roles.find(r=>r.id==='escalation_verifier');
  assert(role,'inspect must expose the escalation verifier for pipeline options');
  assert.equal(role.model,'claude-fable-5-1');
  const recipe=config.docker.agents[role.command];
  assert.equal(recipe.type,'claude');assert.equal(recipe.reasoning,'medium');
  assert.deepEqual(recipe.auth,{from:'env:CLAUDE_CODE_OAUTH_TOKEN',to:'env:CLAUDE_CODE_OAUTH_TOKEN'});
  const member=flow.team.find(m=>m.id==='fabula');
  assert.equal(member.profile,'dev-pipeline-escalation-verifier');assert.equal(member.title,'Фабула');
  assert.notEqual(member.profile,flow.team.find(m=>m.id==='rescue-architect').profile);
  assert.notEqual(member.profile,flow.team.find(m=>m.id==='opus').profile);
  assert.match(member.instruction,/Do not edit product files during verification/);
  assert.match(member.instruction,/ONE\s+bounded repair/);
  assert.match(member.instruction,/post_escalation_rejected_rounds >= 2/);
  assert.match(member.instruction,/first escalation and the first rejected/);
  assert.match(member.instruction,/fresh independent reviewers who did not author/);
  const protocol=fs.readFileSync(path.join(source,'skills/afm-dev-coordinator/references/diagnosis.md'),'utf8');
  assert.match(protocol,/review\.escalation_profiles\.findings_verifier/);
  assert.match(protocol,/Set\s+`escalation\.fabula_repair_used` before dispatch/);
  assert.match(protocol,/once per logical task across stages/);
  assert.match(protocol,/Infrastructure failure alone does not activate the residual repair/);
  assert.match(protocol,/Activate `fabula` ONLY when `escalation\.post_escalation_rejected_rounds >= 2`/);
  assert.match(protocol,/On the FIRST rejected post-escalation candidate,[\s\S]*?Do not activate Fabula/);
  assert.match(protocol,/Multiple\s+reviewers, findings or gates rejecting the same candidate count once/);
  for(const id of ['plan','implement','live-run']) {
    const stage=flow.stages.find(s=>s.id===id);
    assert.match(stage.prompt,/fabula/);
  }
});
test('dev coordinator snapshots contain bounded health waits and safe early replacement rules',t=>{
  const source=path.join(root,'pipelines/dev-pipeline');
  const flow=read(path.join(source,'flow.yaml'));
  const report=inspect(temporary(t),source);
  const relative='skills/afm-dev-coordinator/references/health.md';
  const health=fs.readFileSync(path.join(report.snapshot.dir,relative),'utf8');
  const coordinator=fs.readFileSync(path.join(source,'skills/afm-dev-coordinator/SKILL.md'),'utf8');
  assert.match(coordinator,/references\/health\.md/);
  assert.match(coordinator,/--deadline-seconds <1-to-300>/);
  assert(!coordinator.includes('--deadline-seconds <finite-budget>'));
  assert.match(flow.prompt,/wait windows of at most 300 seconds/);
  assert.match(flow.prompt,/absolute task deadline separate/);
  for(const id of ['implement','live-run']) {
    assert.match(flow.stages.find(s=>s.id===id).prompt,/windows <= 300 seconds/);
  }
  assert.match(health,/min\(300, remaining task budget\)/);
  assert.match(health,/never register a zero-second wait/);
  assert.match(health,/After a window expires,[\s\S]*?one NEW window for still-unanswered requests/);
  assert.match(health,/do not resend or restart the healthy work/);
  assert.match(health,/Window expiry is a health checkpoint, not a task timeout/);
  assert.match(health,/five minutes of silence alone does not prove a hang/);
  assert.match(health,/Confirm the old writer AND its modifying\s+commands have stopped/);
  assert.match(health,/One automatic replacement per logical assignment/);
  assert.match(health,/Infrastructure failures are not product rejection rounds/);
});
for (const name of ['dev-pipeline', 'dev-spec']) {
  test(`${name} bootstrap runs in a linked worktree with only AFM_PIPELINE_DIR`,t=>{
    const project=temporary(t),run=path.join(project,'.afm/runs/test'),stage=path.join(run,'bootstrap');
    const git=(...args)=>execFileSync('git',['-C',project,...args],{encoding:'utf8'}).trim();
    git('init','-q');fs.writeFileSync(path.join(project,'README.md'),'Fixture');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','Fixture');
    const worktree=path.join(project,'linked worktree');git('worktree','add','-qb','fixture',worktree);fs.mkdirSync(stage,{recursive:true});
    const source=path.join(root,'pipelines',name),flow=read(path.join(source,'flow.yaml'));
    const result=spawnSync('sh',['-c',flow.stages[0].script],{cwd:worktree,env:{...process.env,AFM_PIPELINE_DIR:source,AFM_STAGE_DIR:stage},encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);
    for(const file of ['helper.py','flow.yaml','metadata.json','project-contract.md','planning/workbench.mjs'])assert(fs.existsSync(path.join(stage,file)),file);
    if (name === 'dev-spec') assert(fs.existsSync(path.join(stage,'spec_contract.py')));
    assert(!fs.existsSync(path.join(project,'pipelines')));
  });
}
