import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function relativeFile(name) {
  if (typeof name !== 'string' || !name || path.isAbsolute(name) || name.split(/[\\/]/).includes('..'))
    throw new Error('Invalid package-relative path: ' + name);
  return name;
}

export function verifySnapshot(directory) {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, '.snapshot.json'), 'utf8'));
  if (receipt.schema_version !== 1 || receipt.name !== 'refactor' || !receipt.files || !Object.keys(receipt.files).length)
    throw new Error('Incomplete toolkit snapshot');
  for (const [name, hash] of Object.entries(receipt.files)) {
    const file = path.join(directory, relativeFile(name));
    if (!fs.lstatSync(file).isFile() || digest(file) !== hash) throw new Error('Toolkit snapshot changed: ' + name);
  }
  return receipt;
}

export function runtimeBindings(run) {
  const roles = {};
  const journal = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8');
  for (const line of journal.split('\n').slice(0, -1)) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.kind !== 'operation_committed' || record.actor?.kind !== 'system' || record.actor?.id !== 'flow') continue;
    for (const [role, member] of [['architect_a', 'refactor-architect-a'], ['architect_b', 'refactor-architect-b']]) {
      if (record.operation_id !== 'team/' + member) continue;
      const created = record.payload?.effects?.find(effect => effect.kind === 'task_created');
      const p = created?.payload, command = p?.profile_snapshot?.Command;
      if (p?.scope !== 'run' || p?.created_by !== 'system' || !command || !p.execution?.recipe_identity)
        throw new Error('Missing durable executor binding: ' + role);
      roles[role] = {profile:p.profile_id, command, task_id:created.target.task_id,
        executor:crypto.createHash('sha256').update(JSON.stringify({command, execution:p.execution})).digest('hex')};
    }
  }
  if (Object.keys(roles).length !== 2) throw new Error('Both team members must be admitted before scope starts');
  return {schema_version:2, pipeline:'refactor', roles};
}

export function freeze(stage, source = packageRoot) {
  if (!path.isAbsolute(stage)) throw new Error('AFM_STAGE_DIR must be absolute');
  fs.mkdirSync(stage, {recursive:true});
  const target = path.join(stage, 'toolkit');
  if (fs.existsSync(target)) {
    verifySnapshot(target);
    return target;
  }
  const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  if (!Array.isArray(metadata.afmRuntimeFiles) || !metadata.afmRuntimeFiles.length) throw new Error('Missing runtime file list');
  const temporary = fs.mkdtempSync(path.join(stage, '.toolkit-'));
  const files = {};
  function copy(name) {
    relativeFile(name);
    const from = path.join(source, name), to = path.join(temporary, name), stat = fs.lstatSync(from);
    if (stat.isDirectory()) {
      fs.mkdirSync(to, {recursive:true});
      for (const entry of fs.readdirSync(from).sort()) copy(path.join(name, entry));
    } else if (stat.isFile()) {
      fs.mkdirSync(path.dirname(to), {recursive:true});
      fs.copyFileSync(from, to);
      files[name.split(path.sep).join('/')] = digest(to);
    } else throw new Error('Package runtime must contain regular files, not links: ' + name);
  }
  try {
    for (const name of metadata.afmRuntimeFiles) copy(name);
    const bindings = JSON.stringify(runtimeBindings(path.dirname(stage)), null, 2) + '\n';
    fs.writeFileSync(path.join(temporary, 'bindings.json'), bindings);
    files['bindings.json'] = digest(path.join(temporary, 'bindings.json'));
    fs.writeFileSync(path.join(temporary, '.snapshot.json'), JSON.stringify({
      schema_version:1, name:'refactor', version:metadata.version, files
    }, null, 2) + '\n');
    // Publish only a complete snapshot; retries never mix installed package versions.
    try {fs.renameSync(temporary, target);} catch (error) {
      if (!fs.existsSync(target)) throw error;
      verifySnapshot(target);
    }
    return target;
  } finally {
    fs.rmSync(temporary, {recursive:true, force:true});
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const index = process.argv.indexOf('--stage');
    if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node freeze.mjs --stage ABSOLUTE_SCOPE_DIRECTORY');
    console.log('Frozen refactor toolkit: ' + freeze(process.argv[index + 1]));
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
