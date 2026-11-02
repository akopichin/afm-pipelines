import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import M from '../planning/model.cjs';
import {atomic, json, freeze, sourceIdentity, checkSource, bind, build, approvalLabel, seal, groomingOptions, chooseGrooming, verifyPlan, start, stop} from '../planning/workbench.mjs';

const planning = fileURLToPath(new URL('../planning/', import.meta.url));
const example = () => JSON.parse(fs.readFileSync(path.join(planning, 'example.json'), 'utf8'));
const bound = () => ({...example(), plan: {sha256: 'a'.repeat(64), project_sha256: 'b'.repeat(64)}});
function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dev planning ')));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return directory;
}
function approved(t) {
  const root = fixture(t), session = path.join(root, 'run/plan');
  fs.mkdirSync(session, {recursive: true});
  execFileSync('git', ['init', '-q', root]);
  fs.writeFileSync(path.join(root, 'app.go'), 'package app\n');
  const plan = path.join(session, 'dev-plan.md'), project = path.join(session, 'project.json');
  fs.writeFileSync(plan, '# Plan\n\nT1: change lifecycle\n'); json(project, {schema_version: 2});
  const doc = example(); doc.source = sourceIdentity(root, [path.dirname(session)]);
  const state = M.create(bind(doc, plan, project));
  json(path.join(session, 'grooming.json'), state.document);
  const event = M.ready(state); M.acknowledge(state, event.id); M.lock(state, doc.revision, event.id);
  const checkpoint = path.join(session, 'grooming-checkpoint.json'); json(checkpoint, state);
  const question = path.join(session, 'autonomous_execution.q1.question.json'), answer = path.join(session, 'autonomous_execution.q1.answer.json');
  json(question, {id: 'q1', question: 'Approve the complete plan?', options: [approvalLabel(state), 'Request changes']});
  json(answer, {id: 'q1', answer: approvalLabel(state), from_options: true, auto_answered: false});
  const output = path.join(session, 'grooming-approval.json');
  return {root, session, state, plan, project, checkpoint, question, answer, output,
    seal: () => seal(checkpoint, plan, project, question, answer, output)};
}
function groomingChoice(session, enabled, changes = {}) {
  const question = path.join(session, 'autonomous_execution.mode.question.json');
  const answer = path.join(session, 'autonomous_execution.mode.answer.json');
  json(question, {id: 'mode', question: 'Использовать визуальный груминг при планировании?', options: groomingOptions});
  json(answer, {id: 'mode', answer: groomingOptions[enabled ? 0 : 1], from_options: true, auto_answered: false, ...changes});
  return {question, answer, choose: () => chooseGrooming(session, question, answer)};
}

test('declining grooming preserves ordinary planning without any visual artifacts', t => {
  const session = fixture(t), choice = groomingChoice(session, false);
  const receipt = choice.choose(); assert.equal(receipt.enabled, false);
  assert.deepEqual(verifyPlan(session), receipt);
  assert.deepEqual(choice.choose(), receipt, 'Resume reuses the saved choice');
  assert(!fs.existsSync(path.join(session, 'grooming-checkpoint.json')));
  assert(!fs.existsSync(path.join(session, 'grooming-approval.json')));
  const tool = path.join(planning, 'workbench.mjs');
  assert.match(execFileSync(process.execPath, [tool, 'verify-plan', '--session', session], {encoding: 'utf8'}), /Standard planning selected/);
});

test('accepting grooming retains the complete visual approval gate', t => {
  const f = approved(t); groomingChoice(f.session, true).choose();
  assert.throws(() => verifyPlan(f.session), /ENOENT/, 'Missing visual approval cannot pass');
  f.seal(); assert.equal(verifyPlan(f.session).revision, 1);
  fs.appendFileSync(f.plan, 'Changed after approval\n');
  assert.throws(() => verifyPlan(f.session), /Plan\/project changed/);
});

test('a missing choice cannot silently opt out of visual planning', t => {
  assert.throws(() => verifyPlan(fixture(t)), /ENOENT/);
});

test('grooming choice rejects automatic, custom, mismatched and foreign answers', t => {
  const session = fixture(t);
  for (const changes of [{auto_answered: true}, {answer: 'Нет', from_options: false}, {id: 'other'}]) {
    assert.throws(groomingChoice(session, false, changes).choose, /explicit human grooming choice/);
    assert(!fs.existsSync(path.join(session, 'grooming-choice.json')));
  }
  const foreign = groomingChoice(fixture(t), false);
  assert.throws(() => chooseGrooming(session, foreign.question, foreign.answer), /belong to this plan stage/);
});

