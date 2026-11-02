#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import M from './model.cjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const runtimeFiles = ['workbench.mjs', 'model.cjs', 'template.html', 'view.js', 'style.css', 'example.json', 'README.md'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = file => digest(fs.readFileSync(file));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export function atomic(file, data) {
  fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temporary, data, {mode: 0o600}); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, {force: true}); }
}
export const json = (file, value) => atomic(file, JSON.stringify(value, null, 2) + '\n');

export function freeze(bootstrap, source = directory) {
  requireValue(path.isAbsolute(bootstrap), 'Bootstrap path must be absolute');
  fs.mkdirSync(bootstrap, {recursive: true});
  const target = path.join(bootstrap, 'planning');
  if (fs.existsSync(target)) {
    const receipt = read(path.join(target, '.snapshot.json'));
    requireValue(receipt.schema_version === 1 && receipt.name === 'dev-planning' && runtimeFiles.every(file => receipt.files?.[file]), 'Incomplete planning toolkit snapshot');
    for (const file of runtimeFiles) requireValue(fs.lstatSync(path.join(target, file)).isFile() && fileHash(path.join(target, file)) === receipt.files[file], `Frozen planning toolkit changed: ${file}`);
    return target;
  }
  const temporary = fs.mkdtempSync(path.join(bootstrap, '.planning-'));
  try {
    const files = {};
    for (const file of runtimeFiles) {
      requireValue(fs.lstatSync(path.join(source, file)).isFile(), 'Planning toolkit contains a non-regular file');
      fs.copyFileSync(path.join(source, file), path.join(temporary, file));
      files[file] = fileHash(path.join(temporary, file));
    }
    json(path.join(temporary, '.snapshot.json'), {schema_version: 1, name: 'dev-planning', files});
    fs.renameSync(temporary, target);
    return target;
  } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
}

