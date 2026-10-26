const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const M = require('../scripts/model.cjs');
const example = require('../examples/example.json');
const copy = value => JSON.parse(JSON.stringify(value));
const tool = path.join(__dirname, '../scripts/workbench.mjs');
const run = (...args) => execFileSync(process.execPath, [tool, ...args], {encoding: 'utf8'});

test('a selected stage requires prerequisites and every intermediate graph is valid', () => {
  let state = M.create(example);
  assert.throws(() => M.select(state, 'reuse-pricing', true), /prerequisite/);
  state = M.select(state, 'extract-pricing', true);
  state = M.select(state, 'reuse-pricing', true);
  assert.deepEqual(M.order(example, state.selected), ['extract-pricing', 'reuse-pricing']);
  assert.throws(() => M.select(state, 'extract-pricing', false), /prerequisite/);
  const target = M.target(example, state.selected);
  assert(target.nodes.some(n => n.id === 'pricing'));
  assert(target.edges.some(e => e.id === 'worker-pricing'));
  assert(!example.baseline.nodes.some(n => n.id === 'pricing'));
});

test('invalid edges, cycles, dependencies and incompatible selections are rejected', () => {
  let doc = copy(example);
  doc.baseline.edges[0].target = 'missing';
  assert.throws(() => M.validate(doc), /endpoint/);
  doc = copy(example);
  doc.baseline.nodes[0].parent = 'handler';
  assert.throws(() => M.validate(doc), /cycle/);
  doc = copy(example);
  doc.proposals[0].depends_on = ['reuse-pricing'];
  assert.throws(() => M.validate(doc), /cycle/);
  doc = copy(example);
  const alternative = copy(doc.proposals[0]);
  alternative.id = 'alternative';
  alternative.conflicts_with = ['extract-pricing'];
  doc.proposals.push(alternative);
  let state = M.create(doc);
  state = M.select(state, 'alternative', true);
  assert.throws(() => M.select(state, 'extract-pricing', true), /Conflicting/);
});

test('comments block approval until addressed; stale approval cannot be sealed', () => {
  let state = M.select(M.create(example), 'extract-pricing', true);
  state = M.comment(state, 'Keep the current rounding policy', 'extract-pricing');
  assert.throws(() => M.approve(state), /address/);
  const doc = {...copy(example), revision: 2, addressed_event_id: 2, reply: 'Rounding is explicitly preserved.'};
  state = M.publish(state, doc);
  assert.deepEqual(state.selected, ['extract-pricing']);
  state = M.approve(state);
  const approved = copy(state.approval);
  const sealed = M.seal(state, 2, approved.event_id);
  assert(M.restore(sealed).sealed);
  assert.throws(() => M.comment(sealed, 'Change it'), /comment/);
  state = M.select(state, 'extract-pricing', false);
  assert.throws(() => M.seal(state, 2, approved.event_id), /Approval changed/);
});

test('checkpoint restore detects forged or stale approval and retains unacknowledged events', () => {
  const state = M.approve(M.select(M.create(example), 'extract-pricing', true));
  assert.deepEqual(M.restore(copy(state)), state);
  let invalid = copy(state);
  invalid.selected = [];
  assert.throws(() => M.restore(invalid), /approval/);
  invalid = copy(state);
  invalid.events[0].id = 8;
  assert.throws(() => M.restore(invalid), /sequence/);
  assert.equal(M.restore(state).events.length, 2);
  assert.equal(M.restore(state).acknowledged, 0);
});

test('new proposals invalidate approval without losing comments; baseline is immutable', () => {
  const state = M.approve(M.select(M.create(example), 'extract-pricing', true));
  const revision = {...copy(example), revision: 2};
  revision.proposals[0].steps.push('Check the updated contract before proceeding.');
  const updated = M.publish(state, revision);
  assert.equal(updated.approval, null);
  assert.deepEqual(updated.selected, []);
  assert.deepEqual(updated.events, state.events);
  assert.throws(() => M.publish(updated, example), /Stale/);
  const changed = {...copy(example), revision: 3};
  changed.baseline.nodes[0].label = 'Different baseline';
  assert.throws(() => M.publish(updated, changed), /immutable/);
});