test('changed choice or dialog evidence cannot bypass the visual gate', t => {
  const session = fixture(t), choice = groomingChoice(session, true); choice.choose();
  const file = path.join(session, 'grooming-choice.json');
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  json(file, {...receipt, enabled: false});
  assert.throws(() => verifyPlan(session), /choice evidence changed/);
  json(file, receipt);
  groomingChoice(session, false);
  assert.throws(() => verifyPlan(session), /choice evidence changed/);
  assert.throws(choice.choose, /choice already recorded/);
});

test('every step and technical entry needs its own what and why', () => {
  const doc = example(); M.validate(doc);
  for (let index = -1; index < doc.steps.length; index++) for (const field of ['what', 'why']) {
    const invalid = example(), step = index < 0 ? invalid.baseline : invalid.steps[index];
    delete step[field]; assert.throws(() => M.validate(invalid), /what and why/);
  }
  for (const category of ['functions', 'contracts', 'checks']) for (const field of ['what', 'why']) {
    const invalid = example(); delete invalid.steps[1][category][0][field];
    assert.throws(() => M.validate(invalid), /what and why/);
  }
  const empty = example(); empty.steps[0].contracts = [];
  assert.throws(() => M.validate(empty), /explain why contracts is empty/);
  empty.steps[0].detail_notes = {contracts: 'No contract changes in this narrowly scoped step.'}; M.validate(empty);
});

test('malformed graph, missing expected observation and unsafe identifiers are rejected', () => {
  const doc = example(); doc.steps[0].graph.edges[0].to = 'unknown';
  assert.throws(() => M.validate(doc), /dangling edge/);
  const check = example(); delete check.steps[1].checks[0].expected;
  assert.throws(() => M.validate(check), /expected observation/);
  const reserved = example(); reserved.steps[0].id = 'constructor';
  assert.throws(() => M.validate(reserved), /invalid or duplicate id/);
});

test('comments retain original step and symbol while revisions preserve reply history', () => {
  const state = M.create(bound());
  const event = M.comment(state, 'change-1', 'Who owns context?', {kind: 'function', id: 'start-stage'});
  assert.equal(event.anchor.label, '(*Orchestrator).StartStage');
  assert.deepEqual(M.status(state).pending_comment_ids, [1]);
  assert.throws(() => M.ready(state), /address all comments/);
  const doc = M.copy(state.document); doc.revision++; doc.replies = [{event_id: event.id, text: 'The run owns it.'}];
  M.publish(state, doc); assert.deepEqual(M.status(state).pending_comment_ids, []);
  const next = M.copy(doc); next.revision++; next.replies = [];
  M.publish(state, next);
  assert.equal(M.restore(M.copy(state)).reply_history[0].text, 'The run owns it.');
  assert.equal(state.events[0].step_id, 'change-1');
  const removal = M.copy(next); removal.revision++; removal.steps = removal.steps.slice(1);
  assert.throws(() => M.publish(state, removal), /Keep commented step/);
  const wrongReply = M.copy(next); wrongReply.revision++; wrongReply.replies = [{event_id: 99, text: 'wrong thread'}];
  assert.throws(() => M.publish(state, wrongReply), /original comment/);
});

test('readiness is not approval and cannot survive a draft, racing comment or new revision', () => {
  const state = M.create(bound());
  M.draft(state, 'change-2', 'Unsent contract question');
  assert.throws(() => M.ready(state), /unfinished drafts/);
  M.draft(state, 'change-2', '');
  const event = M.ready(state); assert.equal(M.status(state).ready, true);
  M.comment(state, null, 'Wait, another concern');
  assert.equal(M.status(state).ready, false);
  assert.throws(() => M.lock(state, 1, event.id), /Readiness changed/);
  const doc = M.copy(state.document); doc.revision = 2; doc.replies = [{event_id: 2, text: 'Addressed globally'}]; M.publish(state, doc);
  const latest = M.ready(state); M.lock(state, 2, latest.id);
  assert.throws(() => M.comment(state, null, 'late'), /awaiting.*dialog/);
  assert.throws(() => M.draft(state, null, 'late draft'), /awaiting.*dialog/);
  const correction = M.copy(doc); correction.revision = 3; M.publish(state, correction);
  assert.equal(state.locked, false); assert.equal(M.status(state).ready, false);
});

test('checkpoint restores drafts and rejects lost events, replies or cursor rewind', () => {
  const state = M.create(bound()); M.draft(state, 'change-2', 'Preserve this draft', {kind: 'contract', id: 'cancel-api'});
  M.comment(state, 'change-1', 'Question');
  const restored = M.restore(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.drafts['change-2'].anchor.id, 'cancel-api');
  assert.deepEqual(M.readEvents(restored, 0).map(item => item.id), [1]);
  M.acknowledge(restored, 1); assert.throws(() => M.acknowledge(restored, 0), /acknowledgement/);
  const corrupted = M.copy(state); corrupted.events[0].id = 2;
  assert.throws(() => M.restore(corrupted), /event sequence/);
  const reply = M.copy(state); reply.reply_history.push({event_id: 20, revision: 1, text: 'Unattached'});
  assert.throws(() => M.restore(reply), /belong to a comment/);
});