export function sourceIdentity(root, exclusions = []) {
  root = fs.realpathSync(root);
  requireValue(path.isAbsolute(root), 'Source root must be absolute');
  const excluded = exclusions.map(item => path.resolve(item));
  const names = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).split('\0').filter(Boolean);
  let revision = 'unborn';
  try { revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch {}
  const hash = crypto.createHash('sha256');
  hash.update(revision + '\0');
  for (const name of [...new Set(names)].sort()) {
    const file = path.resolve(root, name);
    requireValue(file.startsWith(root + path.sep), 'Source path escapes project');
    if (excluded.some(item => file === item || file.startsWith(item + path.sep))) continue;
    hash.update(name + '\0');
    try {
      const stat = fs.lstatSync(file);
      hash.update(String(stat.mode & 0o777) + '\0');
      if (stat.isSymbolicLink()) hash.update('link:' + fs.readlinkSync(file));
      else if (stat.isFile()) hash.update(fs.readFileSync(file));
      else throw new Error(`Unsupported source entry: ${name}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; hash.update('deleted'); }
    hash.update('\0');
  }
  return {root, revision, fingerprint: hash.digest('hex'), exclusions: excluded};
}
export function checkSource(source) {
  requireValue(M.same(sourceIdentity(source.root, source.exclusions), source), 'Source changed since grooming; start a new source session and preserve the old discussion');
}
export function bind(doc, plan, project) {
  const result = M.copy(doc);
  JSON.parse(fs.readFileSync(project, 'utf8'));
  result.plan = {sha256: fileHash(plan), project_sha256: fileHash(project)};
  return M.validate(result);
}
export function build(state, output, readOnly = false) {
  M.restore(state);
  const safeData = JSON.stringify({state, read_only: readOnly}).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const script = file => fs.readFileSync(path.join(directory, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  const html = fs.readFileSync(path.join(directory, 'template.html'), 'utf8')
    .replace('/*__STYLES__*/', () => fs.readFileSync(path.join(directory, 'style.css'), 'utf8'))
    .replace('__PLANNING_DATA__', () => safeData)
    .replace('/*__MODEL__*/', () => script('model.cjs'))
    .replace('/*__VIEW__*/', () => script('view.js'));
  atomic(output, html);
}
export function approvalLabel(state) {
  requireValue(state.document.plan, 'Bind the plan before requesting approval');
  return `Утвердить план r${state.document.revision} (${state.document.plan.sha256.slice(0, 12)})`;
}
function matchingPlan(state, plan, project) {
  requireValue(state.document.plan?.sha256 === fileHash(plan) && state.document.plan?.project_sha256 === fileHash(project), 'Plan/project changed after the displayed revision');
}
export function seal(checkpointFile, plan, project, questionFile, answerFile, output) {
  const state = M.restore(read(checkpointFile));
  const status = M.status(state);
  requireValue(state.locked && status.ready && state.acknowledged_event_id === status.last_event_id, 'Save and acknowledge the exact ready revision before approval');
  matchingPlan(state, plan, project);
  requireValue(M.same(read(path.join(path.dirname(checkpointFile), 'grooming.json')), state.document), 'grooming.json differs from the displayed document');
  checkSource(state.document.source);
  const stage = fs.realpathSync(path.dirname(checkpointFile));
  const question = read(questionFile), answer = read(answerFile);
  for (const file of [questionFile, answerFile]) requireValue(path.dirname(fs.realpathSync(file)) === stage, 'Approval question/answer must belong to this plan stage');
  const label = approvalLabel(state);
  requireValue(question.id === answer.id && question.options?.includes(label) && answer.answer === label && answer.from_options === true && answer.auto_answered !== true, 'Missing explicit human approval of this revision');
  const receipt = {schema_version: 1, session_id: state.document.session_id, revision: state.document.revision,
    last_event_id: status.last_event_id, ready_event_id: status.ready_event_id, checkpoint_sha256: fileHash(checkpointFile),
    plan_sha256: fileHash(plan), project_sha256: fileHash(project),
    question_file: path.resolve(questionFile), question_sha256: fileHash(questionFile),
    answer_file: path.resolve(answerFile), answer_sha256: fileHash(answerFile)};
  json(output, receipt);
  return receipt;
}
export function verifyPlan(session) {
  const checkpointFile = path.join(session, 'grooming-checkpoint.json');
  const state = M.restore(read(checkpointFile));
  const receipt = read(path.join(session, 'grooming-approval.json'));
  const status = M.status(state);
  requireValue(M.same(read(path.join(session, 'grooming.json')), state.document), 'grooming.json differs from the approved document');
  requireValue(receipt.schema_version === 1 && receipt.session_id === state.document.session_id && receipt.revision === state.document.revision && state.locked && status.ready && receipt.last_event_id === status.last_event_id && receipt.ready_event_id === status.ready_event_id, 'Stale grooming approval');
  requireValue(receipt.checkpoint_sha256 === fileHash(checkpointFile), 'Approved checkpoint changed');
  matchingPlan(state, path.join(session, 'dev-plan.md'), path.join(session, 'project.json'));
  requireValue(receipt.plan_sha256 === state.document.plan.sha256 && receipt.project_sha256 === state.document.plan.project_sha256, 'Approval belongs to a different plan');
  requireValue(receipt.question_sha256 === fileHash(receipt.question_file) && receipt.answer_sha256 === fileHash(receipt.answer_file), 'Approval evidence changed');
  const question = read(receipt.question_file), answer = read(receipt.answer_file);
  requireValue(question.id === answer.id && question.options?.includes(approvalLabel(state)) && answer.answer === approvalLabel(state) && answer.from_options === true && answer.auto_answered !== true, 'Approval was not an explicit human selection');
  checkSource(state.document.source);
  return receipt;
}

async function alive(lease) {
  try {
    const response = await fetch(`http://127.0.0.1:${lease.port}/`, {signal: AbortSignal.timeout(1000)});
    await response.arrayBuffer();
    return response.headers.get('x-dev-planning') === lease.id;
  } catch { return false; }
}
async function serve(session, port, host, id) {
  const leaseFile = path.join(session, 'grooming-preview.json');
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' || !['/', '/workbench.html'].includes(request.url)) { response.writeHead(404).end(); return; }
    try {
      const html = fs.readFileSync(path.join(session, 'workbench.html'));
      response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Dev-Planning': id});
      response.end(html);
    } catch { response.writeHead(503).end('Planning page not built'); }
  });
  let timer;
  const stop = () => { clearInterval(timer); server.closeAllConnections(); server.close(); };
  server.on('error', error => { console.error(error.message); process.exitCode = 1; clearInterval(timer); });
  server.listen(port, host, () => {
    json(leaseFile, {id, pid: process.pid, port: server.address().port, host});
    timer = setInterval(() => { try { if (read(leaseFile).id !== id) stop(); } catch { stop(); } }, 300);
  });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
export async function start(session, port, host) {
  requireValue(Number.isInteger(port) && port > 0 && port <= 65535, 'Invalid preview port');
  requireValue(fs.existsSync(path.join(session, 'workbench.html')), 'Build workbench.html first');
  const file = path.join(session, 'grooming-preview.json');
  if (fs.existsSync(file) && await alive(read(file))) {
    requireValue(read(file).port === port, 'Preview already uses another port');
    return process.env.AFM_BROWSER_APP_URL || `http://127.0.0.1:${port}`;
  }
  const id = crypto.randomUUID();
  const log = fs.openSync(path.join(session, 'grooming-preview.log'), 'a', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', '--session', session, '--port', String(port), '--host', host, '--lease-id', id], {detached: true, stdio: ['ignore', log, log], env: {}});
  child.unref(); fs.closeSync(log);
  for (let attempt = 0; attempt < 40; attempt++) {
    await delay(100);
    if (fs.existsSync(file)) {
      const lease = read(file);
      if (lease.id === id && await alive(lease)) return process.env.AFM_BROWSER_APP_URL || `http://127.0.0.1:${port}`;
    }
  }
  child.kill('SIGTERM');
  if (fs.existsSync(file) && read(file).id === id) fs.unlinkSync(file);
  throw new Error('Planning preview failed; inspect grooming-preview.log');
}
export async function stop(session) {
  const file = path.join(session, 'grooming-preview.json');
  if (!fs.existsSync(file)) return;
  const lease = read(file);
  // Removing our lease asks only this session's owned static transport to exit.
  if (read(file).id === lease.id) fs.unlinkSync(file);
  for (let attempt = 0; attempt < 30 && await alive(lease); attempt++) await delay(100);
  requireValue(!await alive(lease), 'Planning preview did not stop');
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf('--' + name); return index < 0 ? fallback : args[index + 1]; };
  const required = name => { const value = option(name); requireValue(value, 'Missing --' + name); return value; };
  if (command === 'freeze') console.log(freeze(path.resolve(required('bootstrap'))));
  else if (command === 'source') {
    const excluded = args.flatMap((arg, index) => arg === '--exclude' ? [args[index + 1]] : []);
    json(required('output'), sourceIdentity(required('root'), excluded));
  } else if (command === 'validate') { M.validate(read(required('input'))); console.log('Planning document valid'); }
  else if (command === 'bind') json(required('output'), bind(read(required('input')), required('plan'), required('project')));
  else if (command === 'build') {
    const state = option('checkpoint') ? M.restore(read(option('checkpoint'))) : M.create(read(required('input')));
    build(state, required('output'), args.includes('--read-only'));
  } else if (command === 'checkpoint') json(required('output'), M.restore(read(required('input'))));
  else if (command === 'check-source') checkSource(M.validate(read(required('input'))).source);
  else if (command === 'approval-label') console.log(approvalLabel(M.restore(read(required('checkpoint')))));
  else if (command === 'seal') seal(required('checkpoint'), required('plan'), required('project'), required('question'), required('answer'), required('output'));
  else if (command === 'verify-plan') { verifyPlan(path.resolve(required('session'))); console.log('Visual plan, discussion and human approval match'); }
  else if (command === 'start') console.log(await start(path.resolve(required('session')), Number(option('port', process.env.AFM_BROWSER_APP_PORT || '18080')), option('host', process.env.AFM_IN_DOCKER || fs.existsSync('/.dockerenv') ? '0.0.0.0' : '127.0.0.1')));
  else if (command === 'serve') await serve(path.resolve(required('session')), Number(required('port')), required('host'), required('lease-id'));
  else if (command === 'stop') await stop(path.resolve(required('session')));
  else if (!command || command === '--help') console.log('Planning toolkit: freeze, source, validate, bind, build, checkpoint, check-source, approval-label, seal, verify-plan, start, stop. See README.md beside this tool.');
  else throw new Error('Unknown command: ' + command);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
