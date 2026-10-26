#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import M from './model.cjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.dirname(directory);
const [command, ...args] = process.argv.slice(2);
const option = (name, fallback) => {const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1];};
const options = name => args.flatMap((value, index) => value === '--' + name ? [args[index + 1]] : []);
const required = name => {const value = option(name); if (!value) throw new Error(`Missing --${name}`); return value;};
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
function atomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  const temp = filename + '.' + crypto.randomUUID() + '.tmp';
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {fs.writeFileSync(fd, value); fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  fs.renameSync(temp, filename);
}
const json = (filename, value) => atomic(filename, JSON.stringify(value, null, 2) + '\n');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function canonical(filename) {
  filename = path.resolve(filename);
  if (fs.existsSync(filename)) return fs.realpathSync(filename);
  return path.join(canonical(path.dirname(filename)), path.basename(filename));
}

function fingerprint(root, excluded = []) {
  root = fs.realpathSync(root);
  let files;
  try {
    files = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {maxBuffer: 32 * 1024 * 1024, encoding: 'utf8'}).split('\0').filter(Boolean);
  } catch {throw new Error('The first prototype requires a Git project for reproducible source snapshots');}
  const exclusions = excluded.map(canonical);
  files = [...new Set(files)].filter(file => {
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(root + path.sep)) throw new Error('Source path escapes the project');
    return !exclusions.some(p => absolute === p || absolute.startsWith(p + path.sep));
  }).sort();
  const hash = crypto.createHash('sha256');
  let head = 'unborn';
  try {head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();} catch {}
  hash.update(head + '\0');
  for (const file of files) {
    const absolute = path.join(root, file);
    hash.update(file + '\0');
    let stat;
    try {stat = fs.lstatSync(absolute);} catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update('missing\0'); continue;
    }
    if (stat.isSymbolicLink()) hash.update('symlink:' + fs.readlinkSync(absolute));
    else if (stat.isFile()) {hash.update(String(stat.mode & 0o777) + ':'); hash.update(fs.readFileSync(absolute));}
    else throw new Error(`Unsupported source entry (e.g. submodule): ${file}`);
    hash.update('\0');
  }
  return {root, revision: head, fingerprint: hash.digest('hex'), excluded: exclusions, files: files.length};
}