test('source and baseline remain immutable; object key order is immaterial', () => {
  const state = M.create(bound()), doc = M.copy(state.document); doc.revision++;
  doc.source = Object.fromEntries(Object.entries(doc.source).reverse()); M.publish(state, doc);
  const changed = M.copy(doc); changed.revision++; changed.baseline.why = 'A different baseline';
  assert.throws(() => M.publish(state, changed), /baseline is frozen/);
  const drift = M.copy(doc); drift.revision++; drift.source.fingerprint = 'f'.repeat(64);
  assert.throws(() => M.publish(state, drift), /Source\/session changed/);
});

test('toolkit freezes once and detects later snapshot edits', t => {
  const root = fixture(t), source = path.join(root, 'package'); fs.cpSync(planning, source, {recursive: true});
  const target = freeze(path.join(root, 'bootstrap'), source);
  const original = fs.readFileSync(path.join(target, 'view.js'), 'utf8');
  fs.appendFileSync(path.join(source, 'view.js'), '\n// New installed version\n');
  assert.equal(freeze(path.join(root, 'bootstrap'), source), target);
  assert.equal(fs.readFileSync(path.join(target, 'view.js'), 'utf8'), original);
  fs.appendFileSync(path.join(target, 'view.js'), '\n');
  assert.throws(() => freeze(path.join(root, 'bootstrap'), source), /Frozen planning toolkit changed/);
});

test('approval binds human answer, source, checkpoint and exact plan/project bytes', t => {
  const f = approved(t); f.seal(); assert.equal(verifyPlan(f.session).revision, 1);
  fs.appendFileSync(f.plan, 'Material change\n'); assert.throws(() => verifyPlan(f.session), /Plan\/project changed/);
  fs.writeFileSync(f.plan, '# Plan\n\nT1: change lifecycle\n');
  json(f.project, {schema_version: 2, changed: true}); assert.throws(() => verifyPlan(f.session), /Plan\/project changed/);
  json(f.project, {schema_version: 2});
  fs.writeFileSync(path.join(f.root, 'app.go'), 'package changed\n'); assert.throws(() => verifyPlan(f.session), /Source changed/);
});

test('automatic, custom and stale dialog answers cannot seal visual planning', t => {
  const f = approved(t);
  for (const changes of [{auto_answered: true}, {answer: 'Sure', from_options: false}, {answer: 'Утвердить план r0 (old)'}]) {
    json(f.answer, {id: 'q1', answer: approvalLabel(f.state), from_options: true, ...changes});
    assert.throws(f.seal, /explicit human approval/);
  }
  json(f.answer, {id: 'q1', answer: approvalLabel(f.state), from_options: true}); f.seal();
  json(f.answer, {id: 'q1', answer: 'Request changes', from_options: true}); assert.throws(() => verifyPlan(f.session), /evidence changed/);
});

test('a stale visual artifact cannot be consumed under another displayed document', t => {
  const f = approved(t); f.seal();
  const stale = M.copy(f.state.document); stale.steps[1].why = 'Changed after approval';
  json(path.join(f.session, 'grooming.json'), stale);
  assert.throws(() => verifyPlan(f.session), /grooming.json differs/);
  assert.throws(f.seal, /grooming.json differs/);
});

test('portable HTML escapes data and contains no synthetic response path', t => {
  const root = fixture(t), doc = example(); doc.goal = '</script><script>window.injected=true</script>';
  const output = path.join(root, 'report.html'); build(M.create(doc), output, true);
  const html = fs.readFileSync(output, 'utf8');
  assert(!html.includes('</script><script>window.injected'));
  assert(html.includes('\\u003c/script>'));
  assert(!html.includes('demoReply'));
  assert(!html.includes('__PLANNING_DATA__'));
});

test('owned preview serves only HTML and its session lease stops the process', async t => {
  const root = fixture(t); atomic(path.join(root, 'workbench.html'), '<!doctype html><title>Planning fixture</title>');
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  t.after(() => stop(root));
  await start(root, port, '127.0.0.1');
  const response = await fetch(`http://127.0.0.1:${port}/`); assert.equal(response.status, 200); await response.text();
  assert(response.headers.get('x-dev-planning'));
  const write = await fetch(`http://127.0.0.1:${port}/`, {method: 'POST', body: 'not accepted'}); assert.equal(write.status, 404); await write.text();
  const secret = await fetch(`http://127.0.0.1:${port}/private.json`); assert.equal(secret.status, 404); await secret.text();
  await start(root, port, '127.0.0.1'); await stop(root);
  assert(!fs.existsSync(path.join(root, 'grooming-preview.json')));
});
