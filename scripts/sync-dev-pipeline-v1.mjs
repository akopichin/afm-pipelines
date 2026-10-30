#!/usr/bin/env node
// Preserve local role choices while deriving the legacy entry point from the package.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import YAML from 'yaml';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function sync(project) {
  project=fs.realpathSync(project);
  const gitRoot=fs.realpathSync(execFileSync('git',['-C',project,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim());
  if(project!==gitRoot)throw new Error('Choose the project Git root');
  const packageRoot=path.join(root,'pipelines/dev-pipeline');
  const target=path.join(project,'pipelines/dev-pipeline-v1.yaml');
  const old=YAML.parse(fs.readFileSync(target,'utf8'));
  const flow=YAML.parse(fs.readFileSync(path.join(packageRoot,'flow.yaml'),'utf8'));
  const files=[];
  function visit(relative) {
    const absolute=path.join(packageRoot,relative);
    if(fs.statSync(absolute).isDirectory())for(const name of fs.readdirSync(absolute).sort())visit(relative+'/'+name);
    else files.push([relative,fs.readFileSync(absolute)]);
  }
  visit('skills');
  const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  files.sort(([a],[b])=>a.localeCompare(b));
  const hash=sha(Buffer.from(JSON.stringify(files.map(([file,bytes])=>[file,sha(bytes)]),null,2)+'\n'));
  const library=path.join(project,'pipelines/skill-libraries',hash);
  for(const [file,bytes] of files) {
    const destination=path.join(library,file.slice('skills/'.length));
    if(fs.existsSync(destination)) {
      if(!fs.readFileSync(destination).equals(bytes))throw new Error('Immutable library was edited: '+destination);
    } else {
      fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);
    }
  }
  flow.name='dev-pipeline-v1';flow.skills_dir=library;
  flow.memory.path=path.join(project,'.memory');
  for(const member of flow.team) {
    const prior=old.team.find(item=>item.id===member.id);
    if(!prior)throw new Error('Missing existing writer: '+member.id);
    member.profile=prior.profile;
  }
  for(const stage of flow.stages) {
    const prior=old.stages.find(item=>item.id===stage.id);
    if(!prior)throw new Error('Missing existing stage: '+stage.id);
    if(stage.command)stage.command=prior.command;
    const commands=(prior.verify?.steps || []).filter(step=>step.command);
    for(const step of stage.verify?.steps || [])if(step.command) {
      if(!commands.length)throw new Error('Missing existing verifier: '+stage.id);
      step.command=commands.shift().command;
    }
  }
  flow.stages[0].script=`set -eu
common=$(git rev-parse --path-format=absolute --git-common-dir)
helper=scripts/dev-pipeline.py
if [ ! -f "$helper" ]; then helper="$(dirname "$common")/scripts/dev-pipeline.py"; fi
test -f "$helper" || { echo "Copy scripts/dev-pipeline.py into the project" >&2; exit 1; }
flow=pipelines/dev-pipeline-v1.yaml
if [ ! -f "$flow" ]; then flow="$(dirname "$common")/pipelines/dev-pipeline-v1.yaml"; fi
contract="$(dirname "$common")/pipelines/dev-pipeline-v1-contract.md"
if [ -f "$contract" ]; then cp "$contract" "$AFM_STAGE_DIR/project-contract.md"; fi
python3 "$helper" init --run-dir "$(dirname "$AFM_STAGE_DIR")" --flow "$flow"
`;
  const priorPlan=old.stages.find(stage=>stage.id==='plan').prompt;
  const roles={ARCH_BACKEND:'arch-backend',ARCH_FRONTEND:'arch-frontend',UX:'ux',
    REVIEW_CORRECTNESS:'review-correctness',REVIEW_DESIGN:'review-design',REVIEW_TESTS:'review-tests',REVIEW_SECURITY:'review-security'};
  let rendered=YAML.stringify(flow,{lineWidth:0});
  for(const [token,role] of Object.entries(roles)) {
    const match=priorPlan.match(new RegExp('^\\s*'+role+': ([^\\s]+)\\s*$','m'));
    if(!match)throw new Error('Missing existing specialist: '+role);
    rendered=rendered.replaceAll('__PROFILE_'+token+'__',match[1]);
  }
  rendered=rendered.replaceAll('__DEV_PIPELINE_SKILLS_DIR__',library)
    .replaceAll('--git-path dev-pipeline/','--git-path dev-pipeline-v1/');
  if(/__[_A-Z0-9]+__/.test(rendered))throw new Error('Unresolved flow binding');
  const helper=fs.readFileSync(path.join(packageRoot,'scripts/helper.py'),'utf8')
    .replace('for dev-pipeline.','for dev-pipeline-v1.')
    .replace('"--git-path", "dev-pipeline"','"--git-path", "dev-pipeline-v1"');
  const tests=fs.readFileSync(path.join(packageRoot,'tests/test_helper.py'),'utf8')
    .replace('(Path(__file__).resolve().parents[1] / "scripts" / "helper.py").resolve()',
      'Path(__file__).with_name("dev-pipeline.py").resolve()')
    .replaceAll('"--git-path", "dev-pipeline"','"--git-path", "dev-pipeline-v1"');
  fs.mkdirSync(path.join(project,'scripts'),{recursive:true});
  fs.writeFileSync(path.join(project,'scripts/dev-pipeline.py'),helper);
  fs.writeFileSync(path.join(project,'scripts/test_dev_pipeline.py'),tests);
  fs.copyFileSync(path.join(packageRoot,'docs/project-contract.md'),path.join(project,'pipelines/dev-pipeline-v1-contract.md'));
  fs.writeFileSync(target,rendered);
  return {flow:target,skills_dir:library,preserved:'Existing stage, writer and specialist model bindings; legacy skill libraries'};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==3)throw new Error('Usage: node scripts/sync-dev-pipeline-v1.mjs /absolute/project');
  console.log(JSON.stringify(sync(process.argv[2]),null,2));
}