test('conflicting graph edits and predicted measured metrics cannot be approved', () => {
  let doc = copy(example);
  doc.proposals[0].changes.remove_nodes.push('store');
  assert.throws(() => M.validate(doc), /endpoint/);
  doc = copy(example);
  doc.proposals[0].changes.add_nodes[0].metrics = {complexity: 2};
  assert.throws(() => M.validate(doc), /invent/);
  doc = copy(example);
  const p = copy(doc.proposals[0]);
  p.id = 'duplicate-extraction';
  doc.proposals.push(p);
  const state = M.select(M.create(doc), 'extract-pricing', true);
  assert.throws(() => M.select(state, 'duplicate-extraction', true), /duplicate/);
});

test('HTML is self contained, escapes embedded data, and exports only approved stages', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-test-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  const doc = copy(example);
  doc.title = '</script><script>window.injected=true</script>';
  const input = path.join(temp, 'input.json'), html = path.join(temp, 'workbench.html');
  fs.writeFileSync(input, JSON.stringify(doc));
  run('build', '--input', input, '--output', html);
  const content = fs.readFileSync(html, 'utf8');
  assert(!content.includes(doc.title));
  assert(!content.includes('__REFACTOR_DATA__'));
  assert(!content.includes('/*__REFACTOR_MODEL__*/'));
  assert(!/<script[^>]+src=/.test(content));
  let checkpoint = M.select(M.create(doc), 'extract-pricing', true);
  const file = path.join(temp, 'approved.json');
  fs.writeFileSync(file, JSON.stringify(checkpoint));
  assert.throws(() => run('plan', '--checkpoint', file, '--output', path.join(temp, 'plan.md')), /sealed/);
  checkpoint = M.approve(checkpoint);
  checkpoint = M.seal(checkpoint, 1, checkpoint.approval.event_id);
  fs.writeFileSync(file, JSON.stringify(checkpoint));
  run('plan', '--checkpoint', file, '--output', path.join(temp, 'plan.md'), '--target', path.join(temp, 'target.json'));
  const plan = fs.readFileSync(path.join(temp, 'plan.md'), 'utf8');
  assert(plan.includes('### 1. Extract pricing rules (extract-pricing)'));
  assert(!plan.includes('### 2.'));
  assert(plan.includes('- reuse-pricing:'));
  assert(JSON.parse(fs.readFileSync(path.join(temp, 'target.json'))).nodes.some(n => n.id === 'pricing'));
  run('export', '--checkpoint', file, '--plan', path.join(temp, 'plan.md'), '--output', path.join(temp, 'package'));
  assert.deepEqual(fs.readdirSync(path.join(temp, 'package')).sort(),
    ['README.md', 'baseline.json', 'decisions.json', 'plan.md', 'plans', 'report.html', 'target.json']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'package', 'decisions.json'))).approval.event_id, checkpoint.approval.event_id);
});

test('source receipt detects edits and new files but excludes run artifacts', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-source-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q', temp]);
  fs.writeFileSync(path.join(temp, 'main.go'), 'package main\n');
  const artifacts = path.join(temp, 'run');
  const exported = path.join(temp, 'docs', 'refactor');
  fs.mkdirSync(artifacts);
  const receipt = path.join(artifacts, 'source.json');
  run('fingerprint', '--root', temp, '--exclude', artifacts, '--exclude', exported, '--output', receipt);
  fs.writeFileSync(path.join(artifacts, 'report.html'), 'new report');
  fs.mkdirSync(exported, {recursive: true});
  fs.writeFileSync(path.join(exported, 'plan.md'), 'approved plan');
  run('check-source', '--receipt', receipt);
  const metadata = JSON.parse(fs.readFileSync(receipt));
  const doc = copy(example);
  doc.source.revision = metadata.revision;
  doc.source.fingerprint = metadata.fingerprint;
  const architecture = path.join(artifacts, 'architecture.json');
  fs.writeFileSync(architecture, JSON.stringify(doc));
  run('check-source', '--receipt', receipt, '--document', architecture);
  let checkpoint = M.approve(M.create(doc));
  checkpoint = M.seal(checkpoint, doc.revision, checkpoint.approval.event_id);
  checkpoint.document.source.fingerprint = 'an older source snapshot';
  const approved = path.join(artifacts, 'approved.json');
  fs.writeFileSync(approved, JSON.stringify(checkpoint));
  assert.throws(() => run('check-source', '--receipt', receipt, '--checkpoint', approved), /different source snapshot/);
  fs.writeFileSync(path.join(temp, 'new.go'), 'package main\n');
  assert.throws(() => run('check-source', '--receipt', receipt), /Source changed/);
  fs.unlinkSync(path.join(temp, 'new.go'));
  fs.writeFileSync(path.join(temp, 'main.go'), 'package other\n');
  assert.throws(() => run('check-source', '--receipt', receipt), /Source changed/);
});

