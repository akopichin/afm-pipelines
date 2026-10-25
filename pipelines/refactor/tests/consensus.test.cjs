const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {digest, validate} = require('../scripts/consensus.cjs');
const example = require('../examples/example.json');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-consensus-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
  const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  const doc = structuredClone(example);
  for (const item of [...doc.findings, ...doc.proposals]) item.priority = {benefit:4, ease:3, reason:'A bounded, testable reduction in coupling.'};
  write('source.json', doc.source);write('architecture.json', doc);
  const consensus = {schema_version:2, source_fingerprint:doc.source.fingerprint, ranking_policy:'benefit_then_ease',
    summary:'Both reports agree on the concrete coupling problem.', dispositions:[], joint_findings:[], open_questions:[]};
  for (const [reviewer, model] of [['architect_a','claude-opus-5-5'],['architect_b','gpt-6.1-sol']]) {
    write(reviewer+'-findings.json', {schema_version:2, reviewer, model, source:doc.source,
      architecture_notes:'Source inspected: API and imports share pricing rules.', limitations:[], findings:doc.findings});
    for (const f of doc.findings)consensus.dispositions.push({reviewer, finding_id:f.id, status:'accepted', merged_finding_ids:[f.id], reason:'Confirmed from source.'});
  }
  write('consensus.json', consensus);
  function approve() {
    for (const [reviewer, model] of [['architect_a','claude-opus-5-5'],['architect_b','gpt-6.1-sol']])
      write(reviewer+'-approval.json',{reviewer,model,packet_sha256:digest(dir),verdict:'pass',ranking_accepted:true,
        finding_ids:read('architecture.json').findings.map(f=>f.id),proposal_ids:read('architecture.json').proposals.map(p=>p.id),
        blocking_issues:[],rationale:'Reviewed source, merged coverage and priority tradeoffs.'});
  }
  approve();
  return {dir,read,write,approve};
}

test('workshop gate requires two complete approvals of exactly the same packet', t => {
  const f=fixture(t);
  assert.equal(validate(f.dir).proposals,example.proposals.length);
  fs.unlinkSync(path.join(f.dir,'architect_b-approval.json'));
  assert.throws(()=>validate(f.dir),/ENOENT/);
  f.approve();
  const approval=f.read('architect_b-approval.json');approval.verdict='needs_changes';f.write('architect_b-approval.json',approval);
  assert.throws(()=>validate(f.dir),/not approved/);
  f.approve();approval.verdict='pass';approval.ranking_accepted=false;f.write('architect_b-approval.json',approval);
  assert.throws(()=>validate(f.dir),/not approved/);
});

test('any post-review change invalidates both approvals, even formatting', t => {
  const f=fixture(t);
  fs.appendFileSync(path.join(f.dir,'architecture.json'),'\n');
  assert.throws(()=>validate(f.dir),/Stale approval: architect_a/);
  const a=f.read('architect_a-approval.json');a.packet_sha256=digest(f.dir);f.write('architect_a-approval.json',a);
  assert.throws(()=>validate(f.dir),/Stale approval: architect_b/);
  f.approve();assert(validate(f.dir));
});

test('dispositions cannot silently drop a report or invent a final finding', t => {
  const f=fixture(t),c=f.read('consensus.json');
  c.dispositions.pop();f.write('consensus.json',c);f.approve();
  assert.throws(()=>validate(f.dir),/silently dropped/);
});

test('deferred claims cannot be presented as an agreed finding', t => {
  const f=fixture(t),c=f.read('consensus.json');
  c.dispositions[0].status='deferred';f.write('consensus.json',c);f.approve();
  assert.throws(()=>validate(f.dir),/Unresolved finding/);
});

test('source, architect identities and complete-list review are mandatory', t => {
  const f=fixture(t),report=f.read('architect_b-findings.json');
  report.model='gpt-6-sol';f.write('architect_b-findings.json',report);f.approve();
  assert.throws(()=>validate(f.dir),/Wrong architect/);
  report.model='gpt-6.1-sol';report.source.fingerprint='other';f.write('architect_b-findings.json',report);f.approve();
  assert.throws(()=>validate(f.dir),/source mismatch/);
  report.source=f.read('source.json');f.write('architect_b-findings.json',report);f.approve();
  const approval=f.read('architect_b-approval.json');approval.proposal_ids.pop();f.write('architect_b-approval.json',approval);
  assert.throws(()=>validate(f.dir),/Incomplete or duplicate architect_b proposal/);
});

test('rank estimates and ordering must match the stated policy', t => {
  const f=fixture(t),doc=f.read('architecture.json');
  delete doc.proposals[0].priority;f.write('architecture.json',doc);f.approve();
  assert.throws(()=>validate(f.dir),/Missing benefit/);
  doc.proposals[0].priority={benefit:2,ease:5,reason:'Local preparation only.'};f.write('architecture.json',doc);f.approve();
  assert.throws(()=>validate(f.dir),/not ranked/);
  doc.proposals[0].priority.benefit=4;doc.proposals[0].priority.ease=1;f.write('architecture.json',doc);f.approve();
  assert.throws(()=>validate(f.dir),/not ranked/);
  doc.proposals[0].priority.ease=6;f.write('architecture.json',doc);f.approve();
  assert.throws(()=>validate(f.dir),/Invalid benefit/);
});

test('both architects can agree that no refactoring is justified', t => {
  const f=fixture(t),doc=f.read('architecture.json');doc.proposals=[];doc.findings=[];f.write('architecture.json',doc);
  const c=f.read('consensus.json');
  for(const d of c.dispositions){d.status='rejected';d.merged_finding_ids=[];d.reason='Counterevidence: the coupling is intentional and bounded.';}
  f.write('consensus.json',c);f.approve();assert.equal(validate(f.dir).findings,0);
});
