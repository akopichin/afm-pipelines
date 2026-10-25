import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import YAML from 'yaml';
import {catalog,inspect,planInstall,planRemove,apply,verify,recover} from '../scripts/pipelines.mjs';
import {freeze} from '../pipelines/refactor/scripts/freeze.mjs';

const require = createRequire(import.meta.url);
function fixture(t) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pipeline install ')));
  const home=process.env.HOME;process.env.HOME=path.join(root,'home');fs.mkdirSync(process.env.HOME);
  t.after(()=>{process.env.HOME=home;fs.rmSync(root,{recursive:true,force:true});});
  const project=path.join(root,'project with spaces');fs.mkdirSync(project);
  execFileSync('git',['init','-q',project]);
  fs.writeFileSync(path.join(project,'README.md'),'Fixture\n');
  const read=name=>fs.readFileSync(path.join(project,name),'utf8');
  const write=(name,text)=>{const file=path.join(project,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
  write('.afm/config.yaml','# Keep this comment\nexecutor:\n  max_parallel: 7\n');
  return {root,project,read,write};
}

test('install, configure independent models, repeat, update and remove with actual AFM validation',t=>{
  const f=fixture(t), options={skills:['claude','codex'],roles:{architect_a:{client:'codex',model:'my-model',reasoning:'high'}}};
  const plan=planInstall({project:f.project,name:'refactor',options});
  assert(!fs.existsSync(path.join(f.project,'pipelines')),'Planning is read-only');
  assert.equal(plan.receipt.bindings.architect_a.client,'codex');
  apply(plan);
  assert.match(f.read('.afm/config.yaml'),/# Keep this comment/);
  assert.equal(YAML.parse(f.read('.afm/config.yaml')).executor.max_parallel,7);
  assert(fs.existsSync(path.join(f.project,'.agents/skills/strictacode/SKILL.md')));
  assert(fs.existsSync(path.join(f.project,'.claude/skills/strictacode/SKILL.md')));
  assert.equal(verify(f.project,'refactor').status,'validated');
  assert.equal(execFileSync('git',['-C',f.project,'check-ignore','.afm/config.yaml'],{encoding:'utf8'}).trim(),'.afm/config.yaml');
  const again=planInstall({project:f.project,name:'refactor'});
  assert.equal(again.writes.length,0);assert.equal(again.patches.length,0);
  assert.equal(again.receipt.bindings.architect_a.model,'my-model');
  apply(again);
  const oldProfile=again.receipt.bindings.architect_a.profile;
  const update=planInstall({project:f.project,name:'refactor',options:{roles:{architect_a:{model:'new-model'}}}});
  apply(update);
  const config=YAML.parse(f.read('.afm/config.yaml'));
  assert(config.collaboration.profiles[oldProfile],'Old runs retain their command/profile');
  assert.equal(update.receipt.bindings.architect_a.client,'codex','Partial options keep prior client choice');
  f.write('docs/superpowers/refactors/saved/plan.md','Keep this plan');
  apply(planRemove({project:f.project,name:'refactor'}));
  assert.equal(f.read('docs/superpowers/refactors/saved/plan.md'),'Keep this plan');
  assert(!fs.existsSync(path.join(f.project,'pipelines/refactor/flow.yaml')));
  assert.equal(YAML.parse(f.read('.afm/config.yaml')).executor.max_parallel,7);
});

test('stale plans, edited files and configuration conflicts do not overwrite user changes',t=>{
  const f=fixture(t), plan=planInstall({project:f.project,name:'refactor'});
  f.write('.afm/config.yaml',f.read('.afm/config.yaml')+'# User edit\n');
  assert.throws(()=>apply(plan),/Configuration changed/);
  assert(!fs.existsSync(path.join(f.project,'pipelines')));
  apply(planInstall({project:f.project,name:'refactor'}));
  f.write('pipelines/refactor/README.md','My notes');
  assert.throws(()=>planInstall({project:f.project,name:'refactor'}),/Local file conflict/);
  assert.throws(()=>planRemove({project:f.project,name:'refactor'}),/Local file conflict/);
  assert.equal(f.read('pipelines/refactor/README.md'),'My notes');
});

test('failed AFM validation rolls back all files and preserves exact configuration',t=>{
  const f=fixture(t), before=f.read('.afm/config.yaml');
  const plan=planInstall({project:f.project,name:'refactor'});
  const saved=process.env.AFM_BIN;process.env.AFM_BIN='/nonexistent/afm-test';
  try { assert.throws(()=>apply(plan),/AFM validation failed/); }
  finally { if(saved)process.env.AFM_BIN=saved;else delete process.env.AFM_BIN; }
  assert.equal(f.read('.afm/config.yaml'),before);
  assert(!fs.existsSync(path.join(f.project,'pipelines/refactor/flow.yaml')));
  assert(!fs.existsSync(path.join(f.project,'.afm/pipelines/receipts/refactor.json')));
  assert(!fs.existsSync(path.join(f.project,'.afm/pipelines/apply.lock')));
});

test('different packages can copy one shared profile without modifying its other consumers',t=>{
  const f=fixture(t);
  const shared={title:'Shared reviewer',command:'shared-review'};
  const settings={collaboration:{profiles:{shared}},docker:{agents:{'shared-review':{type:'codex',model:'shared-model',reasoning:'medium'}}}};
  f.write('.afm/config.yaml',YAML.stringify(settings));
  const root=path.join(f.root,'catalog');fs.mkdirSync(path.join(root,'pipelines'),{recursive:true});
  const second=path.join(root,'pipelines/review');fs.mkdirSync(second);
  const manifest={schema_version:1,name:'review',version:'1',entrypoint:'flow.yaml',installation:{project_path:'pipelines/review',configuration_example:'config.example.yaml'},
    setup:{models:[{role:'reviewer',team_member:'reviewer',profile:'default',command:'default'}],skills:[{name:'strictacode',source:'skills/strictacode'}]}};
  fs.writeFileSync(path.join(second,'pipeline.yaml'),YAML.stringify(manifest));
  fs.writeFileSync(path.join(second,'flow.yaml'),YAML.stringify({name:'review',collaboration:{mode:'team'},team:[{id:'reviewer',profile:'default',title:'Reviewer',instruction:'Review source'}],stages:[{id:'check',script:'true'}]}));
  fs.writeFileSync(path.join(second,'config.example.yaml'),YAML.stringify({collaboration:{profiles:{default:shared}},docker:{agents:{default:{type:'codex',model:'default-model'}}}}));
  fs.cpSync(path.join(catalog,'pipelines/refactor/skills'),path.join(second,'skills'),{recursive:true});
  fs.writeFileSync(path.join(second,'package.json'),JSON.stringify({afmRuntimeFiles:['pipeline.yaml','flow.yaml','config.example.yaml','package.json','skills']}));
  apply(planInstall({project:f.project,name:'refactor',options:{skills:['claude'],roles:{architect_b:{profile:'shared',model:'custom-model'}}}}));
  const other=planInstall({project:f.project,name:'review',root,options:{skills:['claude'],roles:{reviewer:{profile:'shared'}}}});apply(other);
  const cfg=YAML.parse(f.read('.afm/config.yaml'));
  assert.deepEqual(cfg.collaboration.profiles.shared,shared);
  assert.equal(cfg.docker.agents['shared-review'].model,'shared-model');
  assert.equal(other.receipt.bindings.reviewer.model,'shared-model');
  assert.equal(inspect(f.project).installed.length,2);
  apply(planRemove({project:f.project,name:'refactor'}));
  assert(fs.existsSync(path.join(f.project,'.claude/skills/strictacode/SKILL.md')),'Shared skill survives removal of its first installer');
  assert.equal(verify(f.project,'review').status,'validated');
});

test('reject unknown roles, unsupported clients, inline credentials and symlink destinations',t=>{
  const f=fixture(t);
  assert.throws(()=>planInstall({project:f.project,name:'refactor',options:{roles:{typo:{}}}}),/Unknown role/);
  assert.throws(()=>planInstall({project:f.project,name:'refactor',options:{roles:{architect_a:{client:'unknown'}}}}),/Supported clients/);
  f.write('.afm/config.yaml',YAML.stringify({collaboration:{profiles:{secret:{command:'secret'}}},docker:{agents:{secret:{type:'claude',model:'m',auth:{from:'literal-secret',to:'env:TOKEN'}}}}}));
  assert.throws(()=>planInstall({project:f.project,name:'refactor',options:{roles:{architect_a:{profile:'secret'}}}}),/env: references/);
  fs.symlinkSync(f.root,path.join(f.project,'pipelines'));
  assert.throws(()=>planInstall({project:f.project,name:'refactor'}),/Symlink/);
});

test('interrupted apply recovery restores backups and refuses subsequent edits',t=>{
  const f=fixture(t), transaction=path.join(f.project,'.afm/pipelines/backups/interrupted');fs.mkdirSync(transaction,{recursive:true});
  const lock=path.join(f.project,'.afm/pipelines/apply.lock');fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:2147483647,host:os.hostname(),transaction}));
  fs.writeFileSync(path.join(transaction,'0'),'Original');
  const crypto=require('node:crypto'), hash=text=>crypto.createHash('sha256').update(text).digest('hex');
  fs.writeFileSync(path.join(transaction,'journal.json'),JSON.stringify({project:f.project,status:'applying',changes:[{path:'file.txt',backup:'0',mode:0o644,after:hash('Applied')}]}));
  f.write('file.txt','User changed');assert.throws(()=>recover(f.project),/subsequent edit/);
  f.write('file.txt','Applied');assert.equal(recover(f.project).status,'recovered');assert.equal(f.read('file.txt'),'Original');
});