function build(doc, checkpoint, output) {
  M.validate(doc);
  if (checkpoint) {
    M.restore(checkpoint);
    if (JSON.stringify(checkpoint.document) !== JSON.stringify(doc)) throw new Error('Checkpoint/document mismatch');
  }
  const data = JSON.stringify({document: doc, checkpoint}).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const model = fs.readFileSync(path.join(directory, 'model.cjs'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const graphics = fs.readFileSync(path.join(packageRoot, 'ui/vendor/graph.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const html = fs.readFileSync(path.join(packageRoot, 'ui/template.html'), 'utf8')
    .replace('/*__REFACTOR_GRAPHICS__*/', () => graphics)
    .replace('/*__REFACTOR_MODEL__*/', () => model).replace('__REFACTOR_DATA__', () => data);
  atomic(output, html);
}

function planFiles(checkpoint) {
  return M.plans(checkpoint).filter(g=>g.proposal_ids.length).map((g,i)=>({...g,file:`${String(i+1).padStart(2,'0')}-${g.id}`}));
}
function stageLines(doc, ids) {
  return ids.flatMap((id,index)=>{
    const p=doc.proposals.find(item=>item.id===id);
    const explanation=p.explanation ? ['**Why**', '',p.explanation.why,'','**Problem**','',p.explanation.problem,'',
      '**Before**','',p.explanation.before,...(p.explanation.before_refs||[]).map(ref=>'- '+ref),'','**After**','',p.explanation.after,...(p.explanation.after_refs||[]).map(ref=>'- '+ref)] : [p.rationale];
    return [`### ${index+1}. ${p.title} (${id})`, '', ...explanation, '', `Effort: ${p.effort}`,
      `Prerequisites: ${p.depends_on.join(', ')||'None'}`, '', ...p.steps.map((s,i)=>`${i+1}. ${s}`), '',
      '**Verification**', '', ...p.verification.map(s=>'- '+s), '', '**Risks**', '', ...p.risks.map(s=>'- '+s), ''];
  });
}
function exportPlans(checkpoint, output) {
  const groups=planFiles(checkpoint),doc=checkpoint.document;
  let completed=[];
  for(const group of groups){
    const before=M.target(doc,completed);completed.push(...group.proposal_ids);
    const lines=[`# ${group.title}`, '', doc.goal, '', `Source revision: ${doc.source.revision}`,
      `Proposal revision: ${doc.revision}`, `Approval event: ${checkpoint.approval.event_id}`, '',
      '## Required plans', '', ...(group.depends_on.length?group.depends_on.map(id=>{const dep=groups.find(g=>g.id===id);return `- [${dep.title}](${dep.file}.md)`;}):['None.']), '',
      '## Constraints', '', ...doc.constraints.map(s=>'- '+s), '',
      '## Steps', '', ...stageLines(doc,group.proposal_ids),
      '## Architecture snapshots', '', `- [Before](${group.file}.before.json)`, `- [After](${group.file}.after.json)`, '',
      'Snapshots follow the full execution order in index.json, including earlier independent plans. Revalidate the source and tests before each implementation.', '',
      'This is an approved plan; no code has been changed.', ''];
    atomic(path.join(output,'plans',group.file+'.md'),lines.join('\n'));
    json(path.join(output,'plans',group.file+'.before.json'),before);
    json(path.join(output,'plans',group.file+'.after.json'),M.target(doc,completed));
  }
  json(path.join(output,'plans','index.json'),{source_revision:doc.source.revision,approval_event:checkpoint.approval.event_id,
    plans:groups.map(g=>({...g,file:g.file+'.md'}))});
}
function plan(checkpoint) {
  M.restore(checkpoint);
  if (!checkpoint.sealed || !checkpoint.approval) throw new Error('A sealed human approval is required');
  const doc = checkpoint.document;
  const lines = [`# ${doc.title} — refactoring plan`, '', doc.goal, '',
    `Source revision: ${doc.source.revision}`, `Proposal revision: ${doc.revision}`, `Approval event: ${checkpoint.approval.event_id}`, '',
    '## Constraints', '', ...doc.constraints.map(s => '- ' + s), '', '## Agreed stages', ''];
  if (!checkpoint.selected.length) lines.push('The user approved proceeding without refactoring.', '');
  lines.push(...stageLines(doc,M.order(doc,checkpoint.selected)));
  lines.push('## Implementation plans', '', ...planFiles(checkpoint).map((g,i)=>`${i+1}. [${g.title}](plans/${g.file}.md)`), '',
    'Execute these plans separately in the listed dependency order. Revalidate the working tree and tests between plans.', '');
  lines.push('## Deferred proposals', '', ...doc.proposals.filter(p => !checkpoint.selected.includes(p.id)).map(p => `- ${p.id}: ${p.title}`), '',
    '## Analysis limits', '', ...doc.source.limitations.map(s => '- ' + s), '',
    'The target graph describes an agreed design. Its implementation and future quality metrics have not been measured.', '');
  return lines.join('\n');
}

async function alive(lease) {
  try {
    const response = await fetch(`http://127.0.0.1:${lease.port}/`, {signal: AbortSignal.timeout(1000)});
    await response.arrayBuffer();
    return response.headers.get('x-refactor-preview') === lease.id;
  } catch {return false;}
}

async function main() {
  if (command === 'validate') {
    M.validate(read(required('input')));
    console.log('Architecture document valid');
  } else if (command === 'build') {
    const checkpoint = option('checkpoint') ? M.restore(read(option('checkpoint'))) : null;
    const doc = checkpoint ? checkpoint.document : read(required('input'));
    build(doc, checkpoint, required('output'));
    console.log(path.resolve(required('output')));
  } else if (command === 'fingerprint') {
    const receipt = fingerprint(required('root'), options('exclude'));
    if (option('output')) json(option('output'), receipt);
    else console.log(JSON.stringify(receipt, null, 2));
  } else if (command === 'check-source') {
    const receipt = read(required('receipt'));
    const doc = option('checkpoint') ? M.restore(read(option('checkpoint'))).document :
      option('document') ? M.validate(read(option('document'))) : null;
    if (doc && (doc.source.fingerprint !== receipt.fingerprint || doc.source.revision !== receipt.revision)) {
      throw new Error('Architecture/approval belongs to a different source snapshot');
    }
    const current = fingerprint(receipt.root, receipt.excluded);
    if (current.fingerprint !== receipt.fingerprint) throw new Error('Source changed since analysis; rescan and obtain new approval');
    console.log('Source snapshot unchanged');
  } else if (command === 'checkpoint') {
    const checkpoint = M.restore(read(required('input')));
    if (args.includes('--require-approved') && (!checkpoint.sealed || !checkpoint.approval)) throw new Error('Missing sealed approval');
    if (option('output')) json(option('output'), checkpoint);
    console.log(`Checkpoint valid: revision ${checkpoint.document.revision}, ${checkpoint.events.length} events, sealed=${checkpoint.sealed}`);
  } else if (command === 'plan') {
    const checkpoint = M.restore(read(required('checkpoint')));
    atomic(required('output'), plan(checkpoint));
    if (option('target')) json(option('target'), M.target(checkpoint.document, checkpoint.selected));
    console.log('Approved plan and target graph exported');
  } else if (command === 'export') {
    const checkpoint = M.restore(read(required('checkpoint')));
    if (!checkpoint.sealed || !checkpoint.approval) throw new Error('A sealed human approval is required');
    const output = path.resolve(required('output'));
    fs.mkdirSync(output, {recursive: true});
    atomic(path.join(output, 'plan.md'), fs.readFileSync(required('plan'), 'utf8'));
    json(path.join(output, 'baseline.json'), checkpoint.document.baseline);
    json(path.join(output, 'target.json'), M.target(checkpoint.document, checkpoint.selected));
    json(path.join(output, 'decisions.json'), checkpoint);
    build(checkpoint.document, checkpoint, path.join(output, 'report.html'));
    exportPlans(checkpoint,output);
    atomic(path.join(output, 'README.md'), '# Approved refactoring package\n\n' +
      '- [Plan](plan.md)\n- [Interactive report](report.html)\n- [Current architecture](baseline.json)\n' +
      '- [Target architecture](target.json)\n- [Decisions and discussion](decisions.json)\n- [Ordered plans and dependencies](plans/index.json)\n\n' +
      planFiles(checkpoint).map((g,i)=>`${i+1}. [${g.title}](plans/${g.file}.md)`).join('\n')+'\n\n' +
      'This is an approved design, not implemented code. Files are ready for review and a Git commit; no commit was made automatically.\n');
    console.log('Worktree package: ' + output);
  } else if (command === 'serve') {
    // This is a static file transport for host Chrome; all interaction goes through CDP.
    const session = path.resolve(required('session')), id = required('lease-id');
    const port = Number(required('port')), host = option('host', '127.0.0.1');
    const leaseFile = path.join(session, 'preview-lease.json');
    const server = http.createServer((request, response) => {
      if (request.method !== 'GET' || !['/', '/workbench.html'].includes(request.url)) {response.writeHead(404).end(); return;}
      try {
        const html = fs.readFileSync(path.join(session, 'workbench.html'));
        response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Refactor-Preview': id});
        response.end(html);
      } catch {response.writeHead(503).end('Workbench not built');}
    });
    let timer;
    const stop = () => {clearInterval(timer); server.closeAllConnections(); server.close();};
    server.on('error', e => {console.error(e.message); process.exitCode = 1; clearInterval(timer);});
    server.listen(port, host, () => {
      json(leaseFile, {id, port: server.address().port, host, pid: process.pid});
      timer = setInterval(() => {
        try {if (read(leaseFile).id !== id) stop();} catch {stop();}
      }, 500);
    });
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
  } else if (command === 'start') {
    const session = path.resolve(required('session')), port = Number(option('port', process.env.AFM_BROWSER_APP_PORT || '18080'));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid preview port');
    if (!fs.existsSync(path.join(session, 'workbench.html'))) throw new Error('Build workbench.html first');
    const leaseFile = path.join(session, 'preview-lease.json');
    if (fs.existsSync(leaseFile) && await alive(read(leaseFile))) {
      if (read(leaseFile).port !== port) throw new Error('Preview is already using another port; stop this session before restarting');
      console.log('Existing static preview is ready'); return;
    }
    const id = crypto.randomUUID(), log = fs.openSync(path.join(session, 'preview.log'), 'a', 0o600);
    const host = option('host', process.env.AFM_IN_DOCKER || fs.existsSync('/.dockerenv') ? '0.0.0.0' : '127.0.0.1');
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', '--session', session,
      '--port', String(port), '--host', host, '--lease-id', id], {detached: true, stdio: ['ignore', log, log]});
    child.unref(); fs.closeSync(log);
    for (let i = 0; i < 30; i++) {
      await delay(150);
      if (fs.existsSync(leaseFile)) {
        const lease = read(leaseFile);
        if (lease.id === id && await alive(lease)) {console.log(process.env.AFM_BROWSER_APP_URL || `http://127.0.0.1:${port}`); return;}
      }
    }
    if (fs.existsSync(leaseFile) && read(leaseFile).id === id) fs.unlinkSync(leaseFile);
    throw new Error('Static preview failed to start; inspect preview.log (the port may already be occupied)');
  } else if (command === 'stop') {
    const file = path.join(path.resolve(required('session')), 'preview-lease.json');
    if (fs.existsSync(file)) {
      const lease = read(file);
      fs.unlinkSync(file);
      for (let i = 0; i < 20 && await alive(lease); i++) await delay(150);
      if (await alive(lease)) throw new Error('Static preview has not stopped yet');
    }
  } else {
    console.log(`Refactor workshop (Node 18+; no npm dependencies)
  validate --input architecture.json
  build --input architecture.json --output workbench.html
  build --checkpoint approved.json --output report.html
  fingerprint --root PROJECT --exclude RUN_DIR [--exclude EXPORT_DIR] --output source.json
  check-source --receipt source.json [--document architecture.json | --checkpoint approved.json]
  checkpoint --input captured.json [--output checkpoint.json] [--require-approved]
  plan --checkpoint approved.json --output plan.md [--target target.json]
  export --checkpoint approved.json --plan plan.md --output WORKTREE_DIRECTORY
  start --session STAGE_DIR [--port PORT] [--host ADDRESS]
  stop --session STAGE_DIR

start/stop only serve the HTML file for managed Chrome. There is no state API.`);
    if (command && command !== '--help') process.exitCode = 1;
  }
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