test('container setup installs only when missing, reuses its venv, and does not certify a failed install', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-setup-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  const bin = path.join(temp, 'bin'), stage = path.join(temp, 'scope'), log = path.join(temp, 'installs');
  fs.mkdirSync(bin);
  for (const command of ['mkdir', 'mv', 'chmod']) fs.symlinkSync('/bin/' + command, path.join(bin, command));
  const executable = (name, script) => fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nset -eu\n' + script, {mode: 0o755});
  executable('python3', 'mkdir -p "$3/bin"\nprintf "#!/bin/sh\\nexit 0\\n" > "$3/bin/python"\nchmod +x "$3/bin/python"\n');
  executable('uv', 'printf "install\\n" >> "$TEST_SETUP_LOG"\n[ "${TEST_FAIL_INSTALL:-0}" = 0 ] || exit 9\nanalyzer="${4%/python}/strictacode"\nprintf "#!/bin/sh\\nexit 0\\n" > "$analyzer"\nchmod +x "$analyzer"\n');
  const setup = path.join(__dirname, '../scripts/setup-strictacode.sh');
  const env = {...process.env, PATH: bin, AFM_IN_DOCKER: '1', TEST_SETUP_LOG: log};
  const invoke = (dir, environment = env) => execFileSync('/bin/sh', [setup, dir], {env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  invoke(stage);
  const receipt = fs.readFileSync(path.join(stage, 'strictacode-command.txt'), 'utf8').trim();
  assert.equal(receipt, path.join(stage, 'tools/strictacode/bin/strictacode'));
  invoke(stage);
  assert.equal(fs.readFileSync(log, 'utf8'), 'install\n');
  const failed = path.join(temp, 'failed');
  assert.throws(() => invoke(failed, {...env, TEST_FAIL_INSTALL: '1'}));
  assert(!fs.existsSync(path.join(failed, 'strictacode-command.txt')));
  executable('strictacode', 'exit 0\n');
  const existing = path.join(temp, 'existing');
  invoke(existing);
  assert.equal(fs.readFileSync(path.join(existing, 'strictacode-command.txt'), 'utf8').trim(), path.join(bin, 'strictacode'));
  assert(!fs.existsSync(path.join(existing, 'tools')));
});


test('named plans preserve approval, order dependencies and export cumulative snapshots', t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'refactor-plans-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  let state=M.select(M.select(M.create(example),'extract-pricing',true),'reuse-pricing',true);
  state=M.setPlans(state,[{id:'reuse',title:'Reuse',proposal_ids:['reuse-pricing']},{id:'extract',title:'Extract',proposal_ids:['extract-pricing']}]);
  assert.deepEqual(M.plans(state).map(g=>[g.id,g.depends_on]),[['extract',[]],['reuse',['extract']]]);
  const approved=M.approve(state);
  assert.equal(M.setPlans(approved,[{id:'all',title:'All',proposal_ids:state.selected}]).approval,null);
  const forged=copy(approved);forged.plan_groups[0].title='Changed';
  assert.throws(()=>M.restore(forged),/grouping/);
  const sealed=M.seal(approved,1,approved.approval.event_id);
  assert.deepEqual(M.restore(copy(sealed)),sealed);
  assert.throws(()=>M.setPlans(sealed,state.plan_groups),/sealed/);
  const checkpoint=path.join(temp,'approved.json'),plan=path.join(temp,'plan.md'),output=path.join(temp,'package');
  fs.writeFileSync(checkpoint,JSON.stringify(sealed));
  run('plan','--checkpoint',checkpoint,'--output',plan);
  run('export','--checkpoint',checkpoint,'--plan',plan,'--output',output);
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'plans/index.json')));
  assert.deepEqual(manifest.plans.map(p=>p.id),['extract','reuse']);
  assert.match(fs.readFileSync(path.join(output,'plans/02-reuse.md'),'utf8'),/\[Extract\]\(01-extract.md\)/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'plans/01-extract.after.json'))),JSON.parse(fs.readFileSync(path.join(output,'plans/02-reuse.before.json'))));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'plans/02-reuse.after.json'))),M.target(example,state.selected));
  const deselected=M.select(state,'reuse-pricing',false);
  assert.deepEqual(deselected.plan_groups[0].proposal_ids,[]);
  assert.deepEqual(M.select(deselected,'reuse-pricing',true,'reuse').plan_groups[0].proposal_ids,['reuse-pricing']);
  assert.deepEqual(M.publish(state,{...copy(example),revision:2}).plan_groups,state.plan_groups);
  const revised={...copy(example),revision:2};revised.proposals[0].risks.push('A newly identified compatibility risk.');
  assert(M.publish(state,revised).plan_groups.every(g=>!g.proposal_ids.length));
});