test('consensus uses frozen configured models, permits same model in independent roles and hashes bindings',t=>{
  const f=fixture(t);
  apply(planInstall({project:f.project,name:'refactor',options:{roles:{architect_a:{client:'codex',model:'chosen-model'},architect_b:{model:'chosen-model'}}}}));
  const snapshot=freeze(path.join(f.root,'run/scope'),path.join(f.project,'pipelines/refactor'));
  const consensus=require(path.join(snapshot,'scripts/consensus.cjs'));
  const dir=path.join(f.root,'analyze');fs.mkdirSync(dir);
  const write=(name,obj)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(obj));
  const doc=JSON.parse(fs.readFileSync(path.join(snapshot,'examples/example.json')));doc.findings=[];doc.proposals=[];
  write('source.json',doc.source);write('architecture.json',doc);
  write('consensus.json',{schema_version:2,source_fingerprint:doc.source.fingerprint,ranking_policy:'benefit_then_ease',summary:'No changes justified',dispositions:[],joint_findings:[],open_questions:[]});
  for(const reviewer of ['architect_a','architect_b']) write(reviewer+'-findings.json',{schema_version:2,reviewer,model:'chosen-model',source:doc.source,architecture_notes:'Inspected source',limitations:[],findings:[]});
  for(const reviewer of ['architect_a','architect_b']) write(reviewer+'-approval.json',{reviewer,model:'chosen-model',packet_sha256:consensus.digest(dir),verdict:'pass',ranking_accepted:true,finding_ids:[],proposal_ids:[],blocking_issues:[],rationale:'Reviewed source'});
  assert.equal(consensus.validate(dir).findings,0);
  const oldDigest=consensus.digest(dir);
  apply(planInstall({project:f.project,name:'refactor',options:{roles:{architect_a:{model:'future-model'}}}}));
  assert.equal(consensus.digest(dir),oldDigest,'Existing run keeps frozen model bindings');
  fs.appendFileSync(path.join(snapshot,'bindings.json'),'\n');
  assert.throws(()=>consensus.validate(dir),/Stale approval/);
});
