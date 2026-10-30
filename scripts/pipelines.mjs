#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import YAML from 'yaml';

export const catalog = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (ok, message) => { if (!ok) throw new Error(message); };
const exists = file => fs.existsSync(file);
const hash = file => exists(file) ? sha(fs.readFileSync(file)) : null;
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const identifier = value => typeof value === 'string' && /^[a-z][a-z0-9_-]*$/.test(value);
const run = (command, args, cwd) => spawnSync(command, args, {cwd, encoding:'utf8', timeout:30000, maxBuffer:2 ** 20});
const statusPath = name => `.afm/pipelines/receipts/${name}.json`;

function contained(root, name) {
  check(typeof name === 'string' && name && !path.isAbsolute(name) &&
    !name.split(/[\\/]/).some(part => ['..', '.', ''].includes(part)), 'Unsafe relative path');
  let file = root;
  for (const part of name.split('/')) {
    file = path.join(file, part);
    try { check(!fs.lstatSync(file).isSymbolicLink(), 'Symlink is not an install destination: ' + name); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return file;
}

function document(file) {
  const doc = YAML.parseDocument(exists(file) ? fs.readFileSync(file, 'utf8') : '{}\n');
  check(!doc.errors.length && YAML.isMap(doc.contents), 'Expected a YAML mapping: ' + file);
  return doc;
}
const get = (doc, keys) => doc.getIn(keys, true)?.toJSON();
function filesUnder(root, names) {
  const result = {};
  function visit(name) {
    const file = contained(root, name), stat = fs.lstatSync(file);
    if (stat.isDirectory()) for (const child of fs.readdirSync(file).sort()) visit(name + '/' + child);
    else { check(stat.isFile(), 'Expected regular file: ' + name); result[name] = fs.readFileSync(file); }
  }
  names.forEach(visit);
  return result;
}
function projectRoot(input) {
  check(input && path.isAbsolute(input), '--project must be an absolute Git project root');
  const root = fs.realpathSync(input), result = run('git', ['rev-parse', '--show-toplevel'], root);
  check(result.status === 0 && fs.realpathSync(result.stdout.trim()) === root, 'Choose the target Git project root');
  return root;
}
function packageInfo(name, root = catalog) {
  check(identifier(name), 'Invalid pipeline name');
  const directory = contained(root, 'pipelines/' + name);
  const manifest = document(path.join(directory, 'pipeline.yaml')).toJS();
  check(manifest.schema_version === 1 && manifest.name === name, 'Unsupported package manifest');
  check(manifest.installation.project_path === 'pipelines/' + name, 'Unexpected package destination');
  return {directory, manifest};
}
function provenance(root) {
  const rev = run('git', ['rev-parse', 'HEAD'], root);
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=all'], root);
  return {commit:rev.status === 0 ? rev.stdout.trim() : null, dirty:dirty.status !== 0 || !!dirty.stdout.trim()};
}

export function inspect(project, root = catalog) {
  project = projectRoot(project);
  const local = document(contained(project, '.afm/config.yaml'));
  const globalFile = path.join(os.homedir(), '.afm/config.yaml');
  const global = document(globalFile);
  return {
    project, node:process.versions.node, catalog:provenance(root),
    tools:Object.fromEntries(['afm','git','docker','claude','codex'].map(command => {
      const result = run(command, ['--version'], project);
      return [command, {available:result.status === 0}];
    })),
    profiles:[...new Set([...Object.keys(get(global,['collaboration','profiles']) || {}),
      ...Object.keys(get(local,['collaboration','profiles']) || {})])],
    installed:exists(contained(project,'.afm/pipelines/receipts')) ?
      fs.readdirSync(contained(project,'.afm/pipelines/receipts')).filter(name => name.endsWith('.json')).map(name => name.slice(0,-5)) : [],
    authentication:'Not inspected; provider login must be checked separately. No model calls were made.'
  };
}

function resolveRoles(manifest, config, global, choices, defaults) {
  const roles = {}, profiles = {}, recipes = {}, dependencies = [];
  const declared = manifest.setup.models || [];
  for (const key of Object.keys(choices)) check(declared.some(role => role.role === key), 'Unknown role: ' + key);
  for (const role of declared) {
    check(identifier(role.role), 'Invalid role ID');
    const choice = choices[role.role] || {};
    for (const key of Object.keys(choice)) check(['profile','client','model','reasoning'].includes(key), 'Unknown role option: ' + key);
    let profile = defaults.collaboration.profiles[role.profile], recipe = defaults.docker.agents[role.command];
    if (choice.profile) {
      check(identifier(choice.profile), 'Invalid profile reference');
      profile = get(config,['collaboration','profiles',choice.profile]) ?? get(global,['collaboration','profiles',choice.profile]);
      check(profile?.command, 'Missing reusable profile: ' + choice.profile);
      recipe = get(config,['docker','agents',profile.command]) ?? get(global,['docker','agents',profile.command]);
      check(recipe?.model && ['claude','codex'].includes(recipe.type), 'Profile needs a Claude/Codex Docker recipe with an explicit model');
      dependencies.push(choice.profile);
    }
    const client = choice.client ?? recipe.type;
    check(['claude','codex'].includes(client), 'Supported clients: claude, codex');
    if (client !== recipe.type) {
      check(choice.model, 'Changing client requires an explicit model');
      recipe = {type:client};
    }
    recipe = {...recipe, type:client, model:choice.model ?? recipe.model};
    if (choice.reasoning !== undefined) recipe.reasoning = choice.reasoning;
    check(typeof recipe.model === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(recipe.model), 'Invalid model identifier');
    check(recipe.reasoning === undefined || ['minimal','low','medium','high','xhigh','max'].includes(recipe.reasoning), 'Unsupported reasoning setting');
    // Only reference credentials; never serialize literal provider secrets into a plan.
    const allowed = ['type','model','reasoning','auth','url'];
    check(Object.keys(recipe).every(key => allowed.includes(key)), 'Reusable recipe has unsupported fields; create a dedicated profile');
    if (recipe.url) check(/^https?:\/\/[^@?#]+$/.test(recipe.url), 'Use a credential-free provider URL');
    if (recipe.auth) {
      check(Object.keys(recipe.auth).every(key => ['from','to'].includes(key)), 'Unsupported auth mapping');
      for (const value of Object.values(recipe.auth)) check(/^env:[A-Za-z_][A-Za-z0-9_]*$/.test(value), 'Authentication must use env: references');
    }
    if (client === 'claude' && !recipe.auth) recipe.auth = {from:'env:CLAUDE_CODE_OAUTH_TOKEN',to:'env:CLAUDE_CODE_OAUTH_TOKEN'};
    const suffix = sha(json({profile,recipe})).slice(0,12);
    const name = `pipeline-${manifest.name}-${role.role.replaceAll('_','-')}-${suffix}`;
    // Every role gets a stable content-addressed copy, including reused profiles.
    profiles[name] = {...profile, title:`${manifest.name} / ${role.role} / ${recipe.model}`, command:name};
    recipes[name] = recipe;
    roles[role.role] = {profile:name,command:name,client,model:recipe.model,reasoning:recipe.reasoning ?? '',execution:'docker'};
  }
  return {roles,profiles,recipes,dependencies};
}

export function planInstall({project, name, options = {}, root = catalog}) {
  project = projectRoot(project);
  const {directory,manifest} = packageInfo(name, root);
  for (const key of Object.keys(options)) check(['roles','skills','settings'].includes(key), 'Unknown setup option: ' + key);
  const receiptFile = contained(project,statusPath(name));
  const previous = exists(receiptFile) ? readJSON(receiptFile) : null;
  const roleChoices = structuredClone(previous?.options?.roles || {});
  for (const [role,choice] of Object.entries(options.roles || {})) roleChoices[role]={...roleChoices[role],...choice};
  for (const role of manifest.setup.models || []) for (const oldRole of role.previous_roles || []) {
    if (!Object.hasOwn(roleChoices,oldRole)) continue;
    roleChoices[role.role]={...roleChoices[oldRole],...roleChoices[role.role]};
    delete roleChoices[oldRole];
  }
  options = {...(previous?.options || {}),...options,roles:roleChoices};
  const skills = options.skills || [];
  check(Array.isArray(skills) && skills.every(client => ['claude','codex'].includes(client)), 'skills must list claude and/or codex');
  check(options.settings === undefined || typeof options.settings === 'boolean', 'settings must be boolean');
  const configFile = contained(project,'.afm/config.yaml'), config = document(configFile);
  const globalFile = path.join(os.homedir(),'.afm/config.yaml'), global = document(globalFile);
  const defaults = document(path.join(directory,manifest.installation.configuration_example)).toJS();
  const resolved = resolveRoles(manifest,config,global,options.roles || {},defaults);
  const metadata = readJSON(path.join(directory,'package.json'));
  const source = filesUnder(directory,metadata.afmRuntimeFiles);
  const output = {...source}, flow = YAML.parseDocument(source[manifest.entrypoint].toString());
  check(!flow.errors.length, 'Invalid package flow');
  const flowBindings = manifest.setup.flow_bindings || {};
  let skillDirectory = 'skills';
  if (flowBindings.immutable_skills) {
    const skillFiles = Object.entries(source).filter(([file]) => file.startsWith('skills/')).sort(([a],[b])=>a.localeCompare(b));
    check(skillFiles.length > 0, 'Immutable skills need a package skill library');
    skillDirectory = 'skill-libraries/' + sha(Buffer.from(json(skillFiles.map(([file,bytes])=>[file,sha(bytes)]))));
    for (const [file,bytes] of skillFiles) {
      output[skillDirectory + file.slice('skills'.length)] = bytes;
      delete output[file];
    }
  }
  const skillPath = path.join(project, 'pipelines', name, skillDirectory);
  if (flowBindings.skills_dir) flow.set('skills_dir', skillPath);
  if (flowBindings.memory_path) flow.setIn(['memory','path'], path.join(project, '.memory'));
  for (const role of manifest.setup.models || []) {
    if (role.team_member) {
      const team = flow.get('team');
      const member = team?.items.find(item => item.get('id') === role.team_member);
      check(member, 'Missing declared team member: ' + role.team_member);
      member.set('profile',resolved.roles[role.role].profile);
    }
    for (const stageId of role.stage_ids || []) {
      const stage = flow.get('stages')?.items.find(item => item.get('id') === stageId);
      check(stage, 'Missing declared stage: ' + stageId);
      stage.set('command',resolved.roles[role.role].command);
    }
    for (const stageId of role.verify_stage_ids || []) {
      const stage = flow.get('stages')?.items.find(item => item.get('id') === stageId);
      check(stage, 'Missing declared verify stage: ' + stageId);
      const steps = stage.getIn(['verify','steps']);
      check(steps?.items?.some(item => item.get('command')), 'Missing command verify step: ' + stageId);
      for (const step of steps.items) if (step.get('command')) step.set('command',resolved.roles[role.role].command);
    }
  }
  let renderedFlow = flow.toString();
  if (flowBindings.skill_path_token) {
    check(renderedFlow.includes(flowBindings.skill_path_token), 'Missing skill path token');
    renderedFlow = renderedFlow.replaceAll(flowBindings.skill_path_token, skillPath);
  }
  for (const role of manifest.setup.models || []) if (role.profile_token) {
    check(renderedFlow.includes(role.profile_token), 'Missing profile token: ' + role.profile_token);
    renderedFlow = renderedFlow.replaceAll(role.profile_token, resolved.roles[role.role].profile);
  }
  if (Object.keys(flowBindings).length)
    check(!/__[_A-Z0-9]+__/.test(renderedFlow), 'Unresolved package flow binding');
  output[manifest.entrypoint] = Buffer.from(renderedFlow);
  output['bindings.json'] = Buffer.from(json({schema_version:1,pipeline:name,roles:resolved.roles}));
  const desired = {};
  for (const [file, bytes] of Object.entries(output)) desired[`pipelines/${name}/${file}`] = bytes;
  if (flowBindings.immutable_skills) {
    for (const [file,old] of Object.entries(previous?.files || {})) {
      if (!file.startsWith(`pipelines/${name}/skill-libraries/`) && !file.startsWith(`pipelines/${name}/skills/`)) continue;
      const current = contained(project,file);
      check(hash(current) === old, 'Retained skill library was edited or removed: ' + file);
      if (!Object.hasOwn(desired,file)) desired[file] = fs.readFileSync(current);
    }
  }
  for (const skill of manifest.setup.skills || []) {
    check(identifier(skill.name), 'Invalid skill name');
    const skillFiles = filesUnder(directory,[skill.source]);
    for (const client of skills) for (const [file,bytes] of Object.entries(skillFiles)) {
      const base = client === 'codex' ? '.agents/skills' : '.claude/skills';
      desired[`${base}/${skill.name}/${file.slice(skill.source.length+1)}`] = bytes;
    }
  }
  const patches = [], owned = [...(previous?.config || [])];
  function patch(keys,value,own=false) {
    const current = get(config,keys);
    const old = owned.find(item => same(item.keys,keys));
    if (old) check(same(current,old.value), 'Managed configuration was edited: ' + keys.join('.'));
    if (own && current !== undefined && !same(current,value) && !old) throw new Error('Configuration collision: ' + keys.join('.'));
    if (!same(current,value)) patches.push({keys,value});
    if (own && current === undefined) owned.push({keys,value});
  }
  const requiredSettings = Object.keys(resolved.roles).length ?
    [['docker','enabled'],['docker','autoShim'],['collaboration','enabled']] : [];
  if(manifest.setup.configuration?.managed_browser_enabled || manifest.requirements?.browser_capable_coordinator)
    requiredSettings.push(['browser','enabled']);
  if (options.settings !== false) {
    for(const keys of requiredSettings) patch(keys,true);
  } else for (const keys of requiredSettings)
    check((get(config,keys) ?? get(global,keys)) === true, 'Enable required setting or choose settings=true: ' + keys.join('.'));
  for (const [key,value] of Object.entries(resolved.profiles)) patch(['collaboration','profiles',key],value,true);
  for (const [key,value] of Object.entries(resolved.recipes)) patch(['docker','agents',key],value,true);
  const writes = [], ownedFiles = {};
  for (const [file,bytes] of Object.entries(desired)) {
    const current = hash(contained(project,file)), next = sha(bytes), old = previous?.files?.[file];
    check(current === null || current === next || (old && current === old), 'Local file conflict: ' + file);
    if (current !== next) writes.push({path:file,before:current,content:bytes.toString('base64')});
    if (current === null || old) ownedFiles[file] = next;
  }
  for (const [file,old] of Object.entries(previous?.files || {})) if (!Object.hasOwn(desired,file)) {
    const current = hash(contained(project,file));
    check(current === old || current === null, 'Local file conflict: ' + file);
    if (current !== null && !referencedElsewhere(project,name,file)) writes.push({path:file,before:current,content:null});
  }
  const watched = Object.fromEntries([...Object.keys(desired),...Object.keys(previous?.files || {})]
    .map(file => [file, hash(contained(project,file))]));
  const ignoreFile=contained(project,'.gitignore'), ignore=exists(ignoreFile)?fs.readFileSync(ignoreFile,'utf8'):'';
  watched['.gitignore']=hash(ignoreFile);
  if(!/^\/?\.afm\/$/m.test(ignore)) writes.push({path:'.gitignore',before:hash(ignoreFile),
    content:Buffer.from(ignore+(ignore.endsWith('\n') || !ignore?'':'\n')+'\n# Local AFM configuration, runs and installer backups\n.afm/\n').toString('base64')});
  const sourceHashes = Object.fromEntries(Object.entries(source).map(([file,bytes])=>[file,sha(bytes)]));
  const receipt = {schema_version:1,name,version:manifest.version,catalog:provenance(root),options,
    files:ownedFiles,installed_files:Object.fromEntries(Object.entries(desired).map(([file,bytes])=>[file,sha(bytes)])),
    config:owned,bindings:resolved.roles,required_settings:requiredSettings,source_files:sourceHashes};
  const plan = {schema_version:1,action:previous?'update':'install',project,name,root,receipt,
    config_hash:hash(configFile),global_hash:hash(globalFile),receipt_hash:hash(receiptFile),
    watched,writes,patches,source_hashes:sourceHashes,entrypoint:manifest.entrypoint,receipts_state:receiptsState(project),
    summary:{version:manifest.version,roles:resolved.roles,skills,files_changed:writes.length,
      config_paths:patches.map(item=>item.keys.join('.')),catalog:receipt.catalog,
      notes:['Docker recipes are copied into pipeline-specific profiles; source profiles remain unchanged.',
        'Provider credentials and model availability are not verified. No model calls or tool installations are performed.',
        'Existing profile versions are retained for older runs. Shared AFM settings remain enabled on removal.']}};
  return plan;
}

function referencedElsewhere(project,name,file) {
  const directory=contained(project,'.afm/pipelines/receipts');
  if(!exists(directory))return false;
  return fs.readdirSync(directory).filter(entry=>entry.endsWith('.json') && entry!==name+'.json')
    .some(entry=>Object.hasOwn(readJSON(contained(directory,entry)).installed_files || {},file));
}

function receiptsState(project) {
  const directory=contained(project,'.afm/pipelines/receipts');
  return exists(directory)?Object.fromEntries(fs.readdirSync(directory).filter(name=>name.endsWith('.json')).sort()
    .map(name=>[name,hash(contained(directory,name))])):{};
}

export function planRemove({project,name}) {
  project = projectRoot(project);check(identifier(name),'Invalid pipeline name');
  const receiptFile = contained(project,statusPath(name));
  check(exists(receiptFile),'Pipeline has no installation receipt');
  const receipt = readJSON(receiptFile), configFile = contained(project,'.afm/config.yaml'), config = document(configFile);
  const writes = [], patches = [], watched = {};
  for (const [file,expected] of Object.entries(receipt.files)) {
    const current = hash(contained(project,file));watched[file]=current;
    check(current === expected || current === null,'Local file conflict: ' + file);
    if (current !== null && !referencedElsewhere(project,name,file)) writes.push({path:file,before:current,content:null});
  }
  for (const item of receipt.config) {
    check(same(get(config,item.keys),item.value),'Managed configuration was edited: ' + item.keys.join('.'));
    patches.push({keys:item.keys,remove:true});
  }
  return {schema_version:1,action:'remove',project,name,config_hash:hash(configFile),
    global_hash:hash(path.join(os.homedir(),'.afm/config.yaml')),receipt_hash:hash(receiptFile),
    watched,writes,patches,receipts_state:receiptsState(project),summary:{files_changed:writes.length,config_paths:patches.map(item=>item.keys.join('.')),
      notes:['Plans, run snapshots, authentication and shared AFM settings are preserved. Stop active runs before removing their profiles.']}};
}

function atomic(file, bytes, mode=0o600) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp = file + '.tmp-' + crypto.randomUUID();
  try { fs.writeFileSync(temp,bytes,{mode});fs.renameSync(temp,file); }
  finally { fs.rmSync(temp,{force:true}); }
}
function preconditions(plan) {
  const {project} = plan;
  check(same(receiptsState(project),plan.receipts_state),'Installed packages changed; create a new plan');
  check(hash(contained(project,'.afm/config.yaml')) === plan.config_hash,'Configuration changed; create a new plan');
  check(hash(path.join(os.homedir(),'.afm/config.yaml')) === plan.global_hash,'Global configuration changed; create a new plan');
  check(hash(contained(project,statusPath(plan.name))) === plan.receipt_hash,'Installation changed; create a new plan');
  for (const [file,expected] of Object.entries(plan.watched)) check(hash(contained(project,file)) === expected,'File changed; create a new plan: ' + file);
  if (plan.source_hashes) for (const [file,expected] of Object.entries(plan.source_hashes))
    check(hash(contained(path.join(plan.root,'pipelines',plan.name),file)) === expected,'Catalog changed; create a new plan: ' + file);
}

export function apply(plan) {
  check(plan.schema_version === 1 && ['install','update','remove'].includes(plan.action) && identifier(plan.name),'Invalid installation plan');
  check(projectRoot(plan.project) === plan.project,'Project moved; create a new plan');
  const project = plan.project, lock = contained(project,'.afm/pipelines/apply.lock');
  fs.mkdirSync(path.dirname(lock),{recursive:true});
  try { fs.mkdirSync(lock); } catch (error) { if (error.code === 'EEXIST') throw new Error('Apply lock exists; inspect or recover the interrupted transaction');throw error; }
  const changes = [], transaction = contained(project,`.afm/pipelines/backups/${Date.now()}-${crypto.randomUUID()}`);
  fs.mkdirSync(transaction,{recursive:true,mode:0o700});
  atomic(path.join(lock,'owner.json'),json({pid:process.pid,host:os.hostname(),transaction}));
  let journal;
  try {
    preconditions(plan);
    const configFile = contained(project,'.afm/config.yaml'), config = document(configFile);
    for (const patch of plan.patches) {
      check(patch.keys.every(key=>typeof key==='string' && !['__proto__','prototype','constructor'].includes(key)),'Invalid configuration path');
      if (patch.remove) config.deleteIn(patch.keys); else config.setIn(patch.keys,patch.value);
    }
    const writes = [...plan.writes];
    if (plan.patches.length) writes.push({path:'.afm/config.yaml',content:Buffer.from(config.toString()).toString('base64')});
    writes.push({path:statusPath(plan.name),content:plan.action==='remove'?null:Buffer.from(json(plan.receipt)).toString('base64')});
    for (const item of writes) {
      const file = contained(project,item.path), before = exists(file)?fs.readFileSync(file):null;
      const mode = exists(file)?fs.statSync(file).mode & 0o777:0o644;
      const backup = String(changes.length);
      if (before !== null) atomic(path.join(transaction,backup),before);
      changes.push({path:item.path,backup:before===null?null:backup,mode,
        after:item.content===null?null:sha(Buffer.from(item.content,'base64'))});
    }
    journal = {schema_version:1,project,changes,status:'applying'};
    atomic(path.join(transaction,'journal.json'),json(journal));
    for (const item of writes) {
      const file = contained(project,item.path);
      if (item.content === null) fs.rmSync(file,{force:true});
      else atomic(file,Buffer.from(item.content,'base64'),item.path.startsWith('.afm/')?0o600:0o644);
    }
    if (plan.action !== 'remove') validateFlow(project,plan.name,plan.entrypoint);
    journal.status='complete';atomic(path.join(transaction,'journal.json'),json(journal));
    return {status:'complete',action:plan.action,backup:transaction,
      next:plan.action==='remove'?null:`node scripts/pipelines.mjs verify ${plan.name} --project ${JSON.stringify(project)}`};
  } catch (error) {
    if (error.diagnostics) {
      atomic(path.join(transaction,'validation.log'),error.diagnostics);
      error.message += ' Private diagnostics: ' + path.join(transaction,'validation.log');
    }
    if (journal) {
      rollback(project,transaction,changes);
      journal.status='rolled_back';atomic(path.join(transaction,'journal.json'),json(journal));
    }
    throw error;
  } finally {
    if (!journal || ['complete','rolled_back'].includes(journal.status)) fs.rmSync(lock,{recursive:true,force:true});
  }
}

function rollback(project, transaction, changes) {
  for (const item of [...changes].reverse()) {
    const file = contained(project,item.path);
    if (item.backup === null) fs.rmSync(file,{force:true});
    else atomic(file,fs.readFileSync(contained(transaction,item.backup)),item.mode);
  }
}
export function recover(project) {
  project = projectRoot(project);
  const lock = contained(project,'.afm/pipelines/apply.lock'), owner = readJSON(path.join(lock,'owner.json'));
  check(owner.host === os.hostname(),'Recover on the host that started this transaction');
  let alive = true;
  try { process.kill(owner.pid,0); } catch (error) { if (error.code === 'ESRCH') alive=false; }
  check(!alive,'Installer is still running');
  const relative = path.relative(project,fs.realpathSync(owner.transaction));contained(project,relative);
  check(relative.startsWith('.afm/pipelines/backups/'),'Invalid recovery destination');
  const file = path.join(owner.transaction,'journal.json');
  if (exists(file)) {
    const journal = readJSON(file);check(journal.project===project,'Wrong recovery project');
    if (journal.status === 'applying') {
      for (const item of journal.changes) {
        const current = hash(contained(project,item.path));
        const old = item.backup===null?null:hash(contained(owner.transaction,item.backup));
        check(current===old || current===item.after,'Recovery would overwrite a subsequent edit: ' + item.path);
      }
      rollback(project,owner.transaction,journal.changes);
      journal.status='rolled_back';atomic(file,json(journal));
    }
  }
  fs.rmSync(lock,{recursive:true,force:true});
  return {status:'recovered',backup:owner.transaction};
}

function validateFlow(project,name,entrypoint='flow.yaml') {
  const result = run(process.env.AFM_BIN || 'afm',['--dir',project,'validate',contained(project,`pipelines/${name}/${entrypoint}`)],project);
  // AFM diagnostics can contain configuration; keep them off ordinary installer output.
  if(result.status!==0) {
    const error=new Error('AFM validation failed. Installation is rolled back when applying.');
    error.diagnostics=result.stderr || result.stdout || result.error?.message || 'No diagnostics';throw error;
  }
}
export function verify(project,name) {
  project=projectRoot(project);check(identifier(name),'Invalid pipeline name');
  const receipt=readJSON(contained(project,statusPath(name))), config=document(contained(project,'.afm/config.yaml'));
  for (const [file,expected] of Object.entries(receipt.installed_files)) check(hash(contained(project,file))===expected,'Installed file changed: '+file);
  for (const item of receipt.config) check(same(get(config,item.keys),item.value),'Managed configuration changed: '+item.keys.join('.'));
  for (const keys of receipt.required_settings)
    check((get(config,keys) ?? get(document(path.join(os.homedir(),'.afm/config.yaml')),keys))===true,'Required setting is disabled: '+keys.join('.'));
  validateFlow(project,name);
  return {status:'validated',roles:receipt.bindings,
    unchecked:['Provider authentication','Model availability','Docker daemon/runtime image','Browser access inside a running flow'],
    run:`AFM_COLLABORATION=1 AFM_BROWSER=1 AFM_USE_DOCKER=1 afm run pipelines/${name}/flow.yaml --worktree ${name} --port 3434 --idle-timeout 24h`};
}

function main(args) {
  const command=args.shift(), positional=[], flags={};
  while(args.length) { const arg=args.shift();if(arg.startsWith('--')) { check(args.length && !args[0].startsWith('--'),'Missing option value');flags[arg.slice(2)]=args.shift(); } else positional.push(arg); }
  check(Object.keys(flags).every(key=>['project','options','out'].includes(key)),'Unknown option');
  const [name]=positional;check(positional.length<=1,'Too many arguments');
  let result;
  if(command==='list') result=fs.readdirSync(path.join(catalog,'pipelines')).filter(identifier).map(name=>packageInfo(name).manifest);
  else if(command==='inspect') result=inspect(flags.project);
  else if(command==='plan' || command==='remove') {
    check(flags.out,'--out is required');
    result=command==='plan'?planInstall({project:flags.project,name,options:flags.options?readJSON(flags.options):{}}):planRemove({project:flags.project,name});
    check(!exists(flags.out),'Plan file already exists; choose a new --out path');
    fs.writeFileSync(flags.out,json(result),{mode:0o600,flag:'wx'});
    result={plan:path.resolve(flags.out),...result.summary};
  } else if(command==='apply') result=apply(readJSON(name));
  else if(command==='verify') result=verify(flags.project,name);
  else if(command==='recover') result=recover(flags.project);
  else throw new Error('Usage: node scripts/pipelines.mjs list | inspect --project ROOT | plan NAME --project ROOT [--options FILE] --out PLAN | apply PLAN | verify NAME --project ROOT | remove NAME --project ROOT --out PLAN | recover --project ROOT');
  console.log(json(result));
}
if(process.argv[1] && fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch(error) { console.error(error.message);process.exitCode=1; }
}