test('concise explanations validate without breaking older checkpoints',()=>{
  const doc=copy(example);assert(M.validate(doc));
  doc.proposals[0].explanation.before='';assert.throws(()=>M.validate(doc),/explanation.before/);
  doc.proposals[0].explanation.before='x'.repeat(361);assert.throws(()=>M.validate(doc),/360/);
  delete doc.proposals[0].explanation;assert(M.restore(M.create(doc)));
  assert.throws(()=>M.publish(M.create(example),{...doc,revision:2}),/explanation/);
});

test('discussion replies are scoped, durable and preserve plans until the proposal changes',()=>{
  let state=M.select(M.create(example),'extract-pricing',true);
  state=M.setPlans(state,[{id:'one',title:'One',proposal_ids:['extract-pricing']},{id:'two',title:'Two',proposal_ids:[]}]);
  state=M.comment(state,'Keep rounding?','extract-pricing');state=M.comment(state,'How about imports?','reuse-pricing');
  const doc={...copy(example),revision:2,addressed_event_id:state.events.length,replies:[{proposal_id:'extract-pricing',text:'Rounding stays unchanged.'}]};
  assert.throws(()=>M.publish(state,doc),/Missing reply.*reuse-pricing/);
  doc.replies.push({proposal_id:'reuse-pricing',text:'Compare import fixtures first.'});
  const next=M.publish(state,doc);assert.deepEqual(next.selected,state.selected);assert.deepEqual(next.plan_groups,state.plan_groups);
  const recovered=M.restore(JSON.parse(JSON.stringify(next)));assert.equal(M.replies(recovered).length,2);
  assert.equal(M.replies(recovered).find(r=>r.proposal_id==='reuse-pricing').text,'Compare import fixtures first.');
  const revised={...copy(doc),revision:3,replies:[]};revised.proposals[0].explanation.after='Use a different extraction boundary.';
  const changed=M.publish(recovered,revised);assert.deepEqual(changed.selected,[]);assert.equal(M.replies(M.restore(changed)).length,2);
  const invalid=copy(changed);invalid.reply_history[0].through=999;assert.throws(()=>M.restore(invalid),/reply/);
});

test('grouping rejects missing, duplicate, unsafe and circular plan assignments atomically',()=>{
  const doc=copy(example),last=copy(doc.proposals[1]);
  last.id='last';last.depends_on=['reuse-pricing'];last.changes={add_nodes:[],remove_nodes:[],update_nodes:[],add_edges:[],remove_edges:[]};doc.proposals.push(last);
  let state=M.create(doc);for(const p of doc.proposals)state=M.select(state,p.id,true);
  const before=copy(state);
  assert.throws(()=>M.setPlans(state,[{id:'a',title:'A',proposal_ids:['extract-pricing','last']},{id:'b',title:'B',proposal_ids:['reuse-pricing']}]),/кругу/);
  assert.throws(()=>M.setPlans(state,[{id:'a',title:'A',proposal_ids:[]}]),/Распределите/);
  assert.throws(()=>M.setPlans(state,[{id:'..',title:'A',proposal_ids:state.selected}]),/Некорректное/);
  assert.deepEqual(state,before);
});


test('optional edge purpose and symbols remain backward compatible and validated',()=>{
  const doc=copy(example);doc.baseline.edges[0].symbols=['SaveOrder'];doc.baseline.edges[0].description='Saves a validated order.';
  assert.deepEqual(M.restore(M.create(doc)).document.baseline.edges[0].symbols,['SaveOrder']);
  doc.baseline.edges[0].symbols=[{name:'not a string'}];assert.throws(()=>M.validate(doc),/symbols/);
  delete doc.baseline.edges[0].symbols;doc.baseline.edges[0].description=42;assert.throws(()=>M.validate(doc),/description/);
});

test('a changed goal or constraint needs a new selection review',()=>{
  const state=M.select(M.create(example),'extract-pricing',true);
  for(const key of ['goal','constraints']){
    const doc={...copy(example),revision:2};
    if(key==='goal')doc.goal='A different intended outcome.';
    else doc.constraints.push('Keep all exported function names.');
    assert.deepEqual(M.publish(state,doc).selected,[]);
  }
});
